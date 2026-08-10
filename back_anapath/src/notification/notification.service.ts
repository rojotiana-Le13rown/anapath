import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from './notification.entity';
import { NotificationType } from './dto/receive-notification.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class NotificationService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(NotificationEntity)
    private notificationRepository: Repository<NotificationEntity>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /** Au démarrage, nettoie les notifications dupliquées (relance, alertes STAT). */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.deduplicateRappelsEtAlertes();
    } catch (e) {
      console.warn('Nettoyage des doublons de notifications échoué:', e);
    }
  }

  async createNotification(data: {
    type: NotificationType | string;
    title: string;
    message: string;
    priority?: string;
    source?: string;
    metadata?: Record<string, any>;
  }) {
    const notification = this.notificationRepository.create({
      type: data.type as NotificationType,
      title: data.title,
      message: data.message,
      priority: data.priority || 'medium',
      source: data.source || 'Anapath',
      metadata: data.metadata || {},
      read: false,
    });
    const saved = await this.notificationRepository.save(notification);
    // Push temps réel vers les navigateurs connectés (event `notification:new`).
    // Jamais bloquant : si la Gateway est indisponible, l'event est simplement perdu.
    try {
      this.notificationsGateway.emitNotificationCreated(saved);
    } catch (e) {
      console.warn('Notification push temps réel échoué:', e);
    }
    return saved;
  }

  async findAll(): Promise<NotificationEntity[]> {
    return this.notificationRepository.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  async findUnread(): Promise<NotificationEntity[]> {
    return this.notificationRepository.find({
      where: { read: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<NotificationEntity | null> {
    return this.notificationRepository.findOne({ where: { id } });
  }

  /** Marque une notification locale générique (rapport hebdo, relance, ...) comme lue. */
  async markRead(id: string): Promise<boolean> {
    const notification = await this.findOne(id);
    if (!notification) return false;
    notification.read = true;
    await this.notificationRepository.save(notification);
    return true;
  }

  /** Notification locale "nouvelle prescription en attente" déjà créée pour cette demande, si elle existe. */
  async findPendingByDemandeId(demandeId: string): Promise<NotificationEntity | null> {
    const pending = await this.notificationRepository.find({
      where: { type: NotificationType.NOUVELLE_PRESCRIPTION, read: false },
    });
    return pending.find((n) => n.metadata?.demandeId === demandeId) ?? null;
  }

  /**
   * Existe-t-il déjà une notification non lue de ce type pour cet anapathId ?
   * Utilisé pour éviter les doublons (cron de relance, alertes STAT) : le rappel
   * n'est recréé que si aucune notification active existe déjà pour l'examen.
   * `metadataMatch` filtre en plus sur des champs du metadata (ex. phase).
   */
  async findActiveByAnapathId(
    anapathId: string | null | undefined,
    type?: string,
    metadataMatch?: Record<string, unknown>,
  ): Promise<NotificationEntity | null> {
    if (!anapathId) return null;
    const active = await this.notificationRepository.find({
      where: { read: false },
    });
    return (
      active.find(
        (n) =>
          n.metadata?.anapathId === anapathId &&
          (!type || n.type === type) &&
          Object.entries(metadataMatch ?? {}).every(
            ([k, v]) => n.metadata?.[k] === v,
          ),
      ) ?? null
    );
  }

  /**
   * Supprime les doublons de RAPPEL_VALIDATION / STAT_ALERT en base : pour un
   * même type + anapathId (et même phase pour STAT_ALERT), seule la notification
   * la plus récente est conservée. Exécuté au démarrage pour nettoyer le spam
   * de notifications déjà présent.
   */
  async deduplicateRappelsEtAlertes(): Promise<number> {
    const all = await this.notificationRepository.find({
      order: { createdAt: 'DESC' },
    });
    const seen = new Set<string>();
    let removed = 0;
    for (const n of all) {
      const aid = n.metadata?.anapathId;
      if (!aid) continue;
      const isRappel = n.type === NotificationType.RAPPEL_VALIDATION;
      const isStat = n.type === NotificationType.STAT_ALERT;
      if (!isRappel && !isStat) continue;

      const key = isStat
        ? `STAT_ALERT|${aid}|${n.metadata?.phase ?? ''}`
        : `RAPPEL_VALIDATION|${aid}`;
      if (seen.has(key)) {
        await this.notificationRepository.remove(n);
        removed++;
      } else {
        seen.add(key);
      }
    }
    if (removed > 0) {
      console.log(`🧹 Notifications dédupliquées : ${removed} doublon(s) supprimé(s)`);
    }
    return removed;
  }

  /** Marque une notification "nouvelle prescription" comme traitée (acceptée/refusée) — jamais supprimée, garde une trace. */
  async markResolved(
    id: string,
    outcome: 'ACCEPTEE' | 'REFUSEE',
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const notification = await this.findOne(id);
    if (!notification) return;
    notification.read = true;
    notification.metadata = {
      ...(notification.metadata ?? {}),
      outcome,
      resolvedAt: new Date().toISOString(),
      ...extra,
    };
    await this.notificationRepository.save(notification);
  }

  /** Prescriptions refusées (pour affichage dans les rapports) — traitées, outcome = REFUSEE. */
  async findRefused(): Promise<NotificationEntity[]> {
    return this.findByOutcome('REFUSEE');
  }

  /** Prescriptions acceptées — traitées, outcome = ACCEPTEE. */
  async findAccepted(): Promise<NotificationEntity[]> {
    return this.findByOutcome('ACCEPTEE');
  }

  private async findByOutcome(outcome: 'ACCEPTEE' | 'REFUSEE'): Promise<NotificationEntity[]> {
    const resolved = await this.notificationRepository.find({
      where: { type: NotificationType.NOUVELLE_PRESCRIPTION, read: true },
      order: { createdAt: 'DESC' },
    });
    return resolved.filter((n) => n.metadata?.outcome === outcome);
  }
}