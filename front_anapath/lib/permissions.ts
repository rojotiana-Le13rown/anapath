export const PERMISSIONS = {
  READ:          'anapath:read',
  UPDATE:        'anapath:update',
  VALIDATE:      'anapath:validate',
  CANCEL:        'anapath:cancel',
  ARCHIVE_VIEW:  'anapath:archive:view',
  REPORT_EXPORT: 'anapath:report:export',
} as const;

export const PERMISSION_RULES = {
  DASHBOARD_VIEW:     PERMISSIONS.READ,
  WORKLIST_VIEW:      PERMISSIONS.UPDATE,
  WORKLIST_TAKEOVER:  PERMISSIONS.UPDATE,
  VALIDATION_WRITE:   PERMISSIONS.UPDATE,
  VALIDATION_SIGN:    PERMISSIONS.VALIDATE,
  EXAM_CANCEL:        PERMISSIONS.CANCEL,
  ARCHIVE_VIEW:       PERMISSIONS.ARCHIVE_VIEW,
  ARCHIVE_PDF:        PERMISSIONS.ARCHIVE_VIEW,
  REPORT_VIEW:        PERMISSIONS.REPORT_EXPORT,
  REPORT_AUTO:        PERMISSIONS.REPORT_EXPORT,
  NOTIFICATION_VIEW:  PERMISSIONS.READ,
} as const;

export function isMajorService(permissions: string[]): boolean {
  return (
    permissions.includes(PERMISSIONS.REPORT_EXPORT) &&
    !permissions.includes(PERMISSIONS.UPDATE)
  );
}
