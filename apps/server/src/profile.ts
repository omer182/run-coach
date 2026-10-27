import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CoachProfile } from '@run-coach/core';

export const DEFAULT_PROFILE: CoachProfile = { why: [], personality: 'friendly' };

const PERSONALITIES = new Set<CoachProfile['personality']>(['friendly', 'tough', 'calm']);

export function parseProfile(input: unknown): CoachProfile | null {
  if (typeof input !== 'object' || input === null) return null;
  const p = input as Record<string, unknown>;
  const why = Array.isArray(p.why) ? p.why.filter((w): w is string => typeof w === 'string') : [];
  const personality = PERSONALITIES.has(p.personality as CoachProfile['personality'])
    ? (p.personality as CoachProfile['personality'])
    : 'friendly';
  return {
    name: typeof p.name === 'string' && p.name ? p.name.slice(0, 60) : undefined,
    goal: typeof p.goal === 'string' && p.goal ? p.goal.slice(0, 200) : undefined,
    why: why.map(w => w.slice(0, 300)).slice(0, 10),
    personality,
  };
}

/** The single runner's profile, kept as a JSON file until the database arrives in a later phase. */
export class ProfileStore {
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'profile.json');
  }

  async get(): Promise<CoachProfile> {
    try {
      return parseProfile(JSON.parse(await readFile(this.file, 'utf8'))) ?? DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  }

  async set(profile: CoachProfile): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(profile, null, 2));
  }
}
