/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires core/security/permissions-gate.ts (PermissionsGate) into the CLI — the
 * module had no consuming surface (dormant, harness --dormant flagged it
 * no-surface). Exposes a standalone `agf sandbox-gate check` diagnostic that
 * evaluates a shell command against a filesystem/network sandbox policy.
 * Named `sandbox-gate` — `permissions` is already the project ACL command
 * (PermissionStore) and `sandbox` is already the Wave-12 build-isolation
 * command; this is a third, distinct concept (PermissionsGate.check).
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { z } from 'zod/v4'
import { createCliOutput } from '../shared/cli-output.js'
import { PermissionsGate } from '../../core/security/permissions-gate.js'
import { FileSystemSandboxPolicySchema, NetworkSandboxPolicySchema } from '../../schemas/permissions.schema.js'
import type { FileSystemSandboxPolicy, NetworkSandboxPolicy } from '../../schemas/permissions.schema.js'

const PolicyFileSchema = z.object({
  fs: FileSystemSandboxPolicySchema,
  network: NetworkSandboxPolicySchema,
})

export interface ResolvedPolicy {
  fs: FileSystemSandboxPolicy
  network: NetworkSandboxPolicy
}

/** Fully permissive policy used when no --policy file is given. */
export function defaultPolicy(): ResolvedPolicy {
  return {
    fs: { kind: 'Unrestricted', entries: [] },
    network: { kind: 'Enabled', domains: {}, unixSockets: {} },
  }
}

/** Parse and validate a policy file's raw JSON contents into a ResolvedPolicy. */
export function parsePolicy(raw: unknown): ResolvedPolicy {
  return PolicyFileSchema.parse(raw)
}

/** Builds the `agf sandbox-gate` CLI command (Commander definition). */
export function sandboxGateCommand(): Command {
  const cmd = new Command('sandbox-gate').description(
    'Filesystem/network sandbox permission utilities (PermissionsGate)',
  )

  cmd
    .command('check')
    .description('Evaluate a shell command against a filesystem/network sandbox policy')
    .argument('<command...>', 'Shell command to evaluate')
    .option('--cwd <dir>', 'Working directory the command would run in', process.cwd())
    .option('--policy <file>', 'JSON file with a { fs, network } sandbox policy — defaults to fully permissive')
    .action((commandParts: string[], opts: { cwd: string; policy?: string }) => {
      const out = createCliOutput('sandbox-gate check')
      const command = commandParts.join(' ')

      let policy: ResolvedPolicy
      try {
        policy = opts.policy ? parsePolicy(JSON.parse(readFileSync(opts.policy, 'utf-8'))) : defaultPolicy()
      } catch (err) {
        out.err('INVALID_POLICY', err instanceof Error ? err.message : String(err))
        return
      }

      const gate = new PermissionsGate(policy.fs, policy.network)
      const result = gate.check({ command, cwd: opts.cwd })
      out.ok(result)
    })

  return cmd
}
