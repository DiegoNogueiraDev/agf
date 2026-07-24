/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_f93a70abc080 — ShellHookProvider (ADR-002).
 *
 * Gera hooks shell que invocam `agf` como fallback (ICM-style).
 * Inspirado no `icm hook init`: cria HookHandlerConfig[] para eventos
 * do ciclo de vida, cada handler executando um subcomando `agf hook`.
 *
 * Quando o modo hook é selecionado (outra CLI com suporte a hooks),
 * estes handlers fazem a ponte via shell — sem MCP direto.
 */

import type { HookHandlerConfig, AgentSource } from '../hooks/config-loader.js'
import type { HookChannel } from '../hooks/hook-types.js'
import { generateHandlerId } from '../hooks/import-helpers.js'

/** Opções para geração de hooks shell. */
export interface ShellHookOptions {
  /** Caminho para o binário agf (default: 'agf'). */
  cliPath?: string
  /** Canais para gerar hooks (default: canais principais). */
  channels?: HookChannel[]
  /** Agent source para atribuir (default: 'mcp-graph'). */
  agentSource?: AgentSource
}

/** Resultado da geração de hooks shell. */
export interface ShellHookResult {
  handlers: HookHandlerConfig[]
  generatedAt: string
  provider: 'mcp-graph'
}

/**
 * Mapa de canal → subcomando `agf hook <sub>` (canais principais).
 * Canais sem entrada explícita (ex.: os aditivos da 28-point taxonomy) derivam o
 * subcommand deterministicamente via {@link channelToSubcommand} (`:` → `-`).
 */
const CHANNEL_TO_SUBCOMMAND: Partial<Record<HookChannel, string>> = {
  'session:start': 'session-start',
  'session:end': 'session-end',
  'tool:pre-call': 'tool-pre-call',
  'tool:post-call': 'tool-post-call',
  'task:pre-execute': 'task-pre-execute',
  'task:post-complete': 'task-post-complete',
  'task:error': 'task-error',
  'memory:pre-store': 'memory-pre-store',
  'memory:post-store': 'memory-post-store',
  'agent:pre-spawn': 'agent-pre-spawn',
  'agent:post-spawn': 'agent-post-spawn',
  'scaffold:requested': 'scaffold-requested',
  'swarm:consensus-reached': 'swarm-consensus-reached',
  'approval:required': 'approval-required',
  'agent:p2p-send': 'agent-p2p-send',
  'agent:p2p-receive': 'agent-p2p-receive',
  'agent:p2p-ack': 'agent-p2p-ack',
}

const DEFAULT_CHANNELS: HookChannel[] = ['session:start', 'session:end', 'tool:pre-call', 'tool:post-call']

const DEFAULT_TIMEOUT_MS = 5000

/** Subcommand de um canal: entrada explícita ou derivação determinística (`:` → `-`). */
function channelToSubcommand(channel: HookChannel): string {
  return CHANNEL_TO_SUBCOMMAND[channel] ?? channel.replace(/:/g, '-')
}

/**
 * Gera hooks shell que invocam `agf` nos eventos especificados.
 * Cada handler é um comando shell que executa `agf hook <subcommand>`.
 *
 * @param opts - Opções de geração.
 * @returns Lista de HookHandlerConfig gerados.
 */
export function generateShellHooks(opts: ShellHookOptions = {}): ShellHookResult {
  const cliPath = opts.cliPath ?? 'agf'
  const channels = opts.channels ?? DEFAULT_CHANNELS
  const agentSource: AgentSource = opts.agentSource ?? 'mcp-graph'

  const handlers: HookHandlerConfig[] = channels.map((channel, idx) => {
    const subcommand = channelToSubcommand(channel)
    return {
      id: generateHandlerId('shell-hook', channel, 0, idx),
      channel,
      kind: 'shell',
      command: cliPath,
      commandArgs: ['hook', subcommand],
      timeoutMs: DEFAULT_TIMEOUT_MS,
      priority: 0,
      enabled: true,
      description: `Shell hook: invoca ${cliPath} hook ${subcommand} no evento ${channel}`,
      agentSource,
    }
  })

  return {
    handlers,
    generatedAt: new Date().toISOString(),
    provider: 'mcp-graph',
  }
}
