import type { Page, Request, Response } from 'playwright';
import type { TelemetryLog } from '../types/index.js';

export class TelemetryCollector {
  private logs: TelemetryLog[] = [];
  private attached = false;

  attach(page: Page): void {
    if (this.attached) return;
    this.attached = true;

    page.on('console', (msg) => {
      const type = msg.type();
      let logType: TelemetryLog['type'] = 'console-log';
      if (type === 'error') logType = 'console-error';
      else if (type === 'warning') logType = 'console-warn';

      this.logs.push({
        type: logType,
        timestamp: Date.now(),
        text: `[console.${type}] ${msg.text()}`,
      });
    });

    page.on('pageerror', (err) => {
      this.logs.push({
        type: 'page-error',
        timestamp: Date.now(),
        text: `[uncaught-error] ${err.name}: ${err.message}\n${err.stack || ''}`,
      });
    });

    page.on('requestfailed', (req: Request) => {
      const failure = req.failure();
      this.logs.push({
        type: 'network-error',
        timestamp: Date.now(),
        text: `[network-fail] ${req.method()} ${req.url()} - ${failure ? failure.errorText : 'Unknown error'}`,
        url: req.url(),
      });
    });

    page.on('response', (res: Response) => {
      const status = res.status();
      if (status >= 400) {
        this.logs.push({
          type: 'network-error',
          timestamp: Date.now(),
          text: `[http-${status}] ${res.request().method()} ${res.url()} returned HTTP ${status}`,
          url: res.url(),
          status,
        });
      }
    });
  }

  getLogs(sinceTimestamp = 0): TelemetryLog[] {
    return this.logs.filter((log) => log.timestamp >= sinceTimestamp);
  }

  hasErrors(sinceTimestamp = 0): boolean {
    return this.logs.some(
      (l) => l.timestamp >= sinceTimestamp && (l.type === 'console-error' || l.type === 'page-error' || l.type === 'network-error')
    );
  }

  clear(): void {
    this.logs = [];
  }
}
