import dotenv from 'dotenv'
dotenv.config()
import { Telegraf, Markup } from 'telegraf'
import type { Context } from 'telegraf'
import { message as messageFilter } from 'telegraf/filters'
import logger from './src/utils/logger.js'
import TgBotUtil from './src/utils/tgbot.js'
import express from 'express'
import { randomUUID } from 'node:crypto'
import slotsRepository from './src/db/repositories/slots.js'
import chatsRepository from './src/db/repositories/chats.js'
import joinedRepository from './src/db/repositories/joined.js'

const token = process.env.BOT_TOKEN
if (!token) {
  logger.error('Missing BOT_TOKEN')
  process.exit(1)
}

const bot = new Telegraf(token)
const botUtil = new TgBotUtil(bot)

bot.start(async (ctx) => {
  if (!ctx.chat) return
  if (ctx.chat.type === 'private') return
  const chat = await chatsRepository.getByChatId(ctx.chat.id)
  if (chat) return
  await chatsRepository.create({
    chatId: ctx.chat.id,
    chatName: ctx.chat.title,
  })
  void ctx.reply('欢迎使用抢名额Bot')
})

type TelegramErr = { response?: { error_code?: number, [key: string]: any; } }

function isTelegramErr(e: unknown): e is TelegramErr {
  return typeof e === 'object' && e !== null && 'response' in e
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

  // const result = await botUtil.isAdmin(ctx)
  // if (!result.success) {
  //   return ctx.reply(`@${ctx.from.username ?? ctx.from.first_name} ` + '只有群管理员才能使用此指令')
  // }

  const chat = await chatsRepository.getFirst()
  if (!chat) {
    logger.error('chat not found')
    await botUtil.safeAnswerCb(ctx, '该bot暂未加入任何群聊', true)
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

    const { success, data } = await botUtil.safeSendChat(chat.chatId, `${slotBody}\n剩余名额：${count}`, messageType, mediaId, keyboard)
    if (!success || !data) {
      await botUtil.safeAnswerCb(ctx, '创建活动失败', true)
      return
    }

    const slot = {
      id: slotId,
      chatId: chat.chatId,
      message: slotBody,
      limit: count,
      messageId: data.message_id,
      messageType: messageType,
    }
    // logger.info('slot', slot)
    await slotsRepository.create(slot)

    // await ctx.deleteMessage(ctx.message.message_id)

    void refreshSlotDisplay(slotId)
  } catch (e: unknown) {
    logger.error(e)
    await botUtil.safeAnswerCb(ctx, '创建活动失败', true)
  }
}

bot.command('create', handleCreate)
bot.on(messageFilter('photo'), handleCreate)
bot.on(messageFilter('video'), handleCreate)

async function handleJoin(slotId: string, user?: Context['from']) {
  if (!user) return { success: false, msg: '无法识别用户', alert: true, error: new Error('User not found') }

  const slot = await slotsRepository.getById(slotId)
  if (!slot) return { success: false, msg: '活动不存在', alert: true, error: new Error('Slot not found') }

  const result = await joinedRepository.getByKey(slotId, user.id)
  if (result) return { success: true, msg: '你已经抢到名额了', alert: true }

  const limit = slot.limit as number
  const joinedCnt = await joinedRepository.countBySlotId(slotId)
  if (joinedCnt < limit) {
    await joinedRepository.create({
      slotId,
      userId: user.id,
      username: user.username ?? null,
      name: user.first_name ?? null,
    })
    await slotsRepository.updateById(slotId, { finalSent: 0 })
    return { success: true, msg: '恭喜！抢到名额了', alert: false }
  }

  return { success: false, msg: '名额已满，抢不了了～', alert: true }
}

async function refreshSlotDisplay(slotId: string): Promise<{ success: boolean; error?: unknown }> {
  try {
    const slot = await slotsRepository.getById(slotId)
    if (!slot) return { success: false, error: new Error('Slot not found') }
  
    const joinedCnt = (await joinedRepository.listBySlotId(slotId)).length
    const remaining = slot.limit - joinedCnt
    const text = `${slot.message}\n已获得名额：${joinedCnt}/${slot.limit}  剩余：${remaining}/${slot.limit}`
  
    const joinKb = Markup.inlineKeyboard([Markup.button.callback('我要抢！', `join_${slotId}`)])
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
      await botUtil.safeAnswerCb(ctx, '无法识别用户', true)
      return
    }
    const result = await handleJoin(slotId, ctx.from)
    await botUtil.safeAnswerCb(ctx, result.msg, result.alert)

    if ('success' in result && result.success) {
      void refreshSlotDisplay(slotId)

      const slotFinal = await slotsRepository.getById(slotId)
      const joinedFinal = await joinedRepository.listBySlotId(slotId)
      if (slotFinal && !slotFinal.finalSent && joinedFinal.length === slotFinal.limit) {
        const list = joinedFinal
          .map((u, i) => {
            const namePart = u.name ? `${u.name} ` : ''
            const mention = u.username ? `@${u.username}` : `tg://user?id=${u.userId}`
            return `${i + 1}. ${namePart}${mention}`
          })
          .join('\n')
        await bot.telegram.sendMessage(slotFinal.chatId, `全部 ${slotFinal.limit} 个名额已满！名单如下：\n${list}`)
        await slotsRepository.updateById(slotId, { finalSent: 1 })
      }
    }
  }
})

// bot.command('cancel_slot', async (ctx) => {
//   const { success } = await botUtil.isAdmin(ctx)
//   if (!success) {
//     await botUtil.safeAnswerCb(ctx, '只有群管理员才能使用此指令', true)
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
