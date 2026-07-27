#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * ant-swarming — bin entrypoint (thin). Espelha src/cli/index.ts: só o
 * bootstrap e a guarda de entrypoint; toda a lógica testável vive em
 * ./program.ts e no core. Ver o docblock de program.ts para o contrato de
 * isolamento de camada (nunca importar de ../cli ou ../tui).
 */
import { pathToFileURL } from 'node:url'
import { runSwarming, SWARMING_NAME } from './program.js'

/**
 * True só quando este arquivo é o entrypoint direto (bin ou
 * `tsx src/swarming/index.ts`) — nunca quando importado por um teste. Sem a
 * guarda, um `import` deste módulo rodaria o bootstrap como efeito colateral.
 */
export const isSwarmingEntrypoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href

if (isSwarmingEntrypoint) {
  void runSwarming(process.argv).catch((e: unknown) => {
    const error = e instanceof Error ? e.message : String(e)
    process.stdout.write(
      JSON.stringify({ ok: false, code: 'FATAL', error, meta: { command: SWARMING_NAME, ms: 0 } }) + '\n',
    )
    process.exitCode = 1
  })
}
