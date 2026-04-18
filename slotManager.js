/* SQLite 版本的 slotManager */
const Database = require('better-sqlite3')
const { randomUUID } = require('crypto')
const db = new Database('slot.db')

// 初始化表和数据迁移
try {
  // 检查是否存在旧的joined表结构
  const tableInfo = db.prepare("PRAGMA table_info(joined)").all()
  const hasConfirmedColumn = tableInfo.some(col => col.name === 'confirmed')
  
  if (hasConfirmedColumn) {
    console.log('检测到旧数据库结构，开始迁移...')
    
    // 重建joined表，移除confirmed和expiry_time列
    db.exec(`
      CREATE TABLE joined_new (
        slotId TEXT,
        userId INTEGER,
        username TEXT,
        name TEXT,
        PRIMARY KEY (slotId, userId)
      );
      
      INSERT INTO joined_new (slotId, userId, username, name)
      SELECT slotId, userId, username, name FROM joined;
      
      DROP TABLE joined;
      ALTER TABLE joined_new RENAME TO joined;
    `)
    
    console.log('数据库迁移完成！')
  } else {
    // 正常创建表结构
    db.exec(`
      CREATE TABLE IF NOT EXISTS joined (
        slotId TEXT,
        userId INTEGER,
        username TEXT,
        name TEXT,
        PRIMARY KEY (slotId, userId)
      );
    `)
  }
  
  // 创建其他表
  db.exec(`
    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      chatId INTEGER,
      message TEXT,
      "limit" INTEGER,
      messageId INTEGER,
      messageType TEXT,
      finalSent INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS waiting (
      slotId TEXT,
      userId INTEGER,
      username TEXT,
      name TEXT,
      pos INTEGER,
      PRIMARY KEY (slotId, userId)
    );
  `)
  
} catch (error) {
  console.error('数据库初始化失败:', error)
}

function fullName(u){
  return [u.first_name,u.last_name].filter(Boolean).join(' ')
}

function getSlot(id){
  return db.prepare('SELECT * FROM slots WHERE id=?').get(id)
}

function listJoined(slotId){
  return db.prepare('SELECT * FROM joined WHERE slotId=?').all(slotId)
}
function listWaiting(slotId){
  return db.prepare('SELECT * FROM waiting WHERE slotId=? ORDER BY pos').all(slotId)
}

function createSlot(chatId,message,limit){
  const id=randomUUID()
  db.prepare('INSERT INTO slots(id,chatId,message,"limit") VALUES (?,?,?,?)')
    .run(id,chatId,message,limit)
  pruneOldSlots()
  return id
}

// 仅保留最近 3 条活动记录及其子表数据
function pruneOldSlots(){
  const old = db.prepare('SELECT id FROM slots WHERE id NOT IN (SELECT id FROM slots ORDER BY rowid DESC LIMIT 3)').all()
  old.forEach(o=>{
    db.prepare('DELETE FROM joined WHERE slotId=?').run(o.id)
    db.prepare('DELETE FROM waiting WHERE slotId=?').run(o.id)
    db.prepare('DELETE FROM slots WHERE id=?').run(o.id)
  })
}

function joinSlot(slotId,user){
  const slot=getSlot(slotId)
  if(!slot) return {msg:'活动不存在',alert:true}
  
  if(db.prepare('SELECT 1 FROM joined WHERE slotId=? AND userId=?').get(slotId,user.id))
    return{msg:'你已经抢到名额了',alert:true}
  if(db.prepare('SELECT 1 FROM waiting WHERE slotId=? AND userId=?').get(slotId,user.id))
    return{msg:'你已在候补队列中',alert:true}

  const joinedCnt=db.prepare('SELECT count(*) AS c FROM joined WHERE slotId=?').get(slotId).c
  if(joinedCnt<slot.limit){
    db.prepare('INSERT INTO joined VALUES (?,?,?,?)')
      .run(slotId,user.id,user.username,fullName(user))
    db.prepare('UPDATE slots SET finalSent=0 WHERE id=?').run(slotId)
    return {msg:'恭喜！抢到名额了',alert:false,success:true}
  }
  const waitCnt=db.prepare('SELECT count(*) AS c FROM waiting WHERE slotId=?').get(slotId).c
  if(waitCnt>=slot.limit)
    return{msg:'名额和候补都满了，抢不了了～',alert:true}

  db.prepare('INSERT INTO waiting VALUES (?,?,?,?,?)')
    .run(slotId,user.id,user.username,fullName(user),waitCnt+1)
  return{msg:'名额已满，你已进入候补队列',alert:true}
}

function confirmSlot(slotId,userId){
  // 简化后的确认函数，直接返回成功（因为加入时已经确认）
  const exists = db.prepare('SELECT 1 FROM joined WHERE slotId=? AND userId=?').get(slotId,userId)
  return exists ? {ok:true,msg:'名额已确认'} : {ok:false,msg:'未找到该名额'}
}

function declineSlot(slotId,userId){
  const deleteRes=db.prepare('DELETE FROM joined WHERE slotId=? AND userId=?').run(slotId,userId)
  if(!deleteRes.changes) return {ok:false,msg:'未找到该名额'}

  const next=db.prepare('SELECT * FROM waiting WHERE slotId=? ORDER BY pos LIMIT 1').get(slotId)
  let nextUser=null
  if(next){
    db.prepare('DELETE FROM waiting WHERE slotId=? AND userId=?').run(slotId,next.userId)
    db.prepare('INSERT INTO joined VALUES (?,?,?,?)').run(slotId,next.userId,next.username,next.name)
    db.prepare('UPDATE slots SET finalSent=0 WHERE id=?').run(slotId)
    const rest=db.prepare('SELECT rowid,* FROM waiting WHERE slotId=? ORDER BY pos').all(slotId)
    rest.forEach((w,idx)=>db.prepare('UPDATE waiting SET pos=? WHERE rowid=?').run(idx+1,w.rowid))
    nextUser={ id:next.userId, username:next.username, name:next.name }
  }
  return{ok:true,msg:'已放弃名额',nextUser}
}

function cancelSlot(username){
  const joined=db.prepare('SELECT * FROM joined WHERE username=?').get(username)
  if(!joined) return{msg:'未找到该用户的名额记录'}
  return declineSlot(joined.slotId,joined.userId)
}

function setMessageInfo(slotId,messageId,type){
  db.prepare('UPDATE slots SET messageId=?,messageType=? WHERE id=?')
    .run(messageId,type,slotId)
}

function markFinalSent(slotId){
  db.prepare('UPDATE slots SET finalSent=1 WHERE id=?').run(slotId)
}


module.exports={createSlot,joinSlot,confirmSlot,declineSlot,cancelSlot,getSlot,listJoined,listWaiting,setMessageInfo,markFinalSent} 