import { PrismaClient, TransactionType, TxStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { TopupRequest, BonusRequest, SpendRequest, BalanceResponse, TransactionResponse } from '../types';

const prisma = new PrismaClient();

// ─── Helper: get or create wallet ───────────────────────────────────────────
async function getOrCreateWallet(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  userId: string,
  assetTypeId: string
) {
  return tx.wallet.upsert({
    where: { userId_assetTypeId: { userId, assetTypeId } },
    update: {},
    create: { userId, assetTypeId },
  });
}

// ─── Helper: compute balance from ledger entries ─────────────────────────────
// Balance = SUM(credits received) - SUM(debits paid out)
async function computeBalance(walletId: string): Promise<Decimal> {
  const result = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT 
      COALESCE(
        SUM(CASE WHEN "creditWalletId" = ${walletId} THEN amount ELSE 0 END) -
        SUM(CASE WHEN "debitWalletId"  = ${walletId} THEN amount ELSE 0 END),
        0
      ) AS balance
    FROM "LedgerEntry"
    WHERE "creditWalletId" = ${walletId} OR "debitWalletId" = ${walletId}
  `;
  return new Decimal(result[0]?.balance ?? '0');
}

// ─── Helper: get system treasury wallet ──────────────────────────────────────
async function getTreasuryWallet(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  assetTypeId: string
) {
  const systemUser = await tx.user.findFirstOrThrow({ where: { isSystem: true } });
  return getOrCreateWallet(tx, systemUser.id, assetTypeId);
}

// ─── Helper: lock wallets in consistent order (deadlock avoidance) ────────────
// Always acquire locks on wallets sorted by ID to prevent circular waits
async function lockWalletsInOrder(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  walletIds: string[]
) {
  const sorted = [...walletIds].sort();
  // Lock rows using SELECT FOR UPDATE in sorted order
  for (const id of sorted) {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${id} FOR UPDATE`;
  }
}

// ─── TOPUP: Real-money purchase credits ──────────────────────────────────────
export async function topupWallet(req: TopupRequest) {
  const { userId, assetTypeId, amount, idempotencyKey, description } = req;

  if (amount <= 0) throw new Error('Amount must be positive');

  // Check idempotency - if we've seen this key, return the existing result
  const existing = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { message: 'Duplicate request - returning original result', idempotent: true, transactionId: existing.transactionId };
  }

  return prisma.$transaction(async (tx) => {
    const [userWallet, treasuryWallet] = await Promise.all([
      getOrCreateWallet(tx, userId, assetTypeId),
      getTreasuryWallet(tx, assetTypeId),
    ]);

    // Lock in sorted order to prevent deadlocks
    await lockWalletsInOrder(tx, [userWallet.id, treasuryWallet.id]);

    const transaction = await tx.transaction.create({
      data: {
        type: TransactionType.TOPUP,
        status: TxStatus.COMPLETED,
        description: description ?? `Top-up of ${amount} credits`,
      },
    });

    // Double-entry: Treasury debits, User credits
    await tx.ledgerEntry.create({
      data: {
        transactionId: transaction.id,
        assetTypeId,
        debitWalletId: treasuryWallet.id,  // Treasury loses credits (issued to user)
        creditWalletId: userWallet.id,       // User gains credits
        amount: new Decimal(amount).toFixed(4),
        transactionType: TransactionType.TOPUP,
        description: description ?? `Top-up purchase`,
        idempotencyKey,
      },
    });

    await tx.transaction.update({ where: { id: transaction.id }, data: { status: TxStatus.COMPLETED } });

    return { transactionId: transaction.id, amount, idempotent: false };
  }, { timeout: 10000 });
}

// ─── BONUS: System issues free credits ───────────────────────────────────────
export async function issueBonus(req: BonusRequest) {
  const { userId, assetTypeId, amount, idempotencyKey, description } = req;

  if (amount <= 0) throw new Error('Amount must be positive');

  const existing = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { message: 'Duplicate request - returning original result', idempotent: true, transactionId: existing.transactionId };
  }

  return prisma.$transaction(async (tx) => {
    const [userWallet, treasuryWallet] = await Promise.all([
      getOrCreateWallet(tx, userId, assetTypeId),
      getTreasuryWallet(tx, assetTypeId),
    ]);

    await lockWalletsInOrder(tx, [userWallet.id, treasuryWallet.id]);

    const transaction = await tx.transaction.create({
      data: {
        type: TransactionType.BONUS,
        status: TxStatus.PENDING,
        description: description ?? `Bonus of ${amount} credits`,
      },
    });

    // Double-entry: Treasury debits, User credits (same as topup but categorized differently)
    await tx.ledgerEntry.create({
      data: {
        transactionId: transaction.id,
        assetTypeId,
        debitWalletId: treasuryWallet.id,
        creditWalletId: userWallet.id,
        amount: new Decimal(amount).toFixed(4),
        transactionType: TransactionType.BONUS,
        description: description ?? `Bonus/incentive credit`,
        idempotencyKey,
      },
    });

    await tx.transaction.update({ where: { id: transaction.id }, data: { status: TxStatus.COMPLETED } });

    return { transactionId: transaction.id, amount, idempotent: false };
  }, { timeout: 10000 });
}

// ─── SPEND: User spends credits ──────────────────────────────────────────────
export async function spendCredits(req: SpendRequest) {
  const { userId, assetTypeId, amount, idempotencyKey, description } = req;

  if (amount <= 0) throw new Error('Amount must be positive');

  const existing = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { message: 'Duplicate request - returning original result', idempotent: true, transactionId: existing.transactionId };
  }

  return prisma.$transaction(async (tx) => {
    const [userWallet, treasuryWallet] = await Promise.all([
      getOrCreateWallet(tx, userId, assetTypeId),
      getTreasuryWallet(tx, assetTypeId),
    ]);

    // Lock in sorted order (deadlock avoidance)
    await lockWalletsInOrder(tx, [userWallet.id, treasuryWallet.id]);

    // Check balance INSIDE transaction with locked rows to prevent race conditions
    const balance = await computeBalanceInTx(tx, userWallet.id);
    if (balance.lessThan(amount)) {
      throw new Error(`Insufficient balance. Available: ${balance.toFixed(4)}, Required: ${amount}`);
    }

    const transaction = await tx.transaction.create({
      data: {
        type: TransactionType.SPEND,
        status: TxStatus.PENDING,
        description: description ?? `Spend of ${amount} credits`,
      },
    });

    // Double-entry: User debits, Revenue/Treasury credits
    await tx.ledgerEntry.create({
      data: {
        transactionId: transaction.id,
        assetTypeId,
        debitWalletId: userWallet.id,        // User loses credits
        creditWalletId: treasuryWallet.id,   // Treasury/Revenue gains credits
        amount: new Decimal(amount).toFixed(4),
        transactionType: TransactionType.SPEND,
        description: description ?? `In-app purchase`,
        idempotencyKey,
      },
    });

    await tx.transaction.update({ where: { id: transaction.id }, data: { status: TxStatus.COMPLETED } });

    const newBalance = balance.minus(amount);
    return { transactionId: transaction.id, amount, remainingBalance: newBalance.toFixed(4), idempotent: false };
  }, { timeout: 10000 });
}

// ─── Compute balance inside a transaction context ────────────────────────────
async function computeBalanceInTx(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  walletId: string
): Promise<Decimal> {
  const result = await tx.$queryRaw<{ balance: string }[]>`
    SELECT 
      COALESCE(
        SUM(CASE WHEN "creditWalletId" = ${walletId} THEN amount ELSE 0 END) -
        SUM(CASE WHEN "debitWalletId"  = ${walletId} THEN amount ELSE 0 END),
        0
      ) AS balance
    FROM "LedgerEntry"
    WHERE "creditWalletId" = ${walletId} OR "debitWalletId" = ${walletId}
  `;
  return new Decimal(result[0]?.balance ?? '0');
}

// ─── GET BALANCE ─────────────────────────────────────────────────────────────
export async function getBalance(userId: string, assetTypeId: string): Promise<BalanceResponse> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId_assetTypeId: { userId, assetTypeId } },
    include: { assetType: true },
  });

  if (!wallet) {
    // No wallet = 0 balance
    const assetType = await prisma.assetType.findUniqueOrThrow({ where: { id: assetTypeId } });
    return { userId, assetTypeId, assetName: assetType.name, assetSymbol: assetType.symbol, balance: '0.0000' };
  }

  const balance = await computeBalance(wallet.id);
  return {
    userId,
    assetTypeId,
    assetName: wallet.assetType.name,
    assetSymbol: wallet.assetType.symbol,
    balance: balance.toFixed(4),
  };
}

// ─── GET TRANSACTION HISTORY ──────────────────────────────────────────────────
export async function getTransactionHistory(userId: string, assetTypeId?: string): Promise<TransactionResponse[]> {
  const wallet = userId ? await prisma.wallet.findMany({
    where: { userId, ...(assetTypeId ? { assetTypeId } : {}) },
  }) : [];

  const walletIds = wallet.map(w => w.id);
  if (!walletIds.length) return [];

  const entries = await prisma.ledgerEntry.findMany({
    where: { OR: [{ debitWalletId: { in: walletIds } }, { creditWalletId: { in: walletIds } }] },
    include: { transaction: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return entries.map(e => ({
    id: e.id,
    type: e.transactionType,
    status: e.transaction.status,
    amount: e.amount.toString(),
    description: e.description,
    createdAt: e.createdAt,
    debitWalletId: e.debitWalletId,
    creditWalletId: e.creditWalletId,
  }));
}

export { prisma };
