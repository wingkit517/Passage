# Passage_2d · 技术方案与质量门槛

> **职责**：技术选型、地图方案、AI 规划链路、离线 / 部署——怎么实现与达标线。
> **体积**：16.7 KB ｜ **更新**：2026-09-28（文档体系重构时自旧 0X 文档拆出）
> **上级索引**：`Passage_0 文档地图.md` §1
> **本文不包含**：业务口径 → `Passage_1`；数据模型 → `Passage_2c`；排障实录 → `engineering/踩坑与原理.md`
> ⚠️ **什么时候读本文**：**选型 / 动地图与算法实现 / 定达标线时**读。

---

### 核心策略：复用后端能力，自建体验层

```
┌──────────────────────────────────────────────────────────┐
│                    自建体验层（核心工作量）                  │
│  行程总览页 · 鸟瞰地图工作台 · 地点详情卡                     │
│  React 19 + TypeScript + Vite + Tailwind + Zustand        │
│  ⚠️ 当前原型为零构建静态页（原生 JS），见 Passage_3 交付状态.md       │
├──────────────────────────────────────────────────────────┤
│              地图引擎层（自建，依赖开源库）                   │
│  MapLibre GL JS（3D 建筑 + 倾斜视角） + OSRM                │
├──────────────────────────────────────────────────────────┤
│              能力层（复用 TREK，AGPL-3.0）                  │
│  行程/地点数据 · 协作 · 预算 · 清单 · 附件 · 导出 · 离线      │
│  NestJS 11 + SQLite + WebSocket + REST API / MCP          │
├──────────────────────────────────────────────────────────┤
│              内容层（自建）                                 │
│  攻略采集（笔记链接 → 结构化地点） + 资料来源管理 + 内容后台   │
└──────────────────────────────────────────────────────────┘
```

### 选型对照表

| 层 | 选型 | 理由 | 备选 |
|---|---|---|---|
| 前端框架 | React 19 + TypeScript | 与 TREK 前端同栈，组件可互相参考；生态最全 | Vue 3 |
| 构建 | Vite | 快，TREK 也在用 | — |
| 样式 | Tailwind CSS | 与 TREK 一致，便于复用其设计 token | — |
| 状态 | Zustand | 轻量，地图与面板的联动状态好管 | Jotai |
| 地图引擎 | **MapLibre GL JS** | 开源、无 token、支持 fill-extrusion 3D 建筑与 pitch | Mapbox GL JS（更美但收费） |
| 瓦片源 | **OpenFreeMap** | 免费、无需 API key、OpenMapTiles schema（含建筑高度） | MapTiler、自建 |
| 路线计算 | **OSRM**（自托管或公共实例） | 开车/步行/骑行路线与距离矩阵 | Valhalla、GraphHopper |
| **地理编码** | **Photon**（`photon.komoot.io`） | OSM 数据、无需 key、支持按楼名/街道名检索 | Nominatim、MapTiler Geocoding |
| POI 检索 | Overpass API | 按视口拉取 OSM POI，无需 key | Google Places（需 key，有额度成本） |
| 公共交通 | Transitous | 开源、门到门 | — |
| 天气 | Open-Meteo | 免费、无需 key、16 天预报 | — |
| 后端 | **TREK**（NestJS 11 + SQLite） | 8/8 能力覆盖，一条 docker 起服务 | itskovacs/TRIP（MIT） |
| 离线 | PWA + IndexedDB + 幂等重放 | TREK 已实现，直接复用 | — |
| 部署 | Docker Compose | 与 TREK 一致 | — |

---

## 二、地图方案（本项目技术难点）

> ⚠️ 本节已按 2026-09-27 的**实测结果**修订。原稿中「需要自己添加 3D 建筑图层」「瓦片源可能缺建筑高度字段」等推测均已被推翻，下面是验证过的事实。

### 2.1 鸟瞰视角与 3D 建筑（已验证可行）

**关键发现：OpenFreeMap 的 liberty 样式本身就带 3D 建筑挤出图层，不需要自己加。**

实测 `https://tiles.openfreemap.org/styles/liberty` 的样式定义：

| 图层 id | 类型 | source | source-layer | minzoom |
|---|---|---|---|---|
| `building` | fill | `openmaptiles` | `building` | 13 |
| `building-3d` | fill-extrusion | `openmaptiles` | `building` | **14** |

`building-3d` 的 paint 直接读取瓦片字段：

```json
{
  "fill-extrusion-base":  ["get", "render_min_height"],
  "fill-extrusion-height":["get", "render_height"],
  "fill-extrusion-color": "hsl(35,8%,85%)",
  "fill-extrusion-opacity": 0.8
}
```

**结论**：
- 瓦片源**确实带建筑高度字段**（`render_height` / `render_min_height`），3D 效果开箱即用。
- 3D 只在 **zoom ≥ 14** 生效。城市尺度总览（zoom ~11.6）是平面地图，飞近到 zoom 16 才出现立体建筑——这正好符合产品设计（总览看全局，飞近看细节）。
- 所以**不需要 Mapbox**，MapLibre + OpenFreeMap 免费方案完全够用。Mapbox 的价值仅在更好的地形与更精细的立体质量。

实际初始化参数（原型采用，以澳门为例）：

```js
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [113.5442, 22.2044],  // 由 data/places.js 的 CITY.center 提供
  zoom: 13.6,        // 初始值；style.load 后由 fitBounds 收紧到实际包围盒
  pitch: 50,         // 倾斜 50°，形成鸟瞰
  bearing: -12,      // 轻微旋转，避免正南北的死板
  antialias: true,
});
```

> **注意 zoom 的两段式行为**：`CITY.zoom` 只在 `fitBounds` 跑之前生效。`style.load` 里 `setTimeout(fitAll, 260)` 会用全部地点（或当天地点）的包围盒 `fitBounds`，把视野收紧到刚好装下所有标记。所以运行期 `map.getZoom()` 通常**不等于** `CITY.zoom`——这是设计如此，不是配置没生效。

**pitch 上限**：超过 60° 会导致地名严重变形，硬性上限设 60°。

### 2.2 三个必须避开的坑（实测踩过）

**坑 1：用 `load` 事件会永远不触发。**

MapLibre 的 `load` 事件依赖**首帧渲染完成**。在后台标签页里 Chrome 会节流 `requestAnimationFrame`，导致首帧永远不渲染，`load` 永不触发，地图一片空白。

```js
// ✗ 后台标签页里不会触发
map.on('load', setup);
// ✓ 样式解析完就触发，不依赖渲染
map.on('style.load', setup);
```

**坑 2：矢量瓦片只在渲染帧里才会被请求。**

地图没渲染 → 不请求瓦片 → 更没得渲染。所以「后台标签页里地图空白」是**假象，不是 bug**。调试地图时务必在前台窗口看，否则会误判成代码问题。

**坑 3：虚线动画不要用 Mapbox 官方示例的序列。**

官方「Animate a line」示例用的 `[0,4,3] → [0.5,4,2.5] → …` 序列会让虚线在某些相位**几乎完全消失**（首段 dash 长度为 0）。改用「dash / gap 恒定 + 只平移相位」的 4 元素数组：

```js
// 4 元素数组的第 3 位是相位偏移，dash/gap 保持不变 → 线永远可见
const DASH_ON = 2, DASH_OFF = 1.6, STEPS = 8;
const seq = Array.from({length: STEPS}, (_, i) =>
  [DASH_ON, DASH_OFF, (i * (DASH_ON + DASH_OFF)) / STEPS, 0]);
```

### 2.3 编号标记与每日配色

标记用 HTML Marker（而非 Symbol 图层），便于做圆角徽章与数字：

```js
// 天数不设上限：颜色从调色板循环取，见 app.js 的 DAY_PALETTE
const DAY_PALETTE = ['#C0392B','#E07B39','#2C4A8F','#1E7A4B','#7B4B94',
  '#0E7490','#A16207','#9F1239','#4D7C0F','#6D28D9'];

places.forEach((p) => {
  const el = document.createElement('button');
  el.className = 'place-badge';
  el.style.setProperty('--day-color', DAY_PALETTE[p.day % DAY_PALETTE.length]);
  el.textContent = `${p.day + 1}-${p.order + 1}`; // 1-1, 1-2…
  el.addEventListener('click', () => flyToPlace(p));
  new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([p.lng, p.lat]).addTo(map);
});
```

> **两位数编号要单独处理**：超过 9 个地点后徽章会变成 `1-10`、`1-11`，三字符挤在圆形徽章里会溢出。原型加了 `.is-long` 类把字号从 11px 降到 9px 并收紧字距。

**标记避让（必做）**：城市尺度下多个地点会挤在一起（原上海示范数据里武康路与安福路相距约 300m，编号完全重叠）。用一次屏幕空间的松弛迭代把重叠标记推开，位移限制在 ±24px，保证标记仍贴着真实位置：

```js
function spreadMarkers() {
  const pts = visiblePlaces().map(p => {
    const pt = map.project([p.lng, p.lat]);
    return { id: p.id, x: pt.x, y: pt.y, dx: 0, dy: 0 };
  });
  const MIN = 34, MAXOFF = 24;
  for (let it = 0; it < 16; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const dx = (b.x + b.dx) - (a.x + a.dx), dy = (b.y + b.dy) - (a.y + a.dy);
      const d = Math.hypot(dx, dy) || 1;
      if (d < MIN) {
        const push = (MIN - d) / 2, ux = dx / d, uy = dy / d;
        a.dx -= ux * push; a.dy -= uy * push;
        b.dx += ux * push; b.dy += uy * push;
      }
    }
  }
  pts.forEach(o => markerByPlace[o.id]?.setOffset([
    Math.max(-MAXOFF, Math.min(MAXOFF, o.dx)),
    Math.max(-MAXOFF, Math.min(MAXOFF, o.dy)),
  ]));
}
map.on('zoomend', spreadMarkers);   // 缩放后重算
```

配套：zoom < 12.4 时把标记缩到 25px（`#map.zoom-far .place-badge`），进一步减少拥挤。

### 2.4 路线虚线（跟随地图移动）

用 GeoJSON Source + Line 图层，**不要用 SVG 叠加**——那样地图一拖动就错位。白色描边打底 + 彩色虚线在上，宽度要够（实测 4.5px + 8px 描边才清晰）：

```js
map.addSource(`route-${d}`, {
  type: 'geojson',
  data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
});
map.addLayer({ id: `route-${d}-casing`, type: 'line', source: `route-${d}`,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.9 } });
map.addLayer({ id: `route-${d}-line`, type: 'line', source: `route-${d}`,
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: { 'line-color': dayColor(d), 'line-width': 4.5,
           'line-dasharray': [DASH_ON, DASH_OFF] } });
```

> 实测教训：线宽 3px + 描边 6px 时，在城市尺度下彩色虚线**几乎看不见**，只看到白色描边。必须加粗。

### 2.5 镜头飞近

```js
function flyToPlace(p) {
  map.flyTo({
    center: [p.lng, p.lat],
    zoom: 16.2,        // ≥14 才出现 3D 建筑
    pitch: 55,         // 飞近时抬高 pitch，强化"俯冲"感
    bearing: map.getBearing(), // 保持朝向不变，避免眩晕
    duration: 1200,
    essential: true,
  });
}
```

⚠️ **晕动症处理**：`bearing` 在飞行中保持不变，只改 center/zoom/pitch。同时旋转 + 缩放是眩晕的主要来源。检测到 `prefers-reduced-motion: reduce` 时把 `duration` 降到 0。

### 2.6 降级方案（必须有）

地图是外部依赖，必须能在失败时降级。原型实现了两层：

1. `map.on('error')` 里识别样式加载失败 → 显示提示条
2. 15 秒超时兜底：若 `style.load` 未触发 → 显示「底图加载超时」

提示条明确告知「左侧列表与右侧详情仍可正常使用」——**地图信息必须有列表替代视图**，这是无障碍底线，也是可用性底线。

---

## 三、AI 规划链路

参照笔记的第三步是「把收藏的攻略丢进知识库，让 AI 参考规划」。本项目要把它产品化。

### 4.1 攻略导入 → 结构化

```
用户粘贴小红书笔记 / 上传截图 / 输入收藏夹内容
        ↓
LLM 抽取（结构化输出，严格 JSON Schema）
        ↓
产出：地点列表（名称 / 类型 / 时段建议 / 停留时长 / 段间耗时 / 避坑提示）
        ↓
人工或规则校验：地理编码（名称 → 经纬度）、去重、合并
        ↓
进入「候选地点池」，等待用户勾选
```

**注意**：原文对话里 AI 提到「16 locations, fares, recommended time slots, inter-section travel times (walk/subway/ferry), and 4 pitfall-avoidance tips」——说明这个抽取是可行的，字段结构也印证了本方案的地点模板设计。

### 4.2 行程自动排序（v1.1 已实现，原型可跑）

**原型已落地第 2、3、4 步**（最近邻 + 2-opt + 锚点锁定），第 1、5 步待接后端后做。

```js
// app.js 实际实现
var R_EARTH = 6371000;
gap(a, b)              // haversine 大圆距离，单位米
pathLen(list)          // 整条路径总长
nearestNeighbor(list)  // 最近邻生成初始解
twoOpt(list, from)     // 2-opt 迭代，消除交叉路径
```

**关键设计决策：目标函数不是「总距离最短」。**

这是本项目最重要的一条产品判断。原参照笔记的 Day 1 手工顺序是
`新天地 → 豫园 → 外滩 → 北外滩 → 陆家嘴`，末段「北外滩 → 陆家嘴」是**为了过江看夜景**。
纯距离最优会把它反过来。也就是说：

> **「总距离最短」是错的优化目标。** 用户手工排的顺序里含着编排意图（把某处留到夜里、
> 把某餐安排在饭点），算法看不到这些意图，无权替用户推翻。

所以原型的排序是**建议性的，不是自动生效的**：

| 机制 | 行为 |
|---|---|
| 预览 | 排序后显示 `总距离 23.4 km → 22.7 km（省 0.7 km，-3.0%）`，用户看得到收益再决定留不留 |
| 撤销 | 一次点击回到排序前，快照存在 `sortSnapshot` |
| 起点锁定 | 默认开启，每天第一站（通常是口岸/酒店/早餐店）不被移动 |
| 无收益时不动作 | 若已是最短，提示「当前顺序已经是最短的，没有可优化的折返」，且不显示撤销按钮 |
| 明确免责 | 提示里带一句「只优化距离，不考虑「把某处留到夜里」这类编排意图」 |

**实测收益（原上海 13 地点数据）**：

| 模式 | 总距离 | 变化 |
|---|---|---|
| 手工顺序 | 23.43 km | — |
| 锁定起点 | 22.72 km | **−3.0%** |
| 不锁起点 | 21.50 km | **−8.2%**（等于暴力枚举最优解） |

收益不大，且手工顺序已接近最优——**这恰好验证了「排序是锦上添花，不是核心价值」**。

**待补的第 1、5 步**：

```
1. 地理聚类：按经纬度把地点分配到天数（保证每天尽量集中）
5. 时段分配：按地点建议时段（上午/中午/下午/夜）二次校正顺序
```

第 5 步是本项目的增量：TREK 只做地理优化，本项目还要考虑「这家店建议下午茶时段去」
这类**时段语义**——这正是 `timeSlot` 字段存在的理由，也是内容库带来的能力。

### 4.3 AI 调整行程（P2）

对话式：「第 2 天太赶了，帮我松一点」→ LLM 解析意图 → 调用排序 API → 返回调整方案 → 用户确认后落库。

**必须走 Tool Use / Function Calling**，不允许 LLM 直接改数据。

---

## 四、离线与移动端

**全部复用 TREK 已验证的方案**：

| 能力 | 实现 | 说明 |
|---|---|---|
| 可安装 | PWA Manifest | iOS/Android 从浏览器直接安装 |
| 离线读取 | IndexedDB（按用户分区） | 行程、地点、文件 blob 预缓存 |
| 离线写入 | 变更队列 + `X-Idempotency-Key` | 重连时幂等重放，避免重复 |
| 冲突处理 | 保留双方版本 | 提示「保留我的 / 保留对方的」 |
| 离线地图 | 栅格瓦片预下载 | 可下载某行程范围的瓦片 |
| API 缓存 | **不缓存** | Service Worker 明确不缓存 API 响应 |

⚠️ **本项目的增量难点**：鸟瞰 3D 地图的离线瓦片体积较大（3D 需要更多数据）。建议离线时**降级为平面地图**，只保证行程与地点信息可读。这与产品原则一致——**离线场景下，信息可用性优先于视觉体验**。

---

## 五、部署

```yaml
# docker-compose.yml（示意）
services:
  trek:                    # 能力层：复用 TREK 官方镜像
    image: mauriceboe/trek:latest
    environment:
      - TREK_ADDONS=lists,costs,documents,collab,atlas   # 不含 journey（手帐已砍）
    volumes:
      - ./data:/app/data
    ports:
      - "3000:3000"

  web:                     # 体验层：自建前端
    build: ./web
    environment:
      - VITE_TREK_API=http://trek:3000/api
      - VITE_TILE_URL=https://tiles.openfreemap.org/styles/liberty
    ports:
      - "8080:80"

  osrm:                    # 路线计算（可选，可用公共实例）
    image: osrm/osrm-backend
    volumes:
      - ./osrm:/data
```

**注意**：Docker 镜像名仍为 `mauriceboe/trek`（仓库已迁移至 `liketrek/TREK`，镜像名未变）。

---
