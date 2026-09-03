import path from 'node:path';
import { TesteraEngine } from '../engine.js';
import type { RunResult } from '../engine.js';
import type { FrameworkConfig, StepRecord } from '../types/index.js';
import { normalizeTarget, type AuditTarget, type NormalizedAuditTarget } from './targets.js';

export interface AuditRunOptions {
  targets: AuditTarget[];
  provider?: FrameworkConfig['provider'];
  headless?: boolean;
  maxSteps?: number;
  goal?: string;
  artifactsDir?: string;
  /** Persist auth/session across journeys (signup → feature exploration) */
  storageStatePath?: string;
  onTargetStart?: (target: NormalizedAuditTarget, index: number, total: number) => void;
  onTargetComplete?: (target: NormalizedAuditTarget, result: RunResult) => void;
}

export interface AuditSummaryRow {
  name: string;
  url: string;
  goal: string;
  steps: number;
  stepRecords: StepRecord[];
  success: boolean;
  graphSummary: RunResult['graphSummary'];
  scores: RunResult['averageScore'];
  specPath?: string;
  reportPath?: string;
}

export async function runAudit(options: AuditRunOptions): Promise<AuditSummaryRow[]> {
  const defaults = {
    maxSteps: options.maxSteps ?? 8,
    goal: options.goal,
  };

  const outDir = path.resolve(process.cwd(), options.artifactsDir ?? './reports');
  const normalized = options.targets.map((t) => normalizeTarget(t, defaults));
  const summary: AuditSummaryRow[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const target = normalized[i];
    options.onTargetStart?.(target, i, normalized.length);

    const sessionPath = target.storageStatePath || options.storageStatePath;
    const engine = new TesteraEngine({
      provider: options.provider,
      headless: options.headless ?? true,
      maxSteps: target.maxSteps,
      artifactsDir: outDir,
      storageStatePath: sessionPath,
    });

    const result = await engine.runJourney({
      goal: target.goal,
      startUrl: target.url,
      maxSteps: target.maxSteps,
      customInstructions: target.customInstructions,
      storageStatePath: sessionPath,
      authenticated: target.authenticated,
    });

    options.onTargetComplete?.(target, result);

    summary.push({
      name: target.name,
      url: target.url,
      goal: target.goal,
      steps: result.steps.length,
      stepRecords: result.steps,
      success: result.success,
      graphSummary: result.graphSummary,
      scores: result.averageScore,
      specPath: result.generatedTestPath,
      reportPath: result.reportPath,
    });
  }

  return summary;
}
