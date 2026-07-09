# Token-Economy Backlog — levers grounded in math papers + bio/biophysical structures

> **Pilar 3 do `agent-graph-flow`: custo de token brutalmente baixo.**
> Este documento é um **backlog de pesquisa**: 13 alavancas _novas_, cada uma ancorada num paper
> matemático ou numa estrutura biológica/biofísica **e** num _seam_ de reuso concreto do código atual.
> Nenhuma duplica o que já existe — todas **estendem** o stack já provado.

## O que já existe (não reimplementar — estender)

| Fundação                                          | Onde                                                                                                                                | Âncora já presente                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Flow** (hipofrontalidade transitória)           | `src/core/context/{flow-index,topological-decay,flow-compact,flow-report}.ts`                                                       | `Φ(t)` EMA · `λ_flow = λ_base + α·Φ` · decaimento topológico `e^{-λd}` · "córtex pré-frontal" pinado          |
| **Escada epistêmica** (clipping de ativação LSTM) | `src/core/provenance/`                                                                                                              | claim→cited→validated→proven · forget-gate (tier-downgrade)                                                   |
| **Swarm** (parameter-server, Sak et al. 2014)     | `src/core/swarm/`                                                                                                                   | A2A mailbox · consenso por maioria · leases TTL                                                               |
| **Retrieval**                                     | `bm25-compressor.ts` · `rag/multi-strategy-retrieval.ts` (RRF) · `rag/hierarchical-retrieval.ts` · `context/repo-map.ts` (PageRank) | BM25 · RRF `Σ w_i/(k+rank_i)` · ToC-tree · PageRank power-iteration                                           |
| **Compressão**                                    | `economy/{content-router,code-ast-compress,caveman-input,lossy-gate,ccr-store}.ts` · `context/compaction-pipeline.ts`               | SmartCrusher · AST · CCR reversível `⟨ccr:hash⟩` · compaction 5-níveis                                        |
| **Caches**                                        | `llm/response-cache.ts` · `reuse/artifact-cache.ts` · `rag/semantic-cache.ts`                                                       | LRU+TTL · reuse por task-signature · cache semântico por embedding                                            |
| **Medição**                                       | `economy/economy-lever-ledger.ts` · `observability/llm-call-ledger.ts` · `rag-in/calibrate.ts`                                      | `economy_lever_ledger` · `llm_call_ledger` → `agf metrics --economy-report` / `agf savings` / `agf calibrate` |

## Guardrails transversais (toda alavanca herda)

1. **Opt-in, default byte-idêntico** — caminho sem flag inalterado; a alavanca só age quando habilitada (padrão Flow/claim).
2. **Registra no `economy_lever_ledger`** via `recordLeverEvent()` com um `lever` distinto → aparece em `agf metrics --economy-report`.
3. **Veredito honesto** — adjudicado como o A/B do Flow (`flow-report.ts`) / `agf calibrate`: economia que sobe a taxa de defeito ⇒ `net_negative`.
4. **Piso pinado respeitado** — nunca podar constraint/risk/decision/AC (reusar `DEFAULT_PINNED_TYPES`).
5. Cada item é **sua própria task TDD futura**; este backlog só cria doc + nodes (sem código de alavanca ainda).

---

## Tier 1 — alto impacto, encaixe forte, aditivo/opt-in

### 1. Salience de memória via ACT-R / Ebbinghaus (base-level activation)

- **Âncora:** Anderson & Schooler 1991 (_rational analysis of memory_); curva do esquecimento de Ebbinghaus.
- **Mecanismo:** trocar o score ingênuo `freq×100/len` de `searchMemories` por ativação base-level
  `A_i = ln(Σ t_k^{-d}) + Σ w_j·s_ji` (decaimento por recência+frequência + ativação espalhada a partir das tags da task);
  injetar só memórias acima de um limiar de ativação ⇒ menos tokens de memória, mais valiosos.
- **Reuso:** `core/memory/memory-reader.ts` (score) · `core/store/episodic-outcomes-store.ts` (timestamps) · `core/autonomy/task-prep.ts` (memory-inject).
- **Lever:** `memory_salience`. **Esforço** M / **risco** baixo (limiar default mantém o top-N atual).
- **AC:** (a) score base-level determinístico testado vs fixture temporal; (b) limiar configurável, default preserva contagem atual; (c) lever gravado com tokens before/after.
- **Medir:** `agf metrics --economy-report` (linha `memory_salience`); tokens de memória/task ↓.

### 2. Regra de parada de retrieval via Marginal Value Theorem (forrageamento ótimo)

- **Âncora:** Charnov 1976 (MVT); Stephens & Krebs, _Foraging Theory_.
- **Mecanismo:** parar de puxar chunks/símbolos quando o ganho marginal de informação por token cai abaixo
  da média corrente da sessão ("patch-leaving"), em vez de um budget fixo.
- **Reuso:** `core/context/bm25-compressor.ts` · `core/rag/multi-strategy-retrieval.ts` · `core/rag/hierarchical-retrieval.ts`.
- **Lever:** `forage_stop`. **Esforço** M / **risco** baixo-médio (budget fixo permanece como teto/fallback).
- **AC:** (a) taxa de ganho marginal computada incrementalmente; (b) para quando `gain/token < média_sessão`; (c) budget fixo respeitado como teto.
- **Medir:** chunks puxados/query ↓ sem queda de AC-pass (`agf insights` + ledger).

### 3. Objetivo Information Bottleneck para o lossy-gate + calibrate

- **Âncora:** Tishby, Pereira & Bialek 1999 (_The Information Bottleneck Method_); Tishby & Zaslavsky 2015 (deep IB).
- **Mecanismo:** trocar o `saved>threshold` ad-hoc por um objetivo IB — maximizar compressão `I(X;T)`
  preservando informação preditiva da task `I(T;Y)` (estimar `I(T;Y)` por correlação com episodic outcomes); alimenta o ajuste de limiar do `calibrate`.
- **Reuso:** `core/economy/lossy-gate.ts` (accept) · `core/rag-in/calibrate.ts` · `economy-lever-ledger` (score).
- **Lever:** refina o gate existente. **Esforço** L / **risco** médio (atrás de flag; validar via A/B do calibrate).
- **AC:** (a) objetivo IB calculado a partir do ledger de levers + episodic; (b) limiar derivado reproduz/excede a aceitação atual; (c) flag default = comportamento legado.
- **Medir:** `agf calibrate` (sweet-spot score×saved); defect-rate estável.

### 4. Marcadores estigmérgicos nas arestas do grafo (Ant Colony Optimization)

- **Âncora:** Dorigo (ACO); Grassé (estigmergia); evaporação = `e^{-λt}`.
- **Mecanismo:** `finalizeTask` deposita um "feromônio" compacto nas arestas/nodes percorridos com sucesso
  (qual abordagem/arquivos funcionaram); o próximo `prepareTask` lê a trilha mais forte (~tokens mínimos)
  em vez de re-derivar contexto; evaporação reusa o `e^{-λt}` de `topological-decay`.
- **Reuso:** `core/autonomy/task-prep.ts` (finalize/prepare) · arestas do grafo · `core/context/topological-decay.ts` · `executor-brief.ts` (enrichment).
- **Lever:** `stigmergy`. **Esforço** M-L / **risco** baixo (marcador aditivo; ausente ⇒ comportamento atual).
- **AC:** (a) feromônio gravado em `finalizeTask` com evaporação `e^{-λt}`; (b) `prepareTask` lê trilha top sem re-derivar; (c) ausência de trilha ⇒ render byte-idêntico.
- **Medir:** tokens de contexto/task em tasks repetidas ↓; lever `stigmergy` no ledger.

---

## Tier 2 — impacto médio / esforço moderado

### 5. Consolidação "sono" por homeostase sináptica (SHY)

- **Âncora:** Tononi & Cirelli (_Synaptic Homeostasis Hypothesis_); replay/downscaling no sono.
- **Mecanismo:** passe offline periódico (hook no `agf gc`): downscaling multiplicativo de traços de baixa salience,
  dedup/merge de memórias quase-duplicadas, promoção de padrões recorrentes a regras compactas ⇒ memory-inject por task enxuto.
- **Reuso:** `cli` gc · `core/memory/memory-reader.ts` · `core/store/episodic-outcomes-store.ts`.
- **Lever:** `consolidation` (medido como memory-tokens/task ↓). **Esforço** M / **risco** baixo (offline, opt-in).
- **AC:** (a) downscaling multiplicativo determinístico; (b) merge de quase-duplicadas por similaridade; (c) idempotente entre execuções.
- **Medir:** bytes de memória total ↓; tokens injetados/task ↓.

### 6. Dedup de chunks por NCD / complexidade de Kolmogorov

- **Âncora:** Li & Vitányi; Cilibrasi & Vitányi 2005 (_Normalized Compression Distance_, baseado em gzip).
- **Mecanismo:** descartar chunks quase-duplicados onde `NCD(a,b) < ε` usando gzip — complemento determinístico
  e sem embeddings ao `SemanticCache` (que é por embedding).
- **Reuso:** `core/economy/content-router.ts` · `core/context/context-assembler.ts` · `core/rag/semantic-cache.ts` (caminho alternativo).
- **Lever:** `ncd_dedup`. **Esforço** M / **risco** baixo.
- **AC:** (a) NCD via gzip determinístico; (b) `ε` configurável; (c) nunca remove o representante de maior score.
- **Medir:** chunks injetados/query ↓; lever `ncd_dedup` no ledger.

### 7. "Context diff" por codificação preditiva (Free-Energy Principle)

- **Âncora:** Friston (energia livre); Rao & Ballard 1999 (_predictive coding_ — transmitir só o erro de predição).
- **Mecanismo:** manter um prior compacto do que o executor já tem (briefs/turns anteriores) e enviar só o resíduo
  surpreendente — generalizando diff-edits da **saída** para o **contexto de entrada**.
- **Reuso:** `core/context/executor-brief.ts` (render condicional) · `context-assembler.ts` · `compaction-pipeline.ts`; **depende do item 9**.
- **Lever:** `context_diff`. **Esforço** L / **risco** médio.
- **AC:** (a) prior por sessão do que foi enviado; (b) só o delta surpreendente é renderizado; (c) sem prior ⇒ contexto completo (byte-idêntico).
- **Medir:** tokens de input/turn em sessões multi-turn ↓.

### 8. Alocação de budget por escala metabólica (lei de Kleiber 3/4)

- **Âncora:** lei de Kleiber; West, Brown & Enquist (redes de distribuição fractais, `massa^{3/4}`).
- **Mecanismo:** alocar budget de token a sub-contextos sublinearmente (`tamanho^{3/4}`), já que o valor do contexto satura —
  alternativa principiada ao split Q-learning 60/30/10.
- **Reuso:** `core/context/context-assembler.ts` (`getAdaptiveBudgetSplit`) · `tiered-context.ts`.
- **Lever:** `budget_kleiber`. **Esforço** S-M / **risco** baixo (A/B vs Q-learning por métricas).
- **AC:** (a) split sublinear `^{3/4}` determinístico; (b) soma normalizada = 1; (c) selecionável vs Q-learning por flag.
- **Medir:** `agf metrics --baseline` (custo/task) vs arm Q-learning.

---

## Tier 3 — infraestrutura / menores / experimentais

### 9. Sketch Bloom / Count-Min anti-reenvio entre turnos

- **Âncora:** Bloom 1970; Cormode & Muthukrishnan (_Count-Min Sketch_ — membership em espaço sublinear).
- **Mecanismo:** sketch por sessão dos hashes (FNV-1a) de chunks já enviados, para o executor nunca re-receber o que já viu; habilita o item 7.
- **Reuso:** `core/cache/cache-key-composer.ts` (FNV-1a) · `compaction-pipeline.ts` · `response-cache.ts`.
- **Lever:** `seen_sketch`. **Esforço** S / **risco** baixo.
- **AC:** (a) sketch sublinear com FNV-1a; (b) falso-positivo limitado/configurável; (c) reset por sessão.
- **Medir:** chunks re-enviados/sessão → ~0.

### 10. Relevância por heat-kernel de difusão (Laplaciano do grafo `e^{-tL}`)

- **Âncora:** Kondor & Lafferty 2002 (_diffusion kernels on graphs_); teoria espectral de grafos.
- **Mecanismo:** interpolação ajustável entre local puro (flow `e^{-λd}`) e PageRank global para seleção de vizinhos no repo-map/flow; `t` controla a localidade.
- **Reuso:** `core/context/repo-map.ts` (PageRank) · `topological-decay.ts` (`e^{-λd}`).
- **Lever:** refina `repo_map`/`flow`. **Esforço** L / **risco** médio (PageRank continua default).
- **AC:** (a) `e^{-tL}` via power-series truncada; (b) `t` configurável; (c) default = PageRank atual.
- **Medir:** símbolos incluídos/budget vs qualidade (AC-pass).

### 11. Seletor MDL para SmartCrusher / CCR

- **Âncora:** Rissanen 1978 (_Minimum Description Length_); princípio de Landauer (metáfora de custo).
- **Mecanismo:** escolher a compressão de menor comprimento de descrição `(modelo + resíduo)` em vez de max-saved —
  evita over-crushing que força retrieval CCR.
- **Reuso:** `core/economy/content-router.ts` · `code-ast-compress.ts` · `ccr-store.ts`.
- **Lever:** refina o roteamento de conteúdo. **Esforço** M / **risco** médio.
- **AC:** (a) comprimento de descrição computado por candidato; (b) escolhe o mínimo; (c) reversibilidade CCR preservada.
- **Medir:** taxa de `ccr_dropped`→retrieval ↓; saved líquido estável.

### 12. Estimador de tokens calibrado por Zipf–Mandelbrot

- **Âncora:** lei de Zipf / Zipf-Mandelbrot; lei de Heaps (crescimento de vocabulário).
- **Mecanismo:** ajustar a distribuição rank-frequência por projeto para calibrar `estimateTokens`
  (hoje `chars/4`, ~10-15% de erro) ⇒ budgets mais justos, menos tokens desperdiçados/cortados.
- **Reuso:** `core/context/token-estimator.ts` · `core/autonomy/token-ledger.ts`.
- **Lever:** acurácia (economia indireta). **Esforço** S-M / **risco** baixo.
- **AC:** (a) ajuste Zipf-Mandelbrot por projeto; (b) erro de estimativa ↓ vs `chars/4` em corpus de teste; (c) fallback `chars/4` quando sem dados.
- **Medir:** erro |estimado−real| no `llm_call_ledger` (tokens reportados).

### 13. Gate de broadcast por quorum sensing no swarm

- **Âncora:** quorum sensing bacteriano (limiar de autoindutor); comportamento coletivo por densidade.
- **Mecanismo:** agentes do swarm só fazem broadcast (tokens A2A caros) quando um quórum de achados correlatos
  se acumula; abaixo do limiar permanecem locais — corta o ruído do mailbox preservando a qualidade do consenso.
- **Reuso:** `core/swarm/a2a-mailbox.ts` · `consensus/majority.ts` · `agent-claim-manager.ts`.
- **Lever:** `quorum_gate`. **Esforço** M / **risco** baixo (o swarm já é opt-in).
- **AC:** (a) limiar de quórum configurável; (b) broadcast suprimido abaixo do limiar; (c) consenso por maioria inalterado.
- **Medir:** mensagens A2A/sessão ↓ sem queda na taxa de consenso alcançado.

---

## Materialização & rastreabilidade

- **Grafo:** epic **"Token-Economy Bio/Math Levers"** + 13 tasks (uma por item), com AC, `xpSize` e prioridade por tier
  (Tier 1 > 2 > 3) + aresta `depends_on` item 7 → item 9. Criado via `agf node add` (determinístico).
- **Spec-sync:** este doc registrado e linkado ao epic (`agf spec-sync register` + `link`).
- **Implementação:** cada item vira sua própria task TDD (Red→Green→Refactor) quando puxado por `agf next`/`agf start`.

> Cada alavanca só conta se virar **número** no `economy_lever_ledger`. Sem medição honesta, não entra no default.

---

## Adendo (2026-06) — "Espiral que aprende": roteamento outcome-driven + companheiros

Fecha a tese central do produto (`agf-formula-explained.md`: _cada volta aprende com a anterior_) na
decisão mais consequente do loop — o **tier de modelo**, que era heurística estática.

### 14. Roteamento de tier outcome-driven via multi-armed bandit (lever `learned_routing`) — **implementado**

- **Âncora:** UCB1 (Auer, Cesa-Bianchi & Fischer 2002) — explore/exploit determinístico com regret finito;
  opcional Thompson (Beta-Bernoulli, Thompson 1933). Neurociência: reward-prediction-error / RL (Schultz
  1997; Daw et al. 2006). Recompensa = **sucesso por unidade de custo** (a métrica já declarada do projeto).
- **Mecanismo:** cada `(taskType, tier)` é um braço; estatísticas via JOIN aditivo `episodic_outcomes ⋈
llm_call_ledger` (sem migração). A heurística (`tierForTask`/`PHASE_TIER_MAP`) é o **prior bayesiano** ⇒
  cold-start byte-idêntico. Falha posterior penaliza o braço automaticamente (sem job de reconciliação).
- **Reuso:** `core/model-hub/{outcome-router,arm-stats-store,learned-router}.ts`; gate em
  `economy-levers-config.ts`; medição em `economy-lever-ledger`; costura em `live-implement.ts` mantendo
  `tier-router.ts` puro. CLI: `agf model route <kind> --explain`.
- **Lever:** `learned_routing`. **Esforço** L / **risco** baixo (opt-in, OFF byte-idêntico).

### Companheiros endurecidos no mesmo ciclo

- **`forage_stop` (item 2)** estendido do memory-inject para o **repo-map** (corte dominante de input):
  `buildRepoMap({ forageStop })` aplica o MVT de Charnov sobre os símbolos ranqueados, com o budget como teto.
- **Forecast por Monte Carlo** (estatística/física — Metropolis–Ulam; #NoEstimates/Magennis):
  `core/insights/monte-carlo-forecast.ts` reamostra o throughput histórico → datas P50/P85/P95, substituindo
  o CI paramétrico frágil (e corrigindo o cálculo invertido) em `forecast.ts`.
