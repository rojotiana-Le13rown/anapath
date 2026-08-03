'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastContext';
import { API_BASE } from '@/lib/api';

interface ProfileData {
  bio: string;
  avatarUrl: string | null;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleBack = () => {
    // Retour à la dernière page visitée ; repli sur le dashboard si pas d'historique.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/dashboard');
  };

  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBio, setSavingBio] = useState(false);
  const [uploading, setUploading] = useState(false);

  const displayName = user
    ? `${user.firstname ?? ''} ${user.name ?? ''}`.trim() || 'Utilisateur'
    : 'Utilisateur';
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    fetch(`${API_BASE}/anapath/profile`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProfileData | null) => {
        if (d) {
          setBio(d.bio ?? '');
          setAvatarUrl(d.avatarUrl ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveBio = async () => {
    try {
      setSavingBio(true);
      const res = await fetch(`${API_BASE}/anapath/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio }),
      });
      if (!res.ok) throw new Error();
      toast.success('Enregistré avec succès');
    } catch {
      toast.error("Échec de l'enregistrement");
    } finally {
      setSavingBio(false);
    }
  };

  const handlePickPhoto = () => fileRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez choisir une image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop lourde (max 5 Mo)');
      return;
    }
    try {
      setUploading(true);
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1] ?? '';
      const res = await fetch(`${API_BASE}/anapath/profile/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          data: base64,
        }),
      });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error);
      // cache-buster pour rafraîchir l'aperçu
      setAvatarUrl(d.avatarUrl ? `${d.avatarUrl}?t=${Date.now()}` : null);
      toast.success('Photo mise à jour');
    } catch {
      toast.error("Échec de l'envoi de la photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-transparent text-[#191c21]">
      <div className="fixed inset-0 grain-overlay z-[60] pointer-events-none"></div>
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <TopBar />
        <div className="flex-1 p-6 w-full max-w-3xl mx-auto">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Retour
          </button>
          <h2 className="text-2xl font-extrabold text-[#191c21] tracking-tight mb-1">Mon profil</h2>
          <p className="text-slate-500 text-sm mb-6">Photo et présentation personnelle</p>

          <div className="bg-white rounded-xl shadow-sm border border-outline-variant/20 p-6">
            {/* En-tête : avatar + identité */}
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Photo de profil" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{initials || '—'}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handlePickPhoto}
                  disabled={uploading}
                  title="Changer la photo"
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary/90 active:scale-95 transition disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-base">
                    {uploading ? 'hourglass_top' : 'photo_camera'}
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
              <div>
                <p className="text-lg font-bold text-on-surface">{displayName}</p>
                <p className="text-sm text-slate-500">{user?.email ?? ''}</p>
                {user?.roleName && (
                  <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                    {user.roleName}
                  </span>
                )}
              </div>
            </div>

            {/* Bio */}
            <div className="mt-6 pt-6 border-t border-outline-variant/20">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={loading}
                rows={4}
                maxLength={500}
                placeholder="Quelques mots sur vous (spécialité, fonction, etc.)"
                className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-y"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{bio.length}/500</span>
                <button
                  type="button"
                  onClick={handleSaveBio}
                  disabled={savingBio || loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary/90 active:scale-95 transition disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  {savingBio ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
