# Cross-Model Benchmark Results

## Tested: 24 modelos | T0 (5 atomic tasks) | Full suite: 1 modelo

### Top 5 por custo-benefício (MoE)

1. **meta-llama/llama-4-maverick** — 60% T0, 20% full, $0.15/M, 4.6k tok ← BEST OVERALL
2. **deepseek/deepseek-v4-flash** — 60% T0, $0.10/M, 17k tok ← BEST BUDGET
3. **meta-llama/llama-4-scout** — 40% T0, $0.10/M, 5.3k tok
4. **google/gemini-3.1-flash-lite** — 40% T0, $0.25/M, 4.9k tok
5. **x-ai/grok-4.3** — 80% T0 (absolute leader), $2.50/M, 23.7k tok

### Key Insight

MoE models (DeepSeek V4 Flash, Llama 4) match or exceed dense models
at 10-50x lower cost. Llama 4 Maverick is the efficiency champion.

### Ainda pendentes (~60 modelos)

MoE: qwen3.6-flash, qwen3.6-plus, nemotron-3-super, glm-4.7-flash,
gemini-3.5-flash, minimax-m3, minimax-m2.7, kimi-k2-0905,
stepfun-3.7, glm-4.5, ernie-4.5, cogito-671b, reka-flash-3
Denso: gpt-5.5, gpt-chat-latest, command-a, gpt-4.1, sonnet-4,
opus-4.6, opus-4.8, o3, o3-mini, sonar-reasoning, etc.

### Próximos passos sugeridos

1. Rodar full suite nos top 3 (maverick, v4-flash, grok-4.3)
2. Testar modelos pendentes com timeouts maiores (10min)
3. Ajustar tier-router para usar MoE budget como default
