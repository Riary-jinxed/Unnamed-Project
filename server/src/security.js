// Protections communes du serveur : limites de tentatives (connexion, clé d'administration), en-têtes de sécurité,
// politique de contenu (CSP) des pages, empreinte des jetons de session.
import { createHash } from 'node:crypto';

// Adresse du joueur. Derrière l'hébergeur (Render), la vraie adresse est la dernière ajoutée à X-Forwarded-For :
// les précédentes peuvent venir du navigateur et sont donc ignorées. Sans en-tête : l'adresse de la connexion.
export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return fwd.length ? fwd[fwd.length - 1] : req.socket?.remoteAddress || '?';
}

// Compteur d'échecs par clé (adresse, identifiant) sur une fenêtre glissante : au-delà de max échecs en windowMs,
// la clé est bloquée jusqu'à ce que les plus anciens sortent de la fenêtre. Une réussite efface les échecs de la clé.
export function failLimiter({ max, windowMs }) {
  const fails = new Map();
  const recent = (key, now) => (fails.get(key) || []).filter(t => now - t < windowMs);
  // Purge régulière : la table ne grossit pas avec des adresses qui ne reviennent jamais.
  setInterval(() => { const now = Date.now(); for (const k of fails.keys()) { const r = recent(k, now); if (r.length) fails.set(k, r); else fails.delete(k); } }, windowMs).unref();
  return {
    // Millisecondes à attendre avant un nouvel essai (0 : autorisé).
    wait(key, now = Date.now()) { const r = recent(key, now); return r.length >= max ? windowMs - (now - r[0]) : 0; },
    fail(key, now = Date.now()) { const r = recent(key, now); r.push(now); fails.set(key, r); },
    clear(key) { fails.delete(key); },
  };
}

// Débit de messages d'une connexion WebSocket : seau de jetons (rate par seconde, burst au plus).
export function tokenBucket(rate, burst) {
  let tokens = burst, at = Date.now();
  return () => { const now = Date.now(); tokens = Math.min(burst, tokens + ((now - at) / 1000) * rate); at = now; if (tokens < 1) return false; tokens -= 1; return true; };
}

// Les jetons de session ne sont gardés (comptes, base de données) que sous forme d'empreinte : une fuite de la base
// ne donne pas de session utilisable. L'empreinte fait 64 caractères, un jeton 48 : les anciens jetons se reconnaissent.
export const tokenHash = token => createHash('sha256').update(String(token)).digest('hex');
export const isTokenHash = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

// En-têtes de sécurité de toutes les réponses. HSTS seulement quand la page est servie en HTTPS (derrière Render).
export function securityHeaders(req) {
  const https = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    ...(https ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

// Politique de contenu d'une page HTML : scripts du site seulement (plus les scripts écrits dans la page, par leur empreinte),
// polices Google, images du site ou en data:/blob: (images de profil, vignettes), connexions au site (API, WebSocket).
// Les attributs style= sont partout dans l'appli : les styles en ligne restent permis.
// Empreintes des scripts écrits dans la page, calculées une fois au chargement du fichier.
export const inlineHashes = html => [...String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
// host : le WebSocket du site est nommé en entier (wss://hôte), d'anciens Safari ne le comptent pas dans 'self'.
export function csp(hashes, host) {
  const ws = /^[\w.-]+(:\d+)?$/.test(host || '') ? ` wss://${host} ws://${host}` : '';
  return ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(), "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "media-src 'self' data: blob:", `connect-src 'self' data: blob:${ws}`,
    "worker-src 'self' blob:", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
}
