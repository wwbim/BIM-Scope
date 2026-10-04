# BIMScope 🏗️

> **A Pure Client-Side, 100% Offline Standalone Web BIM & 3D Architectural Viewer**  
> Powered by Three.js • Zero Backend Dependency • Single-File Portable Distribution

---

## 🌟 Key Features

- **📦 100% Offline & Zero Server Required**:
  - Compiles into a single portable `.html` file (`BIMScope.html`) with all libraries, shaders, and assets embedded.
  - Double-click to open in any modern browser without spinning up a local HTTP server.
  - Direct GitHub Pages deployment from root `index.html`.

- **📐 Broad 3D & BIM Format Support**:
  - **IFC** (`.ifc` schema 2x3, 4, 4.3): In-memory streaming parsing, Property Sets (Psets), geometry extraction, type definitions, and metadata viewer.
  - **GLTF / GLB**: Binary and JSON scenes with embedded textures.
  - **FBX**: Binary FBX meshes, multi-material geometries, and embedded/external textures.
  - **OBJ / MTL**: Wavefront OBJ geometries with material libraries.
  - **STL & PLY**: Fast point cloud and polygonal surface support.

- **🎮 Navigation & Camera Controls**:
  - **ACC Virtual Pivot Orbiting**: Smooth camera rotation anchored around clicked points or element centers.
  - **True 3D Viewport Compass**: Interactive 3D orientation cube/compass supporting 26 camera views (Isometric, Top/Plan, Elevations, Perspectives).
  - Presets: Plan view, North/South/East/West elevations, Zoom Extents (Fit).

- **✂️ Interactive Sectioning & Clipping Engine**:
  - Single clipping plane and 6-sided Section Box.
  - Interactive 3D translation arrows and rotation ring gizmos with 5° angle snapping.
  - Live cutaway caps with boundary edge rendering.

- **✏️ Architectural Edge Lines System**:
  - Real-time coplanar multi-triangle elimination for clean CAD-style architectural outlines.
  - Adjustable outline intensity and threshold angle.

- **☀️ Dynamic Solar Engine**:
  - Real-time daylight simulation with calculated solar azimuth and elevation angles.
  - Interactive 24-hour time slider and ambient intensity controls.

- **📏 Precision Measurement Tool**:
  - Vertex/surface snapping distance measurements.
  - Simultaneous readout of 3D Euclidean distance and Orthogonal $(\Delta X, \Delta Y, \Delta Z)$ offsets.

- **🔍 Element Inspector & Model Hierarchy**:
  - **Model Hierarchy**: Multi-tab navigation (Structures, Levels, Elements, Sectioning, Sun & Light, Camera).
  - **Inspector**: Detailed component properties, IFC attributes, Psets, materials, and quantities with one-click copy buttons and collapsible sections.
  - **Subtle Hover Highlight**: Light cyan highlight on hovered components in 3D and in the Model Tree.
  - **Responsive Adaptive Layout**: Auto-narrows sidebars to protect the 3D viewport ($\ge 40\%$) and auto-collapses on small screens with state restoration.

---

## 🚀 Quick Start

### 1. Direct Usage
Simply open `BIMScope.html` or `index.html` in Microsoft Edge, Google Chrome, Mozilla Firefox, or Apple Safari.

### 2. Building from Source
The project source code is organized in `src/` and dependencies in `libs/`.
To recompile the standalone single-file distribution:

```bash
python build_viewer.py
```

This updates:
- `BIMScope.html`: Standalone portable distribution file.
- `index.html`: GitHub Pages root entrypoint.
- Deliverables distribution mirrors.

---

## 📁 Project Structure

```
├── src/
│   ├── app.js               # Main viewer application logic & UI management
│   ├── clipping.js          # Section Box & Clipping Engine with 3D gizmos
│   ├── demo_model.js        # Built-in Modern Hillside Villa procedural BIM model
│   ├── ifc_parser.js        # High-performance client-side IFC parser
│   ├── solar.js             # Astronomical solar calculation engine
│   ├── i18n.js              # Multi-language localization (EN / 中文)
│   ├── styles.css           # Modern dark-themed responsive UI stylesheet
│   └── icon_red_b64.txt     # Embedded red icon assets
├── libs/
│   ├── three.min.js         # Three.js core 3D library
│   ├── OrbitControls.js     # Camera orbital interaction
│   ├── GLTFLoader.js        # GLTF/GLB loader
│   ├── FBXLoader.js         # FBX loader
│   ├── fflate.min.js        # Fast decompression for IFC / FBX
│   └── TGALoader.js         # TGA texture support
├── build_viewer.py          # Standalone single-file compiler
├── sync_mirror.py           # Deliverables mirror sync script
├── BIMScope.html            # Standalone single-file viewer
├── index.html               # GitHub Pages live entrypoint
├── .gitignore               # Git ignore rules
└── README.md                # Project documentation
```

---

## 📄 License

This project is licensed under the MIT License.
