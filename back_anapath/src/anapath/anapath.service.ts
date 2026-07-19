import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AnapathRequest, Statut } from './entities/anapath-request.entity';
import { ReportSettings } from './entities/report-settings.entity';
import { CreateAnapathDto } from './dto/create-anapath.dto';
import { UpdateAnapathDto } from './dto/update-anapath.dto';
import { ValidateAnapathDto } from './dto/validate-anapath.dto';
import { UpdateResultatDto } from './dto/update-resultat.dto';
import { UpdateExamenSpeculumDto } from './dto/update-examen-speculum.dto';
import { PrescriptionClient, AnapathPrescription, PrescriptionDemande } from '../common/clients/prescription.client';
import { NotificationService } from '../notification/notification.service';
import * as crypto from 'crypto';

const ANAPATH_SERVICE_ID =
  process.env.ANAPATH_SERVICE_ID ?? '14a94274-db57-49e3-9375-1e642729b92b';

export type AnapathRequestResponse = AnapathRequest & {
  resultat: { details: string | null; conclusion: string | null };
  validationHash: string | null;
};

@Injectable()
export class AnapathService {
  constructor(
    @InjectRepository(AnapathRequest)
    private anapathRepository: Repository<AnapathRequest>,
    @InjectRepository(ReportSettings)
    private reportSettingsRepository: Repository<ReportSettings>,
    private readonly prescriptionClient: PrescriptionClient,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Propage un changement de statut local vers le service Prescription externe.
   * Jamais bloquant : appelée après un save() réussi, ignore silencieusement
   * (avec un warning) si les IDs externes ou le token sont absents, ou si l'appel échoue.
   * Hypothèse non vérifiée : le service externe accepte les mêmes libellés que l'enum Statut local.
   */
  private async propagerStatutVersPrescription(
    request: AnapathRequest,
    token?: string,
  ): Promise<void> {
    if (!token) {
      console.warn(
        `Propagation statut ignorée pour ${request.anapathId} : pas de token utilisateur disponible`,
      );
      return;
    }
    if (!request.prescriptionId || !request.demandeId) {
      console.warn(
        `Propagation statut ignorée pour ${request.anapathId} : prescriptionId/demandeId externe manquant`,
      );
      return;
    }
    await this.prescriptionClient.updateDemandeStatut(
      token,
      request.prescriptionId,
      request.demandeId,
      request.statut,
      request.statut === Statut.ANNULEE ? request.motifAnnulation : undefined,
    );
  }

  private generateAnapathId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `ANP-${year}-${random}`;
  }

  private getResultatFromJson(entity: AnapathRequest): {
    details?: string;
    conclusion?: string;
  } | null {
    if (!entity.resultat || typeof entity.resultat !== 'object') return null;
    return entity.resultat as { details?: string; conclusion?: string };
  }

  toResponse(entity: AnapathRequest): AnapathRequestResponse {
    const jsonResultat = this.getResultatFromJson(entity);
    const details =
      entity.resultatDetails ?? jsonResultat?.details ?? null;
    const conclusion =
      entity.resultatConclusion ?? jsonResultat?.conclusion ?? null;

    return {
      ...entity,
      resultat: { details, conclusion },
      validatedBySignature: entity.validatedBySignature ?? null,
      validatedByUserId: entity.validatedByUserId ?? null,
      validationHash: entity.validationHash ?? entity.signedHash ?? null,
      validatedAt: entity.validatedAt ?? null,
    } as AnapathRequestResponse;
  }

  private syncResultatFields(entity: AnapathRequest): void {
    entity.resultat = {
      details: entity.resultatDetails ?? null,
      conclusion: entity.resultatConclusion ?? null,
    };
  }

  async create(createDto: CreateAnapathDto): Promise<AnapathRequestResponse> {
    const anapathId = this.generateAnapathId();
    const request = this.anapathRepository.create({
      ...createDto,
      anapathId,
      statut: Statut.CREEE,
    });

    if (createDto.isExtemporane) {
      const deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() + 30);
      request.extemporaneDeadline = deadline;
    }

    const saved = await this.anapathRepository.save(request);
    return this.toResponse(saved);
  }

  async findAll(patientId?: string): Promise<AnapathRequestResponse[]> {
    const rows = await this.anapathRepository.find({
      where: patientId ? { patientId } : {},
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(id: string): Promise<AnapathRequestResponse> {
    const request = await this.anapathRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Demande ${id} non trouvée`);
    return this.toResponse(request);
  }

  async findOneEntity(id: string): Promise<AnapathRequest> {
    const request = await this.anapathRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Demande ${id} non trouvée`);
    return request;
  }

  async findByAnapathId(anapathId: string): Promise<AnapathRequest | null> {
    return this.anapathRepository.findOne({ where: { anapathId } });
  }

  async save(entity: AnapathRequest): Promise<AnapathRequest> {
    return this.anapathRepository.save(entity);
  }

  async update(
    id: string,
    updateDto: UpdateAnapathDto,
    token?: string,
  ): Promise<AnapathRequestResponse> {
    const request = await this.findOneEntity(id);
    const statutAvant = request.statut;

    if (
      updateDto.resultatDetails !== undefined ||
      updateDto.resultat?.details !== undefined ||
      updateDto.description !== undefined
    ) {
      request.resultatDetails =
        updateDto.resultatDetails ??
        updateDto.resultat?.details ??
        updateDto.description ??
        request.resultatDetails;
    }

    if (
      updateDto.resultatConclusion !== undefined ||
      updateDto.resultat?.conclusion !== undefined ||
      updateDto.conclusion !== undefined
    ) {
      request.resultatConclusion =
        updateDto.resultatConclusion ??
        updateDto.resultat?.conclusion ??
        updateDto.conclusion ??
        request.resultatConclusion;
    }

    if (updateDto.statut !== undefined) request.statut = updateDto.statut;
    if (updateDto.prelevement !== undefined) request.prelevement = updateDto.prelevement;
    if (updateDto.motifAnnulation !== undefined) request.motifAnnulation = updateDto.motifAnnulation;

    if (updateDto.signature !== undefined) {
      request.validatedBySignature = updateDto.signature;
    }
    if (updateDto.numeroOrdre !== undefined) {
      request.validatedByUserId = updateDto.numeroOrdre;
    }
    if (updateDto.hash !== undefined) {
      request.validationHash = updateDto.hash;
      request.signedHash = updateDto.hash;
    }
    if (updateDto.statut === Statut.VALIDE) {
      request.validatedAt = new Date();
    }

    this.syncResultatFields(request);

    const saved = await this.anapathRepository.save(request);
    if (updateDto.statut !== undefined && updateDto.statut !== statutAvant) {
      await this.propagerStatutVersPrescription(saved, token);
    }
    return this.toResponse(saved);
  }

  /**
   * Sauvegarde (auto-save) du résultat/conclusion uniquement — utilisé pour la
   * transcription en direct (ex: Secrétaire qui tape ce que dicte le
   * pathologiste). Ne touche ni au statut de validation finale, ni à la
   * signature, ni à l'annulation : ces actions restent derrière anapath:update
   * / anapath:validate.
   */
  async updateResultat(
    id: string,
    dto: UpdateResultatDto,
    token?: string,
  ): Promise<AnapathRequestResponse> {
    const request = await this.findOneEntity(id);
    const statutAvant = request.statut;

    if (dto.resultatDetails !== undefined) request.resultatDetails = dto.resultatDetails;
    if (dto.resultatConclusion !== undefined) request.resultatConclusion = dto.resultatConclusion;

    const hasContent =
      (request.resultatDetails ?? '').trim() !== '' || (request.resultatConclusion ?? '').trim() !== '';
    if (hasContent && request.statut !== Statut.VALIDE && request.statut !== Statut.ARCHIVE) {
      request.statut = Statut.RESULTAT_DISPONIBLE;
    }

    this.syncResultatFields(request);

    const saved = await this.anapathRepository.save(request);
    if (saved.statut !== statutAvant) {
      await this.propagerStatutVersPrescription(saved, token);
    }
    return this.toResponse(saved);
  }

  /** Enregistre l'examen au spéculum (préalable obligatoire au résultat pour un FCV/Pap test). */
  async updateExamenSpeculum(
    id: string,
    dto: UpdateExamenSpeculumDto,
  ): Promise<AnapathRequestResponse> {
    const request = await this.findOneEntity(id);
    request.examenSpeculum = { ...dto, submittedAt: new Date().toISOString() };

    const saved = await this.anapathRepository.save(request);
    return this.toResponse(saved);
  }

  async validate(
    id: string,
    dto: ValidateAnapathDto,
    token?: string,
  ): Promise<AnapathRequestResponse> {
    const request = await this.findOneEntity(id);
    if (request.statut === Statut.VALIDE)
      throw new BadRequestException('Déjà validée');
    if (request.statut !== Statut.RESULTAT_DISPONIBLE)
      throw new BadRequestException('Résultat non disponible');

    const numeroOrdre = dto.numeroOrdre ?? dto.ordreProfessionnelNumber;
    const hash =
      dto.hash ??
      crypto
        .createHash('sha256')
        .update(`${request.anapathId}-${dto.signature}-${numeroOrdre}`)
        .digest('hex');

    if (dto.resultatDetails !== undefined) {
      request.resultatDetails = dto.resultatDetails;
    }
    if (dto.resultatConclusion !== undefined) {
      request.resultatConclusion = dto.resultatConclusion;
    }

    request.statut = Statut.VALIDE;
    request.validatedBySignature = dto.signature;
    request.validatedByUserId = numeroOrdre;
    request.validatedAt = new Date();
    request.validationHash = hash;
    request.signedHash = hash;

    this.syncResultatFields(request);

    const saved = await this.anapathRepository.save(request);
    await this.propagerStatutVersPrescription(saved, token);
    return this.toResponse(saved);
  }

  /** Construit les champs AnapathRequest depuis une demande + sa prescription parente (pull externe). */
  private buildRequestFromPrescription(
    prescription: AnapathPrescription,
    demande: PrescriptionDemande,
  ): Partial<AnapathRequest> {
    const data = (demande.data ?? {}) as Record<string, unknown>;
    return {
      anapathId: this.generateAnapathId(),
      patientId: prescription.patientId,
      prescriptionId: prescription.id,
      demandeId: demande.id,
      typeExamen: demande.typeExamen as AnapathRequest['typeExamen'],
      isExtemporane: demande.typeExamen === 'EXTEMPORANE_STAT',
      prelevement: {
        site: (data.organe as string) ?? (data.localisation as string) ?? '',
        description: (data.nature as string) ?? JSON.stringify(data),
      },
      metadata: {
        sourceService: 'prescription-pull',
        chuId: prescription.chuId,
        serviceIdSource: prescription.serviceIdSource,
        serviceIdDest: prescription.serviceIdDest,
        prescripteurId: prescription.prescripteurId,
        urgence: prescription.urgence,
        alertes: prescription.alertes,
        rawData: data,
      },
      statut: Statut.CREEE,
    };
  }

  /**
   * Upsert une prescription+ses demandes récupérées depuis le service externe.
   * Ne crée QUE les demandes inconnues localement (nouveau demandeId) — les demandes déjà
   * connues sont ignorées pour ne jamais écraser un statut local plus à jour (celui-ci est
   * poussé vers l'externe via propagerStatutVersPrescription, jamais l'inverse).
   */
  private async upsertDepuisPrescription(prescription: AnapathPrescription): Promise<number> {
    let created = 0;
    for (const demande of prescription.demandes ?? []) {
      if (!demande.id) continue;
      const existing = await this.anapathRepository.findOne({ where: { demandeId: demande.id } });
      if (existing) continue;

      const entity = this.anapathRepository.create(
        this.buildRequestFromPrescription(prescription, demande),
      );
      await this.anapathRepository.save(entity);
      created++;
    }
    return created;
  }

  /** Pull manuel (ou déclenché par le cron) des prescriptions anapath externes. */
  async synchroniserPrescriptions(token: string): Promise<{ prescriptions: number; demandesCreees: number }> {
    const prescriptions = await this.prescriptionClient.getAnapathPrescriptions(token, {
      serviceIdDest: ANAPATH_SERVICE_ID,
    });
    let demandesCreees = 0;
    for (const prescription of prescriptions) {
      demandesCreees += await this.upsertDepuisPrescription(prescription);
    }
    return { prescriptions: prescriptions.length, demandesCreees };
  }

  @Cron(process.env.PRESCRIPTION_SYNC_CRON ?? '*/15 * * * *')
  async synchroniserPrescriptionsExternesCron(): Promise<void> {
    if ((process.env.PRESCRIPTION_SYNC_ENABLED ?? 'true') !== 'true') return;
    const token = process.env.PRESCRIPTION_CRON_JWT;
    if (!token) {
      console.warn(
        'Pull des prescriptions ignoré : PRESCRIPTION_CRON_JWT non configuré',
      );
      return;
    }
    try {
      const result = await this.synchroniserPrescriptions(token);
      if (result.demandesCreees > 0) {
        console.log(
          `✅ Pull prescriptions : ${result.demandesCreees} nouvelle(s) demande(s) créée(s) sur ${result.prescriptions} prescription(s)`,
        );
      }
    } catch (e) {
      console.warn('Pull des prescriptions échoué:', e);
    }
  }

  /** Récupère (et crée si absente) la ligne unique de préférences des rapports. */
  async getReportSettings(): Promise<ReportSettings> {
    const existing = await this.reportSettingsRepository.findOne({ where: { id: 'default' } });
    if (existing) return existing;
    return this.reportSettingsRepository.save(
      this.reportSettingsRepository.create({ id: 'default', autoWeeklyReportEnabled: false }),
    );
  }

  async updateReportSettings(autoWeeklyReportEnabled: boolean): Promise<ReportSettings> {
    const settings = await this.getReportSettings();
    settings.autoWeeklyReportEnabled = autoWeeklyReportEnabled;
    return this.reportSettingsRepository.save(settings);
  }

  /**
   * Chaque vendredi à 18h : si activé, notifie le service qu'un rapport
   * hebdomadaire est prêt à être consulté/exporté (la génération du PDF
   * elle-même reste côté navigateur, cf. page Rapports).
   */
  @Cron('0 18 * * 5')
  async notifierRapportHebdomadaireAutomatique() {
    const settings = await this.getReportSettings();
    if (!settings.autoWeeklyReportEnabled) return;

    try {
      await this.notificationService.createNotification({
        type: 'RAPPORT_HEBDOMADAIRE',
        title: 'Rapport hebdomadaire disponible',
        message:
          "Le rapport hebdomadaire d'activité du service est prêt — ouvrez la page Rapports pour le consulter et l'exporter en PDF.",
        priority: 'medium',
        source: 'Anapath',
      });
      console.log('✅ Notification rapport hebdomadaire créée');
    } catch (e) {
      console.warn('Notification rapport hebdomadaire échouée:', e);
    }
  }

  @Cron('0 8 * * *')
  async relanceExamensNonValides() {
    const examens = await this.anapathRepository.find({
      where: { statut: Statut.RESULTAT_DISPONIBLE },
    });

    for (const examen of examens) {
      const maintenant = new Date();
      const derniereRelance = examen.derniereRelanceAt;
      const doitRelancer =
        !derniereRelance ||
        maintenant.getTime() - derniereRelance.getTime() >= 23 * 60 * 60 * 1000;

      if (!doitRelancer) continue;

      const metadata = examen.metadata as Record<string, unknown> | null;
      const message =
        `⏰ Rappel : Validez l'examen ${examen.anapathId}` +
        ` — ${examen.typeExamen}` +
        ` — Patient: ${examen.patientId}` +
        ` — Service: ${metadata?.serviceNom ?? '—'}` +
        ` — Résultat saisi depuis ${formatTimeSince(examen.updatedAt)}` +
        `. Le temps passe !`;

      try {
        await this.notificationService.createNotification({
          type: 'RAPPEL_VALIDATION',
          title: `Rappel validation — ${examen.anapathId}`,
          message,
          priority: 'medium',
          source: 'Anapath',
          metadata: {
            anapathId: examen.anapathId,
            typeExamen: examen.typeExamen,
            patientId: examen.patientId,
            serviceNom: metadata?.serviceNom,
            isRelance: true,
          },
        });

        examen.derniereRelanceAt = maintenant;
        await this.anapathRepository.save(examen);
        console.log(`✅ Relance créée : ${examen.anapathId}`);
      } catch (e) {
        console.warn(`Relance échouée ${examen.anapathId}:`, e);
      }
    }
  }
}

function formatTimeSince(date: Date): string {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
  const heures = Math.floor(
    (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
  );
  if (jours > 0) return `${jours}j ${heures}h`;
  return `${heures}h`;
}
