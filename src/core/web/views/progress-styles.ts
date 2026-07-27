/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_13d205534cc8 — Design tokens + CSS para a página de progresso. Extraído de
 * progress-html.ts (shell) para manter cada arquivo focado e abaixo de 800 linhas.
 * Tokens espelham o tema do projeto ../graph-flow: tipografia Inter, accent #4263eb,
 * superfície dark e cores semânticas por status. Pura: só retorna o conteúdo do
 * bloco <style>.
 */

/** Returns the inner CSS for the progress page <style> block (design-token driven). */
export function progressStyles(): string {
  return `
    :root {
      --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
      --accent: #4263eb;
      --bg: #0a0e27;
      --surface: #11162e;
      --border: #2a2f4a;
      --text: #e6e6e6;
      --muted: #8b93b8;
      --status-in_progress: #ffd166;
      --status-done: #06d6a0;
      --status-blocked: #ef476f;
      --status-ready: #7fdbff;
    }
    * { box-sizing: border-box; }
    body { font-family: var(--font-sans); background: var(--bg); color: var(--text); margin: 0; padding: 1rem; }
    h1 { font-size: 14px; color: var(--accent); margin: 0 0 .75rem; font-weight: 600; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .75rem; margin-bottom: .75rem; }
    .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
    .muted { color: var(--muted); }
    .mono { font-family: var(--font-mono); }
    .status-in_progress { color: var(--status-in_progress); }
    .status-done { color: var(--status-done); }
    .status-blocked { color: var(--status-blocked); }
    .status-ready { color: var(--status-ready); }
    #logs { max-height: 40vh; overflow: auto; font-size: 11px; white-space: pre-wrap; font-family: var(--font-mono); }
    .lvl-error { color: var(--status-blocked); } .lvl-warn { color: var(--status-in_progress); } .lvl-info { color: var(--muted); }
    .colony-gauge { display: flex; align-items: center; gap: .75rem; }
    .colony-grade { font-size: 2rem; font-weight: bold; line-height: 1; }
    .health-green { color: #06d6a0; } .health-yellow { color: #ffd166; }
    .health-orange { color: #f4a261; } .health-red { color: #ef476f; }
    .tabs { display: flex; gap: .25rem; margin-bottom: .75rem; border-bottom: 1px solid var(--border); }
    .tab {
      font-family: var(--font-sans); font-size: 12px; color: var(--muted); background: transparent;
      border: none; border-bottom: 2px solid transparent; padding: .5rem .9rem; cursor: pointer;
    }
    .tab:hover { color: var(--text); }
    .tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
    .panel[hidden] { display: none; }
  `
}
