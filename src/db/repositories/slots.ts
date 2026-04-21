import type { Prisma, Slot } from '../../generated/prisma/client.js'
import { prisma } from '../prisma.js'
import type { CreateSlot, SlotRow, UpdateSlot } from '../types.js'

function toRow(s: Slot): SlotRow {
  return {
    id: s.id,
    chatId: s.chatId,
    message: s.message,
    limit: s.participantLimit,
    messageId: s.messageId,
    messageType: s.messageType,
    finalSent: s.finalSent,
  }
}

class SlotsRepository {
  async list(): Promise<SlotRow[]> {
    const rows = await prisma.slot.findMany({ orderBy: { id: 'desc' } })
    return rows.map(toRow)
  }

  async getById(id: string): Promise<SlotRow | undefined> {
    const s = await prisma.slot.findUnique({ where: { id } })
    return s ? toRow(s) : undefined
  }

  async create(input: CreateSlot): Promise<SlotRow> {
    const created = await prisma.slot.create({
      data: {
        id: input.id,
        chatId: input.chatId,
        message: input.message,
        participantLimit: input.limit,
        messageId: input.messageId,
        messageType: input.messageType,
        finalSent: input.finalSent ?? 0,
      },
    })
    return toRow(created)
  }

  async updateById(id: string, input: UpdateSlot): Promise<SlotRow | undefined> {
    const data: Prisma.SlotUpdateInput = {}
    if (input.chatId !== undefined) data.chatId = input.chatId
    if (input.message !== undefined) data.message = input.message
    if (input.limit !== undefined) data.participantLimit = input.limit
    if (input.messageId !== undefined) data.messageId = input.messageId
    if (input.messageType !== undefined) data.messageType = input.messageType
    if (input.finalSent !== undefined) data.finalSent = input.finalSent

    if (Object.keys(data).length === 0) {
      return this.getById(id)
    }

    try {
      const updated = await prisma.slot.update({ where: { id }, data })
      return toRow(updated)
    } catch {
      return undefined
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      await prisma.slot.delete({ where: { id } })
      return true
    } catch {
      return false
    }
  }
}

const slotsRepository = new SlotsRepository()

export default slotsRepository
export { SlotsRepository }
