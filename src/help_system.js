/**
 * BIM Scope Help & Onboarding Tour System
 * Provides:
 *  1. First-time onboarding guided tour (Welcome modal + 6-step interactive spotlight tour)
 *  2. Floating, draggable & resizable Help Manual dialog with Accordion documentation
 *  3. Interactive feature keyword clicking with auto-activation, spotlighting, and smart collision avoidance
 * @author WWBIM
 */

class BIMHelpSystem {
  constructor(app) {
    this.app = app;
    this.storageKey = 'bimscope_tour_completed';
    this.isTourActive = false;
    this.currentTourStep = 0;
    this.isHelpDialogOpen = false;
    this.activeSpotlightTarget = null;
    
    // Help dialog position & size state
    this.dialogPos = { x: null, y: null };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dialogStart = { x: 0, y: 0 };

    this.init();
  }

  // --- I18N DATA FOR TOUR & HELP MANUAL ---
  getData(lang = null) {
    const l = lang || (window.I18N ? window.I18N.currentLang : 'zh');
    if (l === 'en') {
      return {
        welcomeTitle: "Welcome to BIM Scope",
        welcomeDesc: "Lightweight, ultra-fast 3D BIM & engineering model viewer. We have prepared an interactive guided tour to help you master 3D navigation and core features in 1 minute.",
        welcomeStart: "Start Guided Tour",
        welcomeSkip: "Skip Tour",
        welcomeLangLabel: "Language:",
        tourExit: "Exit Tour",
        tourPrev: "Back",
        tourNext: "Next",
        tourFinish: "Finish Tour",
        tourStepLabel: "Step {current} of {total}",
        helpTitle: "BIM Scope User Guide",
        helpRerunTour: "Re-run Tour",
        helpClose: "Close",
        helpSearchPlaceholder: "Search features, controls, shortcuts...",
        helpSearchEmpty: "No matching guide content found",
        locateTooltip: "Click to locate and highlight this feature in viewport",
        tourSteps: [
          {
            target: "#viewport-container",
            title: "3D Viewport & Mouse Navigation",
            desc: "High-performance WebGL 3D rendering engine. Master viewport camera navigation with simple gestures:",
            items: [
              "🖱️ <b>Left Mouse Drag</b>: Orbit / rotate camera freely",
              "🖱️ <b>Right Mouse Drag</b>: Pan viewport horizontally / vertically",
              "🖱️ <b>Scroll Wheel</b>: Smooth zoom in / zoom out",
              "🖱️ <b>Double-Click on Component</b>: Smoothly center & fit view to the clicked element"
            ]
          },
          {
            target: "#nav-center-views",
            title: "View Presets & Camera Projections",
            desc: "Quick standard architectural viewing angles and camera projection modes:",
            items: [
              "📐 <b>Iso</b>: Standard Isometric angle (South-East)",
              "📐 <b>Plan</b>: Orthographic top-down plan view",
              "📐 <b>N / S / E / W</b>: North, South, East, West elevation views",
              "🎥 <b>Persp / Ortho</b>: Toggle between perspective depth and orthographic engineering projection",
              "↩️ <b>Undo / Redo</b>: Rollback or restore previous camera view angles"
            ]
          },
          {
            target: ".nav-right",
            title: "Top Navigation & Management Tools",
            desc: "Access global project tools, model file loading, and revision comparisons:",
            items: [
              "🧰 <b>Tools</b>: Open floating architectural tools (Sectioning, Sun & Light, Measurement)",
              "🌐 <b>Language & Theme</b>: Toggle English / Chinese and Dark / Light appearances",
              "⚖️ <b>Compare</b>: Dual-model geometric difference analysis (Added/Deleted/Modified color-coded)",
              "📂 <b>Open Model</b>: Load local IFC, GLB, FBX, OBJ architectural models directly"
            ]
          },
          {
            target: "#left-sidebar",
            title: "Model Hierarchy & Component Tree",
            desc: "Inspect and control building elements across multiple structural dimensions:",
            items: [
              "🌲 <b>Structures</b>: Spatial physical containment tree with live keyword filtering",
              "🏢 <b>Levels</b>: Grouped by architectural building storeys (1F, 2F, etc.)",
              "🧱 <b>Elements</b>: Categorized by IFC entity classes (Walls, Slabs, Windows, Doors, etc.)",
              "👁️ <b>Visibility & Opacity</b>: Toggle element visibility or slide opacity to view through structures"
            ]
          },
          {
            target: "#right-sidebar",
            title: "Inspector & Properties Panel",
            desc: "Inspect element properties, customize visuals, and fine-tune material styles:",
            items: [
              "🎨 <b>Selection & Outlines</b>: Customize selection highlight color and silhouette edge intensity",
              "📋 <b>Model Profile</b>: View IFC Psets, geometric dimensions, elevation levels, and quantities",
              "🎛️ <b>Object Tuning</b>: Adjust surface color, opacity, and wireframe for selected elements",
              "📊 <b>Data Export</b>: Copy summary or export full component properties to JSON"
            ]
          },
          {
            target: "#bottom-bar",
            title: "Category Legend & Status Metrics",
            desc: "Bottom quick category isolation and real-time engineering telemetry:",
            items: [
              "🏷️ <b>Category Chips (Left)</b>: Click to toggle category; Alt-click to isolate category exclusively",
              "📍 <b>Real-time Coordinates (Right)</b>: Dynamic cursor 3D coordinates (X, Y, RL level)",
              "📈 <b>Performance Metrics</b>: Live triangle count, vertex count, memory usage, and pinned 165 FPS"
            ]
          }
        ],
        helpSections: [
          {
            id: "quick-start",
            title: "1. Quick Start & Mouse Controls",
            icon: "🚀",
            content: `
              <p>BIM Scope runs 100% offline in your browser, delivering high-precision BIM visualization with zero cloud dependency.</p>
              <h4>Basic Mouse Controls:</h4>
              <ul>
                <li><b>Left Mouse Button Drag</b>: Orbit / rotate the model in 3D space.</li>
                <li><b>Right Mouse Button Drag</b>: Pan and translate the viewport.</li>
                <li><b>Mouse Wheel</b>: Smooth zoom in and out.</li>
                <li><b>Double-Click Any Element</b>: Instantly center the camera on the target element.</li>
                <li><b>Left-Click Element</b>: Select component and open its property inspector.</li>
                <li><b>Shift + Left Mouse Drag</b>: Box / marquee selection to pick multiple elements simultaneously.</li>
              </ul>
              <h4>Quick Action Targets:</h4>
              <p>Click any feature tag below to locate it on screen:</p>
              <div class="help-links-group">
                <span class="help-target-link" data-target="viewport">3D Viewport</span>
                <span class="help-target-link" data-target="open-model">Open Local Model</span>
                <span class="help-target-link" data-target="demo-model">Demo Model</span>
                <span class="help-target-link" data-target="lang-toggle">Language Switch</span>
                <span class="help-target-link" data-target="theme-toggle">Theme Appearance</span>
              </div>
            `
          },
          {
            id: "view-nav",
            title: "2. View Presets & Camera Projections",
            icon: "📐",
            content: `
              <p>Quickly switch between architectural standard viewpoints and camera projections at the top center bar:</p>
              <ul>
                <li><b>Isometric (Iso)</b>: Southeast standard 30-degree architectural axonometric view.</li>
                <li><b>Plan (Plan)</b>: Top-down floor view with automatic orthogonal orientation.</li>
                <li><b>Elevations (N / S / E / W)</b>: True north, south, east, and west elevation projections.</li>
                <li><b>Persp / Ortho Switch</b>: Perspective projection offers realistic depth perception; Orthogonal projection maintains parallel lines without foreshortening distortion, ideal for drawings and measurements.</li>
                <li><b>Undo / Redo Navigation</b>: Records your viewing history. Click arrows to step backward or forward.</li>
              </ul>
              <div class="help-links-group">
                <span class="help-target-link" data-target="view-iso">Isometric (Iso)</span>
                <span class="help-target-link" data-target="view-plan">Plan View</span>
                <span class="help-target-link" data-target="view-elevations">Elevations (N/S/E/W)</span>
                <span class="help-target-link" data-target="view-proj">Persp / Ortho Switch</span>
                <span class="help-target-link" data-target="view-history">View Undo/Redo</span>
              </div>
            `
          },
          {
            id: "hierarchy",
            title: "3. Model Hierarchy & Component Tree",
            icon: "🌲",
            content: `
              <p>The left sidebar offers three complementary perspectives to explore and filter building components:</p>
              <ul>
                <li><b>Structures</b>: Shows spatial containment structure (Project → Site → Building → Storey → Components). Equipped with a virtual scrolling engine supporting 10,000+ elements at smooth 60+ FPS.</li>
                <li><b>Levels</b>: Grouped by elevation storeys. Perfect for vertical section inspection.</li>
                <li><b>Elements</b>: Grouped by IFC building product types (IfcWall, IfcSlab, IfcWindow, etc.).</li>
                <li><b>Live Filter Search</b>: Type in the search box to filter elements in real-time.</li>
                <li><b>Batch Opacity Slider</b>: Make entire storeys or categories semi-transparent for X-ray structural inspection.</li>
              </ul>
              <div class="help-links-group">
                <span class="help-target-link" data-target="left-sidebar">Hierarchy Panel</span>
                <span class="help-target-link" data-target="tab-structures">Structures Tree</span>
                <span class="help-target-link" data-target="tab-levels">Levels View</span>
                <span class="help-target-link" data-target="tab-elements">Elements Categories</span>
                <span class="help-target-link" data-target="tree-search">Filter Search Bar</span>
              </div>
            `
          },
          {
            id: "tools",
            title: "4. Measurement & Sectioning Tools",
            icon: "✂️",
            content: `
              <p>Click the <b>Tools</b> button on the top right to open the floating architectural tools panel:</p>
              <ul>
                <li><b>Two-Point Distance Measurement</b>: Snap to model surface vertices to measure 3D spatial direct distance, horizontal distance (ΔX, ΔY), and vertical level difference (ΔZ). Supports Meters (m) and Millimeters (mm).</li>
                <li><b>3-Axis Dynamic Sectioning Box</b>: Interactive clipping box along X, Y, and Z axes. Drag sliders to slice through building interiors without geometry distortion. Supports clip inversion and section plane outlines.</li>
              </ul>
              <div class="help-links-group">
                <span class="help-target-link" data-target="tools-panel">Tools Floating Panel</span>
                <span class="help-target-link" data-target="measure-tool">Distance Measurement</span>
                <span class="help-target-link" data-target="section-tool">3-Axis Sectioning Box</span>
              </div>
            `
          },
          {
            id: "solar",
            title: "5. Singapore Sun & Lighting Simulation",
            icon: "☀️",
            content: `
              <p>Realistic astronomical sunlight and shadow simulation powered by the NOAA / PSA solar positioning algorithms:</p>
              <ul>
                <li><b>Singapore Solar</b>: Calibrated to Singapore geographic coordinates (1.3521° N, 103.8198° E, UTC+8). Accurately calculates sun azimuth and elevation based on date and time of day.</li>
                <li><b>Time-of-Day Slider</b>: Drag through Dawn (06:45), Noon (13:08), Afternoon (16:30), and Sunset (19:15) with realistic golden hour color temperature transitions.</li>
                <li><b>24-Hour Timelapse</b>: Click "Play 24h Timelapse" to animate sunlight moving across the building facade.</li>
                <li><b>Custom Light Mode</b>: Manually customize azimuth, elevation, intensity, and light color for design presentations.</li>
                <li><b>Crisp Shadow Map</b>: Tight shadow camera frustum with normal-bias to eliminate grazing-angle shadow artifacts.</li>
              </ul>
              <div class="help-links-group">
                <span class="help-target-link" data-target="solar-tool">Sun & Light Simulation</span>
              </div>
            `
          },
          {
            id: "inspector",
            title: "6. Inspector & Advanced Features",
            icon: "🔍",
            content: `
              <p>The right sidebar Inspector provides in-depth component data, visual style customization, and revision comparison:</p>
              <ul>
                <li><b>Selection Visuals</b>: Pick your favorite selection highlight color (Cyan, Blue, Green, Amber, etc.) and configure component outline silhouette intensity.</li>
                <li><b>Model Profile</b>: Click any 3D element to inspect its IFC GUID, entity type, dimensions (Length, Width, Height), material layers, and detailed Pset property sets.</li>
                <li><b>Object Tuning</b>: Fine-tune selected component surface color, opacity, and wireframe overlays in real time.</li>
                <li><b>Model Comparison (Compare)</b>: Compare two IFC models. Added components highlight in Green, Deleted in Red, and Modified in Amber, with automatic geometric drift detection and ghosting.</li>
                <li><b>Category Legend & Status Bar</b>: Bottom chips provide one-click category filtering and show real-time 3D cursor coordinates and 165 FPS metrics.</li>
              </ul>
              <div class="help-links-group">
                <span class="help-target-link" data-target="right-sidebar">Inspector Panel</span>
                <span class="help-target-link" data-target="inspector-profile">Component Profile</span>
                <span class="help-target-link" data-target="inspector-tuning">Object Tuning</span>
                <span class="help-target-link" data-target="compare-btn">Model Compare</span>
                <span class="help-target-link" data-target="bottom-legend">Category Legend</span>
                <span class="help-target-link" data-target="bottom-stats">Status Bar Metrics</span>
              </div>
            `
          }
        ]
      };
    }

    // Default Chinese
    return {
      welcomeTitle: "欢迎使用 BIM Scope",
      welcomeDesc: "轻量、高精度、免安装的纯前端三维 BIM 与工程模型浏览器。我们为您准备了一分钟的新手互动导览，帮助您快速熟悉视口操作与核心功能。",
      welcomeStart: "开始新手引导",
      welcomeSkip: "跳过引导",
      welcomeLangLabel: "界面语言：",
      tourExit: "退出引导",
      tourPrev: "上一步",
      tourNext: "下一步",
      tourFinish: "完成引导",
      tourStepLabel: "步骤 {current} / {total}",
      helpTitle: "BIM Scope 使用指南",
      helpRerunTour: "再次引导",
      helpClose: "关闭",
      helpSearchPlaceholder: "搜索功能、操作或关键词... (按 Esc 清空)",
      helpSearchEmpty: "未找到匹配的帮助内容",
      locateTooltip: "点击在界面中高亮定位该功能",
      tourSteps: [
        {
          target: "#viewport-container",
          title: "3D 视口及常规鼠标操作",
          desc: "高性能 WebGL 3D 渲染核心。通过简单直观的鼠标手势掌控三维视角：",
          items: [
            "🖱️ <b>按住鼠标左键拖拽</b>：自由旋转 / 环视模型 (Orbit)",
            "🖱️ <b>按住鼠标右键拖拽</b>：水平 / 垂直平移视口 (Pan)",
            "🖱️ <b>滚动鼠标滚轮</b>：平滑缩放视距 (Zoom)",
            "🖱️ <b>双击任意构件</b>：镜头平滑过渡并居中对齐该构件 (Focus)"
          ]
        },
        {
          target: "#nav-center-views",
          title: "上方快捷视图与投影切换",
          desc: "建筑标准工程视图与相机投影一键切换：",
          items: [
            "📐 <b>Iso</b>：标准东南 30° 建筑轴测视角",
            "📐 <b>Plan</b>：正上方平视俯视平切视图",
            "📐 <b>N / S / E / W</b>：正北、正南、正东、正西四立面平视视角",
            "🎥 <b>Persp / Ortho</b>：一键在近大远小的透视投影与消除变形的正交工程投影间切换",
            "↩️ <b>撤销 / 重做</b>：记录您的视角移动历史，可随时前进或回退"
          ]
        },
        {
          target: ".nav-right",
          title: "右上方打开、对比和语言切换",
          desc: "常用全局工具、模型文件打开与版本比对功能区：",
          items: [
            "🧰 <b>Tools 工具</b>：展开三轴剖切、新加坡日照模拟与空间测量浮动工具箱",
            "🌐 <b>语言与主题切换</b>：一键无缝切换中英文与高对比深色/浅色外观",
            "⚖️ <b>Compare 模式</b>：双 IFC 模型版本几何差异分析（新增绿、删除红、修改黄）",
            "📂 <b>Open Model</b>：直接打开并解析本地 IFC、GLB、FBX、OBJ 等格式工程模型"
          ]
        },
        {
          target: "#left-sidebar",
          title: "左侧面板及多标签页功能",
          desc: "多维度分类管理模型构件与层次结构：",
          items: [
            "🌲 <b>Structures 结构树</b>：按建筑空间包含关系组织，搭载万级构件虚拟滚动引擎",
            "🏢 <b>Levels 楼层</b>：按建筑楼层（1F、2F 等）分组，方便分层查看",
            "🧱 <b>Elements 构件类</b>：按 IFC 实体类型（墙体、板、门窗等）大类归并",
            "👁️ <b>可见性与不透明度</b>：支持分类独占显示与批量调节不透明度，透视查看内部结构"
          ]
        },
        {
          target: "#right-sidebar",
          title: "右侧面板及多种信息显示",
          desc: "属性检查器、样式定制与构件外观微调：",
          items: [
            "🎨 <b>高亮与轮廓线</b>：自定义构件选中高亮颜色及外轮廓线 (Outline) 粗细强度",
            "📋 <b>Model Profile</b>：选中构件后展示 IFC 属性集 (Psets)、空间尺寸、材料与工程量",
            "🎛️ <b>构件微调 (Object Tuning)</b>：实时微调选中构件的材质颜色、透明度与网格线",
            "📊 <b>数据导出</b>：支持一键复制摘要或导出构件属性 JSON 结构化数据"
          ]
        },
        {
          target: "#bottom-bar",
          title: "底部左侧构件分组及右侧工程信息",
          desc: "底栏构件快速过滤图例与实时工程数据监控：",
          items: [
            "🏷️ <b>左侧构件分类胶囊</b>：单击切换该类构件显示，Alt + 单击快速独占孤立该类构件",
            "📍 <b>右侧实时三维坐标</b>：光标在模型表面悬停时显示精确世界坐标 (X, Y, RL 标高)",
            "📈 <b>工程遥测指标</b>：实时监控三角面数、顶点数、内存开销与满帧 165 FPS"
          ]
        }
      ],
      helpSections: [
        {
          id: "quick-start",
          title: "1. 快速入门与基本操作",
          icon: "🚀",
          content: `
            <p>BIM Scope 采用纯浏览器本地离线运行机制，不上传任何模型数据至云端，提供高安全、高精度的三维工程可视化能力。</p>
            <h4>常用鼠标手势：</h4>
            <ul>
              <li><b>鼠标左键拖拽</b>：在三维空间中旋转环视模型。</li>
              <li><b>鼠标右键拖拽</b>：平移相机视口。</li>
              <li><b>鼠标滚轮滚动</b>：平滑推进与拉远视距。</li>
              <li><b>双击任意构件</b>：镜头平滑过渡并将该构件居中缩放至屏幕正中。</li>
              <li><b>单击任意构件</b>：选中该构件并在右侧检查器中激活属性面板。</li>
              <li><b>Shift + 鼠标左键拖拽</b>：框选视口内的多个构件进行批量检查。</li>
            </ul>
            <h4>快速定位常用入口：</h4>
            <p>点击下方标签可直接在主界面中高亮对应功能区域：</p>
            <div class="help-links-group">
              <span class="help-target-link" data-target="viewport">3D 视口</span>
              <span class="help-target-link" data-target="open-model">打开本地模型</span>
              <span class="help-target-link" data-target="demo-model">重载演示模型</span>
              <span class="help-target-link" data-target="lang-toggle">中英文切换</span>
              <span class="help-target-link" data-target="theme-toggle">深浅主题切换</span>
            </div>
          `
        },
        {
          id: "view-nav",
          title: "2. 视图投影与导航控制",
          icon: "📐",
          content: `
            <p>顶栏正中控制台提供标准工程视角与投影模式快速切换：</p>
            <ul>
              <li><b>轴测视图 (Iso)</b>：东南 30° 标准建筑三维轴测投影角度。</li>
              <li><b>平面视图 (Plan)</b>：正上方垂直俯视平视，自动对齐建筑坐标系。</li>
              <li><b>立面视图 (N / S / E / W)</b>：正北、正南、正东、正西四大建筑立面平视投影。</li>
              <li><b>透视 / 正交切换 (Persp / Ortho)</b>：透视投影具有逼真的近大远小空间感；正交工程投影消除了透视变形，适合出图、对齐与精准尺寸测量。</li>
              <li><b>视角撤销 / 重做</b>：系统自动记录镜头移动轨迹，可随时按箭头回退或重做视角。</li>
            </ul>
            <div class="help-links-group">
              <span class="help-target-link" data-target="view-iso">Iso 轴测</span>
              <span class="help-target-link" data-target="view-plan">Plan 俯视平面</span>
              <span class="help-target-link" data-target="view-elevations">四立面视图</span>
              <span class="help-target-link" data-target="view-proj">透视 / 正交切换</span>
              <span class="help-target-link" data-target="view-history">视角撤销重做</span>
            </div>
          `
        },
        {
          id: "hierarchy",
          title: "3. 模型层级与构件结构树",
          icon: "🌲",
          content: `
            <p>左侧边栏提供三种维度的分类管理模式，配备极速虚拟滚动与快速过滤：</p>
            <ul>
              <li><b>结构树 (Structures)</b>：按照空间包含体系（项目 → 场地 → 建筑 → 楼层 → 构件）组织。内置虚拟列表，承载万级构件无卡顿。</li>
              <li><b>楼层视图 (Levels)</b>：按建筑标高与楼层划分，方便单独查看地下室、一层或屋面。</li>
              <li><b>类别视图 (Elements)</b>：按 IFC 实体标准（墙、柱、板、门、窗、幕墙等）分类聚合。</li>
              <li><b>快速搜索过滤</b>：在搜索栏输入构件名称、类别或 GUID 即时高亮过滤。</li>
              <li><b>批量不透明度滑块</b>：可拖动滑块使整个楼层或类别半透明，透视观察钢筋或机电管道。</li>
            </ul>
            <div class="help-links-group">
              <span class="help-target-link" data-target="left-sidebar">左侧层级面板</span>
              <span class="help-target-link" data-target="tab-structures">结构树</span>
              <span class="help-target-link" data-target="tab-levels">楼层分组</span>
              <span class="help-target-link" data-target="tab-elements">构件大类</span>
              <span class="help-target-link" data-target="tree-search">构件搜索框</span>
            </div>
          `
        },
        {
          id: "tools",
          title: "4. 测量工具与三轴剖切盒",
          icon: "✂️",
          content: `
            <p>点击右上角 <b>Tools</b> 按钮展开浮动工具面板，包含高精度测量与动态剖切能力：</p>
            <ul>
              <li><b>两点空间距离测量</b>：点击模型表面两点，精确测算三维直线距离、水平距离 (ΔX, ΔY) 及垂直标高差 (ΔZ)，支持米 (m) 与毫米 (mm) 切换。</li>
              <li><b>三轴动态剖切盒 (Sectioning Box)</b>：沿 X、Y、Z 三个坐标轴滑动剖切面，切入建筑内部查看结构剖面，支持剖切方向反转与剖切框贴合构件。</li>
            </ul>
            <div class="help-links-group">
              <span class="help-target-link" data-target="tools-panel">Tools 浮动面板</span>
              <span class="help-target-link" data-target="measure-tool">空间距离测量</span>
              <span class="help-target-link" data-target="section-tool">三轴动态剖切</span>
            </div>
          `
        },
        {
          id: "solar",
          title: "5. 真实太阳与光照模拟",
          icon: "☀️",
          content: `
            <p>基于严谨的 NOAA / PSA 天文太阳轨迹算法，模拟高真实感建筑采光与阴影过渡：</p>
            <ul>
              <li><b>新加坡太阳 (Singapore Solar)</b>：严谨基于新加坡地理经纬度（北纬 1.3521°，东经 103.8198°，UTC+8）测算日出、日中与日落的精确方位角与仰角。</li>
              <li><b>时间滑块</b>：拖拽滑块可在清晨黎明 (06:45)、正午艳阳 (13:08)、午后暖阳 (16:30) 与黄昏落日 (19:15) 之间平滑过渡，自动适配黄金时刻暖色色温。</li>
              <li><b>24小时延时摄影</b>：点击“播放24h延时”可全自动演示一整天的光影轨迹变幻。</li>
              <li><b>自定义光照模式 (Custom Light)</b>：手动指定方位角、仰角、光强与光源颜色，满足特定效果图展示需求。</li>
              <li><b>纯净抗暗纹阴影</b>：针对小角度掠射光线深度优化 normalBias，彻底消除地面自遮挡平行暗纹。</li>
            </ul>
            <div class="help-links-group">
              <span class="help-target-link" data-target="solar-tool">日照与光照模拟</span>
            </div>
          `
        },
        {
          id: "inspector",
          title: "6. 属性检查器与高级功能",
          icon: "🔍",
          content: `
            <p>右侧检查器提供详尽的构件工程属性、视觉效果定制与双版本几何对比：</p>
            <ul>
              <li><b>视觉表现定制</b>：自定义构件高亮选中色（青、蓝、绿、金等）及构件外边缘轮廓线 (Outline) 强度。</li>
              <li><b>构件属性 (Model Profile)</b>：选中任意构件后，显示 IFC 全套 Pset 属性集、长宽厚尺寸、所处楼层及所属类别；未选中构件时显示项目总体概览。</li>
              <li><b>构件微调 (Object Tuning)</b>：实时定制选中构件的表面漫反射颜色、透明度及线框显示。</li>
              <li><b>双模型几何版本对比 (Compare)</b>：加载新旧两个版本的 IFC 模型，自动高亮新增构件（绿色）、删除构件（红色）与变更构件（黄色），并支持几何位移残影展示。</li>
              <li><b>底栏图例与状态监控</b>：底栏左侧构件胶囊支持一键切换显示或 Alt 独占隔离；右侧显示光标所指位置实时 3D 坐标与稳固的 165 FPS 性能指标。</li>
            </ul>
            <div class="help-links-group">
              <span class="help-target-link" data-target="right-sidebar">检查器面板</span>
              <span class="help-target-link" data-target="inspector-profile">构件属性卡片</span>
              <span class="help-target-link" data-target="inspector-tuning">构件外观微调</span>
              <span class="help-target-link" data-target="compare-btn">模型版本对比</span>
              <span class="help-target-link" data-target="bottom-legend">构件分类图例</span>
              <span class="help-target-link" data-target="bottom-stats">底栏坐标与状态</span>
            </div>
          `
        }
      ]
    };
  }

  // --- INITIALIZATION ---
  init() {
    this.createDomElements();
    this.bindEvents();
  }

  createDomElements() {
    // 1. Tour Onboarding Overlay
    if (!document.getElementById('tour-overlay-container')) {
      const tourOverlay = document.createElement('div');
      tourOverlay.id = 'tour-overlay-container';
      tourOverlay.className = 'tour-overlay-container';
      tourOverlay.style.display = 'none';
      tourOverlay.innerHTML = `
        <svg class="tour-svg-backdrop" id="tour-svg-backdrop">
          <defs>
            <mask id="tour-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect id="tour-mask-cutout" x="0" y="0" width="0" height="0" rx="8" ry="8" fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(6, 11, 24, 0.78)" mask="url(#tour-spotlight-mask)" />
        </svg>
        <div class="tour-spotlight-halo" id="tour-spotlight-halo"></div>
        <button class="tour-exit-pill" id="tour-btn-exit-top" title="Exit Tour">✕ 退出引导</button>

        <!-- Welcome Modal -->
        <div class="tour-welcome-modal" id="tour-welcome-modal" style="display:none;">
          <div class="tour-welcome-header">
            <div class="tour-brand-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9.5"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <circle cx="12" cy="17" r="0.5" fill="currentColor"></circle>
              </svg>
            </div>
            <div class="tour-welcome-title" id="tour-welcome-title">欢迎使用 BIM Scope</div>
            <button class="tour-modal-close-btn" id="tour-welcome-close-btn" title="Close">✕</button>
          </div>
          <div class="tour-welcome-body">
            <p id="tour-welcome-desc">轻量、高精度的三维 BIM 与工程模型浏览器。检测到您是首次打开本应用，是否开启 1 分钟新手互动引导？</p>
            <div class="tour-lang-selector-row">
              <span class="tour-lang-label" id="tour-welcome-lang-label">界面语言：</span>
              <div class="tour-lang-btn-group">
                <button type="button" class="tour-lang-btn active" data-lang="zh">中文</button>
                <button type="button" class="tour-lang-btn" data-lang="en">English</button>
              </div>
            </div>
          </div>
          <div class="tour-welcome-footer">
            <button type="button" class="tour-btn-secondary" id="tour-welcome-btn-skip">跳过引导</button>
            <button type="button" class="tour-btn-primary" id="tour-welcome-btn-start">开始新手引导</button>
          </div>
        </div>

        <!-- Tour Callout Card -->
        <div class="tour-callout-card" id="tour-callout-card" style="display:none;">
          <div class="tour-callout-header">
            <span class="tour-step-badge" id="tour-callout-badge">步骤 1 / 6</span>
            <div class="tour-callout-title" id="tour-callout-title">3D 视口及常规鼠标操作</div>
            <button class="tour-callout-close-btn" id="tour-callout-close-btn" title="Exit Tour">✕</button>
          </div>
          <div class="tour-callout-body" id="tour-callout-body">
            <!-- Populated dynamically -->
          </div>
          <div class="tour-callout-footer">
            <div class="tour-callout-dots" id="tour-callout-dots"></div>
            <div class="tour-callout-actions">
              <button type="button" class="tour-btn-secondary" id="tour-callout-btn-prev">上一步</button>
              <button type="button" class="tour-btn-primary" id="tour-callout-btn-next">下一步</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(tourOverlay);
    }

    // 2. Floating Help Dialog
    if (!document.getElementById('floating-help-dialog')) {
      const helpDialog = document.createElement('div');
      helpDialog.id = 'floating-help-dialog';
      helpDialog.className = 'floating-help-dialog';
      helpDialog.style.display = 'none';
      helpDialog.innerHTML = `
        <div class="help-dialog-header" id="help-dialog-drag-handle">
          <button type="button" class="help-dialog-rerun-btn" id="help-btn-rerun-tour" title="Re-run Onboarding Tour">
            <span class="help-rerun-icon">⟲</span>
            <span id="help-btn-rerun-text">再次引导</span>
          </button>
          <div class="help-dialog-title-text" id="help-dialog-title">BIM Scope 使用指南</div>
          <button type="button" class="help-dialog-close-btn" id="help-dialog-close-btn" title="Close">✕</button>
        </div>
        <div class="help-dialog-body" id="help-dialog-body">
          <div class="help-search-bar-row" id="help-search-bar-row">
            <div class="help-search-input-wrapper">
              <svg class="help-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" class="help-search-input" id="help-search-input" placeholder="搜索功能、操作或关键词... (按 Esc 清空)" autocomplete="off" spellcheck="false" />
              <button type="button" class="help-search-clear-btn" id="help-search-clear-btn" title="Clear search" style="display:none;">✕</button>
            </div>
            <div class="help-search-shortcut-badge" title="Press Ctrl+F to focus search">Ctrl + F</div>
          </div>
          <div class="help-search-empty-state" id="help-search-empty-state" style="display:none;">
            未找到匹配的帮助内容
          </div>
          <div class="help-accordion-container" id="help-accordion-list">
            <!-- Populated dynamically -->
          </div>
        </div>
        <div class="help-dialog-resizer" id="help-dialog-resizer" title="Resize"></div>
      `;
      document.body.appendChild(helpDialog);
    }

    // 3. Spotlight Overlay for Help Manual Feature Locating
    if (!document.getElementById('help-spotlight-overlay')) {
      const helpSpotlight = document.createElement('div');
      helpSpotlight.id = 'help-spotlight-overlay';
      helpSpotlight.className = 'help-spotlight-overlay';
      helpSpotlight.style.display = 'none';
      helpSpotlight.innerHTML = `
        <svg class="help-spotlight-svg">
          <defs>
            <mask id="help-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect id="help-mask-cutout" x="0" y="0" width="0" height="0" rx="8" ry="8" fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(6, 11, 24, 0.70)" mask="url(#help-spotlight-mask)" />
        </svg>
        <div class="help-spotlight-halo" id="help-spotlight-halo"></div>
        <div class="help-spotlight-dismiss-hint" id="help-spotlight-dismiss-hint">
          点击任意空白处退出高亮定位 (Click anywhere to dismiss)
        </div>
      `;
      document.body.appendChild(helpSpotlight);
    }
  }

  bindEvents() {
    // 1. Top Navbar Help Button
    const btnHelp = document.getElementById('btn-help-guide');
    if (btnHelp) {
      btnHelp.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleHelpDialog();
      });
    }

    // 2. Welcome Modal Buttons
    const btnWelcomeStart = document.getElementById('tour-welcome-btn-start');
    if (btnWelcomeStart) {
      btnWelcomeStart.addEventListener('click', () => {
        this.startTour(false);
      });
    }

    const btnWelcomeSkip = document.getElementById('tour-welcome-btn-skip');
    if (btnWelcomeSkip) {
      btnWelcomeSkip.addEventListener('click', () => {
        this.exitTour(true);
      });
    }

    const btnWelcomeClose = document.getElementById('tour-welcome-close-btn');
    if (btnWelcomeClose) {
      btnWelcomeClose.addEventListener('click', () => {
        this.exitTour(true);
      });
    }

    // Welcome Language Toggle
    const langBtns = document.querySelectorAll('.tour-lang-btn');
    langBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        langBtns.forEach(b => b.classList.toggle('active', b === btn));
        if (window.I18N && window.I18N.currentLang !== lang) {
          window.I18N.setLanguage(lang);
        }
        this.renderWelcomeModal();
      });
    });

    // 3. Tour Overlay Controls
    const btnExitTop = document.getElementById('tour-btn-exit-top');
    if (btnExitTop) {
      btnExitTop.addEventListener('click', () => this.exitTour(true));
    }

    const btnCalloutClose = document.getElementById('tour-callout-close-btn');
    if (btnCalloutClose) {
      btnCalloutClose.addEventListener('click', () => this.exitTour(true));
    }

    const btnCalloutPrev = document.getElementById('tour-callout-btn-prev');
    if (btnCalloutPrev) {
      btnCalloutPrev.addEventListener('click', () => this.prevTourStep());
    }

    const btnCalloutNext = document.getElementById('tour-callout-btn-next');
    if (btnCalloutNext) {
      btnCalloutNext.addEventListener('click', () => this.nextTourStep());
    }

    // 4. Help Dialog Controls
    const btnHelpClose = document.getElementById('help-dialog-close-btn');
    if (btnHelpClose) {
      btnHelpClose.addEventListener('click', () => this.closeHelpDialog());
    }

    const btnRerunTour = document.getElementById('help-btn-rerun-tour');
    if (btnRerunTour) {
      btnRerunTour.addEventListener('click', () => {
        this.closeHelpDialog();
        this.startTour(false);
      });
    }

    // 5. Help Spotlight Dismissal
    const helpSpotlightOverlay = document.getElementById('help-spotlight-overlay');
    if (helpSpotlightOverlay) {
      helpSpotlightOverlay.addEventListener('click', () => {
        this.dismissSpotlight();
      });
    }

    // Search Filter Events
    const searchInput = document.getElementById('help-search-input');
    const searchClear = document.getElementById('help-search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterHelpContent(e.target.value);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.filterHelpContent('');
          searchInput.blur();
        }
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          this.filterHelpContent('');
          searchInput.focus();
        }
      });
    }

    // Keyboard shortcuts: Ctrl+F to focus search, ESC to dismiss spotlight/tour
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        if (this.isHelpDialogOpen) {
          e.preventDefault();
          const input = document.getElementById('help-search-input');
          if (input) {
            input.focus();
            input.select();
          }
        }
      } else if (e.key === 'Escape') {
        if (this.activeSpotlightTarget) {
          this.dismissSpotlight();
        } else if (this.isTourActive) {
          this.exitTour(true);
        }
      }
    });

    // Window resize handler
    window.addEventListener('resize', () => {
      if (this.isTourActive) {
        this.updateTourSpotlight();
      }
      if (this.activeSpotlightTarget) {
        this.updateFeatureSpotlightBox(this.activeSpotlightTarget);
      }
    });

    // 6. Help Dialog Dragging Logic
    this.initDialogDraggable();

    // 7. Accordion & Target Link Delegation
    const accordionList = document.getElementById('help-accordion-list');
    if (accordionList) {
      accordionList.addEventListener('click', (e) => {
        // Toggle Accordion section header (mutually exclusive + auto scroll to top)
        const header = e.target.closest('.help-accordion-header');
        if (header) {
          const item = header.closest('.help-accordion-item');
          if (item) {
            const isAlreadyActive = item.classList.contains('active');
            // Close all items
            accordionList.querySelectorAll('.help-accordion-item').forEach(it => {
              it.classList.remove('active');
            });

            if (!isAlreadyActive) {
              item.classList.add('active');
              // Auto-scroll so expanded section aligns at the top of the body
              const body = document.getElementById('help-dialog-body');
              if (body) {
                const targetTop = Math.max(0, item.offsetTop - 10);
                body.scrollTo({ top: targetTop, behavior: 'smooth' });
              }
            }
          }
          return;
        }

        // Click on feature keyword link
        const link = e.target.closest('.help-target-link');
        if (link) {
          const targetKey = link.getAttribute('data-target');
          if (targetKey) {
            this.locateFeature(targetKey);
          }
        }
      });
    }
  }

  // --- DRAGGABLE & RESIZABLE DIALOG ---
  initDialogDraggable() {
    const handle = document.getElementById('help-dialog-drag-handle');
    const dialog = document.getElementById('floating-help-dialog');
    if (!handle || !dialog) return;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      this.isDragging = true;
      handle.classList.add('dragging');
      this.dragStart = { x: e.clientX, y: e.clientY };
      const rect = dialog.getBoundingClientRect();
      this.dialogStart = { x: rect.left, y: rect.top };
      dialog.setPointerCapture(e.pointerId);
      dialog.style.transition = 'none';
      e.preventDefault();
    });

    dialog.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      let newLeft = this.dialogStart.x + dx;
      let newTop = this.dialogStart.y + dy;

      // Constrain within viewport
      const pad = 8;
      const maxLeft = window.innerWidth - dialog.offsetWidth - pad;
      const maxTop = window.innerHeight - dialog.offsetHeight - pad;
      newLeft = Math.max(pad, Math.min(maxLeft, newLeft));
      newTop = Math.max(pad + 40, Math.min(maxTop, newTop));

      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
      dialog.style.right = 'auto';
      dialog.style.bottom = 'auto';
      this.dialogPos = { x: newLeft, y: newTop };
    });

    const stopDrag = (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        handle.classList.remove('dragging');
        try { dialog.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    dialog.addEventListener('pointerup', stopDrag);
    dialog.addEventListener('pointercancel', stopDrag);

    // Dialog Resizer (Custom Handle)
    const resizer = document.getElementById('help-dialog-resizer');
    if (resizer) {
      let isResizing = false;
      let rStart = { x: 0, y: 0, w: 0, h: 0 };
      resizer.addEventListener('pointerdown', (e) => {
        isResizing = true;
        rStart = {
          x: e.clientX,
          y: e.clientY,
          w: dialog.offsetWidth,
          h: dialog.offsetHeight
        };
        resizer.setPointerCapture(e.pointerId);
        dialog.style.transition = 'none';
        e.preventDefault();
        e.stopPropagation();
      });

      resizer.addEventListener('pointermove', (e) => {
        if (!isResizing) return;
        const dw = e.clientX - rStart.x;
        const dh = e.clientY - rStart.y;
        const newW = Math.max(350, Math.min(600, Math.min(window.innerWidth - 32, rStart.w + dw)));
        const newH = Math.max(380, Math.min(window.innerHeight - 60, rStart.h + dh));
        dialog.style.width = `${newW}px`;
        dialog.style.height = `${newH}px`;
      });

      const stopResize = (e) => {
        if (isResizing) {
          isResizing = false;
          try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      resizer.addEventListener('pointerup', stopResize);
      resizer.addEventListener('pointercancel', stopResize);
    }
  }

  // --- AUTO START CHECK ---
  checkAutoStart() {
    try {
      const completed = localStorage.getItem(this.storageKey);
      if (!completed) {
        // Auto-show welcome onboarding modal on first load
        setTimeout(() => {
          this.showWelcomeModal();
        }, 600);
      }
    } catch (e) {
      console.warn('LocalStorage access error in tour check:', e);
    }
  }

  // --- TOUR ONBOARDING LOGIC ---
  showWelcomeModal() {
    this.isTourActive = true;
    const overlay = document.getElementById('tour-overlay-container');
    const welcome = document.getElementById('tour-welcome-modal');
    const callout = document.getElementById('tour-callout-card');
    const halo = document.getElementById('tour-spotlight-halo');
    const cutout = document.getElementById('tour-mask-cutout');

    if (overlay) overlay.style.display = 'block';
    if (welcome) welcome.style.display = 'flex';
    if (callout) callout.style.display = 'none';
    if (halo) halo.style.display = 'none';
    if (cutout) {
      cutout.setAttribute('width', '0');
      cutout.setAttribute('height', '0');
    }

    this.renderWelcomeModal();
  }

  renderWelcomeModal() {
    const data = this.getData();
    const title = document.getElementById('tour-welcome-title');
    const desc = document.getElementById('tour-welcome-desc');
    const label = document.getElementById('tour-welcome-lang-label');
    const btnStart = document.getElementById('tour-welcome-btn-start');
    const btnSkip = document.getElementById('tour-welcome-btn-skip');
    const btnExit = document.getElementById('tour-btn-exit-top');

    if (title) title.textContent = data.welcomeTitle;
    if (desc) desc.textContent = data.welcomeDesc;
    if (label) label.textContent = data.welcomeLangLabel;
    if (btnStart) btnStart.textContent = data.welcomeStart;
    if (btnSkip) btnSkip.textContent = data.welcomeSkip;
    if (btnExit) btnExit.textContent = `✕ ${data.tourExit}`;

    // Sync language pill state
    const currentLang = window.I18N ? window.I18N.currentLang : 'zh';
    document.querySelectorAll('.tour-lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
    });
  }

  startTour(skipWelcome = false) {
    this.isTourActive = true;
    const welcome = document.getElementById('tour-welcome-modal');
    if (welcome) welcome.style.display = 'none';

    const overlay = document.getElementById('tour-overlay-container');
    if (overlay) overlay.style.display = 'block';

    const callout = document.getElementById('tour-callout-card');
    if (callout) callout.style.display = 'flex';

    this.currentTourStep = 0;
    this.goToTourStep(0);
  }

  goToTourStep(index) {
    const data = this.getData();
    const steps = data.tourSteps;
    if (index < 0) index = 0;
    if (index >= steps.length) {
      this.exitTour(true);
      return;
    }

    this.currentTourStep = index;
    const step = steps[index];

    // Update Callout Header & Content
    const badge = document.getElementById('tour-callout-badge');
    const title = document.getElementById('tour-callout-title');
    const body = document.getElementById('tour-callout-body');
    const btnPrev = document.getElementById('tour-callout-btn-prev');
    const btnNext = document.getElementById('tour-callout-btn-next');
    const dotsContainer = document.getElementById('tour-callout-dots');

    if (badge) {
      badge.textContent = data.tourStepLabel
        .replace('{current}', index + 1)
        .replace('{total}', steps.length);
    }
    if (title) title.textContent = step.title;

    if (body) {
      let html = `<p class="tour-step-intro">${step.desc}</p>`;
      if (step.items && step.items.length) {
        html += `<ul class="tour-step-list">`;
        step.items.forEach(it => {
          html += `<li>${it}</li>`;
        });
        html += `</ul>`;
      }
      body.innerHTML = html;
    }

    if (btnPrev) {
      btnPrev.textContent = data.tourPrev;
      btnPrev.style.visibility = index === 0 ? 'hidden' : 'visible';
    }
    if (btnNext) {
      btnNext.textContent = (index === steps.length - 1) ? data.tourFinish : data.tourNext;
    }

    // Render Indicator Dots
    if (dotsContainer) {
      let dotsHtml = '';
      for (let i = 0; i < steps.length; i++) {
        dotsHtml += `<span class="tour-dot ${i === index ? 'active' : ''}" data-step="${i}"></span>`;
      }
      dotsContainer.innerHTML = dotsHtml;
      dotsContainer.querySelectorAll('.tour-dot').forEach(d => {
        d.addEventListener('click', () => {
          const stepIdx = parseInt(d.getAttribute('data-step'), 10);
          this.goToTourStep(stepIdx);
        });
      });
    }

    // Highlight target element with cutout & position callout
    this.updateTourSpotlight();
  }

  updateTourSpotlight() {
    const data = this.getData();
    const step = data.tourSteps[this.currentTourStep];
    if (!step) return;

    let targetEl = document.querySelector(step.target);
    if (!targetEl) targetEl = document.getElementById('app-container');

    const rect = targetEl ? targetEl.getBoundingClientRect() : {
      left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400
    };

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const pad = 6;

    let cutoutX = Math.round(rect.left - pad);
    let cutoutY = Math.round(rect.top - pad);
    let cutoutW = Math.round(rect.width + pad * 2);
    let cutoutH = Math.round(rect.height + pad * 2);

    // If target touches or is near left screen edge (e.g. Step 4 Left Sidebar, Step 6 Bottom Bar)
    if (rect.left <= 4) {
      cutoutX = 0;
    }
    // If target touches or is near right screen edge (e.g. Step 5 Right Sidebar, Step 6 Bottom Bar)
    if (rect.right >= winW - 4) {
      cutoutW = Math.round(winW - cutoutX);
    }
    // If target touches top edge (e.g. Top navbars)
    if (rect.top <= 4) {
      cutoutY = 0;
    }
    // If target touches bottom edge (e.g. Bottom bar)
    if (rect.bottom >= winH - 4) {
      cutoutH = Math.round(winH - cutoutY);
    }

    // Clamp strictly within visible screen boundaries
    cutoutX = Math.max(0, cutoutX);
    cutoutY = Math.max(0, cutoutY);
    cutoutW = Math.min(winW - cutoutX, cutoutW);
    cutoutH = Math.min(winH - cutoutY, cutoutH);

    const cutout = document.getElementById('tour-mask-cutout');
    const halo = document.getElementById('tour-spotlight-halo');

    if (cutout) {
      cutout.setAttribute('x', cutoutX);
      cutout.setAttribute('y', cutoutY);
      cutout.setAttribute('width', cutoutW);
      cutout.setAttribute('height', cutoutH);
    }

    if (halo) {
      halo.style.display = 'block';
      halo.style.left = `${cutoutX}px`;
      halo.style.top = `${cutoutY}px`;
      halo.style.width = `${cutoutW}px`;
      halo.style.height = `${cutoutH}px`;
    }

    // Step 3 of 6: move exit button down to avoid overlapping the highlighted top-right toolbar
    const exitBtn = document.getElementById('tour-btn-exit-top');
    if (exitBtn) {
      if (this.currentTourStep === 2) {
        exitBtn.style.top = '56px';
        exitBtn.style.right = '18px';
      } else {
        exitBtn.style.top = '14px';
        exitBtn.style.right = '18px';
      }
    }

    // Position Callout Card intelligently
    this.positionCallout(rect);
  }

  positionCallout(targetRect) {
    const callout = document.getElementById('tour-callout-card');
    if (!callout) return;

    const cW = callout.offsetWidth || 380;
    const cH = callout.offsetHeight || 260;
    const pad = 16;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let left = 0;
    let top = 0;

    // Dedicated deterministic placement for each step
    if (this.currentTourStep === 0) {
      // Step 1 of 6 (3D Viewport): Place callout gracefully in bottom-center
      left = Math.round((winW - cW) / 2);
      top = Math.round(winH - cH - 60);
    } else if (this.currentTourStep === 1) {
      // Step 2 of 6 (Top Views Presets): Place callout directly below
      left = Math.round(targetRect.left + (targetRect.width - cW) / 2);
      top = Math.round(targetRect.bottom + pad);
    } else if (this.currentTourStep === 2) {
      // Step 3 of 6 (Top Right): Move callout to the left to leave room for the downward-shifted exit button
      left = Math.round(winW - cW - 150);
      top = Math.round(targetRect.bottom + pad);
    } else if (this.currentTourStep === 3) {
      // Step 4 of 6 (Left Sidebar): Place callout at top-right exterior adjacent position
      left = Math.round(targetRect.right + pad);
      top = Math.round(Math.max(56, targetRect.top + 8));
    } else if (this.currentTourStep === 4) {
      // Step 5 of 6 (Right Sidebar): Place callout at top-left exterior adjacent position (symmetrical to Step 4)
      left = Math.round(targetRect.left - cW - pad);
      top = Math.round(Math.max(56, targetRect.top + 8));
    } else if (this.currentTourStep === 5) {
      // Step 6 of 6 (Bottom Bar): Center horizontally above bottom bar
      left = Math.round((winW - cW) / 2);
      top = Math.round(targetRect.top - cH - 16);
    } else {
      // General fallback
      left = Math.round((winW - cW) / 2);
      top = Math.round((winH - cH) / 2);
    }

    // Keep completely inside screen boundaries
    left = Math.max(pad, Math.min(winW - cW - pad, left));
    top = Math.max(pad + 40, Math.min(winH - cH - pad, top));

    callout.style.left = `${left}px`;
    callout.style.top = `${top}px`;
  }

  nextTourStep() {
    this.goToTourStep(this.currentTourStep + 1);
  }

  prevTourStep() {
    this.goToTourStep(this.currentTourStep - 1);
  }

  exitTour(markCompleted = true) {
    this.isTourActive = false;
    const overlay = document.getElementById('tour-overlay-container');
    if (overlay) overlay.style.display = 'none';

    const exitBtn = document.getElementById('tour-btn-exit-top');
    if (exitBtn) {
      exitBtn.style.top = '14px';
      exitBtn.style.right = '18px';
    }

    if (markCompleted) {
      try {
        localStorage.setItem(this.storageKey, 'true');
      } catch (e) {
        console.warn('Failed writing to localStorage:', e);
      }
    }
  }

  // --- FLOATING HELP DIALOG LOGIC ---
  openHelpDialog() {
    this.isHelpDialogOpen = true;
    const dialog = document.getElementById('floating-help-dialog');
    if (!dialog) return;

    this.renderHelpDialogContent(true);
    dialog.style.display = 'flex';
    dialog.classList.remove('repositioned-avoid');

    // Default position if not set: Refer to right sidebar so we don't obscure it
    if (this.dialogPos.x === null) {
      const winW = window.innerWidth;
      const dW = dialog.offsetWidth || 480;
      const rightPanel = document.getElementById('right-sidebar');
      const rightRect = rightPanel ? rightPanel.getBoundingClientRect() : null;
      const rightLeft = (rightRect && rightRect.width > 0) ? rightRect.left : (winW - 320);

      // Position dialog to the left exterior of right panel with a 14px gap
      const initialLeft = Math.max(16, Math.round(rightLeft - dW - 14));
      const initialTop = 56;
      dialog.style.left = `${initialLeft}px`;
      dialog.style.top = `${initialTop}px`;
      this.dialogPos = { x: initialLeft, y: initialTop };
    }

    // Bring to front
    dialog.style.zIndex = '10002';
  }

  closeHelpDialog() {
    this.isHelpDialogOpen = false;
    const dialog = document.getElementById('floating-help-dialog');
    if (dialog) dialog.style.display = 'none';
    this.dismissSpotlight();
  }

  toggleHelpDialog() {
    if (this.isHelpDialogOpen) {
      this.closeHelpDialog();
    } else {
      this.openHelpDialog();
    }
  }

  renderHelpDialogContent(resetSearch = true) {
    const data = this.getData();
    const title = document.getElementById('help-dialog-title');
    const rerunText = document.getElementById('help-btn-rerun-text');
    const searchInput = document.getElementById('help-search-input');
    const clearBtn = document.getElementById('help-search-clear-btn');
    const emptyState = document.getElementById('help-search-empty-state');
    const accordionList = document.getElementById('help-accordion-list');

    if (title) title.textContent = data.helpTitle;
    if (rerunText) rerunText.textContent = data.helpRerunTour;
    if (searchInput) {
      searchInput.placeholder = data.helpSearchPlaceholder;
      if (resetSearch) {
        searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
      }
    }
    if (emptyState) {
      emptyState.textContent = data.helpSearchEmpty;
      emptyState.style.display = 'none';
    }

    if (accordionList) {
      let html = '';
      data.helpSections.forEach((sec, idx) => {
        // Expand first section by default
        const isActive = idx === 0 ? 'active' : '';
        html += `
          <div class="help-accordion-item ${isActive}" data-sec-id="${sec.id}">
            <div class="help-accordion-header">
              <span class="help-acc-icon">${sec.icon}</span>
              <span class="help-acc-title">${sec.title}</span>
              <span class="help-acc-chevron">▼</span>
            </div>
            <div class="help-accordion-content">
              ${sec.content}
            </div>
          </div>
        `;
      });
      accordionList.innerHTML = html;
    }
  }

  filterHelpContent(query) {
    const data = this.getData();
    const q = (query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('help-search-clear-btn');
    const emptyState = document.getElementById('help-search-empty-state');
    const accordionList = document.getElementById('help-accordion-list');
    if (!accordionList) return;

    if (clearBtn) {
      clearBtn.style.display = q ? 'flex' : 'none';
    }

    if (!q) {
      if (emptyState) emptyState.style.display = 'none';
      this.renderHelpDialogContent(false);
      return;
    }

    let matchCount = 0;
    const items = accordionList.querySelectorAll('.help-accordion-item');

    items.forEach(item => {
      const secId = item.getAttribute('data-sec-id');
      const sec = data.helpSections.find(s => s.id === secId);
      if (!sec) return;

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = sec.content;
      const plainContent = tempDiv.textContent || '';
      const fullText = (sec.title + ' ' + plainContent).toLowerCase();

      if (fullText.includes(q)) {
        matchCount++;
        item.style.display = 'block';
        item.classList.add('active');
        this.highlightMatchingInItem(item, sec, q);
      } else {
        item.style.display = 'none';
      }
    });

    if (emptyState) {
      emptyState.style.display = matchCount === 0 ? 'block' : 'none';
      emptyState.textContent = data.helpSearchEmpty;
    }
  }

  highlightMatchingInItem(item, sec, query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');

    const titleEl = item.querySelector('.help-acc-title');
    if (titleEl) {
      titleEl.innerHTML = sec.title.replace(regex, '<mark class="help-match-highlight">$1</mark>');
    }

    const contentEl = item.querySelector('.help-accordion-content');
    if (contentEl) {
      contentEl.innerHTML = sec.content;
      this.highlightTextNodes(contentEl, regex);
    }
  }

  highlightTextNodes(node, regex) {
    if (node.nodeType === 3) {
      const val = node.nodeValue;
      if (regex.test(val)) {
        const span = document.createElement('span');
        span.innerHTML = val.replace(regex, '<mark class="help-match-highlight">$1</mark>');
        node.parentNode.replaceChild(span, node);
      }
    } else if (node.nodeType === 1 && node.nodeName !== 'MARK' && !node.classList.contains('help-match-highlight')) {
      Array.from(node.childNodes).forEach(child => this.highlightTextNodes(child, regex));
    }
  }

  // --- INTERACTIVE FEATURE LOCATING & SPOTLIGHTING ---
  locateFeature(targetKey) {
    // Step 1: Auto-activate target state / tab if needed
    this.autoActivateTarget(targetKey);

    // Give DOM a tick to layout
    setTimeout(() => {
      const targetEl = this.resolveTargetElement(targetKey);
      if (!targetEl) {
        console.warn('Feature target element not found:', targetKey);
        return;
      }

      this.activeSpotlightTarget = targetEl;
      this.showFeatureSpotlight(targetEl);
      this.checkAndAvoidCollision(targetEl);
    }, 80);
  }

  autoActivateTarget(targetKey) {
    const app = this.app;
    if (!app) return;

    switch (targetKey) {
      case 'measure-tool':
        app.openFloatingTools('tab-measure-content');
        break;
      case 'section-tool':
        app.openFloatingTools('tab-section-content');
        break;
      case 'solar-tool':
        app.openFloatingTools('tab-light-content');
        break;
      case 'tools-panel':
        app.openFloatingTools('tab-section-content');
        break;
      case 'tab-structures':
        app.switchLeftTab('tab-struct-content');
        break;
      case 'tab-levels':
        app.switchLeftTab('tab-levels-content');
        break;
      case 'tab-elements':
        app.switchLeftTab('tab-elem-content');
        break;
      case 'inspector-profile':
      case 'inspector-tuning':
        // If no element selected, automatically select a representative component from demo model!
        if (!app.selectedMesh) {
          const targetModel = app.activeModel || app.currentModel || app.model;
          let pickable = null;
          if (targetModel && typeof targetModel.traverse === 'function') {
            targetModel.traverse(child => {
              if (!pickable && child.isMesh && (!app.isPickableElement || app.isPickableElement(child)) && child.visible) {
                pickable = child;
              }
            });
          }
          if (pickable && typeof app.selectElement === 'function') {
            app.selectElement(pickable);
          }
        }
        break;
      default:
        break;
    }
  }

  resolveTargetElement(targetKey) {
    switch (targetKey) {
      case 'viewport':
        return document.getElementById('viewport-container');
      case 'view-iso':
        return document.getElementById('btn-view-iso');
      case 'view-plan':
        return document.getElementById('btn-view-plan');
      case 'view-elevations':
        return document.getElementById('btn-view-north') || document.querySelector('.view-presets-group');
      case 'view-proj':
        return document.getElementById('btn-view-proj');
      case 'view-history':
        return document.getElementById('view-history-group');
      case 'open-model':
        return document.getElementById('btn-open-file');
      case 'demo-model':
        return document.getElementById('btn-load-demo');
      case 'lang-toggle':
        return document.getElementById('btn-lang-toggle');
      case 'theme-toggle':
        return document.getElementById('btn-theme-toggle');
      case 'compare-btn':
        return document.getElementById('btn-tool-compare');
      case 'tools-panel':
        return document.getElementById('floating-tools-panel') || document.getElementById('btn-tool-tools');
      case 'measure-tool':
        return document.getElementById('tab-measure-content') || document.getElementById('floating-tools-panel');
      case 'section-tool':
        return document.getElementById('tab-section-content') || document.getElementById('floating-tools-panel');
      case 'solar-tool':
        return document.getElementById('tab-light-content') || document.getElementById('floating-tools-panel');
      case 'left-sidebar':
      case 'tab-structures':
      case 'tab-levels':
      case 'tab-elements':
      case 'tree-search':
        return document.getElementById('left-sidebar');
      case 'right-sidebar':
      case 'inspector-profile':
      case 'inspector-tuning':
        return document.getElementById('right-sidebar');
      case 'bottom-legend':
      case 'bottom-stats':
        return document.getElementById('bottom-bar');
      default:
        return document.getElementById(targetKey) || document.querySelector(targetKey);
    }
  }

  showFeatureSpotlight(targetEl) {
    const overlay = document.getElementById('help-spotlight-overlay');
    if (!overlay) return;

    overlay.style.display = 'block';
    this.updateFeatureSpotlightBox(targetEl);

    // Keep help dialog visibly elevated above spotlight overlay
    const dialog = document.getElementById('floating-help-dialog');
    if (dialog) dialog.style.zIndex = '10002';
  }

  updateFeatureSpotlightBox(targetEl) {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const pad = 6;
    let cutoutX = Math.round(rect.left - pad);
    let cutoutY = Math.round(rect.top - pad);
    let cutoutW = Math.round(rect.width + pad * 2);
    let cutoutH = Math.round(rect.height + pad * 2);

    if (rect.left <= 4) {
      cutoutX = 0;
    }
    if (rect.right >= winW - 4) {
      cutoutW = Math.round(winW - cutoutX);
    }
    if (rect.top <= 4) {
      cutoutY = 0;
    }
    if (rect.bottom >= winH - 4) {
      cutoutH = Math.round(winH - cutoutY);
    }

    // Clamp strictly within viewport
    cutoutX = Math.max(0, cutoutX);
    cutoutY = Math.max(0, cutoutY);
    cutoutW = Math.min(winW - cutoutX, cutoutW);
    cutoutH = Math.min(winH - cutoutY, cutoutH);

    const cutout = document.getElementById('help-mask-cutout');
    const halo = document.getElementById('help-spotlight-halo');

    if (cutout) {
      cutout.setAttribute('x', cutoutX);
      cutout.setAttribute('y', cutoutY);
      cutout.setAttribute('width', cutoutW);
      cutout.setAttribute('height', cutoutH);
    }

    if (halo) {
      halo.style.display = 'block';
      halo.style.left = `${cutoutX}px`;
      halo.style.top = `${cutoutY}px`;
      halo.style.width = `${cutoutW}px`;
      halo.style.height = `${cutoutH}px`;
    }
  }

  // --- SMART COLLISION AVOIDANCE ALGORITHM ---
  checkAndAvoidCollision(targetEl) {
    const dialog = document.getElementById('floating-help-dialog');
    if (!dialog || dialog.style.display === 'none') return;

    const targetRect = targetEl.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();

    const pad = 24;
    // Check if dialog intersects with target element
    const overlaps = (
      dialogRect.left < targetRect.right + pad &&
      dialogRect.right > targetRect.left - pad &&
      dialogRect.top < targetRect.bottom + pad &&
      dialogRect.bottom > targetRect.top - pad
    );

    if (overlaps) {
      // Target is obscured by help dialog. Smoothly slide dialog away!
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const dW = dialog.offsetWidth;
      const dH = dialog.offsetHeight;

      let newLeft = dialogRect.left;
      let newTop = dialogRect.top;

      // Strategy: Check which side of target has the most comfortable clearance
      const spaceRight = winW - targetRect.right;
      const spaceLeft = targetRect.left;

      if (spaceLeft >= dW + 40) {
        // Move to the left of target
        newLeft = Math.max(pad, targetRect.left - dW - pad);
      } else if (spaceRight >= dW + 40) {
        // Move to the right of target
        newLeft = Math.min(winW - dW - pad, targetRect.right + pad);
      } else {
        // Horizontal space tight, move vertically
        if (targetRect.top >= dH + 60) {
          newTop = Math.max(pad + 40, targetRect.top - dH - pad);
        } else {
          newTop = Math.min(winH - dH - pad, targetRect.bottom + pad);
        }
      }

      // Constrain within screen
      newLeft = Math.max(pad, Math.min(winW - dW - pad, newLeft));
      newTop = Math.max(pad + 40, Math.min(winH - dH - pad, newTop));

      dialog.style.transition = 'left 0.35s cubic-bezier(0.16, 1, 0.3, 1), top 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
      dialog.classList.add('repositioned-avoid');

      setTimeout(() => {
        dialog.style.transition = 'none';
      }, 360);
    }
  }

  dismissSpotlight() {
    this.activeSpotlightTarget = null;
    const overlay = document.getElementById('help-spotlight-overlay');
    if (overlay) overlay.style.display = 'none';

    const halo = document.getElementById('help-spotlight-halo');
    if (halo) halo.style.display = 'none';

    const dialog = document.getElementById('floating-help-dialog');
    if (dialog) dialog.classList.remove('repositioned-avoid');
  }

  // --- LANGUAGE CHANGE HOOK ---
  onLanguageChanged() {
    if (this.isHelpDialogOpen) {
      this.renderHelpDialogContent();
    }
    if (this.isTourActive) {
      const welcome = document.getElementById('tour-welcome-modal');
      if (welcome && welcome.style.display !== 'none') {
        this.renderWelcomeModal();
      } else {
        this.goToTourStep(this.currentTourStep);
      }
    }
  }
}

window.BIMHelpSystem = BIMHelpSystem;
