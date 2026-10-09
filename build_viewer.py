# -*- coding: utf-8 -*-
r"""
Build script to compile everything into a single-file, 100% offline HTML viewer.
Author: WWBIM
Supports editions:
  --variant=A: BIM Scope (Owner: WWBIM, Logo: WW logo, Folder: BIM Scope)
  --variant=B: SWBIM Scope (Owner: Samwoh Corporation, Wang Wei, Logo: Samwoh logo, Folder: SWBIM Scope)
  --variant=all: Builds both variants
"""
import os
import sys
import shutil
import json
import argparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(BASE_DIR, "libs")
SRC_DIR = os.path.join(BASE_DIR, "src")
CONFIG_PATH = os.path.join(BASE_DIR, "variant_config.json")

DEFAULT_CONFIG = {
    "variants": {
        "A": {
            "key": "A",
            "appName": "BIM Scope",
            "htmlTitle": "BIM Scope - 3D BIM Viewer",
            "owner": "WWBIM",
            "authorComment": "Author: WWBIM | BIM Scope 3D Viewer",
            "topLogo": "logo_ww_b64.txt",
            "outputHtml": "BIMScope.html",
            "projectDir": r"H:\我的云端硬盘\Software Develop\BIM Scope\Project",
            "deliverablesDir": r"H:\我的云端硬盘\Software Develop\BIM Scope\Deliverables"
        },
        "B": {
            "key": "B",
            "appName": "SWBIM Scope",
            "htmlTitle": "SWBIM Scope - 3D BIM Viewer",
            "owner": "Samwoh Corporation, Wang Wei",
            "authorComment": "Author: Samwoh Corporation, Wang Wei | SWBIM Scope 3D Viewer",
            "topLogo": "icon_red_b64.txt",
            "outputHtml": "SWBIMScope.html",
            "projectDir": r"H:\我的云端硬盘\Software Develop\SWBIM Scope\Project",
            "deliverablesDir": r"H:\我的云端硬盘\Software Develop\SWBIM Scope\Deliverables"
        }
    }
}

def load_config(base_dir=BASE_DIR):
    cfg_file = os.path.join(base_dir, "variant_config.json")
    if os.path.exists(cfg_file):
        try:
            with open(cfg_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Notice: Failed reading {cfg_file}: {e}, using defaults.")
    return DEFAULT_CONFIG

def load_sources(base_dir=BASE_DIR):
    lib_dir = os.path.join(base_dir, "libs")
    src_dir = os.path.join(base_dir, "src")

    with open(os.path.join(lib_dir, "three.min.js"), "r", encoding="utf-8") as f:
        three_js = f.read()
    with open(os.path.join(lib_dir, "OrbitControls.js"), "r", encoding="utf-8") as f:
        orbit_controls_js = f.read()
    with open(os.path.join(lib_dir, "GLTFLoader.js"), "r", encoding="utf-8") as f:
        gltf_loader_js = f.read()
    with open(os.path.join(lib_dir, "fflate.min.js"), "r", encoding="utf-8") as f:
        fflate_js = f.read()
    with open(os.path.join(lib_dir, "TGALoader.js"), "r", encoding="utf-8") as f:
        tga_loader_js = f.read()
    with open(os.path.join(lib_dir, "FBXLoader.js"), "r", encoding="utf-8") as f:
        fbx_loader_js = f.read()
    with open(os.path.join(lib_dir, "ColladaLoader.js"), "r", encoding="utf-8") as f:
        collada_loader_js = f.read()

    with open(os.path.join(src_dir, "styles.css"), "r", encoding="utf-8") as f:
        styles_css = f.read()
    with open(os.path.join(src_dir, "i18n.js"), "r", encoding="utf-8") as f:
        i18n_js = f.read()
    with open(os.path.join(src_dir, "solar.js"), "r", encoding="utf-8") as f:
        solar_js = f.read()
    with open(os.path.join(src_dir, "clipping.js"), "r", encoding="utf-8") as f:
        clipping_js = f.read()
    with open(os.path.join(src_dir, "ifc_parser.js"), "r", encoding="utf-8") as f:
        ifc_parser_js = f.read()
    with open(os.path.join(src_dir, "compare_engine.js"), "r", encoding="utf-8") as f:
        compare_engine_js = f.read()
    with open(os.path.join(src_dir, "demo_model.js"), "r", encoding="utf-8") as f:
        demo_model_js = f.read()
    with open(os.path.join(src_dir, "app.js"), "r", encoding="utf-8") as f:
        app_js = f.read()

    with open(os.path.join(src_dir, "icon_red_b64.txt"), "r", encoding="utf-8") as f:
        icon_red_b64 = f.read().strip()
    with open(os.path.join(src_dir, "logo_ww_b64.txt"), "r", encoding="utf-8") as f:
        logo_ww_b64 = f.read().strip()

    return {
        "three_js": three_js,
        "orbit_controls_js": orbit_controls_js,
        "gltf_loader_js": gltf_loader_js,
        "fflate_js": fflate_js,
        "tga_loader_js": tga_loader_js,
        "fbx_loader_js": fbx_loader_js,
        "collada_loader_js": collada_loader_js,
        "styles_css": styles_css,
        "i18n_js": i18n_js,
        "solar_js": solar_js,
        "clipping_js": clipping_js,
        "ifc_parser_js": ifc_parser_js,
        "compare_engine_js": compare_engine_js,
        "demo_model_js": demo_model_js,
        "app_js": app_js,
        "icon_red_b64": icon_red_b64,
        "logo_ww_b64": logo_ww_b64,
    }

def generate_html(variant_cfg, sources):
    owner = variant_cfg["owner"]
    author_comment = variant_cfg["authorComment"]
    html_title = variant_cfg["htmlTitle"]
    app_name = variant_cfg["appName"]

    # Select navbar top logo based on configuration
    top_logo_file = variant_cfg.get("topLogo", "logo_ww_b64.txt")
    if "icon_red" in top_logo_file:
        top_logo_b64 = sources["icon_red_b64"]
    else:
        top_logo_b64 = sources["logo_ww_b64"]

    # Watermark logo in viewport is always user logo
    logo_ww_b64 = sources["logo_ww_b64"]

    # Brand Design Tokens (Dark & Light)
    brand_accent = variant_cfg.get("brandAccent", "#38bdf8")
    brand_accent_hover = variant_cfg.get("brandAccentHover", "#0ea5e9")
    brand_accent_glow = variant_cfg.get("brandAccentGlow", "rgba(56, 189, 248, 0.25)")
    brand_primary = variant_cfg.get("brandPrimary", "#0284c7")
    brand_primary_hover = variant_cfg.get("brandPrimaryHover", "#0369a1")

    brand_accent_light = variant_cfg.get("brandAccentLight", "#0284c7")
    brand_accent_light_hover = variant_cfg.get("brandAccentLightHover", "#0369a1")
    brand_accent_light_glow = variant_cfg.get("brandAccentLightGlow", "rgba(2, 132, 199, 0.18)")
    brand_primary_light = variant_cfg.get("brandPrimaryLight", "#0284c7")
    brand_primary_light_hover = variant_cfg.get("brandPrimaryLightHover", "#0369a1")
    brand_tab_active_border_dark = variant_cfg.get("brandTabActiveBorderDark", "rgba(56, 189, 248, 0.45)")
    brand_tab_active_border_light = variant_cfg.get("brandTabActiveBorderLight", "rgba(2, 132, 199, 0.65)")

    styles_css = sources["styles_css"]
    three_js = sources["three_js"]
    orbit_controls_js = sources["orbit_controls_js"]
    gltf_loader_js = sources["gltf_loader_js"]
    fflate_js = sources["fflate_js"]
    tga_loader_js = sources["tga_loader_js"]
    fbx_loader_js = sources["fbx_loader_js"]
    collada_loader_js = sources["collada_loader_js"]
    i18n_js = sources["i18n_js"]
    solar_js = sources["solar_js"]
    clipping_js = sources["clipping_js"]
    ifc_parser_js = sources["ifc_parser_js"]
    compare_engine_js = sources["compare_engine_js"]
    demo_model_js = sources["demo_model_js"]
    app_js = sources["app_js"]

    return f"""<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' blob: data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none';">
  <meta name="author" content="{owner}">
  <meta name="creator" content="{owner}">
  <!-- {author_comment} -->
  <title>{html_title}</title>
  <style>
{styles_css}
  </style>
  <style id="variant-brand-tokens">
    :root,
    [data-theme="dark"] {{
      --accent: {brand_accent};
      --accent-hover: {brand_accent_hover};
      --accent-glow: {brand_accent_glow};
      --brand-primary: {brand_primary};
      --brand-primary-hover: {brand_primary_hover};
      --tab-active-top: {brand_accent};
      --tab-active-border: {brand_tab_active_border_dark};
    }}
    [data-theme="light"] {{
      --accent: {brand_accent_light};
      --accent-hover: {brand_accent_light_hover};
      --accent-glow: {brand_accent_light_glow};
      --brand-primary: {brand_primary_light};
      --brand-primary-hover: {brand_primary_light_hover};
      --tab-active-top: {brand_accent_light};
      --tab-active-border: {brand_tab_active_border_light};
    }}
  </style>
</head>
<body>
  <div id="app-container">
    <!-- TOP NAVIGATION BAR -->
    <header id="top-navbar">
      <div class="nav-left">
        <div class="brand-box">
          <img class="brand-logo-red" src="{top_logo_b64}" alt="Logo" width="22" height="22">
          <svg class="brand-lens-icon" viewBox="0 0 24 24" width="22" height="22">
            <circle cx="12" cy="12" r="9.6" stroke="currentColor" stroke-width="1.6" fill="none"/>
            <circle cx="12" cy="12" r="7.2" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.8" fill="none"/>
            <circle cx="12" cy="12" r="4.8" stroke="currentColor" stroke-width="1.4" fill="rgba(0, 229, 255, 0.08)"/>
            <path d="M 6.6 8.4 A 6.2 6.2 0 0 1 12 5.8" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none"/>
            <path d="M 8.2 9.6 A 4.8 4.8 0 0 1 11.6 7.4" stroke="currentColor" stroke-width="1.0" stroke-linecap="round" stroke-opacity="0.6" fill="none"/>
            <line x1="12" y1="1.8" x2="12" y2="4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="12" y1="19.8" x2="12" y2="22.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="1.8" y1="12" x2="4.2" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="19.8" y1="12" x2="22.2" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="12" cy="12" r="1.1" fill="currentColor"/>
          </svg>
          <span class="brand-name">{app_name}</span>
        </div>
        <div class="project-title-box">
          <div class="project-title">
            <span id="project-title-text" data-i18n="appTitle">Demo Model</span>
          </div>
          <div class="project-subtitle" id="project-subtitle-text" data-i18n="appSubtitle">
            Contemporary 2-storey timber residence | Gabled roof, cantilevered balcony terrace, glass curtain wall, sloped site
          </div>
        </div>
      </div>
      
      <!-- CENTER: View Presets & Standalone Persp/Ortho Button (Dynamically centered over 3D Viewport) -->
      <div class="nav-center-views" id="nav-center-views">
        <div class="btn-group view-presets-group">
          <button class="tool-btn" id="btn-view-iso" data-i18n="viewIso" title="Isometric View">Iso</button>
          <button class="tool-btn" id="btn-view-plan" data-i18n="viewPlan" title="Top Plan View">Plan</button>
          <button class="tool-btn" id="btn-view-north" data-i18n="viewNorth" title="North Elevation">N</button>
          <button class="tool-btn" id="btn-view-south" data-i18n="viewSouth" title="South Elevation">S</button>
          <button class="tool-btn" id="btn-view-east" data-i18n="viewEast" title="East Elevation">E</button>
          <button class="tool-btn" id="btn-view-west" data-i18n="viewWest" title="West Elevation">W</button>
        </div>
        
        <div class="btn-group">
          <button class="tool-btn" id="btn-view-proj" title="Perspective View (Click to switch to Orthogonal)">
            <svg class="proj-icon" id="btn-view-proj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 20.5 6 12 9 3.5 6" />
              <polyline points="3.5 6 3.5 14.5 12 22.5 20.5 14.5 20.5 6" />
              <line x1="12" y1="9" x2="12" y2="22.5" />
            </svg>
            <span class="proj-text" id="btn-view-proj-text" data-i18n="camProjPersp">Persp</span>
          </button>
        </div>

        <div class="btn-group" id="view-history-group">
          <button class="tool-btn" id="btn-view-undo" title="Previous View (Undo Navigation)" data-i18n-title="viewUndoTitle" disabled>
            <svg class="nav-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 14 4 9l5-5"/>
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
            </svg>
          </button>
          <button class="tool-btn" id="btn-view-redo" title="Next View (Redo Navigation)" data-i18n-title="viewRedoTitle" disabled>
            <svg class="nav-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 14 5-5-5-5"/>
              <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="nav-right">
        <!-- Tools Group -->
        <button class="tool-btn" id="btn-tool-measure" data-i18n="toolMeasure" title="Distance Measure Tool">
          <svg viewBox="0 0 24 24"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h3v8z"/></svg>
          Measure
        </button>
        
        <div class="divider"></div>
        
        <!-- Language & Theme Switcher & File Actions -->
        <button class="tool-btn" id="btn-lang-toggle" title="Switch English / 中文">🌐 中文</button>
        <button class="tool-btn" id="btn-theme-toggle" title="Switch Theme (Dark / Light)" data-i18n-title="themeToggleTitle">
          <svg id="theme-icon-sun" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;width:14px;height:14px;">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg id="theme-icon-moon" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
        <button class="tool-btn" id="btn-load-demo" data-i18n="loadDemo" title="Reload Demo Model">Demo</button>
        <button class="btn-primary" id="btn-tool-compare" title="Model Comparison Mode" data-i18n-title="toolCompareTitle">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round">
            <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <path d="M12 2v20"/>
          </svg>
          <span data-i18n="toolCompare">Compare</span>
        </button>
        <button class="btn-primary" id="btn-open-file" title="Open Model" data-i18n-title="openFile">
          <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
          <span data-i18n="openFile">Open Model</span>
        </button>
        <input type="file" id="file-input" accept=".ifc,.glb,.gltf,.fbx,.dae,.bin,.png,.jpg,.jpeg,.webp,.bmp,.tga" multiple style="display:none">
      </div>
    </header>

    <!-- STICKY TOP COMPARE BANNER -->
    <div id="compare-status-banner">
      <div class="banner-pulse-dot"></div>
      <span style="font-weight:700;color:var(--accent)" data-i18n="compareStatusBanner">Model Comparison Active</span>
      <div class="banner-files-text">
        <span class="banner-badge-new" id="banner-file-new">New.ifc</span>
        <span style="color:var(--text-muted);font-size:11px">&rarr;</span>
        <span class="banner-badge-old" id="banner-file-old">Old.ifc</span>
      </div>
      <button class="banner-exit-btn" id="btn-banner-exit-compare" title="Exit Model Comparison">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span data-i18n="compareExitBtn">Exit Compare</span>
      </button>
    </div>

    <!-- WORKSPACE -->
    <main id="workspace">
      <!-- LEFT SIDEBAR: Model Hierarchy, Sectioning & Lighting -->
      <aside class="sidebar" id="left-sidebar">
        <!-- Drag-to-Resize Handle on Right Edge -->
        <div class="sidebar-resizer" id="left-sidebar-resizer" title="Drag to resize panel"></div>

        <!-- Left Sidebar Header -->
        <div class="sidebar-header" id="left-sidebar-header">
          <button class="header-icon-btn" id="btn-tree-collapse" title="Collapse Model Hierarchy" data-i18n-title="collapseTree">
            <svg id="icon-tree-collapse-dock" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="6" y1="2" x2="6" y2="14" />
              <polyline points="9 6 7 8 9 10" />
            </svg>
          </button>
          <span class="sidebar-title" data-i18n="modelHierarchyHeader">MODEL HIERARCHY</span>
        </div>

        <div class="tabs-header-container sidebar-tabs-container" id="sidebar-tabs-container">
          <!-- Edge Gradient Shadows -->
          <div class="tabs-edge-shadow shadow-left" id="sidebar-tabs-shadow-left"></div>
          <button type="button" class="tabs-chevron-btn chevron-left" id="sidebar-tabs-chevron-left" title="Scroll left">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 2L4 8L11 14Z" />
            </svg>
          </button>

          <div class="sidebar-tabs-nav" id="sidebar-tabs-nav">
            <button class="tab-btn active" data-tab="tab-struct-content" data-i18n="tabStructures">Structures</button>
            <button class="tab-btn" data-tab="tab-levels-content" data-i18n="tabLevels">Levels</button>
            <button class="tab-btn" data-tab="tab-elem-content" data-i18n="tabElements">Elements</button>
            <button class="tab-btn" data-tab="tab-section-content" data-i18n="tabSection">Sectioning</button>
            <button class="tab-btn" data-tab="tab-light-content" data-i18n="tabLighting">Sun &amp; Light</button>
            <button class="tab-btn" data-tab="tab-camera-content" data-i18n="tabCamera">Camera</button>
          </div>

          <div class="tabs-edge-shadow shadow-right" id="sidebar-tabs-shadow-right"></div>
          <button type="button" class="tabs-chevron-btn chevron-right" id="sidebar-tabs-chevron-right" title="Scroll right">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 2L12 8L5 14Z" />
            </svg>
          </button>
        </div>

        <!-- Unified Content Panel below tabs -->
        <div class="sidebar-tab-content-panel" id="sidebar-tab-content-panel">

        <!-- TAB 1: Structures -->
        <div class="tab-content active" id="tab-struct-content">
          <div class="sidebar-search-row">
            <div class="search-input-box">
              <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" class="search-input" id="tree-search-input" placeholder="Filter elements..." data-i18n-placeholder="searchPlaceholder">
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="small-btn" id="btn-struct-expand-all" data-i18n="expandAll" style="flex:1">Expand All</button>
            <button class="small-btn" id="btn-struct-collapse-all" data-i18n="collapseAll" style="flex:1">Collapse All</button>
            <button class="small-btn" id="btn-show-all" data-i18n="showAll" style="flex:1">Show All</button>
            <button class="small-btn" id="btn-hide-all" data-i18n="hideAll" style="flex:1">Hide All</button>
            <button class="small-btn" id="btn-reset-opacity" data-i18n="resetOpacity">Reset Opacity</button>
          </div>
          <div style="font-size:10px;color:var(--text-muted);line-height:1.3" data-i18n="opacityLabel">
            Opacity makes a building see-through without hiding it.
          </div>
          <div class="tree-container" id="tree-structures"></div>
        </div>

        <!-- TAB 2: Levels -->
        <div class="tab-content" id="tab-levels-content">
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="small-btn" id="btn-levels-expand-all" data-i18n="expandAll" style="flex:1">Expand All</button>
            <button class="small-btn" id="btn-levels-collapse-all" data-i18n="collapseAll" style="flex:1">Collapse All</button>
            <button class="small-btn" id="btn-levels-show-all" data-i18n="showAll" style="flex:1">Show All</button>
            <button class="small-btn" id="btn-levels-hide-all" data-i18n="hideAll" style="flex:1">Hide All</button>
          </div>
          <div class="tree-container" id="tree-levels"></div>
        </div>

        <!-- TAB 3: Elements Categories -->
        <div class="tab-content" id="tab-elem-content">
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="small-btn" id="btn-elem-expand-all" data-i18n="expandAll" style="flex:1">Expand All</button>
            <button class="small-btn" id="btn-elem-collapse-all" data-i18n="collapseAll" style="flex:1">Collapse All</button>
            <button class="small-btn" id="btn-elem-show-all" data-i18n="showAll" style="flex:1">Show All</button>
            <button class="small-btn" id="btn-elem-hide-all" data-i18n="hideAll" style="flex:1">Hide All</button>
          </div>
          <div class="tree-container" id="tree-elements"></div>
        </div>

        <!-- TAB 4: Sectioning / Clipping -->
        <div class="tab-content" id="tab-section-content">
          <div class="control-section">
            <div class="control-title">
              <span data-i18n="secTitle">Model Section / Clipping</span>
              <label class="toggle-switch">
                <input type="checkbox" id="sec-active-chk">
                <span class="slider-switch"></span>
              </label>
            </div>
            
            <div class="control-row clipping-mode-row">
              <span class="control-label" data-i18n="secMode">Clipping Mode</span>
              <div class="segmented-control" id="sec-mode-segmented">
                <button type="button" class="segment-btn active" id="sec-mode-btn-plane" data-mode="plane" data-i18n="secPlane">Section Plane</button>
                <button type="button" class="segment-btn" id="sec-mode-btn-box" data-mode="box" data-i18n="secBox">Section Box</button>
              </div>
            </div>

            <div class="control-row">
              <span class="control-label" data-i18n="secShowHelpers">Show Section Plane / Box</span>
              <label class="toggle-switch">
                <input type="checkbox" id="sec-show-helpers-chk" checked>
                <span class="slider-switch"></span>
              </label>
            </div>

            <div class="control-row">
              <span class="control-label" data-i18n="secShowWireframe">Show Cut-away Wireframe</span>
              <label class="toggle-switch">
                <input type="checkbox" id="sec-wireframe-chk">
                <span class="slider-switch"></span>
              </label>
            </div>
          </div>

          <!-- Plane Controls -->
          <div class="control-section" id="sec-plane-controls">
            <div class="control-row">
              <span class="control-label" data-i18n="secAxis">Section Axis</span>
              <div class="segmented-control axis-segmented" id="sec-axis-segmented">
                <button type="button" class="segment-btn axis-btn-x" id="sec-axis-btn-x" data-axis="X" data-i18n="secAxisXBtn">X Easting</button>
                <button type="button" class="segment-btn axis-btn-y" id="sec-axis-btn-y" data-axis="Y" data-i18n="secAxisYBtn">Y Northing</button>
                <button type="button" class="segment-btn axis-btn-z active" id="sec-axis-btn-z" data-axis="Z" data-i18n="secAxisZBtn">Z Elevation</button>
              </div>
            </div>
            <div class="control-row">
              <span class="control-label" data-i18n="secOffset">Slice Position</span>
              <input type="range" min="0" max="1" step="0.005" value="0.5" class="range-slider" id="sec-offset-slider">
            </div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button class="small-btn" id="sec-invert-btn" data-i18n="secInvert" style="flex:1">Flip Direction</button>
              <button class="small-btn" id="sec-reset-btn" data-i18n="secReset" style="flex:1">Reset Section</button>
            </div>

            <div class="control-row" style="margin-top:8px;">
              <span class="control-label" data-i18n="secPlaneRotate">Plane Orientation</span>
              <span class="control-value" id="sec-plane-rot-val">0°</span>
            </div>
            <div style="display:flex;gap:4px;margin-top:4px;">
              <button class="small-btn" id="sec-plane-align-z" style="flex:1" data-i18n="secPlaneAlignZ">Align Z</button>
              <button class="small-btn" id="sec-plane-align-x" style="flex:1" data-i18n="secPlaneAlignX">Align X</button>
              <button class="small-btn" id="sec-plane-align-y" style="flex:1" data-i18n="secPlaneAlignY">Align Y</button>
              <button class="small-btn" id="sec-plane-rot-reset" style="flex:1" data-i18n="secRotReset">Reset 0°</button>
            </div>
            <div class="control-row" style="margin-top:8px;">
              <span class="control-label" data-i18n="secSnap5Deg">5° Rotation Snap</span>
              <label class="toggle-switch">
                <input type="checkbox" id="sec-plane-snap-chk">
                <span class="slider-switch"></span>
              </label>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:8px;line-height:1.4" data-i18n="secPlaneGizmoTip">
              💡 Tip: Drag arrow to move plane; drag colored rings to rotate tilt angles.
            </div>
          </div>

          <!-- Box Controls (Section Box) -->
          <div class="control-section" id="sec-box-controls" style="display:none">
            <div class="control-title" data-i18n="secBox">Section Box</div>
            
            <div class="control-row">
              <span class="control-label" data-i18n="secBoxRangeX">X Range (East - West / Easting)</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="range" min="0" max="1" step="0.01" value="0.0" class="range-slider" id="sec-box-minx" title="Min X">
              <input type="range" min="0" max="1" step="0.01" value="1.0" class="range-slider" id="sec-box-maxx" title="Max X">
            </div>

            <div class="control-row" style="margin-top:6px;">
              <span class="control-label" data-i18n="secBoxRangeY">Y Range (North - South / Northing)</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="range" min="0" max="1" step="0.01" value="0.0" class="range-slider" id="sec-box-miny" title="Min Y">
              <input type="range" min="0" max="1" step="0.01" value="1.0" class="range-slider" id="sec-box-maxy" title="Max Y">
            </div>

            <div class="control-row" style="margin-top:6px;">
              <span class="control-label" data-i18n="secBoxRangeZ">Z Range (Elevation / RL Height)</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="range" min="0" max="1" step="0.01" value="0.0" class="range-slider" id="sec-box-minz" title="Min Z">
              <input type="range" min="0" max="1" step="0.01" value="1.0" class="range-slider" id="sec-box-maxz" title="Max Z">
            </div>

            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="small-btn" id="sec-box-reset-btn" data-i18n="secBoxReset" style="flex:1">Reset Section Box</button>
              <button class="small-btn" id="sec-box-toggle-vis-btn" data-i18n="menuHideSectionBox" style="flex:1">Hide Section Box</button>
            </div>

            <!-- Section Box Rotation Controls -->
            <div class="control-row" style="margin-top:10px;">
              <span class="control-label" data-i18n="secBoxRotate">Rotate Section Box</span>
              <span class="control-value" id="sec-box-rot-val">0°</span>
            </div>
            <input type="range" min="0" max="360" step="1" value="0" class="range-slider" id="sec-box-rot-slider">
            <div style="display:flex;gap:4px;margin-top:6px;">
              <button class="small-btn" id="sec-box-rot-ccw" style="flex:1">-45°</button>
              <button class="small-btn" id="sec-box-rot-cw" style="flex:1">+45°</button>
              <button class="small-btn" id="sec-box-rot-90" style="flex:1">+90°</button>
              <button class="small-btn" id="sec-box-rot-reset" style="flex:1" data-i18n="secRotReset">Reset 0°</button>
            </div>
            <div class="control-row" style="margin-top:8px;">
              <span class="control-label" data-i18n="secSnap5Deg">5° Rotation Snap</span>
              <label class="toggle-switch">
                <input type="checkbox" id="sec-box-snap-chk">
                <span class="slider-switch"></span>
              </label>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:8px;line-height:1.4" data-i18n="secBoxGizmoTip">
              💡 Tip: Drag face arrows outward/inward to resize Section Box; drag midpoint gold rings to rotate.
            </div>
          </div>
        </div>

        <!-- TAB 5: Sun & Light -->
        <div class="tab-content" id="tab-light-content">
          <div class="control-section">
            <div class="control-title" data-i18n="lightTitle">Lighting &amp; Solar Simulation</div>
            <div class="control-row">
              <span class="control-label" data-i18n="lightMode">Light Mode</span>
              <select class="select-input" id="light-mode-sel">
                <option value="singapore" data-i18n="lightSolar">Singapore Real Solar (SST UTC+8)</option>
                <option value="custom" data-i18n="lightCustom">Custom Lighting</option>
              </select>
            </div>
          </div>

          <!-- Singapore Real Solar Controls -->
          <div class="control-section" id="solar-sg-controls">
            <div style="font-size:10.5px;color:var(--accent);line-height:1.4">
              Geographic: Singapore (Lat: 1.3521° N, Lon: 103.8198° E, SST UTC+8)
            </div>
            <div class="control-row">
              <span class="control-label" data-i18n="lightDate">Date</span>
              <input type="date" class="date-input" id="solar-date-input" value="2026-09-29">
            </div>
            <div class="control-row">
              <span class="control-label" data-i18n="lightTime">Time of Day</span>
              <span class="control-value" id="solar-time-val">13:08</span>
            </div>
            <input type="range" min="0" max="1440" step="5" value="788" class="range-slider" id="solar-time-slider">
            
            <!-- Quick Presets -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;">
              <button class="small-btn" id="btn-preset-dawn" data-i18n="lightDawn">Dawn (06:45)</button>
              <button class="small-btn" id="btn-preset-noon" data-i18n="lightNoon">Noon (13:08)</button>
              <button class="small-btn" id="btn-preset-afternoon" data-i18n="lightAfternoon">Afternoon (16:30)</button>
              <button class="small-btn" id="btn-preset-sunset" data-i18n="lightSunset">Sunset (19:15)</button>
            </div>
            <button class="small-btn" id="btn-preset-night" data-i18n="lightNight">Night (22:00)</button>
            
            <div style="background:var(--bg-panel);padding:8px;border-radius:4px;border:1px solid var(--border-color);margin-top:4px;font-size:11px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="color:var(--text-muted)" data-i18n="lightAzimuth">Azimuth:</span>
                <span id="solar-az-val" style="color:var(--text-primary)">142.1°</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="color:var(--text-muted)" data-i18n="lightElevation">Elevation:</span>
                <span id="solar-el-val" style="color:var(--text-primary)">62.4°</span>
              </div>
              <div id="solar-status-msg" style="color:var(--accent);font-size:10.5px">Daylight active</div>
            </div>

            <button class="small-btn" id="btn-solar-play" data-i18n="lightPlay" style="margin-top:4px">
              Play 24h Timelapse
            </button>
          </div>

          <!-- Custom Lighting Controls -->
          <div class="control-section" id="solar-custom-controls" style="display:none">
            <div class="control-row">
              <span class="control-label" data-i18n="lightAzimuth">Azimuth (0-360°)</span>
              <input type="range" min="0" max="360" value="145" class="range-slider" id="light-custom-az">
            </div>
            <div class="control-row">
              <span class="control-label" data-i18n="lightElevation">Elevation (0-90°)</span>
              <input type="range" min="0" max="90" value="55" class="range-slider" id="light-custom-el">
            </div>
            <div class="control-row">
              <span class="control-label" data-i18n="lightIntensity">Sun Intensity</span>
              <input type="range" min="0" max="3.0" step="0.1" value="1.5" class="range-slider" id="light-custom-int">
            </div>
            <div class="control-row">
              <span class="control-label" data-i18n="lightAmbient">Ambient Light</span>
              <input type="range" min="0" max="2.0" step="0.1" value="0.6" class="range-slider" id="light-custom-amb">
            </div>
          </div>
        </div>

        <!-- TAB 6: Camera & Far Distance Settings -->
        <div class="tab-content" id="tab-camera-content">
          <div class="control-section">
            <div class="control-title" data-i18n="cameraTitle">Camera &amp; Far Distance</div>
            <div class="control-row">
              <span class="control-label" data-i18n="viewDistance">Visible Distance</span>
              <span class="control-value" id="side-dist-display">5,000 m (5 km)</span>
            </div>
            <input type="range" min="200" max="10000" step="100" value="5000" class="range-slider" id="side-dist-slider">
            
            <!-- Quick Distance Presets -->
            <div class="preset-dist-grid">
              <button class="small-btn" id="btn-dist-1k">1 km</button>
              <button class="small-btn" id="btn-dist-2k">2 km</button>
              <button class="small-btn" id="btn-dist-3k">3 km</button>
              <button class="small-btn" id="btn-dist-5k">5 km</button>
              <button class="small-btn" id="btn-dist-8k">8 km</button>
              <button class="small-btn" id="btn-dist-max">10 km (Max)</button>
            </div>
          </div>

          <div class="control-section">
            <div class="control-title">
              <span data-i18n="fogTitle">Atmospheric Depth Fog</span>
              <label class="toggle-switch">
                <input type="checkbox" id="fog-toggle-chk" checked>
                <span class="slider-switch"></span>
              </label>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);line-height:1.4">
              Dynamically scales with visible distance so distant landscape fades naturally into horizon without obscuring models.
            </div>
          </div>

          <div class="control-section">
            <div class="control-row">
              <span class="control-label" data-i18n="camFov">Field of View (FOV)</span>
              <span class="control-value" id="cam-fov-val">45°</span>
            </div>
            <input type="range" min="25" max="85" step="1" value="45" class="range-slider" id="cam-fov-slider">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px;">
              <span>Telephoto (25°)</span>
              <span>Wide (85°)</span>
            </div>
          </div>

          <div class="control-section">
            <div class="control-title" data-i18n="camPosition">Camera State</div>
            <table class="cam-prop-table">
              <tr>
                <td data-i18n="camPosition">Camera Pos</td>
                <td id="cam-pos-readout">220, 180, 260</td>
              </tr>
              <tr>
                <td data-i18n="camTarget">Orbit Pivot</td>
                <td id="cam-pivot-readout">0, 1.9, 0</td>
              </tr>
              <tr>
                <td data-i18n="camDistToTarget">Pivot Dist</td>
                <td id="cam-dist-readout">384.2 m</td>
              </tr>
            </table>
            <button class="small-btn" id="btn-cam-reset" data-i18n="resetCamera" style="margin-top:8px;width:100%">
              Fit &amp; Center Model
            </button>
          </div>
        </div>
        </div>
      </aside>

      <!-- 3D VIEWPORT -->
      <section id="viewport-container">
        <canvas id="canvas3d"></canvas>
        
        <!-- Viewport Watermark Logo (Bottom-Left) -->
        <img class="viewport-watermark-logo" src="{logo_ww_b64}" alt="WW Logo" width="32" height="32" draggable="false">

        <!-- Compass Orientation Gizmo (True 3D WebGL) -->
        <div id="compass-container" title="3D Compass: Click N/S/E/W/TOP or Drag to Orbit">
          <canvas id="compass-canvas3d" width="110" height="110"></canvas>
        </div>

        <!-- Drag & Drop Overlay -->
        <div id="dropzone-overlay">
          <svg class="drop-icon" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
          <div style="font-size:16px;font-weight:700" data-i18n="dropText">Drop IFC, GLTF/GLB, FBX or DAE file to view</div>
        </div>

        <!-- 3D Viewport Custom Context Menu -->
        <div id="context-menu" class="custom-context-menu" style="display:none">
          <div class="context-menu-item" id="menu-show-all">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            <span data-i18n="menuShowAll">Show All</span>
          </div>
          <div class="context-menu-item" id="menu-zoom-global">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <span data-i18n="menuZoomGlobal">Fit to Model</span>
          </div>
          <div class="context-menu-item" id="menu-reset-view">
            <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            <span data-i18n="menuResetView">Reset Initial View</span>
          </div>
          <div class="context-menu-divider" id="menu-selected-divider" style="display:none"></div>
          <div class="context-menu-item" id="menu-hide" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
            <span data-i18n="menuHide">Hide</span>
          </div>
          <div class="context-menu-item" id="menu-isolate" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            <span data-i18n="menuIsolate">Isolate</span>
          </div>
          <div class="context-menu-item" id="menu-zoom-to" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <span data-i18n="menuZoomTo">Zoom to</span>
          </div>
          <div class="context-menu-item" id="menu-section-box" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h4v4H7zm6 0h4v4h-4zm-6 6h4v4H7zm6 0h4v4h-4z"/></svg>
            <span data-i18n="menuSectionBox">Section Box</span>
          </div>
          <div class="context-menu-item" id="menu-move-sec-here" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
            <span id="menu-move-sec-here-text" data-i18n="menuMoveSectionPlaneToHere">Move Section Plane to Here</span>
          </div>
          <div class="context-menu-item" id="menu-group-isolate" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            <span id="menu-group-isolate-text" data-i18n="menuIsolateGroup">Isolate Group</span>
          </div>
          <div class="context-menu-item" id="menu-group-hide" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
            <span id="menu-group-hide-text" data-i18n="menuHideGroup">Hide Group</span>
          </div>
          <div class="context-menu-item" id="menu-group-zoom" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <span id="menu-group-zoom-text" data-i18n="menuZoomGroup">Zoom to Group</span>
          </div>
          <div class="context-menu-item" id="menu-group-sec-box" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h4v4H7zm6 0h4v4h-4zm-6 6h4v4H7zm6 0h4v4h-4z"/></svg>
            <span id="menu-group-sec-box-text" data-i18n="menuFitSectionBoxToGroup">Fit Section Box to Group</span>
          </div>
          <div class="context-menu-divider" id="menu-sectioning-divider" style="display:none"></div>
          <div class="context-menu-item" id="menu-toggle-section-box" style="display:none">
            <svg id="menu-toggle-section-box-icon" viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
            <span id="menu-toggle-section-box-text" data-i18n="menuHideSectionBox">Hide Section Box</span>
          </div>
          <div class="context-menu-item" id="menu-reset-sec-rot" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            <span data-i18n="menuResetSecRot">Reset Sectioning Rotation</span>
          </div>
        </div>

        <!-- Animation Player Bar (for DAE, FBX & GLTF models with animations) -->
        <div id="animation-player-bar" class="anim-player-bar" style="display:none">
          <button id="anim-btn-play" class="anim-btn" title="Play / Pause" data-i18n-title="animPlayPause">
            <svg id="anim-icon-play" class="anim-svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg id="anim-icon-pause" class="anim-svg" viewBox="0 0 24 24" style="display:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <div class="anim-time-container">
            <span id="anim-time-current">00:00.0</span>
            <input type="range" id="anim-scrub-slider" min="0" max="100" step="0.05" value="0">
            <span id="anim-time-total">00:00.0</span>
          </div>
          <div class="anim-controls-group">
            <button id="anim-btn-speed" class="anim-btn anim-badge-btn" title="Playback Speed" data-i18n-title="animSpeed">1.0x</button>
            <button id="anim-btn-loop" class="anim-btn active" title="Toggle Loop" data-i18n-title="animLoop">
              <svg class="anim-svg" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
            </button>
            <select id="anim-clip-select" class="anim-select" style="display:none" title="Select Clip"></select>
          </div>
        </div>

        <!-- Toast Notifications -->
        <div id="toast-container"></div>
      </section>

      <!-- RIGHT SIDEBAR: INSPECTOR -->
      <aside class="sidebar" id="right-sidebar">
        <!-- Drag-to-Resize Handle on Left Edge -->
        <div class="sidebar-resizer" id="right-sidebar-resizer" title="Drag to resize panel"></div>

        <div class="inspector-header">
          <span class="inspector-title" data-i18n="inspectorHeader">INSPECTOR</span>
          <button class="header-icon-btn" id="btn-inspector-collapse" title="Collapse Inspector" data-i18n-title="collapseInspector">
            <svg id="icon-collapse-dock" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="10" y1="2" x2="10" y2="14" />
              <polyline points="6 6 8 8 6 10" />
            </svg>
          </button>
        </div>

        <!-- Unified Preferences Card (Theme, Selection Highlight & Edge Lines) -->
        <div class="inspector-pref-card">
          <!-- UI Theme Appearance -->
          <div class="pref-subgroup">
            <div class="pref-inline-row" style="margin-bottom:6px">
              <span class="pref-inline-label" data-i18n="uiAppearance">Theme Appearance</span>
              <div class="segmented-control" id="pref-theme-segmented" style="max-width:130px;margin-left:auto;">
                <button type="button" class="segment-btn active" id="pref-theme-dark-btn" data-theme-val="dark" data-i18n="themeDark">Dark</button>
                <button type="button" class="segment-btn" id="pref-theme-light-btn" data-theme-val="light" data-i18n="themeLight">Light</button>
              </div>
            </div>
          </div>

          <!-- Subtle Divider -->
          <div class="pref-divider"></div>

          <!-- Selection Highlight Settings (Color & Opacity) -->
          <div class="pref-subgroup">
            <div class="control-title" style="margin-bottom:8px;font-size:11px" data-i18n="highlightSettings">Selection Highlight</div>
            <div class="pref-inline-row" style="margin-bottom:6px">
              <span class="pref-inline-label" data-i18n="highlightColor">Highlight Color</span>
              <div style="display:flex;align-items:center;gap:8px">
                <input type="color" id="highlight-color-picker" value="#00e5ff" class="color-picker-input">
                <span id="highlight-color-hex" style="font-family:var(--font-mono);font-size:11px;color:var(--text-bright)">#00e5ff</span>
              </div>
            </div>
            <div class="pref-inline-row">
              <span class="pref-inline-label" data-i18n="highlightOpacity">Opacity</span>
              <input type="range" min="10" max="100" step="5" value="65" class="range-slider pref-fixed-slider" id="highlight-opacity-slider">
              <span class="pref-inline-val" id="highlight-opacity-val">65%</span>
            </div>
          </div>

          <!-- Subtle Divider -->
          <div class="pref-divider"></div>

          <!-- Object Edge Lines (Outline) -->
          <div class="pref-subgroup">
            <div class="pref-inline-row" style="margin-bottom:6px">
              <span class="pref-inline-label" style="font-weight:600;color:var(--text-bright);width:auto" data-i18n="edgeLinesToggle">Edge Lines (Outline)</span>
              <label class="toggle-switch" style="margin-left:auto">
                <input type="checkbox" id="edge-lines-toggle-chk" checked>
                <span class="slider-switch"></span>
              </label>
            </div>
            <div class="pref-inline-row">
              <span class="pref-inline-label" data-i18n="edgeOpacity">Edge Intensity</span>
              <input type="range" min="10" max="100" step="5" value="65" class="range-slider pref-fixed-slider" id="edge-opacity-slider">
              <span class="pref-inline-val" id="edge-opacity-val">65%</span>
            </div>
          </div>
        </div>

        <div class="inspector-content" id="inspector-content">
          <div style="padding:20px 10px;text-align:center;color:var(--text-muted)">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px" data-i18n="noSelection">No Element Selected</div>
            <div style="font-size:11.5px;line-height:1.5" data-i18n="clickToInspect">
              Click any 3D element in the model to inspect its BIM properties, RL elevation, and geometry.
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- BOTTOM BAR: LEGEND & METRICS -->
    <footer id="bottom-bar">
      <!-- Dynamic Category Filter Chips -->
      <div class="legend-container">
        <span class="legend-title" data-i18n="legendTitle">ELEMENTS</span>
      </div>

      <div class="bottom-status-right">
        <!-- Edge Shadow casting leftwards from the left border of status HUD -->
        <div class="bottom-bar-edge-shadow" id="bottom-bar-edge-shadow"></div>
        <div class="status-metric">X: <span id="coord-x">697.2</span></div>
        <div class="status-metric">Y: <span id="coord-y">170.0</span></div>
        <div class="status-metric">RL: <span id="coord-rl">50.96</span></div>
        <div class="divider"></div>
        <div class="status-metric"><span data-i18n="statTriangles">Triangles</span>: <span id="stat-triangles-val">0</span></div>
        <div class="status-metric"><span data-i18n="statVertices">Vertices</span>: <span id="stat-vertices-val">0</span></div>
        <div class="status-metric"><span data-i18n="statFps">FPS</span>: <span id="stat-fps-val" style="color:var(--success)">60</span></div>
      </div>
    </footer>
  </div>

  <!-- SAFETY / PERFORMANCE WARNING MODAL -->
  <div class="modal-overlay" id="safety-modal">
    <div class="modal-card">
      <div class="modal-header">
        <svg style="width:20px;height:20px;fill:var(--warning)" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
        <h3 data-i18n="warnTitle">Performance &amp; Safety Notice</h3>
      </div>
      <div class="modal-body">
        <p id="safety-modal-msg"></p>
        <p style="font-size:11.5px;color:var(--text-muted)">
          Tips: Browser memory is limited to current tab heap. Loading models over 150 MB may lead to lag or tab crashes.
        </p>
      </div>
      <div class="modal-footer">
        <button class="small-btn" id="safety-btn-cancel" data-i18n="btnCancel">Cancel</button>
        <button class="small-btn" id="safety-btn-optimize" data-i18n="btnOptimize" style="display:none">Load with Optimization</button>
        <button class="btn-primary" id="safety-btn-force" data-i18n="btnForce">Proceed Anyway</button>
      </div>
    </div>
  </div>

  <!-- PROGRESS MODAL -->
  <div class="modal-overlay" id="progress-modal">
    <div class="modal-card">
      <div class="modal-header">
        <h3 data-i18n="loadingTitle">Loading Model</h3>
      </div>
      <div class="modal-body">
        <div id="progress-status-text">Reading file bytes...</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" id="progress-bar-fill"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- TEXTURE ASSEMBLY MODAL (FOR FBX SEPARATED TEXTURES) -->
  <div class="modal-overlay" id="texture-modal">
    <div class="modal-card" style="max-width: 580px; width: 90%;">
      <div class="modal-header">
        <svg style="width:20px;height:20px;fill:var(--accent)" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        <h3 data-i18n="textureModalTitle">FBX Material Textures Assembly</h3>
      </div>
      <div class="modal-body" style="max-height: 65vh; overflow-y: auto;">
        <div id="texture-modal-desc" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;" data-i18n="textureModalDesc">
          The FBX model references separated texture files. Please provide the texture images below:
        </div>
        <!-- Dropzone for textures -->
        <div id="texture-dropzone" class="texture-dropzone">
          <svg style="width:32px;height:32px;fill:var(--accent);margin-bottom:6px" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
          <div style="font-weight:600;font-size:12px;color:#fff;" data-i18n="textureDropPrompt">Drop texture images here (.png, .jpg, .tga, .webp, .bmp)</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;" data-i18n="textureDropSub">Supports multiple files and multiple batches.</div>
          <button class="small-btn" id="texture-browse-btn" style="margin-top:8px;" data-i18n="textureBrowse">Browse Files</button>
          <input type="file" id="texture-file-input" accept=".png,.jpg,.jpeg,.webp,.bmp,.tga" multiple style="display:none">
        </div>

        <!-- Textures checklist -->
        <div style="margin-top: 12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:600;font-size:11.5px;color:var(--text-primary)" data-i18n="textureListTitle">Referenced Textures</span>
            <span id="texture-match-stats" style="font-size:11px;font-family:var(--font-mono);color:var(--accent);">0 / 0 Ready</span>
          </div>
          <div id="texture-checklist" class="texture-checklist"></div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <button class="small-btn" id="texture-btn-skip" data-i18n="textureBtnSkip" title="Load with clean solid shaded materials">Skip Textures</button>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="small-btn" id="texture-btn-cancel" data-i18n="btnCancel">Cancel</button>
          <button class="btn-primary" id="texture-btn-confirm" data-i18n="textureBtnConfirm">Confirm &amp; Load</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODEL COMPARISON SETUP MODAL -->
  <div class="compare-modal-backdrop" id="compare-setup-modal">
    <div class="compare-modal-card">
      <div class="compare-modal-header">
        <div class="compare-modal-title-box">
          <div class="compare-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <path d="M12 2v20"/>
            </svg>
            <span data-i18n="compareModalTitle">Model Comparison Setup</span>
          </div>
          <div class="compare-modal-subtitle" data-i18n="compareModalSubtitle">
            Select two models of the same format (IFC) to analyze additions, deletions, and modifications.
          </div>
        </div>
        <button class="compare-modal-close-btn" id="btn-compare-modal-close" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="compare-modal-body">
        <div class="compare-zones-wrapper">
          <!-- Left Zone: New Revision (Light Green) -->
          <div class="compare-zone compare-zone-new" id="zone-compare-new" title="Click or drag file here">
            <div class="compare-zone-header">
              <span class="compare-role-tag tag-new" data-i18n="compareNewModelTitle">New Revision</span>
              <span class="compare-zone-status" id="zone-new-status"></span>
            </div>
            <div class="compare-zone-content">
              <svg class="compare-zone-icon" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <div class="compare-zone-filename" id="zone-new-filename" data-i18n="compareSelectFilePrompt">Click or drag IFC file here</div>
              <div class="compare-zone-size" id="zone-new-size"></div>
              <div class="compare-zone-hint" id="zone-new-hint"></div>
            </div>
            <input type="file" id="input-compare-new" accept=".ifc" style="display:none">
          </div>

          <!-- Middle: Swap Button -->
          <button class="compare-swap-btn" id="btn-compare-swap" title="Swap New and Old models" data-i18n-title="compareSwapBtnTitle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 3 4 4-4 4"/>
              <path d="M20 7H4"/>
              <path d="m8 21-4-4 4-4"/>
              <path d="M4 17h16"/>
            </svg>
          </button>

          <!-- Right Zone: Old Baseline (Light Red) -->
          <div class="compare-zone compare-zone-old" id="zone-compare-old" title="Click or drag file here">
            <div class="compare-zone-header">
              <span class="compare-role-tag tag-old" data-i18n="compareOldModelTitle">Old Baseline</span>
              <span class="compare-zone-status" id="zone-old-status"></span>
            </div>
            <div class="compare-zone-content">
              <svg class="compare-zone-icon" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <div class="compare-zone-filename" id="zone-old-filename" data-i18n="compareSelectFilePrompt">Click or drag IFC file here</div>
              <div class="compare-zone-size" id="zone-old-size"></div>
              <div class="compare-zone-hint" id="zone-old-hint"></div>
            </div>
            <input type="file" id="input-compare-old" accept=".ifc" style="display:none">
          </div>
        </div>
      </div>

      <div class="compare-modal-footer">
        <button class="btn-secondary" id="btn-compare-cancel" data-i18n="compareCancelBtn">Cancel</button>
        <button class="btn-compare-primary" id="btn-compare-start" data-i18n="compareStartBtn" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span data-i18n="compareStartBtn">Start Comparison</span>
        </button>
      </div>
    </div>
  </div>

  <!-- EMBEDDED JAVASCRIPT LIBS & APP CODE (100% OFFLINE) -->
  <script>
{three_js}
  </script>
  <script>
{orbit_controls_js}
  </script>
  <script>
{gltf_loader_js}
  </script>
  <script>
{fflate_js}
  </script>
  <script>
{tga_loader_js}
  </script>
  <script>
{fbx_loader_js}
  </script>
  <script>
{collada_loader_js}
  </script>
  <script>
{i18n_js}
  </script>
  <script>
{solar_js}
  </script>
  <script>
{clipping_js}
  </script>
  <script>
{ifc_parser_js}
  </script>
  <script>
{compare_engine_js}
  </script>
  <script>
{demo_model_js}
  </script>
  <script>
{app_js}
  </script>
  <script>
    // Initialize App when DOM is loaded or immediately if already ready
    function initApp() {{
      if (!window.app) window.app = new BIMViewerApp();
    }}
    if (document.readyState === 'loading') {{
      window.addEventListener('DOMContentLoaded', initApp);
    }} else {{
      initApp();
    }}
  </script>
</body>
</html>
"""

def build_variant(variant_key, cfg=None, custom_project_dir=None, custom_deliverables_dir=None, sources=None):
    if cfg is None:
        cfg = load_config()
    v_info = cfg.get("variants", {}).get(variant_key)
    if not v_info:
        raise ValueError(f"Unknown variant key '{variant_key}'. Available: {list(cfg.get('variants', {}).keys())}")

    if sources is None:
        sources = load_sources(BASE_DIR)

    print(f"\n==========================================")
    print(f"Building Edition {variant_key}: {v_info['appName']} (Owner: {v_info['owner']})")
    print(f"==========================================")

    html_content = generate_html(v_info, sources)

    proj_dir = custom_project_dir or v_info.get("projectDir") or BASE_DIR
    deliv_dir = custom_deliverables_dir or v_info.get("deliverablesDir") or os.path.abspath(os.path.join(proj_dir, "..", "Deliverables"))

    os.makedirs(proj_dir, exist_ok=True)
    os.makedirs(deliv_dir, exist_ok=True)

    output_html_name = v_info.get("outputHtml", "BIMScope.html")
    proj_out = os.path.join(proj_dir, output_html_name)
    proj_index = os.path.join(proj_dir, "index.html")

    with open(proj_out, "w", encoding="utf-8") as f:
        f.write(html_content)
    with open(proj_index, "w", encoding="utf-8") as f:
        f.write(html_content)

    size_mb = os.path.getsize(proj_out) / (1024 * 1024)
    print(f"[{variant_key}] Compiled: {proj_out} ({size_mb:.2f} MB)")
    print(f"[{variant_key}] Mirror entrypoint: {proj_index}")

    deliv_out = os.path.join(deliv_dir, output_html_name)
    deliv_index = os.path.join(deliv_dir, "index.html")

    shutil.copy2(proj_out, deliv_out)
    shutil.copy2(proj_index, deliv_index)
    print(f"[{variant_key}] Exported to Deliverables: {deliv_dir}")

    # Sync documentation files if available
    changelog_src = os.path.join(proj_dir, "CHANGELOG.md")
    if not os.path.exists(changelog_src):
        changelog_src = os.path.join(BASE_DIR, "CHANGELOG.md")

    features_src = os.path.join(proj_dir, "FEATURES.md")
    if not os.path.exists(features_src):
        features_src = os.path.join(BASE_DIR, "FEATURES.md")

    if os.path.exists(changelog_src):
        shutil.copy2(changelog_src, os.path.join(deliv_dir, "CHANGELOG.md"))
    if os.path.exists(features_src):
        shutil.copy2(features_src, os.path.join(deliv_dir, "FEATURES.md"))

    # Auto-calculate and update project development time in CHANGELOG.md
    try:
        import calc_time
        target_changelog = os.path.join(proj_dir, "CHANGELOG.md")
        if os.path.exists(target_changelog):
            calc_time.update_changelog(target_changelog)
            shutil.copy2(target_changelog, os.path.join(deliv_dir, "CHANGELOG.md"))
        else:
            calc_time.update_changelog()
    except Exception as e:
        print(f"Notice: dev time metrics update skipped: {e}")

    return {
        "variant": variant_key,
        "appName": v_info["appName"],
        "outputFile": proj_out,
        "deliverablesDir": deliv_dir,
        "sizeMb": size_mb
    }

def main():
    default_variant = "B" if "SWBIM Scope" in BASE_DIR else "A"

    parser = argparse.ArgumentParser(description="Compile standalone single-file BIM viewer.")
    parser.add_argument("--variant", choices=["A", "B", "all"], default=default_variant,
                        help=f"Variant edition to build (default: {default_variant})")
    parser.add_argument("--project-dir", default=None, help="Custom project output directory")
    parser.add_argument("--deliverables-dir", default=None, help="Custom deliverables output directory")
    args = parser.parse_args()

    cfg = load_config()
    sources = load_sources(BASE_DIR)

    if args.variant == "all":
        build_variant("A", cfg, args.project_dir, args.deliverables_dir, sources)
        build_variant("B", cfg, args.project_dir, args.deliverables_dir, sources)
    else:
        build_variant(args.variant, cfg, args.project_dir, args.deliverables_dir, sources)

if __name__ == "__main__":
    main()
