# Visão: Pivot CLI-first — matar o MCP, expor 100% do `agf`

Objetivo principal: virar a chave de **MCP-centric** para **CLI-first**. Todo contexto que
o produto gera, instrui e modela passa a ter o CLI `agf` como palco — não mais o ecossistema
MCP. As ferramentas de IA (Claude Code, Copilot, Cursor, Codex, Windsurf, opencode) aprendem
a usar `agf <comando>` diretamente. Resultado: economia brutal de tokens (sem round-trips MCP,
sem schema de 40 tools no contexto), portabilidade total e disciplina de engenharia preservada
(XP/TDD, Scrum/Lean, Toyota/Six-Sigma, gates, DoD/DoR).

## Contexto (5W2H)

- **What:** substituir o transporte MCP pelo CLI `agf` em três camadas — comandos, generators
  de contexto, e skills — sem reescrever o motor de execução (grafo/store/autonomy).
- **Why:** o MCP exige um servidor rodando, custa tokens (schema de 40 tools + round-trips) e
  acopla a infra. O CLI é local, barato e portável entre qualquer agente.
- **Who:** o dono do produto (autônomo) e qualquer CLI de IA que consome os arquivos de contexto.
- **Where:** repo `agent-graph-flow` (`src/cli`, `src/core/config`, `.agents/skills`) + skills
  globais em `~/.config/agent-skills`.
- **When:** ciclo atual (corte limpo, sem flag de compat — MCP removido por decisão do dono).
- **How:** portar/expor a lógica já provada via comandos `agf`; reescrever generators e skills
  para 100% `agf`; remover emissão de `.mcp.json`.
- **How much:** custo-alvo por task brutalmente baixo (token-ledger + `$/task`), sem regressão
  nos gates de qualidade.

## Requisitos

- O CLI `agf` deve expor 1:1 toda capacidade que as tools MCP ofereciam (CRUD de grafo, status,
  query, contexto, memória, snapshot, export/import, busca, forecast, start/done).
- Nenhum arquivo `.mcp.json` / `.vscode/mcp.json` / `.cursor/mcp.json` deve ser gerado por `agf init`.
- Os arquivos de contexto (CLAUDE.md, AGENTS.md, copilot-instructions) devem ser 100% `agf` —
  zero tokens MCP snake_case (`start_task`, `analyze(mode...)`, `mcp__...`).
- As skills (`.agents/skills` + canônica global) devem cadenciar o CLI `agf`, não o MCP.
- A Regra de Não-Regressão deve passar: build ✓, typecheck (0 novos erros) ✓, testes (0 novas
  falhas) ✓, lint (sem novas violações) ✓.

## Funcionalidades

### CLI 1:1 com MCP (Workstream A)

Expor toda mutação/leitura do grafo como comandos `agf`, ligados ao store local (zero MCP).

- [ ] `agf start` e `agf done <id>` conduzem uma task real (pipeline wake-up→context→done), não imprimem só help
- [ ] `agf node add/show/update/status/move/clone/rm` faz CRUD de nós com validação status_flow
- [ ] `agf edge`, `agf query`, `agf context`, `agf memory`, `agf snapshot`, `agf export`, `agf import-graph`, `agf search`, `agf forecast` funcionam ponta a ponta
- [ ] `agf help` lista 100% dos comandos novos

### Generators CLI-first (Workstream B)

Reescrever o corpo de contexto e remover a emissão MCP do init.

- [ ] `agf init` num diretório limpo NÃO cria nenhum `.mcp.json` nem `**/mcp.json`
- [ ] CLAUDE.md, AGENTS.md e copilot-instructions gerados contêm comandos `agf` e zero tokens MCP
- [ ] `agent_format` gera contexto CLI-first por-CLI (claude/copilot/codex/cursor/windsurf/opencode)
- [ ] `CLI_CONFIG_MAP` mapeia cada CLI a arquivos de contexto, nunca a `.mcp.json`

### Skills CLI-first + distribuição (Workstream C)

Converter as skills e re-propagar para todas as CLIs.

- [ ] As 15 skills de `.agents/skills` + `_shared.md` não referenciam nenhuma tool MCP
- [ ] A skill orquestradora `graph-lead` cadencia o ciclo via `agf` e delega IMPLEMENT ao executor
- [ ] `sync.sh` roda idempotente e regenera `dist/{cursor,copilot,windsurf}` zero-MCP
- [ ] A fronteira de papel é preservada: `graph-lead` não escreve implementação, só prepara e delega

### PRD + dogfood (Workstream D)

Documentar o pivot e exercitar o próprio fluxo CLI-first.

- [ ] Este PRD existe em `docs/prd/cli-first-pivot.md` cobrindo A+B+C com AC testável
- [ ] `agf import-prd docs/prd/cli-first-pivot.md` cria o grafo e `agf stats` mostra os nós

## Restrições

- Restrição: não reescrever o motor de execução (grafo/store/autonomy) — só o transporte e o contexto.
- Constraint: ESM only (`.js` em imports relativos), Zod v4, strict TS, sem `any`.
- Restrição: não citar nomes de repositórios de origem nos entregáveis gerados (PRD/skills/contexto).
- Constraint: corte limpo do MCP — sem flag de compatibilidade; mudanças de schema backward-compatible.

## Riscos

- Risco: lacunas onde uma capacidade MCP não tem comando CLI equivalente → mitigado expondo o
  conjunto completo (node/edge/status/query/context/memory/snapshot/export/search/forecast).
- Risco: snapshot/contract tests presos à formatação MCP antiga → mitigado atualizando as asserções
  para a realidade CLI-first (sem enfraquecer os checks).
- Risco: skills inconsistentes após conversão em lote → mitigado por grep zero-MCP obrigatório + testes
  de skill-loader verdes.
- Risco: usuários com `.mcp.json` legado → aceito (corte limpo por decisão do dono; re-init não recria).
