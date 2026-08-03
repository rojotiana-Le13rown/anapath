import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/authCookie';
import { decodeJwtPayload } from '@/lib/jwt';

const LOGIN_URL =
  process.env.NEXT_PUBLIC_AUTH_LOGIN_URL || 'https://authentification-front.vercel.app/login';
// Fallback en dur si AUTH_ANAPATH_SERVICE_ID n'est pas configuré sur l'environnement de déploiement
// (Render) : sans repli, un oubli de variable d'env bloque TOUTE connexion (payload.services.some
// ne matche jamais undefined) — même symptôme que "toujours expulsé après connexion".
const ANAPATH_SERVICE_ID =
  process.env.AUTH_ANAPATH_SERVICE_ID || '9e73904c-71e5-4477-9280-513e4112a468';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('accessToken');
  if (!token) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const payload = decodeJwtPayload(token);
  const hasAnapathAccess = payload?.services?.some(
    (s) => s.serviceId === ANAPATH_SERVICE_ID,
  );

  if (!payload || !hasAnapathAccess || (payload.exp && payload.exp * 1000 < Date.now())) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const maxAge = payload.exp
    ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
    : 60 * 60 * 24;

  // Sur Render, l'app écoute sur un port interne (3031) donc request.url pointe
  // vers localhost. On force le domaine public via APP_BASE_URL quand il est défini.
  const appBase = process.env.APP_BASE_URL || request.url;
  const response = NextResponse.redirect(new URL('/dashboard', appBase));
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return response;
}
