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
    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25
    });
    const ringMesh = new THREE.Mesh(ringGeom, this.ringMat);
    this.compassGroup.add(ringMesh);

    // 2. Subtle translucent inner base disc
    const discGeom = new THREE.CylinderGeometry(1.62, 1.62, 0.02, 48);
    this.discMat = new THREE.MeshStandardMaterial({
      color: 0x09101d,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.65
    });
    const discMesh = new THREE.Mesh(discGeom, this.discMat);
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

  setTheme(themeName) {
    if (themeName === 'light') {
      if (this.ringMat) this.ringMat.color.setHex(0x64748b);
      if (this.discMat) {
        this.discMat.color.setHex(0xe2e8f0);
        this.discMat.opacity = 0.78;
      }
    } else {
      if (this.ringMat) this.ringMat.color.setHex(0x334155);
      if (this.discMat) {
        this.discMat.color.setHex(0x09101d);
        this.discMat.opacity = 0.65;
      }
    }
    this.needsRender = true;
    this.update(true);
  }

  update(force = false) {
    if (!this.app || !this.app.camera || !this.app.controls || !this.renderer) return;
    const mainCam = this.app.camera;
    const controls = this.app.controls;

    // View direction vector from target to camera in main scene
    const dx = mainCam.position.x - controls.target.x;
    const dy = mainCam.position.y - controls.target.y;
    const dz = mainCam.position.z - controls.target.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    const ux = mainCam.up.x, uy = mainCam.up.y, uz = mainCam.up.z;

    if (!force && !this.needsRender &&
        this._lastNx !== undefined &&
        Math.abs(nx - this._lastNx) < 1e-4 &&
        Math.abs(ny - this._lastNy) < 1e-4 &&
        Math.abs(nz - this._lastNz) < 1e-4 &&
        Math.abs(ux - this._lastUx) < 1e-4 &&
        Math.abs(uy - this._lastUy) < 1e-4 &&
        Math.abs(uz - this._lastUz) < 1e-4) {
      return;
    }

    this._lastNx = nx; this._lastNy = ny; this._lastNz = nz;
    this._lastUx = ux; this._lastUy = uy; this._lastUz = uz;
    this.needsRender = false;

    // Position compass camera at same orientation vector at fixed distance
    const dist = 4.8;
    this.camera.position.set(nx * dist, ny * dist, nz * dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.up.copy(mainCam.up);

    this.renderer.render(this.scene, this.camera);
  }
}

// High-Performance Virtual Scroller for Left Sidebar BIM Hierarchy Tree
class VirtualBimTree {
  constructor(options) {
    this.app = options.app;
    this.container = options.container;
    this.type = options.type; // 'structures' | 'levels' | 'elements'
    this.groups = options.groups || [];
    this.filterQuery = '';
    this.flattenedRows = [];
    this.rowOffsets = [];
    this.totalHeight = 0;
    this.pool = [];
    this.buffer = 8;
    this.rafId = null;

    this.HEIGHT_FILE = 32;
    this.HEIGHT_GROUP = 32;
    this.HEIGHT_OPACITY = 24;
    this.HEIGHT_LEAF = 26;
    this.SPACING_BRANCH = 4;

    this.onScroll = this.onScroll.bind(this);
    this.onResize = this.onResize.bind(this);

    this.initDOM();
  }

  initDOM() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.classList.add('virtual-tree-container');

    this.phantomEl = document.createElement('div');
    this.phantomEl.className = 'virtual-tree-phantom';

    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'virtual-tree-viewport';

    this.phantomEl.appendChild(this.viewportEl);
    this.container.appendChild(this.phantomEl);

    this.container.addEventListener('scroll', this.onScroll, { passive: true });

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.onResize();
      });
      this.resizeObserver.observe(this.container);
    }

    this.computeVisibleRows();
    this.render();
  }

  setGroups(groups) {
    this.groups = groups || [];
    this.computeVisibleRows();
    this.render();
  }

  setFilter(q) {
    this.filterQuery = q || '';
    this.computeVisibleRows();
    if (this.container) this.container.scrollTop = 0;
    this.render();
  }

  expandAll() {
    this.groups.forEach(g => { g.collapsed = false; });
    this.computeVisibleRows();
    this.render();
  }

  collapseAll() {
    this.groups.forEach(g => { g.collapsed = true; });
    this.computeVisibleRows();
    this.render();
  }

  showAll() {
    this.groups.forEach(g => {
      g.meshes.forEach(m => { m.visible = true; });
    });
    this.render();
  }

  hideAll() {
    this.groups.forEach(g => {
      g.meshes.forEach(m => { m.visible = false; });
    });
    this.render();
  }

  resetOpacity() {
    this.groups.forEach(g => {
      g.opacity = 1.0;
      g.meshes.forEach(m => {
        if (m.material) {
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
    });
    this.render();
  }

  computeVisibleRows() {
    this.flattenedRows = [];
    this.rowOffsets = [];
    let currentY = 0;

    const q = (this.filterQuery || '').trim().toLowerCase();
    const hasFilter = q.length > 0;

    // Check if groups are nested under files
    const hasFiles = this.groups && this.groups.length > 0 && this.groups[0].fileType !== undefined;

    if (hasFiles) {
      this.groups.forEach((fileItem) => {
        let matchingChildGroups = [];
        if (hasFilter) {
          const fileMatches = (fileItem.name || '').toLowerCase().includes(q);
          (fileItem.groups || []).forEach(g => {
            const gName = (g.localizedName || g.name || '').toLowerCase();
            const gMatches = gName.includes(q);
            const mLeaves = (g.leaves || []).filter(l => (l.name || '').toLowerCase().includes(q));
            if (fileMatches || gMatches || mLeaves.length > 0) {
              matchingChildGroups.push({
                group: g,
                leaves: (fileMatches || gMatches) ? (g.leaves || []) : mLeaves
              });
            }
          });
          if (!fileMatches && matchingChildGroups.length === 0) return;
        } else {
          matchingChildGroups = (fileItem.groups || []).map(g => ({ group: g, leaves: g.leaves || [] }));
        }

        const isFileCollapsed = hasFilter ? false : Boolean(fileItem.collapsed);
        this.flattenedRows.push({
          type: 'file',
          file: fileItem,
          isCollapsed: isFileCollapsed,
          height: this.HEIGHT_FILE
        });
        this.rowOffsets.push(currentY);
        currentY += this.HEIGHT_FILE;

        if (!isFileCollapsed) {
          matchingChildGroups.forEach((item) => {
            const g = item.group;
            const leaves = item.leaves;
            const isGroupCollapsed = hasFilter ? false : Boolean(g.collapsed);
            const isOnlyHeader = isGroupCollapsed || leaves.length === 0;

            this.flattenedRows.push({
              type: 'group',
              file: fileItem,
              group: g,
              isCollapsed: isGroupCollapsed,
              isOnlyHeader,
              height: this.HEIGHT_GROUP
            });
            this.rowOffsets.push(currentY);
            currentY += this.HEIGHT_GROUP;

            if (!isGroupCollapsed) {
              if (this.type === 'elements' && !g.isPointCloudNode) {
                this.flattenedRows.push({
                  type: 'opacity',
                  file: fileItem,
                  group: g,
                  isLast: leaves.length === 0,
                  height: this.HEIGHT_OPACITY
                });
                this.rowOffsets.push(currentY);
                currentY += this.HEIGHT_OPACITY;
              }

              for (let i = 0; i < leaves.length; i++) {
                this.flattenedRows.push({
                  type: 'leaf',
                  file: fileItem,
                  group: g,
                  leaf: leaves[i],
                  isLast: i === leaves.length - 1,
                  height: this.HEIGHT_LEAF
                });
                this.rowOffsets.push(currentY);
                currentY += this.HEIGHT_LEAF;
              }
            }
            currentY += this.SPACING_BRANCH;
          });
        }
        currentY += this.SPACING_BRANCH;
      });
    } else {
      // Flat groups fallback
      this.groups.forEach((g) => {
        let visibleLeaves = g.leaves || [];
        if (hasFilter) {
          const gName = (g.localizedName || g.name || '').toLowerCase();
          const gMatches = gName.includes(q);
          if (!gMatches) {
            visibleLeaves = visibleLeaves.filter(l => (l.name || '').toLowerCase().includes(q));
            if (visibleLeaves.length === 0) return;
          }
        }

        const isCollapsed = hasFilter ? false : Boolean(g.collapsed);
        const isOnlyHeader = isCollapsed || visibleLeaves.length === 0;

        this.flattenedRows.push({
          type: 'group',
          group: g,
          isCollapsed,
          isOnlyHeader,
          height: this.HEIGHT_GROUP
        });
        this.rowOffsets.push(currentY);
        currentY += this.HEIGHT_GROUP;

        if (!isCollapsed) {
          if (this.type === 'elements' && !g.isPointCloudNode) {
            this.flattenedRows.push({
              type: 'opacity',
              group: g,
              isLast: visibleLeaves.length === 0,
              height: this.HEIGHT_OPACITY
            });
            this.rowOffsets.push(currentY);
            currentY += this.HEIGHT_OPACITY;
          }

          for (let i = 0; i < visibleLeaves.length; i++) {
            this.flattenedRows.push({
              type: 'leaf',
              group: g,
              leaf: visibleLeaves[i],
              isLast: i === visibleLeaves.length - 1,
              height: this.HEIGHT_LEAF
            });
            this.rowOffsets.push(currentY);
            currentY += this.HEIGHT_LEAF;
          }
        }
        currentY += this.SPACING_BRANCH;
      });
    }

    this.totalHeight = currentY;
    if (this.phantomEl) {
      this.phantomEl.style.height = `${this.totalHeight}px`;
    }
  }

  findRowIndexAt(offset) {
    let low = 0;
    let high = this.rowOffsets.length - 1;
    let ans = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.rowOffsets[mid] <= offset) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  }

  onScroll() {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  onResize() {
    this.render();
  }

  createToggleSwitch() {
    const label = document.createElement('label');
    label.className = 'toggle-switch';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = true;
    const slider = document.createElement('span');
    slider.className = 'slider-switch';
    label.appendChild(chk);
    label.appendChild(slider);
    return { label, chk };
  }

  createSlot() {
    const el = document.createElement('div');
    el.className = 'virtual-tree-slot';

    // 0. File Header Element (Top-level Model or Point Cloud File)
    const fileEl = document.createElement('div');
    fileEl.className = 'tree-file-header virtual-file-header';

    const fileLeft = document.createElement('div');
    fileLeft.className = 'file-left';

    const fileExpander = document.createElement('span');
    fileExpander.className = 'tree-expander';
    fileExpander.innerHTML = '&#9660;';

    const fileIcon = document.createElement('span');
    fileIcon.className = 'file-icon';
    fileIcon.textContent = '📁';

    const fileTitle = document.createElement('span');
    fileTitle.className = 'file-name';

    const fileCount = document.createElement('span');
    fileCount.className = 'file-count';

    fileLeft.appendChild(fileExpander);
    fileLeft.appendChild(fileIcon);
    fileLeft.appendChild(fileTitle);
    fileLeft.appendChild(fileCount);

    const fileToggle = this.createToggleSwitch();

    fileEl.appendChild(fileLeft);
    fileEl.appendChild(fileToggle.label);

    // 1. Group Header Element
    const groupEl = document.createElement('div');
    groupEl.className = 'tree-branch-header virtual-group-header';

    const groupLeft = document.createElement('div');
    groupLeft.className = 'structure-left';

    const expander = document.createElement('span');
    expander.className = 'tree-expander';
    expander.innerHTML = '&#9660;';

    const groupDot = document.createElement('div');
    groupDot.className = 'category-dot';

    const groupTitle = document.createElement('span');
    groupTitle.className = 'structure-name';

    const groupCount = document.createElement('span');
    groupCount.className = 'structure-count';

    groupLeft.appendChild(expander);
    groupLeft.appendChild(groupDot);
    groupLeft.appendChild(groupTitle);
    groupLeft.appendChild(groupCount);

    const groupToggle = this.createToggleSwitch();

    groupEl.appendChild(groupLeft);
    groupEl.appendChild(groupToggle.label);

    // 2. Opacity Slider Element
    const opacityEl = document.createElement('div');
    opacityEl.className = 'opacity-slider-row virtual-opacity-row';

    const opLabel = document.createElement('span');
    opLabel.textContent = (typeof I18N !== 'undefined' ? I18N.t('propOpacity') : 'Opacity') || 'Opacity';

    const opSlider = document.createElement('input');
    opSlider.type = 'range';
    opSlider.min = '0.1';
    opSlider.max = '1.0';
    opSlider.step = '0.05';
    opSlider.value = '1.0';
    opSlider.className = 'range-slider';

    opacityEl.appendChild(opLabel);
    opacityEl.appendChild(opSlider);

    // 3. Leaf Item Element
    const leafEl = document.createElement('div');
    leafEl.className = 'tree-leaf-item virtual-leaf-row';

    const leafLeft = document.createElement('div');
    leafLeft.className = 'tree-leaf-left';

    const leafDot = document.createElement('div');
    leafDot.className = 'category-dot';

    const leafTitle = document.createElement('span');
    leafTitle.className = 'tree-leaf-name';

    leafLeft.appendChild(leafDot);
    leafLeft.appendChild(leafTitle);

    const leafToggle = this.createToggleSwitch();

    leafEl.appendChild(leafLeft);
    leafEl.appendChild(leafToggle.label);

    el.appendChild(fileEl);
    el.appendChild(groupEl);
    el.appendChild(opacityEl);
    el.appendChild(leafEl);

    this.viewportEl.appendChild(el);

    const slot = {
      el,
      fileEl,
      fileLeft,
      fileExpander,
      fileIcon,
      fileTitle,
      fileCount,
      fileToggle,
      groupEl,
      groupLeft,
      expander,
      groupDot,
      groupTitle,
      groupCount,
      groupToggle,
      opacityEl,
      opSlider,
      leafEl,
      leafLeft,
      leafDot,
      leafTitle,
      leafToggle,
      row: null
    };

    // Event Listeners for File Header
    fileEl.addEventListener('click', (e) => {
      if (e.target.closest('.toggle-switch') || e.target.closest('input')) return;
      if (!slot.row || slot.row.type !== 'file') return;
      const f = slot.row.file;
      if (f.fileType === 'pointcloud') {
        if (this.app.pointCloudManager && f.pco) {
          this.app.pointCloudManager.selectPointCloud(f.pco);
        }
        if (this.app.updateOffscreenIndicator) this.app.updateOffscreenIndicator();
        this.render();
      } else {
        f.collapsed = !f.collapsed;
        if (f.model) {
          this.app.activeModel = f.model;
          this.app.selectedModel = f.model;
          if (this.app.modelInfoMap && this.app.modelInfoMap.has(f.model)) {
            this.app.currentModelInfo = this.app.modelInfoMap.get(f.model);
            this.app.updateModelSubtitle(this.app.currentModelInfo);
          }
          if (this.app.pointCloudManager) {
            this.app.pointCloudManager.isPointCloudSelected = false;
          }
          this.app.selectedMesh = null;
          this.app.selectedMeshes = [];
          this.app.clearHighlightOverlay();
          if (this.app.renderModelInfoInspector) this.app.renderModelInfoInspector();
          if (this.app.updateOffscreenIndicator) this.app.updateOffscreenIndicator();
        }
        this.computeVisibleRows();
        this.render();
        if (this.app.syncTreeSelection) this.app.syncTreeSelection();
      }
    });

    fileEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'file') return;
      const f = slot.row.file;
      if (f.fileType === 'pointcloud' && f.pco && this.app.pointCloudManager) {
        this.app.pointCloudManager.selectPointCloud(f.pco);
        this.app.pointCloudManager.fitPointCloudView(f.pco);
      } else if (f.model) {
        this.app.zoomToModel(f.model);
      }
    });

    fileEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'file') return;
      this.app.showFileContextMenu(e.clientX, e.clientY, slot.row.file);
    });

    fileToggle.chk.addEventListener('change', (e) => {
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'file') return;
      const f = slot.row.file;
      const checked = fileToggle.chk.checked;
      f.visible = checked;
      if (f.fileType === 'pointcloud' && f.pco) {
        f.pco.visible = checked;
      } else if (f.model) {
        f.model.visible = checked;
        f.model.traverse(obj => {
          if (this.app.isModelElementMesh(obj)) {
            obj.visible = checked;
          }
        });
      }
      if (this.app.updateStats) this.app.updateStats();
      if (this.app._wakeRender) this.app._wakeRender(200);
      this.render();
    });

    groupEl.addEventListener('click', (e) => {
      if (e.target.closest('.toggle-switch') || e.target.closest('input')) return;
      if (!slot.row || slot.row.type !== 'group') return;
      slot.row.group.collapsed = !slot.row.group.collapsed;
      this.computeVisibleRows();
      this.render();
    });

    groupEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'group') return;
      const g = slot.row.group;
      if (g.isPointCloudNode) return;
      this.app.showGroupContextMenu(e.clientX, e.clientY, g.localizedName || g.name, g.meshes);
    });

    groupToggle.chk.addEventListener('change', (e) => {
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'group') return;
      const g = slot.row.group;
      const checked = groupToggle.chk.checked;
      if (this.type === 'elements') {
        this.app.toggleCategory(g.catName, checked);
      } else {
        g.meshes.forEach(m => m.visible = checked);
      }
      this.render();
    });

    opSlider.addEventListener('input', (e) => {
      if (!slot.row || slot.row.type !== 'opacity') return;
      const val = parseFloat(e.target.value);
      const g = slot.row.group;
      g.opacity = val;
      g.meshes.forEach(m => {
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

    leafLeft.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'leaf') return;
      const mesh = slot.row.leaf.mesh;
      if (!mesh) return;
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const current = (this.app.selectedMeshes && this.app.selectedMeshes.length > 0) ?
        [...this.app.selectedMeshes] :
        (this.app.selectedMesh ? [this.app.selectedMesh] : []);

      if (isCtrl) {
        const idx = current.indexOf(mesh);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(mesh);
        if (current.length === 0) this.app.clearSelection();
        else if (current.length === 1) this.app.selectElement(current[0]);
        else this.app.selectElements(current);
      } else if (isShift) {
        const idx = current.indexOf(mesh);
        if (idx >= 0) {
          current.splice(idx, 1);
          if (current.length === 0) this.app.clearSelection();
          else if (current.length === 1) this.app.selectElement(current[0]);
          else this.app.selectElements(current);
        }
      } else {
        this.app.selectElement(mesh);
      }
    });

    leafEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'leaf') return;
      const mesh = slot.row.leaf.mesh;
      if (!mesh) return;
      const current = this.app.selectedMeshes || (this.app.selectedMesh ? [this.app.selectedMesh] : []);
      if (!current.includes(mesh)) {
        this.app.selectElement(mesh);
      }
      this.app.showContextMenu(e.clientX, e.clientY);
    });

    leafEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'leaf') return;
      if (slot.row.leaf.isInfo) {
        if (this.app.pointCloudManager && slot.row.leaf.pco) {
          this.app.pointCloudManager.fitPointCloudView(slot.row.leaf.pco);
        }
        return;
      }
      if (slot.row.leaf.mesh) {
        this.app.zoomToElement(slot.row.leaf.mesh);
      }
    });

    leafEl.addEventListener('pointerenter', () => {
      if (!slot.row || slot.row.type !== 'leaf') return;
      const mesh = slot.row.leaf.mesh;
      if (!mesh) return;
      const isSelected = (this.app.selectedMesh === mesh) || (this.app.selectedMeshes && this.app.selectedMeshes.includes(mesh));
      if (mesh && mesh.visible && !isSelected) {
        this.app.setHoveredElement(mesh);
      }
    });

    leafEl.addEventListener('pointerleave', () => {
      if (!slot.row || slot.row.type !== 'leaf') return;
      if (this.app.hoveredMesh === slot.row.leaf.mesh) {
        this.app.clearHoverOverlay();
      }
    });

    leafToggle.chk.addEventListener('change', (e) => {
      e.stopPropagation();
      if (!slot.row || slot.row.type !== 'leaf') return;
      const mesh = slot.row.leaf.mesh;
      if (!mesh) return;
      mesh.visible = leafToggle.chk.checked;
      if (this.type === 'elements') {
        const catState = this.app.categoryStates.get(slot.row.group.catName);
        if (catState && catState.chipEl) {
          const anyVis = slot.row.group.meshes.some(m => m.visible);
          catState.chipEl.classList.toggle('cat-hidden', !anyVis);
        }
      }
      if (this.app._wakeRender) this.app._wakeRender(200);
      this.render();
    });

    return slot;
  }

  bindSlot(slot, row, selectedSet) {
    slot.row = row;

    if (row.type === 'file') {
      slot.fileEl.style.display = 'flex';
      slot.groupEl.style.display = 'none';
      slot.opacityEl.style.display = 'none';
      slot.leafEl.style.display = 'none';

      const f = row.file;
      if (f.fileType === 'pointcloud') {
        slot.fileExpander.style.display = 'none';
      } else {
        slot.fileExpander.style.display = '';
        slot.fileExpander.innerHTML = row.isCollapsed ? '&#9654;' : '&#9660;';
        slot.fileExpander.classList.toggle('collapsed', row.isCollapsed);
      }
      slot.fileIcon.textContent = f.icon || (f.fileType === 'pointcloud' ? '☁️' : '📁');
      slot.fileTitle.textContent = f.name;
      slot.fileTitle.title = f.name;
      slot.fileCount.textContent = f.countText || '';
      slot.fileToggle.chk.checked = f.visible !== false;

      const isPcSelected = f.fileType === 'pointcloud' && this.app.pointCloudManager && this.app.pointCloudManager.isPointCloudSelected && (this.app.pointCloudManager.activePointCloud === f.pco);
      const isModelSelected = f.fileType === 'model' && !(this.app.pointCloudManager && this.app.pointCloudManager.isPointCloudSelected) && !this.app.selectedMesh && (!this.app.selectedMeshes || this.app.selectedMeshes.length === 0) && (this.app.activeModel === f.model) && ((this.app.loadedModels && this.app.loadedModels.length > 1) || (this.app.pointCloudManager && this.app.pointCloudManager.pointClouds.length > 0));
      slot.fileEl.classList.toggle('selected', Boolean(f.selected || isPcSelected || isModelSelected));
    } else if (row.type === 'group') {
      slot.fileEl.style.display = 'none';
      slot.groupEl.style.display = 'flex';
      slot.opacityEl.style.display = 'none';
      slot.leafEl.style.display = 'none';

      slot.groupEl.style.paddingLeft = row.file ? '24px' : '10px';

      const g = row.group;
      slot.expander.innerHTML = row.isCollapsed ? '&#9654;' : '&#9660;';
      slot.expander.classList.toggle('collapsed', row.isCollapsed);

      if (g.colorHex) {
        slot.groupDot.style.display = 'block';
        slot.groupDot.style.backgroundColor = g.colorHex;
      } else {
        slot.groupDot.style.display = 'none';
      }

      slot.groupTitle.textContent = g.localizedName || g.name;
      slot.groupTitle.title = g.name;

      if (g.isPointCloudNode) {
        slot.groupCount.textContent = '';
      } else if (this.type === 'structures') {
        slot.groupCount.textContent = `${g.meshes.length} items`;
      } else {
        slot.groupCount.textContent = `${g.meshes.length}`;
      }

      const anyVisible = g.meshes.some(m => m.visible);
      slot.groupToggle.chk.checked = anyVisible;

      slot.groupEl.classList.toggle('is-only-header', row.isOnlyHeader);
    } else if (row.type === 'opacity') {
      slot.fileEl.style.display = 'none';
      slot.groupEl.style.display = 'none';
      slot.opacityEl.style.display = 'flex';
      slot.leafEl.style.display = 'none';

      slot.opSlider.value = String(row.group.opacity !== undefined ? row.group.opacity : 1.0);
      slot.opacityEl.classList.toggle('is-last-row', row.isLast);
    } else if (row.type === 'leaf') {
      slot.fileEl.style.display = 'none';
      slot.groupEl.style.display = 'none';
      slot.opacityEl.style.display = 'none';
      slot.leafEl.style.display = 'flex';

      const leaf = row.leaf;
      slot.leafEl._mesh = leaf.mesh;
      slot.leafDot.style.backgroundColor = leaf.colorHex || '#38bdf8';
      slot.leafTitle.textContent = leaf.name;
      slot.leafTitle.title = leaf.name;
      slot.leafToggle.chk.checked = leaf.mesh ? leaf.mesh.visible : true;

      const isSel = leaf.mesh ? selectedSet.has(leaf.mesh) : false;
      slot.leafEl.classList.toggle('selected', isSel);
      slot.leafEl.classList.toggle('is-last-row', row.isLast);
    }
  }
  render() {
    if (!this.container) return;

    if (this.flattenedRows.length === 0) {
      this.pool.forEach(slot => { slot.el.style.display = 'none'; });
      if (this.phantomEl) this.phantomEl.style.height = '0px';
      return;
    }

    const scrollTop = this.container.scrollTop;
    const clientHeight = this.container.clientHeight || 600;

    const startIdx = Math.max(0, this.findRowIndexAt(scrollTop) - this.buffer);
    const endIdx = Math.min(this.flattenedRows.length - 1, this.findRowIndexAt(scrollTop + clientHeight) + this.buffer);

    const neededSlots = Math.max(0, endIdx - startIdx + 1);

    while (this.pool.length < neededSlots) {
      this.pool.push(this.createSlot());
    }

    const selectedSet = new Set(this.app.selectedMeshes || (this.app.selectedMesh ? [this.app.selectedMesh] : []));

    let slotIdx = 0;
    for (let rIdx = startIdx; rIdx <= endIdx; rIdx++) {
      const row = this.flattenedRows[rIdx];
      const slot = this.pool[slotIdx++];
      const y = this.rowOffsets[rIdx];

      slot.el.style.display = 'block';
      slot.el.style.transform = `translate3d(0, ${y}px, 0)`;
      slot.el.style.height = `${row.height}px`;

      this.bindSlot(slot, row, selectedSet);
    }

    while (slotIdx < this.pool.length) {
      this.pool[slotIdx++].el.style.display = 'none';
    }
  }

  syncSelection() {
    const selectedSet = new Set(this.app.selectedMeshes || (this.app.selectedMesh ? [this.app.selectedMesh] : []));
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      if (slot.el.style.display !== 'none' && slot.row) {
        if (slot.row.type === 'leaf') {
          const isSel = selectedSet.has(slot.row.leaf.mesh);
          slot.leafEl.classList.toggle('selected', isSel);
        } else if (slot.row.type === 'file') {
          const f = slot.row.file;
          const isPcSelected = f.fileType === 'pointcloud' && this.app.pointCloudManager && this.app.pointCloudManager.isPointCloudSelected && (this.app.pointCloudManager.activePointCloud === f.pco);
          const isModelSelected = f.fileType === 'model' && !(this.app.pointCloudManager && this.app.pointCloudManager.isPointCloudSelected) && !this.app.selectedMesh && (!this.app.selectedMeshes || this.app.selectedMeshes.length === 0) && (this.app.activeModel === f.model) && ((this.app.loadedModels && this.app.loadedModels.length > 1) || (this.app.pointCloudManager && this.app.pointCloudManager.pointClouds.length > 0));
          slot.fileEl.classList.toggle('selected', Boolean(f.selected || isPcSelected || isModelSelected));
        }
      }
    }
  }
}

// =========================================================================
// 3D GEOMETRIC OBJECT SNAPPING ENGINE (ENDPOINT, MIDPOINT, CIRCLE/ARC CENTER)
// =========================================================================
class BimSnapEngine {
  constructor(app) {
    this.app = app;
    this.enabled = true;
    this.snapEndpoint = true;
    this.snapMidpoint = true;
    this.snapCenter = true;
    this.snapEdge = false;
    this.flyoutOpen = false;
    this.altBypassed = false;
    this.pixelTolerance = 20;

    this.currentSnap = null;
    this.cachedFeatures = new WeakMap();

    this.initIndicators();
    this.initUI();
    this.initKeyboard();
  }

  initIndicators() {
    this.indicatorGroup = new THREE.Group();
    this.indicatorGroup.name = 'SnapIndicatorGroup';
    this.indicatorGroup.visible = false;
    this.indicatorGroup.renderOrder = 2500;
    this.app.scene.add(this.indicatorGroup);

    // 1. Endpoint Glyph: Square (□) in Vivid CAD Magenta (0xff00ff)
    this.endpointObj = new THREE.Group();
    const sqVerts = new Float32Array([
      -0.5, -0.5, 0,   0.5, -0.5, 0,
       0.5, -0.5, 0,   0.5,  0.5, 0,
       0.5,  0.5, 0,  -0.5,  0.5, 0,
      -0.5,  0.5, 0,  -0.5, -0.5, 0
    ]);
    const sqGeom = new THREE.BufferGeometry();
    sqGeom.setAttribute('position', new THREE.BufferAttribute(sqVerts, 3));
    const sqLineMat = new THREE.LineBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false
    });
    this.endpointObj.add(new THREE.LineSegments(sqGeom, sqLineMat));

    const sqFillGeom = new THREE.PlaneGeometry(0.96, 0.96);
    const sqFillMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.endpointObj.add(new THREE.Mesh(sqFillGeom, sqFillMat));
    this.indicatorGroup.add(this.endpointObj);

    // 2. Midpoint Glyph: Equilateral Triangle (△) in Vivid CAD Magenta (0xff00ff)
    this.midpointObj = new THREE.Group();
    const triVerts = new Float32Array([
       0.0,   0.62, 0,   -0.56, -0.38, 0,
      -0.56, -0.38, 0,    0.56, -0.38, 0,
       0.56, -0.38, 0,    0.0,   0.62, 0
    ]);
    const triGeom = new THREE.BufferGeometry();
    triGeom.setAttribute('position', new THREE.BufferAttribute(triVerts, 3));
    const triLineMat = new THREE.LineBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false
    });
    this.midpointObj.add(new THREE.LineSegments(triGeom, triLineMat));

    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0.60);
    triShape.lineTo(-0.54, -0.36);
    triShape.lineTo(0.54, -0.36);
    triShape.closePath();
    const triShapeGeom = new THREE.ShapeGeometry(triShape);
    const triFillMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.midpointObj.add(new THREE.Mesh(triShapeGeom, triFillMat));
    this.indicatorGroup.add(this.midpointObj);

    // 3. Circle/Arc Center Glyph: Crosshair Circle (⨁) in Vivid CAD Magenta (0xff00ff)
    this.centerObj = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(0.46, 0.58, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.centerObj.add(new THREE.Mesh(ringGeom, ringMat));

    const crossVerts = new Float32Array([
      -0.78, 0, 0,  0.78, 0, 0,
       0, -0.78, 0,  0, 0.78, 0
    ]);
    const crossGeom = new THREE.BufferGeometry();
    crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
    const crossMat = new THREE.LineBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false
    });
    this.centerObj.add(new THREE.LineSegments(crossGeom, crossMat));
    this.indicatorGroup.add(this.centerObj);

    // 4. On Edge Glyph: AutoCAD Nearest Hourglass (⧗) in Vivid CAD Magenta (0xff00ff)
    this.edgeObj = new THREE.Group();
    const hgVerts = new Float32Array([
      -0.55,  0.55, 0,    0.55,  0.55, 0,
       0.55,  0.55, 0,   -0.55, -0.55, 0,
      -0.55, -0.55, 0,    0.55, -0.55, 0,
       0.55, -0.55, 0,   -0.55,  0.55, 0
    ]);
    const hgGeom = new THREE.BufferGeometry();
    hgGeom.setAttribute('position', new THREE.BufferAttribute(hgVerts, 3));
    const hgLineMat = new THREE.LineBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false
    });
    this.edgeObj.add(new THREE.LineSegments(hgGeom, hgLineMat));

    const hgFillVerts = new Float32Array([
      -0.55,  0.55, 0,    0.55,  0.55, 0,   0, 0, 0,
      -0.55, -0.55, 0,    0, 0, 0,          0.55, -0.55, 0
    ]);
    const hgFillGeom = new THREE.BufferGeometry();
    hgFillGeom.setAttribute('position', new THREE.BufferAttribute(hgFillVerts, 3));
    const hgFillMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.edgeObj.add(new THREE.Mesh(hgFillGeom, hgFillMat));
    this.indicatorGroup.add(this.edgeObj);

    // 5. Point Cloud Glyph: Target Reticle (⌖) in Cyan (0x00f0ff)
    this.pointcloudObj = new THREE.Group();
    const pcCircleGeom = new THREE.RingGeometry(0.38, 0.48, 24);
    const pcMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.pointcloudObj.add(new THREE.Mesh(pcCircleGeom, pcMat));
    const pcCrossVerts = new Float32Array([
      -0.65, 0, 0,  -0.2, 0, 0,
       0.2,  0, 0,   0.65, 0, 0,
       0, -0.65, 0,  0, -0.2, 0,
       0,  0.2,  0,  0,  0.65, 0
    ]);
    const pcCrossGeom = new THREE.BufferGeometry();
    pcCrossGeom.setAttribute('position', new THREE.BufferAttribute(pcCrossVerts, 3));
    const pcLineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });
    this.pointcloudObj.add(new THREE.LineSegments(pcCrossGeom, pcLineMat));
    this.indicatorGroup.add(this.pointcloudObj);

    // 5. Source Arc/Circle Boundary Highlight Loop
    this.arcHighlightGeom = new THREE.BufferGeometry();
    this.arcHighlightMat = new THREE.LineBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.90,
      depthTest: false,
      depthWrite: false
    });
    this.arcHighlightLine = new THREE.Line(this.arcHighlightGeom, this.arcHighlightMat);
    this.arcHighlightLine.renderOrder = 2490;
    this.arcHighlightLine.visible = false;
    this.app.scene.add(this.arcHighlightLine);

    this.indicatorGroup.traverse((child) => {
      child.renderOrder = 2500;
    });
  }

  initUI() {
    this.magnetBtn = document.getElementById('btn-tool-snap');
    this.flyoutEl = document.getElementById('snap-flyout');
    this.btnEdge = document.getElementById('btn-snap-edge');
    this.btnCenter = document.getElementById('btn-snap-center');
    this.btnMid = document.getElementById('btn-snap-mid');
    this.btnEnd = document.getElementById('btn-snap-end');
    this.hudTooltip = document.getElementById('snap-hud-tooltip');
    this.hudIcon = document.getElementById('snap-hud-icon');
    this.hudText = document.getElementById('snap-hud-text');

    if (this.magnetBtn) {
      this.magnetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFlyout();
      });
    }

    if (this.btnEdge) {
      this.btnEdge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapEdge = !this.snapEdge;
        this.btnEdge.classList.toggle('active', this.snapEdge);
        this.syncMagnetActiveState();
      });
    }

    if (this.btnCenter) {
      this.btnCenter.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapCenter = !this.snapCenter;
        this.btnCenter.classList.toggle('active', this.snapCenter);
        this.syncMagnetActiveState();
      });
    }

    if (this.btnMid) {
      this.btnMid.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapMidpoint = !this.snapMidpoint;
        this.btnMid.classList.toggle('active', this.snapMidpoint);
        this.syncMagnetActiveState();
      });
    }

    if (this.btnEnd) {
      this.btnEnd.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapEndpoint = !this.snapEndpoint;
        this.btnEnd.classList.toggle('active', this.snapEndpoint);
        this.syncMagnetActiveState();
      });
    }

    this.syncMagnetActiveState();
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') {
        this.altBypassed = true;
        this.hideIndicator();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        this.altBypassed = false;
      }
    });
  }

  toggleFlyout() {
    this.setFlyoutOpen(!this.flyoutOpen);
  }

  setFlyoutOpen(open) {
    this.flyoutOpen = Boolean(open);
    if (this.flyoutEl) {
      this.flyoutEl.classList.toggle('open', this.flyoutOpen);
    }
    if (this.magnetBtn) {
      this.magnetBtn.classList.toggle('active', this.flyoutOpen);
      const titleKey = this.flyoutOpen ? 'snapToolbarCollapse' : 'snapToolbarExpand';
      this.magnetBtn.title = I18N.t(titleKey) || I18N.t('snapTitle');
    }
  }

  syncMagnetActiveState() {
    const anyActive = this.snapEndpoint || this.snapMidpoint || this.snapCenter || this.snapEdge;
    this.enabled = anyActive;
  }

  clear() {
    this.cachedFeatures = new WeakMap();
    this.hideIndicator();
  }

  hideIndicator() {
    this.currentSnap = null;
    if (this.indicatorGroup) this.indicatorGroup.visible = false;
    if (this.arcHighlightLine) this.arcHighlightLine.visible = false;
    if (this.hudTooltip) this.hudTooltip.style.display = 'none';
  }

  detectArcLoops(featureEdges, edgeAdjacency, vertexMap) {
    if (!featureEdges || featureEdges.length < 3) return [];

    const visitedEdges = new Set();
    const arcLoops = [];

    // Helper: circumcircle for 3 coplanar 3D points
    const fitCircle3P = (p0, p1, p2) => {
      const d1 = new THREE.Vector3().subVectors(p1, p0);
      const d2 = new THREE.Vector3().subVectors(p2, p0);
      const n = new THREE.Vector3().crossVectors(d1, d2);
      const nLenSq = n.lengthSq();
      if (nLenSq < 1e-9) return null; // collinear

      const len1Sq = d1.lengthSq();
      const len2Sq = d2.lengthSq();
      const crossVec = new THREE.Vector3()
        .addScaledVector(d2, len1Sq)
        .addScaledVector(d1, -len2Sq)
        .cross(n)
        .multiplyScalar(0.5 / nLenSq);

      const center = p0.clone().add(crossVec);
      const radius = center.distanceTo(p0);
      return { center, radius, normal: n.normalize() };
    };

    // Find connected paths / loops in feature edges
    for (const edge of featureEdges) {
      if (visitedEdges.has(edge)) continue;

      const chainKeys = [edge.keyA, edge.keyB];
      const chainEdges = [edge];
      visitedEdges.add(edge);

      let currKey = edge.keyB;
      let prevKey = edge.keyA;
      let isClosed = false;

      while (true) {
        const neighbors = edgeAdjacency.get(currKey) || [];
        const nextCandidate = neighbors.find(nb => nb.neighborKey !== prevKey && !visitedEdges.has(nb.edge));
        if (nextCandidate) {
          visitedEdges.add(nextCandidate.edge);
          chainEdges.push(nextCandidate.edge);
          prevKey = currKey;
          currKey = nextCandidate.neighborKey;
          chainKeys.push(currKey);
          if (currKey === chainKeys[0]) {
            isClosed = true;
            break;
          }
        } else if (neighbors.some(nb => nb.neighborKey === chainKeys[0] && chainKeys.length >= 4)) {
          isClosed = true;
          break;
        } else {
          break;
        }
      }

      if (!isClosed) {
        currKey = chainKeys[0];
        prevKey = chainKeys[1];
        while (true) {
          const neighbors = edgeAdjacency.get(currKey) || [];
          const nextCandidate = neighbors.find(nb => nb.neighborKey !== prevKey && !visitedEdges.has(nb.edge));
          if (nextCandidate) {
            visitedEdges.add(nextCandidate.edge);
            chainEdges.unshift(nextCandidate.edge);
            prevKey = currKey;
            currKey = nextCandidate.neighborKey;
            chainKeys.unshift(currKey);
            if (currKey === chainKeys[chainKeys.length - 1]) {
              isClosed = true;
              break;
            }
          } else {
            break;
          }
        }
      }

      if (chainKeys.length < 4) continue;

      const chainPoints = chainKeys.map(k => {
        const v = vertexMap.get(k);
        return v ? (v.point || v) : null;
      }).filter(Boolean);
      if (chainPoints.length < 4) continue;

      const pts = isClosed ? chainPoints.slice(0, -1) : chainPoints;
      if (pts.length < (isClosed ? 6 : 4)) continue;

      // Verify this is a smooth curved arc/circle approximation, not a polygon with sharp corners (e.g. square box)
      let isSmoothCurve = true;
      const maxTurnAngleCos = Math.cos((45 * Math.PI) / 180);
      const testCount = isClosed ? pts.length : pts.length - 2;
      for (let i = 0; i < testCount; i++) {
        const pA = pts[i];
        const pB = pts[(i + 1) % pts.length];
        const pC = pts[(i + 2) % pts.length];
        const d1 = new THREE.Vector3().subVectors(pB, pA).normalize();
        const d2 = new THREE.Vector3().subVectors(pC, pB).normalize();
        if (d1.dot(d2) < maxTurnAngleCos) {
          isSmoothCurve = false;
          break;
        }
      }
      if (!isSmoothCurve) continue;

      const N = pts.length;
      let p0, p1, p2;
      if (isClosed) {
        p0 = pts[0];
        p1 = pts[Math.floor(N / 3)];
        p2 = pts[Math.floor((2 * N) / 3)];
      } else {
        p0 = pts[0];
        p1 = pts[Math.floor(N / 2)];
        p2 = pts[N - 1];
      }
      const circleFit = fitCircle3P(p0, p1, p2);
      if (!circleFit || circleFit.radius < 0.005 || circleFit.radius > 5000) continue;

      let isGoodArc = true;
      for (const pt of pts) {
        const distToCenter = pt.distanceTo(circleFit.center);
        if (Math.abs(distToCenter - circleFit.radius) > Math.max(0.01, circleFit.radius * 0.05)) {
          isGoodArc = false;
          break;
        }
      }

      if (isGoodArc) {
        const vStart = new THREE.Vector3().subVectors(pts[0], circleFit.center).normalize();
        const vEnd = new THREE.Vector3().subVectors(pts[pts.length - 1], circleFit.center).normalize();
        const angleSpan = isClosed ? (Math.PI * 2) : vStart.angleTo(vEnd);

        if (isClosed || angleSpan >= (30 * Math.PI / 180)) {
          arcLoops.push({
            center: circleFit.center,
            radius: circleFit.radius,
            normal: circleFit.normal,
            isClosed,
            points: pts
          });
        }
      }
    }

    return arcLoops;
  }

  extractMeshFeatures(mesh) {
    if (!mesh || !mesh.geometry) return null;
    if (this.cachedFeatures.has(mesh)) {
      return this.cachedFeatures.get(mesh);
    }

    const geom = mesh.geometry;
    const pos = geom.attributes.position;
    if (!pos || pos.count < 3) return null;

    const index = geom.index;
    const vertexCount = index ? index.count : pos.count;
    const getIdx = (t) => (index ? index.getX(t) : t);

    const precision = 1e4;
    const edgeMap = new Map();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();

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
      if (len < 1e-8) continue;
      normal.multiplyScalar(1 / len);

      const k0 = `${Math.round(va.x * precision)},${Math.round(va.y * precision)},${Math.round(va.z * precision)}`;
      const k1 = `${Math.round(vb.x * precision)},${Math.round(vb.y * precision)},${Math.round(vb.z * precision)}`;
      const k2 = `${Math.round(vc.x * precision)},${Math.round(vc.y * precision)},${Math.round(vc.z * precision)}`;
      if (k0 === k1 || k1 === k2 || k2 === k0) continue;

      const normCopy = normal.clone();
      const triVerts = [va.clone(), vb.clone(), vc.clone()];
      const triKeys = [k0, k1, k2];

      for (let e = 0; e < 3; e++) {
        const next = (e + 1) % 3;
        const keyA = triKeys[e];
        const keyB = triKeys[next];
        const edgeKey = keyA < keyB ? `${keyA}_${keyB}` : `${keyB}_${keyA}`;

        let entry = edgeMap.get(edgeKey);
        if (!entry) {
          entry = {
            p0: triVerts[e],
            p1: triVerts[next],
            keyA,
            keyB,
            normals: []
          };
          edgeMap.set(edgeKey, entry);
        }
        entry.normals.push(normCopy);
      }
    }

    const cosThreshold = Math.cos((25 * Math.PI) / 180);
    const featureEdges = [];
    const vertexMap = new Map();
    const edgeAdjacency = new Map();

    for (const entry of edgeMap.values()) {
      const norms = entry.normals;
      let isFeature = false;
      if (norms.length === 1) {
        isFeature = true;
      } else {
        for (let i = 0; i < norms.length; i++) {
          for (let j = i + 1; j < norms.length; j++) {
            if (norms[i].dot(norms[j]) <= cosThreshold) {
              isFeature = true;
              break;
            }
          }
          if (isFeature) break;
        }
      }

      if (isFeature) {
        const mid = new THREE.Vector3().addVectors(entry.p0, entry.p1).multiplyScalar(0.5);
        const featEdge = {
          p0: entry.p0,
          p1: entry.p1,
          mid,
          keyA: entry.keyA,
          keyB: entry.keyB,
          normals: entry.normals,
          normal: norms[0]
        };
        featureEdges.push(featEdge);

        if (!vertexMap.has(entry.keyA)) vertexMap.set(entry.keyA, { point: entry.p0, normals: [] });
        if (!vertexMap.has(entry.keyB)) vertexMap.set(entry.keyB, { point: entry.p1, normals: [] });

        for (let n = 0; n < entry.normals.length; n++) {
          vertexMap.get(entry.keyA).normals.push(entry.normals[n]);
          vertexMap.get(entry.keyB).normals.push(entry.normals[n]);
        }

        if (!edgeAdjacency.has(entry.keyA)) edgeAdjacency.set(entry.keyA, []);
        if (!edgeAdjacency.has(entry.keyB)) edgeAdjacency.set(entry.keyB, []);
        edgeAdjacency.get(entry.keyA).push({ edge: featEdge, neighborKey: entry.keyB });
        edgeAdjacency.get(entry.keyB).push({ edge: featEdge, neighborKey: entry.keyA });
      }
    }

    const vertices = Array.from(vertexMap.values());
    const arcLoops = this.detectArcLoops(featureEdges, edgeAdjacency, vertexMap);

    const features = {
      featureEdges,
      vertices,
      arcLoops
    };

    this.cachedFeatures.set(mesh, features);
    return features;
  }

  isPointOccluded(point, camera) {
    if (!this.app || !point) return false;

    const clippingPlanes = (this.app.clippingEngine && this.app.clippingEngine.enabled) ? 
      (this.app.clippingEngine.clippingPlanes || []) : [];

    if (clippingPlanes.length > 0) {
      for (let p = 0; p < clippingPlanes.length; p++) {
        if (clippingPlanes[p].distanceToPoint(point) < 0) return true;
      }
    }

    let origin, dir, maxDist;
    if (camera.isOrthographicCamera) {
      dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      origin = point.clone().addScaledVector(dir, -500);
      maxDist = 500 - 0.02;
    } else {
      dir = new THREE.Vector3().subVectors(point, camera.position);
      const totalDist = dir.length();
      const margin = Math.min(0.04, Math.max(0.005, totalDist * 0.005));
      maxDist = totalDist - margin;
      if (maxDist <= 0.01) return false;
      dir.normalize();
      origin = camera.position;
    }

    if (!this._occludeRaycaster) {
      this._occludeRaycaster = new THREE.Raycaster();
    }
    this._occludeRaycaster.set(origin, dir);
    this._occludeRaycaster.near = 0.05;
    this._occludeRaycaster.far = maxDist;

    const searchRoots = (this.app.loadedModels && this.app.loadedModels.length > 0) ? this.app.loadedModels : ((this.app.loadedModels && this.app.loadedModels.length > 0) ? this.app.loadedModels : (this.app.activeModel ? [this.app.activeModel] : this.app.scene.children));
    const hits = this._occludeRaycaster.intersectObjects(searchRoots, true);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (this.app.isPickableElement(h.object) && h.distance < maxDist) {
        if (clippingPlanes.length > 0) {
          let clipped = false;
          for (let p = 0; p < clippingPlanes.length; p++) {
            if (clippingPlanes[p].distanceToPoint(h.point) < 0) {
              clipped = true;
              break;
            }
          }
          if (clipped) continue;
        }
        return true;
      }
    }
    return false;
  }

  resolvePointCloudSnapCandidate(localX, localY, cw, ch, camera) {
    if (!this.app.pointCloudManager || !this.app.pointCloudManager.pointClouds.length) return null;
    const tol = this.pixelTolerance || 20;
    const raycaster = this.app.raycaster;
    if (!raycaster) return null;

    const hit = this.app.pointCloudManager.raycast(raycaster, tol);
    if (!hit || !hit.point) return null;

    // Check occlusion with clipping planes
    const clippingPlanes = (this.app.clippingEngine && this.app.clippingEngine.enabled) ? 
      (this.app.clippingEngine.clippingPlanes || []) : [];
    for (let p = 0; p < clippingPlanes.length; p++) {
      if (clippingPlanes[p].distanceToPoint(hit.point) < 0) return null;
    }

    const proj = hit.point.clone().project(camera);
    if (proj.z > 1.0 || proj.z < -1.0) return null;

    const sx = (proj.x * 0.5 + 0.5) * cw;
    const sy = (-proj.y * 0.5 + 0.5) * ch;
    const dSq = (localX - sx) * (localX - sx) + (localY - sy) * (localY - sy);

    if (dSq <= tol * tol) {
      return {
        distSq: dSq,
        candidate: {
          type: 'pointcloud',
          point: hit.point.clone(),
          normal: new THREE.Vector3(0, 0, 1),
          targetMesh: hit.pointCloud,
          pointCloud: hit.pointCloud,
          screenX: sx,
          screenY: sy,
          hudLabel: (window.I18N ? window.I18N.t('pointCloudSnapFeature') : 'Point Cloud Vertex') || 'Point Cloud',
          hudIcon: '⌖'
        }
      };
    }
    return null;
  }

  resolveSnap(clientX, clientY, camera, hit = null) {
    if (!this.enabled || this.altBypassed) {
      this.hideIndicator();
      return null;
    }

    const container = this.app.container;
    const canvas = this.app.canvas || container;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const cw = rect.width || container.clientWidth || window.innerWidth;
    const ch = rect.height || container.clientHeight || window.innerHeight;

    // Generous boundary margin to allow snapping when cursor is just outside silhouette
    if (localX < -40 || localX > cw + 40 || localY < -40 || localY > ch + 40) {
      this.hideIndicator();
      return null;
    }

    // Point Cloud Snapping Candidate Check
    let pcCandidate = null;
    if (this.app.pointCloudManager && this.app.pointCloudManager.pointClouds.length > 0) {
      pcCandidate = this.resolvePointCloudSnapCandidate(localX, localY, cw, ch, camera);
    }

    let mesh = (hit && hit.object) ? hit.object : this.lastHoveredMesh;
    if (!mesh || !this.app.isPickableElement(mesh)) {
      if (pcCandidate) {
        this.lastHoveredMesh = pcCandidate.candidate.targetMesh;
        this.currentSnap = pcCandidate.candidate;
        this.showIndicator(pcCandidate.candidate, camera, container);
        return pcCandidate.candidate;
      }
      this.hideIndicator();
      return null;
    }

    const features = this.extractMeshFeatures(mesh);
    if (!features) {
      this.hideIndicator();
      return null;
    }

    mesh.updateWorldMatrix(true, false);
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();

    const matrixWorld = mesh.matrixWorld;
    const projVec = new THREE.Vector3();
    const tempP = new THREE.Vector3();
    const tempN = new THREE.Vector3();
    const vCam = new THREE.Vector3();

    const isOrtho = Boolean(camera.isOrthographicCamera);
    const camDir = isOrtho ? new THREE.Vector3() : null;
    if (isOrtho) camera.getWorldDirection(camDir);

    const tol = this.pixelTolerance || 20;
    let bestCandidate = null;
    let bestDistSq = tol * tol;

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);
    const hitNormal = (hit && hit.face && hit.face.normal) ?
      hit.face.normal.clone().applyMatrix3(normalMatrix).normalize() :
      new THREE.Vector3(0, 1, 0);

    // 1. Test Endpoints (Vertices)
    if (this.snapEndpoint && features.vertices.length > 0) {
      for (let i = 0; i < features.vertices.length; i++) {
        const vObj = features.vertices[i];
        const pLocal = vObj.point || vObj;
        const vNorms = vObj.normals || [];

        tempP.copy(pLocal).applyMatrix4(matrixWorld);

        // Back-face culling for vertex: must have at least one adjacent face facing toward the camera
        if (vNorms.length > 0) {
          if (isOrtho) {
            vCam.copy(camDir).negate();
          } else {
            vCam.subVectors(camera.position, tempP);
          }
          let isFront = false;
          for (let n = 0; n < vNorms.length; n++) {
            tempN.copy(vNorms[n]).applyMatrix3(normalMatrix);
            if (tempN.dot(vCam) > 0) {
              isFront = true;
              break;
            }
          }
          if (!isFront) continue; // Skip back vertex
        }

        projVec.copy(tempP).project(camera);
        if (projVec.z > 1.0 || projVec.z < -1.0) continue;

        const sx = (projVec.x * 0.5 + 0.5) * cw;
        const sy = (-projVec.y * 0.5 + 0.5) * ch;
        const dSq = (sx - localX) * (sx - localX) + (sy - localY) * (sy - localY);

        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestCandidate = {
            type: 'endpoint',
            point: tempP.clone(),
            normal: hitNormal,
            targetMesh: mesh,
            screenX: sx,
            screenY: sy,
            hudLabel: I18N.t('snapHudEnd') || 'Endpoint',
            hudIcon: '□'
          };
        }
      }
    }

    // 2. Test Edge Midpoints
    if (this.snapMidpoint && features.featureEdges.length > 0) {
      for (let i = 0; i < features.featureEdges.length; i++) {
        const edge = features.featureEdges[i];
        tempP.copy(edge.mid).applyMatrix4(matrixWorld);

        // Back-face culling for edge midpoint: at least one adjacent face must face toward camera
        if (edge.normals && edge.normals.length > 0) {
          if (isOrtho) {
            vCam.copy(camDir).negate();
          } else {
            vCam.subVectors(camera.position, tempP);
          }
          let isFront = false;
          for (let n = 0; n < edge.normals.length; n++) {
            tempN.copy(edge.normals[n]).applyMatrix3(normalMatrix);
            if (tempN.dot(vCam) > 0) {
              isFront = true;
              break;
            }
          }
          if (!isFront) continue; // Skip back edge
        }

        projVec.copy(tempP).project(camera);
        if (projVec.z > 1.0 || projVec.z < -1.0) continue;

        const sx = (projVec.x * 0.5 + 0.5) * cw;
        const sy = (-projVec.y * 0.5 + 0.5) * ch;
        const dSq = (sx - localX) * (sx - localX) + (sy - localY) * (sy - localY);

        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestCandidate = {
            type: 'midpoint',
            point: tempP.clone(),
            normal: hitNormal,
            targetMesh: mesh,
            screenX: sx,
            screenY: sy,
            hudLabel: I18N.t('snapHudMid') || 'Midpoint',
            hudIcon: '△'
          };
        }
      }
    }

    // 3. Test Circle / Arc Centers
    if (this.snapCenter && features.arcLoops.length > 0) {
      for (let i = 0; i < features.arcLoops.length; i++) {
        const arc = features.arcLoops[i];
        tempP.copy(arc.center).applyMatrix4(matrixWorld);

        // Back-face culling for closed circular caps (e.g. cylinder back end)
        if (arc.isClosed) {
          if (isOrtho) {
            vCam.copy(camDir).negate();
          } else {
            vCam.subVectors(camera.position, tempP);
          }
          tempN.copy(arc.normal).applyMatrix3(normalMatrix);
          if (tempN.dot(vCam) <= 0) continue; // Skip back cap
        }

        const arcWorldPoints = arc.points.map(pt => pt.clone().applyMatrix4(matrixWorld));

        let nearArcPerimeter = false;
        for (let j = 0; j < arcWorldPoints.length - 1; j++) {
          const ptA = arcWorldPoints[j];
          const ptB = arcWorldPoints[j + 1];
          projVec.copy(ptA).project(camera);
          const ax = (projVec.x * 0.5 + 0.5) * cw;
          const ay = (-projVec.y * 0.5 + 0.5) * ch;
          projVec.copy(ptB).project(camera);
          const bx = (projVec.x * 0.5 + 0.5) * cw;
          const by = (-projVec.y * 0.5 + 0.5) * ch;

          const segDx = bx - ax, segDy = by - ay;
          const segLenSq = segDx * segDx + segDy * segDy;
          let t = segLenSq > 0 ? ((localX - ax) * segDx + (localY - ay) * segDy) / segLenSq : 0;
          t = Math.max(0, Math.min(1, t));
          const closeX = ax + t * segDx, closeY = ay + t * segDy;
          const pDistSq = (localX - closeX) * (localX - closeX) + (localY - closeY) * (localY - closeY);
          if (pDistSq <= (tol + 4) * (tol + 4)) {
            nearArcPerimeter = true;
            break;
          }
        }

        projVec.copy(tempP).project(camera);
        if (projVec.z > 1.0 || projVec.z < -1.0) continue;
        const cx = (projVec.x * 0.5 + 0.5) * cw;
        const cy = (-projVec.y * 0.5 + 0.5) * ch;
        const cDistSq = (localX - cx) * (localX - cx) + (localY - cy) * (localY - cy);

        if (cDistSq < bestDistSq || nearArcPerimeter) {
          const arcWorldNorm = arc.normal.clone().applyMatrix3(normalMatrix).normalize();
          bestDistSq = Math.min(bestDistSq, cDistSq);
          bestCandidate = {
            type: 'center',
            point: tempP.clone(),
            normal: arcWorldNorm,
            targetMesh: mesh,
            arcData: { ...arc, worldPoints: arcWorldPoints },
            screenX: cx,
            screenY: cy,
            hudLabel: I18N.t('snapHudCenter') || 'Circle Center',
            hudIcon: '⨁'
          };
        }
      }
    }

    // 4. Test On Edge (Visible feature edge nearest point, lower priority than End, Mid, Center)
    if (this.snapEdge && features.featureEdges.length > 0 && !bestCandidate) {
      const mouseNDC = new THREE.Vector2((localX / cw) * 2 - 1, -(localY / ch) * 2 + 1);
      const testRaycaster = this.app.raycaster || new THREE.Raycaster();
      testRaycaster.setFromCamera(mouseNDC, camera);
      const mouseRay = testRaycaster.ray;

      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      const ptOnRay = new THREE.Vector3();
      const ptOnSeg = new THREE.Vector3();
      const projSeg = new THREE.Vector3();

      for (let i = 0; i < features.featureEdges.length; i++) {
        const edge = features.featureEdges[i];
        v0.copy(edge.p0).applyMatrix4(matrixWorld);
        v1.copy(edge.p1).applyMatrix4(matrixWorld);

        // Back-face culling for edge
        if (edge.normals && edge.normals.length > 0) {
          tempP.addVectors(v0, v1).multiplyScalar(0.5);
          if (isOrtho) {
            vCam.copy(camDir).negate();
          } else {
            vCam.subVectors(camera.position, tempP);
          }
          let isFront = false;
          for (let n = 0; n < edge.normals.length; n++) {
            tempN.copy(edge.normals[n]).applyMatrix3(normalMatrix);
            if (tempN.dot(vCam) > 0) {
              isFront = true;
              break;
            }
          }
          if (!isFront) continue; // Skip back edge
        }

        // True 3D line-of-sight closest point on segment (zero perspective distortion, removes 0.2m offset)
        mouseRay.distanceSqToSegment(v0, v1, ptOnRay, ptOnSeg);

        projSeg.copy(ptOnSeg).project(camera);
        if (projSeg.z > 1.0 || projSeg.z < -1.0) continue;

        const sx = (projSeg.x * 0.5 + 0.5) * cw;
        const sy = (-projSeg.y * 0.5 + 0.5) * ch;
        const dSq = (localX - sx) * (localX - sx) + (localY - sy) * (localY - sy);

        if (dSq < bestDistSq) {
          let edgeNormal = hitNormal;
          if (edge.normals && edge.normals.length > 0) {
            for (let n = 0; n < edge.normals.length; n++) {
              const candNorm = edge.normals[n].clone().applyMatrix3(normalMatrix).normalize();
              if (candNorm.dot(vCam) > 0) {
                edgeNormal = candNorm;
                break;
              }
            }
          }

          bestDistSq = dSq;
          bestCandidate = {
            type: 'edge',
            point: ptOnSeg.clone(),
            normal: edgeNormal,
            targetMesh: mesh,
            screenX: sx,
            screenY: sy,
            hudLabel: I18N.t('snapHudEdge') || 'On Edge',
            hudIcon: '⧗'
          };
        }
      }
    }

    // If point cloud candidate is closer to cursor than mesh features, prioritize point cloud
    if (pcCandidate && pcCandidate.distSq < bestDistSq) {
      bestDistSq = pcCandidate.distSq;
      bestCandidate = pcCandidate.candidate;
    }

    // Final occlusion verification: ensure candidate is not occluded by a front surface
    if (bestCandidate && bestCandidate.type !== 'pointcloud' && this.isPointOccluded(bestCandidate.point, camera)) {
      bestCandidate = null;
    }

    if (bestCandidate) {
      this.lastHoveredMesh = mesh;
      this.currentSnap = bestCandidate;
      this.showIndicator(bestCandidate, camera, container);
      return bestCandidate;
    } else {
      if (hit && hit.object) {
        this.lastHoveredMesh = hit.object;
      } else {
        this.lastHoveredMesh = null;
      }
      this.hideIndicator();
      return null;
    }
  }

  showIndicator(snap, camera, container) {
    if (!this.indicatorGroup) return;
    this.currentSnap = snap;

    this.indicatorGroup.position.copy(snap.point);
    this.indicatorGroup.visible = true;

    this.endpointObj.visible = (snap.type === 'endpoint');
    this.midpointObj.visible = (snap.type === 'midpoint');
    this.centerObj.visible = (snap.type === 'center');
    this.edgeObj.visible = (snap.type === 'edge');
    if (this.pointcloudObj) this.pointcloudObj.visible = (snap.type === 'pointcloud');

    this.updateIndicatorScale(camera, container, snap.point);

    if (snap.type === 'center' && snap.arcData && snap.arcData.worldPoints && snap.arcData.worldPoints.length > 1) {
      this.arcHighlightGeom.setFromPoints(snap.arcData.worldPoints);
      this.arcHighlightLine.visible = true;
    } else {
      this.arcHighlightLine.visible = false;
    }

    if (this.hudTooltip) {
      if (this.hudIcon) this.hudIcon.textContent = snap.hudIcon;
      if (this.hudText) this.hudText.textContent = snap.hudLabel;
      const cw = (container && container.clientWidth) || window.innerWidth;
      const leftPx = Math.max(8, Math.min(cw - 110, Math.round(snap.screenX + 14)));
      const topPx = Math.max(8, Math.round(snap.screenY - 12));
      this.hudTooltip.style.left = `${leftPx}px`;
      this.hudTooltip.style.top = `${topPx}px`;
      this.hudTooltip.style.display = 'inline-flex';
    }

    this.app.requestRender(100);
  }

  updateIndicatorScale(camera, container, targetPoint = null) {
    if (!this.indicatorGroup || !this.indicatorGroup.visible) return;
    const p = targetPoint || this.indicatorGroup.position;
    const ch = container ? (container.clientHeight || 1000) : 1000;

    let worldPerPixel;
    if (camera.isOrthographicCamera) {
      worldPerPixel = ((camera.top - camera.bottom) / (camera.zoom || 1)) / ch;
    } else {
      const dist = camera.position.distanceTo(p);
      const fovRad = ((camera.fov || 45) * Math.PI) / 180;
      worldPerPixel = (2 * dist * Math.tan(fovRad / 2)) / ch;
    }

    const scale = Math.max(1e-5, worldPerPixel * 15);
    this.indicatorGroup.scale.set(scale, scale, scale);
    this.indicatorGroup.quaternion.copy(camera.quaternion);

    if (this.hudTooltip && this.currentSnap && camera) {
      const proj = new THREE.Vector3().copy(this.currentSnap.point).project(camera);
      const cw = container.clientWidth || window.innerWidth;
      const sx = (proj.x * 0.5 + 0.5) * cw;
      const sy = (-proj.y * 0.5 + 0.5) * ch;
      const leftPx = Math.max(8, Math.min(cw - 110, Math.round(sx + 14)));
      const topPx = Math.max(8, Math.round(sy - 12));
      this.hudTooltip.style.left = `${leftPx}px`;
      this.hudTooltip.style.top = `${topPx}px`;
    }
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

    this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, this.visibleDistance);
    this.perspectiveCamera.position.set(220, 180, 260);

    const initH = 200;
    const initW = initH * aspect;
    this.orthographicCamera = new THREE.OrthographicCamera(-initW / 2, initW / 2, initH / 2, -initH / 2, 0.1, this.visibleDistance);
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

    // Look Around in Place (Shift + Right Drag or Left + Right Drag)
    this.isLookAround = false;
    this.lookAroundStartX = 0;
    this.lookAroundStartY = 0;
    this.wasLookAround = false;
    this.suppressLeftClick = false;
    this._selectionBeforeClick = null;
    this._lastClickTime = 0;

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
    this.clippingEngine.onClippingChange = (planes) => {
      if (this.pointCloudManager) {
        this.pointCloudManager.updateClipping(planes);
      }
    };
    this.clippingEngine.onGizmoChange = () => {
      this.syncSectionUI();
      if (this.pointCloudManager) {
        this.pointCloudManager.updateClipping(this.clippingEngine.clippingPlanes);
      }
    };
    this.ifcParser = new IFCParser();
    this.pointCloudManager = new BIMPointCloudManager(this);
    
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
    
    // Floating Tools Panel & Measure Tool
    this.isFloatingToolsOpen = false;
    this.activeToolTab = 'tab-section-content';
    this.isMeasureMode = false;
    this.measureMode = 'point';
    this.measureUnit = 'm';
    this.measurePoints = [];
    this.measureLine = null;
    this.lastMeasurementData = null;
    this.distanceMeasurements = [];
    this.distanceMeasurementCounter = 0;
    this.activeDistanceMeasurementId = null;
    this.pendingDistanceStart = null;
    this.angleMeasurements = [];
    this.angleMeasurementCounter = 0;
    this.activeAngleMeasurementId = null;
    this.activeAngleMode = 'horizontal'; // 'horizontal' | 'spatial3d'
    this.pendingAngleState = null;
    this.anglePreviewLine = null;
    this.anglePreviewProjGroup = null;
    this.anglePreviewArcLine = null;
    this.anglePreviewCalloutEl = null;
    this.distancePreviewLine = null;
    this.distancePreviewBadgeEl = null;
    this.multiPointState = {
      isDrawing: false,
      isClosed: false,
      points: [],
      markers: [],
      lines: [],
      segments: [],
      totalLength: 0,
      hoveredSegmentIndex: -1
    };
    this.multiPointPreviewLine = null;
    this.multiPointHoverCalloutEl = null;
    this.multiPointInsertSegIdx = -1;
    this.multiPointDrawDir = 'append';
    this.multiPointInsertPreviewLine = null;
    this.contextMenuMultiPointSegIdx = -1;
    this.multiPointClosurePopoverEl = null;
    this.pendingClosureAction = null;
    this.isSnappedToClosurePoint = false;
    this.isDraggedSnapToOpposite = false;
    this.multiPointAreaMesh = null;
    this.multiPointAreaDropLines = null;
    this.multiPointAreaMode = '3d';
    this.multiPointAreaCalloutEl = null;
    this.multiPointAreaCentroid3D = new THREE.Vector3();
    this.multiPointAreaDataCache = null;
    this.multiPointSelfIntersectingSegs = [];
    this.multiPointSelfIntersectPoints = [];
    this.multiPointSelfIntersectCenter = null;
    this.multiPointGlowAnimId = null;
    this.measureMarkers = [];
    this.measurePointCounter = 0;
    this.activeMeasurePointId = null;
    this.hoveredMeasureMarker = null;
    this.isDraggingMeasurePoint = false;
    this.draggingMeasureMarker = null;
    this.contextMenuMeasureMarker = null;
    this.contextMenuMeasureSurfaceHit = null;
    this.contextMenuHitPoint = null;
    
    this.activeModel = null;
    this.loadedModels = [];
    this.modelInfoMap = new Map();
    this._isAppendNextFile = false;
    this.modelOpacity = 1.0;
    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.activeFrameTimeTotal = 0;
    this.cpuLoad = 0;
    this.drawCalls = 0;
    this.ramMb = null;
    
    // Performance optimization states: rAF throttles, DOM caches & smart on-demand rendering
    this.hoverRaf = null;
    this.pendingMouseMoveEvt = null;
    this.cachedCoordEls = null;
    this.cachedCamEls = null;
    this.cachedPerfEls = null;
    this.needsRender = true;
    this._activeRenderUntil = performance.now() + 1500;
    this._lastCamPos = new THREE.Vector3(NaN, NaN, NaN);
    this._lastCamQuat = new THREE.Quaternion();
    this._lastCamZoom = -1;
    this._lastActiveModel = null;
    
    // UI Theme System ('dark' | 'light')
    this.currentTheme = 'dark';

    // Keyboard Shortcuts System (Scheme A Standard / Scheme B Autodesk Revit)
    this.shortcutsMode = localStorage.getItem('bimscope_shortcuts_mode') || 'standard';
    this.shortcutsBuffer = '';
    this.shortcutsBufferTimer = null;
    this.shortcutsFadeTimer = null;
    this.shortcutsCapsuleEl = null;
    this.shortcutsCapsuleKeysEl = null;
    this.shortcutsHudModalEl = null;
    this.shortcutsHudCurrentTab = this.shortcutsMode;
    
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

    // Left Sidebar Virtual Trees
    this.virtualStructTree = null;
    this.virtualLevelsTree = null;
    this.virtualElemTree = null;
    this.virtualLevelsData = null;
    this.virtualElemData = null;

    // Setup 3D orientation compass & category filter states
    this.categoryStates = new Map();
    this.compass3d = new True3DCompass(this);
    if (typeof ModelCompareEngine !== 'undefined') {
      this.compareEngine = new ModelCompareEngine(this);
    }
    this.initPivotHelper();
    this.initMeasurementSystem();
    this.initSelectionHelper();
    this.initOffscreenIndicator();
    this.initContextMenu();
    this.initEventListeners();
    this.initUI();
    this.initShortcutsSystem();
    this.handleWindowAdaptiveLayout();
    
    // Load default CR301 West Depot model
    this.loadDemoModel();
    
    // Initialize Help & Guided Tour System
    if (typeof BIMHelpSystem !== 'undefined') {
      this.helpSystem = new BIMHelpSystem(this);
      this.helpSystem.checkAutoStart();
    }

    // Wake on-demand renderer on user interaction
    this._wakeRender = () => this.requestRender(250);
    window.addEventListener('pointerdown', this._wakeRender, { passive: true });
    window.addEventListener('wheel', this._wakeRender, { passive: true });
    window.addEventListener('keydown', this._wakeRender, { passive: true });
    window.addEventListener('input', this._wakeRender, { passive: true });
    window.addEventListener('change', this._wakeRender, { passive: true });
    window.addEventListener('click', this._wakeRender, { passive: true });
    window.addEventListener('resize', this._wakeRender, { passive: true });
    if (this.container) {
      this.container.addEventListener('pointermove', this._wakeRender, { passive: true });
    }
    
    // Animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  requestRender(durationMs = 200) {
    this.needsRender = true;
    const until = performance.now() + durationMs;
    if (until > (this._activeRenderUntil || 0)) {
      this._activeRenderUntil = until;
    }
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
      const fogColor = this.currentTheme === 'light' ? 0xf1f5f9 : 0x0c1017;
      // Gentle linear fog fading in from 45% to 98% of visible distance
      this.scene.fog = new THREE.Fog(fogColor, far * 0.45, far * 0.98);
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

  // Look Around in Place (Shift + Right Drag or Left + Right Drag):
  // Camera position remains strictly stationary; camera yaw/pitch rotates naturally like first-person head turn.
  lookAround(dx, dy) {
    if (!this.camera) return;
    const speed = 0.0035;
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    let camRight = new THREE.Vector3().crossVectors(camFwd, worldUp).normalize();
    if (camRight.lengthSq() < 0.001) camRight.set(1, 0, 0);

    // Natural head turn: dx > 0 (drag right) => turn right (negative theta around world Up)
    const theta = -dx * speed;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(worldUp, theta);

    // dy < 0 (drag up) => look up (positive phi around camRight)
    const phi = -dy * speed;
    const qPitch = new THREE.Quaternion().setFromAxisAngle(camRight, phi);

    const testFwd = camFwd.clone().applyQuaternion(qPitch).applyQuaternion(qYaw);
    const angleToUp = testFwd.angleTo(worldUp);

    const qDelta = new THREE.Quaternion();
    if (angleToUp >= 0.02 && angleToUp <= Math.PI - 0.02) {
      qDelta.multiplyQuaternions(qPitch, qYaw);
    } else {
      qDelta.copy(qYaw);
    }

    // Camera position remains strictly stationary!
    // Rotate camera orientation and re-level horizon (zero roll)
    const newFwd = camFwd.applyQuaternion(qDelta).normalize();
    let newRight = new THREE.Vector3().crossVectors(newFwd, worldUp).normalize();
    if (newRight.lengthSq() < 0.001) newRight.set(1, 0, 0);
    const newUp = new THREE.Vector3().crossVectors(newRight, newFwd).normalize();

    const rotMatrix = new THREE.Matrix4().makeBasis(newRight, newUp, newFwd.clone().negate());
    this.camera.quaternion.setFromRotationMatrix(rotMatrix);

    // Keep controls.target aligned along new forward line of sight
    const dist = (this.controls && this.controls.target) ? Math.max(1.0, this.camera.position.distanceTo(this.controls.target)) : 10.0;
    this.controls.target.copy(this.camera.position).addScaledVector(newFwd, dist);
    if (this.pivotPoint) {
      this.pivotPoint.copy(this.controls.target);
    }

    if (this.compass3d) {
      this.compass3d.update();
    }
    this.camera.updateMatrixWorld();
    if ((this.measureMarkers && this.measureMarkers.length > 0) || (this.radiusMeasurements && this.radiusMeasurements.length > 0) || (this.angleMeasurements && this.angleMeasurements.length > 0) || (this.distanceMeasurements && this.distanceMeasurements.length > 0)) {
      this.updateMeasureMarkersAndCallouts();
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

  // -------------------------------------------------------------
  // Off-Screen Selection Direction & Distance Indicator
  // -------------------------------------------------------------
  initOffscreenIndicator() {
    if (this.offscreenIndicatorEl) return;
    let el = document.getElementById('offscreen-indicator');
    if (!el && this.container) {
      el = document.createElement('div');
      el.id = 'offscreen-indicator';
      el.className = 'offscreen-indicator';
      el.innerHTML = `
        <div class="offscreen-target" id="offscreen-target">
          <svg class="offscreen-target-svg" viewBox="0 0 54 54">
            <defs>
              <linearGradient id="offscreen-ring-grad" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="35%" stop-color="#eaedf2"/>
                <stop offset="75%" stop-color="#cbd1db"/>
                <stop offset="100%" stop-color="#9aa0ad"/>
              </linearGradient>
              <radialGradient id="offscreen-dome-grad" cx="42%" cy="32%" r="65%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="45%" stop-color="#eaedf2"/>
                <stop offset="80%" stop-color="#c6ccd6"/>
                <stop offset="100%" stop-color="#939ba8"/>
              </radialGradient>
              <linearGradient id="offscreen-chev-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="60%" stop-color="#e2e6eb"/>
                <stop offset="100%" stop-color="#c8ced8"/>
              </linearGradient>
            </defs>
            <circle cx="27" cy="27" r="26" fill="#202226" stroke="#000000" stroke-width="2"/>
            <circle cx="27" cy="27" r="23" fill="none" stroke="url(#offscreen-ring-grad)" stroke-width="4.5"/>
            <circle cx="27" cy="27" r="18.5" fill="#202226" stroke="#000000" stroke-width="1.8"/>
            <circle cx="27" cy="27" r="11" fill="url(#offscreen-dome-grad)" stroke="#2b303a" stroke-width="1"/>
          </svg>
          <div class="offscreen-pointer" id="offscreen-pointer">
            <svg class="offscreen-pointer-svg" viewBox="0 0 54 54">
              <path d="M 82.5 25.5 
                       Q 82.5 27 82.5 28.5
                       L 68 41
                       Q 63 43.5 62.5 38.5
                       Q 66.5 27 62.5 15.5
                       Q 63 10.5 68 13
                       Z"
                    fill="url(#offscreen-chev-grad)" stroke="#000000" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        <div class="offscreen-dist" id="offscreen-dist">0.0m</div>
      `;
      this.container.appendChild(el);
    }
    this.offscreenIndicatorEl = el;
    this.offscreenPointerEl = document.getElementById('offscreen-pointer');
    this.offscreenDistEl = document.getElementById('offscreen-dist');
  }

  getTargetBoundsAndCenter() {
    // 1. Multi-selection
    if (this.selectedMeshes && this.selectedMeshes.length > 0) {
      const box = new THREE.Box3();
      let hasValid = false;
      for (const m of this.selectedMeshes) {
        if (m && m.visible !== false && m.geometry) {
          m.updateWorldMatrix(true, false);
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          if (m.geometry.boundingBox) {
            const tempBox = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
            box.union(tempBox);
            hasValid = true;
          }
        }
      }
      if (hasValid && !box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        return { box, center };
      }
    }
    // 2. Single mesh
    if (this.selectedMesh && this.selectedMesh.visible !== false && this.selectedMesh.geometry) {
      this.selectedMesh.updateWorldMatrix(true, false);
      if (!this.selectedMesh.geometry.boundingBox) this.selectedMesh.geometry.computeBoundingBox();
      if (this.selectedMesh.geometry.boundingBox) {
        const box = this.selectedMesh.geometry.boundingBox.clone().applyMatrix4(this.selectedMesh.matrixWorld);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          return { box, center };
        }
      }
    }
    // 3. Point cloud
    if (this.pointCloudManager && this.pointCloudManager.isPointCloudSelected && this.pointCloudManager.activePointCloud) {
      const pco = this.pointCloudManager.activePointCloud;
      if (pco.visible !== false) {
        const box = this.pointCloudManager.getWorldBoundingBox(pco);
        if (box && !box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          return { box, center };
        }
      }
    }
    // 4. Whole model node
    if (this.selectedModel && this.selectedModel.visible !== false) {
      const box = new THREE.Box3().setFromObject(this.selectedModel);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        return { box, center };
      }
    }
    return null;
  }

  updateOffscreenIndicator() {
    if (!this.offscreenIndicatorEl) {
      this.initOffscreenIndicator();
    }
    if (!this.offscreenIndicatorEl || !this.camera || !this.container) return;

    const target = this.getTargetBoundsAndCenter();
    if (!target) {
      this.hideOffscreenIndicator();
      return;
    }

    // 1. View frustum test: Is the target box partially or fully in view?
    if (!this._indicatorFrustum) {
      this._indicatorFrustum = new THREE.Frustum();
      this._indicatorProjScreenMatrix = new THREE.Matrix4();
    }
    this._indicatorProjScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._indicatorFrustum.setFromProjectionMatrix(this._indicatorProjScreenMatrix);

    if (this._indicatorFrustum.intersectsBox(target.box)) {
      this.hideOffscreenIndicator();
      return;
    }

    // Target is COMPLETELY off-screen!
    // 2. Compute Euclidean distance from camera position to target center
    const dist = this.camera.position.distanceTo(target.center);
    if (this.offscreenDistEl) {
      this.offscreenDistEl.textContent = `${dist.toFixed(1)}m`;
    }

    // 3. Transform target center to camera view space
    const vCam = target.center.clone().applyMatrix4(this.camera.matrixWorldInverse);

    // 4. In camera view space:
    // +X is camera RIGHT, +Y is camera UP.
    // Screen direction vector:
    // dirX: positive is screen right
    // dirY: positive is screen down (so -vCam.y)
    let dirX = vCam.x;
    let dirY = -vCam.y;
    let dirLen = Math.hypot(dirX, dirY);
    if (dirLen < 1e-4) {
      dirX = 0;
      dirY = 1;
      dirLen = 1;
    } else {
      dirX /= dirLen;
      dirY /= dirLen;
    }

    // 5. Clamping circle center to container boundary with safe perimeter padding
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    // Keep circle center safely away from viewport edges to leave room for the orbiting arrow
    const padX = 75;
    const padY = 65;
    const cx = cw / 2;
    const cy = ch / 2;
    const hw = Math.max(10, cx - padX);
    const hh = Math.max(10, cy - padY);

    const sx = Math.abs(dirX) > 1e-6 ? hw / Math.abs(dirX) : Infinity;
    const sy = Math.abs(dirY) > 1e-6 ? hh / Math.abs(dirY) : Infinity;
    const s = Math.min(sx, sy);

    const px = Math.round(cx + dirX * s);
    const py = Math.round(cy + dirY * s);

    // 6. Pointer rotation angle around circle center (0 deg points right)
    const angleDeg = Math.atan2(dirY, dirX) * (180 / Math.PI);
    if (this.offscreenPointerEl) {
      this.offscreenPointerEl.style.transform = `rotate(${angleDeg}deg)`;
    }

    // 7. Distance label placement:
    // Place on the inner side of the viewport so it never overflows
    if (this.offscreenDistEl) {
      if (px > cx) {
        this.offscreenDistEl.style.left = 'auto';
        this.offscreenDistEl.style.right = 'calc(100% + 14px)';
      } else {
        this.offscreenDistEl.style.right = 'auto';
        this.offscreenDistEl.style.left = 'calc(100% + 14px)';
      }
    }

    this.offscreenIndicatorEl.style.left = `${px}px`;
    this.offscreenIndicatorEl.style.top = `${py}px`;

    this.showOffscreenIndicator();
  }

  showOffscreenIndicator() {
    if (this.offscreenIndicatorEl && !this.offscreenIndicatorEl.classList.contains('visible')) {
      this.offscreenIndicatorEl.style.display = 'block';
      this.offscreenIndicatorEl.classList.add('visible');
    }
  }

  hideOffscreenIndicator() {
    if (this.offscreenIndicatorEl && this.offscreenIndicatorEl.classList.contains('visible')) {
      this.offscreenIndicatorEl.classList.remove('visible');
      this.offscreenIndicatorEl.style.display = 'none';
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
        <span class="legend-chip-name">${this.escapeHtml(localizedName)}</span>
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
  
  revokeActiveBlobUrls() {
    if (this._activeBlobUrls && this._activeBlobUrls.size > 0) {
      this._activeBlobUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      });
      this._activeBlobUrls.clear();
    }
  }

  clearModel(clearPointClouds = true) {
    this.revokeActiveBlobUrls();
    const modelsToDispose = (this.loadedModels && this.loadedModels.length > 0) ? [...this.loadedModels] : (this.activeModel ? [this.activeModel] : []);
    modelsToDispose.forEach(m => {
      this.scene.remove(m);
      const texturesToDispose = new Set();
      m.traverse(obj => {
        if (obj.userData && obj.userData.edgeLines) {
          if (obj.userData.edgeLines.geometry) obj.userData.edgeLines.geometry.dispose();
          if (obj.userData.edgeLines.material) {
            if (Array.isArray(obj.userData.edgeLines.material)) obj.userData.edgeLines.material.forEach(mat => mat && mat.dispose());
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
          mats.forEach(mat => {
            if (!mat) return;
            texSlots.forEach(slot => {
              if (mat[slot] && typeof mat[slot].dispose === 'function') {
                texturesToDispose.add(mat[slot]);
              }
            });
            mat.dispose();
          });
        }
      });
      texturesToDispose.forEach(tex => tex.dispose());
    });

    this.loadedModels = [];
    if (this.modelInfoMap) this.modelInfoMap.clear();
    this.activeModel = null;

    if (clearPointClouds && this.pointCloudManager) {
      this.pointCloudManager.clearPointClouds();
    }

    if (this.clippingEngine) {
      this.clippingEngine.clearModel();
      this.resetSectionState();
    }
    this.categoryStates.clear();
    const container = document.querySelector('.legend-container');
    if (container) {
      container.innerHTML = '<span class="legend-title" data-i18n="legendTitle">' + I18N.t('legendTitle') + '</span>';
      this.updateBottomBarOverflow();
    }
    this.clearSelection();
    this.clearMeasurement();
    this.hideMeasurePointPreview();
    if (this.snapEngine) {
      this.snapEngine.clear();
    }
    this.hideAnimationPlayer();
    this.updateStats();
    this.needsRender = true;
    this.checkEmptySceneState();
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
    const singleEdges = [];

    for (const entry of edgeMap.values()) {
      const norms = entry.normals;
      if (norms.length === 1) {
        singleEdges.push(entry);
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

    // Filter single-face edges: eliminate internal coplanar T-junction seams created by CSG void subtraction
    if (singleEdges.length > 0) {
      const dir1 = new THREE.Vector3();
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      const sLen = singleEdges.length;

      for (let i = 0; i < sLen; i++) {
        const e1 = singleEdges[i];
        const n1 = e1.normals[0];
        dir1.set(e1.p1[0] - e1.p0[0], e1.p1[1] - e1.p0[1], e1.p1[2] - e1.p0[2]);
        const len1 = dir1.length();
        if (len1 < 1e-4) continue;
        dir1.multiplyScalar(1 / len1);

        let isInternalCoplanarSeam = false;
        for (let j = 0; j < sLen; j++) {
          if (i === j) continue;
          const e2 = singleEdges[j];
          const n2 = e2.normals[0];
          // Must be coplanar (same normal within 0.5 degrees)
          if (n1.dot(n2) < 0.999) continue;

          // Check if e2 lies on the same 3D line as e1
          v0.set(e2.p0[0] - e1.p0[0], e2.p0[1] - e1.p0[1], e2.p0[2] - e1.p0[2]);
          const proj0 = v0.dot(dir1);
          const perp0Sq = (v0.x - proj0 * dir1.x) ** 2 + (v0.y - proj0 * dir1.y) ** 2 + (v0.z - proj0 * dir1.z) ** 2;
          if (perp0Sq > 2.5e-5) continue; // > 5mm tolerance

          v1.set(e2.p1[0] - e1.p0[0], e2.p1[1] - e1.p0[1], e2.p1[2] - e1.p0[2]);
          const proj1 = v1.dot(dir1);
          const perp1Sq = (v1.x - proj1 * dir1.x) ** 2 + (v1.y - proj1 * dir1.y) ** 2 + (v1.z - proj1 * dir1.z) ** 2;
          if (perp1Sq > 2.5e-5) continue;

          // Check overlap along the 1D interval [0, len1]
          const minProj = Math.min(proj0, proj1);
          const maxProj = Math.max(proj0, proj1);
          const overlap = Math.max(0, Math.min(len1, maxProj) - Math.max(0, minProj));

          if (overlap > 0.005) {
            isInternalCoplanarSeam = true;
            break;
          }
        }

        if (!isInternalCoplanarSeam) {
          edgePositions.push(e1.p0[0], e1.p0[1], e1.p0[2], e1.p1[0], e1.p1[1], e1.p1[2]);
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
  
  setModel(modelGroup, isAppendOverride = null) {
    const isAppend = isAppendOverride !== null ? Boolean(isAppendOverride) : Boolean(this._isAppendNextFile);
    this._isAppendNextFile = false;

    if (!isAppend) {
      this.clearModel();
    }

    this.activeModel = modelGroup;
    if (!this.loadedModels) this.loadedModels = [];
    if (!this.loadedModels.includes(modelGroup)) {
      this.loadedModels.push(modelGroup);
    }

    if (!this.modelInfoMap) this.modelInfoMap = new Map();
    if (!this.modelInfoMap.has(modelGroup)) {
      const fileName = (modelGroup.userData && modelGroup.userData.fileName) || modelGroup.name || "Model";
      const info = {
        fileName,
        elementCount: 0,
        timestamp: Date.now()
      };
      this.modelInfoMap.set(modelGroup, info);
      this.currentModelInfo = info;
    }

    this.scene.add(this.activeModel);
    
    // Generate clean architectural edge lines
    this.generateModelEdges(this.activeModel);
    
    // Compute total bounds and bounding sphere
    const box = new THREE.Box3().setFromObject(this.activeModel);
    if (!box.isEmpty()) {
      this.updateClippingBounds(Boolean(isAppend));
      
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const radius = sphere.radius || 100;

      // Adapt camera visible distance (default 5,000m, capped at max 100,000m)
      const autoFar = Math.min(100000, Math.max(5000, Math.ceil(radius * 5)));
      if (this.camera.far < autoFar) {
        this.setFarClip(autoFar, true);
      } else {
        this.updateDistanceUI(this.camera.far);
      }

      if (!isAppend) {
        // Reposition Grid under the model's footprint
        if (this.grid) {
          this.grid.position.set(center.x, box.min.y - 0.05, center.z);
        }

        // Update Orbit Pivot to the center of the newly loaded model
        this.pivotPoint.copy(center);
        this.controls.target.copy(center);

        // Update solar lighting center
        if (this.solarEngine) {
          this.solarEngine.setCenter(center, box);
        }
      }
    }
    
    // Update Hierarchy Tree & Dynamic Bottom Legend
    this.buildHierarchyTree();
    this.updateBottomLegend();
    this.updateStats();

    if (isAppend) {
      const fileName = (modelGroup.userData && modelGroup.userData.fileName) || (this.currentModelInfo && this.currentModelInfo.fileName) || "Model";
      showToast((typeof I18N !== 'undefined' ? I18N.t('fileAppendedToast', { name: fileName }) : `Appended "${fileName}"`) || `Appended "${fileName}"`, 'info', 3500);
      if (this._wakeRender) this._wakeRender(300);
    } else {
      this.fitView(true);
      this.initViewHistory();
      showToast(I18N.t('loadingTitle') + " - " + I18N.t('solarDayMsg'), 'success');
    }

    // Update project title text
    const titleEl = document.getElementById('project-title-text');
    if (titleEl) {
      const totalFiles = this.loadedModels.length + (this.pointCloudManager ? this.pointCloudManager.pointClouds.length : 0);
      const currentName = (modelGroup.userData && modelGroup.userData.fileName) || (this.currentModelInfo && this.currentModelInfo.fileName) || titleEl.textContent;
      if (totalFiles > 1) {
        titleEl.textContent = `${currentName} (+${totalFiles - 1})`;
      }
    }
  }

  getSceneBounds() {
    const box = new THREE.Box3();
    if (this.loadedModels && this.loadedModels.length > 0) {
      this.loadedModels.forEach(m => {
        if (m.visible) {
          const b = new THREE.Box3().setFromObject(m);
          if (!b.isEmpty()) box.union(b);
        }
      });
    } else if (this.activeModel && this.activeModel.visible) {
      const b = new THREE.Box3().setFromObject(this.activeModel);
      if (!b.isEmpty()) box.union(b);
    }

    if (this.pointCloudManager && this.pointCloudManager.pointClouds.length > 0) {
      this.pointCloudManager.pointClouds.forEach(pco => {
        if (pco.visible) {
          const pcBox = this.pointCloudManager.getWorldBoundingBox(pco);
          if (pcBox && !pcBox.isEmpty()) box.union(pcBox);
        }
      });
    }
    return box;
  }

  zoomToModel(model) {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) {
      this.zoomToBox(box);
    }
  }

  removeModel(model) {
    if (!model) return;
    const info = this.modelInfoMap ? this.modelInfoMap.get(model) : null;
    const modelName = (info && info.fileName) || (model.userData && model.userData.fileName) || model.name || "Model";

    this.scene.remove(model);
    const texturesToDispose = new Set();
    model.traverse(obj => {
      if (obj.userData && obj.userData.edgeLines) {
        if (obj.userData.edgeLines.geometry) obj.userData.edgeLines.geometry.dispose();
        if (obj.userData.edgeLines.material) {
          if (Array.isArray(obj.userData.edgeLines.material)) obj.userData.edgeLines.material.forEach(m => m && m.dispose());
          else obj.userData.edgeLines.material.dispose();
        }
        obj.userData.edgeLines = null;
      }
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const texSlots = [
          'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap',
          'emissiveMap', 'lightMap', 'metalnessMap', 'normalMap',
          'roughnessMap', 'specularMap'
        ];
        mats.forEach(mat => {
          if (!mat) return;
          texSlots.forEach(slot => {
            if (mat[slot] && typeof mat[slot].dispose === 'function') texturesToDispose.add(mat[slot]);
          });
          mat.dispose();
        });
      }
    });
    texturesToDispose.forEach(t => t.dispose());

    if (this.loadedModels) {
      const idx = this.loadedModels.indexOf(model);
      if (idx >= 0) this.loadedModels.splice(idx, 1);
    }
    if (this.modelInfoMap) this.modelInfoMap.delete(model);

    if (this.activeModel === model) {
      this.activeModel = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels[0] : null;
      this.currentModelInfo = this.activeModel && this.modelInfoMap ? this.modelInfoMap.get(this.activeModel) : null;
    }

    this.clearSelection();
    this.updateClippingBounds(true);
    this.buildHierarchyTree();
    this.updateStats();
    this.renderModelInfoInspector();

    const titleEl = document.getElementById('project-title-text');
    if (titleEl) {
      if (this.loadedModels.length === 1 && (!this.pointCloudManager || this.pointCloudManager.pointClouds.length === 0)) {
        const actInfo = this.modelInfoMap.get(this.loadedModels[0]);
        titleEl.textContent = actInfo?.fileName || 'Model';
      } else if (this.loadedModels.length > 1) {
        const actInfo = this.modelInfoMap.get(this.loadedModels[0]);
        const total = this.loadedModels.length + (this.pointCloudManager ? this.pointCloudManager.pointClouds.length : 0);
        titleEl.textContent = `${actInfo?.fileName || 'Model'} (+${total - 1})`;
      }
    }

    if (this.showToast) {
      const msg = (typeof I18N !== 'undefined' ? I18N.t('fileRemovedToast', { name: modelName }) : `Removed "${modelName}"`) || `Removed "${modelName}"`;
      this.showToast(msg, 'info', 3000);
    }

    this.checkEmptySceneState();
    if (this._wakeRender) this._wakeRender(200);
  }

  checkEmptySceneState() {
    const hasModels = this.loadedModels && this.loadedModels.length > 0;
    const hasPointClouds = this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0;

    if (!hasModels && !hasPointClouds) {
      const titleEl = document.getElementById('project-title-text');
      if (titleEl) titleEl.textContent = typeof I18N !== 'undefined' ? I18N.t('noFileChosen') : 'No file chosen';

      const statsCount = document.getElementById('stats-elements');
      if (statsCount) statsCount.textContent = '0';
      const statsTri = document.getElementById('stats-triangles');
      if (statsTri) statsTri.textContent = '0';
      const statsVert = document.getElementById('stats-vertices');
      if (statsVert) statsVert.textContent = '0';

      const inspector = document.getElementById('inspector-content');
      if (inspector) inspector.innerHTML = `<div class="inspector-empty">${typeof I18N !== 'undefined' ? I18N.t('noModelLoaded') : 'No model loaded'}</div>`;

      const legend = document.getElementById('category-chips');
      if (legend) legend.innerHTML = '';

      if (this.virtualStructTree) this.virtualStructTree.setGroups([]);
      if (this.virtualLevelsTree) this.virtualLevelsTree.setGroups([]);
      if (this.virtualElemTree) this.virtualElemTree.setGroups([]);
      this.virtualLevelsData = [];
      this.virtualElemData = [];

      if (this.clippingEngine) {
        this.resetSectionState();
      }
    }
  }

  resetSectionState() {
    if (!this.clippingEngine) return;
    this.clippingEngine.reset();
    const secActive = document.getElementById('sec-active-chk');
    if (secActive) secActive.checked = false;
    const secOffset = document.getElementById('sec-offset-slider');
    if (secOffset) secOffset.value = 0.5;
    ['sec-box-minx', 'sec-box-miny', 'sec-box-minz'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 0;
    });
    ['sec-box-maxx', 'sec-box-maxy', 'sec-box-maxz'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 1;
    });
    if (this.pointCloudManager) {
      this.pointCloudManager.updateClipping([]);
    }
    this.syncSectionUI();
  }

  updateClippingBounds(preserveActive = true) {
    if (!this.clippingEngine) return;
    const combinedBox = new THREE.Box3();
    const models = (this.loadedModels && this.loadedModels.length > 0)
      ? this.loadedModels
      : (this.activeModel ? [this.activeModel] : []);

    models.forEach(m => {
      if (m) {
        const b = new THREE.Box3().setFromObject(m);
        if (!b.isEmpty()) combinedBox.union(b);
      }
    });

    if (this.pointCloudManager && this.pointCloudManager.pointClouds) {
      for (const pco of this.pointCloudManager.pointClouds) {
        if (pco) {
          const pb = this.pointCloudManager.getWorldBoundingBox(pco);
          if (pb && !pb.isEmpty()) combinedBox.union(pb);
        }
      }
    }

    if (!combinedBox.isEmpty()) {
      this.clippingEngine.setBounds(combinedBox, preserveActive);
    }
    this.clippingEngine.setModels(models);
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

  // Zoom to Fit (smooth camera animation framing entire active model along current viewing line of sight)
  zoomToFit(immediate = false) {
    const box = this.getSceneBounds ? this.getSceneBounds() : (this.activeModel ? new THREE.Box3().setFromObject(this.activeModel) : new THREE.Box3());
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 10);
    const neededFar = Math.min(100000, Math.max(5000, Math.ceil(maxDim * 5)));
    if (this.camera && this.camera.far < neededFar) {
      this.setFarClip(neededFar, true);
    }

    if (immediate) {
      this.fitView(true);
    } else {
      this.zoomToBox(box);
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
      this.orthographicCamera.near = 0.1;
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
      this.perspectiveCamera.near = 0.1;
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
  
  // Build High-Performance Virtual Hierarchy Tree in Left Sidebar
  buildHierarchyTree() {
    const hasModels = this.loadedModels && this.loadedModels.length > 0;
    const hasPointClouds = this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0;

    if (!hasModels && !hasPointClouds) {
      if (this.virtualStructTree) this.virtualStructTree.setGroups([]);
      if (this.virtualLevelsTree) this.virtualLevelsTree.setGroups([]);
      if (this.virtualElemTree) this.virtualElemTree.setGroups([]);
      this.virtualLevelsData = [];
      this.virtualElemData = [];
      return;
    }

    const prevModelFileCollapsedMap = new Map();
    if (this.virtualStructTree && this.virtualStructTree.groups) {
      this.virtualStructTree.groups.forEach(fg => {
        if (fg.key) prevModelFileCollapsedMap.set(fg.key, fg.collapsed);
      });
    }

    const structureFiles = [];
    const levelFiles = [];
    const elementFiles = [];

    // 1. Process 3D CAD/BIM Models
    const modelsList = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : []);

    modelsList.forEach((model, idx) => {
      const info = (this.modelInfoMap && this.modelInfoMap.get(model)) || {};
      const fileName = info.fileName || (model.userData && model.userData.fileName) || `Model_${idx + 1}`;
      const fileKey = `model_${idx}_${fileName}`;
      const isFileCollapsed = prevModelFileCollapsedMap.has(fileKey) ? prevModelFileCollapsedMap.get(fileKey) : false;

      const structureMap = new Map();
      const categoryMap = new Map();
      const levelMap = new Map();

      model.traverse(obj => {
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

      const getElementColor = (m) => {
        if (m.material) {
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          if (mat && mat.color) return `#${mat.color.getHexString()}`;
        }
        return '#38bdf8';
      };

      const sortAlpha = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

      // Default sub-groups collapsed as requested by user ("默认收起子层级")
      const buildGroups = (map, isCat = false) => {
        const list = [];
        map.forEach((meshes, name) => {
          let localizedName = name;
          let colorHex = null;
          if (isCat) {
            localizedName = I18N.getCategoryName(name);
            const cs = this.categoryStates ? this.categoryStates.get(name) : null;
            if (cs && cs.colorHex) colorHex = cs.colorHex;
          }
          const leaves = meshes.map(m => ({
            name: m.name || m.userData?.name || `Element ${m.id}`,
            mesh: m,
            colorHex: getElementColor(m)
          })).sort(sortAlpha);

          list.push({
            name,
            localizedName,
            meshes,
            leaves,
            catName: isCat ? name : null,
            colorHex,
            collapsed: true
          });
        });
        return list.sort(sortAlpha);
      };

      const sGroups = buildGroups(structureMap, false);
      const lGroups = buildGroups(levelMap, false);
      const eGroups = buildGroups(categoryMap, true);

      let totalElemCount = 0;
      categoryMap.forEach(meshes => { totalElemCount += meshes.length; });

      structureFiles.push({
        key: fileKey,
        fileType: 'model',
        model,
        name: fileName,
        icon: '📁',
        countText: `${totalElemCount} elements`,
        visible: model.visible !== false,
        collapsed: isFileCollapsed,
        groups: sGroups
      });

      levelFiles.push({
        key: fileKey,
        fileType: 'model',
        model,
        name: fileName,
        icon: '📁',
        countText: `${totalElemCount} elements`,
        visible: model.visible !== false,
        collapsed: isFileCollapsed,
        groups: lGroups
      });

      elementFiles.push({
        key: fileKey,
        fileType: 'model',
        model,
        name: fileName,
        icon: '📁',
        countText: `${totalElemCount} elements`,
        visible: model.visible !== false,
        collapsed: isFileCollapsed,
        groups: eGroups
      });
    });

    // 2. Process Point Clouds
    if (hasPointClouds) {
      this.pointCloudManager.pointClouds.forEach((pco, idx) => {
        const pcName = pco.name || (pco.pcoGeometry && pco.pcoGeometry.url) || `Point Cloud ${idx + 1}`;
        const rawPts = typeof this.pointCloudManager.getPointCloudPointCount === 'function'
          ? this.pointCloudManager.getPointCloudPointCount(pco)
          : (pco.numPoints || (pco.pcoGeometry && pco.pcoGeometry.numPoints) || 0);
        const numPts = (rawPts || 0).toLocaleString();
        const fileKey = `pc_${idx}_${pcName}`;

        const pcFileItem = {
          key: fileKey,
          fileType: 'pointcloud',
          pco,
          name: pcName,
          icon: '☁️',
          countText: `${numPts} pts`,
          visible: pco.visible !== false,
          collapsed: true,
          groups: []
        };

        structureFiles.push(pcFileItem);
        levelFiles.push(pcFileItem);
        elementFiles.push(pcFileItem);
      });
    }

    this.virtualLevelsData = levelFiles;
    this.virtualElemData = elementFiles;

    if (this.virtualStructTree) {
      this.virtualStructTree.setGroups(structureFiles);
    } else {
      this.virtualStructTree = new VirtualBimTree({
        app: this,
        container: document.getElementById('tree-structures'),
        type: 'structures',
        groups: structureFiles
      });
    }

    if (this.virtualLevelsTree) {
      this.virtualLevelsTree.setGroups(levelFiles);
    }
    if (this.virtualElemTree) {
      this.virtualElemTree.setGroups(elementFiles);
    }
  }

  isModelElementMesh(obj) {
    if (!obj || !obj.isMesh) return false;
    if (obj === this.grid || obj === this.highlightBox) return false;
    if (obj.name === 'EdgeLines' || (obj.userData && obj.userData.isEdgeLine)) return false;
    if (obj.userData && (obj.userData.isGizmo || obj.userData.isStencilHelper || 
        obj.userData.isBoxHelper || obj.userData.isPlaneHelperMesh || 
        obj.userData.isPivotHelper || obj.userData.isHighlightOverlay || 
        obj.userData.isHoverOverlay || obj.userData.isCapHelper ||
        obj.userData.isGhostMesh || obj.userData.isMeasureMarker)) {
      return false;
    }
    let curr = obj.parent;
    while (curr) {
      if (curr.userData && (curr.userData.isStencilGroup || curr.userData.isGizmo || 
          curr.userData.isHighlightOverlay || curr.userData.isHoverOverlay || curr.userData.isMeasureMarker)) {
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
    
    // Ensure the element belongs to any loaded model
    const modelsList = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : []);
    if (modelsList.length > 0) {
      let isUnderModel = false;
      let currModel = obj;
      while (currModel) {
        if (modelsList.includes(currModel)) {
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
    if (this.virtualStructTree) this.virtualStructTree.syncSelection();
    if (this.virtualLevelsTree) this.virtualLevelsTree.syncSelection();
    if (this.virtualElemTree) this.virtualElemTree.syncSelection();
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

    this.selectedModel = null;
    this.selectedMesh = null;
    this.selectedMeshes = meshes;
    if (this.pointCloudManager) {
      this.pointCloudManager.isPointCloudSelected = false;
    }

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
    this.updateOffscreenIndicator();
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
    this.selectedModel = null;
    this.selectedMesh = mesh;
    this.selectedMeshes = [mesh];
    if (this.pointCloudManager) {
      this.pointCloudManager.isPointCloudSelected = false;
    }
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
    this.updateOffscreenIndicator();
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
    this.zoomToBox(box);
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
  
  clearSelection(keepPointCloud = false) {
    this._penetrateState = null;
    this.hidePenetratePickBadge();
    this.selectedModel = null;
    this.selectedMesh = null;
    this.selectedMeshes = [];
    this.lastClickPoint = null;
    if (this.highlightBox) this.highlightBox.visible = false;
    this.clearHighlightOverlay();
    this.clearHoverOverlay();
    if (this.compareEngine) {
      this.compareEngine.onSelectionCleared();
    }
    const hasModels = Boolean(this.loadedModels && this.loadedModels.length > 0);
    const hasPointClouds = Boolean(this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0);
    if (!keepPointCloud) {
      if (hasModels && this.pointCloudManager && this.pointCloudManager.isPointCloudSelected) {
        this.pointCloudManager.isPointCloudSelected = false;
      } else if (!hasModels && hasPointClouds && this.pointCloudManager) {
        this.pointCloudManager.isPointCloudSelected = true;
      }
    }
    this.syncTreeSelection();
    if (!keepPointCloud) {
      if (!hasModels && hasPointClouds && this.pointCloudManager && this.pointCloudManager.activePointCloud) {
        this.pointCloudManager.renderInspectorCard();
      } else {
        this.renderModelInfoInspector();
      }
    }
    this.updateOffscreenIndicator();
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
      btnFit.onclick = () => this.zoomToFit(false);
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
  
  async extractFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];
    const files = [];
    const rawFiles = Array.from(dataTransfer.files || []).filter(f => !(f.name || '').toLowerCase().endsWith('log.txt'));

    // CRITICAL: Synchronously capture handles and entries from dataTransfer.items
    // BEFORE any async await, because browsers purge dataTransfer.items & dataTransfer.files after synchronous event dispatch!
    const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    const handlePromises = [];
    const webkitEntries = [];

    for (const item of items) {
      if (item.kind === 'file') {
        if (typeof item.getAsFileSystemHandle === 'function') {
          try {
            handlePromises.push(item.getAsFileSystemHandle());
          } catch (e) {}
        }
        if (typeof item.webkitGetAsEntry === 'function') {
          try {
            const entry = item.webkitGetAsEntry();
            if (entry) webkitEntries.push(entry);
          } catch (e) {}
        }
      }
    }

    // 1. Try modern File System Access API (works on file:// in Chrome/Edge for both folders & files)
    if (handlePromises.length > 0) {
      try {
        const handles = await Promise.all(handlePromises);
        const validHandles = handles.filter(Boolean);
        if (validHandles.length > 0) {
          const readHandle = async (handle, path = '') => {
            if (!handle) return;
            if (handle.kind === 'file') {
              const file = await handle.getFile();
              if ((file.name || '').toLowerCase().endsWith('log.txt')) return;
              if (path) {
                try {
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: path + '/' + file.name,
                    writable: true,
                    configurable: true
                  });
                } catch (e) {}
              }
              files.push(file);
            } else if (handle.kind === 'directory') {
              const dirPath = path ? (path + '/' + handle.name) : handle.name;
              for await (const entry of handle.values()) {
                await readHandle(entry, dirPath);
              }
            }
          };

          for (const handle of validHandles) {
            await readHandle(handle);
          }

          if (files.length > 0) return files;
        }
      } catch (err) {
        console.warn('[BIMScope] getAsFileSystemHandle traversal failed, falling back:', err);
      }
    }

    // 2. Fallback to webkitGetAsEntry
    if (webkitEntries.length > 0) {
      const readEntry = (entry, path = '') => new Promise((resolve) => {
        if (!entry) return resolve();
        if (entry.isFile) {
          entry.file((f) => {
            if (!(f.name || '').toLowerCase().endsWith('log.txt')) {
              const relPath = path ? (path + '/' + f.name) : f.name;
              try {
                Object.defineProperty(f, 'webkitRelativePath', {
                  value: relPath,
                  writable: true,
                  configurable: true
                });
              } catch (e) {}
              files.push(f);
            }
            resolve();
          }, () => resolve());
        } else if (entry.isDirectory) {
          const dirPath = path ? (path + '/' + entry.name) : entry.name;
          const reader = entry.createReader();
          const readAll = () => {
            reader.readEntries(async (entries) => {
              if (!entries || entries.length === 0) {
                resolve();
              } else {
                for (const child of entries) {
                  await readEntry(child, dirPath);
                }
                readAll();
              }
            }, () => resolve());
          };
          readAll();
        } else {
          resolve();
        }
      });

      for (const entry of webkitEntries) {
        await readEntry(entry);
      }
      if (files.length > 0) return files;
      if (webkitEntries.some(e => e && e.isDirectory)) {
        dataTransfer._blockedDirectoryDrop = true;
        return [];
      }
    }

    // 3. Fallback to pre-captured standard DataTransfer.files
    return rawFiles;
  }

  // Performance Safeguard & File Handling
  handleFileInput(fileOrFiles, isAppend = false) {
    if (!fileOrFiles) return;
    const rawList = (fileOrFiles instanceof FileList || Array.isArray(fileOrFiles)) ? 
      Array.from(fileOrFiles) : [fileOrFiles];
    const fileList = rawList.filter(f => !(f.name || '').toLowerCase().endsWith('log.txt'));
    if (fileList.length === 0) return;

    // Check if raw point cloud (.las, .laz) dropped
    const lasFile = fileList.find(f => {
      const ext = (f.name || '').split('.').pop().toLowerCase();
      return ext === 'las' || ext === 'laz';
    });
    if (lasFile) {
      if (this.pointCloudManager) {
        this.pointCloudManager.showLasConverterModal(lasFile.name);
      }
      return;
    }

    // Check if converted Potree folder/files (metadata.json, octree.bin, or hierarchy.bin)
    const isPointCloudInput = fileList.some(f => {
      const name = (f.name || '').split('/').pop().split('\\').pop().toLowerCase();
      return name === 'metadata.json' || name === 'octree.bin' || name === 'hierarchy.bin';
    });
    if (isPointCloudInput) {
      if (this.pointCloudManager) {
        this.pointCloudManager.loadFromLocalFiles(fileList, isAppend);
      }
      return;
    }

    // Find primary model file (.ifc, .glb, .gltf, .fbx, .dae, .obj)
    const primaryFile = fileList.find(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ext === 'ifc' || ext === 'glb' || ext === 'gltf' || ext === 'fbx' || ext === 'dae' || ext === 'obj';
    }) || fileList[0];

    const sizeMB = (primaryFile.size / (1024 * 1024)).toFixed(1);
    
    // Performance Guard Check
    if (primaryFile.size > 150 * 1024 * 1024) {
      this.showSafetyWarning(primaryFile, sizeMB, 'critical', fileList, isAppend);
    } else if (primaryFile.size > 50 * 1024 * 1024) {
      this.showSafetyWarning(primaryFile, sizeMB, 'moderate', fileList, isAppend);
    } else {
      this.processFiles(primaryFile, fileList, false, isAppend);
    }
  }
  
  showSafetyWarning(primaryFile, sizeMB, level, allFiles = [], isAppend = false) {
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
      this.processFiles(primaryFile, allFiles, false, isAppend);
    };
    optBtn.onclick = () => {
      modal.classList.remove('active');
      this.processFiles(primaryFile, allFiles, true, isAppend);
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

  classifySceneGraphNodes(model, modelName, options = {}) {
    const {
      formatFlag = 'isGLTF',
      defaultCategory = 'Component',
      hasBIMKeywords = true,
      skipTextures = false
    } = options;

    if (model.updateMatrixWorld) model.updateMatrixWorld(true);

    let meshIndex = 0;
    const defaultStructFallback = (modelName || '').replace(/\.[^/.]+$/, '') || 'Model';
    const levelRegex = /(level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+|lvl\s*\d+|b\d+|1f|2f|3f|4f|5f|地下\s*\d+层|地上\s*\d+层|\d+层|\d+楼)/i;

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
            if (!m) return;
            m.side = THREE.DoubleSide;
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

        const box = new THREE.Box3().setFromObject(node);
        const size = new THREE.Vector3();
        box.getSize(size);

        const finalStructure = structure || (currentPath.length > 1 ? currentPath[0] : defaultStructFallback);

        const matNames = Array.isArray(node.material)
          ? node.material.map(m => (m && m.name) || '').join(' ')
          : ((node.material && node.material.name) || '');

        const allText = [
          node.name || '',
          (node.parent && node.parent.name) || '',
          structure || '',
          matNames,
          currentPath.join(' ')
        ].join(' ').toLowerCase();

        let category = defaultCategory;
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

        this.applyBIMMaterialStyling(node, category, allText);

        let level = 'Ground Level';
        const levelMatch = allText.match(levelRegex);
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
          [formatFlag]: true,
          nodePath: currentPath,
          _cachedWorldBox: box
        };
      }

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => classifyNode(child, structure, currentPath));
      }
    };

    classifyNode(model);
  }

  processFiles(mainFile, allFiles = [], optimize = false, isAppend = false) {
    this._isAppendNextFile = Boolean(isAppend);
    const ext = mainFile.name.split('.').pop().toLowerCase();
    this.showProgressModal(true, I18N.t('stageReading'), 10);
    
    // Build in-memory blob map for accompanying files (.bin, .png, .jpg, .tga, etc.)
    if (!this._activeBlobUrls) this._activeBlobUrls = new Set();
    const pendingBlobUrls = [];
    const blobMap = new Map();
    allFiles.forEach(f => {
      // Skip creating unneeded blob URL for standalone primary IFC/OBJ files
      if (f === mainFile && (ext === 'ifc' || ext === 'obj' || ext === 'dae')) return;
      try {
        const url = URL.createObjectURL(f);
        pendingBlobUrls.push(url);
        blobMap.set(f.name, url);
        blobMap.set(f.name.toLowerCase(), url);
      } catch (err) {
        console.warn("Could not create blob URL for file:", f.name, err);
      }
    });

    const registerPendingBlobs = () => {
      pendingBlobUrls.forEach(u => this._activeBlobUrls.add(u));
    };

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
          if (!isAppend) this.clearModel();
          registerPendingBlobs();
          
          const model = gltf.scene;
          model.name = mainFile.name;
          model.userData = model.userData || {};
          model.userData.fileName = mainFile.name;
          
          this.classifySceneGraphNodes(model, mainFile.name, {
            formatFlag: 'isGLTF',
            defaultCategory: 'Component',
            hasBIMKeywords: true
          });
          
          document.getElementById('project-title-text').textContent = mainFile.name;
          this.setModel(model, isAppend);

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
          if (this.modelInfoMap) this.modelInfoMap.set(model, this.currentModelInfo);
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
      reader.onload = async (e) => {
        const text = e.target.result;
        
        try {
          const rootGroup = await this.ifcParser.parseTextAsync(text, (percent, msg) => {
            this.updateProgress(msg, Math.round(percent * 100));
          });
          
          let meshCount = 0;
          rootGroup.traverse(o => { if (o.isMesh) meshCount++; });
          if (meshCount === 0) {
            this.showProgressModal(false);
            showToast("IFC parsed but 0 meshes could be generated", "warning");
            return;
          }
          
          if (!isAppend) this.clearModel();
          rootGroup.name = mainFile.name;
          rootGroup.userData = rootGroup.userData || {};
          rootGroup.userData.fileName = mainFile.name;
          const titleEl = document.getElementById('project-title-text');
          titleEl.textContent = mainFile.name;
          titleEl.title = mainFile.name;
          
          this.setModel(rootGroup, isAppend);

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
          if (this.modelInfoMap) this.modelInfoMap.set(rootGroup, this.currentModelInfo);
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
                this.loadFBXModel(arrayBuffer, fbxInfo, manager, mainFile.name, blobMap, skipTextures, mainFile, isAppend);
              }, 40);
            });
          } else {
            // All textures are embedded or already provided in blobMap
            this.updateProgress(I18N.t('stageMeshing'), 60);
            setTimeout(() => {
              this.loadFBXModel(arrayBuffer, fbxInfo, manager, mainFile.name, blobMap, false, mainFile, isAppend);
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
                this.loadDAEModel(daeText, daeInfo, manager, mainFile.name, blobMap, skipTextures, mainFile, isAppend);
              }, 40);
            });
          } else {
            // All textures are provided or no external textures required
            this.updateProgress(I18N.t('stageMeshing'), 60);
            setTimeout(() => {
              this.loadDAEModel(daeText, daeInfo, manager, mainFile.name, blobMap, false, mainFile, isAppend);
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
              this.loadOBJModel(objText, mtlText, manager, mainFile.name, blobMap, false, mainFile, isAppend);
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
            this.loadOBJModel(objText, null, manager, mainFile.name, blobMap, false, mainFile, isAppend);
          };
          reader.readAsText(mainFile);
        };
        mtlReader.readAsText(mtlFile);
      } else {
        reader.onload = (e) => {
          const objText = e.target.result;
          this.updateProgress(I18N.t('stageMeshing'), 60);
          setTimeout(() => {
            this.loadOBJModel(objText, null, manager, mainFile.name, blobMap, false, mainFile, isAppend);
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
      showToast("Unsupported file format. Please choose .IFC, .GLB, .FBX, .DAE, .OBJ, or Point Cloud (metadata.json + octree.bin)", "danger");
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
      if (!this._activeBlobUrls) this._activeBlobUrls = new Set();
      fileArr.forEach(f => {
        try {
          const url = URL.createObjectURL(f);
          this._activeBlobUrls.add(url);
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

  loadFBXModel(arrayBuffer, fbxInfo, manager, modelName, blobMap, skipTextures = false, primaryFile = null, isAppend = false) {
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

      this.classifySceneGraphNodes(model, modelName, {
        formatFlag: 'isFBX',
        defaultCategory: 'Component',
        hasBIMKeywords
      });

      if (!isAppend) this.clearModel();
      model.userData = model.userData || {};
      model.userData.fileName = modelName;
      if (blobMap && this._activeBlobUrls) {
        blobMap.forEach(url => this._activeBlobUrls.add(url));
      }
      document.getElementById('project-title-text').textContent = modelName;
      this.setModel(model, isAppend);

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
      if (this.modelInfoMap) this.modelInfoMap.set(model, this.currentModelInfo);
      if (this.modelInfoMap) this.modelInfoMap.set(model, this.currentModelInfo);
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

  loadDAEModel(daeText, daeInfo, manager, modelName, blobMap, skipTextures = false, primaryFile = null, isAppend = false) {
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

      this.classifySceneGraphNodes(model, modelName, {
        formatFlag: 'isDAE',
        defaultCategory: 'Component',
        hasBIMKeywords,
        skipTextures
      });

      if (!isAppend) this.clearModel();
      model.userData = model.userData || {};
      model.userData.fileName = modelName;
      if (blobMap && this._activeBlobUrls) {
        blobMap.forEach(url => this._activeBlobUrls.add(url));
      }
      document.getElementById('project-title-text').textContent = modelName;
      this.setModel(model, isAppend);

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

  loadOBJModel(objText, mtlText, manager, modelName, blobMap, skipTextures = false, primaryFile = null, isAppend = false) {
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

      this.classifySceneGraphNodes(model, modelName, {
        formatFlag: 'isOBJ',
        defaultCategory: 'Architectural / Generic',
        hasBIMKeywords
      });

      if (!isAppend) this.clearModel();
      model.userData = model.userData || {};
      model.userData.fileName = modelName;
      if (blobMap && this._activeBlobUrls) {
        blobMap.forEach(url => this._activeBlobUrls.add(url));
      }
      document.getElementById('project-title-text').textContent = modelName;
      this.setModel(model, isAppend);

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

      if (this.modelInfoMap) this.modelInfoMap.set(model, this.currentModelInfo);
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
      this.updateClippingBounds(false);
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
        this.solarEngine.setCenter(center, box);
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
    this.fitView(true);
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
    const models = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : []);
    models.forEach(m => {
      if (!m || m.visible === false) return;
      m.traverse(obj => {
        if (obj.visible !== false && this.isModelElementMesh(obj) && obj.geometry) {
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
    });
    const triEl = document.getElementById('stat-triangles-val');
    const vertEl = document.getElementById('stat-vertices-val');
    if (triEl) triEl.textContent = Math.round(triCount).toLocaleString();
    if (vertEl) vertEl.textContent = Math.round(vertCount).toLocaleString();
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
      this.pendingMouseMoveEvt = { clientX: e.clientX, clientY: e.clientY, shiftKey: Boolean(e.shiftKey), ctrlKey: Boolean(e.ctrlKey) };
      if (this.hoverRaf) return;

      this.hoverRaf = requestAnimationFrame(() => {
        this.hoverRaf = null;
        if (!this.pendingMouseMoveEvt) return;
        const { clientX, clientY, shiftKey, ctrlKey } = this.pendingMouseMoveEvt;
        this.pendingMouseMoveEvt = null;

        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Section Plane & Box Hover detection (shows gizmo on plane/box hover, grab cursor on gizmo hover; Shift pierces to back faces, Ctrl triggers central box gizmo)
        if (this.clippingEngine && this.clippingEngine.enabled && !this.isOrbiting && !this.isPanning && !this.isBoxSelecting && !this.isGizmoDragging) {
          const prevHoveredFace = this.clippingEngine.hoveredBoxFace;
          const prevHoveredGizmo = this.clippingEngine.hoveredGizmo;
          const prevPlaneVis = this.clippingEngine.planeGizmoGroup ? this.clippingEngine.planeGizmoGroup.visible : false;
          const prevFaceVis = this.clippingEngine.boxHoverFaceMesh ? this.clippingEngine.boxHoverFaceMesh.visible : false;
          const prevCentralVis = this.clippingEngine.boxCentralGizmoGroup ? this.clippingEngine.boxCentralGizmoGroup.visible : false;
          const isOverGizmo = this.clippingEngine.updateHover(this.raycaster, Boolean(shiftKey), Boolean(ctrlKey));
          const nowPlaneVis = this.clippingEngine.planeGizmoGroup ? this.clippingEngine.planeGizmoGroup.visible : false;
          const nowFaceVis = this.clippingEngine.boxHoverFaceMesh ? this.clippingEngine.boxHoverFaceMesh.visible : false;
          const nowCentralVis = this.clippingEngine.boxCentralGizmoGroup ? this.clippingEngine.boxCentralGizmoGroup.visible : false;
          if (
            prevHoveredFace !== this.clippingEngine.hoveredBoxFace ||
            prevHoveredGizmo !== this.clippingEngine.hoveredGizmo ||
            prevPlaneVis !== nowPlaneVis ||
            prevFaceVis !== nowFaceVis ||
            prevCentralVis !== nowCentralVis
          ) {
            this.needsRender = true;
            this.requestRender(150);
          }
          if (isOverGizmo) {
            this.canvas.style.cursor = 'grab';
            this.clearHoverOverlay();
            if (this.clippingEngine.hoveredGizmo?.userData?.part === 'boxCenterRotZ') {
              const curAzimuth = this.clippingEngine.getBoxRotationAzimuth();
              this.showSectionBoxRotTooltip(clientX, clientY, `${curAzimuth}°`);
            } else {
              this.hideSectionBoxRotTooltip();
            }
            return;
          } else {
            this.hideSectionBoxRotTooltip();
          }
        }

        const ctxMenu = document.getElementById('context-menu');
        if (this.isOrbiting || this.isPanning || this.isLeftInteracting || this.isBoxSelecting || this.isGizmoDragging || this.isDraggingMeasurePoint || (ctxMenu && ctxMenu.style.display === 'flex')) {
          this.clearHoverOverlay();
          return;
        }

        // Check hover on 3D Measurement Point Markers (draggable across all measure modes)
        if (this.measureMarkers && this.measureMarkers.length > 0) {
          const isDrawingMP = (this.isMeasureMode && this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.isDrawing && this.multiPointState.points.length >= 2);
          const markerHits = this.intersectMeasureMarkers(this.raycaster).filter(h => {
            if (isDrawingMP && h.marker && h.marker.mode === 'multipoint') {
              if (this.multiPointDrawDir === 'prepend' && h.marker.multiPointIndex === this.multiPointState.points.length - 1) return false;
              if (this.multiPointDrawDir !== 'prepend' && h.marker.multiPointIndex === 0) return false;
            }
            return true;
          });
          if (markerHits.length > 0) {
            this.setHoveredMeasureMarker(markerHits[0].marker);
            this.clearHoverOverlay();
            this.canvas.style.cursor = 'grab';
            return;
          } else if (this.hoveredMeasureMarker) {
            this.setHoveredMeasureMarker(null);
          }
        }

        // Target activeModel children instead of entire scene to skip auxiliary cameras/lights/compass
        const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : this.scene.children);
        const intersects = this.raycaster.intersectObjects(searchRoots, true);
        const valid = intersects.filter(hit => this.isPickableElement(hit.object));

        // Evaluate snap whenever snap engine is enabled (works both when hovering over mesh and on edge silhouette)
        let snapResult = null;
        if (this.snapEngine && this.snapEngine.enabled) {
          snapResult = this.snapEngine.resolveSnap(clientX, clientY, this.camera, valid.length > 0 ? valid[0] : null);
        }

        // Multi-point measurement: magnetic snap to closure point (Pt #1 in append, or Pt #last in prepend)
        let multiPointClosureSnap = null;
        if (this.isMeasureMode && this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.isDrawing && this.multiPointState.points.length >= 2 && this.multiPointInsertSegIdx < 0) {
          const targetPt = (this.multiPointDrawDir === 'prepend')
            ? this.multiPointState.points[this.multiPointState.points.length - 1]
            : this.multiPointState.points[0];
          const targetMarker = (this.multiPointDrawDir === 'prepend')
            ? this.multiPointState.markers[this.multiPointState.markers.length - 1]
            : this.multiPointState.markers[0];

          if (targetPt) {
            const proj = targetPt.clone().project(this.camera);
            if (proj.z <= 1.0 && proj.z >= -1.0) {
              const canvas = this.canvas || this.container;
              const rect = canvas.getBoundingClientRect();
              const cw = rect.width || this.container.clientWidth || 1;
              const ch = rect.height || this.container.clientHeight || 1;
              const sx = (proj.x * 0.5 + 0.5) * cw;
              const sy = (-proj.y * 0.5 + 0.5) * ch;
              const localX = clientX - rect.left;
              const localY = clientY - rect.top;
              const distPx = Math.hypot(localX - sx, localY - sy);
              if (distPx <= 35) {
                multiPointClosureSnap = {
                  point: targetPt.clone(),
                  normal: (targetMarker && targetMarker.normal) ? targetMarker.normal.clone() : new THREE.Vector3(0, 1, 0),
                  targetMesh: targetMarker ? targetMarker.group : null,
                  type: 'endpoint',
                  hudIcon: '□',
                  hudLabel: I18N.t('snapEndpoint') || 'Endpoint',
                  screenX: sx,
                  screenY: sy,
                  isClosureSnap: true
                };
                snapResult = multiPointClosureSnap;
                if (this.snapEngine) {
                  this.snapEngine.showIndicator(snapResult, this.camera, this.container);
                }
                this.isSnappedToClosurePoint = true;
              }
            }
          }
        }
        if (!multiPointClosureSnap) {
          this.isSnappedToClosurePoint = false;
        }

        let pcHoverHit = null;
        if (this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0) {
          pcHoverHit = this.pointCloudManager.raycast(this.raycaster, 25);
        }

        if (this.isMeasureMode) {
          this.clearHoverOverlay();
          this.canvas.style.cursor = 'crosshair';
          let effectiveHit = snapResult ? {
            point: snapResult.point,
            normal: snapResult.normal,
            object: snapResult.targetMesh || snapResult.pointCloud,
            pointCloud: snapResult.pointCloud || snapResult.targetMesh,
            face: { normal: snapResult.normal },
            isClosureSnap: !!(snapResult && snapResult.isClosureSnap)
          } : (pcHoverHit ? {
            point: pcHoverHit.point,
            normal: pcHoverHit.normal,
            object: pcHoverHit.pointCloud,
            pointCloud: pcHoverHit.pointCloud,
            face: { normal: pcHoverHit.normal }
          } : (valid.length > 0 ? valid[0] : null));

          if (effectiveHit) {
            const p = effectiveHit.point;
            if (!this.cachedCoordEls) {
              this.cachedCoordEls = {
                x: document.getElementById('coord-x'),
                y: document.getElementById('coord-y'),
                rl: document.getElementById('coord-rl')
              };
            }
            const c = this.formatMeasurePointCoords(p, effectiveHit.pointCloud);
            if (this.cachedCoordEls.x) this.cachedCoordEls.x.textContent = (c.x).toFixed(1);
            if (this.cachedCoordEls.y) this.cachedCoordEls.y.textContent = (c.y).toFixed(1);
            if (this.cachedCoordEls.rl) this.cachedCoordEls.rl.textContent = (c.z).toFixed(2);

            if (this.measureMode === 'point') {
              this.updateMeasurePointPreview(effectiveHit);
            } else if (this.measureMode === 'radius') {
              const radTarget = this.detectRadiusTarget(effectiveHit, clientX, clientY);
              if (radTarget) {
                this.updateRadiusPreview(radTarget);
              } else {
                this.hideRadiusPreview();
              }
            } else if (this.measureMode === 'distance') {
              if (this.pendingDistanceStart) {
                this.updateDistancePreview(effectiveHit);
              }
            } else if (this.measureMode === 'angle') {
              if (this.pendingAngleState) {
                this.updateAnglePreview(effectiveHit);
              }
            } else if (this.measureMode === 'multipoint') {
              if (this.multiPointInsertSegIdx >= 0) {
                this.updateMultiPointInsertPreview(effectiveHit);
              } else if (this.multiPointState && this.multiPointState.isDrawing) {
                this.updateMultiPointPreview(effectiveHit);
              }
            }
          } else {
            this.hideMeasurePointPreview();
            this.hideRadiusPreview();
            this.hideDistancePreview();
            this.hideAnglePreview();
            this.hideMultiPointPreview();
          }

          if (this.measureMode === 'multipoint' && this.multiPointState && !this.multiPointState.isDrawing) {
            this.checkMultiPointSegmentHover(clientX, clientY);
          }

          return;
        }

        if (valid.length > 0 || snapResult || pcHoverHit) {
          const hitMesh = snapResult ? (snapResult.targetMesh || snapResult.pointCloud) : (pcHoverHit ? pcHoverHit.pointCloud : valid[0].object);
          const p = snapResult ? snapResult.point : (pcHoverHit ? pcHoverHit.point : (valid.length > 0 ? valid[0].point : null));
          const pco = (snapResult && (snapResult.pointCloud || snapResult.targetMesh)) || (pcHoverHit && pcHoverHit.pointCloud) || (valid.length > 0 && valid[0].object && (valid[0].object.isPointCloud || valid[0].object.isPointCloudOctree) ? valid[0].object : null);
          
          if (!this.cachedCoordEls) {
            this.cachedCoordEls = {
              x: document.getElementById('coord-x'),
              y: document.getElementById('coord-y'),
              rl: document.getElementById('coord-rl')
            };
          }
          if (p) {
            const c = this.formatMeasurePointCoords(p, pco);
            if (this.cachedCoordEls.x) this.cachedCoordEls.x.textContent = (c.x).toFixed(1);
            if (this.cachedCoordEls.y) this.cachedCoordEls.y.textContent = (c.y).toFixed(1);
            if (this.cachedCoordEls.rl) this.cachedCoordEls.rl.textContent = (c.z).toFixed(2);
          }

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
          if (this.snapEngine) {
            this.snapEngine.hideIndicator();
          }
          this.hideMeasurePointPreview();
          this.hideRadiusPreview();
          this.canvas.style.cursor = this.isMeasureMode ? 'crosshair' : 'default';
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
      if (this.snapEngine) {
        this.snapEngine.hideIndicator();
      }
      this.hideMeasurePointPreview();
      this.hideRadiusPreview();
      this.hideDistancePreview();
      this.clearHoverOverlay();
      this.canvas.style.cursor = 'default';
    });

    const triggerLookAroundMode = (clientX, clientY) => {
      this.isLookAround = true;
      this.wasLookAround = true;
      this.suppressLeftClick = true;
      this.lookAroundStartX = clientX;
      this.lookAroundStartY = clientY;
      if (this.isLeftInteracting || this.isBoxSelecting) {
        this.isLeftInteracting = false;
        this.isBoxSelecting = false;
        this.hideMarqueeBox();
      }
      if (this.isOrbiting) {
        this.isOrbiting = false;
        if (this.pivotHelper) this.pivotHelper.visible = false;
      }
      this.isRightDragging = false;
    };

    // In Chromium/Edge, pressing a secondary button while a primary button is held down
    // does not dispatch a new pointerdown event, but DOES dispatch mousedown with buttons === 3!
    this.canvas.addEventListener('mousedown', (e) => {
      const isBoth = ((e.buttons & 1) !== 0) && ((e.buttons & 2) !== 0);
      const isShiftRight = e.shiftKey && ((e.buttons & 2) !== 0);
      if (isBoth || isShiftRight) {
        triggerLookAroundMode(e.clientX, e.clientY);
      }
    });

    // Pointer events: Left click (select/clear) & Left drag (box select)
    // Middle drag (pan) | Right click (context menu) & Right drag (orbit around pointed surface)
    this.canvas.addEventListener('pointerdown', (e) => {
      const isBoth = ((e.buttons & 1) !== 0) && ((e.buttons & 2) !== 0);
      const isShiftRight = e.shiftKey && (((e.buttons & 2) !== 0) || e.button === 2);
      if (isBoth || isShiftRight) {
        triggerLookAroundMode(e.clientX, e.clientY);
        return;
      }
      this.wasLookAround = false;
      this.suppressLeftClick = false;
      this.clearHoverOverlay();
      if (this.cameraTweenRaf) {
        cancelAnimationFrame(this.cameraTweenRaf);
        this.cameraTweenRaf = null;
        this.isNavigatingViewHistory = false;
      }
      if (e.button === 0) { // Left click / drag
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check if clicking Section Gizmo (highest priority; sync Shift/Ctrl state first so Shift+Click hits back faces and Ctrl hits central gizmo)
        if (this.clippingEngine && this.clippingEngine.enabled) {
          this.clippingEngine.updateHover(this.raycaster, Boolean(e.shiftKey), Boolean(e.ctrlKey));
          const gizmoHits = this.clippingEngine.intersectGizmos(this.raycaster);
          if (gizmoHits.length > 0) {
            this.isGizmoDragging = true;
            this.clippingEngine.startDrag(gizmoHits[0].object, this.raycaster, this.camera, e);
            this.canvas.style.cursor = 'grabbing';
            return;
          }
        }

        // Check if clicking or dragging a 3D Measurement Point Marker
        if (this.measureMarkers && this.measureMarkers.length > 0) {
          const isDrawingMP = (this.isMeasureMode && this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.isDrawing && this.multiPointState.points.length >= 2);
          const markerHits = this.intersectMeasureMarkers(this.raycaster).filter(h => {
            if (isDrawingMP && !e.shiftKey && h.marker && h.marker.mode === 'multipoint') {
              if (this.multiPointDrawDir === 'prepend' && h.marker.multiPointIndex === this.multiPointState.points.length - 1) return false;
              if (this.multiPointDrawDir !== 'prepend' && h.marker.multiPointIndex === 0) return false;
            }
            return true;
          });
          if (markerHits.length > 0) {
            const hitMarker = markerHits[0].marker;
            if (e.shiftKey) {
              if (hitMarker.mode === 'distance') {
                this.deleteDistanceMeasurement(hitMarker.distanceMeasurementId);
              } else if (hitMarker.mode === 'angle') {
                this.deleteAngleMeasurement(hitMarker.angleMeasurementId);
              } else if (hitMarker.mode === 'multipoint') {
                this.deleteMultiPointPoint(hitMarker.id);
              } else {
                this.deleteMeasurePoint(hitMarker.id);
              }
              return;
            }
            this.setActiveMeasurePoint(hitMarker.id);
            if (hitMarker.mode === 'distance') {
              this.activeDistanceMeasurementId = hitMarker.distanceMeasurementId;
              const distRec = this.distanceMeasurements.find(d => d.id === hitMarker.distanceMeasurementId);
              if (distRec) {
                this.lastMeasurementData = distRec.data;
                this.renderMeasurementResults();
              }
            } else if (hitMarker.mode === 'angle') {
              this.activeAngleMeasurementId = hitMarker.angleMeasurementId;
              const angleRec = this.angleMeasurements.find(a => a.id === hitMarker.angleMeasurementId);
              if (angleRec) {
                this.lastMeasurementData = angleRec.data;
                this.renderMeasurementResults();
              }
            } else if (hitMarker.mode === 'multipoint') {
              this.renderMeasurementResults();
            }
            this.isDraggingMeasurePoint = true;
            this.draggingMeasureMarker = hitMarker;
            this.setMeasureMarkerDragging(hitMarker, true);
            this.canvas.style.cursor = 'grabbing';
            return;
          }
        }

        if (this.isOrbiting || ((e.buttons & 2) !== 0)) {
          triggerLookAroundMode(e.clientX, e.clientY);
          return;
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
      } else if (e.button === 2) { // Right click: Orbit or Look Around
        if (this.isLeftInteracting || ((e.buttons & 1) !== 0) || e.shiftKey) {
          triggerLookAroundMode(e.clientX, e.clientY);
          return;
        }

        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        let hitPoint = null;
        let hitDist = Infinity;
        const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : []);
        if (searchRoots.length > 0) {
          const intersects = this.raycaster.intersectObjects(searchRoots, true);
          const valid = intersects.filter(h => this.isPickableElement(h.object));
          if (valid.length > 0) {
            hitPoint = valid[0].point;
            hitDist = valid[0].distance;
          }
        }
        if (this.pointCloudManager && this.pointCloudManager.pointClouds.length > 0) {
          const pcHit = this.pointCloudManager.raycast(this.raycaster, 25);
          if (pcHit && pcHit.point && pcHit.distance < hitDist) {
            hitPoint = pcHit.point;
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

        if (this.clippingEngine.activeDragGizmo?.userData?.part === 'boxCenterRotZ') {
          const rel = this.clippingEngine.lastRelativeRotDeg || 0;
          const sign = rel > 0 ? '+' : '';
          this.showSectionBoxRotTooltip(e.clientX, e.clientY, `${sign}${rel}°`);
        } else {
          this.hideSectionBoxRotTooltip();
        }
        return;
      }
      if (this.isDraggingMeasurePoint && this.draggingMeasureMarker) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : this.scene.children);
        const intersects = this.raycaster.intersectObjects(searchRoots, true);
        const valid = intersects.filter(hit => this.isPickableElement(hit.object));
        let effectiveHit = valid.length > 0 ? valid[0] : null;
        let isDragOppositeSnap = false;
        if (this.draggingMeasureMarker.mode === 'multipoint' && this.multiPointState && !this.multiPointState.isClosed && this.multiPointState.points.length >= 3) {
          const mIdx = this.draggingMeasureMarker.multiPointIndex;
          const totalPts = this.multiPointState.points.length;
          if (mIdx === 0 || mIdx === totalPts - 1) {
            const targetIdx = (mIdx === 0) ? (totalPts - 1) : 0;
            const targetPt = this.multiPointState.points[targetIdx];
            const targetMarker = this.multiPointState.markers[targetIdx];
            if (targetPt) {
              const proj = targetPt.clone().project(this.camera);
              if (proj.z <= 1.0 && proj.z >= -1.0) {
                const canvas = this.canvas || this.container;
                const rect = canvas.getBoundingClientRect();
                const cw = rect.width || this.container.clientWidth || 1;
                const ch = rect.height || this.container.clientHeight || 1;
                const sx = (proj.x * 0.5 + 0.5) * cw;
                const sy = (-proj.y * 0.5 + 0.5) * ch;
                const localX = e.clientX - rect.left;
                const localY = e.clientY - rect.top;
                const distPx = Math.hypot(localX - sx, localY - sy);
                if (distPx <= 35) {
                  isDragOppositeSnap = true;
                  effectiveHit = {
                    point: targetPt.clone(),
                    normal: (targetMarker && targetMarker.normal) ? targetMarker.normal.clone() : new THREE.Vector3(0, 1, 0),
                    object: targetMarker ? targetMarker.group : null,
                    face: { normal: (targetMarker && targetMarker.normal) ? targetMarker.normal.clone() : new THREE.Vector3(0, 1, 0) },
                    isDragClosureSnap: true
                  };
                  if (this.snapEngine) {
                    this.snapEngine.showIndicator({
                      point: targetPt,
                      type: 'endpoint',
                      hudIcon: '□',
                      hudLabel: I18N.t('snapEndpoint') || 'Endpoint',
                      screenX: sx,
                      screenY: sy
                    }, this.camera, this.container);
                  }
                  this.isDraggedSnapToOpposite = true;
                }
              }
            }
          }
        }
        if (!isDragOppositeSnap) {
          this.isDraggedSnapToOpposite = false;
        }

        if (!isDragOppositeSnap && this.snapEngine && this.snapEngine.enabled) {
          const snap = this.snapEngine.resolveSnap(e.clientX, e.clientY, this.camera, effectiveHit);
          if (snap) {
            effectiveHit = {
              object: snap.targetMesh,
              point: snap.point,
              normal: snap.normal,
              face: { normal: snap.normal }
            };
          }
        }
        if (effectiveHit) {
          if (this.draggingMeasureMarker.mode === 'distance') {
            this.updateDistanceEndpointFromHit(this.draggingMeasureMarker, effectiveHit);
          } else if (this.draggingMeasureMarker.mode === 'angle') {
            this.updateAnglePointFromHit(this.draggingMeasureMarker, effectiveHit);
          } else if (this.draggingMeasureMarker.mode === 'multipoint') {
            this.updateMultiPointFromHit(this.draggingMeasureMarker, effectiveHit);
          } else {
            this.updateMeasurePointFromHit(this.draggingMeasureMarker, effectiveHit);
          }
        }
        return;
      }
      const isChordedLookAround = (((e.buttons & 1) !== 0) && ((e.buttons & 2) !== 0)) || (e.shiftKey && ((e.buttons & 2) !== 0));
      if (isChordedLookAround) {
        if (!this.isLookAround) {
          triggerLookAroundMode(e.clientX, e.clientY);
        }
        const dx = e.clientX - this.lookAroundStartX;
        const dy = e.clientY - this.lookAroundStartY;
        if (Math.hypot(dx, dy) > 1) {
          this.lookAroundStartX = e.clientX;
          this.lookAroundStartY = e.clientY;
          this.lookAround(dx, dy);
        }
        return;
      }

      if (this.isLookAround) {
        if (((e.buttons & 2) === 0) && ((e.buttons & 1) === 0)) {
          this.isLookAround = false;
        } else {
          const dx = e.clientX - this.lookAroundStartX;
          const dy = e.clientY - this.lookAroundStartY;
          if (Math.hypot(dx, dy) > 1) {
            this.lookAroundStartX = e.clientX;
            this.lookAroundStartY = e.clientY;
            this.lookAround(dx, dy);
          }
          return;
        }
      }

      if (this.isLeftInteracting) {
        const dx = e.clientX - this.leftDownPos.x;
        const dy = e.clientY - this.leftDownPos.y;
        if (Math.hypot(dx, dy) > 4) {
          this.leftMoved = true;
          if (!this.isMeasureMode) {
            this.isBoxSelecting = true;
            this.updateMarqueeBox(this.boxSelectStartPos.x, this.boxSelectStartPos.y, e.clientX, e.clientY);
          }
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

    const handlePointerOrMouseUp = (e) => {
      if (this.isGizmoDragging) {
        this.isGizmoDragging = false;
        this.clippingEngine.endDrag();
        this.hideSectionBoxRotTooltip();
        if (this.clippingEngine && this.clippingEngine.enabled && this.camera) {
          this.raycaster.setFromCamera(this.mouse, this.camera);
          const isOverGizmo = this.clippingEngine.updateHover(this.raycaster, Boolean(e && e.shiftKey), Boolean(e && e.ctrlKey));
          this.canvas.style.cursor = isOverGizmo ? 'grab' : 'default';
        } else {
          this.canvas.style.cursor = 'default';
        }
        this.syncSectionUI();
        this.requestRender(100);
        return;
      }
      if (this.isDraggingMeasurePoint) {
        if (this.draggingMeasureMarker) {
          if (this.draggingMeasureMarker.mode === 'multipoint' && !this.multiPointState.isClosed && this.multiPointState.points.length >= 3) {
            const mIdx = this.draggingMeasureMarker.multiPointIndex;
            const totalPts = this.multiPointState.points.length;
            if (mIdx === 0 || mIdx === totalPts - 1) {
              const targetIdx = (mIdx === 0) ? (totalPts - 1) : 0;
              const targetPt = this.multiPointState.points[targetIdx];
              const curPt = this.draggingMeasureMarker.point;

              const canvas = this.canvas || this.container;
              const rect = canvas.getBoundingClientRect();
              const cw = rect.width || this.container.clientWidth || 1;
              const ch = rect.height || this.container.clientHeight || 1;
              const proj = targetPt.clone().project(this.camera);
              const sx = (proj.x * 0.5 + 0.5) * cw;
              const sy = (-proj.y * 0.5 + 0.5) * ch;
              const localX = e.clientX - rect.left;
              const localY = e.clientY - rect.top;
              const distPx = Math.hypot(localX - sx, localY - sy);

              if (this.isDraggedSnapToOpposite || distPx <= 40 || curPt.distanceTo(targetPt) < 0.6) {
                this.showMultiPointClosurePopover(targetPt, () => {
                  this.mergeAndCloseMultiPointOnDrag(mIdx, targetIdx);
                }, () => {
                  if (this.snapEngine) this.snapEngine.hideIndicator();
                });
              }
            }
          }
          this.setMeasureMarkerDragging(this.draggingMeasureMarker, false);
        }
        if (this.snapEngine && this.isDraggedSnapToOpposite) {
          this.snapEngine.hideIndicator();
        }
        this.isDraggedSnapToOpposite = false;
        this.isDraggingMeasurePoint = false;
        this.draggingMeasureMarker = null;
        this.canvas.style.cursor = this.isMeasureMode ? 'crosshair' : 'default';
        return;
      }
      const allButtonsReleased = (e.buttons === 0);

      if (this.isLookAround) {
        this.isLookAround = false;
        this.pushViewSnapshot();
      }

      if (allButtonsReleased || e.button === 0) {
        if (this.suppressLeftClick) {
          this.suppressLeftClick = false;
          this.isLeftInteracting = false;
          this.isBoxSelecting = false;
          this.hideMarqueeBox();
        } else if (this.isBoxSelecting && this.leftMoved) {
          this.isBoxSelecting = false;
          this.isLeftInteracting = false;
          this.hideMarqueeBox();
          this.finishBoxSelection(e, this.boxSelectStartPos.x, this.boxSelectStartPos.y, e.clientX, e.clientY);
        } else if (this.isLeftInteracting) {
          this.isLeftInteracting = false;
          this.isBoxSelecting = false;
          this.hideMarqueeBox();
          const rect = this.canvas.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            this.handleCanvasClick(e);
          }
        }
      }

      if (allButtonsReleased || e.button === 1) {
        if (this.isPanning) {
          const wasPanning = this.panMoved;
          this.isPanning = false;
          this.panMoved = false;
          if (wasPanning) {
            this.pushViewSnapshot();
          }
        }
      }

      if (allButtonsReleased || e.button === 2) {
        if (this.isOrbiting) {
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
          setTimeout(() => {
            this.isRightDragging = false;
          }, 0);
        } else {
          setTimeout(() => {
            this.isRightDragging = false;
          }, 0);
        }
      }

      if (allButtonsReleased) {
        this.isLeftInteracting = false;
        this.isBoxSelecting = false;
        this.hideMarqueeBox();
        this.isOrbiting = false;
        this.isPanning = false;
        this.isLookAround = false;
        this.suppressLeftClick = false;
        setTimeout(() => {
          this.isRightDragging = false;
        }, 0);
        if (this.wasLookAround) {
          setTimeout(() => {
            this.wasLookAround = false;
          }, 0);
        }
      }
    };

    window.addEventListener('pointerup', handlePointerOrMouseUp);
    window.addEventListener('mouseup', handlePointerOrMouseUp);
    window.addEventListener('pointercancel', handlePointerOrMouseUp);
    window.addEventListener('blur', () => {
      this.isLeftInteracting = false;
      this.isBoxSelecting = false;
      this.hideMarqueeBox();
      this.isOrbiting = false;
      this.isPanning = false;
      this.isLookAround = false;
      this.wasLookAround = false;
      this.suppressLeftClick = false;
    });

    // Double-click handler: finish Multi-Point measurement OR approach/pass-through component
    this.canvas.addEventListener('dblclick', (e) => {
      if (this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.isDrawing) {
        this.finishMultiPointMeasurement();
        return;
      }
      if (this.isMeasureMode) return;

      // Restore selection state so double-click does NOT alter component selection
      if (this._selectionBeforeClick) {
        if (this._selectionBeforeClick.selectedMeshes && this._selectionBeforeClick.selectedMeshes.length > 1) {
          this.selectElements(this._selectionBeforeClick.selectedMeshes);
        } else if (this._selectionBeforeClick.selectedMesh) {
          this.selectElement(this._selectionBeforeClick.selectedMesh);
        } else {
          this.clearSelection();
        }
        this._selectionBeforeClick = null;
      }

      this.handleDoubleClickedComponent(e);
    });

    // Custom 3D context menu on right click (prevent browser context menu)
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.wasLookAround) {
        this.wasLookAround = false;
        this.isRightDragging = false;
        return;
      }
      const wasDragging = this.isRightDragging;
      this.isRightDragging = false;
      if (!wasDragging) {
        this.handleContextMenu(e);
      }
    });

    // Wheel Zoom: Precise CAD / Forge Zoom-to-Cursor (100% reversible along cursor ray)
    this.canvas.addEventListener('wheel', (e) => {
      this.handleWheelZoom(e);
    }, { passive: false });
    
    // Drag & Drop
    // Drag & Drop Dual Mode (Single when empty, Split into Top/Bottom when files present)
    const dropzone = document.getElementById('dropzone-overlay');
    const dropSingle = document.getElementById('dropzone-single');
    const dropSplit = document.getElementById('dropzone-split-container');
    const zoneTop = document.getElementById('dropzone-zone-top');
    const zoneBottom = document.getElementById('dropzone-zone-bottom');

    let isSplitDropMode = false;

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

        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }

        if (!dropzone) return;

        const hasContent = (this.loadedModels && this.loadedModels.length > 0) || 
                           (this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0) ||
                           Boolean(this.activeModel);

        dropzone.classList.add('active');

        if (hasContent && dropSplit && dropSingle) {
          isSplitDropMode = true;
          dropSingle.style.display = 'none';
          dropSplit.style.display = 'flex';

          const rect = dropzone.getBoundingClientRect();
          const midY = (rect && rect.height > 0) ? (rect.top + rect.height / 2) : (window.innerHeight / 2);
          if (e.clientY < midY) {
            if (zoneTop) zoneTop.classList.add('active-zone');
            if (zoneBottom) zoneBottom.classList.remove('active-zone');
          } else {
            if (zoneTop) zoneTop.classList.remove('active-zone');
            if (zoneBottom) zoneBottom.classList.add('active-zone');
          }
        } else {
          isSplitDropMode = false;
          if (dropSingle) dropSingle.style.display = 'flex';
          if (dropSplit) dropSplit.style.display = 'none';
        }
      });
    });

    ['dragleave', 'dragend'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
          if (dropzone) dropzone.classList.remove('active');
          if (zoneTop) zoneTop.classList.remove('active-zone');
          if (zoneBottom) zoneBottom.classList.remove('active-zone');
        }
      });
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = dropzone ? dropzone.getBoundingClientRect() : null;
      const midY = (rect && rect.height > 0) ? (rect.top + rect.height / 2) : (window.innerHeight / 2);
      const hasContent = (this.loadedModels && this.loadedModels.length > 0) || 
                         (this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0) ||
                         Boolean(this.activeModel);
      const isAppend = Boolean((isSplitDropMode || hasContent) && (e.clientY >= midY));

      if (dropzone) dropzone.classList.remove('active');
      if (zoneTop) zoneTop.classList.remove('active-zone');
      if (zoneBottom) zoneBottom.classList.remove('active-zone');

      // If compare modal or texture modal is open, do not load into main viewport
      if (this.compareEngine && this.compareEngine.isModalOpen()) return;
      const texModal = document.getElementById('texture-modal');
      if (texModal && texModal.classList.contains('active')) return;

      if (e.dataTransfer) {
        // Synchronously snapshot dataTransfer.files BEFORE any await!
        const rawFiles = Array.from(e.dataTransfer.files || []).filter(f => !(f.name || '').toLowerCase().endsWith('log.txt'));
        let extractedFiles = [];
        try {
          extractedFiles = await this.extractFilesFromDataTransfer(e.dataTransfer);
        } catch (err) {
          console.warn('[BIMScope] Directory extraction failed, falling back to files:', err);
        }
        if (e.dataTransfer._blockedDirectoryDrop) {
          if (this.pointCloudManager) this.pointCloudManager.showMissingBinModal(isAppend);
          return;
        }
        const finalFiles = (extractedFiles && extractedFiles.length > 0) ? extractedFiles : rawFiles;
        if (finalFiles && finalFiles.length > 0) {
          this.handleFileInput(finalFiles, isAppend);
        }
      }
    });
  }

  handleContextMenu(e) {
    // Right click does not alter or change element selection:
    // It strictly preserves the existing selection (if any), ensuring actions
    // apply only to intentionally selected elements without cursor offset misclicks.
    // If no element is selected, it displays the root/global context menu.
    this.clearHoverOverlay();

    // Detect if right-clicking on a measurement point marker or on a model / point cloud surface
    this.contextMenuMeasureMarker = null;
    this.contextMenuMeasureSurfaceHit = null;
    this.contextMenuHitPoint = null;
    if (this.canvas && this.camera) {
      this.camera.updateMatrixWorld(true);
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      this.contextMenuHitPoint = this.pick3DPointAtRay(this.raycaster);

      if (this.measureMarkers && this.measureMarkers.length > 0) {
        const markerHits = this.intersectMeasureMarkers(this.raycaster);
        if (markerHits.length > 0) {
          this.contextMenuMeasureMarker = markerHits[0].marker;
        }
      }

      this.contextMenuMultiPointSegIdx = -1;
      if (!this.contextMenuMeasureMarker && this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.segments && this.multiPointState.segments.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX;
        const my = e.clientY;
        const cw = this.container.clientWidth || 1;
        const ch = this.container.clientHeight || 1;
        let bestDistSq = Infinity;
        let bestSegIdx = -1;
        const p0Proj = new THREE.Vector3();
        const p1Proj = new THREE.Vector3();

        for (let i = 0; i < this.multiPointState.segments.length; i++) {
          const seg = this.multiPointState.segments[i];
          const p0 = this.multiPointState.points[seg.from];
          const p1 = this.multiPointState.points[seg.to];
          if (!p0 || !p1) continue;

          p0Proj.copy(p0).project(this.camera);
          p1Proj.copy(p1).project(this.camera);
          if ((p0Proj.z > 1.0 || p0Proj.z < -1.0) && (p1Proj.z > 1.0 || p1Proj.z < -1.0)) continue;

          const s0x = rect.left + (p0Proj.x * 0.5 + 0.5) * cw;
          const s0y = rect.top + (-p0Proj.y * 0.5 + 0.5) * ch;
          const s1x = rect.left + (p1Proj.x * 0.5 + 0.5) * cw;
          const s1y = rect.top + (-p1Proj.y * 0.5 + 0.5) * ch;

          const dx = s1x - s0x;
          const dy = s1y - s0y;
          const lenSq = dx * dx + dy * dy;
          let dSq;
          if (lenSq === 0) {
            dSq = (mx - s0x) ** 2 + (my - s0y) ** 2;
          } else {
            let t = Math.max(0, Math.min(1, ((mx - s0x) * dx + (my - s0y) * dy) / lenSq));
            dSq = (mx - (s0x + t * dx)) ** 2 + (my - (s0y + t * dy)) ** 2;
          }

          if (dSq < 256 && dSq < bestDistSq) {
            bestDistSq = dSq;
            bestSegIdx = i;
          }
        }
        if (bestSegIdx >= 0) {
          this.contextMenuMultiPointSegIdx = bestSegIdx;
        }
      }

      if (!this.contextMenuMeasureMarker && this.isMeasureMode && this.measureMode === 'point') {
        const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : this.scene.children);
        const intersects = this.raycaster.intersectObjects(searchRoots, true);
        const valid = intersects.filter(hit => this.isPickableElement(hit.object));
        if (valid.length > 0) {
          this.contextMenuMeasureSurfaceHit = valid[0];
        }
      }
    }

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
    const itemEnableSecPlaneHere = document.getElementById('menu-enable-sec-plane-here');
    const itemEnableSecPlaneHereText = document.getElementById('menu-enable-sec-plane-here-text');
    const itemEnableSecBoxHere = document.getElementById('menu-enable-sec-box-here');
    const itemEnableSecBoxHereText = document.getElementById('menu-enable-sec-box-here-text');
    const itemMoveSecHere = document.getElementById('menu-move-sec-here');
    const itemMoveSecHereText = document.getElementById('menu-move-sec-here-text');
    const itemDivider = document.getElementById('menu-selected-divider');

    // Group items and file items - hide on single selection context menu
    ['menu-group-isolate', 'menu-group-hide', 'menu-group-zoom', 'menu-group-sec-box',
     'menu-file-divider', 'menu-file-zoom', 'menu-file-isolate', 'menu-file-hide', 'menu-file-remove'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const isSecEnabled = Boolean(this.clippingEngine && this.clippingEngine.enabled);
    const isSecBox = isSecEnabled && this.clippingEngine.mode === 'box';
    const hasHitPoint = Boolean(this.contextMenuHitPoint);

    if (itemEnableSecPlaneHereText) itemEnableSecPlaneHereText.textContent = I18N.t('menuEnableSectionPlaneHere');
    if (itemEnableSecBoxHereText) itemEnableSecBoxHereText.textContent = I18N.t('menuEnableSectionBoxHere');

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
        if (itemEnableSecPlaneHere) itemEnableSecPlaneHere.style.display = 'none';
        if (itemEnableSecBoxHere) itemEnableSecBoxHere.style.display = 'none';
        if (itemMoveSecHere) {
          itemMoveSecHere.style.display = 'flex';
          if (itemMoveSecHereText) {
            itemMoveSecHereText.textContent = isSecBox ? 
              I18N.t('menuMoveSectionBoxToHere') : I18N.t('menuMoveSectionPlaneToHere');
          }
        }
      } else {
        if (itemMoveSecHere) itemMoveSecHere.style.display = 'none';
        if (hasHitPoint) {
          if (itemEnableSecPlaneHere) itemEnableSecPlaneHere.style.display = 'flex';
          if (itemEnableSecBoxHere) itemEnableSecBoxHere.style.display = 'flex';
          if (itemSectionBox) itemSectionBox.style.display = 'flex';
        } else {
          if (itemEnableSecPlaneHere) itemEnableSecPlaneHere.style.display = 'none';
          if (itemEnableSecBoxHere) itemEnableSecBoxHere.style.display = 'none';
          if (itemSectionBox) itemSectionBox.style.display = 'flex';
        }
      }
    } else {
      if (itemShowAll) itemShowAll.style.display = 'flex';
      if (itemZoomGlobal) itemZoomGlobal.style.display = 'flex';
      if (itemResetView) itemResetView.style.display = 'flex';

      if (itemHide) itemHide.style.display = 'none';
      if (itemIsolate) itemIsolate.style.display = 'none';
      if (itemZoomTo) itemZoomTo.style.display = 'none';
      if (itemSectionBox) itemSectionBox.style.display = 'none';

      if (isSecEnabled && hasHitPoint) {
        if (itemDivider) itemDivider.style.display = 'block';
        if (itemEnableSecPlaneHere) itemEnableSecPlaneHere.style.display = 'none';
        if (itemEnableSecBoxHere) itemEnableSecBoxHere.style.display = 'none';
        if (itemMoveSecHere) {
          itemMoveSecHere.style.display = 'flex';
          if (itemMoveSecHereText) {
            itemMoveSecHereText.textContent = isSecBox ? 
              I18N.t('menuMoveSectionBoxToHere') : I18N.t('menuMoveSectionPlaneToHere');
          }
        }
      } else if (!isSecEnabled && hasHitPoint) {
        if (itemDivider) itemDivider.style.display = 'block';
        if (itemMoveSecHere) itemMoveSecHere.style.display = 'none';
        if (itemEnableSecPlaneHere) itemEnableSecPlaneHere.style.display = 'flex';
        if (itemEnableSecBoxHere) itemEnableSecBoxHere.style.display = 'flex';
      } else {
        if (itemDivider) itemDivider.style.display = 'none';
        if (itemMoveSecHere) itemMoveSecHere.style.display = 'none';
        if (itemEnableSecPlaneHere) itemEnableSecPlaneHere.style.display = 'none';
        if (itemEnableSecBoxHere) itemEnableSecBoxHere.style.display = 'none';
      }
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

    const itemDisableSec = document.getElementById('menu-disable-sectioning');
    const itemDisableSecText = document.getElementById('menu-disable-sectioning-text');
    if (itemDisableSec) {
      itemDisableSec.style.display = isSecEnabled ? 'flex' : 'none';
      if (itemDisableSecText) itemDisableSecText.textContent = I18N.t('menuDisableSectioning');
    }

    if (itemSecDivider) {
      itemSecDivider.style.display = (isSecBox || isSecEnabled) ? 'block' : 'none';
    }

    // Measurement Context Menu Items (Point Measure Mode / Marker Right-Click)
    const itemMeasureDivider = document.getElementById('menu-measure-divider');
    const itemMeasureCreate = document.getElementById('menu-measure-create-point');
    const itemMeasureDeletePt = document.getElementById('menu-measure-delete-point');
    const itemMeasureDeleteMeas = document.getElementById('menu-measure-delete-measurement');
    const itemMeasureInsert = document.getElementById('menu-measure-insert-point');
    const itemMeasurePrepend = document.getElementById('menu-measure-prepend-point');
    const itemMeasureAppend = document.getElementById('menu-measure-append-point');
    const itemMeasureBreak = document.getElementById('menu-measure-break-closure');

    const canCreateMeasurePt = !!(this.isMeasureMode && this.measureMode === 'point' && !this.contextMenuMeasureMarker && this.contextMenuMeasureSurfaceHit);
    const marker = this.contextMenuMeasureMarker;
    const isMultiPtMarker = !!(marker && marker.mode === 'multipoint' && this.multiPointState && this.multiPointState.markers);
    const isClosedPolyline = !!(this.multiPointState && this.multiPointState.isClosed);
    const canDeleteMeasurePt = !!(marker && (marker.mode === 'point' || marker.mode === 'multipoint'));
    const canDeleteMeasurement = !!(marker && (marker.mode === 'distance' || marker.mode === 'angle'));

    const canInsertPt = !!(this.contextMenuMultiPointSegIdx >= 0 && this.multiPointState && !this.multiPointState.isDrawing && this.multiPointInsertSegIdx < 0);
    const canPrependPt = !!(isMultiPtMarker && marker.multiPointIndex === 0 && !this.multiPointState.isDrawing && this.multiPointInsertSegIdx < 0 && !isClosedPolyline);
    const canAppendPt = !!(isMultiPtMarker && marker.multiPointIndex === (this.multiPointState.markers.length - 1) && !this.multiPointState.isDrawing && this.multiPointInsertSegIdx < 0 && !isClosedPolyline);
    const canBreakClosure = !!(isMultiPtMarker && isClosedPolyline);

    if (itemMeasureCreate) itemMeasureCreate.style.display = canCreateMeasurePt ? 'flex' : 'none';
    if (itemMeasureDeletePt) itemMeasureDeletePt.style.display = canDeleteMeasurePt ? 'flex' : 'none';
    if (itemMeasureDeleteMeas) itemMeasureDeleteMeas.style.display = canDeleteMeasurement ? 'flex' : 'none';
    if (itemMeasureInsert) itemMeasureInsert.style.display = canInsertPt ? 'flex' : 'none';
    if (itemMeasurePrepend) itemMeasurePrepend.style.display = canPrependPt ? 'flex' : 'none';
    if (itemMeasureAppend) itemMeasureAppend.style.display = canAppendPt ? 'flex' : 'none';
    if (itemMeasureBreak) itemMeasureBreak.style.display = canBreakClosure ? 'flex' : 'none';
    if (itemMeasureDivider) {
      itemMeasureDivider.style.display = (canCreateMeasurePt || canDeleteMeasurePt || canDeleteMeasurement || canInsertPt || canPrependPt || canAppendPt || canBreakClosure) ? 'block' : 'none';
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

  showFileContextMenu(clientX, clientY, fileItem) {
    const menu = document.getElementById('context-menu');
    if (!menu || !fileItem) return;

    this.activeContextMenuFile = fileItem;

    // Hide all element / group / section / measure items
    const allOtherIds = [
      'menu-show-all', 'menu-zoom-global', 'menu-reset-view', 'menu-selected-divider', 'menu-hide', 'menu-isolate', 'menu-zoom-to', 'menu-section-box',
      'menu-enable-sec-plane-here', 'menu-enable-sec-box-here', 'menu-move-sec-here', 'menu-group-isolate', 'menu-group-hide', 'menu-group-zoom', 'menu-group-sec-box',
      'menu-sectioning-divider', 'menu-toggle-section-box', 'menu-reset-sec-rot', 'menu-disable-sectioning',
      'menu-measure-divider', 'menu-measure-create-point', 'menu-measure-delete-point', 'menu-measure-delete-measurement',
      'menu-measure-insert-point', 'menu-measure-prepend-point', 'menu-measure-append-point', 'menu-measure-break-closure'
    ];
    allOtherIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Show file action items
    ['menu-file-divider', 'menu-file-zoom', 'menu-file-isolate', 'menu-file-hide', 'menu-file-remove'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'flex';
    });

    const isVis = fileItem.visible !== false;
    const hideTextEl = document.getElementById('menu-file-hide-text') || document.getElementById('menu-file-hide');
    if (hideTextEl) {
      hideTextEl.textContent = isVis ? (typeof I18N !== 'undefined' ? I18N.t('menuFileHide') : 'Hide File') : (typeof I18N !== 'undefined' ? I18N.t('showAll') : 'Show File');
    }

    const container = document.getElementById('viewport-container') || document.body;
    const vRect = container.getBoundingClientRect();
    let left = clientX - vRect.left;
    let top = clientY - vRect.top;

    menu.style.display = 'flex';
    const mWidth = menu.offsetWidth || 190;
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

    // Hide file actions
    ['menu-file-divider', 'menu-file-zoom', 'menu-file-isolate', 'menu-file-hide', 'menu-file-remove'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Hide single-element and root empty selection items
    ['menu-show-all', 'menu-zoom-global', 'menu-reset-view', 'menu-selected-divider', 'menu-hide', 'menu-isolate', 'menu-zoom-to', 'menu-section-box', 'menu-enable-sec-plane-here', 'menu-enable-sec-box-here'].forEach(id => {
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
    const itemDisableSec = document.getElementById('menu-disable-sectioning');
    const itemDisableSecText = document.getElementById('menu-disable-sectioning-text');
    if (itemDisableSec) {
      itemDisableSec.style.display = isSecEnabled ? 'flex' : 'none';
      if (itemDisableSecText) itemDisableSecText.textContent = I18N.t('menuDisableSectioning');
    }
    if (itemSecDivider) itemSecDivider.style.display = (isSecBox || isSecEnabled) ? 'block' : 'none';

    ['menu-measure-divider', 'menu-measure-create-point', 'menu-measure-delete-point'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

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

    // Global keyboard handling (Escape, Enter, Alt+Arrows, CAD shortcuts) centralized in handleGlobalKeyDown()

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
        this.zoomToFit(false);
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

    const btnEnableSecPlaneHere = document.getElementById('menu-enable-sec-plane-here');
    if (btnEnableSecPlaneHere) {
      btnEnableSecPlaneHere.onclick = () => {
        this.hideContextMenu();
        if (this.contextMenuHitPoint) {
          this.enableSectionPlaneAtPoint(this.contextMenuHitPoint);
        }
      };
    }

    const btnEnableSecBoxHere = document.getElementById('menu-enable-sec-box-here');
    if (btnEnableSecBoxHere) {
      btnEnableSecBoxHere.onclick = () => {
        this.hideContextMenu();
        if (this.contextMenuHitPoint) {
          this.enableSectionBoxAtPoint(this.contextMenuHitPoint);
        }
      };
    }

    const btnMoveSecHere = document.getElementById('menu-move-sec-here');
    if (btnMoveSecHere) {
      btnMoveSecHere.onclick = () => {
        this.hideContextMenu();
        if (this.contextMenuHitPoint) {
          this.moveSectionToPoint(this.contextMenuHitPoint);
          return;
        }
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

    const btnDisableSec = document.getElementById('menu-disable-sectioning');
    if (btnDisableSec) {
      btnDisableSec.onclick = () => {
        this.hideContextMenu();
        if (this.clippingEngine && this.clippingEngine.enabled) {
          this.clippingEngine.enabled = false;
          this.clippingEngine.update();
          const chkActive = document.getElementById('sec-active-chk');
          if (chkActive) chkActive.checked = false;
          if (this.selectedMeshes && this.selectedMeshes.length > 0) {
            const remaining = this.selectedMeshes.filter(m => this.isPickableElement(m));
            if (remaining.length === 0) this.clearSelection();
            else if (remaining.length !== this.selectedMeshes.length) this.selectElements(remaining);
          } else if (this.selectedMesh && !this.isPickableElement(this.selectedMesh)) {
            this.clearSelection();
          }
          this.syncSectionUI();
          this.needsRender = true;
          this.requestRender(150);
          showToast(I18N.t('secDisabledMsg'), 'info');
        }
      };
    }

    const btnMeasureCreate = document.getElementById('menu-measure-create-point');
    if (btnMeasureCreate) {
      btnMeasureCreate.onclick = () => {
        const hit = this.contextMenuMeasureSurfaceHit;
        this.hideContextMenu();
        if (hit) {
          this.createMeasurePoint(hit);
        }
      };
    }

    const btnMeasureDelete = document.getElementById('menu-measure-delete-point');
    if (btnMeasureDelete) {
      btnMeasureDelete.onclick = () => {
        const marker = this.contextMenuMeasureMarker;
        this.hideContextMenu();
        if (marker) {
          if (marker.mode === 'multipoint') {
            this.deleteMultiPointPoint(marker.id);
          } else {
            this.deleteMeasurePoint(marker.id);
          }
        }
      };
    }

    const btnMeasureDeleteMeas = document.getElementById('menu-measure-delete-measurement');
    if (btnMeasureDeleteMeas) {
      btnMeasureDeleteMeas.onclick = () => {
        const marker = this.contextMenuMeasureMarker;
        this.hideContextMenu();
        if (marker) {
          if (marker.mode === 'distance') {
            this.deleteDistanceMeasurement(marker.distanceMeasurementId);
          } else if (marker.mode === 'angle') {
            this.deleteAngleMeasurement(marker.angleMeasurementId);
          }
        }
      };
    }

    const btnMeasureInsert = document.getElementById('menu-measure-insert-point');
    if (btnMeasureInsert) {
      btnMeasureInsert.onclick = () => {
        const segIdx = this.contextMenuMultiPointSegIdx;
        this.hideContextMenu();
        if (segIdx >= 0) {
          this.startMultiPointInsert(segIdx);
        }
      };
    }

    const btnMeasurePrepend = document.getElementById('menu-measure-prepend-point');
    if (btnMeasurePrepend) {
      btnMeasurePrepend.onclick = () => {
        this.hideContextMenu();
        this.startMultiPointPrepend();
      };
    }

    const btnMeasureAppend = document.getElementById('menu-measure-append-point');
    if (btnMeasureAppend) {
      btnMeasureAppend.onclick = () => {
        this.hideContextMenu();
        this.startMultiPointAppend();
      };
    }

    const btnMeasureBreak = document.getElementById('menu-measure-break-closure');
    if (btnMeasureBreak) {
      btnMeasureBreak.onclick = () => {
        const marker = this.contextMenuMeasureMarker;
        this.hideContextMenu();
        if (marker) {
          this.breakMultiPointClosure(marker.id);
        }
      };
    }

    // File Context Menu Event Handlers
    const btnFileZoom = document.getElementById('menu-file-zoom');
    if (btnFileZoom) {
      btnFileZoom.onclick = () => {
        this.hideContextMenu();
        const f = this.activeContextMenuFile;
        if (!f) return;
        if (f.fileType === 'pointcloud' && f.pco && this.pointCloudManager) {
          this.pointCloudManager.fitPointCloudView(f.pco);
        } else if (f.model) {
          this.zoomToModel(f.model);
        }
      };
    }

    const btnFileIsolate = document.getElementById('menu-file-isolate');
    if (btnFileIsolate) {
      btnFileIsolate.onclick = () => {
        this.hideContextMenu();
        const target = this.activeContextMenuFile;
        if (!target) return;
        if (this.loadedModels) {
          this.loadedModels.forEach(m => {
            const isTarget = (m === target.model);
            m.visible = isTarget;
            m.traverse(obj => {
              if (this.isModelElementMesh(obj)) obj.visible = isTarget;
            });
          });
        }
        if (this.pointCloudManager && this.pointCloudManager.pointClouds) {
          this.pointCloudManager.pointClouds.forEach(pco => {
            pco.visible = (pco === target.pco);
          });
        }
        this.buildHierarchyTree();
        if (this._wakeRender) this._wakeRender(200);
      };
    }

    const btnFileHide = document.getElementById('menu-file-hide');
    if (btnFileHide) {
      btnFileHide.onclick = () => {
        this.hideContextMenu();
        const f = this.activeContextMenuFile;
        if (!f) return;
        const newVis = !(f.visible !== false);
        f.visible = newVis;
        if (f.fileType === 'pointcloud' && f.pco) {
          f.pco.visible = newVis;
        } else if (f.model) {
          f.model.visible = newVis;
          f.model.traverse(obj => {
            if (this.isModelElementMesh(obj)) obj.visible = newVis;
          });
        }
        this.buildHierarchyTree();
        if (this._wakeRender) this._wakeRender(200);
      };
    }

    const btnFileRemove = document.getElementById('menu-file-remove');
    if (btnFileRemove) {
      btnFileRemove.onclick = () => {
        this.hideContextMenu();
        const f = this.activeContextMenuFile;
        if (!f) return;
        if (f.fileType === 'pointcloud' && f.pco && this.pointCloudManager) {
          this.pointCloudManager.removePointCloud(f.pco);
        } else if (f.model) {
          this.removeModel(f.model);
        }
        this.activeContextMenuFile = null;
      };
    }
  }

  // ==========================================
  // KEYBOARD SHORTCUTS SYSTEM (STANDARD / REVIT)
  // ==========================================
  initShortcutsSystem() {
    this.shortcutsCapsuleEl = document.getElementById('shortcuts-key-capsule');
    this.shortcutsCapsuleKeysEl = document.getElementById('shortcuts-capsule-keys');
    this.shortcutsCandidatePanelEl = document.getElementById('shortcuts-candidate-panel');
    this.shortcutsCandidateTimer = null;
    this.shortcutsHudModalEl = document.getElementById('shortcuts-hud-modal');

    // Dismiss candidate panel when clicking outside
    document.addEventListener('pointerdown', (e) => {
      if (this.shortcutsCandidatePanelEl && this.shortcutsCandidatePanelEl.classList.contains('visible')) {
        if (!this.shortcutsCandidatePanelEl.contains(e.target) && (!this.shortcutsCapsuleEl || !this.shortcutsCapsuleEl.contains(e.target))) {
          this.hideShortcutsCandidates();
          this.hideShortcutsCapsule();
          this.resetShortcutsBuffer();
        }
      }
    });

    // 1. Inspector Preference Dual-Button Toggle (Single Key vs Two Key)
    const btnSingle = document.getElementById('pref-shortcuts-btn-single');
    const btnTwo = document.getElementById('pref-shortcuts-btn-two');
    if (btnSingle) {
      btnSingle.addEventListener('click', () => this.toggleShortcutsMode());
    }
    if (btnTwo) {
      btnTwo.addEventListener('click', () => this.toggleShortcutsMode());
    }
    this.updateShortcutsToggleUI();

    // 2. HUD Open Button (Navbar)
    const btnTopHud = document.getElementById('btn-top-shortcuts-hud');
    if (btnTopHud) {
      btnTopHud.addEventListener('click', () => this.toggleShortcutsHud(true));
    }

    // 3. HUD Close Button & Backdrop Click
    const btnHudClose = document.getElementById('btn-shortcuts-hud-close');
    if (btnHudClose) {
      btnHudClose.addEventListener('click', () => this.toggleShortcutsHud(false));
    }
    if (this.shortcutsHudModalEl) {
      this.shortcutsHudModalEl.addEventListener('click', (e) => {
        if (e.target === this.shortcutsHudModalEl) {
          this.toggleShortcutsHud(false);
        }
      });
    }

    // 4. HUD Tab Switching (Standard vs Revit)
    const btnTabStd = document.getElementById('btn-hud-tab-standard');
    if (btnTabStd) {
      btnTabStd.addEventListener('click', () => {
        this.syncShortcutsHudTab('standard');
      });
    }
    const btnTabRvt = document.getElementById('btn-hud-tab-revit');
    if (btnTabRvt) {
      btnTabRvt.addEventListener('click', () => {
        this.syncShortcutsHudTab('revit');
      });
    }

    // 5. Global Keyboard Listener (including Shift for Section Box back-face pass-through and Ctrl for Central Gizmo)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') {
        this.handleSectionBoxShiftChange(true);
      }
      if (e.key === 'Control') {
        this.handleSectionBoxCtrlChange(true);
      }
      this.handleGlobalKeyDown(e);
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.handleSectionBoxShiftChange(false);
      }
      if (e.key === 'Control') {
        this.handleSectionBoxCtrlChange(false);
      }
    });
    window.addEventListener('blur', () => {
      if (this.clippingEngine && this.clippingEngine.isShiftDown) {
        this.handleSectionBoxShiftChange(false);
      }
      if (this.clippingEngine && this.clippingEngine.isCtrlDown) {
        this.handleSectionBoxCtrlChange(false);
      }
    });
  }

  handleSectionBoxCtrlChange(isCtrl) {
    if (!this.clippingEngine) return;
    this.clippingEngine.setCtrlMode(isCtrl);
    if (!isCtrl) {
      this.hideSectionBoxRotTooltip();
    }
    if (!this.clippingEngine.enabled || this.clippingEngine.mode !== 'box' || this.isGizmoDragging) {
      return;
    }
    if (this.camera) {
      this.camera.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const isOverGizmo = this.clippingEngine.updateHover(this.raycaster, undefined, isCtrl);
      if (this.canvas && !this.isOrbiting && !this.isPanning) {
        this.canvas.style.cursor = isOverGizmo ? 'grab' : '';
      }
      this.needsRender = true;
      this.requestRender(150);
    }
  }

  showSectionBoxRotTooltip(clientX, clientY, text) {
    if (!this.secBoxRotTooltip) {
      this.secBoxRotTooltip = document.getElementById('sec-box-rot-tooltip');
      if (!this.secBoxRotTooltip) {
        this.secBoxRotTooltip = document.createElement('div');
        this.secBoxRotTooltip.id = 'sec-box-rot-tooltip';
        this.secBoxRotTooltip.className = 'sec-box-rot-tooltip';
        (this.container || document.body).appendChild(this.secBoxRotTooltip);
      }
    }
    const container = this.container || document.body;
    const rect = container.getBoundingClientRect();
    const leftPx = clientX - rect.left;
    const topPx = clientY - rect.top;

    this.secBoxRotTooltip.textContent = text;
    this.secBoxRotTooltip.style.left = `${leftPx}px`;
    this.secBoxRotTooltip.style.top = `${topPx}px`;
    this.secBoxRotTooltip.style.display = 'inline-flex';
  }

  hideSectionBoxRotTooltip() {
    if (!this.secBoxRotTooltip) {
      this.secBoxRotTooltip = document.getElementById('sec-box-rot-tooltip');
    }
    if (this.secBoxRotTooltip) {
      this.secBoxRotTooltip.style.display = 'none';
    }
  }

  handleSectionBoxShiftChange(isShift) {
    if (!this.clippingEngine) return;
    this.clippingEngine.setShiftPassThrough(isShift);
    if (!this.clippingEngine.enabled || this.clippingEngine.mode !== 'box' || this.isGizmoDragging) {
      return;
    }
    if (this.camera) {
      this.camera.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const isOverGizmo = this.clippingEngine.updateHover(this.raycaster, isShift);
      if (this.canvas && !this.isOrbiting && !this.isPanning) {
        this.canvas.style.cursor = isOverGizmo ? 'grab' : '';
      }
      this.requestRender(150);
    }
  }

  toggleShortcutsMode() {
    this.setShortcutsMode(this.shortcutsMode === 'standard' ? 'revit' : 'standard');
  }

  updateShortcutsToggleUI() {
    const btnSingle = document.getElementById('pref-shortcuts-btn-single');
    const btnTwo = document.getElementById('pref-shortcuts-btn-two');
    if (btnSingle) btnSingle.classList.toggle('active', this.shortcutsMode === 'standard');
    if (btnTwo) btnTwo.classList.toggle('active', this.shortcutsMode === 'revit');
  }

  setShortcutsMode(mode) {
    if (mode !== 'standard' && mode !== 'revit') mode = 'standard';
    this.shortcutsMode = mode;
    try {
      localStorage.setItem('bimscope_shortcuts_mode', mode);
    } catch (_) {}
    this.updateShortcutsToggleUI();
    this.syncShortcutsHudTab(mode);
    this.resetShortcutsBuffer();
    this.hideShortcutsCapsule();
    const label = mode === 'revit' ? (I18N.t('shortcutsRevit') || 'Autodesk Revit (2-Letter)') : (I18N.t('shortcutsStandard') || 'Standard (Single-Key)');
    showToast((I18N.t('shortcutsScheme') || 'Shortcuts') + ': ' + label, 'info');
  }

  syncShortcutsHudTab(scheme) {
    this.shortcutsHudCurrentTab = scheme;
    if (!this.shortcutsHudModalEl) {
      this.shortcutsHudModalEl = document.getElementById('shortcuts-hud-modal');
    }
    if (this.shortcutsHudModalEl) {
      this.shortcutsHudModalEl.classList.toggle('hud-mode-standard', scheme === 'standard');
      this.shortcutsHudModalEl.classList.toggle('hud-mode-revit', scheme === 'revit');
    }
    const tabStd = document.getElementById('btn-hud-tab-standard');
    const tabRvt = document.getElementById('btn-hud-tab-revit');
    if (tabStd) tabStd.classList.toggle('active', scheme === 'standard');
    if (tabRvt) tabRvt.classList.toggle('active', scheme === 'revit');
  }

  toggleShortcutsHud(forceState = null) {
    if (!this.shortcutsHudModalEl) {
      this.shortcutsHudModalEl = document.getElementById('shortcuts-hud-modal');
    }
    if (!this.shortcutsHudModalEl) return;
    const isOpen = this.shortcutsHudModalEl.classList.contains('open');
    const target = forceState !== null ? forceState : !isOpen;
    if (target) {
      this.shortcutsHudModalEl.classList.add('open');
      this.syncShortcutsHudTab(this.shortcutsMode);
    } else {
      this.shortcutsHudModalEl.classList.remove('open');
    }
  }

  showShortcutsCandidates(candidates, onSelect, timeoutMs = 5000) {
    if (!this.shortcutsCandidatePanelEl) {
      this.shortcutsCandidatePanelEl = document.getElementById('shortcuts-candidate-panel');
    }
    if (!this.shortcutsCandidatePanelEl) return;
    this.shortcutsCandidatePanelEl.innerHTML = '';

    candidates.forEach(cand => {
      const row = document.createElement('div');
      row.className = 'shortcuts-candidate-item';
      row.innerHTML = `
        <span class="shortcuts-cand-key">${cand.key}</span>
        <span class="shortcuts-cand-name">${cand.name}</span>
      `;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideShortcutsCandidates();
        onSelect(cand);
      });
      this.shortcutsCandidatePanelEl.appendChild(row);
    });

    this.shortcutsCandidatePanelEl.style.display = 'flex';
    requestAnimationFrame(() => {
      if (this.shortcutsCandidatePanelEl) {
        this.shortcutsCandidatePanelEl.classList.add('visible');
      }
    });

    if (this.shortcutsCandidateTimer) {
      clearTimeout(this.shortcutsCandidateTimer);
      this.shortcutsCandidateTimer = null;
    }
    this.shortcutsCandidateTimer = setTimeout(() => {
      this.hideShortcutsCandidates();
    }, timeoutMs);
  }

  hideShortcutsCandidates() {
    if (this.shortcutsCandidateTimer) {
      clearTimeout(this.shortcutsCandidateTimer);
      this.shortcutsCandidateTimer = null;
    }
    if (this.shortcutsCandidatePanelEl) {
      this.shortcutsCandidatePanelEl.classList.remove('visible');
      setTimeout(() => {
        if (this.shortcutsCandidatePanelEl && !this.shortcutsCandidatePanelEl.classList.contains('visible')) {
          this.shortcutsCandidatePanelEl.style.display = 'none';
        }
      }, 150);
    }
  }

  showShortcutsCapsule(text, isMatched = false, durationMs = null) {
    if (!this.shortcutsCapsuleEl) {
      this.shortcutsCapsuleEl = document.getElementById('shortcuts-key-capsule');
      this.shortcutsCapsuleKeysEl = document.getElementById('shortcuts-capsule-keys');
    }
    if (!this.shortcutsCapsuleEl) return;
    if (this.shortcutsCapsuleKeysEl) {
      this.shortcutsCapsuleKeysEl.textContent = text;
    }
    this.shortcutsCapsuleEl.classList.remove('matched');
    if (isMatched) {
      this.shortcutsCapsuleEl.classList.add('matched');
    }
    this.shortcutsCapsuleEl.classList.add('visible');

    if (this.shortcutsFadeTimer) {
      clearTimeout(this.shortcutsFadeTimer);
      this.shortcutsFadeTimer = null;
    }
    const defaultDuration = isMatched ? 850 : 1200;
    this.shortcutsFadeTimer = setTimeout(() => {
      if (this.shortcutsCapsuleEl) {
        this.shortcutsCapsuleEl.classList.remove('visible');
        this.shortcutsCapsuleEl.classList.remove('matched');
      }
    }, durationMs !== null ? durationMs : defaultDuration);
  }

  hideShortcutsCapsule() {
    this.hideShortcutsCandidates();
    if (this.shortcutsCapsuleEl) {
      this.shortcutsCapsuleEl.classList.remove('visible');
      this.shortcutsCapsuleEl.classList.remove('matched');
    }
    if (this.shortcutsFadeTimer) {
      clearTimeout(this.shortcutsFadeTimer);
      this.shortcutsFadeTimer = null;
    }
  }

  resetShortcutsBuffer() {
    this.shortcutsBuffer = '';
    this.hideShortcutsCandidates();
    if (this.shortcutsBufferTimer) {
      clearTimeout(this.shortcutsBufferTimer);
      this.shortcutsBufferTimer = null;
    }
  }

  zoomToSelected() {
    if (this.pointCloudManager && this.pointCloudManager.isPointCloudSelected && this.pointCloudManager.activePointCloud) {
      this.pointCloudManager.fitPointCloudView(this.pointCloudManager.activePointCloud);
      return;
    }
    if (this.selectedMeshes && this.selectedMeshes.length > 1) {
      this.zoomToGroup(this.selectedMeshes);
    } else if (this.selectedMesh) {
      this.zoomToElement(this.selectedMesh);
    } else if (this.selectedMeshes && this.selectedMeshes.length === 1) {
      this.zoomToElement(this.selectedMeshes[0]);
    } else {
      this.zoomToFit(false);
    }
  }

  hideSelected() {
    if (this.selectedMeshes && this.selectedMeshes.length > 1) {
      this.hideGroup(this.selectedMeshes);
      this.clearSelection();
    } else if (this.selectedMesh) {
      this.selectedMesh.visible = false;
      this.clearSelection();
    } else if (this.selectedMeshes && this.selectedMeshes.length === 1) {
      this.selectedMeshes[0].visible = false;
      this.clearSelection();
    }
  }

  isolateSelected() {
    if (this.selectedMeshes && this.selectedMeshes.length > 1) {
      this.isolateGroup(this.selectedMeshes);
    } else if (this.selectedMesh) {
      this.isolateElement(this.selectedMesh);
    } else if (this.selectedMeshes && this.selectedMeshes.length === 1) {
      this.isolateElement(this.selectedMeshes[0]);
    }
  }

  unhideAll() {
    const b = document.getElementById('btn-show-all');
    if (b) {
      b.click();
    } else {
      if (this.activeModel) {
        this.activeModel.traverse(m => { if (m.isMesh) m.visible = true; });
      }
      this.categoryStates.forEach(st => {
        st.visible = true;
        if (st.chipEl) {
          st.chipEl.classList.remove('cat-hidden');
          st.chipEl.classList.remove('cat-isolated');
        }
        if (st.checkboxEl) st.checkboxEl.checked = true;
      });
      if (this.virtualStructTree) this.virtualStructTree.showAll();
    }
    this.requestRender(100);
  }

  selectAllElements() {
    if (!this.activeModel) return;
    const pickable = [];
    this.activeModel.traverse(m => {
      if (m.isMesh && m.visible && this.isPickableElement(m)) {
        pickable.push(m);
      }
    });
    if (pickable.length > 0) {
      this.selectElements(pickable);
    }
  }

  toggleMeasurePanel() {
    if (this.isFloatingToolsOpen && this.activeToolTab === 'tab-measure-content') {
      this.closeFloatingTools();
    } else {
      this.openFloatingTools('tab-measure-content');
    }
  }

  setMeasureSubmode(mode) {
    if (!this.isFloatingToolsOpen || this.activeToolTab !== 'tab-measure-content') {
      this.openFloatingTools('tab-measure-content');
    }
    this.setMeasureMode(mode);
  }

  toggleSectionPlane() {
    if (!this.clippingEngine) return;
    this.openFloatingTools('tab-section-content');
    this.updateClippingBounds(true);
    const secActive = document.getElementById('sec-active-chk');
    if (!this.clippingEngine.enabled) {
      this.clippingEngine.enabled = true;
      if (secActive) secActive.checked = true;
    }
    this.clippingEngine.mode = 'plane';
    this.ensureSectionInCurrentView('plane', false);
    this.clippingEngine.update();
    this.clippingEngine.ensureVisibleGizmo(this.camera);
    this.syncSectionUI();
    this.requestRender(100);
  }

  toggleSectionBox() {
    if (!this.clippingEngine) return;
    this.openFloatingTools('tab-section-content');
    this.updateClippingBounds(true);
    const secActive = document.getElementById('sec-active-chk');
    if (!this.clippingEngine.enabled) {
      this.clippingEngine.enabled = true;
      if (secActive) secActive.checked = true;
    }
    this.clippingEngine.mode = 'box';
    this.ensureSectionInCurrentView('box', false);
    this.clippingEngine.update();
    this.clippingEngine.ensureVisibleGizmo(this.camera);
    this.syncSectionUI();
    this.requestRender(100);
  }

  flipSectionPlane() {
    if (!this.clippingEngine) return;
    if (!this.clippingEngine.enabled) {
      this.clippingEngine.enabled = true;
      const secActive = document.getElementById('sec-active-chk');
      if (secActive) secActive.checked = true;
    }
    this.clippingEngine.planeInvert = !this.clippingEngine.planeInvert;
    this.clippingEngine.updatePlaneFromState();
    this.syncSectionUI();
    this.requestRender(100);
  }

  toggleSolarPanel() {
    const btnSolar = document.getElementById('btn-tool-solar');
    if (btnSolar) {
      btnSolar.click();
    } else {
      this.openFloatingTools('tab-light-content');
    }
  }

  toggleCompareModal() {
    if (this.compareEngine) {
      if (this.compareEngine.isModalOpen()) {
        this.compareEngine.closeSetupModal();
      } else {
        this.compareEngine.openSetupModal();
      }
    } else {
      const btnCompare = document.getElementById('btn-tool-compare');
      if (btnCompare) btnCompare.click();
    }
  }

  handleGlobalKeyDown(e) {
    // 1. Guard against typing inside input, textarea, select or contentEditable
    const activeEl = document.activeElement;
    const tag = activeEl ? activeEl.tagName : '';
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (activeEl && activeEl.isContentEditable);
    if (isTyping) {
      if (e.key === 'Escape') {
        activeEl.blur();
      }
      return;
    }

    // 2. Shortcuts HUD Modal open handling
    if (this.shortcutsHudModalEl && this.shortcutsHudModalEl.classList.contains('open')) {
      if (e.key === 'Escape' || e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        this.toggleShortcutsHud(false);
      }
      return;
    }

    // 3. Compare Modal / Guided Tour open handling
    if (this.compareEngine && this.compareEngine.isModalOpen()) {
      if (e.key === 'Escape') {
        this.compareEngine.closeSetupModal();
      }
      return;
    }
    if (this.helpSystem && this.helpSystem.isTourActive) {
      if (e.key === 'Escape') {
        this.helpSystem.exitTour();
      }
      return;
    }

    // 4. Escape Key: dismiss current mode, popover, context menu, clear selection
    if (e.key === 'Escape') {
      this.resetShortcutsBuffer();
      this.hideShortcutsCapsule();
      if (this.pendingClosureAction) {
        this.hideMultiPointClosurePopover();
        return;
      }
      this.hideContextMenu();
      if (this.pendingDistanceStart) {
        this.cancelPendingDistanceStart();
      }
      if (this.pendingAngleState) {
        this.cancelPendingAngleStart();
      }
      if (this.multiPointInsertSegIdx >= 0) {
        this.multiPointInsertSegIdx = -1;
        this.hideMultiPointInsertPreview();
        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = I18N.t('measureMultiHint') || 'Multi-point measurement ready';
        this.requestRender(100);
        return;
      }
      if (this.multiPointState && this.multiPointState.isDrawing) {
        if (this.multiPointDrawDir === 'prepend') {
          this.finishMultiPointMeasurement();
        } else {
          this.cancelPendingMultiPoint();
        }
      }
      if (this.snapEngine && this.snapEngine.flyoutOpen) {
        this.snapEngine.setFlyoutOpen(false);
      }
      if ((this.selectedMeshes && this.selectedMeshes.length > 0) || this.selectedMesh) {
        this.clearSelection();
      }
      return;
    }

    // 5. Enter Key: confirm closure or finish multipoint
    if (e.key === 'Enter') {
      if (this.pendingClosureAction) {
        const action = this.pendingClosureAction;
        this.hideMultiPointClosurePopover();
        if (action && action.onConfirm) action.onConfirm();
        return;
      }
      if (this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.isDrawing) {
        this.finishMultiPointMeasurement();
        return;
      }
    }

    // 6. HUD Cheatsheet Toggle ('?' or Shift+'/')
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      this.toggleShortcutsHud();
      return;
    }

    // 7. Viewport Navigation History (Alt+Left / Alt+Right)
    if (e.altKey && !e.ctrlKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      this.undoView();
      return;
    }
    if (e.altKey && !e.ctrlKey && e.key === 'ArrowRight') {
      e.preventDefault();
      this.redoView();
      return;
    }

    // 8. Modifier Shortcuts (Ctrl+O, Ctrl+A, Ctrl+H, Alt+H)
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.click();
      this.showShortcutsCapsule('Ctrl+O  ' + (I18N.t('shortcutsDescOpenFile') || 'Open Local File'), true);
      return;
    }
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      this.selectAllElements();
      this.showShortcutsCapsule('Ctrl+A  ' + (I18N.t('shortcutsDescSelectAll') || 'Select All'), true);
      return;
    }
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      this.hideSelected();
      this.showShortcutsCapsule('Ctrl+H  ' + (I18N.t('shortcutsDescHide') || 'Hide Selected'), true);
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      this.unhideAll();
      this.showShortcutsCapsule('Alt+H  ' + (I18N.t('shortcutsDescUnhide') || 'Unhide All'), true);
      return;
    }

    // If any modifier key is held (Ctrl, Alt, Meta), do not intercept other keys
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    // 8b. Page Down: Focus / Zoom to Selection & Page Up: Zoom to Fit (active in both modes)
    if (e.key === 'PageDown') {
      e.preventDefault();
      this.zoomToSelected();
      this.showShortcutsCapsule('PageDown  ' + (I18N.t('shortcutsDescFocus') || 'Zoom to Selection'), true);
      return;
    }
    if (e.key === 'PageUp') {
      e.preventDefault();
      this.zoomToFit(false);
      this.showShortcutsCapsule('PageUp  ' + (I18N.t('shortcutsDescZoomFit') || 'Zoom to Fit'), true);
      return;
    }

    // 9. Sidebars Toggle ('[' and ']')
    if (e.key === '[') {
      e.preventDefault();
      if (this.toggleTreeCollapse) this.toggleTreeCollapse();
      this.showShortcutsCapsule('[  ' + (I18N.t('shortcutsDescLeftSidebar') || 'Model Tree'), true);
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      if (this.toggleInspectorCollapse) this.toggleInspectorCollapse();
      this.showShortcutsCapsule(']  ' + (I18N.t('shortcutsDescRightSidebar') || 'Inspector Panel'), true);
      return;
    }

    // 10. Scheme A: Standard Single-Key Mode
    if (this.shortcutsMode === 'standard') {
      const k = e.key.toLowerCase();
      switch (k) {
        case 'd':
          e.preventDefault();
          this.toggleMeasurePanel();
          const measureCandidates = [
            { key: '1', submode: 'point', name: I18N.t('shortcutsDescMeasurePoint') || 'Point Coordinates' },
            { key: '2', submode: 'distance', name: I18N.t('shortcutsDescMeasureDist') || 'Two-Point Distance' },
            { key: '3', submode: 'multipoint', name: I18N.t('shortcutsDescMeasureMulti') || 'Multi-Point / Area' },
            { key: '4', submode: 'angle', name: I18N.t('shortcutsDescMeasureAngle') || 'Angular Dimension' },
            { key: '5', submode: 'radius', name: I18N.t('shortcutsDescMeasureRadius') || 'Radial Dimension' },
          ];
          this.showShortcutsCapsule('D _', false, 5000);
          this.showShortcutsCandidates(measureCandidates, (item) => {
            this.setMeasureSubmode(item.submode);
            this.showShortcutsCapsule(item.key + '  ' + item.name, true);
          }, 5000);
          break;
        case '1':
          e.preventDefault();
          this.hideShortcutsCandidates();
          this.setMeasureSubmode('point');
          this.showShortcutsCapsule('1  ' + (I18N.t('shortcutsDescMeasurePoint') || 'Point Coordinates'), true);
          break;
        case '2':
          e.preventDefault();
          this.hideShortcutsCandidates();
          this.setMeasureSubmode('distance');
          this.showShortcutsCapsule('2  ' + (I18N.t('shortcutsDescMeasureDist') || 'Two-Point Distance'), true);
          break;
        case '3':
          e.preventDefault();
          this.hideShortcutsCandidates();
          this.setMeasureSubmode('multipoint');
          this.showShortcutsCapsule('3  ' + (I18N.t('shortcutsDescMeasureMulti') || 'Multi-Point / Area'), true);
          break;
        case '4':
          e.preventDefault();
          this.hideShortcutsCandidates();
          this.setMeasureSubmode('angle');
          this.showShortcutsCapsule('4  ' + (I18N.t('shortcutsDescMeasureAngle') || 'Angular Dimension'), true);
          break;
        case '5':
          e.preventDefault();
          this.hideShortcutsCandidates();
          this.setMeasureSubmode('radius');
          this.showShortcutsCapsule('5  ' + (I18N.t('shortcutsDescMeasureRadius') || 'Radial Dimension'), true);
          break;
        case 't':
          e.preventDefault();
          this.setView('plan');
          this.showShortcutsCapsule('T  ' + (I18N.t('shortcutsDescTopView') || 'Top View (Plan)'), true);
          break;
        case 'f':
          e.preventDefault();
          this.setView('south');
          this.showShortcutsCapsule('F  ' + (I18N.t('shortcutsDescFrontView') || 'Front View (South)'), true);
          break;
        case 'z':
          e.preventDefault();
          this.zoomToSelected();
          this.showShortcutsCapsule('Z  ' + (I18N.t('shortcutsDescFocus') || 'Zoom Extents'), true);
          break;
        case 'u':
          e.preventDefault();
          this.toggleCameraProjection();
          this.showShortcutsCapsule('U  ' + (I18N.t('shortcutsDescOrthoPersp') || 'Projection'), true);
          break;
        case 'p':
          e.preventDefault();
          this.toggleSectionPlane();
          this.showShortcutsCapsule('P  ' + (I18N.t('shortcutsDescSecPlane') || 'Section Plane'), true);
          break;
        case 'b':
          e.preventDefault();
          this.toggleSectionBox();
          this.showShortcutsCapsule('B  ' + (I18N.t('shortcutsDescSecBox') || 'Section Box'), true);
          break;
        case 'x':
          e.preventDefault();
          this.flipSectionPlane();
          this.showShortcutsCapsule('X  ' + (I18N.t('shortcutsDescSecFlip') || 'Flip Section Cut'), true);
          break;
        case 'i':
          e.preventDefault();
          this.isolateSelected();
          this.showShortcutsCapsule('I  ' + (I18N.t('shortcutsDescIsolate') || 'Isolate Selected'), true);
          break;

        case 'c':
          e.preventDefault();
          this.toggleCompareModal();
          this.showShortcutsCapsule('C  ' + (I18N.t('shortcutsDescCompare') || 'Model Compare'), true);
          break;
        case 'e':
          e.preventDefault();
          this.setEdgeLinesVisible(!this.showEdges);
          this.showShortcutsCapsule('E  ' + (I18N.t('shortcutsDescEdgeLines') || 'Crease Edges'), true);
          break;
      }
      return;
    }

    // 11. Scheme B: Autodesk Revit 2-Letter Combo Mode
    if (this.shortcutsMode === 'revit') {
      this.handleRevitModeKeyDown(e);
    }
  }

  handleRevitModeKeyDown(e) {
    const rawKey = e.key;
    const uKey = rawKey.toUpperCase();

    // Only handle letters A-Z, Space, Enter
    if (!/^[A-Z]$/.test(uKey)) {
      if (rawKey === ' ' || rawKey === 'Enter') {
        if (this.shortcutsBuffer) {
          e.preventDefault();
          this.commitRevitBuffer();
        }
      }
      return;
    }

    e.preventDefault();

    const revitCommands = {
      'DP': { name: 'Point Coordinates', descKey: 'shortcutsDescMeasurePoint', action: () => this.setMeasureSubmode('point') },
      'DI': { name: 'Distance', descKey: 'shortcutsDescMeasureDist', action: () => this.setMeasureSubmode('distance') },
      'DL': { name: 'Multi-Point / Area', descKey: 'shortcutsDescMeasureMulti', action: () => this.setMeasureSubmode('multipoint') },
      'DA': { name: 'Angular Dimension', descKey: 'shortcutsDescMeasureAngle', action: () => this.setMeasureSubmode('angle') },
      'DR': { name: 'Radial Dimension', descKey: 'shortcutsDescMeasureRadius', action: () => this.setMeasureSubmode('radius') },
      'SP': { name: 'Section Plane', descKey: 'shortcutsDescSecPlane', action: () => this.toggleSectionPlane() },
      'BX': { name: 'Section Box', descKey: 'shortcutsDescSecBox', action: () => this.toggleSectionBox() },
      'FL': { name: 'Flip Section', descKey: 'shortcutsDescSecFlip', action: () => this.flipSectionPlane() },
      'HH': { name: 'Hide Selected', descKey: 'shortcutsDescHide', action: () => this.hideSelected() },
      'HI': { name: 'Isolate Selected', descKey: 'shortcutsDescIsolate', action: () => this.isolateSelected() },
      'HR': { name: 'Reset Visibility', descKey: 'shortcutsDescUnhide', action: () => this.unhideAll() },
      'ZE': { name: 'Zoom Extents', descKey: 'shortcutsDescFocus', action: () => this.zoomToSelected() },
      'VP': { name: 'View Projection', descKey: 'shortcutsDescOrthoPersp', action: () => this.toggleCameraProjection() },

      'CM': { name: 'Compare Model', descKey: 'shortcutsDescCompare', action: () => this.toggleCompareModal() },
      'TL': { name: 'Thin Lines', descKey: 'shortcutsDescEdgeLines', action: () => this.setEdgeLinesVisible(!this.showEdges) },
      'SA': { name: 'Select All', descKey: 'shortcutsDescSelectAll', action: () => this.selectAllElements() },
      'TV': { name: 'Top View', descKey: 'shortcutsDescTopView', action: () => this.setView('plan') },
      'FV': { name: 'Front View', descKey: 'shortcutsDescFrontView', action: () => this.setView('south') },
    };

    // If buffer has 1 key already: combine and execute
    if (this.shortcutsBuffer.length === 1) {
      this.hideShortcutsCandidates();
      const combo = this.shortcutsBuffer + uKey;
      if (this.shortcutsBufferTimer) {
        clearTimeout(this.shortcutsBufferTimer);
        this.shortcutsBufferTimer = null;
      }
      this.shortcutsBuffer = '';

      if (revitCommands[combo]) {
        const cmd = revitCommands[combo];
        cmd.action();
        const desc = I18N.t(cmd.descKey) || cmd.name;
        this.showShortcutsCapsule(combo + '  ' + desc, true);
      } else {
        this.showShortcutsCapsule(combo + '  --', false);
      }
      return;
    }

    // Buffer is empty: start a new combo
    this.shortcutsBuffer = uKey;

    const matching = Object.keys(revitCommands)
      .filter(k => k.startsWith(uKey))
      .map(k => ({
        key: k,
        name: I18N.t(revitCommands[k].descKey) || revitCommands[k].name,
        cmd: revitCommands[k]
      }));

    // Timeout: per user choice, T/F keep 650ms, other keys give 5000ms
    const timeoutMs = (uKey === 'T' || uKey === 'F') ? 650 : 5000;
    this.showShortcutsCapsule(uKey + ' _', false, timeoutMs);

    if (matching.length > 0) {
      this.showShortcutsCandidates(matching, (item) => {
        if (this.shortcutsBufferTimer) {
          clearTimeout(this.shortcutsBufferTimer);
          this.shortcutsBufferTimer = null;
        }
        this.shortcutsBuffer = '';
        item.cmd.action();
        this.showShortcutsCapsule(item.key + '  ' + item.name, true);
      }, timeoutMs);
    } else {
      this.hideShortcutsCandidates();
    }

    if (this.shortcutsBufferTimer) {
      clearTimeout(this.shortcutsBufferTimer);
    }
    this.shortcutsBufferTimer = setTimeout(() => {
      this.commitRevitBuffer();
    }, timeoutMs);
  }

  commitRevitBuffer() {
    this.hideShortcutsCandidates();
    if (!this.shortcutsBuffer) return;
    const key = this.shortcutsBuffer;
    this.shortcutsBuffer = '';
    if (this.shortcutsBufferTimer) {
      clearTimeout(this.shortcutsBufferTimer);
      this.shortcutsBufferTimer = null;
    }

    if (key === 'T') {
      this.setView('plan');
      this.showShortcutsCapsule('T  ' + (I18N.t('shortcutsDescTopView') || 'Top View (Plan)'), true);
    } else if (key === 'F') {
      this.setView('south');
      this.showShortcutsCapsule('F  ' + (I18N.t('shortcutsDescFrontView') || 'Front View (South)'), true);
    } else if (key === 'Z') {
      this.zoomToSelected();
      this.showShortcutsCapsule('ZE  ' + (I18N.t('shortcutsDescFocus') || 'Zoom Extents'), true);
    } else {
      this.hideShortcutsCapsule();
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
    }
    if (viewDir.lengthSq() < 0.0001) {
      viewDir.set(-0.72, 0.50, 0.82);
    }
    viewDir.normalize();

    const zoomFraction = 0.70;
    if (this.camera && this.camera.isOrthographicCamera) {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const aspect = width / (height || 1);
      const minAspect = Math.min(1, aspect);
      const halfH = (radius / minAspect) / zoomFraction;
      const halfW = halfH * aspect;
      
      const currentZoom = this.orthographicCamera.zoom || 1.0;
      const currentHalfH = (this.orthographicCamera.top - this.orthographicCamera.bottom) / 2.0;
      const targetZoom = (currentHalfH / halfH) * currentZoom;
      const targetCam = center.clone().addScaledVector(viewDir, 25.0);
      this.showPivotIndicator(center);
      this.tweenCamera(targetCam, center, 400, () => {
        this.orthographicCamera.left = -halfW;
        this.orthographicCamera.right = halfW;
        this.orthographicCamera.top = halfH;
        this.orthographicCamera.bottom = -halfH;
        this.orthographicCamera.zoom = 1.0;
        this.orthographicCamera.updateProjectionMatrix();
      }, currentZoom, targetZoom);
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

  pick3DPointAtRay(raycaster) {
    if (!raycaster || !this.camera) return null;
    let bestPt = null;
    let bestDist = Infinity;

    // 1. Check visible mesh models
    const searchRoots = (this.loadedModels && this.loadedModels.length > 0)
      ? this.loadedModels.filter(m => m && m.visible !== false)
      : (this.activeModel && this.activeModel.visible !== false ? [this.activeModel] : []);

    if (searchRoots.length > 0) {
      const intersects = raycaster.intersectObjects(searchRoots, true);
      const valid = intersects.filter(hit => this.isPickableElement(hit.object));
      if (valid.length > 0) {
        bestPt = valid[0].point.clone();
        bestDist = valid[0].distance;
      }
    }

    // 2. Check visible point clouds (with CPU & box fallback so right-clicking anywhere on a point cloud succeeds)
    if (this.pointCloudManager && this.pointCloudManager.pointClouds && this.pointCloudManager.pointClouds.length > 0) {
      const pcHit = this.pointCloudManager.raycast(raycaster, 25, true);
      if (pcHit && pcHit.point && pcHit.distance < bestDist) {
        bestPt = pcHit.point.clone();
        bestDist = pcHit.distance;
      }
    }

    return bestPt;
  }

  isPointInViewport(pt, ndcMargin = 0.84) {
    if (!pt || !this.camera) return false;
    this.camera.updateMatrixWorld(true);
    const ndc = pt.clone().project(this.camera);
    return (
      Number.isFinite(ndc.x) &&
      Number.isFinite(ndc.y) &&
      Number.isFinite(ndc.z) &&
      Math.abs(ndc.x) <= ndcMargin &&
      Math.abs(ndc.y) <= ndcMargin &&
      ndc.z >= -1.0 &&
      ndc.z <= 1.0
    );
  }

  isAnyBoxGizmoInViewport(ndcMargin = 0.86) {
    if (!this.clippingEngine || !this.camera) return false;
    const ce = this.clippingEngine;
    const hx = ce.boxHalfSizes.x;
    const hy = ce.boxHalfSizes.y;
    const hz = ce.boxHalfSizes.z;
    const faceOffsets = [
      new THREE.Vector3(hx, 0, 0),
      new THREE.Vector3(-hx, 0, 0),
      new THREE.Vector3(0, hy, 0),
      new THREE.Vector3(0, -hy, 0),
      new THREE.Vector3(0, 0, hz),
      new THREE.Vector3(0, 0, -hz)
    ];
    for (const off of faceOffsets) {
      const worldPos = off.clone().applyQuaternion(ce.boxQuaternion).add(ce.boxCenter);
      if (this.isPointInViewport(worldPos, ndcMargin)) {
        return true;
      }
    }
    return false;
  }

  getVisibleViewBounds(ndcLimit = 0.72) {
    this.updateClippingBounds(true);
    const fullBounds = (this.clippingEngine && this.clippingEngine.bounds && !this.clippingEngine.bounds.isEmpty())
      ? this.clippingEngine.bounds.clone()
      : new THREE.Box3(new THREE.Vector3(-25, -5, -25), new THREE.Vector3(25, 25, 25));

    if (!this.camera) return fullBounds;
    this.camera.updateMatrixWorld(true);

    const visibleBox = new THREE.Box3();
    const tmpPt = new THREE.Vector3();
    const tmpLocal = new THREE.Vector3();

    // A. Sample visible mesh bounding boxes / vertices inside current camera NDC
    const models = (this.loadedModels && this.loadedModels.length > 0)
      ? this.loadedModels.filter(m => m && m.visible !== false)
      : (this.activeModel && this.activeModel.visible !== false ? [this.activeModel] : []);

    models.forEach(model => {
      model.traverse(obj => {
        if (!obj.isMesh || !obj.visible) return;
        const mBox = (obj.userData && obj.userData._cachedWorldBox) || new THREE.Box3().setFromObject(obj);
        if (!mBox || mBox.isEmpty()) return;
        mBox.getCenter(tmpPt);
        if (this.isPointInViewport(tmpPt, ndcLimit)) {
          visibleBox.expandByPoint(tmpPt);
        }
        const corners = [
          new THREE.Vector3(mBox.min.x, mBox.min.y, mBox.min.z),
          new THREE.Vector3(mBox.max.x, mBox.min.y, mBox.min.z),
          new THREE.Vector3(mBox.min.x, mBox.max.y, mBox.min.z),
          new THREE.Vector3(mBox.max.x, mBox.max.y, mBox.min.z),
          new THREE.Vector3(mBox.min.x, mBox.min.y, mBox.max.z),
          new THREE.Vector3(mBox.max.x, mBox.min.y, mBox.max.z),
          new THREE.Vector3(mBox.min.x, mBox.max.y, mBox.max.z),
          new THREE.Vector3(mBox.max.x, mBox.max.y, mBox.max.z)
        ];
        for (const c of corners) {
          if (this.isPointInViewport(c, ndcLimit)) {
            visibleBox.expandByPoint(c);
          }
        }
      });
    });

    // B. Sample visible point cloud octree points inside current camera NDC
    if (this.pointCloudManager && this.pointCloudManager.pointClouds) {
      for (const pco of this.pointCloudManager.pointClouds) {
        if (!pco || !pco.visible) continue;
        pco.updateMatrixWorld(true);
        const rootNode = (pco.pcoGeometry && pco.pcoGeometry.root) || pco.root;
        const nodes = [];
        if (Array.isArray(pco.visibleNodes) && pco.visibleNodes.length > 0) {
          for (const vn of pco.visibleNodes) {
            if (vn) nodes.push(vn);
          }
        }
        if (rootNode && !nodes.includes(rootNode)) nodes.push(rootNode);

        for (const node of nodes) {
          const geo = node.geometry || (node.geometryNode && node.geometryNode.geometry);
          if (!geo || !geo.attributes || !geo.attributes.position || !geo.attributes.position.array) continue;
          const pos = geo.attributes.position;
          const count = pos.count || Math.floor(pos.array.length / 3);
          if (count <= 0) continue;
          const arr = pos.array;
          const nodeMin = (node.boundingBox && node.boundingBox.min) ? node.boundingBox.min : { x: 0, y: 0, z: 0 };
          const stride = count > 800 ? Math.ceil(count / 800) : 1;
          for (let i = 0; i < count; i += stride) {
            tmpLocal.set(
              arr[i * 3] + nodeMin.x,
              arr[i * 3 + 1] + nodeMin.y,
              arr[i * 3 + 2] + nodeMin.z
            );
            tmpPt.copy(tmpLocal).applyMatrix4(pco.matrixWorld);
            if (this.isPointInViewport(tmpPt, ndcLimit)) {
              visibleBox.expandByPoint(tmpPt);
            }
          }
        }
      }
    }

    // C. Fallback if zoomed super close where only a surface/target is in view
    if (visibleBox.isEmpty()) {
      const centerRay = new THREE.Raycaster();
      centerRay.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const centerHit = this.pick3DPointAtRay(centerRay);
      const refCenter = centerHit
        || (this.controls && this.controls.target && this.isPointInViewport(this.controls.target, 0.85) ? this.controls.target.clone() : null)
        || fullBounds.getCenter(new THREE.Vector3());
      fullBounds.clampPoint(refCenter, tmpPt);
      const dist = Math.max(2.0, this.camera.position.distanceTo(tmpPt));
      const span = Math.max(1.0, dist * 0.32);
      visibleBox.setFromCenterAndSize(tmpPt, new THREE.Vector3(span * 2, span * 2, span * 2));
      visibleBox.intersect(fullBounds);
      if (visibleBox.isEmpty()) {
        visibleBox.setFromCenterAndSize(tmpPt, new THREE.Vector3(span * 2, span * 2, span * 2));
      }
    }

    // Ensure non-zero thickness along all 3 axes
    const vSize = new THREE.Vector3();
    visibleBox.getSize(vSize);
    const vCenter = new THREE.Vector3();
    visibleBox.getCenter(vCenter);
    const minThickness = Math.max(0.6, Math.max(vSize.x, vSize.y, vSize.z) * 0.08);
    if (vSize.x < minThickness || vSize.y < minThickness || vSize.z < minThickness) {
      visibleBox.setFromCenterAndSize(
        vCenter,
        new THREE.Vector3(
          Math.max(vSize.x, minThickness),
          Math.max(vSize.y, minThickness),
          Math.max(vSize.z, minThickness)
        )
      );
    }
    return visibleBox;
  }

  computeVisibleBoxHalfSizesAtPoint(centerPt, refViewBox = null) {
    const viewBox = refViewBox || this.getVisibleViewBounds(0.68);
    const viewSize = new THREE.Vector3();
    viewBox.getSize(viewSize);

    let maxHalfSpan = 15.0;
    if (this.camera) {
      this.camera.updateMatrixWorld(true);
      const dist = Math.max(1.5, this.camera.position.distanceTo(centerPt));
      let halfH;
      let halfW;
      if (this.camera.isPerspectiveCamera) {
        halfH = dist * Math.tan(THREE.MathUtils.degToRad((this.camera.fov || 45) * 0.5));
        halfW = halfH * (this.camera.aspect || 1.0);
      } else {
        const zoom = this.camera.zoom || 1.0;
        halfH = Math.abs(this.camera.top - this.camera.bottom) * 0.5 / zoom;
        halfW = Math.abs(this.camera.right - this.camera.left) * 0.5 / zoom;
      }
      const ndc = centerPt.clone().project(this.camera);
      const marginX = Math.max(0.28, 0.88 - Math.min(0.60, Math.abs(ndc.x)));
      const marginY = Math.max(0.28, 0.88 - Math.min(0.60, Math.abs(ndc.y)));
      const availSpan = Math.min(halfW * marginX, halfH * marginY);
      // Divide by sqrt(3) (~1.75) so all 8 corners of an axis-aligned box stay inside the current viewport
      maxHalfSpan = Math.max(0.5, availSpan / 1.75);
    }

    const hx = Math.max(0.4, Math.min(maxHalfSpan, (viewSize.x * 0.36) || maxHalfSpan));
    const hy = Math.max(0.4, Math.min(maxHalfSpan, (viewSize.y * 0.36) || maxHalfSpan));
    const hz = Math.max(0.4, Math.min(maxHalfSpan, (viewSize.z * 0.36) || maxHalfSpan));
    return new THREE.Vector3(hx, hy, hz);
  }

  ensureSectionInCurrentView(mode = (this.clippingEngine ? this.clippingEngine.mode : 'plane'), forceInit = false) {
    if (!this.clippingEngine) return;
    const ce = this.clippingEngine;
    this.updateClippingBounds(true);

    if (mode === 'plane') {
      const needsInit = forceInit || !ce._planeInitialized || !this.isPointInViewport(ce.planeGroup.position, 0.82);
      if (needsInit) {
        const viewBox = this.getVisibleViewBounds(0.70);
        const targetCenter = new THREE.Vector3();
        viewBox.getCenter(targetCenter);
        // Prefer direct surface hit at screen center if it lies within the visible viewBox
        const centerRay = new THREE.Raycaster();
        if (this.camera) {
          centerRay.setFromCamera(new THREE.Vector2(0, 0), this.camera);
          const centerHit = this.pick3DPointAtRay(centerRay);
          if (centerHit && this.isPointInViewport(centerHit, 0.75)) {
            targetCenter.copy(centerHit);
          }
        }
        ce._planeInitialized = true;
        ce.planeGroup.position.copy(targetCenter);
        ce.setPlaneAxis(ce.planeAxis || 'Z', true);
      }
      ce.ensureVisibleGizmo(this.camera);
    } else if (mode === 'box') {
      const needsInit = forceInit || !ce._boxInitialized || !this.isAnyBoxGizmoInViewport(0.86);
      if (needsInit) {
        const viewBox = this.getVisibleViewBounds(0.68);
        const targetCenter = new THREE.Vector3();
        viewBox.getCenter(targetCenter);
        const halfSizes = this.computeVisibleBoxHalfSizesAtPoint(targetCenter, viewBox);
        ce._boxInitialized = true;
        ce.boxQuaternion.identity();
        ce.boxCenter.copy(targetCenter);
        ce.boxHalfSizes.copy(halfSizes);
        ce.computeBoxRangesFromState();
        ce.updateBoxPlanesAndHelpers();
      }
      ce.ensureVisibleGizmo(this.camera);
    }
  }

  moveSectionToPoint(point) {
    if (!this.clippingEngine || !point) return;
    this.updateClippingBounds(true);
    const ce = this.clippingEngine;
    if (!ce.enabled) {
      ce.enabled = true;
      const secActive = document.getElementById('sec-active-chk');
      if (secActive) secActive.checked = true;
    }
    if (ce.mode === 'plane') {
      ce.movePlaneToPoint(point);
    } else {
      ce.moveBoxCenterToPoint(point);
    }
    ce.update();
    ce.ensureVisibleGizmo(this.camera);
    this.syncSectionUI();
    this.requestRender(200);
  }

  enableSectionPlaneAtPoint(point) {
    if (!this.clippingEngine || !point) return;
    this.updateClippingBounds(true);
    const ce = this.clippingEngine;
    ce.enabled = true;
    ce.mode = 'plane';
    ce.helpersVisible = true;
    ce.boxHelpersVisible = true;
    ce.planeAxis = 'Z';
    ce.planeInvert = false;
    ce._planeInitialized = true;
    ce.planeGroup.position.copy(point);
    ce.planeGroup.rotation.set(Math.PI / 2, 0, 0);
    ce.update();
    ce.ensureVisibleGizmo(this.camera);

    const secActive = document.getElementById('sec-active-chk');
    if (secActive) secActive.checked = true;
    this.syncSectionUI();
    this.requestRender(200);
  }

  enableSectionBoxAtPoint(point) {
    if (!this.clippingEngine || !point) return;
    this.updateClippingBounds(true);
    const ce = this.clippingEngine;
    const viewBox = this.getVisibleViewBounds(0.68);
    const halfSizes = this.computeVisibleBoxHalfSizesAtPoint(point, viewBox);

    ce.enabled = true;
    ce.mode = 'box';
    ce.helpersVisible = true;
    ce.boxHelpersVisible = true;
    ce._boxInitialized = true;
    ce.boxQuaternion.identity();
    ce.boxCenter.copy(point);
    ce.boxHalfSizes.copy(halfSizes);
    ce.computeBoxRangesFromState();
    ce.update();
    ce.ensureVisibleGizmo(this.camera);

    const secActive = document.getElementById('sec-active-chk');
    if (secActive) secActive.checked = true;
    this.syncSectionUI();
    this.requestRender(200);
  }

  moveSectionToTarget(target) {
    if (!this.clippingEngine || !this.clippingEngine.enabled) return;
    const box = this.computeBoundsFromTarget(target);
    if (box.isEmpty()) return;

    if (this.clippingEngine.mode === 'plane') {
      this.clippingEngine.movePlaneToTarget(box);
    } else {
      const center = new THREE.Vector3();
      box.getCenter(center);
      this.clippingEngine.moveBoxCenterToPoint(center);
    }
    this.clippingEngine.ensureVisibleGizmo(this.camera);

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

    this.openFloatingTools('tab-section-content');
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

  syncLightModeUI() {
    const curMode = this.solarEngine ? this.solarEngine.mode : 'singapore';
    const btnSolar = document.getElementById('light-mode-btn-solar');
    const btnCustom = document.getElementById('light-mode-btn-custom');
    if (btnSolar) btnSolar.classList.toggle('active', curMode === 'singapore');
    if (btnCustom) btnCustom.classList.toggle('active', curMode === 'custom');

    const sgControls = document.getElementById('solar-sg-controls');
    if (sgControls) sgControls.style.display = curMode === 'singapore' ? 'flex' : 'none';
    const customControls = document.getElementById('solar-custom-controls');
    if (customControls) customControls.style.display = curMode === 'custom' ? 'flex' : 'none';
    this.updateLightModeBtnWidths();
  }

  updateLightModeBtnWidths() {
    const btnSolar = document.getElementById('light-mode-btn-solar');
    const btnCustom = document.getElementById('light-mode-btn-custom');
    if (!btnSolar || !btnCustom) return;

    btnSolar.style.width = 'auto';
    btnCustom.style.width = 'auto';

    const wSolar = Math.ceil(btnSolar.getBoundingClientRect().width);
    const wCustom = Math.ceil(btnCustom.getBoundingClientRect().width);
    const maxW = Math.max(wSolar, wCustom);

    if (maxW > 0) {
      btnSolar.style.width = `${maxW}px`;
      btnCustom.style.width = `${maxW}px`;
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

    const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : this.scene.children);
    const intersects = this.raycaster.intersectObjects(searchRoots, true);
    
    // Filter and deduplicate unique meshes, excluding clipped intersections
    const candidateHits = [];
    const seenMeshes = new Set();
    const clippingPlanes = (this.clippingEngine && this.clippingEngine.enabled && this.clippingEngine.clippingPlanes) 
      ? this.clippingEngine.clippingPlanes 
      : [];

    for (let i = 0; i < intersects.length; i++) {
      const hit = intersects[i];
      const mesh = hit.object;
      if (!this.isPickableElement(mesh)) continue;
      if (seenMeshes.has(mesh)) continue;

      if (clippingPlanes.length > 0) {
        let isClipped = false;
        for (let p = 0; p < clippingPlanes.length; p++) {
          if (clippingPlanes[p].distanceToPoint(hit.point) < 0) {
            isClipped = true;
            break;
          }
        }
        if (isClipped) continue;
      }

      seenMeshes.add(mesh);
      candidateHits.push(hit);
    }
    const valid = candidateHits;
    
    if (this.isMeasureMode) {
      let hit = valid.length > 0 ? valid[0] : null;
      if (this.snapEngine && this.snapEngine.enabled) {
        const snap = this.snapEngine.currentSnap || this.snapEngine.resolveSnap(e.clientX, e.clientY, this.camera, hit);
        if (snap) {
          hit = {
            object: snap.targetMesh || snap.pointCloud,
            point: snap.point,
            normal: snap.normal,
            face: { normal: snap.normal },
            pointCloud: snap.pointCloud || snap.targetMesh
          };
        }
      }
      if (!hit && this.pointCloudManager && this.pointCloudManager.pointClouds.length > 0) {
        const pcHit = this.pointCloudManager.raycast(this.raycaster, 25);
        if (pcHit && pcHit.point) {
          hit = {
            object: pcHit.pointCloud,
            point: pcHit.point,
            normal: pcHit.normal || new THREE.Vector3(0, 1, 0),
            face: { normal: pcHit.normal || new THREE.Vector3(0, 1, 0) },
            pointCloud: pcHit.pointCloud
          };
        }
      }


          if (this.measureMode === 'radius') {
        const radTarget = this.currentRadiusTarget || this.detectRadiusTarget(hit, e.clientX, e.clientY);
        if (radTarget) {
          this.createOrUpdateRadiusMeasurement(radTarget, e);
        }
        return;
      }
      if (this.measureMode === 'multipoint' && this.multiPointState && this.multiPointState.isDrawing && this.multiPointState.points.length >= 2 && this.multiPointInsertSegIdx < 0) {
        const targetPt = (this.multiPointDrawDir === 'prepend')
          ? this.multiPointState.points[this.multiPointState.points.length - 1]
          : this.multiPointState.points[0];
        const targetMarker = (this.multiPointDrawDir === 'prepend')
          ? this.multiPointState.markers[this.multiPointState.markers.length - 1]
          : this.multiPointState.markers[0];
        if (targetPt) {
          const proj = targetPt.clone().project(this.camera);
          if (proj.z <= 1.0 && proj.z >= -1.0) {
            const canvas = this.canvas || this.container;
            const rect = canvas.getBoundingClientRect();
            const cw = rect.width || this.container.clientWidth || 1;
            const ch = rect.height || this.container.clientHeight || 1;
            const sx = (proj.x * 0.5 + 0.5) * cw;
            const sy = (-proj.y * 0.5 + 0.5) * ch;
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            if (Math.hypot(localX - sx, localY - sy) <= 35 || this.isSnappedToClosurePoint) {
              hit = {
                object: targetMarker ? targetMarker.group : null,
                point: targetPt.clone(),
                normal: (targetMarker && targetMarker.normal) ? targetMarker.normal.clone() : new THREE.Vector3(0, 1, 0),
                face: { normal: (targetMarker && targetMarker.normal) ? targetMarker.normal.clone() : new THREE.Vector3(0, 1, 0) },
                isClosureSnap: true
              };
            }
          }
        }
      }
      if (hit) {
        this.hideMeasurePointPreview();
        this.handleMeasureClick(hit, e);
      }
      return;
    }
    
    const now = performance.now();
    if (!this._selectionBeforeClick || (now - this._lastClickTime > 350)) {
      this._selectionBeforeClick = {
        selectedMesh: this.selectedMesh,
        selectedMeshes: this.selectedMeshes ? [...this.selectedMeshes] : []
      };
    }
    this._lastClickTime = now;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (candidateHits.length > 0) {
      const hitMesh = candidateHits[0].object;
      const hitPoint = candidateHits[0].point;

      if (isCtrl) {
        this._penetrateState = null;
        this.hidePenetratePickBadge();
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
        this._penetrateState = null;
        this.hidePenetratePickBadge();
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
        // Normal single click: check if multi-click penetration cycling applies
        const camHash = this.camera ? `${this.camera.position.x.toFixed(2)},${this.camera.position.y.toFixed(2)},${this.camera.position.z.toFixed(2)}_${this.camera.quaternion.x.toFixed(2)},${this.camera.quaternion.y.toFixed(2)},${this.camera.quaternion.z.toFixed(2)}` : '';
        
        let cycleIndex = 0;
        if (candidateHits.length >= 2 &&
            this._penetrateState &&
            this._penetrateState.camHash === camHash &&
            Math.hypot(e.clientX - this._penetrateState.clientX, e.clientY - this._penetrateState.clientY) <= 4 &&
            this._penetrateState.candidateMeshes &&
            this._penetrateState.candidateMeshes.length === candidateHits.length) {
          const sameStack = this._penetrateState.candidateMeshes.every((m, idx) => m === candidateHits[idx].object);
          if (sameStack) {
            cycleIndex = (this._penetrateState.index + 1) % candidateHits.length;
          }
        }

        const chosenHit = candidateHits[cycleIndex];
        this.selectElement(chosenHit.object, chosenHit.point);

        if (candidateHits.length >= 2) {
          this._penetrateState = {
            clientX: e.clientX,
            clientY: e.clientY,
            camHash: camHash,
            candidateMeshes: candidateHits.map(h => h.object),
            index: cycleIndex
          };
          this.showPenetratePickBadge(e.clientX, e.clientY, cycleIndex + 1, candidateHits.length, chosenHit.object);
        } else {
          this._penetrateState = null;
          this.hidePenetratePickBadge();
        }
      }
    } else {
      this._penetrateState = null;
      this.hidePenetratePickBadge();
      if (!isCtrl && !isShift) {
        this.clearSelection();
      }
    }
  }

  showPenetratePickBadge(clientX, clientY, current, total, mesh) {
    if (!this.container) return;
    let badge = document.getElementById('penetrate-pick-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'penetrate-pick-badge';
      badge.className = 'penetrate-pick-badge';
      this.container.appendChild(badge);
    }

    const meta = (mesh && mesh.userData) || {};
    const name = meta.element || meta.name || (mesh && mesh.name) || (typeof I18N !== 'undefined' ? I18N.t('unnamedElement') : 'Element');
    const badgeTitle = typeof I18N !== 'undefined' ? I18N.t('cyclePickBadge') : '穿透选择';

    badge.innerHTML = `
      <span class="badge-icon">🎯</span>
      <span class="badge-title">${this.escapeHtml(badgeTitle)}</span>
      <span class="badge-counter">${current}/${total}</span>
      <span class="badge-sep">·</span>
      <span class="badge-name" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</span>
    `;

    const rect = this.container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const badgeW = 230;
    const badgeH = 34;
    let posX = localX + 16;
    let posY = localY + 16;

    if (posX + badgeW > rect.width - 8) {
      posX = Math.max(8, localX - badgeW - 12);
    }
    if (posY + badgeH > rect.height - 8) {
      posY = Math.max(8, localY - badgeH - 12);
    }

    badge.style.left = `${Math.round(posX)}px`;
    badge.style.top = `${Math.round(posY)}px`;
    badge.classList.add('visible');

    if (this._penetrateBadgeTimer) {
      clearTimeout(this._penetrateBadgeTimer);
    }
    this._penetrateBadgeTimer = setTimeout(() => {
      this.hidePenetratePickBadge();
    }, 1500);
  }

  hidePenetratePickBadge() {
    if (this._penetrateBadgeTimer) {
      clearTimeout(this._penetrateBadgeTimer);
      this._penetrateBadgeTimer = null;
    }
    const badge = document.getElementById('penetrate-pick-badge');
    if (badge && badge.classList.contains('visible')) {
      badge.classList.remove('visible');
    }
  }

  handleWheelZoom(e) {
    if (e.cancelable) e.preventDefault();
    this.hidePenetratePickBadge();

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
    let hitDist = Infinity;

    const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : []);
    if (searchRoots.length > 0) {
      const intersects = this.raycaster.intersectObjects(searchRoots, true);
      const valid = intersects.filter(h => this.isPickableElement(h.object));
      if (valid.length > 0) {
        hitPoint = valid[0].point;
        hitDist = valid[0].distance;
      }
    }

    if (this.pointCloudManager && this.pointCloudManager.pointClouds.length > 0) {
      const pcHit = this.pointCloudManager.raycast(this.raycaster, 25);
      if (pcHit && pcHit.point && pcHit.distance < hitDist) {
        hitPoint = pcHit.point;
        hitDist = pcHit.distance;
      }
    }

    if (!hitPoint) {
      // Intersect plane facing camera passing through current pivotPoint
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      let pivotRef = this.pivotPoint || this.controls.target;
      const toPiv = new THREE.Vector3().subVectors(pivotRef, this.camera.position);
      if (toPiv.dot(camDir) < 0.5) {
        pivotRef = this.camera.position.clone().addScaledVector(camDir, 15.0);
      }
      const refPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.clone().negate(), pivotRef);
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
      this.camera.updateMatrixWorld();
      if ((this.measureMarkers && this.measureMarkers.length > 0) || (this.radiusMeasurements && this.radiusMeasurements.length > 0) || (this.angleMeasurements && this.angleMeasurements.length > 0) || (this.distanceMeasurements && this.distanceMeasurements.length > 0)) {
        this.updateMeasureMarkersAndCallouts();
      }
      return;
    }

    // Zoom scale factor: scroll UP (deltaY < 0) = zoom in, scroll DOWN (deltaY > 0) = zoom out
    const factor = e.deltaY < 0 ? 0.85 : (1.0 / 0.85);

    const camPos = this.camera.position;
    const offset = new THREE.Vector3().subVectors(camPos, hitPoint);
    const dist = offset.length();

    // Prevent zooming through pivot or beyond visible distance
    if (factor < 1 && dist * factor < 0.5) {
      // Pass-through limit reached: step camera forward along cursor ray by 1.2m into the interior
      const stepDist = 1.2;
      const rayDir = new THREE.Vector3().subVectors(hitPoint, camPos).normalize();
      if (rayDir.lengthSq() < 0.001) {
        this.camera.getWorldDirection(rayDir);
      }
      const stepVec = rayDir.clone().multiplyScalar(stepDist);
      this.camera.position.add(stepVec);
      this.controls.target.add(stepVec);
      if (this.pivotPoint) {
        this.pivotPoint.add(stepVec);
      }
      if (this.compass3d) {
        this.compass3d.update();
      }
      this.camera.updateMatrixWorld();
      if ((this.measureMarkers && this.measureMarkers.length > 0) || (this.radiusMeasurements && this.radiusMeasurements.length > 0) || (this.angleMeasurements && this.angleMeasurements.length > 0) || (this.distanceMeasurements && this.distanceMeasurements.length > 0)) {
        this.updateMeasureMarkersAndCallouts();
      }
      return;
    }
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
    this.camera.updateMatrixWorld();
    if ((this.measureMarkers && this.measureMarkers.length > 0) || (this.radiusMeasurements && this.radiusMeasurements.length > 0) || (this.angleMeasurements && this.angleMeasurements.length > 0) || (this.distanceMeasurements && this.distanceMeasurements.length > 0)) {
      this.updateMeasureMarkersAndCallouts();
    }
  }

  // Viewport double-click on component: Approach to 1.0m on first dblclick; pass through component on second dblclick
  handleDoubleClickedComponent(e) {
    if (!this.canvas || !this.camera) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const searchRoots = (this.loadedModels && this.loadedModels.length > 0) ? this.loadedModels : (this.activeModel ? [this.activeModel] : this.scene.children);
    const intersects = this.raycaster.intersectObjects(searchRoots, true);
    const valid = intersects.filter(hit => this.isPickableElement(hit.object));
    if (valid.length === 0) {
      if (this.pointCloudManager && this.pointCloudManager.pointClouds.length > 0) {
        const pcHit = this.pointCloudManager.raycast(this.raycaster, 25);
        if (pcHit && pcHit.point) {
          const hitPoint = pcHit.point;
          const currentDist = this.camera.position.distanceTo(hitPoint);
          const viewDir = new THREE.Vector3().subVectors(this.camera.position, hitPoint).normalize();
          if (viewDir.lengthSq() < 0.001) {
            this.camera.getWorldDirection(viewDir).negate();
          }
          const targetDist = Math.max(1.5, Math.min(currentDist * 0.4, 8.0));
          const targetCam = hitPoint.clone().addScaledVector(viewDir, targetDist);
          this.pivotPoint.copy(hitPoint);
          this.showPivotIndicator(hitPoint);
          this.tweenCamera(targetCam, hitPoint, 400);
        }
      }
      return;
    }

    const hit = valid[0];
    const hitMesh = hit.object;
    const hitPoint = hit.point;
    const currentDist = this.camera.position.distanceTo(hitPoint);

    // If camera is already close to the clicked point (<= 1.35m), this is the second double-click: pass through!
    if (currentDist <= 1.35) {
      const rayDir = new THREE.Vector3().subVectors(hitPoint, this.camera.position).normalize();
      if (rayDir.lengthSq() < 0.001) {
        this.camera.getWorldDirection(rayDir);
      }

      // Temporarily enable DoubleSide so raycaster detects back/exit faces
      const origSide = hitMesh.material ? (Array.isArray(hitMesh.material) ? hitMesh.material.map(m => m.side) : hitMesh.material.side) : null;
      if (Array.isArray(hitMesh.material)) {
        hitMesh.material.forEach(m => m.side = THREE.DoubleSide);
      } else if (hitMesh.material) {
        hitMesh.material.side = THREE.DoubleSide;
      }

      const forwardRay = new THREE.Raycaster(this.camera.position, rayDir, 0.001, 1000);
      const meshHits = forwardRay.intersectObject(hitMesh, true);

      // Restore original material sides
      if (Array.isArray(hitMesh.material)) {
        hitMesh.material.forEach((m, i) => m.side = origSide[i]);
      } else if (hitMesh.material) {
        hitMesh.material.side = origSide;
      }

      let exitPoint = null;
      if (meshHits.length > 0) {
        exitPoint = meshHits[meshHits.length - 1].point;
      }

      if (!exitPoint || exitPoint.distanceTo(hitPoint) < 0.05) {
        // Fallback: estimate thickness from bounding box
        const box = new THREE.Box3().setFromObject(hitMesh);
        const boxSize = new THREE.Vector3();
        box.getSize(boxSize);
        const estThickness = Math.min(Math.max(boxSize.x, boxSize.y, boxSize.z), 1.0);
        exitPoint = hitPoint.clone().addScaledVector(rayDir, Math.max(0.4, estThickness));
      }

      // Place camera 1.0m behind the exit face, looking forward
      const targetCam = exitPoint.clone().addScaledVector(rayDir, 1.0);
      const targetLookAt = targetCam.clone().addScaledVector(rayDir, 5.0);
      this.showPivotIndicator(exitPoint);
      this.tweenCamera(targetCam, targetLookAt, 400);
    } else {
      // First double-click: Approach to 1.0m from hitPoint along line of sight
      const viewDir = new THREE.Vector3().subVectors(this.camera.position, hitPoint).normalize();
      if (viewDir.lengthSq() < 0.001) {
        this.camera.getWorldDirection(viewDir).negate();
      }
      const targetCam = hitPoint.clone().addScaledVector(viewDir, 1.0);
      const targetLookAt = hitPoint.clone();
      this.showPivotIndicator(targetLookAt);
      this.tweenCamera(targetCam, targetLookAt, 400);
    }
  }
  
  // =========================================================================
  // 3D GEOMETRIC OBJECT SNAPPING ENGINE (ENDPOINT, MIDPOINT, CIRCLE/ARC CENTER)
  // =========================================================================
  createSnapEngine() {
    return new BimSnapEngine(this);
  }

  // =========================================================================
  // STANDARDIZED DRAGGABLE MEASUREMENT POINT & POINT MEASURE ENGINE
  // =========================================================================
  initMeasurementSystem() {
    this.snapEngine = new BimSnapEngine(this);
    this.measureMarkersGroup = new THREE.Group();
    this.measureMarkersGroup.name = 'MeasureMarkersGroup';
    this.measureMarkersGroup.userData = { isMeasureMarker: true };
    this.scene.add(this.measureMarkersGroup);
    this.measureMarkers = [];
    this.measurePointCounter = 0;
    this.activeMeasurePointId = null;
    this.initMeasurePointPreview();

    this.radiusMeasurements = [];
    this.radiusMeasurementCounter = 0;
    this.activeRadiusMeasurementId = null;
    this.currentRadiusTarget = null;
    this.initRadiusPreview();

    this.distanceMeasurements = [];
    this.distanceMeasurementCounter = 0;
    this.activeDistanceMeasurementId = null;
    this.pendingDistanceStart = null;
    this.initDistancePreview();
    this.initMultiPointPreview();
  }

  initMeasurePointPreview() {
    this.measurePreviewGroup = new THREE.Group();
    this.measurePreviewGroup.name = 'MeasurePreviewGroup';
    this.measurePreviewGroup.visible = false;
    this.measurePreviewGroup.renderOrder = 1300;

    const ringGeom = new THREE.RingGeometry(0.48, 0.66, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.measurePreviewGroup.add(new THREE.Mesh(ringGeom, ringMat));

    const dotGeom = new THREE.CircleGeometry(0.15, 24);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.measurePreviewGroup.add(new THREE.Mesh(dotGeom, dotMat));

    const crossVerts = new Float32Array([
      0, 0.66, 0,   0, 0.96, 0,
      0, -0.66, 0,  0, -0.96, 0,
      -0.66, 0, 0,  -0.96, 0, 0,
      0.66, 0, 0,   0.96, 0, 0
    ]);
    const crossGeom = new THREE.BufferGeometry();
    crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
    const crossMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false
    });
    this.measurePreviewGroup.add(new THREE.LineSegments(crossGeom, crossMat));

    this.scene.add(this.measurePreviewGroup);
  }

  updateMeasurePointPreview(hit) {
    if (!this.measurePreviewGroup || !hit || !hit.point) return;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    const n = slopeData.normal || new THREE.Vector3(0, 1, 0);

    const t1 = new THREE.Vector3();
    if (slopeData && !slopeData.isFlat && slopeData.downhillDir && slopeData.downhillDir.lengthSq() > 0.001) {
      t1.copy(slopeData.downhillDir).normalize();
    } else {
      const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      t1.crossVectors(ref, n).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    t1.crossVectors(t2, n).normalize();

    const basisMat = new THREE.Matrix4().makeBasis(t1, t2, n);
    this.measurePreviewGroup.position.copy(hit.point);
    this.measurePreviewGroup.quaternion.setFromRotationMatrix(basisMat);

    const ch = (this.container && this.container.clientHeight) || 1000;
    const isOrtho = Boolean(this.camera && this.camera.isOrthographicCamera);
    let worldPerPixel;
    if (isOrtho) {
      worldPerPixel = ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) / ch;
    } else {
      const dist = this.camera.position.distanceTo(hit.point);
      const fovRad = ((this.camera.fov || 45) * Math.PI) / 180;
      worldPerPixel = (2 * dist * Math.tan(fovRad / 2)) / ch;
    }
    const scale = Math.max(1e-5, worldPerPixel * 13.5);
    this.measurePreviewGroup.scale.set(scale, scale, scale);
    this.measurePreviewGroup.visible = true;
    this.requestRender(100);
  }

  hideMeasurePointPreview() {
    if (this.measurePreviewGroup && this.measurePreviewGroup.visible) {
      this.measurePreviewGroup.visible = false;
      this.requestRender(100);
    }
  }

  // =========================================================================
  // RADIUS MEASUREMENT ENGINE (ARCS, CIRCLES, SPHERES & INCOMPLETE SPHERICAL CAPS)
  // =========================================================================

  initRadiusPreview() {
    this.radiusPreviewGroup = new THREE.Group();
    this.radiusPreviewGroup.name = 'RadiusPreviewGroup';
    this.radiusPreviewGroup.visible = false;
    this.radiusPreviewGroup.renderOrder = 2400;

    // 1. Center indicator: ring + center dot + cross
    this.radiusPreviewCenterGroup = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(0.26, 0.36, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.radiusPreviewCenterGroup.add(new THREE.Mesh(ringGeom, ringMat));

    const dotGeom = new THREE.CircleGeometry(0.12, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.radiusPreviewCenterGroup.add(new THREE.Mesh(dotGeom, dotMat));

    const crossVerts = new Float32Array([
      0, 0.36, 0,   0, 0.65, 0,
      0, -0.36, 0,  0, -0.65, 0,
      -0.36, 0, 0,  -0.65, 0, 0,
      0.36, 0, 0,   0.65, 0, 0
    ]);
    const crossGeom = new THREE.BufferGeometry();
    crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
    const crossMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false
    });
    this.radiusPreviewCenterGroup.add(new THREE.LineSegments(crossGeom, crossMat));
    this.radiusPreviewGroup.add(this.radiusPreviewCenterGroup);

    // 2. Main solid radius line & cone arrowhead
    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
    this.radiusPreviewLine = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      linewidth: 3,
      depthTest: false,
      depthWrite: false
    }));
    this.radiusPreviewGroup.add(this.radiusPreviewLine);

    const coneGeom = new THREE.ConeGeometry(0.2, 0.6, 16);
    coneGeom.translate(0, -0.3, 0);
    this.radiusPreviewCone = new THREE.Mesh(coneGeom, new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthTest: false,
      depthWrite: false
    }));
    this.radiusPreviewGroup.add(this.radiusPreviewCone);

    // 3. Dashed extension line (used when sphere center is on the far side)
    const dashedGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
    this.radiusPreviewDashedLine = new THREE.Line(dashedGeom, new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 0.2,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
      depthWrite: false
    }));
    this.radiusPreviewDashedLine.computeLineDistances();
    this.radiusPreviewDashedLine.visible = false;
    this.radiusPreviewGroup.add(this.radiusPreviewDashedLine);

    this.scene.add(this.radiusPreviewGroup);

    // 4. Floating DOM Preview Badge (Single clean number on arrow)
    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    if (listEl) {
      this.radiusPreviewBadgeEl = document.createElement('div');
      this.radiusPreviewBadgeEl.className = 'measure-radius-callout preview';
      this.radiusPreviewBadgeEl.style.display = 'none';
      this.radiusPreviewBadgeEl.style.pointerEvents = 'none';
      this.radiusPreviewBadgeEl.textContent = '--';
      listEl.appendChild(this.radiusPreviewBadgeEl);
    }
  }

  // 4x4 Linear System Solver for Least-Squares Sphere Fitting
  solve4x4(M, V) {
    const A = [
      [M[0][0], M[0][1], M[0][2], M[0][3], V[0]],
      [M[1][0], M[1][1], M[1][2], M[1][3], V[1]],
      [M[2][0], M[2][1], M[2][2], M[2][3], V[2]],
      [M[3][0], M[3][1], M[3][2], M[3][3], V[3]],
    ];

    for (let col = 0; col < 4; col++) {
      let maxRow = col;
      let maxVal = Math.abs(A[col][col]);
      for (let r = col + 1; r < 4; r++) {
        if (Math.abs(A[r][col]) > maxVal) {
          maxVal = Math.abs(A[r][col]);
          maxRow = r;
        }
      }
      if (maxVal < 1e-12) return null;

      if (maxRow !== col) {
        const temp = A[col];
        A[col] = A[maxRow];
        A[maxRow] = temp;
      }

      for (let r = col + 1; r < 4; r++) {
        const factor = A[r][col] / A[col][col];
        for (let c = col; c <= 4; c++) {
          A[r][c] -= factor * A[col][c];
        }
      }
    }

    const sol = [0, 0, 0, 0];
    for (let r = 3; r >= 0; r--) {
      let sum = A[r][4];
      for (let c = r + 1; c < 4; c++) {
        sum -= A[r][c] * sol[c];
      }
      if (Math.abs(A[r][r]) < 1e-12) return null;
      sol[r] = sum / A[r][r];
    }

    return sol;
  }

  fitSphereLeastSquares(points) {
    if (!points || points.length < 5) return null;

    const M = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    const V = [0, 0, 0, 0];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = p.x, y = p.y, z = p.z;
      const sq = x * x + y * y + z * z;
      const row = [x, y, z, 1];

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          M[r][c] += row[r] * row[c];
        }
        V[r] += row[r] * sq;
      }
    }

    const sol = this.solve4x4(M, V);
    if (!sol) return null;

    const cx = sol[0] * 0.5;
    const cy = sol[1] * 0.5;
    const cz = sol[2] * 0.5;
    const rSq = sol[3] + cx * cx + cy * cy + cz * cz;
    if (rSq <= 1e-6) return null;

    const radius = Math.sqrt(rSq);
    const center = new THREE.Vector3(cx, cy, cz);

    let sumSqErr = 0;
    for (let i = 0; i < points.length; i++) {
      const d = points[i].distanceTo(center) - radius;
      sumSqErr += d * d;
    }
    const rmse = Math.sqrt(sumSqErr / points.length);

    return { center, radius, rmse };
  }

  // 2D Liang-Barsky Screen Line Segment Clipping
  clipSegmentToScreen(x0, y0, x1, y1, xmin, xmax, ymin, ymax) {
    const dx = x1 - x0;
    const dy = y1 - y0;

    let t0 = 0.0;
    let t1 = 1.0;

    const p = [-dx, dx, -dy, dy];
    const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];

    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) {
        if (q[i] < 0) return null;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return null;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return null;
          if (t < t1) t1 = t;
        }
      }
    }

    return { t0, t1 };
  }

  detectRadiusTarget(hit, clientX, clientY) {
    if (!hit || !hit.object || !this.camera) return null;
    const mesh = hit.object;
    if (!this.isPickableElement(mesh) || !mesh.geometry) return null;

    mesh.updateWorldMatrix(true, false);
    const matrixWorld = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);

    // 1. First Priority: Detect Circle / Arc loops (from extracted mesh features)
    if (this.snapEngine) {
      const features = this.snapEngine.extractMeshFeatures(mesh);
      if (features && features.arcLoops && features.arcLoops.length > 0) {
        let bestArc = null;
        let bestDistSq = Infinity;
        let bestTargetPt = null;

        const cw = (this.container && this.container.clientWidth) || 800;
        const ch = (this.container && this.container.clientHeight) || 600;
        const rect = this.canvas.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        const mouseRay = this.raycaster ? this.raycaster.ray : null;
        const ptOnRay = new THREE.Vector3();
        const ptOnSeg = new THREE.Vector3();
        const projPt = new THREE.Vector3();

        for (const arc of features.arcLoops) {
          const worldCenter = arc.center.clone().applyMatrix4(matrixWorld);
          const worldNormal = arc.normal.clone().applyMatrix3(normalMatrix).normalize();
          const worldPts = arc.points.map(p => p.clone().applyMatrix4(matrixWorld));

          // Test if mouse ray or hit point is near perimeter
          for (let j = 0; j < worldPts.length - 1; j++) {
            const p0 = worldPts[j];
            const p1 = worldPts[j + 1];

            if (mouseRay) {
              mouseRay.distanceSqToSegment(p0, p1, ptOnRay, ptOnSeg);
              projPt.copy(ptOnSeg).project(this.camera);
              if (projPt.z >= -1.0 && projPt.z <= 1.0) {
                const sx = (projPt.x * 0.5 + 0.5) * cw;
                const sy = (-projPt.y * 0.5 + 0.5) * ch;
                const dSq = (sx - localX) * (sx - localX) + (sy - localY) * (sy - localY);
                if (dSq < bestDistSq && dSq < 35 * 35) {
                  bestDistSq = dSq;
                  bestArc = arc;
                  const d0 = ptOnSeg.distanceToSquared(p0);
                  const d1 = ptOnSeg.distanceToSquared(p1);
                  bestTargetPt = (d0 <= d1 ? p0 : p1).clone();
                }
              }
            }
          }
        }

        if (bestArc && bestTargetPt) {
          const worldCenter = bestArc.center.clone().applyMatrix4(matrixWorld);
          const worldNormal = bestArc.normal.clone().applyMatrix3(normalMatrix).normalize();
          return {
            type: 'arc',
            geomType: bestArc.isClosed ? 'circle' : 'arc',
            center: worldCenter,
            radius: worldCenter.distanceTo(bestTargetPt),
            normal: worldNormal,
            targetPoint: bestTargetPt,
            mesh,
            isClosed: bestArc.isClosed,
            isCenterFarSide: false
          };
        }
      }
    }

    // 2. Second Priority: Detect Sphere / Spherical Surface by Least Squares curvature fitting
    const geom = mesh.geometry;
    const pos = geom.attributes.position;
    if (!pos || pos.count < 6) return null;
    const index = geom.index;
    const faceIndex = hit.faceIndex;
    if (faceIndex === undefined || faceIndex === null) return null;

    // Cache vertex-to-triangle adjacency map on geometry
    if (!geom.userData._vToTris) {
      const vToTris = new Map();
      const triCount = index ? index.count / 3 : pos.count / 3;
      for (let t = 0; t < triCount; t++) {
        const a = index ? index.getX(t * 3) : t * 3;
        const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        if (!vToTris.has(a)) vToTris.set(a, []);
        vToTris.get(a).push(t);
        if (!vToTris.has(b)) vToTris.set(b, []);
        vToTris.get(b).push(t);
        if (!vToTris.has(c)) vToTris.set(c, []);
        vToTris.get(c).push(t);
      }
      geom.userData._vToTris = vToTris;
    }
    const vToTris = geom.userData._vToTris;

    const i0 = index ? index.getX(faceIndex * 3) : faceIndex * 3;
    const i1 = index ? index.getX(faceIndex * 3 + 1) : faceIndex * 3 + 1;
    const i2 = index ? index.getX(faceIndex * 3 + 2) : faceIndex * 3 + 2;

    const ring1Tris = new Set();
    for (const v of [i0, i1, i2]) {
      const tris = vToTris.get(v) || [];
      for (let k = 0; k < tris.length; k++) ring1Tris.add(tris[k]);
    }
    const ring1Verts = new Set();
    for (const tr of ring1Tris) {
      for (let k = 0; k < 3; k++) {
        ring1Verts.add(index ? index.getX(tr * 3 + k) : tr * 3 + k);
      }
    }
    const ring2Tris = new Set();
    for (const v of ring1Verts) {
      const tris = vToTris.get(v) || [];
      for (let k = 0; k < tris.length; k++) ring2Tris.add(tris[k]);
    }

    const uniqueWorldPts = [];
    const visitedVerts = new Set();
    for (const tr of ring2Tris) {
      for (let k = 0; k < 3; k++) {
        const idx = index ? index.getX(tr * 3 + k) : tr * 3 + k;
        if (!visitedVerts.has(idx)) {
          visitedVerts.add(idx);
          const pt = new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(matrixWorld);
          uniqueWorldPts.push(pt);
        }
      }
    }

    if (uniqueWorldPts.length < 6) return null;

    const fit = this.fitSphereLeastSquares(uniqueWorldPts);
    if (!fit || fit.radius < 0.01 || fit.radius > 5000) return null;
    const maxAllowedRmse = Math.max(0.005, fit.radius * 0.02);
    if (fit.rmse > maxAllowedRmse) return null;

    // Closest mesh vertex to hit.point
    let closestVertex = null;
    let minD = Infinity;
    for (let k = 0; k < uniqueWorldPts.length; k++) {
      const d = uniqueWorldPts[k].distanceToSquared(hit.point);
      if (d < minD) {
        minD = d;
        closestVertex = uniqueWorldPts[k];
      }
    }
    if (!closestVertex) return null;

    // Far side check: whether sphere center is on the far side of visible surface
    const uOut = new THREE.Vector3().subVectors(closestVertex, fit.center).normalize();
    const vCam = new THREE.Vector3();
    if (this.camera.isOrthographicCamera) {
      this.camera.getWorldDirection(vCam);
    } else {
      vCam.subVectors(closestVertex, this.camera.position).normalize();
    }
    const isCenterFarSide = (uOut.dot(vCam) < 0);

    return {
      type: 'sphere',
      geomType: 'sphere',
      center: fit.center,
      radius: fit.radius,
      normal: uOut,
      targetPoint: closestVertex,
      mesh,
      isClosed: true,
      isCenterFarSide
    };
  }

  updateRadiusPreview(target) {
    if (!this.radiusPreviewGroup || !target) return;
    this.currentRadiusTarget = target;

    const cw = (this.container && this.container.clientWidth) || 800;
    const ch = (this.container && this.container.clientHeight) || 600;
    const isOrtho = Boolean(this.camera && this.camera.isOrthographicCamera);

    let worldPerPixel;
    if (isOrtho) {
      worldPerPixel = ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) / ch;
    } else {
      const dist = this.camera.position.distanceTo(target.targetPoint);
      const fovRad = ((this.camera.fov || 45) * Math.PI) / 180;
      worldPerPixel = (2 * dist * Math.tan(fovRad / 2)) / ch;
    }
    const markerScale = Math.max(1e-5, worldPerPixel * 10);

    const C = target.center;
    const P = target.targetPoint;

    let arrowStart, arrowEnd;
    let conePos, coneDir;

    if (!target.isCenterFarSide) {
      // Normal internal arrow: from Center C to Target Point P
      arrowStart = C;
      arrowEnd = P;
      conePos = P;
      coneDir = new THREE.Vector3().subVectors(P, C).normalize();
      this.radiusPreviewDashedLine.visible = false;
      this.radiusPreviewCenterGroup.visible = true;
      this.radiusPreviewCenterGroup.position.copy(C);
      const cDist = isOrtho ? 1 : this.camera.position.distanceTo(C);
      const cWorldPerPix = isOrtho ? worldPerPixel : (2 * cDist * Math.tan(((this.camera.fov || 45) * Math.PI) / 360)) / ch;
      const cScale = Math.max(1e-5, cWorldPerPix * 10);
      this.radiusPreviewCenterGroup.scale.set(cScale, cScale, cScale);
      this.radiusPreviewCenterGroup.quaternion.copy(this.camera.quaternion);
    } else {
      // Far side center (convex sphere viewed from outside):
      // Arrow from outside pointing inward to P
      const uOut = target.normal || new THREE.Vector3().subVectors(P, C).normalize();
      const arrowLen = Math.min(target.radius * 0.45, Math.max(0.15, worldPerPixel * 140));
      const Pouter = P.clone().addScaledVector(uOut, arrowLen);
      arrowStart = Pouter;
      arrowEnd = P;
      conePos = P;
      coneDir = uOut.clone().negate();

      // Semi-transparent dashed line from P to C
      this.radiusPreviewDashedLine.visible = true;
      this.radiusPreviewDashedLine.geometry.setFromPoints([P, C]);
      this.radiusPreviewDashedLine.computeLineDistances();

      // Center marker at C
      this.radiusPreviewCenterGroup.visible = true;
      this.radiusPreviewCenterGroup.position.copy(C);
      const cDist = isOrtho ? 1 : this.camera.position.distanceTo(C);
      const cWorldPerPix = isOrtho ? worldPerPixel : (2 * cDist * Math.tan(((this.camera.fov || 45) * Math.PI) / 360)) / ch;
      const cScale = Math.max(1e-5, cWorldPerPix * 10);
      this.radiusPreviewCenterGroup.scale.set(cScale, cScale, cScale);
      this.radiusPreviewCenterGroup.quaternion.copy(this.camera.quaternion);
    }

    // Update Solid Arrow Line
    this.radiusPreviewLine.geometry.setFromPoints([arrowStart, arrowEnd]);

    // Update Arrow Cone
    const coneScale = Math.max(1e-5, worldPerPixel * 10);
    this.radiusPreviewCone.position.copy(conePos);
    this.radiusPreviewCone.scale.set(coneScale, coneScale, coneScale);
    const upVec = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(upVec, coneDir);
    this.radiusPreviewCone.quaternion.copy(quat);

    this.radiusPreviewGroup.visible = true;

    // Update Floating Text Badge with Liang-Barsky Screen Clamping
    if (this.radiusPreviewBadgeEl) {
      const proj0 = arrowStart.clone().project(this.camera);
      const proj1 = arrowEnd.clone().project(this.camera);

      if ((proj0.z > 1.0 && proj1.z > 1.0) || (proj0.z < -1.0 && proj1.z < -1.0)) {
        this.radiusPreviewBadgeEl.style.display = 'none';
      } else {
        const s0x = (proj0.x * 0.5 + 0.5) * cw;
        const s0y = (-proj0.y * 0.5 + 0.5) * ch;
        const s1x = (proj1.x * 0.5 + 0.5) * cw;
        const s1y = (-proj1.y * 0.5 + 0.5) * ch;

        const safeMargin = 32;
        const clipRes = this.clipSegmentToScreen(s0x, s0y, s1x, s1y, safeMargin, cw - safeMargin, safeMargin, ch - safeMargin);

        if (!clipRes) {
          this.radiusPreviewBadgeEl.style.display = 'none';
        } else {
          const tClamped = Math.max(clipRes.t0, Math.min(clipRes.t1, 0.5));
          const badgeX = s0x + tClamped * (s1x - s0x);
          const badgeY = s0y + tClamped * (s1y - s0y);

          const unit = this.measureUnit || 'm';
          const scale = unit === 'mm' ? 1000 : 1;
          const rFormatted = (target.radius * scale).toFixed(unit === 'mm' ? 0 : 3);

          this.radiusPreviewBadgeEl.textContent = `R ${rFormatted} ${unit}`;
          this.radiusPreviewBadgeEl.style.display = 'block';
          this.radiusPreviewBadgeEl.style.transform = `translate3d(${Math.round(badgeX)}px, ${Math.round(badgeY)}px, 0) translate(-50%, -50%)`;
        }
      }
    }

    this.requestRender(100);
  }

  hideRadiusPreview() {
    this.currentRadiusTarget = null;
    if (this.radiusPreviewGroup && this.radiusPreviewGroup.visible) {
      this.radiusPreviewGroup.visible = false;
    }
    if (this.radiusPreviewBadgeEl && this.radiusPreviewBadgeEl.style.display !== 'none') {
      this.radiusPreviewBadgeEl.style.display = 'none';
    }
    this.requestRender(100);
  }

  // =========================================================================
  // TWO-POINT DISTANCE MEASUREMENT & RUBBERBAND PREVIEW ENGINE
  // =========================================================================
  computeDistanceSlope(p1, p2) {
    if (!p1 || !p2) return null;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs((-p2.z) - (-p1.z));
    const dz = Math.abs(p2.y - p1.y);
    const dHoriz = Math.hypot(dx, dy);

    if (dHoriz < 1e-5 && dz < 1e-5) {
      return { isFlat: true, isVertical: false, angleDeg: 0, percent: 0, ratioX: Infinity };
    }
    if (dHoriz < 1e-5) {
      return { isFlat: false, isVertical: true, angleDeg: 90, percent: Infinity, ratioX: 0 };
    }
    if (dz < 1e-5) {
      return { isFlat: true, isVertical: false, angleDeg: 0, percent: 0, ratioX: Infinity };
    }

    const angleRad = Math.atan2(dz, dHoriz);
    const angleDeg = (angleRad * 180) / Math.PI;
    const percent = (dz / dHoriz) * 100;
    const ratioX = dHoriz / dz;

    return {
      isFlat: false,
      isVertical: false,
      angleDeg,
      percent,
      ratioX
    };
  }

  formatSlopeExpressions(slopeData) {
    if (!slopeData) return { ratio: '--', pct: '--', deg: '--', full: '--' };
    if (slopeData.isFlat) {
      const flatLabel = I18N.t('measureSlopeFlat') || 'Flat';
      return { ratio: '1:∞', pct: '0.0%', deg: '0.0°', full: flatLabel };
    }
    if (slopeData.isVertical) {
      const vertLabel = I18N.t('measureSlopeVertical') || 'Vertical';
      return { ratio: '1:0', pct: '∞%', deg: '90.0°', full: vertLabel };
    }
    const ratio = slopeData.ratioX >= 100
      ? `1:${Math.round(slopeData.ratioX)}`
      : `1:${slopeData.ratioX.toFixed(1)}`;
    const pct = `${slopeData.percent.toFixed(1)}%`;
    const deg = `${slopeData.angleDeg.toFixed(1)}°`;
    return {
      ratio,
      pct,
      deg,
      full: `${ratio} · ${pct} · ${deg}`
    };
  }

  createXYZDecompGroup(p1, p2) {
    const group = new THREE.Group();
    group.renderOrder = 1204;

    const makeLine = (colorHex) => {
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineDashedMaterial({
        color: colorHex,
        dashSize: 0.25,
        gapSize: 0.08,
        depthTest: false,
        depthWrite: false
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 1204;
      line.visible = false;
      group.add(line);
      return line;
    };

    const xLine = makeLine(0xff3b30); // High-contrast Scarlet Red: Easting ΔX
    const yLine = makeLine(0x00e676); // High-contrast Vivid Spring Green: Northing ΔY
    const zLine = makeLine(0x0050ff); // Pure Blue (#0050ff): Elevation ΔZ

    group.userData = { xLine, yLine, zLine };
    if (p1 && p2) {
      this.updateXYZDecompGroup(group, p1, p2);
    }
    return group;
  }

  updateXYZDecompGroup(group, p1, p2) {
    if (!group || !group.userData || !p1 || !p2) return;
    const { xLine, yLine, zLine } = group.userData;

    // Corner 1: Easting delta along X
    const c1 = new THREE.Vector3(p2.x, p1.y, p1.z);
    // Corner 2: Northing delta along Three.js Z
    const c2 = new THREE.Vector3(p2.x, p1.y, p2.z);

    const updateSeg = (line, start, end) => {
      const len = start.distanceTo(end);
      if (len < 1e-4) {
        line.visible = false;
      } else {
        const pos = line.geometry.attributes.position;
        pos.setXYZ(0, start.x, start.y, start.z);
        pos.setXYZ(1, end.x, end.y, end.z);
        pos.needsUpdate = true;
        line.computeLineDistances();
        line.visible = true;
      }
    };

    updateSeg(xLine, p1, c1);
    updateSeg(yLine, c1, c2);
    updateSeg(zLine, c2, p2);
  }

  initDistancePreview() {
    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.distancePreviewLine = new THREE.Line(lineGeom, new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 0.20,
      gapSize: 0.12,
      depthTest: false,
      depthWrite: false
    }));
    this.distancePreviewLine.computeLineDistances();
    this.distancePreviewLine.visible = false;
    this.distancePreviewLine.renderOrder = 2300;
    this.scene.add(this.distancePreviewLine);

    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    if (listEl) {
      this.distancePreviewBadgeEl = document.createElement('div');
      this.distancePreviewBadgeEl.className = 'measure-distance-callout preview';
      this.distancePreviewBadgeEl.style.display = 'none';
      this.distancePreviewBadgeEl.style.pointerEvents = 'none';
      this.distancePreviewBadgeEl.textContent = '--';
      listEl.appendChild(this.distancePreviewBadgeEl);
    }
  }

  updateDistancePreview(candidateHit) {
    if (!this.pendingDistanceStart || !candidateHit || !candidateHit.point) {
      this.hideDistancePreview();
      return;
    }
    const p1 = this.pendingDistanceStart.point;
    const p2 = candidateHit.point;
    const dist = p1.distanceTo(p2);

    if (!this.distancePreviewLine) this.initDistancePreview();

    // 1. Update Dashed Line
    if (this.distancePreviewLine) {
      const positions = this.distancePreviewLine.geometry.attributes.position;
      positions.setXYZ(0, p1.x, p1.y, p1.z);
      positions.setXYZ(1, p2.x, p2.y, p2.z);
      positions.needsUpdate = true;
      if (this.distancePreviewLine.computeLineDistances) {
        this.distancePreviewLine.computeLineDistances();
      }
      this.distancePreviewLine.visible = true;
    }

    // 2. Update Dynamic Distance Badge (Screen-clamped)
    if (this.distancePreviewBadgeEl) {
      const unit = this.measureUnit || 'm';
      const scale = unit === 'mm' ? 1000 : 1;
      const formattedDist = (dist * scale).toFixed(unit === 'mm' ? 0 : 3);
      this.distancePreviewBadgeEl.textContent = `${formattedDist} ${unit}`;

      const cw = this.container.clientWidth || 1;
      const ch = this.container.clientHeight || 1;
      const projVec = new THREE.Vector3();

      projVec.copy(p1).project(this.camera);
      const s0x = (projVec.x * 0.5 + 0.5) * cw;
      const s0y = (-projVec.y * 0.5 + 0.5) * ch;

      projVec.copy(p2).project(this.camera);
      const s1x = (projVec.x * 0.5 + 0.5) * cw;
      const s1y = (-projVec.y * 0.5 + 0.5) * ch;

      const safeMargin = 16;
      const clipRes = this.clipSegmentToScreen(s0x, s0y, s1x, s1y, safeMargin, cw - safeMargin, safeMargin, ch - safeMargin);
      if (!clipRes) {
        this.distancePreviewBadgeEl.style.display = 'none';
      } else {
        const t = Math.max(clipRes.t0, Math.min(clipRes.t1, 0.5));
        const bx = s0x + t * (s1x - s0x);
        const by = s0y + t * (s1y - s0y);

        this.distancePreviewBadgeEl.style.display = 'block';
        this.distancePreviewBadgeEl.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0) translate(-50%, -50%)`;
      }
    }

    // 3. Update XYZ Decomposition Preview Lines
    if (!this.distancePreviewDecompGroup) {
      this.distancePreviewDecompGroup = this.createXYZDecompGroup(p1, p2);
      this.scene.add(this.distancePreviewDecompGroup);
    } else {
      this.updateXYZDecompGroup(this.distancePreviewDecompGroup, p1, p2);
      this.distancePreviewDecompGroup.visible = true;
    }

    // 4. Live Side Panel Feedback for Deltas and Slope
    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    const p2El = document.getElementById('measure-res-p2');
    if (p2El) p2El.textContent = `(${(p2.x * scale).toFixed(2)}, ${(-p2.z * scale).toFixed(2)}, ${(p2.y * scale).toFixed(2)})`;
    const distEl = document.getElementById('measure-res-distance');
    if (distEl) distEl.textContent = `${(dist * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unit}`;
    const dxEl = document.getElementById('measure-res-dx');
    if (dxEl) dxEl.textContent = `${(Math.abs(p2.x - p1.x) * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unit}`;
    const dyEl = document.getElementById('measure-res-dy');
    if (dyEl) dyEl.textContent = `${(Math.abs((-p2.z) - (-p1.z)) * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unit}`;
    const dzEl = document.getElementById('measure-res-dz');
    if (dzEl) dzEl.textContent = `${(Math.abs(p2.y - p1.y) * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unit}`;
    const slopeData = this.computeDistanceSlope(p1, p2);
    const slopeExp = this.formatSlopeExpressions(slopeData);
    const rEl = document.getElementById('measure-res-slope-ratio');
    if (rEl) rEl.textContent = slopeExp.ratio;
    const pEl = document.getElementById('measure-res-slope-pct');
    if (pEl) pEl.textContent = slopeExp.pct;
    const dEl = document.getElementById('measure-res-slope-deg');
    if (dEl) dEl.textContent = slopeExp.deg;
    const slopeEl = document.getElementById('measure-res-slope');
    if (slopeEl) slopeEl.textContent = slopeExp.full;

    this.requestRender(100);
  }

  hideDistancePreview() {
    if (this.distancePreviewLine && this.distancePreviewLine.visible) {
      this.distancePreviewLine.visible = false;
    }
    if (this.distancePreviewDecompGroup) {
      this.distancePreviewDecompGroup.visible = false;
    }
    if (this.distancePreviewBadgeEl && this.distancePreviewBadgeEl.style.display !== 'none') {
      this.distancePreviewBadgeEl.style.display = 'none';
    }
    this.requestRender(100);
  }

  cancelPendingDistanceStart() {
    if (this.pendingDistanceStart) {
      if (this.pendingDistanceStart.marker1) {
        this.deleteMeasurePoint(this.pendingDistanceStart.marker1.id);
      }
      this.pendingDistanceStart = null;
    }
    if (this.distancePreviewDecompGroup) {
      this.distancePreviewDecompGroup.visible = false;
    }
    this.hideDistancePreview();
    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl && this.measureMode === 'distance') {
      hintEl.textContent = I18N.t('measurePromptPickFirst');
    }
    this.requestRender(150);
  }

  createDistanceEndpointMarker(hit, role = 'p1', distId = null) {
    if (!hit || !hit.point) return null;
    if (!this.measureMarkersGroup) this.initMeasurementSystem();

    const id = `dist-pt-${++this.measurePointCounter}`;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    const meshParts = this.createStandardMeasureMarkerMesh(id, {
      showSlopeArrow: false,
      themeColor: 0x00f0ff
    });

    const marker = {
      id,
      mode: 'distance',
      endpointRole: role, // 'p1' | 'p2'
      distanceMeasurementId: distId,
      point: hit.point.clone(),
      normal: slopeData.normal.clone(),
      slopeData,
      showSlopeArrow: false,
      baseColor: 0x00f0ff,
      calloutOffset: { x: 0, y: 0 },
      calloutEl: null,
      leaderLineEl: null,
      leaderDotEl: null,
      ...meshParts
    };

    this.measureMarkersGroup.add(marker.group);
    this.measureMarkers.push(marker);

    this.orientMeasureMarkerToSurface(marker);
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
    return marker;
  }

  updateDistanceEndpointFromHit(marker, hit) {
    if (!marker || !hit || !hit.point) return;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    marker.point.copy(hit.point);
    marker.normal.copy(slopeData.normal);
    marker.slopeData = slopeData;
    this.orientMeasureMarkerToSurface(marker);

    const distRec = this.distanceMeasurements.find(d => d.id === marker.distanceMeasurementId);
    if (distRec) {
      const p1 = distRec.marker1.point;
      const p2 = distRec.marker2.point;
      const dist = p1.distanceTo(p2);
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs((-p2.z) - (-p1.z));
      const dz = Math.abs(p2.y - p1.y);
      distRec.data = { p1: p1.clone(), p2: p2.clone(), dist, dx, dy, dz };

      // Update 3D connecting line
      if (distRec.line) {
        distRec.line.geometry.setFromPoints([p1, p2]);
        distRec.line.geometry.attributes.position.needsUpdate = true;
      }

      // Update 3D XYZ Decomposition Lines
      if (distRec.decompGroup) {
        this.updateXYZDecompGroup(distRec.decompGroup, p1, p2);
      }

      // Update 2D distance callout text & tooltip
      this.updateDistanceCalloutDOM(distRec);

      // If active, sync side panel
      if (this.activeDistanceMeasurementId === distRec.id) {
        this.lastMeasurementData = distRec.data;
        this.renderMeasurementResults();
      }
    }
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  updateDistanceCalloutDOM(distRec) {
    if (!distRec || !distRec.calloutEl || !distRec.data) return;
    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    const decimals = unit === 'mm' ? 0 : 3;
    const dVal = (distRec.data.dist * scale).toFixed(decimals);
    const dxVal = (distRec.data.dx * scale).toFixed(decimals);
    const dyVal = (distRec.data.dy * scale).toFixed(decimals);
    const dzVal = (distRec.data.dz * scale).toFixed(decimals);

    distRec.calloutEl.textContent = `${dVal} ${unit}`;
    const slopeData = this.computeDistanceSlope(distRec.data.p1, distRec.data.p2);
    const slopeStr = this.formatSlopeString(slopeData);
    const slopeLabel = I18N.t('measureSlope') || 'Slope';
    distRec.calloutEl.title = `${I18N.t('measureDist')}: ${dVal} ${unit}\nΔX: ${dxVal} ${unit}\nΔY: ${dyVal} ${unit}\nΔZ: ${dzVal} ${unit}\n${slopeLabel}: ${slopeStr}\nClick to copy, Shift+Click to delete`;
  }

  deleteDistanceMeasurement(id) {
    if (!this.distanceMeasurements) return;
    const idx = this.distanceMeasurements.findIndex(d => d.id === id);
    if (idx < 0) return;
    const distRec = this.distanceMeasurements[idx];

    // Remove Endpoint 1 & 2
    if (distRec.marker1) {
      this.deleteMeasurePoint(distRec.marker1.id);
    }
    if (distRec.marker2) {
      this.deleteMeasurePoint(distRec.marker2.id);
    }

    // Remove 3D connecting line
    if (distRec.line) {
      if (distRec.line.geometry) distRec.line.geometry.dispose();
      if (distRec.line.material) distRec.line.material.dispose();
      this.scene.remove(distRec.line);
    }

    // Remove 3D XYZ Decomposition lines
    if (distRec.decompGroup) {
      distRec.decompGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.scene.remove(distRec.decompGroup);
    }

    // Remove 2D Callout
    if (distRec.calloutEl && distRec.calloutEl.parentNode) {
      distRec.calloutEl.parentNode.removeChild(distRec.calloutEl);
    }

    this.distanceMeasurements.splice(idx, 1);
    if (this.activeDistanceMeasurementId === id) {
      this.activeDistanceMeasurementId = this.distanceMeasurements.length > 0
        ? this.distanceMeasurements[this.distanceMeasurements.length - 1].id
        : null;
      const curActive = this.distanceMeasurements.find(d => d.id === this.activeDistanceMeasurementId);
      this.lastMeasurementData = curActive ? curActive.data : null;
    }

    this.renderMeasurementResults();
    this.requestRender(200);
  }


  // ============================================================================
  // ANGLE MEASUREMENT SYSTEM (Three-point Vertex-Arm1-Arm2 Engine)
  // ============================================================================

  createAngleEndpointMarker(hit, role = 'vertex', angleId = null) {
    if (!hit || !hit.point) return null;
    if (!this.measureMarkersGroup) this.initMeasurementSystem();

    const id = `angle-pt-${++this.measurePointCounter}`;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    const meshParts = this.createStandardMeasureMarkerMesh(id, {
      showSlopeArrow: false,
      themeColor: 0x00f0ff
    });

    const marker = {
      id,
      mode: 'angle',
      endpointRole: role, // 'vertex' | 'arm1' | 'arm2'
      angleMeasurementId: angleId,
      point: hit.point.clone(),
      normal: slopeData.normal.clone(),
      slopeData,
      showSlopeArrow: false,
      baseColor: 0x00f0ff,
      calloutOffset: { x: 0, y: 0 },
      calloutEl: null,
      leaderLineEl: null,
      leaderDotEl: null,
      ...meshParts
    };

    this.measureMarkersGroup.add(marker.group);
    this.measureMarkers.push(marker);

    this.orientMeasureMarkerToSurface(marker);
    return marker;
  }

  computeAngleMeasurementData(V, A, B) {
    // Vectors in 3D: u = A - V, w = B - V
    const u = new THREE.Vector3().subVectors(A, V);
    const w = new THREE.Vector3().subVectors(B, V);
    const L1 = u.length();
    const L2 = w.length();

    let angle3D = 0;
    if (L1 >= 1e-6 && L2 >= 1e-6) {
      const dot3D = Math.max(-1, Math.min(1, u.dot(w) / (L1 * L2)));
      angle3D = Math.acos(dot3D) * (180 / Math.PI);
    }

    // Horizontal plane: benchmark elevation is V.y
    const Aproj = new THREE.Vector3(A.x, V.y, A.z);
    const Bproj = new THREE.Vector3(B.x, V.y, B.z);
    const uh = new THREE.Vector3().subVectors(Aproj, V);
    const wh = new THREE.Vector3().subVectors(Bproj, V);
    const L1h = uh.length();
    const L2h = wh.length();

    let angleHoriz = 0;
    if (L1h >= 1e-6 && L2h >= 1e-6) {
      const dotH = Math.max(-1, Math.min(1, uh.dot(wh) / (L1h * L2h)));
      angleHoriz = Math.acos(dotH) * (180 / Math.PI);
    }

    return {
      V: V.clone(),
      A: A.clone(),
      B: B.clone(),
      L1,
      L2,
      L1h,
      L2h,
      angle3D,
      angleHoriz,
      Aproj,
      Bproj
    };
  }

  formatAngleDMS(deg) {
    if (deg == null || isNaN(deg)) return '--';
    const d = Math.floor(deg);
    const remM = (deg - d) * 60;
    let m = Math.floor(remM);
    let s = Math.round((remM - m) * 60);
    if (s >= 60) {
      s = 0;
      m += 1;
    }
    if (m >= 60) {
      m = 0;
      d += 1;
    }
    const mStr = m < 10 ? '0' + m : '' + m;
    const sStr = s < 10 ? '0' + s : '' + s;
    return `${d}° ${mStr}' ${sStr}"`;
  }

  createAngleProjectionGroup(V, A, B, Aproj, Bproj) {
    const group = new THREE.Group();
    group.renderOrder = 1204;

    const makeDashed = (color = 0x38bdf8) => {
      const mat = new THREE.LineDashedMaterial({
        color,
        dashSize: 0.22,
        gapSize: 0.08,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.85
      });
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 1204;
      line.frustumCulled = false;
      group.add(line);
      return line;
    };

    const horiz1 = makeDashed(0x38bdf8); // V -> Aproj
    const horiz2 = makeDashed(0x38bdf8); // V -> Bproj
    const plumb1 = makeDashed(0x0050ff); // A -> Aproj (Vertical)
    const plumb2 = makeDashed(0x0050ff); // B -> Bproj (Vertical)

    group.userData = { horiz1, horiz2, plumb1, plumb2 };
    this.updateAngleProjectionGroup(group, V, A, B, Aproj, Bproj);
    return group;
  }

  updateAngleProjectionGroup(group, V, A, B, Aproj, Bproj) {
    if (!group || !group.userData) return;
    const { horiz1, horiz2, plumb1, plumb2 } = group.userData;

    const updateLine = (line, p1, p2) => {
      if (!line) return;
      if (p1.distanceTo(p2) < 1e-4) {
        line.visible = false;
      } else {
        line.visible = true;
        line.geometry.setFromPoints([p1, p2]);
        line.geometry.attributes.position.needsUpdate = true;
        if (line.computeLineDistances) line.computeLineDistances();
      }
    };

    updateLine(horiz1, V, Aproj);
    updateLine(horiz2, V, Bproj);
    updateLine(plumb1, A, Aproj);
    updateLine(plumb2, B, Bproj);
  }

  createAngleArcMesh(V, A, B, isHorizontal, data) {
    const P1 = isHorizontal ? data.Aproj : A;
    const P2 = isHorizontal ? data.Bproj : B;
    const len1 = V.distanceTo(P1);
    const len2 = V.distanceTo(P2);

    const geom = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 1206;
    line.frustumCulled = false;

    if (len1 < 1e-4 || len2 < 1e-4) {
      geom.setFromPoints([V, V]);
      return { line, midPoint: V.clone() };
    }

    const midPoint = this.updateAngleArcMesh(line, V, A, B, isHorizontal, data);
    return { line, midPoint };
  }

  updateAngleArcMesh(line, V, A, B, isHorizontal, data) {
    if (!line || !line.geometry) return V.clone();
    const P1 = isHorizontal ? data.Aproj : A;
    const P2 = isHorizontal ? data.Bproj : B;
    const len1 = V.distanceTo(P1);
    const len2 = V.distanceTo(P2);

    if (len1 < 1e-4 || len2 < 1e-4) {
      line.visible = false;
      return V.clone();
    }

    // Edge-constrained base radius (at most 25% of shorter arm)
    const edgeR = 0.25 * Math.min(len1, len2);

    // Camera distance-adaptive clamp:
    // When the camera zooms in close to vertex V, adaptively shrink R so the arc
    // stays visible inside the view frustum and in front of the camera near plane.
    let camDist = 10;
    if (this.camera) {
      if (this.camera.isOrthographicCamera) {
        camDist = ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) * 0.5;
      } else {
        camDist = this.camera.position.distanceTo(V);
      }
    }
    const maxCamR = Math.max(0.04, camDist * 0.25);
    const maxWorldR = 2.5;
    const R = Math.max(0.02, Math.min(edgeR, maxCamR, maxWorldR));

    const v1 = new THREE.Vector3().subVectors(P1, V).normalize();
    const v2 = new THREE.Vector3().subVectors(P2, V).normalize();
    const dot = Math.max(-1, Math.min(1, v1.dot(v2)));
    const theta = Math.acos(dot);

    let norm = new THREE.Vector3().crossVectors(v1, v2);
    if (norm.lengthSq() < 1e-6) {
      norm = isHorizontal ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0).cross(v1);
      if (norm.lengthSq() < 1e-6) norm = new THREE.Vector3(1, 0, 0);
    }
    norm.normalize();
    const vPerp = new THREE.Vector3().crossVectors(norm, v1).normalize();

    const segments = 32;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * theta;
      const pt = new THREE.Vector3().copy(V)
        .addScaledVector(v1, R * Math.cos(t))
        .addScaledVector(vPerp, R * Math.sin(t));
      points.push(pt);
    }

    line.geometry.setFromPoints(points);
    line.geometry.attributes.position.needsUpdate = true;
    line.frustumCulled = false;
    line.visible = true;

    const midT = theta * 0.5;
    const midPoint = new THREE.Vector3().copy(V)
      .addScaledVector(v1, R * 1.25 * Math.cos(midT))
      .addScaledVector(vPerp, R * 1.25 * Math.sin(midT));

    return midPoint;
  }

  initAnglePreview() {
    if (!this.anglePreviewLine) {
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineDashedMaterial({
        color: 0xf59e0b,
        dashSize: 0.25,
        gapSize: 0.1,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95
      });
      this.anglePreviewLine = new THREE.Line(geom, mat);
      this.anglePreviewLine.renderOrder = 1205;
      this.scene.add(this.anglePreviewLine);
    }

    if (!this.anglePreviewCalloutEl) {
      const listEl = document.getElementById('measure-callouts-layer') || this.container;
      this.anglePreviewCalloutEl = document.createElement('div');
      this.anglePreviewCalloutEl.className = 'measure-angle-callout preview';
      this.anglePreviewCalloutEl.style.display = 'none';
      if (listEl) listEl.appendChild(this.anglePreviewCalloutEl);
    }
  }

  updateAnglePreview(candidateHit) {
    if (!this.pendingAngleState || !candidateHit || !candidateHit.point) {
      this.hideAnglePreview();
      return;
    }

    this.initAnglePreview();
    const curPt = candidateHit.point;
    const V = this.pendingAngleState.V;

    // Step 1: Arm 1 live preview from V to curPt
    if (this.pendingAngleState.step === 1) {
      if (this.anglePreviewLine) {
        this.anglePreviewLine.visible = true;
        this.anglePreviewLine.geometry.setFromPoints([V, curPt]);
        this.anglePreviewLine.geometry.attributes.position.needsUpdate = true;
        if (this.anglePreviewLine.computeLineDistances) this.anglePreviewLine.computeLineDistances();
      }
      if (this.anglePreviewProjGroup) this.anglePreviewProjGroup.visible = false;
      if (this.anglePreviewArcLine) this.anglePreviewArcLine.visible = false;

      if (this.anglePreviewCalloutEl) {
        const unit = this.measureUnit || 'm';
        const scale = unit === 'mm' ? 1000 : 1;
        const d = (V.distanceTo(curPt) * scale).toFixed(unit === 'mm' ? 0 : 3);
        this.anglePreviewCalloutEl.textContent = `L1: ${d} ${unit}`;

        const cw = this.container.clientWidth || 1;
        const ch = this.container.clientHeight || 1;
        const midP = new THREE.Vector3().addVectors(V, curPt).multiplyScalar(0.5);
        const projVec = new THREE.Vector3().copy(midP).project(this.camera);
        if (projVec.z > 1.0 || projVec.z < -1.0) {
          this.anglePreviewCalloutEl.style.display = 'none';
        } else {
          const sx = (projVec.x * 0.5 + 0.5) * cw;
          const sy = (-projVec.y * 0.5 + 0.5) * ch;
          this.anglePreviewCalloutEl.style.display = 'inline-flex';
          this.anglePreviewCalloutEl.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -50%)`;
        }
      }
      this.updateMeasureMarkersAndCallouts();
      this.requestRender(100);
      return;
    }

    // Step 2: Arm 2 live preview from V to curPt + Angle Arc + Horizontal Projections
    if (this.pendingAngleState.step === 2) {
      const A = this.pendingAngleState.A;
      const B = curPt;

      if (this.anglePreviewLine) {
        this.anglePreviewLine.visible = true;
        this.anglePreviewLine.geometry.setFromPoints([V, B]);
        this.anglePreviewLine.geometry.attributes.position.needsUpdate = true;
        if (this.anglePreviewLine.computeLineDistances) this.anglePreviewLine.computeLineDistances();
      }

      const data = this.computeAngleMeasurementData(V, A, B);

      // Projection lines preview
      if (!this.anglePreviewProjGroup) {
        this.anglePreviewProjGroup = this.createAngleProjectionGroup(V, A, B, data.Aproj, data.Bproj);
        this.scene.add(this.anglePreviewProjGroup);
      } else {
        this.updateAngleProjectionGroup(this.anglePreviewProjGroup, V, A, B, data.Aproj, data.Bproj);
        this.anglePreviewProjGroup.visible = true;
      }

      // Arc preview
      if (!this.anglePreviewArcLine) {
        const arcObj = this.createAngleArcMesh(V, A, B, this.activeAngleMode === 'horizontal', data);
        this.anglePreviewArcLine = arcObj.line;
        this.scene.add(this.anglePreviewArcLine);
      } else {
        this.updateAngleArcMesh(this.anglePreviewArcLine, V, A, B, this.activeAngleMode === 'horizontal', data);
        this.anglePreviewArcLine.visible = true;
      }

      // Preview callout
      if (this.anglePreviewCalloutEl) {
        const isHoriz = this.activeAngleMode === 'horizontal';
        const angleVal = isHoriz ? data.angleHoriz : data.angle3D;
        const modeBadge = isHoriz ? '∠H' : '∠3D';
        this.anglePreviewCalloutEl.innerHTML = `
          <span style="opacity:0.75;font-weight:700;">${modeBadge}</span>
          <span>${angleVal.toFixed(1)}°</span>
        `;

        const cw = this.container.clientWidth || 1;
        const ch = this.container.clientHeight || 1;

        // Position at arc midpoint
        const P1 = isHoriz ? data.Aproj : A;
        const P2 = isHoriz ? data.Bproj : B;
        const len1 = V.distanceTo(P1);
        const len2 = V.distanceTo(P2);
        const R = Math.max(0.2, Math.min(2.5, 0.25 * Math.min(len1, len2)));
        const v1 = new THREE.Vector3().subVectors(P1, V).normalize();
        const v2 = new THREE.Vector3().subVectors(P2, V).normalize();
        const dot = Math.max(-1, Math.min(1, v1.dot(v2)));
        const theta = Math.acos(dot);
        let norm = new THREE.Vector3().crossVectors(v1, v2);
        if (norm.lengthSq() < 1e-6) norm = isHoriz ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        norm.normalize();
        const vPerp = new THREE.Vector3().crossVectors(norm, v1).normalize();
        const midT = theta * 0.5;
        const midP = new THREE.Vector3().copy(V)
          .addScaledVector(v1, R * 1.35 * Math.cos(midT))
          .addScaledVector(vPerp, R * 1.35 * Math.sin(midT));

        const projVec = new THREE.Vector3().copy(midP).project(this.camera);
        if (projVec.z > 1.0 || projVec.z < -1.0) {
          this.anglePreviewCalloutEl.style.display = 'none';
        } else {
          const sx = (projVec.x * 0.5 + 0.5) * cw;
          const sy = (-projVec.y * 0.5 + 0.5) * ch;
          this.anglePreviewCalloutEl.style.display = 'inline-flex';
          this.anglePreviewCalloutEl.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -50%)`;
        }
      }

      // Live panel preview
      this.renderAngleMeasurementResults(data, this.activeAngleMode);
      this.updateMeasureMarkersAndCallouts();
      this.requestRender(100);
    }
  }

  hideAnglePreview() {
    if (this.anglePreviewLine) this.anglePreviewLine.visible = false;
    if (this.anglePreviewProjGroup) this.anglePreviewProjGroup.visible = false;
    if (this.anglePreviewArcLine) this.anglePreviewArcLine.visible = false;
    if (this.anglePreviewCalloutEl) this.anglePreviewCalloutEl.style.display = 'none';
  }

  cancelPendingAngleStart() {
    if (!this.pendingAngleState) return;
    if (this.pendingAngleState.markerV) {
      this.deleteMeasurePoint(this.pendingAngleState.markerV.id);
    }
    if (this.pendingAngleState.markerA) {
      this.deleteMeasurePoint(this.pendingAngleState.markerA.id);
    }
    if (this.pendingAngleState.line1) {
      this.scene.remove(this.pendingAngleState.line1);
      if (this.pendingAngleState.line1.geometry) this.pendingAngleState.line1.geometry.dispose();
      if (this.pendingAngleState.line1.material) this.pendingAngleState.line1.material.dispose();
    }
    this.pendingAngleState = null;
    this.hideAnglePreview();
    this.requestRender(150);
  }

  deleteAngleMeasurement(id) {
    if (!this.angleMeasurements) return;
    const idx = this.angleMeasurements.findIndex(a => a.id === id);
    if (idx < 0) return;
    const angleRec = this.angleMeasurements[idx];

    if (angleRec.markerV) this.deleteMeasurePoint(angleRec.markerV.id);
    if (angleRec.markerA) this.deleteMeasurePoint(angleRec.markerA.id);
    if (angleRec.markerB) this.deleteMeasurePoint(angleRec.markerB.id);

    if (angleRec.line1) {
      this.scene.remove(angleRec.line1);
      if (angleRec.line1.geometry) angleRec.line1.geometry.dispose();
      if (angleRec.line1.material) angleRec.line1.material.dispose();
    }
    if (angleRec.line2) {
      this.scene.remove(angleRec.line2);
      if (angleRec.line2.geometry) angleRec.line2.geometry.dispose();
      if (angleRec.line2.material) angleRec.line2.material.dispose();
    }
    if (angleRec.projGroup) {
      this.scene.remove(angleRec.projGroup);
      angleRec.projGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    if (angleRec.arcLine) {
      this.scene.remove(angleRec.arcLine);
      if (angleRec.arcLine.geometry) angleRec.arcLine.geometry.dispose();
      if (angleRec.arcLine.material) angleRec.arcLine.material.dispose();
    }
    if (angleRec.calloutEl && angleRec.calloutEl.parentNode) {
      angleRec.calloutEl.parentNode.removeChild(angleRec.calloutEl);
    }

    this.angleMeasurements.splice(idx, 1);
    if (this.activeAngleMeasurementId === id) {
      this.activeAngleMeasurementId = this.angleMeasurements.length > 0
        ? this.angleMeasurements[this.angleMeasurements.length - 1].id
        : null;
      const curActive = this.angleMeasurements.find(a => a.id === this.activeAngleMeasurementId);
      this.lastMeasurementData = curActive ? curActive.data : null;
    }

    this.renderMeasurementResults();
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  updateAnglePointFromHit(marker, hit) {
    if (!marker || !hit || !hit.point) return;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    marker.point.copy(hit.point);
    marker.normal.copy(slopeData.normal);
    marker.slopeData = slopeData;
    this.orientMeasureMarkerToSurface(marker);

    const angleRec = this.angleMeasurements.find(a => a.id === marker.angleMeasurementId);
    if (angleRec) {
      const V = angleRec.markerV.point;
      const A = angleRec.markerA.point;
      const B = angleRec.markerB.point;
      const data = this.computeAngleMeasurementData(V, A, B);
      angleRec.data = data;

      if (angleRec.line1) {
        angleRec.line1.geometry.setFromPoints([V, A]);
        angleRec.line1.geometry.attributes.position.needsUpdate = true;
      }
      if (angleRec.line2) {
        angleRec.line2.geometry.setFromPoints([V, B]);
        angleRec.line2.geometry.attributes.position.needsUpdate = true;
      }
      if (angleRec.projGroup) {
        this.updateAngleProjectionGroup(angleRec.projGroup, V, A, B, data.Aproj, data.Bproj);
      }
      if (angleRec.arcLine) {
        this.updateAngleArcMesh(angleRec.arcLine, V, A, B, angleRec.mode === 'horizontal', data);
      }
      this.updateAngleCalloutDOM(angleRec);

      if (this.activeAngleMeasurementId === angleRec.id) {
        this.lastMeasurementData = angleRec.data;
        this.renderMeasurementResults();
      }
    }

    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  updateAngleCalloutDOM(angleRec) {
    if (!angleRec || !angleRec.calloutEl || !angleRec.data) return;
    const isHoriz = angleRec.mode === 'horizontal';
    const angleVal = isHoriz ? angleRec.data.angleHoriz : angleRec.data.angle3D;
    const modeBadge = isHoriz ? '∠H' : '∠3D';
    const modeTitle = isHoriz ? (I18N.t('measureAngleHoriz') || 'Horizontal Angle') : (I18N.t('measureAngle3D') || '3D True Angle');

    angleRec.calloutEl.innerHTML = `
      <button type="button" class="measure-angle-mode-toggle" title="${I18N.t('measureAngleToggleTip')}">${modeBadge}</button>
      <span class="measure-angle-text">${angleVal.toFixed(1)}°</span>
    `;
    angleRec.calloutEl.title = `${modeTitle}: ${angleVal.toFixed(2)}° (Shift+Click to Delete)`;
  }

  toggleAngleMeasurementMode(measId = null) {
    let targetRec = null;
    if (measId) {
      targetRec = this.angleMeasurements.find(a => a.id === measId);
    } else if (this.activeAngleMeasurementId) {
      targetRec = this.angleMeasurements.find(a => a.id === this.activeAngleMeasurementId);
    } else if (this.angleMeasurements && this.angleMeasurements.length > 0) {
      targetRec = this.angleMeasurements[this.angleMeasurements.length - 1];
    }

    const nextMode = (this.activeAngleMode === 'horizontal') ? 'spatial3d' : 'horizontal';
    this.activeAngleMode = nextMode;

    if (targetRec) {
      targetRec.mode = nextMode;
      const V = targetRec.markerV.point;
      const A = targetRec.markerA.point;
      const B = targetRec.markerB.point;
      this.updateAngleArcMesh(targetRec.arcLine, V, A, B, nextMode === 'horizontal', targetRec.data);
      this.updateAngleCalloutDOM(targetRec);
      this.lastMeasurementData = targetRec.data;
    }

    this.renderMeasurementResults();
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  renderAngleMeasurementResults(data, mode) {
    if (!data) return;
    const isHoriz = mode === 'horizontal';
    const angleVal = isHoriz ? data.angleHoriz : data.angle3D;
    const decVal = angleVal.toFixed(2) + '°';
    const dmsVal = this.formatAngleDMS(angleVal);
    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    const decDist = unit === 'mm' ? 0 : 3;
    const l1Val = `${(data.L1 * scale).toFixed(decDist)} ${unit}`;
    const l2Val = `${(data.L2 * scale).toFixed(decDist)} ${unit}`;

    const labelEl = document.getElementById('measure-res-angle-label');
    if (labelEl) {
      labelEl.textContent = isHoriz ? I18N.t('measureAngleHoriz') : I18N.t('measureAngle3D');
    }
    const toggleBtn = document.getElementById('btn-measure-angle-toggle-panel');
    if (toggleBtn) {
      toggleBtn.textContent = isHoriz ? '∠H' : '∠3D';
    }
    const primEl = document.getElementById('measure-res-angle-primary');
    if (primEl) primEl.textContent = `${angleVal.toFixed(1)}°`;

    const decEl = document.getElementById('measure-res-angle-dec');
    if (decEl) decEl.textContent = decVal;

    const dmsEl = document.getElementById('measure-res-angle-dms');
    if (dmsEl) dmsEl.textContent = dmsVal;

    const l1El = document.getElementById('measure-res-angle-l1');
    if (l1El) l1El.textContent = l1Val;

    const l2El = document.getElementById('measure-res-angle-l2');
    if (l2El) l2El.textContent = l2Val;
  }

  createOrUpdateRadiusMeasurement(target, event = null) {
    if (!target) return;
    const isCtrl = Boolean(event && (event.ctrlKey || event.metaKey));

    if (!isCtrl && this.radiusMeasurements && this.radiusMeasurements.length > 0) {
      const toRemove = [...this.radiusMeasurements];
      for (const m of toRemove) {
        this.deleteRadiusMeasurement(m.id);
      }
    }

    const id = `measure-rad-${++this.radiusMeasurementCounter}`;
    const displayIndex = (this.radiusMeasurements ? this.radiusMeasurements.length : 0) + 1;

    // 3D Visual Group for placed radius measurement
    const group = new THREE.Group();
    group.name = `RadiusGroup_${id}`;
    group.userData = { isRadiusMeasurement: true, id };

    // Arrow line and cone
    const C = target.center;
    const P = target.targetPoint;
    let arrowStart, arrowEnd, coneDir;
    let dashedLine = null;

    const ch = (this.container && this.container.clientHeight) || 600;
    const isOrtho = Boolean(this.camera && this.camera.isOrthographicCamera);
    let worldPerPixel;
    if (isOrtho) {
      worldPerPixel = ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) / ch;
    } else {
      const dist = this.camera.position.distanceTo(target.targetPoint);
      worldPerPixel = (2 * dist * Math.tan(((this.camera.fov || 45) * Math.PI) / 360)) / ch;
    }

    // Center marker (Refined CAD Center Mark Reticle)
    const centerGroup = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(0.26, 0.36, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    centerGroup.add(new THREE.Mesh(ringGeom, ringMat));
    const dotGeom = new THREE.CircleGeometry(0.12, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    centerGroup.add(new THREE.Mesh(dotGeom, dotMat));
    const crossVerts = new Float32Array([
      0, 0.36, 0,   0, 0.65, 0,
      0, -0.36, 0,  0, -0.65, 0,
      -0.36, 0, 0,  -0.65, 0, 0,
      0.36, 0, 0,   0.65, 0, 0
    ]);
    const crossGeom = new THREE.BufferGeometry();
    crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
    const crossMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
    centerGroup.add(new THREE.LineSegments(crossGeom, crossMat));
    centerGroup.position.copy(target.center);

    const cDist = isOrtho ? 1 : this.camera.position.distanceTo(target.center);
    const cWorldPerPix = isOrtho ? worldPerPixel : (2 * cDist * Math.tan(((this.camera.fov || 45) * Math.PI) / 360)) / ch;
    const cScale = Math.max(1e-5, cWorldPerPix * 10);
    centerGroup.scale.set(cScale, cScale, cScale);
    centerGroup.quaternion.copy(this.camera.quaternion);
    group.add(centerGroup);

    if (!target.isCenterFarSide) {
      arrowStart = C.clone();
      arrowEnd = P.clone();
      coneDir = new THREE.Vector3().subVectors(P, C).normalize();
    } else {
      const uOut = target.normal || new THREE.Vector3().subVectors(P, C).normalize();
      const arrowLen = Math.min(target.radius * 0.45, Math.max(0.15, worldPerPixel * 140));
      arrowStart = P.clone().addScaledVector(uOut, arrowLen);
      arrowEnd = P.clone();
      coneDir = uOut.clone().negate();

      const dGeom = new THREE.BufferGeometry().setFromPoints([P, C]);
      dashedLine = new THREE.Line(dGeom, new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false }));
      dashedLine.computeLineDistances();
      group.add(dashedLine);
    }

    const lineGeom = new THREE.BufferGeometry().setFromPoints([arrowStart, arrowEnd]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3, depthTest: false, depthWrite: false });
    const arrowLine = new THREE.Line(lineGeom, lineMat);
    group.add(arrowLine);

    const coneGeom = new THREE.ConeGeometry(0.2, 0.6, 16);
    coneGeom.translate(0, -0.3, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.copy(arrowEnd);
    cone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), coneDir));

    const pDist = isOrtho ? 1 : this.camera.position.distanceTo(target.targetPoint);
    const pWorldPerPix = isOrtho ? worldPerPixel : (2 * pDist * Math.tan(((this.camera.fov || 45) * Math.PI) / 360)) / ch;
    const coneScale = Math.max(1e-5, pWorldPerPix * 10);
    cone.scale.set(coneScale, coneScale, coneScale);
    group.add(cone);

    this.scene.add(group);

    // Callout DOM badge
    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    let calloutEl = null;
    if (listEl) {
      calloutEl = document.createElement('div');
      calloutEl.className = 'measure-radius-callout active';
      calloutEl.dataset.radId = id;
      const unit = this.measureUnit || 'm';
      const scale = unit === 'mm' ? 1000 : 1;
      const rFormatted = (target.radius * scale).toFixed(unit === 'mm' ? 0 : 3);
      const dFormatted = (target.radius * 2 * scale).toFixed(unit === 'mm' ? 0 : 3);
      const geomLabel = target.geomType === 'circle' ? I18N.t('measureGeomCircle') : (target.geomType === 'arc' ? I18N.t('measureGeomArc') : I18N.t('measureGeomSphere'));

      calloutEl.textContent = `R ${rFormatted} ${unit}`;
      calloutEl.title = `Radius (R): ${rFormatted} ${unit}\nDiameter (Ø): ${dFormatted} ${unit} | ${geomLabel}\nClick to copy, Shift+Click to delete`;

      calloutEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
          this.deleteRadiusMeasurement(id);
          return;
        }
        const text = `Radius (R): ${rFormatted} ${unit}\nDiameter (Ø): ${dFormatted} ${unit}\nGeometry: ${geomLabel}\nCenter: (${target.center.x.toFixed(3)}, ${target.center.y.toFixed(3)}, ${target.center.z.toFixed(3)})\nTarget Point: (${target.targetPoint.x.toFixed(3)}, ${target.targetPoint.y.toFixed(3)}, ${target.targetPoint.z.toFixed(3)})`;
        this.copyToClipboard(text, null);
        showToast(I18N.t('measureCopiedToast'), 'success', 2200);
      });

      listEl.appendChild(calloutEl);
    }

    const radRecord = {
      id,
      index: displayIndex,
      target,
      group,
      centerGroup,
      arrowLine,
      arrowStart,
      arrowEnd,
      cone,
      coneDir,
      dashedLine,
      calloutEl
    };

    if (!this.radiusMeasurements) this.radiusMeasurements = [];
    this.radiusMeasurements.push(radRecord);
    this.activeRadiusMeasurementId = id;

    this.renderMeasurementResults();
    this.updateMeasureMarkersAndCallouts();
    this.hideRadiusPreview();

    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    showToast(`${I18N.t('measureResRadius')}: ${(target.radius * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unit}`, 'success');
  }

  deleteRadiusMeasurement(id) {
    if (!this.radiusMeasurements) return;
    const idx = this.radiusMeasurements.findIndex(m => m.id === id);
    if (idx < 0) return;
    const m = this.radiusMeasurements[idx];

    if (m.group) {
      m.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(mat => mat && mat.dispose());
          else obj.material.dispose();
        }
      });
      this.scene.remove(m.group);
    }

    if (m.calloutEl && m.calloutEl.parentNode) {
      m.calloutEl.parentNode.removeChild(m.calloutEl);
    }

    this.radiusMeasurements.splice(idx, 1);
    if (this.activeRadiusMeasurementId === id) {
      this.activeRadiusMeasurementId = this.radiusMeasurements.length > 0 ? this.radiusMeasurements[this.radiusMeasurements.length - 1].id : null;
    }

    this.renderMeasurementResults();
    this.requestRender(200);
  }

  intersectMeasureMarkers(raycaster) {
    if (!this.measureMarkers || this.measureMarkers.length === 0 || !this.measureMarkersGroup) return [];
    const pickDiscs = [];
    for (const m of this.measureMarkers) {
      if (m && m.hitDisc && m.group && m.group.visible) {
        pickDiscs.push(m.hitDisc);
      }
    }
    if (pickDiscs.length === 0) return [];
    const hits = raycaster.intersectObjects(pickDiscs, false);
    if (hits.length === 0) return [];
    const results = [];
    for (const h of hits) {
      const markerId = h.object.userData && h.object.userData.markerId;
      const marker = this.measureMarkers.find(m => m.id === markerId);
      if (marker) {
        results.push({ hit: h, marker });
      }
    }
    return results;
  }

  computeSurfaceNormalAndSlope(hit) {
    const worldNormal = new THREE.Vector3(0, 1, 0);
    if (hit && hit.normal && hit.normal.isVector3) {
      worldNormal.copy(hit.normal).normalize();
    } else if (hit && hit.face && hit.face.normal && hit.object) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
      if (this.raycaster && this.raycaster.ray && worldNormal.dot(this.raycaster.ray.direction) > 0) {
        worldNormal.negate();
      }
    }

    const up = new THREE.Vector3(0, 1, 0);
    const dotUp = worldNormal.dot(up);
    const absCos = Math.min(1, Math.max(0, Math.abs(dotUp)));
    const angleRad = Math.acos(absCos);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Project -up (0, -1, 0) onto surface tangent plane for steepest descent (downhill)
    const downhillDir = new THREE.Vector3(0, -1, 0).addScaledVector(worldNormal, dotUp);
    const downhillLen = downhillDir.length();

    const isFlat = angleDeg < 0.05 || downhillLen < 1e-4;
    const isVertical = absCos < 1e-4 || angleDeg > 89.94;

    if (!isFlat) {
      downhillDir.divideScalar(downhillLen);
    } else {
      downhillDir.set(1, 0, 0);
    }

    let percent = 0;
    let ratioX = Infinity;
    if (!isFlat && !isVertical) {
      const tanTheta = Math.tan(angleRad);
      percent = tanTheta * 100;
      ratioX = tanTheta > 1e-6 ? (1 / tanTheta) : Infinity;
    } else if (isVertical) {
      percent = Infinity;
      ratioX = 0;
    }

    return {
      normal: worldNormal,
      isFlat,
      isVertical,
      angleDeg: isFlat ? 0 : (isVertical ? 90 : angleDeg),
      percent,
      ratioX,
      downhillDir
    };
  }

  formatSlopeString(slopeData) {
    if (!slopeData) return '--';
    if (slopeData.isFlat) {
      return I18N.t('measureSlopeFlat');
    }
    if (slopeData.isVertical) {
      return I18N.t('measureSlopeVertical');
    }
    const ratioStr = slopeData.ratioX >= 100
      ? `1:${Math.round(slopeData.ratioX)}`
      : `1:${slopeData.ratioX.toFixed(1)}`;
    const pctStr = `${slopeData.percent.toFixed(1)}%`;
    const degStr = `${slopeData.angleDeg.toFixed(1)}°`;
    return `${ratioStr} · ${pctStr} · ${degStr}`;
  }

  /**
   * Standardized 3D Measurement Point Marker Factory (Reusable across Point, Distance, Multi-point & Angle modes)
   * Includes:
   *  1. Invisible Hit Disc for easy hover/drag/Shift-delete/right-click
   *  2. Surface-aligned Reticle Cursor (outer ring, center dot, crosshairs)
   *  3. Drag Orientation Square Patch (`小型方片`) shown during point dragging to indicate surface orientation
   *  4. Steepest Descent Slope Arrow (`最大坡度方向箭头`) with a gap from the cursor ring
   */
  createStandardMeasureMarkerMesh(id, options = {}) {
    const { showSlopeArrow = true, themeColor = 0x00f0ff } = options;
    const group = new THREE.Group();
    group.userData = { isMeasureMarker: true, markerId: id };

    // 1. Invisible Hit Disc (for raycast picking & dragging)
    const hitGeom = new THREE.CircleGeometry(1.25, 24);
    const hitMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const hitDisc = new THREE.Mesh(hitGeom, hitMat);
    hitDisc.renderOrder = 1200;
    hitDisc.userData = { isMeasureMarker: true, markerId: id };
    group.add(hitDisc);

    // 2. Surface Reticle Cursor (Ring + Center Dot + Crosshair Ticks)
    const cursorGroup = new THREE.Group();
    cursorGroup.userData = { isMeasureMarker: true, markerId: id };

    const ringGeom = new THREE.RingGeometry(0.48, 0.66, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: themeColor,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.renderOrder = 1202;
    ringMesh.userData = { isMeasureMarker: true, markerId: id };
    cursorGroup.add(ringMesh);

    const dotGeom = new THREE.CircleGeometry(0.17, 24);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const dotMesh = new THREE.Mesh(dotGeom, dotMat);
    dotMesh.renderOrder = 1203;
    dotMesh.userData = { isMeasureMarker: true, markerId: id };
    cursorGroup.add(dotMesh);

    const crossVerts = new Float32Array([
      0, 0.66, 0,   0, 0.96, 0,
      0, -0.66, 0,  0, -0.96, 0,
      -0.66, 0, 0,  -0.96, 0, 0,
      0.66, 0, 0,   0.96, 0, 0
    ]);
    const crossGeom = new THREE.BufferGeometry();
    crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
    const crossMat = new THREE.LineBasicMaterial({
      color: themeColor,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });
    const crossLines = new THREE.LineSegments(crossGeom, crossMat);
    crossLines.renderOrder = 1202;
    crossLines.userData = { isMeasureMarker: true, markerId: id };
    cursorGroup.add(crossLines);

    group.add(cursorGroup);

    // 3. Standardized Surface Orientation Square Patch (Shown while dragging any measurement point)
    const dragPatchGroup = new THREE.Group();
    dragPatchGroup.visible = false;
    dragPatchGroup.userData = { isMeasureMarker: true, markerId: id };

    const patchFillGeom = new THREE.PlaneGeometry(2.8, 2.8);
    const patchFillMat = new THREE.MeshBasicMaterial({
      color: themeColor,
      transparent: true,
      opacity: 0.20,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const patchFillMesh = new THREE.Mesh(patchFillGeom, patchFillMat);
    patchFillMesh.renderOrder = 1201;
    patchFillMesh.userData = { isMeasureMarker: true, markerId: id };
    dragPatchGroup.add(patchFillMesh);

    const h = 1.4;
    const patchWireVerts = new Float32Array([
      // Outer square border
      -h, -h, 0,   h, -h, 0,
       h, -h, 0,   h,  h, 0,
       h,  h, 0,  -h,  h, 0,
      -h,  h, 0,  -h, -h, 0,
      // Subtle inner sub-grid lines
      -h, 0, 0,   -0.96, 0, 0,
       0.96, 0, 0, h, 0, 0,
       0, -h, 0,   0, -0.96, 0,
       0, 0.96, 0, 0, h, 0,
      // Normal indicator stem along local +Z
       0, 0, 0,    0, 0, 1.15
    ]);
    const patchWireGeom = new THREE.BufferGeometry();
    patchWireGeom.setAttribute('position', new THREE.BufferAttribute(patchWireVerts, 3));
    const patchWireMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false
    });
    const patchWireLines = new THREE.LineSegments(patchWireGeom, patchWireMat);
    patchWireLines.renderOrder = 1202;
    patchWireLines.userData = { isMeasureMarker: true, markerId: id };
    dragPatchGroup.add(patchWireLines);

    group.add(dragPatchGroup);

    // 4. Maximum Slope Downhill Arrow (with a clear gap from cursor ring: ring ends at 0.66/0.96, arrow tail starts at +1.18 along local +X)
    const slopeArrowGroup = new THREE.Group();
    slopeArrowGroup.visible = Boolean(showSlopeArrow);
    slopeArrowGroup.userData = { isMeasureMarker: true, markerId: id };

    // Arrow shaft from x = 1.18 to x = 2.58 (length 1.40, width 0.18)
    const shaftGeom = new THREE.PlaneGeometry(1.40, 0.18);
    shaftGeom.translate(1.18 + 0.70, 0, 0);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const shaftMesh = new THREE.Mesh(shaftGeom, arrowMat);
    shaftMesh.renderOrder = 1203;
    shaftMesh.userData = { isMeasureMarker: true, markerId: id };
    slopeArrowGroup.add(shaftMesh);

    // Arrow head triangle from x = 2.52 to x = 3.36
    const headGeom = new THREE.BufferGeometry();
    const headVerts = new Float32Array([
      2.52,  0.42, 0,
      2.52, -0.42, 0,
      3.36,  0.0,  0
    ]);
    headGeom.setAttribute('position', new THREE.BufferAttribute(headVerts, 3));
    const headMesh = new THREE.Mesh(headGeom, arrowMat);
    headMesh.renderOrder = 1203;
    headMesh.userData = { isMeasureMarker: true, markerId: id };
    slopeArrowGroup.add(headMesh);

    group.add(slopeArrowGroup);

    return {
      group,
      hitDisc,
      cursorGroup,
      ringMat,
      dotMat,
      crossMat,
      dragPatchGroup,
      slopeArrowGroup,
      arrowMat
    };
  }

  orientMeasureMarkerToSurface(marker) {
    if (!marker || !marker.group) return;
    const n = marker.normal || new THREE.Vector3(0, 1, 0);
    const slope = marker.slopeData;

    // Local +X = downhill tangent vector (or horizontal tangent when flat)
    // Local +Z = outward surface normal
    // Local +Y = n x t1 (right-handed orthonormal basis in tangent plane)
    const t1 = new THREE.Vector3();
    if (slope && !slope.isFlat && slope.downhillDir && slope.downhillDir.lengthSq() > 0.001) {
      t1.copy(slope.downhillDir).normalize();
    } else {
      const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      t1.crossVectors(ref, n).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    t1.crossVectors(t2, n).normalize();

    const basisMat = new THREE.Matrix4().makeBasis(t1, t2, n);
    marker.group.position.copy(marker.point);
    marker.group.quaternion.setFromRotationMatrix(basisMat);

    // Hide slope arrow on pure horizontal plane (0%), show on sloped/vertical surfaces
    if (marker.slopeArrowGroup) {
      marker.slopeArrowGroup.visible = Boolean(marker.showSlopeArrow && slope && !slope.isFlat);
    }
  }

  createMeasurePoint(hit, options = {}) {
    if (!hit || !hit.point) return null;
    if (!this.measureMarkersGroup) this.initMeasurementSystem();

    const id = `measure-pt-${++this.measurePointCounter}`;
    const displayIndex = this.measureMarkers.filter(m => m.mode === 'point').length + 1;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    const meshParts = this.createStandardMeasureMarkerMesh(id, { showSlopeArrow: true });

    // Stagger callout offset slightly when multiple points exist
    const staggerIdx = (displayIndex - 1) % 4;
    const marker = {
      id,
      index: displayIndex,
      mode: options.mode || 'point',
      point: hit.point.clone(),
      normal: slopeData.normal.clone(),
      slopeData,
      showSlopeArrow: true,
      calloutOffset: { x: 44 + staggerIdx * 10, y: -56 + staggerIdx * 14 },
      calloutEl: null,
      leaderLineEl: null,
      leaderDotEl: null,
      ...meshParts
    };

    this.measureMarkersGroup.add(marker.group);
    this.measureMarkers.push(marker);

    this.orientMeasureMarkerToSurface(marker);
    this.createOrUpdateMeasureCalloutDOM(marker);
    this.setActiveMeasurePoint(marker.id);
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(250);
    return marker;
  }

  updateMeasurePointFromHit(marker, hit) {
    if (!marker || !hit || !hit.point) return;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    marker.point.copy(hit.point);
    marker.normal.copy(slopeData.normal);
    marker.slopeData = slopeData;

    this.orientMeasureMarkerToSurface(marker);
    this.createOrUpdateMeasureCalloutDOM(marker);
    if (this.activeMeasurePointId === marker.id) {
      this.renderMeasurementResults();
    }
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  deleteMeasurePoint(id) {
    if (!this.measureMarkers) return;
    const idx = this.measureMarkers.findIndex(m => m.id === id);
    if (idx < 0) return;

    const marker = this.measureMarkers[idx];
    if (this.hoveredMeasureMarker === marker) {
      this.hoveredMeasureMarker = null;
    }
    if (this.draggingMeasureMarker === marker) {
      this.isDraggingMeasurePoint = false;
      this.draggingMeasureMarker = null;
    }

    // Dispose 3D resources
    if (marker.group) {
      marker.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(mat => mat && mat.dispose());
          else obj.material.dispose();
        }
      });
      if (this.measureMarkersGroup) {
        this.measureMarkersGroup.remove(marker.group);
      }
    }

    // Remove 2D Callout & Leader SVG elements
    if (marker.calloutEl && marker.calloutEl.parentNode) {
      marker.calloutEl.parentNode.removeChild(marker.calloutEl);
    }
    if (marker.leaderLineEl && marker.leaderLineEl.parentNode) {
      marker.leaderLineEl.parentNode.removeChild(marker.leaderLineEl);
    }
    if (marker.leaderDotEl && marker.leaderDotEl.parentNode) {
      marker.leaderDotEl.parentNode.removeChild(marker.leaderDotEl);
    }

    this.measureMarkers.splice(idx, 1);

    // Renumber remaining point markers sequentially
    let ptIdx = 1;
    this.measureMarkers.forEach(m => {
      if (m.mode === 'point') {
        m.index = ptIdx++;
        this.createOrUpdateMeasureCalloutDOM(m);
      }
    });

    if (this.activeMeasurePointId === id) {
      const remaining = this.measureMarkers.filter(m => m.mode === 'point');
      this.activeMeasurePointId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    }

    this.setActiveMeasurePoint(this.activeMeasurePointId);
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(250);
  }

  getActiveMeasurePoint() {
    if (!this.measureMarkers || this.measureMarkers.length === 0) return null;
    if (this.activeMeasurePointId) {
      const found = this.measureMarkers.find(m => m.id === this.activeMeasurePointId && m.mode === 'point');
      if (found) return found;
    }
    const pointMarkers = this.measureMarkers.filter(m => m.mode === 'point');
    return pointMarkers.length > 0 ? pointMarkers[pointMarkers.length - 1] : null;
  }

  setActiveMeasurePoint(id) {
    this.activeMeasurePointId = id;
    if (this.measureMarkers) {
      this.measureMarkers.forEach(m => {
        const isActive = m.id === id;
        const isHovered = this.hoveredMeasureMarker === m;
        const defaultColor = m.baseColor !== undefined ? m.baseColor : 0x38bdf8;
        const activeColor = 0x00f0ff;
        if (m.ringMat) {
          m.ringMat.color.setHex(isHovered ? 0xfbbf24 : (isActive ? activeColor : defaultColor));
        }
        if (m.crossMat) {
          m.crossMat.color.setHex(isHovered ? 0xfbbf24 : (isActive ? activeColor : defaultColor));
        }
        if (m.calloutEl) {
          m.calloutEl.classList.toggle('active', isActive);
        }
        if (m.leaderLineEl) {
          m.leaderLineEl.classList.toggle('inactive', !isActive);
        }
      });
    }
    this.renderMeasurementResults();
    this.requestRender(200);
  }

  setHoveredMeasureMarker(marker) {
    if (this.hoveredMeasureMarker === marker) return;
    this.hoveredMeasureMarker = marker;
    this.setActiveMeasurePoint(this.activeMeasurePointId);
  }

  setMeasureMarkerDragging(marker, isDragging) {
    if (!marker) return;
    const defaultColor = marker.baseColor !== undefined ? marker.baseColor : 0x00f0ff;
    if (marker.dragPatchGroup) {
      marker.dragPatchGroup.visible = Boolean(isDragging);
    }
    if (marker.ringMat) {
      marker.ringMat.color.setHex(isDragging ? 0xfbbf24 : defaultColor);
    }
    if (marker.crossMat) {
      marker.crossMat.color.setHex(isDragging ? 0xfbbf24 : defaultColor);
    }
    this.requestRender(200);
  }

  formatMeasurePointCoords(point, pco = null) {
    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    const decimals = unit === 'mm' ? 0 : 3;

    const targetPco = pco || (this.pointCloudManager && this.pointCloudManager.activePointCloud);
    const mapping = (targetPco && targetPco.userData && targetPco.userData.coordinateMapping) || 'auto';

    // BIM Engineering Coordinate Convention (Y-up world):
    // World X = Easting (point.x)
    // World Y = Elevation / RL (point.y)
    // World Z = -Northing (-point.z)
    let eastingM = point.x;
    let northingM = -point.z;
    let elevationM = point.y;

    if (mapping === 'swap_yz') {
      const tmp = northingM;
      northingM = elevationM;
      elevationM = tmp;
    }

    const rawX = eastingM * scale;
    const rawY = northingM * scale;
    const rawZ = elevationM * scale;
    const cleanZero = (v) => (Math.abs(v) < 1e-5 ? 0 : v);
    return {
      unit,
      x: cleanZero(eastingM),
      y: cleanZero(northingM),
      z: cleanZero(elevationM),
      xStr: `${cleanZero(rawX).toFixed(decimals)} ${unit}`,
      yStr: `${cleanZero(rawY).toFixed(decimals)} ${unit}`,
      zStr: `${cleanZero(rawZ).toFixed(decimals)} ${unit}`
    };
  }

  createOrUpdateMeasureCalloutDOM(marker) {
    if (!marker || marker.mode === 'multipoint') return;
    if (marker.mode !== 'point') {
      if (marker && marker.calloutEl && marker.calloutEl.parentNode) {
        marker.calloutEl.parentNode.removeChild(marker.calloutEl);
        marker.calloutEl = null;
      }
      if (marker && marker.leaderLineEl && marker.leaderLineEl.parentNode) {
        marker.leaderLineEl.parentNode.removeChild(marker.leaderLineEl);
        marker.leaderLineEl = null;
      }
      if (marker && marker.leaderDotEl && marker.leaderDotEl.parentNode) {
        marker.leaderDotEl.parentNode.removeChild(marker.leaderDotEl);
        marker.leaderDotEl = null;
      }
      return;
    }
    const listEl = document.getElementById('measure-callouts-list');
    const svgEl = document.getElementById('measure-leader-svg');
    if (!listEl || !svgEl) return;

    const coords = this.formatMeasurePointCoords(marker.point, marker.pointCloud);
    const slopeStr = this.formatSlopeString(marker.slopeData);
    const copyTooltip = I18N.t('measureCopyTooltip');
    const slopeLabel = I18N.t('measureMaxSlope');

    const copyIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    if (!marker.leaderLineEl) {
      const ns = 'http://www.w3.org/2000/svg';
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute('class', 'measure-leader-line');
      svgEl.appendChild(line);
      marker.leaderLineEl = line;

      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('class', 'measure-leader-dot');
      dot.setAttribute('r', '3');
      svgEl.appendChild(dot);
      marker.leaderDotEl = dot;
    }

    if (!marker.calloutEl) {
      const card = document.createElement('div');
      card.className = 'measure-point-callout';
      card.dataset.markerId = marker.id;

      card.innerHTML = `
        <div class="measure-callout-header">
          <span class="measure-callout-badge"></span>
          <button type="button" class="callout-copy-btn" title="${this.escapeHtml(copyTooltip)}">${copyIconSvg}</button>
        </div>
        <div class="measure-callout-rows">
          <div class="measure-callout-row">
            <span class="measure-callout-key">X:</span>
            <span class="measure-callout-val val-x"></span>
          </div>
          <div class="measure-callout-row">
            <span class="measure-callout-key">Y:</span>
            <span class="measure-callout-val val-y"></span>
          </div>
          <div class="measure-callout-row">
            <span class="measure-callout-key">Z:</span>
            <span class="measure-callout-val val-z"></span>
          </div>
          <div class="measure-callout-row slope-row">
            <span class="measure-callout-key key-slope"></span>
            <span class="measure-callout-val val-slope"></span>
          </div>
        </div>
      `;

      // Copy button click handler (SVG-only button with hover tooltip)
      const copyBtn = card.querySelector('.callout-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
        });
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const c = this.formatMeasurePointCoords(marker.point, marker.pointCloud);
          const s = this.formatSlopeString(marker.slopeData);
          const text = `X: ${c.xStr}\nY: ${c.yStr}\nZ: ${c.zStr}\n${I18N.t('measureMaxSlope')}: ${s}`;
          copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          copyBtn.classList.add('copied');
          this.copyToClipboard(text, null);
          showToast(I18N.t('measureCopiedToast'), 'success', 2200);
          setTimeout(() => {
            if (copyBtn) {
              copyBtn.innerHTML = copyIconSvg;
              copyBtn.classList.remove('copied');
            }
          }, 1200);
        });
      }

      // Dragging callout micro-panel to adjust its screen offset, or Shift+Click to delete
      let isDraggingCard = false;
      let startX = 0;
      let startY = 0;
      let origOffsetX = 0;
      let origOffsetY = 0;

      card.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.callout-copy-btn')) return;
        e.stopPropagation();
        if (e.button === 0 && e.shiftKey) {
          this.deleteMeasurePoint(marker.id);
          return;
        }
        this.setActiveMeasurePoint(marker.id);
        if (e.button === 0) {
          isDraggingCard = true;
          startX = e.clientX;
          startY = e.clientY;
          origOffsetX = marker.calloutOffset.x;
          origOffsetY = marker.calloutOffset.y;
          card.classList.add('dragging');
          card.setPointerCapture(e.pointerId);
        }
      });

      card.addEventListener('pointermove', (e) => {
        if (!isDraggingCard) return;
        e.stopPropagation();
        marker.calloutOffset.x = origOffsetX + (e.clientX - startX);
        marker.calloutOffset.y = origOffsetY + (e.clientY - startY);
        this.updateMeasureMarkersAndCallouts();
      });

      const endCardDrag = (e) => {
        if (!isDraggingCard) return;
        isDraggingCard = false;
        card.classList.remove('dragging');
        try { card.releasePointerCapture(e.pointerId); } catch (err) {}
      };
      card.addEventListener('pointerup', endCardDrag);
      card.addEventListener('pointercancel', endCardDrag);

      // Right-click on Callout card opens context menu with Delete Measurement Point
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.contextMenuMeasureMarker = marker;
        this.contextMenuMeasureSurfaceHit = null;
        this.showContextMenu(e.clientX, e.clientY);
      });

      listEl.appendChild(card);
      marker.calloutEl = card;
    }

    const badgeEl = marker.calloutEl.querySelector('.measure-callout-badge');
    if (badgeEl) {
      badgeEl.textContent = `#${marker.index} PT`;
    }
    const copyBtn = marker.calloutEl.querySelector('.callout-copy-btn');
    if (copyBtn) {
      copyBtn.title = copyTooltip;
    }
    const valX = marker.calloutEl.querySelector('.val-x');
    if (valX) valX.textContent = coords.xStr;
    const valY = marker.calloutEl.querySelector('.val-y');
    if (valY) valY.textContent = coords.yStr;
    const valZ = marker.calloutEl.querySelector('.val-z');
    if (valZ) valZ.textContent = coords.zStr;
    const keySlope = marker.calloutEl.querySelector('.key-slope');
    if (keySlope) keySlope.textContent = `${slopeLabel}:`;
    const valSlope = marker.calloutEl.querySelector('.val-slope');
    if (valSlope) valSlope.textContent = slopeStr;
  }

  updateMeasureMarkersAndCallouts() {
    if (!this.camera || !this.container) return;
    const hasPointMarkers = Boolean(this.measureMarkers && this.measureMarkers.length > 0);
    const hasRadiusMarkers = Boolean(this.radiusMeasurements && this.radiusMeasurements.length > 0);
    const hasAngleMarkers = Boolean(this.angleMeasurements && this.angleMeasurements.length > 0);
    if (!hasPointMarkers && !hasRadiusMarkers && !hasAngleMarkers) return;

    // Ensure camera world and inverse-world matrices reflect any immediate position/zoom changes (e.g. wheel zoom)
    this.camera.updateMatrixWorld();

    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const isOrtho = Boolean(this.camera.isOrthographicCamera);
    const fovRad = ((this.camera.fov || 45) * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);

    const projVec = new THREE.Vector3();

    if (hasPointMarkers) {
      for (const marker of this.measureMarkers) {
        if (!marker || !marker.group) continue;

        // 1. Constant Screen-Space Pixel Scaling for 3D Cursor, Gap, Slope Arrow & Drag Orientation Patch
        let worldPerPixel;
        if (isOrtho) {
          worldPerPixel = ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) / ch;
        } else {
          const dist = this.camera.position.distanceTo(marker.point);
          worldPerPixel = (2 * dist * tanHalfFov) / ch;
        }
        const scale = Math.max(1e-5, worldPerPixel * 13.5);
        marker.group.scale.set(scale, scale, scale);

        // 2. Project 3D Point to 2D Viewport Coordinates for Callout & Leader Line
        projVec.copy(marker.point).project(this.camera);
        const isBehindCam = projVec.z > 1.0 || projVec.z < -1.0;

        if (isBehindCam) {
          if (marker.calloutEl) marker.calloutEl.style.display = 'none';
          if (marker.leaderLineEl) marker.leaderLineEl.style.display = 'none';
          if (marker.leaderDotEl) marker.leaderDotEl.style.display = 'none';
          continue;
        }

        const sx = (projVec.x * 0.5 + 0.5) * cw;
        const sy = (-projVec.y * 0.5 + 0.5) * ch;

        if (marker.mode === 'multipoint') {
          if (marker.calloutEl) {
            marker.calloutEl.style.display = 'block';
            marker.calloutEl.style.transform = `translate3d(${Math.round(sx + 10)}px, ${Math.round(sy - 22)}px, 0)`;
          }
          continue;
        }

        if (marker.calloutEl) {
          marker.calloutEl.style.display = 'block';
          const cardW = marker.calloutEl.offsetWidth || 185;
          const cardH = marker.calloutEl.offsetHeight || 96;

          let cx = sx + marker.calloutOffset.x;
          let cy = sy + marker.calloutOffset.y;

          // Keep Callout clamped inside viewport bounds
          cx = Math.max(8, Math.min(cw - cardW - 8, cx));
          cy = Math.max(8, Math.min(ch - cardH - 8, cy));

          marker.calloutEl.style.transform = `translate3d(${Math.round(cx)}px, ${Math.round(cy)}px, 0)`;

          // Connect SVG elbow leader line from (sx, sy) to nearest vertical edge of callout card
          if (marker.leaderLineEl && marker.leaderDotEl) {
            marker.leaderLineEl.style.display = 'block';
            marker.leaderDotEl.style.display = 'block';

            const anchorX = (cx + cardW * 0.5 >= sx) ? cx : (cx + cardW);
            const anchorY = cy + 16;
            const elbowX = anchorX + ((cx + cardW * 0.5 >= sx) ? -12 : 12);
            const elbowY = anchorY;

            marker.leaderLineEl.setAttribute('points', `${sx.toFixed(1)},${sy.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${anchorX.toFixed(1)},${anchorY.toFixed(1)}`);
            marker.leaderDotEl.setAttribute('cx', sx.toFixed(1));
            marker.leaderDotEl.setAttribute('cy', sy.toFixed(1));
          }
        }
      }
    }

    // Update placed Distance Measurements (scale, projection & Liang-Barsky edge clamping)
    const hasDistanceMeasurements = this.distanceMeasurements && this.distanceMeasurements.length > 0;
    if (hasDistanceMeasurements) {
      for (const distRec of this.distanceMeasurements) {
        if (!distRec || !distRec.calloutEl || !distRec.marker1 || !distRec.marker2) continue;
        const p0 = distRec.marker1.point;
        const p1 = distRec.marker2.point;

        projVec.copy(p0).project(this.camera);
        const p0Behind = (projVec.z > 1.0 || projVec.z < -1.0);
        const s0x = (projVec.x * 0.5 + 0.5) * cw;
        const s0y = (-projVec.y * 0.5 + 0.5) * ch;

        projVec.copy(p1).project(this.camera);
        const p1Behind = (projVec.z > 1.0 || projVec.z < -1.0);
        const s1x = (projVec.x * 0.5 + 0.5) * cw;
        const s1y = (-projVec.y * 0.5 + 0.5) * ch;

        if (p0Behind && p1Behind) {
          distRec.calloutEl.style.display = 'none';
          continue;
        }

        const safeMargin = 16;
        const clipRes = this.clipSegmentToScreen(s0x, s0y, s1x, s1y, safeMargin, cw - safeMargin, safeMargin, ch - safeMargin);
        if (!clipRes) {
          distRec.calloutEl.style.display = 'none';
        } else {
          const t = Math.max(clipRes.t0, Math.min(clipRes.t1, 0.5));
          const bx = s0x + t * (s1x - s0x);
          const by = s0y + t * (s1y - s0y);

          distRec.calloutEl.style.display = 'block';
          distRec.calloutEl.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0) translate(-50%, -50%)`;
        }
      }
    }

    // Update Multi-Point Hover Callout
    this.updateMultiPointClosurePopoverPosition();
    if (this.multiPointState && this.multiPointState.hoveredSegmentIndex >= 0) {
      const hSeg = this.multiPointState.segments[this.multiPointState.hoveredSegmentIndex];
      if (hSeg) {
        const p0 = this.multiPointState.points[hSeg.from];
        const p1 = this.multiPointState.points[hSeg.to];
        if (p0 && p1) {
          this.updateMultiPointHoverCalloutPosition(p0, p1);
        }
      }
    }

    // Update placed Angle Measurements (screen projection of arc midpoint)
    if (hasAngleMarkers) {
      for (const angleRec of this.angleMeasurements) {
        if (!angleRec || !angleRec.calloutEl || !angleRec.data) continue;
        const V = angleRec.markerV.point;
        const A = angleRec.markerA.point;
        const B = angleRec.markerB.point;
        const isHoriz = angleRec.mode === 'horizontal';

        // Dynamically update arc geometry and retrieve screen-adaptive midPoint
        const midPoint = this.updateAngleArcMesh(angleRec.arcLine, V, A, B, isHoriz, angleRec.data);

        projVec.copy(midPoint).project(this.camera);
        const isBehind = (projVec.z > 1.0 || projVec.z < -1.0);
        if (isBehind) {
          angleRec.calloutEl.style.display = 'none';
        } else {
          const sx = (projVec.x * 0.5 + 0.5) * cw;
          const sy = (-projVec.y * 0.5 + 0.5) * ch;
          angleRec.calloutEl.style.display = 'inline-flex';
          angleRec.calloutEl.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -50%)`;
        }
      }
    }

    // Update Multi-Point Closed Polygon Area Callout
    if (this.multiPointAreaCalloutEl && this.multiPointState && this.multiPointState.isClosed && this.multiPointAreaCentroid3D) {
      projVec.copy(this.multiPointAreaCentroid3D).project(this.camera);
      const isBehind = (projVec.z > 1.0 || projVec.z < -1.0);
      if (isBehind) {
        this.multiPointAreaCalloutEl.style.display = 'none';
      } else {
        const sx = (projVec.x * 0.5 + 0.5) * cw;
        const sy = (-projVec.y * 0.5 + 0.5) * ch;
        this.multiPointAreaCalloutEl.style.display = 'inline-flex';
        this.multiPointAreaCalloutEl.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -50%)`;
      }
    } else if (this.multiPointAreaCalloutEl) {
      this.multiPointAreaCalloutEl.style.display = 'none';
    }

    // Update placed Radius Measurements (scale, projection & Liang-Barsky edge clamping)
    if (hasRadiusMarkers) {
      for (const radRec of this.radiusMeasurements) {
        if (!radRec || !radRec.group) continue;

        // 1. Center indicator scale
        let cDist = 1;
        if (!isOrtho) cDist = this.camera.position.distanceTo(radRec.target.center);
        const cWorldPerPix = isOrtho ? ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) / ch : (2 * cDist * tanHalfFov) / ch;
        const cScale = Math.max(1e-5, cWorldPerPix * 10);
        if (radRec.centerGroup) {
          radRec.centerGroup.scale.set(cScale, cScale, cScale);
          radRec.centerGroup.quaternion.copy(this.camera.quaternion);
        }

        // 2. Cone scale
        let pDist = 1;
        if (!isOrtho) pDist = this.camera.position.distanceTo(radRec.target.targetPoint);
        const pWorldPerPix = isOrtho ? ((this.camera.top - this.camera.bottom) / (this.camera.zoom || 1)) / ch : (2 * pDist * tanHalfFov) / ch;
        const coneScale = Math.max(1e-5, pWorldPerPix * 10);
        if (radRec.cone) {
          radRec.cone.scale.set(coneScale, coneScale, coneScale);
        }

        // 3. Project arrow endpoints to screen with Liang-Barsky clamping
        if (radRec.calloutEl) {
          const p0 = radRec.arrowStart;
          const p1 = radRec.arrowEnd;

          projVec.copy(p0).project(this.camera);
          const p0Behind = (projVec.z > 1.0 || projVec.z < -1.0);
          const s0x = (projVec.x * 0.5 + 0.5) * cw;
          const s0y = (-projVec.y * 0.5 + 0.5) * ch;

          projVec.copy(p1).project(this.camera);
          const p1Behind = (projVec.z > 1.0 || projVec.z < -1.0);
          const s1x = (projVec.x * 0.5 + 0.5) * cw;
          const s1y = (-projVec.y * 0.5 + 0.5) * ch;

          if (p0Behind && p1Behind) {
            radRec.calloutEl.style.display = 'none';
            continue;
          }

          const safeMargin = 16;

          const clipRes = this.clipSegmentToScreen(s0x, s0y, s1x, s1y, safeMargin, cw - safeMargin, safeMargin, ch - safeMargin);
          if (!clipRes) {
            radRec.calloutEl.style.display = 'none';
          } else {
            const t = Math.max(clipRes.t0, Math.min(clipRes.t1, 0.5));
            const bx = s0x + t * (s1x - s0x);
            const by = s0y + t * (s1y - s0y);

            radRec.calloutEl.style.display = 'block';
            radRec.calloutEl.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0) translate(-50%, -50%)`;
          }
        }
      }
    }
  }

  refreshPointMeasureUI() {
    if (this.measureMarkers && this.measureMarkers.length > 0) {
      this.measureMarkers.forEach(m => {
        if (m.mode === 'point') this.createOrUpdateMeasureCalloutDOM(m);
      });
      this.updateMeasureMarkersAndCallouts();
    }
    this.renderMeasurementResults();
  }

  // =========================================================================
  // MULTI-POINT CUMULATIVE DISTANCE MEASUREMENT SYSTEM
  // =========================================================================
  ensureMultiPointHoverCalloutDOM() {
    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    if (!listEl) return;
    if (!this.multiPointHoverCalloutEl) {
      this.multiPointHoverCalloutEl = document.createElement('div');
      this.multiPointHoverCalloutEl.className = 'measure-multipoint-seg-hover-callout';
      this.multiPointHoverCalloutEl.style.display = 'none';
      this.multiPointHoverCalloutEl.style.pointerEvents = 'none';
      this.multiPointHoverCalloutEl.textContent = '--';
    }
    if (this.multiPointHoverCalloutEl.parentNode !== listEl) {
      listEl.appendChild(this.multiPointHoverCalloutEl);
    }
  }

  initMultiPointPreview() {
    if (!this.multiPointPreviewLine) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.multiPointPreviewLine = new THREE.Line(lineGeom, new THREE.LineDashedMaterial({
        color: 0xf59e0b,
        dashSize: 0.20,
        gapSize: 0.12,
        depthTest: false,
        depthWrite: false
      }));
      this.multiPointPreviewLine.computeLineDistances();
      this.multiPointPreviewLine.visible = false;
      this.multiPointPreviewLine.renderOrder = 2300;
      this.scene.add(this.multiPointPreviewLine);
    }
    this.ensureMultiPointHoverCalloutDOM();
  }

  hideMultiPointPreview() {
    if (this.multiPointPreviewLine) {
      this.multiPointPreviewLine.visible = false;
    }
    this.requestRender(100);
  }

  ensureMultiPointClosurePopoverDOM() {
    if (this.multiPointClosurePopoverEl && this.multiPointClosurePopoverEl.parentNode) return;
    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    if (!listEl) return;

    const pop = document.createElement('div');
    pop.className = 'measure-closure-popover';
    pop.id = 'measure-closure-popover';
    pop.style.display = 'none';

    const textEl = document.createElement('div');
    textEl.className = 'measure-closure-popover-text';
    textEl.textContent = I18N.t('measureMultiConfirmClose') || 'Close polyline?';

    const acts = document.createElement('div');
    acts.className = 'measure-closure-popover-actions';

    const btnConfirm = document.createElement('button');
    btnConfirm.type = 'button';
    btnConfirm.className = 'measure-closure-btn-close';
    btnConfirm.textContent = I18N.t('measureMultiBtnClose') || 'Close';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'measure-closure-btn-cancel';
    btnCancel.textContent = I18N.t('measureMultiBtnCancel') || 'Cancel';

    btnConfirm.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = this.pendingClosureAction;
      this.hideMultiPointClosurePopover();
      if (action && action.onConfirm) action.onConfirm();
    });

    btnCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = this.pendingClosureAction;
      this.hideMultiPointClosurePopover();
      if (action && action.onCancel) action.onCancel();
    });

    acts.appendChild(btnCancel);
    acts.appendChild(btnConfirm);
    pop.appendChild(textEl);
    pop.appendChild(acts);
    listEl.appendChild(pop);

    this.multiPointClosurePopoverEl = pop;
  }

  showMultiPointClosurePopover(anchorPoint, onConfirm, onCancel) {
    this.ensureMultiPointClosurePopoverDOM();
    if (!this.multiPointClosurePopoverEl) return;

    this.pendingClosureAction = {
      point: anchorPoint.clone(),
      onConfirm,
      onCancel
    };

    const textEl = this.multiPointClosurePopoverEl.querySelector('.measure-closure-popover-text');
    if (textEl) textEl.textContent = I18N.t('measureMultiConfirmClose') || 'Close polyline?';
    const btnClose = this.multiPointClosurePopoverEl.querySelector('.measure-closure-btn-close');
    if (btnClose) btnClose.textContent = I18N.t('measureMultiBtnClose') || 'Close';
    const btnCancel = this.multiPointClosurePopoverEl.querySelector('.measure-closure-btn-cancel');
    if (btnCancel) btnCancel.textContent = I18N.t('measureMultiBtnCancel') || 'Cancel';

    this.multiPointClosurePopoverEl.style.display = 'flex';
    this.updateMultiPointClosurePopoverPosition();
    this.requestRender(100);
  }

  hideMultiPointClosurePopover() {
    if (this.multiPointClosurePopoverEl) {
      this.multiPointClosurePopoverEl.style.display = 'none';
    }
    this.pendingClosureAction = null;
    this.requestRender(100);
  }

  updateMultiPointClosurePopoverPosition() {
    if (!this.pendingClosureAction || !this.multiPointClosurePopoverEl || !this.camera || !this.container) return;
    const p = this.pendingClosureAction.point;
    const projVec = p.clone().project(this.camera);
    if (projVec.z > 1.0 || projVec.z < -1.0) {
      this.multiPointClosurePopoverEl.style.display = 'none';
      return;
    }
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const sx = (projVec.x * 0.5 + 0.5) * cw;
    const sy = (-projVec.y * 0.5 + 0.5) * ch;

    this.multiPointClosurePopoverEl.style.display = 'flex';
    this.multiPointClosurePopoverEl.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy - 12)}px, 0) translate(-50%, -125%)`;
  }

  closeMultiPointMeasurement() {
    if (!this.multiPointState || this.multiPointState.points.length < 3) return;
    if (this.multiPointState.isClosed) return;

    const points = this.multiPointState.points;
    const N = points.length;
    const pLast = points[N - 1];
    const pFirst = points[0];

    const geom = new THREE.BufferGeometry().setFromPoints([pLast, pFirst]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      linewidth: 3,
      depthTest: false,
      depthWrite: false
    }));
    line.renderOrder = 1205;
    line.userData = { isMeasureLine: true, isMultiPointLine: true, segmentIndex: N - 1 };
    this.scene.add(line);
    this.multiPointState.lines.push(line);

    const closeLen = pLast.distanceTo(pFirst);
    this.multiPointState.segments.push({
      from: N - 1,
      to: 0,
      length: closeLen
    });
    this.multiPointState.totalLength += closeLen;

    this.multiPointState.isClosed = true;
    this.multiPointState.isDrawing = false;
    this.multiPointDrawDir = 'append';
    this.hideMultiPointPreview();
    this.hideMultiPointInsertPreview();

    const btnDone = document.getElementById('btn-measure-multi-done');
    if (btnDone) btnDone.style.display = 'none';

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) hintEl.textContent = (I18N.t('measureMultiClosed') || 'Closed') + ' polyline';

    this.renderMultiPointResults();
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  mergeAndCloseMultiPointOnDrag(dragIdx, targetIdx) {
    if (!this.multiPointState || this.multiPointState.isClosed) return;
    const totalPts = this.multiPointState.points.length;
    if (totalPts < 3) return;

    if (this.snapEngine) {
      this.snapEngine.hideIndicator();
    }

    // Case 1: Tail point dragged to Head point (e.g. Pt #4 dragged to Pt #1)
    if (dragIdx === totalPts - 1) {
      const markerToDel = this.multiPointState.markers.pop();
      if (markerToDel) {
        this.deleteMeasurePoint(markerToDel.id);
      }
      this.multiPointState.points.pop();
    }
    // Case 2: Head point dragged to Tail point (e.g. Pt #1 dragged to Pt #4)
    else if (dragIdx === 0) {
      const markerToDel = this.multiPointState.markers.shift();
      if (markerToDel) {
        this.deleteMeasurePoint(markerToDel.id);
      }
      this.multiPointState.points.shift();
      // Renumber remaining markers
      this.multiPointState.markers.forEach((m, idx) => {
        m.multiPointIndex = idx;
        if (m.calloutEl) {
          m.calloutEl.textContent = `Pt #${idx + 1}`;
          m.calloutEl.title = `Pt #${idx + 1}: click to inspect, drag to adjust position`;
        }
      });
    }

    // Reconstruct all 3D lines and segments as a closed loop
    if (this.multiPointState.lines) {
      for (const line of this.multiPointState.lines) {
        if (!line) continue;
        this.scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      }
    }

    const N = this.multiPointState.points.length;
    const newLines = [];
    const newSegments = [];
    let newTotal = 0;

    for (let i = 0; i < N; i++) {
      const pA = this.multiPointState.points[i];
      const pB = this.multiPointState.points[(i + 1) % N];
      const geom = new THREE.BufferGeometry().setFromPoints([pA, pB]);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        linewidth: 3,
        depthTest: false,
        depthWrite: false
      }));
      line.renderOrder = 1205;
      line.userData = { isMeasureLine: true, isMultiPointLine: true, segmentIndex: i };
      this.scene.add(line);
      newLines.push(line);

      const len = pA.distanceTo(pB);
      newSegments.push({ from: i, to: (i + 1) % N, length: len });
      newTotal += len;
    }

    this.multiPointState.lines = newLines;
    this.multiPointState.segments = newSegments;
    this.multiPointState.totalLength = newTotal;
    this.multiPointState.isClosed = true;
    this.multiPointState.isDrawing = false;
    this.multiPointDrawDir = 'append';
    this.hideMultiPointPreview();
    this.hideMultiPointInsertPreview();

    const btnDone = document.getElementById('btn-measure-multi-done');
    if (btnDone) btnDone.style.display = 'none';

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) hintEl.textContent = (I18N.t('measureMultiClosed') || 'Closed') + ' polyline';

    this.renderMultiPointResults();
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  breakMultiPointClosure(markerId) {
    if (!this.multiPointState || !this.multiPointState.isClosed) return;
    const mIdx = this.multiPointState.markers.findIndex(m => m.id === markerId);
    if (mIdx < 0) return;

    const k = mIdx;
    const N = this.multiPointState.points.length;
    const oldPoints = this.multiPointState.points;
    const oldMarkers = this.multiPointState.markers;

    // 1. Re-order points starting from k and append a duplicate of Pk as new endpoint
    const newPoints = [];
    const newMarkers = [];
    for (let i = 0; i < N; i++) {
      const idx = (k + i) % N;
      newPoints.push(oldPoints[idx].clone());
      newMarkers.push(oldMarkers[idx]);
    }
    // Duplicate of Pk as final endpoint
    const pEnd = oldPoints[k].clone();
    newPoints.push(pEnd);

    // Create new marker at pEnd
    const endHit = {
      point: pEnd,
      normal: oldMarkers[k].normal || new THREE.Vector3(0, 1, 0),
      object: oldMarkers[k].group
    };
    const endMarker = this.createMultiPointMarker(endHit, N + 1);
    newMarkers.push(endMarker);

    // 2. Recreate all 3D lines
    this.multiPointState.lines.forEach(line => {
      if (line) {
        this.scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      }
    });

    const newLines = [];
    const newSegments = [];
    let newTotal = 0;

    for (let i = 0; i < N; i++) {
      const pA = newPoints[i];
      const pB = newPoints[i + 1];
      const geom = new THREE.BufferGeometry().setFromPoints([pA, pB]);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        linewidth: 3,
        depthTest: false,
        depthWrite: false
      }));
      line.renderOrder = 1205;
      line.userData = { isMeasureLine: true, isMultiPointLine: true, segmentIndex: i };
      this.scene.add(line);
      newLines.push(line);

      const len = pA.distanceTo(pB);
      newSegments.push({ from: i, to: i + 1, length: len });
      newTotal += len;
    }

    // 3. Update multiPointState
    this.multiPointState.points = newPoints;
    this.multiPointState.markers = newMarkers;
    this.multiPointState.lines = newLines;
    this.multiPointState.segments = newSegments;
    this.multiPointState.totalLength = newTotal;
    this.multiPointState.isClosed = false;

    // 4. Renumber all markers
    this.multiPointState.markers.forEach((m, idx) => {
      m.multiPointIndex = idx;
      if (m.calloutEl) {
        m.calloutEl.textContent = `Pt #${idx + 1}`;
        m.calloutEl.title = `Pt #${idx + 1}: click to inspect, drag to adjust position`;
      }
    });

    this.renderMultiPointResults();
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  startMultiPointInsert(segIdx) {
    if (!this.multiPointState || !this.multiPointState.segments[segIdx]) return;
    this.multiPointInsertSegIdx = segIdx;
    this.isMeasureMode = true;
    if (this.canvas) this.canvas.style.cursor = 'crosshair';

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) hintEl.textContent = I18N.t('measureMultiPromptInsert') || "Click surface to insert measurement point | Esc to cancel";

    this.initMultiPointInsertPreview();
    this.requestRender(100);
  }

  initMultiPointInsertPreview() {
    if (this.multiPointInsertPreviewLine) return;
    const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    this.multiPointInsertPreviewLine = new THREE.Line(geom, new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 0.20,
      gapSize: 0.12,
      depthTest: false,
      depthWrite: false
    }));
    this.multiPointInsertPreviewLine.computeLineDistances();
    this.multiPointInsertPreviewLine.visible = false;
    this.multiPointInsertPreviewLine.renderOrder = 2305;
    this.scene.add(this.multiPointInsertPreviewLine);
  }

  hideMultiPointInsertPreview() {
    if (this.multiPointInsertPreviewLine) {
      this.multiPointInsertPreviewLine.visible = false;
    }
    this.requestRender(100);
  }

  updateMultiPointInsertPreview(candidateHit) {
    if (this.multiPointInsertSegIdx < 0 || !this.multiPointState || !this.multiPointState.segments[this.multiPointInsertSegIdx] || !candidateHit || !candidateHit.point) {
      this.hideMultiPointInsertPreview();
      return;
    }
    const seg = this.multiPointState.segments[this.multiPointInsertSegIdx];
    const pFrom = this.multiPointState.points[seg.from];
    const pTo = this.multiPointState.points[seg.to];
    if (!pFrom || !pTo) return;

    if (!this.multiPointInsertPreviewLine) this.initMultiPointInsertPreview();
    if (this.multiPointInsertPreviewLine) {
      const curPt = candidateHit.point;
      const positions = this.multiPointInsertPreviewLine.geometry.attributes.position;
      positions.setXYZ(0, pFrom.x, pFrom.y, pFrom.z);
      positions.setXYZ(1, curPt.x, curPt.y, curPt.z);
      positions.setXYZ(2, pTo.x, pTo.y, pTo.z);
      positions.needsUpdate = true;
      if (this.multiPointInsertPreviewLine.computeLineDistances) {
        this.multiPointInsertPreviewLine.computeLineDistances();
      }
      this.multiPointInsertPreviewLine.visible = true;
    }
    this.requestRender(100);
  }

  startMultiPointPrepend() {
    if (!this.multiPointState || this.multiPointState.points.length === 0) return;
    this.multiPointState.isDrawing = true;
    this.multiPointDrawDir = 'prepend';
    this.isMeasureMode = true;
    if (this.canvas) this.canvas.style.cursor = 'crosshair';

    const btnDone = document.getElementById('btn-measure-multi-done');
    if (btnDone) btnDone.style.display = 'inline-block';

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) hintEl.textContent = I18N.t('measureMultiPromptPrepend') || "Click surface to extend polyline start | Double-click or click 'Done' to finish";

    this.initMultiPointPreview();
    this.requestRender(100);
  }

  startMultiPointAppend() {
    if (!this.multiPointState || this.multiPointState.points.length === 0) return;
    this.multiPointState.isDrawing = true;
    this.multiPointDrawDir = 'append';
    this.isMeasureMode = true;
    if (this.canvas) this.canvas.style.cursor = 'crosshair';

    const btnDone = document.getElementById('btn-measure-multi-done');
    if (btnDone) btnDone.style.display = 'inline-block';

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) hintEl.textContent = I18N.t('measureMultiPromptPickNext') || "Click surface to add next point | Double-click or click 'Done' to finish";

    this.initMultiPointPreview();
    this.requestRender(100);
  }

  updateMultiPointPreview(candidateHit) {
    if (this.multiPointInsertSegIdx >= 0) {
      this.updateMultiPointInsertPreview(candidateHit);
      return;
    }
    if (!this.multiPointState || !this.multiPointState.isDrawing || this.multiPointState.points.length === 0 || !candidateHit || !candidateHit.point) {
      this.hideMultiPointPreview();
      return;
    }
    const anchorPt = (this.multiPointDrawDir === 'prepend')
      ? this.multiPointState.points[0]
      : this.multiPointState.points[this.multiPointState.points.length - 1];
    const curPt = candidateHit.point;

    if (!this.multiPointPreviewLine) this.initMultiPointPreview();

    if (this.multiPointPreviewLine) {
      const positions = this.multiPointPreviewLine.geometry.attributes.position;
      positions.setXYZ(0, anchorPt.x, anchorPt.y, anchorPt.z);
      positions.setXYZ(1, curPt.x, curPt.y, curPt.z);
      positions.needsUpdate = true;
      if (this.multiPointPreviewLine.computeLineDistances) {
        this.multiPointPreviewLine.computeLineDistances();
      }
      this.multiPointPreviewLine.visible = true;
    }
    this.requestRender(100);
  }

  createMultiPointMarker(hit, index) {
    if (!hit || !hit.point) return null;
    if (!this.measureMarkersGroup) this.initMeasurementSystem();

    const id = `multi-pt-${++this.measurePointCounter}`;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    const meshParts = this.createStandardMeasureMarkerMesh(id, {
      showSlopeArrow: false,
      themeColor: 0x00f0ff
    });

    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    const badgeEl = document.createElement('div');
    badgeEl.className = 'measure-multipoint-badge';
    badgeEl.textContent = `Pt #${index}`;
    badgeEl.title = `Pt #${index}: click to inspect, drag to adjust position`;
    if (listEl) listEl.appendChild(badgeEl);

    const marker = {
      id,
      mode: 'multipoint',
      multiPointIndex: index - 1,
      point: hit.point.clone(),
      normal: slopeData.normal.clone(),
      slopeData,
      showSlopeArrow: false,
      baseColor: 0x00f0ff,
      calloutOffset: { x: 0, y: 0 },
      calloutEl: badgeEl,
      leaderLineEl: null,
      leaderDotEl: null,
      ...meshParts
    };

    badgeEl.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && e.shiftKey) {
        e.stopPropagation();
        this.deleteMultiPointPoint(marker.id);
        return;
      }
      e.stopPropagation();
      this.isDraggingMeasurePoint = true;
      this.draggingMeasureMarker = marker;
      this.setMeasureMarkerDragging(marker, true);
      this.canvas.style.cursor = 'grabbing';
    });

    badgeEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.contextMenuMeasureMarker = marker;
      this.contextMenuMeasureSurfaceHit = null;
      this.showContextMenu(e.clientX, e.clientY);
    });

    this.measureMarkersGroup.add(marker.group);
    this.measureMarkers.push(marker);

    this.orientMeasureMarkerToSurface(marker);
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
    return marker;
  }

  finishMultiPointMeasurement() {
    if (!this.multiPointState || !this.multiPointState.isDrawing) return;

    const points = this.multiPointState.points;
    if (points.length < 2) {
      this.cancelPendingMultiPoint();
      return;
    }

    // Check if the last two points are identical (e.g. from dblclick second tap)
    if (points.length >= 2) {
      const pLast = points[points.length - 1];
      const pPrev = points[points.length - 2];
      if (pLast.distanceTo(pPrev) < 1e-3) {
        points.pop();
        const lastMarker = this.multiPointState.markers.pop();
        if (lastMarker) this.deleteMeasurePoint(lastMarker.id);
        const lastLine = this.multiPointState.lines.pop();
        if (lastLine) {
          this.scene.remove(lastLine);
          if (lastLine.geometry) lastLine.geometry.dispose();
          if (lastLine.material) lastLine.material.dispose();
        }
        if (this.multiPointState.segments.length > 0) {
          const removedSeg = this.multiPointState.segments.pop();
          this.multiPointState.totalLength -= (removedSeg ? removedSeg.length : 0);
        }
      }
    }

    this.multiPointState.isDrawing = false;
    this.multiPointDrawDir = 'append';
    this.multiPointInsertSegIdx = -1;
    this.hideMultiPointPreview();
    this.hideMultiPointInsertPreview();

    const btnDone = document.getElementById('btn-measure-multi-done');
    if (btnDone) btnDone.style.display = 'none';

    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    const decimals = unit === 'mm' ? 0 : 3;
    const formattedTotal = (this.multiPointState.totalLength * scale).toFixed(decimals);

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) {
      hintEl.textContent = `${I18N.t('measureMultiTotal') || 'Total Length'}: ${formattedTotal} ${unit}. ${I18N.t('measureMultiHint') || 'Drag points to adjust'}`;
    }

    showToast(`${I18N.t('measureMultiTotal') || 'Total'}: ${formattedTotal} ${unit} (${this.multiPointState.segments.length} segs)`, 'success');

    this.renderMultiPointResults();
    this.requestRender(200);
  }

  cancelPendingMultiPoint() {
    if (!this.multiPointState || !this.multiPointState.isDrawing) return;
    this.clearMultiPointMeasurement();
    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl && this.measureMode === 'multipoint') {
      hintEl.textContent = I18N.t('measureMultiPromptPickFirst') || 'Click surface to place Point #1 (Start)';
    }
  }

  deleteMultiPointPoint(id) {
    if (!this.multiPointState || !this.multiPointState.markers) return;
    const mIdx = this.multiPointState.markers.findIndex(m => m.id === id);
    if (mIdx < 0) return;

    const totalPts = this.multiPointState.points.length;
    // If only 1 or 2 points exist, deleting one leaves <= 1 point -> completely clean up and reset
    if (totalPts <= 2) {
      this.clearMultiPointMeasurement();
      return;
    }

    const marker = this.multiPointState.markers[mIdx];
    const k = mIdx; // 0-based point index being deleted

    // 1. Remove 3D marker group and 2D badge
    if (marker.group) {
      marker.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m && m.dispose());
          else obj.material.dispose();
        }
      });
      if (this.measureMarkersGroup) {
        this.measureMarkersGroup.remove(marker.group);
      }
    }
    if (marker.calloutEl && marker.calloutEl.parentNode) {
      marker.calloutEl.parentNode.removeChild(marker.calloutEl);
      marker.calloutEl = null;
    }

    // Remove from global measureMarkers
    const mmIdx = this.measureMarkers.findIndex(m => m.id === id);
    if (mmIdx >= 0) this.measureMarkers.splice(mmIdx, 1);

    // Remove from multiPointState
    this.multiPointState.markers.splice(k, 1);
    this.multiPointState.points.splice(k, 1);

    // 2. Heal lines and segments
    if (k === 0) {
      // Deleted start point: remove line 0, shift segments
      const line0 = this.multiPointState.lines.shift();
      if (line0) {
        this.scene.remove(line0);
        if (line0.geometry) line0.geometry.dispose();
        if (line0.material) line0.material.dispose();
      }
      this.multiPointState.segments.shift();
      this.multiPointState.segments.forEach((seg, i) => {
        seg.from = i;
        seg.to = i + 1;
        if (this.multiPointState.lines[i]) {
          this.multiPointState.lines[i].userData.segmentIndex = i;
        }
      });
    } else if (k === totalPts - 1) {
      // Deleted end point: remove last line
      const lastLine = this.multiPointState.lines.pop();
      if (lastLine) {
        this.scene.remove(lastLine);
        if (lastLine.geometry) lastLine.geometry.dispose();
        if (lastLine.material) lastLine.material.dispose();
      }
      this.multiPointState.segments.pop();
    } else {
      // Deleted intermediate point: heal segment between point k-1 and point k (old k+1)
      const pPrev = this.multiPointState.points[k - 1];
      const pNext = this.multiPointState.points[k];

      const linePrev = this.multiPointState.lines[k - 1];
      if (linePrev) {
        linePrev.geometry.dispose();
        linePrev.geometry = new THREE.BufferGeometry().setFromPoints([pPrev, pNext]);
      }

      const lineNext = this.multiPointState.lines.splice(k, 1)[0];
      if (lineNext) {
        this.scene.remove(lineNext);
        if (lineNext.geometry) lineNext.geometry.dispose();
        if (lineNext.material) lineNext.material.dispose();
      }

      this.multiPointState.segments[k - 1].to = k;
      this.multiPointState.segments[k - 1].length = pPrev.distanceTo(pNext);
      this.multiPointState.segments.splice(k, 1);

      this.multiPointState.segments.forEach((seg, i) => {
        seg.from = i;
        seg.to = i + 1;
        if (this.multiPointState.lines[i]) {
          this.multiPointState.lines[i].userData.segmentIndex = i;
        }
      });
    }

    // 3. Renumber all remaining markers and badges sequentially
    this.multiPointState.markers.forEach((m, idx) => {
      m.multiPointIndex = idx;
      if (m.calloutEl) {
        m.calloutEl.textContent = `Pt #${idx + 1}`;
        m.calloutEl.title = `Pt #${idx + 1}: click to inspect, drag to adjust position`;
      }
    });

    // 4. Recalculate total length
    let newTotal = 0;
    this.multiPointState.segments.forEach(seg => {
      newTotal += seg.length;
    });
    this.multiPointState.totalLength = newTotal;

    // Reset hovered segment if index is now invalid
    if (this.multiPointState.hoveredSegmentIndex >= this.multiPointState.segments.length) {
      this.setMultiPointHoveredSegment(-1);
    }

    // 5. Update UI and request render
    this.renderMultiPointResults();
    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  clearMultiPointMeasurement() {
    if (!this.multiPointState) return;

    if (this.multiPointState.lines) {
      for (const line of this.multiPointState.lines) {
        if (!line) continue;
        this.scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      }
    }

    if (this.multiPointState.markers) {
      for (const marker of this.multiPointState.markers) {
        if (!marker) continue;
        this.deleteMeasurePoint(marker.id);
      }
    }

    this.multiPointState = {
      isDrawing: false,
      isClosed: false,
      points: [],
      markers: [],
      lines: [],
      segments: [],
      totalLength: 0,
      hoveredSegmentIndex: -1
    };

    this.hideMultiPointPreview();
    this.hideMultiPointInsertPreview();
    this.hideMultiPointClosurePopover();

    const btnDone = document.getElementById('btn-measure-multi-done');
    if (btnDone) btnDone.style.display = 'none';

    const totalEl = document.getElementById('measure-res-multi-total');
    if (totalEl) totalEl.textContent = '--';

    const countEl = document.getElementById('measure-multi-seg-count');
    if (countEl) countEl.textContent = '0 segs';

    const segListEl = document.getElementById('measure-multi-segments-list');
    if (segListEl) segListEl.innerHTML = '';

    const unit = this.measureUnit || 'm';
    const areaUnit = unit === 'mm' ? 'mm²' : 'm²';
    const el3DLabel = document.getElementById('measure-multi-3d-area-label');
    const el3DVal = document.getElementById('measure-res-multi-3d-area');
    const elProjLabel = document.getElementById('measure-multi-proj-area-label');
    const elProjVal = document.getElementById('measure-res-multi-proj-area');
    const btnSelfIntersect = document.getElementById('measure-multi-self-intersect-btn');

    if (el3DLabel) el3DLabel.textContent = I18N.t('measureMulti3DAreaClosed') || '3D Area (est.) (when closed)';
    if (el3DVal) el3DVal.textContent = '-.--- ' + areaUnit;
    if (elProjLabel) elProjLabel.textContent = I18N.t('measureMultiProjAreaClosed') || 'Proj Area (when closed)';
    if (elProjVal) elProjVal.textContent = '-.--- ' + areaUnit;
    if (btnSelfIntersect) btnSelfIntersect.style.display = 'none';

    this.multiPointSelfIntersectingSegs = [];
    this.multiPointSelfIntersectPoints = [];
    this.removeMultiPointAreaMesh();
    this.removeMultiPointAreaDropLines();
    if (this.multiPointAreaCalloutEl) {
      this.multiPointAreaCalloutEl.style.display = 'none';
    }
    this.multiPointAreaDataCache = null;
    const row3D = document.getElementById('measure-multi-3d-area-row');
    const rowProj = document.getElementById('measure-multi-proj-area-row');
    if (row3D) row3D.classList.remove('measure-area-row-active');
    if (rowProj) rowProj.classList.remove('measure-area-row-active');

    this.requestRender(150);
  }

  updateMultiPointFromHit(marker, hit) {
    if (!marker || !hit || !hit.point) return;
    const slopeData = this.computeSurfaceNormalAndSlope(hit);
    marker.point.copy(hit.point);
    marker.normal.copy(slopeData.normal);
    marker.slopeData = slopeData;

    this.orientMeasureMarkerToSurface(marker);

    const idx = marker.multiPointIndex;
    if (idx !== undefined && this.multiPointState && this.multiPointState.points[idx]) {
      this.multiPointState.points[idx].copy(hit.point);

      let total = 0;
      for (let i = 0; i < this.multiPointState.segments.length; i++) {
        const seg = this.multiPointState.segments[i];
        const p0 = this.multiPointState.points[seg.from];
        const p1 = this.multiPointState.points[seg.to];
        seg.length = p0.distanceTo(p1);
        total += seg.length;

        const line = this.multiPointState.lines[i];
        if (line && (seg.from === idx || seg.to === idx)) {
          line.geometry.setFromPoints([p0, p1]);
          line.geometry.attributes.position.needsUpdate = true;
        }
      }
      this.multiPointState.totalLength = total;

      if (this.multiPointState.hoveredSegmentIndex >= 0) {
        const hSeg = this.multiPointState.segments[this.multiPointState.hoveredSegmentIndex];
        if (hSeg) {
          const p0 = this.multiPointState.points[hSeg.from];
          const p1 = this.multiPointState.points[hSeg.to];
          this.updateMultiPointHoverCalloutPosition(p0, p1);
        }
      }

      this.renderMultiPointResults();
    }

    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  checkLineSegmentIntersection2D(p1, p2, p3, p4) {
    const dx12 = p2.x - p1.x;
    const dy12 = p2.y - p1.y;
    const dx34 = p4.x - p3.x;
    const dy34 = p4.y - p3.y;

    const denom = dx12 * dy34 - dy12 * dx34;
    if (Math.abs(denom) < 1e-9) return null; // Parallel or collinear

    const dx31 = p3.x - p1.x;
    const dy31 = p3.y - p1.y;

    const t = (dx31 * dy34 - dy31 * dx34) / denom;
    const u = (dx31 * dy12 - dy31 * dx12) / denom;

    // Strict interior intersection (not sharing endpoints)
    if (t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4) {
      return {
        x: p1.x + t * dx12,
        y: p1.y + t * dy12,
        t,
        u
      };
    }
    return null;
  }

  computePolygonAreaScheme1(pts2D) {
    const N = pts2D.length;
    if (N < 3) return { area: 0, isSelfIntersecting: false, intersectingSegs: [], intersectionPoints: [], subLoops: [] };

    // 1. Detect all pairwise non-adjacent segment intersections
    const intersections = [];
    const intersectingSegSet = new Set();

    for (let i = 0; i < N; i++) {
      const p1 = pts2D[i];
      const p2 = pts2D[(i + 1) % N];

      for (let j = i + 2; j < N; j++) {
        // Skip if adjacent in loop (first and last segment share p0)
        if (i === 0 && j === N - 1) continue;

        const p3 = pts2D[j];
        const p4 = pts2D[(j + 1) % N];

        const inter = this.checkLineSegmentIntersection2D(p1, p2, p3, p4);
        if (inter) {
          intersectingSegSet.add(i);
          intersectingSegSet.add(j);
          const orig3D = (p1.orig3D && p2.orig3D) ? new THREE.Vector3().lerpVectors(p1.orig3D, p2.orig3D, inter.t) : null;
          intersections.push({
            segA: i,
            segB: j,
            tA: inter.t,
            tB: inter.u,
            point: { x: inter.x, y: inter.y, orig3D }
          });
        }
      }
    }

    const isSelfIntersecting = intersectingSegSet.size > 0;
    const intersectingSegs = Array.from(intersectingSegSet);

    // If no self-intersection: standard Shoelace formula
    if (!isSelfIntersecting) {
      let area = 0;
      for (let i = 0; i < N; i++) {
        const pA = pts2D[i];
        const pB = pts2D[(i + 1) % N];
        area += pA.x * pB.y - pB.x * pA.y;
      }
      return {
        area: Math.abs(area) * 0.5,
        isSelfIntersecting: false,
        intersectingSegs: [],
        intersectionPoints: [],
        subLoops: [pts2D]
      };
    }

    // Scheme 1: Decompose into sub-loops at intersection points
    const path = [];
    for (let i = 0; i < N; i++) {
      path.push({ pt: pts2D[i], id: `v-${i}` });

      const onSeg = [];
      intersections.forEach(inter => {
        if (inter.segA === i) {
          onSeg.push({ t: inter.tA, pt: inter.point, interId: `x-${Math.min(inter.segA, inter.segB)}-${Math.max(inter.segA, inter.segB)}` });
        } else if (inter.segB === i) {
          onSeg.push({ t: inter.tB, pt: inter.point, interId: `x-${Math.min(inter.segA, inter.segB)}-${Math.max(inter.segA, inter.segB)}` });
        }
      });
      onSeg.sort((a, b) => a.t - b.t);
      onSeg.forEach(item => {
        path.push({ pt: item.pt, id: item.interId });
      });
    }

    // Cycle-popping to extract all sub-polygons
    const stack = [];
    const subLoops = [];
    let totalAbsArea = 0;

    for (let k = 0; k < path.length; k++) {
      const node = path[k];
      const matchIdx = stack.findIndex(s => s.id === node.id);
      if (matchIdx >= 0) {
        // Cycle found from matchIdx to end of stack!
        const cycle = stack.splice(matchIdx).map(s => s.pt);
        if (cycle.length >= 3) {
          let subA = 0;
          for (let m = 0; m < cycle.length; m++) {
            const c1 = cycle[m];
            const c2 = cycle[(m + 1) % cycle.length];
            subA += c1.x * c2.y - c2.x * c1.y;
          }
          const absA = Math.abs(subA) * 0.5;
          totalAbsArea += absA;
          subLoops.push(cycle);
        }
        stack.push(node);
      } else {
        stack.push(node);
      }
    }

    if (stack.length >= 3) {
      const cycle = stack.map(s => s.pt);
      let remA = 0;
      for (let m = 0; m < cycle.length; m++) {
        const c1 = cycle[m];
        const c2 = cycle[(m + 1) % cycle.length];
        remA += c1.x * c2.y - c2.x * c1.y;
      }
      const absRem = Math.abs(remA) * 0.5;
      totalAbsArea += absRem;
      subLoops.push(cycle);
    }

    return {
      area: totalAbsArea,
      isSelfIntersecting: true,
      intersectingSegs,
      intersectionPoints: intersections.map(item => item.point),
      subLoops
    };
  }

  ensureMultiPointAreaCalloutDOM() {
    const listEl = document.getElementById('measure-callouts-layer') || this.container;
    if (!listEl) return;
    if (!this.multiPointAreaCalloutEl) {
      this.multiPointAreaCalloutEl = document.createElement('div');
      this.multiPointAreaCalloutEl.className = 'measure-area-callout';
      this.multiPointAreaCalloutEl.style.display = 'none';

      this.multiPointAreaCalloutEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMultiPointAreaMode();
      });
    }
    if (this.multiPointAreaCalloutEl.parentNode !== listEl) {
      listEl.appendChild(this.multiPointAreaCalloutEl);
    }
  }

  updateMultiPointAreaCalloutDOM(areaData) {
    if (!areaData) return;
    this.ensureMultiPointAreaCalloutDOM();
    if (!this.multiPointAreaCalloutEl) return;

    const is3D = (this.multiPointAreaMode || '3d') === '3d';
    const unit = this.measureUnit || 'm';
    const areaScale = unit === 'mm' ? 1000000 : 1;
    const areaDecimals = unit === 'mm' ? 0 : 3;
    const areaUnit = unit === 'mm' ? 'mm²' : 'm²';
    const valNum = is3D ? areaData.area3D : areaData.areaProj;
    const valFormatted = (valNum * areaScale).toFixed(areaDecimals) + ' ' + areaUnit;

    // 3D Mode Icon: 4-sided low pyramid with parallelogram base and obtuse apex (> 90 deg)
    const svg3DPyramid = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M 2 12 L 10 12 L 14 7 L 6 7 Z"></path><path d="M 8 3.5 L 2 12 M 8 3.5 L 10 12 M 8 3.5 L 14 7 M 8 3.5 L 6 7"></path></svg>`;
    // Horizontal Projection Mode Icon: same parallelogram base with flattened apex (interior diagonal criss-cross)
    const svgFlatProj = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M 2 12 L 10 12 L 14 7 L 6 7 Z"></path><path d="M 2 12 L 14 7 M 10 12 L 6 7"></path></svg>`;

    const iconSvg = is3D ? svg3DPyramid : svgFlatProj;
    const tip = is3D
      ? (I18N.t('measureMulti3DAreaToggleTip') || '3D True Area (Click to switch to Horizontal Projected Area)')
      : (I18N.t('measureMultiProjAreaToggleTip') || 'Horizontal Projected Area (Click to switch to 3D True Area)');

    this.multiPointAreaCalloutEl.innerHTML = `
      <button type="button" class="measure-area-mode-toggle" title="${tip}">${iconSvg}</button>
      <span class="measure-area-val">${valFormatted}</span>
    `;

    this.multiPointAreaCalloutEl.style.display = 'inline-flex';
  }

  toggleMultiPointAreaMode() {
    this.multiPointAreaMode = (this.multiPointAreaMode === '3d' ? 'horizontal' : '3d');
    if (this.multiPointAreaDataCache) {
      this.updateMultiPointAreaMesh(this.multiPointAreaDataCache);
      this.updateMultiPointAreaCalloutDOM(this.multiPointAreaDataCache);
    }
    const row3D = document.getElementById('measure-multi-3d-area-row');
    const rowProj = document.getElementById('measure-multi-proj-area-row');
    if (row3D) row3D.classList.toggle('measure-area-row-active', this.multiPointAreaMode === '3d');
    if (rowProj) rowProj.classList.toggle('measure-area-row-active', this.multiPointAreaMode === 'horizontal');

    this.updateMeasureMarkersAndCallouts();
    this.requestRender(200);
  }

  computeMultiPointClosedArea() {
    if (!this.multiPointState || !this.multiPointState.isClosed || this.multiPointState.points.length < 3) {
      return {
        area3D: 0,
        areaProj: 0,
        isSelfIntersecting: false,
        intersectingSegs: [],
        intersectionPoints3D: [],
        subLoopsTriangles: [],
        centroid3D: new THREE.Vector3(),
        minY: 0,
        points: []
      };
    }

    const points = this.multiPointState.points;
    const N = points.length;

    // 1. Compute Newell Normal for best-fit 3D plane
    const normal = new THREE.Vector3();
    let minY = Infinity;
    const centroid3D = new THREE.Vector3();

    for (let i = 0; i < N; i++) {
      const pA = points[i];
      const pB = points[(i + 1) % N];
      normal.x += (pA.y - pB.y) * (pA.z + pB.z);
      normal.y += (pA.z - pB.z) * (pA.x + pB.x);
      normal.z += (pA.x - pB.x) * (pA.y + pB.y);

      if (pA.y < minY) minY = pA.y;
      centroid3D.add(pA);
    }
    centroid3D.divideScalar(N);

    if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
    else normal.normalize();

    // Orthonormal basis (uAxis, vAxis)
    const up = Math.abs(normal.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const uAxis = new THREE.Vector3().crossVectors(normal, up).normalize();
    const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();
    const origin = points[0];

    // Project to 2D best-fit plane (u, v)
    const pts2D = points.map(p => {
      const diff = new THREE.Vector3().subVectors(p, origin);
      return {
        x: diff.dot(uAxis),
        y: diff.dot(vAxis),
        orig3D: p
      };
    });

    const res3D = this.computePolygonAreaScheme1(pts2D);

    // Calculate Ear-Clipping 3D spatial triangle area with original 3D coordinates
    let real3DArea = 0;
    const subLoopsTriangles = [];
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const triCross = new THREE.Vector3();

    res3D.subLoops.forEach(loop => {
      if (loop.length < 3) return;
      const shapePts = loop.map(p => new THREE.Vector2(p.x, p.y));
      const faces = THREE.ShapeUtils.triangulateShape(shapePts, []);
      const triList = [];
      faces.forEach(face => {
        const v0 = loop[face[0]].orig3D;
        const v1 = loop[face[1]].orig3D;
        const v2 = loop[face[2]].orig3D;
        if (v0 && v1 && v2) {
          e1.subVectors(v1, v0);
          e2.subVectors(v2, v0);
          triCross.crossVectors(e1, e2);
          real3DArea += 0.5 * triCross.length();
          triList.push([v0, v1, v2]);
        }
      });
      subLoopsTriangles.push(triList);
    });

    // 2. Horizontal Projected Area (project onto XZ plane where Y=0)
    const ptsHoriz = points.map(p => ({
      x: p.x,
      y: p.z,
      orig3D: p
    }));
    const resHoriz = this.computePolygonAreaScheme1(ptsHoriz);

    const intersectionPoints3D = res3D.intersectionPoints.map(p => {
      return origin.clone().addScaledVector(uAxis, p.x).addScaledVector(vAxis, p.y);
    });

    return {
      area3D: real3DArea,
      areaProj: resHoriz.area,
      isSelfIntersecting: res3D.isSelfIntersecting,
      intersectingSegs: res3D.intersectingSegs,
      intersectionPoints3D,
      subLoopsTriangles,
      centroid3D,
      minY,
      points
    };
  }

  updateMultiPointAreaMesh(areaData) {
    this.removeMultiPointAreaMesh();
    this.removeMultiPointAreaDropLines();
    if (!areaData || !areaData.subLoopsTriangles || areaData.subLoopsTriangles.length === 0) return;

    const is3D = (this.multiPointAreaMode || '3d') === '3d';
    const vertices = [];

    areaData.subLoopsTriangles.forEach(triList => {
      triList.forEach(tri => {
        const v0 = tri[0];
        const v1 = tri[1];
        const v2 = tri[2];
        if (is3D) {
          vertices.push(v0.x, v0.y, v0.z);
          vertices.push(v1.x, v1.y, v1.z);
          vertices.push(v2.x, v2.y, v2.z);
        } else {
          const y = areaData.minY;
          vertices.push(v0.x, y, v0.z);
          vertices.push(v1.x, y, v1.z);
          vertices.push(v2.x, y, v2.z);
        }
      });
    });

    if (vertices.length === 0) return;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();

    this.multiPointAreaMesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      opacity: 0.22,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    }));
    this.multiPointAreaMesh.renderOrder = 1200;
    this.scene.add(this.multiPointAreaMesh);

    // If in horizontal mode: add dashed drop lines from 3D points down to minY
    if (!is3D && areaData.points && areaData.points.length > 0) {
      const dropPts = [];
      const yMin = areaData.minY;
      areaData.points.forEach(p => {
        if (Math.abs(p.y - yMin) > 0.005) {
          dropPts.push(p.x, p.y, p.z, p.x, yMin, p.z);
        }
      });
      if (dropPts.length > 0) {
        const dropGeom = new THREE.BufferGeometry();
        dropGeom.setAttribute('position', new THREE.Float32BufferAttribute(dropPts, 3));
        const dropMat = new THREE.LineDashedMaterial({
          color: 0x38bdf8,
          dashSize: 0.18,
          gapSize: 0.10,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false
        });
        const dropLines = new THREE.LineSegments(dropGeom, dropMat);
        dropLines.computeLineDistances();
        dropLines.renderOrder = 1205;
        this.multiPointAreaDropLines = dropLines;
        this.scene.add(this.multiPointAreaDropLines);
      }
    }

    // Update 3D centroid position
    if (is3D) {
      this.multiPointAreaCentroid3D.copy(areaData.centroid3D);
    } else {
      this.multiPointAreaCentroid3D.set(areaData.centroid3D.x, areaData.minY, areaData.centroid3D.z);
    }
  }

  removeMultiPointAreaMesh() {
    if (this.multiPointAreaMesh) {
      this.scene.remove(this.multiPointAreaMesh);
      if (this.multiPointAreaMesh.geometry) this.multiPointAreaMesh.geometry.dispose();
      if (this.multiPointAreaMesh.material) this.multiPointAreaMesh.material.dispose();
      this.multiPointAreaMesh = null;
    }
    this.removeMultiPointAreaDropLines();
  }

  removeMultiPointAreaDropLines() {
    if (this.multiPointAreaDropLines) {
      this.scene.remove(this.multiPointAreaDropLines);
      if (this.multiPointAreaDropLines.geometry) this.multiPointAreaDropLines.geometry.dispose();
      if (this.multiPointAreaDropLines.material) this.multiPointAreaDropLines.material.dispose();
      this.multiPointAreaDropLines = null;
    }
  }

  focusAndFlashSelfIntersection() {
    if (!this.multiPointSelfIntersectingSegs || this.multiPointSelfIntersectingSegs.length === 0) return;

    // 1. Focus camera on the self-intersection region
    const box = new THREE.Box3();
    if (this.multiPointSelfIntersectPoints && this.multiPointSelfIntersectPoints.length > 0) {
      this.multiPointSelfIntersectPoints.forEach(p => box.expandByPoint(p));
    } else if (this.multiPointState && this.multiPointState.lines) {
      this.multiPointSelfIntersectingSegs.forEach(segIdx => {
        const line = this.multiPointState.lines[segIdx];
        if (line) box.expandByObject(line);
      });
    }

    if (!box.isEmpty()) {
      box.expandByScalar(1.5);
      this.zoomToBox(box);
    }

    // 2. Glow effect on self-intersecting lines: bright red glow (5px) fading out over 1.0s
    if (this.multiPointGlowAnimId) {
      cancelAnimationFrame(this.multiPointGlowAnimId);
      this.multiPointGlowAnimId = null;
    }

    const selfIntersectLines = (this.multiPointState && this.multiPointState.lines)
      ? this.multiPointSelfIntersectingSegs.map(idx => this.multiPointState.lines[idx]).filter(Boolean)
      : [];

    const startTime = performance.now();
    const duration = 1000; // 1.0 second
    const canvas = this.canvas;

    const animateGlow = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);

      // Interpolate color from bright scarlet #ff0033 to normal self-intersect red #ff3b30
      // Hex: 0xff0033 -> 0xff3b30
      const r = 255;
      const g = Math.round(0 + progress * 59);
      const b = Math.round(51 - progress * 3);
      const curColorHex = (r << 16) | (g << 8) | b;

      selfIntersectLines.forEach(line => {
        if (line && line.material) {
          line.material.color.setHex(curColorHex);
        }
      });

      // 5px glow fading out
      if (canvas) {
        const glowBlur = Math.round(5 * (1.0 - progress));
        const glowAlpha = (1.0 - progress) * 0.85;
        if (glowBlur > 0 && glowAlpha > 0.05) {
          canvas.style.filter = `drop-shadow(0 0 ${glowBlur}px rgba(255, 0, 51, ${glowAlpha.toFixed(2)}))`;
        } else {
          canvas.style.filter = '';
        }
      }

      this.requestRender(100);

      if (progress < 1.0) {
        this.multiPointGlowAnimId = requestAnimationFrame(animateGlow);
      } else {
        if (canvas) canvas.style.filter = '';
        selfIntersectLines.forEach(line => {
          if (line && line.material) {
            line.material.color.setHex(0xff3b30);
          }
        });
        this.multiPointGlowAnimId = null;
        this.requestRender(100);
      }
    };

    this.multiPointGlowAnimId = requestAnimationFrame(animateGlow);
  }

  renderMultiPointResults() {
    const totalEl = document.getElementById('measure-res-multi-total');
    const countEl = document.getElementById('measure-multi-seg-count');
    const listEl = document.getElementById('measure-multi-segments-list');
    if (!totalEl || !listEl) return;

    const unit = this.measureUnit || 'm';
    const scale = unit === 'mm' ? 1000 : 1;
    const decimals = unit === 'mm' ? 0 : 3;

    if (!this.multiPointState || this.multiPointState.points.length === 0) {
      totalEl.textContent = '--';
      if (countEl) countEl.textContent = '0 segs';
      listEl.innerHTML = '';
      return;
    }

    const totalFormatted = (this.multiPointState.totalLength * scale).toFixed(decimals) + ' ' + unit;
    totalEl.textContent = totalFormatted;

    const segCount = this.multiPointState.segments.length;
    if (countEl) {
      const template = I18N.t('measureMultiSegCount') || '{count} segs';
      let text = template.replace('{count}', segCount);
      if (this.multiPointState.isClosed) {
        text += ' (' + (I18N.t('measureMultiClosed') || 'Closed') + ')';
      }
      countEl.textContent = text;
    }

    // Area Calculation and Self-Intersection Handling
    const el3DLabel = document.getElementById('measure-multi-3d-area-label');
    const el3DVal = document.getElementById('measure-res-multi-3d-area');
    const elProjLabel = document.getElementById('measure-multi-proj-area-label');
    const elProjVal = document.getElementById('measure-res-multi-proj-area');
    const btnSelfIntersect = document.getElementById('measure-multi-self-intersect-btn');

    const areaUnit = unit === 'mm' ? 'mm²' : 'm²';
    const areaScale = unit === 'mm' ? 1e6 : 1;
    const areaDecimals = unit === 'mm' ? 0 : 3;

    if (!this.multiPointState.isClosed) {
      if (el3DLabel) el3DLabel.textContent = I18N.t('measureMulti3DAreaClosed') || '3D Area (est.) (when closed)';
      if (el3DVal) el3DVal.textContent = '-.--- ' + areaUnit;
      if (elProjLabel) elProjLabel.textContent = I18N.t('measureMultiProjAreaClosed') || 'Proj Area (when closed)';
      if (elProjVal) elProjVal.textContent = '-.--- ' + areaUnit;
      if (btnSelfIntersect) btnSelfIntersect.style.display = 'none';

      this.multiPointSelfIntersectingSegs = [];
      this.multiPointSelfIntersectPoints = [];
      this.removeMultiPointAreaMesh();

      // Reset lines to amber
      if (this.multiPointState.lines) {
        this.multiPointState.lines.forEach(line => {
          if (line && line.material) line.material.color.setHex(0xf59e0b);
        });
      }
    } else {
      if (el3DLabel) el3DLabel.textContent = I18N.t('measureMulti3DArea') || '3D Area (est.)';
      if (elProjLabel) elProjLabel.textContent = I18N.t('measureMultiProjArea') || 'Proj Area';

      const areaData = this.computeMultiPointClosedArea();
      this.multiPointAreaDataCache = areaData;
      this.multiPointSelfIntersectingSegs = areaData.intersectingSegs || [];
      this.multiPointSelfIntersectPoints = areaData.intersectionPoints3D || [];

      if (el3DVal) el3DVal.textContent = (areaData.area3D * areaScale).toFixed(areaDecimals) + ' ' + areaUnit;
      if (elProjVal) elProjVal.textContent = (areaData.areaProj * areaScale).toFixed(areaDecimals) + ' ' + areaUnit;

      // Update active highlight on side panel row
      const row3D = document.getElementById('measure-multi-3d-area-row');
      const rowProj = document.getElementById('measure-multi-proj-area-row');
      if (row3D) row3D.classList.toggle('measure-area-row-active', (this.multiPointAreaMode || '3d') === '3d');
      if (rowProj) rowProj.classList.toggle('measure-area-row-active', (this.multiPointAreaMode || '3d') === 'horizontal');

      if (btnSelfIntersect) {
        btnSelfIntersect.style.display = areaData.isSelfIntersecting ? 'inline-flex' : 'none';
        btnSelfIntersect.title = I18N.t('measureSelfIntersectTitle') || 'Self-intersecting';
      }

      // Highlight self-intersecting segments in Scarlet Red (0xff3b30), others in Amber (0xf59e0b)
      if (this.multiPointState.lines) {
        this.multiPointState.lines.forEach((line, idx) => {
          if (!line || !line.material) return;
          if (areaData.intersectingSegs.includes(idx)) {
            line.material.color.setHex(0xff3b30);
          } else {
            line.material.color.setHex(0xf59e0b);
          }
        });
      }

      // Update 3D translucent surface fill mesh & drop lines
      this.updateMultiPointAreaMesh(areaData);
      this.updateMultiPointAreaCalloutDOM(areaData);
    }

    listEl.innerHTML = '';
    this.multiPointState.segments.forEach((seg, idx) => {
      const segFormatted = (seg.length * scale).toFixed(decimals) + ' ' + unit;
      const row = document.createElement('div');
      row.className = 'measure-multi-segment-row';
      if (this.multiPointState.hoveredSegmentIndex === idx) {
        row.classList.add('active');
      }
      row.setAttribute('data-seg-idx', idx);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'measure-multi-seg-label';
      labelSpan.textContent = `Pt #${seg.from + 1} ~ Pt #${seg.to + 1}`;

      const rightBox = document.createElement('div');
      rightBox.style.display = 'inline-flex';
      rightBox.style.alignItems = 'center';
      rightBox.style.gap = '6px';

      const valSpan = document.createElement('span');
      valSpan.className = 'measure-multi-seg-val';
      valSpan.textContent = segFormatted;

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'measure-val-copy-btn';
      copyBtn.title = 'Copy segment distance';
      copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(segFormatted).catch(() => {});
        }
        showToast(`${I18N.t('measureCopied') || 'Copied'}: ${segFormatted}`, 'info');
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1000);
      });

      rightBox.appendChild(valSpan);
      rightBox.appendChild(copyBtn);
      row.appendChild(labelSpan);
      row.appendChild(rightBox);

      row.addEventListener('mouseenter', () => {
        this.setMultiPointHoveredSegment(idx);
      });
      row.addEventListener('mouseleave', () => {
        this.setMultiPointHoveredSegment(-1);
      });

      listEl.appendChild(row);
    });
  }

  setMultiPointHoveredSegment(segIdx) {
    if (!this.multiPointState) return;

    if (this.multiPointState.hoveredSegmentIndex === segIdx) {
      if (segIdx >= 0 && this.multiPointState.segments[segIdx]) {
        const seg = this.multiPointState.segments[segIdx];
        const p0 = this.multiPointState.points[seg.from];
        const p1 = this.multiPointState.points[seg.to];
        if (p0 && p1) {
          this.ensureMultiPointHoverCalloutDOM();
          this.updateMultiPointHoverCalloutPosition(p0, p1);
        }
      }
      return;
    }

    const prevIdx = this.multiPointState.hoveredSegmentIndex;
    this.multiPointState.hoveredSegmentIndex = segIdx;

    if (prevIdx >= 0 && this.multiPointState.lines[prevIdx]) {
      const isSelf = this.multiPointSelfIntersectingSegs && this.multiPointSelfIntersectingSegs.includes(prevIdx);
      this.multiPointState.lines[prevIdx].material.color.setHex(isSelf ? 0xff3b30 : 0xf59e0b);
    }
    if (segIdx >= 0 && this.multiPointState.lines[segIdx]) {
      this.multiPointState.lines[segIdx].material.color.setHex(0x38bdf8);
    }

    const listEl = document.getElementById('measure-multi-segments-list');
    if (listEl) {
      listEl.querySelectorAll('.measure-multi-segment-row').forEach((r, idx) => {
        r.classList.toggle('active', idx === segIdx);
      });
    }

    if (segIdx >= 0 && this.multiPointState.segments[segIdx]) {
      const seg = this.multiPointState.segments[segIdx];
      const p0 = this.multiPointState.points[seg.from];
      const p1 = this.multiPointState.points[seg.to];
      if (p0 && p1) {
        this.ensureMultiPointHoverCalloutDOM();
        const unit = this.measureUnit || 'm';
        const scale = unit === 'mm' ? 1000 : 1;
        const decimals = unit === 'mm' ? 0 : 3;
        const segFormatted = (seg.length * scale).toFixed(decimals) + ' ' + unit;
        if (this.multiPointHoverCalloutEl) {
          this.multiPointHoverCalloutEl.textContent = segFormatted;
          this.multiPointHoverCalloutEl.style.display = 'block';
        }
        this.updateMultiPointHoverCalloutPosition(p0, p1);
      }
    } else {
      if (this.multiPointHoverCalloutEl) {
        this.multiPointHoverCalloutEl.style.display = 'none';
      }
    }

    this.requestRender(100);
  }

  updateMultiPointHoverCalloutPosition(p0, p1) {
    if (!this.multiPointHoverCalloutEl || !this.camera || !this.container) return;
    this.ensureMultiPointHoverCalloutDOM();
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;

    const proj0 = p0.clone().project(this.camera);
    const proj1 = p1.clone().project(this.camera);
    const p0Behind = (proj0.z > 1.0 || proj0.z < -1.0);
    const p1Behind = (proj1.z > 1.0 || proj1.z < -1.0);
    if (p0Behind && p1Behind) {
      this.multiPointHoverCalloutEl.style.display = 'none';
      return;
    }

    const s0x = (proj0.x * 0.5 + 0.5) * cw;
    const s0y = (-proj0.y * 0.5 + 0.5) * ch;
    const s1x = (proj1.x * 0.5 + 0.5) * cw;
    const s1y = (-proj1.y * 0.5 + 0.5) * ch;

    let bx, by;
    const safeMargin = 16;
    const clipRes = this.clipSegmentToScreen ? this.clipSegmentToScreen(s0x, s0y, s1x, s1y, safeMargin, cw - safeMargin, safeMargin, ch - safeMargin) : null;
    if (clipRes) {
      const t = Math.max(clipRes.t0, Math.min(clipRes.t1, 0.5));
      bx = s0x + t * (s1x - s0x);
      by = s0y + t * (s1y - s0y);
    } else {
      bx = (s0x + s1x) * 0.5;
      by = (s0y + s1y) * 0.5;
    }

    this.multiPointHoverCalloutEl.style.display = 'block';
    this.multiPointHoverCalloutEl.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by - 16)}px, 0) translate(-50%, -100%)`;
  }

  checkMultiPointSegmentHover(clientX, clientY) {
    if (!this.multiPointState || !this.multiPointState.segments || this.multiPointState.segments.length === 0) return;
    if (!this.camera || !this.container) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX;
    const my = clientY;
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;

    let bestDistSq = Infinity;
    let bestIdx = -1;

    const proj0 = new THREE.Vector3();
    const proj1 = new THREE.Vector3();

    for (let i = 0; i < this.multiPointState.segments.length; i++) {
      const seg = this.multiPointState.segments[i];
      const p0 = this.multiPointState.points[seg.from];
      const p1 = this.multiPointState.points[seg.to];
      if (!p0 || !p1) continue;

      proj0.copy(p0).project(this.camera);
      proj1.copy(p1).project(this.camera);

      if ((proj0.z > 1.0 || proj0.z < -1.0) && (proj1.z > 1.0 || proj1.z < -1.0)) continue;

      const s0x = rect.left + (proj0.x * 0.5 + 0.5) * cw;
      const s0y = rect.top + (-proj0.y * 0.5 + 0.5) * ch;
      const s1x = rect.left + (proj1.x * 0.5 + 0.5) * cw;
      const s1y = rect.top + (-proj1.y * 0.5 + 0.5) * ch;

      const dx = s1x - s0x;
      const dy = s1y - s0y;
      const lenSq = dx * dx + dy * dy;
      let dSq;
      if (lenSq === 0) {
        dSq = (mx - s0x) ** 2 + (my - s0y) ** 2;
      } else {
        let t = ((mx - s0x) * dx + (my - s0y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = s0x + t * dx;
        const projY = s0y + t * dy;
        dSq = (mx - projX) ** 2 + (my - projY) ** 2;
      }

      if (dSq < 144 && dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    this.setMultiPointHoveredSegment(bestIdx);
  }

  handleMeasureClick(hitOrPoint, event = null) {
    const isHitObj = hitOrPoint && hitOrPoint.point;
    let point = isHitObj ? hitOrPoint.point : hitOrPoint;
    let effectiveHit = hitOrPoint;

    if (this.snapEngine && this.snapEngine.currentSnap && isHitObj) {
      const snap = this.snapEngine.currentSnap;
      point = snap.point;
      effectiveHit = {
        ...hitOrPoint,
        point: snap.point,
        face: { ...(hitOrPoint.face || {}), normal: snap.normal }
      };
    }

    if (this.measureMode === 'multipoint') {
      if (!isHitObj) return;
      const isShift = Boolean(event && event.shiftKey);
      if (isShift) return;

      const pt = effectiveHit.point.clone();

      // CASE A: Inserting point into middle of a segment
      if (this.multiPointInsertSegIdx >= 0) {
        const segIdx = this.multiPointInsertSegIdx;
        this.multiPointInsertSegIdx = -1;
        this.hideMultiPointInsertPreview();

        const seg = this.multiPointState.segments[segIdx];
        const pFrom = this.multiPointState.points[seg.from];
        const pTo = this.multiPointState.points[seg.to];
        const insertIdx = seg.to; // index where new point will be spliced in

        this.multiPointState.points.splice(insertIdx, 0, pt);
        const marker = this.createMultiPointMarker(effectiveHit, insertIdx + 1);
        this.multiPointState.markers.splice(insertIdx, 0, marker);

        // Update existing line segIdx: [pFrom -> pt]
        const lineOld = this.multiPointState.lines[segIdx];
        if (lineOld) {
          lineOld.geometry.dispose();
          lineOld.geometry = new THREE.BufferGeometry().setFromPoints([pFrom, pt]);
        }

        // Create new line for [pt -> pTo]
        const lineNew = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([pt, pTo]),
          new THREE.LineBasicMaterial({
            color: 0xf59e0b,
            linewidth: 3,
            depthTest: false,
            depthWrite: false
          })
        );
        lineNew.renderOrder = 1205;
        lineNew.userData = { isMeasureLine: true, isMultiPointLine: true, segmentIndex: insertIdx };
        this.scene.add(lineNew);
        this.multiPointState.lines.splice(insertIdx, 0, lineNew);

        // Update segment lengths
        seg.length = pFrom.distanceTo(pt);
        this.multiPointState.segments.splice(insertIdx, 0, {
          from: insertIdx,
          to: insertIdx + 1,
          length: pt.distanceTo(pTo)
        });

        // Re-index all segments
        this.multiPointState.segments.forEach((s, idx) => {
          s.from = idx;
          s.to = idx + 1;
          if (this.multiPointState.lines[idx]) {
            this.multiPointState.lines[idx].userData.segmentIndex = idx;
          }
        });

        // Renumber all markers & badges
        this.multiPointState.markers.forEach((m, idx) => {
          m.multiPointIndex = idx;
          if (m.calloutEl) {
            m.calloutEl.textContent = `Pt #${idx + 1}`;
            m.calloutEl.title = `Pt #${idx + 1}: click to inspect, drag to adjust position`;
          }
        });

        let total = 0;
        this.multiPointState.segments.forEach(s => total += s.length);
        this.multiPointState.totalLength = total;

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = I18N.t('measureMultiHint') || 'Multi-point measurement updated';

        this.renderMultiPointResults();
        this.updateMeasureMarkersAndCallouts();
        this.requestRender(200);
        return;
      }

      // CASE B: Prepending points before Pt #1
      if (this.multiPointState.isDrawing && this.multiPointDrawDir === 'prepend') {
        const firstPt = this.multiPointState.points[0];
        const points = this.multiPointState.points;
        if (points.length >= 2) {
          const lastPt = points[points.length - 1];
          if (pt.distanceTo(lastPt) < 0.45 || this.isSnappedToClosurePoint || (effectiveHit && effectiveHit.isClosureSnap)) {
            this.showMultiPointClosurePopover(lastPt, () => {
              this.closeMultiPointMeasurement();
            }, () => {});
            if (this.snapEngine) this.snapEngine.hideIndicator();
            return;
          }
        }
        if (pt.distanceTo(firstPt) < 1e-3) {
          this.finishMultiPointMeasurement();
          return;
        }

        this.multiPointState.points.unshift(pt);
        const marker = this.createMultiPointMarker(effectiveHit, 1);
        this.multiPointState.markers.unshift(marker);

        const geom = new THREE.BufferGeometry().setFromPoints([pt, firstPt]);
        const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 3,
          depthTest: false,
          depthWrite: false
        }));
        line.renderOrder = 1205;
        line.userData = { isMeasureLine: true, isMultiPointLine: true, segmentIndex: 0 };
        this.scene.add(line);
        this.multiPointState.lines.unshift(line);

        const segLen = pt.distanceTo(firstPt);
        this.multiPointState.segments.unshift({
          from: 0,
          to: 1,
          length: segLen
        });

        // Re-index all segments
        this.multiPointState.segments.forEach((s, idx) => {
          s.from = idx;
          s.to = idx + 1;
          if (this.multiPointState.lines[idx]) {
            this.multiPointState.lines[idx].userData.segmentIndex = idx;
          }
        });

        // Renumber all markers & badges
        this.multiPointState.markers.forEach((m, idx) => {
          m.multiPointIndex = idx;
          if (m.calloutEl) {
            m.calloutEl.textContent = `Pt #${idx + 1}`;
            m.calloutEl.title = `Pt #${idx + 1}: click to inspect, drag to adjust position`;
          }
        });

        let total = 0;
        this.multiPointState.segments.forEach(s => total += s.length);
        this.multiPointState.totalLength = total;

        this.renderMultiPointResults();
        this.updateMeasureMarkersAndCallouts();
        this.requestRender(200);
        return;
      }

      if (!this.multiPointState.isDrawing) {
        if (this.multiPointState.points.length > 0) {
          this.clearMultiPointMeasurement();
        }

        this.multiPointState.isDrawing = true;
        this.multiPointState.points = [pt];
        const marker = this.createMultiPointMarker(effectiveHit, 1);
        this.multiPointState.markers = [marker];
        this.multiPointState.lines = [];
        this.multiPointState.segments = [];
        this.multiPointState.totalLength = 0;

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = I18N.t('measureMultiPromptPickNext') || "Click surface to add next point | Double-click or click 'Done' to finish";

        const btnDone = document.getElementById('btn-measure-multi-done');
        if (btnDone) btnDone.style.display = 'none';

        this.renderMultiPointResults();
        this.initMultiPointPreview();
        this.requestRender(200);
        return;
      }

      const points = this.multiPointState.points;
      const lastPt = points[points.length - 1];

      // Check if clicking on first point Pt #1 to close polyline (allowed from 3rd point onwards)
      if (points.length >= 2) {
        const firstPt = points[0];
        if (pt.distanceTo(firstPt) < 0.45 || this.isSnappedToClosurePoint || (effectiveHit && effectiveHit.isClosureSnap)) {
          this.showMultiPointClosurePopover(firstPt, () => {
            this.closeMultiPointMeasurement();
          }, () => {});
          if (this.snapEngine) this.snapEngine.hideIndicator();
          return;
        }
      }

      if (pt.distanceTo(lastPt) < 1e-3) {
        this.finishMultiPointMeasurement();
        return;
      }

      points.push(pt);
      const newIdx = points.length;
      const marker = this.createMultiPointMarker(effectiveHit, newIdx);
      this.multiPointState.markers.push(marker);

      const geom = new THREE.BufferGeometry().setFromPoints([lastPt, pt]);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        linewidth: 3,
        depthTest: false,
        depthWrite: false
      }));
      line.renderOrder = 1205;
      line.userData = { isMeasureLine: true, isMultiPointLine: true, segmentIndex: points.length - 2 };
      this.scene.add(line);
      this.multiPointState.lines.push(line);

      const segLen = lastPt.distanceTo(pt);
      this.multiPointState.segments.push({
        from: points.length - 2,
        to: points.length - 1,
        length: segLen
      });
      this.multiPointState.totalLength += segLen;

      const btnDone = document.getElementById('btn-measure-multi-done');
      if (btnDone) btnDone.style.display = 'inline-block';

      this.renderMultiPointResults();
      this.updateMeasureMarkersAndCallouts();
      this.requestRender(200);
      return;
    }

    if (this.measureMode === 'radius') {
      const radTarget = this.currentRadiusTarget || (isHitObj ? this.detectRadiusTarget(effectiveHit, event ? event.clientX : 0, event ? event.clientY : 0) : null);
      if (radTarget) {
        this.createOrUpdateRadiusMeasurement(radTarget, event);
      } else {
        showToast(I18N.t('measureRadiusHint'), 'info');
      }
      return;
    }

    if (this.measureMode === 'point') {
      if (!isHitObj) return;
      const isCtrl = Boolean(event && (event.ctrlKey || event.metaKey));
      const isShift = Boolean(event && event.shiftKey);

      if (isShift) {
        // Shift+Click on empty surface does not create or move points
        return;
      }

      const activeMarker = this.getActiveMeasurePoint();
      if (isCtrl || !activeMarker) {
        // Ctrl+Click (or first click when no point exists): create a new point measurement marker
        this.createMeasurePoint(effectiveHit, { mode: 'point' });
      } else {
        // Normal Left-Click: move active measurement point and callout to the new position
        this.updateMeasurePointFromHit(activeMarker, effectiveHit);
      }
      return;
    }

    if (this.measureMode === 'distance') {
      if (!isHitObj) return;
      const isCtrl = Boolean(event && (event.ctrlKey || event.metaKey));
      const isShift = Boolean(event && event.shiftKey);

      if (isShift) return;

      if (!this.pendingDistanceStart) {
        // Step 1: Picking first point (p1)
        if (!isCtrl && this.distanceMeasurements && this.distanceMeasurements.length > 0) {
          const ids = this.distanceMeasurements.map(d => d.id);
          ids.forEach(id => this.deleteDistanceMeasurement(id));
        }

        const marker1 = this.createDistanceEndpointMarker(effectiveHit, 'p1');
        this.pendingDistanceStart = {
          hit: effectiveHit,
          point: effectiveHit.point.clone(),
          marker1
        };

        const unit = this.measureUnit || 'm';
        const scale = unit === 'mm' ? 1000 : 1;
        const p1 = effectiveHit.point;
        const p1El = document.getElementById('measure-res-p1');
        if (p1El) p1El.textContent = `(${(p1.x * scale).toFixed(2)}, ${(-p1.z * scale).toFixed(2)}, ${(p1.y * scale).toFixed(2)})`;
        const p2El = document.getElementById('measure-res-p2');
        if (p2El) p2El.textContent = '--';
        const distEl = document.getElementById('measure-res-distance');
        if (distEl) distEl.textContent = '--';
        const dxEl = document.getElementById('measure-res-dx');
        if (dxEl) dxEl.textContent = '--';
        const dyEl = document.getElementById('measure-res-dy');
        if (dyEl) dyEl.textContent = '--';
        const dzEl = document.getElementById('measure-res-dz');
        if (dzEl) dzEl.textContent = '--';

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = I18N.t('measurePromptPickSecond');
        showToast(I18N.t('measureEnd'), 'warning');
        this.requestRender(200);
        return;
      } else {
        // Step 2: Picking second point (p2) to finalize measurement
        const start = this.pendingDistanceStart;
        const marker1 = start.marker1;
        const p1 = marker1.point;
        const p2 = effectiveHit.point.clone();

        const distId = `dist-meas-${++this.distanceMeasurementCounter}`;
        marker1.distanceMeasurementId = distId;

        const marker2 = this.createDistanceEndpointMarker(effectiveHit, 'p2', distId);

        // Create 3D Solid line connecting marker1 and marker2
        const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 3,
          depthTest: false,
          depthWrite: false
        }));
        line.renderOrder = 1205;
        line.userData = { isMeasureLine: true, distanceMeasurementId: distId };
        this.scene.add(line);
        this.measureLine = line;

        // Create 3D XYZ Decomposition Lines (Red: ΔX, Green: ΔY, Blue: ΔZ)
        const decompGroup = this.createXYZDecompGroup(p1, p2);
        this.scene.add(decompGroup);

        // Create 2D Callout badge
        const listEl = document.getElementById('measure-callouts-layer') || this.container;
        const calloutEl = document.createElement('div');
        calloutEl.className = 'measure-distance-callout';

        const dist = p1.distanceTo(p2);
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs((-p2.z) - (-p1.z));
        const dz = Math.abs(p2.y - p1.y);

        const distRec = {
          id: distId,
          index: this.distanceMeasurements.length + 1,
          marker1,
          marker2,
          line,
          decompGroup,
          calloutEl,
          data: { p1: p1.clone(), p2: p2.clone(), dist, dx, dy, dz }
        };

        calloutEl.onclick = (e) => {
          e.stopPropagation();
          if (e.shiftKey) {
            this.deleteDistanceMeasurement(distRec.id);
            return;
          }
          this.activeDistanceMeasurementId = distRec.id;
          this.lastMeasurementData = distRec.data;
          this.renderMeasurementResults();
          const unit = this.measureUnit || 'm';
          const scale = unit === 'mm' ? 1000 : 1;
          const dVal = (distRec.data.dist * scale).toFixed(unit === 'mm' ? 0 : 3);
          navigator.clipboard.writeText(`${dVal} ${unit}`).then(() => {
            showToast(`${I18N.t('measureCopied') || 'Copied'}: ${dVal} ${unit}`, 'info');
          }).catch(() => {});
        };

        if (listEl) listEl.appendChild(calloutEl);

        this.distanceMeasurements.push(distRec);
        this.activeDistanceMeasurementId = distId;
        this.lastMeasurementData = distRec.data;

        this.pendingDistanceStart = null;
        this.hideDistancePreview();

        this.updateDistanceCalloutDOM(distRec);
        this.renderMeasurementResults();
        this.updateMeasureMarkersAndCallouts();

        const unit = this.measureUnit || 'm';
        const scale = unit === 'mm' ? 1000 : 1;
        const formattedDist = (dist * scale).toFixed(unit === 'mm' ? 0 : 3);
        showToast(`${I18N.t('measureDist')}: ${formattedDist} ${unit}`, 'success');

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = `${I18N.t('measureDist')}: ${formattedDist} ${unit}. ${I18N.t('measurePromptPickFirst')}`;
        this.requestRender(250);
        return;
      }
    }

    if (this.measureMode === 'angle') {
      const isCtrl = Boolean(event && (event.ctrlKey || event.metaKey));
      const isShift = Boolean(event && event.shiftKey);
      if (isShift) return;

      if (!this.pendingAngleState) {
        // Step 1: Placing Angle Vertex (V)
        if (!isCtrl && this.angleMeasurements && this.angleMeasurements.length > 0) {
          const ids = this.angleMeasurements.map(a => a.id);
          ids.forEach(id => this.deleteAngleMeasurement(id));
        }

        const markerV = this.createAngleEndpointMarker(effectiveHit, 'vertex');
        this.pendingAngleState = {
          step: 1,
          V: effectiveHit.point.clone(),
          markerV
        };

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = I18N.t('measurePromptPickAngleArm1');
        showToast(I18N.t('measurePromptPickAngleArm1'), 'info');
        this.requestRender(200);
        return;
      } else if (this.pendingAngleState.step === 1) {
        // Step 2: Placing Arm 1 Endpoint (A)
        const V = this.pendingAngleState.V;
        const A = effectiveHit.point.clone();
        if (V.distanceTo(A) < 1e-3) {
          showToast('Point too close to vertex', 'warning');
          return;
        }

        const markerA = this.createAngleEndpointMarker(effectiveHit, 'arm1');

        const geom1 = new THREE.BufferGeometry().setFromPoints([V, A]);
        const line1 = new THREE.Line(geom1, new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 3,
          depthTest: false,
          depthWrite: false
        }));
        line1.renderOrder = 1205;
        this.scene.add(line1);

        this.pendingAngleState.step = 2;
        this.pendingAngleState.A = A;
        this.pendingAngleState.markerA = markerA;
        this.pendingAngleState.line1 = line1;

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = I18N.t('measurePromptPickAngleArm2');
        showToast(I18N.t('measurePromptPickAngleArm2'), 'info');
        this.requestRender(200);
        return;
      } else if (this.pendingAngleState.step === 2) {
        // Step 3: Placing Arm 2 Endpoint (B) - Finalize
        const V = this.pendingAngleState.V;
        const A = this.pendingAngleState.A;
        const B = effectiveHit.point.clone();
        if (V.distanceTo(B) < 1e-3) {
          showToast('Point too close to vertex', 'warning');
          return;
        }

        const angleId = `angle-meas-${++this.angleMeasurementCounter}`;
        const markerV = this.pendingAngleState.markerV;
        const markerA = this.pendingAngleState.markerA;
        const markerB = this.createAngleEndpointMarker(effectiveHit, 'arm2', angleId);
        markerV.angleMeasurementId = angleId;
        markerA.angleMeasurementId = angleId;

        const line1 = this.pendingAngleState.line1;
        line1.userData = { isMeasureLine: true, angleMeasurementId: angleId };

        const geom2 = new THREE.BufferGeometry().setFromPoints([V, B]);
        const line2 = new THREE.Line(geom2, new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 3,
          depthTest: false,
          depthWrite: false
        }));
        line2.renderOrder = 1205;
        line2.userData = { isMeasureLine: true, angleMeasurementId: angleId };
        this.scene.add(line2);

        const data = this.computeAngleMeasurementData(V, A, B);

        const projGroup = this.createAngleProjectionGroup(V, A, B, data.Aproj, data.Bproj);
        this.scene.add(projGroup);

        const arcObj = this.createAngleArcMesh(V, A, B, this.activeAngleMode === 'horizontal', data);
        this.scene.add(arcObj.line);

        const listEl = document.getElementById('measure-callouts-layer') || this.container;
        const calloutEl = document.createElement('div');
        calloutEl.className = 'measure-angle-callout';

        const angleRec = {
          id: angleId,
          index: this.angleMeasurements.length + 1,
          markerV,
          markerA,
          markerB,
          line1,
          line2,
          projGroup,
          arcLine: arcObj.line,
          calloutEl,
          data,
          mode: this.activeAngleMode || 'horizontal'
        };

        calloutEl.onclick = (e) => {
          e.stopPropagation();
          if (e.target && e.target.classList.contains('measure-angle-mode-toggle')) {
            this.toggleAngleMeasurementMode(angleRec.id);
            return;
          }
          if (e.shiftKey) {
            this.deleteAngleMeasurement(angleRec.id);
            return;
          }
          this.activeAngleMeasurementId = angleRec.id;
          this.lastMeasurementData = angleRec.data;
          this.renderMeasurementResults();
          const val = (angleRec.mode === 'horizontal' ? angleRec.data.angleHoriz : angleRec.data.angle3D).toFixed(1);
          navigator.clipboard.writeText(`${val}°`).then(() => {
            showToast(`${I18N.t('measureCopied') || 'Copied'}: ${val}°`, 'info');
          }).catch(() => {});
        };

        if (listEl) listEl.appendChild(calloutEl);

        this.angleMeasurements.push(angleRec);
        this.activeAngleMeasurementId = angleId;
        this.lastMeasurementData = angleRec.data;

        this.hideAnglePreview();
        this.pendingAngleState = null;

        this.updateAngleCalloutDOM(angleRec);
        this.renderMeasurementResults();
        this.updateMeasureMarkersAndCallouts();

        const displayVal = (this.activeAngleMode === 'horizontal' ? data.angleHoriz : data.angle3D).toFixed(1);
        showToast(`${I18N.t('measureAngle')}: ${displayVal}°`, 'success');

        const hintEl = document.getElementById('measure-mode-hint');
        if (hintEl) hintEl.textContent = `${I18N.t('measureAngle')}: ${displayVal}°. ${I18N.t('measurePromptPickAngleVertex')}`;
        this.requestRender(250);
        return;
      }
    }


    if (this.measureMode !== 'point' && this.measureMode !== 'radius' && this.measureMode !== 'distance' && this.measureMode !== 'angle') {
      showToast(I18N.t('measurePendingNotice'), 'info');
      return;
    }
  }

  renderMeasurementResults() {
    const ptView = document.getElementById('measure-result-point-view');
    const distView = document.getElementById('measure-result-dist-view');
    const radView = document.getElementById('measure-result-radius-view');
    const angleView = document.getElementById('measure-result-angle-view');
    const multiView = document.getElementById('measure-result-multi-view');
    if (ptView && distView) {
      const showPt = this.measureMode === 'point';
      const showRad = this.measureMode === 'radius';
      const showAngle = this.measureMode === 'angle';
      const showMulti = this.measureMode === 'multipoint';
      ptView.style.display = showPt ? 'block' : 'none';
      distView.style.display = (this.measureMode === 'distance') ? 'block' : 'none';
      if (radView) radView.style.display = showRad ? 'block' : 'none';
      if (angleView) angleView.style.display = showAngle ? 'block' : 'none';
      if (multiView) multiView.style.display = showMulti ? 'block' : 'none';
    }

    this.renderMultiPointResults();

    // 1. Update Point Measurement Panel Card
    const activePt = this.getActiveMeasurePoint();
    const elevEl = document.getElementById('measure-res-pt-elev');
    const ptXEl = document.getElementById('measure-res-pt-x');
    const ptYEl = document.getElementById('measure-res-pt-y');
    const ptZEl = document.getElementById('measure-res-pt-z');
    const ptSlopeEl = document.getElementById('measure-res-pt-slope');

    if (activePt) {
      const c = this.formatMeasurePointCoords(activePt.point, activePt.pointCloud);
      const slopeExp = this.formatSlopeExpressions(activePt.slopeData);
      if (elevEl) elevEl.textContent = c.zStr;
      if (ptXEl) ptXEl.textContent = c.xStr;
      if (ptYEl) ptYEl.textContent = c.yStr;
      if (ptZEl) ptZEl.textContent = c.zStr;
      if (ptSlopeEl) ptSlopeEl.textContent = slopeExp.full;
      const ptREl = document.getElementById('measure-res-pt-slope-ratio');
      if (ptREl) ptREl.textContent = slopeExp.ratio;
      const ptPEl = document.getElementById('measure-res-pt-slope-pct');
      if (ptPEl) ptPEl.textContent = slopeExp.pct;
      const ptDEl = document.getElementById('measure-res-pt-slope-deg');
      if (ptDEl) ptDEl.textContent = slopeExp.deg;
    } else {
      if (elevEl) elevEl.textContent = '--';
      if (ptXEl) ptXEl.textContent = '--';
      if (ptYEl) ptYEl.textContent = '--';
      if (ptZEl) ptZEl.textContent = '--';
      if (ptSlopeEl) ptSlopeEl.textContent = '--';
      const ptREl = document.getElementById('measure-res-pt-slope-ratio');
      if (ptREl) ptREl.textContent = '--';
      const ptPEl = document.getElementById('measure-res-pt-slope-pct');
      if (ptPEl) ptPEl.textContent = '--';
      const ptDEl = document.getElementById('measure-res-pt-slope-deg');
      if (ptDEl) ptDEl.textContent = '--';
    }

    // Refresh all point callouts when unit changes
    if (this.measureMarkers && this.measureMarkers.length > 0) {
      this.measureMarkers.forEach(m => {
        if (m.mode === 'point') this.createOrUpdateMeasureCalloutDOM(m);
      });
      this.updateMeasureMarkersAndCallouts();
    }

    // Refresh all radius callouts when unit changes

    if (this.radiusMeasurements && this.radiusMeasurements.length > 0) {
      const unit = this.measureUnit || 'm';
      const scale = unit === 'mm' ? 1000 : 1;
      this.radiusMeasurements.forEach(rad => {
        if (rad.calloutEl) {
          const rFormatted = (rad.target.radius * scale).toFixed(unit === 'mm' ? 0 : 3);
          const dFormatted = (rad.target.radius * 2 * scale).toFixed(unit === 'mm' ? 0 : 3);
          const geomLabel = rad.target.geomType === 'circle' ? I18N.t('measureGeomCircle') : (rad.target.geomType === 'arc' ? I18N.t('measureGeomArc') : I18N.t('measureGeomSphere'));
          rad.calloutEl.textContent = `R ${rFormatted} ${unit}`;
          rad.calloutEl.title = `Radius (R): ${rFormatted} ${unit}\nDiameter (Ø): ${dFormatted} ${unit} | ${geomLabel}\nClick to copy, Shift+Click to delete`;
        }
      });
      this.updateMeasureMarkersAndCallouts();
    }

    // Refresh all angle callouts & panel when unit changes
    if (this.angleMeasurements && this.angleMeasurements.length > 0) {
      this.angleMeasurements.forEach(a => this.updateAngleCalloutDOM(a));
      this.updateMeasureMarkersAndCallouts();
    }

    // 4. Update Angle Measurement Panel Card
    const activeAngle = (this.angleMeasurements && this.angleMeasurements.length > 0)
      ? (this.angleMeasurements.find(a => a.id === this.activeAngleMeasurementId) || this.angleMeasurements[this.angleMeasurements.length - 1])
      : null;

    if (activeAngle && activeAngle.data) {
      this.renderAngleMeasurementResults(activeAngle.data, activeAngle.mode || this.activeAngleMode);
    } else if (this.lastMeasurementData && this.lastMeasurementData.angleHoriz !== undefined) {
      this.renderAngleMeasurementResults(this.lastMeasurementData, this.activeAngleMode);
    } else {
      const primEl = document.getElementById('measure-res-angle-primary');
      if (primEl) primEl.textContent = '--';
      const decEl = document.getElementById('measure-res-angle-dec');
      if (decEl) decEl.textContent = '--';
      const dmsEl = document.getElementById('measure-res-angle-dms');
      if (dmsEl) dmsEl.textContent = '--';
      const l1El = document.getElementById('measure-res-angle-l1');
      if (l1El) l1El.textContent = '--';
      const l2El = document.getElementById('measure-res-angle-l2');
      if (l2El) l2El.textContent = '--';
    }

    // Refresh all distance callouts when unit changes
    if (this.distanceMeasurements && this.distanceMeasurements.length > 0) {
      this.distanceMeasurements.forEach(d => this.updateDistanceCalloutDOM(d));
      this.updateMeasureMarkersAndCallouts();
    }

    // 2. Update Distance Measurement Panel Card
    const resDistEl = document.getElementById('measure-res-distance');
    const dxEl = document.getElementById('measure-res-dx');
    const dyEl = document.getElementById('measure-res-dy');
    const dzEl = document.getElementById('measure-res-dz');
    const p1El = document.getElementById('measure-res-p1');
    const p2El = document.getElementById('measure-res-p2');

    const activeDist = (this.distanceMeasurements && this.distanceMeasurements.length > 0)
      ? (this.distanceMeasurements.find(d => d.id === this.activeDistanceMeasurementId) || this.distanceMeasurements[this.distanceMeasurements.length - 1])
      : null;

    if (activeDist && activeDist.data) {
      const { p1, p2, dist, dx, dy, dz } = activeDist.data;
      const unit = this.measureUnit || 'm';
      const scale = unit === 'mm' ? 1000 : 1;
      const unitStr = unit;

      if (resDistEl) resDistEl.textContent = `${(dist * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unitStr}`;
      if (dxEl) dxEl.textContent = `${(dx * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unitStr}`;
      if (dyEl) dyEl.textContent = `${(dy * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unitStr}`;
      if (dzEl) dzEl.textContent = `${(dz * scale).toFixed(unit === 'mm' ? 0 : 3)} ${unitStr}`;
      const slopeData = this.computeDistanceSlope(p1, p2);
      const slopeExp = this.formatSlopeExpressions(slopeData);
      const rEl = document.getElementById('measure-res-slope-ratio');
      if (rEl) rEl.textContent = slopeExp.ratio;
      const pEl = document.getElementById('measure-res-slope-pct');
      if (pEl) pEl.textContent = slopeExp.pct;
      const dEl = document.getElementById('measure-res-slope-deg');
      if (dEl) dEl.textContent = slopeExp.deg;
      const slopeEl = document.getElementById('measure-res-slope');
      if (slopeEl) slopeEl.textContent = slopeExp.full;
      if (p1El) p1El.textContent = `(${(p1.x * scale).toFixed(2)}, ${(-p1.z * scale).toFixed(2)}, ${(p1.y * scale).toFixed(2)})`;
      if (p2El) p2El.textContent = `(${(p2.x * scale).toFixed(2)}, ${(-p2.z * scale).toFixed(2)}, ${(p2.y * scale).toFixed(2)})`;
    } else if (this.pendingDistanceStart) {
      const p1 = this.pendingDistanceStart.point;
      const unit = this.measureUnit || 'm';
      const scale = unit === 'mm' ? 1000 : 1;
      if (p1El) p1El.textContent = `(${(p1.x * scale).toFixed(2)}, ${(-p1.z * scale).toFixed(2)}, ${(p1.y * scale).toFixed(2)})`;
      if (p2El) p2El.textContent = '--';
      if (resDistEl) resDistEl.textContent = '--';
      if (dxEl) dxEl.textContent = '--';
      if (dyEl) dyEl.textContent = '--';
      if (dzEl) dzEl.textContent = '--';
    } else {
      if (resDistEl) resDistEl.textContent = '--';
      if (dxEl) dxEl.textContent = '--';
      if (dyEl) dyEl.textContent = '--';
      if (dzEl) dzEl.textContent = '--';
      const rEl = document.getElementById('measure-res-slope-ratio');
      if (rEl) rEl.textContent = '--';
      const pEl = document.getElementById('measure-res-slope-pct');
      if (pEl) pEl.textContent = '--';
      const dEl = document.getElementById('measure-res-slope-deg');
      if (dEl) dEl.textContent = '--';
      const slopeEl = document.getElementById('measure-res-slope');
      if (slopeEl) slopeEl.textContent = '--';
      if (p1El) p1El.textContent = '--';
      if (p2El) p2El.textContent = '--';
    }

    // 3. Update Radius Measurement Panel Card
    const radValEl = document.getElementById('measure-res-radius');
    const diaValEl = document.getElementById('measure-res-diameter');
    const typeValEl = document.getElementById('measure-res-geom-type');
    const centerValEl = document.getElementById('measure-res-center');
    const targetValEl = document.getElementById('measure-res-target-pt');

    const activeRad = (this.radiusMeasurements && this.radiusMeasurements.length > 0)
      ? (this.radiusMeasurements.find(r => r.id === this.activeRadiusMeasurementId) || this.radiusMeasurements[this.radiusMeasurements.length - 1])
      : null;

    if (activeRad && activeRad.target) {
      const t = activeRad.target;
      const rFormatted = (t.radius * scale).toFixed(unit === 'mm' ? 0 : 3);
      const dFormatted = (t.radius * 2 * scale).toFixed(unit === 'mm' ? 0 : 3);
      const geomLabel = t.geomType === 'circle' ? I18N.t('measureGeomCircle') : (t.geomType === 'arc' ? I18N.t('measureGeomArc') : I18N.t('measureGeomSphere'));

      if (radValEl) radValEl.textContent = `${rFormatted} ${unitStr}`;
      if (diaValEl) diaValEl.textContent = `${dFormatted} ${unitStr}`;
      if (typeValEl) typeValEl.textContent = geomLabel;
      if (centerValEl) centerValEl.textContent = `(${(t.center.x * scale).toFixed(2)}, ${(-t.center.z * scale).toFixed(2)}, ${(t.center.y * scale).toFixed(2)})`;
      if (targetValEl) targetValEl.textContent = `(${(t.targetPoint.x * scale).toFixed(2)}, ${(-t.targetPoint.z * scale).toFixed(2)}, ${(t.targetPoint.y * scale).toFixed(2)})`;
    } else {
      if (radValEl) radValEl.textContent = '--';
      if (diaValEl) diaValEl.textContent = '--';
      if (typeValEl) typeValEl.textContent = '--';
      if (centerValEl) centerValEl.textContent = '--';
      if (targetValEl) targetValEl.textContent = '--';
    }
  }

  clearMeasurement() {
    this.measurePoints = [];
    this.lastMeasurementData = null;

    // 0. Clear Multi-Point Measurements
    this.clearMultiPointMeasurement();

    // 1. Clear Angle Measurements (arms, arc lines, proj groups, endpoints, callouts)
    if (this.angleMeasurements && this.angleMeasurements.length > 0) {
      const angleIds = this.angleMeasurements.map(a => a.id);
      angleIds.forEach(id => this.deleteAngleMeasurement(id));
    }
    this.angleMeasurements = [];
    this.angleMeasurementCounter = 0;
    this.activeAngleMeasurementId = null;
    this.cancelPendingAngleStart();
    this.hideAnglePreview();

    // 2. Clear Distance Measurements (lines, decomp lines, endpoints, callouts)
    if (this.distanceMeasurements && this.distanceMeasurements.length > 0) {
      const distIds = this.distanceMeasurements.map(d => d.id);
      distIds.forEach(id => this.deleteDistanceMeasurement(id));
    }
    this.distanceMeasurements = [];
    this.distanceMeasurementCounter = 0;
    this.activeDistanceMeasurementId = null;
    this.cancelPendingDistanceStart();
    this.hideDistancePreview();

    // 3. Clear Radius Measurements (loops, centers, callouts)
    if (this.radiusMeasurements && this.radiusMeasurements.length > 0) {
      const radIds = this.radiusMeasurements.map(m => m.id);
      radIds.forEach(id => this.deleteRadiusMeasurement(id));
    }
    this.radiusMeasurements = [];
    this.radiusMeasurementCounter = 0;
    this.activeRadiusMeasurementId = null;
    this.hideRadiusPreview();

    // 4. Clear all Remaining Standard Point Markers
    if (this.measureMarkers && this.measureMarkers.length > 0) {
      const ids = this.measureMarkers.map(m => m.id);
      ids.forEach(id => this.deleteMeasurePoint(id));
    }
    this.measureMarkers = [];
    this.measurePointCounter = 0;
    this.activeMeasurePointId = null;
    this.hideMeasurePointPreview();

    // 5. Clean up any 3D marker groups, decomp groups, or legacy measure lines
    if (this.measureLine) {
      if (this.measureLine.geometry) this.measureLine.geometry.dispose();
      if (this.measureLine.material) this.measureLine.material.dispose();
      this.scene.remove(this.measureLine);
      this.measureLine = null;
    }
    if (this.measureMarkersGroup) {
      while (this.measureMarkersGroup.children.length > 0) {
        const obj = this.measureMarkersGroup.children[0];
        obj.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m && m.dispose());
            else child.material.dispose();
          }
        });
        this.measureMarkersGroup.remove(obj);
      }
    }
    if (this.distancePreviewDecompGroup) {
      this.distancePreviewDecompGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.scene.remove(this.distancePreviewDecompGroup);
      this.distancePreviewDecompGroup = null;
    }

    // 6. Clean up 2D Callouts & Leader SVGs from DOM
    const calloutsList = document.getElementById('measure-callouts-list');
    if (calloutsList) calloutsList.innerHTML = '';
    const svgEl = document.getElementById('measure-leader-svg');
    if (svgEl) svgEl.innerHTML = '';
    const calloutsLayer = document.getElementById('measure-callouts-layer');
    if (calloutsLayer) {
      const placedCallouts = calloutsLayer.querySelectorAll('.measure-distance-callout:not(.preview), .measure-angle-callout:not(.preview), .measure-radius-callout:not(.preview), .measure-multipoint-badge');
      placedCallouts.forEach(el => el.remove());
    }

    // 7. Clear Snap Engine indicators
    if (this.snapEngine) {
      this.snapEngine.clear();
    }

    // 8. Reset all Floating Tool Panel values to '--'
    const resetIds = [
      'measure-res-pt-elev', 'measure-res-pt-x', 'measure-res-pt-y', 'measure-res-pt-z',
      'measure-res-pt-slope-ratio', 'measure-res-pt-slope-pct', 'measure-res-pt-slope-deg',
      'measure-res-distance', 'measure-res-dx', 'measure-res-dy', 'measure-res-dz',
      'measure-res-slope-ratio', 'measure-res-slope-pct', 'measure-res-slope-deg', 'measure-res-slope',
      'measure-res-p1', 'measure-res-p2',
      'measure-res-radius', 'measure-res-diameter', 'measure-res-geom-type', 'measure-res-center', 'measure-res-target-pt',
      'measure-res-angle-primary', 'measure-res-angle-dec', 'measure-res-angle-dms', 'measure-res-angle-l1', 'measure-res-angle-l2'
    ];
    resetIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });

    this.renderMeasurementResults();

    const hintEl = document.getElementById('measure-mode-hint');
    if (hintEl) {
      hintEl.textContent = this.measureMode === 'point'
        ? I18N.t('measurePointHint')
        : (this.measureMode === 'radius'
          ? I18N.t('measureRadiusHint')
          : (this.measureMode === 'distance'
            ? I18N.t('measurePromptPickFirst')
            : (this.measureMode === 'angle'
              ? (I18N.t('measurePromptPickAngleVertex') || 'Click surface to place Angle Vertex (Point 1/3)')
              : (this.measureMode === 'multipoint'
                ? (I18N.t('measureMultiPromptPickFirst') || 'Click surface to place Point #1 (Start)')
                : I18N.t('measurePendingNotice')))));
    }
    this.requestRender(200);
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
    const isLight = themeName === 'light';
    const bgHex = isLight ? 0xf1f5f9 : 0x0c1017;
    this.scene.background = new THREE.Color(bgHex);
    if (this.scene.fog) this.scene.fog.color.set(bgHex);
    if (this.grid) {
      const wasVisible = this.grid.visible;
      const posY = this.grid.position.y;
      if (this.grid.geometry) this.grid.geometry.dispose();
      if (this.grid.material) this.grid.material.dispose();
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(
        800,
        80,
        isLight ? 0x94a3b8 : 0x1f2e46,
        isLight ? 0xcbd5e1 : 0x131a28
      );
      this.grid.position.y = posY;
      this.grid.visible = wasVisible;
      this.scene.add(this.grid);
    }
    if (this.compass3d && this.compass3d.setTheme) {
      this.compass3d.setTheme(themeName);
    }
    if (this.requestRender) {
      this.requestRender(250);
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
      this.updateLightModeBtnWidths();
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
    
    // 2. Open File & Folder Input with Split Button & Append Menu
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const btnOpenFile = document.getElementById('btn-open-file');
    const btnOpenDropdown = document.getElementById('btn-open-dropdown');
    const openMenu = document.getElementById('open-file-dropdown');
    const menuOpenFolder = document.getElementById('menu-open-folder');
    const menuAppend = document.getElementById('menu-append-file') || document.getElementById('menu-item-append-file');
    const menuAppendFolder = document.getElementById('menu-append-folder');

    if (btnOpenFile) {
      btnOpenFile.addEventListener('click', () => {
        this._isAppendNextFile = false;
        if (fileInput) fileInput.click();
      });
    }

    if (btnOpenDropdown && openMenu) {
      btnOpenDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = openMenu.style.display === 'block';
        openMenu.style.display = isShown ? 'none' : 'block';
      });
      document.addEventListener('click', () => {
        if (openMenu) openMenu.style.display = 'none';
      });
    }

    if (menuOpenFolder) {
      menuOpenFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openMenu) openMenu.style.display = 'none';
        this._isAppendNextFile = false;
        if (folderInput) folderInput.click();
      });
    }

    if (menuAppend) {
      menuAppend.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openMenu) openMenu.style.display = 'none';
        this._isAppendNextFile = true;
        if (fileInput) fileInput.click();
      });
    }

    if (menuAppendFolder) {
      menuAppendFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openMenu) openMenu.style.display = 'none';
        this._isAppendNextFile = true;
        if (folderInput) folderInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const isAppend = Boolean(this._isAppendNextFile);
          this._isAppendNextFile = false;
          this.handleFileInput(e.target.files, isAppend);
          e.target.value = '';
        }
      });
    }

    if (folderInput) {
      folderInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const isAppend = Boolean(this._isAppendNextFile);
          this._isAppendNextFile = false;
          this.handleFileInput(e.target.files, isAppend);
          e.target.value = '';
        }
      });
    }
    
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
      const vc = document.getElementById('viewport-container');
      if (willCollapse) {
        rsb.classList.add('collapsed');
        rsb.style.width = '0px';
        if (btnInspect) btnInspect.classList.remove('active');
        if (vc) vc.classList.add('sidebar-collapsed');
        updateCollapseBtnUI(true);
      } else {
        rsb.classList.remove('collapsed');
        rsb.classList.remove('hidden');
        rsb.style.width = `${this.customInspectorWidth || 330}px`;
        if (btnInspect) btnInspect.classList.add('active');
        if (vc) vc.classList.remove('sidebar-collapsed');
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
    
    // 5c. Tools Button & Floating Tools Panel
    const btnTools = document.getElementById('btn-tool-tools');
    if (btnTools) {
      btnTools.onclick = () => {
        this.toggleFloatingTools();
      };
    }
    const btnFloatingClose = document.getElementById('btn-floating-tools-close');
    if (btnFloatingClose) {
      btnFloatingClose.onclick = () => {
        this.closeFloatingTools();
      };
    }

    // Floating Tools Tabs Nav
    document.querySelectorAll('.tool-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tool-tab');
        this.switchToolTab(targetId);
      });
    });

    // Measure Mode Buttons
    document.querySelectorAll('.measure-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        this.setMeasureMode(mode);
      });
    });

    // Measure Unit Selector
    const unitSel = document.getElementById('measure-unit-sel');
    if (unitSel) {
      unitSel.addEventListener('change', (e) => {
        this.measureUnit = e.target.value;
        this.renderMeasurementResults();
      });
    }

    // Measure Clear Button
    const btnClearMeasure = document.getElementById('btn-measure-clear');
    if (btnClearMeasure) {
      btnClearMeasure.addEventListener('click', () => {
        this.clearMeasurement();
      });
    }

    // Measure Multi-Point Done Button
    const btnDoneMeasure = document.getElementById('btn-measure-multi-done');
    if (btnDoneMeasure) {
      btnDoneMeasure.addEventListener('click', () => {
        this.finishMultiPointMeasurement();
      });
    }

    // Measure Multi-Point Area Row Click to Toggle Mode
    const row3D = document.getElementById('measure-multi-3d-area-row');
    if (row3D) {
      row3D.addEventListener('click', (e) => {
        if (e.target.closest('.measure-val-copy-btn') || e.target.closest('.measure-self-intersect-btn')) return;
        if (this.multiPointState && this.multiPointState.isClosed && this.multiPointAreaMode !== '3d') {
          this.toggleMultiPointAreaMode();
        }
      });
    }
    const rowProj = document.getElementById('measure-multi-proj-area-row');
    if (rowProj) {
      rowProj.addEventListener('click', (e) => {
        if (e.target.closest('.measure-val-copy-btn')) return;
        if (this.multiPointState && this.multiPointState.isClosed && this.multiPointAreaMode !== 'horizontal') {
          this.toggleMultiPointAreaMode();
        }
      });
    }

    // Measure Multi-Point Self-Intersection Jump & Glow Button
    const btnSelfIntersect = document.getElementById('measure-multi-self-intersect-btn');
    if (btnSelfIntersect) {
      btnSelfIntersect.addEventListener('click', (e) => {
        e.stopPropagation();
        this.focusAndFlashSelfIntersection();
      });
    }

    // Measure Value Copy Buttons in Floating Tool Panel (Visual #0284c7 flash with 1s fade, no text change)
    document.querySelectorAll('.measure-val-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        const targetEl = targetId ? document.getElementById(targetId) : null;
        if (!targetEl) return;
        const text = (targetEl.textContent || '').trim();
        if (!text || text === '--') return;

        // Clipboard write without touching button innerHTML
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          });
        }

        // Highlight with #0284c7 then smoothly fade out over 1s back to normal
        btn.classList.remove('fading');
        btn.classList.add('copied');
        setTimeout(() => {
          btn.classList.add('fading');
          btn.classList.remove('copied');
        }, 80);
      });
    });
    
    const angleToggleBtn = document.getElementById('btn-measure-angle-toggle-panel');
    if (angleToggleBtn) {
      angleToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAngleMeasurementMode();
      });
    }

    // 6. Left Sidebar Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        this.switchLeftTab(targetId);
      });
    });
    this.setupSidebarTabsScroll();
    
    // 7. Search filter in Left Sidebar (supports virtual trees)
    const treeSearchInput = document.getElementById('tree-search-input');
    if (treeSearchInput) {
      treeSearchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (this.virtualStructTree) this.virtualStructTree.setFilter(q);
        if (this.virtualLevelsTree) this.virtualLevelsTree.setFilter(q);
        if (this.virtualElemTree) this.virtualElemTree.setFilter(q);
      });
    }
    
    // 8. Quick Tree buttons
    const setupVirtualTreeButtons = (getTree, expId, colId, showId, hideId) => {
      const expBtn = document.getElementById(expId);
      if (expBtn) {
        expBtn.onclick = () => {
          const t = getTree();
          if (t) t.expandAll();
        };
      }
      const colBtn = document.getElementById(colId);
      if (colBtn) {
        colBtn.onclick = () => {
          const t = getTree();
          if (t) t.collapseAll();
        };
      }
      const showBtn = document.getElementById(showId);
      if (showBtn) {
        showBtn.onclick = () => {
          if (this.activeModel) this.activeModel.traverse(m => { if (m.isMesh) m.visible = true; });
          this.categoryStates.forEach(st => {
            st.visible = true;
            if (st.chipEl) {
              st.chipEl.classList.remove('cat-hidden');
              st.chipEl.classList.remove('cat-isolated');
            }
            if (st.checkboxEl) st.checkboxEl.checked = true;
          });
          const t = getTree();
          if (t) t.showAll();
        };
      }
      const hideBtn = document.getElementById(hideId);
      if (hideBtn) {
        hideBtn.onclick = () => {
          if (this.activeModel) this.activeModel.traverse(m => { if (m.isMesh) m.visible = false; });
          this.categoryStates.forEach(st => {
            st.visible = false;
            if (st.chipEl) {
              st.chipEl.classList.add('cat-hidden');
              st.chipEl.classList.remove('cat-isolated');
            }
            if (st.checkboxEl) st.checkboxEl.checked = false;
          });
          const t = getTree();
          if (t) t.hideAll();
        };
      }
    };

    setupVirtualTreeButtons(() => this.virtualStructTree, 'btn-struct-expand-all', 'btn-struct-collapse-all', 'btn-show-all', 'btn-hide-all');
    setupVirtualTreeButtons(() => this.virtualLevelsTree, 'btn-levels-expand-all', 'btn-levels-collapse-all', 'btn-levels-show-all', 'btn-levels-hide-all');
    setupVirtualTreeButtons(() => this.virtualElemTree, 'btn-elem-expand-all', 'btn-elem-collapse-all', 'btn-elem-show-all', 'btn-elem-hide-all');

    const resetOpBtn = document.getElementById('btn-reset-opacity');
    if (resetOpBtn) {
      resetOpBtn.onclick = () => {
        if (this.virtualStructTree) this.virtualStructTree.resetOpacity();
      };
    }
    
    // 9. Section Controls
    const secActive = document.getElementById('sec-active-chk');
    secActive.onchange = () => {
      this.clippingEngine.enabled = secActive.checked;
      if (this.clippingEngine.enabled) {
        this.ensureSectionInCurrentView(this.clippingEngine.mode, false);
      }
      this.clippingEngine.update();
      if (this.clippingEngine.enabled) {
        this.clippingEngine.ensureVisibleGizmo(this.camera);
      } else {
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
        this.ensureSectionInCurrentView(this.clippingEngine.mode, false);
        this.clippingEngine.update();
        this.clippingEngine.ensureVisibleGizmo(this.camera);
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
      this.clippingEngine.mode = mode;
      if (!this.clippingEngine.enabled) {
        this.clippingEngine.enabled = true;
        if (secActive) secActive.checked = true;
      }
      this.ensureSectionInCurrentView(mode, false);
      this.clippingEngine.update();
      this.clippingEngine.ensureVisibleGizmo(this.camera);
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
        this.ensureSectionInCurrentView('box', true);
        this.clippingEngine.update();
        this.clippingEngine.ensureVisibleGizmo(this.camera);
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
        this.clippingEngine.setPlaneOffset(parseFloat(secOffset.value));
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
    const setLightMode = (mode) => {
      if (this.solarEngine) this.solarEngine.mode = mode;
      this.syncLightModeUI();
      this.updateSolarUI();
    };

    const btnModeSolar = document.getElementById('light-mode-btn-solar');
    if (btnModeSolar) btnModeSolar.onclick = () => setLightMode('singapore');
    const btnModeCustom = document.getElementById('light-mode-btn-custom');
    if (btnModeCustom) btnModeCustom.onclick = () => setLightMode('custom');
    this.syncLightModeUI();

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

    // Panel Ambient Cursor Spotlight Glow Setup
    this.initPanelAmbientGlow();
  }

  initPanelAmbientGlow() {
    const panelIds = ['left-sidebar', 'right-sidebar', 'floating-tools-panel'];
    panelIds.forEach(id => {
      const panel = document.getElementById(id);
      if (!panel) return;

      // Create isolated GPU-composited glow boundary and spotlight follower
      const boundary = document.createElement('div');
      boundary.className = 'panel-glow-boundary';
      const spotlight = document.createElement('div');
      spotlight.className = 'panel-glow-spotlight';
      boundary.appendChild(spotlight);
      panel.appendChild(boundary);

      let isHovered = false;
      let rafId = null;
      let cachedRect = null;
      let latestClientX = 0;
      let latestClientY = 0;

      const updateRect = () => {
        cachedRect = panel.getBoundingClientRect();
      };

      const renderGlow = () => {
        rafId = null;
        if (!isHovered) return;
        if (!cachedRect) updateRect();
        const x = Math.round(latestClientX - cachedRect.left);
        const y = Math.round(latestClientY - cachedRect.top);
        spotlight.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      };

      panel.addEventListener('pointerenter', (e) => {
        isHovered = true;
        updateRect();
        boundary.classList.add('active');
        latestClientX = e.clientX;
        latestClientY = e.clientY;
        if (!rafId) {
          rafId = requestAnimationFrame(renderGlow);
        }
      });

      panel.addEventListener('pointerleave', () => {
        isHovered = false;
        cachedRect = null;
        boundary.classList.remove('active');
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      });

      panel.addEventListener('pointermove', (e) => {
        if (!isHovered) {
          isHovered = true;
          updateRect();
          boundary.classList.add('active');
        }
        latestClientX = e.clientX;
        latestClientY = e.clientY;
        if (!rafId) {
          rafId = requestAnimationFrame(renderGlow);
        }
      }, { passive: true });

      window.addEventListener('resize', () => {
        cachedRect = null;
      }, { passive: true });
    });
  }
  
  toggleFloatingTools(preferredTabId = null) {
    if (this.isFloatingToolsOpen) {
      this.closeFloatingTools();
    } else {
      this.openFloatingTools(preferredTabId || this.activeToolTab);
    }
  }

  openFloatingTools(tabId = 'tab-section-content') {
    this.isFloatingToolsOpen = true;
    const panel = document.getElementById('floating-tools-panel');
    if (panel) panel.style.display = 'flex';
    const btnTools = document.getElementById('btn-tool-tools');
    if (btnTools) btnTools.classList.add('active');
    this.switchToolTab(tabId);
  }

  closeFloatingTools() {
    this.isFloatingToolsOpen = false;
    const panel = document.getElementById('floating-tools-panel');
    if (panel) panel.style.display = 'none';
    const btnTools = document.getElementById('btn-tool-tools');
    if (btnTools) btnTools.classList.remove('active');
    if (this.isMeasureMode) {
      this.isMeasureMode = false;
      this.hideMeasurePointPreview();
      this.hideRadiusPreview();
      if (this.snapEngine) this.snapEngine.hideIndicator();
      if (this.canvas) this.canvas.style.cursor = 'default';
    }
  }

  switchToolTab(tabContentId) {
    this.activeToolTab = tabContentId;
    document.querySelectorAll('.floating-tools-tabs-nav .tool-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tool-tab') === tabContentId);
    });
    document.querySelectorAll('.floating-tools-body .tool-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === tabContentId);
    });

    if (tabContentId === 'tab-section-content') {
      this.updateClippingModeBtnWidths();
    }
    if (tabContentId === 'tab-light-content') {
      this.updateLightModeBtnWidths();
    }

    if (tabContentId === 'tab-measure-content') {
      this.setMeasureMode(this.measureMode || 'point');
    } else {
      // If switched away from measure tab, pause measure mode cursor (keep existing markers/callouts visible)
      if (this.isMeasureMode) {
        this.isMeasureMode = false;
        this.hideMeasurePointPreview();
        this.hideRadiusPreview();
        this.hideDistancePreview();
        this.hideAnglePreview();
        this.hideMultiPointPreview();
        if (this.snapEngine) this.snapEngine.hideIndicator();
        if (this.canvas) this.canvas.style.cursor = 'default';
      }
    }
  }

  setMeasureMode(mode) {
    this.measureMode = mode;
    document.querySelectorAll('.measure-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    const hintEl = document.getElementById('measure-mode-hint');
    if (mode !== 'distance') {
      this.cancelPendingDistanceStart();
    }
    if (mode !== 'angle') {
      this.cancelPendingAngleStart();
    }
    if (mode !== 'multipoint') {
      this.cancelPendingMultiPoint();
    }
    if (mode === 'point') {
      if (hintEl) hintEl.textContent = I18N.t('measurePointHint');
      this.isMeasureMode = true;
      if (this.canvas) this.canvas.style.cursor = 'crosshair';
      this.hideRadiusPreview();
      this.hideDistancePreview();
    } else if (mode === 'distance') {
      if (hintEl) hintEl.textContent = this.pendingDistanceStart ? I18N.t('measurePromptPickSecond') : I18N.t('measurePromptPickFirst');
      this.isMeasureMode = true;
      if (this.canvas) this.canvas.style.cursor = 'crosshair';
      this.hideMeasurePointPreview();
      this.hideRadiusPreview();
    } else if (mode === 'radius') {
      if (hintEl) hintEl.textContent = I18N.t('measureRadiusHint');
      this.isMeasureMode = true;
      if (this.canvas) this.canvas.style.cursor = 'crosshair';
      this.hideMeasurePointPreview();
      this.hideDistancePreview();
      this.hideAnglePreview();
    } else if (mode === 'angle') {
      if (hintEl) {
        if (!this.pendingAngleState) hintEl.textContent = I18N.t('measurePromptPickAngleVertex');
        else if (this.pendingAngleState.step === 1) hintEl.textContent = I18N.t('measurePromptPickAngleArm1');
        else if (this.pendingAngleState.step === 2) hintEl.textContent = I18N.t('measurePromptPickAngleArm2');
      }
      this.isMeasureMode = true;
      if (this.canvas) this.canvas.style.cursor = 'crosshair';
      this.hideMeasurePointPreview();
      this.hideRadiusPreview();
      this.hideDistancePreview();
      this.hideMultiPointPreview();
    } else if (mode === 'multipoint') {
      if (hintEl) {
        if (!this.multiPointState || !this.multiPointState.isDrawing) {
          hintEl.textContent = I18N.t('measureMultiPromptPickFirst') || 'Click surface to place Point #1 (Start)';
        } else {
          hintEl.textContent = I18N.t('measureMultiPromptPickNext') || "Click surface to add next point | Double-click or click 'Done' to finish";
        }
      }
      this.isMeasureMode = true;
      if (this.canvas) this.canvas.style.cursor = 'crosshair';
      this.hideMeasurePointPreview();
      this.hideRadiusPreview();
      this.hideDistancePreview();
      this.hideAnglePreview();
    } else {
      if (hintEl) hintEl.textContent = I18N.t('measurePendingNotice');
      this.isMeasureMode = false;
      if (this.canvas) this.canvas.style.cursor = 'default';
      this.hideMeasurePointPreview();
      this.hideRadiusPreview();
      this.hideDistancePreview();
    }
    this.renderMeasurementResults();
  }

  switchLeftTab(tabContentId) {
    if (['tab-section-content', 'tab-light-content', 'tab-camera-content', 'tab-measure-content'].includes(tabContentId)) {
      this.openFloatingTools(tabContentId);
      return;
    }
    document.querySelectorAll('.sidebar-tabs-nav .tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabContentId);
    });
    document.querySelectorAll('.sidebar-tab-content-panel .tab-content').forEach(c => {
      c.classList.toggle('active', c.id === tabContentId);
    });
    this.scrollActiveSidebarTabIntoView();

    // Lazy initialization & layout resize for Virtual Trees
    if (tabContentId === 'tab-levels-content') {
      if (!this.virtualLevelsTree && this.virtualLevelsData) {
        this.virtualLevelsTree = new VirtualBimTree({
          app: this,
          container: document.getElementById('tree-levels'),
          type: 'levels',
          groups: this.virtualLevelsData
        });
      } else if (this.virtualLevelsTree) {
        this.virtualLevelsTree.onResize();
      }
    } else if (tabContentId === 'tab-elem-content') {
      if (!this.virtualElemTree && this.virtualElemData) {
        this.virtualElemTree = new VirtualBimTree({
          app: this,
          container: document.getElementById('tree-elements'),
          type: 'elements',
          groups: this.virtualElemData
        });
      } else if (this.virtualElemTree) {
        this.virtualElemTree.onResize();
      }
    } else if (tabContentId === 'tab-struct-content') {
      if (this.virtualStructTree) {
        this.virtualStructTree.onResize();
      }
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

      // Draw Calls from Three.js renderer info (preserve last rendered draw call count when idle)
      if (this._renderedInWindow && this.renderer && this.renderer.info && this.renderer.info.render) {
        this.drawCalls = this.renderer.info.render.calls;
      }
      this._renderedInWindow = false;

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
      this.needsRender = true;
    }
    
    // True 3D Compass (internally dirty-checked on camera orientation)
    if (this.compass3d) {
      this.compass3d.update();
    }
    
    // Dynamic Orbit Pivot Indicator
    const pivotActive = !!(this.pivotHelper && this.pivotHelper.visible);
    if (pivotActive) {
      this.updatePivotIndicator();
      this.needsRender = true;
    }

    // Animation Mixer update (for DAE, FBX & GLTF models with animations)
    if (this.animMixer && this.currentAnimAction) {
      if (this.isAnimPlaying && !this.isAnimScrubbing) {
        const delta = this.animClock ? this.animClock.getDelta() : 0.016;
        this.animMixer.update(delta * this.animPlaybackSpeed);
        const t = this.isAnimLooping ? 
          (this.currentAnimAction.time % (this.animDuration || 1)) : 
          Math.min(this.currentAnimAction.time, this.animDuration);
        this.updateAnimationScrubber(t);
        this.needsRender = true;

        // Auto pause at end if not looping
        if (!this.isAnimLooping && this.currentAnimAction.time >= this.animDuration) {
          this.isAnimPlaying = false;
          const playIcon = document.getElementById('anim-icon-play');
          const pauseIcon = document.getElementById('anim-icon-pause');
          if (playIcon) playIcon.style.display = 'block';
          if (pauseIcon) pauseIcon.style.display = 'none';
        }
      } else if (this.isAnimScrubbing) {
        this.needsRender = true;
      }
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
        this.needsRender = true;
        if ((this.measureMarkers && this.measureMarkers.length > 0) || (this.radiusMeasurements && this.radiusMeasurements.length > 0) || (this.angleMeasurements && this.angleMeasurements.length > 0) || (this.distanceMeasurements && this.distanceMeasurements.length > 0)) {
          this.updateMeasureMarkersAndCallouts();
        }

        if (this.snapEngine && this.snapEngine.indicatorGroup && this.snapEngine.indicatorGroup.visible) {
          this.snapEngine.updateIndicatorScale(this.camera, this.container);
        }

        this.updateOffscreenIndicator();
      }
    }

    // Detect camera or model changes automatically
    if (this.camera) {
      const camZoom = this.camera.zoom || 1;
      const orthoH = this.camera.isOrthographicCamera ? (this.camera.top - this.camera.bottom) : 0;
      const camChanged =
        isNaN(this._lastCamPos.x) ||
        this.camera.position.distanceToSquared(this._lastCamPos) > 1e-8 ||
        (1 - Math.abs(this.camera.quaternion.dot(this._lastCamQuat))) > 1e-8 ||
        Math.abs(camZoom - this._lastCamZoom) > 1e-6 ||
        Math.abs(orthoH - (this._lastOrthoH || 0)) > 1e-6 ||
        this._lastCameraObj !== this.camera ||
        this._lastActiveModel !== this.activeModel;

      if (camChanged) {
        this._lastCamPos.copy(this.camera.position);
        this._lastCamQuat.copy(this.camera.quaternion);
        this._lastCamZoom = camZoom;
        this._lastOrthoH = orthoH;
        this._lastCameraObj = this.camera;
        this._lastActiveModel = this.activeModel;
        this.needsRender = true;

        if (this.solarEngine && this.solarEngine.setCamera) {
          this.solarEngine.setCamera(this.camera, this.controls ? this.controls.target : null);
        }
        if (this.clippingEngine && this.clippingEngine.enabled && this.clippingEngine.updateGizmoScaleForCamera) {
          this.clippingEngine.updateGizmoScaleForCamera(this.camera);
        }

        if ((this.measureMarkers && this.measureMarkers.length > 0) || (this.radiusMeasurements && this.radiusMeasurements.length > 0) || (this.angleMeasurements && this.angleMeasurements.length > 0) || (this.distanceMeasurements && this.distanceMeasurements.length > 0)) {
          this.updateMeasureMarkersAndCallouts();
        }

        if (this.snapEngine && this.snapEngine.indicatorGroup && this.snapEngine.indicatorGroup.visible) {
          this.snapEngine.updateIndicatorScale(this.camera, this.container);
        }

        this.updateOffscreenIndicator();

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
        if (camTab && camTab.classList.contains('active')) {
          const pos = this.camera.position;
          if (this.cachedCamEls.pos) this.cachedCamEls.pos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
          const piv = this.pivotPoint || (this.controls ? this.controls.target : null);
          if (this.cachedCamEls.piv && piv) this.cachedCamEls.piv.textContent = `${piv.x.toFixed(1)}, ${piv.y.toFixed(1)}, ${piv.z.toFixed(1)}`;
          if (this.cachedCamEls.dist && piv) this.cachedCamEls.dist.textContent = `${pos.distanceTo(piv).toFixed(1)} m`;
        }
      }
    }

    const shouldRender =
      this.needsRender ||
      frameStart < (this._activeRenderUntil || 0) ||
      this.cameraTweenRaf !== null ||
      this.isOrbiting ||
      this.isPanning ||
      this.isRightDragging ||
      this.isGizmoDragging ||
      this.isDraggingMeasurePoint;

    if (this.pointCloudManager) {
      this.pointCloudManager.update(this.camera, this.renderer);
    }

    if (shouldRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this._renderedInWindow = true;
      if (this.renderer && this.renderer.info && this.renderer.info.render) {
        this.drawCalls = this.renderer.info.render.calls;
      }

      // Initial draw call readout on first frame
      if (this.cachedPerfEls && this.cachedPerfEls.draw && (this.cachedPerfEls.draw.textContent === '0' || !this.cachedPerfEls.draw.textContent)) {
        if (this.drawCalls > 0) this.cachedPerfEls.draw.textContent = this.drawCalls;
      }
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
