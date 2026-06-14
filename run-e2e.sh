#!/usr/bin/env bash
# Corre la colección E2E de Newman contra los 6 servicios locales dejándola
# RE-EJECUTABLE: limpia solo los datos de prueba acumulados (jugadores,
# sesiones, eventos, cargos) — NO toca categorías, roles, usuarios ni
# migraciones/validators. Así se evitan las colisiones de jersey (espacio 0-99,
# único por categoría) y la acumulación de sesiones "today" entre corridas.
#
# CI usa una DB efímera (testcontainers) y NO necesita este reset.
#
# Prerequisito: los 6 servicios corriendo + Mongo en localhost:27017:
#   auth:3000  roster:3001  attendance:3002  gateway:3004  calendar:3005  payments:3006
#
# Uso:
#   ./docs/postman/run-e2e.sh                 # reset + corrida completa
#   ./docs/postman/run-e2e.sh --bail          # corta en el primer fallo
#   ./docs/postman/run-e2e.sh --folder "5. Roster"   # (args extra -> newman)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COLLECTION="$ROOT/docs/postman/pats-coapa.e2e.postman_collection.json"
ENVIRONMENT="$ROOT/docs/postman/env-local.json"
MONGO="${MONGO_URI:-mongodb://localhost:27017}"

echo "▶ Verificando que los 6 servicios respondan..."
for p in 3000 3001 3002 3004 3005 3006; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$p/health" || true)
  if [ "$code" != "200" ]; then
    echo "  ✗ localhost:$p/health -> ${code:-sin respuesta}. Levanta los 6 servicios antes de correr." >&2
    exit 1
  fi
done
echo "  ✓ los 6 servicios OK"

echo "▶ Limpiando datos de prueba acumulados (conserva categorías/roles/usuarios/migraciones)..."
node -e "
const { MongoClient } = require('$ROOT/pats-coapa-auth/node_modules/mongodb');
(async () => {
  const c = await MongoClient.connect('$MONGO');
  const wipe = [
    ['roster_db', 'players'],
    ['attendance_db', 'attendance_sessions'],
    ['calendar_db', 'calendar_events'],
    ['payments_db', 'players'],
    ['payments_db', 'extra_charges'],
  ];
  for (const [db, col] of wipe) {
    const n = await c.db(db).collection(col).deleteMany({});
    console.log('  ' + db + '.' + col + ': ' + n.deletedCount + ' borrados');
  }
  await c.close();
})().catch((e) => { console.error('  ✗', e.message); process.exit(1); });
"

echo "▶ Corriendo Newman..."
npx newman run "$COLLECTION" \
  --environment "$ENVIRONMENT" \
  --reporters cli \
  "$@"
