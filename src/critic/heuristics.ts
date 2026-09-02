import type { Observation, UIAction, Finding } from '../types/index.js';
import type { ExecutionResult } from '../runtime/executor.js';

export interface HeuristicEvaluation {
  functionalityScore: number;
  usabilityScore: number;
  interactionScore: number;
  findings: Finding[];
}

export class HeuristicEvaluator {
  static evaluate(
    action: UIAction,
    result: ExecutionResult,
    before: Observation,
    after?: Observation
  ): HeuristicEvaluation {
    const findings: Finding[] = [];
    let func = 100;
    let use = 100;
    let interact = 100;

    // 1. Functionality Checks
    if (!result.success) {
      func -= 45;
      findings.push({
        category: 'functionality',
        severity: 'critical',
        message: `Action execution failed: ${result.error || 'Unknown error'}`,
        elementIndex: action.targetIndex,
        recommendation: 'Verify locator resolution or element interactability before dispatching action.',
      });
    }

    // Telemetry errors check
    if (after) {
      const newLogs = after.telemetry.filter(
        (t) => t.timestamp >= (before.telemetry[before.telemetry.length - 1]?.timestamp ?? 0)
      );

      const uncaughtErrors = newLogs.filter((l) => l.type === 'page-error');
      if (uncaughtErrors.length > 0) {
        func -= Math.min(uncaughtErrors.length * 25, 40);
        findings.push({
          category: 'functionality',
          severity: 'critical',
          message: `Uncaught JavaScript exceptions detected (${uncaughtErrors.length} occurrences): ${uncaughtErrors[0].text}`,
          recommendation: 'Fix JavaScript runtime exceptions and unhandled promise rejections in frontend client.',
        });
      }

      const consoleErrors = newLogs.filter((l) => l.type === 'console-error');
      if (consoleErrors.length > 0) {
        func -= Math.min(consoleErrors.length * 10, 25);
        findings.push({
          category: 'functionality',
          severity: 'high',
          message: `Console errors logged: ${consoleErrors[0].text}`,
          recommendation: 'Inspect browser console errors and sanitize failing frontend modules.',
        });
      }

      const networkErrors = newLogs.filter((l) => l.type === 'network-error');
      if (networkErrors.length > 0) {
        func -= Math.min(networkErrors.length * 20, 40);
        findings.push({
          category: 'functionality',
          severity: 'high',
          message: `Network request failure encountered (${networkErrors.length} requests): ${networkErrors[0].text}`,
          recommendation: 'Ensure API backend endpoints respond with 2xx status codes and valid CORS headers.',
        });
      }
    }

    // 2. Usability Checks
    if (before && action.targetIndex) {
      const targetElem = before.interactiveElements[action.targetIndex - 1];
      if (targetElem) {
        // Target size check (minimum 24x24, recommended 44x44)
        const bbox = targetElem.boundingBox;
        if (bbox.width > 0 && bbox.height > 0 && (bbox.width < 24 || bbox.height < 24)) {
          use -= 15;
          findings.push({
            category: 'usability',
            severity: 'medium',
            message: `Touch target size for "${targetElem.name || targetElem.role}" is ${bbox.width}x${bbox.height}px, below the recommended 24x24px / 44x44px minimum.`,
            elementIndex: targetElem.index,
            recommendation: 'Increase element padding or min-width/min-height for mobile tap target accessibility (WCAG 2.5.5 / 2.5.8).',
          });
        }

        // Accessible name check
        if (!targetElem.name || targetElem.name.trim().length === 0) {
          use -= 20;
          findings.push({
            category: 'usability',
            severity: 'high',
            message: `Interactive element <${targetElem.tagName}> has no accessible name or label. Screen readers cannot announce it.`,
            elementIndex: targetElem.index,
            recommendation: 'Add aria-label, title, or visible text to ensure assistive technologies can identify the element.',
          });
        }
      }
    }

    // General page usability check on latest observation
    const current = after || before;
    const unlabeledInputs = current.interactiveElements.filter(
      (el) => (el.role === 'textbox' || el.role === 'combobox') && !el.name && !el.placeholder
    );
    if (unlabeledInputs.length > 0) {
      use -= Math.min(unlabeledInputs.length * 10, 20);
      findings.push({
        category: 'usability',
        severity: 'medium',
        message: `${unlabeledInputs.length} form input(s) lack labels and placeholders.`,
        recommendation: 'Associate form inputs with <label for="..."> or aria-label attributes.',
      });
    }

    // 3. Interaction Checks
    if (result.duration > 3500) {
      interact -= 20;
      findings.push({
        category: 'interaction',
        severity: 'medium',
        message: `Interaction response latency was high (${result.duration}ms).`,
        recommendation: 'Optimize client event handlers and defer heavy synchronous computations.',
      });
    } else if (result.duration > 1500) {
      interact -= 10;
    }

    // Dead click detection: if action was click on button/link but URL and elements count remained identical
    if (after && action.action === 'click' && result.success) {
      const urlUnchanged = before.url === after.url;
      const elementsIdentical = before.interactiveElements.length === after.interactiveElements.length;
      const titleIdentical = before.title === after.title;

      if (urlUnchanged && elementsIdentical && titleIdentical && action.targetIndex) {
        const clicked = before.interactiveElements[action.targetIndex - 1];
        if (clicked && (clicked.role === 'link' || (clicked.name.toLowerCase().includes('submit') && clicked.role === 'button'))) {
          interact -= 15;
          findings.push({
            category: 'interaction',
            severity: 'low',
            message: `Click on "${clicked.name}" resulted in no observable visual or URL state change. Potential unresponsive handler.`,
            elementIndex: clicked.index,
            recommendation: 'Provide clear visual feedback (loading spinner, active state, or toast message) upon click.',
          });
        }
      }
    }

    return {
      functionalityScore: Math.max(0, Math.min(100, func)),
      usabilityScore: Math.max(0, Math.min(100, use)),
      interactionScore: Math.max(0, Math.min(100, interact)),
      findings,
    };
  }
}
