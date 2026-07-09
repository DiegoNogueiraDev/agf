/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * agf wave12-5w2h — wires the dormant Wave-12 5W2H generator
 * (src/core/analyzer/wave-12-5w2h-generator.ts) to a CLI surface: prints the
 * Sandbox Build initiative's 5W2H strategic planning document, either as the
 * raw JSON envelope or as human-readable formatted text.
 */

import { Command } from 'commander'
import { generateWave125W2HAnalysis, format5W2HForDisplay } from '../../core/analyzer/wave-12-5w2h-generator.js'
import type { Wave125W2HAnalysis } from '../../schemas/wave-12-5w2h-analysis.js'
import { createCliOutput } from '../shared/cli-output.js'

export type Wave125W2HFormat = 'json' | 'text'

export interface Wave125W2HPayload {
  format: Wave125W2HFormat
  analysis?: Wave125W2HAnalysis
  text?: string
}

/** Pure: build the 5W2H payload in the requested format. */
export function buildWave125W2HPayload(format: Wave125W2HFormat): Wave125W2HPayload {
  const analysis = generateWave125W2HAnalysis()
  if (format === 'text') {
    return { format, text: format5W2HForDisplay(analysis) }
  }
  return { format, analysis }
}

/** Builds the `agf wave12-5w2h` CLI command (Commander definition). */
export function wave125w2hCommand(): Command {
  return new Command('wave12-5w2h')
    .description('Print the Wave-12 Sandbox Build 5W2H strategic planning document')
    .option('--format <format>', 'Output format: json or text', 'json')
    .action((opts: { format: string }) => {
      const out = createCliOutput('wave12-5w2h')
      const format = opts.format === 'text' ? 'text' : 'json'
      out.ok(buildWave125W2HPayload(format))
    })
}
