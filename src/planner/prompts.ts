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
7. Session Reuse & Auth Bypass (CRITICAL):
   - Check if you are ALREADY authenticated. Indicators of an active session include: user avatar/initials, "Welcome", Logout button, workspace navigation (Dashboard, Projects, Test Plans, Settings), or absence of login forms.
   - When the session is already authenticated, DO NOT navigate to /login or /signup, and NEVER attempt registration again. Proceed directly to the requested feature.
   - If the goal is testing an internal application feature (e.g. Projects, Test Cases, Scenarios, Plans, Runs, Environments, Settings, Documents) and you are already in the app, BYPASS any login/signup logic completely.
   - If an onboarding dialog or modal (e.g. "AI Companion", "Install App", "Welcome tour") overlays the dashboard, dismiss or skip it (e.g. click "Skip for now", "Dismiss", or "Close") so you can access the main navigation.
8. Registration & Login Boundaries:
   - ONLY register or sign up if the goal explicitly instructs to create/register a new account or test onboarding.
   - Never register a new account when testing other product features. If unexpectedly logged out, prefer signing in with existing credentials over signing up again.
   - Once a signup or login form has been submitted and accepted, immediately recognize that authentication is complete. Do not repeatedly click Sign Up or refill submitted fields.
9. Safety & Destructive Action Guardrails (CRITICAL):
   - NEVER click destructive, irreversible, or high-risk actions (e.g. "Delete Account", "Cancel Subscription", "Purge Data", "Reset Database", "Wipe Everything", "Terminate Workspace") unless the user's explicit goal specifically and unambiguously requests that exact destructive action.
   - During autonomous exploration or general feature testing, strictly avoid triggering permanent destructive operations.
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

  const isAuthenticated =
    currentObservation.interactiveElements.some((el) =>
      /logout|sign out|settings|workspace|dashboard|create project|projects|test plans|test cases/i.test(el.name || '')
    ) || /dashboard|projects|test-cases|scenarios|test-plans|runs|settings/i.test(currentObservation.url);

  const isAuthForm =
    currentObservation.interactiveElements.some((el) =>
      /sign up with|create account|confirm password|your company/i.test(el.name || '')
    ) || /#signup|#login|\/login|\/signup/i.test(currentObservation.url);

  const isSignupGoal = /sign up|register|onboarding|create account/i.test(goal.goal);

  let authContext = '';
  if (isAuthenticated || goal.authenticated) {
    authContext = `\n[AUTHENTICATION CONTEXT]\nStatus: AUTHENTICATED ACTIVE SESSION\nInstruction: You are already authenticated. DO NOT navigate to login/signup. DO NOT register. Bypass login and focus directly on: "${goal.goal}".\n`;
  } else if (isAuthForm && !isSignupGoal) {
    authContext = `\n[AUTHENTICATION CONTEXT]\nStatus: GATE / LOGIN SCREEN ENCOUNTERED\nInstruction: Target goal is testing internal features ("${goal.goal}"), NOT account registration. If an active session exists or if credentials are known, Sign In. Do NOT register a new account.\n`;
  }

  const safeModeNotice = (goal.safeMode ?? true) && !goal.allowDestructive
    ? '\n[SAFETY GUARDRAIL]: Safe Mode Active. Do NOT attempt destructive actions (deleting accounts, dropping databases, cancelling subscriptions) unless explicitly asked in the goal.\n'
    : '';

  return `
[CURRENT TASK]
Goal: "${goal.goal}"
Step ${stepIndex} of maximum ${maxSteps}
Start URL: ${goal.startUrl}
${goal.customInstructions ? `Special Instructions: ${goal.customInstructions}\n` : ''}${authContext}${safeModeNotice}
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
