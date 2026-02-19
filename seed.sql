-- ============================================================
-- seed.sql: Initial data for Wallet Service
-- Run with: psql -U postgres -d wallet_db -f seed.sql
-- ============================================================

-- Generate UUIDs (PostgreSQL native)
-- We use fixed UUIDs for reproducibility
DO $$
DECLARE
    -- Asset Type IDs
    gc_id  TEXT := 'aaaaaaaa-0001-0000-0000-000000000001';
    dia_id TEXT := 'aaaaaaaa-0001-0000-0000-000000000002';
    lp_id  TEXT := 'aaaaaaaa-0001-0000-0000-000000000003';

    -- User IDs
    treasury_id TEXT := 'bbbbbbbb-0001-0000-0000-000000000001';
    alice_id    TEXT := 'bbbbbbbb-0001-0000-0000-000000000002';
    bob_id      TEXT := 'bbbbbbbb-0001-0000-0000-000000000003';

    -- Wallet IDs
    treasury_gc_id  TEXT := 'cccccccc-0001-0000-0000-000000000001';
    treasury_dia_id TEXT := 'cccccccc-0001-0000-0000-000000000002';
    treasury_lp_id  TEXT := 'cccccccc-0001-0000-0000-000000000003';
    alice_gc_id     TEXT := 'cccccccc-0001-0000-0000-000000000004';
    alice_dia_id    TEXT := 'cccccccc-0001-0000-0000-000000000005';
    bob_gc_id       TEXT := 'cccccccc-0001-0000-0000-000000000006';
    bob_lp_id       TEXT := 'cccccccc-0001-0000-0000-000000000007';

    -- Transaction ID
    seed_tx_id TEXT := 'dddddddd-0001-0000-0000-000000000001';

BEGIN

-- ── 1. Asset Types ────────────────────────────────────────────────────────────
INSERT INTO "AssetType" ("id", "name", "symbol", "description", "createdAt")
VALUES
    (gc_id,  'Gold Coins',      'GC',  'Premium in-game currency',    NOW()),
    (dia_id, 'Diamonds',        'DIA', 'Rare premium gems',           NOW()),
    (lp_id,  'Loyalty Points',  'LP',  'Reward points for activity',  NOW())
ON CONFLICT ("symbol") DO NOTHING;

-- ── 2. System Account (Treasury) ─────────────────────────────────────────────
INSERT INTO "User" ("id", "username", "email", "isSystem", "createdAt")
VALUES (treasury_id, 'treasury', 'treasury@system.internal', true, NOW())
ON CONFLICT ("email") DO NOTHING;

-- ── 3. User Accounts ─────────────────────────────────────────────────────────
INSERT INTO "User" ("id", "username", "email", "isSystem", "createdAt")
VALUES
    (alice_id, 'alice', 'alice@example.com', false, NOW()),
    (bob_id,   'bob',   'bob@example.com',   false, NOW())
ON CONFLICT ("email") DO NOTHING;

-- ── 4. Wallets ────────────────────────────────────────────────────────────────
INSERT INTO "Wallet" ("id", "userId", "assetTypeId", "createdAt")
VALUES
    (treasury_gc_id,  treasury_id, gc_id,  NOW()),
    (treasury_dia_id, treasury_id, dia_id, NOW()),
    (treasury_lp_id,  treasury_id, lp_id,  NOW()),
    (alice_gc_id,     alice_id,    gc_id,  NOW()),
    (alice_dia_id,    alice_id,    dia_id, NOW()),
    (bob_gc_id,       bob_id,      gc_id,  NOW()),
    (bob_lp_id,       bob_id,      lp_id,  NOW())
ON CONFLICT ("userId", "assetTypeId") DO NOTHING;

-- ── 5. Seed Transaction ───────────────────────────────────────────────────────
INSERT INTO "Transaction" ("id", "type", "status", "description", "createdAt", "updatedAt")
VALUES (seed_tx_id, 'TOPUP', 'COMPLETED', 'Initial seed balances', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ── 6. Ledger Entries (double-entry: treasury debits, users credit) ───────────
-- Alice: 1000 Gold Coins
INSERT INTO "LedgerEntry" (
    "id", "transactionId", "assetTypeId",
    "debitWalletId", "creditWalletId",
    "amount", "transactionType", "description", "idempotencyKey", "createdAt"
) VALUES (
    gen_random_uuid(), seed_tx_id, gc_id,
    treasury_gc_id, alice_gc_id,
    1000.0000, 'TOPUP', 'Alice initial Gold Coins', 'seed-alice-gc', NOW()
) ON CONFLICT ("idempotencyKey") DO NOTHING;

-- Alice: 50 Diamonds
INSERT INTO "LedgerEntry" (
    "id", "transactionId", "assetTypeId",
    "debitWalletId", "creditWalletId",
    "amount", "transactionType", "description", "idempotencyKey", "createdAt"
) VALUES (
    gen_random_uuid(), seed_tx_id, dia_id,
    treasury_dia_id, alice_dia_id,
    50.0000, 'TOPUP', 'Alice initial Diamonds', 'seed-alice-dia', NOW()
) ON CONFLICT ("idempotencyKey") DO NOTHING;

-- Bob: 500 Gold Coins (welcome bonus)
INSERT INTO "LedgerEntry" (
    "id", "transactionId", "assetTypeId",
    "debitWalletId", "creditWalletId",
    "amount", "transactionType", "description", "idempotencyKey", "createdAt"
) VALUES (
    gen_random_uuid(), seed_tx_id, gc_id,
    treasury_gc_id, bob_gc_id,
    500.0000, 'BONUS', 'Bob welcome bonus Gold Coins', 'seed-bob-gc', NOW()
) ON CONFLICT ("idempotencyKey") DO NOTHING;

-- Bob: 200 Loyalty Points
INSERT INTO "LedgerEntry" (
    "id", "transactionId", "assetTypeId",
    "debitWalletId", "creditWalletId",
    "amount", "transactionType", "description", "idempotencyKey", "createdAt"
) VALUES (
    gen_random_uuid(), seed_tx_id, lp_id,
    treasury_lp_id, bob_lp_id,
    200.0000, 'BONUS', 'Bob initial Loyalty Points', 'seed-bob-lp', NOW()
) ON CONFLICT ("idempotencyKey") DO NOTHING;

RAISE NOTICE '✅ Seeding complete!';
RAISE NOTICE '   Alice ID: %', alice_id;
RAISE NOTICE '   Bob ID:   %', bob_id;
RAISE NOTICE '   GC ID:    %', gc_id;
RAISE NOTICE '   DIA ID:   %', dia_id;
RAISE NOTICE '   LP ID:    %', lp_id;

END $$;
