#!/bin/bash
# Démarre l'API + le frontend Fleurs de Nila et ouvre le navigateur.
# Usage : ./start.sh          (Ctrl+C pour tout arrêter)

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

API_PORT=3000
FRONT_PORT=5500

echo "🌸 Fleurs de Nila — démarrage..."

# Libère les ports si d'anciens process traînent
lsof -ti :$API_PORT | xargs kill -9 2>/dev/null || true
lsof -ti :$FRONT_PORT | xargs kill -9 2>/dev/null || true

# API (Express + SQLite)
(cd "$DIR/api" && npm run dev) &
API_PID=$!

# Frontend statique sur le port 5500 (attendu par le CORS de l'API)
(cd "$DIR" && python3 -m http.server $FRONT_PORT >/dev/null 2>&1) &
FRONT_PID=$!

# Tout arrêter proprement sur Ctrl+C
cleanup() {
  echo ""
  echo "🛑 Arrêt..."
  kill $API_PID $FRONT_PID 2>/dev/null || true
  lsof -ti :$API_PORT | xargs kill -9 2>/dev/null || true
  lsof -ti :$FRONT_PORT | xargs kill -9 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Attend que l'API réponde (max ~15 s)
echo "⏳ Attente de l'API sur le port $API_PORT..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$API_PORT/api/health" >/dev/null 2>&1; then
    echo "✅ API prête"
    break
  fi
  sleep 0.5
done

# Ouvre les interfaces
open "http://localhost:$FRONT_PORT/index.html"
open "http://localhost:$FRONT_PORT/boutique/index.html"
open "http://localhost:$FRONT_PORT/admin/login.html"

echo ""
echo "🌼 Tout est en route :"
echo "   Site      → http://localhost:$FRONT_PORT/index.html"
echo "   Boutique  → http://localhost:$FRONT_PORT/boutique/index.html"
echo "   Admin     → http://localhost:$FRONT_PORT/admin/login.html"
echo "   API       → http://localhost:$API_PORT/api/health"
echo ""
echo "Ctrl+C pour tout arrêter."

wait
