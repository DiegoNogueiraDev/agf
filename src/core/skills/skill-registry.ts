/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-8.T02 — Skill registry: list/invoke layer over skill-loader.
 * Wraps loadSkillsFromDir (EPIC-22.D6) so manage_skill list/invoke have a
 * stable surface. listSkills sorts current-phase skills first; invokeSkill
 * returns the full body for a given skill name.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CustomSkillInput } from '../../schemas/skill.schema.js'
import { loadSkillsFromDir, parseSkillMarkdown } from './skill-loader.js'
import type { AgentSource } from '../hooks/config-loader.js'

export interface SkillSummary {
  name: string
  description: string
  category: string
  phases: string[]
}

export interface SkillInvocation {
  name: string
  description: string
  category: string
  phases: string[]
  body: string
}

function summarize(skill: CustomSkillInput): SkillSummary {
  return {
    name: skill.name,
    description: skill.description ?? '',
    category: (skill as { category?: string }).category ?? 'any',
    phases: ((skill as { phases?: string[] }).phases ?? []).map((p) => String(p)),
  }
}

/**
 * List all skills under `dir`. When `currentPhase` is provided, skills
 * matching that phase are returned first; ties broken by name.
 */
export function listSkills(
  dir: string,
  currentPhase?: string,
): { skills: SkillSummary[]; errors: Array<{ file: string; error: string }> } {
  const resultValue = loadSkillsFromDir(dir)
  const summaries = resultValue.loaded.map(summarize)
  summaries.sort((a, b) => {
    const phaseA = currentPhase && a.phases.includes(currentPhase) ? 0 : 1
    const phaseB = currentPhase && b.phases.includes(currentPhase) ? 0 : 1
    if (phaseA !== phaseB) return phaseA - phaseB
    return a.name.localeCompare(b.name)
  })
  return { skills: summaries, errors: resultValue.errors }
}

/**
 * Invoke (i.e., return full body of) a skill by name. Walks dir, returns
 * the first match. Reads instructions from the parsed CustomSkillInput.
 */
export function invokeSkill(dir: string, name: string): SkillInvocation | undefined {
  const resultValue = loadSkillsFromDir(dir)
  const found = resultValue.loaded.find((s) => s.name === name)
  if (!found) return undefined
  const summary = summarize(found)
  return {
    ...summary,
    body: (found as { instructions?: string }).instructions ?? '',
  }
}

/**
 * Invoke a skill given a known file path. Useful when the caller already
 * knows the exact path (e.g., from a previous list call).
 */
export function invokeSkillByPath(path: string): SkillInvocation | undefined {
  let content: string
  try {
    content = readFileSync(path, 'utf-8')
  } catch {
    return undefined
  }
  const parsed = parseSkillMarkdown(content)
  if (!parsed.ok || !parsed.skill) return undefined
  const summary = summarize(parsed.skill)
  return { ...summary, body: parsed.skill.instructions ?? '' }
}

/** Helper: find directories that should be searched (project + global user). */
export function defaultSkillRoots(projectRoot: string = process.cwd()): string[] {
  const globalSkillsDir = join(homedir(), '.config', 'agent-graph-flow', 'skills')
  return [
    join(projectRoot, 'src/skills'),
    join(projectRoot, CLI_AGNOSTIC_SKILLS_BASE),
    join(projectRoot, CLAUDE_SKILLS_BASE),
    globalSkillsDir,
  ]
}

/** Where AGENTS.md-driven and other CLIs read repo-scoped skills from. */
const CLI_AGNOSTIC_SKILLS_BASE = '.agents/skills'
/** Claude Code's own skills directory. */
const CLAUDE_SKILLS_BASE = '.claude/skills'

/**
 * Project-relative skills directory each CLI actually reads.
 *
 * WHY most entries share the agnostic base instead of getting a bespoke folder:
 * only Claude Code and the AGENTS.md family have a real skills-directory
 * convention. Minting `.copilot/skills`, `.gemini/skills` and friends would
 * fabricate conventions no CLI reads — an install that "succeeds" into a folder
 * nothing loads is worse than one that refuses, because it looks like it worked.
 * So every CLI without its own convention points at the agnostic base, which is
 * the same directory the CLI-agnostic slash adapter already serves skills from.
 *
 * Typed as a total Record so adding a CLI to AgentSourceSchema without deciding
 * its destination fails at compile time, not at a user's install.
 */
const SKILLS_DESTINATION: Record<Exclude<AgentSource, 'unknown'>, string> = {
  claude: CLAUDE_SKILLS_BASE,
  codex: CLI_AGNOSTIC_SKILLS_BASE,
  opencode: CLI_AGNOSTIC_SKILLS_BASE,
  copilot: CLI_AGNOSTIC_SKILLS_BASE,
  cursor: CLI_AGNOSTIC_SKILLS_BASE,
  windsurf: CLI_AGNOSTIC_SKILLS_BASE,
  gemini: CLI_AGNOSTIC_SKILLS_BASE,
  aider: CLI_AGNOSTIC_SKILLS_BASE,
  continue: CLI_AGNOSTIC_SKILLS_BASE,
  cline: CLI_AGNOSTIC_SKILLS_BASE,
  'mcp-graph': CLI_AGNOSTIC_SKILLS_BASE,
}

/** Resolved install destination, or a refusal when the driving CLI is unknown. */
export type SkillsDestination = { ok: true; dir: string } | { ok: false; code: string; error: string }

/**
 * Absolute directory `agf skill install` should write into for `cli`.
 *
 * Returns a refusal for an unrecognized CLI rather than falling back: a silent
 * default makes the user believe the skill was installed for their tool when it
 * landed somewhere that tool never reads.
 */
export function resolveSkillsDestination(cli: AgentSource, projectRoot: string = process.cwd()): SkillsDestination {
  if (cli === 'unknown') {
    return { ok: false, code: 'CLI_UNKNOWN', error: 'could not detect the driving CLI — pass it explicitly' }
  }
  return { ok: true, dir: join(projectRoot, SKILLS_DESTINATION[cli]) }
}
