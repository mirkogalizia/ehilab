import { adminDB } from './firebase-admin';

type TokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function getGoogleTokens(uid: string) {
  const ref = adminDB.doc(`users/${uid}/google/oauth`);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as any) : null;
}

export async function saveGoogleTokens(uid: string, bundle: TokenBundle) {
  const ref = adminDB.doc(`users/${uid}/google/oauth`);
  const toSave: any = {
    access_token: bundle.access_token,
    scope: bundle.scope || 'https://www.googleapis.com/auth/calendar.events',
    token_type: bundle.token_type || 'Bearer',
  };
  if (bundle.refresh_token) toSave.refresh_token = bundle.refresh_token;
  if (bundle.expires_in) toSave.expiry_date = Date.now() + bundle.expires_in * 1000;
  await ref.set(toSave, { merge: true });
  return toSave;
}

export async function ensureValidAccessToken(uid: string) {
  const cfg = await getGoogleTokens(uid);
  if (!cfg?.access_token) return null;

  // Se non scaduto → ok
  if (cfg.expiry_date && Date.now() < cfg.expiry_date - 60_000) {
    return cfg.access_token;
  }
  // Prova refresh
  if (!cfg.refresh_token) return null;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
    refresh_token: cfg.refresh_token,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as TokenBundle;
  const saved = await saveGoogleTokens(uid, json);
  return saved.access_token;
}

export async function googleApi(uid: string, url: string, init: RequestInit) {
  let token = await ensureValidAccessToken(uid);
  if (!token) throw new Error('Google account non collegato o token mancante');
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error: ${res.status} ${text}`);
  }
  return res.json();
}