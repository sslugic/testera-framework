import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import type { FrameworkConfig } from '../types/index.js';
import { TelemetryCollector } from '../observer/telemetry.js';

export class BrowserRuntime {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  public readonly telemetry: TelemetryCollector;
  private config: FrameworkConfig;

  constructor(config: FrameworkConfig) {
    this.config = config;
    this.telemetry = new TelemetryCollector();
  }

  async launch(): Promise<Page> {
    const launchOptions = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    };

    const browserType = (process.env.BROWSER || 'chromium').toLowerCase();
    if (browserType === 'firefox') {
      this.browser = await firefox.launch(launchOptions);
    } else if (browserType === 'webkit') {
      this.browser = await webkit.launch(launchOptions);
    } else {
      this.browser = await chromium.launch(launchOptions);
    }

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: this.config.viewport,
      userAgent: 'TesteraLuna/1.0 (Autonomous UI Framework)',
    };

    if (this.config.storageStatePath && fs.existsSync(this.config.storageStatePath)) {
      contextOptions.storageState = this.config.storageStatePath;
    }

    this.context = await this.browser.newContext(contextOptions);

    this.page = await this.context.newPage();
    this.telemetry.attach(this.page);

    return this.page;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser runtime not started. Call launch() first.');
    }
    return this.page;
  }

  async saveStorageState(filePath: string): Promise<void> {
    if (!this.context) return;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
    await this.context.storageState({ path: filePath });
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
