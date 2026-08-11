import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/authCookie';
import { decodeJwtPayload } from '@/lib/jwt';
import { isTechnicienRole } from '@/lib/roles';

const LOGIN_URL =
  process.env.NEXT_PUBLIC_AUTH_LOGIN_URL ||
  'https://authentification-front.vercel.app/login';

// Fallback en dur si AUTH_ANAPATH_SERVICE_ID n'est pas configuré sur l'environnement de déploiement
// (Render) : sans repli, aucune permission n'est jamais trouvée et toutes les pages protégées
// redirigent (même symptôme que "toujours expulsé après connexion").
const ANAPATH_SERVICE_ID =
  process.env.AUTH_ANAPATH_SERVICE_ID || '9e73904c-71e5-4477-9280-513e4112a468';

// Sur Render, l'app écoute sur un port interne (3031) : request.url pointe vers
// localhost. APP_BASE_URL (domaine public) force les redirections vers le bon hôte.
const APP_BASE_URL = process.env.APP_BASE_URL;

const PROTECTED_ROUTES: Array<{
  path: string;
  // Une seule permission requise, ou une liste dont une seule suffit (ex. le
  // fil de travail : lecture seule pour Histotechnicien/Secrétaire avec juste
  // anapath:read, écriture pour anapath:update / anapath:observation:write).
  permission: string | string[];
  blockedForMajor?: boolean;
  // Réservé au technicien/histotechnicien (acceptation/refus des prescriptions).
  technicienOnly?: boolean;
}> = [
  { path: '/dashboard',  permission: 'anapath:read',         blockedForMajor: false },
  { path: '/demandes',   permission: 'anapath:update',       blockedForMajor: true, technicienOnly: true },
  { path: '/worklist',   permission: ['anapath:read', 'anapath:update', 'anapath:observation:write'], blockedForMajor: true },
  { path: '/validation', permission: ['anapath:update', 'anapath:observation:write'], blockedForMajor: true },
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
  // Le portail d'authentification redirige vers la racine du front avec
  // ?accessToken=...&serviceId=... (son baseUrl configuré = la racine, pas
  // /auth/sso). On route ce token vers /auth/sso — exclu du middleware — qui
  // valide le jeton et pose le cookie de session. Sans ça : boucle de login.
  const incomingToken = request.nextUrl.searchParams.get('accessToken');
  if (incomingToken) {
    const ssoUrl = new URL('/auth/sso', APP_BASE_URL || request.url);
    ssoUrl.search = request.nextUrl.search;
    return NextResponse.redirect(ssoUrl);
  }

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
  const technicien = isTechnicienRole(entry?.roleName, userPermissions);

  const pathname = request.nextUrl.pathname;

  for (const route of PROTECTED_ROUTES) {
    if (pathname.startsWith(route.path)) {
      if (major && route.blockedForMajor) {
        return NextResponse.redirect(
          new URL('/dashboard', APP_BASE_URL || request.url),
        );
      }
      if (route.technicienOnly && !technicien) {
        // Les nouvelles demandes (acceptation/refus des prescriptions) sont
        // réservées au technicien/histotechnicien : un pathologiste ne peut
        // pas les traiter et n'a pas à les voir.
        return NextResponse.redirect(
          new URL('/worklist', APP_BASE_URL || request.url),
        );
      }
      const requiredPermissions = Array.isArray(route.permission)
        ? route.permission
        : [route.permission];
      if (!requiredPermissions.some((p) => userPermissions.includes(p))) {
        return NextResponse.redirect(
          new URL('/dashboard', APP_BASE_URL || request.url),
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
