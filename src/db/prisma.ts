import path from 'node:path'
import dotenv from 'dotenv'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.js'

dotenv.config()

const dbFile = path.join(process.cwd(), 'bot.db').replace(/\\/g, '/')
const databaseUrl = process.env.DATABASE_URL ?? `file:${dbFile}`

const adapter = new PrismaBetterSqlite3({ url: databaseUrl })

export const prisma = new PrismaClient({ adapter })
export { databaseUrl }
