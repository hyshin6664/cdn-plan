/* CDN 리셀러 사업 기획 대시보드 v0.2
 * GitHub Pages + Google Sheets API v4 (GIS OAuth)
 * 전 탭 CRUD, 시트 = source of truth
 */

const CONFIG = {
  CLIENT_ID: '159666688822-2m6at4ig5k9bp1rmpa7ahghgjnapq4dj.apps.googleusercontent.com',
  SHEET_ID:  '1gYpArCiJRT85tJ92lvtwkLQma5l5GOEznbSNP5rtBIs',
  SCOPES:    'https://www.googleapis.com/auth/spreadsheets'
};

const VERSION = 'v1.3';
const UPDATE_HISTORY = [
  ['v1.3', '2026-05-11', '화살표 색 변경 (팝오버: 색·라벨·삭제) + 도형 위치 정렬 (1차 직판매 노드 1차 바로 아래)'],
  ['v1.2', '2026-05-11', '3개 Case 시나리오 자동 생성(Case1 SKT단독 / Case2 다중텔코 / Case3 올리브텍영업) + 한눈에 탭 숨김'],
  ['v1.1', '2026-05-10', '모든 탭에 카드+핀 둘 다 추가 가능 (빈 곳 더블클릭 → 카드/핀 미니 메뉴) · PWA 설치 버튼 + × 탭 닫기'],
  ['v1.0', '2026-05-10', '편집모드+메모모드 통합 / 화살표 클릭=삭제 / 사용자 탭 추가 가능 / 기본 캔버스 탭 숨김'],
  ['v0.9', '2026-05-10', '카드 색상 변경(팔레트 + 커스텀) · 다중 선택(드래그/Shift+클릭) + 자동 정렬(가로/세로/격자)'],
  ['v0.8', '2026-05-10', '결정/체크리스트/연락처/메모 전부 캔버스 통일. 편집 모드 + 카드 A→B 화살표 연결. 가격 시뮬레이터 잠시 숨김'],
  ['v0.7', '2026-05-10', '공급사 탭 제거, 한눈에 = 드래그 가능 도형 + 자동 라우팅 화살표 + 노드 클릭 팝업, 스타일8 컬러바카드, 상태태그(홀딩/진행예정/진행중/완료)'],
  ['v0.6', '2026-05-09', '브라우저 네이티브 alert/confirm/prompt 전면 제거 → 인페이지 토스트·모달'],
  ['v0.5', '2026-05-09', '메모 모드 토글, 새 메모 모달(예쁘게), 핀 = 압정+제목 라벨 분리'],
  ['v0.4', '2026-05-09', '한눈에 = 풀스크린 흐름도 + 메모 핀 기능. 통계는 「현황」 새 탭으로'],
  ['v0.3', '2026-05-09', '사업구조 확정(통신사4→올리브텍→솔박스), 흐름도 갱신, 모든 CRUD 낙관적 UI'],
  ['v0.2', '2026-05-09', '전문가 톤 전환, 한눈에→흐름도, 모든 탭 CRUD 추가'],
  ['v0.1', '2026-05-09', '최초 빌드 — 7개 탭, GIS OAuth, 시트 직접 연동']
];

const TABS = ['공급사','결정','체크리스트','연락처','메모','가격','설정','화살표','탭','카드'];
const STAGES_ORDER = ['통신사 계약','솔박스 역할','청약 시스템','법적·운영','영업'];

let tokenClient = null;
let accessToken = null;
let userEmail = null;
let data = {};

const $ = id => document.getElementById(id);
const fmt = n => (n == null || n === '' || isNaN(n)) ? '-' : Number(n).toLocaleString();
const nowISO = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const colLetter = n => String.fromCharCode(64 + parseInt(n));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* === 인페이지 다이얼로그 헬퍼 (네이티브 alert/confirm/prompt 절대 금지) === */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2400);
}
function myConfirm(msg, opts = {}) {
  // 기존 confirm 모달이 있으면 닫음 (스택 방지)
  document.querySelectorAll('.modal.confirm-modal').forEach(x => x.remove());
  return new Promise(res => {
    const m = document.createElement('div');
    m.className = 'modal confirm-modal';
    m.innerHTML = `<div class="modal-box" style="max-width:380px">
      <p style="margin:0 0 18px;font-size:14px;line-height:1.5">${esc(msg)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-soft" data-no>${esc(opts.cancelText || '취소')}</button>
        <button class="btn ${opts.danger ? 'btn-danger' : ''}" data-yes>${esc(opts.okText || '확인')}</button>
      </div></div>`;
    document.body.appendChild(m);
    const close = v => { m.remove(); document.removeEventListener('keydown', onKey); res(v); };
    const onKey = e => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    m.querySelector('[data-yes]').onclick = () => close(true);
    m.querySelector('[data-no]').onclick = () => close(false);
    m.onclick = e => { if (e.target === m) close(false); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => m.querySelector('[data-yes]').focus(), 30);
  });
}
function myPrompt(msg, defaultVal = '', opts = {}) {
  return new Promise(res => {
    const m = document.createElement('div');
    m.className = 'modal';
    const isMulti = !!opts.multiline;
    const ctrl = isMulti
      ? `<textarea id="_pi" rows="4">${esc(defaultVal)}</textarea>`
      : `<input type="text" id="_pi" value="${esc(defaultVal)}">`;
    m.innerHTML = `<div class="modal-box" style="max-width:420px">
      <p style="margin:0 0 10px;font-size:13px;color:#475569">${esc(msg)}</p>
      ${ctrl}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn-soft" data-no>취소</button>
        <button class="btn" data-yes>확인</button>
      </div></div>`;
    document.body.appendChild(m);
    const inp = m.querySelector('#_pi');
    setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 30);
    const close = v => { m.remove(); document.removeEventListener('keydown', onKey); res(v); };
    const onKey = e => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !isMulti) { e.preventDefault(); close(inp.value); }
    };
    m.querySelector('[data-yes]').onclick = () => close(inp.value);
    m.querySelector('[data-no]').onclick = () => close(null);
    m.onclick = e => { if (e.target === m) close(null); };
    document.addEventListener('keydown', onKey);
  });
}

/* 부팅 */
window.addEventListener('DOMContentLoaded', () => {
  $('verBtn').textContent = VERSION;
  $('verBtn').onclick = showVersionModal;
  $('title').onclick = openSheet;
  $('refreshBtn').onclick = () => loadAll(true);
  $('signinBtn').onclick = signIn;
  $('signoutBtn').onclick = signOut;

  document.querySelectorAll('.tabs button[data-tab]').forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });

  if (CONFIG.CLIENT_ID.startsWith('YOUR_') || CONFIG.SHEET_ID.startsWith('YOUR_')) {
    showOnly('setupNotice'); return;
  }
  waitForGIS().then(initAuth).catch(e => toast('GIS 로드 실패: ' + e, 'err'));
});

function waitForGIS() {
  return new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(t); res(); }
      else if (++n > 100) { clearInterval(t); rej('timeout'); }
    }, 100);
  });
}

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: tr => {
      if (tr.error) { toast('로그인 실패: ' + tr.error, 'err'); return; }
      accessToken = tr.access_token;
      fetchUserEmail().then(loadAll);
    }
  });
  showOnly('loginNotice');
}

function signIn() {
  if (!tokenClient) return;
  // 빈 prompt — 이전에 동의했으면 자동 통과, 처음만 동의 화면
  tokenClient.requestAccessToken({ prompt: '' });
}
function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null; userEmail = null;
  $('userBox').textContent = '';
  $('signinBtn').style.display = '';
  $('signoutBtn').style.display = 'none';
  showOnly('loginNotice');
}

async function fetchUserEmail() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (r.ok) { userEmail = (await r.json()).email; $('userBox').textContent = userEmail; }
  } catch (e) {}
  $('signinBtn').style.display = 'none';
  $('signoutBtn').style.display = '';
}

/* Sheets API */
async function sapi(method, urlPath, body) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}${urlPath}`;
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    if (r.status === 401) { signOut(); throw new Error('로그인 만료'); }
    if (r.status === 403) throw new Error('권한 없음 (편집 권한 필요할 수 있음)');
    const t = await r.text();
    throw new Error(`API ${r.status}: ${t.slice(0, 100)}`);
  }
  return r.json();
}

const sheetsBatchGet = ranges => {
  const q = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  return sapi('GET', `/values:batchGet?${q}`).then(j => (j.valueRanges || []).map(v => v.values || []));
};
const sheetsAppend = (range, rows) =>
  sapi('POST', `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: rows });
const sheetsUpdate = (range, rows) =>
  sapi('PUT', `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { values: rows });

async function sheetsDeleteRow(sheetName, rowIndex) {
  // sheetId 알아내야 함
  const meta = await sapi('GET', '');
  const sh = (meta.sheets || []).find(s => s.properties.title === sheetName);
  if (!sh) throw new Error('시트 못 찾음: ' + sheetName);
  return sapi('POST', ':batchUpdate', {
    requests: [{
      deleteDimension: {
        range: {
          sheetId: sh.properties.sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,  // 0-based
          endIndex: rowIndex
        }
      }
    }]
  });
}

/* 데이터 로드 */
async function loadAll() {
  if (!accessToken) { showOnly('loginNotice'); return; }
  showOnly('loader');
  try {
    const ranges = TABS.map(t => `${t}!A1:Z`);
    const all = await sheetsBatchGet(ranges);
    TABS.forEach((t, i) => { data[t] = all[i] || []; });
    renderAll();
    showTabs();
  } catch (e) {
    toast(e.message, 'err'); showOnly('loginNotice');
  }
}

function showOnly(which) {
  ['loginNotice','setupNotice','loader'].forEach(id => $(id).style.display = (which === id) ? '' : 'none');
  document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
}
function showTabs() {
  ['loginNotice','setupNotice','loader'].forEach(id => $(id).style.display = 'none');
  const activeBtn = document.querySelector('.tabs button.active[data-tab]');
  if (activeBtn) showOnlyTab(activeBtn.dataset.tab);
}
function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  showOnlyTab(name);
  if (name === 'home') requestAnimationFrame(renderDiagram);
  else if (CANVAS_TABS[name]) requestAnimationFrame(() => renderCanvasTab(name));
  else if (name === 'status') renderStatus();
  else if (name && name.startsWith('user_')) {
    const tabId = name.replace('user_', '');
    // requestAnimationFrame + setTimeout 두 번 — 캔버스 사이즈 확정 후 렌더
    requestAnimationFrame(() => {
      requestAnimationFrame(() => renderUserCanvas(tabId));
    });
  }
}
function showOnlyTab(name) {
  document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
  const t = $('tab-' + name); if (t) t.style.display = '';
}

function openSheet() {
  if (CONFIG.SHEET_ID.startsWith('YOUR_')) return;
  window.open(`https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit`, '_blank');
}
function showVersionModal() {
  $('ver-list').innerHTML = UPDATE_HISTORY.map(([v,d,m]) =>
    `<li><b>${v}</b> <span style="color:#94a3b8">${d}</span><br>${esc(m)}</li>`).join('');
  $('verModal').style.display = '';
}

/* 헬퍼 */
const rows = tab => (data[tab] || []).slice(1);
const header = tab => (data[tab] || [[]])[0] || [];

/* 렌더링 전체 */
function renderAll() {
  renderHome();
  renderUserTabs();
  // 기존 (히든) 탭들도 데이터 갱신은 유지
  renderCanvasTab('decisions');
  renderCanvasTab('checklist');
  renderCanvasTab('contacts');
  renderCanvasTab('memos');
  renderPricing();
}

/* 한눈에 = 흐름도 + 메모 핀 */
function renderHome() {
  renderDiagram();
  renderPins();
  renderStatus();
}

/* === 인터랙티브 흐름도 === */
const ARROW_RULES = [
  { fromLayer: '통신사', toLayer: '도매상', label: '도매계약', sub: '★선행', dashed: false },
  { fromLayer: '도매상', toLayer: '리셀러', label: 'A: 재재판매', dashed: false },
  { fromLayer: '도매상', toLayer: '소비자', label: 'B: 직접판매', dashed: true },
  { fromLayer: '리셀러', toLayer: '소비자', label: '소매',     dashed: false }
];

function renderDiagram() {
  const layer = $('node-layer');
  if (!layer) return;
  const nodes = rows('공급사');
  layer.innerHTML = nodes.map((r, idx) => {
    const id     = r[0] || '';
    const name   = r[1] || '';
    const lyr    = r[2] || '';
    const status = r[3] || '홀딩';
    const x = parseFloat(r[8]); const y = parseFloat(r[9]);
    const color = r[10] || '#64748b';
    if (isNaN(x) || isNaN(y)) return '';
    return `<div class="node" data-row="${idx+2}" data-id="${esc(id)}"
      style="left:${x}%;top:${y}%"
      onmousedown="startDragNode(event, ${idx+2}, this)">
      <div class="node-bar" style="background:${esc(color)}"></div>
      <div class="node-body">
        <div class="node-name">${esc(name)} <span class="status-tag tag-${esc(status)}">${esc(status)}</span></div>
        <div class="node-layer-text">${esc(lyr)}</div>
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(renderArrows);
}

function renderArrows() {
  const svg = $('arrow-svg');
  const canvas = $('canvas');
  if (!svg || !canvas) return;
  const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
  if (!cw || !ch) return;
  svg.setAttribute('width', cw);
  svg.setAttribute('height', ch);
  svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);

  const nodeEls = [...document.querySelectorAll('#node-layer .node')];
  if (!nodeEls.length) return;

  const cr = canvas.getBoundingClientRect();
  const allNodes = nodeEls.map(el => {
    const r = el.getBoundingClientRect();
    const rec = data['공급사'][el.dataset.row - 1] || [];
    return {
      id: el.dataset.id,
      layer: rec[2] || '',
      bbox: { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }
    };
  });

  const arrows = [];
  // 1) 레이어 룰 기반 (구버전 호환: 층이 통신사/도매상/리셀러/소비자 일 때만)
  ARROW_RULES.forEach(rule => {
    const fromList = allNodes.filter(n => n.layer === rule.fromLayer);
    const toList   = allNodes.filter(n => n.layer === rule.toLayer);
    const total = fromList.length * toList.length;
    let i = 0;
    fromList.forEach(f => toList.forEach(t => {
      const isLabelArrow = (i === Math.floor(total / 2));
      arrows.push({
        from: f, to: t,
        dashed: rule.dashed,
        label: isLabelArrow ? rule.label : '',
        sub:   isLabelArrow ? rule.sub : '',
        rule: true
      });
      i++;
    }));
  });
  // 2) 화살표 시트 기반 (편집 가능, home tab)
  const sheetArrows = (rows('화살표') || []);
  const nodeById = {};
  allNodes.forEach(n => nodeById[n.id] = n);
  sheetArrows.forEach((a, idx) => {
    if (a[0] !== 'home') return;
    const from = nodeById[a[1]], to = nodeById[a[2]];
    if (!from || !to) return;
    arrows.push({ from, to, label: a[3] || '', sub: '', dashed: false, sheetRow: idx + 2 });
  });

  const allBboxes = allNodes.map(n => n.bbox);

  const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/>
    </marker>
  </defs>`;
  let body = '';
  arrows.forEach(arr => {
    const fc = { x: arr.from.bbox.x + arr.from.bbox.w/2, y: arr.from.bbox.y + arr.from.bbox.h/2 };
    const tc = { x: arr.to.bbox.x + arr.to.bbox.w/2, y: arr.to.bbox.y + arr.to.bbox.h/2 };
    const fp = edgeIntersection(arr.from.bbox, tc);
    const tp = edgeIntersection(arr.to.bbox, fc);
    if (arr.sheetRow) {
      // 클릭 가능한 두꺼운 투명 hit-line
      body += `<line class="home-arrow" data-arrow-row="${arr.sheetRow}" x1="${fp.x}" y1="${fp.y}" x2="${tp.x}" y2="${tp.y}" stroke="#94a3b8" stroke-width="14" stroke-linecap="round" stroke-opacity="0" fill="none" style="cursor:pointer"/>`;
    }
    body += `<line x1="${fp.x}" y1="${fp.y}" x2="${tp.x}" y2="${tp.y}"
      stroke="#94a3b8" stroke-width="1.5" fill="none"
      ${arr.dashed ? 'stroke-dasharray="5,4"' : ''}
      marker-end="url(#arrow)" pointer-events="none"/>`;
    if (arr.label) {
      const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
      const labelW = Math.max(arr.label.length * 6 + 10, 50);
      const pos = findLabelPos(mx, my, fp, tp, allBboxes, labelW, 14);
      body += `<text class="arrow-label" x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle">${esc(arr.label)}</text>`;
      if (arr.sub) {
        const pos2 = findLabelPos(mx, my, fp, tp, allBboxes.concat([{x:pos.x-labelW/2,y:pos.y-7,w:labelW,h:14}]), labelW, 14, pos);
        body += `<text class="arrow-label warn" x="${pos2.x}" y="${pos2.y + 14}" text-anchor="middle" dominant-baseline="middle">${esc(arr.sub)}</text>`;
      }
    }
  });
  svg.innerHTML = defs + body;
  // 화살표 클릭 → 삭제 (편집 모드, sheetRow 있는 것만)
  svg.querySelectorAll('.home-arrow').forEach(line => {
    line.onclick = async (e) => {
      e.stopPropagation();
      if (!editMode) return;
      const rowNum = parseInt(line.dataset.arrowRow);
      const ok = await myConfirm('이 화살표를 삭제할까요?', { okText: '삭제', danger: true });
      if (!ok) return;
      const removed = data['화살표'].splice(rowNum - 1, 1)[0];
      renderArrows();
      try { await sheetsDeleteRow('화살표', rowNum); }
      catch (err) {
        data['화살표'].splice(rowNum - 1, 0, removed);
        renderArrows();
        toast('삭제 실패: ' + err.message, 'err');
      }
    };
  });
}

function edgeIntersection(box, externalPoint) {
  const cx = box.x + box.w/2, cy = box.y + box.h/2;
  const dx = externalPoint.x - cx, dy = externalPoint.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = box.w / 2, halfH = box.h / 2;
  const tX = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const tY = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tX, tY);
  return { x: cx + dx * t, y: cy + dy * t };
}

function findLabelPos(mx, my, fp, tp, allBboxes, lw, lh, avoidPos) {
  const dx = tp.x - fp.x, dy = tp.y - fp.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const offsets = [-14, 14, -26, 26, -40, 40, -56, 56];
  for (const off of offsets) {
    const x = mx + px * off;
    const y = my + py * off;
    const lb = { x: x - lw/2, y: y - lh/2, w: lw, h: lh };
    let bad = allBboxes.some(b => boxesOverlap(lb, b));
    if (avoidPos && Math.hypot(x - avoidPos.x, y - avoidPos.y) < 18) bad = true;
    if (!bad) return { x, y };
  }
  return { x: mx + px * 18, y: my + py * 18 };
}

function boxesOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

let nodeDrag = null;
function startDragNode(e, rowNum, el) {
  if (e.target.closest('.pin')) return;
  e.stopPropagation();
  const cr = $('canvas').getBoundingClientRect();
  nodeDrag = {
    rowNum, el, canvasRect: cr,
    startX: e.clientX, startY: e.clientY,
    startLeft: el.offsetLeft, startTop: el.offsetTop,
    moved: false
  };
  document.addEventListener('mousemove', onNodeDragMove);
  document.addEventListener('mouseup', onNodeDragEnd);
}
function onNodeDragMove(e) {
  if (!nodeDrag) return;
  const dx = e.clientX - nodeDrag.startX;
  const dy = e.clientY - nodeDrag.startY;
  if (!nodeDrag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    nodeDrag.moved = true;
    nodeDrag.el.classList.add('dragging');
  }
  if (!nodeDrag.moved) return;
  const newLeft = nodeDrag.startLeft + dx;
  const newTop = nodeDrag.startTop + dy;
  nodeDrag.el.style.left = newLeft + 'px';
  nodeDrag.el.style.top = newTop + 'px';
  renderArrows();
}
async function onNodeDragEnd() {
  if (!nodeDrag) return;
  const ds = nodeDrag;
  document.removeEventListener('mousemove', onNodeDragMove);
  document.removeEventListener('mouseup', onNodeDragEnd);
  nodeDrag = null;
  ds.el.classList.remove('dragging');
  if (!ds.moved) {
    // 편집 모드 + 클릭 = A→B 화살표 연결, 그 외 = 모달
    if (editMode) {
      const cardId = ds.el.dataset.id;
      if (linkSourceId && linkSourceId !== cardId) {
        const src = linkSourceId; linkSourceId = null;
        document.querySelectorAll('.node.link-source').forEach(n => n.classList.remove('link-source'));
        addArrow('home', src, cardId);
        return;
      } else if (linkSourceId === cardId) {
        linkSourceId = null;
        ds.el.classList.remove('link-source');
        return;
      } else {
        linkSourceId = cardId;
        ds.el.classList.add('link-source');
        toast('연결 → 다른 도형 클릭 (취소: ESC)', 'info');
        return;
      }
    }
    openNodeModal(ds.rowNum);
    return;
  }
  const cr = ds.canvasRect;
  const xPct = (ds.el.offsetLeft / cr.width * 100).toFixed(2);
  const yPct = (ds.el.offsetTop / cr.height * 100).toFixed(2);
  ds.el.style.left = xPct + '%';
  ds.el.style.top = yPct + '%';
  const rec = data['공급사'][ds.rowNum - 1];
  const oldX = rec[8], oldY = rec[9];
  rec[8] = xPct; rec[9] = yPct;
  try { await sheetsUpdate(`공급사!I${ds.rowNum}:J${ds.rowNum}`, [[xPct, yPct]]); }
  catch (e) {
    rec[8] = oldX; rec[9] = oldY;
    renderDiagram();
    toast('이동 저장 실패: ' + e.message, 'err');
  }
}

function openNodeModal(rowNum) {
  const rec = data['공급사'][rowNum - 1];
  if (!rec) return;
  $('node-modal-title').textContent = rec[1] || '노드 상세';
  $('node-color-dot').style.background = rec[10] || '#64748b';
  $('node-f-name').value    = rec[1] || '';
  $('node-f-layer').value   = rec[2] || '';
  $('node-f-status').value  = rec[3] || '홀딩';
  $('node-f-price').value   = rec[4] || '';
  $('node-f-manager').value = rec[5] || '';
  $('node-f-contact').value = rec[6] || '';
  $('node-f-info').value    = rec[7] || '';
  $('nodeModal').dataset.row = rowNum;
  $('nodeModal').style.display = '';
}
function closeNodeModal() { $('nodeModal').style.display = 'none'; }
async function saveNodeModal() {
  const row = parseInt($('nodeModal').dataset.row);
  const rec = data['공급사'][row - 1];
  const old = rec.slice(0, 11);
  rec[1] = $('node-f-name').value;
  rec[2] = $('node-f-layer').value;
  rec[3] = $('node-f-status').value;
  rec[4] = $('node-f-price').value;
  rec[5] = $('node-f-manager').value;
  rec[6] = $('node-f-contact').value;
  rec[7] = $('node-f-info').value;
  closeNodeModal();
  renderDiagram();
  try {
    await sheetsUpdate(`공급사!B${row}:H${row}`, [[rec[1], rec[2], rec[3], rec[4], rec[5], rec[6], rec[7]]]);
    toast('저장됨', 'ok');
  } catch (e) {
    for (let i = 1; i <= 7; i++) rec[i] = old[i];
    renderDiagram();
    toast('저장 실패: ' + e.message, 'err');
  }
}

async function resetLayout() {
  const ok = await myConfirm('도형 위치를 기본값으로 되돌릴까요?');
  if (!ok) return;
  const defaults = {
    'KTC': [8, 12], 'LGU': [8, 32], 'SKBB': [8, 52], 'SKT': [8, 72],
    'OLIVE': [35, 42], 'SOLBOX': [62, 32], 'CONSUMER': [85, 60]
  };
  data['공급사'].forEach(r => {
    const d = defaults[r[0]];
    if (d) { r[8] = d[0]; r[9] = d[1]; }
  });
  renderDiagram();
  try {
    const updates = data['공급사'].map((r, i) => ({ range: `공급사!I${i+2}:J${i+2}`, values: [[r[8], r[9]]] }));
    await sapi('POST', '/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: updates });
    toast('초기화됨', 'ok');
  } catch (e) { toast('저장 실패: ' + e.message, 'err'); }
}

window.addEventListener('resize', () => {
  if (typeof renderArrows === 'function') renderArrows();
});

/* 현황 탭 (구 한눈에 콘텐츠) */
function renderStatus() {
  const dec = rows('결정');
  const chk = rows('체크리스트');
  const memos = rows('메모');
  const decDone = dec.filter(r => r[4] && String(r[4]).trim()).length;
  const chkDone = chk.filter(r => String(r[4]).toUpperCase() === 'TRUE').length;

  if ($('cnt-suppliers')) $('cnt-suppliers').textContent  = fmt(rows('공급사').length);
  if ($('cnt-decisions')) $('cnt-decisions').innerHTML    = `${decDone}<span class="pct">/${dec.length}</span>`;
  if ($('cnt-checklist')) $('cnt-checklist').innerHTML    = `${chkDone}<span class="pct">/${chk.length}</span>`;
  if ($('cnt-memos'))     $('cnt-memos').textContent      = fmt(memos.length);

  if ($('stage-flow')) {
    const byStage = {};
    STAGES_ORDER.forEach(s => byStage[s] = { done: 0, total: 0 });
    chk.forEach(r => {
      const s = r[0] || '기타';
      if (!byStage[s]) byStage[s] = { done: 0, total: 0 };
      byStage[s].total++;
      if (String(r[4]).toUpperCase() === 'TRUE') byStage[s].done++;
    });
    $('stage-flow').innerHTML = Object.entries(byStage).map(([s, v]) => {
      const pct = v.total ? Math.round(v.done / v.total * 100) : 0;
      return `<div class="stage-pill">
        <div class="name">${esc(s)}</div>
        <div class="pct-num">${pct}<small>%</small></div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <div class="hint">${v.done}/${v.total}</div>
      </div>`;
    }).join('');
  }

  if ($('pending-decisions')) {
    const pending = dec.filter(r => !r[4] || !String(r[4]).trim()).slice(0, 5);
    $('pending-decisions').innerHTML = pending.length
      ? pending.map(r => `<li><span class="badge">결정</span><span>${esc(r[0]||'')} <span style="color:#94a3b8">— ${esc(r[1]||'')}</span></span></li>`).join('')
      : `<li><span style="color:#94a3b8">모두 결정됨</span></li>`;
  }

  if ($('pending-checklist')) {
    const pendingChk = chk.filter(r => String(r[4]).toUpperCase() !== 'TRUE').slice(0, 6);
    $('pending-checklist').innerHTML = pendingChk.length
      ? pendingChk.map(r => `<li><span class="badge">${esc(r[0]||'')}</span><span>${esc(r[1]||'')}</span></li>`).join('')
      : `<li><span style="color:#94a3b8">모두 완료</span></li>`;
  }

  if ($('recent-memos')) {
    const recent = memos.slice(-5).reverse();
    $('recent-memos').innerHTML = recent.length
      ? recent.map(r => `<li><span class="badge">${esc(r[0]||'').slice(5,10)}</span><span><b>${esc(r[2]||'')}</b> ${r[3] ? '— ' + esc(String(r[3]).slice(0,40)) : ''}</span></li>`).join('')
      : `<li><span style="color:#94a3b8">메모 없음</span></li>`;
  }
}

/* === 메모 핀 시스템 === */
let pinDeleteMode = false;
let memoMode = false;
let pendingPinPos = null;

function renderPins() {
  // 한눈에
  renderPinsIn($('pin-layer'), v => v === 'flow' || v === 'home');
  // 모든 사용자 탭
  getUserTabs().forEach(t => {
    const tabKey = 'user_' + t[0];
    const sec = $(`tab-${tabKey}`);
    if (!sec) return;
    let layer = sec.querySelector('.pin-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'pin-layer';
      const canvas = sec.querySelector('.canvas');
      if (canvas) canvas.appendChild(layer);
    }
    renderPinsIn(layer, v => v === tabKey);
  });
}

function renderPinsIn(layer, typeMatch) {
  if (!layer) return;
  const memos = rows('메모');
  layer.innerHTML = memos.map((r, idx) => {
    const x = parseFloat(r[5]);
    const y = parseFloat(r[6]);
    const type = r[7] || '';
    if (!typeMatch(type) || isNaN(x) || isNaN(y)) return '';
    const title = r[2] || '(무제)';
    const tag = r[4] || '';
    const bodyTip = (r[3] || '').slice(0, 200);
    return `<div class="pin" data-row="${idx+2}" style="left:${x}%;top:${y}%"
      onclick="event.stopPropagation(); openPinPopover(${idx+2}, this)"
      onmousedown="startDragPin(event, ${idx+2}, this)"
      title="${esc(bodyTip)}">
      <div class="pin-head"></div>
      <div class="pin-label">${esc(title.slice(0, 22))}${tag ? `<span class="pin-tag-mini">#${esc(tag)}</span>` : ''}</div>
    </div>`;
  }).join('');
}

// v1.0: 통합된 편집 모드 사용 — toggleMemoMode/toggleDeleteMode no-op
function toggleMemoMode() { toggleEditMode(); }
function toggleDeleteMode() { toggleEditMode(); }

function canvasDoubleClick(e) {
  if (!editMode) { toast('편집 모드를 켜주세요', 'info'); return; }
  if (e.target.closest('.pin')) return;
  if (e.target.closest('.node')) return;
  const canvas = $('canvas');
  const r = canvas.getBoundingClientRect();
  const xPct = ((e.clientX - r.left) / r.width * 100).toFixed(2);
  const yPct = ((e.clientY - r.top) / r.height * 100).toFixed(2);
  showAddMenu(e.clientX, e.clientY, 'home', xPct, yPct);
}

function openNewMemoModal() {
  $('new-memo-title').value = '';
  $('new-memo-body').value = '';
  $('new-memo-tag').value = '';
  $('newMemoModal').style.display = '';
  setTimeout(() => $('new-memo-title').focus(), 50);
}
function closeNewMemoModal() {
  $('newMemoModal').style.display = 'none';
  pendingPinPos = null;
}
async function confirmNewMemo() {
  const title = $('new-memo-title').value.trim();
  if (!title) { $('new-memo-title').focus(); return; }
  const body = $('new-memo-body').value.trim();
  const tag = $('new-memo-tag').value.trim();
  const pos = pendingPinPos;
  const pinType = pos ? (pos.type || 'home') : '';
  const row = [nowISO(), userEmail || '', title, body, tag,
    pos ? pos.x : '', pos ? pos.y : '', pinType];
  data['메모'].push(row);
  closeNewMemoModal();
  renderPins(); renderMemos(); renderStatus();
  try { await sheetsAppend('메모!A1', [row]); }
  catch (err) {
    data['메모'].pop();
    renderPins(); renderMemos(); renderStatus();
    toast('추가 실패: ' + err.message, 'err');
  }
}

// 모달에서 Enter로 확인 (textarea 외)
window.addEventListener('keydown', e => {
  if ($('newMemoModal').style.display === 'none') return;
  if (e.key === 'Escape') closeNewMemoModal();
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.shiftKey) {
    e.preventDefault();
    confirmNewMemo();
  }
});

let dragState = null;
function startDragPin(e, rowNum, el) {
  if (pinDeleteMode) return;  // 클릭 처리 위해 드래그 안 함
  e.preventDefault();
  const canvas = $('canvas');
  const r = canvas.getBoundingClientRect();
  dragState = { rowNum, el, canvasRect: r, startX: e.clientX, startY: e.clientY, moved: false };
  el.classList.add('dragging');
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}
function onDragMove(e) {
  if (!dragState) return;
  const dx = Math.abs(e.clientX - dragState.startX);
  const dy = Math.abs(e.clientY - dragState.startY);
  if (dx < 4 && dy < 4) return;
  dragState.moved = true;
  const r = dragState.canvasRect;
  const xPct = ((e.clientX - r.left) / r.width * 100);
  const yPct = ((e.clientY - r.top) / r.height * 100);
  dragState.el.style.left = xPct + '%';
  dragState.el.style.top = yPct + '%';
  dragState.lastX = xPct.toFixed(2);
  dragState.lastY = yPct.toFixed(2);
}
async function onDragEnd(e) {
  if (!dragState) return;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  dragState.el.classList.remove('dragging');
  if (dragState.moved && dragState.lastX != null) {
    const row = dragState.rowNum;
    const rec = data['메모'][row - 1];
    const oldX = rec[5], oldY = rec[6];
    rec[5] = dragState.lastX;
    rec[6] = dragState.lastY;
    try { await sheetsUpdate(`메모!F${row}:G${row}`, [[dragState.lastX, dragState.lastY]]); }
    catch (err) {
      rec[5] = oldX; rec[6] = oldY;
      renderPins();
      toast('이동 저장 실패: ' + err.message, 'err');
    }
    // 드래그 후 클릭 이벤트 차단
    dragState.el.addEventListener('click', ev => ev.stopPropagation(), { once: true, capture: true });
  }
  dragState = null;
}

let popoverState = null;
function openPinPopover(rowNum, el) {
  if (pinDeleteMode) {
    delRow('메모', rowNum, el);
    return;
  }
  const rec = data['메모'][rowNum - 1];
  popoverState = { rowNum, el };
  const r = el.getBoundingClientRect();
  const pop = $('pinPopover');
  pop.style.display = '';
  pop.style.left = Math.min(r.left, window.innerWidth - 340) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  $('pin-pop-title-view').textContent = rec[2] || '(무제)';
  $('pin-pop-body-view').textContent = rec[3] || '(내용 없음)';
  $('pin-pop-meta').textContent = `${rec[0] || ''} · ${rec[1] || ''}${rec[4] ? ' · #'+rec[4] : ''}`;
}

function editPinFromPopover() {
  if (!popoverState) return;
  const rowNum = popoverState.rowNum;
  const rec = data['메모'][rowNum - 1];
  closePinPopover();
  $('edit-memo-title').value = rec[2] || '';
  $('edit-memo-body').value  = rec[3] || '';
  $('edit-memo-tag').value   = rec[4] || '';
  $('editMemoModal').dataset.row = rowNum;
  $('editMemoModal').style.display = '';
  setTimeout(() => $('edit-memo-title').focus(), 50);
}
function closeEditMemoModal() {
  $('editMemoModal').style.display = 'none';
}
async function confirmEditMemo() {
  const rowNum = parseInt($('editMemoModal').dataset.row);
  const rec = data['메모'][rowNum - 1];
  if (!rec) return;
  const newTitle = $('edit-memo-title').value.trim();
  const newBody  = $('edit-memo-body').value;
  const newTag   = $('edit-memo-tag').value.trim();
  if (!newTitle && !newBody) { toast('제목 또는 내용을 입력하세요', 'err'); return; }
  const old = [rec[2], rec[3], rec[4]];
  rec[2] = newTitle; rec[3] = newBody; rec[4] = newTag;
  closeEditMemoModal();
  renderPins(); renderMemos(); renderHome();
  try {
    await sheetsUpdate(`메모!C${rowNum}:E${rowNum}`, [[newTitle, newBody, newTag]]);
    toast('저장됨', 'ok');
  } catch (e) {
    rec[2] = old[0]; rec[3] = old[1]; rec[4] = old[2];
    renderPins(); renderMemos(); renderHome();
    toast('저장 실패: ' + e.message, 'err');
  }
}
function closePinPopover() {
  $('pinPopover').style.display = 'none';
  popoverState = null;
}
async function savePinFromPopover() { /* deprecated v0.8 — use editPinFromPopover */
  if (false) {  // disabled
    if (!popoverState) return;
    const rowNum = popoverState.rowNum;
    const rec = data['메모'][rowNum - 1];
    const newTitle = '';
    const newBody = '';
    const old = [rec[2], rec[3]];
    rec[2] = newTitle; rec[3] = newBody;
    renderPins(); renderMemos(); renderStatus();
    closePinPopover();
    try { await sheetsUpdate(`메모!C${rowNum}:D${rowNum}`, [[newTitle, newBody]]); }
    catch (e) {
      rec[2] = old[0]; rec[3] = old[1];
      renderPins(); renderMemos(); renderStatus();
      toast('저장 실패: ' + e.message, 'err');
    }
  }
}
async function deletePinFromPopover() {
  if (!popoverState) return;
  const rowNum = popoverState.rowNum;
  closePinPopover();
  const ok = await myConfirm('이 메모를 삭제할까요?', { okText: '삭제', danger: true });
  if (!ok) return;
  const removed = data['메모'].splice(rowNum - 1, 1)[0];
  renderPins(); renderMemos(); renderStatus();
  try { await sheetsDeleteRow('메모', rowNum); }
  catch (e) {
    data['메모'].splice(rowNum - 1, 0, removed);
    renderPins(); renderMemos(); renderStatus();
    toast('삭제 실패: ' + e.message, 'err');
  }
}

// 캔버스 빈 곳 클릭하면 팝오버 닫기
window.addEventListener('mousedown', e => {
  if (!popoverState) return;
  if (e.target.closest('#pinPopover') || e.target.closest('.pin')) return;
  closePinPopover();
});

/* 공급사 탭 제거됨 (v0.7) — 흐름도가 대신함 */
function renderSuppliers() { /* no-op */ }

/* 결정 — v0.8 캔버스로 위임 */
function renderDecisions() { renderCanvasTab('decisions'); }
/* 연락처 — v0.8 캔버스로 위임 */
function renderContacts() { renderCanvasTab('contacts'); }

/* 범용 편집 가능한 테이블 */
function renderEditableTable(tabName, tableId, opts = {}) {
  const tbl = $(tableId);
  const h = header(tabName);
  const rs = rows(tabName);

  tbl.querySelector('thead').innerHTML = `<tr>${h.map(c => `<th>${esc(c)}</th>`).join('')}<th style="width:32px"></th></tr>`;

  const tbody = tbl.querySelector('tbody');
  tbody.innerHTML = rs.map((r, idx) => {
    const rowNum = idx + 2;
    const cells = h.map((_, c) => {
      const v = r[c] || '';
      let display = esc(v);
      if (opts.linkCols?.includes(c) && v && /^https?:\/\//.test(v)) {
        display = `<a href="${esc(v)}" target="_blank">${esc(v.replace(/^https?:\/\//,'').slice(0,30))}</a>`;
        return `<td><div contenteditable="true" data-col="${c+1}" data-raw="1">${esc(v)}</div></td>`;
      }
      if (opts.statusCol === c && v) {
        const cls = /보류|hold|skip/i.test(v) ? 'mute' : /★|후보|확정|완료|done/i.test(v) ? 'ok' : 'info';
        return `<td contenteditable="true" data-col="${c+1}"><span class="chip ${cls}">${esc(v)}</span></td>`;
      }
      return `<td contenteditable="true" data-col="${c+1}">${esc(v)}</td>`;
    }).join('');
    return `<tr data-row="${rowNum}">${cells}<td><button class="row-del" onclick="delRow('${tabName}', ${rowNum}, this)" title="삭제">🗑</button></td></tr>`;
  }).join('') || `<tr><td colspan="${h.length+1}" class="empty">데이터 없음</td></tr>`;

  // 셀 편집 저장
  tbody.querySelectorAll('[contenteditable="true"]').forEach(td => {
    td.addEventListener('focus', () => { td.dataset._old = td.textContent; });
    td.addEventListener('blur', async () => {
      const newVal = td.textContent;
      if (newVal === td.dataset._old) return;
      const tr = td.closest('tr');
      const row = tr.dataset.row;
      const col = td.dataset.col;
      try {
        await sheetsUpdate(`${tabName}!${colLetter(col)}${row}`, [[newVal]]);
        // 로컬 캐시 갱신
        if (data[tabName][row-1]) data[tabName][row-1][col-1] = newVal;
        if (tabName === '결정' || tabName === '공급사') renderHome();
      } catch (e) { toast(e.message, 'err'); td.textContent = td.dataset._old; }
    });
  });
}

/* 탭별 다시그리기 */
function rerender(tabName) {
  if (tabName === '공급사') renderDiagram();
  else if (tabName === '결정') renderDecisions();
  else if (tabName === '연락처') renderContacts();
  else if (tabName === '체크리스트') renderChecklist();
  else if (tabName === '메모') { renderMemos(); renderPins(); }
  else if (tabName === '가격') renderPricing();
  renderHome();
}

/* 행 추가 — 낙관적 UI */
async function addRow(tabName) {
  const h = header(tabName);
  const empty = new Array(h.length).fill('');
  data[tabName].push(empty);
  rerender(tabName);
  try {
    await sheetsAppend(`${tabName}!A1`, [empty]);
  } catch (e) {
    data[tabName].pop();
    rerender(tabName);
    toast('추가 실패: ' + e.message, 'err');
  }
}

/* 행 삭제 — 낙관적 UI */
async function delRow(tabName, rowNum, btn) {
  const ok = await myConfirm('이 행을 삭제하시겠습니까?', { okText: '삭제', danger: true });
  if (!ok) return;
  const removed = data[tabName].splice(rowNum - 1, 1)[0];
  rerender(tabName);
  try {
    await sheetsDeleteRow(tabName, rowNum);
  } catch (e) {
    data[tabName].splice(rowNum - 1, 0, removed);
    rerender(tabName);
    toast('삭제 실패: ' + e.message, 'err');
  }
}

/* 체크리스트 */
function renderChecklist() { renderCanvasTab('checklist'); }
function _renderChecklistOld() {
  const wrap = $('checklist-stages');
  if (!wrap) return;
  const all = rows('체크리스트');
  const stages = {};
  all.forEach((r, i) => {
    const s = r[0] || '기타';
    (stages[s] = stages[s] || []).push({ row: i+2, data: r });
  });

  if (!Object.keys(stages).length) {
    wrap.innerHTML = '<div class="empty">체크리스트 항목 없음. 「항목 추가」로 시작하세요.</div>';
    return;
  }

  wrap.innerHTML = Object.entries(stages).map(([stage, items]) => {
    const done = items.filter(it => String(it.data[4]).toUpperCase() === 'TRUE').length;
    const pct = Math.round(done / items.length * 100);
    return `<div class="stage-block">
      <div class="stage-title">
        <span>${esc(stage)}</span>
        <span class="pct-text">${done}/${items.length} · ${pct}%</span>
      </div>
      <div class="progress" style="margin-bottom:8px"><div style="width:${pct}%"></div></div>
      ${items.map(it => {
        const checked = String(it.data[4]).toUpperCase() === 'TRUE';
        return `<div class="check-item ${checked?'done':''}" data-row="${it.row}">
          <input type="checkbox" ${checked?'checked':''} onchange="toggleCheck(${it.row}, this.checked)">
          <span class="item-text" contenteditable="true" data-row="${it.row}" data-col="2">${esc(it.data[1]||'')}</span>
          <span class="item-meta" contenteditable="true" data-row="${it.row}" data-col="6">${esc(it.data[5]||'')}</span>
          <button class="row-del" onclick="delRow('체크리스트', ${it.row}, this)" title="삭제">🗑</button>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  $('checklist-stages').querySelectorAll('[contenteditable="true"]').forEach(el => {
    el.addEventListener('focus', () => el.dataset._old = el.textContent);
    el.addEventListener('blur', async () => {
      if (el.textContent === el.dataset._old) return;
      try {
        await sheetsUpdate(`체크리스트!${colLetter(el.dataset.col)}${el.dataset.row}`, [[el.textContent]]);
        const rec = data['체크리스트'][el.dataset.row - 1];
        if (rec) rec[parseInt(el.dataset.col) - 1] = el.textContent;
      } catch (e) { toast(e.message, 'err'); el.textContent = el.dataset._old; }
    });
  });
}

/* 체크 토글 — 낙관적 UI */
async function toggleCheck(row, checked) {
  const rec = data['체크리스트'][row-1];
  const oldVal = rec ? rec[4] : '';
  if (rec) rec[4] = checked ? 'TRUE' : 'FALSE';
  renderHome(); renderChecklist();
  try {
    await sheetsUpdate(`체크리스트!E${row}`, [[checked ? 'TRUE' : 'FALSE']]);
  } catch (e) {
    if (rec) rec[4] = oldVal;
    renderHome(); renderChecklist();
    toast('저장 실패: ' + e.message, 'err');
  }
}

/* 체크리스트 항목 추가 — 낙관적 UI */
async function addChecklistItem() {
  const stage = await myPrompt('단계? (통신사 계약 / 솔박스 역할 / 청약 시스템 / 법적·운영 / 영업)', '통신사 계약');
  if (stage == null) return;
  const item = await myPrompt('항목 내용?', '');
  if (item == null) return;
  const row = [stage, item, '', '', 'FALSE', ''];
  data['체크리스트'].push(row);
  renderChecklist(); renderHome();
  try {
    await sheetsAppend('체크리스트!A1', [row]);
  } catch (e) {
    data['체크리스트'].pop();
    renderChecklist(); renderHome();
    toast('추가 실패: ' + e.message, 'err');
  }
}

/* 연락처 추가는 범용 addRow 사용 */

/* 메모 — v0.8 캔버스로 위임 */
function renderMemos() { renderCanvasTab('memos'); }
function _renderMemosOld() {
  const list = $('memos-list');
  if (!list) return;
  const memos = rows('메모').map((r,i) => ({row: i+2, data: r})).reverse();
  list.innerHTML = memos.length ? memos.map(m => {
    const r = m.data;
    return `<div class="memo-card" data-row="${m.row}">
      <div class="meta">
        <span>${esc(r[0]||'')} · ${esc(r[1]||'')}</span>
        <div class="actions">
          <button onclick="editMemo(${m.row})">수정</button>
          <button class="del" onclick="delRow('메모', ${m.row}, this)">삭제</button>
        </div>
      </div>
      <div class="ttl">${esc(r[2]||'')}</div>
      <div class="body">${esc(r[3]||'')}</div>
      ${r[4] ? `<span class="tag">#${esc(r[4])}</span>` : ''}
    </div>`;
  }).join('') : '<div class="empty">메모 없음</div>';
}

async function addMemo() {
  const t = $('memo-title').value.trim();
  const b = $('memo-body').value.trim();
  const tag = $('memo-tag').value.trim();
  if (!t && !b) { toast('제목 또는 내용을 입력하세요', 'err'); return; }
  const row = [nowISO(), userEmail || '', t, b, tag];
  data['메모'].push(row);
  $('memo-title').value = $('memo-body').value = $('memo-tag').value = '';
  renderMemos(); renderHome();
  try { await sheetsAppend('메모!A1', [row]); }
  catch (e) { toast(e.message, 'err'); }
}

async function editMemo(row) {
  const rec = data['메모'][row - 1];
  const newTitle = await myPrompt('제목', rec[2] || '');
  if (newTitle == null) return;
  const newBody = await myPrompt('내용', rec[3] || '', { multiline: true });
  if (newBody == null) return;
  const newTag = await myPrompt('태그 (선택)', rec[4] || '');
  if (newTag == null) return;
  const old = [rec[2], rec[3], rec[4]];
  rec[2] = newTitle; rec[3] = newBody; rec[4] = newTag;
  renderMemos(); renderHome();
  try {
    await sheetsUpdate(`메모!C${row}:E${row}`, [[newTitle, newBody, newTag]]);
  } catch (e) {
    rec[2] = old[0]; rec[3] = old[1]; rec[4] = old[2];
    renderMemos(); renderHome();
    toast('수정 실패: ' + e.message, 'err');
  }
}

/* 가격 시뮬레이터 */
function renderPricing() {
  const r = rows('가격');
  const wrap = $('pricing-fields');
  wrap.innerHTML = r.map((row, idx) => {
    const rowNum = idx + 2;
    return `<div class="field" data-row="${rowNum}">
      <label>${esc(row[0]||'')} ${row[2] ? `<span style="color:#94a3b8">(${esc(row[2])})</span>` : ''}</label>
      <div style="display:flex;gap:4px;align-items:center">
        <input type="number" step="any" data-row="${rowNum}" data-key="${esc(row[0]||'')}" value="${esc(row[1]||'')}" oninput="computePricing()">
        <button class="row-del" onclick="delRow('가격', ${rowNum}, this)" title="삭제">🗑</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty">항목 없음</div>';
  computePricing();
}

function getPriceVal(key) {
  const inp = document.querySelector(`#pricing-fields input[data-key="${CSS.escape(key)}"]`);
  return inp ? parseFloat(inp.value) || 0 : 0;
}

function computePricing() {
  const w = getPriceVal('도매단가');
  const fx = getPriceVal('환율');
  const m = getPriceVal('마진율');
  const fixed = getPriceVal('고정비/월');
  const cust = getPriceVal('예상 고객수');
  const traf = getPriceVal('고객당 평균 트래픽');

  const wholesaleKRW = w * fx;
  const retail = wholesaleKRW * (1 + m/100);
  const totalGB = cust * traf;
  const revenue = retail * totalGB;
  const cogs = wholesaleKRW * totalGB;
  const profit = revenue - cogs - fixed;
  const marginPerGB = retail - wholesaleKRW;
  const bep = marginPerGB > 0 && traf > 0 ? Math.ceil(fixed / (marginPerGB * traf)) : 0;

  $('r-retail').textContent = fmt(Math.round(retail));
  $('r-total-gb').textContent = fmt(totalGB);
  $('r-revenue').textContent = fmt(Math.round(revenue));
  $('r-cogs').textContent = fmt(Math.round(cogs));
  $('r-profit').textContent = fmt(Math.round(profit));
  $('r-bep').textContent = bep ? fmt(bep) + '명' : '-';
}

async function savePricing() {
  const inputs = [...document.querySelectorAll('#pricing-fields input')];
  const updates = inputs.map(inp => {
    const row = parseInt(inp.dataset.row);
    const rec = data['가격'][row - 1];
    return { range: `가격!B${row}`, values: [[parseFloat(inp.value) || 0]] };
  });
  try {
    await sapi('POST', '/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: updates });
    inputs.forEach(inp => {
      const row = parseInt(inp.dataset.row);
      if (data['가격'][row-1]) data['가격'][row-1][1] = parseFloat(inp.value) || 0;
    });
    toast('저장됨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function addPriceRow() {
  const name = await myPrompt('항목 이름?', '');
  if (!name) return;
  const valStr = await myPrompt('값?', '0');
  if (valStr == null) return;
  const val = parseFloat(valStr) || 0;
  const unit = (await myPrompt('단위 (선택)', '')) || '';
  const row = [name, val, unit, ''];
  data['가격'].push(row);
  renderPricing();
  try {
    await sheetsAppend('가격!A1', [row]);
  } catch (e) {
    data['가격'].pop();
    renderPricing();
    toast('추가 실패: ' + e.message, 'err');
  }
}

/* ===========================================================
   통합 캔버스 엔진 (v0.8)
   결정 / 체크리스트 / 연락처 / 메모 전부 카드 캔버스
=========================================================== */
const CARD_COLORS = ['#94a3b8','#2563eb','#0ea5e9','#16a34a','#f59e0b','#ef4444','#a855f7','#ec4899','#14b8a6','#6366f1'];

const CANVAS_TABS = {
  decisions: {
    sheet: '결정',
    titleCol: 0, bodyCol: 1, statusCol: 4,
    idCol: 8, xCol: 9, yCol: 10, colorCol: 11,
    statusFn: v => v && String(v).trim() ? '결정됨' : '미결',
    colorFn: r => r[11] || ((r[4] && String(r[4]).trim()) ? '#16a34a' : '#94a3b8'),
    fields: [
      {label: '항목', col: 0},
      {label: '옵션 후보', col: 1, multi: true},
      {label: '찬성 의견', col: 2, multi: true},
      {label: '반대 의견', col: 3, multi: true},
      {label: '현재 결정', col: 4},
      {label: '결정자', col: 5},
      {label: '결정일', col: 6},
      {label: '메모', col: 7, multi: true}
    ],
    idPrefix: 'DEC'
  },
  checklist: {
    sheet: '체크리스트',
    titleCol: 1, bodyCol: 0, statusCol: 4,
    idCol: 6, xCol: 7, yCol: 8, colorCol: 9,
    statusFn: v => String(v).toUpperCase() === 'TRUE' ? '완료' : '진행중',
    colorFn: r => r[9] || (String(r[4]).toUpperCase() === 'TRUE' ? '#16a34a' : '#3b82f6'),
    fields: [
      {label: '단계', col: 0},
      {label: '항목', col: 1},
      {label: '담당', col: 2},
      {label: '마감', col: 3},
      {label: '완료', col: 4, type: 'checkbox'},
      {label: '메모', col: 5, multi: true}
    ],
    idPrefix: 'CHK'
  },
  contacts: {
    sheet: '연락처',
    titleCol: 0, bodyCol: 1, statusCol: 2,
    idCol: 9, xCol: 10, yCol: 11, colorCol: 12,
    statusFn: v => v || '-',
    colorFn: r => r[12] || '#2563eb',
    fields: [
      {label: '이름', col: 0}, {label: '회사', col: 1}, {label: '구분', col: 2},
      {label: '직책', col: 3}, {label: '이메일', col: 4}, {label: '전화', col: 5},
      {label: '메신저', col: 6}, {label: '마지막 연락', col: 7},
      {label: '메모', col: 8, multi: true}
    ],
    idPrefix: 'CON'
  },
  memos: {
    sheet: '메모',
    titleCol: 2, bodyCol: 3, statusCol: 4,
    idCol: 8, xCol: 5, yCol: 6, colorCol: 9,
    statusFn: v => v ? '#'+v : '',
    colorFn: r => r[9] || '#0ea5e9',
    fields: [
      {label: '제목', col: 2}, {label: '내용', col: 3, multi: true},
      {label: '태그', col: 4}
    ],
    idPrefix: 'MEM'
  }
};

let editMode = false;
let linkSourceId = null;

function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle('edit-mode', editMode);
  const btn = $('editModeBtn');
  if (btn) {
    btn.textContent = editMode ? '편집 OFF' : '편집 모드';
    btn.classList.toggle('btn', editMode);
    btn.classList.toggle('btn-soft', !editMode);
  }
  if (!editMode) {
    linkSourceId = null;
    document.querySelectorAll('.node.link-source').forEach(n => n.classList.remove('link-source'));
  }
  toast(editMode ? '편집 모드 ON' : '편집 모드 OFF', 'info');
}

function renderCanvasTab(tabKey) {
  const cfg = CANVAS_TABS[tabKey];
  if (!cfg) return;
  const container = $(`canvas-${tabKey}`);
  if (!container) return;
  const layer = container.querySelector('.node-layer');
  if (!layer) return;
  const all = rows(cfg.sheet);
  layer.innerHTML = all.map((r, idx) => {
    const id = r[cfg.idCol] || (cfg.idPrefix + (idx+1).toString().padStart(3, '0'));
    let x = parseFloat(r[cfg.xCol]); let y = parseFloat(r[cfg.yCol]);
    if (isNaN(x) || isNaN(y)) {
      x = 5 + (idx % 5) * 18;
      y = 5 + Math.floor(idx / 5) * 22;
    }
    const title = r[cfg.titleCol] || '(무제)';
    const body = r[cfg.bodyCol] || '';
    const status = cfg.statusFn(r[cfg.statusCol]);
    const color = cfg.colorFn(r);
    const statusCls = tabKey === 'checklist' ? (status === '완료' ? 'tag-완료' : 'tag-진행중') : '';
    return `<div class="node card-node" data-tab="${tabKey}" data-row="${idx+2}" data-id="${esc(id)}"
      style="left:${x}%;top:${y}%"
      onmousedown="startCardDrag(event, '${tabKey}', ${idx+2}, this)"
      ondblclick="event.stopPropagation(); cardDoubleClick('${tabKey}', ${idx+2})">
      <div class="node-bar" style="background:${color}"></div>
      <div class="node-body">
        <div class="node-name">${esc(String(title).slice(0,40))}${status ? ` <span class="status-tag ${statusCls}">${esc(status)}</span>` : ''}</div>
        ${body ? `<div class="node-layer-text">${esc(String(body).slice(0,60))}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(() => renderTabArrows(tabKey));
}

function renderTabArrows(tabKey) {
  const container = $(`canvas-${tabKey}`);
  if (!container) return;
  const svg = container.querySelector('.arrow-svg');
  if (!svg) return;
  const cw = container.offsetWidth, ch = container.offsetHeight;
  if (!cw || !ch) return;
  svg.setAttribute('width', cw);
  svg.setAttribute('height', ch);
  svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  const cr = container.getBoundingClientRect();
  const nodeMap = {};
  container.querySelectorAll('.node').forEach(el => {
    const r = el.getBoundingClientRect();
    nodeMap[el.dataset.id] = { el, bbox: { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height } };
  });
  const arrows = (rows('화살표') || []).filter(a => a[0] === tabKey);
  let body = `<defs><marker id="arrow-${tabKey}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>`;
  arrows.forEach(a => {
    const from = nodeMap[a[1]], to = nodeMap[a[2]];
    if (!from || !to) return;
    const fc = { x: from.bbox.x + from.bbox.w/2, y: from.bbox.y + from.bbox.h/2 };
    const tc = { x: to.bbox.x + to.bbox.w/2, y: to.bbox.y + to.bbox.h/2 };
    const fp = edgeIntersection(from.bbox, tc);
    const tp = edgeIntersection(to.bbox, fc);
    body += `<line x1="${fp.x}" y1="${fp.y}" x2="${tp.x}" y2="${tp.y}" stroke="#94a3b8" stroke-width="1.5" fill="none" marker-end="url(#arrow-${tabKey})"/>`;
    if (a[3]) {
      const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
      body += `<text class="arrow-label" x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle">${esc(a[3])}</text>`;
    }
  });
  svg.innerHTML = body;
}

let cardDrag = null;
function startCardDrag(e, tabKey, rowNum, el) {
  if (e.button !== 0) return;
  if (!editMode) {
    // 편집 모드 OFF → 단순 클릭만 (mouseup에서 클릭 처리)
    e.stopPropagation();
    const downX = e.clientX, downY = e.clientY;
    const handler = (ev) => {
      document.removeEventListener('mouseup', handler);
      const dx = Math.abs(ev.clientX - downX), dy = Math.abs(ev.clientY - downY);
      if (dx < 5 && dy < 5) openCardModal(tabKey, rowNum);
    };
    document.addEventListener('mouseup', handler, { once: true });
    return;
  }
  // 편집 모드 + Shift = 다중 선택 토글
  if (e.shiftKey) {
    e.stopPropagation();
    toggleCardSelection(tabKey, rowNum, el);
    return;
  }
  e.stopPropagation();
  const cfg = CANVAS_TABS[tabKey];
  const container = $(`canvas-${tabKey}`);
  const cr = container.getBoundingClientRect();
  cardDrag = { tabKey, cfg, rowNum, el, container, canvasRect: cr, startX: e.clientX, startY: e.clientY, startLeft: el.offsetLeft, startTop: el.offsetTop, moved: false };
  document.addEventListener('mousemove', onCardDragMove);
  document.addEventListener('mouseup', onCardDragEnd);
}
function onCardDragMove(e) {
  if (!cardDrag) return;
  const dx = e.clientX - cardDrag.startX, dy = e.clientY - cardDrag.startY;
  if (!cardDrag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    cardDrag.moved = true;
    cardDrag.el.classList.add('dragging');
  }
  if (!cardDrag.moved) return;
  cardDrag.el.style.left = (cardDrag.startLeft + dx) + 'px';
  cardDrag.el.style.top = (cardDrag.startTop + dy) + 'px';
  renderTabArrows(cardDrag.tabKey);
}
async function onCardDragEnd(e) {
  if (!cardDrag) return;
  const ds = cardDrag;
  document.removeEventListener('mousemove', onCardDragMove);
  document.removeEventListener('mouseup', onCardDragEnd);
  cardDrag = null;
  ds.el.classList.remove('dragging');
  if (!ds.moved) {
    // Click in edit mode = link source/target
    const cardId = ds.el.dataset.id;
    if (linkSourceId && linkSourceId !== cardId) {
      const src = linkSourceId; linkSourceId = null;
      document.querySelectorAll('.node.link-source').forEach(n => n.classList.remove('link-source'));
      await addArrow(ds.tabKey, src, cardId);
    } else if (linkSourceId === cardId) {
      linkSourceId = null;
      ds.el.classList.remove('link-source');
    } else {
      linkSourceId = cardId;
      ds.el.classList.add('link-source');
      toast('연결 → 다른 카드 클릭 (취소: ESC)', 'info');
    }
    return;
  }
  const cfg = ds.cfg;
  const cr = ds.canvasRect;
  const xPct = (ds.el.offsetLeft / cr.width * 100).toFixed(2);
  const yPct = (ds.el.offsetTop / cr.height * 100).toFixed(2);
  ds.el.style.left = xPct + '%';
  ds.el.style.top = yPct + '%';
  const rec = data[cfg.sheet][ds.rowNum - 1];
  const oldX = rec[cfg.xCol], oldY = rec[cfg.yCol];
  rec[cfg.xCol] = xPct; rec[cfg.yCol] = yPct;
  const xLetter = colLetter(cfg.xCol + 1), yLetter = colLetter(cfg.yCol + 1);
  try { await sheetsUpdate(`${cfg.sheet}!${xLetter}${ds.rowNum}:${yLetter}${ds.rowNum}`, [[xPct, yPct]]); }
  catch (e) {
    rec[cfg.xCol] = oldX; rec[cfg.yCol] = oldY;
    renderCanvasTab(ds.tabKey);
    toast('이동 저장 실패: ' + e.message, 'err');
  }
}

async function addArrow(tabKey, fromId, toId) {
  if (!data['화살표']) data['화살표'] = [['tab','fromId','toId','label']];
  const row = [tabKey, fromId, toId, ''];
  data['화살표'].push(row);
  if (tabKey === 'home') renderArrows();
  else if (tabKey.startsWith('user_')) renderTabArrowsGeneric(tabKey);
  else renderTabArrows(tabKey);
  try { await sheetsAppend('화살표!A1', [row]); toast('연결됨', 'ok'); }
  catch (e) {
    data['화살표'].pop();
    if (tabKey === 'home') renderArrows();
    else if (tabKey.startsWith('user_')) renderTabArrowsGeneric(tabKey);
    else renderTabArrows(tabKey);
    toast('연결 실패: ' + e.message, 'err');
  }
}

function cardDoubleClick(tabKey, rowNum) {
  if (tabKey === 'checklist') {
    const rec = data['체크리스트'][rowNum - 1];
    const checked = String(rec[4]).toUpperCase() !== 'TRUE';
    toggleCheck(rowNum, checked);
  }
}

async function canvasEmptyDblClick(tabKey, e) {
  if (e.target.closest('.node')) return;
  if (!editMode) { toast('편집 모드를 켜주세요', 'info'); return; }
  const cfg = CANVAS_TABS[tabKey];
  const container = $(`canvas-${tabKey}`);
  const cr = container.getBoundingClientRect();
  const x = ((e.clientX - cr.left) / cr.width * 100).toFixed(2);
  const y = ((e.clientY - cr.top) / cr.height * 100).toFixed(2);
  const headerLen = header(cfg.sheet).length;
  const newRow = new Array(headerLen).fill('');
  newRow[cfg.idCol] = cfg.idPrefix + Date.now().toString().slice(-6);
  newRow[cfg.xCol] = x;
  newRow[cfg.yCol] = y;
  if (tabKey === 'checklist') newRow[4] = 'FALSE';
  if (tabKey === 'memos') {
    newRow[0] = nowISO();
    newRow[1] = userEmail || '';
    newRow[7] = 'memo';
  }
  data[cfg.sheet].push(newRow);
  renderCanvasTab(tabKey);
  const newRowNum = data[cfg.sheet].length;
  try {
    await sheetsAppend(`${cfg.sheet}!A1`, [newRow]);
    openCardModal(tabKey, newRowNum);
  } catch (err) {
    data[cfg.sheet].pop();
    renderCanvasTab(tabKey);
    toast('추가 실패: ' + err.message, 'err');
  }
}

function openCardModal(tabKey, rowNum) {
  const cfg = CANVAS_TABS[tabKey];
  const rec = data[cfg.sheet][rowNum - 1];
  if (!rec) return;
  const currentColor = rec[cfg.colorCol] || cfg.colorFn(rec);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-box" style="max-width:520px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <span class="card-color-dot" id="modal-color-dot" style="background:${esc(currentColor)}"></span>
      <h3 style="margin:0;flex:1">카드 편집</h3>
      <button class="pin-x" data-act="close">×</button>
    </div>
    ${cfg.fields.map(f => `
      <div class="field">
        <label>${esc(f.label)}</label>
        ${f.type === 'checkbox'
          ? `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#0f172a">
              <input type="checkbox" data-fcol="${f.col}" ${String(rec[f.col]).toUpperCase()==='TRUE'?'checked':''}> 완료
            </label>`
          : f.multi
            ? `<textarea data-fcol="${f.col}" rows="3">${esc(rec[f.col]||'')}</textarea>`
            : `<input data-fcol="${f.col}" value="${esc(rec[f.col]||'')}">`}
      </div>`).join('')}
    <div class="field">
      <label>카드 색상</label>
      <div class="color-picker" data-fcol="${cfg.colorCol}">
        ${CARD_COLORS.map(c => `<button type="button" class="swatch ${c===currentColor?'sel':''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        <input type="color" class="swatch swatch-custom" data-custom value="${esc(currentColor)}" title="직접 선택">
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">
      <button class="btn-soft" data-act="del" style="color:#dc2626">삭제</button>
      <div style="display:flex;gap:8px">
        <button class="btn-soft" data-act="close">취소</button>
        <button class="btn" data-act="save">저장</button>
      </div>
    </div>
  </div>`;
  // 색상 swatch 클릭 → 선택 반영
  modal.addEventListener('click', e => {
    const sw = e.target.closest('.swatch[data-color]');
    if (sw) {
      const picker = sw.parentElement;
      picker.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
      sw.classList.add('sel');
      picker.dataset.color = sw.dataset.color;
      $('modal-color-dot').style.background = sw.dataset.color;
    }
  });
  modal.addEventListener('change', e => {
    if (e.target.dataset.custom !== undefined) {
      const picker = e.target.parentElement;
      picker.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
      picker.dataset.color = e.target.value;
      $('modal-color-dot').style.background = e.target.value;
    }
  });
  modal.dataset.tab = tabKey;
  modal.dataset.row = rowNum;
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
    const act = e.target.dataset.act;
    if (act === 'close') modal.remove();
    if (act === 'save') saveCardModal(modal);
    if (act === 'del') deleteCardModal(modal);
  });
  document.body.appendChild(modal);
}

async function saveCardModal(modal) {
  const tabKey = modal.dataset.tab;
  const rowNum = parseInt(modal.dataset.row);
  const cfg = CANVAS_TABS[tabKey];
  const rec = data[cfg.sheet][rowNum - 1];
  const old = rec.slice();
  modal.querySelectorAll('[data-fcol]:not(.color-picker)').forEach(input => {
    const col = parseInt(input.dataset.fcol);
    if (input.type === 'checkbox') rec[col] = input.checked ? 'TRUE' : 'FALSE';
    else if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') rec[col] = input.value;
  });
  // 색상 picker
  const picker = modal.querySelector('.color-picker');
  if (picker && picker.dataset.color) rec[parseInt(picker.dataset.fcol)] = picker.dataset.color;
  modal.remove();
  renderCanvasTab(tabKey);
  renderHome();
  try {
    const headerLen = header(cfg.sheet).length;
    const range = `${cfg.sheet}!A${rowNum}:${colLetter(headerLen)}${rowNum}`;
    await sheetsUpdate(range, [rec.slice(0, headerLen)]);
    toast('저장됨', 'ok');
  } catch (e) {
    for (let i = 0; i < old.length; i++) rec[i] = old[i];
    renderCanvasTab(tabKey);
    renderHome();
    toast('저장 실패: ' + e.message, 'err');
  }
}

async function deleteCardModal(modal) {
  const tabKey = modal.dataset.tab;
  const rowNum = parseInt(modal.dataset.row);
  modal.remove();
  const ok = await myConfirm('이 카드를 삭제할까요?', { okText: '삭제', danger: true });
  if (!ok) return;
  const cfg = CANVAS_TABS[tabKey];
  const removed = data[cfg.sheet].splice(rowNum - 1, 1)[0];
  renderCanvasTab(tabKey);
  renderHome();
  try { await sheetsDeleteRow(cfg.sheet, rowNum); }
  catch (e) {
    data[cfg.sheet].splice(rowNum - 1, 0, removed);
    renderCanvasTab(tabKey);
    renderHome();
    toast('삭제 실패: ' + e.message, 'err');
  }
}

/* PWA 설치 버튼 (hwpx-editor 패턴) */
(function setupInstall() {
  function init() {
    const installBtn = document.getElementById('installBtn');
    if (!installBtn) return;
    let deferred = null;
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                        || window.navigator.standalone === true;
    if (isStandalone) { installBtn.hidden = true; return; }
    const isMobileLike = isIOS || /Android|Mobi/.test(ua) || window.innerWidth <= 720;
    installBtn.textContent = isMobileLike ? '📌 홈 화면에 추가' : '📌 바탕화면에 추가';
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      installBtn.hidden = false;
    });
    window.addEventListener('appinstalled', () => { installBtn.hidden = true; deferred = null; });
    installBtn.hidden = false;
    installBtn.addEventListener('click', async () => {
      if (deferred) {
        try {
          deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice && choice.outcome === 'accepted') installBtn.hidden = true;
        } catch (e) {}
        deferred = null;
        return;
      }
      const isAndroid = /Android/.test(ua);
      showInstallGuide(isIOS ? 'ios' : isAndroid ? 'android' : 'pc');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

function showInstallGuide(kind) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  const iosHTML = `
    <p><b>아이폰·아이패드 (Safari)</b><br>
    ① 화면 아래 <b>공유 버튼</b> ⬆️<br>
    ② <b>"홈 화면에 추가"</b><br>
    ③ <b>"추가"</b></p>`;
  const androidHTML = `
    <p><b>안드로이드 (크롬)</b><br>
    ① 우상단 <b>⋮ 점 3개</b><br>
    ② <b>"홈 화면에 추가"</b> 또는 <b>"앱 설치"</b></p>`;
  const pcHTML = `
    <p><b>크롬·엣지·웨일</b> · 주소창 오른쪽 <b>⊕ 설치 아이콘</b> 클릭<br>
    또는 <b>⋮ 메뉴 → "CDN 기획 설치"</b></p>
    <p><b>Mac (Safari)</b> · 메뉴 [파일] → [Dock에 추가]</p>`;
  const inner = kind === 'ios' ? iosHTML : kind === 'android' ? androidHTML : pcHTML;
  wrap.innerHTML = `<div class="modal-box" style="max-width:440px">
    <h3 style="margin:0 0 12px">📌 바로가기 만들기</h3>
    ${inner}
    <p class="hint">바탕화면 / 홈 화면에서 한 번에 열립니다.</p>
    <div style="display:flex;justify-content:flex-end;margin-top:14px">
      <button class="btn">확인</button>
    </div></div>`;
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.tagName === 'BUTTON') wrap.remove();
  });
  document.body.appendChild(wrap);
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && linkSourceId) {
    linkSourceId = null;
    document.querySelectorAll('.node.link-source').forEach(n => n.classList.remove('link-source'));
  }
  if (e.key === 'Escape') clearSelection();
});

/* ===== 사용자 정의 탭 (v1.0) =====
   탭 시트: id, name, order
   카드 시트: id, tabId, title, body, status, x, y, color
*/
function getUserTabs() {
  return rows('탭').filter(r => r[0]).sort((a, b) => (parseInt(a[2])||0) - (parseInt(b[2])||0));
}

function renderUserTabs() {
  const cont = $('userTabsContainer');
  if (!cont) return;
  const userTabs = getUserTabs();
  cont.innerHTML = userTabs.map(t =>
    `<span class="user-tab-wrap">
      <button data-tab="user_${esc(t[0])}" data-user-tab-id="${esc(t[0])}" ondblclick="renameUserTab('${esc(t[0])}')" title="더블클릭 = 이름 변경">${esc(t[1] || '(이름 없음)')}</button>
      <button class="user-tab-close" data-user-tab-id="${esc(t[0])}" title="탭 삭제">×</button>
    </span>`
  ).join('');
  cont.querySelectorAll('button[data-tab]').forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
  cont.querySelectorAll('.user-tab-close').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); deleteUserTab(b.dataset.userTabId); };
  });
  // 한눈에 nav 버튼이 없으면 첫 번째 user 탭을 활성화
  if (!document.querySelector('.tabs button[data-tab="home"]') && userTabs.length > 0) {
    const active = document.querySelector('.tabs button.active');
    const homeVisible = $('tab-home') && getComputedStyle($('tab-home')).display !== 'none';
    if (!active || active.id === 'addTabBtn' || homeVisible) {
      const firstId = userTabs[0][0];
      setTimeout(() => {
        switchTab('user_' + firstId);
        setTimeout(() => { renderUserCanvas(firstId); }, 100);
      }, 100);
    }
  }
  // 모든 사용자 탭 캔버스 한번씩 그려두기 (전환 시 즉시 보이게)
  setTimeout(() => userTabs.forEach(t => { try { renderUserCanvas(t[0]); } catch(_){} }), 200);

  // ensure tab-pane exists for each
  const main = $('main');
  userTabs.forEach(t => {
    const tabKey = 'user_' + t[0];
    if (!$(`tab-${tabKey}`)) {
      const sec = document.createElement('section');
      sec.id = `tab-${tabKey}`;
      sec.className = 'tab-pane home-full';
      sec.style.display = 'none';
      sec.innerHTML = `
        <div class="home-toolbar canvas-toolbar">
          <div class="hint">${esc(t[1])} — 편집 모드 ON 시 빈 곳 더블클릭 = 카드 추가</div>
          <div style="display:flex;gap:6px">
            <button class="btn-soft" onclick="renameUserTab('${esc(t[0])}')">이름 변경</button>
            <button class="btn-soft" onclick="deleteUserTab('${esc(t[0])}')" style="color:#dc2626">탭 삭제</button>
          </div>
        </div>
        <div class="canvas" id="canvas-${tabKey}" data-tab-key="${tabKey}"
             ondblclick="userCanvasDblClick('${esc(t[0])}', event)"
             onmousedown="userCanvasMouseDown(event, '${tabKey}')">
          <svg class="arrow-svg"></svg>
          <div class="node-layer"></div>
        </div>`;
      main.appendChild(sec);
    }
  });
}

function userTabContextMenu(e, tabId) {
  // Show context menu via myConfirm
  myConfirm('이 탭의 메뉴를 여시겠습니까?', { okText: '메뉴', cancelText: '닫기' }).then(ok => {
    if (!ok) return;
    renameUserTab(tabId);
  });
}

function userTabSheetCfg(tabId) {
  return {
    sheet: '카드',
    titleCol: 2, bodyCol: 3, statusCol: 4,
    idCol: 0, xCol: 5, yCol: 6, colorCol: 7,
    tabId: tabId,
    statusFn: v => v || '',
    colorFn: r => r[7] || '#94a3b8',
    fields: [
      { label: '제목', col: 2 },
      { label: '내용', col: 3, multi: true },
      { label: '상태', col: 4 }
    ]
  };
}

function rowsForUserTab(tabId) {
  return rows('카드').filter(r => r[1] === tabId);
}

function renderUserCanvas(tabId) {
  const tabKey = 'user_' + tabId;
  const container = $(`canvas-${tabKey}`);
  if (!container) return;
  // pin-layer 보장
  let pinLayer = container.querySelector('.pin-layer');
  if (!pinLayer) {
    pinLayer = document.createElement('div');
    pinLayer.className = 'pin-layer';
    container.appendChild(pinLayer);
  }
  const layer = container.querySelector('.node-layer');
  const all = rows('카드');
  const indexedRows = all.map((r, i) => ({ r, idx: i+2 })).filter(x => x.r[1] === tabId);
  layer.innerHTML = indexedRows.map(({ r, idx }) => {
    const id = r[0] || ('CARD' + idx);
    let x = parseFloat(r[5]); let y = parseFloat(r[6]);
    if (isNaN(x) || isNaN(y)) { x = 5 + ((idx-2)%5)*18; y = 5 + Math.floor((idx-2)/5)*22; }
    const title = r[2] || '(무제)';
    const body = r[3] || '';
    const status = r[4] || '';
    const color = r[7] || '#94a3b8';
    return `<div class="node card-node" data-tab="${tabKey}" data-row="${idx}" data-id="${esc(id)}"
      style="left:${x}%;top:${y}%"
      onmousedown="startUserCardDrag(event, '${esc(tabId)}', ${idx}, this)"
      ondblclick="event.stopPropagation()">
      <div class="node-bar" style="background:${color}"></div>
      <div class="node-body">
        <div class="node-name">${esc(String(title).slice(0,40))}${status ? ` <span class="status-tag">${esc(status)}</span>` : ''}</div>
        ${body ? `<div class="node-layer-text">${esc(String(body).slice(0,60))}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  // 핀
  renderPinsIn(pinLayer, v => v === tabKey);
  // 화살표 (layout 완료 보장)
  setTimeout(() => renderUserTabArrows(tabKey), 50);
}

function renderUserTabArrows(tabKey) {
  // 기존 renderTabArrows와 동일 (tab key가 user_xxx)
  renderTabArrowsGeneric(tabKey);
}

function renderTabArrowsGeneric(tabKey) {
  const container = $(`canvas-${tabKey}`);
  if (!container) return;
  const svg = container.querySelector('.arrow-svg');
  if (!svg) return;
  const cw = container.offsetWidth, ch = container.offsetHeight;
  if (!cw || !ch) {
    // 캔버스 사이즈 0 → 잠시 후 재시도
    setTimeout(() => renderTabArrowsGeneric(tabKey), 100);
    return;
  }
  svg.setAttribute('width', cw);
  svg.setAttribute('height', ch);
  svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  const cr = container.getBoundingClientRect();
  const nodeMap = {};
  container.querySelectorAll('.node').forEach(el => {
    const r = el.getBoundingClientRect();
    nodeMap[el.dataset.id] = { el, bbox: { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height } };
  });
  const arrowsRows = (rows('화살표') || []);
  const arrows = arrowsRows.map((a, i) => ({ a, idx: i+2 })).filter(x => x.a[0] === tabKey);
  let body = `<defs><marker id="arrow-${tabKey}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>`;
  arrows.forEach(({a, idx}) => {
    const from = nodeMap[a[1]], to = nodeMap[a[2]];
    if (!from || !to) return;
    const fc = { x: from.bbox.x + from.bbox.w/2, y: from.bbox.y + from.bbox.h/2 };
    const tc = { x: to.bbox.x + to.bbox.w/2, y: to.bbox.y + to.bbox.h/2 };
    const fp = edgeIntersection(from.bbox, tc);
    const tp = edgeIntersection(to.bbox, fc);
    const col = a[4] || '#94a3b8';
    body += `<line class="user-arrow" data-arrow-row="${idx}" x1="${fp.x}" y1="${fp.y}" x2="${tp.x}" y2="${tp.y}" stroke="${col}" stroke-width="14" stroke-linecap="round" stroke-opacity="0" fill="none" style="cursor:pointer"/>`;
    body += `<line x1="${fp.x}" y1="${fp.y}" x2="${tp.x}" y2="${tp.y}" stroke="${col}" stroke-width="1.8" fill="none" marker-end="url(#arrow-${tabKey})" pointer-events="none"/>`;
    if (a[3]) {
      const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
      body += `<text class="arrow-label" x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${esc(a[3])}</text>`;
    }
  });
  svg.innerHTML = body;
  // 화살표 클릭 → 편집 팝오버 (색·라벨·삭제)
  svg.querySelectorAll('.user-arrow').forEach(line => {
    line.onclick = (e) => {
      e.stopPropagation();
      if (!editMode) return;
      const rowNum = parseInt(line.dataset.arrowRow);
      openArrowPopover(rowNum, e.clientX, e.clientY, () => renderTabArrowsGeneric(tabKey));
    };
  });
}

const ARROW_COLORS = ['#94a3b8','#0f172a','#2563eb','#0ea5e9','#16a34a','#f59e0b','#dc2626','#a855f7','#ec4899'];

function openArrowPopover(rowNum, cx, cy, rerender) {
  document.querySelectorAll('.arrow-popover').forEach(p => p.remove());
  const rec = data['화살표'][rowNum - 1];
  if (!rec) return;
  const pop = document.createElement('div');
  pop.className = 'arrow-popover';
  pop.style.left = Math.min(cx, window.innerWidth - 280) + 'px';
  pop.style.top  = Math.min(cy + 12, window.innerHeight - 200) + 'px';
  pop.innerHTML = `
    <div class="ap-row"><label>라벨</label><input id="ap-label" value="${esc(rec[3] || '')}" placeholder="(선택)"></div>
    <div class="ap-row"><label>색상</label>
      <div class="ap-colors">
        ${ARROW_COLORS.map(c => `<button class="ap-sw ${c===(rec[4]||'#94a3b8')?'sel':''}" data-c="${c}" style="background:${c}"></button>`).join('')}
      </div>
    </div>
    <div class="ap-foot">
      <button class="btn-soft ap-del" style="color:#dc2626">삭제</button>
      <button class="btn-soft ap-close">닫기</button>
    </div>`;
  document.body.appendChild(pop);

  const save = async (patch) => {
    Object.entries(patch).forEach(([k, v]) => { rec[k] = v; });
    rerender();
    try { await sheetsUpdate(`화살표!A${rowNum}:E${rowNum}`, [[rec[0]||'', rec[1]||'', rec[2]||'', rec[3]||'', rec[4]||'']]); }
    catch (e) { toast('저장 실패: '+e.message, 'err'); }
  };

  pop.querySelector('#ap-label').addEventListener('blur', e => save({3: e.target.value}));
  pop.querySelectorAll('.ap-sw').forEach(b => {
    b.onclick = () => {
      pop.querySelectorAll('.ap-sw').forEach(s => s.classList.remove('sel'));
      b.classList.add('sel');
      save({4: b.dataset.c});
    };
  });
  pop.querySelector('.ap-del').onclick = async () => {
    pop.remove();
    const removed = data['화살표'].splice(rowNum - 1, 1)[0];
    rerender();
    try { await sheetsDeleteRow('화살표', rowNum); }
    catch (e) {
      data['화살표'].splice(rowNum - 1, 0, removed);
      rerender();
      toast('삭제 실패: '+e.message, 'err');
    }
  };
  pop.querySelector('.ap-close').onclick = () => pop.remove();

  setTimeout(() => {
    document.addEventListener('mousedown', function close(ev) {
      if (pop.contains(ev.target)) {
        document.addEventListener('mousedown', close, { once: true, capture: true });
        return;
      }
      pop.remove();
    }, { once: true, capture: true });
  }, 50);
}

function startUserCardDrag(e, tabId, rowNum, el) {
  if (e.button !== 0) return;
  if (!editMode) {
    e.stopPropagation();
    const dx = e.clientX, dy = e.clientY;
    const handler = (ev) => {
      document.removeEventListener('mouseup', handler);
      if (Math.abs(ev.clientX-dx) < 5 && Math.abs(ev.clientY-dy) < 5) openUserCardModal(tabId, rowNum);
    };
    document.addEventListener('mouseup', handler, { once: true });
    return;
  }
  if (e.shiftKey) {
    e.stopPropagation();
    toggleCardSelection('user_' + tabId, rowNum, el);
    return;
  }
  e.stopPropagation();
  const tabKey = 'user_' + tabId;
  const container = $(`canvas-${tabKey}`);
  const cr = container.getBoundingClientRect();
  cardDrag = {
    tabKey, cfg: { sheet: '카드', xCol: 5, yCol: 6 }, rowNum, el, container, canvasRect: cr,
    startX: e.clientX, startY: e.clientY,
    startLeft: el.offsetLeft, startTop: el.offsetTop,
    moved: false, isUserTab: true, tabId
  };
  document.addEventListener('mousemove', onCardDragMove);
  document.addEventListener('mouseup', onUserCardDragEnd);
}

async function onUserCardDragEnd(e) {
  if (!cardDrag) return;
  const ds = cardDrag;
  document.removeEventListener('mousemove', onCardDragMove);
  document.removeEventListener('mouseup', onUserCardDragEnd);
  cardDrag = null;
  ds.el.classList.remove('dragging');
  if (!ds.moved) {
    const cardId = ds.el.dataset.id;
    if (linkSourceId && linkSourceId !== cardId) {
      const src = linkSourceId; linkSourceId = null;
      document.querySelectorAll('.node.link-source').forEach(n => n.classList.remove('link-source'));
      await addArrow(ds.tabKey, src, cardId);
    } else if (linkSourceId === cardId) {
      linkSourceId = null;
      ds.el.classList.remove('link-source');
    } else {
      linkSourceId = cardId;
      ds.el.classList.add('link-source');
      toast('연결 → 다른 카드 클릭 (취소: ESC)', 'info');
    }
    return;
  }
  const cr = ds.canvasRect;
  const xPct = (ds.el.offsetLeft / cr.width * 100).toFixed(2);
  const yPct = (ds.el.offsetTop / cr.height * 100).toFixed(2);
  ds.el.style.left = xPct + '%';
  ds.el.style.top = yPct + '%';
  const rec = data['카드'][ds.rowNum - 1];
  const oldX = rec[5], oldY = rec[6];
  rec[5] = xPct; rec[6] = yPct;
  try { await sheetsUpdate(`카드!F${ds.rowNum}:G${ds.rowNum}`, [[xPct, yPct]]); }
  catch (e) {
    rec[5] = oldX; rec[6] = oldY;
    renderUserCanvas(ds.tabId);
    toast('이동 저장 실패: ' + e.message, 'err');
  }
}

async function userCanvasDblClick(tabId, e) {
  if (e.target.closest('.node')) return;
  if (e.target.closest('.pin')) return;
  if (!editMode) { toast('편집 모드를 켜주세요', 'info'); return; }
  const tabKey = 'user_' + tabId;
  const container = $(`canvas-${tabKey}`);
  const cr = container.getBoundingClientRect();
  const xPct = ((e.clientX - cr.left) / cr.width * 100).toFixed(2);
  const yPct = ((e.clientY - cr.top) / cr.height * 100).toFixed(2);
  showAddMenu(e.clientX, e.clientY, tabKey, xPct, yPct);
}

async function addUserCardAt(tabId, xPct, yPct) {
  const id = 'CARD' + Date.now().toString().slice(-7);
  const newRow = [id, tabId, '', '', '', xPct, yPct, '#94a3b8'];
  data['카드'].push(newRow);
  renderUserCanvas(tabId);
  const newRowNum = data['카드'].length;
  try {
    await sheetsAppend('카드!A1', [newRow]);
    openUserCardModal(tabId, newRowNum);
  } catch (err) {
    data['카드'].pop();
    renderUserCanvas(tabId);
    toast('카드 추가 실패: ' + err.message, 'err');
  }
}

async function addHomeCardAt(xPct, yPct) {
  const id = 'NODE' + Date.now().toString().slice(-6);
  const newRow = [id, '새 카드', '기타', '홀딩', '', '', '', '', xPct, yPct, '#94a3b8'];
  data['공급사'].push(newRow);
  renderDiagram();
  const newRowNum = data['공급사'].length;
  try {
    await sheetsAppend('공급사!A1', [newRow]);
    openNodeModal(newRowNum);
  } catch (err) {
    data['공급사'].pop();
    renderDiagram();
    toast('카드 추가 실패: ' + err.message, 'err');
  }
}

/* 미니 메뉴: 카드 / 핀 선택 (모든 탭 공통) */
let addMenuEl = null;
function showAddMenu(clientX, clientY, tabKey, xPct, yPct) {
  if (addMenuEl) addMenuEl.remove();
  const m = document.createElement('div');
  m.className = 'add-menu';
  m.style.left = Math.min(clientX, window.innerWidth - 180) + 'px';
  m.style.top  = Math.min(clientY, window.innerHeight - 90) + 'px';
  m.innerHTML = `
    <button data-act="card"><span class="emo">📦</span> <span>카드 추가</span></button>
    <button data-act="pin"><span class="emo">📌</span> <span>메모 핀 추가</span></button>
  `;
  m.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    m.remove(); addMenuEl = null;
    if (act === 'card') {
      if (tabKey === 'home') addHomeCardAt(xPct, yPct);
      else if (tabKey.startsWith('user_')) addUserCardAt(tabKey.replace('user_',''), xPct, yPct);
    } else if (act === 'pin') {
      pendingPinPos = { x: xPct, y: yPct, type: tabKey };
      openNewMemoModal();
    }
  });
  document.body.appendChild(m);
  addMenuEl = m;
  setTimeout(() => {
    document.addEventListener('mousedown', closeAddMenu, { once: true, capture: true });
  }, 50);
}
function closeAddMenu(e) {
  if (!addMenuEl) return;
  if (addMenuEl.contains(e.target)) {
    document.addEventListener('mousedown', closeAddMenu, { once: true, capture: true });
    return;
  }
  addMenuEl.remove();
  addMenuEl = null;
}

function userCanvasMouseDown(e, tabKey) {
  if (!editMode) return;
  if (e.target.closest('.node')) return;
  if (e.button !== 0) return;
  const container = $(`canvas-${tabKey}`);
  if (!container) return;
  const cr = container.getBoundingClientRect();
  if (!e.shiftKey) clearSelection();
  selectedTabKey = tabKey;
  selectionState = { tabKey, container, cr, startX: e.clientX - cr.left, startY: e.clientY - cr.top };
  let rect = container.querySelector('.selection-rect');
  if (!rect) {
    rect = document.createElement('div');
    rect.className = 'selection-rect';
    container.appendChild(rect);
  }
  rect.style.display = '';
  rect.style.left = selectionState.startX + 'px';
  rect.style.top = selectionState.startY + 'px';
  rect.style.width = '0';
  rect.style.height = '0';
  document.addEventListener('mousemove', selectionMove);
  document.addEventListener('mouseup', selectionUp);
}

function openUserCardModal(tabId, rowNum) {
  const rec = data['카드'][rowNum - 1];
  if (!rec) return;
  const currentColor = rec[7] || '#94a3b8';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-box" style="max-width:520px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <span class="card-color-dot" id="modal-color-dot" style="background:${esc(currentColor)}"></span>
      <h3 style="margin:0;flex:1">카드 편집</h3>
      <button class="pin-x" data-act="close">×</button>
    </div>
    <div class="field"><label>제목</label><input data-fcol="2" value="${esc(rec[2]||'')}"></div>
    <div class="field"><label>내용</label><textarea data-fcol="3" rows="4">${esc(rec[3]||'')}</textarea></div>
    <div class="field"><label>상태</label>
      <select data-fcol="4">
        <option value="">없음</option>
        <option value="홀딩" ${rec[4]==='홀딩'?'selected':''}>홀딩</option>
        <option value="진행예정" ${rec[4]==='진행예정'?'selected':''}>진행예정</option>
        <option value="진행중" ${rec[4]==='진행중'?'selected':''}>진행중</option>
        <option value="완료" ${rec[4]==='완료'?'selected':''}>완료</option>
      </select>
    </div>
    <div class="field">
      <label>카드 색상</label>
      <div class="color-picker" data-fcol="7">
        ${CARD_COLORS.map(c => `<button type="button" class="swatch ${c===currentColor?'sel':''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        <input type="color" class="swatch swatch-custom" data-custom value="${esc(currentColor)}" title="직접 선택">
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">
      <button class="btn-soft" data-act="del" style="color:#dc2626">삭제</button>
      <div style="display:flex;gap:8px">
        <button class="btn-soft" data-act="close">취소</button>
        <button class="btn" data-act="save">저장</button>
      </div>
    </div>
  </div>`;
  modal.dataset.tabId = tabId;
  modal.dataset.row = rowNum;
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
    const sw = e.target.closest('.swatch[data-color]');
    if (sw) {
      const picker = sw.parentElement;
      picker.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
      sw.classList.add('sel');
      picker.dataset.color = sw.dataset.color;
      $('modal-color-dot').style.background = sw.dataset.color;
    }
    const act = e.target.dataset.act;
    if (act === 'close') modal.remove();
    if (act === 'save') saveUserCardModal(modal);
    if (act === 'del') deleteUserCardModal(modal);
  });
  modal.addEventListener('change', e => {
    if (e.target.dataset.custom !== undefined) {
      const picker = e.target.parentElement;
      picker.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
      picker.dataset.color = e.target.value;
      $('modal-color-dot').style.background = e.target.value;
    }
  });
  document.body.appendChild(modal);
}

async function saveUserCardModal(modal) {
  const tabId = modal.dataset.tabId;
  const rowNum = parseInt(modal.dataset.row);
  const rec = data['카드'][rowNum - 1];
  const old = rec.slice();
  modal.querySelectorAll('[data-fcol]:not(.color-picker)').forEach(input => {
    const col = parseInt(input.dataset.fcol);
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' || input.tagName === 'SELECT') rec[col] = input.value;
  });
  const picker = modal.querySelector('.color-picker');
  if (picker && picker.dataset.color) rec[7] = picker.dataset.color;
  modal.remove();
  renderUserCanvas(tabId);
  try {
    await sheetsUpdate(`카드!A${rowNum}:H${rowNum}`, [rec.slice(0, 8)]);
    toast('저장됨', 'ok');
  } catch (e) {
    for (let i = 0; i < old.length; i++) rec[i] = old[i];
    renderUserCanvas(tabId);
    toast('저장 실패: ' + e.message, 'err');
  }
}

async function deleteUserCardModal(modal) {
  const tabId = modal.dataset.tabId;
  const rowNum = parseInt(modal.dataset.row);
  modal.remove();
  const ok = await myConfirm('이 카드를 삭제할까요?', { okText: '삭제', danger: true });
  if (!ok) return;
  const removed = data['카드'].splice(rowNum - 1, 1)[0];
  renderUserCanvas(tabId);
  try { await sheetsDeleteRow('카드', rowNum); }
  catch (e) {
    data['카드'].splice(rowNum - 1, 0, removed);
    renderUserCanvas(tabId);
    toast('삭제 실패: ' + e.message, 'err');
  }
}

/* 새 탭 모달 */
function openNewTabModal() {
  $('new-tab-name').value = '';
  $('newTabModal').style.display = '';
  setTimeout(() => $('new-tab-name').focus(), 30);
}
function closeNewTabModal() { $('newTabModal').style.display = 'none'; }

async function confirmNewTab() {
  const name = $('new-tab-name').value.trim();
  if (!name) { toast('이름을 입력하세요', 'err'); return; }
  const id = 'tab' + Date.now().toString().slice(-7);
  const order = (rows('탭') || []).length + 1;
  const row = [id, name, order];
  data['탭'].push(row);
  closeNewTabModal();
  renderUserTabs();
  switchTab('user_' + id);
  try { await sheetsAppend('탭!A1', [row]); toast('탭 추가됨', 'ok'); }
  catch (e) {
    data['탭'].pop();
    renderUserTabs();
    toast('추가 실패: ' + e.message, 'err');
  }
}

async function renameUserTab(tabId) {
  const tabRows = rows('탭');
  const idx = tabRows.findIndex(r => r[0] === tabId);
  if (idx < 0) return;
  const cur = tabRows[idx][1];
  const newName = await myPrompt('새 이름', cur);
  if (!newName) return;
  const rowNum = idx + 2;
  const old = tabRows[idx][1];
  data['탭'][rowNum - 1][1] = newName;
  renderUserTabs();
  try { await sheetsUpdate(`탭!B${rowNum}`, [[newName]]); toast('이름 변경됨', 'ok'); }
  catch (e) {
    data['탭'][rowNum - 1][1] = old;
    renderUserTabs();
    toast('실패: ' + e.message, 'err');
  }
}

async function deleteUserTab(tabId) {
  const ok = await myConfirm('탭과 그 안의 카드 모두 삭제할까요?', { okText: '삭제', danger: true });
  if (!ok) return;
  const tabRows = rows('탭');
  const idx = tabRows.findIndex(r => r[0] === tabId);
  if (idx < 0) return;
  const rowNum = idx + 2;
  // 카드 삭제 (역순으로)
  const cardRows = data['카드'].slice(1).map((r, i) => ({r, idx: i+2})).filter(x => x.r[1] === tabId).reverse();
  // 화살표도 함께
  const arrowRows = data['화살표'].slice(1).map((r, i) => ({r, idx: i+2})).filter(x => x.r[0] === ('user_' + tabId)).reverse();
  try {
    for (const a of arrowRows) await sheetsDeleteRow('화살표', a.idx);
    for (const c of cardRows) await sheetsDeleteRow('카드', c.idx);
    await sheetsDeleteRow('탭', rowNum);
    // local 갱신
    cardRows.forEach(c => data['카드'].splice(c.idx - 1, 1));
    arrowRows.forEach(a => data['화살표'].splice(a.idx - 1, 1));
    data['탭'].splice(rowNum - 1, 1);
    // remove DOM
    const sec = $(`tab-user_${tabId}`);
    if (sec) sec.remove();
    renderUserTabs();
    switchTab('home');
    toast('탭 삭제됨', 'ok');
  } catch (e) {
    toast('실패: ' + e.message, 'err');
    loadAll();
  }
}

/* ===== 다중 선택 + 자동 정렬 (v0.9) ===== */
let selectionState = null;
const selectedCards = new Set();  // "tabKey:rowNum"
let selectedTabKey = null;

function clearSelection() {
  selectedCards.clear();
  selectedTabKey = null;
  document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
  updateAlignBar();
}

function toggleCardSelection(tabKey, rowNum, el) {
  if (selectedTabKey && selectedTabKey !== tabKey) clearSelection();
  selectedTabKey = tabKey;
  const key = `${tabKey}:${rowNum}`;
  if (selectedCards.has(key)) {
    selectedCards.delete(key);
    el.classList.remove('selected');
  } else {
    selectedCards.add(key);
    el.classList.add('selected');
  }
  updateAlignBar();
}

function updateAlignBar() {
  const bar = $('alignBar');
  if (!bar) return;
  if (selectedCards.size >= 2) {
    bar.style.display = '';
    bar.querySelector('.count').textContent = selectedCards.size;
  } else {
    bar.style.display = 'none';
  }
}

// 캔버스 빈 곳 mousedown → drag-select rect (편집 모드만)
function canvasMouseDown(e, tabKey) {
  if (!editMode) return;
  if (e.target.closest('.node')) return;
  if (e.button !== 0) return;
  const container = $(`canvas-${tabKey}`);
  if (!container) return;
  const cr = container.getBoundingClientRect();
  // shift 누르고 있지 않으면 기존 선택 해제
  if (!e.shiftKey) clearSelection();
  selectedTabKey = tabKey;
  selectionState = {
    tabKey, container, cr,
    startX: e.clientX - cr.left,
    startY: e.clientY - cr.top
  };
  // selection rect element
  let rect = container.querySelector('.selection-rect');
  if (!rect) {
    rect = document.createElement('div');
    rect.className = 'selection-rect';
    container.appendChild(rect);
  }
  rect.style.display = '';
  rect.style.left = selectionState.startX + 'px';
  rect.style.top = selectionState.startY + 'px';
  rect.style.width = '0';
  rect.style.height = '0';
  document.addEventListener('mousemove', selectionMove);
  document.addEventListener('mouseup', selectionUp);
}
function selectionMove(e) {
  if (!selectionState) return;
  const cr = selectionState.cr;
  const x = e.clientX - cr.left;
  const y = e.clientY - cr.top;
  const rect = selectionState.container.querySelector('.selection-rect');
  const left = Math.min(x, selectionState.startX);
  const top  = Math.min(y, selectionState.startY);
  const w = Math.abs(x - selectionState.startX);
  const h = Math.abs(y - selectionState.startY);
  rect.style.left = left + 'px';
  rect.style.top  = top + 'px';
  rect.style.width = w + 'px';
  rect.style.height = h + 'px';
}
function selectionUp(e) {
  document.removeEventListener('mousemove', selectionMove);
  document.removeEventListener('mouseup', selectionUp);
  if (!selectionState) return;
  const ss = selectionState;
  const rect = ss.container.querySelector('.selection-rect');
  if (!rect) { selectionState = null; return; }
  const w = parseFloat(rect.style.width);
  const h = parseFloat(rect.style.height);
  if (w < 6 && h < 6) {
    rect.style.display = 'none';
    selectionState = null;
    return;
  }
  const sb = {
    x: parseFloat(rect.style.left),
    y: parseFloat(rect.style.top),
    w, h
  };
  const cr = ss.container.getBoundingClientRect();
  ss.container.querySelectorAll('.node').forEach(el => {
    const r = el.getBoundingClientRect();
    const nb = { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
    if (boxesOverlap(sb, nb)) {
      const rowNum = parseInt(el.dataset.row);
      const key = `${ss.tabKey}:${rowNum}`;
      if (!selectedCards.has(key)) {
        selectedCards.add(key);
        el.classList.add('selected');
      }
    }
  });
  rect.style.display = 'none';
  selectionState = null;
  updateAlignBar();
}

// 정렬 = 선택된 카드들을 그리드로 균등 배치
async function alignSelected(mode = 'grid') {
  if (selectedCards.size < 2 || !selectedTabKey) return;
  const tabKey = selectedTabKey;
  const cfg = CANVAS_TABS[tabKey];
  const items = [...selectedCards].filter(k => k.startsWith(tabKey + ':')).map(k => parseInt(k.split(':')[1]));
  // 현재 위치
  const positions = items.map(rowNum => {
    const rec = data[cfg.sheet][rowNum - 1];
    return { rowNum, x: parseFloat(rec[cfg.xCol])||0, y: parseFloat(rec[cfg.yCol])||0 };
  });
  // bbox
  const minX = Math.min(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxX = Math.max(...positions.map(p => p.x));
  const maxY = Math.max(...positions.map(p => p.y));
  const N = positions.length;
  let newPositions;
  if (mode === 'h' || (mode === 'grid' && (maxX - minX) > (maxY - minY) * 2)) {
    // 가로 한 줄
    const step = N > 1 ? (maxX - minX) / (N - 1) : 0;
    const sorted = [...positions].sort((a, b) => a.x - b.x);
    const avgY = positions.reduce((s, p) => s + p.y, 0) / N;
    newPositions = sorted.map((p, i) => ({ rowNum: p.rowNum, x: minX + step * i, y: avgY }));
  } else if (mode === 'v' || (mode === 'grid' && (maxY - minY) > (maxX - minX) * 2)) {
    // 세로 한 줄
    const step = N > 1 ? (maxY - minY) / (N - 1) : 0;
    const sorted = [...positions].sort((a, b) => a.y - b.y);
    const avgX = positions.reduce((s, p) => s + p.x, 0) / N;
    newPositions = sorted.map((p, i) => ({ rowNum: p.rowNum, x: avgX, y: minY + step * i }));
  } else {
    // 그리드
    const cols = Math.ceil(Math.sqrt(N));
    const rows = Math.ceil(N / cols);
    const stepX = cols > 1 ? (maxX - minX) / (cols - 1) : 0;
    const stepY = rows > 1 ? (maxY - minY) / (rows - 1) : 0;
    const sorted = [...positions].sort((a, b) => a.y - b.y || a.x - b.x);
    newPositions = sorted.map((p, i) => ({
      rowNum: p.rowNum,
      x: minX + (i % cols) * stepX,
      y: minY + Math.floor(i / cols) * stepY
    }));
  }
  // 낙관적 적용
  const old = positions.map(p => ({ ...p }));
  newPositions.forEach(p => {
    const rec = data[cfg.sheet][p.rowNum - 1];
    rec[cfg.xCol] = p.x.toFixed(2);
    rec[cfg.yCol] = p.y.toFixed(2);
  });
  renderCanvasTab(tabKey);
  // 시트 저장
  try {
    const xLetter = colLetter(cfg.xCol + 1), yLetter = colLetter(cfg.yCol + 1);
    const updates = newPositions.map(p => ({
      range: `${cfg.sheet}!${xLetter}${p.rowNum}:${yLetter}${p.rowNum}`,
      values: [[p.x.toFixed(2), p.y.toFixed(2)]]
    }));
    await sapi('POST', '/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: updates });
    toast(`${N}개 정렬 (${mode})`, 'ok');
  } catch (e) {
    old.forEach(p => {
      const rec = data[cfg.sheet][p.rowNum - 1];
      rec[cfg.xCol] = p.x; rec[cfg.yCol] = p.y;
    });
    renderCanvasTab(tabKey);
    toast('정렬 저장 실패: ' + e.message, 'err');
  }
}
