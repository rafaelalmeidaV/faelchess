import { Chess } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseUci, type Color, type OnlinePublicState } from '@faelchess/shared';
import { Board, type BoardColor } from '../components/Board';
import { Clock } from '../components/Clock';
import { MoveList } from '../components/MoveList';
import { fetchOnlineState, getSocket, joinOnlineGame } from '../lib/online';
import { getOnlineToken, type Profile } from '../lib/profile';
import { navigate } from '../lib/router';
import { resultText } from './PlayPage';

const toBoard = (c: Color): BoardColor => (c === 'w' ? 'white' : 'black');

export function OnlinePage({ gameId, profile }: { gameId: string; profile: Profile }) {
  const [state, setState] = useState<OnlinePublicState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const receivedAt = useRef(performance.now());
  const [token, setToken] = useState(() => getOnlineToken(gameId));
  /** Lance otimista: aparece na hora e some se o servidor rejeitar. */
  const [pending, setPending] = useState<{ fen: string; uci: string } | null>(null);

  // Conecta, entra na sala e escuta o estado.
  useEffect(() => {
    const socket = getSocket();
    const onState = (s: OnlinePublicState) => {
      if (s.id !== gameId) return;
      receivedAt.current = performance.now();
      setPending(null);
      setState(s);
    };
    const onJoined = ({ color }: { color: Color | null }) => setMyColor(color);
    const onGone = (id: string) => id === gameId && setGone(true);
    const onError = (msg: string) => setError(msg);
    const join = () => socket.emit('game:join', { gameId, token: token ?? undefined });

    socket.on('game:state', onState);
    socket.on('game:joined', onJoined);
    socket.on('game:gone', onGone);
    socket.on('move:rejected', onError);
    socket.on('game:error', onError);
    // Reconexão: entra de novo na sala com o mesmo token.
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('game:state', onState);
      socket.off('game:joined', onJoined);
      socket.off('game:gone', onGone);
      socket.off('move:rejected', onError);
      socket.off('game:error', onError);
      socket.off('connect', join);
    };
  }, [gameId, token]);

  // Partida que já saiu da memória do servidor: se foi salva, vai para a análise.
  useEffect(() => {
    if (!gone) return;
    fetchOnlineState(gameId).then((s) => {
      if (!s) navigate(`/game/${gameId}`);
    });
  }, [gone, gameId]);

  // Relógio local: re-render a cada 100 ms enquanto corre.
  useEffect(() => {
    if (!state?.clockRunning || state.status !== 'playing') return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [state?.clockRunning, state?.status]);

  const remaining = useCallback(
    (c: Color) => {
      if (!state) return undefined;
      const base = state.remaining[c];
      const turn = new Chess(state.fen).turn();
      if (!state.clockRunning || state.status !== 'playing' || c !== turn) return base;
      return Math.max(0, base - state.turnElapsedMs - (performance.now() - receivedAt.current));
    },
    // `tick` força o recálculo a cada 100 ms enquanto o relógio corre.
    [state, tick],
  );

  const emit = (event: string, extra: object = {}) => getSocket().emit(event, { gameId, token, ...extra });

  const onMove = (uci: string) => {
    if (!state) return;
    const chess = new Chess(state.fen);
    try {
      chess.move(parseUci(uci));
    } catch {
      return;
    }
    setError('');
    setPending({ fen: chess.fen(), uci });
    emit('move:make', { uci });
  };

  const join = async () => {
    setJoining(true);
    try {
      const res = await joinOnlineGame(gameId, profile);
      setToken(res.token); // reconecta à sala já como jogador
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (gone) return <div className="card muted">Partida encerrada. Abrindo a análise…</div>;
  if (!state) return <div className="card muted">Conectando…</div>;

  const fen = pending?.fen ?? state.fen;
  const turn = new Chess(fen).turn();
  const orientation = toBoard(myColor ?? 'w');
  const top: Color = orientation === 'white' ? 'b' : 'w';
  const bottom: Color = top === 'w' ? 'b' : 'w';
  const seat = (c: Color) => (c === 'w' ? state.white : state.black);
  const seatName = (c: Color) => {
    const s = seat(c);
    if (!s) return 'aguardando…';
    return `${s.name}${s.connected ? '' : ' (desconectado)'}`;
  };
  const lastUci = pending?.uci ?? state.moves.at(-1)?.uci;
  const link = `${window.location.origin}/#/online/${gameId}`;
  const canPlay = state.status === 'playing' && myColor !== null && !pending;
  const freeSeat = state.status === 'waiting' && !myColor;

  return (
    <div className="play">
      <div className="board-col">
        <Clock name={seatName(top)} ms={remaining(top)} active={state.status === 'playing' && turn === top} />
        <Board
          fen={fen}
          orientation={orientation}
          movable={canPlay ? toBoard(myColor!) : undefined}
          lastMove={lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : undefined}
          check={new Chess(fen).inCheck()}
          onMove={onMove}
        />
        <Clock name={seatName(bottom)} ms={remaining(bottom)} active={state.status === 'playing' && turn === bottom} />
      </div>

      <aside className="side">
        {state.status === 'waiting' && myColor && (
          <div className="card">
            <h3>Convite criado</h3>
            <p className="muted small">Mande este link para o adversário. A partida começa quando ele entrar.</p>
            <div className="invite">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {freeSeat && (
          <div className="card">
            <h3>{(state.white ?? state.black)?.name} te convidou</h3>
            <p className="muted small">
              {state.timeControl.baseMs / 60000}+{state.timeControl.incrementMs / 1000} · você joga como {profile.name}
            </p>
            <button className="primary" onClick={join} disabled={joining}>
              {joining ? 'Entrando…' : 'Aceitar e jogar'}
            </button>
          </div>
        )}

        <div className="card">
          <div className="muted small">
            Online · {state.timeControl.baseMs / 60000}+{state.timeControl.incrementMs / 1000}
            {!myColor && state.status !== 'waiting' && ' · assistindo'}
          </div>
          <MoveList moves={state.moves} current={state.moves.length - 1} />
          {error && <p className="error small">{error}</p>}

          {state.status === 'playing' && myColor && (
            <>
              {state.drawOffer && state.drawOffer !== myColor && (
                <div className="draw-offer">
                  Adversário oferece empate
                  <button onClick={() => emit('draw:answer', { accept: true })}>Aceitar</button>
                  <button onClick={() => emit('draw:answer', { accept: false })}>Recusar</button>
                </div>
              )}
              <div className="actions">
                <button disabled={state.drawOffer === myColor} onClick={() => emit('draw:offer')}>
                  {state.drawOffer === myColor ? 'Empate oferecido' : 'Oferecer empate'}
                </button>
                <button className="danger" onClick={() => confirm('Desistir da partida?') && emit('game:resign')}>
                  Desistir
                </button>
              </div>
            </>
          )}
        </div>

        {state.status === 'over' && (
          <div className="card result-card">
            <h3>{resultText(state.result, state.termination, state.white?.name ?? '?', state.black?.name ?? '?')}</h3>
            <p className="muted">Partida salva e na fila de análise.</p>
            <div className="actions">
              <button className="primary" onClick={() => navigate(`/game/${gameId}`)}>
                Ver análise
              </button>
              <button onClick={() => navigate('/')}>Início</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
