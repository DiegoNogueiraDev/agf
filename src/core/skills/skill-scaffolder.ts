/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-8.T03 — Skill scaffolder.
 * Generates a SKILL.md template with frontmatter pre-filled. Pure I/O;
 * caller (manage_skill action='create') invokes and the file is later
 * picked up by skill-loader.loadSkillsFromDir (T02).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { InvalidArgumentError } from '../utils/errors.js'

export const SKILL_CATEGORIES = [
  'analyze',
  'design',
  'plan',
  'implement',
  'review',
  'validate',
  'know-me',
  'any',
] as const

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

export type LifecyclePhase =
  'ANALYZE' | 'DESIGN' | 'PLAN' | 'IMPLEMENT' | 'VALIDATE' | 'REVIEW' | 'HANDOFF' | 'DEPLOY' | 'LISTENING'

export interface ScaffoldInput {
  name: string
  category: SkillCategory
  phases?: LifecyclePhase[]
  description?: string
}

export interface ScaffoldResult {
  path: string
  filename: string
  alreadyExisted: boolean
}

const NAME_RE = /^[a-z][a-z0-9-]{1,40}$/

/** isValidSkillName —  */
export function isValidSkillName(name: string): boolean {
  return NAME_RE.test(name)
}

/** isValidCategory —  */
export function isValidCategory(category: string): category is SkillCategory {
  return (SKILL_CATEGORIES as readonly string[]).includes(category)
}

/** buildSkillTemplate —  */
export function buildSkillTemplate(input: ScaffoldInput): string {
  const phases = input.phases?.length ? input.phases : ['IMPLEMENT']
  return [
    '---',
    `name: ${input.name}`,
    `description: ${input.description ?? `${input.name} skill`}`,
    `category: ${input.category}`,
    `phases: [${phases.join(', ')}]`,
    '---',
    '',
    `# ${input.name}`,
    '',
    '## When to use',
    '',
    '_Describe the trigger conditions here._',
    '',
    '## Steps',
    '',
    '1. _Step one_',
    '2. _Step two_',
    '',
    '## Anti-patterns',
    '',
    '- _What this skill is NOT for_',
    '',
  ].join('\n')
}

export interface ScaffoldOptions {
  dirRoot?: string
  overwrite?: boolean
}

/** scaffoldSkill —  */
export function scaffoldSkill(input: ScaffoldInput, opts: ScaffoldOptions = {}): ScaffoldResult {
  if (!isValidSkillName(input.name)) {
    throw new InvalidArgumentError(
      `skill-scaffolder:invalid-name — name must match ${NAME_RE} (lowercase, alphanumeric, hyphens)`,
    )
  }
  if (!isValidCategory(input.category)) {
    throw new InvalidArgumentError(
      `skill-scaffolder:invalid-category — '${input.category}' not in [${SKILL_CATEGORIES.join(', ')}]`,
    )
  }
  const dirRoot = opts.dirRoot ?? 'src/skills'
  const path = join(dirRoot, input.category, `${input.name}.md`)
  const exists = existsSync(path)
  if (exists && !opts.overwrite) {
    return { path, filename: `${input.name}.md`, alreadyExisted: true }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buildSkillTemplate(input), 'utf-8')
  return { path, filename: `${input.name}.md`, alreadyExisted: exists }
}
