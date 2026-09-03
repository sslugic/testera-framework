import type { InteractiveElement, JourneyGoal, StepRecord } from '../types/index.js';
import { elementLocatorCode, escapeJsString } from './locator-code.js';

export interface DerivedAssertion {
  code: string;
  reason: string;
}

const SUBMIT_CLICK_PATTERN =
  /sign in|sign up|log in|register|submit|place order|checkout|continue|confirm|save|create|send/i;

const PRIORITY_ASSERT_ROLES = new Set([
  'heading',
  'status',
  'alert',
  'paragraph',
  'listitem',
  'cell',
]);

function elementKey(el: InteractiveElement): string {
  return `${el.role}::${el.name}`.toLowerCase();
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.hash}`;
  } catch {
    return url;
  }
}

function urlRegexFragment(url: string): string | null {
  try {
    const u = new URL(url);
    const fragment = `${u.pathname}${u.hash}`.replace(/\/$/, '') || '/';
    if (fragment === '/') return null;
    return fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  } catch {
    return null;
  }
}

function extractQuotedPhrases(text: string): string[] {
  const phrases: string[] = [];
  const quoted = text.match(/"([^"]+)"/g);
  if (quoted) {
    for (const q of quoted) phrases.push(q.slice(1, -1));
  }
  const views = text.match(/views?\s+([A-Za-z][\w\s-]{1,40})/i);
  if (views?.[1]) phrases.push(views[1].trim());
  return phrases.filter((p) => p.length >= 2);
}

function findElementByPhrase(
  elements: InteractiveElement[],
  phrase: string
): InteractiveElement | undefined {
  const lower = phrase.toLowerCase();
  return elements.find(
    (el) =>
      el.name.toLowerCase().includes(lower) ||
      (el.text && el.text.toLowerCase().includes(lower))
  );
}

function newElementsAfter(
  before: InteractiveElement[],
  after: InteractiveElement[]
): InteractiveElement[] {
  const beforeKeys = new Set(before.map(elementKey));
  return after.filter((el) => {
    const key = elementKey(el);
    if (beforeKeys.has(key)) return false;
    if (!el.name || el.name.length < 2) return false;
    return true;
  });
}

function pickAssertionCandidates(elements: InteractiveElement[]): InteractiveElement[] {
  return elements
    .filter((el) => PRIORITY_ASSERT_ROLES.has(el.role) || el.name.length <= 80)
    .sort((a, b) => {
      const aScore = PRIORITY_ASSERT_ROLES.has(a.role) ? 0 : 1;
      const bScore = PRIORITY_ASSERT_ROLES.has(b.role) ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return a.name.length - b.name.length;
    });
}

function dedupeAssertions(assertions: DerivedAssertion[]): DerivedAssertion[] {
  const seen = new Set<string>();
  const out: DerivedAssertion[] = [];
  for (const a of assertions) {
    if (seen.has(a.code)) continue;
    seen.add(a.code);
    out.push(a);
  }
  return out;
}

export function deriveStepAssertions(step: StepRecord): DerivedAssertion[] {
  if (!step.success || !step.observationAfter || step.action.action === 'finish') {
    return [];
  }

  // Explicit assert steps are emitted directly by the action switch.
  if (step.action.action === 'assert') {
    return [];
  }

  const { action, observationBefore, observationAfter } = step;
  const assertions: DerivedAssertion[] = [];
  const beforeUrl = normalizeUrl(observationBefore.url);
  const afterUrl = normalizeUrl(observationAfter.url);

  if (beforeUrl !== afterUrl) {
    const fragment = urlRegexFragment(observationAfter.url);
    if (fragment) {
      assertions.push({
        code: `await expect(page).toHaveURL(new RegExp('${fragment.replace(/'/g, "\\'")}'));`,
        reason: 'URL changed after action',
      });
    } else {
      assertions.push({
        code: `await expect(page).toHaveURL('${escapeJsString(observationAfter.url)}');`,
        reason: 'URL changed after action',
      });
    }
  }

  if (
    observationBefore.title &&
    observationAfter.title &&
    observationBefore.title !== observationAfter.title
  ) {
    const title = observationAfter.title.slice(0, 120);
    assertions.push({
      code: `await expect(page).toHaveTitle(/${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);`,
      reason: 'Page title changed',
    });
  }

  if (action.action === 'fill' && action.targetIndex && action.value) {
    const el = observationBefore.interactiveElements[action.targetIndex - 1];
    if (el) {
      const locator = elementLocatorCode(el, observationBefore.interactiveElements);
      assertions.push({
        code: `await expect(${locator}).toHaveValue('${escapeJsString(action.value)}');`,
        reason: 'Input value persisted',
      });
    }
  }

  const phrases = action.expectedOutcome ? extractQuotedPhrases(action.expectedOutcome) : [];
  for (const phrase of phrases) {
    const match = findElementByPhrase(observationAfter.interactiveElements, phrase);
    if (match) {
      const locator = elementLocatorCode(match, observationAfter.interactiveElements);
      assertions.push({
        code: `await expect(${locator}).toBeVisible();`,
        reason: `Expected outcome mentions "${phrase}"`,
      });
      if (match.name.length <= 120) {
        assertions.push({
          code: `await expect(${locator}).toContainText('${escapeJsString(phrase)}');`,
          reason: `Expected outcome mentions "${phrase}"`,
        });
      }
    }
  }

  const appeared = pickAssertionCandidates(
    newElementsAfter(observationBefore.interactiveElements, observationAfter.interactiveElements)
  );

  const isSubmitLike =
    action.action === 'click' &&
    action.targetIndex &&
    (() => {
      const el = observationBefore.interactiveElements[action.targetIndex! - 1];
      return el ? SUBMIT_CLICK_PATTERN.test(el.name) : false;
    })();

  if (isSubmitLike || action.action === 'navigate') {
    for (const el of appeared.slice(0, 2)) {
      if (PRIORITY_ASSERT_ROLES.has(el.role) || el.role === 'heading') {
        const locator = elementLocatorCode(el, observationAfter.interactiveElements);
        assertions.push({
          code: `await expect(${locator}).toBeVisible();`,
          reason: `New ${el.role} appeared after ${action.action}`,
        });
      }
    }
  } else if (appeared.length > 0 && assertions.length === 0) {
    const el = appeared[0];
    const locator = elementLocatorCode(el, observationAfter.interactiveElements);
    assertions.push({
      code: `await expect(${locator}).toBeVisible();`,
      reason: 'New UI element appeared',
    });
  }

  return dedupeAssertions(assertions).slice(0, 4);
}

export function deriveFinalAssertions(
  steps: StepRecord[],
  goal?: JourneyGoal
): DerivedAssertion[] {
  const successful = steps.filter((s) => s.success && s.observationAfter);
  const last = successful[successful.length - 1];
  if (!last?.observationAfter) return [];

  const assertions: DerivedAssertion[] = [];
  const { observationAfter } = last;

  if (observationAfter.title) {
    const title = observationAfter.title.slice(0, 120);
    assertions.push({
      code: `await expect(page).toHaveTitle(/${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);`,
      reason: 'Final page title',
    });
  }

  const headings = observationAfter.interactiveElements.filter((el) => el.role === 'heading');
  const primaryHeading = headings.find((h) => h.name.length >= 3) || headings[0];
  if (primaryHeading) {
    const locator = elementLocatorCode(primaryHeading, observationAfter.interactiveElements);
    assertions.push({
      code: `await expect(${locator}).toBeVisible();`,
      reason: 'Primary heading visible at journey end',
    });
  }

  if (goal?.startUrl) {
    const startHost = (() => {
      try {
        return new URL(goal.startUrl).hostname;
      } catch {
        return '';
      }
    })();
    const endHost = (() => {
      try {
        return new URL(observationAfter.url).hostname;
      } catch {
        return '';
      }
    })();
    if (startHost && endHost && startHost === endHost) {
      const hostPattern = startHost.replace(/\./g, '\\.');
      assertions.push({
        code: `await expect(page).toHaveURL(new RegExp('^https?:\\\\/\\\\/${hostPattern}'));`,
        reason: 'Still on target domain',
      });
    }
  }

  return dedupeAssertions(assertions).slice(0, 3);
}
