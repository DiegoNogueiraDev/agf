# PRD — Unificação da Economia de Tokens governada pela Fórmula Central (Harnessability)

> **Status:** Draft v1.0 · **Owner:** Diego Lima Nogueira de Paula · **Data:** 2026-06-06
> **Projeto:** agent-graph-flow · **Tipo:** Iniciativa de plataforma (engine de economia de tokens)
> **Destino sugerido após aprovação:** salvar em `docs/prd/token-economy-unification.md` e rodar `agf import-prd docs/prd/token-economy-unification.md` para materializar no grafo.

---

## 1. Resumo executivo

O `agent-graph-flow` promete **software rápido, com best-practice SWE, a custo de token brutalmente baixo**. Hoje o repo já contém uma quantidade enorme de máquinas de economia de token — mas **espalhadas, isoladas e não orquestradas**: cada "lever" (alavanca) existe sozinho, ninguém decide _em conjunto e por chamada_ quais disparar e com que agressividade, e não há **atribuição de economia por-lever** nem um **governador** central.

Este PRD especifica a construção de um **Economy Orchestrator** que: (a) unifica todos os levers sob um pipeline medível; (b) eleva o **Harnessability Score** (a fórmula central, 8 dimensões) a **governador** que modula a agressividade da compressão por chamada; (c) garante correção via um **gate de validação lossy** que re-parseia AST/typecheck e **auto-reverte** quando uma transformação quebra código; (d) **copia ou reimplementa nativamente em TS** (zero lock-in: sem lib/MCP/servidor externo) as melhores primitivas de **7 projetos irmãos clonados** (9router/tool-compress, headroom, codegraph, agentmemory, mempalace, serena, markitdown, browser-harness).

O resultado é economia de token **medida, atribuída e segura por construção**, sem regressão de qualidade (provada por gate + cobertura 95/95 + `test:blast`).

---

## 2. Problema & contexto

### 2.1 Dor

- **Sprawl não-integrado.** Existem ≥15 mecanismos de economia (diff-edits, repo-map PageRank, compaction 5-níveis, caveman output, BM25/rule compressors, response/artifact/session cache, prompt-cache provider, tier-router, Q-learning budget). Nenhum é orquestrado em conjunto por chamada; o caveman sequer está conectado ao gateway.
- **Sem governança.** Não há decisão central de _quão agressivo_ comprimir. Comprimir código agressivamente num repo mal-tipado/sem testes é arriscado; num repo grade-A é seguro — mas hoje nada lê esse sinal.
- **Sem atribuição.** O ledger mede custo por chamada (`llm_call_ledger`), mas não _quanto cada lever economizou_. Impossível saber o que vale a pena ligar.
- **Risco de correção.** Compressão lossy de código pode corromper semântica silenciosamente. Não há rede de segurança.
- **Conhecimento disperso.** O dono mantém 7 projetos irmãos que já resolveram pedaços (tool-compress, CCR, skeletonização, retention, LSP-edit, ingestão md), mas nada está integrado ao motor principal.

### 2.2 Por que agora

O dono clonou hoje (2026-06-06) os 7 repos de referência com intenção explícita de **combinar tudo para extrair o máximo de economia simultaneamente**. A base já tem o `economy-pipeline.ts` (composer Koa-style) e o `harness-cache.ts` (scan cacheado 60s) — os dois pré-requisitos para o governador e o orquestrador. A janela é ideal: infraestrutura pronta, peças mapeadas, decisão tomada.

### 2.3 Decisões do dono (travadas)

1. **Fórmula central = Harnessability Score existente** (não inventar nova; harness vira o _governador_).
2. **Entrega = roadmap faseado + 1º milestone concreto.**
3. **Lossy = agressivo em tudo, inclusive código, MAS sempre atrás de um gate de validação que auto-reverte.**
4. **ZERO lock-in (regra absoluta).** Tudo é **copiado ou reimplementado nativamente em TS/JS** dentro do repo. **Proibido**: depender de lib externa em runtime, MCP, servidor externo (Serena/headroom-proxy), subprocess de ferramenta de terceiros (markitdown Python), ou qualquer mecanismo que crie lock-in. As referências servem como **fonte de algoritmo/código a portar**, nunca como dependência. (Esta regra substitui a antiga ideia de "adapters opcionais externos".)

---

## 3. Objetivos e métricas de sucesso (KPIs)

| #   | Objetivo                         | Métrica                                            | Baseline        | Meta                                  |
| --- | -------------------------------- | -------------------------------------------------- | --------------- | ------------------------------------- |
| O1  | Reduzir tokens de input por task | `avgInputTokens/task` (ledger)                     | medir na Fase 0 | **−35%** com todos levers on          |
| O2  | Reduzir custo por task           | `$/task` (cost-aggregator)                         | medir Fase 0    | **−30%**                              |
| O3  | Economia atribuível              | `saved` somado por lever em `economy_lever_ledger` | 0 (não existe)  | 100% das chamadas com atribuição      |
| O4  | Zero regressão de correção       | `npm test` (95/95) + `test:blast`                  | verde           | **continua verde**                    |
| O5  | Segurança do gate                | revert-rate de lossy-code em código quebrado       | n/a             | **100%** dos casos quebrados revertem |
| O6  | Recall de memória preservado     | R@5 no recall de contexto                          | medir           | **≥ 95%** mesmo comprimindo índice    |
| O7  | Overhead controlado              | latência adicionada por chamada (levers on)        | 0               | **< 50ms p50** (gate syntático)       |
| O8  | Toggle seguro                    | comportamento com flags off                        | idêntico        | **byte-idêntico** ao atual            |

**Critério de sucesso do 1º milestone:** tool-compress ligado mostra **≥15% de redução de input** em cenários com tool-output (git diff/grep/ls), com `npm test` verde e atribuição visível em `metrics`.

---

## 4. Não-objetivos (fora de escopo)

- Dashboard web React, API REST/Express (o "grande corte" do CLAUDE.md permanece fora).
- Streaming token-a-token (decisão de RFC; custa mais tokens).
- Substituir o tier-router/budget existentes (serão _enriquecidos_, não trocados).
- Depender de **qualquer** lib externa, MCP, servidor ou subprocess de terceiros (regra absoluta de zero lock-in). LLMLingua não entra como dependência — sua _ideia_ (compressão semântica) é reimplementada como heurística nativa TS.
- Reescrever o `economy-pipeline.ts` (será _estendido_).
- Usar Serena/markitdown/headroom-proxy/codegraph como serviços externos. Suas capacidades são **reimplementadas nativamente** no repo.

---

## 5. Personas & Jobs-to-be-Done

| Persona                         | JTBD                                                                   | Como o PRD atende                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Agente autônomo (autopilot)** | "Entregar a task gastando o mínimo de tokens sem quebrar código."      | Orquestrador comprime por chamada; gate protege; governador ajusta agressividade. |
| **Dono/operador**               | "Saber exatamente onde os tokens vão e quanto cada técnica economiza." | `economy_lever_ledger` + `metrics --economy-report`.                              |
| **Mantenedor**                  | "Ligar/desligar técnicas com segurança e medir A/B."                   | Flags `ECONOMY_*` default-off; teste off=identidade.                              |
| **Integrador cross-tool**       | "Usar as mesmas otimizações em opencode/codex/copilot."                | Levers puros TS no repo, sem MCP/lib externa ⇒ portáveis para qualquer agente.    |

---

## 6. Princípios & restrições de design

1. **Harness é o governador, não uma nova fórmula.** O score 8-dim já existente modula levers.
2. **Gate é a chave de segurança.** Nada lossy chega ao LLM/disco sem passar pelo `lossy-gate`. Desfechos: aceitar | auto-reverter | dropar reversível (CCR).
3. **Lossless primeiro, lossy depois (e gated).** tool-compress e skeletonização (lossless) entram sem risco; caveman/LLMLingua (lossy) sempre validados.
4. **Zero lock-in (regra absoluta).** Tudo copiado/reimplementado nativamente em TS no repo; **proibido** lib externa, MCP, servidor ou subprocess de terceiros. Referências = fonte de algoritmo, nunca dependência.
5. **Tudo medido e atribuído por-lever.** Sem medição não há lever.
6. **Flags default-off ⇒ idêntico ao atual.** Adoção incremental, A/B trivial.
7. **Restrições do CLAUDE.md herdadas:** ESM (`.js` em imports), Zod v4, strict TS sem `any`, kebab-case, typed errors, logger (sem `console.log`), TDD em `src/tests/`, cobertura **95/95**, mudanças de schema backward-compatible, regra de não-regressão (`build`/`typecheck`/`test`/`lint`/smoke).
8. **Provenance.** Todo arquivo portado registra origem/licença (regra de provenance do harness).

---

## 7. Arquitetura da solução

```
                  ┌──────────────────────────────────────────────┐
   harness scan → │  GOVERNADOR (harness-lever-policy.ts, puro)  │ → LeverPlan
   (cached 60s)   │  grade A/B + tests↑ ⇒ comprimir agressivo    │   {lever:on/off, aggressiveness 0..1,
                  │  grade C/D ⇒ conservador + tier frontier     │    forceTscOnLowTypes}
                  └──────────────────────────────────────────────┘
                                       │ feeds
   LLM call ──▶ ECONOMY ORCHESTRATOR (estende buildEconomyPipeline) ──▶ adapter.generate
                [só live-zone] content-dispatch(por tipo) →
                tool-compress tool-output(lossless,9router) → cache → repo-map →
                compaction → nl-compress(lossy,gated) →
                code-skeletonize(lossless,codegraph) → caveman-input(gated) →
                provider-prompt-cache(+CacheAligner) → combo/tier/budget(+pricing 9router)
                       │ cada lever emite LeverEvent │ invariantes: live-zone, no-grow, limiar-tipo, preservar-erros
                       ▼
              economy_lever_ledger (nova tabela)  →  metrics / /cache-stats
                       ▲
   TODA transformação lossy ▶ lossy-gate.ts (parse AST + symbol-set + tsc condicional)
                            → ACEITA | AUTO-REVERTE p/ original | DROPA via CCR (<<ccr:HASH N>> + retrieval)
```

### 7.1 Componentes

- **Governador** (`harness-lever-policy.ts`): função pura `HarnessScanResult → LeverPlan`.
- **Orchestrator** (`economy-orchestrator.ts`): registra levers como stages ordenados no `economy-pipeline.ts`; cada stage emite `LeverEvent`.
- **Gate** (`lossy-gate.ts`): wrapper genérico de qualquer transform lossy com invariantes + verificação AST/typecheck + revert/CCR.
- **Live-zone** (`live-zone.ts`): garante append-only; só a turn atual é comprimível.
- **Ledger** (`economy-lever-ledger.ts` + tabela nova): atribuição por-lever.
- **Módulos de capacidade nativos** (Fase 4, todos em `src/core/economy/native/`): reimplementações TS puras das capacidades das referências — edição símbolo-a-símbolo (sobre tree-sitter/ts-morph existentes), ingestão de documentos (estende `src/core/parser`), compressão semântica heurística (substitui a _ideia_ do LLMLingua), CDP screenshot-first (sobre o `cdp-connection.ts` já existente). **Nenhum servidor/lib/MCP externo.**

### 7.2 O que JÁ existe (reusar — NÃO reconstruir)

| Capacidade         | Arquivo(s)                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Fórmula central    | `src/core/harness/harnessability-score.ts`, `harness-cache.ts` (`runHarnessScanCached`)                |
| Pipeline de levers | `src/core/economy/economy-pipeline.ts` (`buildEconomyPipeline`, `ECONOMY_PIPELINE_ORDER`, `ENV_FLAGS`) |
| Caveman (output)   | `src/core/llm/caveman-filter.ts` (não wired)                                                           |
| Compressão texto   | `compress-text.ts`, `rule-compressor.ts`, `bm25-compressor.ts`, `focus-compressor.ts`                  |
| Repo-map PageRank  | `src/core/context/repo-map.ts`                                                                         |
| Compaction         | `context-assembler.ts`, `compact-context.ts`, `compaction-pipeline.ts`                                 |
| Budget Q-learning  | `src/core/context/token-budget-policy.ts`                                                              |
| Code-intel         | `treesitter-manager.ts`, `ts-analyzer.ts`, `code-store.ts`, `graph-traversal.ts`                       |
| Serena bridge      | `serena-health.ts`, `memory-migrator.ts`, `enriched-context.ts`                                        |
| Ledger/custo       | `observability/llm-call-ledger.ts`, `cost-aggregator.ts`, `cost-tracker.ts`, `metrics-cmd.ts`          |
| Routing/budget     | `model-hub/tier-router.ts`, `policy-engine.ts`, `provider-adapter-registry.ts`, `budget.ts`            |
| Choke-point LLM    | `src/core/llm/gateway.ts` (`generate`/`complete`)                                                      |

---

## 8. Constelação de referências (FONTE de algoritmo a portar — nunca dependência)

> Regra absoluta: as referências são **fonte de código/algoritmo para copiar ou reimplementar nativamente em TS** dentro do repo. Nenhuma vira dependência, MCP ou servidor.

| Repo                | Primitiva                                                                                                          | Como reimplementar/portar (nativo)                                                                                                                           | Fase      | Licença ao copiar                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------- |
| **9router** ⭐      | **tool-compress** lossless tool-output (12 filtros, JS puro); "never shrink trust"; combo fallback; pricing tables | **Copiar** `open-sse/tool-compress/` (já é JS puro zero-dep) p/ `src/core/economy/tool-compress/`; reescrever combo+pricing dentro de `tier-router`/`budget` | **1** / 5 | confirmar licença + atribuição (deriva de `tool-compress-ai/tool-compress`) |
| **headroom**        | content-dispatch; live-zone; CCR reversível; limiares por-tipo; CacheAligner                                       | **Reimplementar** algoritmos em TS (core é Rust/Python) — portar a lógica, não o binário                                                                     | 2–3       | dono                                                                        |
| **codegraph**       | skeletonização lossless (irmãos polimórficos via `implements`/`extends`)                                           | **Portar** o algoritmo TS sobre `code-store`/`graph-traversal` existentes                                                                                    | 2         | dono                                                                        |
| **agentmemory**     | retention score, tiers, RRF                                                                                        | **Portar** fórmulas TS p/ o context-assembler                                                                                                                | 2/5       | dono                                                                        |
| **mempalace**       | comprimir o índice (AAAK), wake-up L0–L3, hybrid BM25+vetor local, Hebbian+Ebbinghaus                              | **Reimplementar** em TS (origem Python); reusa BM25 já existente (`bm25-compressor.ts`)                                                                      | 2/5       | dono                                                                        |
| **serena**          | edição símbolo-a-símbolo (`find_symbol`+`replace_symbol_body`)                                                     | **Reimplementar nativo** sobre `treesitter-manager`/`ts-analyzer`/`code-store` já no repo — NÃO usar LSP/MCP externo                                         | 4         | MIT — reimplementar (não importar)                                          |
| **markitdown**      | PDF/DOCX/HTML→markdown enxuto                                                                                      | **Reimplementar/estender** `src/core/parser` em TS (origem Python) — sem subprocess Python                                                                   | 4         | MIT — reimplementar (não importar)                                          |
| **browser-harness** | CDP thin-relay + screenshot-first                                                                                  | **Estender** o `src/plugins/browser/cdp-connection.ts` já existente (CDP nativo via WebSocket)                                                               | 4         | dono                                                                        |

---

## 9. Invariantes de segurança (globais, desde o 1º milestone)

| ID    | Invariante                                                                                                                   | Origem                   | Verificação                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------ |
| INV-1 | **Live-zone** — só comprime a turn atual; histórico já enviado é imutável                                                    | headroom                 | `live-zone.test.ts`            |
| INV-2 | **No-grow** — se `tokens(out) ≥ tokens(in)`, usa original                                                                    | headroom + tool-compress | testes de cada lever           |
| INV-3 | **Limiar mínimo por-tipo** — abaixo do byte-threshold (código>2KB, JSON>1KB, log>500B; tool-compress MIN 500B), pass-through | headroom + tool-compress | testes de limiar               |
| INV-4 | **Preservar erros** — nunca comprimir blocos `is_error:true`                                                                 | tool-compress            | `tool-compress.test.ts`        |
| INV-5 | **Gate obrigatório p/ lossy** — nenhum transform lossy escapa do `lossy-gate`                                                | este PRD                 | `lossy-gate.test.ts` + revisão |
| INV-6 | **Cap de tamanho** — blobs > 10MiB passam intactos                                                                           | tool-compress            | `tool-compress.test.ts`        |

---

## 10. Requisitos funcionais (FR)

### 10.1 Governador

- **FR-G1** Função pura `harnessLeverPolicy(scan: HarnessScanResult): LeverPlan`.
  - **AC:** grade A/B + `tests.score ≥ T` ⇒ `aggressiveness ≥ 0.7` e lossy-code permitido. Grade D ⇒ lossy-code **proibido** e tier=frontier. `types.score < T2` ⇒ `forceTscOnLowTypes = true`. Determinística (mesmo input → mesmo plano).
- **FR-G2** Governador lê scan via `runHarnessScanCached` (cacheado 60s) — sem custo extra por chamada.
  - **AC:** sem scan disponível ⇒ `LeverPlan` conservador default; nunca lança.

### 10.2 Orchestrator & atribuição

- **FR-O1** Registrar levers como stages no `ECONOMY_PIPELINE_ORDER` com ordem canônica fixa.
  - **AC:** stages desabilitados por flag são pulados (passthrough); ordem é estável e testada.
- **FR-O2** Cada lever emite `LeverEvent {lever, tokensBefore, tokensAfter, saved, accepted, gateOutcome}` ao ledger.
  - **AC:** soma de `saved` por lever disponível em `metrics`; chamada sem levers ⇒ nenhum evento.
- **FR-O3** Flags default-off ⇒ comportamento byte-idêntico ao atual.
  - **AC:** `gateway-economy.test.ts` prova identidade com flags off.

### 10.3 tool-compress (lever lossless flagship)

- **FR-R1** Porte de `9router/open-sse/tool-compress/` (JS puro): `compressMessages(req)` + filtros (git-diff, git-status, grep, find, ls, tree, dedup-log, read-numbered, search-list, build-output, smart-truncate) + `autodetect` + `safeApply`.
  - **AC:** comprime blocos `tool_result` de git-diff/grep/ls/tree/find/build; respeita INV-2/3/4/6; detecta formatos OpenAI/Claude/Responses; nunca quebra request.
- **FR-R2** Atribuição: cada filtro reporta bytes/tokens salvos.
  - **AC:** `metrics` mostra economia por filtro.

### 10.4 Gate de validação lossy

- **FR-V1** `applyLossyTransform<T>({ original, transform, verify, kind })`.
  - **AC (code):** parse tree-sitter OK em original+candidato **E** symbol-set top-level preservado; escala a `tsc --noEmit` quando `forceTscOnLowTypes` ou caminho crítico; quebra ⇒ retorna original e registra `reverted`.
  - **AC (nl):** entidades/números/identificadores/code-fences preservados; senão reverte.
  - **AC (geral):** aplica INV-2/3 antes de aceitar; nunca lança; tree-sitter/ts ausente ⇒ identidade.
- **FR-V2** Live-zone: `live-zone.ts` identifica a turn atual e marca o resto imutável.
  - **AC:** histórico anterior nunca recomprimido (INV-1).

### 10.5 Caveman input-side

- **FR-C1** `cavemanFilterInput(text)` (conservador; preserva code-fences/identificadores), roda **só via `lossy-gate`** quando há código.
  - **AC:** NL encolhe; código intacto pós-gate; reusa `caveman-filter.ts` sem alterá-lo.

### 10.6 Levers da Fase 2 (lossless + memória)

- **FR-2a** Content-dispatch (porte `ContentRouter` headroom): roteia conteúdo→compressor por tipo.
- **FR-2b** Skeletonização (porte codegraph): irmãos polimórficos (≥3 impls via edges `implements`/`extends`) renderizados como assinaturas; flow-spine intacta. **AC:** parse válido após skeletonizar; economia medida; lossless.
- **FR-2c** Budget de memória por retention-tier (agentmemory) + wake-up L0–L3 + índice AAAK (mempalace) no `context-assembler`. **AC:** R@5 ≥ 95% (O6); orçamento L0–L3 ≤ ~900 tok.

### 10.7 Lossy em código + CCR (Fase 3)

- **FR-3a** Compressão lossy de código atrás do gate, só em grade A/B + tests altos.
- **FR-3b** CCR (porte headroom): em vez de só reverter, dropar com sentinela `<<ccr:HASH N>>` + ferramenta de retrieval para reidratar sob demanda. **AC:** retrieval recupera original byte-a-byte.

### 10.8 Capacidades nativas (Fase 4 — reimplementação, zero dep externa)

- **FR-4a** Edição símbolo-a-símbolo nativa em `src/core/economy/native/symbol-edit.ts`: `findSymbol`/`replaceSymbolBody`/`insertAfterSymbol` sobre `treesitter-manager`/`ts-analyzer`/`code-store` existentes (reimplementa a ideia da Serena). **AC:** rename/replace de símbolo sem ler arquivo inteiro; parse válido pós-edição; **nenhum LSP/MCP/servidor**.
- **FR-4b** Ingestão de documentos nativa: estende `src/core/parser` para PDF/DOCX/HTML→markdown enxuto em TS (reimplementa a ideia do markitdown). **AC:** converte formatos-alvo preservando tabelas/headings; **sem subprocess Python**; fallback para parsers atuais.
- **FR-4c** Compressão semântica heurística nativa `src/core/economy/native/semantic-compress.ts` (reimplementa a _ideia_ do LLMLingua sem modelo): remove tokens de baixa informação via TF-IDF/entropia, sempre via `lossy-gate`. **AC:** reduz NL preservando entidades; **sem modelo/Python**.
- **FR-4d** CDP screenshot-first: estende `src/plugins/browser/cdp-connection.ts` com `captureScreenshot`/`clickAtXY` (reimplementa a ideia do browser-harness). **AC:** interação por screenshot+coordenada; **WebSocket CDP nativo, sem lib externa**.
- **FR-4 (geral):** **nenhuma** capacidade pode introduzir dependência de runtime, MCP ou servidor. Tudo testável offline.

### 10.9 Routing & budget (Fase 5)

- **FR-5** Combo fallback + pricing tables (9router) enriquecem `tier-router`/`budget`/`policy-engine`: custo de cached/reasoning/cache-creation; backoff por regra-de-texto; ordenação subscription→cheap→free. Governador ajusta soft-cap + viés de tier + CacheAligner. **AC:** fallback testado por classe de erro; pricing cobre tokens cacheados.

---

## 11. Requisitos não-funcionais (NFR)

- **NFR-1 Performance:** overhead < 50ms p50 com levers on (gate syntático; tsc só raramente).
- **NFR-2 Segurança:** lossy nunca escapa do gate (INV-5); blocos de erro preservados; path-traversal mantido no apply de edits.
- **NFR-3 Compatibilidade:** schema backward-compatible (só tabela nova); `llm_call_ledger` intocado (contrato v70).
- **NFR-4 Observabilidade:** 100% das chamadas com atribuição por-lever; `metrics --economy-report` + `/cache-stats`.
- **NFR-5 Cobertura:** 95/95/95/95 mantida; cada ramo (revert/identity/escalate/no-grow/threshold) testado.
- **NFR-6 Zero lock-in (hard):** **nenhuma** dependência de runtime nova, MCP, servidor externo ou subprocess de terceiros. Tudo copiado/reimplementado no repo. Verificável: `package.json` não ganha deps de runtime para esta iniciativa; grep por `child_process` de ferramentas externas = 0; nenhuma chamada a servidor (Serena/headroom/etc.). 100% offline.
- **NFR-7 Determinismo:** governador e levers determinísticos (mesmo input → mesma saída) para cache-stability e testes.

---

## 12. Modelo de dados

**Nova tabela `economy_lever_ledger`** (migration monotônica nova; não toca `llm_call_ledger`):

| Coluna          | Tipo          | Descrição                                         |
| --------------- | ------------- | ------------------------------------------------- |
| `id`            | TEXT PK       | uuid                                              |
| `ts`            | INTEGER       | epoch ms                                          |
| `session_id`    | TEXT          | sessão                                            |
| `node_id`       | TEXT          | task do grafo (nullable)                          |
| `lever`         | TEXT          | nome do lever                                     |
| `tokens_before` | INTEGER       | antes                                             |
| `tokens_after`  | INTEGER       | depois                                            |
| `saved`         | INTEGER       | `before - after` (≥0)                             |
| `accepted`      | INTEGER (0/1) | aceito vs revertido                               |
| `gate_outcome`  | TEXT          | `accepted`/`reverted`/`ccr_dropped`/`passthrough` |

Índices: `(session_id)`, `(lever, ts)`.

---

## 13. Roadmap & milestones (DoD por fase)

- **Fase 0 — Baseline.** Migration `economy_lever_ledger`; `metrics --economy-report`; baseline tokens/task via `npm run demo`. **DoD:** baseline registrado; tabela criada; testes verdes.
- **Fase 1 — Milestone (§14).** Gate + live-zone + governador + atribuição + **tool-compress** + caveman-input. **DoD:** O1≥15% em cenário tool-output; O4/O5/O8 satisfeitos.
- **Fase 2 — Orquestrador + lossless + memória.** content-dispatch, skeletonização, retention/AAAK. **DoD:** O6≥95%; cada lever atribuído.
- **Fase 3 — Lossy-code + CCR.** **DoD:** corpus adversarial 100% revertido/CCR; saved líquido positivo.
- **Fase 4 — Capacidades nativas (`src/core/economy/native/`).** Reimplementações TS puras: edição símbolo-a-símbolo (serena→tree-sitter/ts-morph), ingestão de docs (markitdown→`src/core/parser`), compressão semântica heurística (LLMLingua→heurística TS), CDP screenshot-first (browser-harness→`cdp-connection.ts`). **DoD:** cada capacidade 100% nativa, zero dep externa/MCP; testada isoladamente; cobertura 95/95.
- **Fase 5 — Routing/budget + loop.** **DoD:** combo/pricing testados; O2≥30% agregado.

---

## 14. PRIMEIRO MILESTONE — épicos & tasks atômicas (import-prd ready)

> Cada task ≤ 2h, com AC testável e arquivo de teste. Tudo novo em `src/core/economy/`, flags default-off, `llm_call_ledger` intocado.

### EPIC-1 — Medição & ledger (Fase 0)

- **T1.1** Migration `economy_lever_ledger` + índices. _AC:_ tabela criada, migration idempotente, teste de schema. _Test:_ `economy-lever-ledger-migration.test.ts`. _Size:_ S.
- **T1.2** `economy-lever-ledger.ts` (writer/agregador `recordLeverEvent`, `summarizeByLever`). _AC:_ insert+soma por lever; vazio⇒0. _Test:_ `economy-lever-ledger.test.ts`. _Size:_ M. _dep:_ T1.1.
- **T1.3** `metrics --economy-report` lê agregação. _AC:_ mostra saved por lever e accepted-vs-reverted. _Test:_ `metrics-economy-report.test.ts`. _Size:_ S. _dep:_ T1.2.

### EPIC-2 — Gate de segurança

- **T2.1** `live-zone.ts` (identifica turn atual). _AC:_ INV-1; histórico imutável. _Test:_ `live-zone.test.ts`. _Size:_ S.
- **T2.2** `lossy-gate.ts` invariantes (no-grow, limiar, identidade se parser ausente). _AC:_ INV-2/3/6; nunca lança. _Test:_ `lossy-gate.test.ts` (parte A). _Size:_ M.
- **T2.3** `lossy-gate.ts` verify `kind:'code'` (parse + symbol-set + tsc condicional). _AC:_ quebra⇒reverte; dropa-símbolo⇒reverte; benigno⇒aceita. _Test:_ `lossy-gate.test.ts` (parte B, keystone). _Size:_ L→split se preciso. _dep:_ T2.2.
- **T2.4** `lossy-gate.ts` verify `kind:'nl'`. _AC:_ entidades/números/code-fences preservados. _Test:_ `lossy-gate-nl.test.ts`. _Size:_ S. _dep:_ T2.2.

### EPIC-3 — Governador

- **T3.1** `harness-lever-policy.ts` (`HarnessScanResult→LeverPlan`). _AC:_ FR-G1 (A/B agressivo, D proíbe lossy-code, low-types força tsc); determinística. _Test:_ `harness-lever-policy.test.ts`. _Size:_ M.
- **T3.2** Wire `runHarnessScanCached` ao governador + default conservador sem scan. _AC:_ FR-G2; nunca lança. _Test:_ `harness-lever-policy-wire.test.ts`. _Size:_ S. _dep:_ T3.1.

### EPIC-4 — tool-compress (flagship lossless)

- **T4.1** Porte `tool-compress/autodetect.ts` + `tool-compress/apply-filter.ts` (`safeApply`). _AC:_ INV-2/3/4/6; detecção por peek 1024. _Test:_ `tool-compress-apply.test.ts`. _Size:_ M. _provenance:_ origem 9router/tool-compress-ai.
- **T4.2** Porte filtros estruturais (git-diff, git-status, grep, find, ls, tree). _AC:_ cada um encolhe seu formato; casos de `9router/tests/unit`. _Test:_ `tool-output-filters-structural.test.ts`. _Size:_ L→split por filtro se preciso. _dep:_ T4.1.
- **T4.3** Porte filtros genéricos (dedup-log, read-numbered, search-list, build-output, smart-truncate). _AC:_ idem. _Test:_ `tool-output-filters-generic.test.ts`. _Size:_ M. _dep:_ T4.1.
- **T4.4** `compressMessages(req)` (4+ shapes OpenAI/Claude/Responses). _AC:_ FR-R1; preserva erros. _Test:_ `tool-compress.test.ts` (flagship). _Size:_ M. _dep:_ T4.2,T4.3.

### EPIC-5 — Caveman input

- **T5.1** `caveman-input.ts` (`cavemanFilterInput` via lossy-gate). _AC:_ FR-C1; NL encolhe, código intacto. _Test:_ `caveman-input.test.ts`. _Size:_ S. _dep:_ T2.x.

### EPIC-6 — Orquestração no gateway

- **T6.1** Registrar stages `tool-compress` + `caveman-input` em `economy-pipeline.ts` (`ECONOMY_RTK`, `ECONOMY_CAVEMAN_INPUT`). _AC:_ FR-O1; ordem canônica testada. _Test:_ `economy-orchestrator-order.test.ts`. _Size:_ M. _dep:_ T4.4,T5.1.
- **T6.2** Wire no `gateway.ts` (`generate`/`complete`): tool-compress + governador + caveman-input via gate + `LeverEvent`. _AC:_ FR-O2/O3; flags off⇒byte-idêntico. _Test:_ `gateway-economy.test.ts`. _Size:_ L. _dep:_ T6.1,T3.2,T1.2.

**Edges (dependências):** T1.1→T1.2→T1.3; T2.2→{T2.3,T2.4}; T3.1→T3.2; T4.1→{T4.2,T4.3}→T4.4; {T2.x}→T5.1; {T4.4,T5.1}→T6.1→T6.2; {T3.2,T1.2}→T6.2.

---

## 15. Estratégia de teste & verificação

### 15.1 TDD (Red→Green→Refactor) em `src/tests/`

Arquivos-chave: `tool-compress.test.ts` (flagship), `lossy-gate.test.ts` (keystone), `live-zone.test.ts`, `harness-lever-policy.test.ts`, `economy-lever-ledger.test.ts`, `caveman-input.test.ts`, `gateway-economy.test.ts`.

### 15.2 Verificação ponta-a-ponta

1. **Baseline:** flags off, `npm run demo` (ou `autopilot --simulate`), tokens/task via `metrics`.
2. **A/B:** ligar `ECONOMY_*`, rerodar cenário idêntico, diff `summarizeLedger` + atribuição por-lever + accepted-vs-reverted.
3. **Correção:** `npm test` (95/95) + `npm run test:blast` verdes.
4. **Eficácia do gate:** revert-rate em `economy_lever_ledger`.
5. **Não-regressão (CLAUDE.md):** `npm run build` · `npm run typecheck` · `npm run lint` · smoke `npm run dev -- --help`.

### 15.3 Gates hierárquicos (`.claude/rules/tests.md`)

`test:blast` no finish de cada task; `test:node` no gate de épico; `npm test` pré-PR.

---

## 16. Riscos & mitigações

| Risco                                         | Sev   | Mitigação                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lossy corrompe código                         | Alta  | `lossy-gate` (parse+symbol-set+tsc) auto-reverte; governador proíbe lossy-code em grade baixa; CCR reversível                                                                                                                                                      |
| Cobertura 95/95 cai                           | Média | arquivos puros/thin-DB; todos os ramos enumerados em teste; gateway flag-guarded + teste off=identidade; migration com teste                                                                                                                                       |
| Churn de schema                               | Baixa | só tabela nova; `llm_call_ledger` intocado                                                                                                                                                                                                                         |
| Overhead de latência                          | Média | gate syntático barato; tsc só governado; harness scan cacheado 60s; INV-3 evita comprimir blobs pequenos                                                                                                                                                           |
| Licença ao copiar código                      | Média | tool-compress: confirmar licença + atribuição (deriva tool-compress-ai/tool-compress) antes de copiar; markitdown/serena (MIT) ⇒ **reimplementar nativo** (não copiar fonte) p/ evitar entanglement; repos do dono ⇒ portar livremente; provenance em cada arquivo |
| Reimplementação diverge do original           | Média | testes portados dos casos do repo-fonte (ex.: `9router/tests/unit`); A/B contra comportamento esperado; corpus de fixtures por capacidade                                                                                                                          |
| Inchaço/conflito entre levers                 | Média | ordem canônica fixa; levers idempotentes atrás de flag; atribuição expõe quem não paga seu custo                                                                                                                                                                   |
| Recall de memória degrada ao comprimir índice | Média | medir R@5≥95% (O6); AAAK comprime índice, não conteúdo (verbatim preservado)                                                                                                                                                                                       |
| Manutenção do código copiado/portado          | Baixa | tool-compress copiado é JS puro estável; capacidades reimplementadas vivem em `src/core/economy/native/` com testes próprios; sem upstream a sincronizar (zero lock-in)                                                                                            |

---

## 17. Definition of Done (global)

- [ ] Todos os FR do milestone com AC verde.
- [ ] `npm test` 95/95 + `test:blast` verdes.
- [ ] `build`/`typecheck`/`lint`/smoke verdes (não-regressão).
- [ ] Flags off ⇒ comportamento byte-idêntico (teste de regressão).
- [ ] A/B mostra O1≥15% no milestone (tool-output) e atribuição por-lever em `metrics`.
- [ ] Gate reverte 100% dos casos adversariais de código quebrado.
- [ ] **Zero lock-in verificado:** sem nova dep de runtime no `package.json`; sem chamada a servidor/MCP/subprocess externo; 100% offline (NFR-6).
- [ ] Provenance/licença registrada em cada arquivo copiado/portado.
- [ ] PRD importado no grafo (`agf import-prd`) com épicos/tasks/edges materializados.

---

## 18. Glossário

- **Lever** — alavanca de economia (técnica que reduz tokens).
- **Governador** — política que, a partir do Harnessability Score, define o `LeverPlan`.
- **LeverPlan** — quais levers ligar e com que agressividade nesta chamada.
- **Lossy-gate** — validador que aceita/reverte/dropa transformações com perda.
- **tool-compress** — Request/Tool-output compression (12 filtros lossless, 9router/tool-compress-ai).
- **CCR** — Compressão reversível com sentinela + retrieval (headroom).
- **Live-zone** — porção comprimível da conversa (só a turn atual).
- **AAAK** — dialeto de índice estruturado (mempalace): comprime o índice, não o conteúdo.
- **Harnessability Score** — fórmula central 8-dim (25/25/15/10/10/5/5/5) de agent-readiness.

---

## 19. Referências

- `CLAUDE.md`, `.claude/rules/tests.md` (este repo).
- `docs/strategy/token-economy-redesign.md` (RFC original).
- `docs/decisions/0001-prompt-caching-deferred.md`.
- Repos de referência: `~/projects/{9router,headroom,codegraph,agentmemory,mempalace,serena,markitdown,browser-harness}`.

---

## 20. Cross-Reference: PRD × Lifecycle Phases & Gates

> Cada seção do PRD mapeia para uma fase do lifecycle e para ferramentas/gates específicos do mcp-graph.

| § PRD | Conteúdo                                                    | Phase              | Ação no grafo                                                                                                            | Gate de saída                                                                 |
| ----- | ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| §1–6  | Resumo, Problema, KPIs, Não-objetivos, Personas, Princípios | **ANALYZE**        | `node(add, type:"requirement")` para cada epic; `import_prd` para materializar §14                                       | `analyze(prd_quality)` ≥ 60 → `analyze(ready)` 7 checks → `set_phase(DESIGN)` |
| §7    | Arquitetura (diagrama + componentes)                        | **DESIGN**         | `export(mermaid)` C4 container; `node(add, type:"decision")` ADRs para Governador, Orchestrator, Gate, Live-zone, Ledger | `analyze(design_ready)` — ADRs + interfaces + coupling ≥ 55                   |
| §8    | Constelação (8 repos → port nativo)                         | **DESIGN**         | ADR por repo com decisão copiar/reimplementar + licença; `edge(implements)` ADR→componente                               | `analyze(adr)` por ADR; `analyze(tech_risk)`                                  |
| §9    | Invariantes (INV-1 a INV-6)                                 | **DESIGN**         | `node(add, type:"contract")` com verificação (ex: INV-1→`live-zone.test.ts`)                                             | `analyze(contract_coverage)`                                                  |
| §10   | Requisitos funcionais (FR-G1 a FR-5)                        | **ANALYZE→DESIGN** | `node(add, type:"requirement")` com AC; `edge(implements)` FR→componente §7                                              | `analyze(traceability)`                                                       |
| §11   | NFR (NFR-1 a NFR-7)                                         | **ANALYZE**        | `node(add, type:"constraint")` — NFR-6 zero lock-in é constraint hard                                                    | `analyze(ready)` check #5 (has_constraints)                                   |
| §12   | Modelo de dados (economy_lever_ledger)                      | **DESIGN**         | `node(add, type:"data_table")` + migration test em T1.1                                                                  | `analyze(contract_coverage)`                                                  |
| §13   | Roadmap (Fase 0–5)                                          | **PLAN**           | `node(add, type:"milestone")` por fase; `edge(priority_over)` ordenação                                                  | `analyze(sprint_health)`                                                      |
| §14   | Milestone 1 (6 epics, 14 tasks)                             | **PLAN**           | `node(batch_add)` + `edge(depends_on)` + `plan_sprint`                                                                   | `analyze(sprint_health)` → `set_phase(IMPLEMENT)`                             |
| §15   | Estratégia de teste                                         | **PLAN→IMPLEMENT** | `node(update, testFiles:[...])` em cada task; `test:blast` em `finish_task`                                              | `analyze(tdd_check)` + `analyze(implement_done)`                              |
| §16   | Riscos (8 riscos)                                           | **ANALYZE**        | `node(add, type:"risk")` com probability×impact×mitigation                                                               | `analyze(risk)`                                                               |
| §17   | DoD global (9 checkboxes)                                   | **TODAS**          | Cada checkbox → gate específico: zero lock-in → `analyze(security_scan)`, testes → `npm test`                            | `analyze(done_integrity)` final                                               |

### Ferramentas por fase (fluxo canônico)

```
ANALYZE:  import_prd → node(add constraints) → node(add risks) → edge → analyze(prd_quality) → analyze(ready) → set_phase(DESIGN)
DESIGN:   context → context(rag) → node(add adr/contract/interface) → edge → export(mermaid) → analyze(design_ready) → set_phase(PLAN)
PLAN:     context → smart_decompose | node(batch_add) → edge → plan_sprint → forecast(dora) → sync_stack_docs → analyze(sprint_health) → set_phase(IMPLEMENT)
IMPLEMENT: start_task → [TDD Red→Green→Refactor] → finish_task (×14 tasks)
```

### Gates hierárquicos de teste

| Gate  | Comando              | Trigger                              |
| ----- | -------------------- | ------------------------------------ |
| Task  | `npm run test:blast` | `finish_task` (cada task)            |
| Épico | `npm run test:node`  | `epicPromotion.readyToPromote: true` |
| PR    | `npm test`           | Antes de `git push`                  |

---

## 21. Baseline atual do projeto (2026-06-07)

> Dados coletados via `analyze(harness_scan)` + `graph_health` + `analyze(scope)` + `analyze(backlog_health)`.

### Harnessability Score: **65.6 (Grade C)**

| Dimensão             | Score    | Peso | Gap                                                           |
| -------------------- | -------- | ---- | ------------------------------------------------------------- |
| Type Coverage        | **100%** | 25%  | — (1078 files, 3 com `any`)                                   |
| Test Coverage        | **35%**  | 25%  | ⚠️ 1101 módulos, 386 testados. Maior gap.                     |
| Architecture Fitness | **67%**  | 15%  | ⚠️ 2 layer violations: `schemas/` importa de `core/` e `mcp/` |
| Docs Coverage        | **73%**  | 10%  | CLAUDE.md presente, 1 rules file                              |
| Naming Clarity       | **96%**  | 10%  | 615 violações em 14420 nomes                                  |
| Error Handling       | **0%**   | 5%   | 🔴 30 raw throws, 2 swallowed catches                         |
| Context Density      | **79%**  | 5%   | 1161/1466 exports documentados                                |
| Provenance           | **18%**  | 5%   | 124/689 nodes com receipt                                     |

**Impacto no PRD:** Grade C significa que o governador (`harness-lever-policy.ts`) começará conservador — lossy-code **proibido** até o harness atingir ≥70 (B). Isso força priorização de melhorias em Test Coverage e Error Handling nas fases iniciais.

### Graph Health

| Métrica      | Valor                                                  |
| ------------ | ------------------------------------------------------ |
| Nodes totais | 689                                                    |
| Edges totais | 1394                                                   |
| Issues       | 115 (113 edge consistency warnings, 2 oversized nodes) |
| Ciclos       | **0** — grafo acíclico                                 |
| Órfãos       | **0**                                                  |

### Scope

- Requirements→Tasks: 67 com cobertura
- Tasks→AC: 98 mapeados
- Sem órfãos, sem ciclos, sem conflitos

### Backlog

- 4 requirements em backlog
- Tech debt ativo: layer violations, refactors, fixes pendentes
- `cleanForNewCycle: false` — backlog não está limpo para novo ciclo
- **Recomendação:** limpar os 4 requirements do backlog antes ou durante a Fase 0 (baseline)

### Pré-condições para iniciar

| Condição              | Estado                  | Ação                                                 |
| --------------------- | ----------------------- | ---------------------------------------------------- |
| Lifecycle = ANALYZE   | ✅ Configurado          | —                                                    |
| Backlog limpo         | ❌ 4 requirements stale | Resolver ou arquivar antes do novo ciclo             |
| Graph sem edge issues | ⚠️ 113 warnings         | `validate(cycle_repair)` corretivo                   |
| Harness ≥ 55          | ✅ 65.6 (C)             | Suficiente para DESIGN→PLAN gate                     |
| Harness ≥ 70          | ❌ 65.6 (C)             | Necessário para liberar lossy-code; alvo da Fase 0–1 |

### Arquivos de economia existentes (base para o PRD)

| Arquivo                                | Função                            | Estado                                        |
| -------------------------------------- | --------------------------------- | --------------------------------------------- |
| `src/core/economy/economy-pipeline.ts` | Pipeline Koa-style de levers      | ✅ Pronto — será estendido                    |
| `src/core/harness/harness-cache.ts`    | `runHarnessScanCached` (60s)      | ✅ Pronto — alimenta governador               |
| `src/core/llm/caveman-filter.ts`       | Caveman output                    | ⚠️ Existe mas não está wired no gateway       |
| `src/core/llm/gateway.ts`              | Choke-point `generate`/`complete` | ✅ Pronto — receberá orquestração             |
| `observability/llm-call-ledger.ts`     | Ledger de custo                   | ✅ Pronto — será complementado (não alterado) |
| `model-hub/tier-router.ts`             | Routing por tier                  | ✅ Pronto — será enriquecido na Fase 5        |
