/* Passage — 旅行工作台核心逻辑
   城市与行程数据全部来自 data/places.js，本文件不含任何城市 / 天数硬编码
   （产品名同样来自数据层的 APP.name，不写死在这里）。
   数据来源与坐标精度说明见 data/places.js 顶部注释。 */
(function () {
  'use strict';

  var D = window.TW;
  if (!D) { console.error('data/places.js 未加载'); return; }

  var MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  /* 产品名从数据层取，改 data/places.js 的 APP.name 就能整体换名 */
  var BRAND = (D.APP && D.APP.name) || '旅行工作台';
  var CITY = D.CITY;
  var DAYS = D.DAYS;
  var PLACES = D.PLACES;

  var state = {
    day: 'all',
    type: '全部',
    activeId: null,
    reduceMotion: false,
    anchorStart: true,
    mapReady: false
  };
  try {
    state.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  /* ---------------- 断点判定 ----------------
     三个布局，用同一个 980px 宽度阈值分叉：
       desktop  宽屏三栏
       sheet    竖屏手机：底部抽屉（行程面板收起成一条，详情是浮层）
       flat     横屏手机：左侧常驻列表 + 右侧浮出详情（矮屏放不下底部抽屉）
     布局只认宽度，判定只写在这里——CSS 那边靠 media query 对齐同一组条件。 */
  function isNarrow() { return window.innerWidth <= 980; }
  function isFlat() {
    return isNarrow() && window.innerWidth > window.innerHeight && window.innerHeight <= 560;
  }

  /* 收起态只露标题栏那一条。这个高度必须实测——标题换行、字号变化都会让它变，
     写死一个数字迟早对不上（旧版写死 152px 就是这么坏的）。 */
  function syncPanelPeek() {
    var head = document.querySelector('.panel-head');
    if (!head) return;
    var h = Math.round(head.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--panel-peek', h + 'px');
  }

  /* ---------------- 图标 ---------------- */
  var ICONS = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    pin: '<path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4V12l3.2 2"/>',
    eat: '<path d="M6.5 3v7a3 3 0 006 0V3"/><path d="M9.5 10v11"/><path d="M17.5 3c-1.4 2-2.1 3.6-2.1 5.6s.7 3.4 2.1 3.4V21"/>',
    view: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  function svg(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var dayColor = function (d) { return (DAYS[d] && DAYS[d].color) || '#1A1A1A'; };
  var byDay = function (d) { return PLACES.filter(function (p) { return p.day === d; }).sort(function (a, b) { return a.order - b.order; }); };
  var placeById = function (id) { return PLACES.filter(function (p) { return p.id === id; })[0]; };

  /* ---------------- 数据规整 ----------------
     外部行程 JSON 不会像内置数据那样完整。
     这里统一补默认值，目标是：只给「地点名 + 经纬度 + 第几天」也能完整渲染。
     所有补默认值都发生在这里，渲染层不再做缺省判断。 */
  var DAY_PALETTE = ['#C0392B', '#E07B39', '#2C4A8F', '#1E7A4B', '#7B4B94',
    '#0E7490', '#A16207', '#9F1239', '#4D7C0F', '#6D28D9'];

  /* 类型 → 大类。地点自带 type（可能很细，如「小食 · 蛋仔」），
     筛选栏用大类，否则地点一多 chip 就碎成十几个。
     数据里显式给了 cat 就用数据的，否则按下面规则推导。 */
  var CAT_RULES = [
    [/海滩|沙滩|泳滩/, '海滩'],
    [/街巷|街道|马路|巷|弄/, '街区'],
    [/茶餐厅|料理|小食|茶饮|烘焙|咖啡|甜品|面|饭|酒吧|餐厅/, '餐饮'],
    [/教堂|庙|寺|图书馆|博物馆|码头|地标|建筑|公园|观景|广场/, '景点']
  ];
  var CAT_ORDER = ['餐饮', '景点', '街区', '海滩'];

  function normalize() {
    /* 1 · 城市 */
    if (!CITY || typeof CITY !== 'object') CITY = D.CITY = {};
    CITY.name = CITY.name || '未命名行程';
    CITY.en = String(CITY.en || CITY.name).toUpperCase();
    if (!Array.isArray(CITY.center) || CITY.center.length !== 2) CITY.center = null;

    /* 2 · 天：没给就按地点里出现的最大 day 推算，颜色从调色板取 */
    if (!Array.isArray(DAYS) || !DAYS.length) {
      var maxDay = PLACES.reduce(function (m, p) {
        return Math.max(m, typeof p.day === 'number' ? p.day : 0);
      }, 0);
      DAYS = D.DAYS = [];
      for (var i = 0; i <= maxDay; i++) DAYS.push({ index: i });
    }
    DAYS.forEach(function (d, i) {
      d.index = i;
      d.name = d.name || ('第 ' + (i + 1) + ' 天');
      d.theme = d.theme || '';
      d.span = d.span || '';
      d.color = d.color || DAY_PALETTE[i % DAY_PALETTE.length];
    });

    /* 3 · 地点字段 */
    var bad = [];
    PLACES.forEach(function (p, i) {
      p.id = p.id || ('p' + i);
      var day = typeof p.day === 'number' ? p.day : 0;
      p.day = Math.min(Math.max(day, 0), DAYS.length - 1);
      var ok = typeof p.lng === 'number' && typeof p.lat === 'number' &&
        isFinite(p.lng) && isFinite(p.lat) && !(p.lng === 0 && p.lat === 0);
      if (!ok) { p.lng = 0; p.lat = 0; bad.push(p.name || ('#' + i)); }
      p.name = p.name || ('未命名地点 ' + (i + 1));
      p.en = p.en || '';
      p.type = p.type || '地点';
      p.cat = p.cat || (function () {
        for (var r = 0; r < CAT_RULES.length; r++) {
          if (CAT_RULES[r][0].test(p.type)) return CAT_RULES[r][1];
        }
        return '其他';
      })();
      p.mood = p.mood || '';
      p.timeSlot = p.timeSlot || '';
      p.clock = p.clock || '';
      p.duration = typeof p.duration === 'number' ? p.duration : 0;
      p.desc = p.desc || '';
      p.eat = Array.isArray(p.eat) ? p.eat : [];
      p.view = Array.isArray(p.view) ? p.view : [];
      /* 配图：外部行程数据未必带。只保留有 src 的项，缺 cap 就留空 */
      p.imgs = (Array.isArray(p.imgs) ? p.imgs : []).filter(function (im) {
        return im && typeof im.src === 'string' && im.src;
      }).map(function (im) { return { src: im.src, cap: im.cap || '' }; });
      /* 列表缩略图：约定配图同目录下的 thumb.jpg（180px）。
         列表里只占 42px，不该去下 900px 的原图。
         非 assets/ 开头（外部 URL）的配图不适用这个约定，退回用原图。 */
      p.thumb = '';
      if (p.imgs.length) {
        p.thumb = /^assets\//.test(p.imgs[0].src)
          ? p.imgs[0].src.replace(/[^\/]+$/, 'thumb.jpg')
          : p.imgs[0].src;
      }
      /* 实用信息：缺省为空串，详情卡只渲染有值的行 */
      ['addr', 'hours', 'hoursFrom', 'phone', 'priceNote', 'walk', 'coordNote',
        'bakeTimes', 'srcTitle', 'srcUrl', 'srcNote'].forEach(function (k) { p[k] = p[k] || ''; });
      p.osmUrl = p.osmUrl || ('https://www.openstreetmap.org/?mlat=' + p.lat +
        '&mlon=' + p.lng + '#map=17/' + p.lat + '/' + p.lng);
    });
    if (bad.length) console.warn('[' + BRAND + '] 以下地点缺少有效经纬度，已置为 0,0：', bad.join('、'));

    /* 4 · 排序与编号：order 缺省时保持原数组顺序 */
    DAYS.forEach(function (d, di) {
      var list = PLACES.filter(function (p) { return p.day === di; });
      list.sort(function (a, b) {
        var ao = typeof a.order === 'number' ? a.order : 1e9;
        var bo = typeof b.order === 'number' ? b.order : 1e9;
        return ao - bo;
      });
      list.forEach(function (p, i) { p.order = i; p.badge = (di + 1) + '-' + (i + 1); });
    });

    /* 5 · 城市视野：没给中心点就用地点的包围盒中心 */
    if (!CITY.center) {
      var xs = PLACES.map(function (p) { return p.lng; });
      var ys = PLACES.map(function (p) { return p.lat; });
      CITY.center = [
        (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2,
        (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2
      ];
    }
    if (typeof CITY.zoom !== 'number') CITY.zoom = 11.6;
    if (typeof CITY.pitch !== 'number') CITY.pitch = 50;
    if (typeof CITY.bearing !== 'number') CITY.bearing = -12;

    /* 6 · 行程摘要：没给就现算，避免统计数字与真实数据不一致 */
    var totalMin = PLACES.reduce(function (s, p) { return s + p.duration; }, 0);
    var foodCount = PLACES.reduce(function (s, p) { return s + p.eat.length; }, 0);
    var trip = D.TRIP = D.TRIP || {};
    trip.title = trip.title || (CITY.name + ' ' + DAYS.length + ' 日行程');
    trip.placeCount = PLACES.length;
    trip.dayCount = DAYS.length;
    trip.foodCount = foodCount;
    trip.stayHours = Math.round(totalMin / 6) / 10;
  }
  normalize();

  /* ---------------- 视图切换 ---------------- */
  var views = { home: 'view-home', map: 'view-map' };
  function showView(name) {
    if (!views[name]) name = 'home';
    Object.keys(views).forEach(function (k) {
      var el = document.getElementById(views[k]);
      if (el) el.classList.toggle('is-active', k === name);
    });
    if (location.hash.slice(1) !== name) {
      try { history.replaceState(null, '', '#' + name); } catch (e) { location.hash = name; }
    }
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('is-active', btns[i].dataset.view === name);
    if (name === 'map') {
      if (!map) { initMap(); }
      else { setTimeout(function () { map.resize(); }, 60); }
      applyResponsive();
    }
    if (name === 'home') replayHome();
  }
  document.getElementById('nav').addEventListener('click', function (e) {
    var b = e.target.closest('.nav-btn');
    if (b) showView(b.dataset.view);
  });

  /* ---------------- 页面文案（全部由数据驱动，不再写死城市名） ---------------- */
  function renderChrome() {
    var c = CITY, t = D.TRIP;
    var set = function (id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    document.title = t.title + ' · ' + BRAND;
    /* 只有一天时，「逐天看」「点一天」这些说法会读着别扭——文案跟着天数走 */
    var oneDay = DAYS.length === 1;
    set('brandMark', BRAND);
    /* 「ONE CITY」在跨城行程里会直接说谎，所以城市数不进文案，只报地点数与天数 */
    set('brandSub', c.en + ' · ' + PLACES.length + ' PLACES' +
      (oneDay ? '' : ', ' + DAYS.length + ' DAYS'));
    set('hhMark', c.en + ' · ' + (oneDay ? '1 日行程' : DAYS.length + ' 日行程'));
    /* 副标题不再写死「澳门半岛 / 路环」——城市和片区都由数据决定，文案只描述结构 */
    set('hhSub', oneDay
      ? '一天走完。地点按营业时间与步行距离串成一条线，点开地图工作台可以看路线、看周边吃什么。'
      : DAYS.length + ' 天按地理片区切分，每天的地点尽量集中，按步行距离串成一条线。' +
        '点开地图工作台，可以逐天看路线、看周边吃什么。');
    set('homeSec', oneDay ? '这一天怎么走' : '这 ' + DAYS.length + ' 天怎么走');
    set('tripTitle', t.title);
    set('panelTitle', t.title);
    set('mapBadge', c.name + ' · ' + PLACES.length + ' PLACES');
    var sub = document.getElementById('panelSub');
    if (sub) sub.innerHTML = '<b>' + PLACES.length + '</b> 处地点 · ' +
      (oneDay ? '按时间顺序串成一条线' : '点一天，看当天的路线');
  }

  /* ---------------- 行程总览 ---------------- */
  function renderOverview() {
    var t = D.TRIP;
    var stats = [
      { icon: 'calendar', v: t.dayCount, k: '天行程' },
      { icon: 'pin', v: t.placeCount, k: '处地点' },
      { icon: 'eat', v: t.foodCount, k: '道推荐吃食' },
      { icon: 'clock', v: t.stayHours, k: '小时建议停留' }
    ].filter(function (s) { return s.v != null && s.v !== 0; });

    var box = document.getElementById('homeStats');
    if (box) {
      box.innerHTML = stats.map(function (s) {
        return '<div class="hs-card">' + svg(s.icon, 'hs-icon') +
          '<div class="hs-num">' + esc(s.v) + '</div>' +
          '<div class="hs-label">' + esc(s.k) + '</div></div>';
      }).join('');
    }
  }

  function renderHomeDays() {
    var el = document.getElementById('homeDays');
    if (!el) return;
    el.innerHTML = DAYS.map(function (d) {
      var items = byDay(d.index);
      var total = items.reduce(function (s, p) { return s + p.duration; }, 0);
      return '<button class="hd-card" data-day="' + d.index + '" style="--c:' + esc(d.color) + '">' +
        '<span class="hd-top"><span class="hd-day">' + esc(d.name) + '</span>' +
        '<span class="hd-count">' + items.length + ' 处</span></span>' +
        (d.theme ? '<span class="hd-theme">' + esc(d.theme) + '</span>' : '') +
        (d.span ? '<span class="hd-span">' + esc(d.span) + '</span>' : '') +
        '<span class="hd-route">' + items.map(function (p) { return esc(p.name); }).join(' → ') + '</span>' +
        (total ? '<span class="hd-time">建议停留合计约 ' + Math.round(total / 6) / 10 + ' 小时</span>' : '') +
        '</button>';
    }).join('');
  }
  /* 重播首页入场动效：先摘掉 class、强制一次 reflow、再加回去，动画才会重新跑 */
  function replayHome() {
    var w = document.querySelector('.home-wrap');
    if (!w) return;
    w.classList.remove('is-replaying');
    void w.offsetWidth;
    w.classList.add('is-replaying');
  }
  document.getElementById('replayHome').addEventListener('click', replayHome);
  document.getElementById('goMap').addEventListener('click', function () { showView('map'); });
  document.getElementById('homeDays').addEventListener('click', function (e) {
    var c = e.target.closest('.hd-card');
    if (!c) return;
    state.day = c.dataset.day;
    showView('map');
    setTimeout(function () {
      renderAll();
      renderMarkers();
      applyRouteVisibility();
      fitAll();
    }, 120);
  });

  /* ---------------- 地图 ---------------- */
  var map = null, markers = [], markerByPlace = {}, dashTimer = null, dashIdx = 0;

  /* 虚线「流动」动画：dash / gap 保持不变，只平移相位（4 元素数组的第 3 位）。
     不要用 Mapbox 官方示例那套 [0,4,3] 序列 —— 它会让虚线在某些相位几乎消失。 */
  var DASH_ON = 2, DASH_OFF = 1.6, DASH_STEPS = 8;
  var DASH_SEQ = (function () {
    var a = [];
    for (var i = 0; i < DASH_STEPS; i++) a.push([DASH_ON, DASH_OFF, (i * (DASH_ON + DASH_OFF)) / DASH_STEPS, 0]);
    return a;
  })();

  function initMap() {
    if (typeof maplibregl === 'undefined') { showFallback('地图库未能加载'); return; }
    var el = document.getElementById('map');
    if (!el) return;

    /* WebGL 不可用（老机器 / 关闭了硬件加速 / 无头环境）时，
       MapLibre 构造器会直接抛错。兜住它，否则整块地图区只会是一片空白。 */
    try {
      map = new maplibregl.Map({
        container: 'map',
        style: MAP_STYLE,
        center: CITY.center,
        zoom: CITY.zoom,
        pitch: CITY.pitch,
        bearing: CITY.bearing,
        antialias: true,
        attributionControl: { compact: true }
      });
    } catch (err) {
      map = null;
      showFallback('浏览器未能创建 WebGL 上下文，地图无法渲染');
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-right');

    /* 用 style.load 而不是 load：load 依赖首帧渲染完成，
       后台标签页里 requestAnimationFrame 被节流会永不触发。 */
    map.on('style.load', function () {
      if (state.mapReady) return;
      state.mapReady = true;
      addRoutes();
      renderMarkers();
      renderLegend();
      animateDash();
      setTimeout(fitAll, 260);
    });

    /* 缩放后重新计算标记避让；低缩放级别把标记缩小，减少拥挤 */
    map.on('zoomend', spreadMarkers);
    /* 平移/旋转结束后也重新排一次——zoomend 只在缩放改变时触发，
       纯平移 + fitAll 缩放不变的情况（如切天后再 fit）不经过 zoomend，
       标记就会停在过期的投影位置上。moveend 在 zoom 与 pan 后都会触发，
       同一帧重复执行也是无副作用的（relaxation 收敛后 moved=false 直接跳出）。 */
    map.on('moveend', spreadMarkers);
    map.on('zoom', function () {
      var c = map.getContainer();
      if (c) c.classList.toggle('zoom-far', map.getZoom() < 12.4);
    });

    /* 点地图空白处 = 取消选中，收起详情卡。
       标记是独立的 DOM 元素、盖在画布之上，点它们不会触发这个 canvas 事件。 */
    map.on('click', function () { closeDetail(); });

    map.on('error', function (e) {
      var msg = String((e && e.error && e.error.message) || '');
      if (/style|Failed to fetch|NetworkError/i.test(msg)) showFallback('底图样式加载失败');
    });

    setTimeout(function () {
      if (!state.mapReady) showFallback('底图加载超时');
    }, 15000);

    window.__twMap = map;
  }

  function showFallback(msg) {
    var f = document.getElementById('mapFallback');
    if (!f) return;
    f.hidden = false;
    f.querySelector('b').textContent = msg;
  }

  function routeCoords(d) { return byDay(d).map(function (p) { return [p.lng, p.lat]; }); }

  function addRoutes() {
    DAYS.forEach(function (d) {
      var id = 'route-' + d.index;
      if (map.getSource(id)) return;
      /* 只有 1 个地点的日期画不出线：GeoJSON 的 LineString 至少要 2 个坐标。
         实测（2026-09-27，MapLibre GL JS 5.24）：塞 1 个坐标不会抛错，图层照样建起来，
         只是没有任何可见输出——即"不报错的静默失败"，比抛错更难排查。
         所以不足 2 个点就不建这一天的路线图层：标记照常显示，只是没有虚线。 */
      if (routeCoords(d.index).length < 2) return;
      map.addSource(id, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords(d.index) } }
      });
      map.addLayer({
        id: id + '-casing',
        type: 'line',
        source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.9 }
      });
      map.addLayer({
        id: id + '-line',
        type: 'line',
        source: id,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': d.color, 'line-width': 4.5, 'line-dasharray': [DASH_ON, DASH_OFF] }
      });
    });
    applyRouteVisibility();
  }

  function visibleDays() {
    return state.day === 'all' ? DAYS.map(function (d) { return d.index; }) : [Number(state.day)];
  }

  function applyRouteVisibility() {
    if (!map || !state.mapReady) return;
    DAYS.forEach(function (d) {
      var on = visibleDays().indexOf(d.index) >= 0;
      ['-casing', '-line'].forEach(function (sfx) {
        var id = 'route-' + d.index + sfx;
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      });
    });
  }

  function renderMarkers() {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    markerByPlace = {};
    if (!map) return;

    PLACES.forEach(function (p) {
      if (visibleDays().indexOf(p.day) < 0) return;
      var el = document.createElement('button');
      el.type = 'button';
      /* 地图徽章改成横向椭圆后宽度随编号长度走，不再需要 is-long 缩字号
         （列表里的 .pr-badge 仍是固定宽度，那边的 is-long 照旧保留） */
      el.className = 'place-badge' + (state.activeId === p.id ? ' is-active' : '');
      el.style.setProperty('--day-color', dayColor(p.day));
      el.textContent = p.badge;
      el.title = p.name;
      el.setAttribute('aria-label', p.badge + ' ' + p.name);
      el.addEventListener('click', function (ev) { ev.stopPropagation(); selectPlace(p.id, true); });
      var m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat]).addTo(map);
      markers.push(m);
      markerByPlace[p.id] = m;
    });
    spreadMarkers();
  }

  /* 城市尺度下多个地点会挤在一起（步行可达的两处相距可能只有 300m，
     编号徽章会完全重叠）。用一次松弛迭代把重叠的标记在屏幕上推开，
     位移限制在 ±MAXOFF，保证标记仍然贴着真实位置。
     MIN 跟着徽章实际宽度走——徽章改成横向椭圆后约 40–46px 宽，
     所以最小间距也相应提到 44px；MAXOFF 28px。 */
  var SPREAD_MIN = 44, SPREAD_MAXOFF = 28;
  function spreadMarkers() {
    if (!map || !state.mapReady) return;
    var list = PLACES.filter(function (p) {
      return visibleDays().indexOf(p.day) >= 0 && markerByPlace[p.id];
    });
    if (list.length < 2) return;

    var pts = list.map(function (p) {
      var pt = map.project([p.lng, p.lat]);
      return { id: p.id, x: pt.x, y: pt.y, dx: 0, dy: 0 };
    });

    for (var it = 0; it < 16; it++) {
      var moved = false;
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var a = pts[i], b = pts[j];
          var ax = a.x + a.dx, ay = a.y + a.dy;
          var bx = b.x + b.dx, by = b.y + b.dy;
          var dx = bx - ax, dy = by - ay;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d === 0) { dx = 0.7; dy = 0.7; d = 1; }
          if (d < SPREAD_MIN) {
            var push = (SPREAD_MIN - d) / 2, ux = dx / d, uy = dy / d;
            a.dx -= ux * push; a.dy -= uy * push;
            b.dx += ux * push; b.dy += uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    pts.forEach(function (o) {
      var m = markerByPlace[o.id];
      if (!m) return;
      var dx = Math.max(-SPREAD_MAXOFF, Math.min(SPREAD_MAXOFF, o.dx));
      var dy = Math.max(-SPREAD_MAXOFF, Math.min(SPREAD_MAXOFF, o.dy));
      m.setOffset([dx, dy]);
    });
  }

  function fitAll() {
    if (!map) return;
    var pts = (state.day === 'all' ? PLACES : byDay(Number(state.day)));
    if (!pts.length) return;
    // 手机上底部有行程面板，留出更大的下边距，避免标记被遮住。
    // 竖屏按「收起态」留（那是默认状态）；横屏面板在左侧，上下对称即可。
    var pad = isFlat()
      ? { top: 50, bottom: 50, left: 50, right: 50 }
      : isNarrow()
        ? { top: 70, bottom: 132, left: 30, right: 30 }
        : { top: 90, bottom: 90, left: 90, right: 90 };
    /* 只有 1 个地点时包围盒退化成「一个点」，宽高都是 0。
       实测（2026-09-27，MapLibre GL JS 5.24）：这种情况 fitBounds 不报错，
       内部缩放算出 Infinity、再被上面的 maxZoom:14 夹住，最终落到 zoom 14、中心就是那个点
       ——和下面这段显式写法结果完全一致。
       之所以仍然显式处理：这个正确结果依赖 maxZoom 恰好设了 14，
       以及 MapLibre 肯把 Infinity 一路算下去。写清楚比依赖内部行为稳。 */
    if (pts.length === 1) {
      map.easeTo({
        center: [pts[0].lng, pts[0].lat],
        zoom: 14,
        pitch: CITY.pitch,
        bearing: CITY.bearing,
        duration: state.reduceMotion ? 0 : 900
      });
      return;
    }
    var b = new maplibregl.LngLatBounds();
    pts.forEach(function (p) { b.extend([p.lng, p.lat]); });
    map.fitBounds(b, {
      padding: pad,
      duration: state.reduceMotion ? 0 : 900,
      pitch: CITY.pitch,
      bearing: CITY.bearing,
      maxZoom: 14
    });
  }

  function flyToPlace(p) {
    if (!map) return;
    map.flyTo({
      center: [p.lng, p.lat],
      zoom: 16.2,
      pitch: 55,
      bearing: map.getBearing(),
      duration: state.reduceMotion ? 0 : 1200,
      essential: true
    });
  }

  function animateDash() {
    if (!map) return;
    if (!state.reduceMotion && state.mapReady) {
      dashIdx = (dashIdx + 1) % DASH_SEQ.length;
      var arr = DASH_SEQ[dashIdx];
      DAYS.forEach(function (d) {
        var id = 'route-' + d.index + '-line';
        if (map.getLayer(id)) {
          try { map.setPaintProperty(id, 'line-dasharray', arr); } catch (e) {}
        }
      });
    }
    dashTimer = setTimeout(animateDash, 90);
  }

  function renderLegend() {
    var lg = document.getElementById('mapLegend');
    lg.innerHTML = DAYS.map(function (d) {
      return '<span class="lg" style="color:' + esc(d.color) + '"><i></i><span style="color:#1A1A1A">' +
        esc(d.name) + (d.theme ? ' · ' + esc(d.theme) : '') + '</span></span>';
    }).join('');
  }

  /* ---------------- 行程面板 ---------------- */
  /* 筛选栏按大类走，顺序固定（CAT_ORDER），只保留实际出现过的大类 */
  var ALL_TYPES = ['全部'].concat(CAT_ORDER.filter(function (c) {
    return PLACES.some(function (p) { return p.cat === c; });
  })).concat(PLACES.map(function (p) { return p.cat; })
    .filter(function (v) { return CAT_ORDER.indexOf(v) < 0; })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }));

  function renderDayTabs() {
    var wrap = document.getElementById('dayTabs');
    /* 只有一天时没有「切天」这回事，「总览」与「第 1 天」内容完全一样，整行不显示 */
    if (DAYS.length < 2) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    var tabs = [{ v: 'all', label: '总览', color: '#1A1A1A' }].concat(DAYS.map(function (d) {
      return { v: String(d.index), label: d.name, color: d.color };
    }));
    wrap.innerHTML = tabs.map(function (t) {
      return '<button class="daytab' + (String(state.day) === t.v ? ' is-active' : '') +
        '" data-day="' + t.v + '" style="--dc:' + esc(t.color) + '">' + esc(t.label) + '</button>';
    }).join('');
  }

  function renderRouteSummary() {
    var el = document.getElementById('routeSummary');
    var label = 'YOUR ' + CITY.en + ' JOURNEY';
    if (state.day === 'all') {
      el.innerHTML = '<span class="rs-label">' + esc(label) + '</span>' +
        DAYS.map(function (d) {
          var names = byDay(d.index).map(function (p) { return esc(p.name); }).join('<span class="rs-arrow">→</span>');
          return '<div style="color:' + esc(d.color) + ';font-weight:600">' + esc(d.name) +
            (d.theme ? ' · ' + esc(d.theme) : '') +
            '</div>' +
            (d.span ? '<div style="color:#6B6B6B;font-size:11.5px">' + esc(d.span) + '</div>' : '') +
            '<div class="rs-chain" style="color:#1A1A1A;font-size:12px;margin-bottom:5px">' + names + '</div>';
        }).join('');
    } else {
      var d = DAYS[Number(state.day)];
      var names = byDay(d.index).map(function (p) { return esc(p.name); }).join('<span class="rs-arrow">→</span>');
      var total = byDay(d.index).reduce(function (s, p) { return s + p.duration; }, 0);
      el.innerHTML = '<span class="rs-label">' + esc(d.name) + (d.theme ? ' · ' + esc(d.theme) : '') + '</span>' +
        '<div class="rs-chain">' + names + '</div>' +
        '<div style="color:#6B6B6B;font-size:11.5px;margin-top:5px">' +
        (d.span ? esc(d.span) + '<br>' : '') +
        byDay(d.index).length + ' 处地点' +
        (total ? ' · 建议停留合计约 ' + Math.round(total / 6) / 10 + ' 小时' : '') + '</div>';
    }
  }

  function renderTypeChips() {
    document.getElementById('typeChips').innerHTML = ALL_TYPES.map(function (t) {
      return '<button class="chip' + (state.type === t ? ' is-active' : '') + '" data-type="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
  }

  function renderList() {
    var list = document.getElementById('placeList');
    var items = PLACES.filter(function (p) {
      return visibleDays().indexOf(p.day) >= 0 && (state.type === '全部' || p.cat === state.type);
    }).sort(function (a, b) { return a.day - b.day || a.order - b.order; });

    if (!items.length) {
      list.innerHTML = '<li class="dc-empty" style="padding:14px 10px">该筛选下没有地点。</li>';
      return;
    }
    list.innerHTML = items.map(function (p) {
      return '<li class="place-row' + (state.activeId === p.id ? ' is-active' : '') + '" data-id="' + esc(p.id) + '">' +
        (p.thumb
          ? '<img class="pr-thumb" src="' + esc(p.thumb) + '" alt="" decoding="async">'
          : '') +
        '<span class="pr-badge' + (p.badge.length > 3 ? ' is-long' : '') +
        '" style="border-color:' + esc(dayColor(p.day)) + '">' + esc(p.badge) + '</span>' +
        '<span class="pr-main"><span class="pr-name">' + esc(p.name) +
        '<span class="pr-type">' + esc(p.type) + '</span></span>' +
        '<span class="pr-meta">' +
        (p.clock ? '<span class="pr-clock">' + esc(p.clock) + '</span>' : '') +
        esc(DAYS[p.day].name) +
        (p.timeSlot ? ' · ' + esc(p.timeSlot) : '') +
        (p.duration ? ' · 约 ' + p.duration + ' 分钟' : '') + '</span>' +
        (p.hours ? '<span class="pr-hours">营业 ' + esc(p.hours) + '</span>' : '') +
        (p.mood ? '<span class="pr-mood">' + esc(p.mood) + '</span>' : '') + '</span></li>';
    }).join('');
  }

  document.getElementById('dayTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.daytab');
    if (!b) return;
    state.day = b.dataset.day;
    sortNote('');
    renderAll();
    renderMarkers();
    applyRouteVisibility();
    fitAll();
  });
  document.getElementById('typeChips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    state.type = b.dataset.type;
    renderTypeChips();
    renderList();
  });
  document.getElementById('placeList').addEventListener('click', function (e) {
    var row = e.target.closest('.place-row');
    if (row) selectPlace(row.dataset.id, true);
  });
  document.getElementById('resetView').addEventListener('click', function () { fitAll(); });

  /* 关闭详情卡的三条路：① 右上角 × 按钮 ② Esc 键 ③ 点地图空白处 */
  document.getElementById('detailClose').addEventListener('click', function () { closeDetail(); });
  document.getElementById('detailCard').addEventListener('click', function (e) {
    var img = e.target.closest('.dc-shot img');
    if (img) openShot(img.dataset.src || img.src, img.dataset.cap || '');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (closeShot()) return;              /* 大图开着就先关大图 */
    closeDetail();
  });

  document.getElementById('toggleMotion').addEventListener('click', function () {
    state.reduceMotion = !state.reduceMotion;
    this.textContent = '减少动效：' + (state.reduceMotion ? '开' : '关');
  });

  function renderAll() { renderDayTabs(); renderRouteSummary(); renderTypeChips(); renderList(); }

  /* ---------------- 路线自动排序 ----------------
     实测结论（2026-09-27，本数据集）：手工顺序已接近最优——
     锁定起点时总距离仅能降 3.0%（23.4 km → 22.7 km），
     放开起点也只有 8.2%。所以这个功能的定位不是「替你重排」，
     而是「给你一个更短的备选，并告诉你省了多少」。
     正因如此：结果必须先预览后应用，且必须可撤销。 */
  var R_EARTH = 6371000;
  function rad(d) { return d * Math.PI / 180; }
  function gap(a, b) {
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R_EARTH * Math.asin(Math.sqrt(s));
  }
  function pathLen(list) {
    var t = 0;
    for (var i = 1; i < list.length; i++) t += gap(list[i - 1], list[i]);
    return t;
  }

  /* 最近邻：从第一个点出发，每次挑最近的未访问点 */
  function nearestNeighbor(list) {
    if (list.length < 3) return list.slice();
    var rest = list.slice(1), out = [list[0]];
    while (rest.length) {
      var last = out[out.length - 1], bi = 0, bd = Infinity;
      for (var i = 0; i < rest.length; i++) {
        var d = gap(last, rest[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      out.push(rest.splice(bi, 1)[0]);
    }
    return out;
  }

  /* 2-opt：反转子段消除交叉。idx0 之前的部分视为锚点，不参与反转。 */
  function twoOpt(list, from) {
    var n = list.length;
    if (n < 4) return list.slice();
    var lo = Math.max(1, from || 1);
    var best = list.slice(), improved = true, guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      for (var i = lo; i < n - 1; i++) {
        for (var k = i + 1; k < n; k++) {
          var a = best[i - 1], b = best[i], c = best[k], d = best[k + 1];
          var before = gap(a, b) + (d ? gap(c, d) : 0);
          var after = gap(a, c) + (d ? gap(b, d) : 0);
          if (after < before - 1e-9) {
            best = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
            improved = true;
          }
        }
      }
    }
    return best;
  }

  /* order 变了，编号徽章要跟着重算 */
  function renumber() {
    DAYS.forEach(function (d) {
      byDay(d.index).forEach(function (p, i) { p.badge = (d.index + 1) + '-' + (i + 1); });
    });
  }

  function refreshRouteGeometry() {
    if (!map || !state.mapReady) return;
    DAYS.forEach(function (d) {
      var src = map.getSource('route-' + d.index);
      if (src) {
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords(d.index) } });
      }
    });
  }

  var sortSnapshot = null;

  function sortNote(html) {
    var el = document.getElementById('sortNote');
    if (!el) return;
    el.innerHTML = html;
    el.hidden = !html;
    var u = document.getElementById('undoSort');
    if (u) u.hidden = !sortSnapshot;
  }

  function autoSort() {
    var days = visibleDays();
    sortSnapshot = PLACES.map(function (p) { return { id: p.id, order: p.order, badge: p.badge }; });

    var anchor = state.anchorStart;
    var before = 0, after = 0, changed = 0, evaluated = 0;
    days.forEach(function (di) {
      var list = byDay(di);
      /* 少于 3 个点没有可优化的折返：2 个点的路径长度与先后顺序无关。
         这类日期直接跳过，但要在下面的提示里说清楚「跳过了」，
         不能笼统报一句「已经是最短的」——那是没算过才得出的结论。 */
      if (list.length < 3) return;
      evaluated++;
      before += pathLen(list);

      var sorted;
      if (anchor) {
        // 起点固定：第一站不动
        sorted = twoOpt(nearestNeighbor(list), 1);
      } else {
        // 放开起点：每个点都当一次起点试，取最短
        sorted = twoOpt(nearestNeighbor(list), 1);
        var bd = pathLen(sorted);
        for (var s = 1; s < list.length; s++) {
          var rot = list.slice(s).concat(list.slice(0, s));
          var cand = twoOpt(nearestNeighbor(rot), 1);
          var cd = pathLen(cand);
          if (cd < bd) { bd = cd; sorted = cand; }
        }
      }
      after += pathLen(sorted);

      var same = list.every(function (p, i) { return p === sorted[i]; });
      if (!same) changed++;
      sorted.forEach(function (p, i) { p.order = i; });
    });

    renumber();
    refreshRouteGeometry();
    renderAll();
    renderMarkers();
    applyRouteVisibility();
    renderHomeDays();

    var km = function (m) { return (m / 1000).toFixed(1); };
    /* 只有一天时说「全部 1 天」很别扭，直接用那天的名字 */
    var scope = days.length === DAYS.length && DAYS.length > 1
      ? '全部 ' + DAYS.length + ' 天'
      : DAYS[days[0]].name;
    if (!evaluated) {
      sortSnapshot = null;
      sortNote('<b>' + scope + '</b>：可排序的地点少于 3 处，没有可优化的折返。');
    } else if (!changed || before - after < 1) {
      sortSnapshot = null;
      sortNote('<b>' + scope + '</b>：当前顺序已经是最短的，没有可优化的折返。');
    } else {
      var pct = ((before - after) / before) * 100;
      sortNote('<b>' + scope + '</b>：总距离 ' + km(before) + ' km → <b>' + km(after) + ' km</b>' +
        '<span class="rt-good">（省 ' + km(before - after) + ' km，-' + pct.toFixed(1) + '%）</span>' +
        '<br><span class="rt-warn">只优化距离，不考虑「把某处留到夜里」这类编排意图。</span>');
    }
  }

  function undoSorted() {
    if (!sortSnapshot) return;
    sortSnapshot.forEach(function (s) {
      var p = placeById(s.id);
      if (p) { p.order = s.order; p.badge = s.badge; }
    });
    sortSnapshot = null;
    refreshRouteGeometry();
    renderAll();
    renderMarkers();
    applyRouteVisibility();
    renderHomeDays();
    sortNote('');
    document.getElementById('undoSort').hidden = true;
  }

  function renderAnchorBtn() {
    var b = document.getElementById('toggleAnchor');
    if (b) b.textContent = '起点锁定：' + (state.anchorStart ? '开' : '关');
  }

  document.getElementById('autoSort').addEventListener('click', autoSort);
  document.getElementById('undoSort').addEventListener('click', undoSorted);
  document.getElementById('toggleAnchor').addEventListener('click', function () {
    state.anchorStart = !state.anchorStart;
    renderAnchorBtn();
  });

  /* ---------------- 响应式 ---------------- */
  function applyResponsive() {
    var panel = document.getElementById('panel');
    var detail = document.getElementById('detail');
    syncPanelPeek();

    if (!isNarrow()) {
      /* 桌面：面板与详情栏都常驻，没选中地点时详情栏显示空态提示 */
      panel.classList.remove('is-collapsed');
      detail.hidden = false;
      return;
    }
    if (isFlat()) {
      /* 横屏：面板常驻在左侧，详情按需从右侧浮出 */
      panel.classList.remove('is-collapsed');
      detail.hidden = !state.activeId;
      return;
    }
    /* 竖屏手机：面板默认收起成一条（用户手动动过就不再自动收），详情是浮层 */
    if (!panel.dataset.touched) panel.classList.add('is-collapsed');
    if (!state.activeId) detail.hidden = true;
  }

  /* 竖屏手机上点面板标题栏可收起 / 展开行程面板。
     横屏面板是常驻的一栏，折叠没意义，直接不响应。 */
  document.querySelector('.panel-head').addEventListener('click', function () {
    if (!isNarrow() || isFlat()) return;
    var panel = document.getElementById('panel');
    panel.dataset.touched = '1';
    panel.classList.toggle('is-collapsed');
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    /* 手机浏览器地址栏收起/展开会连着触发 resize，节流一下，
       顺便等布局稳定后再量标题栏高度。 */
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!isNarrow()) document.getElementById('panel').dataset.touched = '';
      applyResponsive();
      if (map) map.resize();
    }, 120);
  });

  /* ---------------- 地点详情 ---------------- */
  function selectPlace(id, fly) {
    var p = placeById(id);
    if (!p) return;
    state.activeId = id;
    renderList();
    renderMarkers();
    renderDetail(p);
    if (fly) flyToPlace(p);
    var d = document.getElementById('detail');
    if (d && isNarrow()) d.hidden = false;
  }

  /* 实用信息块：地址 / 营业时间 / 电话 / 价位 / 怎么去。
     只渲染有值的行——外部行程数据不一定带这些字段。 */
  function infoBlock(p) {
    /* 「营业时间」后面挂一个小字来源标注，避免用户以为这些时间是官方渠道核实的 */
    var hours = p.hours ? esc(p.hours) +
      (p.hoursFrom && p.hoursFrom !== '—'
        ? '<span class="dci-src">来源：' + esc(p.hoursFrom) + '</span>' : '') : '';
    var rows = [
      ['计划时间', p.clock ? esc(p.clock) + '<span class="dci-src">按营业时间排定</span>' : ''],
      ['地址', esc(p.addr)],
      ['营业时间', hours],
      ['出炉时间', esc(p.bakeTimes)],
      ['电话', esc(p.phone)],
      ['价位', esc(p.priceNote)],
      ['怎么去', esc(p.walk)],
      ['坐标精度', esc(p.coordNote)]
    ].filter(function (r) { return r[1]; });
    if (!rows.length) return '';
    return '<div class="dc-info">' + rows.map(function (r) {
      return '<div class="dci-row"><span class="dci-k">' + esc(r[0]) + '</span>' +
        '<span class="dci-v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  /* 配图画廊：来自对应小红书笔记的实拍图（1–2 张）。
     点开看大图——详情栏窄，150px 高的裁切图只能看个大概。 */
  function gallery(p) {
    if (!p.imgs.length) return '';
    return '<div class="dc-gallery' + (p.imgs.length > 1 ? ' is-many' : '') + '">' +
      p.imgs.map(function (im, i) {
        return '<figure class="dc-shot">' +
          '<img src="' + esc(im.src) + '" alt="' + esc(p.name + ' 实拍图 ' + (i + 1)) + '"' +
          ' data-src="' + esc(im.src) + '" data-cap="' + esc(im.cap) + '"' +
          ' loading="lazy" decoding="async">' +
          (im.cap ? '<figcaption>' + esc(im.cap) + '</figcaption>' : '') +
          '</figure>';
      }).join('') + '</div>';
  }

  /* 大图查看：点击详情卡里的实拍图，铺满屏幕看原图 */
  var shotBox = null;
  function openShot(src, cap) {
    if (!shotBox) {
      shotBox = document.createElement('div');
      shotBox.className = 'shotbox';
      shotBox.innerHTML = '<button class="shotbox-close" aria-label="关闭大图">×</button>' +
        '<figure><img alt=""><figcaption></figcaption></figure>';
      shotBox.addEventListener('click', function (e) {
        if (e.target === shotBox || e.target.classList.contains('shotbox-close')) closeShot();
      });
      document.body.appendChild(shotBox);
    }
    shotBox.querySelector('img').src = src;
    var fc = shotBox.querySelector('figcaption');
    fc.textContent = cap || '';
    fc.hidden = !cap;
    shotBox.classList.add('is-open');
    document.body.classList.add('no-scroll');
  }
  function closeShot() {
    if (!shotBox || !shotBox.classList.contains('is-open')) return false;
    shotBox.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    return true;
  }

  /* 关掉右侧详情卡。
     桌面端这一栏是常驻的，「关闭」= 回到未选中的空态提示（而不是把整栏留白）；
     手机上详情是浮层（竖屏在底部、横屏在右侧），直接整块收起。 */
  function closeDetail() {
    var wasOpen = !!state.activeId;
    state.activeId = null;
    document.getElementById('detailEmpty').hidden = false;
    document.getElementById('detailCard').hidden = true;
    if (isNarrow()) document.getElementById('detail').hidden = true;
    document.getElementById('detail').classList.add('is-empty');
    if (wasOpen) { renderList(); renderMarkers(); }
    return wasOpen;
  }

  function renderDetail(p) {
    document.getElementById('detailEmpty').hidden = true;
    document.getElementById('detail').classList.remove('is-empty');
    var card = document.getElementById('detailCard');
    card.hidden = false;

    function block(title, icon, items, emptyText) {
      var inner;
      if (items && items.length) {
        inner = items.map(function (it) {
          return '<div class="dc-item"><div class="dc-item-name">' + esc(it.name) + '</div>' +
            (it.addr ? '<div class="dc-item-addr">' + esc(it.addr) + '</div>' : '') +
            (it.note ? '<div class="dc-item-note">' + esc(it.note) + '</div>' : '') + '</div>';
        }).join('');
      } else {
        inner = '<div class="dc-empty">' + esc(emptyText || '暂无数据') + '</div>';
      }
      return '<div class="dc-block"><h3>' + svg(icon) + esc(title) + '</h3>' + inner + '</div>';
    }

    card.innerHTML =
      '<div class="dc-head" style="background:' + esc(dayColor(p.day)) + '">' +
        '<span class="de-mark">' + esc(CITY.en) + ' FIELD GUIDE</span>' +
        '<div class="dc-kicker">' + esc(p.type) + (p.mood ? ' · ' + esc(p.mood) : '') + '</div>' +
        '<div class="dc-name">' + esc(p.name) + '</div>' +
        '<div class="dc-en">' + (p.en ? esc(p.en) + ' · ' : '') + esc(p.badge) + '</div>' +
        '<div class="dc-pills">' +
        (p.clock ? '<span class="dc-pill dc-pill-time">' + esc(p.clock) + '</span>' : '') +
        '<span class="dc-pill">' + esc(DAYS[p.day].name) + '</span>' +
        (p.timeSlot ? '<span class="dc-pill">' + esc(p.timeSlot) + '</span>' : '') +
        (p.duration ? '<span class="dc-pill">建议停留约 ' + p.duration + ' 分钟</span>' : '') + '</div>' +
      '</div>' +
      '<div class="dc-body">' +
        gallery(p) +
        (p.desc ? '<p class="dc-desc">' + esc(p.desc) + '</p>' : '') +
        infoBlock(p) +
        block('先去吃什么', 'eat', p.eat, '这一带未检索到登记的餐饮 POI') +
        block('去哪里看风景', 'view', p.view, '未检索到登记的观景点') +
        '<div class="dc-src">' +
        (p.srcUrl
          ? '<a href="' + esc(p.srcUrl) + '" target="_blank" rel="noopener">' +
            esc(p.srcTitle || '查看资料来源') + ' ↗</a>'
          : '<a href="' + esc(p.osmUrl) + '" target="_blank" rel="noopener">查看资料来源 ↗</a>') +
        '<div class="dc-src-note">' +
          '地点坐标：' + esc(p.coordNote ? 'Photon / OpenStreetMap，' + p.coordNote : 'OpenStreetMap。') + '<br>' +
          '内容来源：' + esc(p.srcNote || '用户提供的小红书笔记（正文与配图）。采集于 2026-09-27。') + '<br>' +
          (p.imgs.length
            ? '配图：' + p.imgs.length + ' 张，取自对应笔记的实拍照片（点击可看大图）。<br>'
            : '') +
          '计划时间按各地点营业时间排定；营业时间已逐条标注来源（见上面「营业时间」一行），' +
          '未与店家或口岸官方渠道全部二次核对。' +
        '</div></div>' +
        '<div class="dc-actions">' +
          '<button class="btn btn-primary" data-act="nav">在地图中打开</button>' +
          '<button class="btn btn-ghost" data-act="gmap">跳转外部导航</button>' +
        '</div>' +
      '</div>';

    card.querySelector('[data-act="nav"]').addEventListener('click', function () { flyToPlace(p); });
    card.querySelector('[data-act="gmap"]').addEventListener('click', function () {
      window.open('https://www.openstreetmap.org/?mlat=' + p.lat + '&mlon=' + p.lng + '#map=17/' + p.lat + '/' + p.lng, '_blank', 'noopener');
    });
  }

  /* ---------------- 只读调试句柄 ----------------
     给自动化验证脚本用：地图实例、规整后的数据、当前视图状态。
     全是取值函数，不暴露任何写入口，也不参与业务逻辑。
     需要它的原因：地图实例与 DAYS/PLACES 都在 IIFE 闭包里，
     外面既拿不到 map（没法确认某天的路线图层建了没有），
     也看不到 normalize() 之后真正生效的数据。 */
  window.PASSAGE = {
    map: function () { return map; },
    data: D,
    state: state,
    days: function () { return DAYS; },
    places: function () { return PLACES; },
    /* 某一天的路线图层状态：'no-map' / 'missing'（没建）/ 'visible' / 'none'（建了但隐藏）。
       注意 'missing' 与 'none' 必须区分开——后者是 MapLibre 里 visibility 的合法取值，
       混在一起就分不清「没建图层」和「建了但隐藏」了。 */
    routeLayer: function (i) {
      if (!map) return 'no-map';
      var id = 'route-' + i + '-line';
      if (!map.getLayer(id)) return 'missing';
      return map.getLayoutProperty(id, 'visibility') || 'visible';
    }
  };

  /* ---------------- 启动 ---------------- */
  renderChrome();
  renderOverview();
  renderHomeDays();
  renderAll();
  renderAnchorBtn();
  applyResponsive();
  document.getElementById('toggleMotion').textContent = '减少动效：' + (state.reduceMotion ? '开' : '关');
  setTimeout(replayHome, 260);

  var initial = (location.hash || '').slice(1);
  if (views[initial] && initial !== 'home') {
    setTimeout(function () { showView(initial); }, 60);
  }
  window.addEventListener('hashchange', function () {
    var v = (location.hash || '').slice(1);
    if (views[v]) showView(v);
  });
})();
