'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { isMajorService } from '@/lib/permissions';
import type { ChuInfo } from '@/lib/jwt';

interface SessionUser {
  name: string;
  firstname: string;
  email: string;
  roleName: string;
  permissions: string[];
  isMajor: boolean;
  chu?: ChuInfo | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  isMajor: boolean;
  logout: () => Promise<void>;
}

const LOGIN_URL =
  process.env.NEXT_PUBLIC_AUTH_LOGIN_URL ||
  'https://authentification-front.vercel.app/login';

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  hasPermission: () => false,
  isMajor: false,
  logout: async () => {},
});

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUser({
            ...data,
            isMajor: isMajorService(data.permissions ?? []),
          });
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const hasPermission = useCallback(
    (permission: string) =>
      user?.permissions.includes(permission) ?? false,
    [user],
  );

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = LOGIN_URL;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        hasPermission,
        isMajor: user?.isMajor ?? false,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
