export interface ChuInfo {
  id?: string;
  name?: string;
  phone?: string;
  address?: string;
  email?: string;
  logo?: string;       // nom du fichier logo (à lire via le proxy /api/anapath/files/)
  logoUrl?: string;    // URL complète (service upload, protégée) — indicative
}

export interface AnapathServiceClaim {
  serviceId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  chu?: ChuInfo;
}

export interface JwtPayload {
  userId: string;
  name: string;
  firstname: string;
  email: string;
  services?: AnapathServiceClaim[];
  iat?: number;
  exp?: number;
}

/** Decodes a JWT payload without verifying the signature (we never have the signing secret — see AuthProvider). Works in both Edge middleware and Node route handlers via `atob`. */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const decoded = JSON.parse(json);
    return normalizePayload(decoded);
  } catch {
    return null;
  }
}

/**
 * Normalise le nommage des permissions du service d'authentification vers le
 * nommage canonique utilisé par le front et le backend.
 *
 * Le portail peut émettre des permissions préfixées "anatomiepath:" (ex.
 * "anatomiepath:read") alors que le middleware, le front et le backend
 * n'attendent que "anapath:". Sans ce mapping, aucune permission n'est
 * reconnue et toutes les pages protégées redirigent en boucle
 * (ERR_TOO_MANY_REDIRECTS). Le mapping est neutre si le portail émet déjà
 * "anapath:".
 */
function normalizePayload(payload: any): JwtPayload {
  if (!payload || !Array.isArray(payload.services)) return payload;
  payload.services = payload.services.map((service: any) => {
    if (Array.isArray(service.permissions)) {
      service.permissions = service.permissions.map((p: string) =>
        p.startsWith('anatomiepath:')
          ? 'anapath:' + p.slice('anatomiepath:'.length)
          : p,
      );
    }
    return service;
  });
  return payload;
}
