# Cross-Model Benchmark — Resultados Finais

## Metodologia

- **28 modelos testados** via OpenRouter, 5 tarefas T0 (atômicas) cada
- Tarefas: adicionar função a arquivo JS existente (abs, capitalize, concat, isEven, mul)
- Métrica principal: % de tarefas onde teste oráculo passou
- Timeout: 10min por modelo (6 modelos excederam)

## Ranking Final T0

| #   | Modelo                          | Resolve       | Tokens | $/M tok | Arq       | Nota               |
| --- | ------------------------------- | ------------- | ------ | ------- | --------- | ------------------ |
| 1   | **qwen/qwen3.6-plus**           | **80%** (4/5) | 24,855 | $0.33   | MoE       | 🏆 Melhor MoE      |
| 2   | **x-ai/grok-4.3**               | **80%** (4/5) | 23,665 | $2.50   | Denso     | 🏆 Melhor absoluto |
| 3   | **deepseek/deepseek-v4-flash**  | **60%** (3/5) | 17,001 | $0.10   | MoE       | 💰 Melhor custo    |
| 4   | **meta-llama/llama-4-maverick** | **60%** (3/5) | 4,626  | $0.15   | MoE       | ⚡ Mais eficiente  |
| 5   | **qwen/qwen3.6-flash**          | **60%** (3/5) | 34,667 | $0.19   | MoE       |                    |
| 6   | meta-llama/llama-4-scout        | 40% (2/5)     | 5,336  | $0.10   | MoE       |                    |
| 7   | google/gemini-3.1-flash-lite    | 40% (2/5)     | 4,890  | $0.25   | MoE       |                    |
| 8   | qwen/qwen3.5-35b-a3b            | 40% (2/5)     | 23,676 | $0.14   | MoE       | 3B ativos!         |
| 9   | nvidia/nemotron-3-super-120b    | 20% (1/5)     | 9,416  | $0.50   | MoE       |                    |
| 10  | minimax/minimax-m3              | 20% (1/5)     | 9,701  | $0.30   | MoE       |                    |
| 11  | openai/gpt-5.4                  | 20% (1/5)     | 10,635 | $2.50   | Denso     |                    |
| 12  | anthropic/claude-sonnet-4.6     | 20% (1/5)     | 3,988  | $3.00   | Denso     |                    |
| 13  | qwen/qwen3.7-max                | 20% (1/5)     | 6,391  | $1.25   | Denso     |                    |
| 14  | x-ai/grok-4.20                  | 20% (1/5)     | 45,775 | $1.25   | Denso     |                    |
| 15  | mistralai/mistral-medium-3-5    | 20% (1/5)     | 49,172 | $1.50   | Denso     |                    |
| 16  | anthropic/claude-haiku-4.5      | 20% (1/5)     | 34,944 | $1.00   | Denso     |                    |
| 17  | google/gemini-2.5-flash-lite    | 20% (1/5)     | 38,267 | $0.10   | MoE       |                    |
| 18  | deepseek/deepseek-v4-pro        | 0% (0/5)      | 20,428 | $0.44   | Denso     |                    |
| 19  | google/gemini-2.5-flash         | 0% (0/5)      | 34,659 | $0.30   | MoE       |                    |
| 20  | openai/gpt-4.1                  | 0% (0/5)      | 9,218  | $2.00   | Denso     |                    |
| 21  | openai/gpt-4.1-mini             | 0% (0/5)      | 6,568  | $0.40   | Denso     |                    |
| 22  | openai/gpt-5-mini               | 0% (0/5)      | 14,269 | $0.25   | Denso     |                    |
| 23  | openai/o4-mini                  | 0% (0/5)      | 22,598 | $1.10   | Denso     |                    |
| 24  | mistralai/mistral-large-2512    | 0% (0/5)      | 12,996 | $0.50   | Denso     |                    |
| 25  | moonshotai/kimi-k2              | 0% (0/5)      | 8,835  | $0.57   | MoE       |                    |
| 26  | google/gemini-3.5-flash         | 0% (0/5)      | 9,924  | $1.50   | MoE       |                    |
| 27  | perplexity/sonar-pro            | 0% (0/5)      | 7,088  | $3.00   | Denso     |                    |
| 28  | anthropic/claude-opus-4.6       | 0% (0/5)      | 4,487  | $5.00   | Denso     |                    |
| 29  | cohere/command-a                | 0% (0/5)      | 11,228 | $2.50   | Denso     |                    |
| 30  | qwen/qwen3-coder                | 0% (0/5)      | 4,175  | $0.22   | MoE       |                    |
| 31  | qwen/qwen3-coder-flash          | 0% (0/5)      | 6,405  | $0.20   | MoE       |                    |
| 32  | qwen/qwen3.5-122b-a10b          | 0% (0/5)      | 16,177 | $0.26   | MoE       |                    |
| 33  | qwen/qwen3.5-flash-02-23        | 0% (0/5)      | 38,128 | $0.07   | MoE       |                    |
| —   | deepseek/deepseek-r1            | timeout       | —      | $0.70   | Reasoning |                    |
| —   | deepseek/deepseek-r1-0528       | timeout       | —      | $0.50   | Reasoning |                    |
| —   | z-ai/glm-4.7-flash              | timeout       | —      | $0.06   | MoE       |                    |
| —   | stepfun/step-3.7-flash          | timeout       | —      | $0.20   | MoE       |                    |
| —   | google/gemini-2.5-flash-lite    | timeout       | —      | $0.10   | MoE       |                    |

## Full Suite (T0-T5, 10 cenários)

| Modelo                      | Resolve    | Tokens | Nota                         |
| --------------------------- | ---------- | ------ | ---------------------------- |
| meta-llama/llama-4-maverick | 20% (2/10) | 7,726  | Único a completar full suite |

## Top 5 Custo-Benefício

| Modelo                          | Resolve | $/task  | Eficiência |
| ------------------------------- | ------- | ------- | ---------- |
| 1. deepseek/deepseek-v4-flash   | 60%     | $0.0017 | 🥇         |
| 2. meta-llama/llama-4-maverick  | 60%     | $0.0025 | 🥇         |
| 3. qwen/qwen3.6-plus            | 80%     | $0.0082 | 🥇         |
| 4. meta-llama/llama-4-scout     | 40%     | $0.0025 |            |
| 5. google/gemini-3.1-flash-lite | 40%     | $0.0063 |            |

## Conclusões

1. **MoE domina:** 9 dos top 10 são MoE. Modelos MoE budget superam densos premium.
2. **DeepSeek V4 Flash é o rei do custo-benefício:** $0.10/M, 60% resolve.
3. **Llama 4 Maverick é o mais eficiente:** 60% resolve com apenas 4.6k tokens.
4. **Qwen3.6 Plus é o melhor MoE:** 80% resolve (empata com Grok 4.3), $0.33/M.
5. **Modelos densos caros falham:** Claude Opus ($5/M), GPT-4.1 ($2/M) — 0% resolve.
6. **Raciocínio lento demais:** DeepSeek R1, O4-mini — timeout ou 0%.
