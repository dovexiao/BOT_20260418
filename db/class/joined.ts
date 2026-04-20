import path from 'node:path'
import Database from 'better-sqlite3'

const DB_PATH = path.join(process.cwd(), 'bot.db')
const db = new Database(DB_PATH)

export interface JoinedRow {
  slotId: string
  userId: number
  username: string | null
  name: string | null
  createdAt: string
  revokedAt: string | null
}

export interface CreateJoined {
  slotId: string
  userId: number
  username: string | null
  name?: string | null
  createdAt?: string
  revokedAt?: string | null
}

export interface UpdateJoined {
  username?: string | null
  name?: string | null
  createdAt?: string
  revokedAt?: string | null
}

/**
 * joined 表基础仓储：增删改查。
 * 约定表结构：
 *   slotId TEXT NOT NULL,
 *   userId INTEGER NOT NULL,
 *   username TEXT NOT NULL,
 *   name TEXT,
 *   createdAt TEXT NOT NULL DEFAULT (datetime('now')),
 *   revokedAt TEXT,
 *   PRIMARY KEY (slotId, userId)
 */
class JoinedRepository {
  private readonly listStmt = db.prepare('SELECT * FROM joined ORDER BY createdAt DESC')
  private readonly listBySlotIdStmt = db.prepare('SELECT * FROM joined WHERE slotId = ? ORDER BY createdAt DESC')
  private readonly getByKeyStmt = db.prepare('SELECT * FROM joined WHERE slotId = ? AND userId = ?')
  private readonly deleteByKeyStmt = db.prepare('DELETE FROM joined WHERE slotId = ? AND userId = ?')
  private readonly createStmt = db.prepare(`
    INSERT INTO joined (slotId, userId, username, name, createdAt, revokedAt)
    VALUES (@slotId, @userId, @username, @name, COALESCE(@createdAt, datetime('now')), @revokedAt)
  `)

  list(): JoinedRow[] {
    return this.listStmt.all() as JoinedRow[]
  }

  listBySlotId(slotId: string): JoinedRow[] {
    return this.listBySlotIdStmt.all(slotId) as JoinedRow[]
  }

  getByKey(slotId: string, userId: number): JoinedRow | undefined {
    return this.getByKeyStmt.get(slotId, userId) as JoinedRow | undefined
  }

  create(input: CreateJoined): JoinedRow {
    const payload = {
      ...input,
      name: input.name ?? null,
      createdAt: input.createdAt ?? null,
      revokedAt: input.revokedAt ?? null,
    }

    this.createStmt.run(payload)
    const created = this.getByKey(input.slotId, input.userId)
    if (!created) {
      throw new Error(`创建 joined 记录失败，未找到 slotId=${input.slotId} userId=${input.userId} 的记录`)
    }
    return created
  }

  updateByKey(slotId: string, userId: number, input: UpdateJoined): JoinedRow | undefined {
    const fields: string[] = []
    const params: Record<string, unknown> = { slotId, userId }

    if (input.username !== undefined) {
      fields.push('username=@username')
      params.username = input.username
    }
    if (input.name !== undefined) {
      fields.push('name=@name')
      params.name = input.name
    }
    if (input.createdAt !== undefined) {
      fields.push('createdAt=@createdAt')
      params.createdAt = input.createdAt
    }
    if (input.revokedAt !== undefined) {
      fields.push('revokedAt=@revokedAt')
      params.revokedAt = input.revokedAt
    }

    if (fields.length === 0) {
      return this.getByKey(slotId, userId)
    }

    const stmt = db.prepare(`UPDATE joined SET ${fields.join(', ')} WHERE slotId=@slotId AND userId=@userId`)
    const result = stmt.run(params)
    if (!result.changes) return undefined
    return this.getByKey(slotId, userId)
  }

  deleteByKey(slotId: string, userId: number): boolean {
    const result = this.deleteByKeyStmt.run(slotId, userId)
    return result.changes > 0
  }

  countBySlotId(slotId: string): number {
    return this.listBySlotId(slotId).length
  }
}

const joinedRepository = new JoinedRepository()

export default joinedRepository
export { JoinedRepository, DB_PATH }
