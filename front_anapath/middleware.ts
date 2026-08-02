import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/authCookie';
import { decodeJwtPayload } from '@/lib/jwt';

const LOGIN_URL =
  process.env.NEXT_PUBLIC_AUTH_LOGIN_URL ||
  'https://authentification-front.vercel.app/login';

const ANAPATH_SERVICE_ID = process.env.AUTH_ANAPATH_SERVICE_ID;

const PROTECTED_ROUTES: Array<{
  path: string;
  permission: string;
  blockedForMajor?: boolean;
}> = [
  { path: '/dashboard',  permission: 'anapath:read',         blockedForMajor: false },
  { path: '/worklist',   permission: 'anapath:update',       blockedForMajor: true },
  { path: '/validation', permission: 'anapath:update',       blockedForMajor: true },
  { path: '/archives',   permission: 'anapath:archive:view', blockedForMajor: true },
  { path: '/reports',    permission: 'anapath:report:export', blockedForMajor: false },
];

function isMajorService(permissions: string[]): boolean {
  return (
    permissions.includes('anapath:report:export') &&
    !permissions.includes('anapath:update')
  );
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const payload = decodeJwtPayload(token);

  if (
    !payload ||
    (payload.exp && payload.exp * 1000 < Date.now())
  ) {
    const res = NextResponse.redirect(LOGIN_URL);
    res.cookies.delete(AUTH_COOKIE_NAME);
    return res;
  }

  const entry = payload?.services?.find(
    (s: any) => s.serviceId === ANAPATH_SERVICE_ID,
  );
  const userPermissions: string[] = entry?.permissions ?? [];
  const major = isMajorService(userPermissions);

  const pathname = request.nextUrl.pathname;

  for (const route of PROTECTED_ROUTES) {
    if (pathname.startsWith(route.path)) {
      if (major && route.blockedForMajor) {
        return NextResponse.redirect(
          new URL('/dashboard', request.url),
        );
      }
      if (!userPermissions.includes(route.permission)) {
        return NextResponse.redirect(
          new URL('/dashboard', request.url),
        );
      }
      break;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!auth/sso|api|_next/static|_next/image|favicon.ico|assets).*)',
  ],
};
