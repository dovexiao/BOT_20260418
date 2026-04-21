import type { Chat, Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../prisma.js'
import type { ChatRow, CreateChat, UpdateChat } from '../types.js'

function toRow(c: Chat): ChatRow {
  return {
    chatId: c.chatId,
    chatName: c.chatName,
    createdAt: c.createdAt,
    leftAt: c.leftAt,
  }
}

class ChatsRepository {
  async list(): Promise<ChatRow[]> {
    const rows = await prisma.chat.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(toRow)
  }

  async getByChatId(chatId: number): Promise<ChatRow | undefined> {
    const c = await prisma.chat.findUnique({ where: { chatId } })
    return c ? toRow(c) : undefined
  }

  async create(input: CreateChat): Promise<ChatRow> {
    const data: Prisma.ChatCreateInput = {
      chatId: input.chatId,
      chatName: input.chatName,
      leftAt: input.leftAt ?? null,
    }
    if (input.createdAt != null) {
      data.createdAt = input.createdAt
    }
    const created = await prisma.chat.create({ data })
    return toRow(created)
  }

  async updateByChatId(chatId: number, input: UpdateChat): Promise<ChatRow | undefined> {
    const data: Prisma.ChatUpdateInput = {}
    if (input.chatName !== undefined) data.chatName = input.chatName
    if (input.createdAt !== undefined) data.createdAt = input.createdAt
    if (input.leftAt !== undefined) data.leftAt = input.leftAt

    if (Object.keys(data).length === 0) {
      return this.getByChatId(chatId)
    }

    try {
      const updated = await prisma.chat.update({ where: { chatId }, data })
      return toRow(updated)
    } catch {
      return undefined
    }
  }

  async deleteByChatId(chatId: number): Promise<boolean> {
    try {
      await prisma.chat.delete({ where: { chatId } })
      return true
    } catch {
      return false
    }
  }

  async getFirst(): Promise<ChatRow | undefined> {
    const c = await prisma.chat.findFirst({ orderBy: { createdAt: 'desc' } })
    return c ? toRow(c) : undefined
  }
}

const chatsRepository = new ChatsRepository()

export default chatsRepository
export { ChatsRepository }
