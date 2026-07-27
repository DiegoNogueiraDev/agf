/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * hook-runtime — bootstrap de produção do HookBus.
 *
 * Antes deste módulo o HookBus nunca era instanciado em produção: todo o sistema
 * de hooks (`src/core/hooks/`) estava dormente. Aqui ligamos o barramento por
 * store (memoizado), registramos os handlers built-in e o handler de
 * PERSISTÊNCIA de learning, e disparamos os hooks de lifecycle.
 *
 * Always-on com kill-switch: `MCP_GRAPH_HOOKS_DISABLED=true` ou `AGF_HOOKS=0`
 * desligam todos os handlers (emits viram no-op seguro).
 */
import { GraphEventBus } from '../events/event-bus.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { HookBus } from './hook-bus.js'
import type { HookChannel } from './hook-types.js'
import { SqliteLearningStore } from '../learning/sqlite-learning-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'hook-runtime.ts' })

const busByStore = new WeakMap<SqliteStore, HookBus>()
/** Promessas de emits async em voo, por store — para draining antes de close(). */
const pendingByStore = new WeakMap<SqliteStore, Set<Promise<void>>>()

/** True quando os hooks estão desligados por env (kill-switch). */
export function hooksDisabled(): boolean {
  return process.env.MCP_GRAPH_HOOKS_DISABLED === 'true' || process.env.AGF_HOOKS === '0'
}

/**
 * Handler de persistência de learning. task:post-complete → record de sucesso;
 * task:error → record de falha. Escrita síncrona (better-sqlite3) garante flush.
 */
function registerLearningPersistence(bus: HookBus, store: SqliteStore): void {
  const toRecord = (payload: Record<string, unknown>, acPassed: boolean): void => {
    const nodeId = typeof payload['nodeId'] === 'string' ? (payload['nodeId'] as string) : ''
    if (!nodeId) return
    const learning = new SqliteLearningStore(store)
    learning.appendRecord({
      agentId: store.getProjectSetting('model') ?? 'auto',
      nodeId,
      harnessDelta: typeof payload['harnessDelta'] === 'number' ? (payload['harnessDelta'] as number) : 0,
      acPassed,
      cycleTimeMs: typeof payload['durationMs'] === 'number' ? (payload['durationMs'] as number) : 0,
      ts: Date.now(),
    })
  }

  bus.on('task:post-complete', async (event) => {
    toRecord(event.payload, true)
  })
  bus.on('task:error', async (event) => {
    toRecord(event.payload, false)
  })
}

/**
 * Handler async do acoplador determinístico. Em `scaffold:requested`, gera scaffold
 * determinístico (0 LLM) e persiste. Import dinâmico evita ciclo de módulos.
 */
function registerScaffoldCoupler(bus: HookBus, store: SqliteStore): void {
  bus.on('scaffold:requested', async (event) => {
    const nodeId = typeof event.payload['nodeId'] === 'string' ? (event.payload['nodeId'] as string) : ''
    if (!nodeId) return
    const node = store.getNodeById(nodeId)
    if (!node) return
    const apply = event.payload['apply'] === true
    const workspaceDir =
      typeof event.payload['workspaceDir'] === 'string' ? (event.payload['workspaceDir'] as string) : process.cwd()
    const { coupleNode } = await import('../scaffolder/couple.js')
    await coupleNode(
      store,
      {
        id: node.id,
        title: node.title,
        description: node.description,
        tags: node.tags,
        acceptanceCriteria: node.acceptanceCriteria,
        metadata: node.metadata,
      },
      { apply, workspaceDir },
    )
  })
}

/**
 * Retorna o HookBus de produção para um store (memoizado). Na 1ª chamada liga
 * builtin handlers + persistência de learning. Com kill-switch ativo retorna um
 * bus sem handlers (emits no-op).
 */
export function getHookBus(store: SqliteStore): HookBus {
  const cached = busByStore.get(store)
  if (cached) return cached

  const bus = new HookBus(new GraphEventBus())
  busByStore.set(store, bus)

  if (hooksDisabled()) {
    log.debug('hooks:disabled (kill-switch) — bus sem handlers')
    return bus
  }

  // Keystone: persistência de learning (síncrono, sem close-race).
  registerLearningPersistence(bus, store)
  // Acoplador determinístico: geração de scaffold via hook async. Import
  // dinâmico evita ciclo (scaffolder → store → hooks). flushHooks garante o flush.
  registerScaffoldCoupler(bus, store)
  log.debug('hooks:armed', { channels: 'task:*, scaffold:requested' })
  return bus
}

/**
 * Emite um hook de lifecycle (async) e RASTREIA a promessa para draining. O
 * caller pode aguardar este emit OU, em caminhos síncronos, chamar
 * {@link flushHooks} antes de `store.close()` para garantir que handlers async
 * (ex.: coupler de scaffold) completem sem close-race.
 */
export async function emitTaskHook(
  store: SqliteStore,
  channel: HookChannel,
  payload: Record<string, unknown>,
): Promise<void> {
  if (hooksDisabled()) return
  let pending = pendingByStore.get(store)
  if (!pending) {
    pending = new Set()
    pendingByStore.set(store, pending)
  }
  const p = getHookBus(store)
    .emit({ channel, timestamp: new Date().toISOString(), payload })
    .finally(() => {
      pending?.delete(p)
    })
  pending.add(p)
  await p
}

/**
 * Aguarda todos os emits async em voo para um store. Chame antes de
 * `store.close()` em comandos que disparam hooks async (autopilot, scaffold).
 */
export async function flushHooks(store: SqliteStore): Promise<void> {
  const pending = pendingByStore.get(store)
  if (!pending || pending.size === 0) return
  await Promise.allSettled([...pending])
  pending.clear()
}

/**
 * Emite um hook de lifecycle de forma SÍNCRONA. A persistência (better-sqlite3)
 * commita antes do caller prosseguir — sem race com `store.close()`. Use a
 * partir de interfaces síncronas (lifecycle service, store-port do autopilot).
 */
export function emitTaskHookSync(store: SqliteStore, channel: HookChannel, payload: Record<string, unknown>): void {
  if (hooksDisabled()) return
  getHookBus(store).emitSync({ channel, timestamp: new Date().toISOString(), payload })
}
