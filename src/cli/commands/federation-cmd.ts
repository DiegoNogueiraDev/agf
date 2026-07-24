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
import {
  exportLearning,
  importLearning,
  LearningBundleVersionError,
  type LearningBundle,
} from '../../core/knowledge/knowledge-packager.js'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import Database from 'better-sqlite3'
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

  // ── Aprendizado operacional (node_a67e514c6399 — B3 da federação) ─────────
  // ≠ tick (knowledge docs): estes portam o que a colônia APRENDEU FAZENDO
  // (pheromones/outcomes/decisões) via export/importLearning do packager.

  dirOpt(
    cmd
      .command('export-learning')
      .description('Exporta o bundle de aprendizado operacional (pheromones+outcomes+decisões)')
      .option('--out <file>', 'Grava o bundle em arquivo (senão emite no envelope)'),
  ).action((opts: { dir: string; out?: string }) => {
    const out = createCliOutput('federation.export-learning')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const projectId = store.getProject()?.id ?? 'default'
      const bundle = exportLearning(store.getDb(), projectId)
      if (opts.out) {
        writeFileSync(resolve(opts.out), JSON.stringify(bundle, null, 2), 'utf8')
        out.ok({
          out: resolve(opts.out),
          counts: {
            pheromones: bundle.pheromones.length,
            episodicOutcomes: bundle.episodicOutcomes.length,
            decisions: bundle.decisions.length,
          },
        })
      } else {
        out.ok({ bundle })
      }
    } finally {
      store.close()
    }
  })

  dirOpt(
    cmd
      .command('learn')
      .description('Importa aprendizado operacional de um bundle.json ou do dir de outro projeto agf')
      .requiredOption('--from <path>', 'bundle.json exportado OU diretório de projeto agf')
      .option('--tags <tags...>', 'Filtra por tag (anti-poluição cross-domínio)')
      .option('--source-weight <n>', 'Peso da fonte no merge (0..1]', '0.5'),
  ).action((opts: { dir: string; from: string; tags?: string[]; sourceWeight: string }) => {
    const out = createCliOutput('federation.learn')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const fromPath = resolve(opts.from)
      let bundle: LearningBundle
      if (existsSync(fromPath) && statSync(fromPath).isDirectory()) {
        // Dir de projeto agf: exporta direto do graph.db do peer (read-only).
        const peerDb = join(fromPath, 'workflow-graph', 'graph.db')
        if (!existsSync(peerDb)) {
          out.fail('LEARN_SOURCE_NOT_FOUND', `Nenhum projeto agf em ${fromPath} (graph.db ausente)`, {})
          return
        }
        const peer = new Database(peerDb, { readonly: true })
        try {
          // O project_id real vive no db do peer — basename(dir) seria um palpite.
          const peerProject = (peer.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string } | undefined)?.id
          bundle = exportLearning(peer, peerProject ?? basename(fromPath))
        } finally {
          peer.close()
        }
      } else if (existsSync(fromPath)) {
        bundle = JSON.parse(readFileSync(fromPath, 'utf8')) as LearningBundle
      } else {
        out.fail('LEARN_SOURCE_NOT_FOUND', `--from não encontrado: ${fromPath}`, {})
        return
      }

      const projectId = store.getProject()?.id ?? 'default'
      try {
        const imported = importLearning(store.getDb(), projectId, bundle, {
          tags: opts.tags,
          sourceWeight: Number.parseFloat(opts.sourceWeight) || undefined,
        })
        out.ok({ sourceProject: bundle.sourceProject, imported })
      } catch (err) {
        if (err instanceof LearningBundleVersionError) {
          out.fail('LEARN_BUNDLE_VERSION', err.message, {})
          return
        }
        throw err
      }
    } finally {
      store.close()
    }
  })

  return cmd
}
