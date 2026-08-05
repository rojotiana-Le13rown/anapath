import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthClient } from '../auth/clients/auth.client';
import { getCorsOrigins } from '../common/cors-origins';

/**
 * Gateway WebSocket backend → navigateur : pousse en temps réel chaque
 * notification créée (event `notification:new`) à tous les clients connectés.
 *
 * Authentification : le client fournit le MÊME JWT que l'API REST via
 * `auth.token` du handshake (obtenu côté frontend par /api/anapath/notifications/ws-ticket,
 * qui n'expose que le token de la session en cours). La validation réutilise
 * AuthClient.validateToken — exactement la même logique que JwtAuthGuard.
 * Connexion rejetée (disconnect) si le token est absent, invalide ou expiré.
 *
 * Toutes les notifications étant propres au service (pas par utilisateur),
 * tous les clients authentifiés rejoignent un seul salon « anapath ».
 */
@WebSocketGateway({
  namespace: '/anapath',
  cors: { origin: getCorsOrigins(), credentials: true },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly authClient: AuthClient) {}

  afterInit(): void {
    console.log(
      `✅ Gateway temps réel active sur /anapath (origines: ${getCorsOrigins().join(', ')})`,
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    const auth = (client.handshake.auth ?? {}) as { token?: string };
    const token = auth.token;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const user = await this.authClient.validateToken(token);
      if (!user) {
        client.disconnect(true);
        return;
      }
      client.data.user = user;
      client.join('anapath');
    } catch {
      client.disconnect(true);
    }
  }

  /** Émet `notification:new` à tous les clients connectés. */
  emitNotificationCreated(notification: unknown): void {
    this.server?.to('anapath').emit('notification:new', notification);
  }
}
