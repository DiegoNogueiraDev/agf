/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import {
  MODEL_TIERS,
  modelsForTier,
  DEFAULT_MODEL,
  isKnownModel,
  looksExternalModel,
  routeModel,
  resolveTierModel,
  ModelTierSchema,
  TaskKindSchema,
  type ModelTier,
  type RouterConfig,
  type TaskKind,
} from '../../core/model-hub/tier-router.js'
import { casteToModelTier } from '../../core/colony/task-caste.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { routeTierLearned, LEARNED_ROUTING_LEVER } from '../../core/model-hub/learned-router.js'
import { isLeverEnabled, resolveEconomyLeversConfig } from '../../core/economy/economy-levers-config.js'
import { routeTaskType, saveRoutingDecision } from '../../core/model-hub/task-type-router.js'

const log = createLogger({ layer: 'cli', source: 'model-cmd.ts' })

const SETTING_KEY = 'model'

function readConfig(dir: string): RouterConfig {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    const value = store.getProjectSetting(SETTING_KEY) ?? 'auto'
    return value === 'auto' ? { mode: 'auto' } : { mode: 'pinned', modelId: value }
  } finally {
    store.close()
  }
}

/** Builds the `agf model` CLI command (Commander definition). */
export function modelCommand(): Command {
  log.info('model command registered')
  const cmd = new Command('model').description("Seleciona/inspeciona o modelo do tier-router; 'auto' roteia por tarefa")

  cmd
    .command('list')
    .description('Lista o pool agrupado por tier')
    .action(() => {
      const out = createCliOutput('model.list')
      const tiers = MODEL_TIERS.map((tier) => ({
        tier,
        models: modelsForTier(tier).map((m) => ({
          id: m.id,
          label: m.label,
          isDefault: m.id === DEFAULT_MODEL,
        })),
      }))
      out.ok({ mode: 'auto', tiers })
    })

  cmd
    .command('current')
    .description('Mostra o modelo/modo selecionado')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('model.current')
      const config = readConfig(opts.dir)
      out.ok({ mode: config.mode, modelId: config.mode === 'pinned' ? config.modelId : null })
    })

  cmd
    .command('set')
    .description("Fixa um modelo (id do pool) ou 'auto' para roteamento por tarefa")
    .argument('<idOrAuto>', "ID do modelo ou 'auto'")
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((idOrAuto: string, opts: { dir: string }) => {
      const out = createCliOutput('model.set')
      const value = idOrAuto.trim()
      if (value !== 'auto' && !isKnownModel(value) && !looksExternalModel(value)) {
        out.err('UNKNOWN_MODEL', `Modelo desconhecido: "${value}". Rode 'model list' para ver o pool.`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        store.setProjectSetting(SETTING_KEY, value)
        out.ok({ mode: value === 'auto' ? 'auto' : 'pinned', modelId: value === 'auto' ? null : value })
      } finally {
        store.close()
      }
    })

  cmd
    .command('route')
    .description('Mostra qual modelo o router escolhe para um tipo de tarefa ou tier')
    .argument('[kind]', `Tipo ou tier: ${[...TaskKindSchema.options, ...ModelTierSchema.options].join('|')}`)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--explain', 'Inclui o detalhamento por braço (arms) da decisão aprendida', false)
    .option(
      '--task-type <type>',
      'Task type for structured routing (returns recommended_model, confidence, estimated_cost)',
    )
    .action((kind: string | undefined, opts: { dir: string; explain?: boolean; taskType?: string }) => {
      // --task-type flag: structured routing recommendation
      if (opts.taskType) {
        const out = createCliOutput('model.route')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const result = routeTaskType(store.getDb(), opts.taskType)
          saveRoutingDecision(store.getDb(), {
            taskType: opts.taskType,
            modelSelected: result.recommended_model,
            confidence: result.confidence,
            actualCost: 0,
          })
          out.ok({ task_type: opts.taskType, ...result })
        } finally {
          store.close()
        }
        return
      }
      if (!kind) {
        const out = createCliOutput('model.route')
        out.err('MISSING_ARG', 'Provide <kind> or --task-type <type>')
        return
      }
      const out = createCliOutput('model.route')

      // Accept caste:<name> notation (minima/pequena/media/soldado)
      if (kind.startsWith('caste:')) {
        const casteName = kind.slice(6) as 'minima' | 'pequena' | 'media' | 'soldado'
        const validCastes = ['minima', 'pequena', 'media', 'soldado']
        if (!validCastes.includes(casteName)) {
          out.err('INVALID_CASTE', `Casta inválida: "${casteName}". Esperado: ${validCastes.join('|')}.`)
          return
        }
        const tier = casteToModelTier(casteName)
        const config = readConfig(opts.dir)
        const model = config.mode === 'pinned' ? config.modelId : resolveTierModel(tier)
        out.ok({ kind, caste: casteName, tier, model })
        return
      }

      // Accept tier names directly (cheap/build/frontier) → resolve via resolveTierModel
      const tierParsed = ModelTierSchema.safeParse(kind)
      if (tierParsed.success) {
        const config = readConfig(opts.dir)
        const model = config.mode === 'pinned' ? config.modelId : resolveTierModel(tierParsed.data as ModelTier)
        out.ok({ kind, tier: tierParsed.data, model })
        return
      }
      // Accept task kind names (classify/status/implement/review/plan)
      const kindParsed = TaskKindSchema.safeParse(kind)
      if (!kindParsed.success) {
        const valid = [...TaskKindSchema.options, ...ModelTierSchema.options, 'caste:<name>']
        out.err('INVALID_KIND', `Tipo inválido: "${kind}". Esperado: ${valid.join(', ')}.`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const value = store.getProjectSetting(SETTING_KEY) ?? 'auto'
        const config: RouterConfig = value === 'auto' ? { mode: 'auto' } : { mode: 'pinned', modelId: value }
        const taskKind = kindParsed.data as TaskKind

        // Lever OFF ⇒ byte-identical legacy contract: { kind, model }.
        if (!isLeverEnabled(resolveEconomyLeversConfig(store), LEARNED_ROUTING_LEVER)) {
          out.ok({ kind, model: routeModel(config, taskKind) })
          return
        }

        // Lever ON ⇒ surface both the heuristic and the learned recommendation.
        const r = routeTierLearned({ db: store.getDb(), leversSource: store, routerConfig: config }, { kind: taskKind })
        out.ok({
          kind,
          model: r.model,
          heuristic: r.heuristicTier,
          learned: r.tier,
          source: r.source,
          ...(opts.explain && r.recommendation ? { arms: r.recommendation.arms, reason: r.recommendation.reason } : {}),
        })
      } finally {
        store.close()
      }
    })

  return cmd
}
