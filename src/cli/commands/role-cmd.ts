/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { registerAgentRole, getAgentRole, type AgentRole } from '../../core/harness/agent-role.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'role-cmd.ts' })
const VALID_ROLES: AgentRole[] = ['implementor', 'reviewer', 'validator']

/** Builds the `agf role` CLI command (Commander definition). */
export function roleCommand(): Command {
  log.info('role command registered')
  const cmd = new Command('role').description(
    'Register or inspect which agent role (implementor/reviewer/validator) is assigned to a task',
  )

  cmd
    .command('set')
    .description('Register an agent role for a task')
    .argument('<taskId>', 'Task node ID')
    .argument('<role>', `Role: ${VALID_ROLES.join(' | ')}`)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((taskId: string, role: string, opts: { dir: string }) => {
      const out = createCliOutput('role.set')
      if (!VALID_ROLES.includes(role as AgentRole)) {
        out.err('INVALID_ROLE', `Role inválida: "${role}". Use uma de ${VALID_ROLES.join(', ')}.`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(taskId)
        if (!node) {
          out.err('NOT_FOUND', `Task não encontrada: ${taskId}`)
          return
        }
        const result = registerAgentRole(store, role as AgentRole, taskId)
        out.ok(result)
      } finally {
        store.close()
      }
    })

  cmd
    .command('get')
    .description('Get the registered agent role for a task')
    .argument('<taskId>', 'Task node ID')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((taskId: string, opts: { dir: string }) => {
      const out = createCliOutput('role.get')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const stored = getAgentRole(store, taskId)
        out.ok({ taskId, role: stored?.role ?? null, registeredAt: stored?.registeredAt ?? null })
      } finally {
        store.close()
      }
    })

  return cmd
}
