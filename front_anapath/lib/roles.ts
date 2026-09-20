export type KnownRoleName =
  | 'technicien'
  | 'major'
  | 'chef'
  | 'pathologiste'
  | 'secretaire';

/**
 * Rôle connu d'après le NOM du rôle du JWT (source de vérité), avant toute
 * déduction par permissions. Le nom prime : un major qui posséderait
 * anapath:update ne doit JAMAIS être confondu avec un technicien.
 */
export function knownRoleFromName(
  roleName?: string | null,
): KnownRoleName | null {
  if (!roleName) return null;
  if (/major/i.test(roleName)) return 'major';
  if (/patholog/i.test(roleName)) return 'pathologiste';
  if (/secretair/i.test(roleName)) return 'secretaire';
  if (/chef/i.test(roleName)) return 'chef';
  if (/technicien/i.test(roleName)) return 'technicien';
  return null;
}

/**
 * Un technicien / histotechnicien est le SEUL profil qui accède aux
 * « nouvelles demandes » (acceptation/refus des prescriptions, cloche de
 * notification) et qui réalise l'examen au spéculum.
 *
 * Détection : le nom du rôle du JWT prime ; sinon les permissions le
 * déduisent — un utilisateur qui met à jour les demandes (anapath:update) mais
 * ne les valide pas (anapath:validate) et ne rédige pas les observations
 * (anapath:observation:write) n'est ni pathologiste ni secrétaire.
 */
export function isTechnicienRole(
  roleName?: string | null,
  permissions?: string[] | null,
): boolean {
  const known = knownRoleFromName(roleName);
  if (known === 'technicien') return true;
  if (known) return false;
  if (!permissions) return false;
  return (
    permissions.includes('anapath:update') &&
    !permissions.includes('anapath:validate') &&
    !permissions.includes('anapath:observation:write')
  );
}

/** Utile pour un user de session (lib/auth / /api/session) ou un user décodé du JWT. */
export function isTechnicienUser(user?: {
  roleName?: string | null;
  permissions?: string[] | null;
} | null): boolean {
  return isTechnicienRole(user?.roleName, user?.permissions);
}

/**
 * Le « major du service » est le SEUL profil autorisé à gérer l'importation du
 * rapport (rapport automatique hebdomadaire). Détection par le nom du rôle du
 * JWT (« Major ») : l'heuristique par permissions (isMajorService) détecterait
 * aussi le chef de service, qui consulte les rapports sans pouvoir importer.
 */
export function isMajorRole(roleName?: string | null): boolean {
  return !!roleName && /major/i.test(roleName);
}

/**
 * Le « chef de service » est un profil de CONSULTATION (archives, statistiques,
 * rapports) : il ne traite ni les demandes, ni les examens, ni les validations.
 */
export function isChefRole(roleName?: string | null): boolean {
  return !!roleName && /chef/i.test(roleName);
}

/** Vrai pour un pathologiste : nom du rôle ou permissions (valide et rédige les observations). */
export function isPathologisteRole(
  roleName?: string | null,
  permissions?: string[] | null,
): boolean {
  const known = knownRoleFromName(roleName);
  if (known === 'pathologiste') return true;
  if (known) return false;
  if (!permissions) return false;
  return (
    permissions.includes('anapath:validate') &&
    permissions.includes('anapath:observation:write')
  );
}

/** Vrai pour un user de session (lib/auth / /api/session) ou un user décodé du JWT. */
export function isPathologisteUser(user?: {
  roleName?: string | null;
  permissions?: string[] | null;
} | null): boolean {
  return isPathologisteRole(user?.roleName, user?.permissions);
}

/**
 * Une secrétaire saisit les résultats d'examen mais ne les valide jamais.
 * Détection : nom du rôle (« Secrétaire… »), sinon heuristique par
 * permissions — rédige les observations (anapath:observation:write) sans
 * pouvoir valider (anapath:validate).
 */
export function isSecretaireRole(
  roleName?: string | null,
  permissions?: string[] | null,
): boolean {
  const known = knownRoleFromName(roleName);
  if (known === 'secretaire') return true;
  if (known) return false;
  if (!permissions) return false;
  return (
    permissions.includes('anapath:observation:write') &&
    !permissions.includes('anapath:validate')
  );
}

/** Vrai pour un user de session (lib/auth / /api/session) ou un user décodé du JWT. */
export function isSecretaireUser(user?: {
  roleName?: string | null;
  permissions?: string[] | null;
} | null): boolean {
  return isSecretaireRole(user?.roleName, user?.permissions);
}

export type RecipientGroup = 'technicien' | 'pathologiste' | 'autre';

/**
 * Groupe de destinataires effectif d'un utilisateur pour les notifications.
 * Le major (et tout autre rôle non technique) est « autre » : il ne reçoit
 * aucune notification destinée au technicien ou au pathologiste.
 */
export function userRecipientGroup(user?: {
  roleName?: string | null;
  permissions?: string[] | null;
} | null): RecipientGroup {
  if (!user) return 'autre';
  if (isMajorRole(user.roleName)) return 'autre';
  if (isTechnicienRole(user.roleName, user.permissions)) return 'technicien';
  if (isPathologisteRole(user.roleName, user.permissions)) return 'pathologiste';
  return 'autre';
}

/** Une notification est-elle visible pour un utilisateur de ce groupe ? (miroir du filtre backend) */
export function notificationVisible(
  userGroup: RecipientGroup,
  type?: string | null,
  recipientRole?: string | null,
  isMajor?: boolean,
): boolean {
  // Ciblage exclusif major : seul un major voit la notification (le groupe
  // « autre » est partagé, il faut donc exclure explicitement les non-major,
  // notamment la secrétaire qui vient d'envoyer le rapport).
  if (recipientRole === 'major') {
    return isMajor === true;
  }
  // Le major ne reçoit QUE la notification du rapport hebdomadaire : ni les
  // alertes STAT, ni les notifications destinées au technicien/pathologiste.
  if (isMajor) {
    return type === 'RAPPORT_HEBDOMADAIRE' || type === 'RAPPORT';
  }
  const target: RecipientGroup | undefined =
    recipientRole === 'technicien' || recipientRole === 'pathologiste'
      ? recipientRole
      : type === 'NOUVELLE_PRESCRIPTION' ||
          type === 'PATIENT_PRET_EXAMEN_TECHNIQUE'
        ? 'technicien'
        : type === 'EXAMEN_TECHNIQUE_TERMINE'
          ? 'pathologiste'
          : undefined;
  if (!target) return true;
  return userGroup === target;
}
