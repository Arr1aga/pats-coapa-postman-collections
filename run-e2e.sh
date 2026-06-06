#!/usr/bin/env bash
# Corre la colección E2E de Newman contra los servicios locales.
# Prerequisito: AUTH, ROSTER y GATEWAY deben estar corriendo.
# Uso: ./docs/postman/run-e2e.sh [--folder "nombre"]
set -e

COLLECTION="docs/postman/pats-coapa.e2e.postman_collection.json"
ENVIRONMENT="docs/postman/env-local.json"

echo "▶ Limpiando DB de test y Redis..."
node -e "
const { MongoClient } = require('./pats-coapa-auth/node_modules/mongodb');
const Redis = require('./pats-coapa-auth/node_modules/ioredis');
Promise.all([
  MongoClient.connect('mongodb://localhost:27017').then(async c => {
    await c.db('auth_db').dropDatabase();
    await c.db('roster_db').dropDatabase();
    await c.db('attendance_db').dropDatabase();
    await c.db('calendar_db').dropDatabase();
    await c.close();
  }),
  new Promise((res, rej) => {
    const r = new Redis('redis://localhost:6379');
    r.flushdb().then(() => r.quit()).then(res).catch(rej);
  }),
]).then(() => console.log('DBs y Redis limpiados')).catch(e => { console.error(e.message); process.exit(1); });
"

echo "▶ Re-ejecutando migraciones y seed..."
(cd pats-coapa-auth && pnpm migrate:up && MONGODB_URI=mongodb://localhost:27017 MONGODB_DB_NAME=auth_db pnpm seed:roles && MONGODB_URI=mongodb://localhost:27017 MONGODB_DB_NAME=auth_db pnpm seed:admin)
(cd pats-coapa-roster && pnpm migrate:up 2>/dev/null || true)

echo "▶ Corriendo Newman..."
npx newman run "$COLLECTION" \
  --environment "$ENVIRONMENT" \
  --reporters cli \
  --bail \
  "$@"
