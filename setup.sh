#!/bin/bash
# MyCOps Platform — Quick Start Script

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MyCOps Platform — Dev Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Pre-requisites:"
echo "  1. PostgreSQL running locally"
echo "  2. Database created: CREATE DATABASE myc_ops;"
echo "  3. Update backend/.env with your DATABASE_URL"
echo ""

cd backend

echo "⚙️  Running database migration..."
npx prisma migrate dev --name init

echo ""
echo "🌱 Seeding database..."
npx ts-node src/prisma/seed.ts

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start backend:  cd backend && npm run dev"
echo "Start frontend: cd frontend && npm run dev"
echo ""
echo "Login at http://localhost:3000"
echo "  Admin:  admin@myc.in / password123"
echo "  Rajan:  rajan@myc.in / password123"
