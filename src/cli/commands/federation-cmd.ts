/*!
 * federation-cmd — agf federation CLI command.
 *
 * WHY: Exposes federation-config.ts's peer registry (add/remove/list/enable)
 * plus a `tick` that pulls knowledge from every enabled peer via
 * learnFromProject (agf knowledge-learn's own primitive). federation-tick.ts
 * was referenced by federation-config.ts's docblock but never built — this
 * command IS that missing consumer, reusing the now-wired learnFromProject.
 *
 * Composes with: federation-config.ts + cross-project-learner.ts (core),
 * knowledge-learn-cmd.ts (sibling, same underlying primitive).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import {
  getFederationPeers,
  addFederationPeer,
  removeFederationPeer,
  setPeerEnabled,
} from '../../core/knowledge/federation-config.js'
import { learnFromProject } from '../../core/knowledge/cross-project-learner.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'federation-cmd.ts' })

/** Builds the `agf federation` CLI command (Commander definition). */
export function federationCommand(): Command {
  log.info('federation command registered')
  const cmd = new Command('federation')
    .description('Federação de conhecimento entre projetos (peer registry + tick)')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(cmd.command('list').description('Lista peers registrados')).action((opts: { dir: string }) => {
    const out = createCliOutput('federation.list')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      out.ok({ peers: getFederationPeers(store) })
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('add-peer <projectName> <graphDbPath>')
      .description('Registra (ou atualiza) um peer')
      .option('--categories <list>', 'Categorias a importar (CSV)')
      .option('--disabled', 'Registra desabilitado (não roda em tick)', false),
  ).action(
    (projectName: string, graphDbPath: string, opts: { dir: string; categories?: string; disabled: boolean }) => {
      const out = createCliOutput('federation.add-peer')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        addFederationPeer(store, {
          projectName,
          graphDbPath,
          categories: opts.categories?.split(',').map((c) => c.trim()),
          enabled: !opts.disabled,
        })
        out.ok({ peers: getFederationPeers(store) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('remove-peer <projectName>').description('Remove um peer')).action(
    (projectName: string, opts: { dir: string }) => {
      const out = createCliOutput('federation.remove-peer')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        removeFederationPeer(store, projectName)
        out.ok({ peers: getFederationPeers(store) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('enable <projectName>').description('Habilita um peer (roda no próximo tick)')).action(
    (projectName: string, opts: { dir: string }) => {
      const out = createCliOutput('federation.enable')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        setPeerEnabled(store, projectName, true)
        out.ok({ peers: getFederationPeers(store) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('disable <projectName>').description('Desabilita um peer (pula no próximo tick)')).action(
    (projectName: string, opts: { dir: string }) => {
      const out = createCliOutput('federation.disable')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        setPeerEnabled(store, projectName, false)
        out.ok({ peers: getFederationPeers(store) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('tick').description('Pull knowledge de todos os peers habilitados via learnFromProject')).action(
    async (opts: { dir: string }) => {
      const out = createCliOutput('federation.tick')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const peers = getFederationPeers(store).filter((p) => p.enabled)
        const results = []
        for (const peer of peers) {
          const result = await learnFromProject(store.getDb(), opts.dir, peer.graphDbPath, {
            categories: peer.categories,
          })
          results.push({ projectName: peer.projectName, ...result })
        }
        out.ok({ peersProcessed: results.length, results })
      } finally {
        store.close()
      }
    },
  )

  return cmd
}
