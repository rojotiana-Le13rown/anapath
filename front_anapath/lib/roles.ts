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
