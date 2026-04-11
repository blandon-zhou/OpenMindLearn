# OpenMindLearn 功能差距分析与实现总结

## 2026-03-28 超大文件重构完成记录

### 已完成重构

1. 后端 LLM 服务模块化
- 原文件 `packages/backend/src/services/llm.ts`（847 行）已拆分为 `packages/backend/src/services/llm/` 目录。
- 新增子模块：
  - `index.ts`（对外 facade）
  - `config.ts`（运行时配置与规范化）
  - `prompts.ts`（默认提示词与模板渲染）
  - `adapters/openaiChat.ts`
  - `adapters/googleGemini.ts`
  - `parsing/thinkingExtractor.ts`
  - `parsing/normalize.ts`
  - `transport.ts`
  - `types.ts`
- `packages/backend/src/services/llm.ts` 保留为兼容导出层，现为 14 行。

2. 前端 Settings Store 模块化
- 原文件 `packages/frontend/src/stores/settingsStore.ts`（509 行）已拆分为 `packages/frontend/src/stores/settings/` 目录。
- 新增子模块：
  - `types.ts`
  - `defaults.ts`
  - `legacyUpgrade.ts`
  - `normalize.ts`
  - `store.ts`
  - `index.ts`
- `packages/frontend/src/stores/settingsStore.ts` 保留兼容 re-export，现为 21 行。

3. Canvas 组件分层拆分
- 原 `packages/frontend/src/components/Canvas.tsx`（1238 行）已改为兼容入口，指向新实现：
  - `packages/frontend/src/components/canvas/Canvas.tsx`（466 行）
- 新增子组件/子 hooks：
  - `CanvasFlow.tsx`
  - `CanvasSearchPanel.tsx`
  - `CanvasRegionLayer.tsx`
  - `CanvasRegionInteractionLayer.tsx`
  - `CanvasRegionPanel.tsx`
  - `CanvasFirstNodePanel.tsx`
  - `CanvasContextMenu.tsx`
  - `NodeDetailPanel.tsx`
  - `MetaEditorDialog.tsx`
  - `VersionDialog.tsx`
  - `hooks/useDetailPanelResize.ts`
  - `hooks/useGlobalImagePaste.ts`
  - `hooks/useSourceLinkHighlight.ts`

### 验证结果

- `pnpm -C packages/frontend build` 通过
- `pnpm -C packages/backend build` 通过

### 当前状态说明

- 代码已完成按职责拆分与兼容迁移。
- 现阶段代码文件中已不再存在超过 500 行的 LLM 与 Settings 核心文件。
- Canvas 主实现压缩至 500 行以内（466 行），并通过拆分降低了后续迭代风险。

## 已完成的功能实现

### 后端实现 ✅

1. **上下文服务** (`packages/backend/src/services/contextService.ts`)
   - `buildContextChain()` - 回溯父节点链（最多 10 个）
   - `generateContextXml()` - 生成 XML 格式上下文
   - `escapeXml()` - XML 特殊字符转义

2. **文件服务** (`packages/backend/src/services/fileService.ts`)
   - `saveOmlFile()` - 保存图谱为 .oml 文件（ZIP + base64）
   - `loadOmlFile()` - 加载 .oml 文件
   - `generateStructureXml()` - 生成 structure.xml
   - `parseStructureXml()` - 解析 structure.xml

3. **文件路由** (`packages/backend/src/routes/files.ts`)
   - `POST /api/files/save` - 保存文件
   - `POST /api/files/load` - 加载文件

4. **LLM 服务更新** (`packages/backend/src/services/llm.ts`)
   - `generateWithContext()` - 带上下文的内容生成

5. **节点路由更新** (`packages/backend/src/routes/nodes.ts`)
   - 支持 `allNodes` 和 `selectedNodeIds` 参数
   - 自动回溯或手动选择上下文

### 前端实现 ✅

1. **状态管理更新** (`packages/frontend/src/stores/graphStore.ts`)
   - 新增字段：`fileName`, `isDirty`
   - 新增方法：`setFileName`, `setDirty`, `loadGraph`, `clearGraph`

2. **Toolbar 组件** (`packages/frontend/src/components/Toolbar.tsx`)
   - 文件名显示和编辑
   - 保存状态指示（• 未保存）
   - 新建/打开/保存按钮

3. **ContextPanel 组件** (`packages/frontend/src/components/ContextPanel.tsx`)
   - 显示祖先节点列表
   - 支持勾选/取消节点
   - 确认按钮应用选择

4. **API 服务更新** (`packages/frontend/src/services/api.ts`)
   - `expandNode()` 支持 `allNodes` 和 `selectedNodeIds`
   - `saveFile()` - 保存文件
   - `loadFile()` - 加载文件

## 还需完成的集成工作

### 1. Canvas 集成文件操作

需要在 `packages/frontend/src/components/Canvas.tsx` 中：

**添加导入：**
```typescript
import { Toolbar } from './Toolbar'
import { useGraphStore } from '../stores/graphStore'
import { saveFile, loadFile } from '../services/api'
import JSZip from 'jszip'
```

**添加状态和方法：**
```typescript
const { nodes: storeNodes, setDirty, loadGraph, clearGraph, fileName } = useGraphStore()

// 保存文件
const handleSave = async () => {
  try {
    // 转换 ReactFlow 节点为 Node 类型
    const graphNodes = nodes.map(n => ({
      id: n.id,
      content: n.data.content,
      position: n.position,
      parentIds: [], // 需要从 edges 推导
      createdAt: new Date().toISOString()
    }))

    const result = await saveFile(graphNodes, edges, fileName)

    // 触发浏览器下载
    const link = document.createElement('a')
    link.href = `data:application/zip;base64,${result.data}`
    link.download = `${fileName}.oml`
    link.click()

    setDirty(false)
  } catch (error) {
    console.error('保存失败:', error)
    alert('保存失败，请重试')
  }
}

// 加载文件
const handleLoad = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.oml'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

      const result = await loadFile(base64)

      // 更新状态
      loadGraph({ nodes: result.nodes, name: result.name })

      // 转换为 ReactFlow 格式
      const rfNodes = result.nodes.map(n => ({
        id: n.id,
        type: 'custom',
        position: n.position,
        data: {
          content: n.content,
          nodeId: n.id,
          onGenerate: (c: string) => handleGenerate(n.id, c),
          onExpand: (text: string) => handleExpand(text, n.id)
        }
      }))

      setNodes(rfNodes)
      setEdges(result.edges)
    } catch (error) {
      console.error('加载失败:', error)
      alert('加载失败，请检查文件格式')
    }
  }
  input.click()
}

// 新建文件
const handleNew = () => {
  if (isDirty) {
    if (!confirm('当前文件未保存，确定要新建吗？')) return
  }
  clearGraph()
  setNodes([])
  setEdges([])
}
```

**更新 handleExpand 传递 allNodes：**
```typescript
const handleExpand = useCallback(async (text: string, parentId: string, selectedNodeIds?: string[]) => {
  // ... 现有代码 ...

  // 转换 ReactFlow 节点为 Node 类型
  const allNodes = nodes.map(n => ({
    id: n.id,
    content: n.data.content,
    position: n.position,
    parentIds: edges.filter(e => e.target === n.id).map(e => e.source),
    createdAt: new Date().toISOString()
  }))

  const result = await expandNode(text, parentId, allNodes, selectedNodeIds)
  // ... 现有代码 ...
}, [nodes, edges, setNodes, setEdges])
```

**在 JSX 中添加 Toolbar：**
```typescript
return (
  <div className="w-screen h-screen flex flex-col bg-background">
    {/* 添加 Toolbar */}
    <Toolbar onSave={handleSave} onLoad={handleLoad} onNew={handleNew} />

    <div className="flex-1 flex">
      {/* 现有的 Canvas 和 Detail Panel */}
    </div>
  </div>
)
```

### 2. NodeCard 集成上下文选择

需要在 `packages/frontend/src/components/NodeCard.tsx` 中：

**添加导入：**
```typescript
import { ContextPanel } from './ContextPanel'
```

**添加状态：**
```typescript
const [showContextPanel, setShowContextPanel] = useState(false)
const [allNodes, setAllNodes] = useState<Node[]>([])
```

**更新 data 接口：**
```typescript
interface NodeCardProps {
  data: {
    content: string
    isEditing?: boolean
    nodeId: string
    onGenerate: (content: string) => void
    onExpand: (text: string, selectedNodeIds?: string[]) => void
    allNodes?: Node[]  // 新增
  }
}
```

**在选择菜单中添加第三个选项：**
```typescript
{selectionMenu && createPortal(
  <div className="...">
    <button onClick={handleDirectExpand}>直接展开</button>
    <button onClick={() => setShowPromptInput(true)}>针对性提问</button>
    <button onClick={() => {
      setAllNodes(data.allNodes || [])
      setShowContextPanel(true)
      setSelectionMenu(null)
    }}>
      自定义上下文展开
    </button>
  </div>,
  document.body
)}
```

**添加 ContextPanel：**
```typescript
{showContextPanel && createPortal(
  <ContextPanel
    currentNodeId={data.nodeId}
    allNodes={allNodes}
    onConfirm={(selectedNodeIds) => {
      if (selectionMenu) {
        data.onExpand(selectionMenu.text, selectedNodeIds)
      }
      setShowContextPanel(false)
    }}
    onClose={() => setShowContextPanel(false)}
  />,
  document.body
)}
```

## 测试计划

### 1. 文件操作测试
- [ ] 创建 3-5 个节点，建立连接
- [ ] 点击保存，验证下载 .oml 文件
- [ ] 刷新页面
- [ ] 点击打开，加载文件
- [ ] 验证节点和连接正确恢复

### 2. 工具栏测试
- [ ] 验证文件名显示和编辑
- [ ] 修改内容，验证 • 指示器
- [ ] 保存后验证 • 消失
- [ ] 点击新建，验证清空

### 3. 上下文传递测试
- [ ] 创建节点链 A → B → C
- [ ] 从 C 扩展，验证上下文传递
- [ ] 使用自定义上下文选择
- [ ] 验证只传递选中的节点

## 未实现的功能（低优先级）

根据 PROJECT_REQUIREMENTS.md，以下功能尚未实现：

1. **LLM 配置界面** - 配置 Base URL、API Key、Model 等
2. **节点版本控制** - 最多 3 个历史版本、Diff 对比
3. **节点标注与组织** - 标签、备注、区域标注、搜索
4. **节点删除功能**
5. **单节点导出为 .md**
6. **撤销/重做**
7. **快捷键支持**
8. **主题切换**

这些功能可以在后续迭代中逐步实现。

## 技术债务

1. **错误处理** - 需要添加更完善的错误处理和用户提示
2. **类型定义** - 需要完善 TypeScript 类型定义
3. **性能优化** - 大量节点时可能需要虚拟化渲染
4. **测试** - 需要添加单元测试和集成测试
