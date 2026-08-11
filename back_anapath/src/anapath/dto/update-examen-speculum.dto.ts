import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateExamenSpeculumDto {
  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  prelevementDetails?: string;

  @IsOptional()
  @IsString()
  dateExamen?: string;

  @IsOptional()
  @IsIn(['EXOCOL', 'COUPOLE_VAGINALE'])
  typePrelevement?: string;

  @IsOptional()
  @IsIn(['ENDOCOL', 'CULS_DE_SAC'])
  fixation?: string;

  @IsOptional()
  @IsString()
  prescripteurSignature?: string;

  @IsOptional()
  @IsString()
  preleveurSignature?: string;
}
