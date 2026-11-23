-- CreateEnum
CREATE TYPE "DraftContext" AS ENUM ('SITE', 'ADMIN');

-- CreateTable
CREATE TABLE "QuoteDraft" (
    "id" TEXT NOT NULL,
    "context" "DraftContext" NOT NULL,
    "userId" TEXT,
    "clientLoginId" TEXT,
    "isAutosave" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "data" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedTotal" DOUBLE PRECISION,
    "clientLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteDraft_userId_context_idx" ON "QuoteDraft"("userId", "context");

-- CreateIndex
CREATE INDEX "QuoteDraft_clientLoginId_context_idx" ON "QuoteDraft"("clientLoginId", "context");

-- AddForeignKey
ALTER TABLE "QuoteDraft" ADD CONSTRAINT "QuoteDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDraft" ADD CONSTRAINT "QuoteDraft_clientLoginId_fkey" FOREIGN KEY ("clientLoginId") REFERENCES "ClientLogin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

