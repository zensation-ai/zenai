/**
 * Uptime Monitoring Connector
 *
 * Connects to UptimeRobot API for availability and response time metrics.
 *
 * @module services/business/uptime-connector
 */

import axios from 'axios';
import { logger } from '../../utils/logger';
import type { BusinessConnector, UptimeStatus, UptimeMonitor, UptimeIncident } from '../../types/business';

const UPTIMEROBOT_API = 'https://api.uptimerobot.com/v2';

class UptimeConnector implements BusinessConnector {
  readonly sourceType = 'uptime' as const;
  private apiKey: string | null = null;

  async initialize(): Promise<void> {
    this.apiKey = process.env.UPTIMEROBOT_API_KEY ?? null;
    if (!this.apiKey) {
      logger.warn('[UptimeConnector] UPTIMEROBOT_API_KEY not configured - connector disabled');
      return;
    }
    logger.info('[UptimeConnector] Initialized successfully');
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: 'UptimeRobot not configured. Set UPTIMEROBOT_API_KEY.' };
    }
    try {
      const response = await axios.post(`${UPTIMEROBOT_API}/getAccountDetails`, {
        api_key: this.apiKey,
        format: 'json',
      });
      if (response.data.stat === 'ok') {
        return { success: true, message: `Connected to UptimeRobot: ${response.data.account.email}` };
      }
      return { success: false, message: `UptimeRobot API error: ${response.data.error?.message ?? 'Unknown'}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `UptimeRobot connection failed: ${message}` };
    }
  }

  async collectMetrics(): Promise<Record<string, unknown>> {
    const status = await this.getUptimeStatus();
    return status as unknown as Record<string, unknown>;
  }

  // ============================================
  // Uptime Status
  // ============================================

  async getUptimeStatus(): Promise<UptimeStatus> {
    if (!this.apiKey) throw new Error('UptimeRobot not initialized');

    const response = await axios.post(`${UPTIMEROBOT_API}/getMonitors`, {
      api_key: this.apiKey,
      format: 'json',
      response_times: 1,
      response_times_limit: 1,
      logs: 1,
      logs_limit: 10,
      custom_uptime_ratios: '1-7-30',
    });

    if (response.data.stat !== 'ok') {
      throw new Error(`UptimeRobot API error: ${response.data.error?.message ?? 'Unknown'}`);
    }

    const rawMonitors = response.data.monitors ?? [];

    const monitors: UptimeMonitor[] = rawMonitors.map((m: Record<string, unknown>) => {
      const uptimeRatios = typeof m.custom_uptime_ratio === 'string'
        ? m.custom_uptime_ratio.split('-').map(Number)
        : [100, 100, 100];

      const responseTimes = Array.isArray(m.response_times) ? m.response_times : [];
      const latestResponseTime = responseTimes.length > 0
        ? (responseTimes[0] as Record<string, number>).value
        : 0;

      return {
        id: String(m.id),
        name: String(m.friendly_name ?? ''),
        status: m.status === 2 ? 'up' as const : m.status === 0 ? 'paused' as const : 'down' as const,
        uptime: uptimeRatios[2] ?? 100,
        responseTime: latestResponseTime,
      };
    });

    const incidents: UptimeIncident[] = [];
    for (const m of rawMonitors) {
      const logs = Array.isArray(m.logs) ? m.logs : [];
      for (const log of logs) {
        const logRecord = log as Record<string, unknown>;
        if (logRecord.type === 1) {
          incidents.push({
            id: `${m.id}-${logRecord.datetime}`,
            monitorName: String(m.friendly_name ?? ''),
            description: `${m.friendly_name} went down`,
            occurredAt: new Date(Number(logRecord.datetime) * 1000).toISOString(),
            resolvedAt: logRecord.duration
              ? new Date((Number(logRecord.datetime) + Number(logRecord.duration)) * 1000).toISOString()
              : null,
            duration: typeof logRecord.duration === 'number' ? logRecord.duration : null,
          });
        }
      }
    }

    const avgUptime = monitors.length > 0
      ? monitors.reduce((sum, m) => sum + m.uptime, 0) / monitors.length
      : 100;

    const avgResponseTime = monitors.length > 0
      ? Math.round(monitors.reduce((sum, m) => sum + m.responseTime, 0) / monitors.length)
      : 0;

    return {
      percentage: Math.round(avgUptime * 100) / 100,
      avgResponseTime,
      incidents: incidents.filter(i => !i.resolvedAt),
      monitors,
    };
  }
}

export const uptimeConnector = new UptimeConnector();
