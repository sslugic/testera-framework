#!/usr/bin/env node
/**
 * Full Testera App audit pipeline:
 * 1. Sign up + explore feature areas (session persists across journeys)
 * 2. Build Gherkin test plan from exploration
 * 3. Run generated Playwright specs
 * 4. Portfolio HTML report with Gherkin scenarios + pass/fail results
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadWorkspaceEnv } from '../src/config/load-env.js';
import { runAudit } from '../src/audit/run-audit.js';
import type { AuditTarget } from '../src/audit/targets.js';
import {
  buildTestPlan,
  generatePortfolioReport,
  type PlaywrightRunResult,
} from '../src/reporter/gherkin-report.js';

const OUT_DIR = path.resolve(process.cwd(), 'reports/testera-app-full');
const SESSION_PATH = path.join(OUT_DIR, '.auth', 'session.json');
const PORTFOLIO_REPORT = path.join(OUT_DIR, 'portfolio-gherkin-report.html');
const PW_JSON = path.join(OUT_DIR, 'playwright-results.json');

function buildTargets(runId: number): AuditTarget[] {
  const email = `luna.explore.${runId}@mailinator.test`;
  const password = 'TesteraSafe123!';

  return [
    {
      name: 'Sign Up & Onboarding',
      url: 'https://app.testera.io/#signup',
      goal: `Dismiss any install banner. Register a new account: name "Luna Explorer", company "Luna QA Labs", email "${email}", password "${password}", confirm password, then click Sign Up and reach the main app dashboard.`,
      maxSteps: 14,
    },
    {
      name: 'Dashboard & Navigation',
      url: 'https://app.testera.io',
      goal: 'Explore the main dashboard, sidebar navigation, workspace switcher, and all top-level menu items visible to a new user.',
      maxSteps: 16,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. You are already logged in as an active user. Bypass login/signup; dismiss any onboarding modal if present and explore the dashboard directly.',
    },
    {
      name: 'Projects',
      url: 'https://app.testera.io',
      goal: 'Navigate to Projects, create or open a project, explore project settings and project detail views.',
      maxSteps: 14,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Projects from the navigation and explore.',
    },
    {
      name: 'Test Cases',
      url: 'https://app.testera.io',
      goal: 'Find Test Cases section, browse the list, open a test case detail, explore steps and metadata fields.',
      maxSteps: 14,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Test Cases from the navigation.',
    },
    {
      name: 'Scenarios & Coverage',
      url: 'https://app.testera.io',
      goal: 'Navigate to Scenarios, view scenario list, open scenario detail, explore coverage matrix or journey views if available.',
      maxSteps: 14,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Scenarios from the navigation.',
    },
    {
      name: 'Test Plans',
      url: 'https://app.testera.io',
      goal: 'Find Test Plans, list plans, open a plan detail, explore plan structure and linked test cases.',
      maxSteps: 12,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Test Plans from the navigation.',
    },
    {
      name: 'Test Runs & Results',
      url: 'https://app.testera.io',
      goal: 'Navigate to Test Runs, view run history, open a run detail page, inspect pass/fail results and run metadata.',
      maxSteps: 12,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Test Runs from the navigation.',
    },
    {
      name: 'Environments',
      url: 'https://app.testera.io',
      goal: 'Find Environments configuration, list environments, view environment variables and URLs.',
      maxSteps: 10,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Environments from the navigation.',
    },
    {
      name: 'Tasks & Inbox',
      url: 'https://app.testera.io',
      goal: 'Explore Tasks, notifications inbox, and any task assignment or status workflow UI.',
      maxSteps: 10,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Tasks and notifications from the navigation.',
    },
    {
      name: 'Documents & Canvas',
      url: 'https://app.testera.io',
      goal: 'Find Documents, Canvas, or visualization features and explore creating or viewing a document.',
      maxSteps: 10,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Documents or Canvas features.',
    },
    {
      name: 'Settings & Integrations',
      url: 'https://app.testera.io',
      goal: 'Open Settings, profile, API keys, MCP connections, or integrations available to the user.',
      maxSteps: 12,
      authenticated: true,
      customInstructions: 'Reuse the active authenticated session. Do NOT sign in or sign up. Access Settings, profile, or MCP connections.',
    },
  ];
}

async function runPlaywrightSpecs(specDir: string): Promise<PlaywrightRunResult[]> {
  const files = (await fs.readdir(specDir)).filter((f) => f.endsWith('.spec.ts'));
  if (files.length === 0) return [];

  const relDir = path.relative(process.cwd(), specDir);

  try {
    execSync(`npx playwright test ${relDir} --reporter=json --reporter=list`, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: PW_JSON,
      },
      stdio: 'inherit',
      timeout: 30 * 60 * 1000,
    });
  } catch {
    // Playwright exits non-zero when tests fail — still parse results below
  }

  try {
    const raw = await fs.readFile(PW_JSON, 'utf-8');
    const json = JSON.parse(raw);
    const results: PlaywrightRunResult[] = [];

    for (const suite of json.suites || []) {
      collectSuiteResults(suite, results, specDir);
    }
    return results;
  } catch {
    return files.map((f) => ({
      specFile: f,
      title: f.replace('.spec.ts', ''),
      status: 'skipped' as const,
      error: 'Playwright JSON report not available',
    }));
  }
}

function collectSuiteResults(
  suite: any,
  results: PlaywrightRunResult[],
  specDir: string,
  parentTitle = ''
): void {
  const title = parentTitle ? `${parentTitle} › ${suite.title}` : suite.title || '';
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const result = test.results?.[0];
      const specFile = spec.file ? path.relative(process.cwd(), spec.file) : path.basename(specDir);
      results.push({
        specFile,
        title: spec.title || title,
        status: test.status === 'expected' ? 'passed' : test.status === 'skipped' ? 'skipped' : 'failed',
        durationMs: result?.duration,
        error: result?.error?.message,
      });
    }
  }
  for (const child of suite.suites || []) {
    collectSuiteResults(child, results, specDir, title);
  }
}

async function main() {
  const startedAt = new Date();
  const { provider, envSources } = loadWorkspaceEnv();
  const runId = Date.now();

  console.log('════════════════════════════════════════════════════════════');
  console.log('  Testera Luna — Full App Exploration Pipeline');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Target:  https://app.testera.io`);
  console.log(`  Provider: ${provider}`);
  console.log(`  Output:   ${OUT_DIR}`);
  if (envSources.length) console.log(`  Env:      ${envSources.join(', ')}`);
  console.log(`  Run ID:   ${runId}`);
  console.log('════════════════════════════════════════════════════════════\n');

  await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const targets = buildTargets(runId);

  console.log(`📋 Test plan: ${targets.length} feature areas to explore\n`);

  const summary = await runAudit({
    targets,
    provider: provider as 'cursor' | 'gemini' | 'anthropic' | 'openai' | 'mock',
    headless: true,
    artifactsDir: OUT_DIR,
    storageStatePath: SESSION_PATH,
    onTargetStart: (target, index, total) => {
      console.log(`\n[${index + 1}/${total}] 🔍 ${target.name}`);
      console.log(`         ${target.url}`);
      console.log(`         Goal: ${target.goal.slice(0, 100)}…`);
    },
    onTargetComplete: (target, result) => {
      console.log(
        `         ✔ ${result.steps.length} steps | Quality ${result.averageScore.overall}/100 | Spec: ${path.basename(result.generatedTestPath || '')}`
      );
    },
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Phase 2: Building Gherkin test plan');
  console.log('════════════════════════════════════════════════════════════\n');

  const features = buildTestPlan(
    summary.map((s) => ({
      name: s.name,
      url: s.url,
      goal: s.goal,
      steps: s.stepRecords,
      scores: s.scores,
      graphSummary: s.graphSummary,
      specPath: s.specPath,
      success: s.success,
    }))
  );

  for (const f of features) {
    console.log(`  • ${f.name} — ${f.coverage.steps} steps, ${f.scenarios[0]?.assertionCount ?? 0} assertions`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Phase 3: Running generated Playwright specs');
  console.log('════════════════════════════════════════════════════════════\n');

  const pwResults = await runPlaywrightSpecs(OUT_DIR);
  const passed = pwResults.filter((r) => r.status === 'passed').length;
  const failed = pwResults.filter((r) => r.status === 'failed').length;
  console.log(`\n  Playwright: ${passed} passed, ${failed} failed, ${pwResults.length} total\n`);

  const finishedAt = new Date();
  await generatePortfolioReport({
    outputPath: PORTFOLIO_REPORT,
    title: 'Testera App — Full Exploration & Verification Report',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    features,
    playwrightResults: pwResults,
    provider,
  });

  console.log('════════════════════════════════════════════════════════════');
  console.log('  ✅ Pipeline complete');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Gherkin portfolio: ${PORTFOLIO_REPORT}`);
  console.log(`  Generated specs:   ${OUT_DIR}/*.spec.ts`);
  console.log(`  Session saved:     ${SESSION_PATH}`);
  console.log('════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err);
  process.exit(1);
});
