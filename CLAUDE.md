<!-- agent-graph-flow:start -->

## agent-graph-flow (`agf`) — agent-graph-flow

Este projeto usa **agent-graph-flow** para gestão de execução via grafo persistente (SQLite).
Dados em `workflow-graph/graph.db` (local, gitignored). **Tudo via o CLI `agf` — zero MCP.**

### ⚠️ Regra de Execução OBRIGATÓRIA

**O grafo (`agf`) é a fonte de verdade ABSOLUTA. Nenhuma implementação acontece fora do grafo.**

1. **Node deve existir** — antes de escrever QUALQUER código, o node correspondente DEVE existir no grafo (`agf node add` ou `agf import-prd`).
2. **Fluxo obrigatório** — `agf start → [implementar com TDD] → agf done` (pipeline) ou `agf next → agf context <id> → [TDD] → agf check <id> → agf node status <id> done` (granular) — SEM EXCEÇÕES.
3. **Epic = estrutura primeiro** — `agf import-prd` (ou `agf node add` + `agf edge add`) cria Epic + tasks + edges ANTES de implementar.
4. **Status tracking** — `agf node status <id> in_progress` ANTES de codar, `agf node status <id> done` (ou `agf done <id>`) APÓS completar.
5. **Validação** — `agf check <id>` (DoD + AC + TDD) após cada task.
6. **Zero trabalho não-rastreado** — se não tem node no grafo, CRIAR PRIMEIRO.

> **Sem node no grafo = sem código escrito. Tudo via `agf` — zero MCP.**

### ⭐ Regras de Ouro (antes de qualquer código)

1. **Investigue o git + o grafo PRIMEIRO** — rode `agf preflight "<tópico>"` antes de implementar: ele lê branch/ahead-behind/dirty/stash + nodes do mesmo tema + WIP. Veredito `wip-conflict`/`duplicate-risk` = PARE, não duplique trabalho em andamento/entregue de outra stream.
2. **Investigar e EXPANDIR o que existe, nunca recriar do zero** — `agf search`/`agf query` + grep antes de escrever; estenda o módulo dono. Só crie novo se comprovadamente não existir. Evite duplicação (DRY).
3. **Dogfood** — conduza todo o trabalho com o próprio `agf` e use comandos recém-criados no fluxo; o repo É o produto.
4. **No repo, rode `npm run dev -- <cmd>`** — nunca o binário instalado (fica stale vs. o código em edição).
5. **Código/grafo vencem memória/plano** — contagens em memórias ficam stale; reconcilie com `agf stats`/`agf query`.
6. **Qualidade por padrão (Clean Code · SOLID · KISS/YAGNI)** — arquivos < 800 linhas, funções < 50, 1 responsabilidade por arquivo, imutabilidade, sem `any`, erros tipados, comentário-cabeçalho explicando o "porquê" do módulo (navegação agêntica), reuso > duplicação.
   **NUNCA criar arquivos gigantes** — modularize antes de escrever (SRP/SOLID/composição). O teto de 800 linhas é enforced via `agf lint-files` (ou `agf lint-files --staged`) + git gate. Antes de criar, decomponha em módulos coesos.
   **Superfície de autoria** — crie/scaffolde artifacts via CLI: `agf skill new <name>` (skill), `agf agent create <name>` (role TOML), `agf hooks add <channel>` (hook). Todos auto-listados via seu respectivo `list`.

> As regras de ouro vivem no agf (este bloco + `agf preflight`), não só na cabeça do agente.

### Custo de token & providers (3º pilar)

**Providers** — `agf provider use <id>` escolhe por onde a chamada LLM vai. A _mesma_ via CLI serve qualquer agente (Claude, Copilot, Codex, Cursor, Gemini…) — **nunca MCP**.
Todos os 10 providers são auto-detectados de env vars (`agf doctor --providers` lista quais estão configurados):

| Provider     | Env var                | Gateway    |
| ------------ | ---------------------- | ---------- |
| `anthropic`  | `ANTHROPIC_API_KEY`    | auto-wired |
| `openai`     | `OPENAI_API_KEY`       | auto-wired |
| `openrouter` | `OPENROUTER_API_KEY`   | auto-wired |
| `gemini`     | `GEMINI_API_KEY`       | auto-wired |
| `bedrock`    | `BEDROCK_API_KEY`      | auto-wired |
| `azure`      | `AZURE_OPENAI_API_KEY` | auto-wired |
| `deepseek`   | `DEEPSEEK_API_KEY`     | auto-wired |
| `glm`        | `GLM_API_KEY`          | auto-wired |
| `kimi`       | `KIMI_API_KEY`         | auto-wired |
| `groq`       | `GROQ_API_KEY`         | auto-wired |
| `copilot`    | (via `agf login`)      | default    |
| `ollama`     | (local, $0/token)      | manual URL |

- **OpenRouter:** `export OPENROUTER_API_KEY=…` → `agf provider use openrouter`. Fixe um modelo com `--pin` (ex.: `agf deliver "…" --live --pin deepseek/deepseek-v4-flash`) ou deixe o tier-router escolher (cheap→`deepseek-v4-flash`, build→`llama-4-maverick`, frontier→`qwen3.6-plus`).

**Alavancas automáticas** (sem comando — agem no gateway): diff-edits (só a região alterada), repo-map ranqueado por PageRank (~1k tok), lossy-gate (auto-revert se a compressão quebra o sentido), AAAK, content-router (SmartCrusher p/ arrays JSON homogêneos + compressão AST de código), **CCR reversível** (cacheia o original + marcador ⟨ccr:hash⟩ → outcome `ccr_dropped`; resgate com `agf retrieve <hash>`), retry com feedback compacto. Cada economia entra no `llm_call_ledger`.

**Medir** (transformar a promessa em número):

- `agf metrics [--economy-report]` — tokens/$ por task e sessão + o que as alavancas pouparam.
- `agf metrics --simulate` — re-precifica a fatura real sob todos os modelos.
- `agf eval --models <ids> --live` — cenários reais → scorecard (resolve% × custo-por-sucesso).
- `agf savings` — economia cumulativa de tokens por task (ledger real, cached tokens contabilizados automaticamente).
- `agf savings --reset` — zera o contador cumulativo.

**Alavancas bio/matemáticas (opt-in)** — `agf economy list` lista cada lever com o flag `enabled` + tokens `saved` cumulativos (JSON `--select data.levers`); `agf economy on <lever>` / `agf economy off <lever>` ligam/desligam. Default tudo OFF → comportamento byte-idêntico. Levers fundamentados em papers/biologia: `memory_salience` (ACT-R), `ncd_dedup` (Kolmogorov/NCD), `forage_stop` (MVT de Charnov), `budget_kleiber` (lei de Kleiber 3/4), `heat_kernel` (difusão `e^{-tL}`), `mdl_select` (MDL de Rissanen). Cada economia entra no `economy_lever_ledger` e aparece em `agf metrics --select data.levers`.

**Rastreabilidade** — cada chamada LLM é gravada no `llm_call_ledger` com `node_id` (atribuição por task), `cached_input_tokens`, `cost_usd` e `session_id`. O `agf done` registra automaticamente a economia da task. Use `agf doctor --providers` para ver quais providers estão configurados no ambiente.

**Guardrail: compressão de saída shell antes de ler** — ao rodar comandos shell externos e ler o resultado:

- **Claude Code** (PostToolUse Bash hook ativo): a compressão já ocorre automaticamente — agentes **NÃO devem** prefixar com `agf compress run` (evita dupla-compressão).
- **CLIs hookless (Copilot, Codex, Cursor, Gemini)**: é **obrigatório** envolver a saída via `agf compress run -- <cmd>` ou `cmd | agf compress run --stdin` antes de ler. Sem esse passo, tokens brutos são consumidos sem compressão.

### Harness de Completude — `agf gaps` (detect → delegate → verify)

`agf gaps` é determinístico (~0 token) e acha lacunas de completude no grafo: rastreabilidade
requirement→task→test, cobertura de AC na decomposição, AC sem testabilidade, NFR faltando,
edge-cases/erros ausentes, ambiguidade, atomicidade, design/estimate drift.

**A IA condutora (você — Copilot/Claude/Codex/Cursor/Gemini/OpenCode) fecha as lacunas**; o agf só
detecta e re-verifica. Cada gap traz `applyVia`: os comandos `agf` exatos pra fechá-lo.

**Loop:**

1. `agf gaps --severity required --json` — pega os blockers acionáveis.
2. Pra cada gap, rode o `applyVia` (ex.: `agf edge add --from <task> --to <req> --type implements`), escolhendo a semântica.
3. `agf gaps` de novo até `ready: true` — desfecho determinístico, independente de qual CLI fechou.

Filtros: `--kind <k>`, `--severity required|recommended`, `--limit N`, `--json` (relatório completo p/ loops).

### Brief de execução — delegando uma task ao executor

**Heurística:** _especifique a ponta e a saída; delegue o meio._ Onde o executor pode errar caro
(contrato, limites, incerteza) você gasta tokens preventivos baratos; o que ele faz bem sozinho
(escrever o código dentro das guardas) você deixa livre. "De outro mundo" não é um prompt mais longo —
é um que fecha as saídas de erro caras com o mínimo de palavras.

Gere o esqueleto pronto a partir do node: `agf brief <id>` (`--format markdown|json|claude-prompt`).
Ele auto-preenche o que o grafo sabe (intenção, AC, blast radius, deps, prontidão) e deixa os campos
de julgamento como `<fill: …>` pra você completar.

**Template:**

- **Intenção** (1 linha): para que existe / efeito desejado.
- **Tarefa** (atômica): uma só — node do grafo: `<id>`.
- **Imite:** arquivo-espelho a seguir como padrão.
- **Ler/tocar** (exato): caminhos + símbolos a reusar.
- **Contrato:** assinatura/tipos/comportamento (trechos pequenos **inline**; arquivos grandes → aponte o path).
- **AC** (testável): 2–4 critérios verificáveis.
- **NÃO:** refatorar vizinhos / deps novas / tocar X / mudar default.
- **Blast radius:** arquivos sensíveis → mudança aditiva.
- **Orçamento:** ~N arquivos, sem deps, sem hot-path.
- **Incerteza:** se o contrato falhar ou faltar info, PARE e reporte; se ambíguo, escolha e justifique em 1 linha.
- **Teste com:** fixture/stub concreto (ex.: `new Database(':memory:')`, stub da chamada LLM com contador) — evita setup flaky ou bater em auth que não existe no sandbox.
- **DoD:** typecheck · teste do arquivo · blast · lint.
- **Self-review antes de retornar** (~30 tokens, substitui um ciclo caro): sobrou placeholder? escopo vazou? AC cobertos? default intacto?
- **Retorne (schema):** `{arquivos[], testes{passed,failed}, desvios[]}` — sem dump de código; não commitar.

**Validação de retorno** — o condutor usa `parseExecutorResult(resposta)` para parsear o JSON estruturado
do executor (com fallback regex) e `validateBriefReady(brief)` para verificar que todos os campos de
julgamento (`imitate`, `readTouch`, `contract`, `testWith`) foram preenchidos antes de delegar.
Retorno inválido → rejeitar e pedir correção; válido → fechar o loop em 1 passo.

> Retorno estruturado torna a validação trivial (parse em vez de leitura). O condutor valida e fecha o loop; o executor escreve o meio.

### Fluxo de trabalho OBRIGATÓRIO

**Pipeline (2 calls):**

```bash
agf start                 # wake-up + next + context + marca in_progress
# … implementa com TDD (Red → Green → Refactor) …
agf done <id>             # DoD + memória + marca done + sugere próxima
```

**Granular (controle fino):**

```bash
agf next                  # puxa a próxima task (pull, WIP=1)
agf context <id>          # context-pack compact + RAG
# … TDD …
agf check <id>            # Definition of Done + aderência TDD
agf node status <id> done # transição validada (status_flow)
```

**Modo delegado (sem provider — qualquer CLI-agente dirige):** se nenhum provider
está conectado ao agf, os comandos `--live` (`agf run`/`agf deliver`/`agf autopilot --live`)
NÃO quebram — retornam `mode:delegated` com o brief pronto p/ VOCÊ (Claude/Copilot/Codex/…)
executar com seu próprio LLM. Feche o loop com `agf submit`:

```bash
agf next                  # próxima task
agf brief <id>            # spec de delegação (intenção, AC, contrato, blast)
# … você implementa com seu próprio LLM e aplica os edits …
agf submit <id> --result '{"arquivos":["x.ts"],"testes":{"passed":N,"failed":0},"desvios":[]}'
                          # valida → blast → DoD → done; desvios viram findings
```

### Lifecycle (9 fases) — comandos `agf` por fase

1. **ANALYZE** — `agf import-prd` · `agf node add` · `agf gate` (Definition of Ready)
2. **DESIGN** — `agf node add`/`agf edge add` (ADRs, interfaces) · `agf constitution` · `agf gate design`
3. **PLAN** — `agf decompose` · `agf template apply` · AC testável por task
4. **IMPLEMENT** — `agf start` → TDD → `agf done` (ou granular) · `agf harness`
5. **VALIDATE** — `agf check <id>` · `agf gate` · `agf metrics`
6. **REVIEW** — `agf export` · `agf insights` · `agf gate review`
7. **HANDOFF** — `agf memory write` · `agf snapshot create` · `agf gate handoff`
8. **DEPLOY** — `agf export` · `agf forecast` · `agf gate deploy` (harness ≥ 70)
9. **LISTENING** — `agf node add` · `agf import-prd` (novo ciclo)

### Índice de skills do ciclo (escolha a abordagem certa)

Qualquer CLI lê esta tabela pra escolher a skill certa pro intent atual — a coluna **Quando usar** mapeia situação → skill. Rode com `agf skill show <name>` ou siga o comando de entrada.

| Skill                      | Fase   | Quando usar                                                                | Comando de entrada                                  | Skills relacionadas                                |
| -------------------------- | ------ | -------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `graph-backlog-generation` | PLAN   | Start of a cycle, a vague idea, or "what should we build next?"            | `agf stats --select data.byStatus`                  | graph-builder-leafcutter, graph-woodpecker         |
| `graph-builder-leafcutter` | BUILD  | An unblocked task exists; implement the backlog end-to-end                 | `agf start`                                         | graph-backlog-generation, graph-woodpecker         |
| `graph-woodpecker`         | HARDEN | Code exists and works but needs hardening (bugs, vulns, debt, blind spots) | `agf harness --violations --select data.violations` | graph-builder-leafcutter, graph-backlog-generation |

### Definition of Done (rode `agf check <id>` antes de `agf done`)

| #   | Check                                       | Severidade  |
| --- | ------------------------------------------- | ----------- |
| 1   | Tem acceptance criteria                     | required    |
| 2   | Score AC ≥ 60 (INVEST)                      | required    |
| 3   | Sem blockers não resolvidos                 | required    |
| 4   | Status flow válido (passou por in_progress) | required    |
| 5   | Tem descrição                               | recomendado |
| 6   | Não oversized (sem L/XL sem subtasks)       | recomendado |
| 7   | ≥1 AC testável                              | recomendado |
| 8   | testFiles preenchido                        | recomendado |

### Princípios de Fluxo (Little's Law + Lean + TOC)

- **WIP = 1** — no máximo 1 task `in_progress`. `cycle_time = WIP / throughput`.
- **Pull, não Push** — `agf next` puxa; nunca empurrar para in_progress sem terminar a anterior.
- **Gargalo primeiro (TOC)** — se VALIDATE acumula, pare de implementar e valide.
- **Eliminar desperdício (Lean/Toyota)** — sem overproduction (features não planejadas), sem waiting (tasks blocked sem ação), use `agf context` (não dumps), TDD elimina defects.
- **Métricas de fluxo** — `agf insights` / `agf forecast`: cycle time, lead time, throughput, flow efficiency (> 40%).

### Princípios XP Anti-Vibe-Coding

- **TDD obrigatório** — Teste antes do código. Sem teste = sem implementação.
- **Anti-one-shot** — Nunca gere sistemas inteiros em um prompt. Decomponha em tasks atômicas (`agf decompose`).
- **Decomposição atômica** — Cada task completável em ≤2h.
- **Honestidade** — surfar pontas soltas como finding/risk no grafo (`agf node add --type risk`); nunca marcar done com alegação falsa.
- **CLAUDE.md como spec evolutiva** — documente padrões e decisões.

### Gates de Teste Hierárquicos

| Gate  | Comando              | Trigger                             |
| ----- | -------------------- | ----------------------------------- |
| Task  | `npm run test:blast` | a cada task finalizada (`agf done`) |
| Épico | `npm run test:node`  | promoção de épico                   |
| PR    | `npm test`           | antes de push/PR                    |

Blast obrigatório no `agf done`. Full obrigatório pré-PR.

### Spec-Driven Development (spec-kit, via `agf`)

- `agf constitution` — princípios governantes (indexados, validados em gates).
- `agf preset --apply <name>` — workflow (default/strict-tdd/agile-light/enterprise).
- `agf spec --generate <template>` / `--validate <file>` — specs por fase.
- `agf spec-sync link <specId> <nodeId>` — specs vivas ligadas ao grafo.

### Memory ≠ Estado Atual

Memory files são snapshots point-in-time, não estado live. Contagens ("X/Y done") ficam stale.

1. Grep pelo arquivo/função — se existe, o memory é stale.
2. **Código vence memory.**
3. Reconcilie com `agf stats`/`agf query` antes de planejar.

> Nunca confiar em contagens de progresso de memories. Verificar no código/grafo primeiro.

### Contexto do Projeto

Stack detectada: node, react, vitest, typescript.

- **TypeScript**: Usar tipos estritos (`strict: true`). Evitar `any`. Tipar retornos de funções públicas.
- **React**: Componentes funcionais com hooks. Props tipadas via interfaces. Evitar `useEffect` com deps vazias. Testar com React Testing Library (RTL).
- **Testes (Vitest)**: Arquivos `*.test.ts`. Use `describe`/`it`/`expect`. Mock com `vi.fn()`. Blast: `npm run test:blast`.
- **Node.js**: ESM preferido (`"type": "module"`). Use `node:` prefix em imports built-in.
- **Package Manager**: npm. Lockfile deve estar versionado.

> **Referência completa de comandos (sob demanda, ~0 token — não fixada aqui):** `agf help` (índice agrupado dos 260+ comandos) · `agf <comando> --help` (flags de um comando) · `agf retrieve-command "<intenção>"` (RAG-IN: intenção em linguagem natural → comando exato) · `agf skill list` (skills do ciclo de vida).
>
> **Web local (`agf dashboard`):** SPA com 2 abas — **Grafo** (`@xyflow`, busca/filtros/drill-down) e **Economia** (custo real, economia delegate, cache local, levers). Mesma paleta do `agf` TUI/the project site. Sobe via `agf dashboard` ou `agf init` (serve automático).

<!-- agent-graph-flow:end -->
