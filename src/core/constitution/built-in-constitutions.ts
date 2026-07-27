/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Built-in constitution bundles shipped with mcp-graph.
 *
 * Each bundle is a curated set of governing principles installable via
 * `constitution(action: "install_builtin", name: "<bundle-name>")`. Bundles
 * are immutable definitions; install creates a constitution node carrying
 * a copy of the principles + a `builtinName` marker for idempotency.
 *
 * Adding a bundle: append a `BuiltinConstitution` to `BUILTINS` and export
 * a `*_NAME` constant for the public ID.
 */

import type { ConstitutionPrinciple } from './constitution-checker.js'

export interface BuiltinConstitution {
  name: string
  description: string
  upstream?: string
  license?: string
  principles: ConstitutionPrinciple[]
}

export const KARPATHY_BASELINE_NAME = 'karpathy-baseline'

const KARPATHY_BASELINE: BuiltinConstitution = {
  name: KARPATHY_BASELINE_NAME,
  description:
    'Behavioral guardrails to reduce common LLM coding mistakes. ' +
    'Four principles: think before coding, simplicity first, surgical changes, goal-driven execution.',
  upstream: 'https://github.com/andrej-karpathy/karpathy-skills',
  license: 'MIT',
  principles: [
    {
      id: 'karpathy-think',
      title: 'Think Before Coding',
      description:
        'State assumptions explicitly. Surface tradeoffs and alternative interpretations. ' +
        'If something is unclear, stop and ask — do not pick silently.',
      category: 'behavioral',
      weight: 0.7,
      enforceable: false,
    },
    {
      id: 'karpathy-simplicity',
      title: 'Simplicity First',
      description:
        'Minimum code that solves the problem. No features beyond what was asked. ' +
        'No abstractions for single-use code. No flexibility or configurability that was not requested. ' +
        'If 200 lines could be 50, rewrite it.',
      category: 'behavioral',
      weight: 0.9,
      enforceable: true,
    },
    {
      id: 'karpathy-surgical',
      title: 'Surgical Changes',
      description:
        'Touch only what you must. Do not improve adjacent code, comments, or formatting. ' +
        "Do not refactor things that are not broken. Every changed line must trace directly to the user's request.",
      category: 'behavioral',
      weight: 0.8,
      enforceable: false,
    },
    {
      id: 'karpathy-goal-driven',
      title: 'Goal-Driven Execution',
      description:
        'Define verifiable success criteria before coding. Transform tasks into goals with checks: ' +
        'write a failing test, then make it pass. Strong success criteria let you loop independently.',
      category: 'behavioral',
      weight: 0.8,
      enforceable: false,
    },
  ],
}

const BUILTINS: ReadonlyArray<BuiltinConstitution> = [KARPATHY_BASELINE]

/** Look up a built-in constitution by name. Returns undefined if unknown. */
export function getBuiltinConstitution(name: string): BuiltinConstitution | undefined {
  return BUILTINS.find((b) => b.name === name)
}

/** List metadata for all built-in constitutions (without principle bodies). */
export function listBuiltinConstitutions(): Array<{
  name: string
  description: string
  principleCount: number
}> {
  return BUILTINS.map((b) => ({
    name: b.name,
    description: b.description,
    principleCount: b.principles.length,
  }))
}
