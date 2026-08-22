/* ==========================================================
   CPM Dashboard — vanilla JS, no build step, no dependencies
   MS-Project style Network Diagram + detailed Gantt
   ========================================================== */

let STATE = { data: null, activities: [], byId: {}, zoom: 1, sortKey: 'id', sortDir: 1, netLayout: null };

const PHASE_COLORS = [
  '#7FB3D5', '#76C7B7', '#8FD19E', '#C9D97F', '#E8C15A',
  '#E8975A', '#E4785C', '#D9678B', '#B47FD1', '#8C93D9',
  '#6FA8D9', '#5FBFA6', '#9BCF6B'
];

function phaseColor(wbs) {
  const i = (parseInt(wbs, 10) - 1) % PHASE_COLORS.length;
  return PHASE_COLORS[i];
}

function bootstrap(json) {
  STATE.data = json;
  STATE.activities = json.activities;
  json.activities.forEach(a => STATE.byId[a.id] = a);
  init();
}

if (window.__EMBEDDED_DATA__) {
  bootstrap(window.__EMBEDDED_DATA__);
} else {
  fetch('data.json')
    .then(r => r.json())
    .then(bootstrap)
    .catch(err => {
      document.getElementById('app').innerHTML =
        '<p style="padding:40px;color:#E9503F">ບໍ່ສາມາດໂຫຼດ data.json ໄດ້ / Could not load data.json — ' + err + '</p>';
    });
}

function init() {
  renderStats();
  renderTabs();
  renderOverview();
  renderNetworkLegend();
  renderNetwork();
  renderGantt();
  renderTable();
  wireToolbars();
  wireDrawer();
}

/* ---------------- helpers ---------------- */
function fmtShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/* ---------------- header stats ---------------- */
function renderStats() {
  const m = STATE.data.meta;
  document.getElementById('statTotal').textContent = m.total_activities;
  document.getElementById('statDuration').textContent = m.project_duration;
  document.getElementById('statCritical').textContent = m.critical_count;
  document.getElementById('statPhases').textContent = m.phases.length;
}

/* ---------------- tabs ---------------- */
function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

/* ---------------- overview ---------------- */
function renderOverview() {
  const phases = STATE.data.meta.phases;
  const totalDur = STATE.data.meta.project_duration;
  const timeline = document.getElementById('phaseTimeline');
  const grid = document.getElementById('phaseGrid');
  timeline.innerHTML = '';
  grid.innerHTML = '';

  phases.forEach(p => {
    const acts = STATE.activities.filter(a => a.wbs === p.wbs);
    const start = acts.reduce((min, a) => a.plan_start < min ? a.plan_start : min, acts[0].plan_start);
    const end = acts.reduce((max, a) => a.plan_end > max ? a.plan_end : max, acts[0].plan_end);
    const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
    const widthPct = Math.max((days / totalDur) * 100, 2.2);

    const seg = document.createElement('div');
    seg.className = 'phase-seg';
    seg.style.width = widthPct + '%';
    seg.style.background = phaseColor(p.wbs);
    seg.textContent = p.wbs;
    seg.title = p.name + ' (' + days + ' days)';
    seg.addEventListener('click', () => jumpToPhase(p.wbs));
    timeline.appendChild(seg);

    const card = document.createElement('div');
    card.className = 'phase-card';
    card.style.borderLeftColor = phaseColor(p.wbs);
    card.innerHTML =
      '<div class="pc-top"><span class="pc-wbs">WBS ' + p.wbs + '</span><span class="pc-days">' + days + ' ມື້ / days</span></div>' +
      '<h3>' + p.name + '</h3>' +
      '<div class="pc-range">' + start + ' → ' + end + ' · ' + acts.length + ' activities</div>';
    card.addEventListener('click', () => jumpToPhase(p.wbs));
    grid.appendChild(card);
  });
}

function jumpToPhase(wbs) {
  document.querySelector('.tab-btn[data-tab="network"]').click();
  requestAnimationFrame(() => {
    const el = document.querySelector('.node[data-wbs="' + wbs + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  });
}

/* ---------------- network diagram: MS-Project-style AON tree layout ---------------- */
/* Node card mimics the classic "Critical Path Diagram Template":
   ES | DUR | EF   (yellow-green / green)
   ----- CODE -----  (white)
   LS | TF | LF    (cyan / teal)
   ----- name -----  (extra strip, kept for readability of real task names)      */
const NET_COL_W = 214;   // px per depth column
const NET_ROW_H = 128;   // px per sibling slot
const NET_BOX_W = 184;
const NET_BOX_H = 108;
const NET_PAD = 26;

function buildNetTree(acts) {
  const children = {};
  acts.forEach(a => { children[a.id] = []; });
  let root = null;
  acts.forEach(a => {
    if (a.pred) children[a.pred].push(a.id);
    else root = a.id;
  });
  return { children, root };
}

function computeNetLayout(acts) {
  const { children, root } = buildNetTree(acts);
  const depth = {};
  const yPos = {};
  let nextSlot = 0;

  (function calcDepth(id, d) {
    depth[id] = d;
    children[id].forEach(c => calcDepth(c, d + 1));
  })(root, 0);

  function assignY(id) {
    const kids = children[id];
    if (kids.length === 0) {
      yPos[id] = nextSlot;
      nextSlot += 1;
      return yPos[id];
    }
    const ys = kids.map(assignY);
    yPos[id] = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    return yPos[id];
  }
  assignY(root);

  const depths = Object.values(depth);
  return { children, depth, yPos, maxDepth: Math.max.apply(null, depths), maxSlot: nextSlot - 1 };
}

function renderNetworkLegend() {
  const el = document.getElementById('networkLegend');
  if (!el) return;
  let html = '<div class="legend-group"><span class="legend-title">ລູກສອນ / Arrows:</span>' +
    '<span class="legend-item"><i class="lg-line lg-cp"></i>Critical path (FS)</span>' +
    '<span class="legend-item"><i class="lg-line lg-nc"></i>Non-critical (FS)</span>' +
    '<span class="legend-item"><i class="lg-line lg-dummy"></i>Dummy link (SS · zero-lag, logical tie)</span></div>';
  html += '<div class="legend-group"><span class="legend-title">Card:</span>' +
    '<span class="legend-item"><i class="lg-swatch" style="background:#C7DA6B"></i>ES / EF</span>' +
    '<span class="legend-item"><i class="lg-swatch" style="background:#4FAE86"></i>DUR</span>' +
    '<span class="legend-item"><i class="lg-swatch" style="background:#79DAD1"></i>LS / LF</span>' +
    '<span class="legend-item"><i class="lg-swatch" style="background:#3E9C93"></i>TF</span>' +
    '<span class="legend-item"><i class="lg-swatch" style="background:#F4F8FB;border:1px solid #999"></i>Task ID</span></div>';
  el.innerHTML = html;
}

function renderNetwork() {
  const canvas = document.getElementById('networkCanvas');
  canvas.innerHTML = '';
  const acts = STATE.activities;
  const layout = computeNetLayout(acts);
  STATE.netLayout = layout;

  const width = (layout.maxDepth + 1) * NET_COL_W + NET_PAD * 2;
  const height = (layout.maxSlot + 1) * NET_ROW_H + NET_PAD * 2;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.style.position = 'relative';

  function anchor(id) {
    const d = layout.depth[id], y = layout.yPos[id];
    const left = NET_PAD + d * NET_COL_W;
    const top = NET_PAD + y * NET_ROW_H;
    return { left: left, top: top, cx: left + NET_BOX_W, cy: top + NET_BOX_H / 2, lx: left };
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'net-edges');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML =
    '<defs>' +
      '<marker id="arrowNeutral" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">' +
        '<path d="M0,0 L7,3.5 L0,7 Z" fill="#B9C7D6"/></marker>' +
      '<marker id="arrowRed" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">' +
        '<path d="M0,0 L7,3.5 L0,7 Z" fill="#E9503F"/></marker>' +
    '</defs>';

  acts.forEach(a => {
    (a.successors || []).forEach(sid => {
      const s = STATE.byId[sid];
      const p1 = anchor(a.id), p2 = anchor(sid);
      const bothCritical = a.critical && s.critical;
      const isDummy = s.rel === 'SS';
      const midX = p1.cx + Math.max((p2.lx - p1.cx) / 2, 10);
      // dummy (SS) links tie the *start* of the successor, not its own left edge from the pred's finish —
      // draw them dropping straight down/up into the successor's left edge to read as a zero-lag logical tie
      const d = 'M ' + p1.cx + ',' + p1.cy + ' L ' + midX + ',' + p1.cy +
                ' L ' + midX + ',' + p2.cy + ' L ' + (p2.lx - 2) + ',' + p2.cy;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      let cls = 'net-edge' + (bothCritical ? ' critical' : '') + (isDummy ? ' dummy' : '');
      path.setAttribute('class', cls);
      path.setAttribute('marker-end', bothCritical ? 'url(#arrowRed)' : 'url(#arrowNeutral)');
      svg.appendChild(path);
    });
  });
  canvas.appendChild(svg);

  const frag = document.createDocumentFragment();
  acts.forEach(a => {
    const p = anchor(a.id);
    const node = document.createElement('div');
    node.className = 'node' + (a.critical ? ' critical' : '');
    node.style.left = p.left + 'px';
    node.style.top = p.top + 'px';
    node.dataset.id = a.id;
    node.dataset.code = a.code;
    node.dataset.name = a.name;
    node.dataset.wbs = a.wbs;
    node.innerHTML =
      '<div class="n-row3 n-top">' +
        '<span class="n-es">' + a.ES + '</span>' +
        '<span class="n-dur">' + a.duration + '</span>' +
        '<span class="n-ef">' + a.EF + '</span>' +
      '</div>' +
      '<div class="n-id">' +
        '<span class="n-id-wbs" style="background:' + phaseColor(a.wbs) + '"></span>' +
        '<span>' + a.code + '</span>' +
        (a.critical ? '<span class="n-flag-cp">CP</span>' : '') +
      '</div>' +
      '<div class="n-row3 n-bot">' +
        '<span class="n-ls">' + a.LS + '</span>' +
        '<span class="n-tf">' + a.TF + '</span>' +
        '<span class="n-lf">' + a.LF + '</span>' +
      '</div>' +
      '<div class="n-name">' + a.name + '</div>';
    node.addEventListener('click', () => openDrawer(a.id));
    frag.appendChild(node);
  });
  canvas.appendChild(frag);

  applyZoom();
}

function applyZoom() {
  document.getElementById('networkCanvas').style.transform = 'scale(' + STATE.zoom + ')';
  document.getElementById('zoomLabel').textContent = Math.round(STATE.zoom * 100) + '%';
}

/* ---------------- gantt: MS-Project style table + timeline + link arrows ---------------- */
const G_COLS = [34, 58, 232, 40, 66, 66, 78]; // id, code, name, dur, start, finish, pred
const G_LABEL_W = G_COLS.reduce((s, w) => s + w, 0) + 6 * 6 + 20; // widths + column-gaps + padding
const G_ROW_H = 30;
const G_DAY_W = 9;

function renderGantt() {
  const wrap = document.getElementById('ganttWrap');
  wrap.innerHTML = '';
  const acts = STATE.activities;

  const minDate = new Date(STATE.data.meta.start_date);
  const maxDate = new Date(STATE.data.meta.end_date);
  const totalDays = Math.round((maxDate - minDate) / 86400000) + 1;
  const chartWidth = totalDays * G_DAY_W;

  wrap.style.setProperty('--g-label-w', G_LABEL_W + 'px');

  wrap.appendChild(buildGanttHeader(minDate, maxDate, totalDays, chartWidth));

  const body = document.createElement('div');
  body.className = 'gantt-body';

  const overlay = document.createElement('div');
  overlay.className = 'gantt-bg-overlay';
  overlay.style.width = chartWidth + 'px';
  overlay.style.height = (acts.length * G_ROW_H) + 'px';
  let cursor = new Date(minDate);
  for (let i = 0; i < totalDays; i++) {
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) {
      const stripe = document.createElement('div');
      stripe.className = 'wk-stripe';
      stripe.style.left = (i * G_DAY_W) + 'px';
      stripe.style.width = G_DAY_W + 'px';
      overlay.appendChild(stripe);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  body.appendChild(overlay);

  const rowsFrag = document.createDocumentFragment();
  acts.forEach((a, i) => rowsFrag.appendChild(buildGanttRow(a, minDate, chartWidth)));
  body.appendChild(rowsFrag);

  body.appendChild(buildGanttLinks(acts, minDate, chartWidth));

  wrap.appendChild(body);
}

function ganttLabelGrid(cells, extraClass) {
  const el = document.createElement('div');
  el.className = 'gantt-label' + (extraClass ? ' ' + extraClass : '');
  el.innerHTML = cells.map((c, i) => '<span class="gl-c gl-' + i + '">' + c + '</span>').join('');
  return el;
}

function buildGanttHeader(minDate, maxDate, totalDays, chartWidth) {
  const header = document.createElement('div');
  header.className = 'gantt-header';
  header.appendChild(ganttLabelGrid(
    ['ID', 'ລະຫັດ<br>Code', 'ກິດຈະກຳ / Task Name', 'ໄລຍະ<br>Dur', 'ເລີ່ມ<br>Start', 'ສິ້ນສຸດ<br>Finish', 'ກ່ອນໜ້າ<br>Pred'],
    'gantt-label-head'
  ));

  const trackHead = document.createElement('div');
  trackHead.className = 'gantt-track-head';
  trackHead.style.width = chartWidth + 'px';

  const monthRow = document.createElement('div');
  monthRow.className = 'gantt-months';
  let cursor = new Date(minDate);
  const rangeEndExclusive = new Date(maxDate.getTime() + 86400000);
  while (cursor < rangeEndExclusive) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const segStart = cursor > monthStart ? cursor : monthStart;
    const segEnd = nextMonth < rangeEndExclusive ? nextMonth : rangeEndExclusive;
    const days = Math.round((segEnd - segStart) / 86400000);
    const m = document.createElement('div');
    m.className = 'gantt-month';
    m.style.width = (days * G_DAY_W) + 'px';
    m.textContent = segStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    monthRow.appendChild(m);
    cursor = nextMonth;
  }

  const weekRow = document.createElement('div');
  weekRow.className = 'gantt-weeks';
  for (let d = 0; d < totalDays; d += 7) {
    const remain = Math.min(7, totalDays - d);
    const w = document.createElement('div');
    w.className = 'gantt-week';
    w.style.width = (remain * G_DAY_W) + 'px';
    const wd = new Date(minDate);
    wd.setDate(wd.getDate() + d);
    w.textContent = fmtShort(wd.toISOString().slice(0, 10));
    weekRow.appendChild(w);
  }

  trackHead.appendChild(monthRow);
  trackHead.appendChild(weekRow);
  header.appendChild(trackHead);
  return header;
}

function buildGanttRow(a, minDate, chartWidth) {
  const row = document.createElement('div');
  row.className = 'gantt-row' + (a.critical ? ' is-critical' : '');

  const predLabel = a.pred ? (STATE.byId[a.pred].code + (a.rel ? ' (' + a.rel + ')' : '')) : '—';
  const label = ganttLabelGrid([
    a.id,
    a.code,
    '<span class="gl-name-text" title="' + a.name.replace(/"/g, '&quot;') + '">' + a.name + '</span>',
    a.duration + 'd',
    fmtShort(a.plan_start),
    fmtShort(a.plan_end),
    predLabel
  ]);
  row.appendChild(label);

  const track = document.createElement('div');
  track.className = 'gantt-track';
  track.style.width = chartWidth + 'px';

  const offsetDays = Math.round((new Date(a.plan_start) - minDate) / 86400000);
  const bar = document.createElement('div');
  bar.className = 'gantt-bar' + (a.critical ? ' critical' : '');
  bar.style.left = (offsetDays * G_DAY_W) + 'px';
  bar.style.width = Math.max(a.duration * G_DAY_W - 2, 5) + 'px';
  if (!a.critical) bar.style.background = phaseColor(a.wbs);
  bar.title = a.code + ' ' + a.name + ' (' + a.plan_start + ' → ' + a.plan_end + ')';
  bar.addEventListener('click', () => openDrawer(a.id));

  const barLabel = document.createElement('span');
  barLabel.className = 'gb-label';
  barLabel.textContent = a.duration + 'd · TF' + a.TF;
  bar.appendChild(barLabel);

  track.appendChild(bar);
  row.appendChild(track);
  return row;
}

function buildGanttLinks(acts, minDate, chartWidth) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'gantt-links');
  const totalH = acts.length * G_ROW_H;
  svg.setAttribute('width', chartWidth);
  svg.setAttribute('height', totalH);
  svg.innerHTML =
    '<defs>' +
      '<marker id="gArrowCyan" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto">' +
        '<path d="M0,0 L5,2.5 L0,5 Z" fill="#4A7FA7"/></marker>' +
      '<marker id="gArrowRed" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto">' +
        '<path d="M0,0 L5,2.5 L0,5 Z" fill="#E9503F"/></marker>' +
    '</defs>';

  const idx = {};
  acts.forEach((a, i) => { idx[a.id] = i; });

  acts.forEach(a => {
    if (!a.pred) return;
    const p = STATE.byId[a.pred];
    const pi = idx[p.id], ci = idx[a.id];
    const pOffset = Math.round((new Date(p.plan_start) - minDate) / 86400000);
    const cOffset = Math.round((new Date(a.plan_start) - minDate) / 86400000);
    const rel = a.rel || 'FS';
    const x1 = (rel === 'SS' ? pOffset : (pOffset + p.duration)) * G_DAY_W;
    const y1 = pi * G_ROW_H + G_ROW_H / 2;
    const x2 = cOffset * G_DAY_W;
    const y2 = ci * G_ROW_H + G_ROW_H / 2;
    const bothCrit = p.critical && a.critical;

    let d;
    if (y1 === y2) {
      d = 'M ' + x1 + ',' + y1 + ' L ' + (x2 - 3) + ',' + y2;
    } else {
      const midX = x1 + 9;
      d = 'M ' + x1 + ',' + y1 + ' L ' + midX + ',' + y1 + ' L ' + midX + ',' + y2 + ' L ' + (x2 - 3) + ',' + y2;
    }
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'g-link' + (bothCrit ? ' critical' : '') + (rel === 'SS' ? ' dummy' : ''));
    path.setAttribute('marker-end', bothCrit ? 'url(#gArrowRed)' : 'url(#gArrowCyan)');
    svg.appendChild(path);
  });

  return svg;
}

/* ---------------- table ---------------- */
function renderTable(filter) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  let acts = STATE.activities.slice();

  if (filter) {
    const f = filter.toLowerCase();
    acts = acts.filter(a =>
      (a.code || '').toLowerCase().includes(f) ||
      (a.name || '').toLowerCase().includes(f) ||
      (a.resource || '').toLowerCase().includes(f) ||
      (a.category || '').toLowerCase().includes(f)
    );
  }

  acts.sort((a, b) => {
    const k = STATE.sortKey;
    let av = a[k], bv = b[k];
    if (k === 'critical') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
    if (typeof av === 'string') return av.localeCompare(bv) * STATE.sortDir;
    return ((av ?? 0) - (bv ?? 0)) * STATE.sortDir;
  });

  document.getElementById('tableCount').textContent = acts.length + ' / ' + STATE.activities.length + ' activities';

  const frag = document.createDocumentFragment();
  acts.forEach(a => {
    const tr = document.createElement('tr');
    if (a.critical) tr.classList.add('critical-row');
    tr.innerHTML =
      '<td>' + a.id + '</td>' +
      '<td>' + a.code + '</td>' +
      '<td class="td-name">' + a.name + '</td>' +
      '<td>' + a.duration + '</td>' +
      '<td>' + (a.pred ?? '-') + '</td>' +
      '<td>' + (a.rel ?? '-') + '</td>' +
      '<td>' + a.ES + '</td>' +
      '<td>' + a.EF + '</td>' +
      '<td>' + a.LS + '</td>' +
      '<td>' + a.LF + '</td>' +
      '<td>' + a.TF + '</td>' +
      '<td><span class="cp-badge' + (a.critical ? '' : ' off') + '">' + (a.critical ? 'CP' : '—') + '</span></td>';
    tr.addEventListener('click', () => openDrawer(a.id));
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

/* ---------------- toolbars ---------------- */
function wireToolbars() {
  document.getElementById('networkSearch').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.node').forEach(n => {
      n.classList.remove('dim', 'match');
      if (!q) return;
      const hit = n.dataset.code.toLowerCase().includes(q) || n.dataset.name.toLowerCase().includes(q);
      n.classList.add(hit ? 'match' : 'dim');
    });
  });

  document.getElementById('zoomIn').addEventListener('click', () => { STATE.zoom = Math.min(STATE.zoom + 0.15, 1.6); applyZoom(); });
  document.getElementById('zoomOut').addEventListener('click', () => { STATE.zoom = Math.max(STATE.zoom - 0.15, 0.3); applyZoom(); });

  document.getElementById('tableSearch').addEventListener('input', e => renderTable(e.target.value));

  document.querySelectorAll('#dataTable thead th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (STATE.sortKey === key) STATE.sortDir *= -1; else { STATE.sortKey = key; STATE.sortDir = 1; }
      renderTable(document.getElementById('tableSearch').value);
    });
  });
}

/* ---------------- detail drawer ---------------- */
function wireDrawer() {
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerScrim').addEventListener('click', closeDrawer);
}

function openDrawer(id) {
  const a = STATE.byId[id];
  const content = document.getElementById('drawerContent');
  const predName = a.pred ? (STATE.byId[a.pred].code + ' ' + STATE.byId[a.pred].name) : '— (ວຽກເລີ່ມຕົ້ນ / start activity)';
  const succNames = (a.successors || []).map(sid => STATE.byId[sid].code).join(', ') || '— (ວຽກສຸດທ້າຍ / end activity)';

  content.innerHTML =
    '<div class="d-code">' + a.code + ' · WBS ' + a.wbs + '</div>' +
    '<h3>' + a.name + '</h3>' +
    '<div class="d-metrics">' +
      metric('ES', a.ES) + metric('EF', a.EF) + metric('LS', a.LS) +
      metric('LF', a.LF) + metric('TF', a.TF) + metric('Dur', a.duration) +
    '</div>' +
    row('ສະຖານະ Critical Path', a.critical ? '✅ ຢູ່ໃນ Critical Path (TF=0)' : '⭕ ມີ Float ' + a.TF + ' ມື້') +
    row('ວັນເລີ່ມແຜນ / Planned start', a.plan_start) +
    row('ວັນສິ້ນສຸດແຜນ / Planned end', a.plan_end) +
    row('ວຽກກ່ອນໜ້າ / Predecessor', predName) +
    row('ຄວາມສຳພັນ / Relationship', a.rel || '-') +
    row('ວຽກຕໍ່ໄປ / Successors', succNames) +
    row('ໝວດວຽກ / Category', a.category) +
    row('ຊັບພະຍາກອນ / Resource', a.resource) +
    row('ພື້ນທີ່ / Area', a.area) +
    row('ສະຖານະງານ / Status', a.status);

  document.getElementById('detailDrawer').classList.add('open');
  document.getElementById('drawerScrim').classList.add('show');
}

function metric(key, val) {
  return '<div class="d-metric"><div class="dm-val">' + val + '</div><div class="dm-key">' + key + '</div></div>';
}
function row(k, v) {
  return '<div class="d-row"><span>' + k + '</span><span>' + (v ?? '-') + '</span></div>';
}

function closeDrawer() {
  document.getElementById('detailDrawer').classList.remove('open');
  document.getElementById('drawerScrim').classList.remove('show');
}
