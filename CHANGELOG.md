# 变更记录 / Changelog

本文档记录 BIMScope 从项目创建至今的所有正式版本演进与主要改动记录。  
This document records all formal version iterations and major changes of BIMScope since project initiation.

> **版本号命名规则 / Versioning Convention**:  
> - 主版本号固定为 `v1`（日常对外显示简写为 `v1`）；
> - 完整细版本号格式为 `v1.<YYMMDDHHMM>`，小数点后 10 位数字精确对应具体发布的年月日时分。  
> - Major version is fixed at `v1` (displayed as `v1` in everyday usage);  
> - Full sub-version follows `v1.<YYMMDDHHMM>`, where the 10-digit timestamp represents Year, Month, Day, Hour, Minute.

---

## 项目开发耗时统计 / Development Time Metrics

> ⏱️ **项目累计总工时 / Total Active Development Time**: **44 小时 56 分钟 (44.95 Hours)**  
> 📅 **自然时间跨度 / Total Calendar Span**: **11 天 2 小时 51 分钟** (2026-09-29 22:17 至 2026-10-11 01:09)  
> 🔢 **累计交互与执行步骤 / Total Engineering Steps**: **20,259 Steps** (跨 23 个活跃开发会话 Sprint)  
> 🔄 **更新机制 / Update Policy**: 每次版本构建打包发布时基于真实日志自动重新精算累计工时。

### 阶段与每日工时分解 / Daily Breakdown
| 日期 / Date | 活跃开发时段 / Active Sprints | 有效工时 / Active Hours | 核心迭代内容 / Milestones |
| :--- | :--- | :---: | :--- |
| **2026-09-29** | 22:17~00:53 | 2h 36m (2.60h) | 项目脚手架初始化、Three.js 单文件离线引擎搭建 / Project scaffold & Three.js engine setup |
| **2026-09-30** | 23:51~01:56 | 2h 05m (2.08h) | 3D 罗盘、标高指示、图钉系统与演示模型初始构建 / 3D compass, elevation readouts, pin labels & demo model |
| **2026-10-01** | 23:28~01:06 | 1h 38m (1.64h) | 剖切手柄（Gizmo）、着色与材质系统初版 / Section gizmo controls, shader & material styling |
| **2026-10-02** | 22:04~01:38 | 3h 34m (3.57h) | FBX 格式扩展、中大型 IFC 流式解析器研发 / FBX format integration, streaming IFC parsing |
| **2026-10-03** | 09:55~10:39, 23:11~03:24 (共 6 个时段) | 9h 07m (9.13h) | 墙体门窗洞口 CSG 布尔减运算、栏杆几何修正、检查器手风琴与层级树重构 / Wall CSG void cutouts, railing fixes, inspector accordions & tree refactor |
| **2026-10-04** | 10:02~10:34, 19:23~22:34 (共 3 个时段) | 9h 31m (9.52h) | 正交/透视切换、NSEW立面图、50步视图撤销重做、右键菜单保留选择、10%微光悬停 / Ortho/Persp toggle, NSEW views, 50-step view history, context menu fix, 10% hover |
| **2026-10-05** | 19:04~00:27 | 5h 23m (5.38h) | 左右面板原地折叠、纯度高亮、CAD标准双向框选、光标轴心环视、底部栏内阴影 / Stationary panels, pure highlight, CAD box selection, pivot orbit, bottom shadow |
| **2026-10-06** | 20:29~21:12 | 0h 43m (0.72h) | 双版本参数化构建系统（BIM Scope / SWBIM Scope）、品牌所有权隔离、多格式元数据档案联动 / Dual-variant parametric build, branding isolation, multi-format metadata sync |
| **2026-10-07** | 18:43~22:04, 23:03~23:05 | 3h 23m (3.39h) | 功能迭代与持续优化 / Feature development |
| **2026-10-08** | 13:25~13:42, 21:37~21:46 (共 3 个时段) | 0h 46m (0.77h) | 功能迭代与持续优化 / Feature development |
| **2026-10-09** | 22:06~01:14 | 3h 07m (3.13h) | 功能迭代与持续优化 / Feature development |
| **2026-10-10** | 19:58~22:21 | 2h 23m (2.39h) | 功能迭代与持续优化 / Feature development |
| **2026-10-11** | 00:31~01:09 | 0h 37m (0.63h) | 功能迭代与持续优化 / Feature development |
---

## [v1.2610072000] - 2026-10-07 20:00

### 多版本同格式模型对比模式研发（IFC 首发）/ Multi-Version Model Comparison Mode Engine (IFC Launch)
- **全局对比模式入口与浅绿/浅红双区弹窗 / Compare Mode Top Entry & Dual-Zone Setup Modal**
  - **中文**:
    1. **顶部导航栏入口重排与同款契合圆角按钮**: 将【模型对比】功能按钮迁移至【打开模型】按钮左侧，采用同款高优先级主按钮视觉体系（高饱和蓝底 #0284c7 与轻微发光天蓝边框 #38bdf8），两枚按钮统一采用与标签页角契合的 6px 稳健圆角形态（Tab-matched 6px rounded CTA buttons），摒弃过度圆滑造型，中英文自适应排版，布局对称且与工程软件严谨质感深度契合。
    2. **浅绿/浅红双区暗示与一键互换**: 弹窗左侧为“新版模型（New Revision）”，采用柔和浅绿背景色（`#f0fdf4`）；若当前视口已有打开模型，则默认自动预填入左侧；右侧为“旧版模型（Old Baseline）”，采用柔和浅红背景色（`#fef2f2`）；两区域中央提供 `⇄` 一键互换按钮，点击即可对调左右文件并自动翻转新旧角色；支持拖拽或点击独立拾取文件。
    3. **全屏模态遮蔽与视口拖拽提示冲突修复**: 对比窗口开启时全屏深色磨砂遮罩覆盖顶栏、侧栏与视口，阻断底层点击、滚轮穿透与背景快捷键；彻底解决文件向弹窗拖拽经过3D视口时误激活视口 Drop 提示并残留遮挡视口的 Bug；支持点击遮罩空白区域或按 Escape 键快速退出弹窗，且退出后智能保留已拖入的新旧文件信息。
    4. **无相似度异常熔断与防误选保护**: 当比对的两份模型不存在任何相似或关联构件（匹配度为 0%，所有图元均为全新增或全删除，判定为可能选错文件或无关项目）时，系统自动中断进入 3D 对比流水线，在视口右上角弹出高优先级警告通知，并无损恢复对比设置窗口，同时保留用户已选文件槽位以便快速核对替换。
  - **English**:
    1. **Top Navbar Layout Reorganization & Twin Tab-Matched Rounded Buttons**: Relocated the [Compare] button immediately to the left of the [Open Model] button, adopting identical primary CTA styling (vibrant blue fill #0284c7 with accent glowing border #38bdf8), crafting both buttons with a disciplined 6px corner radius matching tab headers (Tab-matched 6px rounded geometry), eliminating excessive pill roundness, featuring responsive bilingual typography for an aesthetically cohesive, professional engineering UI.
    2. **Light Green/Red Dual Zones & One-Click Swap**: Left zone designated for "New Revision" with subtle green tint (`#f0fdf4`), pre-populating currently active model; right zone for "Old Baseline" with subtle red tint (`#fef2f2`); center `⇄` swap button instantly switches files and roles; supports drag-and-drop or file pickers.
    3. **Full-Screen Modal Masking & Drag Conflict Elimination**: Comparing modal employs a full-screen frosted glass backdrop covering top navbar, sidebars, and viewport, intercepting background clicks, wheel zoom, and hotkeys; completely eliminates the bug where dragging files across the 3D viewport falsely triggered and stuck the viewport's drop prompt overlay; supports dismiss via backdrop click or Escape key while retaining chosen file slots upon reopening.
    4. **Zero-Similarity Exception Interception & Mis-Selection Guard**: When two selected models share zero matching or related components (0% match, all elements classified as wholly added or deleted, indicating an accidental file mis-selection or unrelated projects), automatically halts entry into 3D comparison mode, displays a high-priority warning toast, and non-destructively restores the comparison setup modal while preserving chosen file slots for swift review and re-selection.

- **IFC 全局唯一 GUID 深度差分对比引擎 / IFC GlobalId Alignment & Deep Topology Diff Engine**
  - **中文**:
    1. **GUID 拓扑对齐与生命周期分类**: 采用 IFC 国际标准 `GlobalId` 进行新旧模型实体的一一配准；新版独有图元标记为绿色新增（Added）；旧版独有图元标记为红色删除（Deleted，动态克隆并注入当前场景作为半透明红色辅助网格 `CompareDeletedGroup`）；两版本均有的图元则深度检测变动状态。
    2. **几何与位姿形变精确探测**: 提取构件世界矩阵包围盒中心与几何拓扑进行比对，若中心位移或包围盒最大尺寸偏差超过 2mm 阈值，则判定为“几何/位姿改变（Geometric Shift）”；若几何未变但 IFC 属性集（Psets）或参数值存在差异，则判定为“纯参数改动（Metadata Only）”。
  - **English**:
    1. **GlobalId Alignment & Lifecycle Classification**: Aligns entities via IFC standard `GlobalId`; elements exclusive to new model are classified as Added (Green); elements exclusive to old baseline are classified as Deleted (Red, cloned and injected as translucent red meshes into `CompareDeletedGroup`); matched elements undergo deep difference inspection.
    2. **Geometric & Spatial Drift Detection**: Computes world bounding box center and extent deviations against a 2mm threshold; if exceeded, classified as "Geometric Shift"; if unchanged geometrically but Pset properties differ, classified as "Metadata Only".

- **四色工程语义着色剥离贴图与未变构件连续透明度 / 4-Color Semantic Rendering & Unchanged Opacity Control**
  - **中文**:
    1. **纹理剥离与四色着色标准**: 自动剥离模型原本材质纹理，统一覆写为高对比工程着色：未变构件显示为低饱和灰白色（#d8dce2）、新增构件显示为高亮翠绿色（#22c55e）、已删除构件显示为红色半透明（#ef4444，透明度 0.45）、发生变动构件显示为警示橙黄色（#f59e0b）。
    2. **未变构件 0%~100% 连续透明度滑块**: 左侧对比面板顶部提供“未变构件透明度（Unchanged Opacity）”滑动条，默认值为 30% 低饱和半透明，支持拖动至 0% 完全隐去未变构件以极度突出改动部位，或拖动至 100% 完全实体显示。
  - **English**:
    1. **Texture Stripping & 4-Color Semantic Material Override**: Original materials and textures are stripped in favor of high-contrast engineering colors: Unchanged in matte gray-white (`#d8dce2`), Added in vivid green (`#22c55e`), Deleted in translucent red (`#ef4444`, opacity 0.45), Modified in warning orange-yellow (`#f59e0b`).
    2. **Continuous 0%-100% Unchanged Opacity Slider**: Top of left comparison panel provides an "Unchanged Opacity" slider defaulting to 30% translucent; users can slide down to 0% to completely hide unchanged elements, or up to 100% for full solid rendering.

- **交互式黄色旧版幽灵体叠加（Ghost Mesh）/ Interactive Pre-Revision Ghost Geometry Overlay**
  - **中文**:
    1. **形变构件旧版幽灵体重构**: 当用户在 3D 视口或差异树中选中发生“几何/位姿变动”的橙黄色构件时，系统在视口中自动生成并叠加半透明黄色幽灵体（`#fbbf24`，透明度 0.48），精确呈现修改前的空间位置与形体轮廓；若仅为参数属性变更则不显示幽灵网格。
    2. **光标穿透保护与无缝清理**: 幽灵体具备 `raycast = null` 拾取穿透保护，避免干扰正常构件点选；取消选择或切换选择时平滑释放并销毁幽灵网格几何体与材质内存。
  - **English**:
    1. **Pre-Revision Ghost Mesh Reconstruction**: Selecting a modified element with geometric/spatial shifts renders a yellow translucent ghost overlay (`#fbbf24`, opacity 0.48) depicting its pre-revision shape and position; elements with metadata-only changes omit the ghost mesh.
    2. **Raycast Pass-Through & Memory Disposal**: Ghost mesh is protected from raycast picking to preserve normal selection; smooth geometry and material disposal upon deselection or element switching.

- **左侧对比面板：三态计数胶囊与双形态差异树 / Left Sidebar HUD Pills & Dual-Mode Difference Tree**
  - **中文**:
    1. **三态指标胶囊与交互过滤**: 左侧面板自适应切换为专用对比结果视界，顶部呈现绿（+新增）、红（-删除）、橙（~修改）三个圆角方块指示芯片，实时统计对应数量；点击任意芯片即可触发快速过滤隔离，仅显示该类型变动构件。
    2. **双重形态差异树无缝切换**: 差异树仅展示变动构件，支持一键切换两种组织形式：①「按层级组织」——严格遵循 IFC 空间层级（Project > Site > Building > Storey），各节点附带绿/红/橙状态圆点与幽灵体标识；②「按状态分组」——分为新增、删除、修改三大分组卡片，组内继续依原本构件层级嵌套组织。
  - **English**:
    1. **Tri-Color Metrics HUD & Filter Chips**: Left sidebar switches to dedicated comparison view featuring Green (+Added), Red (-Deleted), and Orange (~Modified) pills; clicking any pill acts as a filter chip isolating matching elements.
    2. **Dual-Mode Difference Tree**: Difference tree filters out unchanged components and provides two toggleable views: ① "Hierarchy Mode" preserving original IFC spatial hierarchy with colored status dots and Ghost badges; ② "Status Group Mode" grouping elements under Added, Deleted, and Modified cards while preserving internal nesting.

- **右侧检查器版本变更差异表与退出状态管理 / Inspector Diff Table & Sticky Banner Clean Exit**
  - **中文**:
    1. **属性差异对照表（Diff Table）**: 选中修改构件时，右侧检查器顶部自动插入“版本变更差异”卡片，清晰罗列发生变动的属性名、旧版原值与新版现值（`Old Value ➔ New Value`），并支持一键切换查看完整工程属性集。
    2. **顶部常驻状态条与一键退出还原**: 视口顶部悬浮显眼的常驻对比状态栏（`● 模型对比模式中 | 新版: <A> ➔ 旧版: <B> | [退出对比]`），带有绿色呼吸脉冲圆点；点击“退出对比”即可一键无痕退出：视口保留新版模型、完整恢复原始材质贴图纹理、销毁删除构件组与幽灵体、重置左侧面板，确保零内存泄漏。
  - **English**:
    1. **Inspector Property Diff Table**: Selecting modified elements renders a top Diff card highlighting altered properties with old and new values (`Old Value ➔ New Value`), along with a toggle for full property sets.
    2. **Sticky Status Banner & Clean Exit**: Viewport features a floating status banner with green pulse dot indicating active comparison; clicking "Exit" seamlessly restores original textures/materials, removes injected deleted meshes and ghost overlays, and resets the sidebar with zero memory leaks.

- **项目全量功能简述与文档高精度特性校准 / Accurate Comprehensive Documentation & High-Precision Highlights**
  - **中文**:
    1. **README.md 核心特色与功能全量重构**: 纠正旧版文档中关于支持格式的失真陈述（剔除未实际接入的 OBJ/MTL、STL、PLY，精准收敛至当前已上线的 IFC 2x3/4/4.3、GLTF/GLB、FBX 及 COLLADA .dae）；全面补充多版本 IFC 深度对比模式、CAD 双向框选、视口居中正交立面预设、50 步视图撤销重做、三维 Stencil 实体封口剖切及通用三维动画播放条等上线功能。
    2. **超越商业软件的高保真几何解析与平滑着色重点收录**: 详尽阐述自主研发的 IFC 解析优势：① 针对部分商业 BIM 软件因多层映射遍历缺陷导致“多层屋檐只显示最高一层、其余图元缺失”的顽疾，通过递归映射堆栈与 Newell-Earcut 三角剖分实现多层屋檐/悬挑 100% 完整复原；② 针对 IFC 离散三角面导致的破碎表面，自研空间哈希折角法向重构算法（`computeCreasedNormals`，`creaseAngle = 55°`），将粗糙三角面重构为平滑连续曲面，同时精确锁死 90° 结构锐边；③ 门窗洞口布尔减运算（CSG）与金属拉伸网程序化识别。
  - **English**:
    1. **Comprehensive README.md Restructuring & Accurate Feature Matrix**: Corrected inaccurate format claims in legacy documentation (removed unintegrated OBJ/MTL, STL, PLY; focused strictly on released IFC 2x3/4/4.3, GLTF/GLB, FBX, and COLLADA .dae); systematically added Multi-Version IFC Comparison Mode, CAD-standard dual-direction marquee selection, viewport-centered elevation presets, 50-step view history, Stencil Buffer solid capping, and universal 3D animation bar.
    2. **Detailed Superior Geometric Precision & Creased Normal Smoothing**: Highlighted proprietary IFC parser strengths surpassing commercial tools: ① Full recursive mapped item traversal and Newell-Earcut triangulation solving commercial tool bugs where only topmost roof tiers render; ② Proprietary spatial-hashed creased normal reconstruction (`computeCreasedNormals`, 55° threshold) transforming faceted tessellations into smooth continuous curved surfaces while preserving sharp 90° structural edges; ③ Real-time CSG wall void cutouts and procedural expanded mesh detection.

---

## [v1.2610062100] - 2026-10-06 21:00

### 双版本参数化构建系统与品牌所有权隔离 / Dual-Variant Parametric Build System & Ownership Isolation
- **一式两份构建发布架构 / Single Source of Truth Dual-Edition Architecture**
  - **中文**:
    1. **A/B 双版本独立配置与参数化注入**: 构建系统全面重构，支持通过 `variant_config.json` 集中管理 Variant A (`BIM Scope`) 与 Variant B (`SWBIM Scope`) 的品牌标识、所有权元数据、文件名称及输出路径。
    2. **版本 A (BIM Scope)**: 所有者设为 `WWBIM`（注入至 HTML `<meta name="author">`、`<meta name="creator">` 与注释中，界面无侵入）；顶部导航栏 Logo 切换为专属 WW Logo（`logo_ww_b64`）；软件名称为 `BIM Scope`；生成独立 `BIMScope.html` 及镜像 `index.html`。
    3. **版本 B (SWBIM Scope)**: 所有者设为 `Samwoh Corporation, Wang Wei`（注入至 HTML 元数据与注释中）；顶部导航栏保留原红色 Samwoh Logo（`icon_red_b64`）；软件名称设为 `SWBIM Scope`；生成独立 `SWBIMScope.html` 及镜像 `index.html`。
    4. **3D 视口水印统一保护**: 两个版本的 3D 视口左下角半透明水印图标均统一保持为 WW Logo，所有 3D 渲染核心、解析引擎与交互功能 100% 保持一致与零差异同步。
    5. **一键同步与构建脚本 (`sync_variant_b.py`)**: 提供一键脚本自动将源项目（`BIM Scope/Project`）的代码、依赖库、文档自动同步至对等目录（`SWBIM Scope/Project`），并在目标目录独立编译 Variant B 单文件发行版至工程根目录及 `Deliverables` 文件夹，附带 Account B Git 仓库就绪初始化指令。
  - **English**:
    1. **Centralized A/B Variant Parametric Configuration**: Fully modularized build architecture governed by `variant_config.json`, maintaining a single source of truth for Variant A (`BIM Scope`) and Variant B (`SWBIM Scope`).
    2. **Edition A (BIM Scope)**: Owned by `WWBIM` (injected in `<meta name="author">`, `<meta name="creator">`, comments; hidden from UI); top navbar displays WW Logo (`logo_ww_b64`); brand name set to `BIM Scope`; outputs `BIMScope.html` and root mirror `index.html`.
    3. **Edition B (SWBIM Scope)**: Owned by `Samwoh Corporation, Wang Wei`; top navbar retains original Samwoh logo (`icon_red_b64`); brand name set to `SWBIM Scope`; outputs `SWBIMScope.html` and root mirror `index.html`.
    4. **Unified Viewport Watermark Protection**: Both editions preserve the WW logo watermark at the bottom-left of the 3D viewport, while 100% sharing identical Three.js engines, parser modules, shaders, and features.
    5. **Automated One-Click Sync & Build (`sync_variant_b.py`)**: One-click synchronization utility mirroring sources, libraries, and docs from `BIM Scope/Project` to `SWBIM Scope/Project`, automatically compiling Variant B deliverables and providing Git setup guidelines for Account B.

---

## [v1.2610060030] - 2026-10-06 00:30

### 多格式模型副标题与元数据档案全局联动、FBX加载与双语切换加固 / Multi-Format Model Subtitle & Inspector Metadata Profile Sync
- **标题栏副标题统一工程规范与检查器模型档案对齐 / Unified Title Bar Engineering Subtitle & Inspector Alignment**
  - **中文**:
    1. **多格式副标题统一格式规范**: 标题栏模型文件名下方小字副标题全局适配所有支持格式（IFC、FBX、DAE、glTF/GLB 以及演示模型），彻底淘汰原先加载非 IFC 模型时残留初始演示模型建筑描述的缺陷。统一采用紧凑工程格式：`格式版本 | 导出软件: ... | 单位: ... (轴向) | GIS: ... (若有)`，当文件缺少对应字段时优雅显示为“未指定 / Unspecified”。
    2. **深层元数据解析引擎拓展**: 在 `FBXLoader.js` 中新增版本（`FBXHeaderExtension.Version`）、原导出软件（`Creator`）、单位缩放比例（`UnitScaleFactor`）、上轴向（`UpAxis`）及 GIS 坐标参考系扫描；在 `ifc_parser.js` 中解析 `IFCPROJECTEDCRS` 与 `IFCGEOGRAPHICCRS`；在 DAE 解析中提取 COLLADA 版本号、导出工具软件及地理位置。
    3. **FBX 加载健壮化修复**: 修正了 `loadFBXModel` 中形参未定义引起的 `ReferenceError` 异常中断，确保真实 FBX 模型全流程完整载入并准确呈现元数据。
    4. **检查器「模型档案」属性卡片与双语即时联动**: 右侧检查器未选中构件时显示的“模型档案”属性卡片与副标题 100% 数据同步，新增“单位与坐标朝向”及“GIS 地理坐标系”展示行；切换中英文时即时刷新，无需重新加载模型，且智能保护已载入模型的文件名不被默认演示名覆盖。
  - **English**:
    1. **Unified Multi-Format Subtitle Engineering Standard**: Subtitle beneath model name dynamically displays compact engineering metadata across all supported formats (IFC, FBX, DAE, glTF/GLB, Demo Model), replacing residual architectural demo text. Standardized structure: `Format Version | Software: ... | Unit: ... (Axis) | GIS: ... (if present)`, gracefully falling back to "Unspecified".
    2. **Deep Format Metadata Extraction**: Extended `FBXLoader.js` to parse FBX version, Creator, unit scale, up-axis, and GIS coordinate reference; integrated `IFCPROJECTEDCRS`/`IFCGEOGRAPHICCRS` in `ifc_parser.js`; extracted COLLADA version, authoring tool, and geolocation in DAE loader.
    3. **Robust FBX Loader Exception Fix**: Fixed a `ReferenceError` caused by undefined variable reference in `loadFBXModel`, ensuring seamless loading and full metadata propagation for real-world FBX models.
    4. **Inspector 'Model Profile' Synchronization & Bilingual Zero-Reload Switching**: The right-hand Model Profile inspector card synchronizes fully with the header subtitle, adding "Unit & Orientation" and "GIS / Coordinate Reference". Instant bilingual language toggle dynamically re-renders both header and inspector without reloading the model.

---

## [v1.2610052300] - 2026-10-05 23:00

### 最底部构件类型（Elements）溢出渐变内阴影与平滑滚动 / Bottom Bar Elements Overflow Edge Shadow & Smooth Scroll
- **构件分类标签溢出碰撞防护与平滑渐变内阴影 / Overflow Detection & Leftward Gradient Inner Shadow**
  - **中文**:
    1. **构件分类标签溢出内阴影指示**: 当底部栏 Elements 构件分类标签过多而延伸至右侧并被坐标值及性能 HUD 遮挡时，自坐标区域左侧边缘向左侧动态渲染平滑的渐变内阴影（Edge Shadow Gradient），与标签页溢出时的视觉质感保持一致，直观提示用户右侧存在未展示完全的标签内容。
    2. **鼠标滚轮横向平滑滚动与动态显隐**: 支持光标位于底部栏时直接通过鼠标滚轮进行水平平滑滚动（`deltaY` 转化为横向位移）；实时监听滚动位置与视口缩放尺寸，当滚动至末端时自动渐隐阴影。
  - **English**:
    1. **Elements Overflow Edge Inner Shadow**: When category chips in the bottom bar overflow and collide with the right-side coordinates and performance HUD, dynamically renders a smooth leftward gradient inner shadow starting from the left boundary of the coordinates section.
    2. **Horizontal Wheel Scrolling & Dynamic Shadow Visibility**: Direct mouse-wheel horizontal scrolling over the bottom bar; continuously monitors scroll position and viewport resize, smoothly fading out the shadow when scrolled to the end.

---

## [v1.2610052230] - 2026-10-05 22:30

### CAD 制图级鼠标交互与双向矩形框选 / CAD-Standard Marquee Box Selection & Surface-Pivot Orbit
- **鼠标按键交互体系升级与专业框选规则 / Mouse Interaction Overhaul & Window/Crossing Selection**
  - **中文**:
    1. **鼠标按键功能精细化重构**: 鼠标左键专用于点击选择与拖拽矩形框选；鼠标中键按住为平移（Pan）；鼠标右键短按弹出上下文操作菜单，长按拖拽则改为以光标当前所指构件表面空间坐标为轴心的精准环视（Surface-Pivot Orbit）。
    2. **CAD 专业实线窗口 vs 虚线交叉框选**: 向右拖拽展示实线蓝色选框（Window Selection，仅选中 100% 处于选框内部的构件）；向左拖拽展示虚线绿色选框（Crossing Selection，构件任意部分与选框相交或位于框内即被选中）。
    3. **组合框选与批量操作**: 按住 Ctrl 拖拽进行追加选择（并集），按住 Shift 拖拽进行去除选择（差集）；多选构件在右侧检查器提供批量显隐、批量隔离、批量缩放（Zoom to）、批量透明度滑块及公共属性集求交汇算。
  - **English**:
    1. **Mouse Control Layout Refactor**: Left mouse button exclusively handles click selection and marquee box drag; middle mouse drag handles Pan; right click opens context menu, while right drag performs Orbit rotating precisely around the surface point under cursor.
    2. **CAD-Standard Window vs. Crossing Selection**: Dragging to the right renders a solid blue border (Window Selection, selecting elements completely enclosed); dragging to the left renders a dashed green border (Crossing Selection, selecting elements intersecting or enclosed).
    3. **Composite Box Selection & Batch Operations**: Ctrl-drag adds to selection (Union), Shift-drag subtracts from selection (Difference). Multi-selection inspector card provides batch visibility toggle, isolation, Zoom to, unified opacity slider, and intersected property sets.

---

## [v1.2610052130] - 2026-10-05 21:30

### 左右面板收起按钮原地不动定位与浮动标题平滑滑移动画 / Stationary Sidebar Toggle Buttons & Smooth Floating Title Animations
- **收起/展开控制按钮绝对坐标锁定与视口浮动标题动效 / Stationary Toggle Anchor & Viewport Floating Title Transitions**
  - **中文**:
    1. **左右收起/展开按钮零跳动原地定位**: 消除原先面板收起后按钮因坐标硬编码（`top: 50px`）而向上跳动 6px 的视觉颠簸。重构左右面板头部布局（`.sidebar-header` / `.inspector-header`）为弹性绝对定位，确保无论面板处于展开、过渡中还是完全收起状态，左侧按钮恒定停留在 `(left: 14px, top: 56px)`、右侧按钮恒定停留在 `(right: 14px, top: 56px)`，像素级原地不动。
    2. **面板标题 3D 视口浮留与对齐**: 面板收起后标题文字不再隐藏，而是优雅浮留在 3D 视口上方。左侧 `MODEL HIERARCHY`（模型层级）停留在左侧按钮右侧 8px 处并保持左对齐；右侧 `INSPECTOR`（构件检查器）停留在右侧按钮左侧 8px 处并保持右对齐。
    3. **0.25s 同步贝塞尔平滑滑移动画**: 为面板标题加入平滑滑移动画（`cubic-bezier(0.4, 0, 0.2, 1)`），在面板收起过程中，标题文字从面板居中位置平滑无缝地滑移至按钮旁靠泊；展开时亦同步平滑回弹归位至面板中心。
    4. **高对比度文字阴影与视口穿透**: 标题文字增加复合暗部文本阴影（`0 1px 4px rgba(0, 0, 0, 0.8)` 与微晕），在掠过任意高亮或白色建筑模型表面时均清晰可辨，并设置 `pointer-events: none` 确保不干扰视口内三维交互。
  - **English**:
    1. **Stationary Sidebar Toggle Buttons (Zero-Jump Positioning)**: Completely eliminated the 6px upward jump previously caused by hardcoded collapsed offsets. Re-engineered header layouts to maintain exact pixel coordinates (`left/right: 14px, top: 56px`) regardless of whether panels are expanded, transitioning, or collapsed.
    2. **Persistent Viewport Floating Titles & Alignment**: Sidebar titles remain visible over the 3D viewport when collapsed. Left "MODEL HIERARCHY" docks left-aligned 8px to the right of the left toggle; right "INSPECTOR" docks right-aligned 8px to the left of the right toggle.
    3. **Synchronous 0.25s Smooth Bezier Slide Animation**: Added synchronized slide transitions (`0.25s cubic-bezier(0.4, 0, 0.2, 1)`) so titles glide between their centered header positions and docked positions beside the toggle buttons during collapse/expand.
    4. **High-Contrast Text Shadows & Viewport Click-Through**: Enhanced title readability over bright 3D geometry using text drop shadows (`0 1px 4px rgba(0, 0, 0, 0.8)`), with `pointer-events: none` for uninterrupted 3D interaction.

---

## [v1.2610052050] - 2026-10-05 20:50

### 右面板控件精简与聚焦操作命名统一 / Right Panel UI Streamlining & 'Zoom to' Label Alignment
- **右侧检查器卡片精简与构件操作词条规范 / Inspector UI Streamlining & Action Label Consistency**
  - **中文**:
    1. **移除右面板冗余的 Dist（可视距离）滑块**: 彻底移除右侧检查器首选项卡片（`.inspector-pref-card`）中重复的 Dist 滑动条，统一由左侧边栏“相机与可视距离”（`#tab-camera-content`）专属面板进行精细化控制与预设档位（1km~10km）管理，优化右面板纵向排版空间。
    2. **构件操作按钮更名（Zoom to）**: 将右面板选中构件后的聚焦按钮由原先冗长的 "Zoom drawing" 更名为标准、凝练的 "Zoom to"（中文保持 "聚焦构件"），与视口右键上下文菜单中的 "Zoom to" 保持 100% 词义与风格统一。
  - **English**:
    1. **Removed Redundant 'Dist' Slider from Right Panel**: Eliminated the duplicate Dist slider from the right Inspector preference card (`.inspector-pref-card`). Camera visible distance is now exclusively managed via the dedicated Left Sidebar Camera & Far Distance tab (`#tab-camera-content`), decluttering the right panel.
    2. **Renamed Inspector Selection Button to 'Zoom to'**: Renamed the right-hand element action button from "Zoom drawing" to "Zoom to" (keeping "聚焦构件" in Chinese), achieving consistency with the 3D viewport context menu.

---

## [v1.2610052040] - 2026-10-05 20:40

### 高亮色纯度保真与全表面一致性校准（消除阳光漫反射漂白） / Pure Chroma Selection Highlight & Surface Color Uniformity Fix
- **高亮材质纯净度重构与多表面色值统一 / Pure Chroma Material Refactor & Multi-Surface Uniformity**
  - **中文**:
    1. **消除平行光漫反射冲淡与顶面漂白**: 针对此前因 `MeshLambertMaterial` 响应场景平行阳光照射，导致构件上表面受直射光强反射影响而发白变淡（如洋红 `#FF00FF` 被漂白冲淡成粉白色 `#ff92fa`，与侧表面 `#ff45ee` 及底面 `#f11de5` 出现色彩不一致且饱和度受损）的问题，全面重构高亮覆盖层为纯净非光照材质 `MeshBasicMaterial`。
    2. **100% 色彩饱和度与各表面色彩高度一致**: 彻底剥离场景主平行光漫反射和高光对高亮像素的冲淡污染，使构件无论顶面、侧面、斜面还是背光底面，均呈现 100% 纯正且一致的高亮设定色，达到专业 CAD/BIM 选中着色的最大饱和度与最高辨识度。
    3. **基于 EdgeLines 轮廓的高保真立体感**: 继续维持构件建筑特征轮廓线（`EdgeLines`）的极高绘制优先级（`renderOrder = 2000`），构件边缘线（如屋面立边咬缝、转角线条）在纯色高亮图层上始终锐利清晰，完美支撑三维体积感，彻底兼顾“纯正饱和的高亮色彩”与“清晰分明的空间立体轮廓”。
  - **English**:
    1. **Elimination of Sunlight Bleaching on Top Faces**: Addressed the issue where lighting-aware materials (`MeshLambertMaterial`) reacted to the scene's directional sunlight, causing top surfaces to be bleached and washed out (e.g. Magenta `#FF00FF` becoming pinkish `#ff92fa` while side and bottom faces varied). Refactored selection overlays to pure unlit `MeshBasicMaterial`.
    2. **100% Pure Chroma & Consistent Surface Hue**: Stripped away directional light interference, guaranteeing that top, side, and bottom faces all render with identical, pure chroma and 100% color saturation matching the user-selected highlight color.
    3. **Volume Definition via EdgeLines Preservation**: Preserved `renderOrder = 2000` for architectural `EdgeLines`, ensuring razor-sharp edges float cleanly over the pure highlight layer to maintain full 3D spatial depth.

---

## [v1.2610052030] - 2026-10-05 20:30

### 构件选中高亮算法重构与轮廓线保真 / Selection Highlight Algorithm Refactor & Edge Preservation
- **高亮渲染管线与透明度衰减算法重构 / Highlight Pipeline & Multi-Tier Opacity Linearization**
  - **中文**:
    1. **轮廓线（EdgeLines）渲染层级提升**: 将场景所有构件建筑边缘特征线（`EdgeLines`）的渲染顺序从 `renderOrder = 2` 提升至 `renderOrder = 2000`，并将高亮覆盖网格（`isHighlightOverlay`）与悬停覆盖网格的渲染顺序设定为 `renderOrder = 1`。彻底解决原先因高亮网格（999）最后绘制而将底层黑色轮廓线覆盖、洗白并抹除的缺陷，无论何种高亮透明度，边缘特征线（如立边咬缝、门窗洞口边框、墙脊线）始终 100% 锐利清晰可见。
    2. **阻断闭合几何体重叠透光翻倍（消除 DoubleSide 饱和溢出）**: 修正原算法中对所有构件统一强制使用 `DoubleSide` 透明覆盖的问题。闭合三维立体构件在无深度写入下绘制双面会导致前后两层半透明像素重叠累乘（实际透光率为 $2\alpha - \alpha^2$），导致 30% 滑块对应 51% 饱和度、65% 对应 88%、80% 对应 96%，造成透明度仅在 10%~15% 轻微有效的视觉假象。现重构为智能继承几何体表面朝向（`FrontSide`），实现物理单层着色，使透明度滑块在 10%~100% 全量程内均获得均匀、灵敏且线性自然的视觉过渡。
    3. **光照感知材质渲染（MeshLambertMaterial）**: 将原先无光照漫反射的扁平纯色材质 `MeshBasicMaterial` 升级为具备漫反射与自发光复合管线的 `MeshLambertMaterial`。高亮层自然承载太阳光照、法线方向与暗部阴影（附带 22% 适度发光辉光），彻底告别塑料贴片般的二维扁平面块，完美保留构件三维立体空间体积感。
    4. **多材质数组安全遍历与即时渲染响应**: 修复多材质模型在动态调节高亮颜色与透明度时因材质数组导致的属性更新异常，并加入 `needsRender = true` 实时刷新管线。
  - **English**:
    1. **EdgeLines Render Order Elevation**: Raised architectural contour edge lines (`EdgeLines`) rendering precedence from `renderOrder = 2` to `renderOrder = 2000`, while anchoring selection and hover overlays at `renderOrder = 1`. This completely eliminates the issue where highlight overlays painted over and obscured the dark architectural edges.
    2. **Eliminated Closed-Mesh Opacity Compounding**: Addressed the double-layer opacity stacking bug caused by unconditional `THREE.DoubleSide` on closed volumes without depth write. Restructured overlays to adhere to single-layer exterior surfaces (`FrontSide`), linearizing the perceived opacity progression across the entire 10% to 100% slider range.
    3. **Lighting-Aware Shading with MeshLambertMaterial**: Upgraded from unlit `MeshBasicMaterial` to lighting-responsive `MeshLambertMaterial` with subtle emissive boost (22%), preserving sunlight reflection, normal shading, and ambient occlusion for authentic 3D architectural depth.
    4. **Multi-Material Array Safety & Instant Viewport Render**: Hardened material traversal in `updateHighlightAppearance` to gracefully handle sub-mesh material arrays, ensuring instant visual feedback upon dragging the opacity slider.

---

## [v1.2610052000] - 2026-10-05 20:00

### 左右面板标签栏鼠标滚轮滚动防回弹修复 / Left & Right Panel Tabs Mouse-Wheel Scroll Stability Fix
- **标签栏鼠标滚轮横向滚动定位与防自动回弹 / Scroll-Position Retention & Anti-Springback**
  - **中文**:
    1. **事件冒泡误触发链阻断**: 排查并修复了侧边栏过渡结束事件（`transitionend`）冒泡导致视口重算的问题。原代码中遮罩阴影渐变（`.tabs-edge-shadow`）与箭头控件的 CSS `opacity` 过渡在滚轮滚动产生溢出时结束并向上传递至 `#left-sidebar` 与 `#right-sidebar`，误触发了 `onContainerResize()`；现已严格限制仅对侧边栏容器自身的展开/折叠（`width`/`transform`）进行重算。
    2. **滚动位置防重置与关注逻辑解耦**: 将“根据活动标签自动滚入视野”（`scrollActiveSidebarTabIntoView` / `scrollActiveInspectorTabIntoView`）与“滚轮事件监听及阴影指示计算”（`setupSidebarTabsScroll` / `updateSidebarTabsOverflow`）完全解耦。鼠标滚轮浏览其他标签栏、窗体缩放或侧边栏拉伸时仅更新边缘阴影和翻页箭头指示，绝不重置用户滚轮滚到的任意横向偏移位置。
    3. **移除全局 CSS smooth 滚动冲突**: 移除 `.sidebar-tabs-nav` 与 `.inspector-tabs-nav` 容器上的全局 `scroll-behavior: smooth`，杜绝连续鼠标滚轮刻度累加时由于中间平滑补间动画位置滞后造成的滚轮卡顿与位置截断；而箭头按钮点击与标签切换继续保持专属平滑滚入动画。
    4. **双向滚轮与触控板自适应**: 统一支持鼠标滚轮垂直轴（`deltaY`）及触控板水平手势（`deltaX`）平滑横向滚动，并在左右两面板均经真实浏览器测试保持零回弹。
  - **English**:
    1. **Transitionend Bubbling Isolation**: Fixed an issue where CSS `opacity` transitions on inner tabs edge shadows (`.tabs-edge-shadow`) and chevron buttons bubbled `transitionend` events up to `#left-sidebar` and `#right-sidebar`, inadvertently triggering `onContainerResize()`. Now strictly guards `transitionend` handlers to only react to sidebar container's own `width` or `transform` transitions.
    2. **Decoupled Active Tab Focus from Generic Scroll & Overflow Updates**: Separated `scrollActiveSidebarTabIntoView` / `scrollActiveInspectorTabIntoView` from regular overflow and resize updates. Scrolling with mouse wheel or resizing panels will stably retain the user's horizontal scroll offset without snapping back to tab 0.
    3. **Eliminated CSS Smooth-Scroll Wheel Interference**: Removed `scroll-behavior: smooth` from `.sidebar-tabs-nav` and `.inspector-tabs-nav` to eliminate frame throttling and position truncation during rapid mouse wheel ticks, while preserving silky programmatic smooth transitions on chevron clicks and tab switching.
    4. **Dual-Axis Wheel & Trackpad Support**: Enhanced horizontal scroll responsiveness for both mouse vertical wheels (`deltaY`) and trackpad swipe gestures (`deltaX`) across left and right panels.

---

## [v1.2610051945] - 2026-10-05 19:45

### COLLADA (.dae) 原生支持与通用动画播放器 / Native COLLADA (.dae) Support & Universal Animation Player
- **原生 COLLADA (.dae) 格式解析与建筑渲染管线 / Native COLLADA (.dae) Format Engine**
  - **中文**:
    1. **原生无依赖离线支持**: 集成 Three.js r128 官方 `ColladaLoader.js`，实现对 COLLADA (`.dae`，支持 1.4.1 与 1.5 规范) 三维模型的纯前端离线解析，无需任何后端服务或外部转码。
    2. **公制比例与坐标轴自动归一化**: 深度提取 DAE `<asset>` 元数据，严格解析 `<unit meter="..."/>` 与 `<up_axis>`（`Z_UP`、`Y_UP`、`X_UP`），自动按真实米制比例缩放并矫正世界坐标系至建筑场景（Y 为高程标高），确保与项目 IFC 及 GLTF/GLB 坐标基准 100% 吻合。
    3. **双面材质渲染（DoubleSide）与建筑轮廓线**: 针对 Trimble SketchUp、AutoCAD 等导出 DAE 时常见的反面镂空与背面剔除漏光问题，全量强制启用 `THREE.DoubleSide` 渲染；并自动生成特征边缘轮廓线（Architectural Edges），保持手绘施工图般的清晰立体质感。
    4. **双模混合层级树与语义分类**: 智能识别构件名、材质名及节点路径中的建筑语义关键词（Wall、Slab、Column、Beam、Roof、Door、Window 等），自动归纳进结构、楼层与分类面板；无关键词时无缝回退至 DAE 视觉场景图（Visual Scene Graph）。
    5. **分离贴图装配模态框**: 复用通用贴图解析器与智能模糊/跨扩展名匹配逻辑，当 DAE 引用外部缺失贴图时即时弹出交互式贴图装配窗口，支持拖拽批量补齐或纯色跳过加载。
  - **English**:
    1. **100% Client-Side Offline Support**: Integrated official Three.js r128 `ColladaLoader.js` into the standalone single-file viewer, providing full native loading for COLLADA (`.dae`, 1.4.1 & 1.5) without backend dependencies or server transcoding.
    2. **True Metric Scale & Up-Axis Normalization**: Accurately parses `<unit meter="..."/>` and `<up_axis>` (`Z_UP`, `Y_UP`, `X_UP`), converting models to authentic metric scale with Y as elevation, guaranteeing seamless alignment with IFC and GLTF models.
    3. **DoubleSide Material Enforcement & Architectural Edges**: Forces `THREE.DoubleSide` on all DAE materials to eliminate SketchUp back-face culling holes and backface transparency artifacts. Automatically extracts coplanar-filtered architectural contour edge lines.
    4. **Dual-Mode Hybrid Hierarchy Tree**: Automatically parses architectural keywords (Wall, Slab, Column, Beam, Roof, Door, Window, etc.) into structured BIM categories; gracefully falls back to raw visual scene graph nodes for non-architectural assets.
    5. **Separated Texture Modal Integration**: Seamlessly connects to the interactive texture assembly modal when external texture files are referenced, supporting multi-batch drag-and-drop resolution or clean solid shaded fallback.

- **通用动画播放器栏（#animation-player-bar，支持 DAE、FBX 与 GLTF） / Universal Animation Player Bar**
  - **中文**:
    1. **视口底部悬浮播放器**: 在 3D 视口底部正中（图钉图例上方）设计高品质悬浮胶囊播放条（半透明毛玻璃背景、青色光晕与紧凑流线控件），**同时支持 DAE、FBX 与 GLTF 模型的三维动画与骨骼驱动播放**。
    2. **智能显隐**: 当模型包含动画剪辑（AnimationClips）时自动优雅滑出显示；对于静态建筑模型（IFC、静态 DAE/FBX/GLTF）自动保持隐藏，绝不遮挡视口。
    3. **全功能交互控制**:
       - **播放/暂停切换**: 包含动态 SVG 图标切换与无缝暂停恢复；
       - **实时进度条与时间游标**: 毫秒级时间读数（`00:02.5 / 00:05.0`），支持鼠标滑块任意拖拽定位（Scrubbing）并在拖拽过程中实时静帧驱动三维模型姿态；
       - **循环播放切换**: 单击快速切换无限循环（`LoopRepeat`）或单次播放后自动定格静止（`LoopOnce`）；
       - **四档倍速循环切换**: 单击依次循环切换 `0.5x` -> `1.0x` -> `1.5x` -> `2.0x`；
       - **多动画片段选择下拉框**: 当模型包含多个动画通道时自动呈现紧凑下拉菜单供用户随时切换片段。
  - **English**:
    1. **Bottom-Center Floating Capsule Player**: Positioned at the bottom center of the 3D viewport with frosted glass backdrop, cyan accent glow, and compact layout, natively supporting transform and skeletal animations across **DAE, FBX, and GLTF models**.
    2. **Intelligent Visibility**: Automatically emerges when an animated model is loaded, and stays completely hidden for static models to preserve an uncluttered viewport canvas.
    3. **Comprehensive Interactive Controls**:
       - **Play/Pause Toggle**: Interactive button with animated SVG icon switching and smooth pause resumption;
       - **Time Scrubber Slider**: Millisecond-accurate timestamp display (`00:02.5 / 00:05.0`) with real-time pose scrubbing during slider dragging;
       - **Loop Mode Toggle**: Toggles between infinite repeat (`LoopRepeat`) and single-pass clamp (`LoopOnce`);
       - **Multi-Speed Cycling**: Cycles playback speed across `0.5x`, `1.0x`, `1.5x`, and `2.0x`;
       - **Multi-Clip Dropdown**: Automatically surfaces a clip selector dropdown when multiple animation tracks exist in the file.

---

## [v1.2610042233] - 2026-10-04 22:33

### 悬停交互与材质高亮优化 / Hover Feedback & Material Lighting
- **鼠标指上构件改用 10% 透明度白色叠加层 / Translucent 10% White Hover Overlay**
  - **中文**: 优化鼠标滑过 3D 构件时的动态悬停高亮逻辑。此前加法混合（Additive Blending）在浅色材质（如白色混凝土、金属屋顶、浅色木材）上容易因光强相加造成高光过曝、将构件彻底泛白为纯白色；现调整为标准透明混合（`NormalBlending`），覆盖一层半透明度仅为 10%（`opacity: 0.10`）的白色蒙版（透明玻璃构件进一步降为 5%）。保留构件原有纹理、色泽及阴影细节的同时，提供极其克制、细腻的浅白色交互提亮反馈。
  - **English**: Refined the 3D element cursor hover feedback. Previously, additive blending caused light-colored materials (such as standing-seam zinc roofing, concrete pads, and timber siding) to clip to solid white highlights; transitioned to standard normal blending (`NormalBlending`) with a delicate 10% translucent white overlay (`opacity: 0.10`, dialed down to 5% for transparent glass panels). Preserves the element's authentic base hue, material textures, and shadows while offering subtle, elegant interactive visual feedback.

---

## [v1.2610042226] - 2026-10-04 22:26

### 交互优化与右键操作逻辑 / Interaction Refinement & Context Menu Logic
- **右键上下文菜单不改变构件选中状态 / Context Menu Preserves Component Selection**
  - **中文**: 彻底重构 3D 视口右键菜单（Context Menu）操作逻辑。移除此前在右键按下时强制对鼠标落点进行射线拾取、并自动改选鼠标下构件（或空白处取消选中）的旧逻辑，改为**右键操作完全不改变构件的选中状态**。用户先前无论是在视口中左键选定还是在左侧层级树中选中的构件，在视口任意位置（甚至临近构件或空白处）点击右键均严格针对当前已选构件弹出「隐藏」、「隔离」、「聚焦（Zoom to）」及「局部剖切盒」等操作，彻底避免因鼠标轻微偏移误选邻近构件或丢失选中的问题。若当前无任何构件被选中，在画面任意处点击右键均呈现视口全局菜单（「显示全部」、「全景居中」、「重置初始视图」），交互更加符合专业 CAD/BIM 直觉。
  - **English**: Completely refactored the 3D viewport right-click context menu interaction logic. Removed the legacy behavior where right-clicking performed raycasting under the cursor and forcefully mutated or cleared component selection. Right-clicking now strictly preserves the active selection state without alteration. All context actions (Hide, Isolate, Zoom to, Section Box) reliably target the user's intentionally selected element even if the right-click occurs near adjacent meshes or in blank space. If no element is selected, right-clicking anywhere consistently presents the global canvas actions (Show All, Fit to Model, Reset View), eliminating unintended selection changes caused by cursor drift.

---

## [v1.2610042220] - 2026-10-04 22:20

### 视图导航历史与撤销/重做引擎 / View History & Undo/Redo Engine
- **50 步视图导航历史栈（Undo / Redo）与同款圆角导航按钮组 / 50-Step Camera Navigation History Stack & Matching Rounded Button Group**
  - **中文**: 
    1. 在 3D 视口上方快速视图工具区的 `Persp` 按钮右侧新增一对紧凑视图导航历史按钮——「上一视图（Undo Navigation）」与「下一视图（Redo Navigation）」，封装在同款风格圆角矩形边框（`.btn-group`）内，保持视觉层级与交互语言高度统一。
    2. 采用高效、无性能损耗的 50 步轻量化历史栈引擎（单步快照仅 ~150 字节，50 步仅占约 7.5 KB 内存）。
    3. 全面覆盖并自动记录用户各类视角操作：鼠标左键轨道旋转（Orbit）、右键/中键平移（Pan）、滚轮游标缩放（Wheel Zoom，300ms 去抖聚合）、视角预设切换（Iso, Plan, N, S, E, W）、透视/正交切换（Persp/Ortho）、右键与检查器聚焦（Zoom to）、全景居中（Fit View）以及 3D 罗盘立方体旋转交互。
    4. 支持按键快捷键 `Alt+ArrowLeft`（后退/上一视图）与 `Alt+ArrowRight`（前进/下一视图），遵循主流建筑 CAD / BIM（Revit、ACC）操作直觉。
    5. 实现 350ms 平滑相机补间动画与状态防抖、历史分叉智能修剪（分支导航时清空多余前进未来）、首尾边界自动灰显禁用（`.tool-btn:disabled` 半透明且拦截点击），并在中英文切换时即时同步工具提示文案。
  - **English**:
    1. Added a pair of compact View History navigation buttons—"Previous View (Undo Navigation)" and "Next View (Redo Navigation)"—immediately to the right of the `Persp` projection button within `#nav-center-views`. Styled in an identical rounded rectangular group frame (`.btn-group`, 28px height, 5px border-radius, 2px inset padding) for pixel-perfect design alignment.
    2. Implemented a zero-overhead 50-step circular camera snapshot stack (~150 bytes per snapshot, ~7.5 KB total memory footprint).
    3. Automatically tracks and debounces all camera interactions: orbit rotation, right/middle-button panning, cursor-guided wheel zooming (coalesced via 300ms debounce timer), preset view jumps (Iso, Plan, N, S, E, W), projection switching (Persp/Ortho), right-click & Inspector Zoom-to framing, Fit View resets, and 3D compass cube interactions.
    4. Wired standard CAD/BIM keyboard shortcuts `Alt+ArrowLeft` and `Alt+ArrowRight` for fluid keyboard-driven viewpoint traversal.
    5. Equipped with 350ms cubic easing tween transitions, animation cancellation protection against overlapping clicks, intelligent branch pruning upon fresh navigation, reactive disabled states at stack boundaries, and dynamic bilingual tooltips across English and Chinese.

---

## [v1.2610042205] - 2026-10-04 22:05

### 视角与构件聚焦优化 / Viewport & Component Framing
- **右键 Zoom to 构件聚焦比例提升至 70% / Increased Zoom to Component Occupancy to 70%**
  - **中文**: 将右键菜单「聚焦到构件（Zoom to）」及检查器「全景居中（Zoom to Element / Group）」的视口画面占比从原先的 50% 显著提升至 70%。透视模式（Perspective）与正交模式（Orthographic）均严格以构件 3D 外接球直径占视口较窄维度（垂直高度）70% 为基准精确推算相机视线推进距离与正交视锥半高。构件特写更大、建筑细节更清晰，上下保留 15% 紧凑舒适的留白空间。
  - **English**: Upgraded the right-click "Zoom to" and Inspector framing occupancy ratio from 50% to 70%. In both Perspective and Orthographic camera modes, the target distance and frustum bounds are computed so the component's 3D bounding sphere diameter occupies 70% of the tighter viewport dimension (screen height). Produces closer, more detailed component inspection with balanced 15% breathing margins.

---

## [v1.2610042200] - 2026-10-04 22:00

### 界面重构与矢量图标升级 / UI Refinement & Vector Icons
- **Persp 斜向透视立方体图标与同款圆角矩形框 / Oblique Perspective Cube Icon & Matching Rounded Frame**
  - **中文**: 将透视按钮（Persp / 透视）的图标升级为具有真实建筑两点透视景深感的斜向透视立方体矢量图标（中脊垂直前凸，顶面及底面斜向两侧灭点汇聚延伸，与 Ortho 的等距平行轴测立方体形成直观、强烈的透视与正交对比）。同时为 Persp/Ortho 投影切换按钮配备与旁边工程视角预设组（Iso, Plan, N, S, E, W）完全同款同尺寸的圆角矩形框（`.btn-group`，外高 28px、内高 22px、5px 圆角、2px 边距内衬），实现顶栏控件风格的高度统一与像素级对齐。
  - **English**: Upgraded the Perspective toggle (Persp / 透视) SVG icon to an oblique 2-point perspective wireframe cube, featuring a prominent foreground vertical leading edge and dynamic convergence towards lateral vanishing points. This creates an immediate, intuitive visual contrast with Ortho's parallel isometric cube. Enclosed the Persp/Ortho toggle within an identical rounded rectangular group frame (`.btn-group`, 28px height, 5px border-radius, 2px inset), ensuring full visual parity with the adjacent quick view preset bar.

---

## [v1.2610042155] - 2026-10-04 21:55

### 缺陷修复与模型层级净化 / Bug Fixes & Hierarchy Sanitization
- **过滤剖切引擎内部 Stencil 模板缓冲辅助网格 / Filter Clipping Stencil Helper Meshes from Model Tree & Stats**
  - **中文**: 彻底排查并修复剖切引擎（Clipping Engine）实体剖面封口（Stencil Cap）辅助几何体被意外泄露至构件树与统计面板的缺陷。由于双通道 Stencil 算法为场景中 300 个实体构件各生成了 14 个辅助通道网格（合计 4,200 个），此前场景遍历时因缺少过滤条件，导致其被错误归入名为 `Model Structure`（类别 `Component`）的假节点中，且因名称为空全部显示为 `Element`、因 Gizmo 保护无法聚焦（Zoom to）。新增统一网格分类器 `isModelElementMesh()`，将这 4,200 个底层渲染辅助网格从构件树、底栏类别标签及三角面数统计中彻底排除。演示模型真实三角面数从虚高的 367,730 面精准回归真实的 27,866 面，真实构件数精准归位为 329 个。
  - **English**: Thoroughly diagnosed and resolved an issue where internal rendering helpers generated by the clipping engine's two-pass stencil capping pipeline leaked into the model hierarchy tree and statistics. For each of the ~300 solid villa meshes, 14 stencil passes (1 plane pair + 6 box face pairs = 4,200 meshes) are mounted on the scene graph. Without filtering, these were erroneously collected into a fallback `"Model Structure"` group as 4,200 `"Element"` leaves that could not be selected or zoomed to. Implemented a centralized `isModelElementMesh()` filter, completely isolating stencil gizmos from model trees, bottom legends, and geometry counters. The villa's reported triangle count dropped from an inflated 367,730 to its authentic 27,866 triangles, with authentic total elements cleanly reflected as 329.

---

## [v1.2610042146] - 2026-10-04 21:46

### 视觉与品牌呈现 / Visual & Brand Identity
- **3D 视口左下角轻量水印徽标 / Viewport Watermark Logo (Bottom-Left Corner)**
  - **中文**: 在 3D 主视口左下角无缝嵌入用户专属 WW Monogram 徽标，设定为 32px 物理尺寸与 20% 半透明度（`opacity: 0.2`），优雅对称呼应右下角 3D 罗盘。配置 `pointer-events: none` 与 `user-select: none`，确保所有鼠标交互（场景旋转 Orbit、平移 Pan、缩放 Zoom、构件拾取 Raycasting、右键菜单 Context Menu 及测量标定）零阻碍、完全无感穿透点击。采用 Base64 Data URI 原生内嵌，严格保持 100% 离线单文件架构。
  - **English**: Seamlessly embedded the user's custom WW monogram logo in the bottom-left corner of the 3D viewport canvas, sized at exactly 32px by 32px with 20% subtle opacity (`opacity: 0.2`) to symmetrically balance the 3D compass on the bottom right. Strictly configured with `pointer-events: none` and `user-select: none` to guarantee 100% click-through transparency, ensuring mouse orbit navigation, panning, zooming, raycast selection, context menus, and measurements operate completely unimpeded. Embedded via Base64 Data URI to uphold single-file zero-server offline portability.

---

## [v1.2610042140] - 2026-10-04 21:40

### 界面重构与优化 / UI Revamp & UX Enhancements
- **顶部工具栏层级精简与去重 / Top Toolbar Hierarchy Simplification & De-duplication**
  - **中文**: 移除顶部导航栏中与侧边栏功能重复且层级不一致的 6 个面板展开按钮（Section, Lighting, Camera, Labels, Model, Inspector），恢复顶栏轻量清爽布局；左侧模型树与右侧检查器完整保留原生停靠/折叠（Dock/Collapse）按钮。
  - **English**: Removed 6 redundant top toolbar panel toggles (Section, Lighting, Camera, Labels, Model, Inspector) whose hierarchies conflicted with sidebar tabs and dock toggles, establishing a clean, focused header while preserving dedicated sidebar dock/collapse buttons.
- **快速视角居中排列与 3D 视口自适应对齐 / Viewport-Centered Dynamic View Preset Bar**
  - **中文**: 将工程视角快捷按钮（Iso、Plan、N、S、E、W）保留在顶部栏，并在水平方向上严格对照 3D 视口（Viewport）物理中心动态实时居中排列。当左侧或右侧侧边栏折叠、展开或鼠标拖拽改变面板宽度时，视角工具栏自适应平滑追踪新视口中心，确保始终居于 3D 场景正上方。
  - **English**: Retained quick camera view presets (Iso, Plan, N, S, E, W) in the top navbar and dynamically aligned their horizontal center to the exact geometric midpoint of the 3D viewport canvas. The bar smoothly tracks and realigns in real-time as left/right sidebars resize or collapse.
- **独立正交/透视投影按钮与线框矢量图标 / Standalone Projection Toggle & Architectural Wireframe Icons**
  - **中文**: 将正交/透视切换从视角方向按钮组中独立解耦为单独按钮（`Persp` / `Ortho`，中文为 `透视` / `正交`）。设计并配备了高辨识度的工程线框 SVG 图标：透视模式下呈现具强烈景深汇聚感的一点透视立方体（Converging Perspective Cube），正交模式下呈现各边严格等距平行的轴测立方体（Parallel Isometric Cube），随中英双语与高亮活动状态无缝切换。
  - **English**: Decoupled the projection mode toggle from the directional presets into an independent button. Outfitted with high-contrast architectural wireframe SVG vector icons: a converging 1-point perspective tunnel cube for Perspective mode, and a strictly parallel isometric cube for Orthographic mode, supporting instant bilingual switching.
- **视野范围 (Dist) 滑动条迁移至检查器第一组 / Relocated Visible Distance Slider to Inspector Card**
  - **中文**: 将原顶栏的视野范围（Dist）读数与滑动条移至右侧检查器（Inspector）首组偏好卡片中，置于 3D 标签（3D Labels）正上方。滑动条排版与宽度严格参照已有控件对齐（115px 规范宽度与等宽数值），与左侧相机面板及快捷距离预设双向实时联动。
  - **English**: Relocated the camera visible distance (Dist) readout and slider into the inspector preferences card directly above 3D Labels. Slider width and layout strictly follow the established 115px standard, operating in full bidirectional synchronization with camera settings.

---

## [v1.2610042105] - 2026-10-04 21:05

### 新增与改进 / Added & Improved
- **项目累计总工时自动化精算与记录 / Automated Cumulative Development Time Tracking**
  - **中文**: 建立基于真实工程步骤与时间戳日志的工时精算模型（45分钟闲置阈值切片），精确统计项目自创建以来的累计有效开发工时（27.04 小时，跨 13 个活跃冲刺），并深度整合至单文件打包管线，实现每次发布自动精算、同步更新。
  - **English**: Integrated an automated engineering telemetry model calculating active development hours (27.04 hours across 13 sprints, 45-min idle cutoff) from granular transcript logs. Hooked directly into the compilation pipeline to guarantee automated re-calculation upon every build.
- **悬停高亮轻微提亮且不改变原色 / Subtle Additive Brightness Boost for Hovered Elements**
  - **中文**: 重构鼠标指向构件时的悬停着色策略。移除原有的生硬青蓝色蒙版（Cyan Overlay），改用基于构件自身真实色彩与纹理的加法混合模式（`THREE.AdditiveBlending`），在严格保持构件自身色相（Hue）和饱和度（Saturation）的前提下，仅施加轻微的柔和光晕提亮（Lightness Boost，透明度 16%，半透明构件 6%），消除刺眼高亮，观感沉稳柔和。
  - **English**: Overhauled hover highlight visual feedback. Replaced harsh cyan wash overlay with an additive blending overlay (`THREE.AdditiveBlending`) derived strictly from the element's authentic base color and texture map. Fully preserves the element's natural hue and saturation while imparting a gentle, sophisticated luminance lift (16% opacity, 6% for transparent elements) without color distortion.
- **检查器操作栏动态对齐透明度滑动条 / Dynamically Aligned Continuous Opacity Slider**
  - **中文**: 在右侧构件检查器（Inspector）中，在模型档案（Model Profile）与选中构件（Selected Element）卡片的操作按钮上方新增连续透明度调节滑动条（10% ~ 100%）。滑动条最右侧与下方“复制概要 / 全景居中 / 导出 JSON”3个按钮的最右边缘保持像素级动态对齐，侧边栏宽度改变时自适应缩放；支持实时透视建筑内部构造。
  - **English**: Introduced a continuous opacity adjustment slider (10% to 100%) in the right inspector panel directly above the action button row ("Copy Summary / Fit View / Export JSON" for model profile, and navigation buttons for selected components). The rightmost edge of the slider is dynamically and pixel-perfectly aligned with the right boundary of the button group across all sidebar widths, offering fluid real-time transparency inspection into building interiors.
- **项目目录结构规范化重组 / Project Workspace Directory Structure Consolidation**
  - **中文**: 将工作区完整归拢至 `H:\我的云端硬盘\Software Develop\BIM Scope\` 专属项目根目录下，保留核心代码库 `Project` 与独立离线交付目录 `Deliverables`，清理父级目录冗余副本与历史同步脚本。
  - **English**: Consolidated the active repository into the dedicated project root `H:\我的云端硬盘\Software Develop\BIM Scope\`, maintaining the active Git repo `Project` and offline release folder `Deliverables`, eliminating root-level folder redundancy and obsolete mirror scripts.

---

## [v1.2610041950] - 2026-10-04 19:50

### 新增功能 / Added
- **顶部工具栏正交/透视一键切换 / One-Click Orthogonal / Perspective Camera Projection**
  - **中文**: 顶部视图快捷栏原 `Fit` 按钮升级为一键切换相机投影模式的 `Persp` / `Ortho` 按钮（中文状态下为 `透视` / `正交`）。处于正交模式时按钮呈现鲜明的高亮青色活动状态（`.active`）。
  - **English**: Replaced the redundant 'Fit' button in the top view preset toolbar with a direct one-click toggle between Perspective and Orthographic projection (`Persp` $\leftrightarrow$ `Ortho`), highlighting in active cyan glow when Orthographic mode is engaged.
- **观察平面尺度平滑无跳跃衔接 / Zero-Scale-Jump Seamless Mathematical Transition**
  - **中文**: 切换算法在目标观察平面（Target Plane）处精确守恒视锥物理高度（$H = 2 \times D \times \tan(\text{FOV} / 2)$），切换瞬间模型在视口中的屏幕像素大小严格一致，杜绝了突兀的视觉跳跃。
  - **English**: Mathematically preserves frustum height at the target plane during projection conversion, guaranteeing exact screen-pixel scale matching with zero visual jump.
- **正交模式 CAD 级全量交互对齐 / Full CAD-Grade Navigation Parity in Orthographic Mode**
  - **中文**: 在正交相机下完整支持光标定点滚轮缩放（Zoom to cursor）、屏幕空间平移（Pan）、虚拟枢轴环绕旋转（Orbit）、视口自适应缩放（Container Resize）、构件双击聚焦定位（Zoom to Element/Box）以及所有立面/平面工程预设视角切换。
  - **English**: Complete interaction parity in Orthographic mode including wheel zoom-to-cursor, screen-space pan, virtual pivot orbit, responsive canvas resize updates, and architectural view presets (Plan, North, South, East, West, Iso).
- **NSEW 预设视角严格正对轴线方向 / Strict Axis-Aligned NSEW Elevation Views**
  - **中文**: 移除原预设视角中 20° 的下倾俯视夹角（`dist * 0.35`），将北向、南向、东向、西向四个立面相机的观察高度严格锁定于模型几何中心标高（`pos.y = center.y`），实现视角 100% 水平正对三维坐标轴向（$\pm Z$、$\pm X$）的标准工程立面图投影。
  - **English**: Eliminated the legacy 20° downward tilt pitch (`dist * 0.35`); locked camera elevation strictly to the model center height (`pos.y = center.y`) for North, South, East, and West presets, delivering 100% true horizontal, axis-aligned engineering elevations along the coordinate axes ($\pm Z$, $\pm X$).
- **演示模型更名与 3D 标签默认静默 / Demo Model Renaming & Default Labels Off**
  - **中文**: 初始示范模型正式更名为 `Demo Model`；3D 构件空间图钉标签（3D Labels）默认置为关闭状态，保持视口画面的纯净开阔，用户可在顶部工具栏或检查器中随时一键开启。
  - **English**: Renamed initial architectural template to `Demo Model`; defaulted floating 3D billboard pin labels to off upon loading for clean, unobstructed viewing, togglable anytime via navbar or inspector.
- **多语言与反馈联动 / Localization & Live Feedback**
  - **中文**: 按钮文案、悬停 Tooltip 提示以及切换完成 Toast 弹窗全面支持中英文双语实时联动。
  - **English**: Full bilingual i18n synchronization for button labels, tooltip titles, and toast feedback.

---

## [v1.2610041714] - 2026-10-04 17:14

### 新增功能 / Added
- **构件剖切断面端头圆头化 / Round End Caps on Cut Contours**
  - **中文**: 在剖切截面边缘线段两端生成 16 细分共面圆盘扇面，自由开口（如门窗洞口、隔墙断口）呈现优雅平滑的圆头端帽（`stroke-linecap: round`）。
  - **English**: Generated 16-segment in-plane circular fan discs at cut segment terminals; free openings (doors, windows, partition ends) now display smooth architectural round end caps.
- **构件相交转角平滑连接 / Smooth Corner & Miter Joins**
  - **中文**: 墙体转角交界处通过共面圆盘平滑拼接，消除了先前矩形线段相交处产生的硬角台阶与外凸毛刺。
  - **English**: Miters and corners where sliced walls meet are seamlessly joined by in-plane discs, eliminating protruding sharp notches and rectangular step artifacts.

### 体验与视觉优化 / Improved
- **断面边缘轮廓线粗细减半 / Cut Contour Thickness Halved**
  - **中文**: 截面深色外边框宽度精准缩减 50%（半宽由约 3.6cm 调至约 1.8cm），金黄 45° 剖面斜线填充更显舒展，整体图纸线条更轻盈精致。
  - **English**: Refined cut contour band width by 50% (half-width reduced from ~3.6cm to ~1.8cm), achieving balanced proportions and professional CAD drawing aesthetics.
- **消除中心虚线噪点 / Eliminated Centerline Dashing**
  - **中文**: 停用 1px 细线层的直接光栅化绘制，彻底消除多边形与线条共面深度冲突导致的虚线毛刺。
  - **English**: Disabled direct rasterization of the 1px centerline, completely resolving depth z-fighting and stippled dashed artifacts on the contour ribbons.

---

## [v1.2610041645] - 2026-10-04 16:45

### 新增功能 / Added
- **构件截面动态实体封闭 / Dynamic Stencil Section Capping**
  - **中文**: 依托 WebGL 模板缓冲（Stencil Buffer）双通道管线，无论是单剖切面还是 6 面剖切盒，切入实体构件内部时均自动实时封口。
  - **English**: Implemented real-time dynamic manifold capping for both Section Plane and 6-sided Section Box via a dual-pass WebGL Stencil Buffer pipeline.
- **45° 屏幕空间斜线剖面填充 / 45° Diagonal Screen-Space Hatching**
  - **中文**: 截面填充采用建筑学标准 45° 斜线纹理，底色为暖金深黄（`#d9b606`），斜线采用屏幕空间像素恒定步长（14px 间距、1.8px 线宽），视口任意缩放旋转均不产生摩尔纹或模糊。
  - **English**: Applied architectural 45° diagonal hatching over warm golden amber base (`#d9b606`) with constant screen-space pitch (14px spacing, 1.8px width), remaining crisp across all zoom levels without moiré patterns.
- **深色外边缘粗轮廓 / Architectural Bold Cut Outlines**
  - **中文**: 实时计算三角面与剖切面交线，生成贴合截面边缘的建筑深石墨色（`#1e293b`）外轮廓线圈。
  - **English**: Real-time extraction of triangle-plane intersections rendered as dark charcoal (`#1e293b`) perimeter boundary bands.

### 体验优化与修复 / Improved & Fixed
- **开放地表网格智能剔除 / Open Terrain Winding Leak Prevention**
  - **中文**: 自动识别并剔除单层开放地表与地形网格（Site & Terrain），防止因缺少封闭背面造成的模板泄漏。
  - **English**: Excluded single-sided open terrain meshes from the stencil pass, preventing winding leaks while preserving solid architectural components.
- **解耦辅助框显隐 / Decoupled Visual Helpers**
  - **中文**: 截面封闭与粗轮廓线完全独立于 Gizmo 显示开关，即使关闭辅助线显示，剖切截面封闭效果仍 100% 正常保持。
  - **English**: Section capping and outlines operate completely independently of helper visibility toggles.

---

## [v1.2610040845] - 2026-10-04 08:45

### 新增功能 / Added
- **模型树右键菜单无缝扩展 / Hierarchy Tree Context Menu Parity**
  - **中文**: 左侧构件树（叶子构件与分支节点）右键菜单完全对齐 3D 视口右键菜单，支持隔离、隐藏、缩放聚焦。
  - **English**: Extended viewport context menu to left hierarchy tree items and group branches (Isolate, Hide, Zoom to Group).
- **一键自适应剖切至选中构件 / "Move Section Plane/Box to here"**
  - **中文**: 右键菜单根据当前激活工具动态提供“将剖切面/盒移至此处”，剖切面平移紧贴构件而不破坏可见性；剖切盒自适应包围并居中所选构件。
  - **English**: Context menu dynamically features "Move Section Plane/Box to here", precisely placing the plane tangent to the element or tightly bounding the element with the section box.
- **切除部分线框模式开关 / Cut-away Wireframe Toggle**
  - **中文**: 剖切控制组新增独立开关，可在实体剖开后保持被切除部分的半透明线框骨架可见。
  - **English**: Added a dedicated toggle to visualize sliced-off geometry in translucent wireframe mode.
- **辅助框与 Gizmo 显隐开关 / Show/Hide Section Helpers**
  - **中文**: 支持一键隐藏剖切平面网格、剖切盒半透明体与全部 Gizmo 手柄，仅保留纯净剖切视图，且仍可通过控制面板滑块调节。
  - **English**: Added toggle to hide plane helpers, box volumes, and all gizmos for a distraction-free section view while keeping slider controls active.

### 界面与交互重构 / UI & Interaction Overhaul
- **剖切模式切换按钮等宽互斥化 / Equal-Width Segmented Mode Toggle**
  - **中文**: 将原下拉菜单升级为固定等宽联排互斥按钮（Section Plane / Section Box），中英文下自适应最长文本。
  - **English**: Replaced dropdown with equal-width segmented toggle buttons auto-sized to the longest label across languages.
- **剖切轴向三联互斥按钮 / Tri-State Axis Buttons**
  - **中文**: 将轴向下拉框重构为联排三联按钮（X Easting, Y Northing, Z Elevation），点击即时生效。
  - **English**: Replaced axis dropdown with inline segmented buttons (X Easting, Y Northing, Z Elevation).
- **轴向色谱映射与高亮反差 / Standard Axis Colors & Yellow Hover Glow**
  - **中文**: 剖切面与剖切盒手柄全量提高色彩饱和度与不透明度，统一遵循 X红、Y绿、Z蓝；鼠标指上手柄高亮为鲜艳黄（`#ffea00`）。
  - **English**: Enhanced gizmo saturation and opacity; arrows follow standard X-Red, Y-Green, Z-Blue with bright yellow hover highlight (`#ffea00`).
- **动态切向箭头方向 / Dynamic Arrow Cut-Direction**
  - **中文**: Section Plane 箭头始终动态指向被切除的一侧；点击 Invert 翻转时箭头即时同步反转。
  - **English**: Plane gizmo arrow dynamically points toward the cut-away side and flips immediately when inverted.
- **绝对 5° 旋转吸附 / Absolute 5-Degree Rotation Snap**
  - **中文**: 开启吸附后，旋转角度固定自 0° 绝对起算按 5 的整数倍吸附（如 17° 吸附至 15° 或 20°），杜绝相对累加偏移。
  - **English**: Snapping is now strictly locked to absolute multiples of 5° from 0° (e.g., 17° snaps to 15° or 20°).

---

## [v1.2610040430] - 2026-10-04 04:30

### 界面与体验大修 / UI & UX Refinement
- **Inspector 属性检查器面板重构 / Inspector Layout Redesign**
  - **中文**: 标题栏居中对齐；顶部标签页增加平滑水平滚动条与滚动阴影指示；属性表组采用可折叠手风琴（Accordion）设计。
  - **English**: Centered inspector header, enabled smooth horizontal scroll for tabs with indicator gradients, and introduced collapsible accordion property groups.
- **视口与元件树双向柔和高亮 / Subtle Bi-directional Hover Glow**
  - **中文**: 鼠标悬浮在 3D 构件或左侧元件树列表项时，触发浅青色柔和微光高亮，显著提升目标拾取辨识度。
  - **English**: Added subtle light-cyan hover highlight across both the 3D viewport elements and hierarchy tree items.
- **自适应响应式布局与视口保护 / Responsive Layout & Viewport Protection**
  - **中文**: 动态检测屏幕宽度，视口区域受保护不低于 40%；在窄屏或移动端自动收起侧边栏，并保留用户手动拖拽调宽的个性化偏好。
  - **English**: Adaptive sidebar sizing protecting minimum 40% 3D viewport area; automatically collapses on small screens while preserving manual user drag overrides.

---

## [v1.2610031040] - 2026-10-03 10:40

### 几何计算与模型引擎 / Geometry Engine & IFC Processing
- **门窗洞口布尔开洞修复 / CSG Wall Void Cutouts**
  - **中文**: 修复内置别墅示范模型中凹形楼梯与复杂窗洞口的布尔相交裁切，墙体与门窗开洞完全精确吻合。
  - **English**: Corrected CSG boolean void cutouts for windows and concave stairs in the architectural sample model.
- **挡土墙与地形边界对齐 / Retaining Wall Alignment**
  - **中文**: 调整北侧与东侧混凝土挡土墙坐标几何，与自然地貌斜坡实现无缝闭合搭接。
  - **English**: Aligned north/east concrete retaining walls with topography mesh for seamless architectural fitting.

---

## [v1.2610020110] - 2026-10-02 01:10

### IFC 与元数据引擎 / IFC Parser & 3D Labels
- **纯客户端流式 IFC 解析器 / Zero-Server Client-side IFC Parser**
  - **中文**: 支持 IFC 2x3、IFC 4、IFC 4.3 架构文件的纯前端内存流式解析，快速提取图元几何、构件层级及 Psets 属性集。
  - **English**: In-memory streaming IFC parser supporting IFC 2x3, 4, and 4.3 with complete geometry, hierarchy, and Pset extraction.
- **3D 视口图钉标签系统 / Viewport 3D Floating Pin Labels**
  - **中文**: 支持构件关键信息的三维空间浮动图钉展示，具备自适应相机朝向、近大远小缩放及防遮挡闪烁优化。
  - **English**: Interactive 3D billboard pin labels anchored to elements with camera orientation tracking and anti-flicker smoothing.

---

## [v1.2610010130] - 2026-10-01 01:30

### 核心功能与基础平台 / Core Features & Foundation
- **单文件零依赖编译器 / Standalone Single-File Compiler**
  - **中文**: 确立 `build_viewer.py` 自动化打包管线，将 Three.js 引擎、着色器、字体图标与业务逻辑打包为单文件 `BIMScope.html`。
  - **English**: Established `build_viewer.py` compiler producing a single-file, 100% offline distribution (`BIMScope.html`).
- **多格式 3D/BIM 支持 / Broad File Format Support**
  - **中文**: 支持 IFC、GLTF、GLB、FBX、OBJ+MTL、STL、PLY 的直接拖拽与打开查看。
  - **English**: Direct drag-and-drop loading for IFC, GLTF/GLB, FBX, OBJ+MTL, STL, and PLY models.
- **真 3D 视口罗盘 / True 3D Viewport Compass**
  - **中文**: 26 个工程观察视角（轴测、俯视/平面、东南西北立面及透视视角一键切换）。
  - **English**: 26-view 3D interactive compass supporting Isometric, Top/Plan, Elevations, and Perspectives.
- **ACC 虚拟枢轴轨道漫游 / ACC Virtual Pivot Orbit Controls**
  - **中文**: 基于构件几何中心或点击表面锚点的顺滑轨道旋转漫游体验。
  - **English**: Autodesk Construction Cloud style virtual pivot orbit rotation centered on clicked points or selection centers.
- **动态太阳能与天文日照 / Solar Daylight Simulation**
  - **中文**: 基于地理经纬度与真太阳时计算太阳方位角与高度角，提供 24 小时动态光照模拟。
  - **English**: Astronomical solar simulation calculating azimuth/altitude from coordinates for real-time 24h sunlight studies.
- **高精度空间测量 / Precision 3D Measurement**
  - **中文**: 支持顶点与表面吸附，同时输出三维空间距离与 $\Delta X, \Delta Y, \Delta Z$ 正交差值。
  - **English**: Vertex and surface snapping distance measurement with simultaneous 3D Euclidean distance and orthogonal offsets.
- **双语国际化 / Full Bilingual Localization**
  - **中文**: 界面全部元素支持中文与英文一键即时无缝切换。
  - **English**: Seamless instant one-click switching between English and Simplified Chinese across all UI elements.
