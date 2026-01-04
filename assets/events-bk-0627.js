;(function(){
  if (window.__EVENTS_CALENDAR_LOADED) return;
  window.__EVENTS_CALENDAR_LOADED = true;
  console.log('[events.js] start');

  // querySelector ヘルパー
  const $  = (s, c=document) => c.querySelector(s);
  const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
  const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  const container  = $('#event-container');
  if (!container) return console.warn('[events.js] no #event-container');

  // テンプレート側で set される data-* を拾う
  const regionCode = (container.dataset.region||'ALL').toUpperCase();  // "TOKYO" など
  const monthKey   = (container.dataset.month||'').slice(0,7);         // "2025-05"

  // Edge Function のエンドポイント
  // （Supabase Dashboard → Functions → get-events の「Invoke URL」）
  const FUNC_BASE = 'https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1';
  const API_URL   = `${FUNC_BASE}/get-events?month=${monthKey}&region=${regionCode}`;

  fetch(API_URL)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(json => {
      // {"data":[...], "error":null}
      const list = json.data || [];
      render(list);
    })
    .catch(handleError);

  /** ─── 描画 ─── **/
  function render(list) {
    if (!list.length) {
      container.innerHTML = '<p class="no-events">該当するイベントがありません。</p>';
      return;
    }
    // 日付ごとに振り分け
    const byDate = {};
    list.forEach(ev => {
      (byDate[ev.event_date] ??= []).push(ev);
    });

    container.innerHTML = Object.keys(byDate).sort().map(date=>{
      const dt  = new Date(date);
      const hdr = `📆 ${DAYS[dt.getDay()]} ${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]}`;
      const cards = byDate[date].map(cardHTML).join('');
      return `
        <section id="date-${date}" class="event-section">
          <h2>${hdr}</h2>
          <div class="event-list">${cards}</div>
        </section>`;
    }).join('');

    buildDateButtons();
  }

  function cardHTML(ev) {
    return `
      <a href="/blogs/media/${ev.handle}" class="event-card">
        <div class="event-image" style="background-image:url('${ev.image_url||''}')"></div>
        <div class="event-info">
          <div class="event-title">${ev.title}</div>
          <div class="event-location">🗾 ${ev.regions?.[0]||''}</div>
          <div class="event-venue">📍 ${ev.venue_name||''}</div>
        </div>
      </a>`;
  }

  /** ─── 日付ボタン ─── **/
  function buildDateButtons() {
    const scroll = $('#date-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    let currentMonth = null;

    $$('.event-section').forEach((sec,i)=>{
      const [,yy,mm,dd] = /date-(\d{4})-(\d{2})-(\d{2})/.exec(sec.id);
      const mi = parseInt(mm,10)-1;
      if (currentMonth!==mi) {
        currentMonth = mi;
        const mark = document.createElement('div');
        mark.className='month-indicator';
        mark.textContent=MONTHS[mi];
        scroll.appendChild(mark);
      }
      const btn = document.createElement('button');
      btn.className = 'date-btn' + (i===0?' active':'');
      btn.dataset.target = sec.id;
      btn.innerHTML = `
        <span class="date-yobi">${DAYS[new Date(`${yy}-${mm}-${dd}`).getDay()]}</span>
        <span class="date-day">${dd}</span>
        <span class="date-mt">${MONTHS[mi]}</span>`;
      btn.addEventListener('click',()=>{
        $$('.date-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        window.scrollTo({ top: sec.offsetTop-100, behavior:'smooth' });
      });
      scroll.appendChild(btn);
    });
  }

  /** ─── ポップアップ ─── **/
  function openAreaPopup() {
    $('#area-popup').style.display = 'block';
    $('#ev-overlay').style.display  = 'block';
  }
  function closeAreaPopup() {
    $('#area-popup').style.display = 'none';
    $('#ev-overlay').style.display  = 'none';
  }
  function backToMainMenu() {
    $('#main-menu').classList.remove('hidden');
    $$('.region-content').forEach(el=>el.classList.remove('active'));
  }
  function showRegion(region) {
    $('#main-menu').classList.add('hidden');
    $$('.region-content').forEach(el=>{
      el.id===region ? el.classList.add('active') : el.classList.remove('active');
    });
  }
  function selectArea(area) {
    console.log('selectArea →', area);
    closeAreaPopup();
    // ここで「ページを再ロードして data-region 属性を書き換え」なども可能です
  }

  function handleError(err) {
    console.error('[events.js] fetch error:', err);
    container.innerHTML = '<p class="event-error">イベントの取得に失敗しました。</p>';
  }

  // 外から呼べるようグローバルにセット
  window.openAreaPopup  = openAreaPopup;
  window.closeAreaPopup = closeAreaPopup;
  window.backToMainMenu = backToMainMenu;
  window.showRegion     = showRegion;
  window.selectArea     = selectArea;

  document.addEventListener('DOMContentLoaded',()=>{
    $('#ev-overlay').addEventListener('click', closeAreaPopup);
    console.log('[events.js] ready');
  });
})();
