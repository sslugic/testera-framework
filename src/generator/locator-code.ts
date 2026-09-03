import type { InteractiveElement } from '../types/index.js';

export function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function elementLocatorCode(
  el: InteractiveElement,
  elements: InteractiveElement[]
): string {
  if (el.testId) {
    return `page.getByTestId('${escapeJsString(el.testId)}')`;
  }

  if (el.role && el.name) {
    const duplicates = elements.filter((other) => other.role === el.role && other.name === el.name);
    if (duplicates.length > 1) {
      const nthIndex = duplicates.findIndex((d) => d.index === el.index);
      return `page.getByRole('${escapeJsString(el.role)}', { name: '${escapeJsString(el.name)}', exact: true }).nth(${nthIndex >= 0 ? nthIndex : 0})`;
    }
    return `page.getByRole('${escapeJsString(el.role)}', { name: '${escapeJsString(el.name)}', exact: true })`;
  }

  if (el.name) {
    return `page.getByText('${escapeJsString(el.name)}')`;
  }

  return `page.locator('${escapeJsString(el.selector)}')`;
}
