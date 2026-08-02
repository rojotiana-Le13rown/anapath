import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { io, Socket } from 'socket.io-client';
import { AnapathService } from '../../anapath/anapath.service';

/**
 * Client WebSocket (Socket.IO) vers le service Prescription — §4 du prompt
 * d'intégration. Le WebSocket sert de SIGNAL : à chaque événement pertinent, on
 * re-pull en REST (source de vérité) via AnapathService.synchroniserPrescriptions,
 * puis on acquitte la notification.
 *
 * Nécessite un token de service durable (PRESCRIPTION_CRON_JWT), le même que le
 * cron de rattrapage. Si absent, le WebSocket ne démarre pas (mode dégradé : le
 * cron 15 min prend le relais).
 */
@Injectable()
export class PrescriptionRealtimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrescriptionRealtime');
  private socket?: Socket;
  private repullTimer?: ReturnType<typeof setTimeout>;

  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly enabled: boolean;
  private readonly serviceId?: string;

  constructor(
    private readonly anapathService: AnapathService,
    configService?: ConfigService,
  ) {
    this.baseUrl = (
      configService?.get<string>('PRESCRIPTION_SERVICE_URL') ??
      process.env.PRESCRIPTION_SERVICE_URL ??
      'https://prescriptionback-production.up.railway.app'
    ).replace(/\/$/, '');
    this.token =
      configService?.get<string>('PRESCRIPTION_CRON_JWT') ??
      process.env.PRESCRIPTION_CRON_JWT;
    this.enabled =
      (configService?.get<string>('PRESCRIPTION_WS_ENABLED') ??
        process.env.PRESCRIPTION_WS_ENABLED ??
        'true') === 'true';
    this.serviceId =
      configService?.get<string>('ANAPATH_SERVICE_ID') ??
      process.env.ANAPATH_SERVICE_ID;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Temps réel désactivé (PRESCRIPTION_WS_ENABLED=false)');
      return;
    }
    if (!this.token) {
      this.logger.warn(
        'Temps réel non démarré : PRESCRIPTION_CRON_JWT non configuré (le cron 15 min prend le relais)',
      );
      return;
    }
    this.connect();
  }

  onModuleDestroy(): void {
    if (this.repullTimer) clearTimeout(this.repullTimer);
    this.socket?.disconnect();
  }

  private connect(): void {
    const url = `${this.baseUrl}/notifications`;
    this.socket = io(url, {
      transports: ['websocket'],
      auth: { token: this.token },
      extraHeaders: { Authorization: `Bearer ${this.token}` },
      query: this.serviceId ? { service: this.serviceId } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.logger.log('Connecté au temps réel Prescription');
      // Pull de rattrapage à chaque (re)connexion : on récupère ce qui a pu
      // être manqué pendant une déconnexion.
      this.scheduleRepull('connect');
    });

    this.socket.on('disconnect', (reason: string) => {
      this.logger.warn(`Déconnecté (${reason}) — reconnexion automatique`);
    });

    this.socket.on('connect_error', (err: Error) => {
      this.logger.warn(`Erreur de connexion temps réel : ${err.message}`);
    });

    // Événements signalant une nouvelle prescription / un changement pour anapath.
    const handle = (label: string) => (payload: any) => {
      this.logger.log(`Événement reçu : ${label}`);
      this.scheduleRepull(label);
      const notificationId = payload?.id ?? payload?.notificationId;
      if (notificationId && this.socket?.connected) {
        this.socket.emit('ack', { notificationId });
      }
    };

    this.socket.on('notification', handle('notification'));
    this.socket.on('prescription.anapath', handle('prescription.anapath'));
    this.socket.on('prescription:created', handle('prescription:created'));
    this.socket.on('prescription:updated', handle('prescription:updated'));
  }

  /**
   * Re-pull anti-rafale : plusieurs événements rapprochés ne déclenchent qu'un
   * seul pull REST (débounce 500 ms). Le pull dédoublonne déjà par demandeId.
   */
  private scheduleRepull(reason: string): void {
    if (!this.token) return;
    if (this.repullTimer) clearTimeout(this.repullTimer);
    this.repullTimer = setTimeout(() => {
      void this.anapathService
        .synchroniserPrescriptions(this.token as string)
        .then((r) => {
          if (r.notificationsCreees > 0) {
            this.logger.log(
              `Re-pull (${reason}) : ${r.notificationsCreees} nouvelle(s) notification(s)`,
            );
          }
        })
        .catch((e) => {
          this.logger.warn(
            `Re-pull (${reason}) échoué : ${e instanceof Error ? e.message : e}`,
          );
        });
    }, 500);
  }
}
