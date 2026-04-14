import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from 'dotenv'
import { nodeRoutes } from './routes/nodes.js'
import filesRoutes from './routes/files.js'

if (process.env.OML_DISABLE_DOTENV !== '1') {
  config()
}

// .oml 使用 base64 传输，体积会比原始 ZIP 增大，带图片时需要更高上限
const fastify = Fastify({ logger: true, bodyLimit: 60 * 1024 * 1024 })
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 15174)

await fastify.register(cors)
await fastify.register(nodeRoutes)
await fastify.register(filesRoutes, { prefix: '/api/files' })

const start = async () => {
  try {
    await fastify.listen({ host, port })
    console.log(`Backend running on http://${host}:${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
