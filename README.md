# 💰 Wallet Service — Dino Ventures Assignment

An internal wallet service for a high-traffic gaming/loyalty platform, built with **Node.js + TypeScript**, **PostgreSQL**, and a **double-entry ledger** architecture.

---

## 🏗️ Architecture

### Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 + TypeScript | Type safety, fast async I/O, wide ecosystem |
| Framework | Express | Lightweight, minimal overhead |
| Database | PostgreSQL 16 | ACID transactions, row-level locking, excellent for ledger systems |
| ORM | Prisma | Type-safe queries, migration management, great DX |
| Validation | Zod | Schema-first runtime validation with TypeScript inference |
| Arithmetic | decimal.js | Avoids floating-point errors for financial calculations |

### Double-Entry Ledger

Instead of a mutable `balance` column, every transaction creates a **ledger entry** with:
- `debitWalletId` — the wallet that **loses** credits
- `creditWalletId` — the wallet that **gains** credits
- `amount` — the value transferred

**Balance is always derived:**
```sql
SELECT
  SUM(CASE WHEN "creditWalletId" = $walletId THEN amount ELSE 0 END) -
  SUM(CASE WHEN "debitWalletId"  = $walletId THEN amount ELSE 0 END)
FROM "LedgerEntry"
WHERE "creditWalletId" = $walletId OR "debitWalletId" = $walletId
```

This means:
- No balance column to get out of sync
- Full immutable audit trail of every credit/debit
- Easy to reconstruct state at any point in time

### Transaction Flows

```
TOPUP:   Treasury ──debit──► User       (user purchases credits)
BONUS:   Treasury ──debit──► User       (system issues free credits)
SPEND:   User     ──debit──► Treasury   (user spends on in-app items)
```

---

## 🔐 Critical Constraints

### Concurrency & Race Conditions

All balance-affecting operations use `SELECT ... FOR UPDATE` inside a PostgreSQL transaction. This row-level lock ensures no two concurrent requests can modify the same wallet simultaneously.

```typescript
// Lock rows before reading balance
await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${id} FOR UPDATE`;
// Then read balance — guaranteed consistent
const balance = await computeBalanceInTx(tx, walletId);
```

### Deadlock Avoidance ⭐

When locking multiple wallets (e.g., user wallet + treasury wallet), locks are **always acquired in sorted UUID order**. This eliminates circular wait conditions:

```typescript
// ✅ Always sort wallet IDs before locking
const sorted = [...walletIds].sort();
for (const id of sorted) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${id} FOR UPDATE`;
}
```

Without this, Request A locking (wallet-1 → wallet-2) and Request B locking (wallet-2 → wallet-1) simultaneously would deadlock.

### Idempotency

Every mutation endpoint requires an `idempotencyKey`. Before processing, we check if this key exists in `LedgerEntry`. If yes, we return the original result without re-executing:

```typescript
const existing = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
if (existing) return { ...result, idempotent: true };
```

The `idempotencyKey` column has a `UNIQUE` constraint, so even if two identical requests race past the check simultaneously, the database constraint ensures only one succeeds.

---

## 🚀 Quick Start

### Option 1: Docker (Recommended — one command)

```bash
# Clone and start everything
git clone <repo-url>
cd wallet-service

docker-compose up --build
```

This automatically:
1. Starts PostgreSQL
2. Runs migrations
3. Seeds the database with test data
4. Starts the API server on port 3000

### Option 2: Local Development

**Prerequisites:** Node.js 20+, PostgreSQL running locally

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# 3. Generate Prisma client
npx prisma generate

# 4. Run migrations
npx prisma migrate deploy

# 5. Seed database
npm run prisma:seed

# 6. Start server
npm run dev
```

### Option 3: Raw SQL seed

If you prefer to seed without running the app:

```bash
# Create database first
createdb wallet_db

# Run schema migration
psql -U postgres -d wallet_db -f prisma/migrations/0001_init/migration.sql

# Seed data
psql -U postgres -d wallet_db -f seed.sql
```

---

## 📡 API Reference

### 🌐 Live URL
```
https://dino-ventures.onrender.com
```

### Base URL (local)
```
http://localhost:3000/api
```

---

## 🧪 Live Test Commands

**Health Check**
```bash
curl https://dino-ventures.onrender.com/health
```

**Alice's Gold Coin Balance**
```bash
curl "https://dino-ventures.onrender.com/api/wallet/4500f224-e388-48e7-a96e-d81432256901/balance?assetTypeId=8e1a8886-6d37-48e3-8d82-7b5c6e7e3dbd"
```

**Top-up Alice (500 Gold Coins)**
```bash
curl -X POST https://dino-ventures.onrender.com/api/wallet/topup \
  -H "Content-Type: application/json" \
  -d '{"userId":"4500f224-e388-48e7-a96e-d81432256901","assetTypeId":"8e1a8886-6d37-48e3-8d82-7b5c6e7e3dbd","amount":500,"idempotencyKey":"topup-alice-001","description":"Purchased Gold Coins"}'
```

**Bob Spends 30 Gold Coins**
```bash
curl -X POST https://dino-ventures.onrender.com/api/wallet/spend \
  -H "Content-Type: application/json" \
  -d '{"userId":"0195c953-e3f6-4f58-b6f1-f6f78f87c5a9","assetTypeId":"8e1a8886-6d37-48e3-8d82-7b5c6e7e3dbd","amount":30,"idempotencyKey":"spend-bob-001","description":"Bought magic sword"}'
```

**Issue Bonus to Bob (100 Loyalty Points)**
```bash
curl -X POST https://dino-ventures.onrender.com/api/wallet/bonus \
  -H "Content-Type: application/json" \
  -d '{"userId":"0195c953-e3f6-4f58-b6f1-f6f78f87c5a9","assetTypeId":"b62c2cb6-0039-41ed-a653-22c4dbf2b8e7","amount":100,"idempotencyKey":"bonus-bob-001","description":"Referral bonus"}'
```

**Test Idempotency (resend same request — must not double charge)**
```bash
curl -X POST https://dino-ventures.onrender.com/api/wallet/topup \
  -H "Content-Type: application/json" \
  -d '{"userId":"4500f224-e388-48e7-a96e-d81432256901","assetTypeId":"8e1a8886-6d37-48e3-8d82-7b5c6e7e3dbd","amount":500,"idempotencyKey":"topup-alice-001","description":"Purchased Gold Coins"}'
```

**Test Insufficient Balance (should return 422)**
```bash
curl -X POST https://dino-ventures.onrender.com/api/wallet/spend \
  -H "Content-Type: application/json" \
  -d '{"userId":"0195c953-e3f6-4f58-b6f1-f6f78f87c5a9","assetTypeId":"8e1a8886-6d37-48e3-8d82-7b5c6e7e3dbd","amount":9999,"idempotencyKey":"spend-bob-fail-001","description":"Should fail"}'
```

### Health Check
```
GET /health
```

---

### 1. Wallet Top-Up (Purchase Credits)

```
POST /api/wallet/topup
```

**Body:**
```json
{
  "userId": "bbbbbbbb-0001-0000-0000-000000000002",
  "assetTypeId": "aaaaaaaa-0001-0000-0000-000000000001",
  "amount": 500,
  "idempotencyKey": "topup-alice-001",
  "description": "Purchased Gold Coins pack"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "transactionId": "uuid...",
    "amount": 500,
    "idempotent": false
  }
}
```

---

### 2. Issue Bonus Credits

```
POST /api/wallet/bonus
```

**Body:**
```json
{
  "userId": "bbbbbbbb-0001-0000-0000-000000000003",
  "assetTypeId": "aaaaaaaa-0001-0000-0000-000000000001",
  "amount": 100,
  "idempotencyKey": "bonus-bob-referral-001",
  "description": "Referral bonus"
}
```

---

### 3. Spend Credits

```
POST /api/wallet/spend
```

**Body:**
```json
{
  "userId": "bbbbbbbb-0001-0000-0000-000000000002",
  "assetTypeId": "aaaaaaaa-0001-0000-0000-000000000001",
  "amount": 30,
  "idempotencyKey": "spend-alice-item-001",
  "description": "Bought magic sword"
}
```

**Response `422` (Insufficient balance):**
```json
{
  "success": false,
  "error": "Insufficient balance. Available: 50.0000, Required: 100"
}
```

---

### 4. Check Balance

```
GET /api/wallet/:userId/balance?assetTypeId=<uuid>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "...",
    "assetTypeId": "...",
    "assetName": "Gold Coins",
    "assetSymbol": "GC",
    "balance": "1000.0000"
  }
}
```

---

### 5. Transaction History

```
GET /api/wallet/:userId/transactions?assetTypeId=<uuid>
```

---

### 6. Helper Endpoints

```
GET /api/asset-types    # List all asset types with IDs
GET /api/users          # List all (non-system) users with IDs
```

---

## 🌱 Seed Data

After seeding, the following data is available:

| Entity | Name | ID |
|---|---|---|
| User | alice | `bbbbbbbb-0001-0000-0000-000000000002` |
| User | bob | `bbbbbbbb-0001-0000-0000-000000000003` |
| Asset | Gold Coins (GC) | `aaaaaaaa-0001-0000-0000-000000000001` |
| Asset | Diamonds (DIA) | `aaaaaaaa-0001-0000-0000-000000000002` |
| Asset | Loyalty Points (LP) | `aaaaaaaa-0001-0000-0000-000000000003` |

**Initial balances:**
- Alice: 1,000 Gold Coins, 50 Diamonds
- Bob: 500 Gold Coins, 200 Loyalty Points

---

## 📁 Project Structure

```
wallet-service/
├── src/
│   ├── app.ts                    # Express app + server entry point
│   ├── controllers/
│   │   └── walletController.ts   # Request handlers, input validation
│   ├── services/
│   │   └── walletService.ts      # Core business logic, ledger operations
│   ├── routes/
│   │   └── index.ts              # Route definitions
│   ├── middleware/
│   │   └── errorHandler.ts       # Centralized error handling
│   └── types/
│       └── index.ts              # TypeScript interfaces
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── seed.ts                   # TypeScript seed script
│   └── migrations/
│       └── 0001_init/
│           └── migration.sql     # Database DDL
├── seed.sql                      # Raw SQL seed (alternative)
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

---

## ✅ Requirements Checklist

| Requirement | Status |
|---|---|
| Asset types (Gold Coins, Diamonds, Loyalty Points) | ✅ |
| System treasury account | ✅ |
| Two+ user accounts with initial balances | ✅ |
| Wallet top-up endpoint | ✅ |
| Bonus/incentive endpoint | ✅ |
| Spend/purchase endpoint | ✅ |
| Balance check endpoint | ✅ |
| ACID transactions | ✅ |
| Concurrency / race condition protection | ✅ `SELECT FOR UPDATE` |
| Idempotency | ✅ unique `idempotencyKey` column |
| Deadlock avoidance ⭐ | ✅ sorted lock acquisition |
| Double-entry ledger ⭐ | ✅ full debit/credit entries |
| Docker + docker-compose ⭐ | ✅ |
| seed.sql | ✅ |
| README | ✅ |
