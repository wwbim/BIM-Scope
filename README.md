# BIMScope 🏗️

> **A Pure Client-Side, 100% Offline Standalone Web BIM & 3D Architectural Viewer**  
> **纯前端、100% 离线单文件 Web BIM 与三维建筑工程查看器**  
> Powered by Three.js • Zero Backend Dependency • Single-File Portable Distribution

---

## 🌟 核心特色与技术突破 / Key Highlights & Engineering Breakthroughs

### 1. 🔍 IFC 模型多版本深度对比引擎 / Multi-Version IFC Model Comparison Engine
- **全局对比模式入口与浅绿/浅红双区弹窗**：顶部导航栏专属主入口，全屏磨砂遮罩阻断底层干扰；弹窗左侧为浅绿色（`#f0fdf4`）新版模型区（默认自动填入当前视口已打开模型），右侧为浅红色（`#fef2f2`）旧版模型区，中央配备 `⇄` 一键对调互换按钮。
- **彻底消除视口拖拽冲突**：全屏模态遮罩深度拦截文件拖拽事件，彻底消除向弹窗拖拽文件经过 3D 视口时误激活视口 Drop 遮罩并残留遮挡的界面 Bug。
- **无相似度异常熔断保护**：当比对的两份模型匹配度为 0%（无任何共同构件，判定为可能选错文件或无关项目）时，系统自动中断 3D 对比流水线，弹出高优先级提示并无损恢复对比弹窗，保留已选文件槽位以便快速更正。
- **全局 GUID 对齐与语义化差分着色**：基于 IFC 全局唯一 `GlobalId` 与几何哈希进行拓扑差分对比，全模型自动剥离原材质，采用高反差工程语义着色：
  - ⚪ **未变动 (Unchanged)**：低饱和灰白色。
  - 🟢 **新增构件 (Added)**：高亮鲜翠绿 (`#22c55e`)。
  - 🔴 **已删除构件 (Deleted)**：半透明珊瑚红 (`#ef4444`)。
  - 🟠 **发生变动 (Modified)**：高饱和明橙黄 (`#f59e0b`)。
- **位姿形变旧版幽灵体叠加 (Ghost Geometry Overlay)**：智能判别「几何形变/位姿位移」与「纯属性修改」。在 3D 视口中点击发生位姿或几何形变的橙黄色构件时，同步以黄色半透明幽灵体叠加呈现修改前的旧版位置与轮廓；纯属性变更构件则不叠加幽灵体，直观明了。
- **双重形态差异树与计数胶囊**：对比模式下侧边栏自动切换为对比视界，顶部呈现绿/红/橙指标胶囊实时统计构件数；下方提供「统一空间层级树」与「状态分组卡片」双重形态无缝切换。

### 2. 💎 超越商业软件的几何解析精度与平滑着色 / Superior Geometry Precision & Smooth Shading
- **复杂屋檐与多层悬挑高保真复原**：针对部分主流商业 BIM 软件解析 IFC 时因多层映射遍历缺陷导致“多层屋檐只显示最高一层、其余图元缺失”的行业痛点，BIMScope 采用递归映射堆栈与严密表达树遍历，配合 Newell 空间多边形基底投影与 Earcut 三角剖分，完整无遗漏地呈现多层屋檐、檐口挑檐、异型天幕与空间桁架。
- **自研空间哈希折角法向平滑算法 (`computeCreasedNormals`)**：IFC 原始数据多由离散三角面剖分（`IFCTRIANGULATEDFACESET` / `IFCFACETEDBREP`）。商业软件常呈现粗糙破裂的三角折面，或过度平滑导致边棱模糊。BIMScope 自研空间哈希折角法向重构算法（`creaseAngle = 55°`），将原本充满细碎三角面的柱体、圆弧屋面与管道重构为细腻光滑的连续曲面，同时精确锁死墙体与梁柱 90° 结构锐边。
- **门窗洞口布尔减运算 (CSG Wall Void Cutouts)**：内置客户端 CSG 实体几何布尔运算引擎，在墙体网格中自动精确切削门窗洞口，彻底消除墙体与门窗交叉穿透。
- **金属拉伸网智能识别**：基于几何长宽比分析与材质语义，自动将薄网格识别为金属拉伸网并施加自研程序化菱形镂空贴图，无需下载外部贴图。

### 3. 📦 100% 纯客户端离线单文件 / 100% Client-Side & Zero-Server Offline
- **单文件便携交付**：通过 Python 构建脚本将所有核心 JS 库、着色器、图标与样式内嵌编译为单一 `.html` 文件（`BIMScope.html`）。
- **零服务端依赖**：无需启动 Node.js 或本地 Web 服务，双击即用；所有解析与渲染均在浏览器内存完成，模型数据 100% 留在本地，极致保护隐私与数据安全。

### 4. 📐 广泛的三维建筑与通用格式支持 / Multi-Format 3D Engine
- **IFC** (`.ifc` schema 2x3, 4, 4.3)：纯前端流式解析、几何提取、Pset 属性集、空间层级树与类型定义。
- **GLTF / GLB** (`.gltf`, `.glb`)：glTF 2.0 场景模型、内置材质及动画。
- **FBX** (`.fbx`)：支持二进制与 ASCII 格式、嵌入/外置贴图（含 TGA/PNG/JPEG）及骨骼动作动画。
- **COLLADA** (`.dae`)：原生支持 COLLADA 1.4/1.5、单位缩放归一化、双面材质防破面及多动作动画。
- **内置演示模型**：现代坡屋顶双层木结构独栋别墅程序化 BIM 模板，含热带光照日照模拟。

### 5. 🎯 专业级 CAD/BIM 交互体系 / Professional CAD & BIM Interaction
- **CAD 标准双向框选**：
  - 向右拖拽为实线蓝框（**Window Selection**，仅选中 100% 框内构件）。
  - 向左拖拽为虚线绿框（**Crossing Selection**，选中相交及框内构件）。
  - 按住 `Ctrl` 拖拽或点击追加/反选，按住 `Shift` 拖拽或点击剔除选择。
- **多选构件批量检查器**：支持批量显隐、隔离、聚焦定位、批量透明度调节，以及公共属性集求交与 `multiple` 提示。
- **真 3D 罗盘与工程视角**：26 视角 3D 罗盘；视口居中正交立面预设（Iso、Plan、N、S、E、W）；正交/透视独立线框图标切换；**50 步视图历史撤销/重做** (`Ctrl+Z` / `Ctrl+Y`)。
- **虚拟枢轴轨道漫游 (ACC Pivot Orbiting)**：以鼠标光标拾取的构件表面最近点为枢轴顺滑环绕。
- **三维剖切与截面动态封口 (Stencil Capping)**：剖切面与 6 轴剖切盒，5° 角度吸附手柄；双通道 Stencil Buffer 实时实体封闭，45° 金色建筑斜线剖面与深色轮廓圈。
- **真太阳时日照模拟**：根据经纬度与时序实时计算太阳高度角与方位角，24 小时光影滑块互动。
- **三维精准空间测量**：顶点与表面吸附捕捉，实时输出欧氏直线距离与 $\Delta X, \Delta Y, \Delta Z$ 正交投影。
- **通用三维动画播放器**：视口底部悬浮胶囊播放条（支持 DAE/FBX/GLTF），支持毫秒级时间拖拽、倍速调节与动作片段切换。
- **原地折叠侧栏与底部渐变阴影**：侧栏原地平滑收缩，构件类型栏横向滚轮滚动与防遮挡内阴影。
- **多格式模型副标题联动**：格式版本、导出软件、单位朝向与 GIS 坐标系全局同步显示。
- **中英双语即时切换**：顶部栏一键无刷新切换英文与简体中文。

---

## 🚀 快速开始 / Quick Start

### 1. 直接运行 / Direct Usage
双击打开 `BIMScope.html` 或 `index.html` 即可在任意主流浏览器（Chrome、Edge、Firefox、Safari）中本地离线运行。  
Simply double-click `BIMScope.html` or `index.html` in any modern browser.

### 2. 源码构建 / Building from Source
项目的核心源码位于 `src/`，第三方依赖位于 `libs/`。  
运行 Python 构建脚本重新编译单文件发行包：

```bash
# 编译默认版本 (Variant A: BIM Scope)
python build_viewer.py

# 编译所有版本 (Variant A & Variant B)
python build_viewer.py --variant=all

# 同步并发布 Variant B (SWBIM Scope)
python sync_variant_b.py
```

---

## 📁 项目目录结构 / Project Structure

```
├── src/
│   ├── app.js               # 主应用程序逻辑与 CAD 视口交互调度 / Main application & CAD viewer logic
│   ├── clipping.js          # 剖切面与剖切盒引擎、3D 手柄与封口算法 / Section Box & clipping engine
│   ├── compare_engine.js    # 多版本模型对比差分引擎、幽灵体与差异树 / Multi-version model diff engine
│   ├── demo_model.js        # 内置程序化现代双层别墅建筑模型 / Procedural BIM demo template
│   ├── ifc_parser.js        # 流式 IFC 解析、法向平滑着色、Newell 投影与 CSG / Streaming IFC parser
│   ├── solar.js             # 真太阳时天文算法与动态日照模拟 / Solar astronomical engine
│   ├── i18n.js              # 中英双语动态国际化引擎 / Bilingual localization (EN / 中文)
│   ├── styles.css           # 响应式深色工程主题样式表 / Modern dark engineering stylesheet
│   ├── icon_red_b64.txt     # 内嵌红色应用图标资源 / Embedded app icon
│   └── logo_ww_b64.txt      # 内嵌品牌徽标资源 / Embedded brand logo
├── libs/
│   ├── three.min.js         # Three.js r128 核心图形渲染引擎 / Core 3D engine
│   ├── OrbitControls.js     # 虚拟枢轴轨道漫游控制器 / Virtual pivot orbit controls
│   ├── GLTFLoader.js        # glTF / GLB 2.0 模型加载器 / glTF loader
│   ├── FBXLoader.js         # 二进制与 ASCII FBX 加载器 / FBX loader
│   ├── ColladaLoader.js     # COLLADA (.dae) 建筑与动画加载器 / Collada loader
│   ├── fflate.min.js        # 高性能前端解压库 (IFC/FBX) / Fast decompression
│   └── TGALoader.js         # TGA 纹理贴图加载器 / TGA texture loader
├── build_viewer.py          # 单文件打包编译器与多版本参数化构建脚本 / Single-file compiler & builder
├── sync_variant_b.py        # SWBIM Scope (Variant B) 自动同步与远端推送脚本 / Variant B synchronizer
├── calc_time.py             # 开发工时全自动精算与版本日志联动脚本 / Development time calculator
├── variant_config.json      # 双版本参数化发行配置与所有权规则 / Multi-variant config
├── BIMScope.html            # 编译生成的单文件便携离线查看器 / Standalone single-file distribution
├── index.html               # 镜像入口与 GitHub Pages 根文件 / Mirror entrypoint & Pages root
├── CHANGELOG.md             # 正式版本演进与工时统计记录 / Release changelog & time metrics
├── FEATURES.md              # 软件功能矩阵与待办需求池 / Features matrix & backlog pool
├── .gitignore               # Git 忽略配置 / Git ignore rules
└── README.md                # 项目综合说明文档 / Project documentation
```

---

## 📄 许可证 / License

This project is licensed under the MIT License.
