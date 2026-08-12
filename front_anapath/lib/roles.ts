/**
 * Un technicien / histotechnicien est le SEUL profil qui accède aux
 * « nouvelles demandes » (acceptation/refus des prescriptions, cloche de
 * notification) et qui réalise l'examen au spéculum.
 *
 * Détection : le rôle du JWT le dit explicitement (Chef de service,
 * Histotechnicien…), sinon les permissions le déduisent — un utilisateur qui
 * met à jour les demandes (anapath:update) mais ne les valide pas
 * (anapath:validate) et ne rédige pas les observations
 * (anapath:observation:write) n'est ni pathologiste ni secrétaire : c'est le
 * technicien.
 */
export function isTechnicienRole(
  roleName?: string | null,
  permissions?: string[] | null,
): boolean {
  if (roleName && /technicien/i.test(roleName)) return true;
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

/** Vrai pour un pathologiste : nom du rôle ou permissions (valide et rédige les observations). */
export function isPathologisteRole(
  roleName?: string | null,
  permissions?: string[] | null,
): boolean {
  if (roleName && /patholog/i.test(roleName)) return true;
  if (!permissions) return false;
  return (
    permissions.includes('anapath:validate') &&
    permissions.includes('anapath:observation:write')
  );
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
