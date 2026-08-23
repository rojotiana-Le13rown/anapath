'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { PERMISSIONS } from '@/lib/permissions';
import { isTechnicienUser } from '@/lib/roles';
import ConfirmDialog from './ConfirmDialog';
import FloatingModal from './FloatingModal';

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
    // Réservé au technicien/histotechnicien (acceptation/refus des prescriptions).
    technicienOnly: true,
  },
  {
    name: 'Fil de travail',
    href: '/worklist',
    icon: 'clinical_notes',
    // Lecture seule (READ) pour suivre les prélèvements (Histotechnicien,
    // Secrétaire) ; écriture avec UPDATE ou OBSERVATION_WRITE.
    requiredPermission: [PERMISSIONS.READ, PERMISSIONS.UPDATE, PERMISSIONS.OBSERVATION_WRITE],
    allowedForMajor: false,
  },
  {
    name: 'Archives',
    href: '/archives',
    icon: 'inventory_2',
    requiredPermission: PERMISSIONS.READ,
    allowedForMajor: true,
  },
  {
    name: 'Rapports',
    href: '/reports',
    icon: 'analytics',
    requiredPermission: PERMISSIONS.REPORT_EXPORT,
    allowedForMajor: true,
  },
];

interface PersonnelContact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

const PERSONNEL_CONTACTS: PersonnelContact[] = [];

export default function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, isMajor, logout, user } = useAuth();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  const visibleNavigation = ALL_NAVIGATION.filter((item) => {
    if (isMajor && !item.allowedForMajor) return false;
    if ('technicienOnly' in item && item.technicienOnly && !isTechnicienUser(user)) {
      return false;
    }
    const required = Array.isArray(item.requiredPermission)
      ? item.requiredPermission
      : [item.requiredPermission];
    return required.some((p) => hasPermission(p));
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
        <div className="rounded-xl bg-white/5 p-3 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
            Numéro flotte personnel
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-white/70">
            Liste de contact de personnel
          </p>
          <button
            onClick={() => setShowContacts(true)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white text-xs font-semibold"
          >
            <span className="material-symbols-outlined text-sm">groups</span>
            voir
          </button>
        </div>
        <button
          onClick={() => setConfirmLogoutOpen(true)}
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

      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Déconnexion"
        message="Voulez-vous vraiment vous déconnecter ?"
        confirmLabel="Se déconnecter"
        danger
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          logout();
        }}
        onCancel={() => setConfirmLogoutOpen(false)}
      />

      {showContacts && (
        <FloatingModal
          open
          onClose={() => setShowContacts(false)}
          icon="contacts"
          title="Liste de contact de personnel"
          maxWidthPx={512}
          heightPct={0.8}
          bodyClassName="p-4"
        >
          {PERSONNEL_CONTACTS.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Aucun numéro flotte disponible pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {PERSONNEL_CONTACTS.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{contact.name}</p>
                    <p className="text-xs text-slate-500 truncate">{contact.role}</p>
                  </div>
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00478d]/10 text-[#00478d] text-xs font-bold whitespace-nowrap hover:bg-[#00478d]/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">call</span>
                    {contact.phone}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </FloatingModal>
      )}
    </aside>
  );
}
