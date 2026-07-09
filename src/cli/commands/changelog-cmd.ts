/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * agf changelog generate — wires the dormant conventional-commit parser
 * (src/core/utils/changelog.ts) to a CLI surface: turns a git ref range into
 * a Keep-a-Changelog markdown section, zero LLM calls.
 */

import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import {
  parseConventionalCommit,
  groupByType,
  formatKeepAChangelog,
  type CommitEntry,
} from '../../core/utils/changelog.js'
import { createCliOutput } from '../shared/cli-output.js'

export interface ChangelogPayload {
  markdown: string
  entries: number
  skipped: number
}

/** Pure: turn raw commit subjects into a Keep-a-Changelog section for `version`. */
export function buildChangelogPayload(subjects: string[], version: string): ChangelogPayload {
  const parsed = subjects.map(parseConventionalCommit).filter((e): e is CommitEntry => e !== null)
  const groups = groupByType(parsed)
  const markdown = formatKeepAChangelog(version, groups)
  return { markdown, entries: parsed.length, skipped: subjects.length - parsed.length }
}

/** Fetch commit subjects in `fromRef..toRef` (exclusive..inclusive). Fail-open to []. */
function fetchCommitSubjects(fromRef: string, toRef: string, cwd: string): string[] {
  try {
    const out = execFileSync('git', ['log', `${fromRef}..${toRef}`, '--format=%s'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Builds the `agf changelog` CLI command (Commander definition). */
export function changelogCommand(): Command {
  const cmd = new Command('changelog').description('Generate Keep-a-Changelog sections from conventional commits')

  cmd
    .command('generate')
    .description('Generate a changelog section for commits in a git ref range')
    .requiredOption('--release <version>', 'Version label for the section heading')
    .option('--from <ref>', 'Start ref (exclusive)', 'HEAD^')
    .option('--to <ref>', 'End ref (inclusive)', 'HEAD')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--select <path>', 'Dot-path filter on output data')
    .action((opts: { release: string; from: string; to: string; dir: string }) => {
      const out = createCliOutput('changelog-generate')
      const subjects = fetchCommitSubjects(opts.from, opts.to, opts.dir)
      const payload = buildChangelogPayload(subjects, opts.release)
      out.ok(payload)
    })

  return cmd
}
