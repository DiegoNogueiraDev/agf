# Runbook — `agf deliver`: do pedido à entrega, autônomo e econômico

A porta amigável do produto. Um comando encadeia tudo, **sem slash manual**, com
práticas de grafo (TDD/DoD/WIP=1) e custo de token brutalmente baixo.

## Primeiros passos (escolha 1 provider)

```bash
# A) Modelo LOCAL (grátis, $0/token) — recomendado se você tem um servidor:
agf provider use ollama --base-url http://SEU_IP:11434/v1
agf model set qwen2.5-coder:14b

# B) GitHub Copilot:
agf login                      # device-flow

# C) OpenRouter / OpenAI-compat:
agf provider use openrouter    # + OPENROUTER_API_KEY no ambiente
```

## Entregar

```bash
agf deliver "crie um kanban com colunas a fazer, fazendo e feito, e permita mover cards"
agf deliver --file requisitos.pdf        # PDF/HTML/DOCX/MD
agf deliver --image board.png            # OCR local (visão só se o provider tiver)
agf deliver --live "..."                 # implementa de verdade (autopilot --live)
```

`agf status` mostra provider/modelo/cache/tokens/$/economia a qualquer momento.
Na TUI: `/deliver <pedido>` e `/status` fazem o mesmo (herdam a config do projeto).

## O que `deliver` encadeia (e os slash equivalentes)

| Etapa                     | O que faz (determinístico onde dá)                                                       | Equivalente manual                   |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| 1. normalizar             | parse (pdf/html/docx) + **OCR** p/ imagem + **resumo extrativo** (0 token)               | — (novo: `core/intake`)              |
| 2. PRD                    | única borda criativa (IA) sobre o texto já destilado                                     | `agf generate-prd` / `/generate-prd` |
| 3. grafo                  | extrai entidades → nós/arestas                                                           | `agf import-prd` / `/import-prd`     |
| 3b. sementes (greenfield) | varre exemplos públicos e cacheia p/ enviesar o scaffold (0 token; `--no-fetch` desliga) | `agf scaffold --fetch <q>`           |
| 4. build                  | decompõe → autopilot (TDD/DoD/WIP=1)                                                     | `agf build` / `/build`               |

Não é preciso chamar as etapas à mão — `deliver` as encadeia. Elas existem
separadas para controle fino.

## Economia (várias frentes, automáticas)

- **Determinismo-first:** OCR + parse + resumo extrativo cortam tokens/ambiguidade
  ANTES da IA (a IA só gera o PRD do conteúdo destilado). Concepts do livro
  `Algorithms.pdf` (editDistance p/ dedup, TF p/ saliência) — `core/algorithms`.
- **Cache local de resposta:** repetição = 0 token (qualquer provider), persistente.
- **Compactação de saída de ferramenta:** a torrente de testes/lint/build que o agente LÊ é
  comprimida deterministicamente (falhas e sumário preservados) — menos tokens de entrada.
- **Effort condicional + tier-router:** raciocínio só sob incerteza; modelo certo p/ tarefa.
- **Modelo local:** $0/token. Tudo visível em `agf status` / `agf metrics`.

## Resiliência: failover entre providers (opt-in)

`agf provider failover "openrouter,ollama:qwen2.5-coder:7b"` define uma cadeia: em erro do
provider ativo, cai para o próximo (modelo opcional por entrada). Previsibilidade de custo,
nunca trava. Visível em `agf status` / `agf doctor`. `--clear` remove; `LLM_FAILOVER_CHAIN`
no ambiente tem precedência. O cache fica POR FORA (hit evita todos os providers).

## OCR de imagem sem instalar nada (zero-config)

`agf deliver --image board.png` faz OCR local (0 token). Ordem: `tesseract.js` (WASM, se
presente — `npm i tesseract.js`) → binário do sistema (`tesseract`) → visão gated. `agf doctor`
mostra o modo de OCR ativo.

## Trocar provider/endpoint pela TUI

`/provider` (lista + ativo), `/provider use <id>`, `/provider use <id> <base-url>`,
`/provider set-url <url>`, `/provider current` — mesma config persistida do CLI.

## Analogia árvore/sementes (o norte)

Raízes = contexto/determinismo (intake, repo-map, RAG). Frutos = a entrega (`deliver`).
Sementes = corpus público (github.com via `scaffold --fetch`) p/ greenfield. Não
desviar do foco: entregar rápido, barato, intuitivo, multi-provider.

## Verificação

- e2e determinístico (0 token): `src/tests/deliver-e2e.test.ts` — chain → `done`,
  WIP=1, gates, 0 token.
- Smoke real $0: `agf provider use ollama --base-url … && agf deliver --live "<pedido>"`.
