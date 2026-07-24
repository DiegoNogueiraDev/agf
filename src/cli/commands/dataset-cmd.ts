/*!
 * dataset-cmd — agf dataset CLI command.
 *
 * WHY: Exposes DatasetStore (dataset-store.ts) — persistent eval datasets
 * built from manual entries, real execution traces (execution_traces), or
 * real decision logs (decision_log). Complements agf eval's file-based
 * scenario suite with datasets captured from actual runtime activity.
 *
 * Composes with: dataset-store.ts (core, real eval_datasets/eval_dataset_entries tables).
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { DatasetStore } from '../../core/observability/dataset-store.js'
import { ExperimentRunner } from '../../core/observability/experiment-runner.js'
import { createLogger } from '../../core/utils/logger.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'dataset-cmd.ts' })

/** Builds the `agf dataset` CLI command (Commander definition). */
export function datasetCommand(): Command {
  log.info('dataset command registered')
  const cmd = new Command('dataset')
    .description('Datasets persistentes para avaliação — manuais, de traces reais, ou de decision logs')
    .enablePositionalOptions()

  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  dirOpt(cmd.command('create <name> <source>').description('Cria um dataset vazio')).action(
    (name: string, source: string, opts: { dir: string }) => {
      const out = createCliOutput('dataset.create')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const id = new DatasetStore(store.getDb()).createDataset(name, source)
        out.ok({ id })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(
    cmd
      .command('capture-traces <name> <traceIds...>')
      .description('Cria um dataset a partir de execution_traces existentes'),
  ).action((name: string, traceIds: string[], opts: { dir: string }) => {
    const out = createCliOutput('dataset.capture-traces')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const datasetStore = new DatasetStore(store.getDb())
      const id = datasetStore.captureFromTraces(name, traceIds)
      out.ok({ id, entryCount: datasetStore.getEntryCount(id) })
    } finally {
      store.close()
    }
  })

  dirOpt(cmd.command('capture-decisions <name>').description('Cria um dataset a partir de todo o decision_log')).action(
    (name: string, opts: { dir: string }) => {
      const out = createCliOutput('dataset.capture-decisions')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const datasetStore = new DatasetStore(store.getDb())
        const id = datasetStore.captureFromDecisions(name, store.getDb())
        out.ok({ id, entryCount: datasetStore.getEntryCount(id) })
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('show <datasetId>').description('Mostra um dataset + suas entradas')).action(
    (datasetId: string, opts: { dir: string }) => {
      const out = createCliOutput('dataset.show')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const datasetStore = new DatasetStore(store.getDb())
        const dataset = datasetStore.getDataset(datasetId)
        if (!dataset) {
          out.err('NOT_FOUND', `Dataset não encontrado: ${datasetId}`)
          return
        }
        out.ok({ dataset, entries: datasetStore.getEntries(datasetId) })
      } catch (e) {
        out.err('SHOW_FAILED', getErrorMessage(e))
      } finally {
        store.close()
      }
    },
  )

  const experimentCmd = cmd
    .command('experiment')
    .description('Experimentos de hypothesis testing sobre datasets (Fisher 1925 / Neyman-Pearson 1933)')

  dirOpt(
    experimentCmd
      .command('run <name> <datasetId>')
      .description('Cria e executa um experimento imediatamente (targetFn default: identity)')
      .requiredOption('--evaluators <list>', 'Avaliadores (CSV, ex: exact_match)'),
  ).action((name: string, datasetId: string, opts: { dir: string; evaluators: string }) => {
    const out = createCliOutput('dataset.experiment.run')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const runner = new ExperimentRunner(store.getDb())
      const evaluators = opts.evaluators.split(',').map((e) => e.trim())
      const experimentId = runner.createExperiment(name, datasetId, { evaluators })
      const summary = runner.runExperiment(experimentId)
      out.ok({ experimentId, summary })
    } finally {
      store.close()
    }
  })

  dirOpt(experimentCmd.command('show <experimentId>').description('Mostra um experimento por ID')).action(
    (experimentId: string, opts: { dir: string }) => {
      const out = createCliOutput('dataset.experiment.show')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const experiment = new ExperimentRunner(store.getDb()).getExperiment(experimentId)
        if (!experiment) {
          out.err('NOT_FOUND', `Experimento não encontrado: ${experimentId}`)
          return
        }
        out.ok(experiment)
      } finally {
        store.close()
      }
    },
  )

  dirOpt(
    experimentCmd.command('compare <experimentId1> <experimentId2>').description('Compara dois experimentos'),
  ).action((experimentId1: string, experimentId2: string, opts: { dir: string }) => {
    const out = createCliOutput('dataset.experiment.compare')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const comparison = new ExperimentRunner(store.getDb()).compareExperiments(experimentId1, experimentId2)
      if (!comparison) {
        out.err('NOT_FOUND', 'Um ou ambos experimentos não encontrados, ou ainda sem summary')
        return
      }
      out.ok(comparison)
    } finally {
      store.close()
    }
  })

  return cmd
}
