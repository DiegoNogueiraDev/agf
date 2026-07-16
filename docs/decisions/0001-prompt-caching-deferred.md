# DR-0001 — Prompt caching adiado (SDK do Copilot não expõe cache-control)

**Status:** adiado (não aplicável agora) · **Data:** 2026-06-04 · **Contexto:** M1o (port OpenCode)

## Decisão

Não implementar prompt caching neste momento.

## Por quê

O port do OpenCode (M1k–M1o) avaliou trazer **prompt caching** (marcar system/tools
estáveis como cacheáveis para ~-90% em cache-reads, como o OpenCode faz com a API
nativa da Anthropic via `cache_control`).

Nossa única via de modelo é o **`@github/copilot-sdk`** (`src/core/model-hub/copilot-sdk-adapter.ts`).
A superfície que consumimos é:

```
session.send(prompt: string): Promise<string>
```

O SDK **abstrai o provider por completo**: não expõe `cache_control`, hints de cache,
nem tokens de cache (read/write) na resposta — `send` devolve apenas a string. Não há
ponto de injeção para marcar prefixos cacheáveis nem para medir cache-hits.

Implementar "caching" aqui seria fingir uma economia que o transporte não entrega.
Coerente com o pilar "token é recurso de 1ª classe — medir de verdade", **adiamos**.

## Quando reabrir

- Se o `@github/copilot-sdk` passar a expor cache hints / usage com tokens de cache; ou
- Se adicionarmos um adapter direto de provider (ex.: Anthropic Messages API) — aí o
  schema `cache_control` + contabilização `cache.read/write` no `llm_call_ledger` e
  `MODEL_PRICING` entram (o ledger já tem colunas `cached_input_tokens`/`cache_creation_tokens`).

## Alternativas já entregues no lugar

A economia "barata e real" veio por outras alavancas do mesmo port: **diff-edits**
(M1k, corte de saída), **truncação com marcador** (M1l), **repo-map ranqueado** (M1m,
corte de entrada) e o **engine de compaction** (M1n).
