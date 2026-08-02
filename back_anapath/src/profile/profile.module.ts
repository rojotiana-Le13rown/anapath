import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfile } from './user-profile.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { FilesController } from './files.controller';
import { UploadClient } from '../common/clients/upload.client';

@Module({
  imports: [TypeOrmModule.forFeature([UserProfile])],
  controllers: [ProfileController, FilesController],
  providers: [ProfileService, UploadClient],
})
export class ProfileModule {}
