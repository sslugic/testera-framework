import crypto from 'node:crypto';
import type { LocatorFingerprint, InteractiveElement, Observation } from '../types/index.js';

export class FingerprintEngine {
  static createPageHash(observation: Observation): string {
    const url = new URL(observation.url, 'http://localhost');
    const pathKey = url.pathname;
    const elementsSignature = observation.interactiveElements
      .slice(0, 30)
      .map((e) => `${e.role}:${e.name || ''}:${e.testId || ''}`)
      .join('|');

    const content = `${pathKey}::${elementsSignature}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  }

  static calculateSimilarity(
    target: LocatorFingerprint,
    candidate: InteractiveElement
  ): number {
    let score = 0;

    // 1. Role Match (25%)
    if (target.role.toLowerCase() === candidate.role.toLowerCase()) {
      score += 0.25;
    }

    // 2. Name / Text Match (30%)
    const targetName = (target.name || target.text || '').toLowerCase().trim();
    const candName = (candidate.name || candidate.text || '').toLowerCase().trim();
    if (targetName && candName) {
      if (targetName === candName) {
        score += 0.3;
      } else if (targetName.includes(candName) || candName.includes(targetName)) {
        score += 0.2;
      } else {
        const words = targetName.split(/\s+/);
        const matchedWords = words.filter((w) => w.length > 2 && candName.includes(w));
        if (matchedWords.length > 0) {
          score += (matchedWords.length / words.length) * 0.25;
        } else {
          const sim = this.levenshteinSimilarity(targetName, candName);
          score += sim * 0.2;
        }
      }
    }

    // 3. Tag / Type / TestId Match (15%)
    if (target.tagName.toLowerCase() === candidate.tagName.toLowerCase()) {
      score += 0.1;
    }
    if (target.testId && candidate.testId && target.testId === candidate.testId) {
      score += 0.1;
    } else if (candidate.testId && targetName) {
      const words = targetName.split(/\s+/);
      if (words.some((w) => w.length > 3 && candidate.testId!.toLowerCase().includes(w))) {
        score += 0.1;
      }
    }

    // 4. Surrounding Context Match (15%)
    if (candidate.locatorFingerprint.surroundingText) {
      const candContext = candidate.locatorFingerprint.surroundingText.toLowerCase();
      if (target.surroundingText) {
        const sim = this.levenshteinSimilarity(
          target.surroundingText.toLowerCase(),
          candContext
        );
        score += sim * 0.15;
      } else if (targetName && targetName.split(/\s+/).some((w) => w.length > 3 && candContext.includes(w))) {
        score += 0.15;
      }
    }

    // 5. Position Proximity (15%)
    if (target.position && candidate.locatorFingerprint.position) {
      const dx = Math.abs(target.position.xRatio - candidate.locatorFingerprint.position.xRatio);
      const dy = Math.abs(target.position.yRatio - candidate.locatorFingerprint.position.yRatio);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const posScore = Math.max(0, 1 - dist * 2);
      score += posScore * 0.15;
    }

    return Math.round(score * 100) / 100;
  }

  private static levenshteinSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matrix: number[][] = [];
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const dist = matrix[s1.length][s2.length];
    const maxLen = Math.max(s1.length, s2.length);
    return Math.max(0, 1 - dist / maxLen);
  }
}
