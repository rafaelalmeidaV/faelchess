import { useState } from 'react';
import { getAccessKey, saveAccessKey, saveProfile, slugify, type Profile } from '../lib/profile';

/** Também serve de tela de boas-vindas (sem perfil ainda). */
export function SettingsPage({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [userId, setUserId] = useState(profile?.userId ?? '');
  const [key, setKey] = useState(getAccessKey());
  const [saved, setSaved] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = { name: name.trim() || 'Jogador', userId: slugify(userId || name) };
    saveProfile(p);
    saveAccessKey(key.trim());
    setSaved(true);
    onSaved(p);
  };

  return (
    <form className="card settings" onSubmit={submit}>
      <h2>{profile ? 'Configurações' : 'Bem-vindo ao faelchess'}</h2>
      <label>
        Seu nome
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoFocus={!profile} />
      </label>
      <label>
        Id do jogador
        <input value={userId} placeholder={slugify(name || 'jogador')} onChange={(e) => setUserId(e.target.value)} maxLength={40} />
        <span className="muted small">
          É por ele que as partidas são agrupadas (e que o MCP filtra). Use o mesmo id em todos os seus aparelhos.
        </span>
      </label>
      <label>
        Chave de acesso
        <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" />
        <span className="muted small">Só se a API tiver ACCESS_KEY definido.</span>
      </label>
      <button className="primary" type="submit">Salvar</button>
      {saved && <span className="muted small">Salvo.</span>}
    </form>
  );
}
