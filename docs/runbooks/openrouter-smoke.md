# Runbook — smoke OpenRouter (validar as 3 frentes na fatura real)

Valida o caminho de produção (`run`/`autopilot --live`/`scaffold`) contra
OpenRouter, medindo as três frentes de economia na fatura real. Gasto < $1.

## Pré-requisitos

1. Chave OpenRouter em `secrets/openrouter-key.md` (linha crua ou `OPENROUTER_API_KEY=...`).
   A pasta `secrets/` é gitignored; `loadProviderEnv()` injeta no `process.env` no boot.
2. `npm run build` verde.

## Passos

```bash
agf provider use openrouter            # grava setting provider=openrouter
agf model deepseek/deepseek-chat       # pina um id externo (passthrough)
agf run "soma de dois inteiros em TypeScript com teste"   # 1 chamada real
agf metrics                            # tokens reais + custo > 0
# borda criativa (único uso de token no scaffold), com seleção natural:
agf scaffold <nodeId> --apply --creative --validate
agf metrics                            # cache (B) + raciocínio (C), se o upstream expõe
```

`metrics` mostra, quando o upstream reporta:

- `Cache de prefixo: X tok (Y% do input) cobrados a ~10% — Frente B`
- `Raciocínio: X tok (Y% do output) — Frente C`

## Resultado empírico (2026-06-08, chave real)

Probe de 2 chamadas idênticas pelo caminho de produção (`TieredModelClient` +
`OpenAICompatibleAdapter`, prefixo estável + `effort`):

| Frente                | Modelo/rota                           | Observado                                                                           |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| **A** (volume)        | qualquer                              | `tokensIn/Out` reais fluem ao ledger ✓                                              |
| **C** (raciocínio)    | `deepseek/deepseek-r1` (Novita/Azure) | `reasoning_tokens` = **1789** (call#1) e **707** (call#2) — **~80–93% do output** ✓ |
| **B** (cache prefixo) | `deepseek/*` via OpenRouter           | `cached_tokens` = **0** — upstreams **não** cacheiam ✗                              |
| **B** (cache prefixo) | `openai/gpt-4o-mini` (OpenAI/Azure)   | `cached_tokens` = **1408 / 1466 = 96%** ✓ (≥ 90% do RFC)                            |

### Achado-chave (muda a configuração de produção)

A Frente B é **dependente do upstream**. O campo que o adapter lê
(`prompt_tokens_details.cached_tokens`) é exatamente o que o OpenRouter normaliza
— o código está correto e provider-agnóstico. Mas os upstreams de `deepseek/*` no
OpenRouter (StreamLake, DeepInfra, Novita, Azure) **não oferecem prompt caching**
(sem `input_cache_read` no pricing) → retornam `cached_tokens=0`. Provedores que
cacheiam (OpenAI/Azure, Anthropic, Gemini) entregam o hit (96% medido).

**Para realizar a Frente B com DeepSeek:** usar a **API nativa do DeepSeek**
(`https://api.deepseek.com`, cache de contexto automático com
`prompt_cache_hit_tokens` a ~10% do preço). Já disponível: `agf provider use deepseek`
(+ `secrets/deepseek-key.md` → `DEEPSEEK_API_KEY`). O adapter lê os DOIS campos de
cache (`prompt_tokens_details.cached_tokens` **e** `prompt_cache_hit_tokens`).

## Llama LOCAL (Ollama) — economia máxima: $0 por token

Modelo local = **custo 0** (a inferência roda na sua máquina/servidor). É o melhor
caso de economia e compõe com o cache local (repetição = 0 token, 0 ms).

Apontar a camada para um Ollama remoto (override de baseURL, sem editar o registry):

```bash
export OLLAMA_BASE_URL=http://192.168.1.50:11434/v1   # seu servidor (ex.: via Tailscale)
agf provider use ollama
agf model qwen2.5-coder:7b      # tag Ollama (com ':') passa direto no pinned
agf run "implemente X com teste"   # inferência local, custoUSD = 0
agf metrics                        # $0 (modelos locais sem preço) + cache hits
```

Convenção do override: `<ID>_BASE_URL` (ex.: `OLLAMA_BASE_URL`, `OPENAI_BASE_URL`)
— serve para apontar qualquer provider OpenAI-compatible a um gateway/servidor local.
Reasoning: Ollama/Groq/Cerebras **rejeitam** o campo `reasoning` ("does not support
thinking") → o adapter só envia esforço para OpenRouter (`reasoning.effort`) e OpenAI
(`reasoning_effort`); demais omitem (`reasoningStyle: 'none'`).

Smoke real medido (2026-06-08, `qwen2.5-coder:7b` remoto): call#1 cold 39 in/42 out
**$0** (9s); call#2 `fromCache=true` **$0, 0 ms**.

## Cache: nativo do provider vs. cache LOCAL agnóstico

Revisão da doc oficial (jun/2026) — capacidade por provider (ver
`provider-cache-caps.ts`):

| Provider              | Cache nativo c/ desconto?             | Campo de `usage`                      |
| --------------------- | ------------------------------------- | ------------------------------------- |
| OpenAI                | ✅ ~50% (≥1024 tok)                   | `prompt_tokens_details.cached_tokens` |
| DeepSeek (nativo)     | ✅ ~90%                               | `prompt_cache_hit_tokens`             |
| Groq                  | ⚠️ só Kimi K2/GPT-OSS                 | `prompt_tokens_details.cached_tokens` |
| Cerebras              | ❌ (cacheia, mas cobra input cheio)   | `prompt_tokens_details.cached_tokens` |
| OpenRouter            | depende do upstream (deepseek/\* = 0) | `prompt_tokens_details.cached_tokens` |
| Together (serverless) | ⚠️ só dedicated                       | —                                     |
| GitHub Copilot        | ❌ sem controle (SDK opaco)           | —                                     |

**Cache LOCAL de resposta (piso universal):** o `CachingModelAdapter` embrulha
QUALQUER provider — quando a requisição (normalizada) recorre, serve do disco →
**0 token, 0 custo**, persistente, inclusive onde NÃO há desconto nativo (Cerebras,
Groq não-K2, Copilot, deepseek-via-OpenRouter). Ligado por default; kill-switch
`AGF_RESPONSE_CACHE=0`. O OpenRouter ainda ganha o response-cache server-side deles
via header `X-OpenRouter-Cache` (kill-switch `AGF_OPENROUTER_CACHE=0`). Hits aparecem
em `metrics` (lever `response_cache`, "Economia determinística") e em `/cache-stats`.

### Achado-chave (confirma o valor da Frente C)

DeepSeek R1 gastou **~80–93% do output em raciocínio** mesmo para uma task trivial
(soma de inteiros) — o "overthinking" que o RFC descreve. O roteador de esforço
determinístico (`effort-router.ts`) corta exatamente esse desperdício: default
mínimo, escala só sob incerteza (retry vermelho).

## Critérios de decisão (RFC §6)

- **Cache funcionando?** `cached_tokens / prompt_tokens ≥ 0,9` após a 1ª chamada.
  (96% no OpenAI; 0% no DeepSeek-via-OpenRouter → trocar de rota p/ cachear.)
- **Effort calibrado?** `reasoning_tokens / completion_tokens`. Se >> 1 em task
  simples, o roteador manda raciocínio demais. (R1 sem effort control = 93%.)

## Segurança

Nunca commitar `secrets/`. Se o valor da chave vazar em log/transcript, **rotacionar**.
