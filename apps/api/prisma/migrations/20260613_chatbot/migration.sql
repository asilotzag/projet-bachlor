-- CreateTable: ChatbotConversation
CREATE TABLE IF NOT EXISTS "ChatbotConversation" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "title"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatbotConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChatbotMessage
CREATE TABLE IF NOT EXISTS "ChatbotMessage" (
  "id"             TEXT         NOT NULL,
  "conversationId" TEXT         NOT NULL,
  "role"           TEXT         NOT NULL,
  "content"        TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatbotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatbotConversation_userId_idx" ON "ChatbotConversation"("userId");
CREATE INDEX IF NOT EXISTS "ChatbotMessage_conversationId_idx" ON "ChatbotMessage"("conversationId");

-- AddForeignKey: ChatbotConversation → User
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatbotConversation_userId_fkey') THEN
    ALTER TABLE "ChatbotConversation"
      ADD CONSTRAINT "ChatbotConversation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: ChatbotMessage → ChatbotConversation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatbotMessage_conversationId_fkey') THEN
    ALTER TABLE "ChatbotMessage"
      ADD CONSTRAINT "ChatbotMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "ChatbotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
