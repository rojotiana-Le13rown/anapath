'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { PERMISSIONS } from '@/lib/permissions';

const ALL_NAVIGATION = [
  {
    name: 'Tableau de bord',
    href: '/dashboard',
    icon: 'dashboard',
    requiredPermission: PERMISSIONS.READ,
    allowedForMajor: true,
  },
  {
    name: 'Nouvelles demandes',
    href: '/demandes',
    icon: 'inbox',
    requiredPermission: PERMISSIONS.UPDATE,
    allowedForMajor: false,
  },
  {
    name: 'Fil de travail',
    href: '/worklist',
    icon: 'clinical_notes',
    requiredPermission: PERMISSIONS.UPDATE,
    allowedForMajor: false,
  },
  {
    name: 'Validation',
    href: '/validation',
    icon: 'fact_check',
    requiredPermission: PERMISSIONS.UPDATE,
    allowedForMajor: false,
  },
  {
    name: 'Archives',
    href: '/archives',
    icon: 'inventory_2',
    requiredPermission: PERMISSIONS.ARCHIVE_VIEW,
    allowedForMajor: false,
  },
  {
    name: 'Rapports',
    href: '/reports',
    icon: 'analytics',
    requiredPermission: PERMISSIONS.REPORT_EXPORT,
    allowedForMajor: true,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, isMajor, logout, user } = useAuth();

  const handleLogout = () => {
    if (confirm('Voulez-vous vous déconnecter ?')) {
      logout();
    }
  };

  const visibleNavigation = ALL_NAVIGATION.filter((item) => {
    if (isMajor && !item.allowedForMajor) return false;
    return hasPermission(item.requiredPermission);
  });

  return (
    <aside
      className="w-64 h-screen fixed left-0 top-0 flex flex-col
        text-white z-40"
      style={{
        backgroundImage: `linear-gradient(
          to bottom,
          rgba(0,40,80,0.85),
          rgba(0,30,60,0.92)
        ), url('/assets/bg-sidebar.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="flex flex-col items-center px-4 pt-6 pb-4">
        <img
          src={user?.chu?.logo ? `/api/anapath/files/${encodeURIComponent(user.chu.logo)}` : '/assets/logo-chu.png'}
          alt={user?.chu?.name ? `Logo ${user.chu.name}` : 'Logo CHU'}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/assets/logo-chu.png'; }}
          className="w-20 h-20 object-contain drop-shadow-lg mb-3"
        />
        <h1 className="text-lg font-bold text-white text-center
          leading-tight drop-shadow-sm">
          Service d&apos;Anatomie Pathologique
        </h1>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {visibleNavigation.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' &&
              pathname.startsWith(item.href + '/'));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3
                rounded-lg transition-all duration-200 ${
                active
                  ? 'text-white font-semibold border-r-4 border-white/80 bg-white/15'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="material-symbols-outlined">
                {item.icon}
              </span>
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 py-4 border-t border-white/20">
        {user?.chu?.phone && (
          <a
            href={`tel:${user.chu.phone}`}
            title={user.chu.name ? `Flotte ${user.chu.name}` : 'Numéro flotte du CHU'}
            className="mb-2 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-base text-white/80">call</span>
            <span className="leading-tight">
              <span className="block text-[10px] uppercase tracking-wider text-white/50">Flotte CHU</span>
              <span className="text-sm font-semibold text-white">{user.chu.phone}</span>
            </span>
          </a>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5
            rounded-lg text-white/90 hover:bg-white/10
            hover:text-white transition-colors text-sm font-medium"
        >
          <span className="material-symbols-outlined text-base">
            logout
          </span>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
