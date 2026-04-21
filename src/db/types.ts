/** 与原先 `db/class` 仓储对外形状一致，便于业务层少改字段名 */
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

export interface AllowedRow {
  id: number
  username: string
  createdAt: string
  revokedAt: string | null
  isDeleted: number
}

export interface CreateAllowed {
  username: string
  createdAt?: string
  revokedAt?: string | null
  isDeleted?: number
}

export interface UpdateAllowed {
  username?: string
  createdAt?: string
  revokedAt?: string | null
  isDeleted?: number
}
