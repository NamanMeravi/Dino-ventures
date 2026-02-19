#!/bin/sh
set -e

echo "⏳ Running database migrations..."
npx prisma migrate deploy

echo "🌱 Running seed..."
# Only seed if no users exist (idempotent check)
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count().then(count => {
  if (count === 0) {
    console.log('No users found, seeding...');
    process.exit(0); // proceed to seed
  } else {
    console.log('Database already seeded, skipping.');
    process.exit(1); // skip seed
  }
}).catch(() => process.exit(0));
" && npx ts-node prisma/seed.ts || echo "⏭️  Skipping seed (already done)"

echo "🚀 Starting server..."
exec node dist/app.js
