/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'lint-cmd.ts' })

export interface LintOptions {
  fix?: boolean
  file?: string
  all?: boolean
}

export interface LintInvocation {
  command: string
  args: string[]
  /** MUST stay false: shell:true concatenates the user --file into a shell string (CWE-78). */
  shell: boolean
}

/** One flattened eslint message, envelope-serialisable (no raw stdout passthrough). */
export interface LintFinding {
  file: string
  ruleId: string | null
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
}

/** Structured, envelope-safe lint report — the shape that lands in `data`. */
export interface LintReport {
  passed: boolean
  errorCount: number
  warningCount: number
  findings: LintFinding[]
  /** true when eslint stdout was not valid JSON (e.g. eslint crashed before formatting). */
  parseError?: boolean
}

/**
 * Build the eslint invocation. Runs `npx eslint --format json …` with args as literal
 * argv and `shell: false`, so a user-supplied `--file` (a path or glob) can never be
 * interpreted by a shell — eslint expands globs itself. Passing an args array with
 * `shell: true` concatenates unescaped (Node DEP0190) and lets `--file 'x; rm -rf ~'`
 * inject commands.
 *
 * `--format json` is load-bearing: `agf lint` MUST emit only the JSON envelope on stdout
 * (CLI contract). Capturing eslint's machine-readable JSON — instead of inheriting its
 * human text via stdio:'inherit' — is what keeps `--select` working and `exec chain`
 * parseable. Raw passthrough previously printed eslint text BEFORE the envelope, breaking
 * every JSON consumer.
 */
export function buildLintInvocation(opts: LintOptions): LintInvocation {
  const args = ['eslint', '--format', 'json']
  if (opts.fix) args.push('--fix')
  if (opts.file) {
    args.push(opts.file)
  } else if (!opts.all) {
    args.push('--ext', '.ts,.tsx')
    args.push('src/')
  }
  return { command: 'npx', args, shell: false }
}

interface EslintFileResult {
  filePath: string
  errorCount: number
  warningCount: number
  messages: Array<{ ruleId: string | null; severity: number; message: string; line: number; column: number }>
}

/**
 * Parse eslint's `--format json` stdout into a structured report. Pure and total: never
 * throws, and degrades to `{ passed:false, parseError:true }` on non-JSON input so a lint
 * run that crashes before formatting still yields a valid envelope instead of corrupting
 * stdout. `passed` follows eslint's exit semantics — errors fail, warnings do not.
 */
export function parseEslintOutput(stdout: string): LintReport {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { passed: false, errorCount: 0, warningCount: 0, findings: [], parseError: true }
  }
  if (!Array.isArray(parsed)) {
    return { passed: false, errorCount: 0, warningCount: 0, findings: [], parseError: true }
  }

  const results = parsed as EslintFileResult[]
  let errorCount = 0
  let warningCount = 0
  const findings: LintFinding[] = []
  for (const fileResult of results) {
    errorCount += fileResult.errorCount ?? 0
    warningCount += fileResult.warningCount ?? 0
    for (const m of fileResult.messages ?? []) {
      findings.push({
        file: fileResult.filePath,
        ruleId: m.ruleId ?? null,
        severity: m.severity === 2 ? 'error' : 'warning',
        message: m.message,
        line: m.line,
        column: m.column,
      })
    }
  }

  return { passed: errorCount === 0, errorCount, warningCount, findings }
}

/** Builds the `agf lint` CLI command (Commander definition). */
export function lintCommand(): Command {
  log.info('lint command registered')
  const cmd = new Command('lint').description('Run eslint on affected files (graph-aware) or entire project')

  cmd
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--fix', 'Auto-fix lint issues')
    .option('--file <path>', 'Lint a specific file or glob')
    .option('--all', 'Lint entire project (not just changed files)')
    .action(async (opts: { dir: string; fix?: boolean; file?: string; all?: boolean }) => {
      const out = createCliOutput('lint')
      const projectDir = resolve(opts.dir)
      const { command, args, shell } = buildLintInvocation(opts)

      log.info('lint:running', { args })
      // Capture stdout (NOT stdio:'inherit') so eslint's raw text never reaches the
      // terminal ahead of the JSON envelope — that passthrough broke the CLI contract,
      // --select, and `exec chain` JSON parsing. maxBuffer bumped: a full-project lint
      // JSON report can exceed the 1 MB default and would otherwise truncate → parseError.
      const result = spawnSync(command, args, {
        cwd: projectDir,
        encoding: 'utf8',
        shell,
        maxBuffer: 64 * 1024 * 1024,
      })

      if (result.error) {
        log.error('lint:spawn-failed', { message: result.error.message })
        out.fail('LINT_SPAWN_FAILED', `Could not run eslint: ${result.error.message}`, { passed: false })
        return
      }

      const report = parseEslintOutput(result.stdout ?? '')
      if (report.parseError) {
        // eslint crashed before emitting JSON — surface stderr as the diagnostic, keep stdout clean.
        log.error('lint:parse-error', { status: result.status, stderr: (result.stderr ?? '').slice(0, 500) })
        out.fail('LINT_PARSE_ERROR', 'eslint did not produce parseable JSON output', {
          passed: false,
          code: result.status,
          stderr: (result.stderr ?? '').slice(0, 2000),
        })
        return
      }

      if (report.passed) {
        out.ok(report)
      } else {
        log.info('lint:failed', { errorCount: report.errorCount, warningCount: report.warningCount })
        out.fail('LINT_FAILED', `Lint failed: ${report.errorCount} error(s), ${report.warningCount} warning(s)`, report)
      }
    })

  return cmd
}
