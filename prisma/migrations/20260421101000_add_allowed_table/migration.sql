-- CreateTable
CREATE TABLE "allowed" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "revokedAt" TEXT,
    "isDeleted" INTEGER NOT NULL DEFAULT 0
);
