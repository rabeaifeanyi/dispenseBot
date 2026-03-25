import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { SystemStatusCode } from '../common/constants/system-status-codes';
import { getComponentsConfig } from '../config/config';

type McDataPayload = Record<string, number>;

export interface McStatusResponse {
  status_bin: string;
  warte_auf_magazin_einsetzen?: number | boolean;
  system_zeit?: number;
  [key: string]: unknown;
}

function isMagazineChangeDuringDispense(data: McStatusResponse): boolean {
  if (data.status_bin !== SystemStatusCode.MAG_CHANGE) return false;
  const w = data.warte_auf_magazin_einsetzen;
  if (w === 1 || w === true) return false;
  return true;
}

export type DispensedAmounts = Partial<Record<string, number>>;

@Injectable()
export class McClientService {
  private readonly logger = new Logger(McClientService.name);
  private readonly mcUrl: string;
  private readonly mcStatusUrl: string;
  private readonly mcMagazineChangeUrl: string;
  private readonly requestTimeout = 10000;
  private readonly statusPollInterval = 2000;
  private readonly maxProcessingTime = 300000;
  private readonly statusCacheTtlMs = 900;
  private statusCache: { at: number; data: McStatusResponse } | null = null;
  private statusInFlight: Promise<McStatusResponse | null> | null = null;
  private lastStatusErrorLogAt = 0;

  constructor(private readonly httpService: HttpService) {
    const configUrl = process.env.MC_API_URL || 'http://localhost:3002';
    const baseUrl = configUrl
      .replace(/\/data$/, '')
      .replace(/\/setAusgabe$/, '')
      .replace(/\/status$/, '');
    this.mcUrl = `${baseUrl}/setAusgabe`;
    this.mcStatusUrl = `${baseUrl}/status`;
    this.mcMagazineChangeUrl = `${baseUrl}/magazinwechsel`;
    this.logger.log(`MC Status URL: ${this.mcStatusUrl}`);
    this.logger.log(`MC Magazine Change URL: ${this.mcMagazineChangeUrl}`);
  }

  async sendOrderToMc(
    orderItems: Map<string, number>
  ): Promise<DispensedAmounts> {
    await this.waitForMcReady();

    const payload = this.convertOrderToMcPayload(orderItems);
    this.logger.debug(`Sending data to MC: ${JSON.stringify(payload)}`);

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await firstValueFrom(
          this.httpService
            .post<{ status: string }>(this.mcUrl, payload, {
              headers: { 'Content-Type': 'application/json' },
              proxy: false,
            })
            .pipe(timeout(this.requestTimeout))
        );
        break;
      } catch (error: any) {
        if (attempt < maxAttempts && this.isConnectionError(error.message)) {
          this.logger.warn(
            `/setAusgabe attempt ${attempt} failed (${error.message}), retrying in 2s…`
          );
          await this.sleep(2000);
        } else {
          throw error;
        }
      }
    }

    this.logger.log(`Order sent to MC: ${this.mcUrl}`);
    return this.waitForCompletion();
  }

  async waitForCompletion(): Promise<DispensedAmounts> {
    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      if (Date.now() - startTime > this.maxProcessingTime) {
        throw new Error('MC Timeout: Order processing exceeded 5 minutes');
      }

      pollCount++;
      this.logger.debug(`Status poll #${pollCount}`);

      try {
        const response = await firstValueFrom(
          this.httpService
            .get<McStatusResponse>(this.mcStatusUrl, { proxy: false })
            .pipe(timeout(30000))
        );

        const statusBin = response.data.status_bin;
        this.logger.debug(`MC status_bin: ${statusBin} (poll #${pollCount})`);

        if (isMagazineChangeDuringDispense(response.data)) {
          this.logger.warn('MC signals magazine change needed (MAG_CHANGE)');
          throw new Error(
            `MC_MAGAZINE_CHANGE_NEEDED: ${JSON.stringify(response.data)}`
          );
        }

        if (statusBin === SystemStatusCode.FINISHED) {
          this.logger.log('Order completed (FINISHED)');
          const amounts = this.parseAmounts(response.data);
          this.logger.log(`Dispensed amounts: ${JSON.stringify(amounts)}`);
          return amounts;
        }

        if (statusBin === SystemStatusCode.WAIT_ORDER) {
          this.logger.warn('MC returned to WAIT_ORDER unexpectedly');
          throw new Error('MC lost order state');
        }

        await this.sleep(this.statusPollInterval);
      } catch (error: any) {
        if (
          error.message.includes('MC_MAGAZINE_CHANGE_NEEDED') ||
          error.message.includes('lost order state')
        ) {
          throw error;
        }
        this.logger.warn(`Status poll failed: ${error.message}, retrying...`);
        await this.sleep(this.statusPollInterval);
      }
    }
  }

  private async waitForMcReady(): Promise<void> {
    const maxWaitTime = 60000;
    const maxConnectionSetupTime = 20000;
    const startTime = Date.now();
    let connectionSetupSince = 0;
    let lastLogTime = 0;
    const logIntervalMs = 10000;

    while (true) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('MC not ready: Timeout waiting for readiness (60s)');
      }

      try {
        const response = await firstValueFrom(
          this.httpService
            .get<McStatusResponse>(this.mcStatusUrl)
            .pipe(timeout(5000))
        );

        const statusBin = response.data.status_bin;

        if (statusBin === SystemStatusCode.WAIT_ORDER) {
          this.logger.log('MC is ready');
          return;
        }

        if (isMagazineChangeDuringDispense(response.data)) {
          throw new Error(
            `MC_MAGAZINE_CHANGE_NEEDED: ${JSON.stringify(response.data)}`
          );
        }

        if (statusBin === SystemStatusCode.NO_CLIENT) {
          if (connectionSetupSince === 0) connectionSetupSince = Date.now();
          if (Date.now() - connectionSetupSince > maxConnectionSetupTime) {
            throw new Error(
              'MC did not become ready: Device stuck in NO_CLIENT (0000). Bitte MC/ESP32 prüfen (Strom, WLAN, Firmware).'
            );
          }
        } else {
          connectionSetupSince = 0;
        }

        const now = Date.now();
        if (now - lastLogTime >= logIntervalMs) {
          this.logger.debug(`MC not ready yet (status_bin: ${statusBin})`);
          lastLogTime = now;
        }
        await this.sleep(1000);
      } catch (error: any) {
        connectionSetupSince = 0;
        if (error.message?.includes('MC_MAGAZINE_CHANGE_NEEDED')) {
          throw error;
        }
        if (
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ENOTFOUND') ||
          error.message?.includes('Timeout')
        ) {
          const now = Date.now();
          if (now - lastLogTime >= logIntervalMs) {
            this.logger.warn(
              `MC unreachable (${error.message}). Verify MC_API_URL: ${this.mcStatusUrl}`
            );
            lastLogTime = now;
          }
        } else {
          this.logger.warn(
            `Waiting for MC readiness failed: ${error.message}, retrying...`
          );
        }
        await this.sleep(1000);
      }
    }
  }

  async checkMcHealth(): Promise<boolean> {
    const status = await this.getMcStatus();
    return status !== null;
  }

  async getMcStatus(): Promise<McStatusResponse | null> {
    const now = Date.now();
    if (
      this.statusCache &&
      now - this.statusCache.at <= this.statusCacheTtlMs
    ) {
      return this.statusCache.data;
    }

    if (this.statusInFlight) {
      return await this.statusInFlight;
    }

    this.statusInFlight = (async () => {
      try {
        const response = await firstValueFrom(
          this.httpService
            .get<McStatusResponse>(this.mcStatusUrl, { proxy: false })
            .pipe(timeout(5000))
        );
        this.statusCache = { at: Date.now(), data: response.data };
        return response.data;
      } catch (error: any) {
        const now = Date.now();
        if (now - this.lastStatusErrorLogAt >= 5000) {
          this.lastStatusErrorLogAt = now;
          this.logger.debug(`Failed to get MC status: ${error.message}`);
        }
        return null;
      }
    })();

    try {
      return await this.statusInFlight;
    } finally {
      this.statusInFlight = null;
    }
  }

  async confirmMagazineChange(
    changeFlags: Record<string, number>
  ): Promise<void> {
    this.logger.log(
      `Confirming magazine change (step 1): ${JSON.stringify(changeFlags)}`
    );
    try {
      await firstValueFrom(
        this.httpService
          .post(this.mcMagazineChangeUrl, changeFlags, {
            headers: { 'Content-Type': 'application/json' },
            proxy: false,
          })
          .pipe(timeout(10000))
      );
      this.logger.log(
        'Magazine change step 1 confirmed (MAG_CHANGE → CALIBRATING)'
      );
    } catch (error: any) {
      this.logger.warn(
        `Magazine change step 1 failed: ${error.message}. Continuing to wait for MAG_INSERT_CONFIRM.`
      );
    }

    const maxCalibrationWaitMs = 45_000;
    const pollIntervalMs = 500;
    const startTime = Date.now();
    let step2SentAt = 0;
    const step2MinIntervalMs = 1500;

    while (Date.now() - startTime < maxCalibrationWaitMs) {
      await this.sleep(pollIntervalMs);
      try {
        const response = await firstValueFrom(
          this.httpService
            .get<McStatusResponse>(this.mcStatusUrl, { proxy: false })
            .pipe(timeout(5000))
        );
        const data = response.data;
        const waitFlag = data.warte_auf_magazin_einsetzen;

        if (data.status_bin === SystemStatusCode.WAIT_ORDER) {
          this.logger.log('MC in WAIT_ORDER – magazine change complete');
          return;
        }

        if (
          data.status_bin === SystemStatusCode.MAG_CHANGE &&
          (waitFlag === 1 || waitFlag === true)
        ) {
          const now = Date.now();
          if (now - step2SentAt >= step2MinIntervalMs) {
            step2SentAt = now;
            const isRetry = step2SentAt > startTime + step2MinIntervalMs * 2;
            this.logger.log(
              isRetry
                ? 'Kalibrierung abgeschlossen – sende Magazin-Einsetz-Bestätigung (step 2, Retry)'
                : 'Kalibrierung abgeschlossen – sende Magazin-Einsetz-Bestätigung (step 2)'
            );
            try {
              await firstValueFrom(
                this.httpService
                  .post(this.mcMagazineChangeUrl, changeFlags, {
                    headers: { 'Content-Type': 'application/json' },
                    proxy: false,
                  })
                  .pipe(timeout(10000))
              );
              this.logger.log('Step 2 sent – warte auf WAIT_ORDER');
            } catch (error: any) {
              this.logger.warn(
                `Magazine change step 2 failed: ${error.message}. Wird wiederholt.`
              );
            }
          }
          continue;
        }
      } catch (error: any) {
        this.logger.warn(
          `Status poll during magazine change wait: ${error.message}`
        );
      }
    }

    this.logger.warn(
      'confirmMagazineChange: Timeout waiting for WAIT_ORDER after calibration'
    );
  }

  parseAmounts(statusData: McStatusResponse): DispensedAmounts {
    const cfg = getComponentsConfig();
    const amounts: DispensedAmounts = {};

    for (const [partType, partCfg] of Object.entries(cfg.parts)) {
      const idx = partCfg.mc.antwortIndex;
      const mcKey = `antwort_wert${idx}`;
      const raw = (statusData as any)?.[mcKey];
      (amounts as any)[partType] =
        typeof raw === 'number' && raw >= 0 ? raw : 0;
    }

    this.logger.debug(`Parsed dispensed amounts: ${JSON.stringify(amounts)}`);
    return amounts;
  }

  private convertOrderToMcPayload(
    orderItems: Map<string, number>
  ): McDataPayload {
    const cfg = getComponentsConfig();
    const payload: McDataPayload = {};

    for (const [partType, partCfg] of Object.entries(cfg.parts)) {
      const idx = partCfg.mc.wertIndex;
      payload[`wert${idx}`] = orderItems.get(partType) ?? 0;
    }

    return payload;
  }

  private isConnectionError(message: string): boolean {
    return (
      message.includes('socket hang up') ||
      message.includes('ECONNRESET') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('Timeout')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
