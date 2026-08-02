import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ChuClient {
  private readonly baseUrl: string;
  private readonly anapathServiceId: string;
  private readonly timeout = 5000;

  constructor(configService?: ConfigService) {
    this.baseUrl = (
      configService?.get<string>('CHU_SERVICE_URL') ??
      process.env.CHU_SERVICE_URL ??
      'https://service-chu-back-production-d6a8.up.railway.app'
    ).replace(/\/$/, '');
    this.anapathServiceId =
      configService?.get<string>('ANAPATH_SERVICE_ID') ??
      process.env.ANAPATH_SERVICE_ID ??
      '9e73904c-71e5-4477-9280-513e4112a468';
  }

  async getChu(chuId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/service-chu/chu/${chuId}`, {
        timeout: this.timeout,
      });
      return data;
    } catch {
      return null;
    }
  }

  async getAllChus(): Promise<any[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/service-chu/chu`, {
        timeout: this.timeout,
      });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async getService(serviceId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/service-chu/service/${serviceId}`, {
        timeout: this.timeout,
      });
      return data;
    } catch {
      return null;
    }
  }

  async getServicesByChu(chuId: string): Promise<any[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/service-chu/service`, {
        params: { chuId },
        timeout: this.timeout,
      });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async getServiceInChu(chuId: string, serviceId: string): Promise<any> {
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/service-chu/service/chu/${chuId}/service/${serviceId}`,
        { timeout: this.timeout },
      );
      return data;
    } catch {
      return null;
    }
  }

  async getAnapathServiceInfo(): Promise<any> {
    return this.getService(this.anapathServiceId);
  }
}
