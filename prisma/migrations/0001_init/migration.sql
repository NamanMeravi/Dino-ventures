-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TOPUP', 'BONUS', 'SPEND');

-- CreateEnum  
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable: AssetType
CREATE TABLE "AssetType" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "symbol"      TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetType_name_key"   ON "AssetType"("name");
CREATE UNIQUE INDEX "AssetType_symbol_key" ON "AssetType"("symbol");

-- CreateTable: User
CREATE TABLE "User" (
    "id"        TEXT NOT NULL,
    "username"  TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "isSystem"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key"    ON "User"("email");

-- CreateTable: Wallet
CREATE TABLE "Wallet" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_userId_assetTypeId_key" ON "Wallet"("userId", "assetTypeId");

-- CreateTable: Transaction
CREATE TABLE "Transaction" (
    "id"          TEXT NOT NULL,
    "type"        "TransactionType" NOT NULL,
    "status"      "TxStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LedgerEntry (double-entry)
CREATE TABLE "LedgerEntry" (
    "id"              TEXT NOT NULL,
    "transactionId"   TEXT NOT NULL,
    "assetTypeId"     TEXT NOT NULL,
    "debitWalletId"   TEXT NOT NULL,
    "creditWalletId"  TEXT NOT NULL,
    "amount"          DECIMAL(20,4) NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "description"     TEXT,
    "idempotencyKey"  TEXT,
    "metadata"        JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- Foreign Keys
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_assetTypeId_fkey"
    FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_assetTypeId_fkey"
    FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_debitWalletId_fkey"
    FOREIGN KEY ("debitWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_creditWalletId_fkey"
    FOREIGN KEY ("creditWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes for performance
CREATE INDEX "LedgerEntry_debitWalletId_idx"  ON "LedgerEntry"("debitWalletId");
CREATE INDEX "LedgerEntry_creditWalletId_idx" ON "LedgerEntry"("creditWalletId");
CREATE INDEX "LedgerEntry_transactionId_idx"  ON "LedgerEntry"("transactionId");
CREATE INDEX "LedgerEntry_createdAt_idx"      ON "LedgerEntry"("createdAt");
