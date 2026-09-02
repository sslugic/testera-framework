import { z } from 'zod';
import type { Observation, StepRecord, JourneyGoal } from '../types/index.js';

export const ActionPlanSchema = z.object({
  action: z.enum([
    'click',
    'fill',
    'select',
    'hover',
    'press',
    'scroll',
    'navigate',
    'wait',
    'assert',
    'finish',
  ]),
  targetIndex: z.number().optional(),
  targetSelector: z.string().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  direction: z.enum(['up', 'down']).optional(),
  rationale: z.string().describe('Clear reasoning for why this action was selected'),
  expectedOutcome: z.string().optional().describe('What visual or state change should happen next'),
  isGoalComplete: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const PLANNER_SYSTEM_PROMPT = `
You are the Planner for Testera Luna, an autonomous AI UI Testing and Exploration Agent.
Your mission is to interact with web applications through an accessibility tree representation of interactive elements.

Core Rules:
1. Target Elements: Select elements by their numbered index [#X] (e.g. set targetIndex: 4). Use the provided role, name, placeholder, and surrounding context.
2. Forms & Inputs: Before clicking a submit or continue button, ensure all required input fields are filled with appropriate sample values (valid email, names, phone numbers, etc.).
3. Verification / Assert: Periodically assert critical success states, totals, confirmation messages, or badge counts.
4. Completion: Once the user's goal is accomplished (e.g. order confirmation displayed, message sent, account created), output action: "finish", isGoalComplete: true.
5. Error Recovery: If previous steps failed or validation errors appeared, inspect the error message and correct the field or take an alternate path.
6. JSON Strictness: Return only valid JSON conforming exactly to the ActionPlan schema.
`.trim();

export function buildGoalPlannerPrompt(
  goal: JourneyGoal,
  currentObservation: Observation,
  history: StepRecord[],
  stepIndex: number,
  maxSteps: number
): string {
  const historyText = history.length === 0
    ? 'None (Starting step)'
    : history
        .map(
          (h, i) =>
            `Step ${i + 1}: ${h.action.action} on ${h.action.targetIndex ? `[#${h.action.targetIndex}]` : (h.action.targetSelector || h.action.value || '')} -> ${
              h.success ? 'Success' : `Failed: ${h.error}`
            }${h.score ? ` (Critic Score: ${h.score.overall}/100)` : ''}`
        )
        .join('\n');

  const recentErrors = currentObservation.telemetry
    .filter((t) => t.type === 'console-error' || t.type === 'network-error' || t.type === 'page-error')
    .slice(-3);

  const errorContext = recentErrors.length > 0
    ? `\nRecent Telemetry Warnings/Errors:\n${recentErrors.map((e) => `- ${e.text}`).join('\n')}\n`
    : '';

  return `
[CURRENT TASK]
Goal: "${goal.goal}"
Step ${stepIndex} of maximum ${maxSteps}
Start URL: ${goal.startUrl}
${goal.customInstructions ? `Special Instructions: ${goal.customInstructions}\n` : ''}

[HISTORY SO FAR]
${historyText}
${errorContext}
[CURRENT BROWSER STATE]
${currentObservation.a11yTreeText}

Based on the goal and current accessibility tree, determine the single best NEXT action to take.
Choose targetIndex from the available numbered elements [#1] to [#${currentObservation.interactiveElements.length}].
If the goal has been fully met, select action: "finish" and isGoalComplete: true.
`.trim();
}

export function buildExplorationPlannerPrompt(
  currentObservation: Observation,
  history: StepRecord[],
  visitedCount: number,
  unexploredIndexes: number[],
  stepIndex: number,
  maxSteps: number
): string {
  return `
[TASK: AUTONOMOUS EXPLORATION]
Mode: Discover unvisited states, test interactive elements, and identify usability/functional defects.
Step ${stepIndex} of ${maxSteps} (Visited screen states: ${visitedCount})

Unexplored Interactive Elements on this page: [${unexploredIndexes.map((i) => `#${i}`).join(', ')}]

[CURRENT BROWSER STATE]
${currentObservation.a11yTreeText}

Select an interactive element that has not been explored yet. Prioritize:
1. Navigation menus, links, or tabs that reveal new views
2. Form fields needing input
3. Action buttons (modals, triggers, toggles)
If all options on this page have been exhausted, navigate back or choose a link to another section.
`.trim();
}
