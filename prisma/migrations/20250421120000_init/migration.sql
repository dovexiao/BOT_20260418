-- CreateTable
CREATE TABLE "blacklist" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "revoked_at" TEXT,
    "feedback_result" TEXT
);

-- CreateTable
CREATE TABLE "slots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "messageType" TEXT NOT NULL,
    "finalSent" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "chats" (
    "chatId" INTEGER NOT NULL PRIMARY KEY,
    "chatName" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "leftAt" TEXT
);

-- CreateTable
CREATE TABLE "joined" (
    "slotId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "revokedAt" TEXT,

    PRIMARY KEY ("slotId", "userId")
);
