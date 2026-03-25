#!/bin/bash
set -e

echo "Waiting for database to be ready..."

DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-postgres}"

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
  sleep 1
done

echo "Database is ready!"

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npm run seed

echo "Starting application..."
exec pm2-runtime ecosystem.config.js
