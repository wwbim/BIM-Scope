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

> ⏱️ **项目累计总工时 / Total Active Development Time**: **27 小时 14 分钟 (27.24 Hours)**  
> 📅 **自然时间跨度 / Total Calendar Span**: **4 天 22 小时 58 分钟** (2026-09-29 22:17 至 2026-10-04 21:15)  
> 🔢 **累计交互与执行步骤 / Total Engineering Steps**: **12,644 Steps** (跨 13 个活跃开发会话 Sprint)  
> 🔄 **更新机制 / Update Policy**: 每次版本构建打包发布时基于真实日志自动重新精算累计工时。

### 阶段与每日工时分解 / Daily Breakdown
| 日期 / Date | 活跃开发时段 / Active Sprints | 有效工时 / Active Hours | 核心迭代内容 / Milestones |
| :--- | :--- | :---: | :--- |
| **2026-09-29** | 22:17~00:53 | 2h 36m (2.60h) | 项目脚手架初始化、Three.js 单文件离线引擎搭建 / Project scaffold & Three.js engine setup |
| **2026-09-30** | 23:51~01:56 | 2h 05m (2.08h) | 3D 罗盘、标高指示、图钉系统与演示模型初始构建 / 3D compass, elevation readouts, pin labels & demo model |
| **2026-10-01** | 23:28~01:06 | 1h 38m (1.64h) | 剖切手柄（Gizmo）、着色与材质系统初版 / Section gizmo controls, shader & material styling |
| **2026-10-02** | 22:04~01:38 | 3h 34m (3.57h) | FBX 格式扩展、中大型 IFC 流式解析器研发 / FBX format integration, streaming IFC parsing |
| **2026-10-03** | 09:55~10:39, 23:11~03:24 (共 6 个时段) | 9h 07m (9.13h) | 墙体门窗洞口 CSG 布尔减运算、栏杆几何修正、检查器手风琴与层级树重构 / Wall CSG void cutouts, railing fixes, inspector accordions & tree refactor |
| **2026-10-04** | 10:02~10:34, 19:23~21:15 (共 3 个时段) | 8h 12m (8.21h) | 正交/透视无缝切换、NSEW 轴向立面图、检查器动态对齐透明度滑块、原色加法微光悬停 / Ortho/Persp toggle, axis-aligned NSEW views, dynamic opacity slider, subtle additive hover glow |
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
