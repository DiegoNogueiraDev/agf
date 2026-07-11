# Runbook — compressão de saída de ferramenta (a maior alavanca de token de entrada)

O agente **lê** saída de teste/lint/build/git/etc a cada iteração. Comprimir essa
saída — preservando o sinal (falhas + sumário), colapsando o volume previsível (a
torrente de OK) — é corte de token de **entrada** recorrente e 100% determinístico.

## Princípio único

Quase toda saída de SDLC tem a mesma forma: _N itens → a maioria OK → alguns
problemas → um sumário._ Cada filtro **mantém problemas + sumário** e **colapsa os
OK** numa contagem. Guardrails: `safeApply` (nunca corrompe → raw), **no-grow**
(se cresceu, devolve original), `MIN_COMPRESS_SIZE`, e um teste por filtro provando
que a falha sobrevive.

## Arquitetura (3 peças)

| Peça                     | Arquivo                                        | O que faz                                                                                    |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Registry declarativo** | `core/economy/tool-compress/registry.ts`       | Cada filtro é `{ name, priority, detect, apply }`. Adicionar cobertura = registrar 1 objeto. |
| **Discover loop**        | `core/economy/tool-compress/discover.ts`       | Registra saídas que passaram **sem** filtro → mostra o que falta cobrir (data-driven).       |
| **Filtros declarativos** | `core/economy/tool-compress/custom-filters.ts` | Regra em JSON vira filtro — qualquer comando coberto **sem código**.                         |

## Built-ins (seguros e universais)

`git-diff · git-log · git-status · lint-report (tsc/eslint/ruff/flake8/pylint) ·
test-runner (vitest/jest/pytest/go test/cargo test/rspec) · build-output (npm/cargo/
yarn) · grep · find · tree · ls · search-list · read-numbered · dedup-log ·
smart-truncate`. Veja todos: `agf compress filters`.

## Cobertura sob demanda (o "todos os comandos", do jeito certo)

Hardcodar todo comando bash/unix/windows seria código morto e arriscado (um filtro
errado pode **engolir uma linha CRITICAL** — o no-grow não pega perda de sinal). Para
saídas de **alta variância/alto risco** (security/infra), use **regras declarativas**
onde VOCÊ controla `keep`/`drop`:

```bash
export AGF_RTK_FILTERS=docs/examples/tool-output-filters.example.json   # npm-audit, trivy, docker, kubectl, terraform
```

Cada regra:

```json
{
  "name": "kubectl-get",
  "detect": ["^NAME\\s+READY\\s+STATUS"],
  "keep": ["Error|CrashLoopBackOff|Pending|^NAME\\s"],
  "drop": ["\\bRunning\\b|\\bCompleted\\b"]
}
```

`detect` (qualquer regex casa na janela inicial) escolhe o filtro; `keep` sempre
sobrevive (vence `drop`); `drop` é colapsado numa contagem; linha não classificada
é **mantida** (conservador, nunca perde sinal).

## Discover — descubra o que falta (não especule)

```bash
export AGF_RTK_DISCOVER=1          # liga o profiling (overhead 0 por default)
agf deliver "..."  # ou autopilot/tui — roda o agente normalmente
agf compress discover                   # top saídas sem filtro, por bytes acumulados
```

Cada linha é um formato recorrente sem cobertura → adicione um filtro (built-in ou
regra declarativa). Fecha o ciclo: a cobertura melhora com dados, não com palpite.

## Inspeção

```bash
agf compress filters          # lista filtros ativos (built-in + custom) por prioridade
agf compress test <arquivo>   # qual filtro casaria + quanto comprimiria aquela saída
```

## Adicionar um filtro built-in (quando é universal e seguro)

1. `core/economy/tool-compress/filters/<nome>.ts` — função pura `(text)=>string` com `.filterName`, no-grow no fim.
2. Registrar em `registry.ts` (`detect` + `priority`).
3. Teste em `src/tests/` provando que a falha/erro sobrevive e `bytesAfter < bytesBefore`.
