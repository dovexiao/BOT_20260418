import path from 'node:path'
import Database from 'better-sqlite3'

const DB_PATH = path.join(process.cwd(), 'bot.db')
const db = new Database(DB_PATH)

export interface ChatRow {
  chatId: number
  chatName: string
  createdAt: string
  leftAt: string | null
}

export interface CreateChat {
  chatId: number
  chatName: string
  createdAt?: string
  leftAt?: string | null
}

export interface UpdateChat {
  chatName?: string
  createdAt?: string
  leftAt?: string | null
}

/**
 * chats 表基础仓储：增删改查。
 * 约定表结构：
 *   chatId INTEGER PRIMARY KEY,
 *   chatName TEXT NOT NULL,
 *   createdAt TEXT NOT NULL DEFAULT (datetime('now')),
 *   leftAt TEXT
 */
class ChatsRepository {
  private readonly listStmt = db.prepare('SELECT * FROM chats ORDER BY createdAt DESC')
  private readonly getByChatIdStmt = db.prepare('SELECT * FROM chats WHERE chatId = ?')
  private readonly deleteByChatIdStmt = db.prepare('DELETE FROM chats WHERE chatId = ?')
  private readonly createStmt = db.prepare(`
    INSERT INTO chats (chatId, chatName, createdAt, leftAt)
    VALUES (@chatId, @chatName, COALESCE(@createdAt, datetime('now')), @leftAt)
  `)

  list(): ChatRow[] {
    return this.listStmt.all() as ChatRow[]
  }

  getByChatId(chatId: number): ChatRow | undefined {
    return this.getByChatIdStmt.get(chatId) as ChatRow | undefined
  }

  create(input: CreateChat): ChatRow {
    const payload = {
      ...input,
      createdAt: input.createdAt ?? null,
      leftAt: input.leftAt ?? null,
    }

    this.createStmt.run(payload)
    const created = this.getByChatId(input.chatId)
    if (!created) {
      throw new Error(`创建 chats 记录失败，未找到 chatId=${input.chatId} 的记录`)
    }
    return created
  }

  updateByChatId(chatId: number, input: UpdateChat): ChatRow | undefined {
    const fields: string[] = []
    const params: Record<string, unknown> = { chatId }

    if (input.chatName !== undefined) {
      fields.push('chatName=@chatName')
      params.chatName = input.chatName
    }
    if (input.createdAt !== undefined) {
      fields.push('createdAt=@createdAt')
      params.createdAt = input.createdAt
    }
    if (input.leftAt !== undefined) {
      fields.push('leftAt=@leftAt')
      params.leftAt = input.leftAt
    }

    if (fields.length === 0) {
      return this.getByChatId(chatId)
    }

    const stmt = db.prepare(`UPDATE chats SET ${fields.join(', ')} WHERE chatId=@chatId`)
    const result = stmt.run(params)
    if (!result.changes) return undefined
    return this.getByChatId(chatId)
  }

  deleteByChatId(chatId: number): boolean {
    const result = this.deleteByChatIdStmt.run(chatId)
    return result.changes > 0
  }

  // 用于获取第一个加入的群聊
  getFirst(): ChatRow | undefined {
    return this.listStmt.get() as ChatRow | undefined
  }
}

const chatsRepository = new ChatsRepository()

export default chatsRepository
export { ChatsRepository, DB_PATH }
