'use client';

import { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '@/lib/api';
import { appendFinalSegment } from '@/lib/formatTranscript';
import VoiceRecorder from '@/components/VoiceRecorder';
import FloatingModal from '@/components/FloatingModal';

interface ExamenTechniqueData {
  compteRendu?: string;
  validatedByName?: string | null;
  validatedAt?: string | null;
}

interface ExamenTechniqueFormProps {
  requestId: string;
  anapathId?: string;
  patientName?: string;
  initialData?: ExamenTechniqueData | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ExamenTechniqueForm({
  requestId,
  anapathId,
  patientName,
  initialData,
  onClose,
  onSaved,
}: ExamenTechniqueFormProps) {
  const alreadyValidated = Boolean(initialData?.compteRendu);
  const [compteRendu, setCompteRendu] = useState(initialData?.compteRendu ?? '');
  const [interim, setInterim] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid = compteRendu.trim() !== '';

  // Colle la transcription en direct au texte définitif, sans dédoubler les séparateurs.
  const withInterim = (committed: string, interimText: string): string => {
    if (!interimText) return committed;
    if (interimText.startsWith('\n')) return committed + interimText;
    return committed.trim() ? `${committed} ${interimText}` : interimText;
  };

  const handleSubmit = async () => {
    if (!isValid || alreadyValidated) return;
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/anapath/${requestId}/examen-technique`, {
        compteRendu: compteRendu.trim(),
      });
      onSaved();
    } catch (error) {
      console.error('Erreur validation examen technique:', error);
      alert("Erreur lors de la validation de l'examen technique");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FloatingModal
      open
      onClose={onClose}
      icon="science"
      title="Examen technique"
      maxWidthPx={672}
      bodyClassName="p-4 space-y-4"
    >
      <div>
          <p className="text-xs text-on-surface-variant bg-primary/5 border border-primary/10 rounded-lg p-2.5">
            {anapathId ? `${anapathId} — ` : ''}{patientName || 'Patient'} — compte rendu de l&apos;examen technique. La
            validation clôt le travail du technicien et notifie le pathologiste.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Compte rendu d&apos;examen technique <span className="text-red-500">*</span>
            </label>
            {!alreadyValidated && (
              <div className="flex justify-end">
                <VoiceRecorder
                  hideTextArea
                  statusIdleText="Dicter le compte rendu"
                  onTranscriptChange={(data) => setInterim(data.interim ?? '')}
                  onRestart={() => {
                    setCompteRendu('');
                    setInterim('');
                  }}
                  onFinalTranscript={(text, meta) =>
                    setCompteRendu((prev) => appendFinalSegment(prev, text, meta?.startsAfterPause ?? false))
                  }
                />
              </div>
            )}
            <textarea
              value={withInterim(compteRendu, interim)}
              onChange={(e) => {
                setCompteRendu(e.target.value);
                setInterim('');
              }}
              readOnly={alreadyValidated}
              placeholder="Techniques réalisées, qualité du matériel, macro/micro... (champ libre)"
              rows={8}
              className="w-full p-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface resize-none focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
          </div>

          {alreadyValidated && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Examen technique déjà validé
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
              {saving ? 'Validation...' : 'Valider l\'examen technique'}
            </button>
          )}
        </div>
    </FloatingModal>
  );
}
