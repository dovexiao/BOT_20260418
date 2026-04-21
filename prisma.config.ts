import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

const databaseUrl =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), 'bot.db').replace(/\\/g, '/')}`

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
