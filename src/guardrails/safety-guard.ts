import type { UIAction, Observation, JourneyGoal, InteractiveElement } from "../types/index.js";

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  matchedPattern?: string;
  targetDescription?: string;
}

export interface SafetyGuardOptions {
  safeMode?: boolean;
  blockedActionPatterns?: string[];
  allowDestructive?: boolean;
}

/**
 * Common high-risk destructive action phrases and patterns in modern web applications.
 */
export const DEFAULT_DESTRUCTIVE_PATTERNS: RegExp[] = [
  // Account & Identity
  /\b(delete|terminate|close|destroy)\s+(my\s+)?(account|profile|user|membership)\b/i,
  /\b(delete|destroy|purge|leave\s+and\s+delete)\s+(the\s+)?(organization|workspace|team|company)\b/i,

  // Database & Storage Purge
  /\b(reset|wipe|drop|purge|destroy)\s+(all\s+)?(database|db|tables|data|store)\b/i,
  /\b(factory\s+reset|hard\s+reset|truncate\s+table)\b/i,
  /\b(erase|wipe|destroy)\s+(all|everything)\b/i,

  // Financial & Billing
  /\b(cancel|terminate|stop)\s+(my\s+)?(subscription|membership|plan)\b/i,
  /\b(transfer|withdraw|send)\s+(funds|balance|money|crypto)\b/i,
  /\b(refund\s+all|charge\s+card|execute\s+payment)\b/i,

  // Access & Security Keys
  /\b(revoke|invalidate|delete)\s+all\s+(api\s+keys|tokens|secrets|credentials)\b/i,

  // Irreversible confirmations
  /\b(permanently\s+delete|confirm\s+permanent\s+deletion|i\s+understand,\s+delete)\b/i,
  /\bdelete\s+forever\b/i,
];

export class SafetyGuard {
  /**
   * Validates if a proposed UIAction is safe to execute in the current context.
   */
  static validate(
    action: UIAction,
    observation: Observation,
    goal?: JourneyGoal,
    options?: SafetyGuardOptions
  ): SafetyCheckResult {
    // 1. Safe mode disabled or explicitly allowed
    const isSafeMode = options?.safeMode ?? goal?.safeMode ?? true;
    if (!isSafeMode || goal?.allowDestructive || options?.allowDestructive) {
      return { allowed: true };
    }

    // 2. Only click, fill, and press actions can trigger destructive side effects
    if (action.action !== "click" && action.action !== "fill" && action.action !== "press") {
      return { allowed: true };
    }

    // 3. Resolve target element representation
    const targetElement = this.resolveTargetElement(action, observation);
    const targetText = this.extractTargetText(action, targetElement);

    // 4. Check for destructive patterns
    const patterns = [
      ...DEFAULT_DESTRUCTIVE_PATTERNS,
      ...(options?.blockedActionPatterns || []).map((p) => new RegExp(p, "i")),
    ];

    for (const pattern of patterns) {
      if (pattern.test(targetText)) {
        // Pattern matched! Now check if user goal explicitly requested this action
        if (this.isExplicitlyRequestedInGoal(targetText, goal)) {
          return { allowed: true };
        }

        return {
          allowed: false,
          matchedPattern: pattern.source,
          targetDescription: targetText,
          reason: `[BLOCKED BY SAFETY GUARDRAIL] Destructive action "${targetText.trim()}" matched forbidden pattern /${pattern.source}/i during safe mode. Destructive actions are blocked unless explicitly specified in the user goal.`,
        };
      }
    }

    // 5. Check destructive confirmation inputs (e.g. typing "DELETE" or "CONFIRM" into an input)
    if (action.action === "fill" && action.value) {
      const val = action.value.trim().toUpperCase();
      if (val === "DELETE" || val === "CONFIRM" || val === "PERMANENTLY DELETE") {
        const isConfirmGoal = goal && /\b(confirm|delete)\b/i.test(goal.goal);
        if (!isConfirmGoal) {
          return {
            allowed: false,
            matchedPattern: "DESTRUCTIVE_CONFIRMATION_INPUT",
            targetDescription: `Typed "${action.value}" into ${targetText}`,
            reason: `[BLOCKED BY SAFETY GUARDRAIL] Attempted to enter irreversible confirmation text "${action.value}" into input field.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Resolves target element from observation based on index or selector.
   */
  private static resolveTargetElement(
    action: UIAction,
    observation: Observation
  ): InteractiveElement | undefined {
    if (action.targetIndex && action.targetIndex > 0) {
      return observation.interactiveElements[action.targetIndex - 1];
    }
    if (action.targetSelector) {
      return observation.interactiveElements.find((el) => el.selector === action.targetSelector);
    }
    return undefined;
  }

  /**
   * Aggregates descriptive text from element name, role, context, and action rationale.
   */
  private static extractTargetText(action: UIAction, element?: InteractiveElement): string {
    const parts = [];
    if (element) {
      if (element.name) parts.push(element.name);
      if (element.locatorFingerprint?.surroundingText) parts.push(element.locatorFingerprint.surroundingText);
      if (element.testId) parts.push(element.testId);
      if (element.selector) parts.push(element.selector);
    }
    if (action.value) parts.push(action.value);
    if (action.rationale) parts.push(action.rationale);
    return parts.join(" ");
  }

  /**
   * Checks whether the user explicit goal specifically requests the destructive action.
   */
  private static isExplicitlyRequestedInGoal(targetText: string, goal?: JourneyGoal): boolean {
    if (!goal) return false;
    const goalText = `${goal.goal} ${goal.customInstructions || ""}`.toLowerCase();

    // Check if goal explicitly asks to delete/remove the item
    if (/\b(delete|terminate|cancel|remove|purge|wipe|reset)\b/i.test(goalText)) {
      // Extract key nouns from targetText (e.g. project, test case, scenario, item, workspace)
      const keywords = ["project", "test case", "scenario", "plan", "document", "environment", "task", "run", "tag"];
      for (const kw of keywords) {
        if (targetText.toLowerCase().includes(kw) && goalText.includes(kw)) {
          return true;
        }
      }
    }
    return false;
  }
}
