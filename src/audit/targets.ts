import fs from 'node:fs/promises';

export interface AuditTarget {
  name?: string;
  url: string;
  goal?: string;
  maxSteps?: number;
  authenticated?: boolean;
  customInstructions?: string;
  storageStatePath?: string;
}

const DEFAULT_GOAL =
  'Autonomously explore the application: discover navigable views, interact with buttons and forms, and identify UX friction.';

export function defaultGoalForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return `Explore ${host}: discover key flows, navigation, and interactive elements.`;
  } catch {
    return DEFAULT_GOAL;
  }
}

export interface NormalizedAuditTarget {
  name: string;
  url: string;
  goal: string;
  maxSteps: number;
  authenticated: boolean;
  customInstructions?: string;
  storageStatePath?: string;
}

export function normalizeTarget(raw: AuditTarget, defaults: { maxSteps: number; goal?: string }): NormalizedAuditTarget {
  const url = raw.url.trim();
  const goal = (raw.goal || defaults.goal || defaultGoalForUrl(url)).trim();
  let name = raw.name?.trim();
  if (!name) {
    try {
      name = new URL(url).hostname;
    } catch {
      name = url;
    }
  }
  return {
    name,
    url,
    goal,
    maxSteps: raw.maxSteps ?? defaults.maxSteps,
    authenticated: raw.authenticated ?? false,
    customInstructions: raw.customInstructions,
    storageStatePath: raw.storageStatePath,
  };
}

/** Parse `name | url | goal` or `url | goal` or bare `url`. */
function parseLine(line: string): AuditTarget | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.split('|').map((p) => p.trim());
  if (parts.length === 1) {
    return { url: parts[0] };
  }
  if (parts.length === 2) {
    if (parts[0].startsWith('http://') || parts[0].startsWith('https://')) {
      return { url: parts[0], goal: parts[1] };
    }
    return { name: parts[0], url: parts[1] };
  }
  return { name: parts[0], url: parts[1], goal: parts[2] };
}

export async function loadTargetsFromFile(filePath: string): Promise<AuditTarget[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = filePath.toLowerCase();

  if (ext.endsWith('.json')) {
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed) ? parsed : parsed.targets;
    if (!Array.isArray(list)) {
      throw new Error('JSON targets file must be an array or { "targets": [...] }');
    }
    return list.map((t: AuditTarget) => ({ ...t, url: String(t.url) }));
  }

  return content
    .split('\n')
    .map(parseLine)
    .filter((t): t is AuditTarget => t !== null);
}

export function targetsFromUrls(urls: string[], sharedGoal?: string): AuditTarget[] {
  return urls.map((url) => ({
    url,
    goal: sharedGoal,
  }));
}
