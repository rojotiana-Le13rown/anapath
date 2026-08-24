'use client';

import { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '@/lib/api';
import FloatingModal from '@/components/FloatingModal';

interface DiagnosticCytoponctionData {
  sitePreleve?: string;
  organe?: string;
  fixation?: string;
  validatedByName?: string | null;
  validatedAt?: string | null;
}

interface DiagnosticCytoponctionFormProps {
  requestId: string;
  anapathId?: string;
  patientName?: string;
  initialData?: DiagnosticCytoponctionData | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DiagnosticCytoponctionForm({
  requestId,
  anapathId,
  patientName,
  initialData,
  onClose,
  onSaved,
}: DiagnosticCytoponctionFormProps) {
  const alreadyValidated = Boolean(initialData?.sitePreleve && initialData?.organe && initialData?.fixation);
  const [sitePreleve, setSitePreleve] = useState(initialData?.sitePreleve ?? '');
  const [organe, setOrgane] = useState(initialData?.organe ?? '');
  const [fixation, setFixation] = useState(initialData?.fixation ?? '');
  const [saving, setSaving] = useState(false);

  const isValid =
    sitePreleve.trim() !== '' && organe.trim() !== '' && fixation.trim() !== '';

  const handleSubmit = async () => {
    if (!isValid || alreadyValidated) return;
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/anapath/${requestId}/diagnostic-cytoponction`, {
        sitePreleve: sitePreleve.trim(),
        organe: organe.trim(),
        fixation: fixation.trim(),
      });
      onSaved();
    } catch (error) {
      console.error('Erreur validation diagnostic cytoponction:', error);
      alert("Erreur lors de la validation du diagnostic");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full p-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface resize-none focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed';

  const sousTitre = [anapathId, patientName].filter(Boolean).join(' — ');

  return (
    <FloatingModal
      open
      onClose={onClose}
      icon="biotech"
      title="Diagnostic cytoponction"
      subtitle={sousTitre || undefined}
      maxWidthPx={672}
      bodyClassName="p-4 space-y-4"
    >
      <div>
          <p className="text-xs text-on-surface-variant bg-primary/5 border border-primary/10 rounded-lg p-2.5">
            Diagnostic anticipé par le pathologiste avant l&apos;examen technique. La validation
            notifie le technicien que le patient est prêt pour un examen technique.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Site prélevé <span className="text-red-500">*</span>
            </label>
            <textarea
              value={sitePreleve}
              onChange={(e) => setSitePreleve(e.target.value)}
              readOnly={alreadyValidated}
              placeholder="Localisation précise du prélèvement — ex. : sein droit, quadrant supéro-externe ; ganglion cervical gauche…"
              rows={2}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Organe concerné <span className="text-red-500">*</span>
            </label>
            <textarea
              value={organe}
              onChange={(e) => setOrgane(e.target.value)}
              readOnly={alreadyValidated}
              placeholder="Organe ponctionné — ex. : sein, ganglion lymphatique, thyroïde, glande salivaire…"
              rows={2}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Fixation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={fixation}
              onChange={(e) => setFixation(e.target.value)}
              readOnly={alreadyValidated}
              placeholder="Fixateur utilisé — ex. : alcool absolu, spray fixateur, formol 10 %, frottis à l'air sec…"
              rows={2}
              className={inputCls}
            />
          </div>

          {alreadyValidated && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Diagnostic déjà validé
              {initialData?.validatedByName ? ` par ${initialData.validatedByName}` : ''}
              {initialData?.validatedAt
                ? ` le ${new Date(initialData.validatedAt).toLocaleDateString('fr-FR')} à ${new Date(initialData.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low"
          >
            Fermer
          </button>
          {!alreadyValidated && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || saving}
              className={`px-6 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${
                isValid && !saving ? 'bg-primary text-white hover:opacity-90' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {saving ? 'progress_activity' : 'check_circle'}
              </span>
              {saving ? 'Validation...' : "Valider le diagnostic"}
            </button>
          )}
        </div>
    </FloatingModal>
  );
}
