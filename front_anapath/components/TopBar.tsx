'use client';

import NotificationBell from './NotificationBell';
import { useSearch } from './SearchContext';
import { useAuth } from './AuthProvider';

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Bonjour, ${name}`;
  if (hour >= 12 && hour < 18) return `Bon après-midi, ${name}`;
  return `Bonsoir, ${name}`;
}

export default function TopBar() {
  const { searchQuery, setSearchQuery } = useSearch();
  const { user, loading } = useAuth();
  const displayName = loading
    ? '…'
    : user
      ? `${user.firstname} ${user.name}`.trim()
      : 'Utilisateur';

  return (
    <header className="w-full sticky top-0 z-50 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 py-3 shadow-sm shadow-blue-900/5">
      <div className="flex items-center gap-4 flex-1">
        <h2 className="text-lg font-black text-blue-900 tracking-tight whitespace-nowrap">{getGreeting(displayName)}</h2>
        
        <div className="h-6 w-[1px] bg-outline-variant/30"></div>
        
        <div className="relative group flex-1 max-w-md" title="Rechercher">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 bg-white rounded-full border border-slate-200 focus:ring-2 focus:ring-primary/20 w-full text-sm transition-all"
            placeholder="Rechercher un patient, un ID, un type, une observation..."
            title="Rechercher"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <NotificationBell />
        
        <div className="flex items-center gap-2 pl-2">
          <div className="w-8 h-8 rounded-full bg-[#00478d]/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#00478d] text-sm">person</span>
          </div>
        </div>
      </div>
    </header>
  );
}
