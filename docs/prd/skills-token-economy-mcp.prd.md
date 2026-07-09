# Epic 1: Token Economy — Consolidar e Otimizar Skills (25 → 14)

Revisar todas as 25 skills em `.agents/skills/`, extrair conteúdo comum para `_shared.md` e consolidar skills redundantes para reduzir ~4.281 linhas para ~2.200 (-45%) sem perda de qualidade.

**Size:** XL
**Priority:** high
**Tags:** skills, token-economy, refactor

## Requisitos

- O sistema deve gerar skills enxutas com bullet points em vez de prosa narrativa
- O sistema deve extrair conteúdo comum (gates, DoD, pipeline v8.0) para `_shared.md`
- O sistema deve consolidar skills redundantes mantendo cobertura funcional equivalente
- O sistema deve adicionar frontmatter YAML otimizado (trigger, tools_used, tokens) em todas as skills
- O sistema deve atualizar `init-project.ts` para gerar 14 skills em vez de 25

## Restrições

- Restrição: não perder funcionalidade — cada skill original deve ter cobertura equivalente na consolidated
- Constraint: manter compatibilidade com o sistema de descoberta de skills do opencode

## Riscos

- Risco: `graph-platform` skill (5→1 merge) pode ficar grande demais (>300 linhas). Mitigação: splitar em 2 se necessário
- Risco: skills consolidadas perderem especificidade. Mitigação: validar com harness_scan após refactor

### Task 1.1: Criar `_shared.md` com conteúdo comum

Extrair gates, DoD checks, pipeline v8.0 e fluxo base das 10 lifecycle skills para um arquivo compartilhado referenciado via diretiva `<!-- shared:_gates,_dod,_pipeline -->`.

**Size:** S
**Priority:** 1
**Depends on:** nenhum

- [ ] `_shared.md` existe em `.agents/skills/_shared.md` com seções: \_gates, \_dod, \_pipeline
- [ ] Conteúdo cobre todos os 9 checks DoD
- [ ] Conteúdo cobre phase gates (transições entre fases)
- [ ] Conteúdo cobre pipeline v8.0 (`start_task → TDD → finish_task`)

### Task 1.2: Consolidar lifecycle skills (9 skills)

Enxugar graph-prd, graph-analyze, graph-design, graph-plan, graph-implement, graph-validate, graph-review, graph-handoff, graph-deploy, graph-listening para formato bullet-point com referência ao `_shared.md`.

**Size:** L
**Priority:** 1
**Depends on:** Task 1.1

- [ ] Cada lifecycle skill tem <150 linhas (antes: ~160 média)
- [ ] Cada skill referencia `_shared.md` para conteúdo comum
- [ ] Frontmatter YAML inclui `trigger`, `tools_used`, `tokens`
- [ ] graph-design absorve graph-architecture (C4 + ADR)

### Task 1.3: Consolidar domain skills (4 skills novas)

Criar graph-quality (merge qa + refactor), graph-security (merge security + dependency), graph-bugs (merge bug-hunter + fix-bugs), graph-platform (merge tests + performance + accessibility + harness + kanban).

**Size:** L
**Priority:** 1
**Depends on:** Task 1.1

- [ ] `graph-quality` cobre SOLID, DRY, SQALE, McCabe — <180 linhas
- [ ] `graph-security` cobre OWASP, STRIDE, SBOM, supply chain — <180 linhas
- [ ] `graph-bugs` cobre descobrir + reproduzir + corrigir + 5Whys — <180 linhas
- [ ] `graph-platform` cobre tests, performance, accessibility, harness, kanban — <280 linhas

### Task 1.4: Atualizar `init-project.ts`

Modificar o gerador de skills em `src/mcp/init-project.ts` para criar 14 skills consolidadas em vez das 25 atuais.

**Size:** M
**Priority:** 2
**Depends on:** Task 1.2, Task 1.3

- [ ] `init-project.ts` gera 14 skills (não 25)
- [ ] Skills geradas tem o novo formato com frontmatter otimizado
- [ ] Teste de init passa com a nova estrutura

### Task 1.5: Adicionar frontmatter YAML otimizado

Garantir que todas as 14 skills tenham `name`, `description`, `trigger`, `tools_used` e `tokens` no frontmatter.

**Size:** S
**Priority:** 2
**Depends on:** Task 1.2, Task 1.3

- [ ] Todas as 14 skills têm `trigger` preenchido (ex: `/graph-implement`)
- [ ] Todas as skills têm `tools_used` listando tools MCP relevantes
- [ ] Todas as skills têm `tokens` com estimativa de tokens do conteúdo

---

# Epic 2: Slash Commands — Integração TUI

Garantir que todas as skills sejam slash commands funcionais no opencode TUI com autocomplete, hints e lazy-loading.

**Size:** L
**Priority:** high
**Tags:** tui, slash-commands, opencode

## Requisitos

- O sistema deve expor cada skill como slash command na TUI do opencode
- O sistema deve fornecer hints (parâmetros esperados) para autocomplete
- O sistema deve fazer lazy-load do conteúdo completo apenas quando o comando é invocado

## Restrições

- Restrição: não quebrar a compatibilidade com o sistema de comandos existente do opencode

## Riscos

- Risco: skills com mesmo nome de comandos built-in podem conflitar. Mitigação: usar prefixo `graph-` consistente

### Task 2.1: Auditar e corrigir name + description

Verificar que cada skill tem `name` e `description` válidos no frontmatter YAML para o sistema de comandos do opencode.

**Size:** S
**Priority:** 1
**Depends on:** Task 1.5

- [ ] Todas as 14 skills têm `name` válido (sem espaços, slug format)
- [ ] Todas as skills têm `description` descritivo para o command palette
- [ ] Nomes não conflitam com comandos built-in do opencode

### Task 2.2: Adicionar hints para autocomplete

Adicionar campo `hints` no frontmatter com parâmetros esperados para o sistema de autocomplete da TUI.

**Size:** S
**Priority:** 1
**Depends on:** Task 2.1

- [ ] Skills que aceitam parâmetros têm `hints` (ex: `["<nodeId>"]`)
- [ ] Parâmetros seguem o formato `$1`, `$2` do sistema de comandos opencode
- [ ] Teste manual: `/graph-implement <tab>` mostra hints

### Task 2.3: Testar slash commands na TUI

Abrir sessão no opencode e verificar que todos os 14 comandos `/graph-*` aparecem no autocomplete e carregam corretamente.

**Size:** M
**Priority:** 1
**Depends on:** Task 2.2

- [ ] `/graph-implement` aparece no autocomplete e carrega a skill
- [ ] `/graph-analyze` aparece e carrega corretamente
- [ ] `/graph-quality` (novo, merge) aparece e carrega
- [ ] `/graph-security` (novo, merge) aparece e carrega
- [ ] `/graph-bugs` (novo, merge) aparece e carrega
- [ ] `/graph-platform` (novo, merge) aparece e carrega

### Task 2.4: Validar lazy-loading

Confirmar que o conteúdo completo da skill só é injetado no contexto quando o slash command é invocado, não no startup.

**Size:** S
**Priority:** 2
**Depends on:** Task 2.3

- [ ] Contexto inicial da sessão NÃO inclui conteúdo completo das skills
- [ ] Ao invocar `/graph-implement`, apenas essa skill é carregada
- [ ] Token count inicial é significativamente menor que carregar todas as skills

---

# Epic 3: Provider Compatibility — Multi-Provider Validation

Garantir que as tools mcp-graph funcionem com todos os providers do opencode (opencode, Anthropic, OpenAI, Gemini, Bedrock, OpenRouter, Zen, Go).

**Size:** M
**Priority:** medium
**Tags:** providers, compatibility, opencode

## Requisitos

- O sistema deve validar que tools MCP são chamadas corretamente via opencode "opencode" provider
- O sistema deve validar compatibilidade com providers externos (Anthropic, OpenAI, Gemini)
- O sistema deve documentar matriz de compatibilidade no AGENTS.md

## Restrições

- Restrição: não modificar a implementação das tools MCP — apenas validar e documentar

### Task 3.1: Validar com opencode "opencode" provider

Testar se as tools MCP (add_node, start_task, finish_task, analyze) funcionam via opencode usando o provider "opencode" (GPT via opencode API).

**Size:** M
**Priority:** 1
**Depends on:** Epic 1 completo

- [ ] `start_task` funciona via opencode provider
- [ ] `finish_task` com 9 checks DoD funciona
- [ ] `analyze` retorna resultados corretos
- [ ] `context` e `context(action: "rag")` funcionam

### Task 3.2: Validar com providers externos

Testar tools MCP com Anthropic, OpenAI, Gemini, Bedrock, OpenRouter.

**Size:** L
**Priority:** 1
**Depends on:** Task 3.1

- [ ] Anthropic provider chama tools MCP corretamente
- [ ] OpenAI provider chama tools MCP corretamente
- [ ] Gemini provider chama tools MCP corretamente
- [ ] Bedrock provider chama tools MCP corretamente
- [ ] OpenRouter provider chama tools MCP corretamente

### Task 3.3: Documentar matriz de compatibilidade

Adicionar tabela de compatibilidade provider × tool no AGENTS.md.

**Size:** S
**Priority:** 2
**Depends on:** Task 3.2

- [ ] AGENTS.md tem seção "Provider Compatibility Matrix"
- [ ] Matriz lista todos os providers × todas as tools MCP
- [ ] Matriz indica status: full, partial, untested, blocked

---

# Epic 4: Claude MCP Bridge — Conexão Claude Code

Criar `packages/mcp-server/` que expõe ferramentas mcp-graph via MCP protocol (stdio) para Claude Desktop/Code.

**Size:** XL
**Priority:** medium
**Tags:** mcp, claude, bridge

## Requisitos

- O sistema deve expor tools mcp-graph via MCP protocol stdio
- O sistema deve compartilhar o SQLite graph.db com o projeto principal
- O sistema deve suportar ferramentas: add_node, update_status, start_task, finish_task, analyze, context, validate, export, snapshot, plan_sprint, import_prd
- O sistema deve ser instalável como entry no claude_desktop_config.json

## Restrições

- Restrição: usar @modelcontextprotocol/sdk (já é dependência do projeto)
- Constraint: implementar locking para acesso concorrente ao SQLite (opencode + Claude simultâneos)

## Riscos

- Risco: acesso concorrente ao SQLite pode causar corrupção. Mitigação: usar WAL mode + lock-manager.ts existente
- Risco: latência adicional via MCP vs acesso direto. Mitigação: implementar cache de leitura

### Task 4.1: Criar estrutura packages/mcp-server/

Criar package.json, tsconfig.json, entry point e estrutura de diretórios para o MCP server standalone.

**Size:** S
**Priority:** 1
**Depends on:** nenhum

- [ ] `packages/mcp-server/package.json` com dependências corretas
- [ ] `packages/mcp-server/tsconfig.json` configurado
- [ ] `packages/mcp-server/src/index.ts` como entry point
- [ ] Script `build` e `start` funcionais

### Task 4.2: Implementar MCP server com stdio transport

Implementar servidor MCP usando `@modelcontextprotocol/sdk` com StdioServerTransport.

**Size:** L
**Priority:** 1
**Depends on:** Task 4.1

- [ ] Server inicializa e registra no MCP protocol
- [ ] `ListToolsRequestSchema` retorna lista de tools disponíveis
- [ ] `CallToolRequestSchema` processa chamadas e retorna resultados
- [ ] Server conecta ao SQLite graph.db do projeto

### Task 4.3: Expor tools do mcp-graph

Mapear e implementar handlers para cada tool: add_node, update_status, start_task, finish_task, analyze, context, validate, export, snapshot, plan_sprint, import_prd.

**Size:** XL
**Priority:** 1
**Depends on:** Task 4.2

- [ ] `add_node` cria node no grafo e retorna id
- [ ] `update_status` muda status e valida fluxo
- [ ] `start_task` executa next + context + rag + update_status(in_progress)
- [ ] `finish_task` executa 9 checks DoD + update_status(done)
- [ ] `analyze` suporta modos: implement_done, tdd_check, harness_scan, progress
- [ ] `context` retorna contexto compactado e RAG
- [ ] `validate` executa validação E2E
- [ ] `export` exporta grafo em formatos suportados
- [ ] `snapshot` cria snapshot do estado atual
- [ ] `plan_sprint` planeja sprint com DORA estimation
- [ ] `import_prd` importa PRD de arquivo

### Task 4.4: Script de setup e documentação

Criar script que gera entrada no `claude_desktop_config.json` e documentar no README.

**Size:** S
**Priority:** 2
**Depends on:** Task 4.3

- [ ] Script `setup-claude.sh` gera config JSON
- [ ] README.md explica instalação e uso
- [ ] Teste manual: Claude Desktop reconhece tools do agent-graph-flow
