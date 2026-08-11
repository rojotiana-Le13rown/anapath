'use client';

import { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '@/lib/api';
import { renderHtmlToPdf, escapeHtml } from '@/lib/pdfUtils';
import { formatDateLong } from '@/lib/dateFormat';

type TypePrelevement = 'EXOCOL' | 'COUPOLE_VAGINALE';
type Fixation = 'ENDOCOL' | 'CULS_DE_SAC';

interface ExamenSpeculumData {
  observations?: string;
  prelevementDetails?: string;
  dateExamen?: string;
  typePrelevement?: TypePrelevement;
  fixation?: Fixation;
  prescripteurSignature?: string;
  preleveurSignature?: string;
}

interface ExamenSpeculumFormProps {
  requestId: string;
  anapathId?: string;
  patientName?: string;
  initialData?: ExamenSpeculumData | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_PRELEVEMENT_LABELS: Record<TypePrelevement, string> = {
  EXOCOL: 'Exocol',
  COUPOLE_VAGINALE: 'Coupole vaginale',
};

const FIXATION_LABELS: Record<Fixation, string> = {
  ENDOCOL: 'Endocol',
  CULS_DE_SAC: 'Culs de sac',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const toggleClass = (active: boolean) =>
  `flex-1 text-center px-3 h-11 rounded-lg border text-xs font-semibold transition-colors active:scale-95 ${
    active
      ? 'bg-primary text-white border-primary'
      : 'bg-white text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
  }`;

export default function ExamenSpeculumForm({
  requestId,
  anapathId,
  patientName,
  initialData,
  onClose,
  onSaved,
}: ExamenSpeculumFormProps) {
  const [observations, setObservations] = useState(initialData?.observations ?? '');
  const [prelevementDetails, setPrelevementDetails] = useState(initialData?.prelevementDetails ?? '');
  const [dateExamen, setDateExamen] = useState(initialData?.dateExamen ?? today());
  const [typePrelevement, setTypePrelevement] = useState<TypePrelevement | undefined>(initialData?.typePrelevement);
  const [fixation, setFixation] = useState<Fixation | undefined>(initialData?.fixation);
  const [prescripteurSignature, setPrescripteurSignature] = useState(initialData?.prescripteurSignature ?? '');
  const [preleveurSignature, setPreleveurSignature] = useState(initialData?.preleveurSignature ?? '');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isValid =
    observations.trim() !== '' &&
    prelevementDetails.trim() !== '' &&
    Boolean(typePrelevement) &&
    Boolean(fixation) &&
    prescripteurSignature.trim() !== '' &&
    preleveurSignature.trim() !== '';

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/anapath/${requestId}/examen-speculum`, {
        observations,
        prelevementDetails,
        dateExamen,
        typePrelevement,
        fixation,
        prescripteurSignature,
        preleveurSignature,
      });
      onSaved();
    } catch (error) {
      console.error('Erreur enregistrement examen spéculum:', error);
      alert("Erreur lors de l'enregistrement de l'examen spéculum");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const html = `
        <html><head><style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #191c21; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .muted { color: #666; font-size: 12px; margin-bottom: 24px; }
          .label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; letter-spacing: 0.05em; }
          .value { font-size: 14px; margin: 2px 0 16px; }
          .row { display: flex; gap: 24px; }
          .row .value { flex: 1; }
          hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
          .sig-row { display: flex; gap: 32px; margin-top: 40px; }
          .sig { flex: 1; text-align: center; }
          .sig-line { border-bottom: 1px solid #333; min-height: 32px; padding-bottom: 4px; font-size: 13px; }
          .sig-label { margin-top: 6px; font-size: 12px; font-weight: bold; color: #414752; }
        </style></head>
        <body>
          <h1>Examen Spéculum</h1>
          <p class="muted">${escapeHtml(anapathId ?? '')}${anapathId && patientName ? ' — ' : ''}${escapeHtml(patientName ?? '')} — ${escapeHtml(formatDateLong(new Date()))}</p>

          <div class="label">Observations cliniques</div>
          <div class="value">${escapeHtml(observations || '—')}</div>

          <hr/>

          <div class="row">
            <div>
              <div class="label">Prélèvement</div>
              <div class="value">${escapeHtml(prelevementDetails || '—')}</div>
            </div>
            <div>
              <div class="label">Date de l'examen</div>
              <div class="value">${escapeHtml(dateExamen || '—')}</div>
            </div>
          </div>

          <div class="row">
            <div>
              <div class="label">Type de prélèvement</div>
              <div class="value">${typePrelevement ? TYPE_PRELEVEMENT_LABELS[typePrelevement] : '—'}</div>
            </div>
            <div>
              <div class="label">Fixation</div>
              <div class="value">${fixation ? FIXATION_LABELS[fixation] : '—'}</div>
            </div>
          </div>

          <hr/>

          <div class="sig-row">
            <div class="sig">
              <div class="sig-line">${escapeHtml(prescripteurSignature)}</div>
              <div class="sig-label">Le prescripteur</div>
            </div>
            <div class="sig">
              <div class="sig-line">${escapeHtml(preleveurSignature)}</div>
              <div class="sig-label">Le préleveur</div>
            </div>
          </div>
        </body></html>
      `;
      await renderHtmlToPdf(html, `Examen_Speculum_${anapathId ?? requestId}.pdf`);
    } catch (error) {
      console.error('Erreur PDF examen spéculum:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#00284d] to-[#00478d]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-white">clinical_notes</span>
            <h3 className="font-bold text-lg text-white">Examen Spéculum</h3>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors" aria-label="Fermer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-on-surface-variant bg-primary/5 border border-primary/10 rounded-lg p-2.5">
            Préalable obligatoire avant de saisir le résultat d&apos;un examen FCV / Pap test.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Examen spéculum <span className="text-red-500">*</span>
            </label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observations cliniques..."
              rows={5}
              className="w-full p-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface resize-none focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          <hr className="border-outline-variant/30" />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Prélèvement <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={prelevementDetails}
              onChange={(e) => setPrelevementDetails(e.target.value)}
              placeholder="Détails du prélèvement..."
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
            />

            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                Date :
              </label>
              <div className="relative flex-1">
                <input
                  type="date"
                  value={dateExamen}
                  onChange={(e) => setDateExamen(e.target.value)}
                  className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface appearance-none"
                />
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-lg">
                  calendar_today
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" className={toggleClass(typePrelevement === 'EXOCOL')} onClick={() => setTypePrelevement('EXOCOL')}>
                Exocol
              </button>
              <button
                type="button"
                className={toggleClass(typePrelevement === 'COUPOLE_VAGINALE')}
                onClick={() => setTypePrelevement('COUPOLE_VAGINALE')}
              >
                Coupole vaginale
              </button>
            </div>
          </div>

          <hr className="border-outline-variant/30" />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Fixation <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <button type="button" className={toggleClass(fixation === 'ENDOCOL')} onClick={() => setFixation('ENDOCOL')}>
                Endocol
              </button>
              <button
                type="button"
                className={toggleClass(fixation === 'CULS_DE_SAC')}
                onClick={() => setFixation('CULS_DE_SAC')}
              >
                Culs de sac
              </button>
            </div>
          </div>

          <hr className="border-outline-variant/30" />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-center text-xs font-bold text-on-surface-variant">Le prescripteur</p>
              <input
                type="text"
                value={prescripteurSignature}
                onChange={(e) => setPrescripteurSignature(e.target.value)}
                placeholder="Signature"
                className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-center text-xs font-bold text-on-surface-variant">Le préleveur</p>
              <input
                type="text"
                value={preleveurSignature}
                onChange={(e) => setPreleveurSignature(e.target.value)}
                placeholder="Signature"
                className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!isValid || exporting}
            title={!isValid ? 'Remplissez le formulaire pour pouvoir exporter le PDF' : undefined}
            className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${
              isValid && !exporting
                ? 'bg-blue-700 text-white hover:bg-blue-800'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {exporting ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {exporting ? 'Génération...' : 'Exporter PDF'}
          </button>
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
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
