import type { NextFunction, Request, Response } from 'express';

// 3章：ログイン状態はサーバーが発行する Cookie（署名付き）で保つ
const CHILD_COOKIE = 'kansha_uid';
const ADMIN_COOKIE = 'kansha_admin';
const DAY = 24 * 60 * 60 * 1000;

const opts = (req: Request, maxAge: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: req.secure,
  signed: true,
  maxAge,
  path: '/',
});

export function setChild(req: Request, res: Response, userId: string) {
  res.cookie(CHILD_COOKIE, userId, opts(req, 365 * DAY));
}

export function childId(req: Request): string | null {
  const v = req.signedCookies?.[CHILD_COOKIE];
  return typeof v === 'string' && v ? v : null;
}

export function clearChild(res: Response) {
  res.clearCookie(CHILD_COOKIE, { path: '/' });
}

export function setAdmin(req: Request, res: Response) {
  const exp = Date.now() + 14 * DAY;
  res.cookie(ADMIN_COOKIE, `admin:${exp}`, opts(req, 14 * DAY));
}

export function isAdmin(req: Request): boolean {
  const v = req.signedCookies?.[ADMIN_COOKIE];
  if (typeof v !== 'string' || !v.startsWith('admin:')) return false;
  return Number(v.slice(6)) > Date.now();
}

export function clearAdmin(res: Response) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: 'ログインしてください' });
    return;
  }
  next();
}
