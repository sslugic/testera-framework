import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type {
  FrameworkConfig,
  JourneyGoal,
  StepRecord,
  Observation,
  UIAction,
  CriticScore,
  SelfHealingPatch,
} from './types/index.js';
import { BrowserRuntime } from './runtime/browser.js';
import { PageObserver } from './observer/observer.js';
import { ActionExecutor, type ExecutionResult } from './runtime/executor.js';
import { Planner } from './planner/planner.js';
import { Critic } from './critic/critic.js';
import { ExplorationGraph } from './memory/graph.js';
import { SelfHealer } from './healer/self-healer.js';
import { SafetyGuard } from './guardrails/safety-guard.js';
import { TestSynthesizer } from './generator/test-synthesizer.js';
import { HTMLReporter } from './reporter/html-reporter.js';

export interface RunResult {
  success: boolean;
  steps: StepRecord[];
  graphSummary: ReturnType<ExplorationGraph['getSummary']>;
  averageScore: {
    functionality: number;
    usability: number;
    interaction: number;
    overall: number;
  };
  generatedTestPath?: string;
  reportPath?: string;
  selfHealingPatches: SelfHealingPatch[];
}

export class TesteraEngine {
  private config: FrameworkConfig;
  private runtime: BrowserRuntime;
  private observer: PageObserver;
  private planner: Planner;
  private critic: Critic;
  private graph: ExplorationGraph;

  constructor(config?: Partial<FrameworkConfig>) {
    this.config = {
      provider: (process.env.AI_PROVIDER as any) || 'gemini',
      apiKey:
        process.env.CURSOR_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY,
      headless: process.env.HEADLESS !== 'false',
      slowMo: parseInt(process.env.SLOW_MO || '0', 10),
      viewport: { width: 1280, height: 800 },
      artifactsDir: path.resolve(process.cwd(), 'reports'),
      maxSteps: 15,
      enableAxeCore: true,
      captureScreenshots: true,
      safeMode: process.env.SAFE_MODE !== 'false',
      ...config,
    };

    this.runtime = new BrowserRuntime(this.config);
    this.observer = new PageObserver(this.runtime.telemetry, {
      artifactsDir: this.config.artifactsDir,
      captureScreenshots: this.config.captureScreenshots,
      captureBase64: false,
    });
    this.planner = new Planner(this.config);
    this.critic = new Critic(this.config);
    this.graph = new ExplorationGraph();
  }

  async runJourney(goal: JourneyGoal): Promise<RunResult> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    const page = await this.runtime.launch();
    const steps: StepRecord[] = [];
    const patches: SelfHealingPatch[] = [];

    try {
      // Initial navigation
      await page.goto(goal.startUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);

      let stepIndex = 1;
      let isFinished = false;

      while (stepIndex <= (goal.maxSteps || this.config.maxSteps) && !isFinished) {
        // 1. Observer: capture state
        const obsBefore = await this.observer.observe(page, stepIndex);
        const nodeBefore = this.graph.getOrCreateNode(obsBefore);

        // 2. Planner: decide next action
        const action = await this.planner.planNextStep(
          goal,
          obsBefore,
          steps,
          stepIndex,
          nodeBefore.unexploredElements
        );

        if (action.action === 'finish' || action.isGoalComplete) {
          isFinished = true;
          steps.push({
            stepIndex,
            timestamp: Date.now(),
            action,
            observationBefore: obsBefore,
            success: true,
          });
          break;
        }

        // 3. Safety Guardrail: validate before execution
        const safetyCheck = SafetyGuard.validate(action, obsBefore, goal, {
          safeMode: goal?.safeMode ?? this.config.safeMode,
          blockedActionPatterns: this.config.blockedActionPatterns,
          allowDestructive: goal?.allowDestructive,
        });

        let execResult: ExecutionResult;
        let healed = false;
        let patch: SelfHealingPatch | undefined;

        if (!safetyCheck.allowed) {
          // Destructive action intercepted before execution
          action.isBlocked = true;
          action.blockedReason = safetyCheck.reason;
          execResult = {
            success: false,
            duration: 0,
            error: safetyCheck.reason,
            targetUsed: safetyCheck.targetDescription,
            actualAction: action,
          };
        } else {
          // 4. Runtime: execute action
          execResult = await ActionExecutor.execute(page, action, obsBefore);

          // 5. Self-Healing recovery if execution failed
          if (!execResult.success && action.targetIndex) {
            const brokenElement = obsBefore.interactiveElements[action.targetIndex - 1];
            if (brokenElement) {
              const currentObs = await this.observer.observe(page, stepIndex);
              const healedResult = SelfHealer.findHealedElement(
                brokenElement.locatorFingerprint,
                currentObs,
                0.6
              );

              if (healedResult) {
                patch = SelfHealer.createPatch(
                  brokenElement.selector,
                  brokenElement.locatorFingerprint,
                  healedResult.match,
                  healedResult.similarity,
                  stepIndex,
                  healedResult.reason
                );
                patches.push(patch);

                // Retry execution with healed target
                const healedAction: UIAction = {
                  ...action,
                  targetIndex: healedResult.match.index,
                  rationale: `[SELF-HEALED: ${healedResult.reason}] ${action.rationale}`,
                };
                execResult = await ActionExecutor.execute(page, healedAction, currentObs);
                healed = execResult.success;
              }
            }
          }
        }

        // 5. Observer: post-action state
        const obsAfter = await this.observer.observe(page, stepIndex);
        const nodeAfter = this.graph.getOrCreateNode(obsAfter);

        if (action.targetIndex) {
          this.graph.markElementExplored(nodeBefore.id, action.targetIndex);
        }
        this.graph.recordTransition({
          fromNodeId: nodeBefore.id,
          toNodeId: nodeAfter.id,
          action,
          success: execResult.success,
          duration: execResult.duration,
          error: execResult.error,
        });

        // 6. Critic & Scorer: evaluate transition
        const score = await this.critic.critique(action, execResult, obsBefore, obsAfter);

        steps.push({
          stepIndex,
          timestamp: Date.now(),
          action: execResult.actualAction,
          observationBefore: obsBefore,
          observationAfter: obsAfter,
          score,
          success: execResult.success,
          error: execResult.error,
          healed,
          selfHealingPatch: patch,
        });

        // Persist session immediately when authentication state is reached/updated
        if (this.config.storageStatePath && execResult.success) {
          const isAuthEvent =
            /sign in|sign up|log in|register/i.test(action.rationale || '') ||
            obsAfter.interactiveElements.some((el) => /logout|sign out|workspace|dashboard|settings/i.test(el.name || '')) ||
            /dashboard|projects|test-plans/i.test(obsAfter.url);
          if (isAuthEvent) {
            await this.runtime.saveStorageState(this.config.storageStatePath).catch(() => {});
          }
        }

        stepIndex++;
      }

      // Generate Playwright spec & HTML report
      const runId = `run-${Date.now()}`;
      const generatedTestPath = path.join(this.config.artifactsDir, `${runId}.spec.ts`);
      await TestSynthesizer.saveToFile(generatedTestPath, steps, goal, goal.goal, {
        storageStatePath: goal.storageStatePath || this.config.storageStatePath,
      });

      const reportPath = path.join(this.config.artifactsDir, `${runId}-report.html`);
      await HTMLReporter.generate(reportPath, {
        runId,
        goal,
        steps,
        graphSummary: this.graph.getSummary(),
        patches,
      });

      return {
        success: steps.some((s) => s.action.isGoalComplete || s.action.action === 'finish') || steps.every((s) => s.success),
        steps,
        graphSummary: this.graph.getSummary(),
        averageScore: this.calculateAverageScore(steps),
        generatedTestPath,
        reportPath,
        selfHealingPatches: patches,
      };
    } finally {
      if (this.config.storageStatePath) {
        await this.runtime.saveStorageState(this.config.storageStatePath).catch(() => {});
      }
      await this.runtime.close();
    }
  }

  async runExploration(url: string, maxSteps = 10): Promise<RunResult> {
    return this.runJourney({
      goal: 'Autonomously explore the web application, discover all navigable views, interact with buttons/forms, and identify UX friction.',
      startUrl: url,
      maxSteps,
    });
  }

  private calculateAverageScore(steps: StepRecord[]) {
    const scored = steps.filter((s) => s.score);
    if (scored.length === 0) {
      return { functionality: 100, usability: 100, interaction: 100, overall: 100 };
    }

    const totals = scored.reduce(
      (acc, s) => {
        acc.func += s.score!.functionality;
        acc.use += s.score!.usability;
        acc.int += s.score!.interaction;
        acc.overall += s.score!.overall;
        return acc;
      },
      { func: 0, use: 0, int: 0, overall: 0 }
    );

    const n = scored.length;
    return {
      functionality: Math.round(totals.func / n),
      usability: Math.round(totals.use / n),
      interaction: Math.round(totals.int / n),
      overall: Math.round(totals.overall / n),
    };
  }
}
