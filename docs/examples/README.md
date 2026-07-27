# Exemplo executável — todo-cli

`sample-prd.md` é um PRD pequeno e realista (uma CLI de lista de tarefas) que exercita o
pipeline inteiro: **PRD → grafo de execução → loop autônomo com guardrails**.

## Demo automática

```bash
npm run demo
```

Roda tudo num diretório **temporário** (não cria nada no seu cwd) e imprime cada etapa:
`import-prd → stats → next → autopilot --simulate → metrics`.

> O demo usa `--simulate`: o passo de implementação é tratado como verde e o **Definition
> of Done real** decide a prontidão. Não há chamada ao modelo, então `metrics` mostra 0
> tokens — o objetivo é provar o fluxo determinístico (grafo, pull/WIP=1, DoD gate).

## Passo a passo manual

```bash
npm run build
D=$(mktemp -d)

# 1) PRD → grafo persistente (fase SHAPE)
node dist/cli/index.js import-prd docs/examples/sample-prd.md --dir "$D"

# 2) Estado do grafo (epics, tasks, AC, constraints, risks)
node dist/cli/index.js stats --dir "$D"

# 3) Próxima task desbloqueada (pull, WIP=1)
node dist/cli/index.js next --dir "$D"

# 4) Loop autônomo (cada task: in_progress → DoD → done|escalate)
node dist/cli/index.js autopilot --simulate --dir "$D" --max 5

# 5) Métricas de token/custo (0 em --simulate)
node dist/cli/index.js metrics --dir "$D"

rm -rf "$D"
```

## Agente de verdade

Com o **GitHub Copilot CLI** autenticado no ambiente, troque `--simulate` por `--live`
para o agente gerar/aplicar código e rodar os testes:

```bash
node dist/cli/index.js autopilot --live --dir "$D"   # gera plano → aplica → testa
node dist/cli/index.js run "adicione um comando --version"   # one-shot ad-hoc
node dist/cli/index.js tui                                   # TUI interativa
```
