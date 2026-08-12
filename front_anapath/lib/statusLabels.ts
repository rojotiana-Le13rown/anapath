export const statusLabels: Record<string, string> = {
    CREEE: 'En attente de validation',
    EN_ATTENTE: 'En cours de traitement',
    EN_COURS: "En attente d'analyse technique",
    EN_ATTENTE_DIAGNOSTIC: 'En attente de diagnostic',
    EN_ATTENTE_PATHOLOGUE: "Prêt pour l'examen demandé",
    RESULTAT_DISPONIBLE: 'Résultat saisi',
    VALIDE: 'Terminé',
    ARCHIVE: 'Archivé',
    ANNULEE: 'Annulé',
  };

  // Statuts « en attente » (non clôturés) pour les indicateurs des rapports.
  // Couvre tout le flux de travail actuel (EN_COURS, EN_ATTENTE_DIAGNOSTIC,
  // EN_ATTENTE_PATHOLOGUE, RESULTAT_DISPONIBLE) et pas seulement l'ancien CREEE.
  export const PENDING_STATUSES = [
    'CREEE',
    'EN_ATTENTE',
    'EN_COURS',
    'EN_ATTENTE_DIAGNOSTIC',
    'EN_ATTENTE_PATHOLOGUE',
    'RESULTAT_DISPONIBLE',
  ];

  /** Statuts clôturés (terminé/archivé/annulé). */
  export const CLOSED_STATUSES = ['VALIDE', 'ARCHIVE', 'ANNULEE'];
  
  export const statusColors: Record<string, string> = {
    CREEE: 'bg-gray-100 text-gray-700',
    EN_ATTENTE: 'bg-blue-100 text-blue-700',
    EN_COURS: 'bg-yellow-100 text-yellow-700',
    EN_ATTENTE_DIAGNOSTIC: 'bg-cyan-100 text-cyan-700',
    EN_ATTENTE_PATHOLOGUE: 'bg-violet-100 text-violet-700',
    RESULTAT_DISPONIBLE: 'bg-amber-100 text-amber-800',
    VALIDE: 'bg-green-100 text-green-700',
    ARCHIVE: 'bg-slate-100 text-slate-700',
    ANNULEE: 'bg-red-100 text-red-700',
  };
  