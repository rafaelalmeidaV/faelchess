#!/usr/bin/env bash
# Publica o worker de análise na máquina de casa (sem sudo: tudo em ~/faelchess, serviço de usuário).
#
# Uso: deploy/deploy-worker.sh   (WORKER_HOST vem de deploy/deploy.env ou do ambiente)
set -euo pipefail

# Destinos do deploy: ficam em deploy/deploy.env (fora do git). Veja deploy/deploy.env.example.
CONFIG="$(cd "$(dirname "$0")" && pwd)/deploy.env"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && source "$CONFIG"
WORKER_HOST="${WORKER_HOST:?defina WORKER_HOST em deploy/deploy.env (ex.: usuario@192.168.0.10)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Compilando shared e worker"
npm run build:shared >/dev/null
npm run build -w @faelchess/analysis-worker >/dev/null

echo "==> Enviando código compilado"
ssh "$WORKER_HOST" 'mkdir -p ~/faelchess'
# Os package.json de todos os workspaces vão junto para o package-lock continuar válido no npm ci.
rsync -az --delete --relative \
  package.json package-lock.json \
  packages/shared/package.json packages/shared/dist packages/shared/data \
  apps/analysis-worker/package.json apps/analysis-worker/dist \
  apps/api/package.json apps/web/package.json apps/mcp-server/package.json \
  deploy/faelchess-worker.user.service \
  "$WORKER_HOST:faelchess/"

echo "==> Instalando dependências de produção e reiniciando o serviço"
ssh "$WORKER_HOST" 'set -e
cd ~/faelchess
npm ci --omit=dev --no-audit --no-fund -w @faelchess/analysis-worker >/tmp/faelchess-npm.log 2>&1 || { tail -20 /tmp/faelchess-npm.log; exit 1; }
if [ ! -f apps/analysis-worker/.env ]; then
  echo "!! apps/analysis-worker/.env não existe: crie a partir do .env.example"; exit 1
fi
mkdir -p ~/.config/systemd/user
cp deploy/faelchess-worker.user.service ~/.config/systemd/user/faelchess-worker.service
systemctl --user daemon-reload
systemctl --user enable faelchess-worker >/dev/null 2>&1
systemctl --user restart faelchess-worker
sleep 4
systemctl --user is-active faelchess-worker || true
journalctl --user -u faelchess-worker -n 5 --no-pager -o cat || true
'
