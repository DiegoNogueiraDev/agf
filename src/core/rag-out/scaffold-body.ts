/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The structure a recovered scaffold is supposed to hand over.
 *
 * WHY it exists: `agf montar-output` answered `recover`, named a scaffold, listed its slots, and
 * claimed 180 tokens saved — then returned a `structureRef` and no body. Nine of thirteen refs
 * pointed at `templates/*.md` files that were never written; the other four named deterministic
 * scaffolders whose bodies `runScaffold()` had always been able to produce, and which nothing ever
 * asked it to. The ledger holds 4,951 tokens earned by structure that reached nobody.
 *
 * A saving is the cost of a thing you did not have to write. If the thing does not exist, the cost
 * is zero and the honest answer is `generate` — see gate.ts, which refuses to recover a skeleton it
 * cannot produce. That guard stays, and it now fires on a reference nobody defined rather than on
 * nine that everybody assumed.
 *
 * WHY a placeholder spec: the body's *shape* is what carries the tokens, not the names in it. A
 * spec with placeholder names renders the same boilerplate the real one will, so counting it
 * measures the structure rather than the caller's vocabulary. The agent fills the slots either way.
 *
 * Contract: `resolveScaffoldBody(ref)` returns the text or null; never throws. `structureTokens`
 * is that text, counted — the baseline `measured_template` is computed against.
 */

import { existsSync, readFileSync } from 'node:fs'
import { runScaffold, type ScaffoldKind, type ScaffoldSpec } from '../scaffolder/registry.js'
import { BUILTIN_TEMPLATES } from './templates/index.js'

/** Coarse token estimate (~4 chars/token), the same one RAG-IN uses. */
function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * A spec per kind whose names are placeholders and whose shape is real. `runScaffold` throws on an
 * inconsistent spec (a formula whose variable escapes its domain), so these are kept valid.
 */
const PLACEHOLDER_SPEC: Readonly<Record<ScaffoldKind, ScaffoldSpec>> = {
  contract: {
    id: 'placeholder',
    name: 'Placeholder',
    inputSchemaRef: 'PlaceholderInput',
    outputSchemaRef: 'PlaceholderOutput',
    handlerType: 'rest',
  },
  interface: {
    id: 'placeholder',
    name: 'Placeholder',
    methods: [{ name: 'run', params: '', returns: 'void' }],
  },
  'state-machine': {
    id: 'placeholder',
    name: 'Placeholder',
    states: ['idle', 'running'],
    transitions: [{ from: 'idle', event: 'START', to: 'running' }],
  },
  formula: {
    id: 'placeholder',
    name: 'placeholder',
    expression: 'x + 1',
    domain: { x: 'R' },
  },
}

function isScaffoldKind(kind: string): kind is ScaffoldKind {
  return Object.prototype.hasOwnProperty.call(PLACEHOLDER_SPEC, kind)
}

/**
 * The text a `recover` should hand the agent, or null when there is none to hand.
 *
 * Two kinds of reference. `scaffolder:<kind>` is code — rendered here, deterministic, zero tokens
 * of LLM. `templates/<file>` is a project file when one exists, and otherwise the skeleton that
 * ships in `templates/index.ts`.
 */
export function resolveScaffoldBody(structureRef: string | undefined): string | null {
  if (!structureRef) return null

  try {
    if (structureRef.startsWith('scaffolder:')) {
      const kind = structureRef.slice('scaffolder:'.length)
      if (!isScaffoldKind(kind)) return null
      const files = runScaffold(kind, PLACEHOLDER_SPEC[kind])
      const body = files.map((f) => f.content).join('\n')
      return body.length > 0 ? body : null
    }

    // A real file at that path wins: a team with a house style overrides the shipped skeleton.
    if (existsSync(structureRef)) {
      const body = readFileSync(structureRef, 'utf8')
      return body.length > 0 ? body : null
    }

    // Otherwise the skeleton ships with the tool, because `existsSync` resolves against the
    // caller's working directory and `agf` is usually standing in someone else's project.
    return BUILTIN_TEMPLATES[structureRef] ?? null
  } catch {
    // A scaffolder that throws on its own placeholder is a broken scaffolder, not a broken command.
    return null
  }
}

/** The structure, counted. Null when it does not exist — and then nothing may be claimed for it. */
export function structureTokens(structureRef: string | undefined): number | null {
  const body = resolveScaffoldBody(structureRef)
  return body === null ? null : approxTokens(body)
}
