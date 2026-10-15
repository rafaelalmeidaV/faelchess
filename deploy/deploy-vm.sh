#!/usr/bin/env bash
# Publica a API + o front na VM Oracle.
# Compila aqui (no WSL) e manda só o resultado: a VM de 1 GB não precisa rodar tsc/vite.
#
# Uso: deploy/deploy-vm.sh   (VM_HOST e DOMAIN vêm de deploy/deploy.env ou do ambiente)
set -euo pipefail

# Destinos do deploy: ficam em deploy/deploy.env (fora do git). Veja deploy/deploy.env.example.
CONFIG="$(cd "$(dirname "$0")" && pwd)/deploy.env"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && source "$CONFIG"
VM_HOST="${VM_HOST:?defina VM_HOST em deploy/deploy.env (apelido do ssh ou usuario@ip)}"
DOMAIN="${DOMAIN:?defina DOMAIN em deploy/deploy.env (ex.: chess.seudominio.com)}"
REMOTE_DIR=/opt/faelchess
WEB_DIR=/var/www/faelchess
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Compilando shared, API e front"
npm run build:shared >/dev/null
npm run build -w @faelchess/api >/dev/null
npm run build -w @faelchess/web >/dev/null

echo "==> Preparando pastas na VM"
ssh "$VM_HOST" "sudo mkdir -p $REMOTE_DIR $WEB_DIR && sudo chown -R \$USER: $REMOTE_DIR $WEB_DIR"

echo "==> Enviando código compilado"
# Os package.json de todos os workspaces vão junto para o package-lock continuar válido no npm ci.
rsync -az --delete --relative \
  package.json package-lock.json \
  packages/shared/package.json packages/shared/dist packages/shared/data \
  apps/api/package.json apps/api/dist \
  apps/web/package.json apps/analysis-worker/package.json apps/mcp-server/package.json \
  deploy/faelchess-api.service deploy/Caddyfile \
  "$VM_HOST:$REMOTE_DIR/"
rsync -az --delete apps/web/dist/ "$VM_HOST:$WEB_DIR/"

echo "==> Instalando dependências de produção da API e reiniciando"
ssh "$VM_HOST" "set -e
cd $REMOTE_DIR
npm ci --omit=dev --no-audit --no-fund -w @faelchess/api >/tmp/faelchess-npm.log 2>&1 || { tail -20 /tmp/faelchess-npm.log; exit 1; }
if [ ! -f apps/api/.env ]; then
  echo '!! apps/api/.env não existe na VM: crie a partir do .env.example antes de subir a API'; exit 1
fi
sudo cp deploy/faelchess-api.service /etc/systemd/system/faelchess-api.service
sed 's/chess.seudominio.com/$DOMAIN/' deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable faelchess-api >/dev/null 2>&1
sudo systemctl restart faelchess-api
sudo systemctl reload caddy
# A API leva alguns segundos para conectar no Atlas na subida.
for i in \$(seq 1 30); do curl -sf http://127.0.0.1:3000/api/health && exit 0; sleep 1; done
sudo journalctl -u faelchess-api -n 20 --no-pager; exit 1
"
echo
echo "==> Pronto: https://$DOMAIN"
