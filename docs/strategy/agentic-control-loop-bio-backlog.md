# Loop-Agêntico Backlog — controle & qualidade ancorados em RL, neurociência, imunologia, SPC e teoria de grafos

> **Pilares 1 e 2 do `agent-graph-flow`: entregar software rápido com as melhores práticas de SWE.**
> Este documento é um **backlog de pesquisa** complementar ao `token-economy-bio-math-backlog.md`.
> Aquele cobre o **Pilar 3 (custo)** e já está ~80% implementado; este ataca o buraco que sobra: o
> **loop de controle/qualidade** que faz o agente _entregar software correto_. São **8 alavancas Tier-1**,
> cada uma ancorada num paper + estrutura da natureza/física/neurociência **e** num _seam_ de reuso
> concreto do código atual. Nenhuma duplica o que já existe — todas **estendem** o stack provado.

## O que já existe (não reimplementar — estender)

| Fundação                   | Onde                                                                                                             | Estado atual (o gap que estendemos)                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aprendizado por-agente** | `src/core/learning/{performance-tracker,sona-router,routing-strategy,sqlite-learning-store}.ts` (`perf_records`) | Sinal **binário** AC pass/fail; roteamento **argmax guloso** (kNN) + fallback manual no cold-start `<5`. Sem reward graduado, sem credit-assignment, sem exploração. |
| **Feedback de outcome**    | `src/core/hooks/memory-learning-lifecycle-hooks.ts` (`on_feedback`)                                              | Emite `{agentId,nodeId,acPassed,harnessDelta,cycleTimeMs}` no `agf done`. Pronto para carregar um reward mais rico.                                                  |
| **Forecast**               | `src/core/insights/forecast.ts` (`calculateForecast`) · `dora-metrics.ts`                                        | Regressão linear de **malha aberta**: prevê ETA mas nunca compara previsto×real nem se corrige.                                                                      |
| **Autopilot / retry**      | `src/core/autonomy/{autopilot-loop,recovery-recipes}.ts`                                                         | Retry = **backoff cego** por receita determinística; re-roda o mesmo mal-entendido. Sem sinal de "entendi errado".                                                   |
| **DoD / gaps**             | `src/core/gaps/` (9 detectores) · `check`/DoD · `src/core/provenance/` (escada epistêmica)                       | Determinístico e forte, mas **não pega "confident-wrong"** (testes verdes, AC não coberto de fato).                                                                  |
| **Decomposição**           | `src/core/planner/{smart-decompose,decompose}.ts` · `gaps/detect-atomicity.ts`                                   | Heurística **1-AC=1-subtask**, cega a acoplamento/coesão entre subtasks.                                                                                             |
| **Escalonamento**          | `src/core/planner/{next-task,dependency-chain}.ts` · `insights/bottleneck-detector.ts`                           | `next` = **sort guloso** (priority/size). O caminho crítico **já é computado** em `dependency-chain.ts` mas é ignorado na escolha.                                   |
| **Medição**                | `src/core/economy/economy-lever-ledger.ts` · `src/core/observability/llm-call-ledger.ts` · `rag-in/calibrate.ts` | `economy_lever_ledger` + `llm_call_ledger` → `agf metrics` / `agf savings` / `agf calibrate`. Reusável como série temporal para SPC.                                 |

## Guardrails transversais (toda alavanca herda)

1. **Opt-in, default byte-idêntico** — caminho sem flag inalterado; a alavanca só age quando habilitada (padrão Flow/economy).
2. **Registra num ledger** (`economy_lever_ledger` ou `perf_records`) via evento distinto → vira **número**, não promessa, em `agf metrics` / `agf learning stats`.
3. **Veredito honesto** — adjudicado por A/B como o Flow (`flow-report.ts`) / `agf calibrate`: ganho que **sobe a taxa de defeito** ⇒ `net_negative`, não entra no default.
4. **Piso pinado respeitado** — nunca podar/reordenar constraint/risk/decision/AC (reusar `DEFAULT_PINNED_TYPES`).
5. **Doc-only agora** — este backlog cria só doc + nodes; cada item vira sua **própria task TDD futura** (Red→Green→Refactor) quando puxado por `agf next`/`agf start`.

---

## Tema A — Aprendizado & controle de malha fechada (RL · neurociência · teoria de controle)

### 1. Reward-prediction-error + credit-assignment (dopamina / TD-learning)

- **Âncora:** Schultz, Dayan & Montague 1997 (_"A neural substrate of prediction and reward"_ — dopamina codifica **erro de predição de recompensa**, não recompensa); Sutton & Barto, TD(λ) + traços de elegibilidade.
- **Mecanismo:** trocar o AC pass/fail binário por um **reward graduado** `r = f(ac_pass, harness_delta, retries, cost_usd)`; computar `δ = r − V(s)` e **propagar crédito para trás** pelas arestas `parent_of`/`depends_on` (traços de elegibilidade) — decisões de **decomposição e roteamento** que levaram ao desfecho downstream recebem crédito proporcional. Alimenta os pesos do `sona-router` em vez do score binário atual.
- **Reuso:** `core/learning/performance-tracker.ts` (agregação) · `sona-router.ts` (pesos) · `sqlite-learning-store.ts` (`perf_records`) · `hooks/memory-learning-lifecycle-hooks.ts` (`on_feedback`, já carrega harnessDelta/cycleTime).
- **Por que é crítico:** argmax-kNN sobre **sinal binário não consegue aprender qual escolha estrutural causou o resultado** — o loop estagna num platô. RPE é o sinal mínimo, provado em neurociência e RL, que transforma "passou/falhou" em melhoria **dirigida** das decisões upstream.
- **Lever:** `reward_shaping`. **Esforço** M / **risco** baixo (default = score atual).
- **AC:** (a) reward graduado determinístico testado vs fixture; (b) crédito propagado pelas arestas (eligibility decay testável); (c) flag default preserva o ranking atual de quem não habilita.
- **Medir:** `agf learning stats` — harness-delta médio / AC-pass-rate sobem ao longo das sessões.

### 2. Bandit Thompson-sampling cost-aware no roteamento (exploração-explotação)

- **Âncora:** Thompson 1933 (amostragem posterior); Auer, Cesa-Bianchi & Fischer 2002 (UCB, regret `O(log n)`); Russo et al. 2018 (_tutorial on Thompson sampling_).
- **Mecanismo:** cada braço `(classe-de-task × modelo/agente)` vira uma posterior **Beta-Bernoulli** sobre AC-pass, com **custo como restrição** (cost-aware Thompson: amostra a qualidade, penaliza por `$`). Amostra das posteriores → escolhe o braço → atualiza online. Substitui o argmax guloso + o colapso para `manual` no cold-start.
- **Reuso:** `core/learning/routing-strategy.ts` (`decideRoute`) · `sona-router.ts` (scorer) · `model-hub/tier-router.ts` (pool cheap/build/frontier). **Depende do item 1** (consome o reward graduado).
- **Por que é crítico:** o argmax guloso tem **regret linear** — fica preso num modelo localmente-bom e **nunca descobre um mais barato/melhor**; o cold-start `<5` desliga o aprendizado (cai pra manual). Um bandit dá **regret logarítmico** e auto-calibra cheap→build→frontier por classe de task, melhorando **custo E qualidade ao mesmo tempo** — o coração da promessa.
- **Lever:** `bandit_route`. **Esforço** M / **risco** baixo-médio (atrás de flag; A/B contra `sona`).
- **AC:** (a) posterior Beta atualizada por outcome (determinístico com seed fixo); (b) restrição de custo respeitada (braço caro só vence com margem); (c) flag default = estratégia atual (`sona`/`manual`).
- **Medir:** `agf metrics` (custo-por-sucesso ↓) + `agf learning explain` (taxa de exploração saudável, não 0 nem 100%).

### 3. Forecast Bayesiano/Kalman que fecha o loop no próprio erro

- **Âncora:** Kalman 1960 (filtro recursivo ótimo); aprendizado bayesiano online; teoria de controle (observador, sinal de **inovação**).
- **Mecanismo:** modelar a **velocidade como estado latente**; cada task concluída produz uma **inovação** `(real − previsto)` que atualiza o estado e **encolhe o intervalo de confiança** com a evidência. Substitui a regressão linear de malha aberta que prevê ETA e nunca confere o acerto.
- **Reuso:** `core/insights/forecast.ts` (`calculateForecast`, hoje regressão + t-score CI) · `perf_records` (cycle times reais) · `dora-metrics.ts` (trend).
- **Por que é crítico:** um estimador que **ignora o próprio erro de predição não é um loop de controle** — é um chute repetido. Fechar a malha torna o `agf forecast` confiável e **adaptável a mudança de regime** (cadência de sprint muda, time entra/sai), em vez de extrapolar uma reta velha.
- **Lever:** `kalman_forecast`. **Esforço** M / **risco** baixo (default = regressão atual).
- **AC:** (a) update bayesiano por task concluída; (b) CI **encolhe** com evidência vs fixture; (c) sem histórico ⇒ cai no cálculo de regressão atual (byte-idêntico).
- **Medir:** erro `|ETA previsto − real|` ↓ ao longo de sprints (back-test no histórico do `perf_records`).

---

## Tema B — Verificação & detecção de anomalia (imunologia · codificação preditiva · SPC)

### 4. Detecção de drift via Controle Estatístico de Processo (CUSUM/EWMA)

- **Âncora:** Shewhart 1931 (cartas de controle); Page 1954 (_CUSUM_ — detecção de mudança de média com mínimo atraso); Roberts 1959 (_EWMA_).
- **Mecanismo:** cartas de controle sobre as séries temporais já gravadas no `llm_call_ledger`/`perf_records` (custo/task, AC-pass-rate, retries/task, latência); CUSUM/EWMA acumula desvio e **dispara um alarme** quando a série desloca além dos limites de controle → escala ao humano ou dispara `agf calibrate`. ~0 token, 100% determinístico.
- **Reuso:** `core/economy/economy-lever-ledger.ts` · `core/observability/llm-call-ledger.ts` · `insights/dora-metrics.ts` (já computa trend) · escalonamento do `autopilot-loop.ts`.
- **Por que é crítico:** **regressões silenciosas** — modelo degradou após update, testes ficaram flaky, custo creep — são o **maior risco de qualidade** de um loop autônomo, justamente porque ninguém está olhando. SPC é o detector **provado de menor custo** para mudança de regime. Hoje **nada** vigia isso.
- **Lever:** `drift_sentinel`. **Esforço** S-M / **risco** baixo (só observa + alerta).
- **AC:** (a) CUSUM/EWMA determinístico vs fixture com shift conhecido (detecta dentro de `k` amostras); (b) limites de controle configuráveis; (c) **zero alarme** em série estável (baixo falso-positivo).
- **Medir:** nº de regressões pegas **antes** do escalonamento humano / antes de virar incidente.

### 5. Sentinela de regressão imuno-inspirada (negative selection) antes do `done`

- **Âncora:** Forrest et al. 1994 (_"Self-nonself discrimination"_ — **seleção negativa**: detectores que casam com qualquer coisa "não-self" disparam); sistemas imunes artificiais (de Castro & Timmis).
- **Mecanismo:** construir uma biblioteca de assinaturas **"self"** a partir de tasks bem-sucedidas (forma do diff, delta de nº de testes, ligação AC↔teste, blast-radius típico); no `agf check`/pré-`done`, sinalizar saídas **"non-self"** (test-skip suspeito, AC alegado-mas-sem-teste, blast-radius anômalo, diff que toca arquivo sensível sem AC). Complementa o DoD determinístico em vez de substituí-lo.
- **Reuso:** `core/gaps/` (detectores existentes como base de feature) · `check`/DoD · `core/provenance/` (escada epistêmica claim→cited→validated→proven) · `code` impact (blast radius).
- **Por que é crítico:** pega **confident-wrong** — a falha exata que o DoD binário deixa passar: testes verdes mas o AC não foi de fato coberto, ou o "passou" veio de um teste skipado. É o **firewall de qualidade** antes de um `done` mentiroso (proibido pelo princípio de honestidade do projeto).
- **Lever:** `immune_sentinel`. **Esforço** M / **risco** baixo (sinaliza finding, não bloqueia silenciosamente).
- **AC:** (a) assinatura "self" determinística a partir do histórico; (b) "non-self" emitido como **finding/risk** no grafo (auditável), não swallow; (c) sem biblioteca ⇒ DoD inalterado.
- **Medir:** confident-wrong pegos vs. tasks marcadas `done` por engano (auditoria amostral).

### 6. Retry com gate de surpresa via codificação preditiva (erro de predição → re-plan, não retry cego)

- **Âncora:** Rao & Ballard 1999 (_predictive coding_ — transmitir/processar só o **erro de predição**); Friston (princípio da energia livre — agir para minimizar surpresa).
- **Mecanismo:** antes de rodar os testes, o executor **prevê** quais testes deveriam passar; após rodar, `surpresa = divergência(previsto, real)`. **Surpresa alta** ⇒ o modelo entendeu a task errado ⇒ rotear para **re-plan/decompose** (consertar o entendimento); **surpresa baixa** ⇒ aplicar a receita de retry determinística atual (problema mecânico).
- **Reuso:** `core/autonomy/autopilot-loop.ts` (`onFailure`/retry) · `recovery-recipes.ts` (receitas determinísticas) · `context/executor-brief.ts` (onde a predição é declarada).
- **Por que é crítico:** o retry atual é **backoff cego que re-executa o mesmo mal-entendido** — gasta ciclos caros sem mudar a causa. O gate de surpresa **conserta a coisa certa** (re-plan quando o erro é conceitual, retry quando é mecânico), cortando ciclos desperdiçados e elevando a taxa de correção real.
- **Lever:** `surprise_retry`. **Esforço** M-L / **risco** médio (atrás de flag; fallback = recipe atual).
- **AC:** (a) surpresa computada do conjunto de testes previsto×real; (b) limiar roteia re-plan vs retry; (c) sem predição declarada ⇒ recipe determinística atual (byte-idêntico).
- **Medir:** ciclos de retry/task ↓ **com** taxa de correção ≥ a atual.

---

## Tema C — Qualidade estrutural do grafo (teoria da informação · física · grafos)

### 7. Atomicidade da decomposição por teoria da informação (MDL / acoplamento-coesão)

- **Âncora:** Rissanen 1978 (_Minimum Description Length_); informação mútua (Shannon); modularidade de Newman 2006 (comunidades por densidade intra vs inter).
- **Mecanismo:** pontuar uma **decomposição inteira** por comprimento de descrição / **informação mútua entre subtasks** — premiar **baixo acoplamento** inter-subtask e **alta coesão** intra-subtask; sinalizar non-atomic (uma subtask abrange muitos concerns ⇒ MI alta com várias) ou over-split (subtasks redundantes ⇒ MDL pior que juntar). Torna "atômico" **mensurável**, não heurística de contagem de palavras/AC.
- **Reuso:** `core/planner/smart-decompose.ts` (estratégia) · `decompose.ts` (detecção de oversize) · `gaps/detect-atomicity.ts` (gap kind `non_atomic_task`).
- **Por que é crítico:** decomposição ruim é a **causa-raiz upstream** de rework, tasks oversized e AC mal cobertos — tudo cai em cascata na fase IMPLEMENT. Um objetivo de atomicidade **informacional** torna o gate de PLAN principiado em vez de adivinhação. Hoje 1-AC=1-subtask é ingênuo e cego ao acoplamento real entre as partes.
- **Lever:** `mdl_atomicity`. **Esforço** M / **risco** baixo-médio (refina `detect-atomicity`, default = heurística atual).
- **AC:** (a) score MDL/MI determinístico vs fixture de decomposições boa/ruim; (b) sinaliza non-atomic e over-split; (c) default não altera a contagem de subtasks de quem não habilita.
- **Medir:** `agf gaps` (`non_atomic_task` ↓) + rework downstream (re-open de tasks) ↓.

### 8. Escalonamento ciente de criticalidade (Critical Chain / betweenness / percolação)

- **Âncora:** Goldratt 1997 (_Critical Chain_, TOC — o throughput é regido pelo gargalo); centralidade de **intermediação (betweenness)** de Freeman; teoria da percolação (conectividade crítica de redes).
- **Mecanismo:** `next` passa a ranquear as tasks desbloqueadas por **criticalidade no grafo** (pertencer ao caminho crítico **+** betweenness — quão central a task é para destravar o resto), não só por priority/size — **puxa primeiro a task que alimenta o gargalo** e protege a cadeia crítica com buffer. Mantém **WIP=1**, mas garante que é na task **certa**.
- **Reuso:** `core/planner/next-task.ts` (chave de ordenação) · `dependency-chain.ts` (caminho crítico **já computado** — só não é usado na escolha) · `insights/bottleneck-detector.ts` (sinais de gargalo).
- **Por que é crítico:** WIP=1 numa task **não-crítica** infla o lead time enquanto o gargalo espera — exatamente o desperdício que a Little's Law/TOC do projeto querem cortar. Escalonar por criticalidade é a alavanca de **fluxo de maior alavancagem**, e o caminho crítico **já existe no código** — é puro reuso ocioso.
- **Lever:** `critical_schedule`. **Esforço** S-M / **risco** baixo (refina o sort, default = priority/size).
- **AC:** (a) score de criticalidade determinístico (caminho crítico + betweenness); (b) tie-break preserva a ordem atual quando a criticalidade empata; (c) flag default = sort atual (priority/size/createdAt).
- **Medir:** `agf insights` — lead time / flow efficiency ↑ **sem** violar WIP=1.

---

## Materialização & rastreabilidade

- **Grafo:** epic **"Agentic-Loop Bio/Neuro Quality Levers"** + 8 tasks (uma por item) com AC, `xpSize`
  e prioridade por tema, mais a aresta `depends_on` **item 2 → item 1** (o bandit consome o reward graduado).
  Criado via `agf node add` / `agf edge add` (determinístico) quando o backlog for puxado.
- **Spec-sync:** este doc registrável e linkável ao epic (`agf spec-sync register` + `link`).
- **Escopo deste documento:** entrega **apenas o backlog** (doc + nodes). **Nenhum código de alavanca**
  ainda — cada item vira sua própria task TDD (Red→Green→Refactor) quando `agf next`/`agf start` puxar.

> Cada alavanca só conta quando vira **número** no `economy_lever_ledger`/`perf_records`. Sem medição
> honesta e sem A/B que prove que não sobe a taxa de defeito, não entra no default — só na flag opt-in.
