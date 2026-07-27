/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * ant-swarming — 2º binário orquestrador (walking skeleton), lógica testável.
 *
 * PORQUÊ: o orquestrador de formigas é instalável separadamente do agf
 * (fallback por ausência do agf) mas vive no MESMO repo e reusa 100% do core —
 * NUNCA recriar lógica que já existe em src/core. Esta camada é fina: espelha a
 * estrutura de src/cli/index.ts (bootstrap + envelope), sem business logic.
 *
 * CONTRATO DE ISOLAMENTO (enforced por src/tests/swarming-entrypoint.test.ts):
 * importa SÓ de src/core, src/schemas e do entrypoint público src/index.ts.
 * NUNCA de ../cli ou ../tui. A saída é SEMPRE o envelope-padrão {ok,data,meta}
 * emitido via core/output/writer (mesma fonte única que o agf CLI usa).
 */
import { Command } from 'commander'
import { VERSION } from '../index.js'
import { writeEnvelope } from '../core/output/writer.js'
import { swarmingHandshakeSchema, type SwarmingHandshake } from '../schemas/swarming-handshake.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { runSpawn } from './spawn.js'
import { AntProvisionError } from '../core/swarm/worktree-provision.js'
import { buildDoctorReport, listProvidersReport, useProvider } from './providers.js'
import { detectLlmAvailability, type LlmAvailability } from '../core/model-hub/llm-availability.js'
import { findNextTask } from '../core/planner/next-task.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { runColony, type RunColonyDeps, type RunColonyResult } from './run.js'
import { makeLlm } from './provider-llm-adapter.js'
import type { AntLlmPort } from './ant-runner.js'

export const SWARMING_NAME = 'ant-swarming'

/** Capacidades anunciadas no handshake (walking skeleton: só o próprio handshake). */
const SWARMING_CAPABILITIES = ['handshake', 'spawn', 'doctor', 'providers', 'run'] as const

/**
 * Monta o contrato de handshake (validado pela MESMA fonte única que o consumidor
 * detectSwarmingCli usa — schemas/swarming-handshake). Garante que produtor e
 * consumidor nunca divirjam no formato.
 */
function buildHandshake(): SwarmingHandshake {
  return swarmingHandshakeSchema.parse({
    name: SWARMING_NAME,
    version: VERSION,
    capabilities: [...SWARMING_CAPABILITIES],
  })
}

/**
 * Emite o envelope-padrão {ok:true,data,meta}. Reusa o MESMO writer do core que
 * `createCliOutput` do agf embrulha — a fonte única de saída, sem depender de
 * src/cli (que o isolamento de camada proíbe).
 */
function emitOk(data: unknown, startedAtMs: number): void {
  writeEnvelope({ ok: true, data, meta: { command: SWARMING_NAME, ms: Date.now() - startedAtMs } })
}

/** Emite o envelope de erro {ok:false,code,error,meta}. */
function emitErr(code: string, error: string, startedAtMs: number): void {
  writeEnvelope({ ok: false, code, error, meta: { command: SWARMING_NAME, ms: Date.now() - startedAtMs } })
  process.exitCode = 1
}

/** Constrói o Command do orquestrador com os subcomandos da colônia. */
/** Envelope de saída do `run` — live (resultado real) ou delegated (plano p/ a CLI-agente). */
export interface RunCommandOutcome {
  mode: 'live' | 'delegated'
  reason?: string
  provider: LlmAvailability
  colony: { hasQueue: boolean; ants: number; budgetTokens: number }
  result?: RunColonyResult
  nextSteps?: string[]
}

export interface RunCommandDeps {
  store: SqliteStore
  ants: number
  budgetTokens: number
  /** Seams injetáveis p/ teste (default: detecção/colônia/adapter reais). */
  detect?: () => LlmAvailability
  colony?: (deps: RunColonyDeps) => Promise<RunColonyResult>
  llmFactory?: (store: SqliteStore) => AntLlmPort
}

/**
 * Núcleo testável do `ant-swarming run` (node_c88541cf4a2d): provider
 * disponível ⇒ runColony async com makeLlm (execução real, atribuição no
 * ledger); ausente ⇒ envelope delegated BYTE-IDÊNTICO ao histórico; caminho
 * live que lança ⇒ degrada para delegated com o erro (nunca crash).
 */
export async function executeRunCommand(deps: RunCommandDeps): Promise<RunCommandOutcome> {
  const detect =
    deps.detect ??
    (() => detectLlmAvailability({ providerSetting: deps.store.getProjectSetting('provider') ?? undefined }))
  const availability = detect()
  const hasQueue = Boolean(findNextTask(deps.store.toGraphDocument()))
  const colonyInfo = { hasQueue, ants: deps.ants, budgetTokens: deps.budgetTokens }

  const delegated = (reason: string): RunCommandOutcome => ({
    mode: 'delegated',
    reason,
    provider: availability,
    colony: colonyInfo,
    nextSteps: [
      'Conecte um provider (ant-swarming providers use <id>) OU dirija a colônia com seu próprio LLM.',
      'Feche cada task pelo fluxo do agf: agf next → agf brief <id> → agf submit <id> --result <json>.',
    ],
  })

  if (!availability.available) {
    return delegated('Nenhum provider conectado — delegando à CLI-agente que dirige (modo any-CLI).')
  }

  const runColonyFn = deps.colony ?? runColony
  const llmFactory = deps.llmFactory ?? ((store: SqliteStore) => makeLlm({ store }))
  try {
    const result = await runColonyFn({
      store: deps.store,
      makeLlm: () => llmFactory(deps.store),
      budget: createBudgetGuard(deps.budgetTokens > 0 ? deps.budgetTokens : undefined),
      ants: deps.ants,
    })
    return { mode: 'live', provider: availability, colony: colonyInfo, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return delegated(`Caminho live falhou (${message}) — delegando à CLI-agente.`)
  }
}

export function buildProgram(): Command {
  const program = new Command()
  program.name(SWARMING_NAME).description('Orquestrador local de formigas (swarming) — reusa 100% do core do agf')

  program
    .command('spawn')
    .description('Provisiona N formigas (N worktrees) e registra cada uma na sessão swarm')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-n, --ants <n>', 'Nº de formigas a provisionar', '1')
    .option('--base <id>', 'Prefixo dos ids gerados (<base>-1, <base>-2, …)', 'ant')
    .action((opts: { dir: string; ants: string; base: string }) => {
      const startedAtMs = Date.now()
      const ants = Number.parseInt(opts.ants, 10)
      if (!Number.isInteger(ants) || ants < 1) {
        emitErr('INVALID_ANTS', `--ants deve ser um inteiro >= 1 (recebido: "${opts.ants}")`, startedAtMs)
        return
      }
      const store = SqliteStore.open(opts.dir)
      try {
        const result = runSpawn({ db: store.getDb(), dir: opts.dir, ants, baseId: opts.base })
        emitOk(result, startedAtMs)
      } catch (err) {
        if (err instanceof AntProvisionError) emitErr(err.code, err.message, startedAtMs)
        else emitErr('SPAWN_FAILED', err instanceof Error ? err.message : String(err), startedAtMs)
      } finally {
        store.close()
      }
    })

  // Diagnóstico de providers: detectados + casta→tier→model + env vars aceitas.
  // É diagnóstico, não falha — sempre {ok:true}, exit 0 (mesmo sem nenhum provider).
  program
    .command('doctor')
    .description('Diagnostica providers detectados, o mapeamento casta→tier→model e as env vars aceitas')
    .action(() => {
      const startedAtMs = Date.now()
      emitOk(buildDoctorReport(process.env), startedAtMs)
    })

  const providers = program
    .command('providers')
    .description('Config de provider da formiga — list/use/current (mesma fonte única que `agf provider`)')

  providers
    .command('list')
    .description('Lista os providers do registry com o flag de detecção por env var')
    .action(() => emitOk(listProvidersReport(process.env), Date.now()))

  providers
    .command('current')
    .description('Mostra o provider ativo (lido do project_settings compartilhado)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const startedAtMs = Date.now()
      const store = SqliteStore.open(opts.dir)
      try {
        emitOk({ provider: store.getProjectSetting('provider') }, startedAtMs)
      } finally {
        store.close()
      }
    })

  providers
    .command('use <id>')
    .description('Escolhe o provider ativo — persiste no MESMO project_settings que o agf lê')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const startedAtMs = Date.now()
      const store = SqliteStore.open(opts.dir)
      try {
        emitOk(useProvider(store, id), startedAtMs)
      } finally {
        store.close()
      }
    })

  // `run` dirige a colônia. Provider disponível ⇒ executa LIVE (runColony async
  // com o adapter makeLlm — node_c88541cf4a2d); ausente ⇒ delegate-first: NÃO
  // quebra, devolve mode:delegated byte-idêntico para a CLI-agente executar.
  // Caminho async que lança degrada para delegated (nunca crash do processo).
  program
    .command('run')
    .description('Dirige a colônia pela fila (budget global, sweep de leases) — para quando a fila seca')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-n, --ants <n>', 'Nº de formigas', '2')
    .option('--budget <tokens>', 'Teto global de tokens (0 = ilimitado)', '0')
    .action(async (opts: { dir: string; ants: string; budget: string }) => {
      const startedAtMs = Date.now()
      const store = SqliteStore.open(opts.dir)
      try {
        const outcome = await executeRunCommand({
          store,
          ants: Number.parseInt(opts.ants, 10) || 2,
          budgetTokens: Number.parseInt(opts.budget, 10) || 0,
        })
        emitOk(outcome, startedAtMs)
      } finally {
        store.close()
      }
    })

  return program
}

/**
 * Runner testável do entrypoint. `--version`/`-v` é interceptado ANTES do
 * commander: o handler default do commander imprimiria a versão como texto cru,
 * quebrando o contrato de envelope {ok,data,meta}. Sem args, o walking skeleton
 * devolve a identidade do binário no mesmo envelope.
 */
export async function runSwarming(argv: readonly string[]): Promise<void> {
  const startedAtMs = Date.now()
  const args = argv.slice(2)

  if (args.includes('--version') || args.includes('-v')) {
    emitOk({ version: VERSION }, startedAtMs)
    return
  }

  // Contraparte do detectSwarmingCli (src/cli/shared/delegation.ts): o agf executa
  // `ant-swarming handshake` e valida o `.data` deste envelope pelo contrato Zod.
  if (args[0] === 'handshake') {
    emitOk(buildHandshake(), startedAtMs)
    return
  }

  if (args.length === 0) {
    emitOk({ name: SWARMING_NAME, version: VERSION, status: 'walking-skeleton' }, startedAtMs)
    return
  }

  await buildProgram().parseAsync([...argv])
}
