-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "clientCpfCnpj" TEXT;
