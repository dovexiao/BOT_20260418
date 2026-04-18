require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const { createSlot, joinSlot, confirmSlot, declineSlot, cancelSlot, getSlot, listJoined, listWaiting, setMessageInfo, markFinalSent } = require('./slotManager')
const { message } = require('telegraf/filters')

// 在顶部引入 express
const express = require('express')

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start((ctx) => ctx.reply('欢迎使用抢名额Bot'))

// 尝试私聊发送，如被阻止则在群内回复@用户
async function safeSendPrivate(ctx, userId, text, keyboard) {
  try {
    const msg = await ctx.telegram.sendMessage(userId, text, keyboard)
    return msg
  } catch (e) {
    if (e.response && e.response.error_code === 403) {
      // 无法私聊，通知群聊
      const mention = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from.first_name}`
      return await ctx.reply(`${mention} ${text}\n请先私聊启动机器人。`, keyboard)
    } else {
      console.error(e)
    }
  }
}

// 安全地回答 callbackQuery，防止 "query is too old" 报错
async function safeAnswerCb(ctx, text, alert = false) {
  try {
    await ctx.answerCbQuery(text, { show_alert: alert })
  } catch (e) {
    if (!(e.response && e.response.error_code === 400)) {
      console.error(e)
    }
  }
}

// 安全地修改消息键盘，忽略 “message is not modified”
async function safeEditReplyMarkup(ctx, markup) {
  try {
    await ctx.editMessageReplyMarkup(markup)
  } catch (e) {
    if (!(e.response?.error_code === 400)) {
      console.error(e)
    }
  }
}

// 检查群成员是否为管理员/群主
async function isAdmin(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id)
    return ['administrator', 'creator'].includes(member.status)
  } catch {
    return false
  }
}


const handleCreateSlot = async (ctx) => {
  // 统一取得指令全文（文字或 caption）
  const rawText = (ctx.message.caption || ctx.message.text || '').trim()
  // 只处理 /create 或旧版 /create_quota 指令
  if (!(rawText.startsWith('/create ') || rawText.startsWith('/create_quota'))) return

  // 仅允许管理员执行指令
  if (!(await isAdmin(ctx))) {
    return ctx.reply('只有群管理员才能使用此指令')
  }

  const parts = rawText.split(' ')
  const [, countStr, ...msgArr] = parts
  const count = parseInt(countStr)
  const message = msgArr.join(' ')
  const slotId = await createSlot(ctx.chat.id, message, count)

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('我要抢！', `join_${slotId}`)
  ])

  if (ctx.message.photo) {
    const photos = ctx.message.photo
    const mediaId = photos[photos.length - 1].file_id
    const sent = await ctx.replyWithPhoto(mediaId, {
      caption: `${message}\n剩余名额：${count}`,
      reply_markup: keyboard.reply_markup
    })
    // 保存信息
    setMessageInfo(slotId, sent.message_id, 'photo')
  } else if (ctx.message.video) {
    const mediaId = ctx.message.video.file_id
    const sent = await ctx.replyWithVideo(mediaId, {
      caption: `${message}\n剩余名额：${count}`,
      reply_markup: keyboard.reply_markup
    })
    setMessageInfo(slotId, sent.message_id, 'video')
  } else {
    const sent = await ctx.reply(`${message}\n剩余名额：${count}`, keyboard)
    setMessageInfo(slotId, sent.message_id, 'text')
  }

  // 初始显示完善数字
  refreshSlotDisplay(slotId)

  // 删除原始 /create 指令消息（若权限允许）
  try {
    await ctx.deleteMessage(ctx.message.message_id)
  } catch (e) {
    // ignore insufficient rights
  }
}

// ——— 注册监听 ———
// 文字指令
bot.command('create', handleCreateSlot)          // 新简化指令
bot.command('create_quota', handleCreateSlot)    // 兼容旧指令
// 媒体指令：支持 photo / video（含相册的首条带 caption 消息）
bot.on(message('photo'), handleCreateSlot)
bot.on(message('video'), handleCreateSlot)
// ... existing code ...

// 更新群内 slot 消息展示
async function refreshSlotDisplay(slotId) {
  const slot = getSlot(slotId)
  if (!slot || !slot.messageId) return

  const joined = listJoined(slotId)
  const waiting = listWaiting(slotId)
  const remaining = slot.limit - joined.length
  const text = `${slot.message}\n已获得名额：${joined.length}/${slot.limit}  剩余：${remaining}  候补：${waiting.length}`

  const joinKb = Markup.inlineKeyboard([
    Markup.button.callback('我要抢！', `join_${slotId}`)
  ])

  try {
    if (slot.messageType === 'photo' || slot.messageType === 'video') {
      await bot.telegram.editMessageCaption(slot.chatId, slot.messageId, undefined, text, { reply_markup: joinKb.reply_markup })
    } else {
      await bot.telegram.editMessageText(slot.chatId, slot.messageId, undefined, text, { reply_markup: joinKb.reply_markup })
    }
  } catch(e) {
    // ignore edit errors (e.g., no change or message not modified)
  }
}


bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data
  if (data.startsWith('join_')) {
    const slotId = data.split('_')[1]
    const result = await joinSlot(slotId, ctx.from)
    await safeAnswerCb(ctx, result.msg, result.alert)

    // 直接确认，无需额外操作
    if (result.success) {
      refreshSlotDisplay(slotId)
      
      // 检查是否需要发送最终名单
      const slotFinal = getSlot(slotId)
      const joinedFinal = listJoined(slotId)
      if (slotFinal && !slotFinal.finalSent && joinedFinal.length === slotFinal.limit) {
        const list = joinedFinal.map((u,i)=>{
          const namePart = u.name ? `${u.name} ` : ''
          const mention = u.username ? `@${u.username}` : `tg://user?id=${u.userId}`
          return `${i+1}. ${namePart}${mention}`
        }).join('\n')
        await bot.telegram.sendMessage(slotFinal.chatId, `全部 ${slotFinal.limit} 个名额已满！名单如下：\n${list}`)
        markFinalSent(slotId)
      }
    }
  }

  // 简化后不再处理确认和放弃按钮
})

bot.command('cancel_slot', async (ctx) => {
  if (!(await isAdmin(ctx))) return ctx.reply('只有群管理员才能使用此指令')
  const username = ctx.message.text.split(' ')[1]
  const result = await cancelSlot(username)
  ctx.reply(result.msg)
})


bot.launch({ dropPendingUpdates: true })

// ——— Render 免费 Web Service 保活 ———
const PORT = process.env.PORT || 3000
const app = express()
app.get('/', (req, res) => res.send('ok'))
app.listen(PORT, () => console.log(`HTTP server listening on ${PORT}`))
