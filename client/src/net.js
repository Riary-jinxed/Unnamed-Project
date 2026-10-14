// Connexion au serveur de parties, avec reprise après une coupure réseau.
// Le serveur garde la place du joueur (jeton du salon) : chaque reconnexion envoie `rejoin` et reçoit l'état de la partie.
// Une connexion morte sans le dire (téléphone qui change de réseau, appli mise en veille) est repérée par un ping régulier.
// Le tour validé hors ligne, ou perdu avec la connexion, est renvoyé dès que le serveur montre qu'il ne l'a pas reçu.
const PING_MS = 10_000, DEAD_MS = 25_000, MAX_WAIT_MS = 8_000;
export function connectOnline(handlers, firstMsg) {
  let ws, closed = false, session = null, timer = null, tries = 0, lastSeen = 0, fresh = false, linked = true;
  let view = null, plan = null, rematch = false;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const link = ok => { if (ok !== linked) { linked = ok; handlers.onLink?.(ok); } };
  function open(msg) {
    clearTimeout(timer); timer = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = null; try { ws.close(); } catch { /* déjà fermée */ } }
    const sock = ws = new WebSocket(url);
    sock.onopen = () => { lastSeen = Date.now(); fresh = true; send(msg); };
    sock.onmessage = e => {
      lastSeen = Date.now();
      const m = JSON.parse(e.data);
      if (m.t === 'pong') return;
      tries = 0; link(true);
      if (m.t === 'lobby') { session = { room: m.room, token: m.token }; handlers.onLobby(m); }
      else if (m.t === 'state') { view = m.view; settle(); handlers.onView(m.view, m.room); }
      else if (m.t === 'emote') handlers.onEmote?.(m.seat, m.id);
      else if (m.t === 'error') { stop(); handlers.onError(m.msg); }
      else if (m.t === 'gone') { stop(); handlers.onGone(); }
      else if (m.t === 'left') { stop(); handlers.onLeft(); }
    };
    sock.onclose = lost;
  }
  // Connexion perdue : on réessaie de plus en plus espacé (1 s, 2 s, 4 s, puis toutes les 8 s), sans jamais abandonner la place.
  function lost() {
    if (closed) return;
    if (!session) { stop(); handlers.onError('Impossible de joindre le serveur de parties.'); return; }
    link(false);
    if (!timer) timer = setTimeout(reconnect, Math.min(1000 * 2 ** tries++, MAX_WAIT_MS));
  }
  const reconnect = () => { if (!closed && session) open({ t: 'rejoin', room: session.room, token: session.token }); };
  // Le tour validé est gardé tant que le serveur ne l'a pas reçu. Au premier état après une reconnexion,
  // le tour (ou la revanche) demandé pendant la coupure part à nouveau.
  function settle() {
    if (plan && (view.phase !== 'plan' || view.turn !== plan.turn || view.ready.me)) plan = null;
    if (rematch && view.phase !== 'over') rematch = false;
    if (!fresh) return;
    fresh = false;
    if (plan) send({ t: 'plan', ...plan });
    if (rematch) send({ t: 'rematch' });
  }
  const beat = setInterval(() => {
    if (!ws || ws.readyState !== 1) return;
    if (Date.now() - lastSeen > DEAD_MS) { ws.onclose = null; ws.close(); lost(); } else send({ t: 'ping' });
  }, PING_MS);
  // Retour du réseau, ou de l'appli au premier plan : on n'attend pas le prochain essai.
  function wake() {
    if (closed || !session || document.visibilityState === 'hidden') return;
    if (!ws || ws.readyState > 1 || Date.now() - lastSeen > PING_MS + 2000) { tries = 0; reconnect(); } else send({ t: 'ping' });
  }
  const offline = () => { if (!closed && session) link(false); };
  window.addEventListener('online', wake); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', wake);
  function stop() {
    closed = true; clearTimeout(timer); clearInterval(beat);
    window.removeEventListener('online', wake); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', wake);
    if (ws) { ws.onclose = null; ws.close(); }
  }
  if (firstMsg.t === 'rejoin') session = { room: firstMsg.room, token: firstMsg.token };
  open(firstMsg);
  return {
    submit: p => { plan = { ...p, turn: view?.turn }; send({ t: 'plan', ...plan }); },
    rematch: () => { rematch = true; send({ t: 'rematch' }); },
    leave: () => { send({ t: 'leave' }); stop(); },
    // Émote envoyée à l'adversaire : le serveur la renvoie aux deux joueurs (perdue si la connexion est coupée).
    emote: id => send({ t: 'emote', id }),
    // Tour validé qui attend le retour de la connexion.
    queued: () => !linked && !!plan,
  };
}
