import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';

const COOKIE_NAME = 'mindora_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, number>();
const attempts = new Map<string, { count: number; until: number }>();

function cookies(header: string | undefined): Map<string, string> {
  return new Map((header || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isWebAuthenticated(req: http.IncomingMessage, now = Date.now()): boolean {
  const id = cookies(req.headers.cookie).get(COOKIE_NAME);
  if (!id) return false;
  const expires = sessions.get(id);
  if (!expires || expires <= now) { sessions.delete(id); return false; }
  return true;
}

export function handleWebAuth(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, method: string, body?: Record<string, unknown>): boolean {
  if (pathname === '/api/auth/me' && method === 'GET') {
    res.writeHead(isWebAuthenticated(req) ? 200 : 401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ authenticated: isWebAuthenticated(req) })); return true;
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    const configured = process.env.MINDORA_WEB_ACCESS_TOKEN;
    const remote = req.socket.remoteAddress || 'unknown'; const now = Date.now();
    const current = attempts.get(remote);
    if (current && current.until > now && current.count >= 5) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(Math.ceil((current.until - now) / 1000)), 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Too many sign-in attempts. Try again later.' })); return true;
    }
    const supplied = typeof body?.accessToken === 'string' ? body.accessToken : '';
    if (!configured || configured.length < 24 || !supplied || !safeEqual(configured, supplied)) {
      const count = current && current.until > now ? current.count + 1 : 1;
      attempts.set(remote, { count, until: now + 15 * 60 * 1000 });
      const status = configured ? 401 : 503;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: configured ? 'Invalid access token.' : 'Web dashboard sign-in is not configured.' })); return true;
    }
    attempts.delete(remote);
    const id = randomBytes(32).toString('base64url'); sessions.set(id, now + SESSION_TTL_MS);
    const secure = Boolean((req.socket as typeof req.socket & { encrypted?: boolean }).encrypted) || req.headers['x-forwarded-proto'] === 'https';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': `${COOKIE_NAME}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}` });
    res.end(JSON.stringify({ authenticated: true })); return true;
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const id = cookies(req.headers.cookie).get(COOKIE_NAME); if (id) sessions.delete(id);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    res.end(JSON.stringify({ authenticated: false })); return true;
  }
  return false;
}

export function resetWebAuthForTests(): void { sessions.clear(); attempts.clear(); }
