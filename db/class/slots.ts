import path from 'node:path'
import Database from 'better-sqlite3'

const DB_PATH = path.join(process.cwd(), 'bot.db')
const db = new Database(DB_PATH)

export interface SlotRow {
  id: string
  chatId: number
  message: string
  limit: number
  messageId: number
  messageType: string
  finalSent: number
}

export interface CreateSlot {
  id: string
  chatId: number
  message: string
  limit: number
  messageId: number
  messageType: string
  finalSent?: number
}

export interface UpdateSlot {
  chatId?: number
  message?: string
  limit?: number
  messageId?: number
  messageType?: string
  finalSent?: number
}

/**
 * slots 表基础仓储：增删改查。
 * 约定表结构：
 *   id TEXT PRIMARY KEY,
 *   chatId INTEGER,
 *   message TEXT,
 *   "limit" INTEGER,
 *   messageId INTEGER,
 *   messageType TEXT,
 *   finalSent INTEGER DEFAULT 0
 */
class SlotsRepository {
  private readonly listStmt = db.prepare('SELECT * FROM slots ORDER BY rowid DESC')
  private readonly getByIdStmt = db.prepare('SELECT * FROM slots WHERE id = ?')
  private readonly deleteByIdStmt = db.prepare('DELETE FROM slots WHERE id = ?')
  private readonly createStmt = db.prepare(`
    INSERT INTO slots (id, chatId, message, "limit", messageId, messageType, finalSent)
    VALUES (@id, @chatId, @message, @limit, @messageId, @messageType, @finalSent)
  `)

  list(): SlotRow[] {
    return this.listStmt.all() as SlotRow[]
  }

  getById(id: string): SlotRow | undefined {
    return this.getByIdStmt.get(id) as SlotRow | undefined
  }

  create(input: CreateSlot): SlotRow {
    const payload = {
      ...input,
      finalSent: input.finalSent ?? 0,
    }

    this.createStmt.run(payload)
    const created = this.getById(input.id)
    if (!created) {
      throw new Error(`创建 slot 失败，未找到 id=${input.id} 的记录`)
    }
    return created
  }

  updateById(id: string, input: UpdateSlot): SlotRow | undefined {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    if (input.chatId !== undefined) {
      fields.push('chatId=@chatId')
      params.chatId = input.chatId
    }
    if (input.message !== undefined) {
      fields.push('message=@message')
      params.message = input.message
    }
    if (input.limit !== undefined) {
      fields.push('"limit"=@limit')
      params.limit = input.limit
    }
    if (input.messageId !== undefined) {
      fields.push('messageId=@messageId')
      params.messageId = input.messageId
    }
    if (input.messageType !== undefined) {
      fields.push('messageType=@messageType')
      params.messageType = input.messageType
    }
    if (input.finalSent !== undefined) {
      fields.push('finalSent=@finalSent')
      params.finalSent = input.finalSent
    }

    if (fields.length === 0) {
      return this.getById(id)
    }

    const stmt = db.prepare(`UPDATE slots SET ${fields.join(', ')} WHERE id=@id`)
    const result = stmt.run(params)
    if (!result.changes) return undefined
    return this.getById(id)
  }

  deleteById(id: string): boolean {
    const result = this.deleteByIdStmt.run(id)
    return result.changes > 0
  }
}

const slotsRepository = new SlotsRepository()

export default slotsRepository
export { SlotsRepository, DB_PATH }