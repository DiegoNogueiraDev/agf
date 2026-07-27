/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf web-parity` — CLI surface for src/core/web/web-surface-parity.ts.
 *
 * Exposes auditWebParity() directly so a driving agent can see, at a glance,
 * which CLI capabilities still lack a web dashboard view, sorted by priority.
 */

import { Command } from 'commander'
import { auditWebParity } from '../../core/web/web-surface-parity.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'web-parity-cmd.ts' })

/** Builds the `agf web-parity` CLI command (Commander definition). */
export function webParityCommand(): Command {
  log.info('web-parity command registered')
  return new Command('web-parity')
    .description('Deterministic gap report — CLI capabilities without a corresponding web dashboard view')
    .action(() => {
      const out = createCliOutput('web-parity')
      out.ok(auditWebParity())
    })
}
