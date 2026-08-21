/* ==========================================================
   CPM Dashboard — vanilla JS, no build step, no dependencies
   ========================================================== */

let STATE = { data: null, activities: [], byId: {}, zoom: 1, sortKey: 'id', sortDir: 1 };

const PHASE_COLORS = [
  '#7FB3D5', '#76C7B7', '#8FD19E', '#C9D97F', '#E8C15A',
  '#E8975A', '#E4785C', '#D9678B', '#B47FD1', '#8C93D9',
  '#6FA8D9', '#5FBFA6', '#9BCF6B'
];

function phaseColor(wbs) {
  const i = (parseInt(wbs, 10) - 1) % PHASE_COLORS.length;
  return PHASE_COLORS[i];
}

fetch('data.json')
  .then(r => r.json())
  .then(json => {
    STATE.data = json;
    STATE.activities = json.activities;
    json.activities.forEach(a => STATE.byId[a.id] = a);
    init();
  })
  .catch(err => {
    document.getElementById('app').innerHTML =
      '<p style="padding:40px;color:#E9503F">ບໍ່ສາມາດໂຫຼດ data.json ໄດ້ / Could not load data.json — ' + err + '</p>';
  });

function init() {
  renderStats();
  renderTabs();
  renderOverview();
  renderNetwork();
  renderGantt();
  renderTable();
  wireToolbars();
  wireDrawer();
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
  const el = document.querySelector('.net-phase-label[data-wbs="' + wbs + '"]');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- network diagram (AON snake layout) ---------------- */
const NODES_PER_ROW = 10;

function renderNetwork() {
  const canvas = document.getElementById('networkCanvas');
  canvas.innerHTML = '';
  const acts = STATE.activities;

  // group runs by phase, then chunk into rows, snaking direction each row
  let rowIndex = 0;
  let currentPhase = null;
  let rowDiv = null;
  let inRow = 0;

  acts.forEach((a, i) => {
    if (a.wbs !== currentPhase) {
      currentPhase = a.wbs;
      const phaseName = STATE.data.meta.phases.find(p => p.wbs === a.wbs).name;
      const label = document.createElement('div');
      label.className = 'net-phase-label';
      label.dataset.wbs = a.wbs;
      label.textContent = 'WBS ' + a.wbs + ' · ' + phaseName;
      canvas.appendChild(label);
      rowIndex = 0;
      inRow = NODES_PER_ROW; // force new row
    }

    if (inRow >= NODES_PER_ROW) {
      rowDiv = document.createElement('div');
      rowDiv.className = 'net-row' + (rowIndex % 2 === 1 ? ' reverse' : '');
      canvas.appendChild(rowDiv);
      rowIndex++;
      inRow = 0;
    }

    const node = document.createElement('div');
    node.className = 'node' + (a.critical ? ' critical' : '');
    node.dataset.id = a.id;
    node.dataset.code = a.code;
    node.dataset.name = a.name;
    node.innerHTML =
      '<div class="n-code"><span>' + a.code + '</span><span>' + a.duration + 'd</span></div>' +
      '<div class="n-name">' + a.name + '</div>' +
      '<div class="n-metrics"><span>ES <b>' + a.ES + '</b></span><span>TF <b>' + a.TF + '</b></span><span>EF <b>' + a.EF + '</b></span></div>';
    node.addEventListener('click', () => openDrawer(a.id));
    rowDiv.appendChild(node);
    inRow++;
  });

  applyZoom();
}

function applyZoom() {
  document.getElementById('networkCanvas').style.transform = 'scale(' + STATE.zoom + ')';
  document.getElementById('zoomLabel').textContent = Math.round(STATE.zoom * 100) + '%';
}

/* ---------------- gantt ---------------- */
function renderGantt() {
  const wrap = document.getElementById('ganttWrap');
  wrap.innerHTML = '';
  const acts = STATE.activities;

  const minDate = new Date(STATE.data.meta.start_date);
  const maxDate = new Date(STATE.data.meta.end_date);
  const totalDays = Math.round((maxDate - minDate) / 86400000) + 1;
  const dayWidth = 8; // px per day
  const chartWidth = totalDays * dayWidth;

  // month header
  const header = document.createElement('div');
  header.className = 'gantt-row gantt-header';
  const headerLabel = document.createElement('div');
  headerLabel.className = 'gantt-label';
  headerLabel.textContent = 'ກິດຈະກຳ / Activity';
  header.appendChild(headerLabel);
  const headerTrack = document.createElement('div');
  headerTrack.className = 'gantt-track';
  headerTrack.style.width = chartWidth + 'px';
  headerTrack.style.height = 'auto';

  let cursor = new Date(minDate);
  while (cursor <= maxDate) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const segStart = cursor > monthStart ? cursor : monthStart;
    const segEnd = nextMonth < maxDate ? nextMonth : new Date(maxDate.getTime() + 86400000);
    const days = Math.round((segEnd - segStart) / 86400000);
    const m = document.createElement('div');
    m.className = 'gantt-month';
    m.style.width = (days * dayWidth) + 'px';
    m.textContent = segStart.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    headerTrack.appendChild(m);
    cursor = nextMonth;
  }
  header.appendChild(headerTrack);
  wrap.appendChild(header);

  acts.forEach(a => {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const label = document.createElement('div');
    label.className = 'gantt-label';
    label.innerHTML = '<span class="g-code">' + a.code + '</span><span class="g-name">' + a.name + '</span>';
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'gantt-track';
    track.style.width = chartWidth + 'px';

    const offsetDays = Math.round((new Date(a.plan_start) - minDate) / 86400000);
    const bar = document.createElement('div');
    bar.className = 'gantt-bar' + (a.critical ? ' critical' : '');
    bar.style.left = (offsetDays * dayWidth) + 'px';
    bar.style.width = Math.max(a.duration * dayWidth - 2, 4) + 'px';
    bar.style.background = a.critical ? undefined : phaseColor(a.wbs);
    bar.title = a.code + ' ' + a.name + ' (' + a.plan_start + ' → ' + a.plan_end + ')';
    bar.addEventListener('click', () => openDrawer(a.id));
    track.appendChild(bar);

    row.appendChild(track);
    wrap.appendChild(row);
  });
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
  document.getElementById('zoomOut').addEventListener('click', () => { STATE.zoom = Math.max(STATE.zoom - 0.15, 0.4); applyZoom(); });

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
