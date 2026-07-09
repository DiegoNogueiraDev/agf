# Orçamento de tokens em harness agêntico — modelo de custo e táticas

> Escopo: técnicas **training-free** (consumo via API, sem acesso aos pesos). Alvo: DeepSeek V4 Flash ($0,14/1M input · $0,28/1M output; cache hit a fração do input).
> Tese: a economia real via API é de **~2x–4x**, não de “20x”. Ela vem de atacar simultaneamente três frentes com donos distintos — e de respeitar a tensão entre elas, porque otimizar uma cega pode piorar outra.

---

## 1. Modelo de custo

O custo de uma tarefa agêntica é a soma sobre os passos do agente. O ponto crítico que a maioria das modelagens erra: **o cache cobre apenas o prefixo contíguo idêntico** ao da chamada anterior, não uma fração difusa do input inteiro. Por isso o input de cada passo se divide em dois blocos, não em “uma porcentagem cacheada”:

```
Custo = Σ_{i=1..N} [ p_cache · C_i          ← prefixo cacheado (bloco contíguo idêntico)
                   + p_in    · (T_in,i − C_i) ← sufixo volátil (paga preço cheio)
                   + p_out   · (T_reason,i + T_resp,i) ] ← output: raciocínio + resposta
```

| Símbolo                  | Significado                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `N`                      | passos/turnos do agente na tarefa                                        |
| `T_in,i`                 | tokens de input no passo i (contexto acumulado)                          |
| `C_i`                    | tokens do prefixo que deram cache hit (≤ comprimento do prefixo estável) |
| `T_reason,i`             | tokens de raciocínio (cobrados como **output**)                          |
| `T_resp,i`               | tokens de resposta visível                                               |
| `p_in : p_cache : p_out` | em V4 Flash, ≈ `1 : ~0,1 : 2` (confirmar a taxa de cache do provedor)    |

**Três alavancas independentes em mecanismo, acopladas na prática:**

| Alavanca            | O que reduz      | Fase de inferência | Tática                                             |
| ------------------- | ---------------- | ------------------ | -------------------------------------------------- |
| `T_in`              | volume de input  | prefill            | compressão, AST, seleção de contexto               |
| `C / T_in`          | preço do input   | prefill (cache)    | estabilidade de prefixo                            |
| `T_reason + T_resp` | volume de output | decode             | reasoning sob demanda; output mecânico fora do LLM |

Quem só ataca `T_in` (compressão/AST) colhe metade do possível: `output` custa o dobro por token e `cache` pode zerar o preço do input repetido. Se seu input já está otimizado, o ganho marginal está quase todo nas outras duas colunas.

---

## 2. As três frentes

### Frente A — volume de input (`T_in`)

O survey de prompt compression (Li et al., NAACL 2025) separa **hard prompt** (remove/reescreve texto — funciona via API) de **soft prompt** (embeddings aprendidos — exige treino). Métodos hard, training-free, entregam tipicamente **20–50% de redução com 1–5% de perda de desempenho**. Referências de base:

- **Selective Context** (EMNLP 2023): remove unidades de baixa auto-informação; ~50% de corte de contexto com degradação pequena.
- **LLMLingua / LongLLMLingua** (EMNLP 2023 / 2024): poda token-level por perplexidade via modelo pequeno (2–5x em casos gerais).

AST é seleção estrutural de alta densidade — assinatura+estrutura no lugar do corpo. É a forma certa de atacar esta frente em código, e provavelmente já te coloca perto do teto. **Conclusão: pouco ganho incremental aqui.**

### Frente B — preço do input via cache (a alavanca subexplorada)

Mecânica, não ML: o cache é _prefix-based_. Um único token diferente cedo no contexto invalida tudo a partir dali. A consequência operacional é uma **tensão direta com a Frente A**: compressão dinâmica e AST recomputado mudam o prefixo a cada passo e derrubam o cache. É possível pagar preço cheio por um input _menor_ quando se pagaria preço de cache por um input _maior porém estável_.

Regra de layout — **ordenar o contexto por volatilidade crescente**:

```
┌─ PREFIXO ESTÁVEL (cacheável, idêntico entre chamadas) ─┐
│ system prompt · definições de ferramentas · memória    │
│ de longo prazo que muda pouco                           │
├─ CAUDA VOLÁTIL (paga preço cheio) ──────────────────────┤
│ histórico compactado · AST recomputado · turno atual    │
└─────────────────────────────────────────────────────────┘
```

A compressão age **só na cauda**. O prefixo nunca muda dentro de uma tarefa. Esta é a mudança de maior retorno e menor esforço — e é independente do modelo.

### Frente C — volume de output (o lado caro)

Output custa 2× o input e **nenhuma técnica de input o reduz**. A literatura de efficient reasoning (2024–2025) converge num diagnóstico: “overthinking” — traços de raciocínio verbosos mesmo para problemas triviais (relatos de 15k+ tokens em problemas resolvíveis com algumas centenas). Cortar o raciocínio às cegas derruba acurácia; o corte precisa ser condicional. Dois movimentos training-free:

1. **Reasoning effort condicional.** Tokens de raciocínio são output (2× preço). Default no esforço mínimo; eleve (`high`/`xhigh`) só quando a tarefa for difícil. É o princípio do **UnCert-CoT** (Zhu et al., 2025): acionar raciocínio longo só sob incerteza alta. Maior alavanca isolada de output.
1. **Output mecânico sai do LLM.** Boilerplate, scaffold, config, glue previsível → template / `cp` / script determinístico. O LLM **decide** (escolha curta, formato fechado); o sistema **materializa**. Token de output que vira template custa zero. Parente do **Chain-of-Draft** (Xu et al., 2025): só o essencial é gerado.

---

## 3. Quanto dá para esperar (sem fabricar precisão)

Eu não vou multiplicar três fatores inventados, porque eles **não são independentes** (Frente A × Frente B se canibalizam), e o produto daria uma falsa precisão. O que a evidência sustenta, em ordem de grandeza:

- **Input já otimizado (seu caso):** ~0% de ganho novo só de comprimir mais.
- **Ligar cache com prefixo estável:** corta a maior parte do **preço** do input repetido. Em loop agêntico, input domina o volume, então este é o item de maior impacto na fatura. Ordem de grandeza: input efetivo cai para ~⅓–½ do custo atual.
- **Output condicional + geração determinística:** corta output onde há overthinking ou boilerplate. Em workloads que hoje raciocinam demais, ordem de grandeza de ~2x menos output.

**Combinado, training-free, alvo realista: 2x–4x de redução de custo total.** Os números de 20–26x da literatura (ex.: GIST tokens) são soft-prompt com fine-tuning e acesso aos pesos — fora do alcance de quem só consome API. Qualquer promessa de “redução brutal via API” acima de ~5x deve ser tratada com ceticismo.

---

## 4. Implementação — pseudocódigo das duas peças que faltavam

**Montador de prefixo estável (Frente B):**

```python
def build_prompt(task):
    # Bloco 1: NUNCA muda dentro da tarefa → cache hit garantido
    prefix = [SYSTEM_PROMPT, TOOL_DEFS, stable_memory(task.id)]
    # Bloco 2: volátil → fora do prefixo, sempre no fim
    tail = [compacted_history(task), volatile_ast(task), current_turn(task)]
    return prefix + tail   # ordem fixa; só 'tail' varia entre passos
```

**Roteador de esforço (Frente C):**

```python
def choose_effort(step):
    # decisão BARATA: heurística determinística, sem chamar LLM caro
    if step.is_mechanical:          # scaffold, rename, formatação
        return None                 # → materializa fora do LLM, não chama modelo
    if step.low_ambiguity:          # edição local, fix óbvio
        return "minimal"
    return "high"                   # só reasoning pesado quando há incerteza real
```

A decisão de roteamento **não pode** custar caro: heurística sobre metadados (tipo da tarefa, tamanho do diff, ambiguidade), nunca um segundo LLM em esforço alto deliberando sobre qual esforço usar.

---

## 5. Ordem de execução (maior ROI primeiro)

1. **Prefixo estável + cache.** Maior ganho, menor esforço, provavelmente ainda não feito. Reorganizar contexto por volatilidade e ligar prompt caching.
1. **Reasoning effort condicional.** Roteador determinístico; default mínimo.
1. **Geração só-quando-necessário.** LLM seleciona por metadados; materialização determinística.
1. **Afinar compressão sem quebrar prefixo.** Já perto do teto; garantir que a compressão atue só na cauda.

---

## 6. Critério de medição (com gatilho numérico)

Logar por chamada: `T_in`, `C` (cache hit tokens), `T_out` (separando reason/resposta se a API expõe), `N`, custo. Aplicar **um item da seção 5 por vez** sobre o mesmo conjunto de tarefas reais.

Critérios de decisão concretos:

- **Cache funcionando?** `C / comprimento_do_prefixo ≥ 0,9` nas chamadas após a primeira de cada tarefa. Se estiver baixo, algo está mutando o prefixo — investigar antes de seguir.
- **Effort calibrado?** Razão `T_reason / T_resp`. Se >> 1 em tarefas simples, o roteador está mandando reasoning demais.
- **Onde foi o dinheiro?** Decompor a fatura nos três termos do §1. Se o custo não caiu onde o item previa, o gargalo migrou — quase sempre para output (effort alto) ou para cache miss induzido por compressão.

Parar quando o termo dominante da fatura for `p_out · T_resp` (resposta útil de verdade) — aí você está pagando por trabalho, não por desperdício, e otimizar mais tem retorno decrescente.

> **Princípio único:** o LLM é caro onde é insubstituível (julgamento). Todo token — de input ou output — que um sistema determinístico pode produzir, ou que um cache pode reaproveitar, deve sair do loop do modelo.

---

### Referências (enxutas — só o que sustenta um ponto)

- Li et al., NAACL 2025 — _Prompt Compression for LLMs: A Survey_ (taxonomia hard/soft; teto de 20–50% training-free)
- Jiang et al., EMNLP 2023/2024 — _LLMLingua / LongLLMLingua_ (poda por perplexidade)
- Li et al., EMNLP 2023 — _Selective Context_ (~50% por auto-informação)
- Mu et al., NeurIPS 2023 — _GIST_ (26×, mas soft-prompt: exige treino — fronteira do que NÃO dá via API)
- Zhu et al., 2025 — _UnCert-CoT_ (reasoning sob demanda)
- Xu et al., 2025 — _Chain-of-Draft_ (gerar só o essencial)
