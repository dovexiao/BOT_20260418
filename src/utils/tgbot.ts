import type { Context, Telegraf, Types } from 'telegraf'
import type { Message } from 'telegraf/types'
import chatsRepository from '../db/repositories/chats.js'
import logger from './logger.js'

class TgBotUtil {
  constructor(private readonly bot: Telegraf) {}

  /**
   * 尝试向用户私聊发送消息。
   */
  async safeSendPrivate(
    ctx: Context,
    userId: number,
    text: string,
    extra?: Types.ExtraReplyMessage
  ): Promise<{ success: boolean; data?: Message.TextMessage; error?: unknown }> {
    try {
      const result = await ctx.telegram.sendMessage(userId, text, extra)
      return { success: true, data: result }
    } catch (e: unknown) {
      logger.error(e)
      return { success: false, error: e }
    }
  }

  /**
   * 若群聊已登记则向该聊天发送文本/图片/视频消息。
   */
  async safeSendChat(
    ctxId: number,
    text: string,
    type: 'text' | 'photo' | 'video',
    mediaId?: string,
    extra?: Types.ExtraReplyMessage
  ): Promise<{
    success: boolean
    data?: Message.TextMessage | Message.PhotoMessage | Message.VideoMessage
    error?: unknown
  }> {
    try {
      const chatJoined = await chatsRepository.getByChatId(ctxId)
      if (!chatJoined) return { success: false, error: new Error('Chat joined not found') }
      const chat = await this.bot.telegram.getChat(ctxId)
      if (!chat) return { success: false, error: new Error('Chat not found') }

      let sent: Message.TextMessage | Message.PhotoMessage | Message.VideoMessage | undefined
      if (type === 'text') {
        sent = await this.bot.telegram.sendMessage(ctxId, text, extra)
        return { success: true, data: sent }
      } else if (type === 'photo' && mediaId) {
        sent = await this.bot.telegram.sendPhoto(ctxId, mediaId, {
          caption: text,
          reply_markup: extra?.reply_markup,
        })
        return { success: true, data: sent }
      } else if (type === 'video' && mediaId) {
        sent = await this.bot.telegram.sendVideo(ctxId, mediaId, {
          caption: text,
          reply_markup: extra?.reply_markup,
        })
        return { success: true, data: sent }
      }
      return { success: false, error: new Error('Invalid message type') }
    } catch (e: unknown) {
      logger.error(e)
      return { success: false, error: e }
    }
  }

  /**
   * 安全地回答回调查询。
   */
  async safeAnswerCb(
    ctx: Context,
    text: string,
    alert = false,
    cache_time?: number
  ): Promise<{ success: boolean; error?: unknown }> {
    try {
      await ctx.answerCbQuery(text, { show_alert: alert, cache_time })
      return { success: true }
    } catch (e: unknown) {
      logger.error(e)
      return { success: false, error: e }
    }
  }

  /**
   * 判断当前用户是否为群管理员或创建者。
   */
  async isAdmin(ctx: Context): Promise<{ success: boolean; data?: boolean; error?: unknown }> {
    try {
      if (!ctx.chat) return { success: false, error: new Error('Chat not found') }
      if (ctx.chat.type === 'private') return { success: false, error: new Error('Chat is private') }
      if (!ctx.from) return { success: false, error: new Error('User not found') }

      const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id)
      return { success: true, data: member.status === 'administrator' || member.status === 'creator' }
    } catch (e: unknown) {
      logger.error(e)
      return { success: false, error: e }
    }
  }
}

export default TgBotUtil