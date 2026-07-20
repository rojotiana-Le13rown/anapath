import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from './notification.entity';
import { NotificationType } from './dto/receive-notification.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private notificationRepository: Repository<NotificationEntity>,
  ) {}

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
    return this.notificationRepository.save(notification);
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
    const resolved = await this.notificationRepository.find({
      where: { type: NotificationType.NOUVELLE_PRESCRIPTION, read: true },
      order: { createdAt: 'DESC' },
    });
    return resolved.filter((n) => n.metadata?.outcome === 'REFUSEE');
  }
}