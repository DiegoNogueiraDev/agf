/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Delegação da orquestração ao 2º binário `ant-swarming` (opt-in `--swarm`).
 *
 * PORQUÊ: fecha o loop do desenho da colônia — "instalado? → delega a `ant-swarming
 * run`; ausente? → o fluxo delegado/live ATUAL, sem mudar o default". Capacidade
 * sem superfície é dormente (regra 9); esta é a superfície.
 *
 * A decisão é PURA e injetável (DIP): `detect` (detectSwarmingCli) e `runSwarm`
 * (o subprocess do binário) entram como ports, então o wire é testável sem o
 * binário real nem spawn. `--swarm` é opt-in: sem ele, este módulo nem é chamado.
 */

import { execFileSync } from 'node:child_process'
import { detectSwarmingCli, type SwarmingCliStatus } from './delegation.js'

/** Executa o binário `ant-swarming` com `args` e devolve o envelope JSON parseado. */
export type RunSwarm = (args: readonly string[]) => unknown

export interface SwarmDelegationDeps {
  /** Detector do binário (default: detectSwarmingCli — handshake com timeout). */
  detect?: () => Promise<SwarmingCliStatus>
  /** Runner do subprocess (default: execFile `ant-swarming` + parse do envelope). */
  runSwarm?: RunSwarm
}

export interface SwarmDelegationOpts {
  dir: string
  /** Nº de formigas repassado ao `ant-swarming run --ants`. */
  ants?: number
}

export interface SwarmDelegationResult {
  /** true quando o binário foi detectado e a orquestração foi delegada a ele. */
  delegated: boolean
  /** Status da detecção (para o chamador informar version/capabilities). */
  status: SwarmingCliStatus
  /** Envelope repassado do `ant-swarming run` (presente só quando delegated). */
  envelope?: unknown
}

/** Runner default: chama o binário instalado e parseia a última linha (envelope JSON). */
function defaultRunSwarm(args: readonly string[]): unknown {
  const out = execFileSync('ant-swarming', [...args], { encoding: 'utf-8', timeout: 600_000 })
  const lastLine = out.trim().split('\n').pop() ?? '{}'
  return JSON.parse(lastLine)
}

/**
 * Se o `ant-swarming` está instalado, delega a orquestração a `ant-swarming run`
 * (subprocess) e repassa o envelope. Ausente ⇒ `{ delegated:false }` e o chamador
 * segue o fluxo atual SEM nenhuma mudança de comportamento.
 */
export async function maybeDelegateToSwarm(
  opts: SwarmDelegationOpts,
  deps: SwarmDelegationDeps = {},
): Promise<SwarmDelegationResult> {
  const detect = deps.detect ?? (() => detectSwarmingCli())
  const runSwarm = deps.runSwarm ?? defaultRunSwarm

  const status = await detect()
  if (!status.installed) return { delegated: false, status }

  const args = ['run', '-d', opts.dir, '--ants', String(opts.ants ?? 2)]
  const envelope = runSwarm(args)
  return { delegated: true, status, envelope }
}
