import type { StepRecord } from '../types/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deriveStepAssertions } from '../generator/assertion-synthesizer.js';

export interface GherkinScenario {
  name: string;
  feature: string;
  goal: string;
  tags: string[];
  given: string[];
  when: string[];
  then: string[];
  status: 'explored' | 'passed' | 'failed' | 'skipped';
  specPath?: string;
  assertionCount: number;
}

export interface TestPlanFeature {
  name: string;
  description: string;
  scenarios: GherkinScenario[];
  coverage: {
    steps: number;
    states: number;
    overallScore: number;
  };
}

function actionToWhen(step: StepRecord): string | null {
  const { action } = step;
  const el =
    action.targetIndex && step.observationBefore.interactiveElements[action.targetIndex - 1];

  switch (action.action) {
    case 'navigate':
      return `I navigate to "${action.value || action.targetSelector || 'the target URL'}"`;
    case 'click':
      return el ? `I click "${el.name || el.role}"` : `I click the target element`;
    case 'fill':
      return el
        ? `I fill "${el.name || 'the field'}" with "${action.value || ''}"`
        : `I fill the form field with "${action.value || ''}"`;
    case 'select':
      return el ? `I select "${action.value || ''}" in "${el.name}"` : null;
    case 'press':
      return `I press "${action.key || action.value || 'Enter'}"`;
    case 'scroll':
      return `I scroll ${action.direction || 'down'} on the page`;
    case 'assert':
      return el ? `I verify "${el.name}" is visible` : null;
    default:
      return null;
  }
}

function assertionsToThen(step: StepRecord): string[] {
  const lines: string[] = [];
  if (step.action.action === 'assert' && step.action.value) {
    lines.push(`I should see text "${step.action.value}"`);
  }
  if (step.action.expectedOutcome) {
    lines.push(step.action.expectedOutcome.replace(/^./, (c) => c.toUpperCase()));
  }
  for (const derived of deriveStepAssertions(step)) {
    if (derived.code.includes('toHaveURL')) lines.push('The page URL should reflect the new view');
    else if (derived.code.includes('toHaveTitle')) lines.push('The page title should update');
    else if (derived.code.includes('toHaveValue')) lines.push('The input value should persist');
    else if (derived.code.includes('toBeVisible')) lines.push(derived.reason);
    else if (derived.code.includes('toContainText')) lines.push(derived.reason);
  }
  return [...new Set(lines)];
}

export function stepsToGherkinScenario(
  featureName: string,
  scenarioName: string,
  goal: string,
  startUrl: string,
  steps: StepRecord[],
  tags: string[] = []
): GherkinScenario {
  const given = [`I open "${startUrl}"`];
  const when: string[] = [];
  const then: string[] = [];
  let assertionCount = 0;

  for (const step of steps.filter((s) => s.success && s.action.action !== 'finish')) {
    const whenLine = actionToWhen(step);
    if (whenLine) when.push(whenLine);
    const thenLines = assertionsToThen(step);
    assertionCount += thenLines.length;
    then.push(...thenLines);
  }

  if (then.length === 0) {
    then.push('The journey completes without errors');
  }

  return {
    name: scenarioName,
    feature: featureName,
    goal,
    tags,
    given,
    when,
    then: [...new Set(then)],
    status: 'explored',
    assertionCount,
  };
}

export function buildTestPlan(
  runs: Array<{
    name: string;
    url: string;
    goal: string;
    steps: StepRecord[];
    scores: { overall: number };
    graphSummary: { totalStates: number };
    specPath?: string;
    success: boolean;
  }>
): TestPlanFeature[] {
  return runs.map((run) => {
    const scenario = stepsToGherkinScenario(
      'Testera Application',
      run.name,
      run.goal,
      run.url,
      run.steps,
      ['@testera', '@app', `@${run.name.toLowerCase().replace(/\s+/g, '-')}`]
    );
    scenario.specPath = run.specPath;
    scenario.status = run.success ? 'explored' : 'failed';

    return {
      name: run.name,
      description: run.goal,
      scenarios: [scenario],
      coverage: {
        steps: run.steps.length,
        states: run.graphSummary.totalStates,
        overallScore: run.scores.overall,
      },
    };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderScenarioBlock(scenario: GherkinScenario): string {
  const tagLine = scenario.tags.join(' ');
  return `
    <div class="gherkin-scenario">
      <div class="gherkin-tags">${escapeHtml(tagLine)}</div>
      <h4>Scenario: ${escapeHtml(scenario.name)}</h4>
      <pre class="gherkin-block">${[
        ...scenario.given.map((l) => `  Given ${l}`),
        ...scenario.when.map((l) => `  When ${l}`),
        ...scenario.then.map((l) => `  Then ${l}`),
      ].join('\n')}</pre>
      <div class="scenario-meta">
        <span class="pill">${scenario.assertionCount} assertions in spec</span>
        ${scenario.specPath ? `<span class="pill mono">${escapeHtml(scenario.specPath)}</span>` : ''}
      </div>
    </div>`;
}

export interface PlaywrightRunResult {
  specFile: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

export async function generatePortfolioReport(options: {
  outputPath: string;
  title: string;
  startedAt: string;
  finishedAt: string;
  features: TestPlanFeature[];
  playwrightResults: PlaywrightRunResult[];
  provider: string;
}): Promise<void> {
  const totalScenarios = options.features.reduce((n, f) => n + f.scenarios.length, 0);
  const passed = options.playwrightResults.filter((r) => r.status === 'passed').length;
  const failed = options.playwrightResults.filter((r) => r.status === 'failed').length;
  const totalAssertions = options.features.reduce(
    (n, f) => n + f.scenarios.reduce((s, sc) => s + sc.assertionCount, 0),
    0
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root { --bg:#0f172a; --card:#1e293b; --border:#334155; --text:#f8fafc; --muted:#94a3b8; --ok:#10b981; --bad:#ef4444; --accent:#6366f1; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:var(--bg); color:var(--text); padding:2rem 1rem; line-height:1.5; }
    .container { max-width:1200px; margin:0 auto; }
    header { border-bottom:1px solid var(--border); padding-bottom:1.5rem; margin-bottom:2rem; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin:1.5rem 0; }
    .stat { background:var(--card); border:1px solid var(--border); border-radius:.75rem; padding:1rem; text-align:center; }
    .stat .val { font-size:2rem; font-weight:700; color:var(--accent); }
    .stat .lbl { color:var(--muted); font-size:.85rem; }
    .feature { background:var(--card); border:1px solid var(--border); border-radius:.75rem; padding:1.25rem; margin-bottom:1.5rem; }
    .feature h3 { margin-bottom:.35rem; }
    .feature p { color:var(--muted); margin-bottom:1rem; }
    .gherkin-scenario { background:#0b1220; border:1px solid var(--border); border-radius:.5rem; padding:1rem; margin-top:1rem; }
    .gherkin-tags { color:#818cf8; font-size:.8rem; margin-bottom:.35rem; }
    .gherkin-block { white-space:pre-wrap; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.85rem; color:#cbd5e1; margin:.5rem 0; }
    .scenario-meta { display:flex; flex-wrap:wrap; gap:.5rem; margin-top:.5rem; }
    .pill { background:#1e293b; border:1px solid var(--border); border-radius:999px; padding:.15rem .55rem; font-size:.75rem; color:var(--muted); }
    .pill.mono { font-family:monospace; }
    .results-table { width:100%; border-collapse:collapse; margin-top:1rem; }
    .results-table th, .results-table td { text-align:left; padding:.65rem; border-bottom:1px solid var(--border); font-size:.9rem; }
    .pass { color:var(--ok); }
    .fail { color:var(--bad); }
    .plan-list { margin:1rem 0 0 1.25rem; color:#cbd5e1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(options.title)}</h1>
      <p style="color:var(--muted); margin-top:.35rem;">
        Autonomous exploration → test plan → generated Playwright specs → verification run
      </p>
      <p style="color:var(--muted); font-size:.85rem; margin-top:.25rem;">
        Provider: <strong>${escapeHtml(options.provider)}</strong> |
        Started: ${escapeHtml(options.startedAt)} |
        Finished: ${escapeHtml(options.finishedAt)}
      </p>
      <div class="stats">
        <div class="stat"><div class="val">${totalScenarios}</div><div class="lbl">Gherkin Scenarios</div></div>
        <div class="stat"><div class="val">${totalAssertions}</div><div class="lbl">Generated Assertions</div></div>
        <div class="stat"><div class="val ${passed === options.playwrightResults.length ? 'pass' : ''}">${passed}/${options.playwrightResults.length}</div><div class="lbl">Specs Passed</div></div>
        <div class="stat"><div class="val ${failed ? 'fail' : ''}">${failed}</div><div class="lbl">Specs Failed</div></div>
      </div>
    </header>

    <section class="feature">
      <h2>Testing Plan</h2>
      <p>Feature areas discovered and converted to executable Playwright scenarios with assertions.</p>
      <ol class="plan-list">
        ${options.features.map((f) => `<li><strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.description)} (${f.coverage.steps} steps, quality ${f.coverage.overallScore}/100)</li>`).join('')}
      </ol>
    </section>

    <section>
      <h2 style="margin-bottom:1rem;">Gherkin Scenarios</h2>
      ${options.features.map((f) => `
        <div class="feature">
          <h3>Feature: ${escapeHtml(f.name)}</h3>
          <p>${escapeHtml(f.description)}</p>
          ${f.scenarios.map(renderScenarioBlock).join('')}
        </div>
      `).join('')}
    </section>

    <section class="feature" style="margin-top:2rem;">
      <h2>Playwright Verification Results</h2>
      <table class="results-table">
        <thead><tr><th>Spec</th><th>Test</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
        <tbody>
          ${options.playwrightResults.map((r) => `
            <tr>
              <td class="mono">${escapeHtml(r.specFile)}</td>
              <td>${escapeHtml(r.title)}</td>
              <td class="${r.status === 'passed' ? 'pass' : 'fail'}">${r.status.toUpperCase()}</td>
              <td>${r.durationMs ? `${Math.round(r.durationMs)}ms` : '—'}</td>
              <td>${r.error ? escapeHtml(r.error.slice(0, 120)) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  </div>
</body>
</html>`;

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, html, 'utf-8');
}
