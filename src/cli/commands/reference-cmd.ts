/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * agf reference — wires the dormant reference-content barrel
 * (src/core/config/reference-content.ts and siblings) to a CLI surface:
 * prints the compiled agf reference guide, optionally filtered by lifecycle
 * phase and/or L5-compressed for token economy.
 */

import { Command } from 'commander'
import {
  getFullReference,
  getToolReference,
  compressReferenceContent,
  estimateRefTokens,
} from '../../core/config/reference-content.js'
import { createCliOutput } from '../shared/cli-output.js'

export interface ReferencePayload {
  phase?: string
  compressed: boolean
  text: string
  estimatedTokens: number
}

export interface ReferenceOptions {
  phase?: string
  compressed?: boolean
}

/** Pure: build the reference payload for the requested phase/compression. */
export function buildReferencePayload(opts: ReferenceOptions = {}): ReferencePayload {
  const compressed = opts.compressed ?? false
  let text = opts.phase ? getToolReference(opts.phase) : getFullReference()
  if (compressed) text = compressReferenceContent(text)

  return { phase: opts.phase, compressed, text, estimatedTokens: estimateRefTokens(text) }
}

/** Builds the `agf reference` CLI command (Commander definition). */
export function referenceCommand(): Command {
  return new Command('reference')
    .description('Print the compiled agf reference guide (tools, skills, phases, gates)')
    .option('--phase <phase>', 'Filter tool reference to a single lifecycle phase (e.g. IMPLEMENT)')
    .option('--compressed', 'Apply L5 compression (~40-50% token reduction)', false)
    .action((opts: { phase?: string; compressed: boolean }) => {
      const out = createCliOutput('reference')
      out.ok(buildReferencePayload(opts))
    })
}
