import { Injectable, Logger } from '@nestjs/common';

const DOSSIER_PATIENT_BASE_URL =
  process.env.DOSSIER_PATIENT_URL ??
  'https://dossier-patient-back-ri3e.onrender.com';

@Injectable()
export class DossierPatientClient {
  private readonly logger = new Logger('DossierPatientClient');
  private readonly baseUrl: string;
  private readonly timeout = 30000;

  constructor() {
    this.baseUrl = (DOSSIER_PATIENT_BASE_URL).replace(/\/$/, '');
  }

  async createComplementaryExamination(data: {
    chuId: string;
    serviceId: string;
    patientId: string;
    examinationType: string;
    titre: string;
    description: string;
    dateExamen: string;
    resultats: string;
    interpretation: string;
    conclusion: string;
    prescripteur: string;
    laboratoire: string;
    urgency: string;
    isUrgent: boolean;
    notes: string;
    createdBy: string;
  }): Promise<any | null> {
    try {
      const url = `${this.baseUrl}/dossier-patient/complementary-examinations`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`createComplementaryExamination ${res.status}: ${body}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      this.logger.warn(`createComplementaryExamination erreur: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /**
   * Historique complet des examens complémentaires d'un patient dans TOUT le
   * CHU (serviceId omis volontairement) : chirurgie, anapath, imagerie…
   * Réponse du service : [items, total].
   */
  async getPatientExaminations(
    chuId: string,
    patientId: string,
    token?: string,
  ): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/dossier-patient/complementary-examinations`;
      const res = await fetch(`${url}?chuId=${encodeURIComponent(chuId)}&patientId=${encodeURIComponent(patientId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`getPatientExaminations ${res.status}: ${body}`);
        return [];
      }
      const data = await res.json();
      // Format paginé [items, total] sinon liste directe.
      return Array.isArray(data)
        ? Array.isArray(data[0])
          ? data[0]
          : data
        : [];
    } catch (e) {
      this.logger.warn(`getPatientExaminations erreur: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }
}
