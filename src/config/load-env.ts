import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const LUNA_AI_ENV_CANDIDATES = [
  process.env.LUNA_AI_ENV,
  path.resolve(process.cwd(), '../luna-ai/.env'),
  path.resolve(process.env.HOME || '', 'GitHub-Slaven/luna-ai/.env'),
].filter((p): p is string => Boolean(p));

/**
 * Load `.env` from this repo, then merge keys from the Luna AI workspace
 * (sibling `luna-ai/.env`) without overriding values already set locally.
 */
export function loadWorkspaceEnv(): { provider: string; envSources: string[] } {
  const envSources: string[] = [];

  const localEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
    envSources.push(localEnv);
  } else {
    dotenv.config();
  }

  for (const lunaEnv of LUNA_AI_ENV_CANDIDATES) {
    if (!fs.existsSync(lunaEnv)) continue;
    dotenv.config({ path: lunaEnv, override: false });
    if (!envSources.includes(lunaEnv)) envSources.push(lunaEnv);
    break;
  }

  const provider = resolveProvider();
  process.env.AI_PROVIDER = provider;

  return { provider, envSources };
}

function resolveProvider(): string {
  const explicit = process.env.AI_PROVIDER?.trim();
  const hasKey = {
    cursor: Boolean(process.env.CURSOR_API_KEY?.trim()),
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };

  if (explicit && explicit !== 'mock' && hasKey[explicit as keyof typeof hasKey]) {
    return explicit;
  }

  if (hasKey.cursor) return 'cursor';
  if (hasKey.gemini) return 'gemini';
  if (hasKey.anthropic) return 'anthropic';
  if (hasKey.openai) return 'openai';

  return explicit || 'mock';
}
