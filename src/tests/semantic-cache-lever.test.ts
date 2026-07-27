/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da lever semantic_cache (B.T3 — node_d0996b20284e).
 * OFF (default) ⇒ wire null ⇒ adapter byte-idêntico. ON ⇒ re-runs parafraseados
 * cortam ≥30% das chamadas reais; fixture adversarial (tasks distintas) tem
 * ZERO falso-hit (o escopo é a defesa); hits viram linhas semantic_cache no ledger.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'
import { ECONOMY_LEVERS_SETTING_KEY } from '../core/economy/economy-levers-config.js'
import {
  CachingModelAdapter,
  buildResponseCache,
  resolveSemanticCacheWire,
} from '../core/model-hub/caching-model-adapter.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from '../core/model-hub/model-client.js'

function settingsWith(cfg: Record<string, unknown>): { getProjectSetting(key: string): string | null } {
  return {
    getProjectSetting(key: string): string | null {
      return key === ECONOMY_LEVERS_SETTING_KEY ? JSON.stringify(cfg) : null
    },
  }
}

/** Inner stub: conta chamadas reais e devolve resposta fixa. */
function stubInner(): { adapter: ModelAdapter; calls: () => number } {
  let calls = 0
  return {
    adapter: {
      async generate(req: ModelRequest): Promise<ModelResponse> {
        calls += 1
        return { text: `resp:${req.prompt.slice(0, 24)}`, tokensIn: 50, tokensOut: 30, model: req.model }
      },
    } as ModelAdapter,
    calls: () => calls,
  }
}

function req(prompt: string): ModelRequest {
  return { model: 'stub-model', prompt } as ModelRequest
}

const TOPICS = [
  'autenticacao login sessao token expiracao renovacao',
  'pagamento fatura cobranca reembolso estorno cartao',
  'relatorio grafico dashboard metrica agregacao filtro',
  'cache memoria expiracao invalidacao chave persistencia',
  'busca indice ranking relevancia tokenizacao stopword',
  'migracao schema coluna tabela versao rollback',
  'notificacao email fila retry template assinatura',
  'permissao papel acesso politica auditoria escopo',
  'upload arquivo validacao tamanho formato armazenamento',
  'agendamento cron intervalo tarefa background execucao',
  'compressao poda distorcao entidade retencao gate',
  'roteamento modelo tier cascata verificador escalada',
  'grafo no aresta status transicao dependencia ciclo',
  'orcamento burnrate janela controlador termostato clamp',
  'feromonio trilha decaimento reforco selecao colonia',
  'contrato interface tipo validacao zod fronteira',
  'observabilidade log tracing span metrica alerta',
  'deploy release binario checksum assinatura servidor',
  'template scaffold reuso boilerplate geracao slot',
  'sessao janela deslizante atribuicao ledger custo',
]
const BASE_PROMPTS = TOPICS.map((t) => `analise o subsistema de ${t} e descreva o comportamento esperado`)
/** Paráfrases: mesmas palavras do TOPICO reordenadas — colide com a propria base, nao com as outras. */
const PARAPHRASES = TOPICS.map((t) => `descreva o comportamento esperado e analise o subsistema de ${t}`)

describe('resolveSemanticCacheWire — a lever gate (AC1)', () => {
  it('lever OFF (default) => wire null => adapter identico ao atual', async () => {
    // Arrange
    const db = new Database(':memory:')
    runMigrations(db)
    expect(resolveSemanticCacheWire(settingsWith({}), db)).toBeNull()

    const { adapter: inner, calls } = stubInner()
    const cached = new CachingModelAdapter(inner, buildResponseCache(db))

    // Act — parafrase NAO e servida sem a camada semantica
    await cached.generate(req(BASE_PROMPTS[0]))
    await cached.generate(req(PARAPHRASES[0]))

    // Assert — 2 chamadas reais (so cache exato) e zero linhas no ledger
    expect(calls()).toBe(2)
    expect(summarizeByLever(db).find((l) => l.lever === 'semantic_cache')).toBeUndefined()
    db.close()
  })
})

describe('lever ON — economia real e seguranca (AC2/AC3/AC4)', () => {
  it('AC2: re-run parafraseado com semantic ON corta >=30% das chamadas reais', async () => {
    // Arrange
    const db = new Database(':memory:')
    runMigrations(db)
    const wire = resolveSemanticCacheWire(settingsWith({ semantic_cache: { enabled: true } }), db, {
      command: 'stub-eval',
    })
    expect(wire).not.toBeNull()
    const { adapter: inner, calls } = stubInner()
    const cached = new CachingModelAdapter(inner, buildResponseCache(db), { semantic: wire! })

    // Act — rodada 1: tudo miss; rodada 2: parafrases
    for (const p of BASE_PROMPTS) await cached.generate(req(p))
    const callsAfterRound1 = calls()
    for (const p of PARAPHRASES) await cached.generate(req(p))
    const round2Calls = calls() - callsAfterRound1

    // Assert — >=30% servido do cache semantico
    expect(callsAfterRound1).toBe(20)
    expect(round2Calls).toBeLessThanOrEqual(14)

    // AC4 — hits viram linhas semantic_cache no ledger (tokens poupados + contagem)
    const row = summarizeByLever(db).find((l) => l.lever === 'semantic_cache')
    expect(row).toBeDefined()
    expect(row!.totalSaved).toBeGreaterThan(0)
    expect(row!.count).toBeGreaterThanOrEqual(6)
    db.close()
  })

  it('AC3: fixture adversarial — 20 pares de TASKS DIFERENTES => zero falso-hit (escopo defende)', async () => {
    // Arrange — mesmo texto-quase, mas cada par pertence a um node distinto
    const db = new Database(':memory:')
    runMigrations(db)
    const settings = settingsWith({ semantic_cache: { enabled: true } })
    const { adapter: inner, calls } = stubInner()

    // Act — grava o TOPICO i sob node_i; depois consulta uma parafrase do topico i
    // MAS no escopo do node (i+1): o escopo so ve o topico (i+1), que e diferente => miss.
    for (let i = 0; i < 20; i += 1) {
      const wire = resolveSemanticCacheWire(settings, db, { nodeId: `node_${i}` })
      const cached = new CachingModelAdapter(inner, buildResponseCache(db), { semantic: wire! })
      await cached.generate(req(BASE_PROMPTS[i]))
    }
    const before = calls()
    for (let i = 0; i < 20; i += 1) {
      const wire = resolveSemanticCacheWire(settings, db, { nodeId: `node_${(i + 1) % 20}` })
      const cached = new CachingModelAdapter(inner, buildResponseCache(db), { semantic: wire! })
      await cached.generate(req(PARAPHRASES[i]))
    }

    // Assert — nenhuma resposta de task alheia servida: TODAS as 20 foram chamadas reais
    expect(calls() - before).toBe(20)
    db.close()
  })
})
