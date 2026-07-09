# Visão: agent-graph-flow v1.0.0 — Release Oficial

Entregar a **primeira versão oficial** do agent-graph-flow: o agente SWE autônomo,
local-first e token-frugal, com o **diferencial de custo provado e medido**, todas as
frentes de trabalho em voo **encerradas no grafo**, e qualidade em **grade de release (B)**.

O motor já está maduro (71% do grafo `done`), mas há um corpo de trabalho **"feito mas não
fechado"**: 3 épicos em voo cujo código existe (parte não commitada) sem encerramento no
grafo, harness em grade C (65.6, abaixo do gate ≥70), e a promessa "custo brutalmente baixo"
ainda **não comprovada end-to-end**. Esta release **não é construir — é encerrar e provar**.

**5W2H** — _What:_ v1.0.0 "officially complete" com custo medido e frentes fechadas.
_Why:_ transformar "feito mas não fechado" em "fechado, provado, release-grade".
_Who:_ o dono (solo dev) + early adopters fugindo do billing por token imprevisível do
Copilot (migração para cobrança medida em 1-jun-2026). _Where:_ local-first, Node ≥20, CLI
`agf` + TUI Ink, multi-provider (OpenRouter/Ollama/Copilot). _When:_ agora, **release interno**
(sem npm publish nesta versão). _How:_ fechar épicos pelo lifecycle do grafo, provar economia
via eval + `metrics --baseline`, elevar harness a B, validar E2E. _How much:_ estimável via
`plan_sprint` + `forecast(dora)`.

**Jobs To Be Done (JTBD)**

- Quando afirmo custo brutalmente baixo, quero **provar com número real** (baseline de
  3 termos, $/sucesso, fator 2–4x) — não apenas afirmar.
- Quando há código pronto mas não fechado, quero **encerrar o ciclo** (DoD, AC validada,
  épico promovido) para o grafo refletir a verdade.
- Quando surge um modelo de LLM novo, quero saber se ele **opera o agente de verdade**
  (eval product-relevant) com significância estatística (n≥3, intervalo de confiança).
- Quando faço um release, quero **grade B** (harness ≥70), zero stub e E2E validado com
  provider real.
- Quando ligo uma alavanca de compressão lossy, quero **garantia de não-regressão**
  (AST gate, no-grow, preserve-errors, auto-revert).

## Requisitos

- A v1.0.0 deve encerrar no grafo os 3 épicos em voo (ICM Fusion, Token Economy Unification, Eval Framework) sem duplicar seu conteúdo já existente.
- O custo brutalmente baixo deve ser medido e documentado num run real (metrics baseline e simulate), não apenas alegado.
- A release deve atingir harness grade B (score maior ou igual a 70) e zero stubs.
- Toda mudança respeita não-regressão (build, typecheck, test e lint verdes) e backward-compatibility na API MCP.

## Funcionalidades

### F1 — Aterrissar o WIP com não-regressão (Must)

Commitar o trabalho não commitado (47 modificados + 94 untracked) em incrementos coerentes
por épico, mantendo a árvore sempre verde.

- [ ] Dado o WIP atual, Quando eu commitar em incrementos por épico, Então `build` + `typecheck` + `test` + `lint` ficam verdes a cada commit.
- [ ] Dado `npm run audit:stubs`, Quando rodar após a aterrissagem, Então retorna zero stubs (exceto `start`/`done` até F3).
- [ ] Dado o smoke `npm run dev -- --help`, Quando rodar, Então lista todos os comandos sem erro.

### F2 — Fechar ICM Fusion: consolidação dos épicos em voo (Must)

Encerrar EP-1 (CLI Provider Abstraction), EP-2 (Output Compression) e EP-6 (TUI
Production-Grade) — cujas tasks já estão `done` — e completar EP-3/EP-4/EP-5.

- [ ] Dado EP-1/EP-2/EP-6 com tasks `done`, Quando validar AC e rodar DoD, Então os 3 épicos passam a `done` com AC validadas.
- [ ] Dado EP-3 (Cache Determinístico), EP-4 (Simplified DX 2-call) e EP-5 (Testes o browser agent), Quando decompostos e implementados via TDD, Então cada um fecha com DoD.

### F3 — Comandos `start` e `done` reais (Must)

Conectar os pipelines puros já existentes em `start-cmd.ts` e `done-cmd.ts` às dependências
reais (store port, next, DoD, memory), eliminando os 2 únicos stubs.

- [ ] Dado o pipeline puro existente, Quando conectar as deps reais, Então `agf start` puxa a próxima task e marca `in_progress`.
- [ ] Dado um id de task, Quando rodar `agf done <id>`, Então roda o DoD, marca `done` e sugere a próxima.
- [ ] Dado `start-cmd.test.ts` e `done-cmd.test.ts`, Quando rodar, Então cobrem caminho feliz e erro.

### F4 — Token Economy Unification: lossy-gate, AAAK e ledger (Must)

Encerrar o épico de economia: implementar os invariantes INV-1..6 (live-zone, no-grow,
threshold-por-tipo, preserve-errors, gate-lossy obrigatório, cap de 10MiB) e cablear AAAK +
content-router + economy_lever_ledger no caminho real.

- [ ] Dado uma alavanca lossy ativa, Quando ela roda, Então um AST gate verifica e auto-reverte em violação, nunca aumentando tokens nem corrompendo mensagens de erro.
- [ ] Dado `economy_lever_ledger`, Quando uma alavanca economiza, Então o saving é registrado por lever (accepted/reverted) e aparece em `metrics`.
- [ ] Dado `aaak-compressor` e `content-router`, Quando integrados, Então estão wired no caminho real (não órfãos) e cobertos por teste.

### F5 — Prova de economia: transformar a promessa em número (Must)

Medir e documentar o custo num run real, fechando a lacuna entre "alega custo baixo" e
"prova custo baixo".

- [ ] Dado um run real, Quando rodar `metrics --baseline`, Então decompõe a fatura nos 3 termos (input-full / cache-pago / output) com veredito §6 e fator contrafactual.
- [ ] Dado `metrics --simulate`, Quando re-precificar, Então mostra o custo sob todos os modelos e o $/sucesso.
- [ ] Dado os números obtidos, Quando documentar em `docs/reference/`, Então o fator de redução (alvo 2–4x) fica registrado e reproduzível.

### F6 — Eval Framework product-relevant (Must)

Corrigir oracles, adicionar cenários que testam operar o produto, e re-benchmarkar com
significância estatística.

- [ ] Dado os oracle bugs (T3 arg order, T5 `result.ok`, T3 orphan file), Quando corrigir, Então T0–T5 rodam determinísticos.
- [ ] Dado os cenários `graph-crud` e `delivery-pipeline`, Quando rodar, Então testam operar o produto (não só escrever função isolada).
- [ ] Dado os top-3 modelos (maverick, v4-flash, grok-4.3), Quando rodar a full-suite com n≥3 + intervalo de confiança, Então o scorecard é estatisticamente significativo.

### F7 — Harness Grade B (≥70) (Must)

Elevar o Harnessability Score de 65.6 (C) para ≥70 (B), atacando as 3 dimensões fracas.

- [ ] Dado Architecture Fitness em 33, Quando fechar Harness-A, Então a dimensão sobe para ≥70.
- [ ] Dado Error Handling em 0, Quando fechar Harness-B, Então a dimensão sobe para ≥70.
- [ ] Dado Provenance em 22, Quando fechar Harness-D, Então a dimensão sobe para ≥50 e `analyze(harness_scan)` total ≥70.

### F8 — Validação E2E com provider real (Must)

Rodar o caminho completo `deliver` num diretório vazio contra um provider autenticado de
verdade — algo nunca feito no sandbox de dev.

- [ ] Dado um diretório vazio e um provider real (OpenRouter/Ollama/Copilot autenticado), Quando rodar `agf deliver "<pedido>"`, Então entrega ponta-a-ponta (PRD→grafo→TDD→done).
- [ ] Dado o run E2E, Quando concluir, Então o `llm_call_ledger` está preenchido com usage real (não estimado).

### F9 — Cobertura de testes crítica (Must)

Cobrir os subsistemas hoje sem nenhum teste.

- [ ] Dado `implementer/` sem testes, Quando adicionar testes, Então o caminho crítico do loop TDD fica coberto.
- [ ] Dado `deployer/` e `listener/` sem testes, Quando adicionar testes, Então cada um tem ≥1 arquivo cobrindo seu caminho crítico.

### F10 — Guardian: gate de segurança (dormente → ativo) (Should)

Ativar o reviewer de segurança de tool-calls (allow/deny/ask), plugando-o no executor/sandbox.

- [ ] Dado uma tool-call perigosa no autopilot, Quando o guardian estiver ativo, Então ele intercepta com decisão allow/deny/ask antes da execução.

### F11 — Sandbox: isolamento de build (dormente → ativo) (Should)

Ativar o executor de build isolado com detecção de stack e fallback dentro do loop autônomo.

- [ ] Dado um build no loop autopilot, Quando o sandbox estiver ativo, Então o build roda isolado com fallback de stack em falha.

### F12 — reasoning_effort condicional — frente C (Should)

Roteador determinístico de esforço de raciocínio (gap de paridade ~184x vs codex), gastando
output só quando necessário.

- [ ] Dado uma task simples, Quando o roteador decidir o esforço, Então usa o mínimo; e escala no retry se falhar.
- [ ] Dado um run, Quando medir, Então a fração de tokens de reasoning cai em tasks triviais sem perda de resolve%.

### F13 — Golden dataset + CI eval (Should)

Persistir resultados do scenario-runner e rodar o eval no CI.

- [ ] Dado um run de eval, Quando concluir, Então o resultado é persistido em `eval_run` (golden dataset consultável pelo RAG).
- [ ] Dado o pipeline CI, Quando rodar, Então `npm run eval` executa a suite e falha em regressão.

### F14 — Tier-router default = MoE budget data-backed (Should)

Ajustar o default do tier-router para o modelo MoE de melhor custo-benefício segundo o benchmark.

- [ ] Dado o benchmark (maverick mais eficiente, v4-flash mais barato), Quando ajustar o default, Então o tier `build` usa um MoE budget e o `metrics` reflete a economia.

### F15 — Capacidades novas oportunistas (Could)

Itens de paridade/economia avançada, sem bloquear o release: subagent + parallel-tools (gap
vs codex/opencode), prompt_caching via adapter direto (estender `anthropic-cache-control`
além do Copilot SDK), dashboard HTML de resultados de eval, e consolidar o `core/llm` gateway
dormente com o `model-hub`.

- [ ] Dado tempo após os Musts, Quando priorizar um item Could, Então ele entra como task de menor prioridade sem regressão.

## Restrições

- Restrição: não-regressão — `build` + `typecheck` + `test` + `lint` verdes a cada incremento; smoke `--help` ok.
- Restrição: backward-compatible — zero breaking changes na API MCP; mudanças de schema compatíveis.
- Restrição: padrões do repo — ESM (`.js` em imports relativos), Zod v4, strict TS sem `any`, kebab/Pascal/camel, typed errors, logger (sem `console.log`).
- Constraint: disciplina de fluxo — TDD obrigatório, WIP=1, DoD antes de `done`, pull via `next`.
- Constraint: qualidade — harness ≥70 (B) no release; alvo ≥75 (B+) no épico de economia.
- Constraint: eval — cenários ≤5 min cada, seeds auto-contidos, oracle = test suite (exit 0).
- Restrição: fora de escopo nesta versão — npm publish; dashboard web React / API REST; verticais (Siebel/DaVinci/Translation/Journey); eval de TUI via CDP / MCP server externo / LSP.

## Riscos

- Risco: escopo grande demais ("Consolidar + economia + novo") para um ciclo. Mitigação: Pareto — Musts primeiro, Shoulds só após o release-core; WIP=1; faseamento por sprint.
- Risco: aterrissar 94 arquivos de uma vez quebra a não-regressão. Mitigação: commits incrementais por épico, `test:blast` a cada um, reverter incremento isolado em falha.
- Risco: compressão lossy regride qualidade ou corrompe erros. Mitigação: INV-1..6 — AST gate + no-grow + preserve-errors + auto-revert.
- Risco: benchmark flaky ou autopilot false-positive distorce resultados. Mitigação: seeds determinísticos, n≥3, oracle = test suite, debugar autopilot antes do benchmark sério.
- Risco: E2E exige provider autenticado que o sandbox não tem. Mitigação: usar OpenRouter/Ollama local; o dono roda `agf login` ou aponta `base-url`.
- Risco: harness não chega a 70 no prazo. Mitigação: atacar as 3 dimensões fracas (A/B/D) com tasks dedicadas e medir o trend a cada fechamento.
