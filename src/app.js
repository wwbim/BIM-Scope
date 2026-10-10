/**
 * BIM Scope 3D BIM Viewer
 * @author WWBIM
 * @copyright (c) WWBIM. All rights reserved.
 */

// Global security origin & CORS patch for file:/// execution
(function installFileProtocolGuards() {
  if (typeof THREE === 'undefined') return;

  // 1. Guard THREE.ImageLoader
  if (THREE.ImageLoader && THREE.ImageLoader.prototype.load) {
    const origImageLoad = THREE.ImageLoader.prototype.load;
    THREE.ImageLoader.prototype.load = function(url, onLoad, onProgress, onError) {
      if (typeof url === 'string') {
        // Prevent loading empty URL, current document URL, or any HTML document
        const isDocUrl = !url || url === '' || url === '#' || url === window.location.href || 
          url.endsWith('.html') || url.endsWith('.htm') || url.includes('.html?') || url.includes('.htm?');
        if (isDocUrl) {
          if (onError) onError(new Error("Prevented loading HTML document as image: " + url));
          return document.createElement('img');
        }
        // When on file:// protocol or blob/data URI, NEVER set crossOrigin!
        // Chrome considers crossOrigin on file:// or blob: URLs as an illegal cross-origin request
        if (window.location.protocol === 'file:' || url.startsWith('blob:') || url.startsWith('data:')) {
          this.crossOrigin = undefined;
        }
      }
      return origImageLoad.call(this, url, onLoad, onProgress, onError);
    };
  }

  // 2. Guard THREE.FileLoader
  if (THREE.FileLoader && THREE.FileLoader.prototype.load) {
    const origFileLoad = THREE.FileLoader.prototype.load;
    THREE.FileLoader.prototype.load = function(url, onLoad, onProgress, onError) {
      if (typeof url === 'string') {
        const isDocUrl = !url || url === '' || url === '#' || url === window.location.href || 
          url.endsWith('.html') || url.endsWith('.htm') || url.includes('.html?') || url.includes('.htm?');
        if (isDocUrl) {
          if (onError) onError(new Error("Prevented FileLoader from loading HTML document: " + url));
          return;
        }
      }
      return origFileLoad.call(this, url, onLoad, onProgress, onError);
    };
  }
})();

// True 3D Compass Controller (Three.js WebGL Orientation Gizmo)
class True3DCompass {
  constructor(app, containerId = 'compass-container', canvasId = 'compass-canvas3d') {
    this.app = app;
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.size = 110;
    
    // Dedicated WebGL scene, perspective camera & renderer
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.size, this.size);
    this.renderer.setClearColor(0x000000, 0);

    // Dynamic 3D lighting for metallic highlights and bevel reflections
    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(4, 8, 6);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fill.position.set(-4, -2, -3);
    this.scene.add(fill);

    this.clickableObjects = [];
    this.buildCompassGeometry();

    // Interaction state
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.hasDragged = false;

    this.initEvents();
  }

  buildCompassGeometry() {
    this.compassGroup = new THREE.Group();
    this.scene.add(this.compassGroup);

    // 1. 3D Gimbal Outer Ring (Metallic Torus lying in XZ horizontal plane)
    const ringGeom = new THREE.TorusGeometry(1.68, 0.05, 16, 64);
    ringGeom.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    this.compassGroup.add(ringMesh);

    // 2. Subtle translucent inner base disc
    const discGeom = new THREE.CylinderGeometry(1.62, 1.62, 0.02, 48);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x09101d,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.65
    });
    const discMesh = new THREE.Mesh(discGeom, discMat);
    discMesh.position.y = -0.03;
    this.compassGroup.add(discMesh);

    // 3. Cardinal Tick Marks (every 30 degrees around compass)
    for (let i = 0; i < 12; i++) {
      const rad = (i * Math.PI) / 6;
      const isMajor = (i % 3 === 0);
      const tickGeom = new THREE.BoxGeometry(0.04, 0.04, isMajor ? 0.22 : 0.12);
      const tickMat = new THREE.MeshStandardMaterial({
        color: isMajor ? 0x38bdf8 : 0x64748b,
        metalness: 0.6,
        roughness: 0.3
      });
      const tick = new THREE.Mesh(tickGeom, tickMat);
      tick.position.set(Math.sin(rad) * 1.55, 0.02, Math.cos(rad) * 1.55);
      tick.rotation.y = rad;
      this.compassGroup.add(tick);
    }

    // 4. 3D Faceted North Arrow (N) - beveled diamond pointing to -Z (North)
    const northGeom = this.createFacetedNeedle(0, -1.45, 0.32, 0.12);
    const northMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.35,
      roughness: 0.2,
      emissive: 0x5a0f0f,
      emissiveIntensity: 0.4
    });
    const northMesh = new THREE.Mesh(northGeom, northMat);
    northMesh.userData = { view: 'north', name: 'N' };
    this.compassGroup.add(northMesh);
    this.clickableObjects.push(northMesh);

    // 5. 3D Faceted South Arrow (S) - silver diamond pointing to +Z (South)
    const southGeom = this.createFacetedNeedle(0, 1.45, 0.32, 0.12);
    const southMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.7,
      roughness: 0.3
    });
    const southMesh = new THREE.Mesh(southGeom, southMat);
    southMesh.userData = { view: 'south', name: 'S' };
    this.compassGroup.add(southMesh);
    this.clickableObjects.push(southMesh);

    // 6. East & West Pointer Wings (+X is East, -X is West)
    const eastGeom = this.createFacetedNeedle(1.25, 0, 0.22, 0.08);
    const eastMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.5,
      roughness: 0.3
    });
    const eastMesh = new THREE.Mesh(eastGeom, eastMat);
    eastMesh.userData = { view: 'east', name: 'E' };
    this.compassGroup.add(eastMesh);
    this.clickableObjects.push(eastMesh);

    const westGeom = this.createFacetedNeedle(-1.25, 0, 0.22, 0.08);
    const westMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.5,
      roughness: 0.3
    });
    const westMesh = new THREE.Mesh(westGeom, westMat);
    westMesh.userData = { view: 'west', name: 'W' };
    this.compassGroup.add(westMesh);
    this.clickableObjects.push(westMesh);

    // 7. Center Pivot Cap & Vertical Zenith Up Pin (+Y)
    const hubGeom = new THREE.CylinderGeometry(0.24, 0.28, 0.14, 24);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.8,
      roughness: 0.2
    });
    const hub = new THREE.Mesh(hubGeom, hubMat);
    hub.position.y = 0.04;
    hub.userData = { view: 'plan', name: 'TOP' };
    this.compassGroup.add(hub);
    this.clickableObjects.push(hub);

    // Vertical Up-Pin indicating zenith axis in 3D
    const pinGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.9,
      roughness: 0.1
    });
    const pin = new THREE.Mesh(pinGeom, pinMat);
    pin.position.y = 0.42;
    this.compassGroup.add(pin);

    const topTipGeom = new THREE.SphereGeometry(0.09, 16, 16);
    const topTipMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.2
    });
    const topTip = new THREE.Mesh(topTipGeom, topTipMat);
    topTip.position.y = 0.78;
    topTip.userData = { view: 'plan', name: 'TOP' };
    this.compassGroup.add(topTip);
    this.clickableObjects.push(topTip);

    // 8. 3D Floating Cardinal Labels (N, S, E, W, TOP)
    this.createCardinalLabel('N', 0, 0.05, -2.0, '#ef4444', 'north');
    this.createCardinalLabel('S', 0, 0.05, 2.0, '#94a3b8', 'south');
    this.createCardinalLabel('E', 2.0, 0.05, 0, '#38bdf8', 'east');
    this.createCardinalLabel('W', -2.0, 0.05, 0, '#38bdf8', 'west');
    this.createCardinalLabel('TOP', 0, 0.98, 0, '#00e5ff', 'plan', true);
  }

  createFacetedNeedle(targetX, targetZ, baseHalfWidth, height) {
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];

    const len = Math.hypot(targetX, targetZ) || 1;
    const dirX = targetX / len;
    const dirZ = targetZ / len;
    const perpX = -dirZ * baseHalfWidth;
    const perpZ = dirX * baseHalfWidth;

    const pTip = [targetX, 0, targetZ];
    const pCenter = [0, 0, 0];
    const pLeft = [perpX, 0, perpZ];
    const pRight = [-perpX, 0, -perpZ];
    const pTop = [dirX * 0.15, height, dirZ * 0.15];
    const pBottom = [dirX * 0.15, -height, dirZ * 0.15];

    function addTri(p1, p2, p3) {
      vertices.push(...p1, ...p2, ...p3);
      const vA = new THREE.Vector3(...p1);
      const vB = new THREE.Vector3(...p2);
      const vC = new THREE.Vector3(...p3);
      const norm = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(vB, vA), new THREE.Vector3().subVectors(vC, vA)).normalize();
      normals.push(norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z);
    }

    // 4 Top beveled facets
    addTri(pTop, pTip, pLeft);
    addTri(pTop, pRight, pTip);
    addTri(pTop, pLeft, pCenter);
    addTri(pTop, pCenter, pRight);

    // 4 Bottom facets
    addTri(pBottom, pLeft, pTip);
    addTri(pBottom, pTip, pRight);
    addTri(pBottom, pCenter, pLeft);
    addTri(pBottom, pRight, pCenter);

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geom;
  }

  createCardinalLabel(text, x, y, z, colorHex, viewName, isBillboard = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);

    ctx.font = '900 68px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colorHex;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillText(text, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    
    let labelObj;
    if (isBillboard) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      labelObj = new THREE.Sprite(mat);
      labelObj.scale.set(0.65, 0.65, 1);
    } else {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, side: THREE.DoubleSide });
      const geom = new THREE.PlaneGeometry(0.65, 0.65);
      geom.rotateX(-Math.PI / 2);
      labelObj = new THREE.Mesh(geom, mat);
    }
    labelObj.position.set(x, y, z);
    labelObj.userData = { view: viewName, name: text };
    this.compassGroup.add(labelObj);
    this.clickableObjects.push(labelObj);
  }

  initEvents() {
    const container = this.container;
    const canvas = this.canvas;

    const onPointerDown = (e) => {
      this.isDragging = true;
      this.hasDragged = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      container.classList.add('dragging');
    };

    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.hypot(dx, dy) > 2) {
          this.hasDragged = true;
          this.app.rotateAroundPivot(dx, dy);
          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
        }
      } else {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.clickableObjects, true);
        container.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
      }
    };

    const onPointerUp = (e) => {
      container.classList.remove('dragging');
      if (this.isDragging && !this.hasDragged) {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.clickableObjects, true);
        if (hits.length > 0) {
          let hitObj = hits[0].object;
          while (hitObj && !hitObj.userData.view && hitObj.parent) {
            hitObj = hitObj.parent;
          }
          const view = hitObj && hitObj.userData ? hitObj.userData.view : null;
          if (view) {
            this.app.setView(view);
          }
        } else {
          const camPos = this.app.camera.position;
          const target = this.app.controls.target;
          const isTop = Math.abs(camPos.x - target.x) < 2 && Math.abs(camPos.z - target.z) < 2;
          this.app.setView(isTop ? 'iso' : 'plan');
        }
      } else if (this.isDragging && this.hasDragged) {
        this.app.pushViewSnapshot();
      }
      this.isDragging = false;
      this.hasDragged = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  update() {
    if (!this.app || !this.app.camera || !this.app.controls) return;
    const mainCam = this.app.camera;
    const controls = this.app.controls;

    // View direction vector from target to camera in main scene
    const dir = new THREE.Vector3();
    dir.copy(mainCam.position).sub(controls.target).normalize();

    // Position compass camera at same orientation vector at fixed distance
    const dist = 4.8;
    this.camera.position.copy(dir).multiplyScalar(dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.up.copy(mainCam.up);

    this.renderer.render(this.scene, this.camera);
  }
}

// Main Application Controller for 3D BIM Viewer
class BIMViewerApp {
  constructor() {
    this.author = "WWBIM";
    window.BIM_SCOPE_AUTHOR = "WWBIM";
    this.container = document.getElementById('viewport-container');
    this.canvas = document.getElementById('canvas3d');
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1017);
    this.fogEnabled = true;
    this.visibleDistance = 5000;
    
    // Camera with default 5,000m far plane (max 10,000m, accommodating large civil / infrastructure projects)
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / (height || 1);

    this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.5, this.visibleDistance);
    this.perspectiveCamera.position.set(220, 180, 260);

    const initH = 200;
    const initW = initH * aspect;
    this.orthographicCamera = new THREE.OrthographicCamera(-initW / 2, initW / 2, initH / 2, -initH / 2, 0.5, this.visibleDistance);
    this.orthographicCamera.position.set(220, 180, 260);

    this.camera = this.perspectiveCamera;
    this.cameraProjection = 'perspective';
    this.updateFog();
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      stencil: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    // Virtual Pivot & Camera Controls System (Autodesk Construction Cloud / Forge style)
    this.pivotPoint = new THREE.Vector3(0, 1.9, 0);
    this.controls = {
      target: new THREE.Vector3(0, 1.9, 0),
      update: () => {}
    };
    this.isOrbiting = false;
    this.orbitStartX = 0;
    this.orbitStartY = 0;
    this.orbitMoved = false;

    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.isRightDragging = false;
    this.rightDownPos = { x: 0, y: 0 };
    this.panMoved = false;

    // View History Engine (50 steps undo / redo)
    this.viewHistory = [];
    this.historyIndex = -1;
    this.maxViewHistory = 50;
    this.isNavigatingViewHistory = false;
    this.viewWheelDebounceTimer = null;
    this.cameraTweenRaf = null;

    // Grid Helper
    this.grid = new THREE.GridHelper(800, 80, 0x1f2e46, 0x131a28);
    this.grid.position.y = -0.1;
    this.scene.add(this.grid);
    
    // Sub-systems
    this.solarEngine = new SolarEngine(this.scene, this.renderer);
    this.clippingEngine = new ClippingEngine(this.scene, this.renderer);
    this.isGizmoDragging = false;
    this.clippingEngine.onGizmoChange = () => this.syncSectionUI();
    this.ifcParser = new IFCParser();
    
    // Raycasting & Interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedMesh = null;
    this.selectedMeshes = [];
    this.isBoxSelecting = false;
    this.marqueeBoxEl = null;
    this.activeInspectorTab = 'overview';
    this.currentModelInfo = null;
    this.lastClickPoint = null;
    this.customInspectorWidth = parseInt(localStorage.getItem('bimscope_inspector_width'), 10) || 330;
    this.customTreeWidth = parseInt(localStorage.getItem('bimscope_tree_width'), 10) || 330;
    this.autoCollapsedLeft = false;
    this.autoCollapsedRight = false;
    this.highlightBox = null;
    this.highlightColor = '#00e5ff';
    this.highlightOpacity = 0.65;
    this.highlightOverlayGroup = null;
    this.hoveredMesh = null;
    this.hoverOverlayGroup = null;
    this.hoverOpacity = 0.10;
    
    // Measure Tool
    this.isMeasureMode = false;
    this.measurePoints = [];
    this.measureLine = null;
    
    this.activeModel = null;
    this.modelOpacity = 1.0;
    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.activeFrameTimeTotal = 0;
    this.cpuLoad = 0;
    this.drawCalls = 0;
    this.ramMb = null;
    
    // Performance optimization states: rAF throttles & DOM caches
    this.hoverRaf = null;
    this.pendingMouseMoveEvt = null;
    this.cachedCoordEls = null;
    this.cachedCamEls = null;
    this.cachedPerfEls = null;
    
    // UI Theme System ('dark' | 'light')
    this.currentTheme = 'dark';
    
    // Architectural Edge Lines System
    this.showEdges = true;
    this.edgeThreshold = 28;
    this.edgeColor = 0x22262b;
    this.edgeOpacity = 0.65;
    
    // Universal Animation Player Engine (for DAE, FBX & GLTF models)
    this.animMixer = null;
    this.animClips = [];
    this.currentAnimAction = null;
    this.isAnimPlaying = false;
    this.isAnimLooping = true;
    this.isAnimScrubbing = false;
    this.animPlaybackSpeed = 1.0;
    this.animClock = new THREE.Clock();
    this.animDuration = 0;

    // Setup 3D orientation compass & category filter states
    this.categoryStates = new Map();
    this.compass3d = new True3DCompass(this);
    if (typeof ModelCompareEngine !== 'undefined') {
      this.compareEngine = new ModelCompareEngine(this);
    }
    this.initPivotHelper();
    this.initSelectionHelper();
    this.initContextMenu();
    this.initEventListeners();
    this.initUI();
    this.handleWindowAdaptiveLayout();
    
    // Load default CR301 West Depot model
    this.loadDemoModel();
    
    // Animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }
  
  initPivotHelper() {
    this.pivotHelper = new THREE.Group();
    this.pivotHelper.visible = false;
    this.pivotHelper.userData = { isPivotHelper: true };

    // Glowing cyan reticle ring
    const ringGeom = new THREE.RingGeometry(0.55, 0.72, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.userData = { isPivotHelper: true };
    ring.renderOrder = 999;
    this.pivotHelper.add(ring);

    // Center focal dot
    const dotGeom = new THREE.SphereGeometry(0.12, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      depthTest: false
    });
    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.userData = { isPivotHelper: true };
    dot.renderOrder = 999;
    this.pivotHelper.add(dot);

    // Crosshairs
    const crossGeom = new THREE.BufferGeometry();
    const crossVerts = new Float32Array([
      0, 0.72, 0,  0, 1.1, 0,
      0, -0.72, 0, 0, -1.1, 0,
      -0.72, 0, 0, -1.1, 0, 0,
      0.72, 0, 0,  1.1, 0, 0
    ]);
    crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
    const crossMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 1.0,
      depthTest: false
    });
    const cross = new THREE.LineSegments(crossGeom, crossMat);
    cross.userData = { isPivotHelper: true };
    cross.renderOrder = 999;
    this.pivotHelper.add(cross);

    this.pivotHelperMaterials = [ringMat, dotMat, crossMat];
    this.pivotStartTime = 0;
    this.scene.add(this.pivotHelper);
  }

  showPivotIndicator(position) {
    if (!this.pivotHelper) return;
    this.pivotHelper.position.copy(position);
    this.pivotHelper.visible = true;
    this.pivotStartTime = performance.now();
    this.pivotHelperMaterials.forEach(m => m.opacity = 1.0);
    this.updatePivotIndicator();
  }

  updatePivotIndicator() {
    if (!this.pivotHelper || !this.pivotHelper.visible) return;
    const elapsed = performance.now() - this.pivotStartTime;
    if (elapsed > 900) {
      this.pivotHelper.visible = false;
      return;
    }
    const alpha = Math.max(0, 1 - (elapsed / 900));
    this.pivotHelperMaterials.forEach(m => m.opacity = alpha * 1.0);

    const dist = this.camera.position.distanceTo(this.pivotHelper.position);
    const scale = Math.max(0.15, dist * 0.0175);
    this.pivotHelper.scale.set(scale, scale, scale);
    this.pivotHelper.quaternion.copy(this.camera.quaternion);
  }

  // Camera Visible Distance & Atmospheric Fog Management
  updateFog() {
    if (!this.fogEnabled) {
      this.scene.fog = null;
    } else {
      const far = this.camera ? this.camera.far : this.visibleDistance;
      // Gentle linear fog fading in from 45% to 98% of visible distance
      this.scene.fog = new THREE.Fog(0x0c1017, far * 0.45, far * 0.98);
    }
  }

  setFarClip(distance, updateUI = true) {
    const clamped = Math.max(200, Math.min(distance, 10000));
    this.visibleDistance = clamped;
    if (this.perspectiveCamera) {
      this.perspectiveCamera.far = clamped;
      this.perspectiveCamera.updateProjectionMatrix();
    }
    if (this.orthographicCamera) {
      this.orthographicCamera.far = clamped;
      this.orthographicCamera.updateProjectionMatrix();
    }
    if (this.camera && this.camera !== this.perspectiveCamera && this.camera !== this.orthographicCamera) {
      this.camera.far = clamped;
      this.camera.updateProjectionMatrix();
    }
    this.updateFog();
    if (updateUI) {
      this.updateDistanceUI(clamped);
    }
  }

  formatDistance(dist) {
    if (dist >= 1000) {
      const km = dist / 1000;
      return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`;
    }
    return `${Math.round(dist)} m`;
  }

  updateDistanceUI(dist) {
    const text = this.formatDistance(dist);
    const navVal = document.getElementById('nav-dist-display');
    if (navVal) navVal.textContent = text;
    const navSlider = document.getElementById('nav-dist-slider');
    if (navSlider) navSlider.value = dist;

    const sideVal = document.getElementById('side-dist-display');
    if (sideVal) sideVal.textContent = `${Math.round(dist).toLocaleString()} m (${text})`;
    const sideSlider = document.getElementById('side-dist-slider');
    if (sideSlider) sideSlider.value = dist;
  }

  // Autodesk Construction Cloud (ACC / Forge) Virtual Pivot Orbit Engine
  rotateAroundPivot(dx, dy) {
    if (!this.pivotPoint) return;
    const P = this.pivotPoint;
    const C = this.camera.position;
    const speed = 0.0055;

    // 1. Yaw: Horizontal rotation around world Up axis (0, 1, 0) through virtual pivot P
    const theta = -dx * speed;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta);

    // 2. Pitch: Vertical rotation around camera Right axis in horizontal plane
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    let camRight = new THREE.Vector3().crossVectors(camFwd, worldUp).normalize();
    if (camRight.lengthSq() < 0.001) camRight.set(1, 0, 0);

    const phi = -dy * speed;
    const qPitch = new THREE.Quaternion().setFromAxisAngle(camRight, phi);

    // Polar pitch clamping: allow full range [0.02, Math.PI - 0.02] without pole flipping
    const testFwd = camFwd.clone().applyQuaternion(qPitch).applyQuaternion(qYaw);
    const angleToUp = testFwd.angleTo(worldUp);

    const qDelta = new THREE.Quaternion();
    if (angleToUp >= 0.02 && angleToUp <= Math.PI - 0.02) {
      qDelta.multiplyQuaternions(qPitch, qYaw);
    } else {
      qDelta.copy(qYaw);
    }

    // 3. Orbit camera position around virtual pivot P
    const offset = new THREE.Vector3().subVectors(C, P);
    offset.applyQuaternion(qDelta);
    this.camera.position.copy(P).add(offset);

    // 4. Rotate camera orientation and re-level horizon (zero roll)
    const newFwd = camFwd.applyQuaternion(qDelta).normalize();
    let newRight = new THREE.Vector3().crossVectors(newFwd, worldUp).normalize();
    if (newRight.lengthSq() < 0.001) newRight.set(1, 0, 0);
    const newUp = new THREE.Vector3().crossVectors(newRight, newFwd).normalize();

    const rotMatrix = new THREE.Matrix4().makeBasis(newRight, newUp, newFwd.clone().negate());
    this.camera.quaternion.setFromRotationMatrix(rotMatrix);

    // 5. Keep controls.target aligned with camera forward line of sight at pivot distance
    const dist = this.camera.position.distanceTo(P);
    this.controls.target.copy(this.camera.position).addScaledVector(newFwd, dist);

    // 6. Update True3DCompass
    if (this.compass3d) {
      this.compass3d.update();
    }
  }

  // Native CAD / Forge Screen-space Camera Panning (Right/Middle drag)
  panCamera(dx, dy) {
    let factor;
    if (this.camera && this.camera.isOrthographicCamera) {
      factor = ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1.0)) / (this.canvas.clientHeight || 1000);
    } else {
      const dist = this.camera.position.distanceTo(this.pivotPoint);
      const fov = (this.camera.fov || 45) * (Math.PI / 180);
      const targetHeight = 2.0 * Math.tan(fov / 2.0) * dist;
      factor = targetHeight / (this.canvas.clientHeight || 1000);
    }

    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    const delta = new THREE.Vector3()
      .addScaledVector(camRight, -dx * factor)
      .addScaledVector(camUp, dy * factor);

    this.camera.position.add(delta);
    if (this.controls && this.controls.target) {
      this.controls.target.add(delta);
    }
    // IMPORTANT: this.pivotPoint is NOT modified during pan!
    // It remains the fixed 3D point in the scene.

    if (this.compass3d) {
      this.compass3d.update();
    }
  }

  initSelectionHelper() {
    this.highlightBox = new THREE.BoxHelper(new THREE.Mesh(), 0x00e5ff);
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);
    this.initMarqueeHelper();
  }

  initMarqueeHelper() {
    if (!this.container) return;
    let marquee = document.getElementById('viewport-marquee-box');
    if (!marquee) {
      marquee = document.createElement('div');
      marquee.id = 'viewport-marquee-box';
      marquee.className = 'marquee-selection-box';
      this.container.appendChild(marquee);
    }
    this.marqueeBoxEl = marquee;
  }

  updateMarqueeBox(startX, startY, currentX, currentY) {
    if (!this.marqueeBoxEl) {
      this.initMarqueeHelper();
    }
    if (!this.marqueeBoxEl || !this.container) return;

    const cRect = this.container.getBoundingClientRect();
    const clampedStartX = THREE.MathUtils.clamp(startX, cRect.left, cRect.right);
    const clampedStartY = THREE.MathUtils.clamp(startY, cRect.top, cRect.bottom);
    const clampedCurrX = THREE.MathUtils.clamp(currentX, cRect.left, cRect.right);
    const clampedCurrY = THREE.MathUtils.clamp(currentY, cRect.top, cRect.bottom);

    const left = Math.min(clampedStartX, clampedCurrX) - cRect.left;
    const top = Math.min(clampedStartY, clampedCurrY) - cRect.top;
    const width = Math.abs(clampedCurrX - clampedStartX);
    const height = Math.abs(clampedCurrY - clampedStartY);

    const isWindow = currentX >= startX; // Left-to-right = Window; Right-to-left = Crossing

    this.marqueeBoxEl.className = 'marquee-selection-box ' + (isWindow ? 'window-selection' : 'crossing-selection');
    this.marqueeBoxEl.style.left = `${left}px`;
    this.marqueeBoxEl.style.top = `${top}px`;
    this.marqueeBoxEl.style.width = `${width}px`;
    this.marqueeBoxEl.style.height = `${height}px`;
    this.marqueeBoxEl.style.display = 'block';
  }

  hideMarqueeBox() {
    if (this.marqueeBoxEl) {
      this.marqueeBoxEl.style.display = 'none';
    }
  }

  finishBoxSelection(e, startX, startY, endX, endY) {
    if (!this.activeModel) return;

    const isWindow = endX >= startX; // Left-to-right: Window; Right-to-left: Crossing
    const cRect = this.canvas.getBoundingClientRect();
    const bx0 = Math.min(startX, endX) - cRect.left;
    const bx1 = Math.max(startX, endX) - cRect.left;
    const by0 = Math.min(startY, endY) - cRect.top;
    const by1 = Math.max(startY, endY) - cRect.top;

    const clippingPlanes = (this.clippingEngine && this.clippingEngine.enabled) ? 
      (this.clippingEngine.clippingPlanes || []) : [];

    const boxedMeshes = [];

    this.activeModel.traverse((mesh) => {
      if (!this.isPickableElement(mesh) || !mesh.geometry) return;

      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      const localBox = mesh.geometry.boundingBox;
      if (!localBox) return;

      // 8 corners of object's AABB transformed to world space
      const corners = [
        new THREE.Vector3(localBox.min.x, localBox.min.y, localBox.min.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.min.x, localBox.min.y, localBox.max.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.min.x, localBox.max.y, localBox.min.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.min.x, localBox.max.y, localBox.max.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.max.x, localBox.min.y, localBox.min.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.max.x, localBox.min.y, localBox.max.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.max.x, localBox.max.y, localBox.min.z).applyMatrix4(mesh.matrixWorld),
        new THREE.Vector3(localBox.max.x, localBox.max.y, localBox.max.z).applyMatrix4(mesh.matrixWorld)
      ];

      // Check clipping planes: if completely clipped, ignore
      if (clippingPlanes.length > 0) {
        let isFullyClipped = false;
        for (const plane of clippingPlanes) {
          if (corners.every(c => plane.distanceToPoint(c) < 0)) {
            isFullyClipped = true;
            break;
          }
        }
        if (isFullyClipped) return;
      }

      // Project corners to canvas screen space
      let allInsideBox = true;
      let anyInFront = false;
      let minSx = Infinity, maxSx = -Infinity;
      let minSy = Infinity, maxSy = -Infinity;

      for (const c of corners) {
        const p = c.clone().project(this.camera);
        if (p.z <= 1.0) {
          anyInFront = true;
        }
        const sx = (p.x * 0.5 + 0.5) * cRect.width;
        const sy = (-p.y * 0.5 + 0.5) * cRect.height;

        if (sx < minSx) minSx = sx;
        if (sx > maxSx) maxSx = sx;
        if (sy < minSy) minSy = sy;
        if (sy > maxSy) maxSy = sy;

        if (p.z > 1.0 || sx < bx0 || sx > bx1 || sy < by0 || sy > by1) {
          allInsideBox = false;
        }
      }

      if (!anyInFront) return;

      let match = false;
      if (isWindow) {
        // Window selection: entire element must be strictly within box
        match = allInsideBox;
      } else {
        // Crossing selection: 2D projected bounding box overlaps selection rectangle
        match = (minSx <= bx1 && maxSx >= bx0 && minSy <= by1 && maxSy >= by0);
      }

      if (match) {
        boxedMeshes.push(mesh);
      }
    });

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const current = (this.selectedMeshes && this.selectedMeshes.length > 0) ? 
      [...this.selectedMeshes] : 
      (this.selectedMesh ? [this.selectedMesh] : []);

    let finalMeshes = [];
    if (isShift) {
      // Subtract (Difference)
      const boxedSet = new Set(boxedMeshes);
      finalMeshes = current.filter(m => !boxedSet.has(m));
    } else if (isCtrl) {
      // Union (Add)
      const set = new Set(current);
      boxedMeshes.forEach(m => set.add(m));
      finalMeshes = Array.from(set);
    } else {
      // Replace
      finalMeshes = boxedMeshes;
    }

    if (finalMeshes.length === 0) {
      this.clearSelection();
    } else if (finalMeshes.length === 1) {
      this.selectElement(finalMeshes[0]);
    } else {
      this.selectElements(finalMeshes);
    }
  }

  createHighlightOverlay(target) {
    this.clearHighlightOverlay();
    if (!target) return;

    const targets = Array.isArray(target) ? target : [target];
    if (targets.length === 0) return;

    this.highlightOverlayGroup = new THREE.Group();
    this.highlightOverlayGroup.userData = { isHighlightOverlay: true };

    const planes = (this.clippingEngine && this.clippingEngine.enabled) ? 
      (this.clippingEngine.mode === 'plane' ? [this.clippingEngine.singlePlane] : this.clippingEngine.boxPlanes) : [];

    const createMatFor = (sourceMat) => {
      const isTrans = sourceMat ? (
        Boolean(sourceMat.transparent) || 
        (sourceMat.userData && Boolean(sourceMat.userData.originalTransparent)) || 
        (sourceMat.opacity !== undefined && sourceMat.opacity < 0.85)
      ) : false;
      const op = isTrans ? Math.min(0.25, this.highlightOpacity * 0.4) : this.highlightOpacity;
      const col = new THREE.Color(this.highlightColor);
      const overlaySide = sourceMat && sourceMat.side !== undefined ? sourceMat.side : THREE.FrontSide;
      const overlayMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: op,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -0.5,
        side: overlaySide,
        clippingPlanes: planes,
        clipShadows: true
      });
      overlayMat.userData = { isTransElement: isTrans };
      if (sourceMat && sourceMat.alphaMap) {
        overlayMat.alphaMap = sourceMat.alphaMap;
        overlayMat.alphaTest = sourceMat.alphaTest !== undefined ? sourceMat.alphaTest : 0.5;
      }
      return overlayMat;
    };

    targets.forEach((t) => {
      if (!t) return;
      t.updateWorldMatrix(true, true);
      t.traverse((obj) => {
        if (obj.isMesh && obj.geometry && (!obj.userData || (!obj.userData.isPivotHelper && !obj.userData.isHighlightOverlay))) {
          let overlayMat;
          if (Array.isArray(obj.material)) {
            overlayMat = obj.material.map(m => createMatFor(m));
          } else {
            overlayMat = createMatFor(obj.material);
          }
          const overlayMesh = new THREE.Mesh(obj.geometry, overlayMat);
          overlayMesh.applyMatrix4(obj.matrixWorld);
          overlayMesh.renderOrder = 1;
          overlayMesh.userData = { isHighlightOverlay: true };
          this.highlightOverlayGroup.add(overlayMesh);
        }
      });
    });

    this.scene.add(this.highlightOverlayGroup);
  }

  clearHighlightOverlay() {
    if (this.highlightOverlayGroup) {
      this.highlightOverlayGroup.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m && m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.scene.remove(this.highlightOverlayGroup);
      this.highlightOverlayGroup = null;
    }
  }

  updateHighlightAppearance() {
    if (this.highlightOverlayGroup) {
      const col = new THREE.Color(this.highlightColor);
      this.highlightOverlayGroup.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const updateMat = (m) => {
            if (!m) return;
            if (m.color) m.color.copy(col);
            const isTrans = m.userData && m.userData.isTransElement;
            m.opacity = isTrans ? Math.min(0.25, this.highlightOpacity * 0.4) : this.highlightOpacity;
            m.needsUpdate = true;
          };
          if (Array.isArray(obj.material)) {
            obj.material.forEach(updateMat);
          } else {
            updateMat(obj.material);
          }
        }
      });
    }
    this.needsRender = true;
  }

  setHoveredElement(mesh) {
    if (this.hoveredMesh === mesh && this.hoverOverlayGroup) return;
    this.createHoverOverlay(mesh);
  }

  createHoverOverlay(target) {
    this.clearHoverOverlay();
    if (!target) return;
    if (target === this.selectedMesh || (this.selectedMeshes && this.selectedMeshes.includes(target))) return;

    this.hoveredMesh = target;
    this.hoverOverlayGroup = new THREE.Group();
    this.hoverOverlayGroup.userData = { isHoverOverlay: true };

    const planes = (this.clippingEngine && this.clippingEngine.enabled) ? 
      (this.clippingEngine.mode === 'plane' ? [this.clippingEngine.singlePlane] : this.clippingEngine.boxPlanes) : [];

    const createHoverMatFor = (sourceMat) => {
      const isTrans = sourceMat ? (
        Boolean(sourceMat.transparent) || 
        (sourceMat.userData && Boolean(sourceMat.userData.originalTransparent)) || 
        (sourceMat.opacity !== undefined && sourceMat.opacity < 0.85)
      ) : false;

      const overlaySide = sourceMat && sourceMat.side !== undefined ? sourceMat.side : THREE.FrontSide;
      const overlayMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.NormalBlending,
        transparent: true,
        opacity: isTrans ? this.hoverOpacity * 0.5 : this.hoverOpacity,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -0.5,
        side: overlaySide,
        clippingPlanes: planes,
        clipShadows: true
      });
      if (sourceMat && sourceMat.alphaMap) {
        overlayMat.alphaMap = sourceMat.alphaMap;
        overlayMat.alphaTest = sourceMat.alphaTest !== undefined ? sourceMat.alphaTest : 0.5;
      }
      return overlayMat;
    };

    target.updateWorldMatrix(true, true);

    target.traverse((obj) => {
      if (obj.isMesh && obj.geometry && (!obj.userData || (!obj.userData.isPivotHelper && !obj.userData.isHighlightOverlay && !obj.userData.isHoverOverlay))) {
        let overlayMat;
        if (Array.isArray(obj.material)) {
          overlayMat = obj.material.map(m => createHoverMatFor(m));
        } else {
          overlayMat = createHoverMatFor(obj.material);
        }
        const overlayMesh = new THREE.Mesh(obj.geometry, overlayMat);
        overlayMesh.applyMatrix4(obj.matrixWorld);
        overlayMesh.renderOrder = 1;
        overlayMesh.userData = { isHoverOverlay: true };
        this.hoverOverlayGroup.add(overlayMesh);
      }
    });

    this.scene.add(this.hoverOverlayGroup);
  }

  clearHoverOverlay() {
    this.hoveredMesh = null;
    if (this.hoverOverlayGroup) {
      this.hoverOverlayGroup.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m && m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.scene.remove(this.hoverOverlayGroup);
      this.hoverOverlayGroup = null;
    }
  }

  // Dynamic Bottom Category Legend & Element Filtering
  updateBottomLegend() {
    const container = document.querySelector('.legend-container');
    if (!container) return;

    // Reset container with title
    container.innerHTML = '<span class="legend-title" data-i18n="legendTitle">' + I18N.t('legendTitle') + '</span>';

    this.categoryStates.clear();
    if (!this.activeModel) {
      this.updateBottomBarOverflow();
      return;
    }

    // Scan activeModel for all category groups
    const catMap = new Map();
    this.activeModel.traverse(obj => {
      if (this.isModelElementMesh(obj) && obj.userData) {
        const cat = obj.userData.rawCategory || obj.userData.category || "Structure";
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat).push(obj);
      }
    });

    if (catMap.size === 0) {
      this.updateBottomBarOverflow();
      return;
    }

    catMap.forEach((meshes, catName) => {
      const firstMat = meshes[0] && meshes[0].material;
      const colObj = Array.isArray(firstMat) ? (firstMat[0] && firstMat[0].color) : (firstMat && firstMat.color);
      let colorHex = colObj ? '#' + colObj.getHexString() : null;
      if (!colorHex || colorHex === '#ffffff' || colorHex === '#94a3b8') {
        colorHex = (BIMViewerApp.StandardCategoryColors && BIMViewerApp.StandardCategoryColors[catName]) || colorHex || '#38bdf8';
      }
      
      const count = meshes.length;
      const localizedName = I18N.getCategoryName(catName);

      const chip = document.createElement('span');
      chip.className = 'legend-chip';
      chip.setAttribute('data-cat', catName);
      chip.title = `${localizedName} (${count}) - Click: Toggle | Alt-Click: Isolate`;

      chip.innerHTML = `
        <span class="category-dot" style="background:${colorHex}"></span>
        <span class="legend-chip-name">${localizedName}</span>
        <span class="legend-chip-count">${count}</span>
      `;

      container.appendChild(chip);

      const state = {
        name: catName,
        localizedName,
        color: colorHex,
        meshes,
        visible: true,
        chipEl: chip,
        checkboxEl: null
      };

      this.categoryStates.set(catName, state);

      chip.addEventListener('click', (e) => {
        if (e.altKey || e.shiftKey) {
          this.isolateCategory(catName);
        } else {
          this.toggleCategory(catName);
        }
      });

      chip.addEventListener('dblclick', () => {
        this.isolateCategory(catName);
      });
    });

    this.updateBottomBarOverflow();
  }

  toggleCategory(catName, forcedState = null) {
    const state = this.categoryStates.get(catName);
    if (!state) return;

    state.visible = (forcedState !== null) ? forcedState : !state.visible;
    state.meshes.forEach(m => {
      m.visible = state.visible;
    });

    if (state.chipEl) {
      state.chipEl.classList.toggle('cat-hidden', !state.visible);
      state.chipEl.classList.remove('cat-isolated');
    }

    if (state.checkboxEl && state.checkboxEl.checked !== state.visible) {
      state.checkboxEl.checked = state.visible;
    }
  }

  isolateCategory(catName) {
    const target = this.categoryStates.get(catName);
    if (!target) return;

    // Check if target is already the only visible category
    let otherVisible = false;
    this.categoryStates.forEach((st, name) => {
      if (name !== catName && st.visible) otherVisible = true;
    });

    if (!otherVisible && target.visible) {
      // Revert isolation: restore all categories
      this.categoryStates.forEach(st => {
        st.visible = true;
        st.meshes.forEach(m => m.visible = true);
        if (st.chipEl) {
          st.chipEl.classList.remove('cat-hidden');
          st.chipEl.classList.remove('cat-isolated');
        }
        if (st.checkboxEl) st.checkboxEl.checked = true;
      });
      showToast(I18N.t('showAll') || 'Show All', 'info');
      return;
    }

    // Isolate target category: hide all others
    this.categoryStates.forEach((st, name) => {
      const isTarget = (name === catName);
      st.visible = isTarget;
      st.meshes.forEach(m => m.visible = isTarget);
      if (st.chipEl) {
        st.chipEl.classList.toggle('cat-hidden', !isTarget);
        st.chipEl.classList.toggle('cat-isolated', isTarget);
      }
      if (st.checkboxEl) st.checkboxEl.checked = isTarget;
    });
    showToast(`Isolated ${target.localizedName || target.name}`, 'warning');
  }
  
  loadDemoModel() {
    this.clearModel();
    document.getElementById('project-title-text').textContent = I18N.t('appTitle');
    
    const model = CRLDemoModel.create();
    this.setModel(model);
    
    const stats = this.calculateModelStats(model);
    this.currentModelInfo = {
      isDemo: true,
      fileName: "Demo Model",
      format: "Procedural BIM (JavaScript/Three.js)",
      formatVersion: "Procedural BIM (Three.js r128)",
      schema: "Built-in Procedural BIM",
      unitStr: "1.0 m (Z-up)",
      unitStrZh: "米 (Z-up)",
      fileSize: "Bundled In-Memory",
      filePath: "Built-in Architectural Template",
      lastModified: "Application Built-in",
      loadedTime: new Date().toLocaleString(),
      originalSoftware: "WWBIM Procedural BIM Engine",
      mvd: "Full Architectural Coordination Model",
      exportTimestamp: "Runtime Dynamic Procedural",
      preprocessor: "Three.js r128 / WWBIM Core",
      stats: stats
    };
    this.updateModelSubtitle();
    this.renderModelInfoInspector();
  }
  
  clearModel() {
    if (this.activeModel) {
      this.scene.remove(this.activeModel);
      const texturesToDispose = new Set();
      this.activeModel.traverse(obj => {
        if (obj.userData && obj.userData.edgeLines) {
          if (obj.userData.edgeLines.geometry) obj.userData.edgeLines.geometry.dispose();
          if (obj.userData.edgeLines.material) {
            if (Array.isArray(obj.userData.edgeLines.material)) obj.userData.edgeLines.material.forEach(m => m && m.dispose());
            else obj.userData.edgeLines.material.dispose();
          }
          obj.userData.edgeLines = null;
        }
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          const texSlots = [
            'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap',
            'emissiveMap', 'lightMap', 'metalnessMap', 'normalMap',
            'roughnessMap', 'specularMap'
          ];
          mats.forEach(m => {
            if (!m) return;
            texSlots.forEach(slot => {
              if (m[slot] && typeof m[slot].dispose === 'function') {
                texturesToDispose.add(m[slot]);
              }
            });
            m.dispose();
          });
        }
      });
      texturesToDispose.forEach(tex => tex.dispose());
      this.activeModel = null;
    }
    if (this.clippingEngine) {
      this.clippingEngine.clearModel();
    }
    this.categoryStates.clear();
    const container = document.querySelector('.legend-container');
    if (container) {
      container.innerHTML = '<span class="legend-title" data-i18n="legendTitle">' + I18N.t('legendTitle') + '</span>';
      this.updateBottomBarOverflow();
    }
    this.clearSelection();
    this.hideAnimationPlayer();
  }

  // Robust Architectural Edge Extractor with coplanar multi-triangle elimination
  createArchitecturalEdges(geometry, thresholdAngle = 28) {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return null;

    const pos = geometry.attributes.position;
    const index = geometry.index;
    const vertexCount = index ? index.count : pos.count;
    if (vertexCount < 3) return null;

    const precision = 1e4;
    const cosThreshold = Math.cos((thresholdAngle * Math.PI) / 180);
    const edgeMap = new Map();

    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const getIdx = (t) => (index ? index.getX(t) : t);

    for (let t = 0; t < vertexCount; t += 3) {
      const i0 = getIdx(t);
      const i1 = getIdx(t + 1);
      const i2 = getIdx(t + 2);

      va.fromBufferAttribute(pos, i0);
      vb.fromBufferAttribute(pos, i1);
      vc.fromBufferAttribute(pos, i2);

      ab.subVectors(vb, va);
      ac.subVectors(vc, va);
      normal.crossVectors(ab, ac);
      const len = normal.length();
      if (len < 1e-9) continue;
      normal.multiplyScalar(1 / len);

      const k0 = `${Math.round(va.x * precision)},${Math.round(va.y * precision)},${Math.round(va.z * precision)}`;
      const k1 = `${Math.round(vb.x * precision)},${Math.round(vb.y * precision)},${Math.round(vb.z * precision)}`;
      const k2 = `${Math.round(vc.x * precision)},${Math.round(vc.y * precision)},${Math.round(vc.z * precision)}`;

      if (k0 === k1 || k1 === k2 || k2 === k0) continue;

      const normCopy = normal.clone();
      const triVerts = [va, vb, vc];
      const triKeys = [k0, k1, k2];

      for (let e = 0; e < 3; e++) {
        const next = (e + 1) % 3;
        const keyA = triKeys[e];
        const keyB = triKeys[next];
        const edgeKey = (keyA < keyB) ? `${keyA}_${keyB}` : `${keyB}_${keyA}`;

        let entry = edgeMap.get(edgeKey);
        if (!entry) {
          entry = {
            p0: [triVerts[e].x, triVerts[e].y, triVerts[e].z],
            p1: [triVerts[next].x, triVerts[next].y, triVerts[next].z],
            normals: []
          };
          edgeMap.set(edgeKey, entry);
        }
        entry.normals.push(normCopy);
      }
    }

    const edgePositions = [];

    for (const entry of edgeMap.values()) {
      const norms = entry.normals;
      if (norms.length === 1) {
        // True outer boundary silhouette edge of an open surface
        edgePositions.push(entry.p0[0], entry.p0[1], entry.p0[2], entry.p1[0], entry.p1[1], entry.p1[2]);
      } else {
        // Multi-triangle shared edge:
        // Only keep if there is a real crease (any pair of face normals with angle >= thresholdAngle)
        // If all faces sharing this edge are coplanar (e.g. quad diagonal or duplicate coincident shells),
        // dot product of ANY pair is > cosThreshold, so it is filtered out!
        let hasCrease = false;
        const nLen = norms.length;
        for (let i = 0; i < nLen; i++) {
          for (let j = i + 1; j < nLen; j++) {
            if (norms[i].dot(norms[j]) <= cosThreshold) {
              hasCrease = true;
              break;
            }
          }
          if (hasCrease) break;
        }

        if (hasCrease) {
          edgePositions.push(entry.p0[0], entry.p0[1], entry.p0[2], entry.p1[0], entry.p1[1], entry.p1[2]);
        }
      }
    }

    if (edgePositions.length === 0) return null;
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    return edgeGeom;
  }

  createMeshEdges(mesh) {
    if (!mesh || !mesh.geometry) return null;
    if (mesh.userData && mesh.userData.edgeLines) {
      mesh.remove(mesh.userData.edgeLines);
      if (mesh.userData.edgeLines.geometry) mesh.userData.edgeLines.geometry.dispose();
      if (mesh.userData.edgeLines.material) mesh.userData.edgeLines.material.dispose();
      mesh.userData.edgeLines = null;
    }

    try {
      const edgeGeom = this.createArchitecturalEdges(mesh.geometry, this.edgeThreshold) ||
                       new THREE.EdgesGeometry(mesh.geometry, this.edgeThreshold);
      if (!edgeGeom.attributes.position || edgeGeom.attributes.position.count === 0) {
        edgeGeom.dispose();
        return null;
      }

      const edgeMat = new THREE.LineBasicMaterial({
        color: this.edgeColor,
        transparent: this.edgeOpacity < 0.99,
        opacity: this.edgeOpacity,
        depthTest: true
      });

      if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
        edgeMat.clippingPlanes = this.clippingEngine.clippingPlanes;
      }

      const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
      edgeLines.name = 'EdgeLines';
      edgeLines.renderOrder = 2000;
      edgeLines.raycast = () => {}; // Never intercept raycasting
      edgeLines.userData = { isEdgeLine: true };
      edgeLines.visible = this.showEdges;

      mesh.add(edgeLines);
      mesh.userData.edgeLines = edgeLines;
      return edgeLines;
    } catch (err) {
      return null;
    }
  }

  generateModelEdges(group) {
    if (!group) return;
    group.traverse(obj => {
      if (obj.isMesh && obj.geometry && !obj.userData?.isEdgeLine && obj !== this.grid) {
        this.createMeshEdges(obj);
      }
    });
  }

  setEdgeLinesVisible(visible) {
    this.showEdges = visible;
    if (this.activeModel) {
      this.activeModel.traverse(obj => {
        if (obj.isMesh && obj.userData && obj.userData.edgeLines) {
          obj.userData.edgeLines.visible = visible;
        }
      });
    }
    const chk = document.getElementById('edge-lines-toggle-chk');
    if (chk) chk.checked = visible;
  }

  setEdgeLinesOpacity(opacity) {
    this.edgeOpacity = opacity;
    if (this.activeModel) {
      this.activeModel.traverse(obj => {
        if (obj.isMesh && obj.userData && obj.userData.edgeLines && obj.userData.edgeLines.material) {
          obj.userData.edgeLines.material.opacity = opacity;
          obj.userData.edgeLines.material.transparent = opacity < 0.99;
          obj.userData.edgeLines.material.needsUpdate = true;
        }
      });
    }
    const opVal = document.getElementById('edge-opacity-val');
    if (opVal) opVal.textContent = `${Math.round(opacity * 100)}%`;
    const slider = document.getElementById('edge-opacity-slider');
    if (slider) slider.value = Math.round(opacity * 100);
  }
  
  setModel(modelGroup) {
    this.activeModel = modelGroup;
    this.scene.add(this.activeModel);
    
    // Generate clean architectural edge lines
    this.generateModelEdges(this.activeModel);
    
    // Compute total bounds and bounding sphere
    const box = new THREE.Box3().setFromObject(this.activeModel);
    if (!box.isEmpty()) {
      this.clippingEngine.setBounds(box);
      this.clippingEngine.setModel(this.activeModel);
      
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const radius = sphere.radius || 100;

      // Adapt camera visible distance (default 5,000m, capped at max 10,000m)
      const autoFar = Math.min(10000, Math.max(5000, Math.ceil(radius * 5)));
      if (this.camera.far < autoFar) {
        this.setFarClip(autoFar, true);
      } else {
        this.updateDistanceUI(this.camera.far);
      }

      // Reposition Grid under the model's footprint
      if (this.grid) {
        this.grid.position.set(center.x, box.min.y - 0.05, center.z);
      }

      // Update Orbit Pivot to the center of the newly loaded model
      this.pivotPoint.copy(center);
      this.controls.target.copy(center);

      // Update solar lighting center
      if (this.solarEngine) {
        this.solarEngine.setCenter(center);
      }
    }
    
    // Update Hierarchy Tree & Dynamic Bottom Legend
    this.buildHierarchyTree();
    this.updateBottomLegend();
    this.updateStats();
    this.fitView();
    this.initViewHistory();
    
    showToast(I18N.t('loadingTitle') + " - " + I18N.t('solarDayMsg'), 'success');
  }

  // Fit View / Camera Framing
  fitView(immediate = true) {
    if (!this.activeModel) return;
    const box = new THREE.Box3().setFromObject(this.activeModel);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z, 10);
    const neededFar = Math.min(10000, Math.max(5000, Math.ceil(maxDim * 5)));
    if (this.camera.far < neededFar) {
      this.setFarClip(neededFar, true);
    }

    const fov = (this.perspectiveCamera ? this.perspectiveCamera.fov : 45) * (Math.PI / 180);
    let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 0.95;
    cameraDist = Math.max(cameraDist, 22);
    
    const targetCam = new THREE.Vector3(
      center.x - cameraDist * 0.72,
      center.y + cameraDist * 0.50,
      center.z + cameraDist * 0.82
    );
    
    this.pivotPoint.copy(center);
    this.showPivotIndicator(center);

    if (this.camera && this.camera.isOrthographicCamera) {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const aspect = width / (height || 1);
      const halfH = maxDim * 0.65;
      const halfW = halfH * aspect;
      this.orthographicCamera.left = -halfW;
      this.orthographicCamera.right = halfW;
      this.orthographicCamera.top = halfH;
      this.orthographicCamera.bottom = -halfH;
      this.orthographicCamera.zoom = 1.0;
      this.orthographicCamera.updateProjectionMatrix();
    }

    if (immediate) {
      this.camera.position.copy(targetCam);
      this.controls.target.copy(center);
      this.camera.lookAt(center);
      if (this.compass3d) this.compass3d.update();
      if (!this.isNavigatingViewHistory) {
        this.pushViewSnapshot();
      }
    } else {
      this.tweenCamera(targetCam, center);
    }
  }
  
  // Camera tween helper
  tweenCamera(targetPos, targetLookAt, duration = 400, onComplete = null, startZoom = null, targetZoom = null) {
    if (this.cameraTweenRaf) {
      cancelAnimationFrame(this.cameraTweenRaf);
      this.cameraTweenRaf = null;
    }
    this.pivotPoint.copy(targetLookAt);
    if (duration === 0) {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(targetLookAt);
      this.camera.lookAt(targetLookAt);
      if (startZoom !== null && targetZoom !== null && this.orthographicCamera) {
        this.orthographicCamera.zoom = targetZoom;
        this.orthographicCamera.updateProjectionMatrix();
      }
      if (this.compass3d) this.compass3d.update();
      if (onComplete) onComplete();
      if (!this.isNavigatingViewHistory) {
        this.pushViewSnapshot();
      }
      return;
    }
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();
    
    const animateCam = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      
      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.camera.lookAt(this.controls.target);
      if (startZoom !== null && targetZoom !== null && this.orthographicCamera) {
        this.orthographicCamera.zoom = THREE.MathUtils.lerp(startZoom, targetZoom, ease);
        this.orthographicCamera.updateProjectionMatrix();
      }
      if (this.compass3d) this.compass3d.update();
      
      if (progress < 1.0) {
        this.cameraTweenRaf = requestAnimationFrame(animateCam);
      } else {
        this.cameraTweenRaf = null;
        if (onComplete) onComplete();
        if (!this.isNavigatingViewHistory) {
          this.pushViewSnapshot();
        }
      }
    };
    this.cameraTweenRaf = requestAnimationFrame(animateCam);
  }
  
  // View Presets
  setView(preset) {
    if (!this.activeModel) return;
    const box = new THREE.Box3().setFromObject(this.activeModel);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 10);
    
    const fov = (this.perspectiveCamera ? this.perspectiveCamera.fov : 45) * (Math.PI / 180);
    const aspect = (this.perspectiveCamera ? this.perspectiveCamera.aspect : 1) || 1;
    
    let viewW = maxDim, viewH = maxDim;
    if (preset === 'plan') {
      viewW = size.x;
      viewH = size.z;
    } else if (preset === 'north' || preset === 'south') {
      viewW = size.x;
      viewH = size.y;
    } else if (preset === 'east' || preset === 'west') {
      viewW = size.z;
      viewH = size.y;
    }

    const distH = (viewH / 2) / Math.tan(fov / 2);
    const distW = (viewW / 2) / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(distH, distW, 10) * 1.35;
    
    if (this.camera && this.camera.isOrthographicCamera) {
      const neededH = Math.max(viewH, viewW / aspect) * 1.35;
      const halfH = neededH / 2.0;
      const halfW = halfH * aspect;
      this.orthographicCamera.left = -halfW;
      this.orthographicCamera.right = halfW;
      this.orthographicCamera.top = halfH;
      this.orthographicCamera.bottom = -halfH;
      this.orthographicCamera.zoom = 1.0;
      this.orthographicCamera.updateProjectionMatrix();
    }
    
    let pos = new THREE.Vector3();
    switch (preset) {
      case 'plan': // Top-down (strictly vertical along -Y)
        pos.set(center.x, center.y + dist, center.z + 0.001);
        break;
      case 'north': // North elevation (strictly along +Z axis, horizontal at center.y)
        pos.set(center.x, center.y, center.z - dist);
        break;
      case 'south': // South elevation (strictly along -Z axis, horizontal at center.y)
        pos.set(center.x, center.y, center.z + dist);
        break;
      case 'east': // East elevation (strictly along -X axis, horizontal at center.y)
        pos.set(center.x + dist, center.y, center.z);
        break;
      case 'west': // West elevation (strictly along +X axis, horizontal at center.y)
        pos.set(center.x - dist, center.y, center.z);
        break;
      case 'iso':
      default:
        pos.set(center.x - dist * 0.72, center.y + dist * 0.55, center.z + dist * 0.82);
        break;
    }
    this.tweenCamera(pos, center);
  }
  
  // ----------------------------------------------------
  // CAMERA PROJECTION (Perspective <-> Orthographic)
  // ----------------------------------------------------
  toggleCameraProjection() {
    if (this.cameraProjection === 'perspective') {
      this.setCameraProjection('orthographic');
    } else {
      this.setCameraProjection('perspective');
    }
  }

  setCameraProjection(mode) {
    if (mode === this.cameraProjection) return;

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / (height || 1);

    const pos = this.camera.position.clone();
    const quat = this.camera.quaternion.clone();
    const target = this.controls && this.controls.target ? this.controls.target.clone() : this.pivotPoint.clone();
    const dist = Math.max(pos.distanceTo(target), 5.0);

    if (mode === 'orthographic') {
      // Calculate visible frustum height at target plane from perspective FOV
      const fovRad = ((this.perspectiveCamera ? this.perspectiveCamera.fov : 45) * Math.PI) / 180;
      const targetHeight = 2.0 * dist * Math.tan(fovRad / 2.0);
      const targetWidth = targetHeight * aspect;

      this.orthographicCamera.left = -targetWidth / 2.0;
      this.orthographicCamera.right = targetWidth / 2.0;
      this.orthographicCamera.top = targetHeight / 2.0;
      this.orthographicCamera.bottom = -targetHeight / 2.0;
      this.orthographicCamera.near = 0.5;
      this.orthographicCamera.far = this.visibleDistance;
      this.orthographicCamera.zoom = 1.0;

      this.orthographicCamera.position.copy(pos);
      this.orthographicCamera.quaternion.copy(quat);
      this.orthographicCamera.updateProjectionMatrix();

      this.camera = this.orthographicCamera;
      this.cameraProjection = 'orthographic';
      showToast(I18N.t('switchedToOrtho'), 'info');
    } else {
      // From Orthographic to Perspective:
      // Match visible height at target plane to preserve scale without jump
      const orthoH = (this.orthographicCamera.top - this.orthographicCamera.bottom) / (this.orthographicCamera.zoom || 1.0);
      const fovRad = ((this.perspectiveCamera ? this.perspectiveCamera.fov : 45) * Math.PI) / 180;
      const neededDist = Math.max(orthoH / (2.0 * Math.tan(fovRad / 2.0)), 2.0);

      const viewDir = new THREE.Vector3().subVectors(pos, target).normalize();
      if (viewDir.lengthSq() < 0.001) viewDir.set(0, 0, 1);
      const newPos = target.clone().addScaledVector(viewDir, neededDist);

      this.perspectiveCamera.aspect = aspect;
      this.perspectiveCamera.near = 0.5;
      this.perspectiveCamera.far = this.visibleDistance;
      this.perspectiveCamera.position.copy(newPos);
      this.perspectiveCamera.quaternion.copy(quat);
      this.perspectiveCamera.updateProjectionMatrix();

      this.camera = this.perspectiveCamera;
      this.cameraProjection = 'perspective';
      showToast(I18N.t('switchedToPersp'), 'info');
    }

    if (this.controls && this.controls.target) {
      this.controls.target.copy(target);
    }
    if (this.compass3d) {
      this.compass3d.update();
    }

    this.updateCameraProjUI();
    if (!this.isNavigatingViewHistory) {
      this.pushViewSnapshot();
    }
  }

  updateCameraProjUI() {
    const btn = document.getElementById('btn-view-proj') || document.getElementById('btn-view-fit');
    if (!btn) return;
    const isOrtho = this.cameraProjection === 'orthographic';
    
    const svgIcon = isOrtho ? `
      <svg class="proj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2.5 20.5 7.4 20.5 16.6 12 21.5 3.5 16.6 3.5 7.4" />
        <line x1="12" y1="12" x2="12" y2="21.5" />
        <line x1="12" y1="12" x2="3.5" y2="7.4" />
        <line x1="12" y1="12" x2="20.5" y2="7.4" />
      </svg>
    ` : `
      <svg class="proj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 20.5 6 12 9 3.5 6" />
        <polyline points="3.5 6 3.5 14.5 12 22.5 20.5 14.5 20.5 6" />
        <line x1="12" y1="9" x2="12" y2="22.5" />
      </svg>
    `;
    
    const labelText = isOrtho ? I18N.t('camProjOrtho') : I18N.t('camProjPersp');
    const titleText = isOrtho ? I18N.t('camProjOrthoTitle') : I18N.t('camProjPerspTitle');

    btn.title = titleText;
    btn.innerHTML = `${svgIcon}<span class="proj-text" id="btn-view-proj-text">${labelText}</span>`;
    
    if (isOrtho) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  updateViewportCenterNav() {
    const vp = document.getElementById('viewport-container');
    const navCenter = document.getElementById('nav-center-views');
    const topNav = document.getElementById('top-navbar');
    if (!vp || !navCenter || !topNav) return;
    const vpRect = vp.getBoundingClientRect();
    const navRect = topNav.getBoundingClientRect();
    if (vpRect.width > 0) {
      const midX = (vpRect.left - navRect.left) + vpRect.width / 2;
      navCenter.style.left = `${midX}px`;
    }
  }

  // ----------------------------------------------------
  // VIEW HISTORY ENGINE (50-Step Undo / Redo Stack)
  // ----------------------------------------------------
  captureViewSnapshot() {
    if (!this.camera || !this.controls) return null;
    const isOrtho = this.cameraProjection === 'orthographic' || !!this.camera.isOrthographicCamera;
    return {
      projection: isOrtho ? 'orthographic' : 'perspective',
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      orthoParams: isOrtho && this.orthographicCamera ? {
        left: this.orthographicCamera.left,
        right: this.orthographicCamera.right,
        top: this.orthographicCamera.top,
        bottom: this.orthographicCamera.bottom,
        zoom: this.orthographicCamera.zoom
      } : null
    };
  }

  isViewSnapshotEqual(s1, s2) {
    if (!s1 || !s2) return false;
    if (s1.projection !== s2.projection) return false;
    const eps = 0.05;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(s1.position[i] - s2.position[i]) > eps) return false;
      if (Math.abs(s1.target[i] - s2.target[i]) > eps) return false;
    }
    if (s1.projection === 'orthographic' && s1.orthoParams && s2.orthoParams) {
      if (Math.abs(s1.orthoParams.zoom - s2.orthoParams.zoom) > 0.01) return false;
      if (Math.abs(s1.orthoParams.top - s2.orthoParams.top) > eps) return false;
    }
    return true;
  }

  pushViewSnapshot() {
    if (this.isNavigatingViewHistory) return;
    const currentSnap = this.captureViewSnapshot();
    if (!currentSnap) return;

    if (this.viewHistory.length > 0 && this.historyIndex >= 0 && this.historyIndex < this.viewHistory.length) {
      const topSnap = this.viewHistory[this.historyIndex];
      if (this.isViewSnapshotEqual(topSnap, currentSnap)) {
        return;
      }
    }

    // Branching from a past step: discard redo history
    if (this.historyIndex < this.viewHistory.length - 1) {
      this.viewHistory = this.viewHistory.slice(0, this.historyIndex + 1);
    }

    this.viewHistory.push(currentSnap);

    // Limit to maxViewHistory (50 steps)
    if (this.viewHistory.length > this.maxViewHistory) {
      this.viewHistory.shift();
    }
    this.historyIndex = this.viewHistory.length - 1;

    this.updateViewHistoryUI();
  }

  restoreViewSnapshot(snapshot, duration = 350) {
    if (!snapshot) return;
    this.isNavigatingViewHistory = true;

    if (snapshot.projection !== this.cameraProjection) {
      this.setCameraProjection(snapshot.projection);
    }

    const isOrtho = snapshot.projection === 'orthographic';
    let targetZoom = null;
    let startZoom = null;

    if (isOrtho && snapshot.orthoParams && this.orthographicCamera) {
      this.orthographicCamera.left = snapshot.orthoParams.left;
      this.orthographicCamera.right = snapshot.orthoParams.right;
      this.orthographicCamera.top = snapshot.orthoParams.top;
      this.orthographicCamera.bottom = snapshot.orthoParams.bottom;
      startZoom = this.orthographicCamera.zoom;
      targetZoom = snapshot.orthoParams.zoom;
    }

    const targetPos = new THREE.Vector3(...snapshot.position);
    const targetLookAt = new THREE.Vector3(...snapshot.target);

    this.tweenCamera(targetPos, targetLookAt, duration, () => {
      this.isNavigatingViewHistory = false;
      if (isOrtho && targetZoom !== null && this.orthographicCamera) {
        this.orthographicCamera.zoom = targetZoom;
        this.orthographicCamera.updateProjectionMatrix();
      }
    }, startZoom, targetZoom);
  }

  undoView() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    const snapshot = this.viewHistory[this.historyIndex];
    this.restoreViewSnapshot(snapshot);
    this.updateViewHistoryUI();
  }

  redoView() {
    if (this.historyIndex >= this.viewHistory.length - 1) return;
    this.historyIndex++;
    const snapshot = this.viewHistory[this.historyIndex];
    this.restoreViewSnapshot(snapshot);
    this.updateViewHistoryUI();
  }

  updateViewHistoryUI() {
    const btnUndo = document.getElementById('btn-view-undo');
    const btnRedo = document.getElementById('btn-view-redo');
    if (btnUndo) {
      btnUndo.disabled = this.historyIndex <= 0;
      btnUndo.title = I18N.t('viewUndoTitle');
    }
    if (btnRedo) {
      btnRedo.disabled = this.historyIndex >= this.viewHistory.length - 1;
      btnRedo.title = I18N.t('viewRedoTitle');
    }
  }

  initViewHistory() {
    this.viewHistory = [];
    this.historyIndex = -1;
    const snap = this.captureViewSnapshot();
    if (snap) {
      this.viewHistory.push(snap);
      this.historyIndex = 0;
    }
    this.updateViewHistoryUI();
  }
  
  // Build Collapsible Interactive Hierarchy Tree in Left Sidebar
  buildHierarchyTree() {
    const structContainer = document.getElementById('tree-structures');
    const elemContainer = document.getElementById('tree-elements');
    const levelsContainer = document.getElementById('tree-levels');
    
    structContainer.innerHTML = '';
    elemContainer.innerHTML = '';
    levelsContainer.innerHTML = '';
    
    if (!this.activeModel) return;
    
    // Group by structures, categories, and levels
    const structureMap = new Map();
    const categoryMap = new Map();
    const levelMap = new Map();
    
    this.activeModel.traverse(obj => {
      if (this.isModelElementMesh(obj) && obj.userData) {
        const sName = obj.userData.structure || "Model Structure";
        if (!structureMap.has(sName)) structureMap.set(sName, []);
        structureMap.get(sName).push(obj);
        
        const cat = obj.userData.rawCategory || obj.userData.category || "Component";
        if (!categoryMap.has(cat)) categoryMap.set(cat, []);
        categoryMap.get(cat).push(obj);
        
        const lvl = obj.userData.level || "Ground Level";
        if (!levelMap.has(lvl)) levelMap.set(lvl, []);
        levelMap.get(lvl).push(obj);
      }
    });

    // Helper: Create a toggle switch element
    const createToggleSwitch = (initialState = true, onChange) => {
      const toggle = document.createElement('label');
      toggle.className = 'toggle-switch';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = initialState;
      const slider = document.createElement('span');
      slider.className = 'slider-switch';
      toggle.appendChild(chk);
      toggle.appendChild(slider);
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        if (onChange) onChange(chk.checked);
      });
      return { toggle, chk };
    };

    // Helper: Create an element leaf row
    const createElementLeaf = (mesh, onVisibilityChanged) => {
      const leaf = document.createElement('div');
      leaf.className = 'tree-leaf-item';
      leaf._mesh = mesh;
      const isSel = (this.selectedMesh === mesh) || (this.selectedMeshes && this.selectedMeshes.includes(mesh));
      if (isSel) leaf.classList.add('selected');

      const leafMat = mesh.material;
      const leafCol = Array.isArray(leafMat) ? (leafMat[0] && leafMat[0].color) : (leafMat && leafMat.color);
      const colorHex = leafCol ? '#' + leafCol.getHexString() : '#38bdf8';
      const elemName = mesh.userData.element || mesh.name || "Element";

      const left = document.createElement('div');
      left.className = 'tree-leaf-left';
      
      const dot = document.createElement('div');
      dot.className = 'category-dot';
      dot.style.backgroundColor = colorHex;

      const title = document.createElement('span');
      title.className = 'tree-leaf-name';
      title.textContent = elemName;
      title.title = elemName;

      left.appendChild(dot);
      left.appendChild(title);

      const { toggle, chk } = createToggleSwitch(mesh.visible, (checked) => {
        mesh.visible = checked;
        if (onVisibilityChanged) onVisibilityChanged();
      });

      leaf.appendChild(left);
      leaf.appendChild(toggle);

      left.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const current = (this.selectedMeshes && this.selectedMeshes.length > 0) ? 
          [...this.selectedMeshes] : 
          (this.selectedMesh ? [this.selectedMesh] : []);

        if (isCtrl) {
          const idx = current.indexOf(mesh);
          if (idx >= 0) current.splice(idx, 1);
          else current.push(mesh);
          if (current.length === 0) this.clearSelection();
          else if (current.length === 1) this.selectElement(current[0]);
          else this.selectElements(current);
        } else if (isShift) {
          const idx = current.indexOf(mesh);
          if (idx >= 0) {
            current.splice(idx, 1);
            if (current.length === 0) this.clearSelection();
            else if (current.length === 1) this.selectElement(current[0]);
            else this.selectElements(current);
          }
        } else {
          this.selectElement(mesh);
        }
      });

      leaf.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = this.selectedMeshes || (this.selectedMesh ? [this.selectedMesh] : []);
        if (!current.includes(mesh)) {
          this.selectElement(mesh);
        }
        this.showContextMenu(e.clientX, e.clientY);
      });

      leaf.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.zoomToElement(mesh);
      });

      leaf.addEventListener('pointerenter', () => {
        const isSelected = (this.selectedMesh === mesh) || (this.selectedMeshes && this.selectedMeshes.includes(mesh));
        if (mesh && mesh.visible && !isSelected) {
          this.setHoveredElement(mesh);
        }
      });

      leaf.addEventListener('pointerleave', () => {
        if (this.hoveredMesh === mesh) {
          this.clearHoverOverlay();
        }
      });

      return { leaf, chk };
    };

    // 1. Render Structures Tab (Hierarchical Tree)
    structureMap.forEach((meshes, name) => {
      const branch = document.createElement('div');
      branch.className = 'tree-branch';

      const head = document.createElement('div');
      head.className = 'tree-branch-header';

      const left = document.createElement('div');
      left.className = 'structure-left';

      const expander = document.createElement('span');
      expander.className = 'tree-expander';
      expander.innerHTML = '&#9660;';

      const firstMat = meshes[0] && meshes[0].material;
      const colObj = Array.isArray(firstMat) ? (firstMat[0] && firstMat[0].color) : (firstMat && firstMat.color);
      const colorHex = colObj ? '#' + colObj.getHexString() : '#38bdf8';
      const dot = document.createElement('div');
      dot.className = 'category-dot';
      dot.style.backgroundColor = colorHex;

      const title = document.createElement('span');
      title.className = 'structure-name';
      title.textContent = name;
      title.title = name;

      const count = document.createElement('span');
      count.className = 'structure-count';
      count.textContent = `${meshes.length} items`;

      left.appendChild(expander);
      left.appendChild(dot);
      left.appendChild(title);
      left.appendChild(count);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-branch-children';

      const childCheckboxes = [];

      const updateMasterState = () => {
        const anyVisible = meshes.some(m => m.visible);
        masterToggle.chk.checked = anyVisible;
      };

      const masterToggle = createToggleSwitch(true, (checked) => {
        meshes.forEach(m => m.visible = checked);
        childCheckboxes.forEach(chk => chk.checked = checked);
      });

      head.appendChild(left);
      head.appendChild(masterToggle.toggle);

      // Opacity row
      const opRow = document.createElement('div');
      opRow.className = 'opacity-slider-row';
      const opLabel = document.createElement('span');
      opLabel.textContent = I18N.t('propOpacity') || 'Opacity';
      const opSlider = document.createElement('input');
      opSlider.type = 'range';
      opSlider.min = '0.1';
      opSlider.max = '1.0';
      opSlider.step = '0.05';
      opSlider.value = '1.0';
      opSlider.className = 'range-slider';

      opSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        meshes.forEach(m => {
          if (m.material) {
            if (Array.isArray(m.material)) {
              m.material.forEach(mat => {
                mat.transparent = val < 0.99 || Boolean(mat.userData?.originalTransparent);
                mat.opacity = val;
                mat.needsUpdate = true;
              });
            } else {
              m.material.transparent = val < 0.99 || Boolean(m.material.userData?.originalTransparent);
              m.material.opacity = val;
              m.material.needsUpdate = true;
            }
          }
        });
      });

      opRow.appendChild(opLabel);
      opRow.appendChild(opSlider);

      head.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch') || e.target.closest('input')) return;
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        expander.classList.toggle('collapsed', isCollapsed);
      });

      head.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGroupContextMenu(e.clientX, e.clientY, name, meshes);
      });

      // Populate child leaf items
      meshes.forEach(mesh => {
        const { leaf, chk } = createElementLeaf(mesh, updateMasterState);
        childCheckboxes.push(chk);
        childrenContainer.appendChild(leaf);
      });

      branch.appendChild(head);
      branch.appendChild(opRow);
      branch.appendChild(childrenContainer);
      structContainer.appendChild(branch);
    });

    // 2. Render Elements Tab (Categories Hierarchy Tree)
    categoryMap.forEach((meshes, catName) => {
      const branch = document.createElement('div');
      branch.className = 'tree-branch';

      const head = document.createElement('div');
      head.className = 'tree-branch-header';

      const left = document.createElement('div');
      left.className = 'structure-left';

      const expander = document.createElement('span');
      expander.className = 'tree-expander';
      expander.innerHTML = '&#9660;';

      const firstMat = meshes[0] && meshes[0].material;
      const colObj = Array.isArray(firstMat) ? (firstMat[0] && firstMat[0].color) : (firstMat && firstMat.color);
      const colorHex = colObj ? '#' + colObj.getHexString() : '#38bdf8';
      const dot = document.createElement('div');
      dot.className = 'category-dot';
      dot.style.backgroundColor = colorHex;

      const title = document.createElement('span');
      title.className = 'structure-name';
      const localizedName = I18N.getCategoryName(catName);
      title.textContent = localizedName;
      title.title = catName;

      const count = document.createElement('span');
      count.className = 'structure-count';
      count.textContent = `${meshes.length}`;

      left.appendChild(expander);
      left.appendChild(dot);
      left.appendChild(title);
      left.appendChild(count);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-branch-children';

      const childCheckboxes = [];

      const updateCategoryMaster = () => {
        const anyVisible = meshes.some(m => m.visible);
        masterToggle.chk.checked = anyVisible;
        const state = this.categoryStates.get(catName);
        if (state && state.chipEl) {
          state.chipEl.classList.toggle('cat-hidden', !anyVisible);
        }
      };

      const masterToggle = createToggleSwitch(true, (checked) => {
        this.toggleCategory(catName, checked);
        childCheckboxes.forEach(chk => chk.checked = checked);
      });

      const state = this.categoryStates.get(catName);
      if (state) {
        state.checkboxEl = masterToggle.chk;
      }

      head.appendChild(left);
      head.appendChild(masterToggle.toggle);

      head.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch') || e.target.closest('input')) return;
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        expander.classList.toggle('collapsed', isCollapsed);
      });

      head.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGroupContextMenu(e.clientX, e.clientY, localizedName || catName, meshes);
      });

      meshes.forEach(mesh => {
        const { leaf, chk } = createElementLeaf(mesh, updateCategoryMaster);
        childCheckboxes.push(chk);
        childrenContainer.appendChild(leaf);
      });

      branch.appendChild(head);
      branch.appendChild(childrenContainer);
      elemContainer.appendChild(branch);
    });

    // 3. Render Levels Tab (Levels Hierarchy Tree)
    levelMap.forEach((meshes, lvlName) => {
      const branch = document.createElement('div');
      branch.className = 'tree-branch';

      const head = document.createElement('div');
      head.className = 'tree-branch-header';

      const left = document.createElement('div');
      left.className = 'structure-left';

      const expander = document.createElement('span');
      expander.className = 'tree-expander collapsed';
      expander.innerHTML = '&#9660;';

      const title = document.createElement('span');
      title.className = 'structure-name';
      title.textContent = lvlName;

      const count = document.createElement('span');
      count.className = 'structure-count';
      count.textContent = `${meshes.length}`;

      left.appendChild(expander);
      left.appendChild(title);
      left.appendChild(count);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-branch-children collapsed';

      const childCheckboxes = [];

      const updateLevelMaster = () => {
        const anyVisible = meshes.some(m => m.visible);
        masterToggle.chk.checked = anyVisible;
      };

      const masterToggle = createToggleSwitch(true, (checked) => {
        meshes.forEach(m => m.visible = checked);
        childCheckboxes.forEach(chk => chk.checked = checked);
      });

      head.appendChild(left);
      head.appendChild(masterToggle.toggle);

      head.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch') || e.target.closest('input')) return;
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        expander.classList.toggle('collapsed', isCollapsed);
      });

      head.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGroupContextMenu(e.clientX, e.clientY, lvlName, meshes);
      });

      meshes.forEach(mesh => {
        const { leaf, chk } = createElementLeaf(mesh, updateLevelMaster);
        childCheckboxes.push(chk);
        childrenContainer.appendChild(leaf);
      });

      branch.appendChild(head);
      branch.appendChild(childrenContainer);
      levelsContainer.appendChild(branch);
    });
  }

  isModelElementMesh(obj) {
    if (!obj || !obj.isMesh) return false;
    if (obj === this.grid || obj === this.highlightBox) return false;
    if (obj.name === 'EdgeLines' || (obj.userData && obj.userData.isEdgeLine)) return false;
    if (obj.userData && (obj.userData.isGizmo || obj.userData.isStencilHelper || 
        obj.userData.isBoxHelper || obj.userData.isPlaneHelperMesh || 
        obj.userData.isPivotHelper || obj.userData.isHighlightOverlay || 
        obj.userData.isHoverOverlay || obj.userData.isCapHelper ||
        obj.userData.isGhostMesh)) {
      return false;
    }
    let curr = obj.parent;
    while (curr) {
      if (curr.userData && (curr.userData.isStencilGroup || curr.userData.isGizmo || 
          curr.userData.isHighlightOverlay || curr.userData.isHoverOverlay)) {
        return false;
      }
      curr = curr.parent;
    }
    return true;
  }

  isPickableElement(obj) {
    if (!this.isModelElementMesh(obj) || obj.visible === false) return false;
    if (obj === this.grid || obj === this.highlightBox) return false;
    if (obj.name === 'EdgeLines' || (obj.userData && obj.userData.isEdgeLine)) return false;
    
    // Never pick any clipping engine component (plane, box fill, wireframe, gizmos)
    if (this.clippingEngine) {
      if (obj === this.clippingEngine.planeMesh || obj === this.clippingEngine.planeEdges || 
          obj === this.clippingEngine.boxFill || obj === this.clippingEngine.boxWireframe) {
        return false;
      }
    }
    
    // Check ancestor hierarchy for helpers, gizmos, or overlays
    let curr = obj;
    while (curr) {
      if (this.clippingEngine && (curr === this.clippingEngine.planeGroup || curr === this.clippingEngine.boxGroup)) return false;
      if (curr === this.pivotHelper || curr === this.highlightOverlayGroup || curr === this.hoverOverlayGroup) return false;
      if (curr.userData && (curr.userData.isGizmo || curr.userData.isBoxHelper || 
          curr.userData.isPlaneHelperMesh || curr.userData.isPivotHelper || 
          curr.userData.isHighlightOverlay || curr.userData.isHoverOverlay)) {
        return false;
      }
      curr = curr.parent;
    }
    
    // If activeModel exists, ensure the element belongs to activeModel
    if (this.activeModel) {
      let isUnderModel = false;
      let currModel = obj;
      while (currModel) {
        if (currModel === this.activeModel) {
          isUnderModel = true;
          break;
        }
        currModel = currModel.parent;
      }
      if (!isUnderModel) return false;
    }
    
    return true;
  }
  
  // HTML escaping helper
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Format property values (booleans, numbers, etc.)
  formatPropertyValue(val) {
    if (val === true || val === '.T.' || val === 'True') {
      return '<span class="bool-tag bool-true">TRUE</span>';
    }
    if (val === false || val === '.F.' || val === 'False') {
      return '<span class="bool-tag bool-false">FALSE</span>';
    }
    if (val === null || val === undefined || val === '' || val === '$') {
      return '<span style="color:var(--text-muted);font-style:italic">None</span>';
    }
    return this.escapeHtml(String(val));
  }

  // Copy text to clipboard with button feedback
  copyToClipboard(text, btnElement = null, successMsg = null) {
    let origHtml = null;
    let isIconBtn = false;

    if (btnElement) {
      origHtml = btnElement.innerHTML;
      isIconBtn = btnElement.classList.contains('prop-copy-btn') || btnElement.classList.contains('group-copy-btn');
      if (isIconBtn) {
        btnElement.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        btnElement.classList.add('copied');
      } else {
        btnElement.innerHTML = `✓ ${successMsg || I18N.t('propCopied')}`;
        btnElement.style.borderColor = 'var(--accent)';
      }
    }

    const resetFeedback = () => {
      setTimeout(() => {
        if (btnElement) {
          btnElement.innerHTML = origHtml;
          if (isIconBtn) {
            btnElement.classList.remove('copied');
          } else {
            btnElement.style.borderColor = '';
          }
        }
      }, isIconBtn ? 1200 : 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(resetFeedback).catch(() => {
        this.fallbackCopy(text);
        resetFeedback();
      });
    } else {
      this.fallbackCopy(text);
      resetFeedback();
    }
  }

  fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // Setup property copy buttons, group copy buttons, and accordion toggles
  setupInspectorCopyAndAccordion(container) {
    if (!container) return;

    const copySvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    const getCleanVal = (cell) => {
      if (!cell) return '';
      if (cell.dataset && cell.dataset.copyVal) return cell.dataset.copyVal;
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('.prop-copy-btn, .group-copy-btn, .copy-btn, .prop-type-tag').forEach(el => el.remove());
      return clone.innerText.trim();
    };

    // A. Attach hover copy buttons to every td.prop-value
    container.querySelectorAll('.prop-table td.prop-value').forEach(cell => {
      if (cell.querySelector('.prop-copy-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prop-copy-btn';
      btn.title = I18N.t('copyValue') || 'Copy value';
      btn.innerHTML = copySvg;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const val = getCleanVal(cell);
        this.copyToClipboard(val, btn, I18N.t('copiedValue'));
      });
      cell.appendChild(btn);
    });

    // B. Wire accordion toggle and group copy for any group header
    const wireGroup = (header, card, bodyEl, titleEl) => {
      let groupBtn = header.querySelector('.group-copy-btn');
      if (!groupBtn) {
        groupBtn = document.createElement('button');
        groupBtn.type = 'button';
        groupBtn.className = 'group-copy-btn';
        groupBtn.title = I18N.t('copyGroup') || 'Copy all parameters in group';
        groupBtn.innerHTML = copySvg;
        const actions = header.querySelector('.pset-header-actions, .sec-header-actions');
        if (actions) {
          actions.prepend(groupBtn);
        } else {
          header.appendChild(groupBtn);
        }
      }

      groupBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const title = titleEl ? titleEl.innerText.trim() : (card.getAttribute('data-group-name') || 'Parameters');
        const lines = [`[${title}]`];
        if (bodyEl) {
          bodyEl.querySelectorAll('.prop-table tr').forEach(row => {
            if (row.style.display === 'none') return;
            const label = row.querySelector('.prop-label');
            const val = row.querySelector('.prop-value');
            if (label && val) {
              const lText = label.innerText.trim();
              const vText = getCleanVal(val);
              lines.push(`${lText}: ${vText}`);
            }
          });
        }
        this.copyToClipboard(lines.join('\n'), groupBtn, I18N.t('copiedGroup'));
      };

      header.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
        card.classList.toggle('open');
      };
    };

    container.querySelectorAll('.pset-card').forEach(card => {
      const header = card.querySelector('.pset-header');
      const body = card.querySelector('.pset-body');
      const title = header ? header.querySelector('.pset-title') : null;
      if (header) {
        wireGroup(header, card, body, title);
      }
    });

    container.querySelectorAll('.model-info-section').forEach(card => {
      const header = card.querySelector('.model-info-sec-header');
      const body = card.querySelector('.model-info-sec-body');
      const title = header ? header.querySelector('.sec-title') : null;
      if (header) {
        wireGroup(header, card, body, title);
      }
    });
  }

  // Get or calculate geometry statistics for any mesh (IFC or non-IFC)
  getElementGeometryStats(mesh) {
    if (mesh.userData && mesh.userData.geometryStats) {
      return mesh.userData.geometryStats;
    }
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
      box.getCenter(center);
    }
    let triangles = 0;
    let vertices = 0;
    if (mesh.geometry) {
      const pos = mesh.geometry.attributes.position;
      if (pos) {
        vertices = pos.count;
        triangles = mesh.geometry.index ? Math.round(mesh.geometry.index.count / 3) : Math.round(pos.count / 3);
      }
    }
    const area = (2 * (size.x * size.y + size.x * size.z + size.y * size.z)).toFixed(3);
    const vol = (size.x * size.y * size.z).toFixed(4);
    return {
      triangles: triangles,
      vertices: vertices,
      areaM2: area,
      volumeM3: vol,
      boxMin: { x: box.min.x.toFixed(3), y: box.min.y.toFixed(3), z: box.min.z.toFixed(3) },
      boxMax: { x: box.max.x.toFixed(3), y: box.max.y.toFixed(3), z: box.max.z.toFixed(3) },
      center: { x: center.x.toFixed(3), y: center.y.toFixed(3), z: center.z.toFixed(3) },
      lengthM: size.x.toFixed(3),
      widthM: size.z.toFixed(3),
      heightM: size.y.toFixed(3)
    };
  }

  syncTreeSelection() {
    const selectedSet = new Set(this.selectedMeshes || (this.selectedMesh ? [this.selectedMesh] : []));
    document.querySelectorAll('.tree-leaf-item').forEach(leaf => {
      if (leaf._mesh) {
        leaf.classList.toggle('selected', selectedSet.has(leaf._mesh));
      }
    });
  }

  selectElements(meshes) {
    if (!meshes || meshes.length === 0) {
      this.clearSelection();
      return;
    }
    if (meshes.length === 1) {
      this.selectElement(meshes[0]);
      return;
    }

    this.selectedMesh = null;
    this.selectedMeshes = meshes;

    // Set virtual orbit pivot to center of bounding box containing all selected objects
    const groupBounds = this.computeBoundsFromTarget(meshes);
    if (!groupBounds.isEmpty()) {
      groupBounds.getCenter(this.pivotPoint);
      this.showPivotIndicator(this.pivotPoint);
    }

    // Show highlight overlay on all selected elements
    this.clearHoverOverlay();
    this.createHighlightOverlay(meshes);
    if (this.highlightBox) this.highlightBox.visible = false;

    // Sync tree selection
    this.syncTreeSelection();

    // Render multi-selection inspector
    this.renderMultiSelectionInspector(meshes);
  }

  computeIntersectedPsets(meshes) {
    if (!meshes || meshes.length === 0) return [];
    const firstMesh = meshes[0];
    const firstPsets = (firstMesh.userData && firstMesh.userData.psets) || [];
    if (firstPsets.length === 0) return [];

    const resultPsets = [];

    firstPsets.forEach(firstPset => {
      const psetName = firstPset.name;
      const allHavePset = meshes.every(m => {
        const ps = (m.userData && m.userData.psets) || [];
        return ps.some(p => p.name === psetName);
      });
      if (!allHavePset) return;

      const commonProps = [];
      const firstProps = firstPset.properties || [];

      firstProps.forEach(firstProp => {
        const propName = firstProp.name;
        let allHaveProp = true;
        let isMultiple = false;
        const refVal = firstProp.value;

        for (let i = 0; i < meshes.length; i++) {
          const m = meshes[i];
          const ps = (m.userData && m.userData.psets) || [];
          const targetPset = ps.find(p => p.name === psetName);
          if (!targetPset || !targetPset.properties) {
            allHaveProp = false;
            break;
          }
          const targetProp = targetPset.properties.find(p => p.name === propName);
          if (!targetProp) {
            allHaveProp = false;
            break;
          }
          if (targetProp.value !== refVal) {
            isMultiple = true;
          }
        }

        if (allHaveProp) {
          commonProps.push({
            name: propName,
            value: isMultiple ? I18N.t('propMultipleValues') : refVal,
            isMultiple: isMultiple,
            type: firstProp.type
          });
        }
      });

      if (commonProps.length > 0) {
        resultPsets.push({
          name: psetName,
          properties: commonProps
        });
      }
    });

    return resultPsets;
  }

  renderMultiSelectionInspector(meshes) {
    const content = document.getElementById('inspector-content');
    if (!content) return;

    // Breakdown tags
    const catCountMap = new Map();
    meshes.forEach(m => {
      const cat = (m.userData && (m.userData.rawCategory || m.userData.category || m.userData.structure)) || m.name || "Element";
      catCountMap.set(cat, (catCountMap.get(cat) || 0) + 1);
    });
    const pillsHtml = Array.from(catCountMap.entries()).map(([cat, count]) => `
      <span class="category-breakdown-pill">
        <span>${this.escapeHtml(cat)}</span>
        <span class="pill-count">${count}</span>
      </span>
    `).join('');

    const intersectedPsets = this.computeIntersectedPsets(meshes);

    const tabDefs = [
      { key: 'overview', label: I18N.t('tabOverview'), icon: 'ℹ️' },
      { key: 'psets', label: I18N.t('tabPsets'), icon: '📋', badge: (intersectedPsets.length > 0 ? intersectedPsets.length : null) }
    ];

    if (this.activeInspectorTab !== 'overview' && this.activeInspectorTab !== 'psets') {
      this.activeInspectorTab = 'overview';
    }

    content.innerHTML = `
      <div class="element-highlight-card">
        <div class="element-title-row">
          <div class="category-dot" style="background:var(--accent)"></div>
          <div class="element-title">${I18N.t('multiSelectTitle').replace('{count}', meshes.length)}</div>
        </div>
        <div class="category-breakdown-tags">
          ${pillsHtml}
        </div>
        <div class="element-opacity-control">
          <div class="element-opacity-header">
            <span class="element-opacity-label">${I18N.t('batchOpacity')}</span>
            <span class="element-opacity-val" id="elem-opacity-val">100%</span>
          </div>
          <input type="range" min="10" max="100" step="1" value="100" class="range-slider element-opacity-slider" id="elem-opacity-slider">
        </div>
        <div class="action-row">
          <button class="action-btn" id="btn-zoom-elem">${I18N.t('zoomTo')}</button>
          <button class="action-btn" id="btn-isolate-elem">${I18N.t('isolate')}</button>
          <button class="action-btn" id="btn-hide-elem">${I18N.t('hide')}</button>
          <button class="action-btn" id="btn-clear-elem">${I18N.t('clearSel')}</button>
        </div>
      </div>

      <div class="inspector-tabs-container" id="inspector-tabs-container">
        <div class="tabs-edge-shadow shadow-left" id="tabs-shadow-left"></div>
        <button type="button" class="tabs-chevron-btn chevron-left" id="tabs-chevron-left" title="Scroll left">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2L4 8L11 14Z" />
          </svg>
        </button>

        <div class="inspector-tabs-nav" id="inspector-tabs-nav">
          ${tabDefs.map(t => `
            <button type="button" class="inspector-tab-btn ${t.key === this.activeInspectorTab ? 'active' : ''}" data-tab="${t.key}">
              <span>${t.icon}</span>
              <span>${t.label}</span>
              ${(t.badge !== null && t.badge !== undefined) ? `<span class="inspector-tab-badge">${t.badge}</span>` : ''}
            </button>
          `).join('')}
        </div>

        <div class="tabs-edge-shadow shadow-right" id="tabs-shadow-right"></div>
        <button type="button" class="tabs-chevron-btn chevron-right" id="tabs-chevron-right" title="Scroll right">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 2L12 8L5 14Z" />
          </svg>
        </button>
      </div>

      <div id="inspector-tab-content" class="inspector-tab-pane"></div>
    `;

    // Wire actions
    const elemOpSlider = content.querySelector('#elem-opacity-slider');
    const elemOpVal = content.querySelector('#elem-opacity-val');
    if (elemOpSlider && elemOpVal) {
      elemOpSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        elemOpVal.textContent = `${val}%`;
        this.setElementOpacity(meshes, val);
      });
    }

    document.getElementById('btn-zoom-elem').onclick = () => this.zoomToGroup(meshes);
    document.getElementById('btn-isolate-elem').onclick = () => this.isolateGroup(meshes);
    document.getElementById('btn-hide-elem').onclick = () => {
      this.hideGroup(meshes);
      this.clearSelection();
    };
    document.getElementById('btn-clear-elem').onclick = () => this.clearSelection();

    // Wire tabs
    const tabNav = document.getElementById('inspector-tabs-nav');
    tabNav.querySelectorAll('.inspector-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-tab');
        this.activeInspectorTab = key;
        tabNav.querySelectorAll('.inspector-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderMultiSelectTabPane(key, meshes, intersectedPsets);
      });
    });

    this.renderMultiSelectTabPane(this.activeInspectorTab, meshes, intersectedPsets);
    this.setupInspectorTabsScroll();

    // Ensure right sidebar is visible
    const rsb = document.getElementById('right-sidebar');
    if (rsb) {
      rsb.classList.remove('hidden');
      if (rsb.classList.contains('collapsed')) {
        this.autoCollapsedRight = false;
        if (this.toggleInspectorCollapse) {
          this.toggleInspectorCollapse(true);
        }
      }
    }
  }

  renderMultiSelectTabPane(tabKey, meshes, intersectedPsets) {
    const tabPane = document.getElementById('inspector-tab-content');
    if (!tabPane) return;

    if (tabKey === 'overview') {
      const getCommonAttr = (getter) => {
        const first = getter(meshes[0]);
        const same = meshes.every(m => getter(m) === first);
        return same ? first : I18N.t('propMultipleValues');
      };

      const ifcClass = getCommonAttr(m => (m.userData && (m.userData.rawType || m.userData.type)) || 'IFCELEMENT');
      const discipline = getCommonAttr(m => (m.userData && (m.userData.rawCategory || m.userData.category)) || 'Structure');
      const structure = getCommonAttr(m => (m.userData && m.userData.structure) || 'N/A');
      const level = getCommonAttr(m => (m.userData && m.userData.level) || 'N/A');

      const bounds = this.computeBoundsFromTarget(meshes);
      const size = new THREE.Vector3();
      bounds.getSize(size);
      const boundsStr = `${size.x.toFixed(2)}m × ${size.y.toFixed(2)}m × ${size.z.toFixed(2)}m`;

      tabPane.innerHTML = `
        <div class="pset-card open" style="margin-bottom:8px">
          <div class="pset-header">
            <div class="pset-title-group">
              <span class="pset-arrow">&#9654;</span>
              <span class="pset-title">${I18N.t('propOverviewGroup')}</span>
            </div>
            <div class="pset-header-actions">
              <span class="pset-count-badge">6</span>
            </div>
          </div>
          <div class="pset-body">
            <table class="prop-table">
              <tr>
                <td class="prop-label">${I18N.t('propTotalElements')}</td>
                <td class="prop-value"><strong>${meshes.length}</strong></td>
              </tr>
              <tr>
                <td class="prop-label">${I18N.t('propIfcClass')}</td>
                <td class="prop-value">
                  ${ifcClass === I18N.t('propMultipleValues') ? 
                    `<span class="prop-multiple-val">${ifcClass}</span>` : 
                    `<span class="ifc-class-badge">${this.escapeHtml(ifcClass)}</span>`}
                </td>
              </tr>
              <tr>
                <td class="prop-label">${I18N.t('propDiscipline')}</td>
                <td class="prop-value">
                  ${discipline === I18N.t('propMultipleValues') ? 
                    `<span class="prop-multiple-val">${discipline}</span>` : 
                    this.escapeHtml(discipline)}
                </td>
              </tr>
              <tr>
                <td class="prop-label">${I18N.t('propStructure')}</td>
                <td class="prop-value">
                  ${structure === I18N.t('propMultipleValues') ? 
                    `<span class="prop-multiple-val">${structure}</span>` : 
                    this.escapeHtml(structure)}
                </td>
              </tr>
              <tr>
                <td class="prop-label">${I18N.t('propLevel')}</td>
                <td class="prop-value">
                  ${level === I18N.t('propMultipleValues') ? 
                    `<span class="prop-multiple-val">${this.escapeHtml(level)}</span>` : 
                    this.escapeHtml(level)}
                </td>
              </tr>
              <tr>
                <td class="prop-label">${I18N.t('propCombinedBounds')}</td>
                <td class="prop-value" style="font-family:var(--font-mono);font-size:11px">${boundsStr}</td>
              </tr>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'psets') {
      if (!intersectedPsets || intersectedPsets.length === 0) {
        tabPane.innerHTML = `<div class="inspector-empty-card">${I18N.t('noCommonPsets')}</div>`;
        return;
      }

      tabPane.innerHTML = `
        <div class="pset-search-box">
          <input type="text" class="pset-search-input" id="pset-search-input" placeholder="${I18N.t('propFilterPsets')}">
          <button type="button" class="pset-clear-btn" id="pset-clear-btn">&times;</button>
        </div>

        <div class="pset-cards-list" id="pset-cards-list">
          ${intersectedPsets.map((pset, psetIdx) => `
            <div class="pset-card ${psetIdx < 2 ? 'open' : ''}" data-pset-name="${this.escapeHtml((pset.name || '').toLowerCase())}">
              <div class="pset-header">
                <div class="pset-title-group">
                  <span class="pset-arrow">&#9654;</span>
                  <span class="pset-title" title="${this.escapeHtml(pset.name)}">${this.escapeHtml(pset.name)}</span>
                </div>
                <div class="pset-header-actions">
                  <span class="pset-count-badge">${pset.properties ? pset.properties.length : 0}</span>
                </div>
              </div>
              <div class="pset-body">
                <table class="prop-table">
                  ${(pset.properties || []).map(p => `
                    <tr class="pset-prop-row" data-search="${this.escapeHtml(((p.name || '') + ' ' + (p.value !== null && p.value !== undefined ? p.value : '')).toLowerCase())}">
                      <td class="prop-label" style="width:45%">${this.escapeHtml(p.name)}</td>
                      <td class="prop-value">
                        ${p.isMultiple ? 
                          `<span class="prop-multiple-val">${I18N.t('propMultipleValues')}</span>` : 
                          this.formatPropertyValue(p.value)}
                        ${p.type ? `<span class="prop-type-tag">${this.escapeHtml(p.type)}</span>` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </table>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Accordion toggles
      tabPane.querySelectorAll('.pset-header').forEach(header => {
        header.addEventListener('click', (e) => {
          if (e.target.closest('.group-copy-btn')) return;
          const card = header.closest('.pset-card');
          if (card) card.classList.toggle('open');
        });
      });

      // Filter
      const searchInput = tabPane.querySelector('#pset-search-input');
      const clearBtn = tabPane.querySelector('#pset-clear-btn');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
          tabPane.querySelectorAll('.pset-card').forEach(card => {
            const psetName = card.getAttribute('data-pset-name') || '';
            let hasMatch = psetName.includes(q);
            card.querySelectorAll('.pset-prop-row').forEach(row => {
              const text = row.getAttribute('data-search') || '';
              if (!q || text.includes(q)) {
                row.style.display = '';
                hasMatch = true;
              } else {
                row.style.display = 'none';
              }
            });
            if (!q) {
              card.style.display = '';
            } else if (hasMatch) {
              card.style.display = '';
              card.classList.add('open');
            } else {
              card.style.display = 'none';
            }
          });
        });
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
          });
        }
      }
    }
  }

  // Element Selection & Inspector
  selectElement(mesh, clickPoint = null) {
    if (!mesh || !this.isPickableElement(mesh)) {
      this.clearSelection();
      return;
    }
    this.selectedMesh = mesh;
    this.selectedMeshes = [mesh];
    this.syncTreeSelection();
    if (clickPoint) {
      this.lastClickPoint = clickPoint.clone();
    }
    
    // Set virtual orbit pivot to the selected object without changing screen center or camera direction
    if (clickPoint) {
      this.pivotPoint.copy(clickPoint);
    } else {
      const box = new THREE.Box3().setFromObject(mesh);
      box.getCenter(this.pivotPoint);
    }
    this.showPivotIndicator(this.pivotPoint);

    // Show highlight overlay on selected element (no bounding box)
    this.clearHoverOverlay();
    this.createHighlightOverlay(mesh);
    if (this.highlightBox) this.highlightBox.visible = false;
    
    // Trigger Compare Engine ghost mesh
    if (this.compareEngine) {
      this.compareEngine.onElementSelected(mesh);
    }
    
    // Update Inspector
    const meta = mesh.userData || {};
    const content = document.getElementById('inspector-content');
    const selMat = mesh.material;
    const selCol = Array.isArray(selMat) ? (selMat[0] && selMat[0].color) : (selMat && selMat.color);
    const colorHex = selCol ? '#' + selCol.getHexString() : '#38bdf8';
    
    // Tab definitions
    const tabDefs = [
      { key: 'overview', label: I18N.t('tabOverview'), icon: 'ℹ️' },
      { key: 'psets', label: I18N.t('tabPsets'), icon: '📋', badge: (meta.psets && meta.psets.length) || null },
      { key: 'type', label: I18N.t('tabType'), icon: '🏷️', badge: meta.typeInfo ? '✓' : null },
      { key: 'material', label: I18N.t('tabMaterial'), icon: '🎨', badge: (meta.materials && meta.materials.layers && meta.materials.layers.length) || null },
      { key: 'geometry', label: I18N.t('tabGeometry'), icon: '📐', badge: (meta.qsets && meta.qsets.length) || null },
      { key: 'raw', label: I18N.t('tabRaw'), icon: '⚡' }
    ];

    if (this.compareEngine && this.compareEngine.isActive && meta.compareStatus === 'modified') {
      tabDefs.unshift({
        key: 'diff',
        label: I18N.t('compareInspectorDiffTitle'),
        icon: '⚡',
        badge: (meta.compareDiffList && meta.compareDiffList.length) ? meta.compareDiffList.length : '!'
      });
      this.activeInspectorTab = 'diff';
    } else if (!tabDefs.some(t => t.key === this.activeInspectorTab)) {
      this.activeInspectorTab = 'overview';
    }

    let elemOpacityVal = 100;
    if (mesh) {
      const targetMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (targetMat) {
        if (targetMat.userData && targetMat.userData.elemOrigOpacity !== undefined) {
          elemOpacityVal = Math.round((targetMat.opacity / targetMat.userData.elemOrigOpacity) * 100);
        } else if (targetMat.opacity !== undefined) {
          elemOpacityVal = Math.round(targetMat.opacity * 100);
        }
        elemOpacityVal = Math.max(10, Math.min(100, elemOpacityVal));
      }
    }

    const titleName = meta.element || meta.name || mesh.name || 'Unnamed Element';
    let compareStatusBadge = '';
    if (meta.compareStatus === 'added') {
      compareStatusBadge = `<span class="compare-role-tag tag-new" style="margin-left:6px;font-size:9.5px;padding:2px 5px">+${I18N.t('compareMetricAdded')}</span>`;
    } else if (meta.compareStatus === 'deleted') {
      compareStatusBadge = `<span class="compare-role-tag tag-old" style="margin-left:6px;font-size:9.5px;padding:2px 5px">-${I18N.t('compareMetricDeleted')}</span>`;
    } else if (meta.compareStatus === 'modified') {
      compareStatusBadge = `<span class="compare-role-tag" style="background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);margin-left:6px;font-size:9.5px;padding:2px 5px">~${I18N.t('compareMetricModified')}</span>`;
    }

    content.innerHTML = `
      <div class="element-highlight-card">
        <div class="element-title-row">
          <div class="category-dot" style="background:${colorHex}"></div>
          <div class="element-title" title="${this.escapeHtml(titleName)}">${this.escapeHtml(titleName)}</div>
          ${compareStatusBadge}
        </div>
        <div class="element-opacity-control">
          <div class="element-opacity-header">
            <span class="element-opacity-label" data-i18n="elemOpacity">${I18N.t('elemOpacity')}</span>
            <span class="element-opacity-val" id="elem-opacity-val">${elemOpacityVal}%</span>
          </div>
          <input type="range" min="10" max="100" step="1" value="${elemOpacityVal}" class="range-slider element-opacity-slider" id="elem-opacity-slider">
        </div>
        <div class="action-row">
          <button class="action-btn" id="btn-zoom-elem">${I18N.t('zoomTo')}</button>
          <button class="action-btn" id="btn-isolate-elem">${I18N.t('isolate')}</button>
          <button class="action-btn" id="btn-hide-elem">${I18N.t('hide')}</button>
          <button class="action-btn" id="btn-clear-elem">${I18N.t('clearSel')}</button>
        </div>
      </div>

      <div class="inspector-tabs-container" id="inspector-tabs-container">
        <!-- Edge Gradient Shadows -->
        <div class="tabs-edge-shadow shadow-left" id="tabs-shadow-left"></div>
        <button type="button" class="tabs-chevron-btn chevron-left" id="tabs-chevron-left" title="Scroll left">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2L4 8L11 14Z" />
          </svg>
        </button>

        <div class="inspector-tabs-nav" id="inspector-tabs-nav">
          ${tabDefs.map(t => `
            <button type="button" class="inspector-tab-btn ${t.key === this.activeInspectorTab ? 'active' : ''}" data-tab="${t.key}">
              <span>${t.icon}</span>
              <span>${t.label}</span>
              ${(t.badge !== null && t.badge !== undefined) ? `<span class="inspector-tab-badge">${t.badge}</span>` : ''}
            </button>
          `).join('')}
        </div>

        <div class="tabs-edge-shadow shadow-right" id="tabs-shadow-right"></div>
        <button type="button" class="tabs-chevron-btn chevron-right" id="tabs-chevron-right" title="Scroll right">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 2L12 8L5 14Z" />
          </svg>
        </button>
      </div>

      <div id="inspector-tab-content" class="inspector-tab-pane"></div>
    `;

    content.scrollTop = 0;

    // Wire actions
    const elemOpSlider = content.querySelector('#elem-opacity-slider');
    const elemOpVal = content.querySelector('#elem-opacity-val');
    if (elemOpSlider && elemOpVal) {
      elemOpSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        elemOpVal.textContent = `${val}%`;
        this.setElementOpacity(mesh, val);
      });
    }

    document.getElementById('btn-zoom-elem').onclick = () => this.zoomToElement(mesh);
    document.getElementById('btn-isolate-elem').onclick = () => this.isolateElement(mesh);
    document.getElementById('btn-hide-elem').onclick = () => {
      mesh.visible = false;
      this.clearSelection();
    };
    document.getElementById('btn-clear-elem').onclick = () => this.clearSelection();

    // Wire tab navigation buttons
    const tabNav = document.getElementById('inspector-tabs-nav');
    tabNav.querySelectorAll('.inspector-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-tab');
        this.activeInspectorTab = key;
        tabNav.querySelectorAll('.inspector-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        content.scrollTop = 0;
        this.renderInspectorTabContent(key, mesh, clickPoint || this.lastClickPoint);
        this.scrollActiveInspectorTabIntoView();
      });
    });

    // Render active tab content
    this.renderInspectorTabContent(this.activeInspectorTab, mesh, clickPoint || this.lastClickPoint);
    this.setupInspectorTabsScroll();
    this.scrollActiveInspectorTabIntoView();

    // Ensure Right Sidebar is visible and expanded
    const rsb = document.getElementById('right-sidebar');
    if (rsb) {
      rsb.classList.remove('hidden');
      if (rsb.classList.contains('collapsed')) {
        this.autoCollapsedRight = false;
        if (this.toggleInspectorCollapse) {
          this.toggleInspectorCollapse(true);
        } else {
          const btnCollapse = document.getElementById('btn-inspector-collapse');
          if (btnCollapse) btnCollapse.click();
        }
      } else {
        rsb.style.width = `${this.customInspectorWidth || 330}px`;
      }
    }
    const btnInspect = document.getElementById('btn-tool-inspect');
    if (btnInspect) btnInspect.classList.add('active');
  }

  setElementOpacity(mesh, opacityPercent) {
    if (!mesh) return;
    const meshes = Array.isArray(mesh) ? mesh : [mesh];
    const alpha = opacityPercent / 100;
    meshes.forEach((m) => {
      if (!m) return;
      m.traverse((obj) => {
        if (obj.isMesh && obj.material && (!obj.userData || (!obj.userData.isGizmo && !obj.userData.isHighlightOverlay && !obj.userData.isHoverOverlay && !obj.userData.isPivotHelper))) {
          const updateMat = (mat) => {
            if (!mat) return;
            if (!mat.userData) mat.userData = {};
            if (mat.userData.elemOrigOpacity === undefined) {
              mat.userData.elemOrigOpacity = mat.opacity !== undefined ? mat.opacity : 1.0;
              mat.userData.elemOrigTransparent = Boolean(mat.transparent);
              mat.userData.elemOrigDepthWrite = mat.depthWrite !== undefined ? mat.depthWrite : true;
            }
            if (opacityPercent >= 100) {
              mat.opacity = mat.userData.elemOrigOpacity;
              mat.transparent = mat.userData.elemOrigTransparent;
              mat.depthWrite = mat.userData.elemOrigDepthWrite;
            } else {
              mat.transparent = true;
              mat.opacity = alpha * mat.userData.elemOrigOpacity;
              mat.depthWrite = (mat.opacity >= 0.95);
            }
            mat.needsUpdate = true;
          };
          if (Array.isArray(obj.material)) {
            obj.material.forEach(updateMat);
          } else {
            updateMat(obj.material);
          }
        }
      });
    });
    if (this.highlightOverlayGroup) {
      const baseHighlightOp = this.highlightOpacity || 0.65;
      const targetOverlayOp = (opacityPercent / 100) * baseHighlightOp;
      this.highlightOverlayGroup.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const updateOp = (m) => {
            if (!m) return;
            const isTrans = m.userData && m.userData.isTransElement;
            m.opacity = isTrans ? Math.min(0.25, targetOverlayOp * 0.4) : targetOverlayOp;
            m.needsUpdate = true;
          };
          if (Array.isArray(obj.material)) {
            obj.material.forEach(updateOp);
          } else {
            updateOp(obj.material);
          }
        }
      });
    }
    this.needsRender = true;
  }

  // Update inner shadows and chevrons visibility based on current Left Sidebar scroll position
  updateSidebarTabsOverflow() {
    const container = document.getElementById('sidebar-tabs-container');
    const nav = document.getElementById('sidebar-tabs-nav');
    if (!container || !nav) return;
    const sl = nav.scrollLeft;
    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
    const hasLeft = sl > 3;
    const hasRight = sl < maxScroll - 3;
    container.classList.toggle('has-overflow-left', hasLeft);
    container.classList.toggle('has-overflow-right', hasRight);
  }

  // Scroll active Left Sidebar tab into view (smooth)
  scrollActiveSidebarTabIntoView() {
    const nav = document.getElementById('sidebar-tabs-nav');
    if (!nav) return;
    const activeBtn = nav.querySelector('.tab-btn.active');
    if (!activeBtn) return;
    const CLEARANCE = 42;
    const bRect = activeBtn.getBoundingClientRect();
    const nRect = nav.getBoundingClientRect();
    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
    if (bRect.left < nRect.left + CLEARANCE) {
      const desired = (bRect.left - nRect.left) + nav.scrollLeft - CLEARANCE;
      nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, desired)), behavior: 'smooth' });
    } else if (bRect.right > nRect.right - CLEARANCE) {
      const desired = (bRect.right - nRect.left) + nav.scrollLeft - nav.clientWidth + CLEARANCE;
      nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, desired)), behavior: 'smooth' });
    }
    setTimeout(() => this.updateSidebarTabsOverflow(), 350);
  }

  // Setup direct wheel scrolling, inner shadows, and chevrons for Left Sidebar tabs
  setupSidebarTabsScroll() {
    const container = document.getElementById('sidebar-tabs-container');
    const nav = document.getElementById('sidebar-tabs-nav');
    const chevronLeft = document.getElementById('sidebar-tabs-chevron-left');
    const chevronRight = document.getElementById('sidebar-tabs-chevron-right');
    if (!container || !nav) return;

    // 1. Wheel directly scrolls horizontally without resetting position
    container.onwheel = (e) => {
      if (nav.scrollWidth > nav.clientWidth) {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) > 0) {
          e.preventDefault();
          const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
          nav.scrollLeft = Math.max(0, Math.min(maxScroll, nav.scrollLeft + delta * 0.8));
          this.updateSidebarTabsOverflow();
        }
      }
    };

    // 2. Scroll event
    nav.onscroll = () => this.updateSidebarTabsOverflow();

    // 3. ResizeObserver
    if (window.ResizeObserver) {
      if (!this._sidebarTabsResizeObserver) {
        this._sidebarTabsResizeObserver = new ResizeObserver(() => this.updateSidebarTabsOverflow());
      }
      this._sidebarTabsResizeObserver.observe(nav);
    }

    // 4. Chevron clicks: scroll to reveal next full tab beyond chevron button
    const CLEARANCE = 42;
    const scrollToNextTab = (direction) => {
      const buttons = Array.from(nav.querySelectorAll('.tab-btn'));
      if (buttons.length === 0) return;
      const navRect = nav.getBoundingClientRect();
      const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);

      if (direction === 'right') {
        const target = buttons.find(b => {
          const bRect = b.getBoundingClientRect();
          return bRect.right > (navRect.right - CLEARANCE + 2);
        });
        if (target) {
          const bRect = target.getBoundingClientRect();
          const targetScrollRight = (bRect.right - navRect.left) + nav.scrollLeft;
          const targetScrollLeft = targetScrollRight - nav.clientWidth + CLEARANCE;
          nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, targetScrollLeft)), behavior: 'smooth' });
        } else {
          nav.scrollBy({ left: 120, behavior: 'smooth' });
        }
      } else {
        const target = buttons.slice().reverse().find(b => {
          const bRect = b.getBoundingClientRect();
          return bRect.left < (navRect.left + CLEARANCE - 2);
        });
        if (target) {
          const bRect = target.getBoundingClientRect();
          const targetScrollLeft = (bRect.left - navRect.left) + nav.scrollLeft - CLEARANCE;
          nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, targetScrollLeft)), behavior: 'smooth' });
        } else {
          nav.scrollBy({ left: -120, behavior: 'smooth' });
        }
      }
      setTimeout(() => this.updateSidebarTabsOverflow(), 350);
    };

    if (chevronLeft) chevronLeft.onclick = () => scrollToNextTab('left');
    if (chevronRight) chevronRight.onclick = () => scrollToNextTab('right');

    this.updateSidebarTabsOverflow();
  }

  // Update inner shadows and chevrons visibility based on current Inspector scroll position
  updateInspectorTabsOverflow() {
    const container = document.getElementById('inspector-tabs-container');
    const nav = document.getElementById('inspector-tabs-nav');
    if (!container || !nav) return;
    const sl = nav.scrollLeft;
    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
    const hasLeft = sl > 3;
    const hasRight = sl < maxScroll - 3;
    container.classList.toggle('has-overflow-left', hasLeft);
    container.classList.toggle('has-overflow-right', hasRight);
  }

  // Scroll active Inspector tab into view (smooth)
  scrollActiveInspectorTabIntoView() {
    const nav = document.getElementById('inspector-tabs-nav');
    if (!nav) return;
    const activeBtn = nav.querySelector('.inspector-tab-btn.active');
    if (!activeBtn) return;
    const CLEARANCE = 42;
    const bRect = activeBtn.getBoundingClientRect();
    const nRect = nav.getBoundingClientRect();
    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
    if (bRect.left < nRect.left + CLEARANCE) {
      const desired = (bRect.left - nRect.left) + nav.scrollLeft - CLEARANCE;
      nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, desired)), behavior: 'smooth' });
    } else if (bRect.right > nRect.right - CLEARANCE) {
      const desired = (bRect.right - nRect.left) + nav.scrollLeft - nav.clientWidth + CLEARANCE;
      nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, desired)), behavior: 'smooth' });
    }
    setTimeout(() => this.updateInspectorTabsOverflow(), 350);
  }

  // Setup direct wheel scrolling, inner shadows, and chevrons for Inspector tabs
  setupInspectorTabsScroll() {
    const container = document.getElementById('inspector-tabs-container');
    const nav = document.getElementById('inspector-tabs-nav');
    const chevronLeft = document.getElementById('tabs-chevron-left');
    const chevronRight = document.getElementById('tabs-chevron-right');
    if (!container || !nav) return;

    // 1. Wheel directly scrolls horizontally without resetting position
    container.onwheel = (e) => {
      if (nav.scrollWidth > nav.clientWidth) {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) > 0) {
          e.preventDefault();
          const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
          nav.scrollLeft = Math.max(0, Math.min(maxScroll, nav.scrollLeft + delta * 0.8));
          this.updateInspectorTabsOverflow();
        }
      }
    };

    // 2. Scroll event
    nav.onscroll = () => this.updateInspectorTabsOverflow();

    // 3. ResizeObserver
    if (window.ResizeObserver) {
      if (!this._tabsResizeObserver) {
        this._tabsResizeObserver = new ResizeObserver(() => this.updateInspectorTabsOverflow());
      }
      this._tabsResizeObserver.observe(nav);
    }

    // 4. Chevron clicks: scroll to reveal next full tab beyond chevron button
    const CLEARANCE = 42;
    const scrollToNextTab = (direction) => {
      const buttons = Array.from(nav.querySelectorAll('.inspector-tab-btn'));
      if (buttons.length === 0) return;
      const navRect = nav.getBoundingClientRect();
      const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);

      if (direction === 'right') {
        const target = buttons.find(b => {
          const bRect = b.getBoundingClientRect();
          return bRect.right > (navRect.right - CLEARANCE + 2);
        });
        if (target) {
          const bRect = target.getBoundingClientRect();
          const targetScrollRight = (bRect.right - navRect.left) + nav.scrollLeft;
          const targetScrollLeft = targetScrollRight - nav.clientWidth + CLEARANCE;
          nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, targetScrollLeft)), behavior: 'smooth' });
        } else {
          nav.scrollBy({ left: 120, behavior: 'smooth' });
        }
      } else {
        const target = buttons.slice().reverse().find(b => {
          const bRect = b.getBoundingClientRect();
          return bRect.left < (navRect.left + CLEARANCE - 2);
        });
        if (target) {
          const bRect = target.getBoundingClientRect();
          const targetScrollLeft = (bRect.left - navRect.left) + nav.scrollLeft - CLEARANCE;
          nav.scrollTo({ left: Math.max(0, Math.min(maxScroll, targetScrollLeft)), behavior: 'smooth' });
        } else {
          nav.scrollBy({ left: -120, behavior: 'smooth' });
        }
      }
      setTimeout(() => this.updateInspectorTabsOverflow(), 350);
    };

    if (chevronLeft) chevronLeft.onclick = () => scrollToNextTab('left');
    if (chevronRight) chevronRight.onclick = () => scrollToNextTab('right');

    this.updateInspectorTabsOverflow();
  }

  // Update inner shadow visibility when bottom Elements chips overflow into the right status HUD
  updateBottomBarOverflow() {
    const bar = document.getElementById('bottom-bar');
    const legend = document.querySelector('.legend-container');
    if (!bar || !legend) return;

    const maxScroll = Math.max(0, legend.scrollWidth - legend.clientWidth);
    // Has overflow when total width exceeds visible width and not scrolled fully to the right
    const hasRight = maxScroll > 4 && legend.scrollLeft < maxScroll - 4;

    bar.classList.toggle('has-overflow-elements', hasRight);
  }

  // Setup direct wheel scrolling, native scroll listener, and resize observer for bottom Elements chips
  setupBottomBarScroll() {
    const legend = document.querySelector('.legend-container');
    if (!legend) return;

    // 1. Wheel directly scrolls horizontally without resetting position
    legend.addEventListener('wheel', (e) => {
      if (legend.scrollWidth > legend.clientWidth) {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) > 0) {
          e.preventDefault();
          const maxScroll = Math.max(0, legend.scrollWidth - legend.clientWidth);
          legend.scrollLeft = Math.max(0, Math.min(maxScroll, legend.scrollLeft + delta * 0.8));
          this.updateBottomBarOverflow();
        }
      }
    }, { passive: false });

    // 2. Scroll event (trackpad / touch / programmatic)
    legend.addEventListener('scroll', () => {
      this.updateBottomBarOverflow();
    }, { passive: true });

    // 3. ResizeObserver
    if (window.ResizeObserver) {
      if (!this._bottomBarResizeObserver) {
        this._bottomBarResizeObserver = new ResizeObserver(() => this.updateBottomBarOverflow());
      }
      this._bottomBarResizeObserver.observe(legend);
    }

    this.updateBottomBarOverflow();
  }

  // Render individual Inspector Tab Pane
  renderInspectorTabContent(tabKey, mesh, clickPoint = null) {
    const tabPane = document.getElementById('inspector-tab-content');
    if (!tabPane || !mesh) return;

    const meta = mesh.userData || {};
    const geom = this.getElementGeometryStats(mesh);
    const northing = clickPoint ? Math.abs(clickPoint.z) : Math.abs(mesh.position.z);
    const clickCoordStr = clickPoint ? 
      `X ${clickPoint.x.toFixed(2)}  Y ${northing.toFixed(2)}  RL ${clickPoint.y.toFixed(2)}` :
      `X ${mesh.position.x.toFixed(2)}  Y ${northing.toFixed(2)}  RL ${mesh.position.y.toFixed(2)}`;

    switch (tabKey) {
      case 'diff': {
        const diffList = meta.compareDiffList || [];
        const geomChanged = meta.compareGeomChanged;
        let rowsHtml = '';
        if (diffList.length > 0) {
          diffList.forEach(d => {
            rowsHtml += `
              <tr>
                <td class="prop-name">${this.escapeHtml(d.prop)}</td>
                <td class="old-val">${this.escapeHtml(d.oldVal)}</td>
                <td class="new-val">${this.escapeHtml(d.newVal)}</td>
              </tr>
            `;
          });
        } else {
          rowsHtml = `
            <tr>
              <td colspan="3" style="color:var(--text-muted);text-align:center;padding:12px">
                ${I18N.t('compareDiffGeomChanged')}
              </td>
            </tr>
          `;
        }

        let ghostNotice = '';
        if (geomChanged) {
          ghostNotice = `
            <div class="diff-ghost-indicator" style="margin-top:10px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span>${I18N.t('compareDiffGeomChanged')}</span>
            </div>
          `;
        }

        tabPane.innerHTML = `
          <div class="diff-inspector-card">
            <div class="diff-summary-row">
              <span class="diff-summary-badge">${I18N.t('compareInspectorDiffTitle')}</span>
              <span style="font-size:11px;color:var(--text-secondary)">${diffList.length} items</span>
            </div>
            <table class="diff-table">
              <thead>
                <tr>
                  <th>${I18N.t('compareInspectorPropCol')}</th>
                  <th>${I18N.t('compareInspectorOldVal')}</th>
                  <th>${I18N.t('compareInspectorNewVal')}</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            ${ghostNotice}
            <div style="margin-top:12px;display:flex;justify-content:flex-end">
              <button class="small-btn" id="btn-view-full-props" style="width:100%">${I18N.t('compareViewFullProps')} &rarr;</button>
            </div>
          </div>
        `;

        const btnFull = document.getElementById('btn-view-full-props');
        if (btnFull) {
          btnFull.onclick = () => {
            const btnOverview = document.querySelector(`.inspector-tab-btn[data-tab="overview"]`);
            if (btnOverview) btnOverview.click();
          };
        }
        break;
      }
      case 'overview': {
        tabPane.innerHTML = `
          <div class="pset-card open" style="margin-bottom:8px">
            <div class="pset-header">
              <div class="pset-title-group">
                <span class="pset-arrow">&#9654;</span>
                <span class="pset-title">${I18N.t('propOverviewGroup')}</span>
              </div>
              <div class="pset-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <span class="pset-count-badge">11</span>
              </div>
            </div>
            <div class="pset-body">
              <table class="prop-table">
                <tr>
                  <td class="prop-label">${I18N.t('propIfcClass')}</td>
                  <td class="prop-value">
                    <span class="ifc-class-badge">${this.escapeHtml(meta.rawType || meta.type || "IFCELEMENT")}</span>
                  </td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propDiscipline')}</td>
                  <td class="prop-value">${this.escapeHtml(meta.rawCategory || meta.category || "Structure")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propStructure')}</td>
                  <td class="prop-value">${this.escapeHtml(meta.structure || "Villa Residence")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propLevel')}</td>
                  <td class="prop-value">${this.escapeHtml(meta.level || "Ground Level")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propGuid')}</td>
                  <td class="prop-value" style="font-size:10px">${this.escapeHtml(meta.guid || "N/A")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propStepId')}</td>
                  <td class="prop-value" style="color:var(--accent)">#${this.escapeHtml(meta.id || "N/A")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propElevationRange')}</td>
                  <td class="prop-value">${this.escapeHtml(meta.rlMin || geom.boxMin.y)} &rarr; ${this.escapeHtml(meta.rlMax || geom.boxMax.y)} m</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propHeight')}</td>
                  <td class="prop-value">${this.escapeHtml(meta.height || geom.heightM)} m</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propDimensions')}</td>
                  <td class="prop-value">${geom.lengthM} &times; ${geom.widthM} &times; ${geom.heightM} m</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propClickedAt')}</td>
                  <td class="prop-value" style="color:var(--accent)">${clickCoordStr}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propCentroid')}</td>
                  <td class="prop-value">X ${geom.center.x} Y ${geom.center.z} RL ${geom.center.y}</td>
                </tr>
              </table>
            </div>
          </div>

          ${meta.description ? `
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5;background:var(--bg-card);padding:8px 10px;border-radius:5px;border:1px solid var(--border-color);margin-top:2px">
              ${this.escapeHtml(meta.description)}
            </div>
          ` : ''}
        `;
        break;
      }

      case 'psets': {
        if (!meta.psets || meta.psets.length === 0) {
          tabPane.innerHTML = `<div class="inspector-empty-card">${I18N.t('propNoPsets')}</div>`;
          return;
        }

        tabPane.innerHTML = `
          <div class="pset-search-box">
            <input type="text" class="pset-search-input" id="pset-search-input" placeholder="${I18N.t('propFilterPsets')}">
            <button type="button" class="pset-clear-btn" id="pset-clear-btn">&times;</button>
          </div>

          <div class="pset-cards-list" id="pset-cards-list">
            ${meta.psets.map((pset, psetIdx) => `
              <div class="pset-card ${psetIdx < 2 ? 'open' : ''}" data-pset-name="${this.escapeHtml((pset.name || '').toLowerCase())}">
                <div class="pset-header">
                  <div class="pset-title-group">
                    <span class="pset-arrow">&#9654;</span>
                    <span class="pset-title" title="${this.escapeHtml(pset.name)}">${this.escapeHtml(pset.name)}</span>
                  </div>
                  <div class="pset-header-actions">
                    <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <span class="pset-count-badge">${pset.properties ? pset.properties.length : 0}</span>
                  </div>
                </div>
                <div class="pset-body">
                  <table class="prop-table">
                    ${(pset.properties || []).map(p => `
                      <tr class="pset-prop-row" data-search="${this.escapeHtml(((p.name || '') + ' ' + (p.value !== null && p.value !== undefined ? p.value : '')).toLowerCase())}">
                        <td class="prop-label" style="width:45%">${this.escapeHtml(p.name)}</td>
                        <td class="prop-value">
                          ${this.formatPropertyValue(p.value)}
                          ${p.type ? `<span class="prop-type-tag">${this.escapeHtml(p.type)}</span>` : ''}
                        </td>
                      </tr>
                    `).join('')}
                  </table>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        // Wire real-time search
        const searchInput = tabPane.querySelector('#pset-search-input');
        const clearBtn = tabPane.querySelector('#pset-clear-btn');
        if (searchInput) {
          searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            clearBtn.style.display = q ? 'block' : 'none';
            tabPane.querySelectorAll('.pset-card').forEach(card => {
              const psetName = card.getAttribute('data-pset-name') || '';
              let hasMatch = psetName.includes(q);
              card.querySelectorAll('.pset-prop-row').forEach(row => {
                const text = row.getAttribute('data-search') || '';
                if (!q || text.includes(q)) {
                  row.style.display = '';
                  hasMatch = true;
                } else {
                  row.style.display = 'none';
                }
              });
              if (!q) {
                card.style.display = '';
              } else if (hasMatch) {
                card.style.display = '';
                card.classList.add('open');
              } else {
                card.style.display = 'none';
              }
            });
          });
          clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
          });
        }
        break;
      }

      case 'type': {
        if (!meta.typeInfo) {
          tabPane.innerHTML = `<div class="inspector-empty-card">${I18N.t('propNoType')}</div>`;
          return;
        }

        const ti = meta.typeInfo;
        tabPane.innerHTML = `
          <div class="element-highlight-card" style="padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span class="ifc-class-badge">${this.escapeHtml(ti.type || "IFCTYPEPRODUCT")}</span>
              <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-muted)">#${this.escapeHtml(ti.id || "N/A")}</span>
            </div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text-bright);margin-bottom:8px">${this.escapeHtml(ti.name || "Unnamed Type")}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:10.5px;color:var(--text-muted)">
              <span>GUID: <span style="font-family:var(--font-mono);color:var(--text-primary)">${this.escapeHtml(ti.guid || "N/A")}</span></span>
              ${ti.guid ? `<button class="copy-btn" id="btn-copy-type-guid">📋 ${I18N.t('propCopyGuid')}</button>` : ''}
            </div>
          </div>

          ${ti.psets && ti.psets.length > 0 ? `
            <div style="font-size:11px;font-weight:700;color:var(--text-bright);margin-top:6px;margin-bottom:4px">
              ${I18N.t('propTypePsets')} (${ti.psets.length})
            </div>
            <div class="pset-cards-list">
              ${ti.psets.map((pset, psetIdx) => `
                <div class="pset-card ${psetIdx === 0 ? 'open' : ''}">
                  <div class="pset-header">
                    <div class="pset-title-group">
                      <span class="pset-arrow">&#9654;</span>
                      <span class="pset-title" title="${this.escapeHtml(pset.name)}">${this.escapeHtml(pset.name)}</span>
                    </div>
                    <div class="pset-header-actions">
                      <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                      <span class="pset-count-badge">${pset.properties ? pset.properties.length : 0}</span>
                    </div>
                  </div>
                  <div class="pset-body">
                    <table class="prop-table">
                      ${(pset.properties || []).map(p => `
                        <tr>
                          <td class="prop-label" style="width:45%">${this.escapeHtml(p.name)}</td>
                          <td class="prop-value">
                            ${this.formatPropertyValue(p.value)}
                            ${p.type ? `<span class="prop-type-tag">${this.escapeHtml(p.type)}</span>` : ''}
                          </td>
                        </tr>
                      `).join('')}
                    </table>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:8px 4px">
              No type-level property sets.
            </div>
          `}
        `;

        const copyTypeGuid = tabPane.querySelector('#btn-copy-type-guid');
        if (copyTypeGuid && ti.guid) {
          copyTypeGuid.onclick = () => this.copyToClipboard(ti.guid, copyTypeGuid, I18N.t('propCopied'));
        }
        break;
      }

      case 'material': {
        const matInfo = meta.materials;
        const hasLayers = matInfo && matInfo.layers && matInfo.layers.length > 0;
        const palette = ['#f59e0b', '#38bdf8', '#a855f7', '#10b981', '#ec4899', '#64748b', '#fb923c', '#06b6d4'];
        
        let totalThick = 0;
        if (hasLayers) {
          totalThick = matInfo.layers.reduce((sum, l) => sum + (parseFloat(l.thickness) || 0), 0);
        }

        // Three.js rendered appearance
        const selMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const colObj = selMat && selMat.color;
        const colorHex = colObj ? '#' + colObj.getHexString() : '#38bdf8';
        const opacityPct = selMat ? Math.round((selMat.opacity !== undefined ? selMat.opacity : 1.0) * 100) + '%' : '100%';
        const roughnessVal = (selMat && selMat.roughness !== undefined) ? selMat.roughness.toFixed(2) : '0.40';
        const metalnessVal = (selMat && selMat.metalness !== undefined) ? selMat.metalness.toFixed(2) : '0.20';
        const shaderType = (selMat && selMat.type) ? selMat.type : 'MeshStandardMaterial';
        const isTransparent = selMat ? !!selMat.transparent : false;

        tabPane.innerHTML = `
          <!-- IFC Material Association Card -->
          <div class="element-highlight-card" style="padding:10px 12px;margin-bottom:8px">
            <div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px">${I18N.t('propMaterialName')}</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text-bright);margin-bottom:6px">
              ${this.escapeHtml(matInfo ? matInfo.name : "Default Material")}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-muted)">
              <span>${I18N.t('propMaterialType')}:</span>
              <span class="ifc-class-badge">${this.escapeHtml(matInfo ? (matInfo.type || 'single') : 'N/A')}</span>
            </div>
          </div>

          ${hasLayers ? `
            <div style="font-size:11px;font-weight:700;color:var(--text-bright);margin-bottom:6px">
              ${I18N.t('propCompositeLayers')} (${matInfo.layers.length})
            </div>

            <div class="layer-visual-bar">
              ${matInfo.layers.map((l, i) => {
                const thickNum = parseFloat(l.thickness) || 0;
                const pct = totalThick > 0 ? (thickNum / totalThick * 100) : (100 / matInfo.layers.length);
                const color = palette[i % palette.length];
                return `<div class="layer-visual-slice" style="width:${pct}%;background:${color}" title="${this.escapeHtml(l.name)} (${(thickNum * 1000).toFixed(0)} mm)"></div>`;
              }).join('')}
            </div>

            <div class="pset-card" style="margin-bottom:6px">
              <div class="pset-body" style="display:block;padding:2px 4px">
                ${matInfo.layers.map((l, i) => {
                  const color = palette[i % palette.length];
                  const thickNum = parseFloat(l.thickness) || 0;
                  const thickMm = (thickNum * 1000).toFixed(0);
                  return `
                    <div class="layer-item-row">
                      <div class="layer-left">
                        <div class="layer-dot" style="background:${color}"></div>
                        <span class="layer-name" title="${this.escapeHtml(l.name)}">${i + 1}. ${this.escapeHtml(l.name)}</span>
                      </div>
                      <span class="layer-thick">${thickMm} mm (${thickNum.toFixed(3)} m)</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;padding:4px 6px;color:var(--text-bright);margin-bottom:8px">
              <span>${I18N.t('propTotalThickness')}</span>
              <span style="font-family:var(--font-mono);color:var(--accent)">${(totalThick * 1000).toFixed(0)} mm (${totalThick.toFixed(3)} m)</span>
            </div>
          ` : ''}

          <!-- 3D Render Appearance -->
          <div class="pset-card open" style="margin-top:8px">
            <div class="pset-header">
              <div class="pset-title-group">
                <span class="pset-arrow">&#9654;</span>
                <span class="pset-title">${I18N.t('propRenderingProps')}</span>
              </div>
              <div class="pset-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <span class="pset-count-badge">5</span>
              </div>
            </div>
            <div class="pset-body">
              <table class="prop-table">
                <tr>
                  <td class="prop-label">${I18N.t('propBaseColor')}</td>
                  <td class="prop-value" style="display:flex;align-items:center;gap:6px">
                    <div class="layer-dot" style="background:${colorHex};width:14px;height:14px;border:1px solid rgba(255,255,255,0.2)"></div>
                    <span>${colorHex.toUpperCase()}</span>
                  </td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propShadingType')}</td>
                  <td class="prop-value">${this.escapeHtml(shaderType)}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propRoughness')}</td>
                  <td class="prop-value">${roughnessVal}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propMetalness')}</td>
                  <td class="prop-value">${metalnessVal}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propOpacity')}</td>
                  <td class="prop-value">
                    ${opacityPct}
                    ${isTransparent ? '<span class="bool-tag bool-false" style="margin-left:4px">TRANSPARENT</span>' : '<span class="bool-tag bool-true" style="margin-left:4px">OPAQUE</span>'}
                  </td>
                </tr>
              </table>
            </div>
          </div>
        `;
        break;
      }

      case 'geometry': {
        const qsets = meta.qsets || [];
        tabPane.innerHTML = `
          <div class="geom-metrics-grid">
            <div class="geom-metric-card">
              <span class="geom-metric-title">${I18N.t('propSurfaceArea')}</span>
              <span class="geom-metric-value">${geom.areaM2} m&sup2;</span>
            </div>
            <div class="geom-metric-card">
              <span class="geom-metric-title">${I18N.t('propVolume')}</span>
              <span class="geom-metric-value">${geom.volumeM3} m&sup3;</span>
            </div>
            <div class="geom-metric-card">
              <span class="geom-metric-title">${I18N.t('propTriangles')}</span>
              <span class="geom-metric-value">${Number(geom.triangles).toLocaleString()}</span>
            </div>
            <div class="geom-metric-card">
              <span class="geom-metric-title">${I18N.t('propVertices')}</span>
              <span class="geom-metric-value">${Number(geom.vertices).toLocaleString()}</span>
            </div>
          </div>

          <div class="pset-card open" style="margin-bottom:8px">
            <div class="pset-header">
              <div class="pset-title-group">
                <span class="pset-arrow">&#9654;</span>
                <span class="pset-title">${I18N.t('propDimensionsExtents')}</span>
              </div>
              <div class="pset-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <span class="pset-count-badge">5</span>
              </div>
            </div>
            <div class="pset-body">
              <table class="prop-table">
                <tr>
                  <td class="prop-label">${I18N.t('propDimensions')} (L &times; W &times; H)</td>
                  <td class="prop-value">${geom.lengthM} &times; ${geom.widthM} &times; ${geom.heightM} m</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propDimensionsMm')}</td>
                  <td class="prop-value">${Math.round(geom.lengthM * 1000)} &times; ${Math.round(geom.widthM * 1000)} &times; ${Math.round(geom.heightM * 1000)} mm</td>
                </tr>
                <tr>
                  <td class="prop-label">Min Extents (X, Y, Z)</td>
                  <td class="prop-value">${geom.boxMin.x}, ${geom.boxMin.y}, ${geom.boxMin.z}</td>
                </tr>
                <tr>
                  <td class="prop-label">Max Extents (X, Y, Z)</td>
                  <td class="prop-value">${geom.boxMax.x}, ${geom.boxMax.y}, ${geom.boxMax.z}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propCentroid')}</td>
                  <td class="prop-value">X ${geom.center.x}  Y ${geom.center.z}  RL ${geom.center.y}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Base Quantities Qto -->
          <div style="font-size:11px;font-weight:700;color:var(--text-bright);margin-top:8px;margin-bottom:4px">
            ${I18N.t('propQuantities')} ${qsets.length > 0 ? `(${qsets.length})` : ''}
          </div>

          ${qsets.length > 0 ? `
            <div class="pset-cards-list">
              ${qsets.map((qset, qIdx) => `
                <div class="pset-card ${qIdx === 0 ? 'open' : ''}">
                  <div class="pset-header">
                    <div class="pset-title-group">
                      <span class="pset-arrow">&#9654;</span>
                      <span class="pset-title" title="${this.escapeHtml(qset.name)}">${this.escapeHtml(qset.name)}</span>
                    </div>
                    <div class="pset-header-actions">
                      <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                      <span class="pset-count-badge">${qset.quantities ? qset.quantities.length : 0}</span>
                    </div>
                  </div>
                  <div class="pset-body">
                    <table class="prop-table">
                      ${(qset.quantities || []).map(q => `
                        <tr>
                          <td class="prop-label" style="width:45%">${this.escapeHtml(q.name)}</td>
                          <td class="prop-value">
                            ${this.formatPropertyValue(q.value)}
                            ${q.unit ? `<span class="prop-type-tag">${this.escapeHtml(q.unit)}</span>` : ''}
                            ${q.type ? `<span class="prop-type-tag">${this.escapeHtml(q.type)}</span>` : ''}
                          </td>
                        </tr>
                      `).join('')}
                    </table>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:6px 2px">
              ${I18N.t('propNoQuantities')}
            </div>
          `}
        `;
        break;
      }

      case 'raw': {
        const rawEntityText = meta.rawEntity || `#${meta.id || '0'}= ${meta.type || 'IFCPRODUCT'}('N/A');`;
        const metaJsonText = JSON.stringify(meta, (k, v) => (k === 'originalColor' ? undefined : v), 2);

        tabPane.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11px;font-weight:700;color:var(--text-bright)">${I18N.t('propStepStatement')}</span>
            <button class="copy-btn" id="btn-copy-step">📋 ${I18N.t('propCopyStep')}</button>
          </div>
          <div class="raw-code-box" id="step-code-box"><code>${this.escapeHtml(rawEntityText)}</code></div>

          <div class="pset-card open" style="margin-top:8px;margin-bottom:8px">
            <div class="pset-header">
              <div class="pset-title-group">
                <span class="pset-arrow">&#9654;</span>
                <span class="pset-title">${I18N.t('propEntityMetadata')}</span>
              </div>
              <div class="pset-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <span class="pset-count-badge">5</span>
              </div>
            </div>
            <div class="pset-body">
              <table class="prop-table">
                <tr>
                  <td class="prop-label">${I18N.t('propStepId')}</td>
                  <td class="prop-value" style="color:var(--accent)">#${this.escapeHtml(meta.id || "N/A")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propIfcClass')}</td>
                  <td class="prop-value">${this.escapeHtml(meta.type || "N/A")}</td>
                </tr>
                <tr>
                  <td class="prop-label">${I18N.t('propTypeStepId')}</td>
                  <td class="prop-value">${(meta.typeInfo && (meta.typeInfo.id || meta.typeInfo.typeId)) ? '#' + this.escapeHtml(meta.typeInfo.id || meta.typeInfo.typeId) : "N/A"}</td>
                </tr>
                <tr>
                  <td class="prop-label">Spatial Storey</td>
                  <td class="prop-value">${this.escapeHtml(meta.spatial && meta.spatial.storey ? meta.spatial.storey : (meta.level || "N/A"))}</td>
                </tr>
                <tr>
                  <td class="prop-label">Spatial Elevation</td>
                  <td class="prop-value">${meta.spatial && meta.spatial.elevation !== null && meta.spatial.elevation !== undefined ? meta.spatial.elevation + ' m' : 'N/A'}</td>
                </tr>
              </table>
            </div>
          </div>

          <details style="margin-top:6px">
            <summary style="font-size:11px;font-weight:600;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:space-between">
              <span>${I18N.t('propJsonViewer')}</span>
              <button class="copy-btn" id="btn-copy-json" style="margin-left:auto">📋 ${I18N.t('propCopyJson')}</button>
            </summary>
            <div class="raw-code-box" style="margin-top:6px;max-height:220px"><code>${this.escapeHtml(metaJsonText)}</code></div>
          </details>
        `;

        const copyStepBtn = tabPane.querySelector('#btn-copy-step');
        if (copyStepBtn) {
          copyStepBtn.onclick = () => this.copyToClipboard(rawEntityText, copyStepBtn, I18N.t('propCopied'));
        }

        const copyJsonBtn = tabPane.querySelector('#btn-copy-json');
        if (copyJsonBtn) {
          copyJsonBtn.onclick = (e) => {
            e.stopPropagation();
            this.copyToClipboard(metaJsonText, copyJsonBtn, I18N.t('propCopied'));
          };
        }
        break;
      }
    }

    // Attach hover copy buttons to all values and wire accordion toggles & group copy
    this.setupInspectorCopyAndAccordion(tabPane);
  }
  
  zoomToElement(mesh) {
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 0.5);

    // Keep the exact same camera viewing angle (line of sight)
    // viewDir points from controls.target to camera.position
    const viewDir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (viewDir.lengthSq() < 0.0001) {
      this.camera.getWorldDirection(viewDir).negate();
    } else {
      viewDir.normalize();
    }

    // Distance calculation so object occupies ~70% of the viewport:
    // Screen height at distance D is H = 2 * D * tan(fov / 2).
    // Screen width at distance D is W = H * aspect = 2 * D * tan(fov / 2) * aspect.
    // Object diameter is 2 * radius.
    // Screen occupancy fraction along tighter dimension:
    // (2 * radius) / (2 * D * tan(fov / 2) * min(1, aspect)) = 0.70
    // => D = (radius / 0.70) / (tan(fov / 2) * min(1, aspect))
    const zoomFraction = 0.70;
    if (this.camera && this.camera.isOrthographicCamera) {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const aspect = width / (height || 1);
      const minAspect = Math.min(1, aspect);
      const halfH = (radius / minAspect) / zoomFraction;
      const halfW = halfH * aspect;
      this.orthographicCamera.left = -halfW;
      this.orthographicCamera.right = halfW;
      this.orthographicCamera.top = halfH;
      this.orthographicCamera.bottom = -halfH;
      this.orthographicCamera.zoom = 1.0;
      this.orthographicCamera.updateProjectionMatrix();

      const targetCam = center.clone().addScaledVector(viewDir, 25.0);
      this.showPivotIndicator(center);
      this.tweenCamera(targetCam, center);
      return;
    }

    const fovRad = ((this.perspectiveCamera ? this.perspectiveCamera.fov : 45) * Math.PI) / 180;
    const aspect = (this.perspectiveCamera ? this.perspectiveCamera.aspect : 1) || 1;
    const minAspect = Math.min(1, aspect);
    const targetDist = Math.max((radius / zoomFraction) / (Math.tan(fovRad / 2) * minAspect), 1.0);

    const targetCam = center.clone().addScaledVector(viewDir, targetDist);
    this.showPivotIndicator(center);
    this.tweenCamera(targetCam, center);
  }
  
  isolateElement(mesh) {
    if (!this.activeModel) return;
    const structureName = mesh.userData.structure;
    this.activeModel.traverse(obj => {
      if (obj.isMesh) {
        obj.visible = (obj === mesh || obj.userData.structure === structureName);
      }
    });
    showToast(`Isolated ${structureName}`, 'warning');
  }
  
  clearSelection() {
    this.selectedMesh = null;
    this.selectedMeshes = [];
    this.lastClickPoint = null;
    if (this.highlightBox) this.highlightBox.visible = false;
    this.clearHighlightOverlay();
    this.clearHoverOverlay();
    if (this.compareEngine) {
      this.compareEngine.onSelectionCleared();
    }
    this.syncTreeSelection();
    this.renderModelInfoInspector();
  }

  calculateModelStats(rootObject) {
    let totalMeshes = 0;
    let totalTriangles = 0;
    let totalVertices = 0;

    if (rootObject) {
      rootObject.traverse(obj => {
        if (this.isModelElementMesh(obj) && obj.geometry) {
          totalMeshes++;
          const geom = obj.geometry;
          if (geom.index) {
            totalTriangles += geom.index.count / 3;
            totalVertices += geom.attributes && geom.attributes.position ? geom.attributes.position.count : 0;
          } else if (geom.attributes && geom.attributes.position) {
            totalTriangles += geom.attributes.position.count / 3;
            totalVertices += geom.attributes.position.count;
          }
        }
      });
    }

    return {
      totalElements: totalMeshes,
      totalTriangles: Math.round(totalTriangles),
      totalVertices: Math.round(totalVertices)
    };
  }

  formatFBXVersion(version, isBinary = true) {
    if (!version) return `Autodesk FBX (${isBinary ? 'Binary' : 'ASCII'})`;
    const v = parseInt(version, 10);
    const yearMap = { 
      7000: '2010', 7100: '2011', 7200: '2012', 7300: '2013', 
      7400: '2014', 7500: '2016', 7700: '2020' 
    };
    const major = Math.floor(v / 1000);
    const minor = Math.floor((v % 1000) / 100);
    const yr = yearMap[v] ? ` (${yearMap[v]})` : '';
    return `Autodesk FBX ${major}.${minor}${yr}`;
  }

  formatFBXUnitAndAxis(unitScale = 1.0, upAxis = 1) {
    // Up axis: 0=X, 1=Y, 2=Z
    const axisStr = upAxis === 2 ? 'Z-up' : (upAxis === 0 ? 'X-up' : 'Y-up');
    let enUnit = '1.0 m';
    let zhUnit = '米';
    
    if (Math.abs(unitScale - 100.0) < 0.001) {
      enUnit = '1.0 m';
      zhUnit = '米';
    } else if (Math.abs(unitScale - 1.0) < 0.001) {
      enUnit = '1.0 cm';
      zhUnit = '厘米';
    } else if (Math.abs(unitScale - 0.1) < 0.001) {
      enUnit = '1.0 mm';
      zhUnit = '毫米';
    } else if (Math.abs(unitScale - 2.54) < 0.001) {
      enUnit = '1.0 in';
      zhUnit = '英寸';
    } else if (Math.abs(unitScale - 30.48) < 0.001) {
      enUnit = '1.0 ft';
      zhUnit = '英尺';
    } else if (unitScale >= 100) {
      const m = (unitScale / 100).toFixed(unitScale % 100 === 0 ? 0 : 2);
      enUnit = `${m} m`;
      zhUnit = `${m} 米`;
    } else {
      enUnit = `${unitScale} cm`;
      zhUnit = `${unitScale} 厘米`;
    }

    return {
      en: `${enUnit} (${axisStr})`,
      zh: `${zhUnit} (${axisStr})`
    };
  }

  formatDAEUnitAndAxis(unitMeter = 1.0, upAxis = 'Y_UP') {
    const axisStr = upAxis === 'X_UP' ? 'X-up' : (upAxis === 'Y_UP' ? 'Y-up' : 'Z-up');
    let enUnit = '1.0 m';
    let zhUnit = '米';

    if (Math.abs(unitMeter - 1.0) < 0.001) {
      enUnit = '1.0 m'; zhUnit = '米';
    } else if (Math.abs(unitMeter - 0.01) < 0.001) {
      enUnit = '1.0 cm'; zhUnit = '厘米';
    } else if (Math.abs(unitMeter - 0.001) < 0.001) {
      enUnit = '1.0 mm'; zhUnit = '毫米';
    } else if (Math.abs(unitMeter - 0.0254) < 0.001) {
      enUnit = '1.0 in'; zhUnit = '英寸';
    } else if (Math.abs(unitMeter - 0.3048) < 0.001) {
      enUnit = '1.0 ft'; zhUnit = '英尺';
    } else {
      enUnit = `${unitMeter} m`; zhUnit = `${unitMeter} 米`;
    }

    return {
      en: `${enUnit} (${axisStr})`,
      zh: `${zhUnit} (${axisStr})`
    };
  }

  formatIFCUnitAndAxis(unitScale = 1.0) {
    const axisStr = 'Z-up';
    let enUnit = '1.0 m';
    let zhUnit = '米';

    if (Math.abs(unitScale - 0.001) < 0.0001) {
      enUnit = '1.0 mm'; zhUnit = '毫米';
    } else if (Math.abs(unitScale - 1.0) < 0.001) {
      enUnit = '1.0 m'; zhUnit = '米';
    } else if (Math.abs(unitScale - 0.01) < 0.001) {
      enUnit = '1.0 cm'; zhUnit = '厘米';
    } else {
      enUnit = `${unitScale} m`; zhUnit = `${unitScale} 米`;
    }

    return {
      en: `${enUnit} (${axisStr})`,
      zh: `${zhUnit} (${axisStr})`
    };
  }

  formatGLTFUnitAndAxis() {
    return {
      en: '1.0 m (Y-up)',
      zh: '米 (Y-up)'
    };
  }

  // Update header subtitle with format version, exporting software, unit & axis, and GIS CRS
  updateModelSubtitle(modelInfo = null) {
    const info = modelInfo || this.currentModelInfo;
    const titleEl = document.getElementById('project-title-text');
    if (titleEl) {
      if (info && !info.isDemo && info.fileName) {
        titleEl.textContent = info.fileName;
        titleEl.title = info.fileName;
      } else {
        titleEl.textContent = I18N.t('appTitle');
        titleEl.title = I18N.t('appTitle');
      }
    }

    const subEl = document.getElementById('project-subtitle-text');
    if (!subEl) return;

    if (!info || info.isDemo) {
      // Demo Model architectural description
      const desc = I18N.t('appSubtitle');
      subEl.textContent = desc;
      subEl.title = desc;
      return;
    }

    const isZh = I18N.currentLang === 'zh';
    const unspecified = isZh ? (I18N.t('subtitleUnspecified') || '未指定') : 'Unspecified';

    // 1. Format Version (No prefix)
    const formatPart = info.formatVersion || info.format || (isZh ? '三维模型' : '3D Model');

    // 2. Exporting Software
    const softwareLabel = isZh ? (I18N.t('subtitleSoftware') || '导出软件') : 'Software';
    const softwareVal = info.originalSoftware && info.originalSoftware !== 'Unspecified' && info.originalSoftware !== '未指定' ? 
      info.originalSoftware : unspecified;
    const softwarePart = `${softwareLabel}: ${softwareVal}`;

    // 3. Unit & Up-Axis
    const unitLabel = isZh ? (I18N.t('subtitleUnit') || '单位') : 'Unit';
    const unitVal = (isZh && info.unitStrZh) ? info.unitStrZh : (info.unitStr || (isZh ? '米 (Z-up)' : '1.0 m (Z-up)'));
    const unitPart = `${unitLabel}: ${unitVal}`;

    const parts = [formatPart, softwarePart, unitPart];

    // 4. GIS / Coordinate Reference System (only if present)
    if (info.gis) {
      const gisLabel = isZh ? (I18N.t('subtitleGis') || 'GIS坐标系') : 'GIS CRS';
      parts.push(`${gisLabel}: ${info.gis}`);
    }

    const subText = parts.join(' | ');
    subEl.textContent = subText;
    subEl.title = subText;
  }

  renderModelInfoInspector() {
    const content = document.getElementById('inspector-content');
    if (!content) return;

    if (!this.currentModelInfo) {
      content.innerHTML = `
        <div style="padding:20px 10px;text-align:center;color:var(--text-muted)">
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">${I18N.t('noSelection')}</div>
          <div style="font-size:11.5px;line-height:1.5">${I18N.t('clickToInspect')}</div>
        </div>
      `;
      return;
    }

    const info = this.currentModelInfo;
    const stats = info.stats || { totalElements: 0, totalTriangles: 0, totalVertices: 0 };
    const fmtNum = (n) => (n != null ? Number(n).toLocaleString() : '0');
    const isZh = I18N.currentLang === 'zh';
    const unspecified = isZh ? (I18N.t('subtitleUnspecified') || '未指定') : 'Unspecified';

    // Build section rows (only non-empty fields)
    const fileBasicsRows = [];
    if (info.fileName) fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propFileName')}</td><td class="prop-value" style="color:var(--accent);font-weight:600">${this.escapeHtml(info.fileName)}</td></tr>`);
    if (info.formatVersion || info.format) fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propFormat')}</td><td class="prop-value">${this.escapeHtml(info.formatVersion || info.format)}</td></tr>`);
    if (info.unitStr) {
      const uVal = isZh && info.unitStrZh ? info.unitStrZh : info.unitStr;
      fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propUnitAxis')}</td><td class="prop-value">${this.escapeHtml(uVal)}</td></tr>`);
    }
    if (info.fileSize) fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propFileSize')}</td><td class="prop-value">${this.escapeHtml(info.fileSize)}</td></tr>`);
    if (info.filePath) fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propFilePath')}</td><td class="prop-value" style="word-break:break-all">${this.escapeHtml(info.filePath)}</td></tr>`);
    if (info.lastModified) fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propModifiedDate')}</td><td class="prop-value">${this.escapeHtml(info.lastModified)}</td></tr>`);
    if (info.loadedTime) fileBasicsRows.push(`<tr><td class="prop-label">${I18N.t('propLoadedTime')}</td><td class="prop-value">${this.escapeHtml(info.loadedTime)}</td></tr>`);

    const standardRows = [];
    const softwareVal = info.originalSoftware && info.originalSoftware !== 'Unspecified' && info.originalSoftware !== '未指定' ? 
      info.originalSoftware : (info.isDemo ? "WWBIM Procedural BIM Engine" : unspecified);
    standardRows.push(`<tr><td class="prop-label">${I18N.t('propOriginalSoftware')}</td><td class="prop-value" style="color:#7dd3fc;font-weight:600">${this.escapeHtml(softwareVal)}</td></tr>`);
    if (info.gis) standardRows.push(`<tr><td class="prop-label">${I18N.t('propGisCrs')}</td><td class="prop-value" style="color:var(--accent);font-weight:600">${this.escapeHtml(info.gis)}</td></tr>`);
    if (info.mvd) standardRows.push(`<tr><td class="prop-label">${I18N.t('propMvd')}</td><td class="prop-value">${this.escapeHtml(info.mvd)}</td></tr>`);
    if (info.exportTimestamp) standardRows.push(`<tr><td class="prop-label">${I18N.t('propExportDate')}</td><td class="prop-value">${this.escapeHtml(info.exportTimestamp)}</td></tr>`);
    if (info.preprocessor) standardRows.push(`<tr><td class="prop-label">${I18N.t('propPreprocessor')}</td><td class="prop-value">${this.escapeHtml(info.preprocessor)}</td></tr>`);

    const authorRows = [];
    if (!info.isDemo) {
      if (info.author) authorRows.push(`<tr><td class="prop-label">${I18N.t('propAuthor')}</td><td class="prop-value">${this.escapeHtml(info.author)}</td></tr>`);
      if (info.organization) authorRows.push(`<tr><td class="prop-label">${I18N.t('propOrg')}</td><td class="prop-value">${this.escapeHtml(info.organization)}</td></tr>`);
      if (info.originatingSystem) authorRows.push(`<tr><td class="prop-label">${I18N.t('propOriginatingSystem')}</td><td class="prop-value">${this.escapeHtml(info.originatingSystem)}</td></tr>`);
      if (info.authorization) authorRows.push(`<tr><td class="prop-label">${I18N.t('propAuthorization')}</td><td class="prop-value">${this.escapeHtml(info.authorization)}</td></tr>`);
    }

    const projectRows = [];
    if (!info.isDemo) {
      if (info.projectName) projectRows.push(`<tr><td class="prop-label">${I18N.t('propProjectName')}</td><td class="prop-value" style="font-weight:600">${this.escapeHtml(info.projectName)}</td></tr>`);
      if (info.projectDescription) projectRows.push(`<tr><td class="prop-label">${I18N.t('propProjectDesc')}</td><td class="prop-value">${this.escapeHtml(info.projectDescription)}</td></tr>`);
      if (info.projectPhase) projectRows.push(`<tr><td class="prop-label">${I18N.t('propProjectPhase')}</td><td class="prop-value">${this.escapeHtml(info.projectPhase)}</td></tr>`);
    }

    const statsRows = [
      `<tr><td class="prop-label">${I18N.t('propTotalElements')}</td><td class="prop-value u-text-accent" style="font-weight:700">${fmtNum(stats.totalElements)}</td></tr>`,
      `<tr><td class="prop-label">${I18N.t('propTotalTriangles')}</td><td class="prop-value">${fmtNum(stats.totalTriangles)}</td></tr>`,
      `<tr><td class="prop-label">${I18N.t('propTotalVertices')}</td><td class="prop-value">${fmtNum(stats.totalVertices)}</td></tr>`
    ];

    const modelOpacityPercent = Math.round((this.modelOpacity !== undefined ? this.modelOpacity : 1.0) * 100);

    content.innerHTML = `
      <div class="model-info-container">
        <!-- Top Hint Banner -->
        <div class="model-info-banner">
          <div class="model-info-badge-row">
            <span class="model-info-badge">📄 ${I18N.t('modelProfile')}</span>
          </div>
          <div class="model-info-tip">${I18N.t('modelInfoTip')}</div>
        </div>

        <!-- Primary Model Card -->
        <div class="element-highlight-card">
          <div class="element-title-row">
            <div class="category-dot" style="background:var(--accent)"></div>
            <div class="element-title" title="${this.escapeHtml(info.fileName)}">${this.escapeHtml(info.fileName)}</div>
          </div>
          <div class="element-opacity-control">
            <div class="element-opacity-header">
              <span class="element-opacity-label" data-i18n="elemOpacity">${I18N.t('elemOpacity')}</span>
              <span class="element-opacity-val" id="model-opacity-val">${modelOpacityPercent}%</span>
            </div>
            <input type="range" min="10" max="100" step="1" value="${modelOpacityPercent}" class="range-slider element-opacity-slider" id="model-opacity-slider">
          </div>
          <div class="action-row">
            <button class="action-btn" id="btn-copy-model-info" title="Copy summary">📋 ${I18N.t('copySummary')}</button>
            <button class="action-btn" id="btn-fit-model" title="Fit model to view">🔍 ${I18N.t('fitView')}</button>
            <button class="action-btn" id="btn-export-meta-json" title="Export metadata as JSON">💾 ${I18N.t('exportJson')}</button>
          </div>
        </div>

        ${(info.isOBJ && this.objTuningState) ? `
        <!-- OBJ Live Tuning Section -->
        <div class="model-info-section open" data-group-name="${I18N.t('secObjTuning')}">
          <div class="model-info-sec-header">
            <div class="sec-header-left">
              <span class="pset-arrow">&#9654;</span>
              <span class="sec-icon">🛠️</span>
              <span class="sec-title">${I18N.t('secObjTuning')}</span>
            </div>
          </div>
          <div class="model-info-sec-body">
            <div class="obj-tuning-card">
              <!-- Orientation -->
              <div class="obj-tuning-group">
                <div class="obj-tuning-group-title">🧭 ${I18N.t('objUpAxis')}</div>
                <div class="obj-tuning-btn-row">
                  <button type="button" class="obj-tuning-btn obj-tuning-btn-lg ${this.objTuningState.upAxis === 'Z' ? 'active' : ''}" id="btn-obj-toggle-up" title="${I18N.t('btnObjFlipUp')}">
                    🔄 ${I18N.t('btnObjFlipUp')}
                  </button>
                  <button type="button" class="obj-tuning-btn obj-tuning-btn-sm" id="btn-obj-rotate-yaw" title="${I18N.t('btnObjRotateYaw')}">
                    ↷ ${I18N.t('btnObjRotateYaw')}
                  </button>
                </div>
              </div>

              <!-- Units & Scale Multiplier -->
              <div class="obj-tuning-group">
                <div class="obj-tuning-group-title">📐 ${I18N.t('objUnitsScale')}</div>
                <div class="obj-tuning-btn-row scale-presets">
                  <button type="button" class="obj-tuning-btn ${Math.abs(this.objTuningState.currentScale - 0.001) < 1e-6 ? 'active' : ''}" data-scale="0.001">mm (×0.001)</button>
                  <button type="button" class="obj-tuning-btn ${Math.abs(this.objTuningState.currentScale - 0.01) < 1e-6 ? 'active' : ''}" data-scale="0.01">cm (×0.01)</button>
                  <button type="button" class="obj-tuning-btn ${Math.abs(this.objTuningState.currentScale - 0.0254) < 1e-6 ? 'active' : ''}" data-scale="0.0254">in (×0.0254)</button>
                  <button type="button" class="obj-tuning-btn ${Math.abs(this.objTuningState.currentScale - 1.0) < 1e-6 ? 'active' : ''}" data-scale="1.0">1.0 (m)</button>
                </div>
                <div class="obj-tuning-input-row">
                  <input type="number" step="any" class="obj-tuning-input" id="input-obj-custom-scale" value="${this.objTuningState.currentScale}">
                  <button type="button" class="obj-tuning-btn" id="btn-obj-apply-scale">⚙️ ${I18N.t('btnObjApplyScale')}</button>
                </div>
              </div>

              <!-- Normals & Rendering -->
              <div class="obj-tuning-group">
                <div class="obj-tuning-group-title">✨ ${I18N.t('objNormalsShading')}</div>
                <div class="obj-tuning-btn-row">
                  <button type="button" class="obj-tuning-btn obj-tuning-btn-lg ${!this.objTuningState.isFlat ? 'active' : ''}" id="btn-obj-smooth" title="${I18N.t('btnObjSmoothNormals')}">✨ ${I18N.t('btnObjSmoothNormals')}</button>
                  <button type="button" class="obj-tuning-btn obj-tuning-btn-sm ${this.objTuningState.isFlat ? 'active' : ''}" id="btn-obj-flat" title="${I18N.t('btnObjFlatShading')}">🔷 ${I18N.t('btnObjFlatShading')}</button>
                </div>
                <label class="obj-tuning-chk-row">
                  <input type="checkbox" id="chk-obj-double-side" ${this.objTuningState.isDoubleSide ? 'checked' : ''}>
                  <span>${I18N.t('chkObjDoubleSide')}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- File Basics -->
        <div class="model-info-section open" data-group-name="${I18N.t('secFileBasics')}">
          <div class="model-info-sec-header">
            <div class="sec-header-left">
              <span class="pset-arrow">&#9654;</span>
              <span class="sec-icon">📁</span>
              <span class="sec-title">${I18N.t('secFileBasics')}</span>
            </div>
            <div class="sec-header-actions">
              <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>
          <div class="model-info-sec-body">
            <table class="prop-table">
              <tbody>${fileBasicsRows.join('')}</tbody>
            </table>
          </div>
        </div>

        <!-- 3D Statistics for ALL formats -->
        <div class="model-info-section open" data-group-name="${I18N.t('secModelStats')}">
          <div class="model-info-sec-header">
            <div class="sec-header-left">
              <span class="pset-arrow">&#9654;</span>
              <span class="sec-icon">📊</span>
              <span class="sec-title">${I18N.t('secModelStats')}</span>
            </div>
            <div class="sec-header-actions">
              <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>
          <div class="model-info-sec-body">
            <table class="prop-table">
              <tbody>${statsRows.join('')}</tbody>
            </table>
          </div>
        </div>

        ${standardRows.length > 0 ? `
          <div class="model-info-section open" data-group-name="${I18N.t('secStandardsSoftware')}">
            <div class="model-info-sec-header">
              <div class="sec-header-left">
                <span class="pset-arrow">&#9654;</span>
                <span class="sec-icon">⚙️</span>
                <span class="sec-title">${I18N.t('secStandardsSoftware')}</span>
              </div>
              <div class="sec-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </div>
            <div class="model-info-sec-body">
              <table class="prop-table">
                <tbody>${standardRows.join('')}</tbody>
              </table>
            </div>
          </div>
        ` : ''}

        ${authorRows.length > 0 ? `
          <div class="model-info-section open" data-group-name="${I18N.t('secAuthorOrg')}">
            <div class="model-info-sec-header">
              <div class="sec-header-left">
                <span class="pset-arrow">&#9654;</span>
                <span class="sec-icon">👤</span>
                <span class="sec-title">${I18N.t('secAuthorOrg')}</span>
              </div>
              <div class="sec-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </div>
            <div class="model-info-sec-body">
              <table class="prop-table">
                <tbody>${authorRows.join('')}</tbody>
              </table>
            </div>
          </div>
        ` : ''}

        ${projectRows.length > 0 ? `
          <div class="model-info-section open" data-group-name="${I18N.t('secProjectSummary')}">
            <div class="model-info-sec-header">
              <div class="sec-header-left">
                <span class="pset-arrow">&#9654;</span>
                <span class="sec-icon">🏛️</span>
                <span class="sec-title">${I18N.t('secProjectSummary')}</span>
              </div>
              <div class="sec-header-actions">
                <button type="button" class="group-copy-btn" title="${I18N.t('copyGroup')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </div>
            <div class="model-info-sec-body">
              <table class="prop-table">
                <tbody>${projectRows.join('')}</tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Wire action buttons
    const btnCopy = content.querySelector('#btn-copy-model-info');
    if (btnCopy) {
      btnCopy.onclick = () => {
        const lines = [
          `=== ${info.fileName} ===`,
          `Format: ${info.format || 'N/A'}`,
          `Size: ${info.fileSize || 'N/A'}`,
          `Source: ${info.filePath || 'N/A'}`,
          `Total Elements: ${fmtNum(stats.totalElements)}`,
          `Total Triangles: ${fmtNum(stats.totalTriangles)}`,
          `Total Vertices: ${fmtNum(stats.totalVertices)}`
        ];
        if (info.originalSoftware) lines.push(`Original Software: ${info.originalSoftware}`);
        if (info.mvd) lines.push(`MVD: ${info.mvd}`);
        if (info.author) lines.push(`Author: ${info.author}`);
        if (info.organization) lines.push(`Organization: ${info.organization}`);
        if (info.projectName) lines.push(`Project: ${info.projectName}`);
        this.copyToClipboard(lines.join('\n'), btnCopy, I18N.t('copiedModelInfo'));
      };
    }

    const btnFit = content.querySelector('#btn-fit-model');
    if (btnFit) {
      btnFit.onclick = () => this.fitView();
    }

    const btnExportJson = content.querySelector('#btn-export-meta-json');
    if (btnExportJson) {
      btnExportJson.onclick = () => {
        const exportData = {
          metadata: {
            fileName: info.fileName,
            format: info.format,
            schema: info.schema,
            rawSchema: info.rawSchema,
            fileSize: info.fileSize,
            filePath: info.filePath,
            lastModified: info.lastModified,
            loadedTime: info.loadedTime,
            originalSoftware: info.originalSoftware,
            mvd: info.mvd,
            exportTimestamp: info.exportTimestamp,
            preprocessor: info.preprocessor,
            originatingSystem: info.originatingSystem,
            author: info.author,
            organization: info.organization,
            authorization: info.authorization,
            projectName: info.projectName,
            projectDescription: info.projectDescription,
            projectPhase: info.projectPhase
          },
          statistics: stats,
          exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (info.fileName || 'model').replace(/\\.[^/.]+$/, '');
        a.download = `${safeName}_metadata.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Metadata JSON exported!", "success");
      };
    }

    // Wire model opacity slider
    const modelOpSlider = content.querySelector('#model-opacity-slider');
    const modelOpVal = content.querySelector('#model-opacity-val');
    if (modelOpSlider && modelOpVal) {
      modelOpSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        modelOpVal.textContent = `${val}%`;
        this.setModelOpacity(val);
      });
    }

    // Wire OBJ tuning controls if present
    if (info.isOBJ && this.objTuningState) {
      const btnFlipUp = content.querySelector('#btn-obj-toggle-up');
      if (btnFlipUp) {
        btnFlipUp.onclick = () => this.toggleOBJUpAxis();
      }
      const btnRotYaw = content.querySelector('#btn-obj-rotate-yaw');
      if (btnRotYaw) {
        btnRotYaw.onclick = () => this.rotateOBJYaw(90);
      }
      content.querySelectorAll('.obj-tuning-btn[data-scale]').forEach(btn => {
        btn.onclick = () => {
          const s = parseFloat(btn.dataset.scale);
          this.applyOBJScale(s);
        };
      });
      const btnApplyScale = content.querySelector('#btn-obj-apply-scale');
      const inputCustomScale = content.querySelector('#input-obj-custom-scale');
      if (btnApplyScale && inputCustomScale) {
        btnApplyScale.onclick = () => {
          this.applyOBJScale(inputCustomScale.value);
        };
      }
      const btnSmooth = content.querySelector('#btn-obj-smooth');
      if (btnSmooth) {
        btnSmooth.onclick = () => this.toggleOBJSmoothNormals(true);
      }
      const btnFlat = content.querySelector('#btn-obj-flat');
      if (btnFlat) {
        btnFlat.onclick = () => this.toggleOBJSmoothNormals(false);
      }
      const chkDoubleSide = content.querySelector('#chk-obj-double-side');
      if (chkDoubleSide) {
        chkDoubleSide.onchange = (e) => this.toggleOBJDoubleSide(e.target.checked);
      }
    }

    // Attach hover copy buttons to all values and wire accordion toggles & group copy
    this.setupInspectorCopyAndAccordion(content);
  }

  setModelOpacity(opacityPercent) {
    this.modelOpacity = opacityPercent / 100;
    const targetModel = this.activeModel || this.currentModel;
    if (!targetModel) return;

    targetModel.traverse((obj) => {
      if (obj.isMesh && obj.material && (!obj.userData || (!obj.userData.isGizmo && !obj.userData.isHighlightOverlay && !obj.userData.isHoverOverlay && !obj.userData.isPivotHelper && !obj.userData.isBoxHelper && !obj.userData.isPlaneHelperMesh))) {
        const updateMat = (mat) => {
          if (!mat) return;
          if (!mat.userData) mat.userData = {};
          if (mat.userData.origModelOpacity === undefined) {
            mat.userData.origModelOpacity = mat.opacity !== undefined ? mat.opacity : 1.0;
            mat.userData.origModelTransparent = Boolean(mat.transparent);
            mat.userData.origModelDepthWrite = mat.depthWrite !== undefined ? mat.depthWrite : true;
          }
          if (opacityPercent >= 100) {
            mat.opacity = mat.userData.origModelOpacity;
            mat.transparent = mat.userData.origModelTransparent;
            mat.depthWrite = mat.userData.origModelDepthWrite;
          } else {
            mat.transparent = true;
            mat.opacity = (opacityPercent / 100) * mat.userData.origModelOpacity;
            mat.depthWrite = (mat.opacity >= 0.95);
          }
          mat.needsUpdate = true;
        };
        if (Array.isArray(obj.material)) {
          obj.material.forEach(updateMat);
        } else {
          updateMat(obj.material);
        }
      }
    });
    this.needsRender = true;
  }
  
  // Performance Safeguard & File Handling
  handleFileInput(fileOrFiles) {
    if (!fileOrFiles) return;
    const fileList = (fileOrFiles instanceof FileList || Array.isArray(fileOrFiles)) ? 
      Array.from(fileOrFiles) : [fileOrFiles];
    if (fileList.length === 0) return;

    // Find primary model file (.ifc, .glb, .gltf, .fbx, .dae, .obj)
    const primaryFile = fileList.find(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ext === 'ifc' || ext === 'glb' || ext === 'gltf' || ext === 'fbx' || ext === 'dae' || ext === 'obj';
    }) || fileList[0];

    const sizeMB = (primaryFile.size / (1024 * 1024)).toFixed(1);
    
    // Performance Guard Check
    if (primaryFile.size > 150 * 1024 * 1024) {
      this.showSafetyWarning(primaryFile, sizeMB, 'critical', fileList);
    } else if (primaryFile.size > 50 * 1024 * 1024) {
      this.showSafetyWarning(primaryFile, sizeMB, 'moderate', fileList);
    } else {
      this.processFiles(primaryFile, fileList);
    }
  }
  
  showSafetyWarning(primaryFile, sizeMB, level, allFiles = []) {
    const modal = document.getElementById('safety-modal');
    const msgEl = document.getElementById('safety-modal-msg');
    const optBtn = document.getElementById('safety-btn-optimize');
    const forceBtn = document.getElementById('safety-btn-force');
    
    if (level === 'critical') {
      msgEl.textContent = I18N.t('warnCriticalText', { size: sizeMB });
      optBtn.style.display = 'inline-block';
    } else {
      msgEl.textContent = I18N.t('warnLargeText', { size: sizeMB });
      optBtn.style.display = 'none';
    }
    
    modal.classList.add('active');
    
    forceBtn.onclick = () => {
      modal.classList.remove('active');
      this.processFiles(primaryFile, allFiles, false);
    };
    optBtn.onclick = () => {
      modal.classList.remove('active');
      this.processFiles(primaryFile, allFiles, true);
    };
    document.getElementById('safety-btn-cancel').onclick = () => {
      modal.classList.remove('active');
    };
  }

  // =========================================================================
  // UNIVERSAL BIM & ARCHITECTURAL CATEGORY / MATERIAL COLOR DIFFERENTIATION
  // Replicating Revit viewport "Consistent Colors / Shaded" standard shading
  // =========================================================================
  static BIMCategoryMaterials = {
    // 1. Windows, Curtain Wall Panels, Glazing (Semi-transparent Sky Blue Glass)
    GLAZING: {
      category: 'Window / Glazing',
      color: 0x7dd3fc,
      opacity: 0.35,
      transparent: true,
      depthWrite: false,
      roughness: 0.05,
      metalness: 0.1
    },
    // 2. Doors & Wood / Timber (Warm Architectural Wood Tone)
    DOOR: {
      category: 'Door',
      color: 0xb48256,
      opacity: 1.0,
      transparent: false,
      roughness: 0.7,
      metalness: 0.05
    },
    // 3. Walls (Warm Off-white Architectural Wall)
    WALL: {
      category: 'Wall',
      color: 0xece7de,
      opacity: 1.0,
      transparent: false,
      roughness: 0.75,
      metalness: 0.02
    },
    // 4. Floors / Slabs (Warm Concourse Stone / Floor Slab)
    SLAB: {
      category: 'Slab',
      color: 0xb8b3ad,
      opacity: 1.0,
      transparent: false,
      roughness: 0.6,
      metalness: 0.05
    },
    // 5. Structural Steel (Dark Cold Metallic Blue-Grey Framing, Trusses, Rails, Tubes)
    STEEL_FRAMING: {
      category: 'Structural Steel',
      color: 0x3b4754,
      opacity: 1.0,
      transparent: false,
      roughness: 0.45,
      metalness: 0.45
    },
    // 6. Concrete Beams (Clean Structural RC Light Grey)
    BEAM: {
      category: 'Beam',
      color: 0xcbd5e1,
      opacity: 1.0,
      transparent: false,
      roughness: 0.7,
      metalness: 0.05
    },
    // 7. Concrete Columns (Architectural Concrete Column Light Grey)
    COLUMN: {
      category: 'Column',
      color: 0xd1d5db,
      opacity: 1.0,
      transparent: false,
      roughness: 0.65,
      metalness: 0.05
    },
    // 8. Foundations / Pile Caps / Piles (Solid Structural Foundation Concrete)
    FOUNDATION: {
      category: 'Foundation',
      color: 0x94a3b8,
      opacity: 1.0,
      transparent: false,
      roughness: 0.8,
      metalness: 0.05
    },
    // 9. Roof (Dark Slate / Architectural Roof)
    ROOF: {
      category: 'Roof',
      color: 0x4b5563,
      opacity: 1.0,
      transparent: false,
      roughness: 0.6,
      metalness: 0.1
    },
    // 10. Stairs (Medium Slate Concrete Stair)
    STAIR: {
      category: 'Stair',
      color: 0x9ca3af,
      opacity: 1.0,
      transparent: false,
      roughness: 0.7,
      metalness: 0.05
    },
    // 11. Railing (Architectural Metal / Stainless Steel)
    RAILING: {
      category: 'Railing',
      color: 0x64748b,
      opacity: 1.0,
      transparent: false,
      roughness: 0.28,
      metalness: 0.82
    },
    // 12. Ceilings / Coverings (Clean Interior Ceiling Off-White)
    CEILING: {
      category: 'Ceiling',
      color: 0xf1f5f9,
      opacity: 1.0,
      transparent: false,
      roughness: 0.8,
      metalness: 0.02
    },
    // 13. MEP HVAC Ducts (Galvanized Metal)
    MEP_DUCT: {
      category: 'MEP Services',
      color: 0x94a3b8,
      opacity: 1.0,
      transparent: false,
      roughness: 0.35,
      metalness: 0.5
    },
    // 14. MEP Pipes (Industrial Piping Blue)
    MEP_PIPE: {
      category: 'MEP Services',
      color: 0x38bdf8,
      opacity: 1.0,
      transparent: false,
      roughness: 0.35,
      metalness: 0.4
    },
    // 15. MEP Cable Trays & Electrical (Amber / Industrial)
    MEP_ELECTRICAL: {
      category: 'MEP Services',
      color: 0xf59e0b,
      opacity: 1.0,
      transparent: false,
      roughness: 0.45,
      metalness: 0.2
    },
    // 16. Site & Civil (Asphalt Road / Pavement)
    ROAD: {
      category: 'Site & Terrain',
      color: 0x1e293b,
      opacity: 1.0,
      transparent: false,
      roughness: 0.85,
      metalness: 0.02
    },
    // 17. Landscape / Vegetation (Soft Natural Green)
    LANDSCAPE: {
      category: 'Site & Terrain',
      color: 0x22c55e,
      opacity: 1.0,
      transparent: false,
      roughness: 0.9,
      metalness: 0.0
    },
    // 18. Furniture (Warm Architectural Interior Tone)
    FURNITURE: {
      category: 'Furniture',
      color: 0xb48256,
      opacity: 1.0,
      transparent: false,
      roughness: 0.7,
      metalness: 0.05
    },
    // 19. Default Architectural Fallback
    DEFAULT: {
      category: 'Structure',
      color: 0xd1d5db,
      opacity: 1.0,
      transparent: false,
      roughness: 0.65,
      metalness: 0.05
    }
  };

  static StandardCategoryColors = {
    'Wall': '#ece7de',
    'Slab': '#b8b3ad',
    'Floor': '#b8b3ad',
    'Column': '#d1d5db',
    'Beam': '#cbd5e1',
    'Roof': '#4b5563',
    'Door': '#b48256',
    'Window / Glazing': '#7dd3fc',
    'Window': '#7dd3fc',
    'Curtain Wall': '#7dd3fc',
    'Stair': '#9ca3af',
    'Railing': '#64748b',
    'Structural Steel': '#3b4754',
    'Foundation': '#94a3b8',
    'MEP Services': '#38bdf8',
    'Site & Terrain': '#22c55e',
    'Furniture': '#b48256',
    'Ceiling': '#f1f5f9',
    'Structure': '#d1d5db',
    'Component': '#d1d5db',
    'Architectural / Generic': '#d1d5db'
  };

  applyBIMMaterialStyling(mesh, category, allText = '') {
    if (!mesh || !mesh.isMesh || !mesh.material) return;

    const D = BIMViewerApp.BIMCategoryMaterials;

    const isGreyscaleOrDefault = (col) => {
      if (!col) return true;
      const r = Math.round(col.r * 255);
      const g = Math.round(col.g * 255);
      const b = Math.round(col.b * 255);
      const delta = Math.max(r, g, b) - Math.min(r, g, b);
      return delta <= 18;
    };

    const processSingleMaterial = (m) => {
      if (!m) return m;

      // 1. If material already has a genuine texture map, preserve texture and ensure true-color base
      if (m.map) {
        m.color.setHex(0xffffff);
        m.side = THREE.DoubleSide;
        if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
          m.clippingPlanes = this.clippingEngine.clippingPlanes;
          m.clipShadows = true;
        }
        return m;
      }

      const matName = ((m.name || '')).toLowerCase();
      const nodeName = ((mesh.name || '')).toLowerCase();
      const combined = (matName + ' ' + nodeName + ' ' + allText).toLowerCase();

      // 2. Glass / Glazing detection (Windows, Skylights, Curtain Wall Glass)
      const isFrame = combined.includes('frame') || combined.includes('sash') || combined.includes('mullion') ||
                      combined.includes('casing') || combined.includes('border');
      const isGlass = combined.includes('glass') || combined.includes('glaz') || combined.includes('glazing') ||
                      combined.includes('pane') || combined.includes('clear') || combined.includes('skylight') ||
                      combined.includes('transp') || combined.includes('玻璃') || combined.includes('窗') ||
                      (category === 'Window / Glazing' && !isFrame) ||
                      (category === 'Curtain Wall' && !isFrame);

      if (isGlass) {
        return this.createOrUpdateStandardMaterial(m, D.GLAZING);
      }

      // 3. If original material has an explicit custom non-greyscale color, respect and preserve it!
      if (m.color && !isGreyscaleOrDefault(m.color)) {
        m.side = THREE.DoubleSide;
        if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
          m.clippingPlanes = this.clippingEngine.clippingPlanes;
          m.clipShadows = true;
        }
        return m;
      }

      // 4. Material-Specific Keyword Matching
      // a) Wood / Timber / Doors
      if (combined.includes('wood') || combined.includes('timber') || combined.includes('door') ||
          combined.includes('oak') || combined.includes('pine') || combined.includes('teak') ||
          combined.includes('cedar') || combined.includes('plywood') || combined.includes('木') || combined.includes('门')) {
        return this.createOrUpdateStandardMaterial(m, D.DOOR);
      }

      // b) Stainless Steel / Chrome / Polished Metal
      if (combined.includes('stainless') || combined.includes('chrome') || combined.includes('nickel') ||
          combined.includes('mirror') || combined.includes('polished') || combined.includes('不锈钢')) {
        return this.createOrUpdateStandardMaterial(m, {
          color: 0xd4d4d8, roughness: 0.22, metalness: 0.88, transparent: false, opacity: 1.0
        });
      }

      // c) Aluminium / Light Alloy
      if (combined.includes('aluminium') || combined.includes('aluminum') || combined.includes('alloy') || combined.includes('铝')) {
        return this.createOrUpdateStandardMaterial(m, {
          color: 0xcbd5e1, roughness: 0.38, metalness: 0.75, transparent: false, opacity: 1.0
        });
      }

      // d) Copper / Bronze / Brass / Gold
      if (combined.includes('copper') || combined.includes('bronze') || combined.includes('红铜') || combined.includes('青铜')) {
        return this.createOrUpdateStandardMaterial(m, {
          color: 0xb87333, roughness: 0.25, metalness: 0.85, transparent: false, opacity: 1.0
        });
      }
      if (combined.includes('brass') || combined.includes('gold') || combined.includes('黄铜') || combined.includes('金')) {
        return this.createOrUpdateStandardMaterial(m, {
          color: 0xd4af37, roughness: 0.25, metalness: 0.85, transparent: false, opacity: 1.0
        });
      }

      // e) Structural Steel / Iron / Truss / Frame / Mesh / Rebar
      if (combined.includes('steel') || combined.includes('metal') || combined.includes('iron') ||
          combined.includes('truss') || combined.includes('frame') || combined.includes('brace') ||
          combined.includes('mesh') || combined.includes('rebar') || combined.includes('shs') ||
          combined.includes('chs') || combined.includes('rhs') || combined.includes('钢') || combined.includes('铁') || combined.includes('桁架')) {
        return this.createOrUpdateStandardMaterial(m, D.STEEL_FRAMING);
      }

      // f) Concrete / Masonry / Stone / Brick
      if (combined.includes('brick') || combined.includes('砖')) {
        return this.createOrUpdateStandardMaterial(m, {
          color: 0x9a3412, roughness: 0.8, metalness: 0.02, transparent: false, opacity: 1.0
        });
      }
      if (combined.includes('concrete') || combined.includes('cement') || combined.includes('stone') ||
          combined.includes('masonry') || combined.includes('rock') || combined.includes('混凝土') || combined.includes('水泥') || combined.includes('石')) {
        if (category === 'Column') return this.createOrUpdateStandardMaterial(m, D.COLUMN);
        if (category === 'Slab') return this.createOrUpdateStandardMaterial(m, D.SLAB);
        return this.createOrUpdateStandardMaterial(m, D.BEAM);
      }

      // g) Landscape / Vegetation / Ground / Site
      if (combined.includes('grass') || combined.includes('turf') || combined.includes('lawn') ||
          combined.includes('vegetation') || combined.includes('landscape') || combined.includes('plant') ||
          combined.includes('tree') || combined.includes('leaf') || combined.includes('草') || combined.includes('绿化')) {
        return this.createOrUpdateStandardMaterial(m, D.LANDSCAPE);
      }
      if (combined.includes('water') || combined.includes('pool') || combined.includes('pond') || combined.includes('水')) {
        return this.createOrUpdateStandardMaterial(m, {
          color: 0x38bdf8, opacity: 0.6, transparent: true, roughness: 0.1, metalness: 0.2
        });
      }
      if (combined.includes('asphalt') || combined.includes('bitumen') || combined.includes('road') ||
          combined.includes('pave') || combined.includes('lane') || combined.includes('street') || combined.includes('沥青') || combined.includes('路')) {
        return this.createOrUpdateStandardMaterial(m, D.ROAD);
      }

      // h) MEP (Duct / Pipe / Cable / Electrical)
      if (combined.includes('duct') || combined.includes('hvac') || combined.includes('air') || combined.includes('风管')) {
        return this.createOrUpdateStandardMaterial(m, D.MEP_DUCT);
      }
      if (combined.includes('pipe') || combined.includes('plumb') || combined.includes('drain') ||
          combined.includes('sewer') || combined.includes('sprinkler') || combined.includes('水管') || combined.includes('管道')) {
        return this.createOrUpdateStandardMaterial(m, D.MEP_PIPE);
      }
      if (combined.includes('cable') || combined.includes('tray') || combined.includes('conduit') ||
          combined.includes('electr') || combined.includes('power') || combined.includes('桥架') || combined.includes('电')) {
        return this.createOrUpdateStandardMaterial(m, D.MEP_ELECTRICAL);
      }

      // i) Ceiling / Roof
      if (combined.includes('ceiling') || combined.includes('drywall') || combined.includes('plaster') ||
          combined.includes('gypsum') || combined.includes('吊顶') || combined.includes('天花')) {
        return this.createOrUpdateStandardMaterial(m, D.CEILING);
      }
      if (combined.includes('roof') || combined.includes('canopy') || combined.includes('tile') ||
          combined.includes('shingle') || combined.includes('屋顶') || combined.includes('屋面') || combined.includes('瓦')) {
        return this.createOrUpdateStandardMaterial(m, D.ROOF);
      }

      // 5. Fallback to Classified BIM Category Mapping
      switch (category) {
        case 'Wall':
          return this.createOrUpdateStandardMaterial(m, D.WALL);
        case 'Slab':
          return this.createOrUpdateStandardMaterial(m, D.SLAB);
        case 'Column':
          return this.createOrUpdateStandardMaterial(m, D.COLUMN);
        case 'Beam':
          return this.createOrUpdateStandardMaterial(m, D.BEAM);
        case 'Roof':
          return this.createOrUpdateStandardMaterial(m, D.ROOF);
        case 'Door':
          return this.createOrUpdateStandardMaterial(m, D.DOOR);
        case 'Window / Glazing':
        case 'Curtain Wall':
          return this.createOrUpdateStandardMaterial(m, D.GLAZING);
        case 'Stair':
          return this.createOrUpdateStandardMaterial(m, D.STAIR);
        case 'Railing':
          return this.createOrUpdateStandardMaterial(m, D.RAILING);
        case 'Structural Steel':
          return this.createOrUpdateStandardMaterial(m, D.STEEL_FRAMING);
        case 'Foundation':
          return this.createOrUpdateStandardMaterial(m, D.FOUNDATION);
        case 'MEP Services':
          return this.createOrUpdateStandardMaterial(m, D.MEP_PIPE);
        case 'Site & Terrain':
          return this.createOrUpdateStandardMaterial(m, D.LANDSCAPE);
        case 'Furniture':
          return this.createOrUpdateStandardMaterial(m, D.FURNITURE);
        default:
          return this.createOrUpdateStandardMaterial(m, D.DEFAULT);
      }
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(processSingleMaterial);
    } else {
      mesh.material = processSingleMaterial(mesh.material);
    }
  }

  createOrUpdateStandardMaterial(oldMat, def) {
    const isStd = oldMat && (oldMat.isMeshStandardMaterial || oldMat.isMeshPhysicalMaterial);
    const target = isStd ? oldMat : new THREE.MeshStandardMaterial({
      name: (oldMat && oldMat.name) || 'BIM_Standard_Mat'
    });

    target.color = new THREE.Color(def.color);
    target.roughness = def.roughness !== undefined ? def.roughness : 0.6;
    target.metalness = def.metalness !== undefined ? def.metalness : 0.05;
    target.transparent = Boolean(def.transparent);
    target.opacity = def.opacity !== undefined ? def.opacity : 1.0;
    target.depthWrite = def.depthWrite !== undefined ? def.depthWrite : true;
    target.side = THREE.DoubleSide;

    if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
      target.clippingPlanes = this.clippingEngine.clippingPlanes;
      target.clipShadows = true;
    }
    return target;
  }

  processFiles(mainFile, allFiles = [], optimize = false) {
    const ext = mainFile.name.split('.').pop().toLowerCase();
    this.showProgressModal(true, I18N.t('stageReading'), 10);
    
    // Build in-memory blob map for all accompanying files (.bin, .png, .jpg, .tga, etc.)
    const blobMap = new Map();
    allFiles.forEach(f => {
      try {
        const url = URL.createObjectURL(f);
        blobMap.set(f.name, url);
        blobMap.set(f.name.toLowerCase(), url);
      } catch (err) {
        console.warn("Could not create blob URL for file:", f.name, err);
      }
    });

    const manager = new THREE.LoadingManager();
    manager.addHandler(/\.tga$/i, new THREE.TGALoader(manager));
    manager.setURLModifier((url) => {
      if (typeof url === 'string') {
        const match = this.resolveFBXTexture(url, blobMap);
        if (match && match.url) {
          return match.url;
        }
        const clean = url.split('?')[0].split('#')[0];
        const filename = clean.split('/').pop().split('\\').pop();
        if (blobMap.has(filename)) {
          return blobMap.get(filename);
        }
        if (blobMap.has(filename.toLowerCase())) {
          return blobMap.get(filename.toLowerCase());
        }
      }
      return url;
    });

    manager.isTGA = (fileName, resolvedURL) => {
      const match = this.resolveFBXTexture(fileName, blobMap);
      if (match && match.key) {
        return match.key.toLowerCase().endsWith('.tga');
      }
      return (fileName || '').toLowerCase().endsWith('.tga');
    };

    const reader = new FileReader();
    
    if (ext === 'glb' || ext === 'gltf') {
      reader.onload = (e) => {
        this.updateProgress(I18N.t('stageParsing'), 40);
        const arrayBuffer = e.target.result;
        const loader = new THREE.GLTFLoader(manager);
        
        loader.parse(arrayBuffer, '', (gltf) => {
          this.updateProgress(I18N.t('stageMeshing'), 80);
          this.clearModel();
          
          const model = gltf.scene;
          model.name = mainFile.name;
          
          // Extract deep hierarchy, categories, levels & metadata from GLTF Scene Graph
          let meshIndex = 0;
          const classifyNode = (node, parentStructure = null, parentPath = []) => {
            const currentPath = [...parentPath];
            if (node.name && node.name !== 'Scene' && node.name !== 'RootNode') {
              currentPath.push(node.name);
            }

            // Determine if this node represents a structure or sub-assembly
            let structure = parentStructure;
            if (!structure && node !== model) {
              if (node.isGroup || (node.children && node.children.length > 0 && !node.isMesh)) {
                if (node.name && node.name !== 'Scene') {
                  structure = node.name;
                }
              }
            }

            if (node.isMesh) {
              meshIndex++;
              node.castShadow = true;
              node.receiveShadow = true;
              if (node.material) {
                if (Array.isArray(node.material)) {
                  node.material.forEach(m => m.side = THREE.DoubleSide);
                } else {
                  node.material.side = THREE.DoubleSide;
                }
              }

              // Compute bounding box
              const box = new THREE.Box3().setFromObject(node);
              const size = new THREE.Vector3();
              box.getSize(size);

              // 1. Structure Grouping: use highest ancestor group or fallback
              const finalStructure = structure || 
                (currentPath.length > 1 ? currentPath[0] : (mainFile.name.replace(/\.[^/.]+$/, "") || "Model"));

              // 2. Semantic Category Extraction from node/mesh/material names & lineage
              const allText = [
                node.name || '',
                (node.parent && node.parent.name) || '',
                (node.material && node.material.name) || '',
                currentPath.join(' ')
              ].join(' ').toLowerCase();

              let category = 'Component';
              if (/wall|墙/i.test(allText)) category = 'Wall';
              else if (/slab|floor|deck|地坪|楼板|地面/i.test(allText)) category = 'Slab';
              else if (/column|pillar|post|立柱|柱/i.test(allText)) category = 'Column';
              else if (/beam|girder|joist|大梁|横梁|梁/i.test(allText)) category = 'Beam';
              else if (/roof|canopy|ceiling|屋顶|屋面|天花|雨棚/i.test(allText)) category = 'Roof';
              else if (/door|gate|门/i.test(allText)) category = 'Door';
              else if (/curtain|幕墙/i.test(allText)) category = 'Curtain Wall';
              else if (/window|glass|glazing|窗|玻璃/i.test(allText)) category = 'Window / Glazing';
              else if (/stair|step|tread|楼梯|踏步/i.test(allText)) category = 'Stair';
              else if (/railing|parapet|balustrade|栏杆|护栏/i.test(allText)) category = 'Railing';
              else if (/pipe|duct|conduit|hvac|plumb|风管|水管|管道|机电/i.test(allText)) category = 'MEP Services';
              else if (/truss|steel|frame|brace|桁架|钢架|钢结构/i.test(allText)) category = 'Structural Steel';
              else if (/foundation|footing|pile|承台|桩基|地基|基础/i.test(allText)) category = 'Foundation';
              else if (/furniture|chair|table|desk|seat|bed|家具|桌|椅/i.test(allText)) category = 'Furniture';
              else if (/site|terrain|topo|earth|ground|场地|地形/i.test(allText)) category = 'Site & Terrain';
              else if (node.parent && node.parent.name && node.parent.name !== 'Scene') {
                category = node.parent.name;
              }

              // Apply Architectural Material & Color Differentiation
              this.applyBIMMaterialStyling(node, category, allText);

              // 3. Level Extraction
              let level = 'Ground Level';
              const levelMatch = allText.match(/(level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+|lvl\s*\d+|b\d+|1f|2f|3f|4f|5f|地下\s*\d+层|地上\s*\d+层|\d+层|\d+楼)/i);
              if (levelMatch) {
                level = levelMatch[0].toUpperCase();
              } else {
                const y = (box.min.y + box.max.y) / 2;
                if (y < -0.5) level = 'Basement Level';
                else if (y < 4.0) level = 'Level 1 (Ground)';
                else if (y < 8.0) level = 'Level 2';
                else if (y < 12.0) level = 'Level 3';
                else if (y >= 12.0) level = `Upper Level (${y.toFixed(1)}m)`;
              }

              // 4. Element Clean Name
              let elemName = node.name || '';
              if (!elemName || elemName.startsWith('mesh_') || elemName.startsWith('node_') || elemName === 'Mesh') {
                elemName = `${category} #${meshIndex}`;
              }

              node.userData = {
                structure: finalStructure,
                category: category,
                rawCategory: category,
                element: elemName,
                level: level,
                dimensions: `${size.x.toFixed(2)}m × ${size.z.toFixed(2)}m`,
                height: `${size.y.toFixed(2)} m`,
                rlMin: box.min.y.toFixed(2),
                rlMax: box.max.y.toFixed(2),
                guid: node.uuid,
                isGLTF: true,
                nodePath: currentPath
              };
            }

            // Traverse children
            if (node.children && node.children.length > 0) {
              node.children.forEach(child => classifyNode(child, structure, currentPath));
            }
          };

          classifyNode(model);
          
          document.getElementById('project-title-text').textContent = mainFile.name;
          this.setModel(model);

          const stats = this.calculateModelStats(model);
          const sizeStr = mainFile.size > 1048576 ? 
            `${(mainFile.size / 1048576).toFixed(2)} MB` : 
            `${(mainFile.size / 1024).toFixed(1)} KB`;
          const gltfAsset = (gltf && gltf.asset) || {};
          const gltfSoftware = (gltfAsset.generator && gltfAsset.generator.trim()) || null;
          const gltfVer = gltfAsset.version ? `glTF ${gltfAsset.version}` : 'glTF 2.0';
          const unitAxis = this.formatGLTFUnitAndAxis();

          this.currentModelInfo = {
            fileName: mainFile.name,
            format: gltfVer,
            formatVersion: gltfVer,
            unitStr: unitAxis.en,
            unitStrZh: unitAxis.zh,
            schema: "glTF 2.0 Container",
            fileSize: sizeStr,
            filePath: mainFile.webkitRelativePath || `${mainFile.name} (Local Storage / Sandboxed)`,
            lastModified: mainFile.lastModified ? new Date(mainFile.lastModified).toLocaleString() : null,
            loadedTime: new Date().toLocaleString(),
            originalSoftware: gltfSoftware,
            stats: stats
          };
          this.updateModelSubtitle();
          this.renderModelInfoInspector();

          // Animation initialization (GLTF)
          const animations = (gltf && gltf.animations && gltf.animations.length > 0) ? gltf.animations : [];
          if (animations && animations.length > 0) {
            this.initAnimationPlayer(model, animations);
          } else {
            this.hideAnimationPlayer();
          }

          this.showProgressModal(false);
        }, (err) => {
          console.error("GLTF Parse Error:", err);
          this.showProgressModal(false);
          showToast("Failed to parse GLB: " + err.message, "danger");
        });
      };
      reader.onerror = (err) => {
        this.showProgressModal(false);
        showToast("Error reading file: " + err.message, "danger");
      };
      reader.readAsArrayBuffer(mainFile);
      
    } else if (ext === 'ifc') {
      reader.onload = (e) => {
        const text = e.target.result;
        
        try {
          const rootGroup = this.ifcParser.parseText(text, (percent, msg) => {
            this.updateProgress(msg, Math.round(percent * 100));
          });
          
          let meshCount = 0;
          rootGroup.traverse(o => { if (o.isMesh) meshCount++; });
          if (meshCount === 0) {
            this.showProgressModal(false);
            showToast("IFC parsed but 0 meshes could be generated", "warning");
            return;
          }
          
          this.clearModel();
          const titleEl = document.getElementById('project-title-text');
          titleEl.textContent = mainFile.name;
          titleEl.title = mainFile.name;
          
          this.setModel(rootGroup);

          const stats = this.calculateModelStats(rootGroup);
          const meta = this.ifcParser.fileMetadata || {};
          
          let fileLoc = "Local File (Browser Sandboxed)";
          if (mainFile.webkitRelativePath) {
            fileLoc = mainFile.webkitRelativePath;
          } else if (meta.headerFileName && (meta.headerFileName.includes('/') || meta.headerFileName.includes('\\'))) {
            fileLoc = `${meta.headerFileName} (Source Path)`;
          } else {
            fileLoc = `${mainFile.name} (Local Storage / Sandboxed)`;
          }

          const sizeStr = mainFile.size > 1048576 ? 
            `${(mainFile.size / 1048576).toFixed(2)} MB` : 
            `${(mainFile.size / 1024).toFixed(1)} KB`;

          const unitAxis = this.formatIFCUnitAndAxis(this.ifcParser.unitScale || 1.0);
          const gisCrs = (this.ifcParser.gis || (meta && meta.gis)) || null;

          this.currentModelInfo = {
            fileName: mainFile.name,
            format: `IFC (${this.ifcParser.formattedSchema})`,
            formatVersion: `IFC (${this.ifcParser.formattedSchema})`,
            schema: this.ifcParser.formattedSchema,
            rawSchema: this.ifcParser.schema,
            unitStr: unitAxis.en,
            unitStrZh: unitAxis.zh,
            gis: gisCrs,
            fileSize: sizeStr,
            filePath: fileLoc,
            lastModified: mainFile.lastModified ? new Date(mainFile.lastModified).toLocaleString() : null,
            loadedTime: new Date().toLocaleString(),
            originalSoftware: this.ifcParser.software,
            mvd: this.ifcParser.mvd,
            exportTimestamp: meta.exportTimestamp || null,
            preprocessor: meta.preprocessor || null,
            author: meta.author || null,
            organization: meta.organization || null,
            originatingSystem: meta.originatingSystem || null,
            authorization: meta.authorization || null,
            projectName: meta.projectName || null,
            projectDescription: meta.projectDescription || null,
            projectPhase: meta.projectPhase || null,
            stats: stats
          };
          this.updateModelSubtitle();
          this.renderModelInfoInspector();

          this.showProgressModal(false);
        } catch (err) {
          console.error(err);
          this.showProgressModal(false);
          showToast("IFC parsing error: " + err.message, "danger");
        }
      };
      reader.onerror = (err) => {
        this.showProgressModal(false);
        showToast("Error reading file: " + err.message, "danger");
      };
      reader.readAsText(mainFile);
      
    } else if (ext === 'fbx') {
      reader.onload = (e) => {
        this.updateProgress(I18N.t('stageParsing'), 30);
        const arrayBuffer = e.target.result;

        try {
          const loader = new THREE.FBXLoader(manager);
          // Inspect FBX structure, embedded textures, unit scale, and up-axis
          const fbxInfo = loader.inspect(arrayBuffer);

          // Check if there are missing external textures
          const missingTextures = [];
          if (fbxInfo.textures && fbxInfo.textures.length > 0) {
            fbxInfo.textures.forEach(tex => {
              if (!tex.isEmbedded) {
                const res = this.resolveFBXTexture(tex.basename || tex.rawName, blobMap);
                if (!res || !res.matched) {
                  missingTextures.push(tex);
                }
              }
            });
          }

          if (missingTextures.length > 0) {
            // Prompt user with interactive texture assembly modal
            this.showProgressModal(false);
            this.showTextureModal(fbxInfo, blobMap, (skipTextures) => {
              this.showProgressModal(true, I18N.t('stageMeshing'), 60);
              setTimeout(() => {
                this.loadFBXModel(arrayBuffer, fbxInfo, manager, mainFile.name, blobMap, skipTextures, mainFile);
              }, 40);
            });
          } else {
            // All textures are embedded or already provided in blobMap
            this.updateProgress(I18N.t('stageMeshing'), 60);
            setTimeout(() => {
              this.loadFBXModel(arrayBuffer, fbxInfo, manager, mainFile.name, blobMap, false, mainFile);
            }, 40);
          }
        } catch (err) {
          console.error("FBX Inspection / Load Error:", err);
          this.showProgressModal(false);
          showToast("Failed to process FBX: " + err.message, "danger");
        }
      };
      reader.onerror = (err) => {
        this.showProgressModal(false);
        showToast("Error reading file: " + err.message, "danger");
      };
      reader.readAsArrayBuffer(mainFile);

    } else if (ext === 'dae') {
      reader.onload = (e) => {
        this.updateProgress(I18N.t('stageParsing'), 30);
        const daeText = e.target.result;

        try {
          const daeInfo = this.inspectDAE(daeText);

          // Check if there are missing external textures
          const missingTextures = [];
          if (daeInfo.textures && daeInfo.textures.length > 0) {
            daeInfo.textures.forEach(tex => {
              const res = this.resolveFBXTexture(tex.basename || tex.rawName, blobMap);
              if (!res || !res.matched) {
                missingTextures.push(tex);
              }
            });
          }

          if (missingTextures.length > 0) {
            // Prompt user with interactive texture assembly modal
            this.showProgressModal(false);
            this.showTextureModal({ textures: missingTextures }, blobMap, (skipTextures) => {
              this.showProgressModal(true, I18N.t('stageMeshing'), 60);
              setTimeout(() => {
                this.loadDAEModel(daeText, daeInfo, manager, mainFile.name, blobMap, skipTextures, mainFile);
              }, 40);
            });
          } else {
            // All textures are provided or no external textures required
            this.updateProgress(I18N.t('stageMeshing'), 60);
            setTimeout(() => {
              this.loadDAEModel(daeText, daeInfo, manager, mainFile.name, blobMap, false, mainFile);
            }, 40);
          }
        } catch (err) {
          console.error("DAE Inspection / Load Error:", err);
          this.showProgressModal(false);
          showToast("Failed to process DAE: " + err.message, "danger");
        }
      };
      reader.onerror = (err) => {
        this.showProgressModal(false);
        showToast("Error reading file: " + err.message, "danger");
      };
      reader.readAsText(mainFile);

    } else if (ext === 'obj') {
      // Check if there is an accompanying .mtl file in allFiles or blobMap
      const mtlFile = allFiles.find(f => f.name.toLowerCase().endsWith('.mtl'));
      if (mtlFile) {
        this.updateProgress(I18N.t('stageParsing'), 25);
        const mtlReader = new FileReader();
        mtlReader.onload = (me) => {
          const mtlText = me.target.result;
          reader.onload = (oe) => {
            const objText = oe.target.result;
            this.updateProgress(I18N.t('stageMeshing'), 60);
            setTimeout(() => {
              this.loadOBJModel(objText, mtlText, manager, mainFile.name, blobMap, false, mainFile);
            }, 40);
          };
          reader.onerror = (err) => {
            this.showProgressModal(false);
            showToast("Error reading OBJ file: " + err.message, "danger");
          };
          reader.readAsText(mainFile);
        };
        mtlReader.onerror = (err) => {
          console.warn("MTL read error, continuing with standalone OBJ:", err);
          reader.onload = (oe) => {
            const objText = oe.target.result;
            this.loadOBJModel(objText, null, manager, mainFile.name, blobMap, false, mainFile);
          };
          reader.readAsText(mainFile);
        };
        mtlReader.readAsText(mtlFile);
      } else {
        reader.onload = (e) => {
          const objText = e.target.result;
          this.updateProgress(I18N.t('stageMeshing'), 60);
          setTimeout(() => {
            this.loadOBJModel(objText, null, manager, mainFile.name, blobMap, false, mainFile);
          }, 40);
        };
        reader.onerror = (err) => {
          this.showProgressModal(false);
          showToast("Error reading OBJ file: " + err.message, "danger");
        };
        reader.readAsText(mainFile);
      }

    } else {
      this.showProgressModal(false);
      showToast("Unsupported file format. Please choose .IFC, .GLB, .FBX, .DAE, or .OBJ", "danger");
    }
  }

  resolveFBXTexture(rawName, blobMap) {
    if (!rawName || !blobMap) return null;
    const clean = rawName.split('?')[0].split('#')[0];
    const basename = clean.split('/').pop().split('\\').pop();
    if (!basename) return null;

    // 1. Exact match
    if (blobMap.has(basename)) {
      return { matched: true, key: basename, url: blobMap.get(basename) };
    }
    // 2. Case-insensitive match
    const lower = basename.toLowerCase();
    if (blobMap.has(lower)) {
      return { matched: true, key: lower, url: blobMap.get(lower) };
    }

    // 3. Extension swap fallback (.png, .jpg, .jpeg, .webp, .bmp, .tga, .tif, .tiff)
    const dotIdx = lower.lastIndexOf('.');
    const stem = dotIdx !== -1 ? lower.slice(0, dotIdx) : lower;
    const candidateExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tga', '.tif', '.tiff'];
    for (const ext of candidateExts) {
      const candidate = stem + ext;
      if (blobMap.has(candidate)) {
        return { matched: true, key: candidate, url: blobMap.get(candidate), fallbackExt: ext };
      }
    }

    // 4. Fuzzy end-match in blobMap keys (e.g. subfolder prefix)
    for (const [k, url] of blobMap.entries()) {
      const keyClean = k.toLowerCase().split('/').pop().split('\\').pop();
      if (keyClean === lower) {
        return { matched: true, key: k, url: url };
      }
      const keyStem = keyClean.lastIndexOf('.') !== -1 ? keyClean.slice(0, keyClean.lastIndexOf('.')) : keyClean;
      if (keyStem === stem) {
        return { matched: true, key: k, url: url };
      }
    }

    return null;
  }

  showTextureModal(fbxInfo, blobMap, onComplete) {
    const modal = document.getElementById('texture-modal');
    if (!modal) {
      if (onComplete) onComplete(true);
      return;
    }

    const dropzone = document.getElementById('texture-dropzone');
    const fileInput = document.getElementById('texture-file-input');
    const browseBtn = document.getElementById('texture-browse-btn');
    const checklist = document.getElementById('texture-checklist');
    const statsEl = document.getElementById('texture-match-stats');
    const skipBtn = document.getElementById('texture-btn-skip');
    const cancelBtn = document.getElementById('texture-btn-cancel');
    const confirmBtn = document.getElementById('texture-btn-confirm');

    const allTextures = (fbxInfo && fbxInfo.textures) ? fbxInfo.textures : [];

    const renderChecklist = () => {
      checklist.innerHTML = '';
      let readyCount = 0;
      const totalCount = allTextures.length;

      allTextures.forEach(tex => {
        const itemEl = document.createElement('div');
        itemEl.className = 'texture-check-item';

        const leftEl = document.createElement('div');
        leftEl.className = 'texture-check-left';

        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('width', '16');
        iconSvg.setAttribute('height', '16');
        iconSvg.style.flexShrink = '0';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'texture-file-name';
        nameSpan.textContent = tex.basename || tex.rawName;
        nameSpan.title = tex.rawName || tex.basename;

        const badge = document.createElement('span');
        badge.className = 'texture-badge';

        if (tex.isEmbedded) {
          readyCount++;
          itemEl.classList.add('ready');
          iconSvg.innerHTML = '<path fill="var(--accent)" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h4v4H7zm6 0h4v4h-4zm-6 6h4v4H7zm6 0h4v4h-4z"/>';
          badge.classList.add('embedded');
          badge.textContent = I18N.t('textureStatusEmbedded') || 'Embedded';
          leftEl.appendChild(iconSvg);
          leftEl.appendChild(nameSpan);
        } else {
          const match = this.resolveFBXTexture(tex.basename || tex.rawName, blobMap);
          if (match && match.matched) {
            readyCount++;
            itemEl.classList.add('ready');
            iconSvg.innerHTML = '<path fill="var(--success)" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
            badge.classList.add('ready');
            badge.textContent = I18N.t('textureStatusReady') || 'Ready';

            leftEl.appendChild(iconSvg);
            leftEl.appendChild(nameSpan);

            if (match.key && match.key !== (tex.basename || '').toLowerCase() && match.key !== tex.basename) {
              const matchInfo = document.createElement('span');
              matchInfo.className = 'texture-matched-info';
              matchInfo.textContent = `(${match.key})`;
              leftEl.appendChild(matchInfo);
            }
          } else {
            itemEl.classList.add('pending');
            iconSvg.innerHTML = '<path fill="#f59e0b" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>';
            badge.classList.add('pending');
            badge.textContent = I18N.t('textureStatusPending') || 'Pending';
            leftEl.appendChild(iconSvg);
            leftEl.appendChild(nameSpan);
          }
        }

        itemEl.appendChild(leftEl);
        itemEl.appendChild(badge);
        checklist.appendChild(itemEl);
      });

      if (statsEl) {
        statsEl.textContent = I18N.t('textureStatsReady', { ready: readyCount, total: totalCount });
      }
    };

    const addFiles = (files) => {
      const fileArr = Array.from(files || []);
      let added = 0;
      fileArr.forEach(f => {
        try {
          const url = URL.createObjectURL(f);
          blobMap.set(f.name, url);
          blobMap.set(f.name.toLowerCase(), url);
          added++;
        } catch (err) {}
      });
      if (added > 0) {
        renderChecklist();
        showToast(`Added ${added} texture file(s)`, 'info');
      }
    };

    // Event listeners
    if (browseBtn && fileInput) {
      browseBtn.onclick = (e) => {
        e.stopPropagation();
        fileInput.click();
      };
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files.length > 0) {
          addFiles(fileInput.files);
          fileInput.value = '';
        }
      };
    }

    if (dropzone) {
      dropzone.onclick = () => {
        if (fileInput) fileInput.click();
      };

      const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      };
      const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      };
      const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files) {
          addFiles(e.dataTransfer.files);
        }
      };

      dropzone.ondragover = handleDragOver;
      dropzone.ondragleave = handleDragLeave;
      dropzone.ondrop = handleDrop;
    }

    // Modal buttons
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        modal.classList.remove('active');
        if (onComplete) onComplete(false);
      };
    }

    if (skipBtn) {
      skipBtn.onclick = () => {
        modal.classList.remove('active');
        if (onComplete) onComplete(true);
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.classList.remove('active');
        showToast(I18N.t('btnCancel') || 'Canceled', 'info');
      };
    }

    modal.classList.add('active');
    renderChecklist();
  }

  loadFBXModel(arrayBuffer, fbxInfo, manager, modelName, blobMap, skipTextures = false, primaryFile = null) {
    try {
      const loader = new THREE.FBXLoader(manager);
      loader.skipTextures = skipTextures;

      // Parse either pre-parsed tree or buffer
      const model = loader.parse(fbxInfo && fbxInfo.tree ? fbxInfo.tree : arrayBuffer);
      model.name = modelName;

      // Unit Scale Normalization (FBX default unit is cm)
      const unitScale = (fbxInfo && typeof fbxInfo.unitScale === 'number') ? fbxInfo.unitScale : 1.0;
      const scaleToMeters = unitScale * 0.01;
      model.scale.set(scaleToMeters, scaleToMeters, scaleToMeters);
      model.updateMatrixWorld(true);

      // Coordinate / UpAxis Normalization
      // In Three.js viewer: Y is Up, X is Easting, Z is Northing
      if (fbxInfo && fbxInfo.upAxis === 2) {
        // Z-up FBX: rotate -90 deg on X so Z becomes Y-up
        model.rotation.x = -Math.PI / 2;
        model.updateMatrixWorld(true);
      } else if (fbxInfo && fbxInfo.upAxis === 0) {
        // X-up FBX: rotate -90 deg on Z so X becomes Y-up
        model.rotation.z = -Math.PI / 2;
        model.updateMatrixWorld(true);
      }

      // Collect all meshes
      const allMeshes = [];
      model.traverse(node => {
        if (node.isMesh) allMeshes.push(node);
      });

      if (allMeshes.length === 0) {
        this.showProgressModal(false);
        showToast("FBX parsed but 0 meshes could be found", "warning");
        return;
      }

      // Dual-Mode Hybrid Hierarchy: Check for BIM keywords
      const bimPattern = /wall|slab|floor|deck|column|pillar|beam|girder|joist|roof|canopy|ceiling|door|gate|curtain|window|glass|glazing|stair|step|railing|parapet|pipe|duct|conduit|hvac|plumb|truss|steel|foundation|footing|pile|furniture|site|terrain|topo|ground|level|storey|story|lvl|1f|2f|3f|4f|地下|地上|层|楼|墙|板|柱|梁|顶|门|窗|梯|栏|管/i;

      let hasBIMKeywords = false;
      for (const mesh of allMeshes) {
        const checkStr = `${mesh.name || ''} ${(mesh.parent && mesh.parent.name) || ''} ${(mesh.material && mesh.material.name) || ''}`;
        if (bimPattern.test(checkStr)) {
          hasBIMKeywords = true;
          break;
        }
      }

      let meshIndex = 0;
      const classifyNode = (node, parentStructure = null, parentPath = []) => {
        const currentPath = [...parentPath];
        if (node.name && node.name !== 'Scene' && node.name !== 'RootNode') {
          currentPath.push(node.name);
        }

        let structure = parentStructure;
        if (!structure && node !== model) {
          if (node.isGroup || (node.children && node.children.length > 0 && !node.isMesh)) {
            if (node.name && node.name !== 'Scene') {
              structure = node.name;
            }
          }
        }

        if (node.isMesh) {
          meshIndex++;
          node.castShadow = true;
          node.receiveShadow = true;
          if (node.material) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach(m => {
              m.side = THREE.DoubleSide;
              if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
                m.clippingPlanes = this.clippingEngine.clippingPlanes;
                m.clipShadows = true;
              }
            });
          }

          // Compute world bounding box for elevation and dimensions
          const box = new THREE.Box3().setFromObject(node);
          const size = new THREE.Vector3();
          box.getSize(size);

          const finalStructure = structure || 
            (currentPath.length > 1 ? currentPath[0] : (modelName.replace(/\.[^/.]+$/, "") || "Model"));

          let category = 'Component';
          const allText = [
            node.name || '',
            (node.parent && node.parent.name) || '',
            (node.material && node.material.name) || '',
            currentPath.join(' ')
          ].join(' ').toLowerCase();

          if (hasBIMKeywords) {
            if (/wall|墙/i.test(allText)) category = 'Wall';
            else if (/slab|floor|deck|地坪|楼板|地面/i.test(allText)) category = 'Slab';
            else if (/column|pillar|post|立柱|柱/i.test(allText)) category = 'Column';
            else if (/beam|girder|joist|大梁|横梁|梁/i.test(allText)) category = 'Beam';
            else if (/roof|canopy|ceiling|屋顶|屋面|天花|雨棚/i.test(allText)) category = 'Roof';
            else if (/door|gate|门/i.test(allText)) category = 'Door';
            else if (/curtain|幕墙/i.test(allText)) category = 'Curtain Wall';
            else if (/window|glass|glazing|窗|玻璃/i.test(allText)) category = 'Window / Glazing';
            else if (/stair|step|tread|楼梯|踏步/i.test(allText)) category = 'Stair';
            else if (/railing|parapet|balustrade|栏杆|护栏/i.test(allText)) category = 'Railing';
            else if (/pipe|duct|conduit|hvac|plumb|风管|水管|管道|机电/i.test(allText)) category = 'MEP Services';
            else if (/truss|steel|frame|brace|桁架|钢架|钢结构/i.test(allText)) category = 'Structural Steel';
            else if (/foundation|footing|pile|承台|桩基|地基|基础/i.test(allText)) category = 'Foundation';
            else if (/furniture|chair|table|desk|seat|bed|家具|桌|椅/i.test(allText)) category = 'Furniture';
            else if (/site|terrain|topo|earth|ground|场地|地形/i.test(allText)) category = 'Site & Terrain';
            else if (node.parent && node.parent.name && node.parent.name !== 'Scene') {
              category = node.parent.name;
            }
          } else {
            // Raw Scene Graph naming
            if (node.parent && node.parent.name && node.parent.name !== 'Scene' && node.parent.name !== 'RootNode') {
              category = node.parent.name;
            } else if (node.material && node.material.name) {
              category = node.material.name;
            } else {
              category = finalStructure;
            }
          }

          // Apply Architectural Material & Color Differentiation
          this.applyBIMMaterialStyling(node, category, allText);

          // Level calculation
          let level = 'Ground Level';
          const levelMatch = allText.match(/(level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+|lvl\s*\d+|b\d+|1f|2f|3f|4f|5f|地下\s*\d+层|地上\s*\d+层|\d+层|\d+楼)/i);
          if (levelMatch) {
            level = levelMatch[0].toUpperCase();
          } else {
            const y = (box.min.y + box.max.y) / 2;
            if (y < -0.5) level = 'Basement Level';
            else if (y < 4.0) level = 'Level 1 (Ground)';
            else if (y < 8.0) level = 'Level 2';
            else if (y < 12.0) level = 'Level 3';
            else if (y >= 12.0) level = `Upper Level (${y.toFixed(1)}m)`;
          }

          let elemName = node.name || '';
          if (!elemName || elemName.startsWith('mesh_') || elemName.startsWith('node_') || elemName === 'Mesh') {
            elemName = `${category} #${meshIndex}`;
          }

          node.userData = {
            structure: finalStructure,
            category: category,
            rawCategory: category,
            element: elemName,
            level: level,
            dimensions: `${size.x.toFixed(2)}m × ${size.z.toFixed(2)}m`,
            height: `${size.y.toFixed(2)} m`,
            rlMin: box.min.y.toFixed(2),
            rlMax: box.max.y.toFixed(2),
            guid: node.uuid,
            isFBX: true,
            nodePath: currentPath
          };
        }

        if (node.children && node.children.length > 0) {
          node.children.forEach(child => classifyNode(child, structure, currentPath));
        }
      };

      classifyNode(model);

      this.clearModel();
      document.getElementById('project-title-text').textContent = modelName;
      this.setModel(model);

      const stats = this.calculateModelStats(model);
      const fileObj = primaryFile || (fbxInfo && fbxInfo.file) || null;
      const sizeStr = fileObj && fileObj.size > 1048576 ? 
        `${(fileObj.size / 1048576).toFixed(2)} MB` : 
        (fileObj && fileObj.size ? `${(fileObj.size / 1024).toFixed(1)} KB` : "N/A");

      const fbxVer = this.formatFBXVersion(fbxInfo && fbxInfo.version, fbxInfo ? fbxInfo.isBinary : true);
      const unitAxis = this.formatFBXUnitAndAxis(unitScale, fbxInfo ? fbxInfo.upAxis : 1);
      const fbxCreator = (fbxInfo && fbxInfo.creator && fbxInfo.creator.trim()) || null;
      const fbxGis = (fbxInfo && fbxInfo.gis) || null;

      this.currentModelInfo = {
        fileName: modelName,
        format: fbxVer,
        formatVersion: fbxVer,
        unitStr: unitAxis.en,
        unitStrZh: unitAxis.zh,
        schema: `FBX (Unit: ${unitScale} cm)`,
        gis: fbxGis,
        fileSize: sizeStr,
        filePath: (fileObj && fileObj.webkitRelativePath) || `${modelName} (Local Storage / Sandboxed)`,
        lastModified: fileObj && fileObj.lastModified ? new Date(fileObj.lastModified).toLocaleString() : null,
        loadedTime: new Date().toLocaleString(),
        originalSoftware: fbxCreator,
        stats: stats
      };
      this.updateModelSubtitle();
      this.renderModelInfoInspector();

      // Animation initialization (FBX)
      const animations = (model && model.animations && model.animations.length > 0) ? model.animations : [];
      if (animations && animations.length > 0) {
        this.initAnimationPlayer(model, animations);
      } else {
        this.hideAnimationPlayer();
      }

      this.showProgressModal(false);

      if (skipTextures) {
        showToast(I18N.t('textureToastSkipped'), 'info');
      } else {
        const texCount = (fbxInfo && fbxInfo.textures) ? fbxInfo.textures.length : 0;
        if (texCount > 0) {
          showToast(I18N.t('textureToastSuccess', { count: texCount }), 'success');
        }
      }
    } catch (err) {
      console.error("FBX Load Exception:", err);
      this.showProgressModal(false);
      showToast("Error loading FBX model: " + err.message, "danger");
    }
  }

  inspectDAE(daeText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(daeText, "application/xml");

    // Version
    const colladaNode = xmlDoc.querySelector("COLLADA");
    const version = (colladaNode && colladaNode.getAttribute("version")) || "1.4.1";

    // Unit & Up Axis
    let unitMeter = 1.0;
    const unitNode = xmlDoc.querySelector("asset > unit, unit");
    if (unitNode && unitNode.hasAttribute("meter")) {
      unitMeter = parseFloat(unitNode.getAttribute("meter")) || 1.0;
    }
    const unitName = (unitNode && unitNode.getAttribute("name")) || "meter";

    let upAxis = "Y_UP";
    const upAxisNode = xmlDoc.querySelector("asset > up_axis, up_axis");
    if (upAxisNode && upAxisNode.textContent) {
      upAxis = upAxisNode.textContent.trim().toUpperCase();
    }

    // Asset Metadata
    const authorNode = xmlDoc.querySelector("asset > contributor > author, contributor > author, author");
    const toolNode = xmlDoc.querySelector("asset > contributor > authoring_tool, contributor > authoring_tool, authoring_tool");
    const commentsNode = xmlDoc.querySelector("asset > contributor > comments, contributor > comments, comments");
    const createdNode = xmlDoc.querySelector("asset > created, created");
    const modifiedNode = xmlDoc.querySelector("asset > modified, modified");

    // GIS / Geolocation
    let gis = null;
    const geoNode = xmlDoc.querySelector("asset > coverage > geographic_location, geographic_location");
    if (geoNode) {
      const lat = geoNode.querySelector("latitude");
      const lon = geoNode.querySelector("longitude");
      if (lat && lon) gis = `Lat ${parseFloat(lat.textContent).toFixed(4)}°, Lon ${parseFloat(lon.textContent).toFixed(4)}°`;
    }
    if (!gis) {
      const geTech = xmlDoc.querySelector("extra > technique[profile='GOOGLEEARTH'], technique[profile='GOOGLEEARTH']");
      if (geTech) {
        const lat = geTech.querySelector("latitude");
        const lon = geTech.querySelector("longitude");
        if (lat && lon) gis = `Lat ${parseFloat(lat.textContent).toFixed(4)}°, Lon ${parseFloat(lon.textContent).toFixed(4)}°`;
      }
    }

    // Textures
    const textures = [];
    const seen = new Set();
    const imageNodes = xmlDoc.querySelectorAll("library_images > image > init_from, image > init_from");
    imageNodes.forEach(node => {
      let raw = node.textContent ? node.textContent.trim() : "";
      if (raw) {
        let clean = raw.split('?')[0].split('#')[0];
        try { clean = decodeURIComponent(clean); } catch(e) {}
        const basename = clean.split('/').pop().split('\\').pop();
        if (basename && !seen.has(basename.toLowerCase())) {
          seen.add(basename.toLowerCase());
          textures.push({
            rawName: raw,
            basename: basename,
            isEmbedded: false
          });
        }
      }
    });

    return {
      version,
      unitMeter,
      unitName,
      upAxis,
      author: authorNode ? authorNode.textContent.trim() : null,
      authoringTool: toolNode ? toolNode.textContent.trim() : null,
      comments: commentsNode ? commentsNode.textContent.trim() : null,
      created: createdNode ? createdNode.textContent.trim() : null,
      modified: modifiedNode ? modifiedNode.textContent.trim() : null,
      gis,
      textures
    };
  }

  loadDAEModel(daeText, daeInfo, manager, modelName, blobMap, skipTextures = false, primaryFile = null) {
    try {
      this.updateProgress(I18N.t('stageMeshing'), 70);
      const loader = new THREE.ColladaLoader(manager);
      
      // Parse DAE text
      const collada = loader.parse(daeText, '');
      const model = collada.scene;
      model.name = modelName;

      // Coordinate / UpAxis Normalization:
      // ColladaLoader natively handles Z_UP (-90 deg around X), but not X_UP.
      if (daeInfo && daeInfo.upAxis === 'X_UP') {
        model.rotation.z = -Math.PI / 2;
        model.updateMatrixWorld(true);
      }

      // Collect all meshes
      const allMeshes = [];
      model.traverse(node => {
        if (node.isMesh) allMeshes.push(node);
      });

      if (allMeshes.length === 0) {
        this.showProgressModal(false);
        showToast("DAE parsed but 0 meshes could be found", "warning");
        return;
      }

      // Dual-Mode Hybrid Hierarchy: Check for BIM keywords
      const bimPattern = /wall|slab|floor|deck|column|pillar|beam|girder|joist|roof|canopy|ceiling|door|gate|curtain|window|glass|glazing|stair|step|railing|parapet|pipe|duct|conduit|hvac|plumb|truss|steel|foundation|footing|pile|furniture|site|terrain|topo|ground|level|storey|story|lvl|1f|2f|3f|4f|地下|地上|层|楼|墙|板|柱|梁|顶|门|窗|梯|栏|管/i;

      let hasBIMKeywords = false;
      for (const mesh of allMeshes) {
        const checkStr = `${mesh.name || ''} ${(mesh.parent && mesh.parent.name) || ''} ${(mesh.material && mesh.material.name) || ''}`;
        if (bimPattern.test(checkStr)) {
          hasBIMKeywords = true;
          break;
        }
      }

      let meshIndex = 0;
      const classifyNode = (node, parentStructure = null, parentPath = []) => {
        const currentPath = [...parentPath];
        if (node.name && node.name !== 'Scene' && node.name !== 'RootNode') {
          currentPath.push(node.name);
        }

        let structure = parentStructure;
        if (!structure && node !== model) {
          if (node.isGroup || (node.children && node.children.length > 0 && !node.isMesh)) {
            if (node.name && node.name !== 'Scene') {
              structure = node.name;
            }
          }
        }

        if (node.isMesh) {
          meshIndex++;
          node.castShadow = true;
          node.receiveShadow = true;
          if (node.material) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach(m => {
              m.side = THREE.DoubleSide; // Critical for SketchUp DAE
              if (skipTextures) {
                m.map = null;
                m.needsUpdate = true;
              }
              if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
                m.clippingPlanes = this.clippingEngine.clippingPlanes;
                m.clipShadows = true;
              }
            });
          }

          // Compute world bounding box for elevation and dimensions
          const box = new THREE.Box3().setFromObject(node);
          const size = new THREE.Vector3();
          box.getSize(size);

          const finalStructure = structure || 
            (currentPath.length > 1 ? currentPath[0] : (modelName.replace(/\.[^/.]+$/, "") || "Model"));

          let category = 'Component';
          const allText = [
            node.name || '',
            (node.parent && node.parent.name) || '',
            (node.material && node.material.name) || '',
            currentPath.join(' ')
          ].join(' ').toLowerCase();

          if (hasBIMKeywords) {
            if (/wall|墙/i.test(allText)) category = 'Wall';
            else if (/slab|floor|deck|地坪|楼板|地面/i.test(allText)) category = 'Slab';
            else if (/column|pillar|post|立柱|柱/i.test(allText)) category = 'Column';
            else if (/beam|girder|joist|大梁|横梁|梁/i.test(allText)) category = 'Beam';
            else if (/roof|canopy|ceiling|屋顶|屋面|天花|雨棚/i.test(allText)) category = 'Roof';
            else if (/door|gate|门/i.test(allText)) category = 'Door';
            else if (/curtain|幕墙/i.test(allText)) category = 'Curtain Wall';
            else if (/window|glass|glazing|窗|玻璃/i.test(allText)) category = 'Window / Glazing';
            else if (/stair|step|tread|楼梯|踏步/i.test(allText)) category = 'Stair';
            else if (/railing|parapet|balustrade|栏杆|护栏/i.test(allText)) category = 'Railing';
            else if (/pipe|duct|conduit|hvac|plumb|风管|水管|管道|机电/i.test(allText)) category = 'MEP Services';
            else if (/truss|steel|frame|brace|桁架|钢架|钢结构/i.test(allText)) category = 'Structural Steel';
            else if (/foundation|footing|pile|承台|桩基|地基|基础/i.test(allText)) category = 'Foundation';
            else if (/furniture|chair|table|desk|seat|bed|家具|桌|椅/i.test(allText)) category = 'Furniture';
            else if (/site|terrain|topo|earth|ground|场地|地形/i.test(allText)) category = 'Site & Terrain';
            else if (node.parent && node.parent.name && node.parent.name !== 'Scene') {
              category = node.parent.name;
            }
          } else {
            if (node.parent && node.parent.name && node.parent.name !== 'Scene' && node.parent.name !== 'RootNode') {
              category = node.parent.name;
            } else if (node.material && node.material.name) {
              category = node.material.name;
            } else {
              category = finalStructure;
            }
          }

          // Apply Architectural Material & Color Differentiation
          this.applyBIMMaterialStyling(node, category, allText);

          let level = 'Ground Level';
          const levelMatch = allText.match(/(level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+|lvl\s*\d+|b\d+|1f|2f|3f|4f|5f|地下\s*\d+层|地上\s*\d+层|\d+层|\d+楼)/i);
          if (levelMatch) {
            level = levelMatch[0].toUpperCase();
          } else {
            const y = (box.min.y + box.max.y) / 2;
            if (y < -0.5) level = 'Basement Level';
            else if (y < 4.0) level = 'Level 1 (Ground)';
            else if (y < 8.0) level = 'Level 2';
            else if (y < 12.0) level = 'Level 3';
            else if (y >= 12.0) level = `Upper Level (${y.toFixed(1)}m)`;
          }

          let elemName = node.name || '';
          if (!elemName || elemName.startsWith('mesh_') || elemName.startsWith('node_') || elemName === 'Mesh') {
            elemName = `${category} #${meshIndex}`;
          }

          node.userData = {
            structure: finalStructure,
            category: category,
            rawCategory: category,
            element: elemName,
            level: level,
            dimensions: `${size.x.toFixed(2)}m × ${size.z.toFixed(2)}m`,
            height: `${size.y.toFixed(2)} m`,
            rlMin: box.min.y.toFixed(2),
            rlMax: box.max.y.toFixed(2),
            guid: node.uuid,
            isDAE: true,
            nodePath: currentPath
          };
        }

        if (node.children && node.children.length > 0) {
          node.children.forEach(child => classifyNode(child, structure, currentPath));
        }
      };

      classifyNode(model);

      this.clearModel();
      document.getElementById('project-title-text').textContent = modelName;
      this.setModel(model);

      const stats = this.calculateModelStats(model);
      const sizeStr = primaryFile && primaryFile.size > 1048576 ? 
        `${(primaryFile.size / 1048576).toFixed(2)} MB` : 
        (primaryFile && primaryFile.size ? `${(primaryFile.size / 1024).toFixed(1)} KB` : "N/A");

      const unitMeter = (daeInfo && daeInfo.unitMeter) || 1.0;
      const upAxis = (daeInfo && daeInfo.upAxis) || "Y_UP";
      const daeVer = (daeInfo && daeInfo.version) ? `COLLADA ${daeInfo.version}` : 'COLLADA 1.4.1';
      const unitAxis = this.formatDAEUnitAndAxis(unitMeter, upAxis);
      const daeSoftware = (daeInfo && daeInfo.authoringTool && daeInfo.authoringTool.trim()) || null;
      const daeGis = (daeInfo && daeInfo.gis) || null;

      this.currentModelInfo = {
        fileName: modelName,
        format: daeVer,
        formatVersion: daeVer,
        unitStr: unitAxis.en,
        unitStrZh: unitAxis.zh,
        gis: daeGis,
        schema: `COLLADA (Unit: ${(unitMeter * 100).toFixed(1)} cm, Up: ${upAxis})`,
        fileSize: sizeStr,
        filePath: (primaryFile && primaryFile.webkitRelativePath) || `${modelName} (Local Storage / Sandboxed)`,
        lastModified: primaryFile && primaryFile.lastModified ? new Date(primaryFile.lastModified).toLocaleString() : null,
        loadedTime: new Date().toLocaleString(),
        originalSoftware: daeSoftware,
        author: (daeInfo && daeInfo.author) || null,
        stats: stats
      };
      this.updateModelSubtitle();
      this.renderModelInfoInspector();

      // Animation initialization
      const animations = (collada && collada.animations && collada.animations.length > 0) ? 
        collada.animations : 
        ((collada.scene && collada.scene.animations && collada.scene.animations.length > 0) ? collada.scene.animations : []);
      
      if (animations && animations.length > 0) {
        this.initAnimationPlayer(model, animations);
      } else {
        this.hideAnimationPlayer();
      }

      this.showProgressModal(false);

      if (skipTextures) {
        showToast(I18N.t('textureToastSkipped') || "Model loaded with solid materials (textures skipped)", 'info');
      } else {
        const texCount = (daeInfo && daeInfo.textures) ? daeInfo.textures.length : 0;
        if (texCount > 0) {
          showToast(I18N.t('textureToastSuccess', { count: texCount }) || `Model loaded with ${texCount} textures applied`, 'success');
        }
      }
    } catch (err) {
      console.error("DAE Load Exception:", err);
      this.showProgressModal(false);
      showToast("Error loading DAE model: " + err.message, "danger");
    }
  }

  loadOBJModel(objText, mtlText, manager, modelName, blobMap, skipTextures = false, primaryFile = null) {
    try {
      this.updateProgress(I18N.t('stageMeshing'), 60);
      let materialsCreator = null;
      if (mtlText && !skipTextures && typeof THREE.MTLLoader !== 'undefined') {
        try {
          const mtlLoader = new THREE.MTLLoader(manager);
          materialsCreator = mtlLoader.parse(mtlText, '');
          materialsCreator.preload();
        } catch (mErr) {
          console.warn("MTL parsing notice:", mErr);
        }
      }

      if (typeof THREE.OBJLoader === 'undefined') {
        throw new Error("THREE.OBJLoader is not available");
      }
      const objLoader = new THREE.OBJLoader(manager);
      if (materialsCreator) {
        objLoader.setMaterials(materialsCreator);
      }

      const model = objLoader.parse(objText);
      model.name = modelName;

      // Traversal and upgrade to MeshStandardMaterial
      const allMeshes = [];
      const bimPattern = /wall|slab|floor|deck|column|pillar|beam|girder|joist|roof|canopy|ceiling|door|gate|curtain|window|glass|glazing|stair|step|railing|parapet|pipe|duct|conduit|hvac|plumb|truss|steel|foundation|footing|pile|furniture|site|terrain|topo|ground|level|storey|story|lvl|1f|2f|3f|4f|地下|地上|层|楼|墙|板|柱|梁|顶|门|窗|梯|栏|管/i;
      let hasBIMKeywords = false;

      model.traverse(node => {
        if (node.isMesh) {
          allMeshes.push(node);
          const checkStr = `${node.name || ''} ${(node.parent && node.parent.name) || ''} ${(node.material && node.material.name) || ''}`;
          if (bimPattern.test(checkStr)) {
            hasBIMKeywords = true;
          }

          // Guarantee normal vectors
          if (!node.geometry.attributes.normal || node.geometry.attributes.normal.count === 0) {
            node.geometry.computeVertexNormals();
          }

          const upgradeMaterial = (m) => {
            if (!m) {
              return new THREE.MeshStandardMaterial({
                name: node.name ? `${node.name}_Mat` : "Default_Material",
                color: new THREE.Color(0x94a3b8),
                roughness: 0.5,
                metalness: 0.15,
                side: THREE.DoubleSide
              });
            }
            if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
              m.side = THREE.DoubleSide;
              if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
                m.clippingPlanes = this.clippingEngine.clippingPlanes;
                m.clipShadows = true;
              }
              return m;
            }
            const std = new THREE.MeshStandardMaterial({
              name: m.name || (node.name + '_Mat'),
              color: m.color ? m.color.clone() : new THREE.Color(0x94a3b8),
              map: m.map || null,
              bumpMap: m.bumpMap || null,
              bumpScale: m.bumpScale || 1.0,
              normalMap: m.normalMap || null,
              roughness: 0.5,
              metalness: 0.1,
              opacity: m.opacity !== undefined ? m.opacity : 1.0,
              transparent: m.transparent || (m.opacity !== undefined && m.opacity < 1.0),
              side: THREE.DoubleSide,
              depthWrite: true
            });
            if (this.clippingEngine && this.clippingEngine.clippingPlanes) {
              std.clippingPlanes = this.clippingEngine.clippingPlanes;
              std.clipShadows = true;
            }
            return std;
          };

          if (Array.isArray(node.material)) {
            node.material = node.material.map(upgradeMaterial);
          } else {
            node.material = upgradeMaterial(node.material);
          }
        }
      });

      if (allMeshes.length === 0) {
        this.showProgressModal(false);
        showToast("OBJ parsed but 0 meshes could be found", "warning");
        return;
      }

      let meshIndex = 0;
      const classifyNode = (node, parentStructure = null, parentPath = []) => {
        const currentPath = [...parentPath];
        if (node.name && node.name !== 'Scene' && node.name !== 'RootNode') {
          currentPath.push(node.name);
        }

        let structure = parentStructure;
        if (!structure && node !== model) {
          if (node.isGroup || (node.children && node.children.length > 0 && !node.isMesh)) {
            if (node.name && node.name !== 'Scene') {
              structure = node.name;
            }
          }
        }

        if (node.isMesh) {
          meshIndex++;
          node.castShadow = true;
          node.receiveShadow = true;

          const box = new THREE.Box3().setFromObject(node);
          const size = new THREE.Vector3();
          box.getSize(size);

          const finalStructure = structure || 
            (currentPath.length > 1 ? currentPath[0] : (modelName.replace(/\.[^/.]+$/, "") || "Model"));

          const allText = [
            node.name || '',
            (node.parent && node.parent.name) || '',
            structure || '',
            currentPath.join(' '),
            Array.isArray(node.material) ? node.material.map(m => (m && m.name) || '').join(' ') : ((node.material && node.material.name) || '')
          ].join(' ');

          let category = 'Architectural / Generic';
          if (hasBIMKeywords) {
            if (/wall|墙/i.test(allText)) category = 'Wall';
            else if (/slab|floor|deck|地坪|楼板|地面/i.test(allText)) category = 'Slab';
            else if (/column|pillar|post|立柱|柱/i.test(allText)) category = 'Column';
            else if (/beam|girder|joist|大梁|横梁|梁/i.test(allText)) category = 'Beam';
            else if (/roof|canopy|ceiling|屋顶|屋面|天花|雨棚/i.test(allText)) category = 'Roof';
            else if (/door|gate|门/i.test(allText)) category = 'Door';
            else if (/curtain|幕墙/i.test(allText)) category = 'Curtain Wall';
            else if (/window|glass|glazing|窗|玻璃/i.test(allText)) category = 'Window / Glazing';
            else if (/stair|step|tread|楼梯|踏步/i.test(allText)) category = 'Stair';
            else if (/railing|parapet|balustrade|栏杆|护栏/i.test(allText)) category = 'Railing';
            else if (/pipe|duct|conduit|hvac|plumb|风管|水管|管道|机电/i.test(allText)) category = 'MEP Services';
            else if (/truss|steel|frame|brace|桁架|钢架|钢结构/i.test(allText)) category = 'Structural Steel';
            else if (/foundation|footing|pile|承台|桩基|地基|基础/i.test(allText)) category = 'Foundation';
            else if (/furniture|chair|table|desk|seat|bed|家具|桌|椅/i.test(allText)) category = 'Furniture';
            else if (/site|terrain|topo|earth|ground|场地|地形/i.test(allText)) category = 'Site & Terrain';
            else if (node.parent && node.parent.name && node.parent.name !== 'Scene') {
              category = node.parent.name;
            }
          } else {
            if (node.parent && node.parent.name && node.parent.name !== 'Scene' && node.parent.name !== 'RootNode') {
              category = node.parent.name;
            } else if (node.material && node.material.name) {
              category = node.material.name;
            } else {
              category = finalStructure;
            }
          }

          // Apply Architectural Material & Color Differentiation
          this.applyBIMMaterialStyling(node, category, allText);

          let level = 'Ground Level';
          const levelMatch = allText.match(/(level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+|lvl\s*\d+|b\d+|1f|2f|3f|4f|5f|地下\s*\d+层|地上\s*\d+层|\d+层|\d+楼)/i);
          if (levelMatch) {
            level = levelMatch[0].toUpperCase();
          } else {
            const y = (box.min.y + box.max.y) / 2;
            if (y < -0.5) level = 'Basement Level';
            else if (y < 4.0) level = 'Level 1 (Ground)';
            else if (y < 8.0) level = 'Level 2';
            else if (y < 12.0) level = 'Level 3';
            else if (y >= 12.0) level = `Upper Level (${y.toFixed(1)}m)`;
          }

          let elemName = node.name || '';
          if (!elemName || elemName.startsWith('mesh_') || elemName.startsWith('node_') || elemName === 'Mesh' || elemName === 'default') {
            elemName = `${category} #${meshIndex}`;
          }

          node.userData = {
            structure: finalStructure,
            category: category,
            rawCategory: category,
            element: elemName,
            level: level,
            dimensions: `${size.x.toFixed(2)}m × ${size.z.toFixed(2)}m`,
            height: `${size.y.toFixed(2)} m`,
            rlMin: box.min.y.toFixed(2),
            rlMax: box.max.y.toFixed(2),
            guid: node.uuid,
            isOBJ: true,
            nodePath: currentPath
          };
        }

        if (node.children && node.children.length > 0) {
          node.children.forEach(child => classifyNode(child, structure, currentPath));
        }
      };

      classifyNode(model);

      this.clearModel();
      document.getElementById('project-title-text').textContent = modelName;
      this.setModel(model);

      const stats = this.calculateModelStats(model);
      const sizeStr = primaryFile && primaryFile.size > 1048576 ? 
        `${(primaryFile.size / 1048576).toFixed(2)} MB` : 
        (primaryFile && primaryFile.size ? `${(primaryFile.size / 1024).toFixed(1)} KB` : "N/A");

      this.currentModelInfo = {
        fileName: modelName,
        format: 'Wavefront OBJ',
        formatVersion: 'Wavefront OBJ',
        unitStr: 'Standard (Y-up)',
        unitStrZh: '标准坐标 (Y-up)',
        schema: 'Wavefront Technologies (.obj / .mtl)',
        fileSize: sizeStr,
        filePath: (primaryFile && primaryFile.webkitRelativePath) || `${modelName} (Local Storage / Sandboxed)`,
        lastModified: primaryFile && primaryFile.lastModified ? new Date(primaryFile.lastModified).toLocaleString() : null,
        loadedTime: new Date().toLocaleString(),
        originalSoftware: 'Wavefront / DCC CAD Tool',
        stats: stats,
        isOBJ: true
      };

      this.initOBJTuningState(model);
      this.updateModelSubtitle();
      this.renderModelInfoInspector();
      this.showProgressModal(false);
      showToast(I18N.t('loadingTitle') + " - OBJ: " + modelName, 'success');
    } catch (err) {
      console.error("OBJ Load Exception:", err);
      this.showProgressModal(false);
      showToast("Error loading OBJ model: " + err.message, "danger");
    }
  }

  initOBJTuningState(model) {
    this.objTuningState = {
      model: model,
      upAxis: 'Y',
      yawDeg: 0,
      currentScale: 1.0,
      isFlat: false,
      isDoubleSide: true
    };
  }

  toggleOBJUpAxis() {
    if (!this.objTuningState || !this.activeModel) return;
    const state = this.objTuningState;
    if (state.upAxis === 'Y') {
      state.upAxis = 'Z';
      state.model.rotation.x = -Math.PI / 2;
    } else {
      state.upAxis = 'Y';
      state.model.rotation.x = 0;
    }
    this.recalculateOBJTransform();
    showToast(state.upAxis === 'Z' ? 'OBJ: Switched to Z-Up (X-axis rotated -90°)' : 'OBJ: Switched to Y-Up (Restored Y-Up)', 'info');
  }

  rotateOBJYaw(deg = 90) {
    if (!this.objTuningState || !this.activeModel) return;
    const rad = (deg * Math.PI) / 180;
    this.objTuningState.model.rotation.y += rad;
    this.objTuningState.yawDeg = (this.objTuningState.yawDeg + deg) % 360;
    this.recalculateOBJTransform();
    showToast(`OBJ: Rotated +${deg}° around Y`, 'info');
  }

  applyOBJScale(scaleMultiplier) {
    if (!this.objTuningState || !this.activeModel) return;
    const mult = parseFloat(scaleMultiplier);
    if (!mult || mult <= 0 || isNaN(mult)) {
      showToast('Invalid scale multiplier', 'warning');
      return;
    }
    this.objTuningState.currentScale = mult;
    this.objTuningState.model.scale.set(mult, mult, mult);
    this.recalculateOBJTransform();
    showToast(`OBJ: Scale multiplier applied (×${mult})`, 'info');
  }

  toggleOBJSmoothNormals(enableSmooth) {
    if (!this.objTuningState || !this.activeModel) return;
    this.objTuningState.isFlat = !enableSmooth;
    this.activeModel.traverse(node => {
      if (node.isMesh && node.geometry) {
        if (enableSmooth) {
          node.geometry.computeVertexNormals();
        }
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          if (m) {
            m.flatShading = !enableSmooth;
            m.needsUpdate = true;
          }
        });
      }
    });
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    this.renderModelInfoInspector();
    showToast(enableSmooth ? 'OBJ: Recomputed Smooth Normals' : 'OBJ: Set Flat Shading', 'info');
  }

  toggleOBJDoubleSide(doubleSide) {
    if (!this.objTuningState || !this.activeModel) return;
    this.objTuningState.isDoubleSide = doubleSide;
    this.activeModel.traverse(node => {
      if (node.isMesh && node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          if (m) {
            m.side = doubleSide ? THREE.DoubleSide : THREE.FrontSide;
            m.needsUpdate = true;
          }
        });
      }
    });
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    this.renderModelInfoInspector();
    showToast(doubleSide ? 'OBJ: Double-Sided enabled' : 'OBJ: Single-Sided enabled', 'info');
  }

  recalculateOBJTransform() {
    if (!this.activeModel) return;
    this.activeModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.activeModel);
    if (!box.isEmpty()) {
      this.clippingEngine.setBounds(box);
      this.clippingEngine.setModel(this.activeModel);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      if (this.grid) {
        this.grid.position.set(center.x, box.min.y - 0.05, center.z);
      }
      this.pivotPoint.copy(center);
      this.controls.target.copy(center);
      if (this.solarEngine) {
        this.solarEngine.setCenter(center);
      }
    }
    this.generateModelEdges(this.activeModel);
    this.updateStats();
    if (this.currentModelInfo && this.activeModel) {
      const box = new THREE.Box3().setFromObject(this.activeModel);
      const size = new THREE.Vector3();
      box.getSize(size);
      this.currentModelInfo.unitStr = `${this.objTuningState.upAxis}-up | Scale: ×${this.objTuningState.currentScale} | (${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m)`;
      this.currentModelInfo.unitStrZh = `${this.objTuningState.upAxis}轴朝上 | 缩放: ×${this.objTuningState.currentScale} | (${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} 米)`;
      this.updateModelSubtitle();
    }
    this.fitView();
    this.renderModelInfoInspector();
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }
  
  showProgressModal(show, text = "", percent = 0) {
    const modal = document.getElementById('progress-modal');
    if (show) {
      modal.classList.add('active');
      this.updateProgress(text, percent);
    } else {
      modal.classList.remove('active');
    }
  }
  
  updateProgress(text, percent) {
    document.getElementById('progress-status-text').textContent = text;
    document.getElementById('progress-bar-fill').style.width = `${percent}%`;
  }
  
  updateStats() {
    let triCount = 0;
    let vertCount = 0;
    if (this.activeModel) {
      this.activeModel.traverse(obj => {
        if (this.isModelElementMesh(obj) && obj.geometry) {
          const geom = obj.geometry;
          if (geom.index) {
            triCount += geom.index.count / 3;
          } else if (geom.attributes.position) {
            triCount += geom.attributes.position.count / 3;
          }
          if (geom.attributes.position) {
            vertCount += geom.attributes.position.count;
          }
        }
      });
    }
    document.getElementById('stat-triangles-val').textContent = triCount.toLocaleString();
    document.getElementById('stat-vertices-val').textContent = vertCount.toLocaleString();
  }
  
  // Window Responsive Adaptive Layout:
  // - When 3D viewport < 40% of window (combined open panels > 60%),
  //   automatically narrow panels down towards min 280px.
  // - If both panels reach min 280px and viewport is still < 40% (window < 560/0.6 ~ 933px),
  //   automatically force-collapse both panels.
  // - When window width recovers sufficiently, auto-restore panels that were auto-collapsed.
  handleWindowAdaptiveLayout() {
    const lsb = document.getElementById('left-sidebar');
    const rsb = document.getElementById('right-sidebar');
    if (!lsb || !rsb) return;

    const windowWidth = window.innerWidth;
    if (windowWidth <= 0) return;

    const MIN_PANEL_WIDTH = 280;
    const targetL = Math.max(MIN_PANEL_WIDTH, this.customTreeWidth || 330);
    const targetR = Math.max(MIN_PANEL_WIDTH, this.customInspectorWidth || 330);

    const leftIsOpen = !lsb.classList.contains('collapsed') && !lsb.classList.contains('hidden');
    const rightIsOpen = !rsb.classList.contains('collapsed') && !rsb.classList.contains('hidden');

    const wantsLeft = leftIsOpen || this.autoCollapsedLeft;
    const wantsRight = rightIsOpen || this.autoCollapsedRight;

    // Viewport must be >= 40% of window width, so max allowable total panels width is 60%
    const maxAllowedPanelsWidth = Math.floor(windowWidth * 0.60);

    if (wantsLeft && wantsRight) {
      const minBothRequired = MIN_PANEL_WIDTH * 2; // 560px

      if (maxAllowedPanelsWidth < minBothRequired) {
        // Space cannot accommodate both panels at min 280px while keeping viewport >= 40%
        if (leftIsOpen && rightIsOpen) {
          // Both were open -> force auto-collapse both
          this.autoCollapsedLeft = true;
          this.autoCollapsedRight = true;
          if (this.toggleTreeCollapse) this.toggleTreeCollapse(false);
          if (this.toggleInspectorCollapse) this.toggleInspectorCollapse(false);
        } else if (leftIsOpen) {
          // Left is open alone (Right was already collapsed/auto-collapsed)
          if (maxAllowedPanelsWidth < MIN_PANEL_WIDTH) {
            this.autoCollapsedLeft = true;
            if (this.toggleTreeCollapse) this.toggleTreeCollapse(false);
          } else {
            const newL = Math.min(targetL, Math.max(MIN_PANEL_WIDTH, maxAllowedPanelsWidth));
            lsb.style.width = `${newL}px`;
          }
        } else if (rightIsOpen) {
          // Right is open alone (Left was already collapsed/auto-collapsed)
          if (maxAllowedPanelsWidth < MIN_PANEL_WIDTH) {
            this.autoCollapsedRight = true;
            if (this.toggleInspectorCollapse) this.toggleInspectorCollapse(false);
          } else {
            const newR = Math.min(targetR, Math.max(MIN_PANEL_WIDTH, maxAllowedPanelsWidth));
            rsb.style.width = `${newR}px`;
          }
        }
      } else {
        // Space is enough for both panels (>= 560px, viewport >= 40%)
        // Auto-restore any panels that were previously auto-collapsed
        if (this.autoCollapsedLeft) {
          this.autoCollapsedLeft = false;
          if (this.toggleTreeCollapse) this.toggleTreeCollapse(true);
        }
        if (this.autoCollapsedRight) {
          this.autoCollapsedRight = false;
          if (this.toggleInspectorCollapse) this.toggleInspectorCollapse(true);
        }

        const totalTarget = targetL + targetR;
        if (totalTarget > maxAllowedPanelsWidth) {
          // Narrow both panels down proportionally towards 280px
          const excess = totalTarget - maxAllowedPanelsWidth;
          const reducibleL = targetL - MIN_PANEL_WIDTH;
          const reducibleR = targetR - MIN_PANEL_WIDTH;
          const totalReducible = reducibleL + reducibleR;

          let newL = targetL;
          let newR = targetR;
          if (totalReducible > 0) {
            const ratio = Math.min(1.0, excess / totalReducible);
            newL = Math.max(MIN_PANEL_WIDTH, Math.round(targetL - ratio * reducibleL));
            newR = Math.max(MIN_PANEL_WIDTH, Math.round(targetR - ratio * reducibleR));
          } else {
            newL = MIN_PANEL_WIDTH;
            newR = MIN_PANEL_WIDTH;
          }

          lsb.style.width = `${newL}px`;
          rsb.style.width = `${newR}px`;
        } else {
          // Restore full target widths
          lsb.style.width = `${targetL}px`;
          rsb.style.width = `${targetR}px`;
        }
      }
    } else if (wantsLeft) {
      if (maxAllowedPanelsWidth < MIN_PANEL_WIDTH) {
        if (leftIsOpen) {
          this.autoCollapsedLeft = true;
          if (this.toggleTreeCollapse) this.toggleTreeCollapse(false);
        }
      } else {
        if (this.autoCollapsedLeft) {
          this.autoCollapsedLeft = false;
          if (this.toggleTreeCollapse) this.toggleTreeCollapse(true);
        }
        const newL = Math.min(targetL, Math.max(MIN_PANEL_WIDTH, maxAllowedPanelsWidth));
        lsb.style.width = `${newL}px`;
      }
    } else if (wantsRight) {
      if (maxAllowedPanelsWidth < MIN_PANEL_WIDTH) {
        if (rightIsOpen) {
          this.autoCollapsedRight = true;
          if (this.toggleInspectorCollapse) this.toggleInspectorCollapse(false);
        }
      } else {
        if (this.autoCollapsedRight) {
          this.autoCollapsedRight = false;
          if (this.toggleInspectorCollapse) this.toggleInspectorCollapse(true);
        }
        const newR = Math.min(targetR, Math.max(MIN_PANEL_WIDTH, maxAllowedPanelsWidth));
        rsb.style.width = `${newR}px`;
      }
    }
  }
  
  onContainerResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    if (this.perspectiveCamera) {
      this.perspectiveCamera.aspect = aspect;
      this.perspectiveCamera.updateProjectionMatrix();
    }
    if (this.orthographicCamera) {
      const orthoH = (this.orthographicCamera.top - this.orthographicCamera.bottom);
      const orthoW = orthoH * aspect;
      this.orthographicCamera.left = -orthoW / 2;
      this.orthographicCamera.right = orthoW / 2;
      this.orthographicCamera.updateProjectionMatrix();
    }
    
    const canvas = this.renderer.domElement;
    const pr = this.renderer.getPixelRatio();
    const targetW = Math.floor(width * pr);
    const targetH = Math.floor(height * pr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      this.renderer.setSize(width, height);
      this.renderer.render(this.scene, this.camera);
    }
    if (this.compass3d) {
      this.compass3d.update();
    }
    if (this.updateSidebarTabsOverflow) {
      this.updateSidebarTabsOverflow();
    }
    if (this.updateInspectorTabsOverflow && (this.selectedMesh || (this.selectedMeshes && this.selectedMeshes.length > 0))) {
      this.updateInspectorTabsOverflow();
    }
    if (this.updateViewportCenterNav) {
      this.updateViewportCenterNav();
    }
    if (this.updateBottomBarOverflow) {
      this.updateBottomBarOverflow();
    }
  }

  initEventListeners() {
    // Window & Viewport Container Resize Handling
    window.addEventListener('resize', () => {
      this.handleWindowAdaptiveLayout();
      this.onContainerResize();
    });

    if (window.ResizeObserver && this.container) {
      this.containerResizeObserver = new ResizeObserver(() => {
        this.onContainerResize();
      });
      this.containerResizeObserver.observe(this.container);
    }
    
    // Mouse Move for Coordinates HUD, Measure, and Gizmo Hover (Throttled with requestAnimationFrame)
    this.canvas.addEventListener('mousemove', (e) => {
      this.pendingMouseMoveEvt = { clientX: e.clientX, clientY: e.clientY };
      if (this.hoverRaf) return;

      this.hoverRaf = requestAnimationFrame(() => {
        this.hoverRaf = null;
        if (!this.pendingMouseMoveEvt) return;
        const { clientX, clientY } = this.pendingMouseMoveEvt;
        this.pendingMouseMoveEvt = null;

        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Section Plane & Box Hover detection (shows gizmo on plane/box hover, grab cursor on gizmo hover)
        if (this.clippingEngine && this.clippingEngine.enabled && !this.isOrbiting && !this.isPanning && !this.isBoxSelecting && !this.isGizmoDragging) {
          const isOverGizmo = this.clippingEngine.updateHover(this.raycaster);
          if (isOverGizmo) {
            this.canvas.style.cursor = 'grab';
            this.clearHoverOverlay();
            return;
          }
        }

        const ctxMenu = document.getElementById('context-menu');
        if (this.isOrbiting || this.isPanning || this.isLeftInteracting || this.isBoxSelecting || this.isGizmoDragging || this.isMeasureMode || (ctxMenu && ctxMenu.style.display === 'flex')) {
          this.clearHoverOverlay();
          return;
        }

        // Target activeModel children instead of entire scene to skip auxiliary cameras/lights/compass
        const searchRoots = this.activeModel ? [this.activeModel] : this.scene.children;
        const intersects = this.raycaster.intersectObjects(searchRoots, true);
        const valid = intersects.filter(hit => this.isPickableElement(hit.object));
        
        if (valid.length > 0) {
          const hitMesh = valid[0].object;
          const p = valid[0].point;
          const northing = Math.abs(p.z);
          
          if (!this.cachedCoordEls) {
            this.cachedCoordEls = {
              x: document.getElementById('coord-x'),
              y: document.getElementById('coord-y'),
              rl: document.getElementById('coord-rl')
            };
          }
          if (this.cachedCoordEls.x) this.cachedCoordEls.x.textContent = Math.abs(p.x) < 0.05 ? "0.0" : p.x.toFixed(1);
          if (this.cachedCoordEls.y) this.cachedCoordEls.y.textContent = Math.abs(northing) < 0.05 ? "0.0" : northing.toFixed(1);
          if (this.cachedCoordEls.rl) this.cachedCoordEls.rl.textContent = p.y.toFixed(2);

          // Subtle hover highlight on current pointed element
          const isAlreadySel = (hitMesh === this.selectedMesh) || (this.selectedMeshes && this.selectedMeshes.includes(hitMesh));
          if (!isAlreadySel) {
            this.setHoveredElement(hitMesh);
            this.canvas.style.cursor = 'pointer';
          } else {
            this.clearHoverOverlay();
            this.canvas.style.cursor = 'pointer';
          }
        } else {
          this.clearHoverOverlay();
          this.canvas.style.cursor = 'default';
        }
      });
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoverRaf) {
        cancelAnimationFrame(this.hoverRaf);
        this.hoverRaf = null;
      }
      this.pendingMouseMoveEvt = null;
      if (this.clippingEngine) {
        this.clippingEngine.clearHoverState();
      }
      this.clearHoverOverlay();
      this.canvas.style.cursor = 'default';
    });

    // Pointer events: Left click (select/clear) & Left drag (box select)
    // Middle drag (pan) | Right click (context menu) & Right drag (orbit around pointed surface)
    this.canvas.addEventListener('pointerdown', (e) => {
      this.clearHoverOverlay();
      if (this.cameraTweenRaf) {
        cancelAnimationFrame(this.cameraTweenRaf);
        this.cameraTweenRaf = null;
        this.isNavigatingViewHistory = false;
      }
      if (e.button === 0) { // Left click / drag
        // Check if clicking Section Gizmo (highest priority)
        if (this.clippingEngine && this.clippingEngine.enabled) {
          const rect = this.canvas.getBoundingClientRect();
          this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          this.raycaster.setFromCamera(this.mouse, this.camera);
          const gizmoHits = this.clippingEngine.intersectGizmos(this.raycaster);
          if (gizmoHits.length > 0) {
            this.isGizmoDragging = true;
            this.clippingEngine.startDrag(gizmoHits[0].object, this.raycaster, this.camera, e);
            this.canvas.style.cursor = 'grabbing';
            return;
          }
        }

        this.isLeftInteracting = true;
        this.leftDownPos = { x: e.clientX, y: e.clientY };
        this.leftMoved = false;
        this.isBoxSelecting = false;
        this.boxSelectStartPos = { x: e.clientX, y: e.clientY };
      } else if (e.button === 1) { // Middle click: Pan
        this.isPanning = true;
        this.panMoved = false;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        e.preventDefault();
      } else if (e.button === 2) { // Right click: Orbit around pointed surface point
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        let hitPoint = null;
        if (this.activeModel) {
          const intersects = this.raycaster.intersectObjects(this.activeModel.children, true);
          const valid = intersects.filter(h => this.isPickableElement(h.object));
          if (valid.length > 0) {
            hitPoint = valid[0].point;
          }
        }
        if (hitPoint) {
          this.pivotPoint.copy(hitPoint);
        }
        if (this.pivotPoint && this.pivotHelper) {
          this.pivotHelper.position.copy(this.pivotPoint);
          this.pivotHelper.visible = true;
          this.updatePivotIndicator();
        }
        this.isOrbiting = true;
        this.orbitStartX = e.clientX;
        this.orbitStartY = e.clientY;
        this.orbitMoved = false;
        this.isRightDragging = false;
        this.rightDownPos = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isGizmoDragging) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.clippingEngine.onDrag(this.raycaster, this.camera, e);
        this.syncSectionUI();
        return;
      }
      if (this.isLeftInteracting) {
        const dx = e.clientX - this.leftDownPos.x;
        const dy = e.clientY - this.leftDownPos.y;
        if (Math.hypot(dx, dy) > 4) {
          this.leftMoved = true;
          this.isBoxSelecting = true;
          this.updateMarqueeBox(this.boxSelectStartPos.x, this.boxSelectStartPos.y, e.clientX, e.clientY);
        }
      } else if (this.isOrbiting) {
        const dx = e.clientX - this.orbitStartX;
        const dy = e.clientY - this.orbitStartY;
        if (this.rightDownPos && Math.hypot(e.clientX - this.rightDownPos.x, e.clientY - this.rightDownPos.y) > 3) {
          this.isRightDragging = true;
        }
        if (Math.hypot(dx, dy) > 2) {
          this.orbitMoved = true;
          this.orbitStartX = e.clientX;
          this.orbitStartY = e.clientY;
          this.rotateAroundPivot(dx, dy);
        }
      } else if (this.isPanning) {
        const dx = e.clientX - this.panStartX;
        const dy = e.clientY - this.panStartY;
        if (Math.hypot(dx, dy) > 2) {
          this.panMoved = true;
        }
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panCamera(dx, dy);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isGizmoDragging) {
        this.isGizmoDragging = false;
        this.clippingEngine.endDrag();
        this.canvas.style.cursor = 'default';
        this.syncSectionUI();
        return;
      }
      if (e.button === 0 && this.isLeftInteracting) {
        this.isLeftInteracting = false;
        this.hideMarqueeBox();
        if (this.isBoxSelecting && this.leftMoved) {
          this.isBoxSelecting = false;
          this.finishBoxSelection(e, this.boxSelectStartPos.x, this.boxSelectStartPos.y, e.clientX, e.clientY);
        } else {
          this.isBoxSelecting = false;
          const rect = this.canvas.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            this.handleCanvasClick(e);
          }
        }
      }
      if (e.button === 1 && this.isPanning) {
        const wasPanning = this.panMoved;
        this.isPanning = false;
        this.panMoved = false;
        if (wasPanning) {
          this.pushViewSnapshot();
        }
      }
      if (e.button === 2 && this.isOrbiting) {
        const wasOrbitMoved = this.orbitMoved || this.isRightDragging;
        this.isOrbiting = false;
        this.orbitMoved = false;
        if (wasOrbitMoved) {
          this.pushViewSnapshot();
        }
        if (this.pivotHelper) {
          if (this.pivotTimeout) clearTimeout(this.pivotTimeout);
          this.pivotTimeout = setTimeout(() => {
            if (this.pivotHelper) this.pivotHelper.visible = false;
          }, 1200);
        }
      }
    });

    // Custom 3D context menu on right click (prevent browser context menu)
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.isRightDragging) {
        this.handleContextMenu(e);
      }
    });

    // Wheel Zoom: Precise CAD / Forge Zoom-to-Cursor (100% reversible along cursor ray)
    this.canvas.addEventListener('wheel', (e) => {
      this.handleWheelZoom(e);
    }, { passive: false });
    
    // Drag & Drop
    const dropzone = document.getElementById('dropzone-overlay');
    ['dragenter', 'dragover'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();

        // If compare modal or texture modal is open, completely suppress viewport dropzone prompt
        if (this.compareEngine && this.compareEngine.isModalOpen()) {
          if (dropzone) dropzone.classList.remove('active');
          return;
        }
        const texModal = document.getElementById('texture-modal');
        if (texModal && texModal.classList.contains('active')) {
          if (dropzone) dropzone.classList.remove('active');
          return;
        }

        if (dropzone) dropzone.classList.add('active');
      });
    });

    ['dragleave', 'dragend'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
          if (dropzone) dropzone.classList.remove('active');
        }
      });
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzone) dropzone.classList.remove('active');

      // If compare modal or texture modal is open, do not load into main viewport
      if (this.compareEngine && this.compareEngine.isModalOpen()) return;
      const texModal = document.getElementById('texture-modal');
      if (texModal && texModal.classList.contains('active')) return;

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFileInput(e.dataTransfer.files);
      }
    });
  }

  handleContextMenu(e) {
    // Right click does not alter or change element selection:
    // It strictly preserves the existing selection (if any), ensuring actions
    // apply only to intentionally selected elements without cursor offset misclicks.
    // If no element is selected, it displays the root/global context menu.
    this.clearHoverOverlay();
    this.showContextMenu(e.clientX, e.clientY);
  }

  showContextMenu(clientX, clientY) {
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    this.contextGroupMeshes = null;
    const hasSelection = !!this.selectedMesh || (this.selectedMeshes && this.selectedMeshes.length > 0);

    // Toggle menu items according to selection state:
    // When no object is selected: show Show All, Zoom to Global, Reset Initial View
    // When an object is selected: show Hide, Isolate, Zoom to, Section Box / Move Section Plane/Box to Here
    const itemShowAll = document.getElementById('menu-show-all');
    const itemZoomGlobal = document.getElementById('menu-zoom-global');
    const itemResetView = document.getElementById('menu-reset-view');

    const itemHide = document.getElementById('menu-hide');
    const itemIsolate = document.getElementById('menu-isolate');
    const itemZoomTo = document.getElementById('menu-zoom-to');
    const itemSectionBox = document.getElementById('menu-section-box');
    const itemMoveSecHere = document.getElementById('menu-move-sec-here');
    const itemMoveSecHereText = document.getElementById('menu-move-sec-here-text');
    const itemDivider = document.getElementById('menu-selected-divider');

    // Group items - hide on single selection context menu
    ['menu-group-isolate', 'menu-group-hide', 'menu-group-zoom', 'menu-group-sec-box'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const isSecEnabled = this.clippingEngine && this.clippingEngine.enabled;
    const isSecBox = isSecEnabled && this.clippingEngine.mode === 'box';

    if (hasSelection) {
      if (itemShowAll) itemShowAll.style.display = 'none';
      if (itemZoomGlobal) itemZoomGlobal.style.display = 'none';
      if (itemResetView) itemResetView.style.display = 'none';
      if (itemDivider) itemDivider.style.display = 'none';

      if (itemHide) itemHide.style.display = 'flex';
      if (itemIsolate) itemIsolate.style.display = 'flex';
      if (itemZoomTo) itemZoomTo.style.display = 'flex';

      if (isSecEnabled) {
        if (itemSectionBox) itemSectionBox.style.display = 'none';
        if (itemMoveSecHere) {
          itemMoveSecHere.style.display = 'flex';
          if (itemMoveSecHereText) {
            itemMoveSecHereText.textContent = isSecBox ? 
              I18N.t('menuMoveSectionBoxToHere') : I18N.t('menuMoveSectionPlaneToHere');
          }
        }
      } else {
        if (itemMoveSecHere) itemMoveSecHere.style.display = 'none';
        if (itemSectionBox) itemSectionBox.style.display = 'flex';
      }
    } else {
      if (itemShowAll) itemShowAll.style.display = 'flex';
      if (itemZoomGlobal) itemZoomGlobal.style.display = 'flex';
      if (itemResetView) itemResetView.style.display = 'flex';
      if (itemDivider) itemDivider.style.display = 'none';

      if (itemHide) itemHide.style.display = 'none';
      if (itemIsolate) itemIsolate.style.display = 'none';
      if (itemZoomTo) itemZoomTo.style.display = 'none';
      if (itemSectionBox) itemSectionBox.style.display = 'none';
      if (itemMoveSecHere) itemMoveSecHere.style.display = 'none';
    }

    // Sectioning Context Menu Items
    const itemToggleSecBox = document.getElementById('menu-toggle-section-box');
    const itemToggleSecBoxText = document.getElementById('menu-toggle-section-box-text');
    const itemToggleSecBoxIcon = document.getElementById('menu-toggle-section-box-icon');
    const itemResetSecRot = document.getElementById('menu-reset-sec-rot');
    const itemSecDivider = document.getElementById('menu-sectioning-divider');

    if (itemToggleSecBox) {
      if (isSecEnabled) {
        itemToggleSecBox.style.display = 'flex';
        const isVis = this.clippingEngine.helpersVisible;
        if (itemToggleSecBoxText) {
          itemToggleSecBoxText.textContent = isVis ? 
            (isSecBox ? I18N.t('menuHideSectionBox') : I18N.t('menuHideSectionPlane')) : 
            (isSecBox ? I18N.t('menuShowSectionBox') : I18N.t('menuShowSectionPlane'));
        }
        if (itemToggleSecBoxIcon) {
          itemToggleSecBoxIcon.innerHTML = isVis ? 
            '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>' :
            '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
        }
      } else {
        itemToggleSecBox.style.display = 'none';
      }
    }

    if (itemResetSecRot) {
      itemResetSecRot.style.display = isSecEnabled ? 'flex' : 'none';
    }

    if (itemSecDivider) {
      itemSecDivider.style.display = (isSecBox || isSecEnabled) ? 'block' : 'none';
    }

    // Position menu within viewport bounds
    const vRect = this.container.getBoundingClientRect();
    let left = clientX - vRect.left;
    let top = clientY - vRect.top;

    menu.style.display = 'flex';
    const mWidth = menu.offsetWidth || 180;
    const mHeight = menu.offsetHeight || 160;

    if (left + mWidth > vRect.width - 12) {
      left = vRect.width - mWidth - 12;
    }
    if (top + mHeight > vRect.height - 12) {
      top = vRect.height - mHeight - 12;
    }

    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  showGroupContextMenu(clientX, clientY, groupName, meshes) {
    const menu = document.getElementById('context-menu');
    if (!menu || !meshes || !meshes.length) return;

    this.contextGroupMeshes = meshes;

    // Hide single-element and root empty selection items
    ['menu-show-all', 'menu-zoom-global', 'menu-reset-view', 'menu-selected-divider', 'menu-hide', 'menu-isolate', 'menu-zoom-to', 'menu-section-box'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Show group actions
    const itemGroupIsolate = document.getElementById('menu-group-isolate');
    if (itemGroupIsolate) itemGroupIsolate.style.display = 'flex';

    const itemGroupHide = document.getElementById('menu-group-hide');
    if (itemGroupHide) itemGroupHide.style.display = 'flex';

    const itemGroupZoom = document.getElementById('menu-group-zoom');
    if (itemGroupZoom) itemGroupZoom.style.display = 'flex';

    const isSecEnabled = this.clippingEngine && this.clippingEngine.enabled;
    const isSecBox = isSecEnabled && this.clippingEngine.mode === 'box';

    const itemMoveSecHere = document.getElementById('menu-move-sec-here');
    const itemMoveSecHereText = document.getElementById('menu-move-sec-here-text');
    const itemGroupSecBox = document.getElementById('menu-group-sec-box');

    if (isSecEnabled) {
      if (itemGroupSecBox) itemGroupSecBox.style.display = 'none';
      if (itemMoveSecHere) {
        itemMoveSecHere.style.display = 'flex';
        if (itemMoveSecHereText) {
          itemMoveSecHereText.textContent = isSecBox ? 
            I18N.t('menuMoveSectionBoxToHere') : I18N.t('menuMoveSectionPlaneToHere');
        }
      }
    } else {
      if (itemMoveSecHere) itemMoveSecHere.style.display = 'none';
      if (itemGroupSecBox) itemGroupSecBox.style.display = 'flex';
    }

    // Sectioning controls
    const itemToggleSecBox = document.getElementById('menu-toggle-section-box');
    const itemToggleSecBoxText = document.getElementById('menu-toggle-section-box-text');
    const itemToggleSecBoxIcon = document.getElementById('menu-toggle-section-box-icon');
    const itemResetSecRot = document.getElementById('menu-reset-sec-rot');
    const itemSecDivider = document.getElementById('menu-sectioning-divider');

    if (itemToggleSecBox) {
      if (isSecEnabled) {
        itemToggleSecBox.style.display = 'flex';
        const isVis = this.clippingEngine.helpersVisible;
        if (itemToggleSecBoxText) {
          itemToggleSecBoxText.textContent = isVis ? 
            (isSecBox ? I18N.t('menuHideSectionBox') : I18N.t('menuHideSectionPlane')) : 
            (isSecBox ? I18N.t('menuShowSectionBox') : I18N.t('menuShowSectionPlane'));
        }
        if (itemToggleSecBoxIcon) {
          itemToggleSecBoxIcon.innerHTML = isVis ? 
            '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>' :
            '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
        }
      } else {
        itemToggleSecBox.style.display = 'none';
      }
    }

    if (itemResetSecRot) itemResetSecRot.style.display = isSecEnabled ? 'flex' : 'none';
    if (itemSecDivider) itemSecDivider.style.display = (isSecBox || isSecEnabled) ? 'block' : 'none';

    // Position menu
    const vRect = this.container.getBoundingClientRect();
    let left = clientX - vRect.left;
    let top = clientY - vRect.top;

    menu.style.display = 'flex';
    const mWidth = menu.offsetWidth || 180;
    const mHeight = menu.offsetHeight || 160;

    if (left + mWidth > vRect.width - 12) {
      left = vRect.width - mWidth - 12;
    }
    if (top + mHeight > vRect.height - 12) {
      top = vRect.height - mHeight - 12;
    }

    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
  }

  initContextMenu() {
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    // Close when clicking anywhere outside
    window.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideContextMenu();
        if (this.compareEngine && this.compareEngine.isModalOpen()) {
          this.compareEngine.closeSetupModal();
          return;
        }
      }

      // If compare modal is active, mask background shortcuts
      if (this.compareEngine && this.compareEngine.isModalOpen()) {
        return;
      }

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        this.undoView();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        this.redoView();
      }
    });

    this.canvas.addEventListener('wheel', () => this.hideContextMenu(), { passive: true });

    // Menu Item Actions
    const btnShowAll = document.getElementById('menu-show-all');
    if (btnShowAll) {
      btnShowAll.onclick = () => {
        this.hideContextMenu();
        const b = document.getElementById('btn-show-all');
        if (b) b.click();
      };
    }

    const btnZoomGlobal = document.getElementById('menu-zoom-global');
    if (btnZoomGlobal) {
      btnZoomGlobal.onclick = () => {
        this.hideContextMenu();
        this.fitView();
      };
    }

    const btnResetView = document.getElementById('menu-reset-view');
    if (btnResetView) {
      btnResetView.onclick = () => {
        this.hideContextMenu();
        this.setView('iso');
        this.fitView();
      };
    }

    const btnHide = document.getElementById('menu-hide');
    if (btnHide) {
      btnHide.onclick = () => {
        this.hideContextMenu();
        if (this.selectedMeshes && this.selectedMeshes.length > 1) {
          this.hideGroup(this.selectedMeshes);
          this.clearSelection();
        } else if (this.selectedMesh) {
          this.selectedMesh.visible = false;
          this.clearSelection();
        }
      };
    }

    const btnIsolate = document.getElementById('menu-isolate');
    if (btnIsolate) {
      btnIsolate.onclick = () => {
        this.hideContextMenu();
        if (this.selectedMeshes && this.selectedMeshes.length > 1) {
          this.isolateGroup(this.selectedMeshes);
        } else if (this.selectedMesh) {
          this.isolateElement(this.selectedMesh);
        }
      };
    }

    const btnZoomTo = document.getElementById('menu-zoom-to');
    if (btnZoomTo) {
      btnZoomTo.onclick = () => {
        this.hideContextMenu();
        if (this.selectedMeshes && this.selectedMeshes.length > 1) {
          this.zoomToGroup(this.selectedMeshes);
        } else if (this.selectedMesh) {
          this.zoomToElement(this.selectedMesh);
        }
      };
    }

    const btnSectionBox = document.getElementById('menu-section-box');
    if (btnSectionBox) {
      btnSectionBox.onclick = () => {
        this.hideContextMenu();
        if (this.selectedMeshes && this.selectedMeshes.length > 1) {
          this.fitSectionBoxToTarget(this.selectedMeshes);
        } else if (this.selectedMesh) {
          this.applySectionBox(this.selectedMesh);
        }
      };
    }

    const btnMoveSecHere = document.getElementById('menu-move-sec-here');
    if (btnMoveSecHere) {
      btnMoveSecHere.onclick = () => {
        this.hideContextMenu();
        const target = (this.selectedMeshes && this.selectedMeshes.length > 1) ? 
          this.selectedMeshes : 
          (this.selectedMesh || this.contextGroupMeshes);
        if (target) {
          this.moveSectionToTarget(target);
        }
      };
    }

    const btnGroupIsolate = document.getElementById('menu-group-isolate');
    if (btnGroupIsolate) {
      btnGroupIsolate.onclick = () => {
        this.hideContextMenu();
        if (this.contextGroupMeshes) {
          this.isolateGroup(this.contextGroupMeshes);
        }
      };
    }

    const btnGroupHide = document.getElementById('menu-group-hide');
    if (btnGroupHide) {
      btnGroupHide.onclick = () => {
        this.hideContextMenu();
        if (this.contextGroupMeshes) {
          this.hideGroup(this.contextGroupMeshes);
        }
      };
    }

    const btnGroupZoom = document.getElementById('menu-group-zoom');
    if (btnGroupZoom) {
      btnGroupZoom.onclick = () => {
        this.hideContextMenu();
        if (this.contextGroupMeshes) {
          this.zoomToGroup(this.contextGroupMeshes);
        }
      };
    }

    const btnGroupSecBox = document.getElementById('menu-group-sec-box');
    if (btnGroupSecBox) {
      btnGroupSecBox.onclick = () => {
        this.hideContextMenu();
        if (this.contextGroupMeshes) {
          this.fitSectionBoxToTarget(this.contextGroupMeshes);
        }
      };
    }

    const btnToggleSecBox = document.getElementById('menu-toggle-section-box');
    if (btnToggleSecBox) {
      btnToggleSecBox.onclick = () => {
        this.hideContextMenu();
        if (this.clippingEngine && this.clippingEngine.enabled) {
          const nowVis = this.clippingEngine.toggleHelpersVisible();
          this.syncSectionUI();
          showToast(nowVis ? I18N.t('secHelpersShownMsg') : I18N.t('secHelpersHiddenMsg'), 'info');
        }
      };
    }

    const btnResetSecRot = document.getElementById('menu-reset-sec-rot');
    if (btnResetSecRot) {
      btnResetSecRot.onclick = () => {
        this.hideContextMenu();
        if (this.clippingEngine && this.clippingEngine.enabled) {
          this.clippingEngine.resetSectionRotation();
          this.syncSectionUI();
          showToast(I18N.t('secRotResetMsg'), 'success');
        }
      };
    }
  }

  computeBoundsFromTarget(target) {
    const box = new THREE.Box3();
    if (Array.isArray(target)) {
      target.forEach(m => {
        if (m && m.isMesh) {
          box.expandByObject(m);
        }
      });
    } else if (target && target.isMesh) {
      box.setFromObject(target);
    }
    return box;
  }

  isBoxInFrustum(box) {
    if (!box || box.isEmpty() || !this.camera) return true;
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    return frustum.intersectsBox(box);
  }

  zoomToBox(box) {
    if (!box || box.isEmpty() || !this.camera || !this.controls) return;
    const center = new THREE.Vector3();
    box.getCenter(center);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 0.5);

    const viewDir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (viewDir.lengthSq() < 0.0001) {
      this.camera.getWorldDirection(viewDir).negate();
    } else {
      viewDir.normalize();
    }

    const zoomFraction = 0.70;
    if (this.camera && this.camera.isOrthographicCamera) {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const aspect = width / (height || 1);
      const minAspect = Math.min(1, aspect);
      const halfH = (radius / minAspect) / zoomFraction;
      const halfW = halfH * aspect;
      this.orthographicCamera.left = -halfW;
      this.orthographicCamera.right = halfW;
      this.orthographicCamera.top = halfH;
      this.orthographicCamera.bottom = -halfH;
      this.orthographicCamera.zoom = 1.0;
      this.orthographicCamera.updateProjectionMatrix();

      const targetCam = center.clone().addScaledVector(viewDir, 25.0);
      this.showPivotIndicator(center);
      this.tweenCamera(targetCam, center);
      return;
    }

    const fovRad = ((this.perspectiveCamera ? this.perspectiveCamera.fov : 45) * Math.PI) / 180;
    const aspect = (this.perspectiveCamera ? this.perspectiveCamera.aspect : 1) || 1;
    const minAspect = Math.min(1, aspect);
    const targetDist = Math.max((radius / zoomFraction) / (Math.tan(fovRad / 2) * minAspect), 1.0);

    const targetCam = center.clone().addScaledVector(viewDir, targetDist);
    this.showPivotIndicator(center);
    this.tweenCamera(targetCam, center);
  }

  zoomToGroup(meshes) {
    if (!meshes || !meshes.length) return;
    const box = this.computeBoundsFromTarget(meshes);
    this.zoomToBox(box);
  }

  isolateGroup(meshes) {
    if (!this.activeModel || !meshes || !meshes.length) return;
    const meshSet = new Set(meshes);
    this.activeModel.traverse(obj => {
      if (obj.isMesh) {
        obj.visible = meshSet.has(obj);
      }
    });
    showToast(I18N.t('menuIsolateGroup'), 'info');
  }

  hideGroup(meshes) {
    if (!this.activeModel || !meshes || !meshes.length) return;
    meshes.forEach(m => {
      if (m && m.isMesh) m.visible = false;
    });
    if (this.selectedMeshes && this.selectedMeshes.length > 0) {
      const remaining = this.selectedMeshes.filter(m => m.visible);
      if (remaining.length === 0) {
        this.clearSelection();
      } else if (remaining.length !== this.selectedMeshes.length) {
        this.selectElements(remaining);
      }
    } else if (this.selectedMesh && !this.selectedMesh.visible) {
      this.clearSelection();
    }
    showToast(I18N.t('menuHideGroup'), 'info');
  }

  moveSectionToTarget(target) {
    if (!this.clippingEngine || !this.clippingEngine.enabled) return;
    const box = this.computeBoundsFromTarget(target);
    if (box.isEmpty()) return;

    if (this.clippingEngine.mode === 'plane') {
      this.clippingEngine.movePlaneToTarget(box);
    } else {
      this.clippingEngine.setBoxFromBounds(box, 0.08);
    }

    if (!this.isBoxInFrustum(box)) {
      this.zoomToBox(box);
    }

    this.syncSectionUI();
  }

  fitSectionBoxToTarget(target) {
    if (!this.clippingEngine) return;
    const box = this.computeBoundsFromTarget(target);
    if (box.isEmpty()) return;

    this.clippingEngine.enabled = true;
    this.clippingEngine.mode = 'box';
    this.clippingEngine.setBoxFromBounds(box, 0.08);
    this.clippingEngine.update();

    if (!this.isBoxInFrustum(box)) {
      this.zoomToBox(box);
    }

    this.syncSectionUI();

    const secActive = document.getElementById('sec-active-chk');
    if (secActive) secActive.checked = true;

    const btnSection = document.getElementById('btn-tool-section');
    if (btnSection) btnSection.classList.add('active');
    const sb = document.getElementById('left-sidebar');
    if (sb) sb.classList.remove('hidden');
    this.switchLeftTab('tab-section-content');
  }

  applySectionBox(mesh) {
    if (!mesh) return;
    this.fitSectionBoxToTarget(mesh);
    const elemName = (mesh.userData && (mesh.userData.element || mesh.userData.rawCategory)) || mesh.name || "Element";
    showToast(I18N.t('sectionBoxApplied').replace('{name}', elemName), 'success');
  }

  syncSectionUI() {
    if (!this.clippingEngine) return;

    // Clear any non-pickable selection
    if (this.selectedMeshes && this.selectedMeshes.length > 0) {
      const remaining = this.selectedMeshes.filter(m => this.isPickableElement(m));
      if (remaining.length === 0) {
        this.clearSelection();
      } else if (remaining.length !== this.selectedMeshes.length) {
        this.selectElements(remaining);
      }
    } else if (this.selectedMesh && !this.isPickableElement(this.selectedMesh)) {
      this.clearSelection();
    }

    // Sync 5-degree rotation snap toggles
    const planeSnapChk = document.getElementById('sec-plane-snap-chk');
    if (planeSnapChk) planeSnapChk.checked = this.clippingEngine.rotationSnap5Deg;
    const boxSnapChk = document.getElementById('sec-box-snap-chk');
    if (boxSnapChk) boxSnapChk.checked = this.clippingEngine.rotationSnap5Deg;

    // Sync Mode segmented control buttons & sub-panels
    const curMode = this.clippingEngine.mode;
    const modeBtnPlane = document.getElementById('sec-mode-btn-plane');
    const modeBtnBox = document.getElementById('sec-mode-btn-box');
    if (modeBtnPlane) modeBtnPlane.classList.toggle('active', curMode === 'plane');
    if (modeBtnBox) modeBtnBox.classList.toggle('active', curMode === 'box');

    const planeCtrl = document.getElementById('sec-plane-controls');
    if (planeCtrl) planeCtrl.style.display = curMode === 'plane' ? 'flex' : 'none';
    const boxCtrl = document.getElementById('sec-box-controls');
    if (boxCtrl) boxCtrl.style.display = curMode === 'box' ? 'flex' : 'none';

    // Sync Section Axis segmented control buttons
    const curAxis = this.clippingEngine.planeAxis;
    const axisBtnX = document.getElementById('sec-axis-btn-x');
    const axisBtnY = document.getElementById('sec-axis-btn-y');
    const axisBtnZ = document.getElementById('sec-axis-btn-z');
    if (axisBtnX) axisBtnX.classList.toggle('active', curAxis === 'X');
    if (axisBtnY) axisBtnY.classList.toggle('active', curAxis === 'Y');
    if (axisBtnZ) axisBtnZ.classList.toggle('active', curAxis === 'Z');

    if (this.clippingEngine.mode === 'box') {
      const r = this.clippingEngine.boxRanges;
      const setSlider = (id, val) => {
        const el = document.getElementById(id);
        if (el && typeof val === 'number') el.value = val.toFixed(3);
      };
      setSlider('sec-box-minx', r.minX);
      setSlider('sec-box-maxx', r.maxX);
      setSlider('sec-box-miny', r.minY);
      setSlider('sec-box-maxy', r.maxY);
      setSlider('sec-box-minz', r.minZ);
      setSlider('sec-box-maxz', r.maxZ);

      const rotDeg = this.clippingEngine.getBoxRotationAzimuth();
      const rotVal = document.getElementById('sec-box-rot-val');
      if (rotVal) rotVal.textContent = `${rotDeg}°`;
      const rotSlider = document.getElementById('sec-box-rot-slider');
      if (rotSlider) {
        rotSlider.step = this.clippingEngine.rotationSnap5Deg ? '5' : '1';
        rotSlider.value = rotDeg;
      }
    } else {
      const offsetSlider = document.getElementById('sec-offset-slider');
      if (offsetSlider) offsetSlider.value = this.clippingEngine.planeOffset.toFixed(3);
      
      const planeRotVal = document.getElementById('sec-plane-rot-val');
      if (planeRotVal && this.clippingEngine.planeGroup) {
        const euler = new THREE.Euler().setFromQuaternion(this.clippingEngine.planeGroup.quaternion, 'YXZ');
        const pitch = Math.round(THREE.MathUtils.radToDeg(euler.x));
        const yaw = Math.round(THREE.MathUtils.radToDeg(euler.y));
        planeRotVal.textContent = `P: ${pitch}°, Y: ${yaw}°`;
      }
    }

    // Sync Show Section Plane / Box toggle checkbox
    const helpersChk = document.getElementById('sec-show-helpers-chk');
    if (helpersChk) helpersChk.checked = this.clippingEngine.helpersVisible;

    // Sync Section Box visibility button text if present
    const boxVisBtn = document.getElementById('sec-box-toggle-vis-btn');
    if (boxVisBtn) {
      boxVisBtn.textContent = this.clippingEngine.helpersVisible ? I18N.t('menuHideSectionBox') : I18N.t('menuShowSectionBox');
    }

    // Sync Cut-away Wireframe toggle checkbox
    const wireChk = document.getElementById('sec-wireframe-chk');
    if (wireChk) wireChk.checked = this.clippingEngine.showCutawayWireframe;

    // Sync clipping planes to edge line materials
    if (this.activeModel && this.clippingEngine) {
      const activePlanes = this.clippingEngine.enabled ? this.clippingEngine.clippingPlanes : [];
      const edgePlanes = (this.clippingEngine.enabled && !this.clippingEngine.showCutawayWireframe) ? activePlanes : [];
      this.activeModel.traverse(obj => {
        if (obj.isMesh && obj.userData && obj.userData.edgeLines && obj.userData.edgeLines.material) {
          obj.userData.edgeLines.material.clippingPlanes = edgePlanes;
          obj.userData.edgeLines.material.needsUpdate = true;
        }
      });
    }

    this.updateClippingModeBtnWidths();
  }

  updateClippingModeBtnWidths() {
    const btnPlane = document.getElementById('sec-mode-btn-plane');
    const btnBox = document.getElementById('sec-mode-btn-box');
    if (!btnPlane || !btnBox) return;

    btnPlane.style.width = 'auto';
    btnBox.style.width = 'auto';

    const wPlane = Math.ceil(btnPlane.getBoundingClientRect().width);
    const wBox = Math.ceil(btnBox.getBoundingClientRect().width);
    const maxW = Math.max(wPlane, wBox);

    if (maxW > 0) {
      btnPlane.style.width = `${maxW}px`;
      btnBox.style.width = `${maxW}px`;
    }
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // If clicking a gizmo, do not process selection
    if (this.clippingEngine && this.clippingEngine.enabled) {
      if (this.clippingEngine.intersectGizmos(this.raycaster).length > 0) return;
    }

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    const valid = intersects.filter(hit => this.isPickableElement(hit.object));
    
    if (this.isMeasureMode) {
      if (valid.length > 0) this.handleMeasureClick(valid[0].point);
      return;
    }
    
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (valid.length > 0) {
      const hitMesh = valid[0].object;
      const hitPoint = valid[0].point;

      if (isCtrl) {
        // Toggle selection
        const current = (this.selectedMeshes && this.selectedMeshes.length > 0) ? 
          [...this.selectedMeshes] : 
          (this.selectedMesh ? [this.selectedMesh] : []);
        const idx = current.indexOf(hitMesh);
        if (idx >= 0) {
          current.splice(idx, 1);
        } else {
          current.push(hitMesh);
        }
        if (current.length === 0) {
          this.clearSelection();
        } else if (current.length === 1) {
          this.selectElement(current[0], hitPoint);
        } else {
          this.selectElements(current);
        }
      } else if (isShift) {
        // Remove from selection
        const current = (this.selectedMeshes && this.selectedMeshes.length > 0) ? 
          [...this.selectedMeshes] : 
          (this.selectedMesh ? [this.selectedMesh] : []);
        const idx = current.indexOf(hitMesh);
        if (idx >= 0) {
          current.splice(idx, 1);
          if (current.length === 0) {
            this.clearSelection();
          } else if (current.length === 1) {
            this.selectElement(current[0]);
          } else {
            this.selectElements(current);
          }
        }
      } else {
        this.selectElement(hitMesh, hitPoint);
      }
    } else {
      if (!isCtrl && !isShift) {
        this.clearSelection();
      }
    }
  }

  handleWheelZoom(e) {
    if (e.cancelable) e.preventDefault();

    if (this.viewWheelDebounceTimer) {
      clearTimeout(this.viewWheelDebounceTimer);
    }
    this.viewWheelDebounceTimer = setTimeout(() => {
      this.pushViewSnapshot();
    }, 300);

    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    let hitPoint = null;

    if (this.activeModel) {
      const intersects = this.raycaster.intersectObjects(this.activeModel.children, true);
      const valid = intersects.filter(h => this.isPickableElement(h.object));
      if (valid.length > 0) {
        hitPoint = valid[0].point;
      }
    }

    if (!hitPoint) {
      // Intersect plane facing camera passing through current pivotPoint
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      const pivotRef = this.pivotPoint || this.controls.target;
      const refPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.negate(), pivotRef);
      const targetPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(refPlane, targetPoint)) {
        hitPoint = targetPoint;
      } else {
        hitPoint = pivotRef.clone();
      }
    }

    // Set virtual pivot point to the exact 3D point under cursor
    this.pivotPoint.copy(hitPoint);
    this.showPivotIndicator(this.pivotPoint);

    if (this.camera && this.camera.isOrthographicCamera) {
      // Zoom scale factor for Orthographic Camera
      const factor = e.deltaY < 0 ? 1.15 : (1.0 / 1.15);
      const oldZoom = this.camera.zoom;
      const newZoom = THREE.MathUtils.clamp(oldZoom * factor, 0.005, 500);
      const effectiveFactor = newZoom / oldZoom;
      this.camera.zoom = newZoom;
      this.camera.updateProjectionMatrix();

      // Zoom towards cursor hitPoint in camera plane
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const toHit = new THREE.Vector3().subVectors(hitPoint, this.camera.position);
      const shiftFactor = 1.0 - 1.0 / effectiveFactor;
      const shiftX = toHit.dot(camRight) * shiftFactor;
      const shiftY = toHit.dot(camUp) * shiftFactor;
      const delta = new THREE.Vector3().addScaledVector(camRight, shiftX).addScaledVector(camUp, shiftY);
      this.camera.position.add(delta);
      if (this.controls && this.controls.target) {
        this.controls.target.add(delta);
      }

      if (this.compass3d) {
        this.compass3d.update();
      }
      return;
    }

    // Zoom scale factor: scroll UP (deltaY < 0) = zoom in, scroll DOWN (deltaY > 0) = zoom out
    const factor = e.deltaY < 0 ? 0.85 : (1.0 / 0.85);

    const camPos = this.camera.position;
    const offset = new THREE.Vector3().subVectors(camPos, hitPoint);
    const dist = offset.length();

    // Prevent zooming through pivot or beyond visible distance
    if (factor < 1 && dist * factor < 0.5) return;
    const maxZoomDist = Math.max(30000, this.camera.far * 0.88);
    if (factor > 1 && dist * factor > maxZoomDist) return;

    // Move camera along cursor ray: hitPoint remains at the EXACT same screen pixel!
    const newCamPos = hitPoint.clone().addScaledVector(offset, factor);
    const deltaCam = new THREE.Vector3().subVectors(newCamPos, camPos);

    this.camera.position.copy(newCamPos);
    this.controls.target.add(deltaCam);

    if (this.compass3d) {
      this.compass3d.update();
    }
  }
  
  handleMeasureClick(point) {
    this.measurePoints.push(point);
    if (this.measurePoints.length === 1) {
      showToast(I18N.t('measureEnd'), 'warning');
    } else if (this.measurePoints.length === 2) {
      const p1 = this.measurePoints[0];
      const p2 = this.measurePoints[1];
      const dist = p1.distanceTo(p2);
      
      // Draw 3D Line
      if (this.measureLine) this.scene.remove(this.measureLine);
      const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      this.measureLine = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 }));
      this.scene.add(this.measureLine);
      
      showToast(`${I18N.t('measureDist')}: ${dist.toFixed(3)} m`, 'success');
      this.measurePoints = [];
    }
  }

  initThemeSystem() {
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem('bimscope_theme') || 'dark';
    } catch (e) {
      savedTheme = 'dark';
    }
    this.setTheme(savedTheme, false);

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => {
        const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(nextTheme, true);
      });
    }

    const darkBtn = document.getElementById('pref-theme-dark-btn');
    const lightBtn = document.getElementById('pref-theme-light-btn');
    if (darkBtn) {
      darkBtn.addEventListener('click', () => this.setTheme('dark', true));
    }
    if (lightBtn) {
      lightBtn.addEventListener('click', () => this.setTheme('light', true));
    }
  }

  setTheme(themeName, save = true) {
    this.currentTheme = themeName === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.currentTheme);

    // Update Navbar Theme Button Icons
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (sunIcon && moonIcon) {
      if (this.currentTheme === 'dark') {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      }
    }

    // Update Segmented Control Buttons
    const darkBtn = document.getElementById('pref-theme-dark-btn');
    const lightBtn = document.getElementById('pref-theme-light-btn');
    if (darkBtn && lightBtn) {
      if (this.currentTheme === 'dark') {
        darkBtn.classList.add('active');
        lightBtn.classList.remove('active');
      } else {
        lightBtn.classList.add('active');
        darkBtn.classList.remove('active');
      }
    }

    // Adapt 3D Viewport Background & Grid
    this.updateViewportTheme(this.currentTheme);

    if (save) {
      try {
        localStorage.setItem('bimscope_theme', this.currentTheme);
      } catch (e) {}
    }
  }

  updateViewportTheme(themeName) {
    if (!this.scene) return;
    if (themeName === 'light') {
      this.scene.background = new THREE.Color(0xf1f5f9);
      if (this.scene.fog) this.scene.fog.color.set(0xf1f5f9);
      if (this.grid && this.grid.material) {
        this.grid.material.color.set(0x94a3b8);
      }
    } else {
      this.scene.background = new THREE.Color(0x0c1017);
      if (this.scene.fog) this.scene.fog.color.set(0x0c1017);
      if (this.grid && this.grid.material) {
        this.grid.material.color.set(0x131a28);
      }
    }
  }
  
  initUI() {
    // 0. Theme System
    this.initThemeSystem();

    // 1. Language Toggle
    document.getElementById('btn-lang-toggle').addEventListener('click', () => {
      I18N.toggleLanguage();
      this.updateModelSubtitle();
      this.buildHierarchyTree();
      this.updateBottomLegend();
      this.updateClippingModeBtnWidths();
      this.updateCameraProjUI();
      this.updateViewHistoryUI();
      if (this.selectedMeshes && this.selectedMeshes.length > 1) {
        this.selectElements(this.selectedMeshes);
      } else if (this.selectedMesh) {
        this.selectElement(this.selectedMesh);
      } else {
        this.renderModelInfoInspector();
      }
    });
    
    // 2. Open File Input
    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-open-file').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFileInput(e.target.files);
      }
    });
    
    // 3. Demo Model Button
    document.getElementById('btn-load-demo').addEventListener('click', () => {
      this.loadDemoModel();
    });
    
    // 4. View Preset Buttons
    document.getElementById('btn-view-iso').onclick = () => this.setView('iso');
    document.getElementById('btn-view-plan').onclick = () => this.setView('plan');
    document.getElementById('btn-view-north').onclick = () => this.setView('north');
    document.getElementById('btn-view-south').onclick = () => this.setView('south');
    document.getElementById('btn-view-east').onclick = () => this.setView('east');
    document.getElementById('btn-view-west').onclick = () => this.setView('west');
    
    const btnProj = document.getElementById('btn-view-proj') || document.getElementById('btn-view-fit');
    if (btnProj) {
      btnProj.onclick = () => this.toggleCameraProjection();
    }
    this.updateCameraProjUI();

    const btnUndo = document.getElementById('btn-view-undo');
    if (btnUndo) {
      btnUndo.onclick = () => this.undoView();
    }
    const btnRedo = document.getElementById('btn-view-redo');
    if (btnRedo) {
      btnRedo.onclick = () => this.redoView();
    }
    this.updateViewHistoryUI();
    this.updateViewportCenterNav();
    
    // 5. Tool Toggles in Navbar (safely guarded)
    const btnSection = document.getElementById('btn-tool-section');
    if (btnSection) {
      btnSection.onclick = () => {
        this.switchLeftTab('tab-section-content');
        btnSection.classList.toggle('active');
      };
    }
    
    const btnSolar = document.getElementById('btn-tool-solar');
    if (btnSolar) {
      btnSolar.onclick = () => {
        this.switchLeftTab('tab-light-content');
        btnSolar.classList.toggle('active');
      };
    }
    
    // 5b. Camera Tool in Navbar (safely guarded)
    const btnCamera = document.getElementById('btn-tool-camera');
    if (btnCamera) {
      btnCamera.onclick = () => {
        this.autoCollapsedLeft = false;
        if (this.toggleTreeCollapse) {
          this.toggleTreeCollapse(true);
        } else {
          const sb = document.getElementById('left-sidebar');
          if (sb) {
            sb.classList.remove('hidden');
            sb.classList.remove('collapsed');
          }
        }
        this.switchLeftTab('tab-camera-content');
      };
    }

    // Visible Distance Sliders (Navbar and Sidebar bidirectional sync)
    const navDistSlider = document.getElementById('nav-dist-slider');
    const sideDistSlider = document.getElementById('side-dist-slider');

    if (navDistSlider) {
      navDistSlider.addEventListener('input', (e) => {
        this.setFarClip(parseFloat(e.target.value), true);
      });
    }

    if (sideDistSlider) {
      sideDistSlider.addEventListener('input', (e) => {
        this.setFarClip(parseFloat(e.target.value), true);
      });
    }

    // Distance Preset Buttons (up to 10 km max)
    const distPresets = {
      'btn-dist-1k': 1000,
      'btn-dist-2k': 2000,
      'btn-dist-3k': 3000,
      'btn-dist-5k': 5000,
      'btn-dist-8k': 8000,
      'btn-dist-max': 10000
    };
    Object.entries(distPresets).forEach(([id, dist]) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.onclick = () => {
          this.setFarClip(dist, true);
          showToast(`${I18N.t('viewDistance')}: ${this.formatDistance(dist)}`, 'info');
        };
      }
    });

    // Selection Highlight Color & Opacity Controls in Inspector
    const colPicker = document.getElementById('highlight-color-picker');
    const colHex = document.getElementById('highlight-color-hex');
    if (colPicker) {
      colPicker.value = this.highlightColor;
      colPicker.addEventListener('input', (e) => {
        this.highlightColor = e.target.value;
        if (colHex) colHex.textContent = e.target.value;
        this.updateHighlightAppearance();
      });
    }

    const opSlider = document.getElementById('highlight-opacity-slider');
    const opVal = document.getElementById('highlight-opacity-val');
    if (opSlider) {
      opSlider.value = Math.round(this.highlightOpacity * 100);
      opSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.highlightOpacity = val / 100;
        if (opVal) opVal.textContent = `${val}%`;
        this.updateHighlightAppearance();
      });
    }

    // Architectural Edge Lines Toggle & Opacity Controls in Inspector
    const edgeChk = document.getElementById('edge-lines-toggle-chk');
    if (edgeChk) {
      edgeChk.checked = this.showEdges;
      edgeChk.addEventListener('change', () => {
        this.setEdgeLinesVisible(edgeChk.checked);
      });
    }

    const edgeOpSlider = document.getElementById('edge-opacity-slider');
    const edgeOpVal = document.getElementById('edge-opacity-val');
    if (edgeOpSlider) {
      edgeOpSlider.value = Math.round(this.edgeOpacity * 100);
      edgeOpSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setEdgeLinesOpacity(val / 100);
      });
    }

    // Fog Toggle
    const fogChk = document.getElementById('fog-toggle-chk');
    if (fogChk) {
      fogChk.checked = this.fogEnabled;
      fogChk.onchange = () => {
        this.fogEnabled = fogChk.checked;
        this.updateFog();
      };
    }

    // Camera FOV Slider
    const fovSlider = document.getElementById('cam-fov-slider');
    const fovVal = document.getElementById('cam-fov-val');
    if (fovSlider) {
      fovSlider.value = this.camera.fov;
      fovSlider.oninput = (e) => {
        const fov = parseInt(e.target.value, 10);
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
        if (fovVal) fovVal.textContent = `${fov}°`;
      };
    }

    // Reset Camera Button
    const btnCamReset = document.getElementById('btn-cam-reset');
    if (btnCamReset) {
      btnCamReset.onclick = () => this.fitView();
    }
    
    // Left Sidebar: Persisted Custom Width, Collapse / Expand, and Drag-to-Resize (280px - 600px)
    const lsb = document.getElementById('left-sidebar');
    const btnTree = document.getElementById('btn-tool-tree');
    const btnTreeCollapse = document.getElementById('btn-tree-collapse');
    const lResizer = document.getElementById('left-sidebar-resizer');

    // Apply persisted or default custom width initially
    if (lsb && this.customTreeWidth) {
      lsb.style.width = `${this.customTreeWidth}px`;
    }

    const updateTreeCollapseBtnUI = (collapsed) => {
      if (!btnTreeCollapse) return;
      const titleKey = collapsed ? 'expandTree' : 'collapseTree';
      const fallbackTitle = collapsed ? 'Expand Model Hierarchy' : 'Collapse Model Hierarchy';
      btnTreeCollapse.setAttribute('data-i18n-title', titleKey);
      btnTreeCollapse.setAttribute('title', I18N.t(titleKey) || fallbackTitle);
      btnTreeCollapse.innerHTML = collapsed ? `
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <line x1="6" y1="2" x2="6" y2="14" />
          <polyline points="7 6 9 8 7 10" />
        </svg>
      ` : `
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <line x1="6" y1="2" x2="6" y2="14" />
          <polyline points="9 6 7 8 9 10" />
        </svg>
      `;
    };

    const toggleTreeCollapse = (forceOpen = null) => {
      if (!lsb) return;
      const willCollapse = forceOpen !== null ? !forceOpen : !lsb.classList.contains('collapsed');
      if (willCollapse) {
        lsb.classList.add('collapsed');
        lsb.style.width = '0px';
        if (btnTree) btnTree.classList.remove('active');
        updateTreeCollapseBtnUI(true);
      } else {
        lsb.classList.remove('collapsed');
        lsb.classList.remove('hidden');
        lsb.style.width = `${this.customTreeWidth || 330}px`;
        if (btnTree) btnTree.classList.add('active');
        updateTreeCollapseBtnUI(false);
      }
      this.onContainerResize();
    };
    this.toggleTreeCollapse = toggleTreeCollapse;

    if (btnTreeCollapse) {
      btnTreeCollapse.onclick = () => {
        this.autoCollapsedLeft = false;
        toggleTreeCollapse();
      };
      updateTreeCollapseBtnUI(lsb ? lsb.classList.contains('collapsed') : false);
    }

    if (btnTree) {
      btnTree.onclick = () => {
        if (!lsb) return;
        this.autoCollapsedLeft = false;
        if (lsb.classList.contains('collapsed') || lsb.classList.contains('hidden')) {
          toggleTreeCollapse(true);
        } else {
          toggleTreeCollapse(false);
        }
      };
    }
    if (lsb) {
      lsb.addEventListener('transitionend', (e) => {
        if (e.target === lsb && (e.propertyName === 'width' || e.propertyName === 'transform')) {
          this.onContainerResize();
        }
      });
    }

    // Drag-to-resize handle on right edge of Left Sidebar
    if (lResizer && lsb) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      const onPointerDown = (e) => {
        if (lsb.classList.contains('collapsed')) return;
        isResizing = true;
        startX = e.clientX;
        startWidth = lsb.getBoundingClientRect().width;
        lResizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        lsb.style.transition = 'none';
        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!isResizing) return;
        const deltaX = e.clientX - startX;
        let newWidth = Math.round(startWidth + deltaX);
        newWidth = Math.min(600, Math.max(280, newWidth));
        lsb.style.width = `${newWidth}px`;
        this.customTreeWidth = newWidth;
        this.onContainerResize();
      };

      const onPointerUp = () => {
        if (!isResizing) return;
        isResizing = false;
        lResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        lsb.style.transition = '';
        localStorage.setItem('bimscope_tree_width', this.customTreeWidth);
        this.onContainerResize();
      };

      lResizer.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
    
    const rsb = document.getElementById('right-sidebar');
    const btnInspect = document.getElementById('btn-tool-inspect');
    const btnCollapse = document.getElementById('btn-inspector-collapse');
    const resizer = document.getElementById('right-sidebar-resizer');

    // Apply persisted or default custom width initially
    if (rsb && this.customInspectorWidth) {
      rsb.style.width = `${this.customInspectorWidth}px`;
    }

    const updateCollapseBtnUI = (collapsed) => {
      if (!btnCollapse) return;
      const titleKey = collapsed ? 'expandInspector' : 'collapseInspector';
      const fallbackTitle = collapsed ? 'Expand Inspector' : 'Collapse Inspector';
      btnCollapse.setAttribute('data-i18n-title', titleKey);
      btnCollapse.setAttribute('title', I18N.t(titleKey) || fallbackTitle);
      btnCollapse.innerHTML = collapsed ? `
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <line x1="10" y1="2" x2="10" y2="14" />
          <polyline points="7 6 5 8 7 10" />
        </svg>
      ` : `
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <line x1="10" y1="2" x2="10" y2="14" />
          <polyline points="5 6 7 8 5 10" />
        </svg>
      `;
    };

    const toggleInspectorCollapse = (forceOpen = null) => {
      if (!rsb) return;
      const willCollapse = forceOpen !== null ? !forceOpen : !rsb.classList.contains('collapsed');
      if (willCollapse) {
        rsb.classList.add('collapsed');
        rsb.style.width = '0px';
        if (btnInspect) btnInspect.classList.remove('active');
        updateCollapseBtnUI(true);
      } else {
        rsb.classList.remove('collapsed');
        rsb.classList.remove('hidden');
        rsb.style.width = `${this.customInspectorWidth || 330}px`;
        if (btnInspect) btnInspect.classList.add('active');
        updateCollapseBtnUI(false);
        if (this.selectedMesh || (this.selectedMeshes && this.selectedMeshes.length > 0)) {
          setTimeout(() => this.setupInspectorTabsScroll(), 250);
        }
      }
      this.onContainerResize();
    };
    this.toggleInspectorCollapse = toggleInspectorCollapse;

    if (btnCollapse) {
      btnCollapse.onclick = () => {
        this.autoCollapsedRight = false;
        toggleInspectorCollapse();
      };
      updateCollapseBtnUI(rsb ? rsb.classList.contains('collapsed') : false);
    }

    if (btnInspect) {
      btnInspect.onclick = () => {
        if (!rsb) return;
        this.autoCollapsedRight = false;
        if (rsb.classList.contains('collapsed') || rsb.classList.contains('hidden')) {
          toggleInspectorCollapse(true);
        } else {
          toggleInspectorCollapse(false);
        }
      };
    }
    if (rsb) {
      rsb.addEventListener('transitionend', (e) => {
        if (e.target === rsb && (e.propertyName === 'width' || e.propertyName === 'transform')) {
          this.onContainerResize();
        }
      });
    }

    // Drag-to-resize handle on left edge of Inspector
    if (resizer && rsb) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      const onPointerDown = (e) => {
        if (rsb.classList.contains('collapsed')) return;
        isResizing = true;
        startX = e.clientX;
        startWidth = rsb.getBoundingClientRect().width;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        rsb.style.transition = 'none';
        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!isResizing) return;
        const deltaX = startX - e.clientX;
        let newWidth = Math.round(startWidth + deltaX);
        newWidth = Math.min(600, Math.max(280, newWidth));
        rsb.style.width = `${newWidth}px`;
        this.customInspectorWidth = newWidth;
        this.onContainerResize();
      };

      const onPointerUp = () => {
        if (!isResizing) return;
        isResizing = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        rsb.style.transition = '';
        localStorage.setItem('bimscope_inspector_width', this.customInspectorWidth);
        this.onContainerResize();
        if (this.selectedMesh || (this.selectedMeshes && this.selectedMeshes.length > 0)) {
          if (this.updateInspectorTabsOverflow) {
            this.updateInspectorTabsOverflow();
          } else {
            this.setupInspectorTabsScroll();
          }
        }
      };

      resizer.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
    
    const btnMeasure = document.getElementById('btn-tool-measure');
    btnMeasure.onclick = () => {
      this.isMeasureMode = !this.isMeasureMode;
      btnMeasure.classList.toggle('active', this.isMeasureMode);
      if (this.isMeasureMode) {
        showToast(I18N.t('measureStart'), 'warning');
        this.measurePoints = [];
      } else {
        if (this.measureLine) {
          this.scene.remove(this.measureLine);
          this.measureLine = null;
        }
      }
    };
    
    // 6. Left Sidebar Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        this.switchLeftTab(targetId);
      });
    });
    this.setupSidebarTabsScroll();
    
    // 7. Search filter in Left Sidebar (supports collapsible tree branches and leaf items)
    document.getElementById('tree-search-input').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.tree-branch').forEach(branch => {
        const branchHeader = branch.querySelector('.tree-branch-header');
        const branchText = branchHeader ? branchHeader.textContent.toLowerCase() : '';
        const leaves = branch.querySelectorAll('.tree-leaf-item');
        let anyLeafMatch = false;

        leaves.forEach(leaf => {
          const match = q === '' || leaf.textContent.toLowerCase().includes(q);
          leaf.style.display = match ? 'flex' : 'none';
          if (match && q !== '') anyLeafMatch = true;
        });

        const branchMatch = q === '' || branchText.includes(q) || anyLeafMatch;
        branch.style.display = branchMatch ? 'block' : 'none';

        if (q !== '' && anyLeafMatch) {
          const childrenContainer = branch.querySelector('.tree-branch-children');
          const expander = branch.querySelector('.tree-expander');
          if (childrenContainer) childrenContainer.classList.remove('collapsed');
          if (expander) expander.classList.remove('collapsed');
        }
      });
      document.querySelectorAll('.structure-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = (q === '' || text.includes(q)) ? 'flex' : 'none';
      });
    });
    
    // 8. Quick Tree buttons
    const triggerShowAll = () => {
      if (this.activeModel) this.activeModel.traverse(m => { if (m.isMesh) m.visible = true; });
      document.querySelectorAll('.toggle-switch input').forEach(c => c.checked = true);
      this.categoryStates.forEach(st => {
        st.visible = true;
        if (st.chipEl) {
          st.chipEl.classList.remove('cat-hidden');
          st.chipEl.classList.remove('cat-isolated');
        }
        if (st.checkboxEl) st.checkboxEl.checked = true;
      });
    };
    const triggerHideAll = () => {
      if (this.activeModel) this.activeModel.traverse(m => { if (m.isMesh) m.visible = false; });
      document.querySelectorAll('.toggle-switch input').forEach(c => c.checked = false);
      this.categoryStates.forEach(st => {
        st.visible = false;
        if (st.chipEl) {
          st.chipEl.classList.add('cat-hidden');
          st.chipEl.classList.remove('cat-isolated');
        }
        if (st.checkboxEl) st.checkboxEl.checked = false;
      });
    };

    const setupTreeButtons = (containerId, expId, colId, showId, hideId) => {
      const expBtn = document.getElementById(expId);
      if (expBtn) {
        expBtn.onclick = () => {
          const c = document.getElementById(containerId);
          if (c) {
            c.querySelectorAll('.tree-branch-children').forEach(el => el.classList.remove('collapsed'));
            c.querySelectorAll('.tree-expander').forEach(el => el.classList.remove('collapsed'));
          }
        };
      }
      const colBtn = document.getElementById(colId);
      if (colBtn) {
        colBtn.onclick = () => {
          const c = document.getElementById(containerId);
          if (c) {
            c.querySelectorAll('.tree-branch-children').forEach(el => el.classList.add('collapsed'));
            c.querySelectorAll('.tree-expander').forEach(el => el.classList.add('collapsed'));
          }
        };
      }
      const showBtn = document.getElementById(showId);
      if (showBtn) showBtn.onclick = triggerShowAll;
      const hideBtn = document.getElementById(hideId);
      if (hideBtn) hideBtn.onclick = triggerHideAll;
    };

    setupTreeButtons('tree-structures', 'btn-struct-expand-all', 'btn-struct-collapse-all', 'btn-show-all', 'btn-hide-all');
    setupTreeButtons('tree-levels', 'btn-levels-expand-all', 'btn-levels-collapse-all', 'btn-levels-show-all', 'btn-levels-hide-all');
    setupTreeButtons('tree-elements', 'btn-elem-expand-all', 'btn-elem-collapse-all', 'btn-elem-show-all', 'btn-elem-hide-all');

    const resetOpBtn = document.getElementById('btn-reset-opacity');
    if (resetOpBtn) {
      resetOpBtn.onclick = () => {
        if (this.activeModel) {
          this.activeModel.traverse(m => {
            if (m.isMesh && m.material) {
              if (Array.isArray(m.material)) {
                m.material.forEach(mat => {
                  mat.transparent = Boolean(mat.userData?.originalTransparent);
                  mat.opacity = mat.userData?.originalOpacity !== undefined ? mat.userData.originalOpacity : 1.0;
                  mat.needsUpdate = true;
                });
              } else {
                m.material.transparent = Boolean(m.material.userData?.originalTransparent);
                m.material.opacity = m.material.userData?.originalOpacity !== undefined ? m.material.userData.originalOpacity : 1.0;
                m.material.needsUpdate = true;
              }
            }
          });
        }
        document.querySelectorAll('.range-slider').forEach(s => s.value = 1.0);
      };
    }
    
    // 9. Section Controls
    const secActive = document.getElementById('sec-active-chk');
    secActive.onchange = () => {
      this.clippingEngine.enabled = secActive.checked;
      this.clippingEngine.update();
      if (!this.clippingEngine.enabled) {
        if (this.selectedMeshes && this.selectedMeshes.length > 0) {
          const remaining = this.selectedMeshes.filter(m => this.isPickableElement(m));
          if (remaining.length === 0) this.clearSelection();
          else if (remaining.length !== this.selectedMeshes.length) this.selectElements(remaining);
        } else if (this.selectedMesh && !this.isPickableElement(this.selectedMesh)) {
          this.clearSelection();
        }
      }
      this.syncSectionUI();
    };

    const ensureSectioningActive = () => {
      if (!this.clippingEngine.enabled) {
        this.clippingEngine.enabled = true;
        this.clippingEngine.update();
        if (secActive) secActive.checked = true;
      }
    };

    const secShowHelpersChk = document.getElementById('sec-show-helpers-chk');
    if (secShowHelpersChk) {
      secShowHelpersChk.onchange = () => {
        ensureSectioningActive();
        this.clippingEngine.setHelpersVisible(secShowHelpersChk.checked);
        this.syncSectionUI();
        showToast(secShowHelpersChk.checked ? I18N.t('secHelpersShownMsg') : I18N.t('secHelpersHiddenMsg'), 'info');
      };
    }

    const secWireframeChk = document.getElementById('sec-wireframe-chk');
    if (secWireframeChk) {
      secWireframeChk.onchange = () => {
        this.clippingEngine.showCutawayWireframe = secWireframeChk.checked;
        this.syncSectionUI();
      };
    }
    
    const setClippingMode = (mode) => {
      ensureSectioningActive();
      this.clippingEngine.mode = mode;
      this.clippingEngine.update();
      if (this.selectedMeshes && this.selectedMeshes.length > 0) {
        const remaining = this.selectedMeshes.filter(m => this.isPickableElement(m));
        if (remaining.length === 0) this.clearSelection();
        else if (remaining.length !== this.selectedMeshes.length) this.selectElements(remaining);
      } else if (this.selectedMesh && !this.isPickableElement(this.selectedMesh)) {
        this.clearSelection();
      }
      this.syncSectionUI();
    };

    const modeBtnPlane = document.getElementById('sec-mode-btn-plane');
    if (modeBtnPlane) modeBtnPlane.onclick = () => setClippingMode('plane');
    const modeBtnBox = document.getElementById('sec-mode-btn-box');
    if (modeBtnBox) modeBtnBox.onclick = () => setClippingMode('box');

    const secModeSel = document.getElementById('sec-mode-sel');
    if (secModeSel) {
      secModeSel.onchange = () => setClippingMode(secModeSel.value);
    }
    
    // Box range sliders
    const keyMap = {
      'sec-box-minx': 'minX', 'sec-box-maxx': 'maxX',
      'sec-box-miny': 'minY', 'sec-box-maxy': 'maxY',
      'sec-box-minz': 'minZ', 'sec-box-maxz': 'maxZ'
    };
    Object.entries(keyMap).forEach(([id, prop]) => {
      const el = document.getElementById(id);
      if (el) {
        el.oninput = () => {
          ensureSectioningActive();
          this.clippingEngine.boxRanges[prop] = parseFloat(el.value);
          this.clippingEngine.setFromBoxRanges(this.clippingEngine.boxRanges);
          this.syncSectionUI();
        };
      }
    });

    const boxResetBtn = document.getElementById('sec-box-reset-btn');
    if (boxResetBtn) {
      boxResetBtn.onclick = () => {
        ensureSectioningActive();
        this.clippingEngine.boxQuaternion.identity();
        this.clippingEngine.boxRanges = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
        ['sec-box-minx', 'sec-box-miny', 'sec-box-minz'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = 0;
        });
        ['sec-box-maxx', 'sec-box-maxy', 'sec-box-maxz'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = 1;
        });
        this.clippingEngine.setFromBoxRanges(this.clippingEngine.boxRanges);
        this.syncSectionUI();
      };
    }

    // Toggle Section Box Visibility Button
    const boxToggleVisBtn = document.getElementById('sec-box-toggle-vis-btn');
    if (boxToggleVisBtn) {
      boxToggleVisBtn.onclick = () => {
        ensureSectioningActive();
        const nowVis = this.clippingEngine.toggleHelpersVisible();
        this.syncSectionUI();
        showToast(nowVis ? I18N.t('secHelpersShownMsg') : I18N.t('secHelpersHiddenMsg'), 'info');
      };
    }

    // Section Box Rotation Slider & Buttons
    const boxRotSlider = document.getElementById('sec-box-rot-slider');
    if (boxRotSlider) {
      boxRotSlider.oninput = () => {
        ensureSectioningActive();
        const deg = parseFloat(boxRotSlider.value);
        this.clippingEngine.setBoxRotationAzimuth(deg);
        this.syncSectionUI();
      };
    }

    const boxRotCcw = document.getElementById('sec-box-rot-ccw');
    if (boxRotCcw) {
      boxRotCcw.onclick = () => {
        ensureSectioningActive();
        let cur = this.clippingEngine.getBoxRotationAzimuth();
        cur = (cur - 45 + 360) % 360;
        this.clippingEngine.setBoxRotationAzimuth(cur);
        this.syncSectionUI();
      };
    }

    const boxRotCw = document.getElementById('sec-box-rot-cw');
    if (boxRotCw) {
      boxRotCw.onclick = () => {
        ensureSectioningActive();
        let cur = this.clippingEngine.getBoxRotationAzimuth();
        cur = (cur + 45) % 360;
        this.clippingEngine.setBoxRotationAzimuth(cur);
        this.syncSectionUI();
      };
    }

    const boxRot90 = document.getElementById('sec-box-rot-90');
    if (boxRot90) {
      boxRot90.onclick = () => {
        let cur = this.clippingEngine.getBoxRotationAzimuth();
        cur = (cur + 90) % 360;
        this.clippingEngine.setBoxRotationAzimuth(cur);
        this.syncSectionUI();
      };
    }

    const boxRotReset = document.getElementById('sec-box-rot-reset');
    if (boxRotReset) {
      boxRotReset.onclick = () => {
        this.clippingEngine.resetBoxRotation();
        this.syncSectionUI();
      };
    }

    // 5-Degree Rotation Snap Checkboxes
    const planeSnapChk = document.getElementById('sec-plane-snap-chk');
    if (planeSnapChk) {
      planeSnapChk.onchange = () => {
        this.clippingEngine.setRotationSnap5Deg(planeSnapChk.checked);
        this.syncSectionUI();
      };
    }
    const boxSnapChk = document.getElementById('sec-box-snap-chk');
    if (boxSnapChk) {
      boxSnapChk.onchange = () => {
        this.clippingEngine.setRotationSnap5Deg(boxSnapChk.checked);
        this.syncSectionUI();
      };
    }
    
    const setPlaneAxis = (axis) => {
      ensureSectioningActive();
      this.clippingEngine.setPlaneAxis(axis);
      this.syncSectionUI();
    };

    const axisBtnX = document.getElementById('sec-axis-btn-x');
    if (axisBtnX) axisBtnX.onclick = () => setPlaneAxis('X');
    const axisBtnY = document.getElementById('sec-axis-btn-y');
    if (axisBtnY) axisBtnY.onclick = () => setPlaneAxis('Y');
    const axisBtnZ = document.getElementById('sec-axis-btn-z');
    if (axisBtnZ) axisBtnZ.onclick = () => setPlaneAxis('Z');

    const secAxis = document.getElementById('sec-axis-sel');
    if (secAxis) {
      secAxis.onchange = () => setPlaneAxis(secAxis.value);
    }
    
    const secOffset = document.getElementById('sec-offset-slider');
    if (secOffset) {
      secOffset.oninput = () => {
        ensureSectioningActive();
        this.clippingEngine.planeOffset = parseFloat(secOffset.value);
        this.clippingEngine.setPlaneAxis(this.clippingEngine.planeAxis);
        this.syncSectionUI();
      };
    }
    
    const secInvert = document.getElementById('sec-invert-btn');
    if (secInvert) {
      secInvert.onclick = () => {
        ensureSectioningActive();
        this.clippingEngine.planeInvert = !this.clippingEngine.planeInvert;
        this.clippingEngine.updatePlaneFromState();
        this.syncSectionUI();
      };
    }
    
    document.getElementById('sec-reset-btn').onclick = () => {
      this.clippingEngine.reset();
      secActive.checked = false;
      secOffset.value = 0.5;
      this.syncSectionUI();
    };

    // Section Plane Orientation Alignment Buttons
    const planeAlignZ = document.getElementById('sec-plane-align-z');
    if (planeAlignZ) {
      planeAlignZ.onclick = () => setPlaneAxis('Z');
    }
    const planeAlignX = document.getElementById('sec-plane-align-x');
    if (planeAlignX) {
      planeAlignX.onclick = () => setPlaneAxis('X');
    }
    const planeAlignY = document.getElementById('sec-plane-align-y');
    if (planeAlignY) {
      planeAlignY.onclick = () => setPlaneAxis('Y');
    }
    const planeRotReset = document.getElementById('sec-plane-rot-reset');
    if (planeRotReset) {
      planeRotReset.onclick = () => {
        ensureSectioningActive();
        this.clippingEngine.resetPlaneRotation();
        this.syncSectionUI();
      };
    }
    this.updateClippingModeBtnWidths();
    
    // 10. Solar Controls
    const lightMode = document.getElementById('light-mode-sel');
    lightMode.onchange = () => {
      this.solarEngine.mode = lightMode.value;
      document.getElementById('solar-sg-controls').style.display = lightMode.value === 'singapore' ? 'flex' : 'none';
      document.getElementById('solar-custom-controls').style.display = lightMode.value === 'custom' ? 'flex' : 'none';
      this.updateSolarUI();
    };

    // Solar Date Input
    const dateInput = document.getElementById('solar-date-input');
    if (dateInput) {
      const cur = this.solarEngine.currentDate;
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      dateInput.value = `${yyyy}-${mm}-${dd}`;

      const handleDateChange = () => {
        if (!dateInput.value) return;
        const parts = dateInput.value.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          this.solarEngine.currentDate = new Date(year, month, day, 12, 0, 0);
          this.updateSolarUI();
        }
      };
      dateInput.addEventListener('change', handleDateChange);
      dateInput.addEventListener('input', handleDateChange);
    }
    
    const timeSlider = document.getElementById('solar-time-slider');
    timeSlider.oninput = () => {
      this.solarEngine.timeMinutes = parseInt(timeSlider.value, 10);
      this.updateSolarUI();
    };
    
    // Presets
    document.getElementById('btn-preset-dawn').onclick = () => { this.solarEngine.timeMinutes = 6 * 60 + 45; this.updateSolarUI(); };
    document.getElementById('btn-preset-noon').onclick = () => { this.solarEngine.timeMinutes = 13 * 60 + 8; this.updateSolarUI(); };
    document.getElementById('btn-preset-afternoon').onclick = () => { this.solarEngine.timeMinutes = 16 * 60 + 30; this.updateSolarUI(); };
    document.getElementById('btn-preset-sunset').onclick = () => { this.solarEngine.timeMinutes = 19 * 60 + 15; this.updateSolarUI(); };
    document.getElementById('btn-preset-night').onclick = () => { this.solarEngine.timeMinutes = 22 * 60; this.updateSolarUI(); };
    
    // Timelapse Play button
    const playBtn = document.getElementById('btn-solar-play');
    playBtn.onclick = () => {
      this.solarEngine.isTimelapseRunning = !this.solarEngine.isTimelapseRunning;
      playBtn.textContent = this.solarEngine.isTimelapseRunning ? I18N.t('lightStop') : I18N.t('lightPlay');
      playBtn.classList.toggle('active', this.solarEngine.isTimelapseRunning);
    };
    
    // Custom light sliders
    document.getElementById('light-custom-az').oninput = (e) => {
      this.solarEngine.customAzimuth = parseFloat(e.target.value);
      this.solarEngine.update();
    };
    document.getElementById('light-custom-el').oninput = (e) => {
      this.solarEngine.customElevation = parseFloat(e.target.value);
      this.solarEngine.update();
    };
    document.getElementById('light-custom-int').oninput = (e) => {
      this.solarEngine.customIntensity = parseFloat(e.target.value);
      this.solarEngine.update();
    };
    document.getElementById('light-custom-amb').oninput = (e) => {
      this.solarEngine.customAmbient = parseFloat(e.target.value);
      this.solarEngine.update();
    };

    // Animation Player UI setup
    this.initAnimationUI();

    // Bottom Bar Legend Horizontal Scroll & Edge Shadow Setup
    this.setupBottomBarScroll();
  }
  
  switchLeftTab(tabContentId) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabContentId);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === tabContentId);
    });
    this.scrollActiveSidebarTabIntoView();
    if (tabContentId === 'tab-section-content') {
      this.updateClippingModeBtnWidths();
    }
  }
  
  updateSolarUI() {
    const res = this.solarEngine.update();
    const h = Math.floor(this.solarEngine.timeMinutes / 60);
    const m = Math.floor(this.solarEngine.timeMinutes % 60);
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    
    document.getElementById('solar-time-val').textContent = timeStr;
    document.getElementById('solar-time-slider').value = this.solarEngine.timeMinutes;
    document.getElementById('solar-az-val').textContent = `${res.azimuth}°`;
    document.getElementById('solar-el-val').textContent = `${res.elevation}°`;
    document.getElementById('solar-status-msg').textContent = res.isDay ? I18N.t('solarDayMsg') : I18N.t('solarNightMsg');
  }

  // ==========================================
  // UNIVERSAL ANIMATION PLAYER ENGINE
  // ==========================================
  initAnimationUI() {
    const playBtn = document.getElementById('anim-btn-play');
    if (playBtn) {
      playBtn.onclick = () => this.toggleAnimationPlay();
    }

    const speedBtn = document.getElementById('anim-btn-speed');
    if (speedBtn) {
      speedBtn.onclick = () => this.cycleAnimationSpeed();
    }

    const loopBtn = document.getElementById('anim-btn-loop');
    if (loopBtn) {
      loopBtn.onclick = () => this.toggleAnimationLoop();
    }

    const clipSelect = document.getElementById('anim-clip-select');
    if (clipSelect) {
      clipSelect.onchange = (e) => {
        const idx = parseInt(e.target.value, 10);
        this.playAnimationClip(idx);
      };
    }

    const scrubSlider = document.getElementById('anim-scrub-slider');
    if (scrubSlider) {
      scrubSlider.addEventListener('input', (e) => {
        this.onAnimationScrub(parseFloat(e.target.value));
      });
      scrubSlider.addEventListener('change', () => {
        this.onAnimationScrubEnd();
      });
      scrubSlider.addEventListener('pointerup', () => {
        this.onAnimationScrubEnd();
      });
    }
  }

  initAnimationPlayer(model, animations) {
    if (!animations || animations.length === 0) {
      this.hideAnimationPlayer();
      return;
    }

    // Stop and uncache existing mixer
    if (this.animMixer) {
      try {
        this.animMixer.stopAllAction();
        this.animMixer.uncacheRoot(this.animMixer.getRoot());
      } catch (e) {}
      this.animMixer = null;
    }

    this.animMixer = new THREE.AnimationMixer(model);
    this.animClips = animations;
    this.animPlaybackSpeed = 1.0;
    this.isAnimLooping = true;
    this.isAnimScrubbing = false;
    this.animClock = new THREE.Clock();

    const speedBtn = document.getElementById('anim-btn-speed');
    if (speedBtn) speedBtn.textContent = '1.0x';

    const loopBtn = document.getElementById('anim-btn-loop');
    if (loopBtn) loopBtn.classList.add('active');

    const clipSelect = document.getElementById('anim-clip-select');
    if (clipSelect) {
      clipSelect.innerHTML = '';
      animations.forEach((clip, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = clip.name || `Clip ${idx + 1}`;
        clipSelect.appendChild(opt);
      });
      if (animations.length > 1) {
        clipSelect.style.display = 'inline-block';
        clipSelect.value = 0;
      } else {
        clipSelect.style.display = 'none';
      }
    }

    this.showAnimationPlayer();
    this.playAnimationClip(0);
  }

  showAnimationPlayer() {
    const playerBar = document.getElementById('animation-player-bar');
    if (playerBar) playerBar.style.display = 'flex';
  }

  hideAnimationPlayer() {
    if (this.animMixer) {
      try {
        this.animMixer.stopAllAction();
        this.animMixer.uncacheRoot(this.animMixer.getRoot());
      } catch (e) {}
      this.animMixer = null;
    }
    this.currentAnimAction = null;
    this.animClips = [];
    this.isAnimPlaying = false;
    this.isAnimScrubbing = false;
    const playerBar = document.getElementById('animation-player-bar');
    if (playerBar) playerBar.style.display = 'none';
  }

  playAnimationClip(index) {
    if (!this.animMixer || !this.animClips || !this.animClips[index]) return;
    if (this.currentAnimAction) {
      this.currentAnimAction.stop();
    }

    const clip = this.animClips[index];
    this.animDuration = clip.duration || 1.0;
    this.currentAnimAction = this.animMixer.clipAction(clip);
    this.currentAnimAction.setLoop(this.isAnimLooping ? THREE.LoopRepeat : THREE.LoopOnce);
    this.currentAnimAction.clampWhenFinished = true;
    this.currentAnimAction.reset();
    this.currentAnimAction.play();
    this.isAnimPlaying = true;
    if (this.animClock) this.animClock.getDelta();

    const playIcon = document.getElementById('anim-icon-play');
    const pauseIcon = document.getElementById('anim-icon-pause');
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'block';

    const totEl = document.getElementById('anim-time-total');
    if (totEl) totEl.textContent = this.formatAnimTime(this.animDuration);
    this.updateAnimationTimeDisplay(0, this.animDuration);
  }

  toggleAnimationPlay() {
    if (!this.currentAnimAction) return;
    const playIcon = document.getElementById('anim-icon-play');
    const pauseIcon = document.getElementById('anim-icon-pause');

    if (this.isAnimPlaying) {
      this.currentAnimAction.paused = true;
      this.isAnimPlaying = false;
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
    } else {
      if (!this.isAnimLooping && this.currentAnimAction.time >= this.animDuration) {
        this.currentAnimAction.reset();
      }
      this.currentAnimAction.paused = false;
      this.isAnimPlaying = true;
      if (this.animClock) this.animClock.getDelta();
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
    }
  }

  cycleAnimationSpeed() {
    const speeds = [0.5, 1.0, 1.5, 2.0];
    const currIdx = speeds.indexOf(this.animPlaybackSpeed);
    const nextIdx = (currIdx + 1) % speeds.length;
    this.animPlaybackSpeed = speeds[nextIdx];
    const speedBtn = document.getElementById('anim-btn-speed');
    if (speedBtn) speedBtn.textContent = `${this.animPlaybackSpeed.toFixed(1)}x`;
  }

  toggleAnimationLoop() {
    this.isAnimLooping = !this.isAnimLooping;
    const loopBtn = document.getElementById('anim-btn-loop');
    if (loopBtn) {
      if (this.isAnimLooping) loopBtn.classList.add('active');
      else loopBtn.classList.remove('active');
    }
    if (this.currentAnimAction) {
      this.currentAnimAction.setLoop(this.isAnimLooping ? THREE.LoopRepeat : THREE.LoopOnce);
    }
  }

  onAnimationScrub(sliderVal) {
    if (!this.currentAnimAction || !this.animDuration) return;
    this.isAnimScrubbing = true;
    const t = (sliderVal / 100) * this.animDuration;
    this.currentAnimAction.time = t;
    if (this.animMixer) {
      this.animMixer.update(0);
    }
    const slider = document.getElementById('anim-scrub-slider');
    if (slider) slider.value = sliderVal;
    this.updateAnimationTimeDisplay(t, this.animDuration);
  }

  onAnimationScrubEnd() {
    this.isAnimScrubbing = false;
    if (this.isAnimPlaying && this.animClock) {
      this.animClock.getDelta();
    }
  }

  updateAnimationScrubber(time) {
    if (this.isAnimScrubbing || !this.animDuration) return;
    const pct = Math.min(100, Math.max(0, (time / this.animDuration) * 100));
    const slider = document.getElementById('anim-scrub-slider');
    if (slider) slider.value = pct;
    this.updateAnimationTimeDisplay(time, this.animDuration);
  }

  updateAnimationTimeDisplay(currentSec, totalSec) {
    const curEl = document.getElementById('anim-time-current');
    if (curEl) curEl.textContent = this.formatAnimTime(currentSec);
    const totEl = document.getElementById('anim-time-total');
    if (totEl) totEl.textContent = this.formatAnimTime(totalSec);
  }

  formatAnimTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const dec = Math.floor((seconds % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${dec}`;
  }

  
  animate(time) {
    const frameStart = performance.now();
    requestAnimationFrame(this.animate);
    
    // Immediate initialization of performance DOM elements on first frame
    if (!this.cachedPerfEls) {
      this.cachedPerfEls = {
        fps: document.getElementById('stat-fps-val'),
        ram: document.getElementById('stat-ram-val'),
        cpu: document.getElementById('stat-cpu-val'),
        draw: document.getElementById('stat-draw-val')
      };
      if (typeof window !== 'undefined' && window.performance && window.performance.memory && window.performance.memory.usedJSHeapSize) {
        this.ramMb = Math.round(window.performance.memory.usedJSHeapSize / 1048576);
        if (this.cachedPerfEls.ram) this.cachedPerfEls.ram.textContent = `${this.ramMb} MB`;
      }
    }

    // Performance & FPS calculation (1-second sampling window)
    this.frameCount++;
    const intervalElapsed = time - this.lastFrameTime;
    if (intervalElapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / intervalElapsed);
      this.cpuLoad = Math.min(100, Math.max(0, Math.round((this.activeFrameTimeTotal / intervalElapsed) * 100)));
      this.activeFrameTimeTotal = 0;

      // Draw Calls from Three.js renderer info
      this.drawCalls = (this.renderer && this.renderer.info && this.renderer.info.render) ? this.renderer.info.render.calls : 0;

      // RAM: JS Heap Memory in MB (Chromium browsers)
      if (typeof window !== 'undefined' && window.performance && window.performance.memory && window.performance.memory.usedJSHeapSize) {
        this.ramMb = Math.round(window.performance.memory.usedJSHeapSize / 1048576);
      } else {
        this.ramMb = null;
      }

      // Update DOM metrics
      if (!this.cachedPerfEls) {
        this.cachedPerfEls = {
          fps: document.getElementById('stat-fps-val'),
          ram: document.getElementById('stat-ram-val'),
          cpu: document.getElementById('stat-cpu-val'),
          draw: document.getElementById('stat-draw-val')
        };
      }

      if (this.cachedPerfEls.fps) {
        this.cachedPerfEls.fps.textContent = this.fps;
        if (this.fps >= 45) {
          this.cachedPerfEls.fps.style.color = 'var(--success)';
        } else if (this.fps >= 30) {
          this.cachedPerfEls.fps.style.color = 'var(--warning)';
        } else {
          this.cachedPerfEls.fps.style.color = 'var(--danger)';
        }
      }

      if (this.cachedPerfEls.ram) {
        this.cachedPerfEls.ram.textContent = this.ramMb !== null ? `${this.ramMb} MB` : '--';
      }

      if (this.cachedPerfEls.cpu) {
        this.cachedPerfEls.cpu.textContent = `${this.cpuLoad}%`;
        if (this.cpuLoad >= 90) {
          this.cachedPerfEls.cpu.style.color = 'var(--danger)';
        } else if (this.cpuLoad >= 70) {
          this.cachedPerfEls.cpu.style.color = 'var(--warning)';
        } else {
          this.cachedPerfEls.cpu.style.color = 'var(--text-primary)';
        }
      }

      if (this.cachedPerfEls.draw) {
        this.cachedPerfEls.draw.textContent = this.drawCalls;
      }

      this.frameCount = 0;
      this.lastFrameTime = time;
    }
    
    // Timelapse step
    if (this.solarEngine.isTimelapseRunning) {
      this.solarEngine.stepTimelapse();
      this.updateSolarUI();
    }
    if (this.solarEngine && this.solarEngine.setCamera) {
      this.solarEngine.setCamera(this.camera, this.controls ? this.controls.target : null);
    }
    
    // True 3D Compass
    if (this.compass3d) {
      this.compass3d.update();
    }
    
    // Dynamic Orbit Pivot Indicator
    this.updatePivotIndicator();

    // Animation Mixer update (for DAE, FBX & GLTF models with animations)
    if (this.animMixer && this.currentAnimAction) {
      if (this.isAnimPlaying && !this.isAnimScrubbing) {
        const delta = this.animClock ? this.animClock.getDelta() : 0.016;
        this.animMixer.update(delta * this.animPlaybackSpeed);
        const t = this.isAnimLooping ? 
          (this.currentAnimAction.time % (this.animDuration || 1)) : 
          Math.min(this.currentAnimAction.time, this.animDuration);
        this.updateAnimationScrubber(t);

        // Auto pause at end if not looping
        if (!this.isAnimLooping && this.currentAnimAction.time >= this.animDuration) {
          this.isAnimPlaying = false;
          const playIcon = document.getElementById('anim-icon-play');
          const pauseIcon = document.getElementById('anim-icon-pause');
          if (playIcon) playIcon.style.display = 'block';
          if (pauseIcon) pauseIcon.style.display = 'none';
        }
      }
    }

    // Live Camera State Readout (updated when Camera tab is visible, cached DOM elements)
    if (!this.cachedCamEls) {
      this.cachedCamEls = {
        tab: document.getElementById('tab-camera-content'),
        pos: document.getElementById('cam-pos-readout'),
        piv: document.getElementById('cam-pivot-readout'),
        dist: document.getElementById('cam-dist-readout'),
        fps: document.getElementById('stat-fps-val')
      };
    }
    const camTab = this.cachedCamEls.tab;
    if (this.camera && camTab && camTab.classList.contains('active')) {
      const pos = this.camera.position;
      if (this.cachedCamEls.pos) this.cachedCamEls.pos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;

      const piv = this.pivotPoint || (this.controls ? this.controls.target : null);
      if (this.cachedCamEls.piv && piv) this.cachedCamEls.piv.textContent = `${piv.x.toFixed(1)}, ${piv.y.toFixed(1)}, ${piv.z.toFixed(1)}`;

      if (this.cachedCamEls.dist && piv) this.cachedCamEls.dist.textContent = `${pos.distanceTo(piv).toFixed(1)} m`;
    }
    
    // Continuously keep viewport canvas buffer and camera aspect in sync with container without flicker
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (cw > 0 && ch > 0) {
      const pr = this.renderer.getPixelRatio();
      const targetW = Math.floor(cw * pr);
      const targetH = Math.floor(ch * pr);
      const canvas = this.renderer.domElement;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        const aspect = cw / ch;
        if (this.perspectiveCamera) {
          this.perspectiveCamera.aspect = aspect;
          this.perspectiveCamera.updateProjectionMatrix();
        }
        if (this.orthographicCamera) {
          const orthoH = (this.orthographicCamera.top - this.orthographicCamera.bottom);
          const orthoW = orthoH * aspect;
          this.orthographicCamera.left = -orthoW / 2;
          this.orthographicCamera.right = orthoW / 2;
          this.orthographicCamera.updateProjectionMatrix();
        }
        this.renderer.setSize(cw, ch);
      }
    }

    // Render Scene
    this.renderer.render(this.scene, this.camera);

    // Initial draw call readout on first frame
    if (this.cachedPerfEls && this.cachedPerfEls.draw && (this.cachedPerfEls.draw.textContent === '0' || !this.cachedPerfEls.draw.textContent)) {
      const initialCalls = (this.renderer && this.renderer.info && this.renderer.info.render) ? this.renderer.info.render.calls : 0;
      if (initialCalls > 0) this.cachedPerfEls.draw.textContent = initialCalls;
    }

    // Track active execution duration for CPU load calculation
    this.activeFrameTimeTotal += (performance.now() - frameStart);
  }
}

// Global Toast System
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, duration);
}
