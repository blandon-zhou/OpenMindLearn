import JSZip from 'jszip'
import { Builder, Parser } from 'xml2js'
import { Node, Region, SourceReference, NodeImage, NodeAttachment } from '../types/index.js'

interface Edge {
  id: string
  source: string
  target: string
  style?: {
    stroke?: string
    strokeWidth?: number
  }
}

interface GraphData {
  nodes: Node[]
  edges: Edge[]
  regions?: Region[]
  name: string
  formatVersion?: string
}

interface NodeDescriptorVersion {
  timestamp: string
  file: string
}

interface NodeDescriptorImage {
  id: string
  mimeType: string
  name?: string
  file: string
}

interface NodeDescriptorAttachment {
  id: string
  mimeType: string
  name: string
  size: number
  file: string
}

interface NodeDescriptor {
  id: string
  contentFile: string
  thinkingFile?: string
  question?: string
  position: { x: number; y: number }
  size?: { width: number; height: number }
  parentIds: string[]
  createdAt: string
  updatedAt?: string
  tags?: string[]
  note?: string
  versions?: NodeDescriptorVersion[]
  expansionColor?: string
  sourceRef?: SourceReference
  images?: NodeDescriptorImage[]
  attachments?: NodeDescriptorAttachment[]
}

const NODE_DEFAULT_WIDTH = 380
const NODE_DEFAULT_HEIGHT = 300
const NODE_MIN_WIDTH = 280
const NODE_MIN_HEIGHT = 200
const OML_FORMAT_VERSION = '2.1'
const OML_PARSE_PROFILE = 'nodes-directory-v2'
const SUPPORTED_OML_MAJOR_VERSION = 2
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

function parseString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function sanitizeFileName(input: string, fallback: string): string {
  const value = (input || '').trim()
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
  return sanitized || fallback
}

function normalizeExtension(raw: string, fallback = 'bin'): string {
  const extension = (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return extension || fallback
}

function getExtensionFromFileName(name: string): string | undefined {
  const rawName = parseString(name)
  const dotIndex = rawName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= rawName.length - 1) return undefined
  return normalizeExtension(rawName.slice(dotIndex + 1), '')
}

function getExtensionFromMimeType(mimeType: string, fallback: string): string {
  const normalizedMimeType = parseString(mimeType).toLowerCase()
  const subtype = normalizedMimeType.split('/')[1] || ''
  const primarySubtype = subtype.split('+')[0]
  return normalizeExtension(primarySubtype, fallback)
}

function estimateBase64Size(base64: string): number {
  const normalized = parseString(base64).replace(/\s+/g, '')
  if (!normalized) return 0
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

function resolveAttachmentSize(sizeValue: unknown, base64: string): number {
  const declaredSize = parseNumber(sizeValue, -1)
  const estimatedSize = estimateBase64Size(base64)
  if (declaredSize <= 0) return estimatedSize
  return Math.max(declaredSize, estimatedSize)
}

function assertAttachmentSizeWithinLimit(size: number, nodeId: string, name: string) {
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment too large at node ${nodeId}: ${name} (${size} bytes)`)
  }
}

function getVersionFileName(timestamp: string, index: number): string {
  const safeTime = sanitizeFileName(timestamp, `v${index + 1}`)
  return `${String(index + 1).padStart(2, '0')}-${safeTime}.md`
}

async function readRequiredFile(zip: JSZip, path: string, errorMessage: string): Promise<string> {
  const file = zip.file(path)
  if (!file) {
    throw new Error(errorMessage)
  }
  return file.async('string')
}

function listNodeDescriptorPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => /^nodes\/[^/]+\/node\.json$/.test(path))
    .sort((a, b) => a.localeCompare(b))
}

function normalizeSourceRef(value: unknown): SourceReference | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const upstreamFingerprintBase64 = parseString(source.upstreamFingerprintBase64)
  if (!upstreamFingerprintBase64) return undefined

  return {
    upstreamFingerprintBase64,
    rangeStart: parseNumber(source.rangeStart, 0),
    rangeEnd: parseNumber(source.rangeEnd, 0)
  }
}

function parseNodeSize(value: unknown, fallback: number, minimum: number): number {
  const parsed = parseNumber(value, fallback)
  return Math.max(minimum, parsed)
}

function parseMajorVersion(formatVersion: string): number {
  const [majorRaw] = formatVersion.split('.')
  const major = Number(majorRaw)
  return Number.isFinite(major) ? major : 1
}

function assertSupportedFormatVersion(formatVersion: string) {
  const major = parseMajorVersion(formatVersion)
  if (major > SUPPORTED_OML_MAJOR_VERSION) {
    throw new Error(`Unsupported .oml format version: ${formatVersion}`)
  }
}

function buildEdgesFromNodeParents(nodes: Node[]): Edge[] {
  const edges: Edge[] = []
  nodes.forEach((node) => {
    const childId = node.id
    const parents = Array.isArray(node.parentIds) ? node.parentIds : []
    parents.forEach((parentId, index) => {
      edges.push({
        id: `e${parentId}-${childId}-${index}`,
        source: parentId,
        target: childId,
        style: node.expansionColor
          ? {
              stroke: node.expansionColor,
              strokeWidth: 2
            }
          : undefined
      })
    })
  })
  return edges
}

/**
 * 保存图谱为 .oml 文件（ZIP 格式）
 * 返回 base64 编码的 ZIP 数据
 */
export async function saveOmlFile(graphData: GraphData): Promise<string> {
  const zip = new JSZip()

  // 1. 生成 structure.xml（图级信息）
  const structureXml = generateStructureXml(graphData)
  zip.file('structure.xml', structureXml)

  // 2. 创建 nodes 目录并按节点写入独立目录
  const nodesFolder = zip.folder('nodes')
  if (nodesFolder) {
    graphData.nodes.forEach((node) => {
      const nodeFolder = nodesFolder.folder(node.id)
      if (!nodeFolder) return

      const versions = (node.versions || []).map((version, index) => {
        const fileName = getVersionFileName(version.timestamp, index)
        return {
          timestamp: version.timestamp,
          file: fileName,
          content: version.content
        }
      })

      const versionsFolder = nodeFolder.folder('versions')
      if (versionsFolder) {
        versions.forEach((version) => {
          versionsFolder.file(version.file, version.content)
        })
      }

      nodeFolder.file('current.md', node.content)
      const thinking = parseString(node.thinking).trim()
      if (thinking) {
        nodeFolder.file('thinking.md', thinking)
      }

      const nodeResourcesFolder = nodeFolder.folder('resources')
      const nodeImagesFolder = nodeResourcesFolder?.folder('images')
      const nodeAttachmentsFolder = nodeResourcesFolder?.folder('attachments')

      // Save images to nodes/{nodeId}/resources/images/
      const imageDescriptors: NodeDescriptorImage[] = []
      if (node.images && node.images.length > 0 && nodeImagesFolder) {
        node.images.forEach((img) => {
          const extension = getExtensionFromMimeType(img.mimeType, 'png')
          const safeId = sanitizeFileName(parseString(img.id), `img-${Date.now()}`)
          const fileName = `${safeId}.${extension}`
          nodeImagesFolder.file(fileName, img.base64, { base64: true })
          imageDescriptors.push({
            id: img.id || safeId,
            mimeType: img.mimeType,
            name: img.name,
            file: fileName
          })
        })
      }

      // Save attachments to nodes/{nodeId}/resources/attachments/
      const attachmentDescriptors: NodeDescriptorAttachment[] = []
      if (node.attachments && node.attachments.length > 0 && nodeAttachmentsFolder) {
        node.attachments.forEach((attachment, index) => {
          const rawId = parseString(attachment.id, `att-${index + 1}`)
          const safeId = sanitizeFileName(rawId, `att-${index + 1}`)
          const resolvedName = parseString(attachment.name, `${safeId}.bin`)
          const extension = getExtensionFromFileName(resolvedName)
            || getExtensionFromMimeType(attachment.mimeType, 'bin')
          const fileName = `${safeId}.${extension}`
          const base64 = parseString(attachment.base64)
          const resolvedSize = resolveAttachmentSize(attachment.size, base64)
          assertAttachmentSizeWithinLimit(resolvedSize, node.id, resolvedName)

          nodeAttachmentsFolder.file(fileName, base64, { base64: true })
          attachmentDescriptors.push({
            id: rawId || safeId,
            mimeType: parseString(attachment.mimeType, 'application/octet-stream'),
            name: resolvedName,
            size: resolvedSize,
            file: fileName
          })
        })
      }

      const descriptor: NodeDescriptor = {
        id: node.id,
        contentFile: 'current.md',
        thinkingFile: thinking ? 'thinking.md' : undefined,
        question: node.question || '',
        position: {
          x: node.position?.x ?? 0,
          y: node.position?.y ?? 0
        },
        size: {
          width: parseNodeSize(node.width, NODE_DEFAULT_WIDTH, NODE_MIN_WIDTH),
          height: parseNodeSize(node.height, NODE_DEFAULT_HEIGHT, NODE_MIN_HEIGHT)
        },
        parentIds: node.parentIds || [],
        createdAt: node.createdAt || new Date().toISOString(),
        updatedAt: node.updatedAt,
        tags: node.tags || [],
        note: node.note || '',
        versions: versions.map((version) => ({
          timestamp: version.timestamp,
          file: version.file
        })),
        expansionColor: node.expansionColor,
        sourceRef: node.sourceRef,
        images: imageDescriptors.length > 0 ? imageDescriptors : undefined,
        attachments: attachmentDescriptors.length > 0 ? attachmentDescriptors : undefined
      }

      nodeFolder.file('node.json', JSON.stringify(descriptor, null, 2))
    })
  }

  // 3. 生成 ZIP 并返回 base64
  const zipBlob = await zip.generateAsync({ type: 'base64' })
  return zipBlob
}

/**
 * 加载 .oml 文件（从 base64 编码的 ZIP）
 */
export async function loadOmlFile(base64Data: string): Promise<GraphData> {
  // 1. 解压 ZIP
  const zip = await JSZip.loadAsync(base64Data, { base64: true })

  // 2. 读取 structure.xml（图级信息）
  const structureFile = zip.file('structure.xml')
  if (!structureFile) {
    throw new Error('Invalid .oml file: structure.xml not found')
  }
  const xmlContent = await structureFile.async('string')
  const structure = await parseStructureXml(xmlContent)
  assertSupportedFormatVersion(structure.formatVersion)

  // 3. 读取节点目录（每个节点自闭环）
  const descriptorPaths = listNodeDescriptorPaths(zip)
  const nodes: Node[] = await Promise.all(
    descriptorPaths.map(async (descriptorPath) => {
      const nodeIdFromPath = descriptorPath.split('/')[1]

      const descriptorText = await readRequiredFile(
        zip,
        descriptorPath,
        `Node descriptor not found: ${descriptorPath}`
      )

      let descriptorRaw: unknown
      try {
        descriptorRaw = JSON.parse(descriptorText)
      } catch (error) {
        throw new Error(`Invalid node descriptor JSON: ${descriptorPath}`)
      }

      const descriptor = descriptorRaw as Partial<NodeDescriptor>
      const nodeId = parseString(descriptor.id, nodeIdFromPath) || nodeIdFromPath
      const contentFile = parseString(descriptor.contentFile, 'current.md')
      const rawSize = descriptor.size || {}

      const content = await readRequiredFile(
        zip,
        `nodes/${nodeIdFromPath}/${contentFile}`,
        `Node current file not found: nodes/${nodeIdFromPath}/${contentFile}`
      )
      const thinkingFile = parseString(descriptor.thinkingFile)
      const thinking = thinkingFile
        ? await readRequiredFile(
            zip,
            `nodes/${nodeIdFromPath}/${thinkingFile}`,
            `Node thinking file not found: nodes/${nodeIdFromPath}/${thinkingFile}`
          )
        : ''

      const versionMetas = Array.isArray(descriptor.versions) ? descriptor.versions : []
      const versions = await Promise.all(
        versionMetas.map(async (version, index) => {
          const fileName = parseString(version.file)
          if (!fileName) {
            throw new Error(`Node version file missing at ${descriptorPath} index ${index}`)
          }

          const versionContent = await readRequiredFile(
            zip,
            `nodes/${nodeIdFromPath}/versions/${fileName}`,
            `Node version file not found: nodes/${nodeIdFromPath}/versions/${fileName}`
          )

          return {
            timestamp: parseString(version.timestamp, new Date().toISOString()),
            content: versionContent
          }
        })
      )

      const rawPosition = descriptor.position || { x: 0, y: 0 }
      const parentIds = Array.isArray(descriptor.parentIds)
        ? descriptor.parentIds.map((id) => parseString(id)).filter(Boolean)
        : []
      const tags = Array.isArray(descriptor.tags)
        ? descriptor.tags.map((tag) => parseString(tag)).filter(Boolean)
        : []

      // Load images from nodes/{nodeId}/resources/images/ (fallback to legacy resources/)
      const imageMetas = Array.isArray(descriptor.images) ? descriptor.images : []
      const images: NodeImage[] = (await Promise.all(
        imageMetas.map(async (imgMeta): Promise<NodeImage | null> => {
          const imgPath = `nodes/${nodeIdFromPath}/resources/images/${imgMeta.file}`
          const legacyPath = `nodes/${nodeIdFromPath}/resources/${imgMeta.file}`
          const imgFile = zip.file(imgPath) || zip.file(legacyPath)
          if (!imgFile) return null
          const base64 = await imgFile.async('base64')
          return {
            id: imgMeta.id || imgMeta.file,
            base64,
            mimeType: imgMeta.mimeType || 'image/png',
            name: imgMeta.name
          }
        })
      )).filter((img): img is NodeImage => img !== null)

      // Load attachments from nodes/{nodeId}/resources/attachments/
      const attachmentMetas = Array.isArray(descriptor.attachments) ? descriptor.attachments : []
      const attachments: NodeAttachment[] = (await Promise.all(
        attachmentMetas.map(async (attachmentMeta): Promise<NodeAttachment | null> => {
          const attachmentPath = `nodes/${nodeIdFromPath}/resources/attachments/${attachmentMeta.file}`
          const attachmentFile = zip.file(attachmentPath)
          if (!attachmentFile) return null
          const base64 = await attachmentFile.async('base64')
          const resolvedSize = resolveAttachmentSize(attachmentMeta.size, base64)
          const resolvedName = parseString(attachmentMeta.name, attachmentMeta.file || 'attachment')
          assertAttachmentSizeWithinLimit(resolvedSize, nodeIdFromPath, resolvedName)

          return {
            id: attachmentMeta.id || attachmentMeta.file,
            base64,
            mimeType: attachmentMeta.mimeType || 'application/octet-stream',
            name: resolvedName,
            size: resolvedSize
          }
        })
      )).filter((attachment): attachment is NodeAttachment => attachment !== null)

      return {
        id: nodeId,
        content,
        thinking: thinking || undefined,
        question: parseString(descriptor.question),
        position: {
          x: parseNumber((rawPosition as any).x, 0),
          y: parseNumber((rawPosition as any).y, 0)
        },
        width: parseNodeSize((rawSize as any).width, NODE_DEFAULT_WIDTH, NODE_MIN_WIDTH),
        height: parseNodeSize((rawSize as any).height, NODE_DEFAULT_HEIGHT, NODE_MIN_HEIGHT),
        parentIds,
        createdAt: parseString(descriptor.createdAt, new Date().toISOString()),
        updatedAt: parseString(descriptor.updatedAt) || undefined,
        tags,
        note: parseString(descriptor.note),
        versions,
        expansionColor: parseString(descriptor.expansionColor) || undefined,
        sourceRef: normalizeSourceRef(descriptor.sourceRef),
        images: images.length > 0 ? images : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
      }
    })
  )

  const edges = Array.isArray(structure.edges) && structure.edges.length > 0
    ? structure.edges
    : buildEdgesFromNodeParents(nodes)

  return {
    nodes,
    edges,
    regions: structure.regions || [],
    name: structure.name || 'Untitled',
    formatVersion: structure.formatVersion
  }
}

/**
 * 生成 structure.xml（仅保留图级信息，不包含节点内容/节点元信息）
 */
function generateStructureXml(graphData: GraphData): string {
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' }
  })

  const xmlObject = {
    graph: {
      metadata: {
        name: graphData.name,
        createdAt: new Date().toISOString(),
        formatVersion: OML_FORMAT_VERSION,
        formatProfile: OML_PARSE_PROFILE
      },
      regions: graphData.regions && graphData.regions.length > 0 ? {
        region: graphData.regions.map((region) => ({
          $: {
            id: region.id,
            color: region.color,
            x: region.x.toString(),
            y: region.y.toString(),
            width: region.width.toString(),
            height: region.height.toString()
          },
          name: region.name,
          description: region.description,
          createdAt: region.createdAt
        }))
      } : undefined,
      edges: graphData.edges.length > 0 ? {
        edge: graphData.edges.map((edge) => ({
          $: {
            id: edge.id,
            source: edge.source,
            target: edge.target
          },
          style: edge.style ? {
            stroke: edge.style.stroke,
            strokeWidth: edge.style.strokeWidth?.toString()
          } : undefined
        }))
      } : undefined
    }
  }

  return builder.buildObject(xmlObject)
}

/**
 * 解析 structure.xml（图级信息）
 */
async function parseStructureXml(xmlContent: string): Promise<{
  name: string
  regions: Region[]
  edges: Edge[]
  formatVersion: string
}> {
  const parser = new Parser()
  const result = await parser.parseStringPromise(xmlContent)

  const graph = result.graph || {}

  const edgesRaw = graph.edges?.[0]?.edge
    ? Array.isArray(graph.edges[0].edge)
      ? graph.edges[0].edge
      : [graph.edges[0].edge]
    : []

  const regionsRaw = graph.regions?.[0]?.region
    ? Array.isArray(graph.regions[0].region)
      ? graph.regions[0].region
      : [graph.regions[0].region]
    : []

  return {
    name: graph.metadata?.[0]?.name?.[0] || 'Untitled',
    formatVersion: parseString(graph.metadata?.[0]?.formatVersion?.[0], '1.0'),
    regions: regionsRaw.map((region: any) => ({
      id: parseString(region.$?.id, `region-${Date.now()}`),
      name: parseString(region.name?.[0], '未命名区域'),
      color: parseString(region.$?.color, '#c084fc'),
      description: parseString(region.description?.[0]),
      createdAt: parseString(region.createdAt?.[0], new Date().toISOString()),
      x: parseNumber(region.$?.x, 0),
      y: parseNumber(region.$?.y, 0),
      width: Math.max(180, parseNumber(region.$?.width, 420)),
      height: Math.max(120, parseNumber(region.$?.height, 260))
    })),
    edges: edgesRaw.map((edge: any) => ({
      id: parseString(edge.$?.id),
      source: parseString(edge.$?.source),
      target: parseString(edge.$?.target),
      style: edge.style?.[0]
        ? {
            stroke: parseString(edge.style[0].stroke?.[0]) || undefined,
            strokeWidth: parseNumber(edge.style[0].strokeWidth?.[0], 0) || undefined
          }
        : undefined
    })).filter((edge: Edge) => Boolean(edge.id && edge.source && edge.target))
  }
}
