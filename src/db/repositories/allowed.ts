import type { Allowed, Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../prisma.js'
import type { AllowedRow, CreateAllowed, UpdateAllowed } from '../types.js'

function toRow(a: Allowed): AllowedRow {
  return {
    id: a.id,
    username: a.username,
    createdAt: a.createdAt,
    revokedAt: a.revokedAt,
    isDeleted: a.isDeleted,
  }
}

class AllowedRepository {
  async list(): Promise<AllowedRow[]> {
    const rows = await prisma.allowed.findMany({ orderBy: { id: 'desc' } })
    return rows.map(toRow)
  }

  async getById(id: number): Promise<AllowedRow | undefined> {
    const row = await prisma.allowed.findUnique({ where: { id } })
    return row ? toRow(row) : undefined
  }

  async getByUsername(username: string): Promise<AllowedRow | undefined> {
    const row = await prisma.allowed.findFirst({ where: { username }, orderBy: { id: 'desc' } })
    return row ? toRow(row) : undefined
  }

  async create(input: CreateAllowed): Promise<AllowedRow> {
    const data: Prisma.AllowedCreateInput = {
      username: input.username,
      revokedAt: input.revokedAt ?? null,
      isDeleted: input.isDeleted ?? 0,
    }
    if (input.createdAt != null) {
      data.createdAt = input.createdAt
    }
    const created = await prisma.allowed.create({ data })
    return toRow(created)
  }

  async updateById(id: number, input: UpdateAllowed): Promise<AllowedRow | undefined> {
    const data: Prisma.AllowedUpdateInput = {}
    if (input.username !== undefined) data.username = input.username
    if (input.createdAt !== undefined) data.createdAt = input.createdAt
    if (input.revokedAt !== undefined) data.revokedAt = input.revokedAt
    if (input.isDeleted !== undefined) data.isDeleted = input.isDeleted

    if (Object.keys(data).length === 0) {
      return this.getById(id)
    }

    try {
      const updated = await prisma.allowed.update({ where: { id }, data })
      return toRow(updated)
    } catch {
      return undefined
    }
  }

  async deleteById(id: number): Promise<boolean> {
    try {
      await prisma.allowed.delete({ where: { id } })
      return true
    } catch {
      return false
    }
  }
}

const allowedRepository = new AllowedRepository()

export default allowedRepository
export { AllowedRepository }
