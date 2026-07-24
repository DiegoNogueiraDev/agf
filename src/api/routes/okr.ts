/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * okr route — GET /api/v1/okr. Thin wire (espelho de colony.ts) sobre
 * `collectOkrRows`: o MESMO coletor que `agf okr` usa, para que a aba do
 * dashboard e o terminal nunca discordem sobre o atingimento de um épico.
 * Zero lógica de métrica aqui — se um número precisar mudar, muda no coletor
 * e as duas superfícies mudam juntas.
 *
 * Contract: JSON direto, 200 sempre. Nenhum épico com KR ⇒ rows:[] e count:0,
 * nunca erro — ausência de OKR é um estado legítimo do projeto, não uma falha.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { collectOkrRows } from '../../core/okr/okr-collect.js'

/** Build the /okr router bound to a live store. */
export function createOkrRouter(store: SqliteStore): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    try {
      // Espelha o flag `--at-risk` do CLI: a mesma pergunta, feita pela tela.
      const atRiskOnly = req.query.atRisk === 'true'
      res.json(collectOkrRows(store, { now: Date.now(), atRiskOnly }))
    } catch (err) {
      next(err)
    }
  })

  return router
}
