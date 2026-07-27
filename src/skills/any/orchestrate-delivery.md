---
name: orchestrate-delivery
description: Skill mestre — orquestra a entrega end-to-end (dir vazio → PRD → grafo → autopilot → entrega) com economia brutal de token
category: any
phases: [ANALYZE, PLAN, IMPLEMENT, VALIDATE]
---

# orchestrate-delivery

A skill mestre que conduz um produto do zero à entrega, **orquestrando as demais
skills e comandos** por uma máquina de estados determinística (`nextDeliveryAction`)
— sem gastar tokens decidindo o que fazer.

## Quando usar

- Diretório vazio: "construa um kanban do zero".
- Quando você quer **um comando** que vá de PRD a software testado.

## Fluxo (determinístico)

```
estado do grafo → nextDeliveryAction →
  empty/no PRD         → agf import-prd   (agf generate-prd → agf import-prd)
  epics L/XL           → decompose    (decompose / auto-subtasks)
  tasks prontas        → implement    (autopilot --live, TDD)
  todas done           → done         (entrega completa)
  todas bloqueadas     → escalate     (intervenção humana)
```

O comando `build` executa este loop (`runDelivery`) com teto de passos
(cost-runaway) e cancelamento (Esc). `generate-prd "<descrição>"` cria o PRD.

## Economia de token (peça central)

- **λ_flow** (`λ_flow = λ_base + α·Φ(t)`) dilui o contexto do grafo por
  esquecimento determinístico.
- **Reuso determinístico**: tasks já resolvidas reaplicam edits cacheados por
  assinatura — **0 token de modelo** (não re-raciocina).
- **repo-map ranqueado** (~1k tok) + **feedback compacto** no retry.
- **exec-policy** barra comandos perigosos; **interrupt** (Esc) corta turnos.

## Disciplina (inegociável)

TDD Red→Green→Refactor · WIP=1 · pull-não-push · DoD antes de `done` ·
decomposição atômica (≤2h) · anti-one-shot · code-detachment. Veja `principles`.

## Comandos

```bash
mcp-graph-agent generate-prd "um kanban com colunas e cards" --import
mcp-graph-agent build --live --max 20        # orquestra até entregar
mcp-graph-agent principles                    # o credo de engenharia
```
