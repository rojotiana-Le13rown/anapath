import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ChuClient {
  private readonly baseUrl: string;
  private readonly cmsBaseUrl: string;
  private readonly anapathServiceId: string;
  private readonly timeout = 5000;

  constructor(configService?: ConfigService) {
    this.baseUrl = (
      configService?.get<string>('CHU_SERVICE_URL') ??
      process.env.CHU_SERVICE_URL ??
      'https://service-chu-back-production-d6a8.up.railway.app'
    ).replace(/\/$/, '');
    // Nouveau service CHU (Render) : expose /chu et /prise-en-charge.
    // Les routes « par id » renvoient actuellement 401, on les récupère donc
    // via la liste puis un filtre local (getCms*ById font le repli).
    this.cmsBaseUrl = (
      configService?.get<string>('CHU_CMS_SERVICE_URL') ??
      process.env.CHU_CMS_SERVICE_URL ??
      'https://chu-service-cms7.onrender.com'
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

  // ── Nouveau service CHU (chu-service-cms7) ──────────────────────────────

  private async cmsGet(token: string, path: string): Promise<any> {
    const { data } = await axios.get(`${this.cmsBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: this.timeout,
    });
    return data;
  }

  /** Liste des CHU du nouveau service (fonctionne avec le token utilisateur). */
  async getCmsChus(token: string): Promise<any[]> {
    try {
      const data = await this.cmsGet(token, '/chu');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** CHU par id : route directe puis repli sur la liste filtrée. */
  async getCmsChuById(token: string, chuId: string): Promise<any> {
    try {
      const data = await this.cmsGet(token, `/chu/${encodeURIComponent(chuId)}`);
      if (data) return data;
    } catch {}
    const list = await this.getCmsChus(token);
    return list.find((c) => String(c.id) === String(chuId)) ?? null;
  }

  /** Liste des prises en charge du nouveau service (fonctionne avec le token utilisateur). */
  async getCmsPriseEnCharges(token: string): Promise<any[]> {
    try {
      const data = await this.cmsGet(token, '/prise-en-charge');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** Prise en charge par id : route directe puis repli sur la liste filtrée. */
  async getCmsPriseEnChargeById(token: string, id: string): Promise<any> {
    try {
      const data = await this.cmsGet(token, `/prise-en-charge/${encodeURIComponent(id)}`);
      if (data) return data;
    } catch {}
    const list = await this.getCmsPriseEnCharges(token);
    return list.find((p) => String(p.id) === String(id)) ?? null;
  }
}
