// Appels à l'API des comptes. Une erreur porte le message du serveur et son code HTTP (0 si le serveur est injoignable).
export async function api(method, path, body, token) {
  let res;
  try {
    res = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw Object.assign(new Error('Impossible de joindre le serveur.'), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur du serveur.'), { status: res.status });
  return data;
}
