import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { path: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

/** Roteamento por hash (#/game/abc): sem dependência e sem configuração de fallback no Caddy. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}
