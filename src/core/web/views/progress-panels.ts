/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_13d205534cc8 — Painéis das 3 abas (progresso/economia/grafo) + o script
 * cliente vanilla que faz a troca de abas e o polling. Extraído de progress-html.ts
 * (shell) para foco/SRP e teto de 800 linhas. As abas economia/grafo são placeholders
 * que serão preenchidos por tasks dedicadas (ex.: /api/economy). A aba progresso
 * preserva integralmente os ids e o polling existentes (sem regressão). Puras: só
 * retornam strings.
 */

/** The three tab panels. Only `progresso` is active by default; others are `hidden`. */
export function progressPanels(): string {
  return `
  <section class="panel" id="panel-progresso" role="tabpanel" aria-labelledby="tab-progresso">
    <div class="card">
      <div class="colony-gauge">
        <span id="colony-health-grade" class="colony-grade muted">—</span>
        <div>
          <div class="row"><span class="muted">Colony Health</span><span id="colony-health-caste">—</span></div>
          <div class="row"><span class="muted">Modelo</span><span id="colony-health-model">—</span></div>
          <div class="row"><span class="muted">Quarantinados</span><span id="colony-health-quarantine">0</span></div>
        </div>
      </div>
    </div>
    <div class="card" id="colony-health"><div class="muted">carregando colony health…</div></div>
    <div class="card" id="nodes"><div class="muted">carregando tasks…</div></div>
    <div class="card"><div class="row"><span>Tokens</span><span id="tokens" class="mono">0</span></div></div>
    <div class="card"><div class="muted">logs ao vivo</div><div id="logs"></div></div>
  </section>
  <section class="panel" id="panel-economia" role="tabpanel" aria-labelledby="tab-economia" hidden>
    <div class="card">
      <div class="row"><span class="muted">Economia acumulada</span><span id="economia-saved" class="mono status-done">—</span></div>
      <div class="row"><span class="muted">Taxa de economia</span><span id="economia-rate" class="mono">—</span></div>
      <div class="row"><span class="muted">Tokens in · out · cache</span><span id="economia-tokens" class="mono">—</span></div>
      <div class="row"><span class="muted">Custo</span><span id="economia-cost" class="mono">—</span></div>
    </div>
    <div class="card"><div class="muted">Levers determinísticos (economia por lever)</div><div id="economia-levers"></div></div>
  </section>`
}

/** The client-side vanilla script: tab switching (a11y) + polling the 3 progress APIs. */
export function progressScript(): string {
  return `
    function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
    function setupTabs(){
      const tabs = Array.from(document.querySelectorAll('.tab'));
      function select(name){
        for (const t of tabs){
          const on = t.getAttribute('data-tab') === name;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          const panel = document.getElementById('panel-' + t.getAttribute('data-tab'));
          if (panel) panel.hidden = !on;
        }
      }
      tabs.forEach((t, i) => {
        t.addEventListener('click', () => select(t.getAttribute('data-tab')));
        t.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
          tabs[next].focus(); select(tabs[next].getAttribute('data-tab'));
        });
      });
    }
    async function pollProgress(){
      try {
        const r = await fetch('/api/progress'); const d = await r.json();
        document.getElementById('project').textContent = d.project;
        document.getElementById('phase').textContent = d.phase;
        document.getElementById('model').textContent = d.modelLabel;
        document.getElementById('tokens').textContent =
          d.tokens.total + ' tok · $' + Number(d.tokens.costUsd).toFixed(4) + ' · ' + d.tokens.calls + ' chamada(s)';
        const nodes = document.getElementById('nodes');
        nodes.innerHTML = '<div class="row muted"><span>Tasks ativas</span><span>' + d.tasks.length + '/' + d.totalTasks + '</span></div>' +
          (d.tasks.length ? d.tasks.map(t =>
            '<div class="row"><span class="status-' + esc(t.status) + '">' + esc(t.status) + '</span><span>' + esc(t.title) + '</span></div>'
          ).join('') : '<div class="muted">(nenhuma task ativa)</div>');
      } catch(e) { log.warn(e); }
    }
    async function pollLogs(){
      try {
        const r = await fetch('/api/logs'); const d = await r.json();
        const el = document.getElementById('logs');
        el.innerHTML = (d.logs||[]).map(l => '<div class="lvl-' + esc(l.level) + '">[' + esc(l.level) + '] ' + esc(l.message) + '</div>').join('');
        el.scrollTop = el.scrollHeight;
      } catch(e) { log.warn(e); }
    }
    async function pollColonyHealth(){
      try {
        const r = await fetch('/api/colony-health'); const d = await r.json();
        const colorClass = 'health-' + esc(d.color || 'red');
        const gradeEl = document.getElementById('colony-health-grade');
        gradeEl.textContent = d.grade || '?';
        gradeEl.className = 'colony-grade ' + colorClass;
        document.getElementById('colony-health-caste').textContent = d.caste || '—';
        document.getElementById('colony-health-model').textContent = d.suggested_model || '—';
        document.getElementById('colony-health-quarantine').textContent = String(d.quarantined_count || 0);
        const card = document.getElementById('colony-health');
        card.innerHTML = '<div class="row"><span class="muted">Pendente</span><span>' + esc(d.pending) + '</span></div>' +
          '<div class="row"><span class="muted">Bloqueado</span><span>' + esc(d.blocked) + '</span></div>' +
          '<div class="row"><span class="muted">Concluído</span><span class="status-done">' + esc(d.done) + '/' + esc(d.total) + '</span></div>';
      } catch(e) { log.warn(e); }
    }
    async function pollEconomy(){
      try {
        const r = await fetch('/api/economy'); const d = await r.json();
        const t = d.totals || {};
        document.getElementById('economia-saved').textContent = Number(t.saved||0).toLocaleString() + ' tok';
        document.getElementById('economia-rate').textContent = (d.savingsRate||0) + '%';
        document.getElementById('economia-tokens').textContent = (t.tokensIn||0)+' · '+(t.tokensOut||0)+' · '+(t.cache||0);
        document.getElementById('economia-cost').textContent = '$' + Number(t.costUsd||0).toFixed(4);
        const levers = d.levers || [];
        const max = Math.max(1, ...levers.map(l => l.totalSaved||0));
        document.getElementById('economia-levers').innerHTML = levers.length
          ? levers.map(l =>
              '<div class="row"><span>' + esc(l.lever) + '</span><span class="mono">' + (l.totalSaved||0) + ' tok · ' + (l.count||0) + '×</span></div>' +
              '<div style="height:6px;background:var(--border);border-radius:4px;margin:.15rem 0 .6rem;overflow:hidden">' +
              '<span style="display:block;height:100%;width:' + Math.round(100*(l.totalSaved||0)/max) + '%;background:var(--status-done)"></span></div>'
            ).join('')
          : '<div class="muted">(sem levers com economia ainda)</div>';
      } catch(e) { log.warn(e); }
    }
    function tick(){ pollProgress(); pollLogs(); pollColonyHealth(); pollEconomy(); }
    setupTabs(); tick(); setInterval(tick, 2000);`
}
