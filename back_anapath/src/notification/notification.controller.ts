import {
  Controller,
  Get,
  Patch,
  Param,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationEntity } from './notification.entity';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private notificationRepository: Repository<NotificationEntity>,
  ) {}

  @Permissions('anapath:read')
  @Get()
  @ApiOperation({ summary: 'Lister toutes les notifications' })
  @ApiResponse({ status: 200, description: 'Liste des notifications', type: [NotificationResponseDto] })
  async getAllNotifications() {
    const notifications = await this.notificationRepository.find({
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return notifications;
  }

  @Permissions('anapath:read')
  @Get('unread/count')
  @ApiOperation({ summary: 'Compter les notifications non lues' })
  async getUnreadCount() {
    const count = await this.notificationRepository.count({ where: { read: false } });
    return { count };
  }

  @Permissions('anapath:update')
  @Patch('read-all')
  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  async markAllAsRead() {
    await this.notificationRepository
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ read: true })
      .where('read = :read', { read: false })
      .execute();
    return { success: true };
  }

  @Permissions('anapath:update')
  @Patch(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  async markAsRead(@Param('id') id: string) {
    await this.notificationRepository.update(id, { read: true });
    return { success: true };
  }
}