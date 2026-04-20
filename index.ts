import dotenv from 'dotenv'
dotenv.config()
import { Telegraf, Markup } from 'telegraf'
import type { Context, Types } from 'telegraf'
import type { Message } from 'telegraf/types'
import { message as messageFilter } from 'telegraf/filters'
import logger from './utils/logger.js'
import express from 'express'
import { randomUUID } from 'node:crypto'
import slotsRepository from './db/class/slots.js'
import chatsRepository from './db/class/chats.js'
import joinedRepository from './db/class/joined.js'

const token = process.env.BOT_TOKEN
if (!token) {
  logger.error('Missing BOT_TOKEN')
  process.exit(1)
}

const bot = new Telegraf(token)

bot.start((ctx) => {
  if (!ctx.chat) return
  if (ctx.chat.type === 'private') return
  const chat = chatsRepository.getByChatId(ctx.chat.id)
  if (chat) return
  chatsRepository.create({
    chatId: ctx.chat.id,
    chatName: ctx.chat.title,
  })
  ctx.reply('欢迎使用抢名额Bot')
})

type TelegramErr = { response?: { error_code?: number, [key: string]: any; } }

function isTelegramErr(e: unknown): e is TelegramErr {
  return typeof e === 'object' && e !== null && 'response' in e
}

/**
 * 
 * @param ctx - The context object
 * @param userId - The user ID to send the message to
 * @param text - The text of the message
 * @param extra - The extra options for the message
 * @returns { success: boolean; data?: Message.TextMessage; error?: unknown }
 * @description - Try to send a message to a user in private chat.
 * @example
 * const result = await safeSendPrivate(ctx, userId, 'Hello, world!')
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.error)
 * }
 */
async function safeSendPrivate(
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
 * 
 * @param ctxId - The context ID to send the message to
 * @param text - The text of the message
 * @returns { success: boolean; error?: unknown }
 * @description - Send a message to a chat if it exists
 * @example
 * const result = await safeSendChat(ctxId, 'Hello, world!')
 * if (result.success) {
 *   console.log('Chat sent successfully')
 * } else {
 *   console.error(result.error)
 * }
 */
async function safeSendChat(
  ctxId: number, 
  text: string,
  type: 'text' | 'photo' | 'video',
  mediaId?: string,
  extra?: Types.ExtraReplyMessage
): Promise<{ success: boolean; data?: Message.TextMessage | Message.PhotoMessage | Message.VideoMessage; error?: unknown }> {
  try {
    const chatJoined = chatsRepository.getByChatId(ctxId)
    if (!chatJoined) return { success: false, error: new Error('Chat joined not found') }
    const chat = await bot.telegram.getChat(ctxId)
    if (!chat) return { success: false, error: new Error('Chat not found') }

    let sent: Message.TextMessage | Message.PhotoMessage | Message.VideoMessage | undefined
    if (type === 'text') {
      sent = await bot.telegram.sendMessage(ctxId, text, extra)
    } else if (type === 'photo' && mediaId) {
      sent = await bot.telegram.sendPhoto(ctxId, mediaId, {
        caption: text,
        reply_markup: extra?.reply_markup,
      })
    } else if (type === 'video' && mediaId) {
      sent = await bot.telegram.sendVideo(ctxId, mediaId, {
        caption: text,
        reply_markup: extra?.reply_markup,
      })
    }
    return { success: true, data: sent }
  } catch (e: unknown) {
    logger.error(e)
    return { success: false, error: e }
  }
}

/**
 * 
 * @param ctx - The context object
 * @param text - The text of the message
 * @param alert - Whether to show an alert
 * @param cache_time - The cache time for the callback query
 * @returns { success: boolean; error?: unknown }
 * @description - Answer a callback query safely
 * @example
 * const result = await safeAnswerCb(ctx, 'Hello, world!', true, 1000)
 * if (result.success) {
 *   console.log('Callback query answered successfully')
 * } else {
 *   console.error(result.error)
 * }
 */
async function safeAnswerCb(ctx: Context, text: string, alert = false, cache_time?: number): Promise<{ success: boolean; error?: unknown }> {
  try {
    await ctx.answerCbQuery(text, { show_alert: alert, cache_time })
    return { success: true }
  } catch (e: unknown) {
    logger.error(e)
    return { success: false, error: e }
  }
}

/**
 * 
 * @param ctx - The context object
 * @returns { success: boolean; data?: boolean; error?: unknown }
 * @description - Check if the user is an administrator/creator of the chat
 * @example
 * const result = await isAdmin(ctx)
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.error)
 * }
 */
async function isAdmin(ctx: Context): Promise<{ success: boolean; data?: boolean; error?: unknown }> {
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

const handleCreate = async (ctx: Context) => {
  if (!ctx.message) return
  if (!ctx.from) return
  if (!ctx.chat) return

  const rawText = ('caption' in ctx.message ? ctx.message.caption : undefined) || ('text' in ctx.message ? ctx.message.text : '') || ''
  const trimmed = rawText.trim()
  if (!trimmed.startsWith('/create ')) return

  const parts = trimmed.split(' ')
  const [, countStr, ...msgArr] = parts

  if (!countStr) return

  const count = parseInt(countStr, 10)
  const slotBody = msgArr.join(' ')

  // const result = await isAdmin(ctx)
  // if (!result.success) {
  //   return ctx.reply(`@${ctx.from.username ?? ctx.from.first_name} ` + '只有群管理员才能使用此指令')
  // }

  const chat = chatsRepository.getFirst()
  if (!chat) {
    logger.error('chat not found')
    await safeAnswerCb(ctx, '该bot暂未加入任何群聊', true)
    return
  }

  try {
    const slotId = randomUUID()

    const keyboard = Markup.inlineKeyboard([Markup.button.callback('我要抢！', `join_${slotId}`)])

    const messageType: 'text' | 'photo' | 'video' = 'photo' in ctx.message && ctx.message.photo ? 'photo' : 'video' in ctx.message && ctx.message.video ? 'video' : 'text'
    const mediaId: string | undefined = 
      'photo' in ctx.message && ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1]!.file_id : 
        'video' in ctx.message && ctx.message.video ? ctx.message.video.file_id : 
          undefined

    const { success, data } = await safeSendChat(chat.chatId, `${slotBody}\n剩余名额：${count}`, messageType, mediaId, keyboard)
    if (!success || !data) {
      await safeAnswerCb(ctx, '创建活动失败', true)
      return
    }
    slotsRepository.create({
      id: slotId,
      chatId: ctx.chat.id,
      message: slotBody,
      limit: count,
      messageId: data.message_id,
      messageType: 'photo',
    })

    await ctx.deleteMessage(ctx.message.message_id)

    void refreshSlotDisplay(slotId)
  } catch (e: unknown) {
    logger.error(e)
    await safeAnswerCb(ctx, '创建活动失败', true)
  }
}

bot.command('create', handleCreate)
bot.on(messageFilter('photo'), handleCreate)
bot.on(messageFilter('video'), handleCreate)

async function handleJoin(slotId: string, user?: Context['from']) {
  if (!user) return { success: false, msg: '无法识别用户', alert: true, error: new Error('User not found') }

  const slot = slotsRepository.getById(slotId)
  if (!slot) return { success: false, msg: '活动不存在', alert: true, error: new Error('Slot not found') }

  const result = joinedRepository.getByKey(slotId, user.id)
  if (result) return { success: true, msg: '你已经抢到名额了', alert: true }

  const limit = slot.limit as number
  const joinedCnt = joinedRepository.countBySlotId(slotId)
  if (joinedCnt < limit) {
    joinedRepository.create({
      slotId,
      userId: user.id,
      username: user.username ?? null,
      name: user.first_name ?? null,
    })
    slotsRepository.updateById(slotId, { finalSent: 0 })
    return { success: true, msg: '恭喜！抢到名额了', alert: false }
  }

  return { success: false, msg: '名额已满，抢不了了～', alert: true }
}

async function refreshSlotDisplay(slotId: string): Promise<{ success: boolean; error?: unknown }> {
  const slot = slotsRepository.getById(slotId)
  if (!slot) return { success: false, error: new Error('Slot not found') }

  const joinedCnt = joinedRepository.listBySlotId(slotId).length
  const remaining = slot.limit - joinedCnt
  const text = `${slot.message}\n已获得名额：${joinedCnt}/${slot.limit}  剩余：${remaining}`

  const joinKb = Markup.inlineKeyboard([Markup.button.callback('我要抢！', `join_${slotId}`)])

  try {
    if (slot.messageType === 'photo' || slot.messageType === 'video') {
      await bot.telegram.editMessageCaption(slot.chatId, slot.messageId, undefined, text, {
        reply_markup: joinKb.reply_markup,
      })
    } else {
      await bot.telegram.editMessageText(slot.chatId, slot.messageId, undefined, text, {
        reply_markup: joinKb.reply_markup,
      })
    }
    return { success: true }
  } catch(e: unknown) {
    logger.error(e)
    return { success: false, error: e }
  }
}

bot.on('callback_query', async (ctx: Context) => {
  const cq = ctx.callbackQuery
  const data = cq && 'data' in cq && cq.data ? cq.data : undefined
  if (typeof data === 'string' && data.startsWith('join_')) {
    const slotId = data.split('_')[1]!
    if (!ctx.from) {
      await safeAnswerCb(ctx, '无法识别用户', true)
      return
    }
    const result = await handleJoin(slotId, ctx.from)
    await safeAnswerCb(ctx, result.msg, result.alert)

    if ('success' in result && result.success) {
      void refreshSlotDisplay(slotId)

      const slotFinal = slotsRepository.getById(slotId)
      const joinedFinal = joinedRepository.listBySlotId(slotId)
      if (slotFinal && !slotFinal.finalSent && joinedFinal.length === slotFinal.limit) {
        const list = joinedFinal
          .map((u, i) => {
            const namePart = u.name ? `${u.name} ` : ''
            const mention = u.username ? `@${u.username}` : `tg://user?id=${u.userId}`
            return `${i + 1}. ${namePart}${mention}`
          })
          .join('\n')
        await bot.telegram.sendMessage(slotFinal.chatId, `全部 ${slotFinal.limit} 个名额已满！名单如下：\n${list}`)
        slotsRepository.updateById(slotId, { finalSent: 1 })
      }
    }
  }
})

// bot.command('cancel_slot', async (ctx) => {
//   const { success } = await isAdmin(ctx)
//   if (!success) {
//     await safeAnswerCb(ctx, '只有群管理员才能使用此指令', true)
//     return
//   }
//   const username = ctx.message && 'text' in ctx.message ? ctx.message.text.split(' ')[1] : undefined
//   const result = await cancelSlot(username)
//   await ctx.reply(result.msg)
// })

bot.launch({ dropPendingUpdates: true })

const PORT = process.env.PORT || 3000
const app = express()
app.get('/', (_req, res) => res.send('ok'))
app.listen(PORT, () => console.log(`HTTP server listening on ${PORT}`))
