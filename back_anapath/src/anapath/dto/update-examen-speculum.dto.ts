import { IsOptional, IsString } from 'class-validator';

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
  @IsString()
  typePrelevement?: string;

  @IsOptional()
  @IsString()
  fixation?: string;

  @IsOptional()
  @IsString()
  prescripteurSignature?: string;

  @IsOptional()
  @IsString()
  preleveurSignature?: string;
}
