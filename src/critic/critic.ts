import { z } from 'zod';
import type { Observation, UIAction, CriticScore, FrameworkConfig } from '../types/index.js';
import type { ExecutionResult } from '../runtime/executor.js';
import { HeuristicEvaluator } from './heuristics.js';
import { LLMProvider, createLLMProvider } from '../planner/llm-provider.js';

const LLMCriticSchema = z.object({
  functionalityAdjustment: z.number().min(-30).max(10).default(0),
  usabilityAdjustment: z.number().min(-30).max(10).default(0),
  interactionAdjustment: z.number().min(-30).max(10).default(0),
  transitionFeedback: z.string().default(''),
  additionalFindings: z.array(
    z.object({
      category: z.enum(['functionality', 'usability', 'interaction']),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      message: z.string(),
      recommendation: z.string().optional(),
    })
  ).default([]),
});

export class Critic {
  private llm: LLMProvider;
  private config: FrameworkConfig;

  constructor(config: FrameworkConfig, llm?: LLMProvider) {
    this.config = config;
    this.llm = llm || createLLMProvider(config);
  }

  async critique(
    action: UIAction,
    result: ExecutionResult,
    before: Observation,
    after?: Observation
  ): Promise<CriticScore> {
    // 1. Calculate base heuristic scores
    const heuristics = HeuristicEvaluator.evaluate(action, result, before, after);

    let funcScore = heuristics.functionalityScore;
    let useScore = heuristics.usabilityScore;
    let intScore = heuristics.interactionScore;
    let feedback = result.success
      ? `Successfully executed "${action.action}" action (${result.duration}ms).`
      : `Action "${action.action}" encountered error: ${result.error}`;

    const findings = [...heuristics.findings];

    // 2. If an active external LLM provider is configured, enrich with AI critique
    if (this.llm.name !== 'mock' && after) {
      try {
        const prompt = `
Evaluate this UI state transition:
Action taken: ${JSON.stringify(action)}
Execution result: ${JSON.stringify({ success: result.success, duration: result.duration, error: result.error })}

Before State:
Title: "${before.title}"
URL: ${before.url}

After State:
Title: "${after.title}"
URL: ${after.url}
Telemetry Errors: ${after.telemetry.filter((t) => t.type.includes('error')).map((t) => t.text).join('; ') || 'None'}

Current Heuristic Scores: Functionality=${funcScore}, Usability=${useScore}, Interaction=${intScore}.
Evaluate if the state transition made meaningful progress and assess any UX friction.
`.trim();

        const llmResult = await this.llm.generateStructured(
          prompt,
          LLMCriticSchema,
          'You are an expert QA and UX Auditor evaluating automated UI testing transitions.'
        );

        funcScore = Math.max(0, Math.min(100, funcScore + (llmResult.functionalityAdjustment ?? 0)));
        useScore = Math.max(0, Math.min(100, useScore + (llmResult.usabilityAdjustment ?? 0)));
        intScore = Math.max(0, Math.min(100, intScore + (llmResult.interactionAdjustment ?? 0)));

        if (llmResult.transitionFeedback) {
          feedback = `${feedback} ${llmResult.transitionFeedback}`;
        }

        if (llmResult.additionalFindings && llmResult.additionalFindings.length > 0) {
          findings.push(...llmResult.additionalFindings);
        }
      } catch {
        // Maintain heuristic evaluation on LLM timeout or error
      }
    }

    const overall = Math.round(funcScore * 0.45 + useScore * 0.35 + intScore * 0.2);

    return {
      functionality: funcScore,
      usability: useScore,
      interaction: intScore,
      overall,
      findings,
      transitionFeedback: feedback,
    };
  }
}
