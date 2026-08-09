import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Client vers le service Notification externe dédié (aucune authentification requise,
 * vérifié empiriquement). URL : NOTIFICATION_SERVICE_URL (défaut https://service-notification-nlqp.onrender.com).
 */
@Injectable()
export class NotificationClient {
  private readonly baseUrl: string;
  private readonly serviceId: string;
  private readonly timeout = 5000;

  constructor(private configService?: ConfigService) {
    this.baseUrl = (
      this.configService?.get<string>('NOTIFICATION_SERVICE_URL') ??
      process.env.NOTIFICATION_SERVICE_URL ??
      'https://service-notification-nlqp.onrender.com'
    ).replace(/\/$/, '');
    this.serviceId =
      this.configService?.get<string>('ANAPATH_SERVICE_ID') ??
      process.env.ANAPATH_SERVICE_ID ??
      '9e73904c-71e5-4477-9280-513e4112a468';
  }

  /** Notifications d'un utilisateur donné (role/serviceId requis côté API externe). */
  async getNotificationsForUser(userId: string, role: string, serviceId: string): Promise<any[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/notifications/user/${userId}`, {
        params: { role, serviceId },
        timeout: this.timeout,
      });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** Toutes les notifications, tous utilisateurs confondus — pas de filtre par service côté API. */
  async getAllNotifications(): Promise<any[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/notifications`, { timeout: this.timeout });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /**
   * userId requis pour un accusé de lecture PERSONNEL — sans lui, une notification
   * diffusée à tout le service (via /notifications/service) risque d'être marquée lue
   * globalement plutôt que juste pour l'utilisateur courant (cf. doc de l'API réelle :
   * "une notification diffusée reste non lue pour les collègues qui ne l'ont pas ouverte").
   */
  async markAsRead(notificationId: string, userId?: string): Promise<boolean> {
    try {
      await axios.post(
        `${this.baseUrl}/notifications/${notificationId}/read`,
        { userId },
        { timeout: this.timeout },
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Nom du champ "lu" non confirmé côté API externe (read/lu/isRead) — vérifie les variantes courantes. */
  isRead(notification: any): boolean {
    return Boolean(notification?.read ?? notification?.lu ?? notification?.isRead ?? false);
  }

  getAnapathServiceId(): string {
    return this.serviceId;
  }
}
