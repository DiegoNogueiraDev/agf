/*!
 * permissions-cmd — agf permissions CLI command.
 *
 * WHY: Exposes PermissionStore (core/permissions/permission-store.ts) — a
 * per-project action/resource ACL (allow/deny/ask), same pattern as
 * quality-policy-cmd.ts's dir + store.getDb() wiring.
 *
 * Composes with: permission-store.ts (core, real permissions table).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createPermissionStore, type PermissionRow } from '../../core/permissions/permission-store.js'
import { evaluateRuleset } from '../../core/permissions/ruleset.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'permissions-cmd.ts' })

const EFFECTS: PermissionRow['effect'][] = ['allow', 'deny', 'ask']

function isEffect(value: string): value is PermissionRow['effect'] {
  return (EFFECTS as string[]).includes(value)
}

interface RuleOpts {
  dir: string
  project: string
  action: string
  resource: string
}

/** Builds the `agf permissions` CLI command (Commander definition). */
export function permissionsCommand(): Command {
  log.info('permissions command registered')
  const cmd = new Command('permissions')
    .description('ACL de projeto (allow/deny/ask) por ação/recurso — PermissionStore')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(
    cmd
      .command('set')
      .description('Define (ou atualiza) uma regra de permissão')
      .requiredOption('--project <projectId>', 'ID do projeto')
      .requiredOption('--action <action>', 'Ação (ex: bash, write)')
      .requiredOption('--resource <resource>', 'Recurso (ex: rm -rf *, /etc/passwd)')
      .requiredOption('--effect <effect>', 'allow | deny | ask'),
  ).action((opts: RuleOpts & { effect: string }) => {
    const out = createCliOutput('permissions.set')
    if (!isEffect(opts.effect)) {
      out.err('INVALID_EFFECT', `--effect deve ser um de: ${EFFECTS.join(', ')}`)
      return
    }
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const permissionStore = createPermissionStore(store.getDb())
      permissionStore.save({
        projectId: opts.project,
        action: opts.action,
        resource: opts.resource,
        effect: opts.effect,
      })
      out.ok({ projectId: opts.project, action: opts.action, resource: opts.resource, effect: opts.effect })
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('list')
      .description('Lista as regras de permissão de um projeto')
      .requiredOption('--project <projectId>', 'ID do projeto'),
  ).action((opts: { dir: string; project: string }) => {
    const out = createCliOutput('permissions.list')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const permissionStore = createPermissionStore(store.getDb())
      const rules = permissionStore
        .list(opts.project)
        .map(({ action, resource, effect }) => ({ action, resource, effect }))
      out.ok({ rules })
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('check')
      .description('Verifica se existe uma regra para ação/recurso')
      .requiredOption('--project <projectId>', 'ID do projeto')
      .requiredOption('--action <action>', 'Ação')
      .requiredOption('--resource <resource>', 'Recurso'),
  ).action((opts: RuleOpts) => {
    const out = createCliOutput('permissions.check')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const permissionStore = createPermissionStore(store.getDb())
      const rules = permissionStore.list(opts.project)
      const effect = evaluateRuleset(rules, opts.action, opts.resource)
      out.ok({ allowed: effect === 'allow', effect })
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('delete')
      .description('Remove uma regra de permissão')
      .requiredOption('--project <projectId>', 'ID do projeto')
      .requiredOption('--action <action>', 'Ação')
      .requiredOption('--resource <resource>', 'Recurso'),
  ).action((opts: RuleOpts) => {
    const out = createCliOutput('permissions.delete')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const permissionStore = createPermissionStore(store.getDb())
      permissionStore.delete(opts.project, opts.action, opts.resource)
      out.ok({ projectId: opts.project, action: opts.action, resource: opts.resource, deleted: true })
    } finally {
      store.close()
    }
  })

  return cmd
}
