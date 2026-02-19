import { PrismaClient, TransactionType, TxStatus } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Asset Types ───────────────────────────────────────────────────────
  const goldCoins = await prisma.assetType.upsert({
    where: { symbol: 'GC' },
    update: {},
    create: { name: 'Gold Coins', symbol: 'GC', description: 'Premium in-game currency' },
  });

  const diamonds = await prisma.assetType.upsert({
    where: { symbol: 'DIA' },
    update: {},
    create: { name: 'Diamonds', symbol: 'DIA', description: 'Rare premium gems' },
  });

  const loyaltyPoints = await prisma.assetType.upsert({
    where: { symbol: 'LP' },
    update: {},
    create: { name: 'Loyalty Points', symbol: 'LP', description: 'Reward points for activity' },
  });

  console.log('✅ Asset types created:', [goldCoins.name, diamonds.name, loyaltyPoints.name]);

  // ─── 2. System Account (Treasury) ────────────────────────────────────────
  const treasury = await prisma.user.upsert({
    where: { email: 'treasury@system.internal' },
    update: {},
    create: {
      username: 'treasury',
      email: 'treasury@system.internal',
      isSystem: true,
    },
  });

  console.log('✅ System treasury account created:', treasury.username);

  // ─── 3. User Accounts ─────────────────────────────────────────────────────
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: { username: 'alice', email: 'alice@example.com' },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: { username: 'bob', email: 'bob@example.com' },
  });

  console.log('✅ Users created:', [alice.username, bob.username]);

  // ─── 4. Create wallets ────────────────────────────────────────────────────
  const createWallet = async (userId: string, assetTypeId: string) =>
    prisma.wallet.upsert({
      where: { userId_assetTypeId: { userId, assetTypeId } },
      update: {},
      create: { userId, assetTypeId },
    });

  const treasuryGC  = await createWallet(treasury.id, goldCoins.id);
  const treasuryDIA = await createWallet(treasury.id, diamonds.id);
  const treasuryLP  = await createWallet(treasury.id, loyaltyPoints.id);
  const aliceGC     = await createWallet(alice.id, goldCoins.id);
  const aliceDIA    = await createWallet(alice.id, diamonds.id);
  const bobGC       = await createWallet(bob.id, goldCoins.id);
  const bobLP       = await createWallet(bob.id, loyaltyPoints.id);

  console.log('✅ Wallets created for treasury, alice, and bob');

  // ─── 5. Seed Initial Balances (via ledger entries) ────────────────────────
  // Alice: 1000 Gold Coins, 50 Diamonds (topped up)
  // Bob: 500 Gold Coins, 200 Loyalty Points (bonus)

  const seedTx = await prisma.transaction.create({
    data: { type: TransactionType.TOPUP, status: TxStatus.COMPLETED, description: 'Initial seed balances' },
  });

  const seedEntries = [
    { debit: treasuryGC.id,  credit: aliceGC.id,  amount: '1000.0000', type: TransactionType.TOPUP,  desc: "Alice's initial Gold Coins" },
    { debit: treasuryDIA.id, credit: aliceDIA.id, amount: '50.0000',   type: TransactionType.TOPUP,  desc: "Alice's initial Diamonds" },
    { debit: treasuryGC.id,  credit: bobGC.id,    amount: '500.0000',  type: TransactionType.BONUS,  desc: "Bob's welcome bonus Gold Coins" },
    { debit: treasuryLP.id,  credit: bobLP.id,    amount: '200.0000',  type: TransactionType.BONUS,  desc: "Bob's initial Loyalty Points" },
  ];

  for (const entry of seedEntries) {
    await prisma.ledgerEntry.create({
      data: {
        transactionId: seedTx.id,
        assetTypeId: entry.type === TransactionType.TOPUP
          ? (entry.credit === aliceGC.id ? goldCoins.id : diamonds.id)
          : (entry.credit === bobGC.id ? goldCoins.id : loyaltyPoints.id),
        debitWalletId: entry.debit,
        creditWalletId: entry.credit,
        amount: entry.amount,
        transactionType: entry.type,
        description: entry.desc,
        idempotencyKey: `seed-${entry.credit}-${entry.type}`,
      },
    });
  }

  console.log('✅ Initial balances seeded:');
  console.log('   Alice: 1000 Gold Coins, 50 Diamonds');
  console.log('   Bob:   500 Gold Coins, 200 Loyalty Points');
  console.log('');
  console.log('📋 Useful IDs for testing:');
  console.log(`   Alice User ID:       ${alice.id}`);
  console.log(`   Bob User ID:         ${bob.id}`);
  console.log(`   Gold Coins ID:       ${goldCoins.id}`);
  console.log(`   Diamonds ID:         ${diamonds.id}`);
  console.log(`   Loyalty Points ID:   ${loyaltyPoints.id}`);
  console.log('');
  console.log('🎉 Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
