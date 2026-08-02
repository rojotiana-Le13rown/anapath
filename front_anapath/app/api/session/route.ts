import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/authCookie';
import { decodeJwtPayload } from '@/lib/jwt';

const ANAPATH_SERVICE_ID = process.env.AUTH_ANAPATH_SERVICE_ID;

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const payload = decodeJwtPayload(token);
  const entry = payload?.services?.find((s) => s.serviceId === ANAPATH_SERVICE_ID);
  if (!payload || !entry) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
  }

  return NextResponse.json({
    name: payload.name,
    firstname: payload.firstname,
    email: payload.email,
    roleName: entry.roleName,
    permissions: entry.permissions,
    chu: entry.chu ?? null,
  });
}
