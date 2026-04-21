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
import allowedRepository from './src/db/repositories/allowed.js'
import allowed from './src/db/repositories/allowed.js'

const token = process.env.BOT_TOKEN
if (!token) {
  logger.error('Missing BOT_TOKEN')
  process.exit(1)
}

const bot = new Telegraf(token)
const botUtil = new TgBotUtil(bot)

type TelegramErr = { response?: { error_code?: number, [key: string]: any; } }

function isTelegramErr(e: unknown): e is TelegramErr {
  return typeof e === 'object' && e !== null && 'response' in e
}

const handleStart = async (ctx: Context) => {
  if (!ctx.chat) return

  // const { success: isGroup } = await botUtil.isGroup(ctx)
  // if (!isGroup) return
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return

  try {
    const chats = await chatsRepository.list()
    if (chats && chats.length > 0) return
    
    await chatsRepository.create({
      chatId: ctx.chat.id,
      chatName: ctx.chat.title,
    })
    void ctx.reply('欢迎使用抢名额Bot')
  } catch (e: unknown) {
    logger.error(e)
    await botUtil.safeAnswerCb(ctx, '启动失败', true)
  }
}

const handleCreate = async (ctx: Context) => {
  try {
    if (!ctx.message) return
    if (!ctx.from) return
    if (!ctx.chat) return

    const { success: isGroup } = await botUtil.isGroup(ctx)
    if (isGroup) return

    const messageText: string = (('caption' in ctx.message ? ctx.message.caption : 'text' in ctx.message ? ctx.message.text : undefined) ?? '').trim()
    if (!messageText.startsWith('/create ')) return
    const [, countStr, ...msgArr] = messageText.split(' ')

    if (!countStr) return

    const count = parseInt(countStr, 10)
    const slotBody = msgArr.join(' ')

    const messageType: 'text' | 'photo' | 'video' = 'photo' in ctx.message && ctx.message.photo ? 'photo' : 'video' in ctx.message && ctx.message.video ? 'video' : 'text'
    
    const mediaId: string | undefined = 
      'photo' in ctx.message && ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1]!.file_id : 
        'video' in ctx.message && ctx.message.video ? ctx.message.video.file_id : 
          undefined

    const chat = await chatsRepository.getFirst()
    if (!chat) return

    const result = await botUtil.getOwnerUserId(chat.chatId)
    const { success: isOwner, data: ownerId } = result
    if (!isOwner || !ownerId) return

    const confirmMessage = `@${ctx.from.username ?? ctx.from.first_name + ctx.from.last_name} 想发起了一个活动：${slotBody}，名额数目为 ${count}，请确认是否允许。`
    const keyboard = Markup.inlineKeyboard([Markup.button.callback('确认', `confirm_create#${ctx.from.id}#${messageType}#${mediaId}#${count}#${slotBody}`), Markup.button.callback('拒绝', `reject_create#${ctx.from.id}`)])

    void botUtil.safeSendPrivate(ownerId, confirmMessage, messageType, mediaId, keyboard)
  } catch (e: unknown) {
    logger.error(e)
    await botUtil.safeAnswerCb(ctx, '创建活动失败', true)
  }
}

async function handleJoin(slotId: string, user?: Context['from']) {
  if (!user) return { success: false, msg: '无法识别用户', alert: true, error: new Error('User not found') }

  const slot = await slotsRepository.getById(slotId)
  if (!slot) return { success: false, msg: '活动不存在', alert: true, error: new Error('Slot not found') }

  const result = await joinedRepository.getByKey(slotId, user.id)
  if (result) return { success: true, msg: '你已经抢到名额了', alert: true }

  const limit = slot.limit as number
  const joinedCnt = await joinedRepository.countBySlotId(slotId)
  if (joinedCnt < limit) {
    const displayName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(' ')
    await joinedRepository.create({
      slotId,
      userId: user.id,
      username: user.username ?? null,
      name: displayName ?? null,
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

    const currentMessage = slot.message

    const joinedCnt = (await joinedRepository.listBySlotId(slotId)).length
    const remaining = slot.limit - joinedCnt
    const lines = slot.message.split('\n');
    const message = lines.length > 1 && lines[lines.length - 1]
      ? lines.slice(0, -1).join('\n')
      : lines.join('\n');
    const text = `${message}\n已获得名额：${joinedCnt}/${slot.limit}  剩余：${remaining}/${slot.limit}`

    if (currentMessage === text) {
      return { success: false, error: new Error('Message is the same') }
    }

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
    await slotsRepository.updateById(slotId, { message: text })
    return { success: true }
  } catch(e: unknown) {
    logger.error(e)
    return { success: false, error: e }
  }
}

async function handleAllowSlot(ctx: Context) {
  if (!ctx.message) return
  if (!ctx.from) return
  if (!ctx.chat) return

  try {
    const { success: isGroup } = await botUtil.isGroup(ctx)
    if (isGroup) return

    const chat = await chatsRepository.getFirst()
    if (!chat) return

    const { success: isAdmin } = await botUtil.isAdminInGroup(ctx, chat.chatId)
    if (!isAdmin) return

    const username = 'text' in ctx.message ? ctx.message.text.split(' ')[1] : undefined
    if (!username) {
      await ctx.reply('请输入要允许的用户名')
      return
    }

    const existed = await allowedRepository.getByUsername(username)
    if (existed && existed.isDeleted === 0) {
      await ctx.reply(`@${username} 已在白名单中`)
      return
    }

    if (existed) {
      await allowedRepository.updateById(existed.id, {
        isDeleted: 0,
        revokedAt: null,
      })
    } else {
      await allowedRepository.create({ username })
    }

    await ctx.reply(`已创建允许 @${username} 发起活动`)
  } catch (e: unknown) {
    logger.error(e)
    await botUtil.safeAnswerCb(ctx, '创建允许失败', true)
  }
}

bot.start(handleStart)

bot.command('create', handleCreate)
bot.on(messageFilter('photo'), handleCreate)
bot.on(messageFilter('video'), handleCreate)

// 授予发起活动权限
bot.command('allow_slot', handleAllowSlot)

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
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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
  } else if (typeof data === 'string' && data.startsWith('confirm_create#')) {
    const chat = await chatsRepository.getFirst()
    if (!chat) {
      logger.error('chat not found')
      await botUtil.safeAnswerCb(ctx, '该bot暂未加入任何群聊', false)
      return
    }
    const slotId = randomUUID()

    const keyboard = Markup.inlineKeyboard([Markup.button.callback('我要抢！', `join_${slotId}`)])

    const [, userId, messageType, mediaId, countStr, slotBody] = data.split('#')
    const count = parseInt(countStr, 10)

    const { success, data: message } = await botUtil.safeSendChat(chat.chatId, `${slotBody}\n剩余名额：${count}`, messageType as 'text' | 'photo' | 'video', mediaId, keyboard)
    if (!success || !message) {
      await botUtil.safeAnswerCb(ctx, '创建活动失败', true)
      await botUtil.safeSendPrivate(Number(userId), '活动创建失败', 'text')
      return
    }

    const slot = {
      id: slotId,
      chatId: chat.chatId,
      message: slotBody,
      limit: count,
      messageId: message.message_id,
      messageType: messageType,
    }
    
    await slotsRepository.create(slot)

    // await ctx.deleteMessage(ctx.message.message_id)

    void refreshSlotDisplay(slotId)

    await botUtil.safeAnswerCb(ctx, '活动创建成功', false)
    await botUtil.safeSendPrivate(Number(userId), '活动创建成功', 'text')
  } else if (typeof data === 'string' && data.startsWith('reject_create#')) {
    const [, userId] = data.split('#')
    await botUtil.safeAnswerCb(ctx, '该活动创建已被取消', false)
    await botUtil.safeSendPrivate(Number(userId), '该活动创建未通过群主审核', 'text')
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
