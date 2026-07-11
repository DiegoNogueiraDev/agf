/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2025 OpenAI (OpenAI Codex)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from OpenAI Codex (https://github.com/openai/codex), Apache-2.0.
 * See THIRD-PARTY-NOTICES.md.
 *
 * task-collaboration-modes — Collaboration mode types, templates, and tool gating.
 *
 * Three modes that adapt agent behavior:
 *   plan    — read-only, forbids mutation (no write/edit/bash)
 *   execute — full access, default mode
 *   pair    — step-by-step reasoning, user check-ins, blocks destructive tools
 */

/** Three-level agent gating mode: plan (read-only), execute (full), pair (no destructive). */
export type CollaborationMode = 'plan' | 'execute' | 'pair'

export interface ModeInfo {
  id: CollaborationMode
  label: string
  description: string
}

const MODES: ModeInfo[] = [
  {
    id: 'plan',
    label: 'Plan',
    description: 'Read-only mode — analyze, search, and plan. No file mutations allowed.',
  },
  {
    id: 'execute',
    label: 'Execute',
    description: 'Full access — implement, test, and deploy. All tools available.',
  },
  {
    id: 'pair',
    label: 'Pair',
    description: 'Pair programming — step-by-step reasoning with explicit user check-ins.',
  },
]

// ---------------------------------------------------------------------------
// System prompt templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<CollaborationMode, string> = {
  plan: `## PLAN MODE

You are in PLAN MODE. Your job is to analyze, search, and create a plan.

### Rules
- Read files, search code, explore the codebase — do as much research as needed.
- Do NOT modify files. Do NOT write new files. Do NOT run shell commands that mutate state.
- Do NOT use write, edit, or bash tools.
- You MAY use read, glob, grep, and other read-only tools.
- When you are done planning, summarize your findings and proposed approach clearly.
- The user will switch to EXECUTE MODE to implement the plan.

### Output
Present a clear plan with:
1. What problem you're solving
2. Files you would modify/create
3. Step-by-step implementation approach
4. Any risks or open questions`,

  execute: `## EXECUTE MODE

You are in EXECUTE MODE. You have full access to all tools.

### Rules
- Write code, run tests, edit files — all tools are available.
- Follow TDD: write tests first, then implement.
- Run the test suite after changes to verify no regressions.
- Be concise and direct in your output.`,

  pair: `## PAIR PROGRAMMING MODE

You are in PAIR PROGRAMMING MODE. Think aloud, step by step.

### Rules
- Before taking any action, explain your reasoning.
- After each step, present what you did and what you'll do next.
- Ask for explicit confirmation before: deleting files, force-pushing, or modifying production config.
- Do NOT run destructive shell commands without user approval.
- All read-only tools are available. Bash is limited to safe commands only.

### Output
For each step:
1. What I'm thinking (reasoning)
2. What I'll do (action)
3. What happened (result)
4. What's next (plan)`,
}

// ---------------------------------------------------------------------------
// Tool blocking rules per mode
// ---------------------------------------------------------------------------

/** Tools blocked in plan mode (no mutation). */
const PLAN_BLOCKED = new Set(['write', 'edit', 'bash', 'exec'])

/** Tools blocked in pair mode (destructive only). */
const PAIR_BLOCKED = new Set(['bash'])

/** Tools always blocked (security). */
const ALWAYS_BLOCKED = new Set<string>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return the system-prompt template for the given collaboration mode. */
export function getCollaborationTemplate(mode: CollaborationMode): string {
  return TEMPLATES[mode] ?? TEMPLATES.execute
}

export function getBlockedTools(mode: CollaborationMode): string[] {
  switch (mode) {
    case 'plan':
      return [...PLAN_BLOCKED, ...ALWAYS_BLOCKED]
    case 'pair':
      return [...PAIR_BLOCKED, ...ALWAYS_BLOCKED]
    default:
      return [...ALWAYS_BLOCKED]
  }
}

/** Return all registered collaboration modes with id, label, and description. */
export function listModes(): ModeInfo[] {
  return MODES
}

/**
 * Returns the next mode in the cycle: plan → execute → pair → plan.
 */
export function cycleMode(current: CollaborationMode): CollaborationMode {
  const order: CollaborationMode[] = ['plan', 'execute', 'pair']
  const idx = order.indexOf(current)
  return order[(idx + 1) % order.length]
}
