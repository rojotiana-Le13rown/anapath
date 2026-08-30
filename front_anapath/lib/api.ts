import axios from 'axios';

/** Client HTTP partagé — timeout élevé pour le cold start Render (plan gratuit). */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

export const ANAPATH_SERVICE_ID = '14a94274-db57-49e3-9375-1e642729b92b';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function getExamen(id: string): Promise<any> {
  try {
    const { data } = await api.get(`/anapath/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function getPatientForExamen(examId: string): Promise<any> {
  try {
    const res = await fetch(
      `${API_BASE}/anapath/${examId}/patient`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getChus(): Promise<any[]> {
  try {
    const { data } = await api.get('/anapath/chu');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getChuById(id: string): Promise<any> {
  try {
    const { data } = await api.get(`/anapath/chu/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function getPriseEnChargeById(id: string): Promise<any> {
  try {
    const { data } = await api.get(`/anapath/prise-en-charge/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function getAnapathServiceInfo(): Promise<any> {
  try {
    const { data } = await api.get('/anapath/service/anapath');
    return data;
  } catch {
    return null;
  }
}

export async function getNotificationsAnapath(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/anapath/notifications`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Ticket WebSocket temps réel : le backend renvoie le JWT de session courant
 * (validé via le cookie httpOnly, illisible en JS) pour s'authentifier sur la
 * Gateway socket.io `/anapath`. Retourne null si non connecté / indisponible.
 */
export async function getWsTicket(): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE}/anapath/notifications/ws-ticket`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

export async function getUnreadNotifications(): Promise<any[]> {
  try {
    const res = await fetch(
      `${API_BASE}/anapath/notifications/non-lues`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/anapath/notifications/${id}/lire`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {}
}

export async function marquerNotifLue(examId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/anapath/${examId}/notification-lue`, {
      method: 'PATCH',
    });
  } catch {}
}

/** Accepte une prescription en attente — la fait entrer dans le fil de travail. Retourne la demande créée. */
export async function accepterPrescriptionNotif(notificationId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/anapath/notifications/${notificationId}/accepter`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || 'Échec de l\'acceptation');
  }
  return res.json();
}

/** Refuse une prescription en attente — motif obligatoire, informe le service Prescription. */
export async function refuserPrescriptionNotif(notificationId: string, motif: string): Promise<void> {
  const res = await fetch(`${API_BASE}/anapath/notifications/${notificationId}/refuser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motif }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || 'Échec du refus');
  }
}

/**
 * Envoie le rapport hebdomadaire (modèle CHU) de la secrétaire au major via le
 * backend. La notification est destinée UNIQUEMENT au major (la secrétaire ne
 * voit plus son propre envoi dans la cloche).
 */
export async function envoyerRapportAuMajor(params: {
  du?: string;
  au?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/anapath/rapports/hebdomadaire/envoyer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ du: params.du ?? null, au: params.au ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || 'Échec de l\'envoi du rapport au major');
  }
}

/** Liste des prescriptions refusées (pour affichage dans les rapports). */
export async function getPrescriptionsRefusees(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/anapath/notifications/refusees`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Liste des prescriptions acceptées (pour les statistiques de la page Nouvelles demandes). */
export async function getPrescriptionsAcceptees(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/anapath/notifications/acceptees`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Détails à jour d'une demande de prescription externe (service Prescription) :
 * renvoie { prescription, demande } ou null. Utilisé par la cloche pour
 * afficher toutes les informations saisies, au-delà du snapshot du pull.
 */
export async function getPrescriptionExterneDetails(
  prescriptionId: string,
  demandeId: string,
): Promise<{ prescription: any; demande: any } | null> {
  try {
    const res = await fetch(
      `${API_BASE}/anapath/prescriptions/externes/${prescriptionId}/demandes/${demandeId}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getExamenStatut(
  examId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/anapath/${examId}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.statut ?? null;
  } catch {
    return null;
  }
}
