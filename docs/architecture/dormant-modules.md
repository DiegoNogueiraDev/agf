# Módulos dormentes — fundações limpas, não conectadas (por ora)

> Resolução dos órfãos restantes (após conectar spec-evolution/templates e deletar os
> mortos do grande corte). Estes módulos **não são código morto**: são fundações limpas,
> bem-feitas, sem importadores em produção hoje. Mantidos **dormentes** (não deletados)
> porque têm valor futuro claro e baixo custo de manutenção. Cada um lista onde plugaria.

| Módulo                                                   | O que é                                                            | Por que dormente                                                | Onde plugaria                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `core/event-store`                                       | Schema Zod + writer/query de eventos de observabilidade            | Camada de auditoria planejada, nunca integrada                  | Trilha de auditoria unificada sobre o HookBus                                         |
| `core/session`                                           | Schema + I/O de estado de sessão (V2, auto-migração)               | Persistência de sessão não conectada à TUI/CLI                  | Multi-sessão / estado persistente da TUI                                              |
| `core/guardian`                                          | Reviewer de segurança de tool-calls (allow/deny/ask) via LLM       | Projetado, não ligado ao executor/sandbox                       | Gate de segurança no `sandbox`/executor de tools                                      |
| `core/patch`                                             | Aplicador de unified diff (hunks atômicos)                         | Implementer usa edits search/replace, não diffs                 | Migração para patching baseado em diff                                                |
| `core/sandbox`                                           | Executor de build + detecção de stack + fallback                   | Build delegado externamente; não instanciado no loop            | Isolamento de build no autopilot                                                      |
| `core/llm` (gateway)                                     | Gateway LLM rico (failover, tool-calls, streaming, **OpenRouter**) | Paralelo ao `model-hub` (caminho ativo); só `doctor` referencia | Consolidar com `model-hub` p/ recursos ricos (responses API, tool-calling, streaming) |
| `core/services/{workspace-state,human-gate}` + contratos | Serviços de estado de workspace e gate humano                      | Contratos definidos, implementações sem uso (só testes)         | Escalação humana / estado de workspace quando houver demanda                          |

**Nota sobre `core/services`:** `task-lifecycle.ts` e `context-runtime.ts` deste módulo **estão
ativos** (autoridade de lifecycle usada pelo MCP) — não são dormentes. Só `workspace-state` e
`human-gate` estão dormentes; foram mantidos (não deletados) por tocarem helpers de teste
compartilhados (`fake-host-adapter`), onde a cirurgia teria alto risco e baixo valor.

**Critério para ativar um dormente:** só quando houver demanda concreta + uma alavanca
mensurável (token/qualidade/segurança). Até lá, ficam fora da espinha dorsal para não inflar
superfície. Ver também `docs/architecture/deterministic-coupler.md` e `arvore-forte.md`.

## Economia de token — dual-path LLM e levers (auditoria dogfood 2026-06)

> Raiz da fragmentação: existem **duas vias LLM**. A **ativa** é `model-hub`
> (`buildClientFromProject` → `live-implement` → `implement-attempt`), usada por todo
> `agf deliver/run/autopilot --live`. A **rica/dormente** é `core/llm` (gateway: failover,
> tool-calls, streaming, OpenRouter). Os levers de economia nasceram divididos entre as duas.
> A consolidação é decisão arquitetural (ver ADR de consolidação gateway↔model-hub).

**Levers ATIVOS na via real** (medidos no `economy_lever_ledger`):
`response_cache` (model-hub), compressão adaptativa de tool-output L0/L1/L2 (`tool-compress`),
**content-router** (code-AST / JSON-SmartCrusher / dedup-log — cablado em
`implement-attempt.bestToolCompression`), `repo_map` (corte de input), `artifact_reuse`
(exact-hit). Hooks `pre_compress`/`post_compress`/`on_cache_hit` disparam na via ativa.

**Levers/módulos DORMENTES ou MORTOS** (classificação honesta — antes se passavam por ativos):

| Módulo                                 | Status                         | Razão                                                                                                                                                                           | Onde plugaria                                                   |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `core/economy/economy-orchestrator.ts` | Dormente (acoplado ao gateway) | Middleware com forma de `body.messages` (HTTP) — não casa com a via ativa (prompt-string). 0 importadores em runtime.                                                           | Camada de economia do gateway, quando consolidado com model-hub |
| `core/economy/caveman-input.ts`        | Dormente p/ uso standalone     | Filtro lossy de NL; executado dentro do `content-router` (ramo `text`) mas **não adotado** na via ativa (preserva fidelidade de tool-output)                                    | Filtro de mensagens de usuário no gateway                       |
| `core/economy/ccr-store.ts` (write)    | Meio-cabeado                   | Lado de **leitura** ativo (`agf retrieve`); o **writer** (`applyCcrToRouted`) é acoplado ao gateway. CCR-dropping de tool-output que o modelo precisa é arriscado na via ativa. | Writer reversível no middleware do gateway                      |
| `core/economy/aaak-compressor.ts`      | Morto                          | 0 importadores em runtime; só referenciado pelo teste `content-router-wiring.test.ts` (nome enganoso — testa a função isolada, não a via)                                       | Compressão de índice/symbol-map, se houver demanda              |
| `core/economy/economy-pipeline.ts`     | Morto                          | 0 importadores em runtime; idem acima                                                                                                                                           | Ordenação de levers, se a orquestração for revivida             |

**Hooks (`registerHook`):** a API `registerHook()` é o **ponto de extensão de plugins**; os
handlers built-in usam `bus.on()` direto por design. Não é brecha — é a fronteira plugin↔core.

**Critério de saída:** `aaak-compressor` e `economy-pipeline` são candidatos a **deleção** no
próximo ciclo (mortos de verdade); mantidos por ora só para não acoplar a remoção do teste
`content-router-wiring.test.ts` a esta entrega. O `economy-orchestrator` + `caveman-input` +
CCR-writer só ativam junto com a consolidação do gateway (ADR).
