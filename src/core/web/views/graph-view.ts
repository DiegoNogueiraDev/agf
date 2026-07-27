/*!
 * graph-view — SVG graph fragment for the Grafo tab.
 * Task node_9b413ac5ddf4.
 *
 * WHY: The dashboard needs an interactive graph view with zoom/pan, colour by
 * status/type, click-to-detail, and filter controls. Pure HTML/SVG string with
 * vanilla JS — zero external deps, XSS-safe via esc().
 *
 * Composes with: graph-layout.ts (layout), graph-snapshot.ts (CT2 types).
 */

import type { GraphSnapshot } from '../graph-snapshot.js'
import { computeLayout } from './graph-layout.js'

function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

const STATUS_COLORS: Record<string, string> = {
  done: '#4ade80',
  in_progress: '#60a5fa',
  backlog: '#94a3b8',
  blocked: '#f87171',
}

const TYPE_STROKES: Record<string, string> = {
  epic: '#a78bfa',
  task: '#64748b',
  risk: '#fb923c',
  bug: '#ef4444',
}

export function renderGraphView(snapshot: GraphSnapshot): string {
  const { nodes, edges, total, truncated } = snapshot
  const layout = computeLayout(nodes, edges)
  const posMap = new Map(layout.map((n) => [n.id, n]))

  const svgEdges = edges
    .map((e) => {
      const from = posMap.get(e.from)
      const to = posMap.get(e.to)
      if (!from || !to) return ''
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#475569" stroke-width="1" opacity="0.6"/>`
    })
    .join('')

  const NODE_W = 160
  const NODE_H = 40
  const svgNodes = nodes
    .map((n) => {
      const pos = posMap.get(n.id)
      if (!pos) return ''
      const fill = STATUS_COLORS[n.status] ?? '#94a3b8'
      const stroke = TYPE_STROKES[n.type] ?? '#64748b'
      const title = n.title.length > 20 ? n.title.slice(0, 19) + '…' : n.title
      return `<g class="node" data-id="${esc(n.id)}" data-type="${esc(n.type)}" data-status="${esc(n.status)}" transform="translate(${pos.x - NODE_W / 2},${pos.y - NODE_H / 2})" style="cursor:pointer">
  <rect width="${NODE_W}" height="${NODE_H}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <text x="${NODE_W / 2}" y="${NODE_H / 2 + 5}" text-anchor="middle" font-size="12" fill="#1e293b">${esc(title)}</text>
</g>`
    })
    .join('')

  const banner = truncated ? `<div class="muted banner">mostrando ${nodes.length} de ${total} nós</div>` : ''

  const viewBox = '-400 -50 800 600'

  return `<section class="panel" id="panel-grafo" role="tabpanel" aria-labelledby="tab-grafo" hidden>
  ${banner}
  <div class="graph-controls" style="margin-bottom:8px">
    <label>Status: <select id="filter-status"><option value="">Todos</option><option>backlog</option><option>in_progress</option><option>done</option><option>blocked</option></select></label>
    <label style="margin-left:12px">Tipo: <select id="filter-type"><option value="">Todos</option><option>task</option><option>epic</option><option>risk</option><option>bug</option></select></label>
  </div>
  <svg id="graph-svg" viewBox="${viewBox}" style="width:100%;height:540px;background:#0f172a;border-radius:8px" role="img" aria-label="Graph view">
    <g id="graph-edges">${svgEdges}</g>
    <g id="graph-nodes">${svgNodes}</g>
  </svg>
  <div id="node-detail" class="card" style="display:none;margin-top:8px">
    <div class="row"><span class="muted">ID</span><span id="detail-id"></span></div>
    <div class="row"><span class="muted">Tipo</span><span id="detail-type"></span></div>
    <div class="row"><span class="muted">Status</span><span id="detail-status"></span></div>
    <div class="row"><span class="muted">Título</span><span id="detail-title"></span></div>
  </div>
  <script>
(function(){
  var svg = document.getElementById('graph-svg');
  var vb = '${viewBox}'.split(' ').map(Number);
  var pan = {x:vb[0],y:vb[1],w:vb[2],h:vb[3]};
  function applyVb(){ svg.setAttribute('viewBox', pan.x+' '+pan.y+' '+pan.w+' '+pan.h); }
  var dragging = false, last = {};
  svg.addEventListener('mousedown', function(e){ dragging=true; last={x:e.clientX,y:e.clientY}; });
  window.addEventListener('mouseup', function(){ dragging=false; });
  svg.addEventListener('mousemove', function(e){
    if(!dragging) return;
    var dx = (e.clientX-last.x)*(pan.w/svg.clientWidth);
    var dy = (e.clientY-last.y)*(pan.h/svg.clientHeight);
    pan.x -= dx; pan.y -= dy; last={x:e.clientX,y:e.clientY}; applyVb();
  });
  svg.addEventListener('wheel', function(e){
    e.preventDefault();
    var s = e.deltaY > 0 ? 1.1 : 0.9;
    pan.w *= s; pan.h *= s; applyVb();
  }, {passive:false});
  document.querySelectorAll('.node').forEach(function(n){
    n.addEventListener('click', function(){
      var id = n.dataset.id||''; var type = n.dataset.type||''; var status = n.dataset.status||'';
      var titleEl = n.querySelector('text'); var title = titleEl ? titleEl.textContent||'' : '';
      document.getElementById('detail-id').textContent = id;
      document.getElementById('detail-type').textContent = type;
      document.getElementById('detail-status').textContent = status;
      document.getElementById('detail-title').textContent = title;
      document.getElementById('node-detail').style.display = 'block';
    });
  });
  function applyFilters(){
    var st = document.getElementById('filter-status').value;
    var ty = document.getElementById('filter-type').value;
    document.querySelectorAll('.node').forEach(function(n){
      var show = (!st || n.dataset.status===st) && (!ty || n.dataset.type===ty);
      n.style.display = show ? '' : 'none';
    });
  }
  document.getElementById('filter-status').addEventListener('change', applyFilters);
  document.getElementById('filter-type').addEventListener('change', applyFilters);
})();
  </script>
</section>`
}
