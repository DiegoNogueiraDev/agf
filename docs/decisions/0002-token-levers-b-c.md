# DR-0002 — Alavancas de orçamento de tokens B (cache de prefixo) e C (esforço condicional)

**Status:** implementado · **Data:** 2026-06-08 · **Contexto:** path OpenAI-compatible
(OpenRouter/DeepSeek) · **Supersede parcial:** reabre [DR-0001](0001-prompt-caching-deferred.md)
(condição "adapter direto de provider")

## Decisão

Implementar as Frentes B e C do orçamento de tokens v2 sobre o adapter
`openai-compatible-adapter.ts` (única via que expõe `usage` real com detalhes de
cache e raciocínio). O SDK do Copilot segue sem suporte — lá as alavancas são no-op
(prefixo estável não dói, esforço é ignorado), preservando a não-regressão.

## Frente B — prefixo estável cacheável (corte de PREÇO do input)

Input domina o volume do loop agêntico; o cache hit de prefixo o cobra a ~10%. O
contrato invariável (papel + JSON + TDD) virou `STABLE_SYSTEM_PROMPT` — **idêntico**
em toda chamada → prefixo cacheável. A cauda volátil (repo-map, task, feedback) vai
no prompt do usuário. Medição: `prompt_tokens_details.cached_tokens` →
`cachedTokensIn` → `llm_call_ledger.cached_input_tokens` → `metrics` ("Cache de
prefixo"). Custo: `calculateCost` desconta cache (`CACHE_HIT_RATE=0.1`).

**Princípio de não-regressão:** a estabilidade É a economia — nunca editar o system
por-task; só a cauda muda.

## Frente C — esforço de raciocínio condicional (corte do output caro)

Output custa ~2× o input e tokens de raciocínio SÃO output. Default no esforço
mínimo; eleva só sob incerteza real (UnCert-CoT, Zhu et al. 2025). O roteador
(`effort-router.ts::chooseEffort`) é **determinístico e zero-token** — heurística
sobre metadados, nunca um 2º LLM:

- `classify`/`status` → `minimal`; `plan` → `high`.
- `implement` 1ª tentativa: `minimal` com reuso (template em mãos), senão `low`.
- Retry: o teste vermelho É a incerteza → escala `medium` (2ª) e `high` (≥3ª).
- Correção de JSON malformado é mecânica → `minimal`.

No fio: forma canônica do OpenRouter `reasoning: { effort }` (enum low|medium|high;
`minimal` colapsa em `low`). Medição: `completion_tokens_details.reasoning_tokens`
→ `reasoningTokens` → `llm_call_ledger.reasoning_tokens` (migration v104) →
`metrics` ("Raciocínio: X tok (Y% do output)").

## Critério de medição (do RFC §6)

- **Cache funcionando?** `C / prefixo ≥ 0,9` após a 1ª chamada de cada task.
- **Effort calibrado?** Razão `T_reason / T_resp`; se >> 1 em tasks simples, o
  roteador manda raciocínio demais.

Alvo combinado training-free: **2x–4x** de redução de custo (não os 20x+ da
literatura, que exigem fine-tuning/soft-prompt fora do alcance de quem só consome API).

## Validação empírica (2026-06-08 — ver [runbook](../runbooks/openrouter-smoke.md))

Probe real pelo caminho de produção contra OpenRouter:

- **Frente C medida:** `deepseek/deepseek-r1` gastou `reasoning_tokens` = 1789/1926
  (~93% do output) numa task trivial → confirma o "overthinking" e o valor do roteador.
- **Frente B medida:** `cached_tokens` = 1408/1466 (**96%**) em `openai/gpt-4o-mini`
  (≥ 90% do RFC) → plumbing correto. Mas `deepseek/*` via OpenRouter retorna
  `cached_tokens=0` — **os upstreams (StreamLake/DeepInfra/Novita/Azure) não cacheiam.**

**Consequência operacional:** a Frente B é **dependente do upstream**. O código lê o
campo certo e é provider-agnóstico; a economia só se realiza em rotas que cacheiam
(OpenAI/Azure/Anthropic/Gemini, ou a API **nativa** do DeepSeek). Roteie cargas
cacheáveis para um provider com cache.

## Fora de escopo (follow-up)

- Output mecânico fora do LLM (boilerplate/scaffold/config) já é entregue pelo
  **acoplador determinístico** (geração 0 token) — a 2ª metade da Frente C.
- Adicionar `deepseek` (API nativa, `https://api.deepseek.com`) ao `provider-registry`
  para realizar a Frente B com DeepSeek (cache de contexto automático a ~10%).
