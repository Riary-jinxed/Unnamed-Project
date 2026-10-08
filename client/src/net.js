// Connexion au serveur de parties, avec reconnexion automatique.
export function connectOnline(handlers, firstMsg) {
  let ws, closed = false, session = null;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function open(msg) {
    ws = new WebSocket(url);
    ws.onopen = () => send(msg);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'lobby') { session = { room: m.room, token: m.token }; handlers.onLobby(m); }
      else if (m.t === 'state') handlers.onView(m.view, m.room);
      else if (m.t === 'error') { closed = true; ws.close(); handlers.onError(m.msg); }
      else if (m.t === 'gone') { closed = true; ws.close(); handlers.onGone(); }
      else if (m.t === 'left') { closed = true; ws.close(); handlers.onLeft(); }
    };
    ws.onclose = () => {
      if (closed) return;
      const s = session || (firstMsg.t === 'rejoin' ? firstMsg : null);
      if (s) setTimeout(() => !closed && open({ t: 'rejoin', room: s.room, token: s.token }), 1500);
      else handlers.onError('Impossible de joindre le serveur de parties.');
    };
  }
  if (firstMsg.t === 'rejoin') session = { room: firstMsg.room, token: firstMsg.token };
  open(firstMsg);
  return {
    submit: plan => send({ t: 'plan', ...plan }),
    rematch: () => send({ t: 'rematch' }),
    leave: () => { send({ t: 'leave' }); closed = true; ws.close(); },
  };
}
