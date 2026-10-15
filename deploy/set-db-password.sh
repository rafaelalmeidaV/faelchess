#!/usr/bin/env bash
# Grava a senha do Atlas no .env da VM (API) e da máquina de casa (worker) e liga os dois serviços.
# A senha é lida sem eco e vai pela entrada padrão do ssh: não aparece em linha de comando nem em `ps`.
# Só substitui o marcador <db_password>; para trocar uma senha já gravada, edite os .env à mão.
set -euo pipefail

# Destinos do deploy: ficam em deploy/deploy.env (fora do git). Veja deploy/deploy.env.example.
CONFIG="$(cd "$(dirname "$0")" && pwd)/deploy.env"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && source "$CONFIG"
VM_HOST="${VM_HOST:?defina VM_HOST em deploy/deploy.env}"
WORKER_HOST="${WORKER_HOST:?defina WORKER_HOST em deploy/deploy.env}"

read -rsp "Senha do usuário do Atlas: " PASS
echo
if [[ ! "$PASS" =~ ^[A-Za-z0-9._~-]+$ ]]; then
  echo "A senha tem caracteres que quebram a string de conexão (@ : / # ...). Gere outra só com letras e números."
  exit 1
fi

apply() { # host, arquivo .env, comando para (re)iniciar o serviço
  printf '%s\n' "$PASS" | ssh "$1" "read -r P; grep -q '<db_password>' $2 || { echo '$1: sem marcador <db_password> (senha já gravada?)'; exit 0; }; sed -i \"s|<db_password>|\$P|\" $2 && $3 && echo '$1: senha gravada e serviço iniciado'"
}

apply "$VM_HOST" /opt/faelchess/apps/api/.env "sudo systemctl restart faelchess-api"
apply "$WORKER_HOST" '~/faelchess/apps/analysis-worker/.env' "systemctl --user restart faelchess-worker"
