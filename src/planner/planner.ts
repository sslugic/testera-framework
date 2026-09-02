import type { Observation, StepRecord, JourneyGoal, UIAction, FrameworkConfig } from '../types/index.js';
import { LLMProvider, createLLMProvider } from './llm-provider.js';
import {
  ActionPlanSchema,
  PLANNER_SYSTEM_PROMPT,
  buildGoalPlannerPrompt,
  buildExplorationPlannerPrompt,
} from './prompts.js';

export class Planner {
  private llm: LLMProvider;
  private config: FrameworkConfig;

  constructor(config: FrameworkConfig, llm?: LLMProvider) {
    this.config = config;
    this.llm = llm || createLLMProvider(config);
  }

  async planNextStep(
    goal: JourneyGoal | undefined,
    currentObservation: Observation,
    history: StepRecord[],
    stepIndex: number,
    unexploredIndexes: number[] = []
  ): Promise<UIAction> {
    const isGoalMode = !!goal;

    const prompt = isGoalMode
      ? buildGoalPlannerPrompt(goal, currentObservation, history, stepIndex, this.config.maxSteps)
      : buildExplorationPlannerPrompt(
          currentObservation,
          history,
          history.length,
          unexploredIndexes,
          stepIndex,
          this.config.maxSteps
        );

    try {
      const plan = await this.llm.generateStructured(prompt, ActionPlanSchema, PLANNER_SYSTEM_PROMPT);

      // Validate targetIndex bounds
      if (plan.targetIndex !== undefined) {
        const total = currentObservation.interactiveElements.length;
        if (plan.targetIndex < 1 || plan.targetIndex > total) {
          // Clamp or fallback
          plan.targetIndex = Math.max(1, Math.min(plan.targetIndex, total));
        }
      }

      return plan;
    } catch (err: any) {
      // Fallback in case of LLM parse failure: pick first valid interactive element or finish
      if (currentObservation.interactiveElements.length > 0) {
        const first = currentObservation.interactiveElements[0];
        return {
          action: 'click',
          targetIndex: 1,
          rationale: `Fallback action after planning error: clicking ${first.role} "${first.name}"`,
          isGoalComplete: false,
          confidence: 0.5,
        };
      }
      return {
        action: 'finish',
        rationale: `Terminating journey: ${err?.message || 'No interactive elements available'}`,
        isGoalComplete: true,
        confidence: 0.2,
      };
    }
  }
}
