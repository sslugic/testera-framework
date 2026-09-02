import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Observation } from '../types/index.js';
import { A11yTreeExtractor } from './a11y-tree.js';
import { TelemetryCollector } from './telemetry.js';

export interface ObserverOptions {
  artifactsDir: string;
  captureScreenshots?: boolean;
  captureBase64?: boolean;
}

export class PageObserver {
  private telemetry: TelemetryCollector;
  private artifactsDir: string;
  private captureScreenshots: boolean;
  private captureBase64: boolean;

  constructor(telemetry: TelemetryCollector, options: ObserverOptions) {
    this.telemetry = telemetry;
    this.artifactsDir = options.artifactsDir;
    this.captureScreenshots = options.captureScreenshots ?? true;
    this.captureBase64 = options.captureBase64 ?? false;
  }

  async observe(page: Page, stepIndex: number): Promise<Observation> {
    const url = page.url();
    const title = await page.title();

    // 1. Extract Accessibility Tree and Interactive Elements
    const { treeText, elements, domMetrics } = await A11yTreeExtractor.extract(page);

    // 2. Capture Screenshot if enabled
    let screenshotPath: string | undefined;
    let screenshotBase64: string | undefined;

    if (this.captureScreenshots) {
      const screenshotsDir = path.join(this.artifactsDir, 'screenshots');
      await fs.mkdir(screenshotsDir, { recursive: true });
      screenshotPath = path.join(screenshotsDir, `step-${stepIndex}.png`);

      const buffer = await page.screenshot({ fullPage: false });
      await fs.writeFile(screenshotPath, buffer);

      if (this.captureBase64) {
        screenshotBase64 = buffer.toString('base64');
      }
    }

    // 3. Collect Telemetry
    const telemetryLogs = this.telemetry.getLogs();

    return {
      stepIndex,
      url,
      title,
      a11yTreeText: treeText,
      interactiveElements: elements,
      screenshotPath,
      screenshotBase64,
      telemetry: telemetryLogs,
      domMetrics,
    };
  }
}
