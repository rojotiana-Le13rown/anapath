'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NotificationBell from './NotificationBell';
import { useSearch } from './SearchContext';
import { useAuth } from './AuthProvider';

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Bonjour, ${name}`;
  if (hour >= 12 && hour < 18) return `Bon après-midi, ${name}`;
  return `Bonsoir, ${name}`;
}

const DATE_FMT = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as const;
const TIME_FMT = { hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export default function TopBar() {
  const { searchQuery, setSearchQuery } = useSearch();
  const { user, loading } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const displayName = loading
    ? '…'
    : user
      ? `${user.firstname} ${user.name}`.trim()
      : 'Utilisateur';

  // Horloge en direct (mise à jour chaque seconde) affichée sous l'icône profil.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = capitalize(now.toLocaleDateString('fr-FR', DATE_FMT));
  const timeLabel = now.toLocaleTimeString('fr-FR', TIME_FMT);

  return (
    <header className="w-full sticky top-0 z-50 bg-white/80 backdrop-blur-xl shadow-sm shadow-blue-900/5">
      <div className="flex justify-between items-center px-6 py-3">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-lg font-black text-blue-900 tracking-tight whitespace-nowrap">{getGreeting(displayName)}</h2>
          
          <div className="h-6 w-[1px] bg-outline-variant/30"></div>
          
          <div className="relative group w-56 lg:w-72" title="Rechercher">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white rounded-full border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:w-full w-full text-sm transition-all"
              placeholder="Rechercher (patient, ID, type…)"
              title="Rechercher"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-right leading-tight mr-1">
            <span className="material-symbols-outlined text-[#00478d] text-sm">calendar_today</span>
            <div>
              <div className="text-[13px] font-semibold text-[#00478d]">{dateLabel}</div>
              <div className="text-xs font-bold tabular-nums text-sky-500">{timeLabel}</div>
            </div>
          </div>
          
          <NotificationBell />
          
          <Link
            href="/profile"
            title="Mon profil"
            className="flex items-center gap-2 pl-2"
          >
            <div className="w-8 h-8 rounded-full bg-[#00478d]/10 flex items-center justify-center hover:bg-[#00478d]/20 transition-colors">
              <span className="material-symbols-outlined text-[#00478d] text-sm">person</span>
            </div>
          </Link>
        </div>
      </div>

    </header>
  );
}
