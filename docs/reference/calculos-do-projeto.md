# Os cálculos do agent-graph-flow — referência didática

> **Como ler este documento.** Cada cálculo aparece com: a **fórmula** (extraída do
> código real, com `arquivo:linha`), a **intuição** em uma frase, e — nos mais
> importantes — um **exemplo numérico**. Princípio do projeto: _código vence
> memória_ — tudo aqui foi conferido na fonte, não em documentação que pode envelhecer.
>
> Os cálculos se agrupam em quatro famílias:
>
> 1. **Economia de tokens** — quanto custa e como cortar (o coração do produto).
> 2. **Qualidade / prontidão** — os scores que governam os gates (0–100).
> 3. **Fluxo / forecast** — métricas de lifecycle (Little, DORA, λ_flow).
> 4. **Algoritmos clássicos** — a caixa de ferramentas (ranking, grafo, DP).

---

## Parte 1 — Economia de tokens

### 1.1 Modelo de custo (a fórmula-mestra)

`src/core/observability/cost-tracker.ts:96`

```
cached     = min(cachedInputTokens, T_in)
fullInput  = T_in − cached
inputCost  = fullInput/1e6 · inputPer1M  +  cached/1e6 · inputPer1M · CACHE_HIT_RATE
outputCost = T_out/1e6 · outputPer1M          ← T_out inclui raciocínio
total      = inputCost + outputCost
```

- `CACHE_HIT_RATE = 0.1` (`:94`) — token cacheado custa **10%** do input cheio.
- **Intuição:** o input se parte em dois blocos — o que deu cache hit (barato) e o resto (cheio); o output paga preço próprio.

**Tabela de preços** (`MODEL_PRICING`, `:44`, USD por 1M tokens):

| Modelo                   | input | output | razão out/in                 |
| ------------------------ | ----- | ------ | ---------------------------- |
| `deepseek/deepseek-chat` | 0,14  | 0,28   | 2×                           |
| `deepseek/deepseek-r1`   | 0,55  | 2,19   | ~4×                          |
| `gpt-4o-mini`            | 0,15  | 0,60   | 4×                           |
| `gpt-4o`                 | 2,50  | 10,0   | 4×                           |
| `claude-sonnet-4`        | 3,00  | 15,0   | 5×                           |
| `claude-opus-4`          | 15,0  | 75,0   | 5×                           |
| `gemini-2.0-flash`       | 0,075 | 0,30   | 4×                           |
| Ollama local             | —     | —      | **$0** (sem preço → custo 0) |

`getModelPricing` (`:71`) faz match exato e, se falhar, **prefixo mais longo** (ex.: `claude-sonnet-4-20250514` → `claude-sonnet-4`).

### 1.2 As três frentes e o cálculo da economia

O custo total é a soma sobre os `N` passos do agente:

```
Custo = Σ_i [ p_cache·C_i  +  p_in·(T_in,i − C_i)  +  p_out·(T_reason,i + T_resp,i) ]
```

Em unidades normalizadas (`p_in : p_cache : p_out = 1 : 0,1 : 2` no deepseek-chat), cada
alavanca ataca um termo. A **economia por passo** é:

```
S = 0,9·C  +  1·ΔT_in  +  (p_out/p_in)·ΔT_out
    (cache)   (compressão)   (output condicional)
```

| Lever               | poupa    | peso/token           | porque                          |
| ------------------- | -------- | -------------------- | ------------------------------- |
| cache de prefixo    | `C`      | **0,9**              | sai de `1`, passa a pagar `0,1` |
| compressão de input | `ΔT_in`  | **1**                | input cheio removido            |
| output condicional  | `ΔT_out` | **p_out/p_in** (2–5) | output custa 2–5× o input       |

**Em dólar:** `S_$ = inputPer1M/1e6 · (0,9·C + ΔT_in + (p_out/p_in)·ΔT_out)`.

**Exemplo (1 passo, deepseek-chat):** `T_in=10.000` (prefixo 8.000 + cauda 2.000), `T_out=2.000`.

- Baseline (`C=0`): `1·10.000 + 2·2.000 = 14.000` unidades.
- - cache (`C=8.000`): poupa `0,9·8.000 = 7.200`.
- - compressão (cauda 2.000→1.400): poupa `1·600 = 600`.
- - effort (reason 1.500→200): poupa `2·1.300 = 2.600`.
- `S = 10.400` → `Custo_opt = 3.600` → **economia 74%, fator 3,9×** (bate com a tese 2–4×).

> **Por que o cache vem primeiro** apesar de output valer mais por token: o prefixo `C`
> é enorme e **repete em todos os `N` passos**; `ΔT_out` por passo é pequeno. `0,9·C·N`
> domina a fatura. (Ordem de execução: cache → effort → determinístico → compressão.)

> **Cuidado ao somar economia:** um token de output poupado vale 2–5× um de input; um
> cache hit de **resposta** poupa a chamada inteira (`p_in·T_in + p_out·T_out`). Somar
> "tokens salvos" sem peso subvaloriza output e response-cache.

### 1.3 Estimativa de tokens (quando a API não reporta)

- **Heurística simples:** `⌈len/4⌉` (`token-ledger.ts:25`) — 4 chars/token. ~20% de erro.
- **Heurística por palavra** (`token-estimator.ts:46`, ~10–15% de erro): camelCase conta
  sub-palavras; ≤6 chars → 1 token; >20 → `⌈len/4⌉`; 6–20 → `⌈len/5⌉`; dígitos → `⌈n/3⌉`;
  símbolos → 1 cada; espaço → grátis.

### 1.4 Compressão de saída de ferramenta (tool-compress)

`src/core/economy/tool-compress/index.ts:150`

```
se  bytesIn < 500  ou  bytesIn > 10MB  → passthrough (saved=0)
filtro = autoDetectFilter(text)
se sem filtro → recordMiss(text); passthrough
out = safeApply(filtro, text)
se  out vazio  ou  out.length ≥ bytesIn → passthrough   ← garantia no-grow
saved = bytesIn − out.length
```

- `MIN_COMPRESS_SIZE=500`, `RAW_CAP=10MB` (`constants.ts`). **No-grow:** nunca cresce.
- Relatório: `pct = saved / bytesBefore · 100` (`formatRtkLog`). Ex.: `[tool-compress] saved 1024B/4096B (25%)`.
- **Intuição:** preserva o sinal (falhas+sumário), colapsa o volume previsível. Ver
  `docs/runbooks/tool-output-filters.md`.

### 1.5 Cache de resposta e chave (FNV-1a)

`src/core/cache/cache-types.ts`

```
fnv1a64:  hash = 0xcbf29ce484222325;  para cada char: hash ^= c; hash = (hash · 0x100000001b3) & 64bits
fnv1a32:  offset 0x811c9dc5, prime 0x01000193
```

- **Chave de cache de resposta** (`caching-model-adapter.ts:72`): normaliza CRLF, troca
  `(id: <nodeId>)` por `(id: *)` (o id da task não muda o código), e serializa
  `{provider, model, system, prompt, effort}`. Hit → `fromCache:true`, **0 token**.
- **Economia do hit:** `savedTokens = tokensIn + tokensOut` (a chamada inteira; `:105`).
- TTL: memória 1h (`response-cache.ts`), SQLite **7 dias** (`caching-model-adapter.ts:39`).
  `RESPONSE_CACHE_SCHEMA_VERSION=1` — bump invalida tudo.

### 1.6 Agregação de custo e economia de cache

`src/core/llm/cost-aggregator.ts:18`

```
savedViaCacheUsd = cachedTokensTotal · inputRate · CACHE_DISCOUNT_RATIO
CACHE_DISCOUNT_RATIO = 0.9          ← cache lê a 10% → poupa 90% do input
DEFAULT_INPUT_RATE = 3 / 1e6        ← fallback genérico ($3/1M); use o preço real do modelo
```

O `economy_lever_ledger` (`economy-lever-ledger.ts`) soma `saved` por lever
(`summarizeByLever`), com `gate_outcome ∈ {accepted, reverted, ccr_dropped, passthrough}`.

### 1.7 Roteador de esforço (output condicional — Frente C)

`src/core/model-hub/effort-router.ts:47`

```
classify | status         → 'minimal'      (tier cheap)
plan                      → 'high'         (tier frontier)
tentativa ≥ 3             → 'high'
tentativa == 2            → 'medium'
1ª tentativa: reuso? 'minimal' : 'low'
```

- `effortToWire`: `'minimal' → 'low'` no fio. **Intuição (UnCert-CoT):** raciocínio é
  output (2–5×); escala só sob incerteza real (o teste vermelho do retry É a incerteza).

### 1.8 Orçamento de tokens adaptativo (Q-learning)

`src/core/context/token-budget-policy.ts`

```
Q(s,a) ← Q(s,a) + α·(reward − Q(s,a))        ← Bellman tabular
estado  = (fase do lifecycle, grade do harness)   → 9×4 = 36 estados
ação    = preset de budget {graph_heavy, knowledge_heavy, balanced, code_heavy, minimal}
reward  = +1 sucesso · −3 regressão · −1 intervenção humana
α=0.1 · ε=0.15 (exploração) · minVisits=20 · reset se Q diverge > 3σ
```

Presets distribuem o budget de contexto (ex.: `balanced` = grafo 0,35 / conhecimento 0,30 /
código 0,25 / histórico 0,10).

### 1.9 Guarda de custo (cost-runaway)

`src/core/llm/budget.ts`

```
HARD CAP:  se (gasto + estimativa_da_chamada) > cap → lança LlmBudgetExceededError
SOFT CAP:  se gasto ≥ cap · 0,5 → rebaixa p/ modelo mais barato (em vez de lançar)
```

Caps por env: `MCP_GRAPH_{SESSION,RUN,CELL}_BUDGET_USD`, `..._SOFT_FRACTION` (default 0,5).
No autopilot, `maxIterations` é o teto de passos (`stopped='budget_exhausted'`).

### 1.10 Gate de transformação lossy

`src/core/economy/lossy-gate.ts:115` — limiares por tipo (código 2KB, JSON 1KB, NL/log 500B;
cap 10MB). Resultado: `accepted` (encolheu e passou no `verify`) · `reverted` (cresceu ou
verify falhou) · `passthrough` (pequeno/grande demais). **Verify** garante que símbolos de
código / URLs / datas não sumam.

---

## Parte 2 — Qualidade e prontidão (scores 0–100)

### 2.0 Escala de notas global

`src/core/utils/grading.ts:27` → `A≥90 · B≥75 · C≥60 · D≥40 · F<40`. **C(60)** é o limiar
canônico de "pronto para avançar". (O harness usa uma escala própria — ver 2.1.)

### 2.1 Harness Score (Agent Readiness, 8 dimensões)

`src/core/harness/harnessability-score.ts:99`

```
score = types·0,25 + tests·0,25 + fitness·0,15 + docs·0,10
      + naming·0,10 + errors·0,05 + context·0,05 + provenance·0,05
grade = score≥85 A · ≥70 B · ≥55 C · <55 D     (escala própria, não a global)
```

Cada dimensão é 0–100. **Exemplo:** types 80, tests 60, fitness 67, docs 90, naming 100,
errors 100, context 100, provenance 100 →
`80·0,25 + 60·0,25 + 67·0,15 + 90·0,10 + (100·0,30) = 20+15+10,05+9+30 = 84,05` → **B**.

- **Type coverage** = `arquivos sem 'any' / total · 100` (`type-coverage-scanner.ts`).
- **Test coverage** = `módulos com .test.ts / total · 100` (`test-coverage-scanner.ts`).
- **Fitness** = `checks passados / 3 · 100` (ver 2.2).

### 2.2 Fitness de arquitetura + acoplamento

`src/core/harness/fitness-functions.ts` — 3 checks all-or-nothing → `fitnessScore ∈ {0,33,67,100}`:
direção de dependência (`core/` não importa `cli/mcp/api/web`), zero ciclos (DFS), integridade
de barrel (`index.ts` re-exporta os irmãos).

**Acoplamento** (`coupling-analyzer.ts`, métrica de Martin):

```
fanIn = nº de arestas que chegam · fanOut = nº que saem
instability = fanOut / (fanIn + fanOut)     ∈ [0 estável, 1 instável]
high-coupling se (fanIn+fanOut) > 5
```

### 2.3 Quality gate ("95/95")

`src/core/harness/quality-gate.ts:39` — **atenção:** o nome é "95/95" mas os defaults no
código são `{tests:35, logs:40}`. `passed = testScore ≥ 35 AND logScore ≥ 40` (AND puro, sem peso).

### 2.4 AC quality (INVEST + bônus de mensurabilidade)

`src/core/analyzer/ac-validator.ts:102`

```
baseScore = passedInvest / 6 · 100              ← 6 checks INVEST, peso igual
bônus     = round(fração_de_ACs_mensuráveis · 15)   ← até +15
score     = min(100, baseScore + bônus)
```

INVEST: **I**ndependent (não referencia outro AC), **N**egotiable (sem termos de
implementação), **V**aluable, **E**stimable (≤1 termo vago), **S**mall (≤10 passos),
**T**estable (≥50% testáveis). Gate: **≥60**.

### 2.5 PRD quality

`src/core/analyzer/prd-quality.ts:172`

```
score = Σ_seção ( nível·peso ) / 100,   nível ∈ {missing 0, weak 33, adequate 66, strong 100}
pesos: requisitos 25% · AC 25% · tasks 20% · riscos 15% · constraints 15%
nível por seção: ratio<0,4 weak · <0,7 adequate · ≥0,7 strong
readyForDesign = score ≥ 60 E sem requisitos/AC faltando
```

### 2.6 Definition of Done (12 checks no código)

`src/core/implementer/definition-of-done.ts:256`

```
score = passados / 12 · 100;   ready = todos os REQUIRED passaram
```

- **Required (4):** tem AC · AC score ≥ 60 · sem blockers não-done · passou por `in_progress`.
- **Recommended (8):** descrição · não-oversized · AC testável · test files · estimativa ·
  citação `§EPIC/§ADR` em novos arquivos `core/` · orçamento de complexidade · escopo cirúrgico.
- **Complexidade** (`complexity-budget.ts`): arquivo ≤200 LOC (ou tem subtasks); impl:test ≤ 5:1.
- **Escopo cirúrgico** (`surgical-scope.ts`): arquivos fora do escopo declarado ≤ **30%**.

### 2.7 Definition of Ready (8 checks)

`src/core/analyzer/definition-of-ready.ts:146` — requisitos · AC · sem órfãos · sem ciclos ·
constraints · riscos · PRD ≥ 60 · browser_tests com aresta. `ready = sem blockers críticos E ≤ 2 falhas`.

### 2.8 Detecção de regressão de harness

`src/core/harness/harness-scan-runner.ts:250` — `regression = score ≤ score_anterior − 5`
(delta assinado). Gate VALIDATE usa **−10**. Em `strict` bloqueia; em `advisory` só avisa.

---

## Parte 3 — Fluxo e forecast (lifecycle)

### 3.1 Little's Law (WIP = 1)

`cycle_time = WIP / throughput`. O sistema força **WIP=1** (`autopilot-loop.ts`): no máximo
1 task `in_progress`. Menos WIP → menor cycle time sem perder throughput (pull, não push).

### 3.2 DORA

`src/core/insights/dora-metrics.ts`

```
deployment_frequency = done(últimos 7d) / 7
lead_time            = percentis p50/p85/p95 de (updated_at − created_at)/3.6e6 h, últimas 100
change_failure_rate  = reversões(done→in_progress) / (done + in_progress)
MTTR                 = mediana(tempo de retrabalho), últimas 20 reversões
trend: recente > prev·1,2 → improving · < prev·0,8 → declining · senão stable
```

### 3.3 Velocity ajustada por qualidade + ETA

`src/core/planner/velocity.ts:227`

```
adjustedVelocity = baseVelocity · (1−pen_MTTR) · (1−pen_CFR) · (1−pen_deploy)
   MTTR > 4h    → ×0,85    CFR > 0,2 → ×0,80    deployFreq < 1/sem → ×0,90
```

ETA (`sprint-progress.ts:73`): `eta_days = (restantes · horas_médias_por_task) / 8`.
Trend de velocity: `atual/média > 1,1 up · < 0,9 down · senão stable`.

### 3.4 λ_flow — hipofrontalidade transiente (a equação assinatura)

`src/core/context/flow-index.ts`

**Índice de fluxo Φ(t)** — EMA com histerese sobre os resultados recentes (`:96`):

```
sucesso:  Φ ← Φ + emaGain·(1 − Φ)          ← aproxima de 1, nunca chega
falha:    Φ ← Φ · resetFactor   (=0 → reset duro)
parcial:  Φ ← Φ · (1 − emaGain·partialFactor)
emaGain=0,34 · resetFactor=0 · partialFactor=0,5   (≈5 sucessos → Φ≈0,87)
```

**Taxa de decaimento dinâmica** (`:121`): `λ_flow = λ_base + α·Φ(t)` (`λ_base=0,15`, `α=1,5`).

**Peso de decaimento topológico** (`:132`): `peso(d) = e^{−λ·d}` — nós a distância `d` perdem
contexto exponencialmente. **Exemplo:** em fluxo (`Φ=0,9 → λ=1,5·0,9+0,15=1,5`): `d=1 → e^{−1,5}=0,22`;
fora de fluxo (`Φ=0 → λ=0,15`): `d=1 → e^{−0,15}=0,86`. Tipos `constraint/risk/decision/AC/
constitution/requirement` são **fixados** (nunca decaem — o "piso pré-frontal").

**Gate da borda criativa** (`creative-edge.ts:41`): `permitido = λ_flow < 0,6 (saturação)`.
Em fluxo alto, **não** gera com LLM — reusa o corpus determinístico (0 token).

### 3.5 Confiança, escalação e loops

- **Confiança RAG** (`corrective-rag.ts`): base 0,7 (sem contexto) · 0,9 fresco · 0,6 (1–7d) ·
  0,4 (>7d) · 0,3 deletado; ajuste por status (done ×1,1 · blocked ×0,9 · backlog ×0,85).
  Retry se `média < 0,5` (1 retry).
- **Loop detector** (`loop-detector.ts`): `hash(tool+params)`; se o mesmo hash ocorre **≥3** em
  janela de **20** → `LOOP_DETECTED`.
- **Retry/backoff** (`llm-error.ts`): permanentes (auth 401/403, content-policy, 400/422) →
  escala, não tenta de novo; transitórios (429, 5xx∈{500,502,503,504,529}, rede) → backoff.
  `DEFAULT_RATE_LIMIT_MS=1000`.
- **Failover** (`failover-model-adapter.ts`): cadeia ordenada; cai p/ o próximo em erro/vazio;
  `fallbackCount` conta; último alvo repropaga o erro original (passthrough).
- **Issue pattern tracker**: padrão de falha vira sugestão de regra ao atingir **3** ocorrências.

---

## Parte 4 — Algoritmos clássicos (a caixa de ferramentas)

O `src/core/algorithms/` é uma biblioteca CLRS completa (livro `Algorithms.pdf`). Nem tudo está
no caminho quente; abaixo, os que **efetivamente** alimentam o produto, depois a biblioteca.

### 4.1 Ranking de contexto / RAG (caminho quente)

| Cálculo               | Fórmula                                                       | Constantes                     | Arquivo                           | Uso                     |
| --------------------- | ------------------------------------------------------------- | ------------------------------ | --------------------------------- | ----------------------- |
| **PageRank**          | `PR(v) = (1−d)/N + d·Σ PR(u)/outdeg(u)`                       | d=0,85 · ε=1e-6 · 100 iter     | `graph-algorithms.ts:661`         | repo-map (~1k tok)      |
| **Personalized PR**   | `s = (1−α)·next + α·seed`                                     | α=0,15                         | `personalized-pagerank.ts`        | RAG por seed (HippoRAG) |
| **TF-IDF**            | `Σ tf·idf`, `idf=log(1+N/df)`                                 | —                              | `search/tfidf.ts:90`              | rerank de símbolos      |
| **BM25 + MMR**        | `combined = 0,4·bm25 + 0,6·cos`; `MMR = λ·rel − (1−λ)·simMax` | λ=0,7                          | `rag/hybrid-search.ts`            | busca híbrida           |
| **RRF (fusão)**       | `Σ w_i/(k+rank_i)`                                            | k=60                           | `multi-strategy-retrieval.ts:131` | fundir N estratégias    |
| **Score final RAG**   | `rrf · (0,4 + 0,3·qual + 0,3·recência)`                       | —                              | `multi-strategy-retrieval.ts:123` | ranking composto        |
| **Knowledge quality** | `0,3·fresh + 0,3·reliab + 0,2·uso + 0,2·rich`                 | meia-vida 30d · base 500 chars | `knowledge-quality.ts:72`         | relevância de memória   |

`fresh = 0,5^(idade_dias/30)` · `uso = min(1, log10(n+1)/2)` · `rich = min(1, len/500)`.

### 4.2 Scaffolder determinístico (compose)

`src/core/scaffolder/compose.ts:80` — duas etapas: **Set Cover guloso** seleciona scaffolds que
cobrem as capacidades exigidas; **Knapsack 0/1** (DP) poda ao orçamento de tokens
(`peso=⌈JSON.length/100⌉`, `valor=nº de capacidades`). Capacidades não cobertas → "borda
criativa" (único gasto de LLM). **Corpus boost** (`corpus.ts:69`): `boost[kind]=count/maxCount ∈ [0,1]`
— padrões já presentes no projeto ganham empurrão (consistência).

### 4.3 Grafo e DP (usados em planejamento/dedup)

| Cálculo | Fórmula | Arquivo | Uso |
| ------------------------------- | ----------------------------------- | --------------------------------------- | ------------------------ | --- | --------- | ------------------------ | ---------------------------- |
| **Topological sort** (Kahn) | fila por in-degree; `              | out                                     | <                        | in  |` → ciclo | `graph-algorithms.ts:94` | ordenar deps, detectar ciclo |
| **Critical path** | maior caminho no DAG via topo-order | `graph-algorithms.ts:252` | gargalo do sprint |
| **Edit distance** (Levenshtein) | `dp[i][j]=min(del,ins,sub)` | `algorithms/dp/edit-distance.ts` | near-dup / dedup |
| **Shannon entropy** | `H = −Σ p·log₂p` | `algorithms/stats/entropy.ts` | densidade/saliência |
| **Linear regression** | `slope, intercept, R²` | `algorithms/stats/linear-regression.ts` | trend/forecast |
| **Rabin-Karp** | rolling hash, BASE=31, MOD=1e9+7 | `algorithms/string/rabin-karp.ts` | busca de substring |
| **Ranker determinístico** | score↓, depois id↑ | `search/deterministic-ranker.ts` | resultados reproduzíveis |

### 4.4 Biblioteca disponível (não-quente)

`graph-algorithms.ts` e `optimization.ts` trazem ainda: Dijkstra, Bellman-Ford, Floyd-Warshall,
Kruskal/Prim (MST), Ford-Fulkerson (max-flow), Tarjan (SCC), centralidades (betweenness/closeness/
degree), além de LCS, rod-cutting, OBST, suffix-array, quickselect, Huffman, k-means, gradient
descent, genetic algorithm, branch-and-bound, multiplicative-weights, CSP backtracking. São
**ferramentas prontas** (testadas) para evolução do produto — chamadas pontualmente, não no loop principal.

---

## Apêndice — constantes-chave e onde medir

| Constante                       | Valor            | Onde                      |
| ------------------------------- | ---------------- | ------------------------- |
| `CACHE_HIT_RATE`                | 0,1              | cost-tracker              |
| `CACHE_DISCOUNT_RATIO`          | 0,9              | cost-aggregator           |
| `MIN_COMPRESS_SIZE` / `RAW_CAP` | 500 B / 10 MB    | tool-compress/constants   |
| harness grades                  | A85 B70 C55      | harnessability-score      |
| grade global                    | A90 B75 C60 D40  | grading                   |
| λ_base / α / saturação          | 0,15 / 1,5 / 0,6 | flow-index, creative-edge |
| emaGain                         | 0,34             | flow-index                |
| Q-learning α/ε                  | 0,1 / 0,15       | token-budget-policy       |
| soft-cap fraction               | 0,5              | budget                    |
| loop detector                   | 3 em 20          | loop-detector             |
| RRF k                           | 60               | multi-strategy-retrieval  |
| PageRank d                      | 0,85             | graph-algorithms          |

**Onde os números reais vivem:** `llm_call_ledger` (T_in, T_out, cachedTokensIn, reasoningTokens,
cost_usd por chamada) e `economy_lever_ledger` (saved por lever). O comando `agf metrics` aplica
o §1.1; `agf status` mostra o painel; `agf compress discover` mostra saídas ainda não comprimidas.

> **Princípio único (token economy):** o LLM é caro onde é insubstituível (julgamento). Todo
> token — de input ou output — que um sistema determinístico pode produzir, ou que um cache pode
> reaproveitar, deve sair do loop do modelo.
