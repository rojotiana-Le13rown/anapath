import { Controller, Get, Patch, Param, Post, Put, Body, Query, HttpCode, Header, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AnapathService } from './anapath.service';
import { UpdateAnapathDto } from './dto/update-anapath.dto';
import { ValidateAnapathDto } from './dto/validate-anapath.dto';
import { UpdateResultatDto } from './dto/update-resultat.dto';
import { UpdateExamenSpeculumDto } from './dto/update-examen-speculum.dto';
import { AnapathRequest, Statut } from './entities/anapath-request.entity';
import { ChuClient } from '../common/clients/chu.client';
import { AccueilClient } from '../common/clients/accueil.client';
import { NotificationClient } from '../common/clients/notification.client';
import { PrescriptionTokenMonitorService } from '../common/clients/prescription-token-monitor.service';
import { NotificationService } from '../notification/notification.service';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentToken } from '../auth/decorators/current-token.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

function sortNotifications(notifs: any[]): any[] {
  const urgencePriority: Record<string, number> = { STAT: 1, URGENTE: 2, NORMALE: 3 };
  return [...notifs].sort((a, b) => {
    const pa = urgencePriority[a.urgence ?? a.metadata?.urgence ?? a.priority ?? 'NORMALE'] ?? 3;
    const pb = urgencePriority[b.urgence ?? b.metadata?.urgence ?? b.priority ?? 'NORMALE'] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

@ApiTags('anapath')
@Controller('anapath')
export class AnapathController {
  constructor(
    private readonly anapathService: AnapathService,
    private readonly chuClient: ChuClient,
    private readonly accueilClient: AccueilClient,
    private readonly notificationClient: NotificationClient,
    private readonly notificationService: NotificationService,
    private readonly prescriptionTokenMonitor: PrescriptionTokenMonitorService,
  ) {}

  @Permissions('anapath:read')
  @Get()
  @ApiOperation({ summary: 'Lister toutes les demandes (optionnellement filtrées par patientId)' })
  @ApiResponse({ status: 200, description: 'Liste des demandes', type: [AnapathRequest] })
  @Header('Content-Type', 'application/json; charset=utf-8')
  findAll(@Query('patientId') patientId?: string) {
    return this.anapathService.findAll(patientId);
  }

  @Permissions('anapath:update')
  @Post('prescriptions/sync')
  @ApiOperation({
    summary: 'Déclencher manuellement le pull des prescriptions anapath depuis le service Prescription externe',
  })
  @Header('Content-Type', 'application/json; charset=utf-8')
  synchroniserPrescriptions(@CurrentToken() token: string) {
    return this.anapathService.synchroniserPrescriptions(token);
  }

  @Permissions('anapath:read')
  @Get('prescriptions/sync-status')
  @ApiOperation({
    summary: "Statut du token utilisé par le cron/WebSocket Prescription (expiration, etc.) — PRESCRIPTION_CRON_JWT n'est pas un token de service durable",
  })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getPrescriptionSyncStatus() {
    return this.prescriptionTokenMonitor.getStatus();
  }

  @Permissions('anapath:read')
  @Get('chu')
  @ApiOperation({ summary: 'Lister tous les CHU' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getChus() {
    return this.chuClient.getAllChus();
  }

  @Permissions('anapath:read')
  @Get('chu/:chuId/services')
  @ApiOperation({ summary: "Lister les services d'un CHU" })
  @ApiParam({ name: 'chuId', description: 'UUID du CHU' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getServicesByChu(@Param('chuId') chuId: string) {
    return this.chuClient.getServicesByChu(chuId);
  }

  @Permissions('anapath:read')
  @Get('service/anapath')
  @ApiOperation({ summary: 'Infos du service Anatomie Pathologique' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getAnapathService() {
    return this.chuClient.getAnapathServiceInfo();
  }

  @Permissions('anapath:read')
  @Get('report-settings')
  @ApiOperation({ summary: 'Préférences des rapports (ex: envoi automatique hebdomadaire)' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getReportSettings() {
    return this.anapathService.getReportSettings();
  }

  @Permissions('anapath:update', 'anapath:report:export')
  @Patch('report-settings')
  @ApiOperation({ summary: 'Activer/désactiver le rapport hebdomadaire automatique' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  updateReportSettings(@Body() dto: { autoWeeklyReportEnabled: boolean }) {
    return this.anapathService.updateReportSettings(dto.autoWeeklyReportEnabled);
  }

  @Permissions('anapath:read')
  @Get('notifications')
  @ApiOperation({ summary: 'Notifications du service Anapath' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async getNotifications(@CurrentUser() user: AuthenticatedUser) {
    const [notifs, locales] = await Promise.all([
      this.notificationClient.getNotificationsForUser(
        user.userId,
        user.roleName,
        this.notificationClient.getAnapathServiceId(),
      ),
      this.notificationService.findAll(),
    ]);

    const enriched = await Promise.all(
      [...notifs, ...locales].map(async (n: any) => {
        const anapathId = n.metadata?.anapathId ?? n.referenceId ?? n.examId;
        if (!anapathId) return n;

        try {
          const examen = await this.anapathService.findByAnapathId(anapathId);
          if (!examen) return n;

          const metadata = examen.metadata as Record<string, unknown> | null;
          return {
            ...n,
            enriched: {
              id: examen.id,
              anapathId: examen.anapathId,
              typeExamen: examen.typeExamen,
              statut: examen.statut,
              urgence:
                (metadata?.urgence as string) ??
                (examen.isExtemporane ? 'STAT' : 'NORMALE'),
              serviceNom:
                (metadata?.serviceNom as string) ??
                (metadata?.serviceId as string) ??
                '—',
              patientId: examen.patientId,
              createdAt: examen.createdAt,
              lu:
                examen.notificationLue &&
                ['RESULTAT_DISPONIBLE', 'VALIDE', 'ARCHIVE'].includes(
                  examen.statut,
                ),
            },
          };
        } catch {
          return n;
        }
      }),
    );

    return sortNotifications(enriched);
  }

  @Permissions('anapath:read')
  @Get('notifications/non-lues')
  @ApiOperation({ summary: 'Notifications non lues' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async getUnread(@CurrentUser() user: AuthenticatedUser) {
    const [notifs, locales] = await Promise.all([
      this.notificationClient.getNotificationsForUser(
        user.userId,
        user.roleName,
        this.notificationClient.getAnapathServiceId(),
      ),
      this.notificationService.findUnread(),
    ]);
    const unread = notifs.filter((n) => !this.notificationClient.isRead(n));
    return sortNotifications([...unread, ...locales]);
  }

  @Permissions('anapath:read')
  @Get('notifications/ws-ticket')
  @ApiOperation({
    summary: 'Ticket WebSocket temps réel : renvoie le JWT de la session pour s’authentifier sur la Gateway /anapath',
  })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getWsTicket(@CurrentToken() token?: string) {
    // Le token vient d'être validé par JwtAuthGuard — on le renvoie au navigateur
    // pour qu'il puisse ouvrir le socket (le cookie httpOnly n'est pas lisible en JS).
    return { token };
  }

  @Permissions('anapath:read')
  @Get('notifications/refusees')
  @ApiOperation({ summary: 'Prescriptions refusées (pour affichage dans les rapports)' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getPrescriptionsRefusees() {
    return this.notificationService.findRefused();
  }

  @Permissions('anapath:read')
  @Get('notifications/acceptees')
  @ApiOperation({ summary: 'Prescriptions acceptées (pour les statistiques de la page Nouvelles demandes)' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  getPrescriptionsAcceptees() {
    return this.notificationService.findAccepted();
  }

  @Permissions('anapath:read')
  @Post('notifications/stat-alert')
  @ApiOperation({ summary: 'Créer une alerte STAT locale (examen extemporané, 5 minutes restantes)' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async creerAlerteStat(
    @Body() body: { anapathId?: string; patientId?: string; requestId?: string },
  ) {
    await this.notificationService.createNotification({
      type: 'STAT_ALERT',
      title: '🚨 ALERTE STAT',
      message: `Il reste 5 minutes pour l'examen ${body.anapathId ?? ''} - Patient ${body.patientId ?? ''}`,
      priority: 'high',
      source: 'Anapath',
      metadata: {
        anapathId: body.anapathId,
        patientId: body.patientId,
        requestId: body.requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return { success: true };
  }

  @Permissions('anapath:read')
  @Put('notifications/:id/lire')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiParam({ name: 'id', description: 'UUID de la notification' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const markedLocally = await this.notificationService.markRead(id);
    if (markedLocally) return { success: true };
    const success = await this.notificationClient.markAsRead(id, user.userId);
    return { success };
  }

  @Permissions('anapath:update')
  @Post('notifications/:id/accepter')
  @ApiOperation({ summary: 'Accepter une prescription en attente — la fait entrer dans le fil de travail' })
  @ApiParam({ name: 'id', description: 'UUID de la notification "nouvelle prescription"' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  accepterPrescription(@Param('id') id: string, @CurrentToken() token: string) {
    return this.anapathService.accepterPrescription(id, token);
  }

  @Permissions('anapath:update')
  @Post('notifications/:id/refuser')
  @ApiOperation({ summary: 'Refuser une prescription en attente — motif obligatoire' })
  @ApiParam({ name: 'id', description: 'UUID de la notification "nouvelle prescription"' })
  @ApiBody({ schema: { type: 'object', properties: { motif: { type: 'string' } }, required: ['motif'] } })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async refuserPrescription(
    @Param('id') id: string,
    @Body() body: { motif?: string },
    @CurrentToken() token: string,
  ) {
    if (!body?.motif?.trim()) {
      throw new BadRequestException('Motif de refus requis');
    }
    await this.anapathService.refuserPrescription(id, body.motif, token);
    return { success: true };
  }

  @Permissions('anapath:read')
  @Get(':id/patient')
  @ApiOperation({
    summary: 'Récupérer les infos patient depuis Accueil',
  })
  @ApiParam({ name: 'id', description: 'UUID de la demande' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async getPatientForExamen(@Param('id') id: string) {
    const examen = await this.anapathService.findOne(id);
    if (!examen) {
      throw new NotFoundException('Examen non trouvé');
    }

    if (examen.patientInfo?.nom) {
      return {
        ...examen.patientInfo,
        nomComplet: this.accueilClient.buildNomComplet(examen.patientInfo),
      };
    }

    const chuId = (examen.metadata?.chuId as string) ?? '';
    if (!chuId) {
      console.warn(`Examen ${id} sans chuId, impossible d'interroger Accueil`);
      return this.fallbackPatient(examen);
    }

    const patient = await this.accueilClient.getPatient(
      examen.patientId,
      chuId,
    );
    if (!patient) {
      return this.fallbackPatient(examen);
    }

    return {
      ...patient,
      nomComplet: this.accueilClient.buildNomComplet(patient),
      age: this.accueilClient.calculateAge(patient.dateNaissance),
    };
  }

  private fallbackPatient(examen: any) {
    return {
      nom: examen.patientId,
      prenom: '',
      nomComplet: examen.patientId,
      age: null,
      sexe: null,
      dateNaissance: null,
      telephone: null,
      adresse: null,
      cin: null,
      _source: 'fallback',
    };
  }

  @Permissions('anapath:read')
  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une demande par son ID' })
  @ApiParam({ name: 'id', description: 'UUID de la demande' })
  @ApiResponse({ status: 200, description: 'Demande trouvée', type: AnapathRequest })
  @ApiResponse({ status: 404, description: 'Demande non trouvée' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  findOne(@Param('id') id: string) {
    return this.anapathService.findOne(id);
  }

  @Permissions('anapath:update')
  @Patch(':id/notification-lue')
  @ApiOperation({ summary: 'Marquer notif comme lue pour cet examen' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  async marquerNotifLue(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    let examen = await this.anapathService.findByAnapathId(id);
    if (!examen) {
      try {
        examen = await this.anapathService.findOneEntity(id);
      } catch {
        throw new NotFoundException();
      }
    }
    examen.notificationLue = true;
    examen.notificationLueAt = new Date();
    await this.anapathService.save(examen);

    const notifs = await this.notificationClient.getNotificationsForUser(
      user.userId,
      user.roleName,
      this.notificationClient.getAnapathServiceId(),
    );
    const matching = notifs.filter(
      (n: any) =>
        n.metadata?.anapathId === examen.anapathId ||
        n.referenceId === examen.anapathId ||
        n.examId === examen.anapathId,
    );
    await Promise.all(
      matching.map((n: any) => this.notificationClient.markAsRead(n.id ?? n._id, user.userId)),
    );

    return { success: true };
  }

  @Permissions('anapath:update')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une demande (résultat, statut)' })
  @ApiParam({ name: 'id', description: 'UUID de la demande' })
  @ApiResponse({ status: 200, description: 'Demande mise à jour', type: AnapathRequest })
  @ApiResponse({ status: 404, description: 'Demande non trouvée' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnapathDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentToken() token: string,
  ) {
    if (dto.statut === Statut.ANNULEE && !user.permissions.includes('anapath:cancel')) {
      throw new ForbiddenException('Permission refusée');
    }
    return this.anapathService.update(id, dto, token);
  }

  @Permissions('anapath:observation:write')
  @Patch(':id/resultat')
  @ApiOperation({ summary: "Enregistrer (auto-save) le résultat et la conclusion d'examen — transcription" })
  @ApiParam({ name: 'id', description: 'UUID de la demande' })
  @ApiBody({ type: UpdateResultatDto })
  @ApiResponse({ status: 200, description: 'Résultat mis à jour', type: AnapathRequest })
  @ApiResponse({ status: 404, description: 'Demande non trouvée' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  updateResultat(
    @Param('id') id: string,
    @Body() dto: UpdateResultatDto,
    @CurrentToken() token: string,
  ) {
    return this.anapathService.updateResultat(id, dto, token);
  }

  @Permissions('anapath:update')
  @Patch(':id/examen-speculum')
  @ApiOperation({ summary: "Enregistrer l'examen au spéculum (préalable au résultat pour un FCV/Pap test)" })
  @ApiParam({ name: 'id', description: 'UUID de la demande' })
  @ApiBody({ type: UpdateExamenSpeculumDto })
  @ApiResponse({ status: 200, description: 'Examen spéculum enregistré', type: AnapathRequest })
  @ApiResponse({ status: 404, description: 'Demande non trouvée' })
  @Header('Content-Type', 'application/json; charset=utf-8')
  updateExamenSpeculum(@Param('id') id: string, @Body() dto: UpdateExamenSpeculumDto) {
    return this.anapathService.updateExamenSpeculum(id, dto);
  }

  @Permissions('anapath:validate')
  @Post(':id/validate')
  @ApiOperation({ summary: 'Valider une demande avec signature numérique' })
  @ApiParam({ name: 'id', description: 'UUID de la demande' })
  @ApiBody({ type: ValidateAnapathDto })
  @ApiResponse({ status: 200, description: 'Demande validée avec succès', type: AnapathRequest })
  @ApiResponse({ status: 400, description: 'Validation impossible (déjà validée ou résultat non disponible)' })
  @ApiResponse({ status: 404, description: 'Demande non trouvée' })
  @HttpCode(200)
  @Header('Content-Type', 'application/json; charset=utf-8')
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateAnapathDto,
    @CurrentToken() token: string,
  ) {
    return this.anapathService.validate(id, dto, token);
  }
}
