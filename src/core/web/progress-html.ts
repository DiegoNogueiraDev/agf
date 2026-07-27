/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_9fc226e84607 / §node_13d205534cc8 — Página de progresso: shell HTML/CSS/JS
 * vanilla (sem React, sem libs externas) com nav de 3 abas (progresso/economia/grafo)
 * e os design tokens do projeto ../graph-flow. Os fragmentos (CSS, painéis, script)
 * vivem em ./views/* para manter este shell focado e abaixo de 800 linhas. Pura:
 * retorna a string completa servida pelo servidor mínimo (W3).
 */
import { progressStyles } from './views/progress-styles.js'
import { progressPanels, progressScript } from './views/progress-panels.js'

/** A single tab button (a11y: role=tab, focusable, ArrowLeft/Right navigation). */
function tabButton(name: string, label: string, selected: boolean): string {
  return `<button class="tab" role="tab" id="tab-${name}" data-tab="${name}" aria-controls="panel-${name}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`
}

/**
 * Render the full progress page (vanilla JS polling). `graphSection` is the
 * server-rendered Grafo panel; when omitted, a loading note is shown.
 */
export function renderProgressHtml(graphSection = ''): string {
  const grafoPanel =
    graphSection ||
    `<section class="panel" id="panel-grafo" role="tabpanel" aria-labelledby="tab-grafo" hidden><div class="card"><div class="muted">carregando grafo…</div></div></section>`
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agent-graph-flow · progresso</title>
  <style>${progressStyles()}</style>
</head>
<body>
  <h1>agent-graph-flow · <span id="project">—</span> · fase <span id="phase">—</span> · <span id="model">—</span></h1>
  <nav class="tabs" role="tablist" aria-label="Seções do dashboard">
    ${tabButton('progresso', 'Progresso', true)}
    ${tabButton('economia', 'Economia', false)}
    ${tabButton('grafo', 'Grafo', false)}
  </nav>
  ${progressPanels()}
  ${grafoPanel}
  <script>${progressScript()}</script>
</body>
</html>`
}
