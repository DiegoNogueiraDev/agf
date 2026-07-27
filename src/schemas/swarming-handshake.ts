/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Contrato de handshake do 2º binário `ant-swarming` — FONTE ÚNICA.
 *
 * PORQUÊ: o handshake é um contrato compartilhado por DOIS lados em camadas
 * diferentes: o PRODUTOR (`src/swarming/program.ts`, que só pode importar de
 * core/schemas) emite este objeto no subcomando `handshake`; o CONSUMIDOR
 * (`src/cli/shared/delegation.ts` → detectSwarmingCli) parseia e valida o
 * stdout do binário. Um contrato em dois lugares = N−1 bugs — por isso o
 * schema vive AQUI, importável por ambos, e nunca é redefinido inline.
 */
import { z } from 'zod/v4'

/** Contrato devolvido por `ant-swarming handshake` (dentro do envelope `.data`). */
export const swarmingHandshakeSchema = z.object({
  name: z.literal('ant-swarming'),
  version: z.string().min(1),
  capabilities: z.array(z.string()),
})

export type SwarmingHandshake = z.infer<typeof swarmingHandshakeSchema>
