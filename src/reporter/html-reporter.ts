import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepRecord, JourneyGoal, SelfHealingPatch } from '../types/index.js';

export interface ReportData {
  runId: string;
  goal?: JourneyGoal;
  steps: StepRecord[];
  graphSummary: {
    totalStates: number;
    totalTransitions: number;
    totalExploredElements: number;
    unexploredCount: number;
  };
  patches: SelfHealingPatch[];
}

export class HTMLReporter {
  static async generate(outputPath: string, data: ReportData): Promise<void> {
    const scoredSteps = data.steps.filter((s) => s.score);
    const avgFunc = scoredSteps.length
      ? Math.round(scoredSteps.reduce((a, b) => a + b.score!.functionality, 0) / scoredSteps.length)
      : 100;
    const avgUse = scoredSteps.length
      ? Math.round(scoredSteps.reduce((a, b) => a + b.score!.usability, 0) / scoredSteps.length)
      : 100;
    const avgInt = scoredSteps.length
      ? Math.round(scoredSteps.reduce((a, b) => a + b.score!.interaction, 0) / scoredSteps.length)
      : 100;
    const avgOverall = Math.round(avgFunc * 0.45 + avgUse * 0.35 + avgInt * 0.2);

    const allFindings = data.steps.flatMap((s) => s.score?.findings || []);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Testera Luna Audit Report - ${data.runId}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --accent: #8b5cf6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--card-border); padding-bottom: 1.5rem; }
    .badge-bar { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    .badge {
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge.success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .badge.warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .badge.danger { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    
    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.25rem;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: var(--primary);
    }
    .metric-card.func::before { background: #3b82f6; }
    .metric-card.use::before { background: #10b981; }
    .metric-card.int::before { background: #f59e0b; }
    .metric-card.overall::before { background: #8b5cf6; }
    .metric-title { font-size: 0.875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 2.5rem; font-weight: 700; margin: 0.5rem 0; }
    .metric-sub { font-size: 0.8rem; color: var(--text-muted); }

    /* Timeline */
    .timeline { margin-top: 2rem; }
    .step-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      margin-bottom: 1.5rem;
      padding: 1.25rem;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.5rem;
    }
    @media (max-width: 900px) { .step-card { grid-template-columns: 1fr; } }
    .step-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
    .step-title { font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .step-rationale { color: #cbd5e1; font-size: 0.95rem; margin-bottom: 0.75rem; }
    .feedback-box {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid var(--primary);
      padding: 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      color: #94a3b8;
      margin-top: 0.75rem;
    }
    .screenshot-thumb {
      width: 100%;
      height: 200px;
      object-fit: cover;
      border-radius: 0.5rem;
      border: 1px solid var(--card-border);
      background: #000;
    }
    .findings-list { margin-top: 0.75rem; list-style: none; }
    .finding-item {
      font-size: 0.85rem;
      padding: 0.4rem 0.6rem;
      border-radius: 0.375rem;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .finding-item.critical { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
    .finding-item.high { background: rgba(239, 68, 68, 0.1); color: #f87171; }
    .finding-item.medium { background: rgba(245, 158, 11, 0.1); color: #fcd34d; }
    .finding-item.low { background: rgba(99, 102, 241, 0.1); color: #c7d2fe; }

    /* Graph Summary */
    .summary-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }
    .summary-box h3 { margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Testera Luna Autonomous UI Audit</h1>
      <p style="color: var(--text-muted); margin-top: 0.25rem;">
        ${data.goal ? `Journey Goal: <strong>${data.goal.goal}</strong>` : 'Autonomous Exploration Run'}
      </p>
      <div class="badge-bar">
        <span class="badge">Run ID: ${data.runId}</span>
        <span class="badge ${avgOverall >= 85 ? 'success' : avgOverall >= 70 ? 'warning' : 'danger'}">Overall Score: ${avgOverall}/100</span>
        <span class="badge">Steps: ${data.steps.length}</span>
        ${data.patches.length > 0 ? `<span class="badge success">Self-Healed: ${data.patches.length} locators</span>` : ''}
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card func">
        <div class="metric-title">Functionality Score</div>
        <div class="metric-value" style="color: #60a5fa;">${avgFunc}</div>
        <div class="metric-sub">Execution success & errors</div>
      </div>
      <div class="metric-card use">
        <div class="metric-title">Usability Score</div>
        <div class="metric-value" style="color: #34d399;">${avgUse}</div>
        <div class="metric-sub">WCAG a11y & tap target sizes</div>
      </div>
      <div class="metric-card int">
        <div class="metric-title">Interaction Score</div>
        <div class="metric-value" style="color: #fbbf24;">${avgInt}</div>
        <div class="metric-sub">Responsiveness & visual cues</div>
      </div>
      <div class="metric-card overall">
        <div class="metric-title">Quality Index</div>
        <div class="metric-value" style="color: #a78bfa;">${avgOverall}</div>
        <div class="metric-sub">Composite weighted index</div>
      </div>
    </div>

    <div class="summary-box">
      <h3>Exploration Graph Coverage</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        Unique Screen States Visited: <strong>${data.graphSummary.totalStates}</strong> |
        Transitions Mapped: <strong>${data.graphSummary.totalTransitions}</strong> |
        Explored Interactive Elements: <strong>${data.graphSummary.totalExploredElements}</strong> |
        Remaining Frontier Elements: <strong>${data.graphSummary.unexploredCount}</strong>
      </p>
    </div>

    <div class="timeline">
      <h2 style="margin-bottom: 1rem;">Step-by-Step Journey & Diagnostics</h2>
      ${data.steps
        .map((step) => {
          const actionBadge = step.action.action.toUpperCase();
          const relativeScreenshot = step.observationBefore.screenshotPath
            ? path.relative(path.dirname(outputPath), step.observationBefore.screenshotPath)
            : '';

          return `
        <div class="step-card">
          <div>
            <div class="step-header">
              <div class="step-title">
                <span class="badge ${step.success ? 'success' : 'danger'}">${step.stepIndex}</span>
                <span>${actionBadge}</span>
                ${step.healed ? '<span class="badge success">⚡ Healed</span>' : ''}
              </div>
              <div>
                <span style="font-size: 0.85rem; color: var(--text-muted);">
                  Score: ${step.score ? step.score.overall : 100}/100
                </span>
              </div>
            </div>
            <div class="step-rationale">
              ${step.action.rationale || 'Action executed'}
            </div>
            ${
              step.selfHealingPatch
                ? `<div style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; padding: 0.5rem; border-radius: 0.375rem; font-size: 0.85rem; margin-top: 0.5rem;">
                    <strong>Self-Healed:</strong> ${step.selfHealingPatch.reason} (Similarity: ${Math.round(step.selfHealingPatch.similarityScore * 100)}%)
                   </div>`
                : ''
            }
            ${
              step.score?.transitionFeedback
                ? `<div class="feedback-box">
                    <strong>Critic:</strong> ${step.score.transitionFeedback}
                   </div>`
                : ''
            }
            ${
              step.score?.findings && step.score.findings.length > 0
                ? `<ul class="findings-list">
                    ${step.score.findings
                      .map(
                        (f) => `
                      <li class="finding-item ${f.severity}">
                        <strong>[${f.category.toUpperCase()}]</strong> ${f.message}
                      </li>
                    `
                      )
                      .join('')}
                   </ul>`
                : ''
            }
          </div>
          <div>
            ${
              relativeScreenshot
                ? `<img src="${relativeScreenshot}" alt="Step ${step.stepIndex} State" class="screenshot-thumb" />`
                : '<div class="screenshot-thumb" style="display:flex;align-items:center;justify-content:center;color:#64748b;">No Screenshot</div>'
            }
          </div>
        </div>
      `;
        })
        .join('')}
    </div>
  </div>
</body>
</html>`;

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, 'utf-8');
  }
}
