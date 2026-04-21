import type { Joined, Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../prisma.js'
import type { CreateJoined, JoinedRow, UpdateJoined } from '../types.js'

function toRow(j: Joined): JoinedRow {
  return {
    slotId: j.slotId,
    userId: j.userId,
    username: j.username,
    name: j.name,
    createdAt: j.createdAt,
    revokedAt: j.revokedAt,
  }
}

class JoinedRepository {
  async list(): Promise<JoinedRow[]> {
    const rows = await prisma.joined.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(toRow)
  }

  async listBySlotId(slotId: string): Promise<JoinedRow[]> {
    const rows = await prisma.joined.findMany({
      where: { slotId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toRow)
  }

  async getByKey(slotId: string, userId: number): Promise<JoinedRow | undefined> {
    const j = await prisma.joined.findUnique({
      where: { slotId_userId: { slotId, userId } },
    })
    return j ? toRow(j) : undefined
  }

  async create(input: CreateJoined): Promise<JoinedRow> {
    const data: Prisma.JoinedCreateInput = {
      slotId: input.slotId,
      userId: input.userId,
      username: input.username,
      name: input.name ?? null,
      revokedAt: input.revokedAt ?? null,
    }
    if (input.createdAt != null) {
      data.createdAt = input.createdAt
    }
    const created = await prisma.joined.create({ data })
    return toRow(created)
  }

  async updateByKey(
    slotId: string,
    userId: number,
    input: UpdateJoined
  ): Promise<JoinedRow | undefined> {
    const data: Prisma.JoinedUpdateInput = {}
    if (input.username !== undefined) data.username = input.username
    if (input.name !== undefined) data.name = input.name
    if (input.createdAt !== undefined) data.createdAt = input.createdAt
    if (input.revokedAt !== undefined) data.revokedAt = input.revokedAt

    if (Object.keys(data).length === 0) {
      return this.getByKey(slotId, userId)
    }

    try {
      const updated = await prisma.joined.update({
        where: { slotId_userId: { slotId, userId } },
        data,
      })
      return toRow(updated)
    } catch {
      return undefined
    }
  }

  async deleteByKey(slotId: string, userId: number): Promise<boolean> {
    try {
      await prisma.joined.delete({
        where: { slotId_userId: { slotId, userId } },
      })
      return true
    } catch {
      return false
    }
  }

  async countBySlotId(slotId: string): Promise<number> {
    return prisma.joined.count({ where: { slotId } })
  }
}

const joinedRepository = new JoinedRepository()

export default joinedRepository
export { JoinedRepository }
