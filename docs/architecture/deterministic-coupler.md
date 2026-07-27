# Acoplador determinístico — geração determinística, IA só decide

> **Promessa:** gerar estrutura/código **100% determinístico**, onde **nada vai para a
> LLM exceto a DECISÃO**. Recupera padrões (RAG), ranqueia, compõe como quebra-cabeça,
> gera, persiste e reutiliza — **economia brutal de tokens**. Tudo async via hooks.

## Pipeline

```
node ──▶ corpus (scan determinístico do próprio projeto / brownfield)
     ──▶ retrieve (RAG lexical: BM25/TF-IDF sobre o corpus + registry)
     ──▶ rank (ordenação estável + viés do corpus do projeto)
     ──▶ compose (Set Cover: cobre as capacidades exigidas, combina N scaffolds)
     ──▶ gerar (scaffolders determinísticos — 0 LLM) + mesclar
     ──▶ persistir (proveniência + artifact_cache) + contabilizar (λ_flow)
          — disparado pelo hook `scaffold:requested` (async) + flushHooks —
```

A **DECISÃO-LLM** (escolher o melhor entre os top-K ranqueados) é o **único** ponto onde a
IA tocaria o fluxo — gated por λ_flow, **OFF por padrão** (seleção por argmax determinístico).
A geração **nunca** chama LLM.

## Fundamentação (livro + papers)

| Etapa                     | Motor                                | Fonte                             |
| ------------------------- | ------------------------------------ | --------------------------------- |
| Compor N scaffolds        | Set Cover guloso                     | **CLRS** (`Algorithms.pdf`) §35.3 |
| Orçamento de tokens       | 0/1 Knapsack (DP)                    | **CLRS** §15                      |
| Ranking estável           | Ordenação / estatística de ordem     | **CLRS** Parte II                 |
| Recuperação               | Retrieval léxico (BM25)              | Robertson & Zaragoza 2009         |
| Reranking diverso         | MMR                                  | Carbonell & Goldstein 1998        |
| Recuperar-em-vez-de-gerar | RAG                                  | Lewis et al. 2020                 |
| Compor por componentes    | Síntese de programas por componentes | (type-directed synthesis)         |

## Origem do corpus

- **Brownfield** (tem código): usa **o próprio projeto** — scan determinístico
  (`harness/collect-src` + sinais de capacidade) enviesa o ranking para padrões já usados.
- **Greenfield** (sem código): varre **github.com** (web fetch/scraping via graph-navigation)
  → _fatia seguinte_.
- **Borda criativa:** quando o Set Cover deixa capacidades descobertas (algo novo) →
  **única** via que gasta tokens, gated por λ*flow → \_fatia seguinte*.

## Aprendizado

Composição aplicada → gravada em `artifact_cache` (signature → edits). Node similar na
próxima vez resolve via `resolve-reuse` como **exact** = **0 token**. "O agente aprende a criar."

## Módulos

- `core/scaffolder/registry.ts` — banco de combinações (scaffolders + capabilities).
- `core/scaffolder/corpus.ts` — brownfield self-scan determinístico.
- `core/scaffolder/retrieve-rank.ts` — RAG lexical + ranking determinístico.
- `core/scaffolder/compose.ts` — Set Cover + Knapsack.
- `core/scaffolder/couple.ts` — gera + persiste + cacheia + contabiliza (handler async).
- `core/hooks/hook-runtime.ts` — `scaffold:requested` + `flushHooks`.
- CLI `scaffold`; `/graph-navigation` passo 5.

## Kill-switch

`AGF_HOOKS=0` ou `MCP_GRAPH_HOOKS_DISABLED=true` desligam todo o pipeline de hooks.
