/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires core/security/shell-escalation.ts (ShellEscalation) into the CLI — the
 * module had no consuming surface (dormant, harness --dormant flagged it
 * no-surface). Exposes `agf exec-policy check` — evaluates a shell command
 * against the exec approval-escalation policy (engine rules > learned rules >
 * safe/dangerous heuristics > approval policy), reporting
 * Skip/NeedsApproval/Forbidden.
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { ShellEscalation, type ApprovalPolicy } from '../../core/security/shell-escalation.js'
import { ExecPolicyEngine } from '../../core/security/exec-policy-engine.js'

const APPROVAL_POLICIES: readonly ApprovalPolicy[] = ['Never', 'OnFailure', 'OnRequest', 'UnlessTrusted', 'Granular']

/** Builds an ExecPolicyEngine, optionally seeded with rules from a TOML file. */
export function buildEngine(rulesFile?: string): ExecPolicyEngine {
  const engine = new ExecPolicyEngine()
  if (rulesFile) {
    engine.loadFromToml(readFileSync(rulesFile, 'utf-8'))
  }
  return engine
}

/** Builds the `agf exec-policy` CLI command (Commander definition). */
export function execPolicyCommand(): Command {
  const cmd = new Command('exec-policy').description('Shell command approval-escalation utilities (ShellEscalation)')

  cmd
    .command('check')
    .description('Evaluate a shell command against the exec approval-escalation policy')
    .argument('<command...>', 'Shell command to evaluate')
    .option('--cwd <dir>', 'Working directory the command would run in', process.cwd())
    .option('--approval-policy <policy>', `Approval policy: ${APPROVAL_POLICIES.join('|')}`, 'OnRequest')
    .option('--rules <file>', 'TOML file with [[rules]]/[[network_rules]] — defaults to no engine rules')
    .action((commandParts: string[], opts: { cwd: string; approvalPolicy: string; rules?: string }) => {
      const out = createCliOutput('exec-policy check')
      const command = commandParts.join(' ')

      if (!APPROVAL_POLICIES.includes(opts.approvalPolicy as ApprovalPolicy)) {
        out.err('INVALID_APPROVAL_POLICY', `Unknown approval policy: ${opts.approvalPolicy}`)
        return
      }

      let engine: ExecPolicyEngine
      try {
        engine = buildEngine(opts.rules)
      } catch (err) {
        out.err('INVALID_RULES', err instanceof Error ? err.message : String(err))
        return
      }

      const escalation = new ShellEscalation(engine)
      const result = escalation.check(command, opts.approvalPolicy as ApprovalPolicy, opts.cwd)
      out.ok(result)
    })

  return cmd
}
