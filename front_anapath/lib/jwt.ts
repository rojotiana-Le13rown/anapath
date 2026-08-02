export interface ChuInfo {
  id?: string;
  name?: string;
  phone?: string;
  address?: string;
  email?: string;
  logoUrl?: string;
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
    return JSON.parse(json);
  } catch {
    return null;
  }
}
