/*
  黑名单表用于记录被禁止的用户。
  username: 用户名  string
  created_at: 创建时间  datetime
  revoked_at: 撤销时间  datetime
  feedback_result: 反馈结果  string
*/
CREATE TABLE IF NOT EXISTS blacklist (
  username TEXT NOT NULL PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  feedback_result TEXT
);

/*
  活动表用于记录活动信息。
  slotId: 活动ID  string
  chatId: 群ID  integer
  message: 活动消息  string
  limit: 名额限制  integer
  messageId: 消息ID  integer
  messageType: 消息类型  string
  finalSent: 是否已结束  integer
*/
CREATE TABLE IF NOT EXISTS slots (
  slotId TEXT NOT NULL PRIMARY KEY, 
  chatId INTEGER NOT NULL,
  message TEXT NOT NULL,
  "limit" INTEGER NOT NULL,
  messageId INTEGER NOT NULL,
  messageType TEXT NOT NULL,
  finalSent INTEGER NOT NULL DEFAULT 0
);

/* 
  群聊表用于记录加入过的群聊
  chatId: 群ID  integer
  chatName: 群名  string
  createdAt: 创建时间  datetime
  leftAt: 退出时间  datetime
*/
CREATE TABLE IF NOT EXISTS chats (
  chatId INTEGER NOT NULL PRIMARY KEY,
  chatName TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  leftAt TEXT
);

/* 
  活动加入表用于记录已加入某活动的用户
  slotId: 活动ID  string
  userId: 用户ID  integer
  username: 用户名  string
  name: 用户名  string
  createdAt: 创建时间  datetime
  revokedAt: 撤销时间  datetime
  PRIMARY KEY (slotId, userId)
*/
CREATE TABLE IF NOT EXISTS joined (
  slotId TEXT NOT NULL,
  userId INTEGER NOT NULL,
  username TEXT,
  name TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  revokedAt TEXT,
  PRIMARY KEY (slotId, userId)
);