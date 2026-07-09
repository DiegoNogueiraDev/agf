# Visão: Backlog de campo — findings capturados (screenshots)

Objetivo principal: transformar achados capturados em campo (posts, paper e output do próprio
`agf` numa sessão real) em nodes de backlog rastreáveis no grafo. Cada finding vira uma
funcionalidade atômica com AC testável, ancorada no código atual do repositório — não em ideias
soltas. Cada feature declara o **Ganho** (por que vale) para priorização executiva. Fonte:
5 imagens anexadas pelo autor em 2026-07-06.

## Requisitos

- Todo finding deve virar node no grafo com AC testável (rastreabilidade requirement→task→test).
- Nenhuma mudança de comportamento default: levers opt-in (default OFF, byte-idêntico) e o
  parser TS/JS existente permanece intacto.
- Tudo acionável via CLI `agf` — zero MCP.
- Arquivos < 800 linhas, TDD obrigatório (Red → Green → Refactor) por task.

## Funcionalidades

### tdd-score: parser de asserções multi-linguagem (Java/AssertJ/JUnit)

Fonte: IMG*1570 — output real do `agf` num repo Java: *"agf tdd-score não reconhece testes
Java/AssertJ (score 0/0 mesmo com DoD=100) — limitação do parser (voltado a TS/JS)"\_.
Confirmado no código: `src/core/harness/tdd-score.ts` — `countAssertions` só casa `/expect\(/g`
e `extractAssertionTypes` só reconhece matchers Jest/Vitest (`.toBe(`, `.toEqual(`, …). Um
arquivo de teste Java pontua 0, mesmo com asserções reais.

Nuance confirmada: o gate de DoD (`agf check`) usa `checkTddAdherence` (metadata/status,
agnóstico a linguagem) — **não** o `computeTddScore`. Logo o `tdd-score` é um sinal advisory,
não o gate; o defeito é o score exposto ler 0/0 e enganar em repos polyglot. Blast radius
minúsculo: duas funções regex isoladas, sem consumidor de gate.

**Ganho:** o único número de qualidade de teste que o agf mostra volta a ser confiável fora de
TS/JS — o agf deixa de "mentir" 0/0 em repos Java/polyglot. Correção barata (2 funções), alto
retorno de credibilidade. Habilita o agf como ferramenta polyglot, não TS/JS-only.

- [ ] `countAssertions` conta asserções AssertJ (`assertThat(...)`) e JUnit (`assertEquals`, `assertTrue`, `assertThrows`, …) em arquivos `.java`
- [ ] `extractAssertionTypes` reconhece ≥3 famílias distintas de asserção AssertJ/JUnit
- [ ] Um arquivo de teste Java com asserções produz `score > 0` (não mais 0/0)
- [ ] Comportamento para arquivos `.ts`/`.js` permanece byte-idêntico (teste de regressão)

### Wire doc-sync-guard dormant → hook task:post-complete (quick-win)

Fonte: IMG_1577 (OpenWiki) motiva o tema de docs vivas. Investigação revelou algo mais barato
primeiro: `src/core/hooks/doc-sync-guard.ts` já implementa detecção de drift PRD↔código
(`detectDocDrift`, hash + idade > 7d) **com teste**, mas `detectDocDrift` nunca é chamado por
nenhum caller no `src/` — é **código dormant**. O header promete "hook task:post-complete", que
não existe. O repo tem padrão explícito de "wire dormant X" (5 commits recentes no log).

**Ganho:** ativa capacidade já paga (código + teste existem) com esforço mínimo — só ligar o
handler ao canal de hook. Drift de docs passa a ser sinalizado no fim de cada task, em vez de
apodrecer silenciosamente. É o pré-requisito natural do gerador `agf docs`.

- [ ] `detectDocDrift` é invocado por um handler registrado no canal `task:post-complete`
- [ ] Drift detectado emite advisory estruturado (não quebra o fluxo)
- [ ] Respeita `isDocSyncDisabled` (`MCP_GRAPH_DOC_SYNC=off`) — opt-out preservado
- [ ] Teste cobre o wiring com um event bus mock (padrão de plugin/hook do repo)

### agf docs: documentação viva orientada a agentes

Fonte: IMG*1577 — OpenWiki, *"a CLI that writes and maintains documentation for your codebase,
built specifically for agents"\_, sempre em sync com o código. Constrói sobre o `doc-sync-guard`
já wired (feature anterior): o drift detectado re-dispara a geração. Reuso > duplicação — nunca
recriar a detecção de drift.

**Ganho:** docs param de "estar sempre desatualizadas" (a dor do post) — o agf mantém o contexto
que agentes leem em sync com o grafo/código, reduzindo alucinação e re-trabalho de onboarding.
Diferencial: docs geradas _para agentes_ (context-pack), não só para humanos.

- [ ] Comando `agf docs` registrado no command-registry e listado em `agf help`
- [ ] Gera um artefato de docs derivado dos nodes do grafo + repo-map (determinístico)
- [ ] Integra com `doc-sync-guard`: drift detectado sinaliza regeneração
- [ ] Modo delegado (sem provider): retorna skeleton determinístico com 0 tokens; LLM é opcional

### Lever de dívida cognitiva (anti-vibe-coding)

Fonte: IMG*1573 + IMG_1574 — paper MIT *"Your Brain on ChatGPT: Accumulation of Cognitive Debt
when Using an AI Assistant for Essay Writing Task"\_ (Kosmyna et al.): uso de LLM reduz
conectividade neural e acumula "dívida cognitiva"; grupo LLM teve pior desempenho neural,
linguístico e de score. Alinha com os princípios XP Anti-Vibe-Coding já no CLAUDE.md. Confirmado
no código: existe infra de lever pronta — `economy_lever_ledger` (`economy-lever-ledger.ts`),
`agf economy on/off`, e levers-modelo (`budget-kleiber.ts`). A nova lever encaixa nos trilhos.

**Ganho:** o agf ganha um sinal _mensurável_ para o seu 3º pilar (anti-vibe-coding), não só um
princípio no CLAUDE.md. Torna visível a dependência de LLM por task/sessão — permite alertar
quando o humano está delegando cognição demais (a dívida do paper). Baixo custo (infra existe),
default OFF (zero risco de regressão).

- [ ] Métrica captura razão de dependência de LLM por task/sessão a partir do `llm_call_ledger`
- [ ] Indicador de dívida cognitiva aparece em `agf metrics` (via `--select`)
- [ ] Lever opt-in seguindo a convenção `economy_lever_ledger` (default OFF, byte-idêntico)
- [ ] Node documenta a referência ao paper (proveniência da decisão)

### Triage de blocker externo/infra — estado bloqueado de primeira classe

Fonte: IMG*1568 + IMG_1570 — output real do `agf`: risks todos *"genuinely blocked on external
proxy, K8s cluster access, Azure DevOps repo, Vault secret provisioning, SSH push"\_ — "These
aren't code tasks — they need a human/infra action outside the repo". Confirmado no código:
`NodeStatus` já tem `'blocked'` e `node.blocked` (`graph-types.ts`) — o campo existe, mas não há
distinção semântica entre **code-blocked** (dep de código não pronta) e **infra/human-blocked**
(ação fora do repo). Por isso o "harvest exhausted" é inferido em prosa pelo agente, não
determinístico.

**Ganho:** o loop autônomo passa a ter um estado terminal _determinístico e honesto_ — o agf sabe
distinguir "não há código a fazer" de "estou esperando um humano/infra", e enfileira a ação
humana em vez de fabricar trabalho ou parar em silêncio. Menos desperdício (Lean waiting),
handoff humano explícito, e reforço da invariante de honestidade que a sessão já pratica.

- [ ] Um node pode ser marcado como bloqueado por infra/externo, distinto de blocker de código
- [ ] `agf next`/harvest excluem nodes infra-blocked do pull code-actionable
- [ ] Output de "harvest exhausted" enumera os blockers de infra que exigem ação humana
- [ ] Invariante de honestidade: node infra-blocked nunca é marcado done falsamente

## Restrições

- Restrição: não quebrar o comportamento default — a lever de dívida cognitiva nasce OFF e o
  parsing TS/JS do `tdd-score` fica byte-idêntico.
- Constraint: zero MCP — toda superfície nova exposta via CLI `agf`, funcional com `--no-mcp`.
- Restrição: sem deps pesadas novas para parsing Java — heurística regex-first, espelhando o
  parser TS/JS atual, antes de considerar tree-sitter.
- Restrição: docs reusam `doc-sync-guard` — nunca recriar detecção de drift do zero.

## Riscos

- Risco: parser Java via tree-sitter adiciona dependência nativa pesada. Mitigação: começar
  regex-first (como o parser TS/JS existente) e só evoluir se a precisão exigir.
- Risk: a lever de dívida cognitiva vira "gimmick" sem base. Mitigation: ancorar estritamente
  nos dados reais do `llm_call_ledger` e mantê-la opt-in (default OFF).
- Risco: `agf docs` duplicar o `doc-sync-guard`. Mitigação: estender o guard existente (reuso),
  nunca recriar detecção de drift do zero.
