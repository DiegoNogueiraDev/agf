# Plano: RAG Duplo de Entrada e Saída para o Harness

**Tese única:** tirar do contexto e da geração tudo que pode ser recuperado.
Comando recorrente → retrieval (barato). Estrutura recorrente → retrieval (barato).
LLM (custo `out = 2×`) fica reservado para o que é genuinamente novo.

```
                        ┌─────────────────────────────┐
   intenção do agente → │  RAG-IN: qual comando rodar  │ → comando exato → exec
                        └─────────────────────────────┘
                        ┌─────────────────────────────┐
   objetivo de output → │ RAG-OUT: qual scaffold usar  │ → esqueleto + delta via LLM
                        │   (com portão recuperar/gerar)│
                        └─────────────────────────────┘
```

Os dois lados reusam o **motor de busca híbrido que o harness já tem** (BM25 + ingestão).
O trabalho novo é curadoria de corpus, fatiamento e o reranker — não infraestrutura.

---

## Parte 0 — Princípios de design (valem para os dois RAGs)

1. **Qualidade de corpus > volume.** Indexar só o que existe no ambiente-alvo. Um comando
   inexistente recuperado é pior que nenhum: o agente sugere algo que não roda.
1. **Granularidade = unidade de tarefa, não documento.** Não indexar “a man page do tar”;
   indexar “extrair tar.gz”, “criar arquivo comprimido”, “listar sem extrair”.
1. **Recuperar por intenção, não por nome.** O agente sabe a tarefa (“achar padrão em
   arquivo”), não o comando (`grep`). Query = linguagem natural; chunk indexado pela
   descrição da tarefa.
1. **Busca híbrida + rerank.** Recall por embedding+BM25 (~20 candidatos) → cross-encoder
   reordena por relevância real → devolve top 1-3.
1. **Portão de confiança.** Todo retrieval tem um limiar. Abaixo dele: fallback explícito
   (no RAG-IN, pedir `--help`; no RAG-OUT, gerar via LLM). O portão é o que protege a
   qualidade e é o que materializa a economia.

---

## Parte 1 — RAG-IN: Recuperação de comandos

### 1.1 Fontes de corpus

Não existe “baixar todos os comandos”. Há duas origens combinadas:

**(A) Corpora baixáveis (estáticos, portáveis) — Markdown pronto para indexar**

| Fonte                                                 | O que cobre                                                                           | Formato  | Como obter                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| **TLDR pages** (`tldr-pages/tldr`)                    | Exemplos práticos curtos de comandos Unix/Linux/macOS/Windows, já fatiados por tarefa | Markdown | `git clone` do repo; pasta `pages/`, `pages.linux/`, `pages.osx/`, `pages.windows/` |
| **PowerShell-Docs** (`MicrosoftDocs/PowerShell-Docs`) | Todos os cmdlets: sintaxe, parâmetros, exemplos                                       | Markdown | `git clone`; pastas por versão e módulo                                             |
| **Bash manual**                                       | Builtins (`cd`, `export`, `alias`…) que não têm man page própria                      | Texto    | Manual GNU bash + `help` builtin                                                    |

**(B) Extração local (auto-atualizável, precisão de ambiente) — o que existe na máquina-alvo**

| Origem                          | Comando de extração                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Man pages instaladas            | `apropos .` para listar; `man <cmd>` / `man -K` para texto; vivem em `/usr/share/man` |
| Binários no PATH                | varrer `/usr/bin`, `/usr/local/bin`, `$PATH`; cada um → tentar `<cmd> --help`         |
| Bash builtins                   | `compgen -b` lista; `help <builtin>` extrai                                           |
| PowerShell (se presente)        | `Update-Help` uma vez; `Get-Help <cmdlet> -Full` por cmdlet; `Get-Command` lista      |
| **Comandos do próprio harness** | introspecção do seu CLI: enumerar subcomandos e flags (ver 1.4)                       |

> **Decisão (você pediu os dois): pipeline estático + camada de extração local.**
> O estático garante portabilidade e exemplos de qualidade (TLDR). A extração local
> roda na máquina-alvo e **filtra o índice para só o que existe ali**, além de capturar
> versões/flags reais. Resultado: nunca sugere comando inexistente, e ainda assim parte
> de um corpus rico.

### 1.2 Fatiamento (chunking)

Cada chunk é uma **(intenção, comando, contexto-mínimo)**:

```json
{
  "id": "tar-extract-gz",
  "intent": "extrair um arquivo tar comprimido com gzip",
  "command": "tar -xzf {arquivo}.tar.gz",
  "family": "unix",
  "tool": "tar",
  "flags_explained": "-x extrai, -z gzip, -f arquivo",
  "danger": false,
  "source": "tldr"
}
```

- TLDR já vem fatiado assim → conversão quase 1:1.
- Man pages: fatiar por seção de exemplo + sinopse; descartar prosa longa de history/bugs.
- PowerShell: cada bloco de exemplo de `Get-Help` vira um chunk.
- Marcar `danger: true` em comandos destrutivos (`rm -rf`, `dd`, `mkfs`, `Remove-Item -Recurse`)
  para o agente exigir confirmação.

### 1.3 Indexação e recuperação

Reaproveita o motor do harness:

1. **BM25** sobre `intent` + `command` + `tool` (pega match lexical do nome do comando).
1. **Embedding** de `intent` (pega match semântico: “achar texto” ≈ “buscar padrão”).
1. **Fusão** dos dois rankings (Reciprocal Rank Fusion).
1. **Rerank** (cross-encoder) dos ~20 candidatos → top 3.
1. **Portão:** se score do top < limiar → devolver instrução de fallback
   (`rode <cmd> --help`) em vez de chutar.

### 1.4 Incluir os comandos do próprio harness

O harness já expõe subcomandos (BM25, ingestão, AST, code intelligence). Indexá-los junto:

- Escrever um introspector que enumera `harness <sub> --help` para cada subcomando e gera
  chunks no mesmo schema (`family: "harness"`).
- Vantagem dupla: o agente passa a **se auto-operar via retrieval** (dogfooding — alinhado
  à v13 auto-hospedada), e o RAG-IN cobre tanto utilitários do sistema quanto a sua
  própria superfície de comandos sem distinção.

---

## Parte 2 — RAG-OUT: Recuperação de scaffolds/boilerplates

A ponta mais valiosa em economia de token e a mais delicada em qualidade.

### 2.1 O problema central: o portão recuperar-vs-gerar

Scaffold não é texto, é **estrutura com semântica**. Recuperar o errado é pior que gerar:
o agente preenche um esqueleto inadequado e produz algo sutilmente quebrado.
Portanto o reranker decide não só “qual é parecido” mas “qual é _adequado ao objetivo_”,
e — crucial — **quando nenhum serve**.

```
objetivo de output
      │
      ▼
recall de candidatos (híbrido) ──▶ rerank por adequação ──▶ score do melhor
                                                               │
                                          ┌────────────────────┴───────────────────┐
                                   score ≥ limiar                            score < limiar
                                          │                                         │
                                  usar scaffold +                            gerar via LLM
                                  LLM só no delta                            (caso genuinamente novo)
                                  (preencher buracos)                        + opcional: virar
                                                                            novo scaffold (2.4)
```

### 2.2 De onde vêm os scaffolds (corpus de saída)

1. **Seus próprios artefatos recorrentes** — a fonte mais valiosa. Você já gera PRDs,
   contratos, decks, propostas HTML, skills (`SKILL.md`+`policy.yaml`+`decide.ts`…),
   estruturas de repo. Cada formato recorrente vira um template parametrizado.
1. **Boilerplates de código canônicos** — estruturas de projeto (CLI TS, FastAPI,
   componente React, etc.) que você usa repetidamente.
1. **Padrões extraídos do histórico** — minerar outputs passados do harness: o que se
   repete com pequenas variações é candidato a scaffold.

Cada scaffold tem **slots** (buracos a preencher) e **metadados de adequação**:

```json
{
  "id": "prd-produto-v2",
  "goal": "PRD de produto de software com fases e métricas",
  "slots": ["nome", "problema", "fases[]", "metricas[]", "riscos[]"],
  "structure_ref": "templates/prd_v2.md",
  "fit_tags": ["prd", "produto", "software", "fases"],
  "novelty_floor": 0.62
}
```

### 2.3 Como o “preencher buracos” economiza token

- Sem scaffold: o LLM gera **toda** a estrutura + conteúdo (`out = 2×` em cada token).
- Com scaffold: a estrutura vem do retrieval (custo de input baixo, cacheável a `0,5×`);
  o LLM gera **só os slots**. Em documentos estruturados (PRD, contrato), a estrutura é
  60-80% do texto → é exatamente a fatia que sai da geração cara.
- O reranker é quem garante que o esqueleto recuperado é o certo — sua observação original.

### 2.4 Loop de aprendizado (opcional, fase 4)

Quando o portão cai pro LLM (output novo) e o resultado é bom, **promover esse output a
scaffold**: extrair sua estrutura, parametrizar os pontos variáveis, indexar. O sistema
fica mais barato com o uso — o que hoje é “novo” e caro, amanhã é “recuperável” e barato.

### 2.5 Risco e mitigação

| Risco                           | Mitigação                                                         |
| ------------------------------- | ----------------------------------------------------------------- |
| Scaffold errado recuperado      | Limiar de confiança + `fit_tags` no rerank; abaixo do piso, gerar |
| Forçar template em caso novo    | `novelty_floor` por scaffold: objetivo muito distante → LLM       |
| Template apodrece (desatualiza) | Versionar scaffolds; loop 2.4 substitui os velhos                 |
| Slot mal preenchido             | Validação pós-preenchimento (lint/schema) antes de entregar       |

---

## Parte 3 — Integração no harness existente

```
harness/
├── rag_in/
│   ├── corpus/            # TLDR + PowerShell-Docs (estático, baixado)
│   ├── extract_local.*    # man/--help/builtins/PS + introspector do harness (1.4)
│   ├── chunk.*            # fatiador → schema (intent, command, ...)
│   └── query.*            # buscar_comando(intencao) -> comando | fallback --help
├── rag_out/
│   ├── scaffolds/         # templates parametrizados (seus artefatos + boilerplates)
│   ├── mine_history.*     # minera outputs passados -> candidatos a scaffold
│   ├── gate.*            # portão recuperar-vs-gerar (limiar + novelty_floor)
│   └── fill.*            # preenche slots; LLM só no delta
├── telemetry/             # medição de tokens$ e economia (Parte 4)
│   ├── ledger.*          # registra cada evento (tokens in/cache/out + custo$)
│   ├── pricing.*         # tabela $/token por modelo; tokens→dólar
│   ├── counterfactual.*  # estima baseline (o que teria gastado sem RAG)
│   └── report.*          # agrega: gasto, economia, hit-rate, ROI do portão
└── search/                # MOTOR JÁ EXISTENTE: BM25 + embedding + rerank (reutilizado)
```

- **Reuso máximo:** `search/` (BM25/ingestão/rerank) serve os dois RAGs. Não duplicar.
- **Superfície mínima:** dois pontos de entrada — `buscar_comando(intencao)` e
  `montar_output(objetivo)` — que internamente chamam recall → rerank → portão.
- **Filosofia Karpathy:** cada módulo legível em um arquivo; zero dependência supérflua;
  os schemas de chunk/scaffold são JSON simples, não framework.

---

## Parte 4 — Telemetria: medir gasto e economia (tokens/dólar$)

Sem isto você não sabe se o portão está calibrado — nem se um scaffold ruim custa mais do
que economiza. A medição **fecha o loop de decisão**: é o sinal que ajusta os limiares.

### 4.1 O princípio que não pode ser ignorado: economia é contrafactual

Somar tokens gastos é fácil e quase inútil. O número que importa é:

```
economia = custo_baseline_estimado  −  custo_real
           (o que TERIA gasto sem RAG)   (o que gastou com RAG)
```

Se você só medir “gastei X”, está medindo consumo, não economia. A honestidade do sistema
inteiro depende de estimar `custo_baseline` de forma defensável (4.4). Sem isso, a métrica
vira marketing para você mesmo.

### 4.2 Unidade de custo: do token ao dólar

A fórmula relativa do deck (`in 1×`, `cache 0,5×`, `out 2×`) é a _forma_ do custo.
Para virar dinheiro, multiplica-se pelo preço real do modelo (`pricing.*`):

```
custo$ = in_tokens     × preco_in$
       + cache_tokens  × preco_cache$     (tipicamente ~0,1–0,5× do preco_in, varia por modelo)
       + out_tokens    × preco_out$       (tipicamente ~3–5× do preco_in)
```

> Os multiplicadores reais de cache e out **dependem do provedor** e mudam com o tempo —
> por isso `pricing.*` é uma tabela editável, não constantes no código. A fórmula `1×/0,5×/2×`
> é o modelo de raciocínio; a tabela é a verdade comercial do dia.

### 4.3 O ledger: registrar cada evento

Cada chamada do agente emite **um registro append-only** (JSONL, uma linha por evento —
fiel à filosofia Karpathy: legível, sem banco pesado):

```json
{
  "ts": "2026-06-17T13:40:00Z",
  "task_id": "abc123",
  "side": "out", // "in" (comando) | "out" (scaffold) | "llm" (geração pura)
  "decision": "retrieved", // "retrieved" | "generated" | "fallback_help"
  "rerank_score": 0.81, // confiança que disparou a decisão
  "tokens": { "in": 420, "cache": 1200, "out": 90 },
  "cost_usd": 0.0037, // custo real via pricing.*
  "baseline_tokens": { "in": 300, "cache": 0, "out": 1800 }, // estimativa (4.4)
  "baseline_cost_usd": 0.0291,
  "saved_usd": 0.0254, // baseline − real
  "model": "claude-sonnet-4-6"
}
```

Campos-chave para o loop: `decision` + `rerank_score` + `saved_usd`. Cruzando os três você
descobre **em que faixa de score o retrieval realmente economiza** e onde está perdendo.

### 4.4 Como estimar o baseline (a parte difícil, feita com honestidade)

Três métodos, do mais barato ao mais rigoroso — escolher por fase:

1. **Sombra por amostragem (recomendado para começar):** em 1 de cada N tarefas, rodar
   _também_ o caminho LLM puro em paralelo e medir de verdade. As outras N−1 usam a média
   da sombra como baseline. Custo controlado, baseline empírico.
1. **Modelo estrutural:** para RAG-OUT, `baseline_out ≈ tokens do scaffold preenchido`
   (afinal o LLM teria gerado a estrutura inteira). Barato, levemente conservador.
1. **A/B temporal:** rodar uma semana com RAG desligado, fixar baselines por tipo de tarefa,
   religar. Mais limpo para um relatório de ROI, mas custa a semana “cara”.

> Regra de honestidade: **marcar no relatório qual método gerou cada baseline.** Economia
> estimada por modelo estrutural ≠ economia medida por sombra. Não misturar os dois num
> número único sem rótulo.

### 4.5 O relatório: o que acompanhar

`report.*` agrega o ledger em painéis simples (mesma estética dos charts do deck):

| Indicador                                    | Pergunta que responde                                     |
| -------------------------------------------- | --------------------------------------------------------- |
| **Gasto$ / dia** (in, cache, out empilhados) | Quanto estou queimando, e em qual fatia?                  |
| **Economia$ / dia** (baseline − real)        | Quanto o RAG está devolvendo?                             |
| **Hit-rate** (`retrieved` / total) por lado  | Com que frequência evito o LLM?                           |
| **Economia$ por faixa de rerank_score**      | Em que confiança o portão compensa? → calibra limiar      |
| **Custo do retrieval em si**                 | Embedding+rerank também custam; net economy desconta isso |
| **Top scaffolds por $ economizado**          | Quais templates pagam o projeto?                          |
| **Scaffolds com economia negativa**          | Quais recuperam errado e custam retrabalho? → remover     |
| **$ / tarefa** (série temporal)              | Tendência: o sistema fica mais barato com o uso?          |

### 4.6 O fecho do loop

```
ledger → report → "score 0.55–0.65 economiza pouco e erra às vezes"
                 → subir limiar do portão para 0.65
                 → menos retrieval duvidoso, mais geração confiável
                 → próximo ciclo: medir de novo
```

A telemetria não é passiva: o `rerank_score × saved_usd` é o que **ajusta os limiares dos
dois RAGs**. É o mesmo princípio do reward-hacking audit que você já fez — instrumentar para
não se enganar com um número que parece bom.

### 4.7 Custo honesto da própria telemetria

Medir não é grátis: a sombra por amostragem (4.4 método 1) gasta tokens de propósito. É um
investimento — você paga para _saber_ a economia. Mitigar com taxa de amostragem baixa
(ex.: 5%) e desligável por config. O ledger em si (JSONL local) é desprezível.

---

## Parte 5 — Roadmap por fases

| Fase                              | Entrega                                                                                                       | Critério de pronto                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **F1 — RAG-IN estático**          | TLDR+PS baixados, fatiados, indexados; `buscar_comando` no ar                                                 | Top-1 correto em corpus de teste de intenções comuns                                             |
| **F2 — RAG-IN local**             | Extração de man/`--help`/builtins na máquina-alvo + introspector do harness; índice filtrado ao ambiente      | Nunca sugere comando inexistente no ambiente; cobre subcomandos do harness                       |
| **F2.5 — Telemetria base**        | `ledger` + `pricing` + relatório de gasto$ (in/cache/out)                                                     | Cada chamada registra tokens e custo$ reais; painel de gasto diário no ar                        |
| **F3 — RAG-OUT base**             | Scaffolds dos seus artefatos recorrentes; portão recuperar-vs-gerar; slots; **baseline contrafactual ligado** | Documento montado com LLM só nos slots; **economia$ medida (não estimada às cegas) vs baseline** |
| **F4 — Aprendizado + calibração** | Mineração de histórico → novos scaffolds; **limiares ajustados por `rerank_score × saved_usd`**               | Novo scaffold é recuperado na tarefa seguinte; limiar do portão movido por dados de economia     |

> A telemetria entra **antes** do RAG-OUT (F2.5), não no fim: sem medir o baseline você não
> prova que o portão de saída economiza. Medição é pré-requisito de F3, não enfeite.

### Métrica única de sucesso (casa com o deck)

Medir **tokens$ por tarefa, antes e depois** — o ledger (4.3) cruzado com o `/context` do
próprio Claude Code, separando `in (1×)`, `cache (0,5×)`, `out (2×)` e convertendo em dólar
via `pricing.*`. O número é seu, reproduzível, e não depende de benchmark de fornecedor.
É a evidência limpa de “CLI vs MCP” que faltava — agora estendida para “retrieval vs geração”
na saída, **e expressa em dinheiro, não só em tokens**.

---

## Decisões em aberto (para calibrar antes de F3)

1. **Ambiente-alvo do RAG-IN:** Linux/macOS apenas, ou incluir PowerShell de fato?
   (Define se PowerShell-Docs entra ou é peso morto.)
1. **Limiar do portão de saída:** começar conservador (recupera só com alta confiança,
   gera no resto) e afrouxar com dados, ou o inverso?
1. **Embedding local vs API:** índice de comandos é pequeno e estável — embedding local
   (sem custo recorrente) provavelmente vence; confirmar com volume real do corpus.
