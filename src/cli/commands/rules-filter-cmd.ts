/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf rules-filter` — CLI surface for src/core/config/language-rules-filter.ts.
 *
 * Exposes filterRulesByStack directly so a driving agent (or a project's own
 * `agf init` scaffolding) can filter a rule-pack catalogue down to the packs
 * applicable to a detected language stack, without injecting irrelevant
 * language rules (e.g. TS rules into a Go project).
 */

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { filterRulesByStack, type RulePack } from '../../core/config/language-rules-filter.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'rules-filter-cmd.ts' })

export interface RulesFilterInput {
  activeLanguages: string[]
  packs: RulePack[]
}

/** Pure core: filter a rule-pack catalogue to the active language stack. */
export function runRulesFilter(input: RulesFilterInput): RulePack[] {
  return filterRulesByStack(input.activeLanguages, input.packs)
}

/** Builds the `agf rules-filter` CLI command (Commander definition). */
export function rulesFilterCommand(): Command {
  log.info('rules-filter command registered')
  return new Command('rules-filter')
    .description(
      'Filter a rule-pack catalogue JSON to the active language stack (src/core/config/language-rules-filter.ts)',
    )
    .requiredOption('--languages <list>', 'Comma-separated active languages (e.g. typescript,go)')
    .requiredOption('--packs-file <path>', 'Path to a JSON file containing a RulePack[] catalogue')
    .action((opts: { languages: string; packsFile: string }) => {
      const out = createCliOutput('rules-filter')
      try {
        const packs = JSON.parse(readFileSync(opts.packsFile, 'utf8')) as RulePack[]
        const activeLanguages = opts.languages
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
        out.ok({ packs: runRulesFilter({ activeLanguages, packs }) })
      } catch (err) {
        out.err('INVALID_INPUT', `could not filter rule packs: ${getErrorMessage(err)}`)
      }
    })
}
