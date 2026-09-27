# Passage_2c · 数据模型与视觉规范

> **职责**：数据模型（字段口径、采集链路）与视觉令牌（色 / 字 / 形）。
> **体积**：9.7 KB ｜ **更新**：2026-09-28（文档体系重构时自旧 0X 文档拆出）
> **上级索引**：`Passage_0 文档地图.md` §1
> **本文不包含**：技术选型 → `Passage_2d`；地点事实本体 → `data/places.js` + `Passage_3e`
> ⚠️ **什么时候读本文**：**改 Schema / 加字段 / 动视觉令牌时**读。

---

### 9.1 整体气质

**复古鲜活 + 手作感 + 轻微动态。**

关键词：老澳门街市感、葡式瓷砖、皮革质感、纸张纹理、荧光点缀、插画驱动。

> ⚠️ v1.1 待调：v1.0 的视觉关键词源自原文的上海调性（「老上海月份牌」）。
> 换成澳门后，插画与纹理方向应重新定位——候选是**葡式碎石路（calçada portuguesa）的波浪纹**
> 与**骑楼 / 瓷砖立面的青白配色**。这一条尚未定稿，见 §十三 待决策 4。

### 9.2 色彩

| 角色 | 色值 | 用途 |
|---|---|---|
| 纸张底 | `#F7F3E8` | 页面底色，带极轻纸张纹理 |
| 卡片白 | `#FFFFFF` | 卡片、面板 |
| 主点缀（荧光黄绿） | `#D8F13C` | 标题高亮块、按钮、强调 |
| 深墨 | `#1A1A1A` | 正文、标题 |
| 次墨 | `#6B6B6B` | 辅助文字 |
| 砖红 | `#C0392B` | Day 1 路线 / 暖色详情卡 |
| 赭橙 | `#E07B39` | Day 2 路线 / 暖色详情卡 |
| 靛蓝 | `#2C4A8F` | Day 3 路线 / 冷色详情卡 |
| 皮革棕 | `#6B4423` | 首页信息块底色（保留自 v1.0 的视觉资产） |

**规则**：
- 每天一个主题色，贯穿：路线虚线 → 编号标记描边 → 日期 Tab → 详情卡头部
- 荧光黄绿只用于**强调**，面积不超过页面的 10%
- 详情卡头部色从「每日主题色」派生，保证与当天路线同色系

### 9.3 字体

| 用途 | 字体 | 说明 |
|---|---|---|
| 中文标题 | 思源黑体 Heavy / 苹方 Semibold | 粗壮、有分量 |
| 中文正文 | 思源黑体 Regular | 行高 1.7 |
| 英文装饰小标 | 衬线体（如 Playfair Display）+ 大字距 | 如 `YOUR SHANGHAI JOURNEY` |
| 数字/编号 | 等宽或几何无衬线 | 编号徽章用 |

### 9.4 图形与插画

- **背景插画**：原创城市风格插画，必须原创（避免版权风险），带轻微动态（视差、云层漂移、灯光呼吸）
- **地点配图**：优先使用插画/建筑线稿，风格统一；照片需注明来源
- **装饰元素**：v1.1 后仅保留**纸张纹理**与**缝线**这类轻量元素。原「邮票 / 行李牌 / 拍立得边框」随行后记录一并移除

### 9.5 动效规范

| 动效 | 时长 | 缓动 | 备注 |
|---|---|---|---|
| 首页入场 | 550ms | cubic-bezier(0.22, 0.9, 0.24, 1) | 信息块与卡片逐级淡入上浮，可重播 |
| 镜头飞近 | 1200ms | cubic-bezier(0.4, 0, 0.2, 1) | 同时抬 pitch |
| 详情卡展开 | 300ms | ease-out | 从右侧滑入 |
| 路线虚线流动 | 循环 | linear | 强调「路径」感，可关闭 |
| 日期切换 | 400ms | ease-in-out | 地图标记渐隐渐现 |

⚠️ **必须提供「减少动效」开关**，尊重系统 `prefers-reduced-motion`。鸟瞰 + 飞近的组合对晕动症用户不友好。

### 9.6 无障碍底线

- 正文对比度 ≥ 4.5:1（纸张底 + 深墨已满足）
- 荧光黄绿**不可用于正文文字**（对比度不足），只能作背景块
- 所有交互元素有可见焦点态
- 地图信息必须有**列表替代视图**（不能只靠地图传达信息）

---

## 二、数据模型

### 3.1 自建部分（内容层）

> **与原型实现的关系**：原型目前是零构建静态页，数据层是一个 `window.TW` 对象（`data/places.js`）。
> 下面是它**目标形态**的规范化 schema——两者字段一一对应，迁移时不需要改渲染层。
> 原型的 `normalize()` 函数已经在做这件事：只给「地点名 + 经纬度 + 第几天」也能完整渲染。

```ts
// 城市
interface City {
  id: string;
  name: string;           // 中国澳门
  nameEn: string;         // MACAU
  center: [number, number];   // [113.5442, 22.2044]
  defaultZoom: number;
  illustration: string;   // 原创插画资源路径
}

// 地点（内容库，非用户数据）
interface Place {
  id: string;
  cityId: string;
  name: string;           // 好利是咖啡小食
  nameEn?: string;        // CAFE CHAN POU
  type: PlaceType;        // 茶餐厅 | 越南料理 | 烘焙 | 地标 | 街巷 …
  mood: string;           // 祐汉街坊老店
  timeSlot: string;       // 早餐至午餐
  durationMin: number;    // 60
  description: string;    // 2-3 句
  image: string;
  lng: number;
  lat: number;

  /* 实用信息（v1.1 新增，详情卡的「信息块」逐行渲染，空值不占位） */
  addr?: string;          // 澳门黑沙环祐汉新村第四街 29 号
  hours?: string;         // 07:00–17:00
  bakeTimes?: string;     // 出炉时间 10:00 / 12:00 / 14:00 / 16:00
  phone?: string;         // 2840 3059
  priceNote?: string;     // 粉面 $23–$32
  walk?: string;          // 由关闸口岸步行约 10 分钟：…
  coordNote?: string;     // 街道级（祐汉新村第四街），约 ±60m，需实地核对门牌 29 号

  suggestions: Suggestion[];   // 吃什么 / 看什么
  sources: Source[];           // 资料来源（必填）
  tips: string[];              // 避坑提示
  verifiedAt: string;          // 信息核实日期
}

interface Suggestion {
  kind: 'eat' | 'view';
  name: string;           // 驰名焗骨饭
  address?: string;       // 可选
  note?: string;          // 玻璃门上的头号招牌
}

interface Source {
  url: string;            // https://xhslink.cn/o/8nmAS0dy3Uu
  title: string;
  accessedAt: string;     // 访问日期
}
```

**`coordNote` 是 v1.1 新增的诚实字段，不要省。** 小店大多没有登记在 OSM 里，只能退到街道级坐标。
把精度写进数据、并在详情卡里展示给用户，比含糊地给一个看起来精确的坐标要好——
用户至少知道「这个点可能偏 60 米」，而不是到了现场才发现找不到门牌。

### 3.2 复用部分（TREK 数据模型）

TREK 的主干是**五实体分层**，本项目直接复用：

```
Trip（行程）
 ├── Day（日）              → 对应产品里的「第 N 天」
 │    ├── Place（地点）      → 与内容库 Place 通过 placeId 关联
 │    ├── Note（日程笔记）   → Markdown 正文
 │    └── Booking（预订）    → 16 种类型，含附件
 ├── Cost（费用）            → 整数分拆分、多付款人
 ├── List / PackingItem     → 打包清单与待办
 └── Document（文档）        → 附件，可挂到行程/地点/日程/预订
```

**关键设计决策**：**内容库 Place 与用户 Place 分离。**

- `ContentPlace`（内容层）：平台预置的攻略地点，全局唯一，带来源与核实日期。
- `UserPlace`（TREK 层）：用户行程里的地点，可以是内容库的引用，也可以是用户自己新增的。

这样做的价值：内容可版本化更新（「这家店关门了」只需改一处），用户数据不受影响。**这是本项目相对「AI 一次性生成静态站」的核心工程优势。**

### 3.3 内容采集链路（v1.1 新增，已跑通）

> 原 §3.3「手帐与物件」已随产品收敛删除。这一节替换为**真实跑通的第一条数据通路**——
> 因为「攻略怎么变成结构化地点」才是这个产品真正的工程难点，而不是手帐。

用户给的是小红书分享短链，要变成 `PLACES` 里的一条结构化地点，分四步：

```
① 短链解析
   https://xhslink.cn/o/xxxx
     ↓ curl -sL -w '%{url_effective}' 取最终地址
   https://www.xiaohongshu.com/explore/<note_id>?xsec_token=<token>&...
     ↓ 取出 note_id + xsec_token（token 必须带上，否则详情页 404）

② 正文抽取（CDP 直连，不用爬虫框架）
   打开 https://www.xiaohongshu.com/explore/<note_id>?xsec_token=<token>
     ↓ Runtime.evaluate
   window.__INITIAL_STATE__.note.noteDetailMap[<note_id>].note
     → title / desc（正文）/ tagList / imageList / interactInfo / comments

③ 配图阅读（关键一步，不能跳过）
   imageList 里的 URL 下载（webp）→ sips 转 jpg → 逐张阅读
     → 地址、营业时间、电话、菜单、价格、出炉时间，几乎全部来自门店照片与菜单照片，
       而不是正文。正文只有情绪和推荐语。

④ 地理编码
   楼名 / 街道名 → photon.komoot.io
     → 命中楼宇级坐标（如「嘉倫大廈 Edifício Ka Lon」→ 113.547126, 22.199648）
     → 未命中则退到街道级，并在 coordNote 里如实标注精度
```

**为什么第 ③ 步不能省**：正文里写「祐汉新村那家老店」，照片的玻璃门上才印着门牌 29 号、
营业时间和两个电话号码。只读正文，得到的地点卡是空的。

**坐标精度的现实情况**（实测）：

| 情况 | 结果 | 处理 |
|---|---|---|
| 店铺登记在 OSM 的楼宇里 | 楼宇级，高置信 | 直接用 |
| 店铺未登记，但街道/楼名可检索 | 街道级，约 ±60m | 用，并在 `coordNote` 标注 |
| 完全检索不到 | 无坐标 | `normalize()` 置 0,0 并 `console.warn`，不静默出错 |

> ⚠️ **本机网络环境限制（实测记录）**：`nominatim.openstreetmap.org` 与 `www.openstreetmap.org`
> 被本地代理劫持到假 IP（`198.18.14.x`）返回 HTTP 000；`overpass-api.de` 无论方法/请求头/裸 body
> 一律返回 406（连 `/api/status` 也是 406，可判定是代理注入的）；`overpass.osm.ch` 可达但数据库为空
> （`out count;` 全为 0）。**可用的是 `photon.komoot.io`。** 换机器部署时这段结论需要重测。

---
