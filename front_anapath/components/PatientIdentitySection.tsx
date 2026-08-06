'use client';

import { useEffect, useState } from 'react';
import PatientAvatar from './PatientAvatar';
import { getPriseEnChargeById } from '@/lib/api';

export interface PatientInfo {
  nomComplet?: string;
  nom?: string;
  prenom?: string;
  age?: number | null;
  sexe?: string | null;
  dateNaissance?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  cin?: string | null;
  profession?: string | null;
  contactUrgence?: string | null;
  priseEnChargeId?: string | null;
}

export interface PriseEnChargeInfo {
  id?: string;
  companyName?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

interface PatientIdentitySectionProps {
  examen: {
    patientId: string;
    metadata?: Record<string, unknown> | null;
  } | null;
  patient: PatientInfo | null;
  loading?: boolean;
  title?: string;
  className?: string;
  historiqueButton?: React.ReactNode;
}

function SkeletonField() {
  return <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />;
}

function Field({
  label,
  value,
  loading,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  bold?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      {loading ? (
        <SkeletonField />
      ) : (
        <p className={bold ? 'font-bold text-on-surface' : 'font-medium text-on-surface'}>{value}</p>
      )}
    </div>
  );
}

export default function PatientIdentitySection({
  examen,
  patient,
  loading = false,
  title = 'Identité Patient',
  className = '',
  historiqueButton,
}: PatientIdentitySectionProps) {
  const [priseEnCharge, setPriseEnCharge] = useState<PriseEnChargeInfo | null>(null);
  const [pecLoading, setPecLoading] = useState(false);

  // Détail de la prise en charge (entreprise qui couvre le patient) reçu du
  // service CHU par id — affiché dès que patient.priseEnChargeId est présent.
  useEffect(() => {
    let cancelled = false;
    const pecId = patient?.priseEnChargeId;
    if (!pecId) {
      setPriseEnCharge(null);
      setPecLoading(false);
      return;
    }
    setPecLoading(true);
    getPriseEnChargeById(pecId)
      .then((d) => {
        if (!cancelled) setPriseEnCharge(d);
      })
      .finally(() => {
        if (!cancelled) setPecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patient?.priseEnChargeId]);

  const nomComplet = patient?.nomComplet
    || patient?.nom
    || '—';
  const ageDisplay = patient?.age !== null && patient?.age !== undefined
    ? `${patient.age} ans`
    : '—';
  const sexeDisplay = patient?.sexe === 'MALE' ? 'Masculin'
    : patient?.sexe === 'FEMALE' ? 'Féminin' : '—';
  const dateNaissance = patient?.dateNaissance
    ? new Date(patient.dateNaissance).toLocaleDateString('fr-FR')
    : '—';
  const serviceNom = (examen?.metadata?.serviceNom as string) ?? '—';
  const chuNom = (examen?.metadata?.chuNom as string) ?? '—';

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <PatientAvatar nom={patient?.nom} prenom={patient?.prenom} size="sm" />
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</label>
        </div>
        {historiqueButton}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Nom complet" value={nomComplet} loading={loading} bold />
        <Field label="Âge" value={ageDisplay} loading={loading} />
        <Field label="Sexe" value={sexeDisplay} loading={loading} />
        <Field label="Date de naissance" value={dateNaissance} loading={loading} />
        <Field label="Téléphone" value={patient?.telephone ?? '—'} loading={loading} />
        <Field label="Adresse" value={patient?.adresse ?? '—'} loading={loading} />
        <Field label="CIN" value={patient?.cin ?? '—'} loading={loading} />
        <Field label="Profession" value={patient?.profession ?? '—'} loading={loading} />
        <Field label="Contact d'urgence" value={patient?.contactUrgence ?? '—'} loading={loading} />
        <Field label="Service demandeur" value={serviceNom} loading={loading && !examen} />
        <Field label="CHU" value={chuNom} loading={loading && !examen} />
        <Field
          label="Prise en charge"
          loading={pecLoading && !priseEnCharge}
          value={
            priseEnCharge ? (
              <span
                title={
                  priseEnCharge.contactPhone || priseEnCharge.contactEmail
                    ? `Tél : ${priseEnCharge.contactPhone ?? '—'}\nEmail : ${priseEnCharge.contactEmail ?? '—'}`
                    : undefined
                }
              >
                {priseEnCharge.companyName ?? '—'}
              </span>
            ) : (
              '—'
            )
          }
        />
      </div>
    </div>
  );
}