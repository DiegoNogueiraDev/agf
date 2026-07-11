/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import {
  computeTddScore,
  extractAssertionTypes,
  countAssertions,
  type TddScoreInput,
} from '../../core/harness/tdd-score.js'

const log = createLogger({ layer: 'cli', source: 'tdd-score-cmd.ts' })

/** Build the `agf tdd-score` CLI command. */
export function tddScoreCommand(): Command {
  log.info('tdd-score command registered')
  return new Command('tdd-score')
    .description(
      'Compute TDD quality score (0–100) for a task based on coverage, assertion diversity, and test density',
    )
    .argument('<nodeId>', 'Graph node ID of the task')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--json', 'Output raw JSON instead of formatted text')
    .action((nodeId: string, opts: { dir: string; json?: boolean }) => {
      const out = createCliOutput('tdd-score')

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(nodeId)
        if (!node) {
          out.fail('NODE_NOT_FOUND', `Node ${nodeId} not found in graph`, { nodeId })
          return
        }

        const testFiles: string[] = node.testFiles ?? []

        if (testFiles.length === 0) {
          const result = computeTddScore({
            testFileCount: 0,
            totalAssertions: 0,
            assertionTypes: [],
          })
          if (opts.json) {
            out.ok({ nodeId, ...result })
          } else {
            out.ok({
              nodeId,
              score: 0,
              grade: 'D',
              hasTests: false,
              message: 'no tests found',
              suggestions: result.suggestions,
            })
          }
          return
        }

        // Analyze each test file
        let totalAssertions = 0
        const allTypes = new Set<string>()

        for (const filePath of testFiles) {
          try {
            const content = readFileSync(filePath, 'utf8')
            totalAssertions += countAssertions(content)
            for (const t of extractAssertionTypes(content)) {
              allTypes.add(t)
            }
          } catch {
            // File unreadable — skip
          }
        }

        const input: TddScoreInput = {
          testFileCount: testFiles.length,
          totalAssertions,
          assertionTypes: [...allTypes],
        }

        const result = computeTddScore(input)

        if (opts.json) {
          out.ok({ nodeId, testFiles, ...result })
        } else {
          out.ok({
            nodeId,
            score: result.score,
            grade: result.grade,
            coverageScore: result.coverageScore,
            diversityScore: result.diversityScore,
            densityScore: result.densityScore,
            testFiles: testFiles.length,
            totalAssertions,
            assertionTypes: [...allTypes],
            hasTests: result.hasTests,
            suggestions: result.suggestions.length > 0 ? result.suggestions : undefined,
          })
        }
      } finally {
        store.close()
      }
    })
}
