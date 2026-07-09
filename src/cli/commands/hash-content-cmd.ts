/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf hash-content` — CLI surface for src/core/canonicalization/ts.ts.
 *
 * Exposes canonicalizeTypeScript/computeContentHash directly so a driving
 * agent can check whether two revisions of a TS/JS file differ only in
 * whitespace/comments (stable hash) or carry a real semantic change.
 */

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { canonicalizeTypeScript, computeContentHash } from '../../core/canonicalization/ts.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'hash-content-cmd.ts' })

export interface HashContentResult {
  hash: string
  canonical: string
}

/** Pure core: canonicalize + hash a raw content string. */
export function runHashContent(content: string): HashContentResult {
  return {
    hash: computeContentHash(content),
    canonical: canonicalizeTypeScript(content),
  }
}

/** Builds the `agf hash-content` CLI command (Commander definition). */
export function hashContentCommand(): Command {
  log.info('hash-content command registered')
  return new Command('hash-content')
    .description('Stable content hash for a TS/JS file — comments/whitespace-noise-free (ADR-0048)')
    .argument('<file>', 'Path to the file to hash')
    .option('--show-canonical', 'Include the canonicalized content in the output', false)
    .action((file: string, opts: { showCanonical: boolean }) => {
      const out = createCliOutput('hash-content')
      try {
        const content = readFileSync(file, 'utf8')
        const result = runHashContent(content)
        out.ok(opts.showCanonical ? result : { hash: result.hash })
      } catch (err) {
        out.err('NOT_FOUND', `could not read ${file}: ${getErrorMessage(err)}`)
      }
    })
}
