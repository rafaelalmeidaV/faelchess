# faelchess

Xadrez pessoal para evoluir sem o premium do chess.com: jogar contra bots (Stockfish no navegador), PvP local e online por link. Toda partida é salva no MongoDB, cada lance é classificado (Brilhante, Ótimo, Melhor, Excelente, Bom, Imprecisão, Erro, Capivarada) e um servidor MCP expõe tudo para uma IA explicar onde você erra e acerta.

## Estrutura

| Pasta | O que é | Onde roda |
|---|---|---|
| `packages/shared` | Tipos do schema, win%, classificação, fases, aberturas | (biblioteca) |
| `apps/api` | NestJS 11: REST + Socket.IO (partidas online) | VM Oracle |
| `apps/web` | React + chessground + chess.js + Stockfish WASM | Navegador (servido pelo Caddy) |
| `apps/analysis-worker` | Fila de análise com Stockfish nativo | PC de casa |
| `apps/mcp-server` | Tools MCP lendo do mesmo Mongo | Onde a IA roda (seu PC) |
| `deploy/` | Caddyfile, units systemd, config do Cloudflare Tunnel | |

Fluxo: o navegador joga e manda os lances UCI para a API; a API revalida tudo com chess.js, grava com `analysisStatus: "pending"`; o worker em casa puxa a partida, avalia cada posição (MultiPV, com cache na coleção `positions`), classifica e grava; o front mostra a análise e o MCP lê os padrões.

## Desenvolvimento local

Este comando instala as dependências de todos os apps de uma vez (npm workspaces) e copia o Stockfish WASM para `apps/web/public/engine`:

```bash
npm install
```

Este comando sobe um MongoDB local em `127.0.0.1:27017`, com os dados em `.devdata/` (baixa o binário na primeira vez):

```bash
npm run dev:mongo
```

Este comando compila o pacote compartilhado, que a API, o worker e o MCP importam já compilado:

```bash
npm run build:shared
```

Este comando sobe a API em modo watch na porta 3000 (crie antes `apps/api/.env` a partir do `.env.example`, com `MONGODB_URI=mongodb://127.0.0.1:27017`):

```bash
npm run dev:api
```

Este comando sobe o front em `http://localhost:5173`, com proxy de `/api` e `/socket.io` para a API:

```bash
npm run dev:web
```

Este comando compila e roda o worker de análise (crie `apps/analysis-worker/.env` a partir do exemplo e aponte `STOCKFISH_PATH` para o binário):

```bash
npm run dev:worker
```

Este comando roda os testes (classificação, sacrifício, garfo, fases, precisão, parser UCI); com `STOCKFISH_PATH` definido, roda também o teste com o Stockfish de verdade:

```bash
npm test
```

## MongoDB Atlas

1. Crie um cluster **M0** (grátis, 512 MB) em São Paulo ou na região mais próxima.
2. Em *Database Access*, crie um usuário com senha forte e permissão de leitura/escrita.
3. Em *Network Access*, libere o IP da VM Oracle e o IP de casa. Se o IP de casa for dinâmico, use `0.0.0.0/0` (por isso a senha forte).
4. Copie a string de conexão (*Connect > Drivers*) para `MONGODB_URI` na API, no worker e no MCP.

A API cria os índices sozinha ao subir. Coleções: `games` (partidas e lances), `positions` (cache de avaliações) e `live_games` (partidas online em andamento, para sobreviverem a um restart da API).

## Deploy na VM Oracle (API + front + Caddy)

Regra de ouro: na VM só ficam API, Caddy e TeamSpeak. Nada de Stockfish ou Mongo lá.

Este comando instala o Node 22 a partir do repositório oficial da NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Este comando clona o projeto em `/opt/faelchess` (ajuste a URL do repositório):

```bash
sudo git clone <url-do-repo> /opt/faelchess && sudo chown -R ubuntu: /opt/faelchess
```

Este comando instala as dependências e compila o shared, a API e o front (na VM de 1 GB demora um pouco, e o swap ajuda):

```bash
cd /opt/faelchess && npm ci && npm run build:shared && npm run build -w @faelchess/api -w @faelchess/web
```

Este comando copia o front compilado para a pasta que o Caddy serve:

```bash
sudo mkdir -p /var/www/faelchess && sudo cp -r apps/web/dist/* /var/www/faelchess/
```

Este comando cria o `.env` da API a partir do exemplo, para você preencher `MONGODB_URI` e, se quiser, `ACCESS_KEY`:

```bash
cp apps/api/.env.example apps/api/.env && nano apps/api/.env
```

Este comando instala o serviço systemd da API (com teto de memória e prioridade menor que o TeamSpeak) e o inicia:

```bash
sudo cp deploy/faelchess-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now faelchess-api
```

Este comando instala o Caddy pelo repositório oficial:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list && sudo apt update && sudo apt install -y caddy
```

Este comando coloca o Caddyfile do projeto no lugar (troque `chess.seudominio.com` pelo seu domínio antes) e recarrega o Caddy:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

### Portas 80 e 443 na Oracle

Elas precisam ser liberadas em **dois lugares**: na Security List/NSG da VCN (console da Oracle) e no iptables da VM, porque a imagem Ubuntu da Oracle bloqueia tudo menos SSH.

Este comando insere uma regra no iptables permitindo conexões novas nas portas TCP 80 e 443:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp -m multiport --dports 80,443 -j ACCEPT
```

Este comando salva as regras para sobreviverem a um reinício:

```bash
sudo netfilter-persistent save
```

### Alternativa sem abrir portas: Cloudflare Tunnel

Use `deploy/Caddyfile.tunnel` (Caddy em `:8080`, sem TLS) e `deploy/cloudflared-config.yml`. A VM só faz conexão de saída e o WebSocket funciona normalmente pelo tunnel.

### Atualizar depois (scripts de deploy)

Os scripts em `deploy/` compilam na sua máquina e mandam só o resultado por `rsync`, então a VM não precisa rodar `tsc` nem `vite`. Os destinos ficam em `deploy/deploy.env`, que não vai para o git.

Este comando cria o seu `deploy.env` a partir do exemplo, para você preencher `VM_HOST`, `DOMAIN` e `WORKER_HOST`:

```bash
cp deploy/deploy.env.example deploy/deploy.env && nano deploy/deploy.env
```

Este comando compila e publica a API e o front na VM (instala as dependências de produção, atualiza o Caddyfile e reinicia o serviço):

```bash
deploy/deploy-vm.sh
```

Este comando compila e publica o worker na máquina de análise (serviço systemd de usuário, sem sudo):

```bash
deploy/deploy-worker.sh
```

Este comando pede a senha do Atlas uma vez (sem eco) e grava nos `.env` remotos da VM e do worker, no lugar do marcador `<db_password>`:

```bash
deploy/set-db-password.sh
```

## Worker de análise no PC de casa

O worker só faz conexões de saída (para o Atlas), então não precisa abrir porta no roteador. Ele pega uma partida por vez, renova um "heartbeat" a cada minuto e devolve para a fila partidas que ficaram travadas em `processing` por mais de `STUCK_MINUTES` (PC desligou, caiu a internet). Depois de 3 tentativas, a partida vira `failed`.

1. Baixe o Stockfish em https://stockfishchess.org/download/ e anote o caminho do executável.
2. Copie `apps/analysis-worker/.env.example` para `.env` e preencha `MONGODB_URI` e `STOCKFISH_PATH`.

Este comando instala as dependências e compila o shared e o worker:

```bash
npm ci && npm run build:shared && npm run build -w @faelchess/analysis-worker
```

Este comando roda o worker (lendo o `.env` da pasta dele):

```bash
npm start -w @faelchess/analysis-worker
```

No **Linux**, este comando instala o serviço systemd (com `Nice=19`, para o PC continuar leve) e o deixa ligado sempre:

```bash
sudo cp deploy/faelchess-worker.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now faelchess-worker
```

No **Windows**, este comando instala o pm2 para manter o worker rodando em segundo plano:

```bash
npm i -g pm2
```

E este comando registra o worker no pm2 com prioridade baixa (rode de dentro de `apps/analysis-worker`):

```bash
pm2 start dist/main.js --name faelchess-worker --node-args="--env-file=.env" && pm2 save
```

## MCP server

Este comando compila o MCP server:

```bash
npm run build:shared && npm run build -w @faelchess/mcp-server
```

Este comando registra o servidor no Claude Code (troque o caminho e a string de conexão):

```bash
claude mcp add faelchess -e MONGODB_URI="mongodb+srv://..." -e FAELCHESS_USER_ID=bruno -- node /caminho/para/faelchess/apps/mcp-server/dist/main.js
```

No Claude Desktop, o equivalente vai no `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "faelchess": {
      "command": "node",
      "args": ["/caminho/para/faelchess/apps/mcp-server/dist/main.js"],
      "env": { "MONGODB_URI": "mongodb+srv://...", "FAELCHESS_USER_ID": "bruno" }
    }
  }
}
```

Tools (todas só leitura):

| Tool | Para quê |
|---|---|
| `get_game` | Partida completa com classificação, melhor lance, tags e tempo; nos erros, FEN e linha do engine |
| `list_games` | Partidas recentes com resultado, abertura, adversário e precisão |
| `get_worst_moves` | Piores lances (por perda de win%), filtráveis por fase, tag, abertura, nível do bot... |
| `get_stats_by_opening` | Aproveitamento, precisão e erros por abertura |
| `get_blunder_patterns` | Taxa de erro por fase, peça, tempo gasto, cor, adversário, pressão de relógio e tags táticas, com exemplos |
| `get_accuracy_trend` | Evolução semanal/mensal da precisão |
| `get_position_analysis` | Linhas do engine para um FEN (do cache) |

Exemplo de pergunta para a IA: *"Use o faelchess: onde eu mais perco partidas contra bots de 1400? Mostre 3 lances concretos e explique o padrão."*

## Como a classificação funciona

Cada posição é avaliada com MultiPV (padrão: depth 16, 3 linhas). A avaliação vira chance de vitória pela curva do Lichess, sempre do ponto de vista de quem jogou, e a perda é `win% do melhor lance - win% depois do lance jogado`.

| Classificação | Regra |
|---|---|
| Melhor | lance do engine (ou empatado com ele) |
| Excelente / Bom / Imprecisão / Erro / Capivarada | perda < 2 / < 5 / < 10 / < 20 / ≥ 20 |
| Ótimo | melhor lance com ≥ 15 pontos de win% de vantagem sobre o 2º (exceto recapturas e mate em 1) |
| Brilhante | sacrifício (a peça movida é capturada e o déficit persiste, ou fica oferecida) em lance ≤ Excelente, que deixa a posição ≥ 50% e não estava já ≥ 90% |

Regras de mate (como no Lichess): permitir um mate forçado ou perder um mate forçado é Capivarada, a menos que a posição já estivesse decidida (aí cai para Erro ou Imprecisão).

As faixas ficam em `packages/shared/src/classify.ts` (`LOSS_THRESHOLDS`, `GREAT_MIN_GAP`, ...). Depois de ajustar, use o botão **Reanalisar** na partida (ou `POST /api/games/:id/reanalyze`); o cache de posições faz a reanálise ser quase instantânea.

### Ideias trazidas do Lichess (lila / scalachess)

Reescritas em TypeScript, não copiadas (o lila é AGPL):

- **Precisão do lance:** curva exponencial sobre a perda de win%, com 1 ponto de "incerteza".
- **Precisão da partida:** média entre a média ponderada pela volatilidade da posição (desvio-padrão do win% numa janela) e a média harmônica, que pesa mais os lances muito ruins.
- **Divisão em fases** (Divider): o meio-jogo começa com ≤ 10 peças, primeira fileira esvaziando ou peças misturadas ("mixedness"); o final começa com ≤ 6 peças. Daí sai a precisão por fase.
- **Regras de mate** (MateAdvice), descritas acima.

Uso pessoal não tem problema de licença. Se um dia for distribuir, revise o AGPL (lila) e o GPL (Stockfish).

## Decisões que diferem do handoff

- **Nest 11** em vez do 12: o 12 virou ESM-only há poucas semanas.
- **Driver nativo do MongoDB** em vez do Mongoose: os tipos do schema ficam num lugar só (`shared`), usados igualmente por API, worker e MCP.
- **`analysisStartedAt`** em vez de `startedAt` no claim do worker: o trecho do handoff sobrescreveria o `startedAt` da partida.
- **Roteamento por hash** (`#/game/abc`): sem dependência extra e sem regra de fallback no Caddy.
- **Relógio online** só começa depois do primeiro lance de cada lado, como no Lichess. Queda de bandeira contra quem não tem material para dar mate é empate. Abandono: 2 minutos desconectado durante a partida.
- **Bot:** de 1400 para cima usa `UCI_Elo` do Stockfish (mínimo 1320); abaixo disso usa `Skill Level` + profundidade baixa, o que é só uma aproximação de Elo.
- Partidas que não conseguem ser enviadas (API fora do ar) ficam no `localStorage` e são reenviadas quando o app abre de novo.

## Segurança

- A API só escuta em `127.0.0.1`; quem expõe é o Caddy.
- `ACCESS_KEY` (opcional) protege as rotas REST; informe a mesma chave em *Configurações* no front. Entrar numa partida online pelo link continua público.
- Online: o servidor é a autoridade (valida turno, token, legalidade e relógio). Os tokens dos jogadores são guardados só como hash sha256 no Mongo. Há limite de eventos por socket.
