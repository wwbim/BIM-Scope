# 软件功能表与待办需求池 / Features & Backlog Matrix

本文档以全融合数据表的形式，系统梳理 BIMScope 的全部功能特性与界面元素。  
This document systematically organizes all features and UI elements of BIMScope into a unified data table.

> **状态标识说明 / Status Legend**:  
> - `✅ 已上线 / Released`: 功能已开发完成并通过全量回归测试 / Feature is implemented and verified.  
> - `🟡 优化中 / In Progress`: 功能已上线但正在进一步迭代重构 / Feature is active but undergoing active iteration.  
> - `📋 待办需求 / Backlog`: 已确认待排期开发的新功能需求 / Accepted feature requirement in queue.  
> - `💡 想法建议 / Idea`: 用户提出的初步创意与探索性设想 / Exploratory proposal or early-stage idea.

---

## 全量功能与待办数据表 / Unified Features & Backlog Matrix

| 模块 / Module | 二级分类与界面元素 / Category & UI Element | 功能名称 / Feature Name | 功能详细说明 / Description | 状态 / Status | 引入版本 / Version |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **核心架构<br>Core Platform** | 离线编译器<br>Compiler Pipeline | 单文件打包架构<br>Standalone HTML Compiler | 基于 Python 编译脚本将所有 JS 库、着色器和样式内嵌整合为单文件 `BIMScope.html`。<br>Compiles all libraries, shaders, and styles into a single zero-dependency file. | ✅ 已上线<br>Released | v1.2610010130 |
| **核心架构<br>Core Platform** | 离线运行<br>Zero Server | 纯客户端离线运行<br>Zero-Backend Offline Execution | 双击即可在任意浏览器本地直接运行，无需启动 Node.js 或本地 Web 服务。<br>Double-click to run in any browser without local HTTP server or backend. | ✅ 已上线<br>Released | v1.2610010130 |
| **核心架构<br>Core Platform** | 交付镜像<br>Deliverables Mirror | 自动交付物同步<br>Automated Deliverables Sync | 编译时自动将产物同步至 Deliverables 目录及 `index.html` 静态根路径。<br>Automatically exports compiled distribution to Deliverables and root `index.html`. | ✅ 已上线<br>Released | v1.2610010130 |
| **模型解析<br>File Formats** | IFC 解析引擎<br>IFC Engine | 纯前端 IFC 流式解析<br>Client-side Streaming IFC Parser | 支持 IFC 2x3、IFC 4、IFC 4.3 架构文件的内存快速流式解析与几何拓扑提取。<br>In-memory streaming parsing for IFC 2x3/4/4.3 schemas with geometry extraction. | ✅ 已上线<br>Released | v1.2610020110 |
| **模型解析<br>File Formats** | 通用三维格式<br>Standard 3D | 多格式模型加载管线<br>Multi-format 3D Loaders | 支持 GLTF、GLB、FBX、OBJ+MTL、STL、PLY 的直接拖拽与文件拾取打开。<br>Drag-and-drop loading for GLTF/GLB, FBX, OBJ+MTL, STL, and PLY files. | ✅ 已上线<br>Released | v1.2610010130 |
| **模型解析<br>File Formats** | 内置模板<br>Demo Template | 演示模型<br>Demo Model | 内置多层建筑、屋顶、玻璃幕墙、台阶与地形地貌的程序化 BIM 演示模型（Demo Model）。<br>Built-in architectural BIM procedural demonstration template (Demo Model). | ✅ 已上线<br>Released | v1.2610041950 |
| **模型解析<br>File Formats** | 布尔运算<br>CSG Engine | 门窗洞口布尔减运算<br>CSG Wall Void Cutouts | 在墙体网格中自动精确开出窗洞与门洞，消除了墙体与门窗重叠遮挡问题。<br>Precise boolean subtraction of window and door openings from solid wall bodies. | ✅ 已上线<br>Released | v1.2610031040 |
| **视口导航<br>Navigation** | 3D 罗盘<br>Orientation Cube | 真 3D 视口交互罗盘<br>True 3D Interactive Compass | 视口右下角 3D 罗盘，支持 26 个工程视角（轴测、俯视/平面、东南西北立面、透视）点击即时旋转。<br>26-orientation 3D compass widget supporting Isometric, Plan, and Elevations. | ✅ 已上线<br>Released | v1.2610010130 |
| **视口导航<br>Navigation** | 轨道控制器<br>Orbit Controls | ACC 虚拟枢轴轨道漫游<br>ACC Virtual Pivot Orbiting | 借鉴 Autodesk 规范，以鼠标点击表面或所选构件中心为轴心进行顺滑环绕。<br>Autodesk-style orbit controls pivoting on clicked surface point or selection center. | ✅ 已上线<br>Released | v1.2610010130 |
| **视口导航<br>Navigation** | 顶部快捷栏<br>Preset Views | 相机预设快捷按钮<br>Camera View Presets | 快捷切换轴测图（Iso）、顶视平面图（Plan）、正对坐标轴向（$\pm Z$、$\pm X$）的正南/正北/正东/正西工程水平立面图。<br>One-click switching for Iso, Plan, and strictly axis-aligned horizontal elevations (N, S, E, W). | ✅ 已上线<br>Released | v1.2610041950 |
| **视口导航<br>Navigation** | 相机投影<br>Camera Projection | 正交与透视一键切换<br>Orthographic / Perspective One-Click Toggle | 顶部视图工具栏原 Fit 按钮升级为正交与透视（Ortho / Persp）一键无缝互切按钮，平滑保留观察角度与缩放比例。<br>Replaced 'Fit' button in top toolbar with a one-click toggle between Orthographic and Perspective cameras without scale jump. | ✅ 已上线<br>Released | v1.2610041950 |
| **视口导航<br>Navigation** | 状态指示<br>Viewport HUD | 距离与标高实时 HUD<br>Distance & Elevation Readout | 顶部实时显示当前相机观察距离，底部状态栏实时显示光标处局部与绝对标高。<br>Real-time readout of camera distance and cursor coordinates/elevations. | ✅ 已上线<br>Released | v1.2610010130 |
| **视口导航<br>Navigation** | 3D 图钉<br>Labels System | 空间浮动图钉标签<br>3D Floating Pin Labels | 默认关闭，可在顶部工具栏或检查器中一键开启。在 3D 空间中锚定关键构件标签，具备防遮挡平滑跟随与近大远小自适应缩放。<br>Defaulted to off; billboard pin labels anchored to elements with anti-flicker smoothing, togglable via toolbar and inspector. | ✅ 已上线<br>Released | v1.2610041950 |
| **模型树<br>Hierarchy Tree** | 结构分类<br>Structures Tab | 结构分类与分组管理<br>Structure Category Grouping | 按建筑结构、地貌、幕墙、门窗等工程类别对图元进行分层分组展示。<br>Hierarchical classification by architectural and engineering disciplines. | ✅ 已上线<br>Released | v1.2610010130 |
| **模型树<br>Hierarchy Tree** | 楼层标高<br>Levels Tab | 建筑楼层分级展示<br>Building Storey / Level Views | 按建筑自然楼层与标高高度对构件进行筛选和隔离查看。<br>Filter and inspect components partitioned by building levels and elevations. | ✅ 已上线<br>Released | v1.2610010130 |
| **模型树<br>Hierarchy Tree** | 图元清单<br>Elements Tab | 空间构件全量清单树<br>Spatial Elements Breakdown | 完整展示所有构件的层级关系，支持搜索过滤、多选高亮与双击定位。<br>Full spatial element tree with search filtering and double-click framing. | ✅ 已上线<br>Released | v1.2610010130 |
| **模型树<br>Hierarchy Tree** | 批量控制<br>Batch Controls | 显隐控制与透明度滑块<br>Visibility & Opacity Sliders | 支持一键全部隐藏/展开、单组显隐切换以及平滑透明度滑块调节。<br>One-click show/hide all, individual toggles, and smooth layer opacity sliders. | ✅ 已上线<br>Released | v1.2610010130 |
| **模型树<br>Hierarchy Tree** | 右键菜单<br>Context Menu | 构件树节点右键菜单<br>Hierarchy Tree Context Menu | 左侧构件树（构件与分组）右键呼出与 3D 视口完全相同的上下文菜单。<br>Full right-click context menu parity between hierarchy tree and 3D viewport. | ✅ 已上线<br>Released | v1.2610040845 |
| **模型树<br>Hierarchy Tree** | 交互微光<br>Hover Highlight | 树与视口双向悬停高亮<br>Bi-directional Hover Glow | 鼠标悬停树列表项或 3D 构件时，两端同步触发浅青色柔和微光高亮。<br>Light-cyan subtle hover highlight synced across both 3D meshes and tree items. | ✅ 已上线<br>Released | v1.2610040430 |
| **检查器<br>Inspector** | 基本属性<br>Basic Profile | 构件身份卡片与工程参数<br>Component Profile & Parameters | 居中标题卡片，展示 IFC Class、GUID、Step ID、结构类别、标高高度与物理尺寸。<br>Centered header displaying IFC class, GUID, discipline, elevation, and dimensions. | ✅ 已上线<br>Released | v1.2610040430 |
| **检查器<br>Inspector** | 属性集<br>Property Sets | Psets 折叠手风琴面板<br>Collapsible Pset Accordions | 以可折叠的分组手风琴卡片呈现 IFC Property Sets，支持一键展开/折叠。<br>Collapsible accordion groups displaying all IFC Property Sets and metadata. | ✅ 已上线<br>Released | v1.2610040430 |
| **检查器<br>Inspector** | 数据复制<br>Clipboard Action | 属性值一键复制<br>One-Click Value Copying | 鼠标悬浮属性值行时显示复制图标，点击即时将属性值复制至系统剪贴板。<br>Instant one-click clipboard copying for any metadata key-value row. | ✅ 已上线<br>Released | v1.2610040430 |
| **检查器<br>Inspector** | 标签导航<br>Tab Navigation | 水平平滑滚动标签页<br>Scrollable Inspector Tabs | 标签页过多时支持水平平滑滑动，两端带有优雅的半透明渐变阴影指示器。<br>Smooth horizontal scrolling tab container with gradient scroll indicators. | ✅ 已上线<br>Released | v1.2610040430 |
| **构件选择<br>Selection System** | 点选交互<br>Click Selection | Ctrl 点选追加与反选<br>Ctrl Multi-Select & Deselect Toggle | 按住 Ctrl 键单击构件进行多选追加；若再次点击已选中的构件，则将其从当前选择集中移出（反选）。<br>Hold Ctrl and click elements to add to selection; clicking an already selected element deselects/toggles it out. | 📋 待办需求<br>Backlog | v1 (待定) |
| **构件选择<br>Selection System** | 框选交互<br>Box Selection | Space 键视口区域框选<br>Space Key Marquee Box Selection | 按住 Space 键在 3D 视口拖拽进行矩形区域框选，松开后刷新替换当前选择集；空白处点击清除选择。<br>Hold Space and drag in viewport to marquee box-select components, replacing the active selection set. | 📋 待办需求<br>Backlog | v1 (待定) |
| **构件选择<br>Selection System** | 组合框选<br>Composite Selection | 框选布尔组合（追加与去除）<br>Box Selection Boolean (Add & Subtract) | 结合功能键进行选择集布尔运算：按住 Ctrl + Space 框选进行「追加选择」（并集）；按住 Ctrl + Shift + Space 框选进行「去除选中构件」（差集）。<br>Hold Ctrl + Space to add box-selected elements to current selection (Union); hold Ctrl + Shift + Space to remove box-selected elements (Subtract). | 📋 待办需求<br>Backlog | v1 (待定) |
| **构件选择<br>Selection System** | CAD 选框规则<br>Window vs Crossing | 左右框选智能判别（实线窗口 vs 虚线交叉）<br>Window (Right) vs Crossing (Left) Selection Rule | 深度契合专业 CAD/Revit 框选规范：向右拖拽显示实线框（Window Selection，仅选中 100% 完全在框内的构件）；向左拖拽显示虚线框（Crossing Selection，构件任意部分与框相交或在框内即被选中）。<br>CAD-standard window/crossing selection: dragging to the right displays solid border (Window Selection, selects elements completely enclosed); dragging to the left displays dashed border (Crossing Selection, selects elements partially or fully intersecting the box). | 📋 待办需求<br>Backlog | v1 (待定) |
| **剖切系统<br>Sectioning** | 模式切换<br>Mode Toggle | 等宽联排互斥模式切换按钮<br>Equal-Width Clipping Mode Toggle | 单剖切面（Section Plane）与剖切盒（Section Box）一键互切，按钮宽度固定等宽。<br>Equal-width segmented toggle buttons between Section Plane and Section Box. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 轴向选择<br>Axis Selection | 三联互斥轴向选择按钮<br>Tri-State Axis Buttons | 联排三联互斥按钮（X Easting, Y Northing, Z Elevation），支持点击即时自动激活剖切。<br>Inline segmented buttons (X Easting, Y Northing, Z Elevation) with auto-enable. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 3D 手柄<br>Gizmo Controls | 轴向色谱与黄色悬浮高亮<br>Standard Axis Colors & Hover Glow | 手柄箭头遵循 X红、Y绿、Z蓝高饱和色彩；鼠标指上手柄时高亮为醒目黄（`#ffea00`）。<br>Gizmos follow X-Red, Y-Green, Z-Blue with bright yellow hover highlight. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 3D 手柄<br>Gizmo Controls | 动态切向箭头与翻转跟随<br>Dynamic Arrow Cut Direction | Section Plane 箭头始终动态朝向被切除一侧；点击 Flip 翻转后箭头即时同步反向。<br>Plane gizmo arrow dynamically points toward the cut side and flips with Invert. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 旋转吸附<br>Rotation Snap | 绝对 5° 旋转吸附<br>Absolute 5-Degree Rotation Snap | 开启吸附后，旋转角度严格自 0° 起按 5 的整数倍锁定吸附（如 17° $\to$ 15° 或 20°）。<br>Rotation snap is locked to absolute 5° multiples from 0° (e.g. 17° to 15°/20°). | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 快捷对齐<br>Context Alignment | 一键剖切至选中构件<br>"Move Section Plane/Box to here" | 选中构件右键一键自适应将剖切面贴合移至构件处，或将剖切盒自适应包围该构件。<br>Adapts section plane tangent to element or snaps section box tightly around it. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 线框观察<br>Wireframe Mode | 被切除部分线框模式开关<br>Cut-away Wireframe Toggle | 开启后，被切除掉的实体半边保留半透明线框骨架，便于查看建筑内部结构定位。<br>Visualizes the sliced-off geometry in translucent wireframe mode. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 视觉纯净<br>Helpers Toggle | 辅助线与 Gizmo 独立显隐<br>Show/Hide Section Helpers | 隐藏剖切面网格、剖切盒与 3D Gizmo，仅呈现无干扰的纯净建筑截面，滑块仍可调节。<br>Hides plane grids, box helpers, and gizmos for a clean view while keeping sliders active. | ✅ 已上线<br>Released | v1.2610040845 |
| **剖切系统<br>Sectioning** | 截面封口<br>Stencil Capping | 构件断面动态实体封闭<br>Dynamic Stencil Section Capping | WebGL Stencil Buffer 双通道技术，截断实体构件内部时自动实时封闭截面。<br>Real-time manifold capping for Section Plane and Section Box using Stencil Buffer. | ✅ 已上线<br>Released | v1.2610041645 |
| **剖切系统<br>Sectioning** | 剖面图案<br>Hatch Pattern | 45° 屏幕空间斜线图案填充<br>45° Diagonal Screen-Space Hatching | 截面底色为暖金深黄（`#d9b606`），上覆屏幕空间像素恒定步长（14px）45° 剖面斜线，缩放不失真。<br>Screen-space constant 45° diagonal architectural hatching over golden base. | ✅ 已上线<br>Released | v1.2610041645 |
| **剖切系统<br>Sectioning** | 截面外框<br>Cut Contour | 建筑制图级深色轮廓线<br>Architectural Bold Cut Outlines | 实时提取截面交线，生成石墨深黑（`#1e293b`）外轮廓线圈，厚度精致适中（半宽约 1.8cm）。<br>Refined perimeter edge contour bands (~1.8cm half-width) in dark charcoal. | ✅ 已上线<br>Released | v1.2610041714 |
| **剖切系统<br>Sectioning** | 截面外框<br>Cut Contour | 轮廓端头圆头化与转角平滑<br>Round End Caps & Smooth Joins | 16 细分共面圆盘生成圆头端帽（`stroke-linecap: round`）与平滑圆角，消除矩形外凸毛刺。<br>16-segment circular fan discs forming round end caps and smooth miter joins. | ✅ 已上线<br>Released | v1.2610041714 |
| **空间测量<br>Measurement** | 测量吸附<br>Snapping Engine | 顶点与表面精准吸附<br>Vertex & Surface Snapping | 鼠标移动时自动寻找并吸附到建筑构件的三维顶点或表面最近点。<br>Automatic raycast snapping to 3D vertices and planar surfaces. | ✅ 已上线<br>Released | v1.2610010130 |
| **空间测量<br>Measurement** | 空间读数<br>Distance Readout | 空间距离与三轴投影差值<br>3D Euclidean & Delta XYZ Offsets | 拾取两点后，同时输出空间真实欧氏直线距离与正交 $\Delta X, \Delta Y, \Delta Z$ 分量差值。<br>Simultaneous readout of 3D spatial distance and orthogonal coordinate delta values. | ✅ 已上线<br>Released | v1.2610010130 |
| **日照模拟<br>Solar Engine** | 天文算法<br>Solar Algorithm | 真太阳时方位角与高度角<br>Astronomical Solar Calculations | 基于地理经纬度与一年四季时序，实时计算太阳真实方位角与俯仰高度角。<br>Real-time calculation of solar azimuth and elevation angles from coordinates. | ✅ 已上线<br>Released | v1.2610010130 |
| **日照模拟<br>Solar Engine** | 交互模拟<br>Sun Simulation | 24 小时动态日照时间滑块<br>24-Hour Daylight Simulation Slider | 拖动时间滑块连续模拟清晨到黄昏的光影变幻与阴影投射变化。<br>Continuous interactive daylight simulation with real-time shadow projection. | ✅ 已上线<br>Released | v1.2610010130 |
| **建筑线框<br>Edge Lines** | 轮廓提取<br>Edge Extraction | 智能共面三角面过滤<br>Coplanar Multi-Triangle Filtering | 自动过滤平面内的三角剖分对角线，仅保留建筑棱边与外轮廓几何边线。<br>Filters out coplanar triangulation lines to display clean CAD-style geometry edges. | ✅ 已上线<br>Released | v1.2610010130 |
| **建筑线框<br>Edge Lines** | 视觉调节<br>Edge Styling | 轮廓线强度与阈值调节<br>Edge Line Intensity & Angle Sliders | 支持开启/关闭边缘线，并提供线宽强度与折角法向阈值调节滑块。<br>Adjustable edge intensity slider and crease angle threshold. | ✅ 已上线<br>Released | v1.2610010130 |
| **界面交互<br>UI / UX** | 响应式设计<br>Responsive Layout | 视口保护自适应布局<br>Responsive Layout with Viewport Protection | 动态视口占比保护（$\ge 40\%$），小屏幕自动折叠侧边栏，保留用户自定义宽度偏好。<br>Adaptive layout safeguarding $\ge 40\%$ viewport; auto-collapses on small screens. | ✅ 已上线<br>Released | v1.2610040430 |
| **界面交互<br>UI / UX** | 视觉主题<br>Theme & Styling | 工程专业深色暗黑主题<br>Modern Dark Engineering Theme | 采用低视觉疲劳的高质感深黑底色，搭配层次分明的信息层级与高反差提示色。<br>Professional dark UI theme optimized for long-session CAD/BIM inspection. | ✅ 已上线<br>Released | v1.2610010130 |
| **界面交互<br>UI / UX** | 多语言<br>Localization | 中英双语一键无缝切换<br>Full Bilingual Localization (EN / 中文) | 顶部栏一键无刷新即时切换中文与英文，涵盖所有界面标签、属性名与提示语。<br>Instant zero-reload language switching between English and Simplified Chinese. | ✅ 已上线<br>Released | v1.2610010130 |

---

## 需求池维护说明 / Backlog Workflow

当您直接在对话中提出新的功能想法、交互优化或问题改进建议时：
1. **即时追加**：本表将自动追加对应条目，并赋予 `📋 待办需求 / Backlog` 或 `💡 想法建议 / Idea` 状态；
2. **状态推进**：当需求开始开发时标记为 `🟡 优化中 / In Progress`，开发完成并通过全量回归验证后标记为 `✅ 已上线 / Released`，同时记录引入的具体版本号（如 `v1.<YYMMDDHHMM>`）；
3. **版本日志联动**：在 [`CHANGELOG.md`](file:///H:/我的云端硬盘/Software%20Develop/Project/CHANGELOG.md) 中同步沉淀正式的更新日志说明。
