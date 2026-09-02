import fs from 'node:fs/promises';
import type { Page } from 'playwright';
import type {
  LocatorFingerprint,
  InteractiveElement,
  Observation,
  SelfHealingPatch,
} from '../types/index.js';
import { FingerprintEngine } from '../memory/fingerprint.js';

export interface HealingResult {
  match: InteractiveElement;
  similarity: number;
  reason: string;
}

export class SelfHealer {
  static findHealedElement(
    brokenFingerprint: LocatorFingerprint,
    currentObservation: Observation,
    minSimilarity = 0.65
  ): HealingResult | null {
    let bestMatch: InteractiveElement | null = null;
    let highestSim = 0;
    let bestReason = '';

    for (const candidate of currentObservation.interactiveElements) {
      const sim = FingerprintEngine.calculateSimilarity(brokenFingerprint, candidate);

      if (sim > highestSim && sim >= minSimilarity) {
        highestSim = sim;
        bestMatch = candidate;

        const reasons: string[] = [];
        if (brokenFingerprint.role === candidate.role) reasons.push(`Role match: ${candidate.role}`);
        if (brokenFingerprint.name === candidate.name) reasons.push(`Name match: "${candidate.name}"`);
        if (brokenFingerprint.testId === candidate.testId) reasons.push(`TestId match: ${candidate.testId}`);
        if (candidate.locatorFingerprint.surroundingText) {
          reasons.push(`Context: "${candidate.locatorFingerprint.surroundingText}"`);
        }
        bestReason = reasons.join(', ') || `Visual and structural similarity score: ${sim}`;
      }
    }

    if (bestMatch) {
      return {
        match: bestMatch,
        similarity: highestSim,
        reason: bestReason,
      };
    }

    return null;
  }

  static createPatch(
    originalSelector: string,
    originalFingerprint: LocatorFingerprint,
    healedElement: InteractiveElement,
    similarityScore: number,
    stepIndex: number,
    reason: string
  ): SelfHealingPatch {
    let healedSelector = healedElement.selector;
    if (healedElement.testId) {
      healedSelector = `[data-testid="${healedElement.testId}"]`;
    } else if (healedElement.role && healedElement.name) {
      healedSelector = `role=${healedElement.role}[name="${healedElement.name}"]`;
    }

    return {
      originalSelector,
      originalFingerprint,
      healedSelector,
      healedFingerprint: healedElement.locatorFingerprint,
      similarityScore,
      timestamp: Date.now(),
      stepIndex,
      reason,
    };
  }

  static async patchSpecFile(specFilePath: string, patch: SelfHealingPatch): Promise<boolean> {
    try {
      const content = await fs.readFile(specFilePath, 'utf-8');
      if (!content.includes(patch.originalSelector)) {
        return false;
      }

      const updated = content.replaceAll(patch.originalSelector, patch.healedSelector);
      await fs.writeFile(specFilePath, updated, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }
}
