import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnapathService } from './anapath.service';
import { AnapathController } from './anapath.controller';
import { AnapathRequest } from './entities/anapath-request.entity';
import { ReportSettings } from './entities/report-settings.entity';
import { ChuClient } from '../common/clients/chu.client';
import { NotificationClient } from '../common/clients/notification.client';
import { AccueilClient } from '../common/clients/accueil.client';
import { PrescriptionClient } from '../common/clients/prescription.client';
import { PrescriptionRealtimeService } from '../common/clients/prescription-realtime.service';
import { PrescriptionTokenMonitorService } from '../common/clients/prescription-token-monitor.service';
import { AuthServiceTokenService } from '../common/clients/auth-service-token.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [TypeOrmModule.forFeature([AnapathRequest, ReportSettings]), NotificationModule],
  controllers: [AnapathController],
  providers: [
    AnapathService,
    NotificationClient,
    ChuClient,
    AccueilClient,
    PrescriptionClient,
    PrescriptionRealtimeService,
    PrescriptionTokenMonitorService,
    AuthServiceTokenService,
  ],
  exports: [AnapathService],
})
export class AnapathModule {}