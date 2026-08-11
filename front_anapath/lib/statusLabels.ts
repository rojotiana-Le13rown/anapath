export const statusLabels: Record<string, string> = {
    CREEE: 'En attente de validation',
    EN_ATTENTE: 'En cours de traitement',
    EN_COURS: 'En analyse',
    EN_ATTENTE_PATHOLOGUE: "Prêt pour l'examen demandé",
    RESULTAT_DISPONIBLE: 'Résultat saisi',
    VALIDE: 'Terminé',
    ARCHIVE: 'Archivé',
    ANNULEE: 'Annulé',
  };
  
  export const statusColors: Record<string, string> = {
    CREEE: 'bg-gray-100 text-gray-700',
    EN_ATTENTE: 'bg-blue-100 text-blue-700',
    EN_COURS: 'bg-yellow-100 text-yellow-700',
    EN_ATTENTE_PATHOLOGUE: 'bg-violet-100 text-violet-700',
    RESULTAT_DISPONIBLE: 'bg-amber-100 text-amber-800',
    VALIDE: 'bg-green-100 text-green-700',
    ARCHIVE: 'bg-slate-100 text-slate-700',
    ANNULEE: 'bg-red-100 text-red-700',
  };
  