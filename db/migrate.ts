import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'

/** 与 npm scripts 一致：在仓库根目录执行，路径相对 cwd */
const ROOT = process.cwd()
const DB_PATH = path.join(ROOT, 'bot.db')
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations')

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return []
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .sort((a, b) => {
      const ma = a.match(/^(\d+)_/)
      const mb = b.match(/^(\d+)_/)
      const va = ma ? parseInt(ma[1]!, 10) : 0
      const vb = mb ? parseInt(mb[1]!, 10) : 0
      return va - vb
    })
}

function fileVersion(filename: string): number | null {
  const m = filename.match(/^(\d+)_/)
  return m ? parseInt(m[1]!, 10) : null
}

/**
 * 将 bot.db 的 schema 线性升级到 migrations 目录所定义的最新版本。
 * 使用 PRAGMA user_version 记录已应用版本；每条迁移在一个事务内执行。
 */
export function runMigrations(): void {
  const db = new Database(DB_PATH)
  try {
    let current = db.pragma('user_version', { simple: true }) as number
    const files = listMigrationFiles()

    for (const file of files) {
      const target = fileVersion(file)
      if (target == null) continue
      if (target <= current) continue
      if (target !== current + 1) {
        throw new Error(
          `迁移版本不连续：当前 user_version=${current}，下一条应为 ${current + 1}，但文件 ${file} 的版本为 ${target}`
        )
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      db.transaction(() => {
        db.exec(sql)
        db.pragma(`user_version = ${target}`)
      })()

      current = target
      console.log(`[migrate] 已应用 ${file}，user_version=${current}`)
    }
  } finally {
    db.close()
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(path.resolve(entry)).href
}

if (isMainModule()) {
  try {
    runMigrations()
  } catch (e) {
    const err = e as Error
    console.error('[migrate] 失败:', err.message)
    process.exitCode = 1
  }
}

export { DB_PATH, MIGRATIONS_DIR }
