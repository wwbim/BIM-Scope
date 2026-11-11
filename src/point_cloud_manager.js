/**
 * BIM Scope Point Cloud Management Engine (v2)
 * Powered by Potree 2.x Octree Streaming & potree-core
 * Supports both HTTP Range streaming from Las2Web and zero-server local file drag & drop.
 * @author WWBIM
 */

class LocalFileRequestManager {
  constructor(fileMap) {
    this.fileMap = fileMap;
  }

  async getUrl(url) {
    if (!url) return '/metadata.json';
    return url.startsWith('/') ? url : ('/' + url);
  }

  async fetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const cleanUrl = urlStr.split('?')[0];
    const fileName = cleanUrl.split(/[/\\]/).pop().toLowerCase();

    const file = this.fileMap.get(fileName);
    if (!file) {
      console.warn('[LocalFileRequestManager] File not found in local drop map:', fileName);
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }

    if (fileName === 'metadata.json') {
      const text = await file.text();
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Range request handling for chunk streaming of octree.bin and hierarchy.bin
    const headers = init.headers || {};
    let rangeHeader = null;
    if (typeof headers.get === 'function') {
      rangeHeader = headers.get('Range');
    } else if (typeof headers === 'object') {
      rangeHeader = headers['Range'] || headers['range'];
    }

    const totalSize = file.size;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const sliceBlob = file.slice(start, end + 1);
        const buf = await sliceBlob.arrayBuffer();

        return new Response(buf, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': String(buf.byteLength),
            'Accept-Ranges': 'bytes'
          }
        });
      }
    }

    const buf = await file.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes'
      }
    });
  }
}

const PC_BUDGET_TIERS = [1000000, 2000000, 5000000, 10000000];
const PC_BUDGET_LABELS = ['1M', '2M', '5M', '10M'];

class BIMPointCloudManager {
  constructor(app) {
    this.app = app;
    this.potree = null;
    this.pointClouds = [];
    this.activePointCloud = null;
    this.isPointCloudSelected = false;

    // Visual & Rendering Configuration
    this.pointSize = 1.0;
    this.pointSizeType = 2; // 0: FIXED, 1: ATTENUATED, 2: ADAPTIVE
    this.pointBudget = 2000000;
    this.pointColorType = 0; // 0: RGB, 3: ELEVATION, 4: INTENSITY, 8: CLASSIFICATION
    this.opacity = 1.0;
    this.offset = new THREE.Vector3(0, 0, 0);
    this.clipEdgeThreshold = 0.010; // 10mm (0.01m) minimum floor cut edge red line band with dynamic screen thickness

    // Snapping Picker
    this.picker = null;

    // Check URL parameters on initialization
    this.checkUrlParameters();
  }

  budgetToTierIndex(budget) {
    const val = parseInt(budget, 10) || 2000000;
    let closestIdx = 1;
    let minDiff = Infinity;
    for (let i = 0; i < PC_BUDGET_TIERS.length; i++) {
      const diff = Math.abs(PC_BUDGET_TIERS[i] - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return closestIdx;
  }

  tierIndexToBudget(idx) {
    const i = Math.max(0, Math.min(PC_BUDGET_TIERS.length - 1, parseInt(idx, 10) || 0));
    return PC_BUDGET_TIERS[i];
  }

  getBudgetDisplay(budget) {
    const idx = this.budgetToTierIndex(budget);
    return `${PC_BUDGET_LABELS[idx]} pts`;
  }

  initPotree() {
    this.patchPointCloudMaterialShader();
    if (this.potree) return;
    if (typeof window.Potree === 'function') {
      this.potree = new window.Potree();
      this.potree.pointBudget = this.pointBudget;
      if (window.PotreeCore && window.PotreeCore.PointCloudOctreePicker) {
        this.picker = new window.PotreeCore.PointCloudOctreePicker();
      }
    } else {
      console.warn('Potree library not found. Ensure potree-core.min.js is loaded.');
    }
  }

  patchPointCloudMaterialShader() {
    if (typeof window === 'undefined' || !window.PointCloudMaterial) return;
    const proto = window.PointCloudMaterial.prototype;
    if (proto._clippingEdgePatched) return;
    proto._clippingEdgePatched = true;

    const origUpdateShaderSource = proto.updateShaderSource;
    proto.updateShaderSource = function() {
      origUpdateShaderSource.call(this);
      if (!this.vertexShader) return;

      // 1. Declare uniform clipEdgeThreshold in vertex shader if not present
      if (!this.vertexShader.includes('uniform float clipEdgeThreshold;')) {
        this.vertexShader = this.vertexShader.replace(
          'uniform float clipPlaneCount;',
          'uniform float clipPlaneCount;\nuniform float clipEdgeThreshold;'
        );
      }

      // 2. Track minimum positive distance to clipping planes
      const pInside = 'bool insideAllPlanes = true;';
      if (!this.vertexShader.includes('minClipDist') && this.vertexShader.includes(pInside)) {
        this.vertexShader = this.vertexShader.replace(
          pInside,
          'bool insideAllPlanes = true;\nfloat minClipDist = 999999.0;'
        );
        this.vertexShader = this.vertexShader.replace(
          'if (d < 0.0) { insideAllPlanes = false; break; }',
          'if (d < 0.0) { insideAllPlanes = false; break; }\nminClipDist = min(minClipDist, d);'
        );
      }

      // 3. Highlight boundary points in pure CAD red if within dynamic screen-distance threshold
      const pHighlight = 'if (insideAnyHighlight) { vColor.r += 0.5; }';
      if (!this.vertexShader.includes('clipEdgeThreshold > 0.0') && this.vertexShader.includes(pHighlight)) {
        const edgeHighlightCode = [
          'if (insideAnyHighlight) { vColor.r += 0.5; }',
          '#if defined use_clip_plane',
          '  #if defined clip_outside',
          '    #if !defined(color_type_point_index)',
          '      if (insideAllPlanes && clipPlaneCount > 0.0 && clipEdgeThreshold > 0.0) {',
          '        float zDist = max(-mvPosition.z, 0.1);',
          '        float pixelWorldSize = useOrthographicCamera ? (orthoHeight / max(screenHeight, 1.0)) : (2.0 * zDist * tanHalfFOV / max(screenHeight, 1.0));',
          '        float edgeThreshold = max(clipEdgeThreshold, 5.0 * pixelWorldSize);',
          '        if (minClipDist <= edgeThreshold) {',
          '          #ifdef new_format',
          '            vColor = vec4(1.0, 0.0, 0.0, vColor.a);',
          '          #else',
          '            vColor = vec3(1.0, 0.0, 0.0);',
          '          #endif',
          '        }',
          '      }',
          '    #endif',
          '  #endif',
          '#endif'
        ].join('\n');
        this.vertexShader = this.vertexShader.replace(pHighlight, edgeHighlightCode);
      }

      // 4. Ensure clipEdgeThreshold uniform exists on material
      if (this.uniforms && !this.uniforms.clipEdgeThreshold) {
        this.uniforms.clipEdgeThreshold = { type: 'f', value: 0.010 };
      }
    };
  }

  checkUrlParameters() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const pcUrl = urlParams.get('pointcloud') || urlParams.get('potree') || urlParams.get('las');
      if (pcUrl) {
        const decoded = decodeURIComponent(pcUrl);
        setTimeout(() => {
          this.loadFromUrl(decoded);
        }, 300);
      }
    } catch (e) {
      console.warn('Error reading pointcloud URL parameter:', e);
    }
  }

  async loadFromUrl(metadataUrl) {
    this.initPotree();
    if (!this.potree) {
      this.app.showToast('Potree library initialization failed', 3000);
      return null;
    }

    try {
      if (this.app.showToast) {
        this.app.showToast(window.I18N ? window.I18N.t('pointCloudLoading') : 'Streaming point cloud octree...', 2500);
      }

      // Parse metadata filename and baseUrl
      const lastSlash = metadataUrl.lastIndexOf('/');
      let baseUrl = '';
      let fileName = 'metadata.json';
      if (lastSlash >= 0) {
        baseUrl = metadataUrl.substring(0, lastSlash + 1);
        fileName = metadataUrl.substring(lastSlash + 1) || 'metadata.json';
      } else {
        baseUrl = './';
        fileName = metadataUrl;
      }

      console.log(`[BIMPointCloudManager] Loading point cloud: ${fileName} from ${baseUrl}`);
      const pco = await this.potree.loadPointCloud(fileName, baseUrl);

      if (!pco) {
        throw new Error('Null point cloud returned');
      }

      if (this.app && typeof this.app.clearModel === 'function') {
        this.app.clearModel(false);
      }
      this.clearPointClouds();

      this.onPointCloudLoaded(pco, false);
      return pco;
    } catch (err) {
      console.error('[BIMPointCloudManager] Load error:', err);
      if (this.app.showToast) {
        const errMsg = window.I18N ? window.I18N.t('pointCloudLoadError', { error: err.message }) : `Failed to load point cloud: ${err.message}`;
        this.app.showToast(errMsg, 4000);
      }
      return null;
    }
  }

  async loadFromLocalFiles(fileList, isAppend = false) {
    this.initPotree();
    if (!this.potree) {
      this.app.showToast('Potree library initialization failed', 3000);
      return null;
    }

    const fileMap = new Map();
    for (const f of fileList) {
      const baseName = (f.name || '').split(/[/\\]/).pop().toLowerCase();
      if (baseName.endsWith('log.txt')) continue;
      fileMap.set(baseName, f);
      if (f.webkitRelativePath) {
        const relBase = f.webkitRelativePath.split(/[/\\]/).pop().toLowerCase();
        if (!relBase.endsWith('log.txt')) {
          fileMap.set(relBase, f);
        }
      }
    }

    // Check if metadata.json and octree.bin exist in the dropped/selected files
    if (!fileMap.has('metadata.json') || !fileMap.has('octree.bin')) {
      this.showMissingBinModal(isAppend);
      return null;
    }

    if (!isAppend) {
      if (this.app.clearModel) this.app.clearModel(false);
      this.clearPointClouds();
    }

    try {
      if (this.app.showToast) {
        this.app.showToast(window.I18N ? window.I18N.t('pointCloudLoading') : 'Streaming point cloud octree...', 2500);
      }

      const reqManager = new LocalFileRequestManager(fileMap);
      const pco = await this.potree.loadPointCloud('/metadata.json', reqManager);

      if (!pco) throw new Error('Null point cloud returned');

      // Derive friendly name
      let pcName = 'Point Cloud';
      const folderFile = fileList.find(f => f.webkitRelativePath);
      if (folderFile) {
        const rootFolder = folderFile.webkitRelativePath.split(/[/\\]/)[0];
        if (rootFolder && rootFolder !== '.' && rootFolder !== '') pcName = rootFolder;
      } else if (fileList.length > 0) {
        const nonBin = fileList.find(f => {
          const name = (f.name || '').toLowerCase();
          return !name.endsWith('.bin') && 
                 !name.endsWith('.json') && 
                 !name.endsWith('.txt') && 
                 !name.endsWith('.log') && 
                 !name.startsWith('.');
        });
        if (nonBin) {
          pcName = nonBin.name.replace(/\.[^/.]+$/, '');
        }
      }
      if (pco.pcoGeometry && pco.pcoGeometry.loader && pco.pcoGeometry.loader.metadata && pco.pcoGeometry.loader.metadata.name) {
        pcName = pco.pcoGeometry.loader.metadata.name;
      }
      pco.name = pcName;

      this.onPointCloudLoaded(pco, isAppend);
      return pco;
    } catch (err) {
      console.error('[BIMPointCloudManager] Local load error:', err);
      if (this.app.showToast) {
        const errMsg = window.I18N ? window.I18N.t('pointCloudLoadError', { error: err.message }) : `Failed to load point cloud: ${err.message}`;
        this.app.showToast(errMsg, 4000);
      }
      return null;
    }
  }

  getPointCloudSettings(pco = this.activePointCloud) {
    if (!pco) {
      return {
        pointSize: this.pointSize || 1.0,
        pointSizeType: this.pointSizeType !== undefined ? this.pointSizeType : 2,
        pointBudget: this.pointBudget || 2000000,
        pointColorType: this.pointColorType !== undefined ? this.pointColorType : 0,
        opacity: this.opacity !== undefined ? this.opacity : 1.0
      };
    }
    if (!pco.userData) pco.userData = {};
    if (!pco.userData.settings) {
      pco.userData.settings = {
        pointSize: 1.0,
        pointSizeType: 2,
        pointBudget: 2000000,
        pointColorType: 0,
        opacity: 1.0
      };
    }
    return pco.userData.settings;
  }

  selectPointCloud(pco) {
    if (!pco) return;
    this.activePointCloud = pco;
    this.isPointCloudSelected = true;

    if (this.app && typeof this.app.clearSelection === 'function') {
      this.app.clearSelection(true);
    }

    this.renderInspectorCard();

    const rsb = document.getElementById('right-sidebar');
    if (rsb) {
      rsb.classList.remove('hidden');
      if (rsb.classList.contains('collapsed')) {
        this.app.autoCollapsedRight = false;
        if (typeof this.app.toggleInspectorCollapse === 'function') {
          this.app.toggleInspectorCollapse(true);
        }
      }
    }

    if (this.app && typeof this.app.syncTreeSelection === 'function') {
      this.app.syncTreeSelection();
    }
  }

  onPointCloudLoaded(pco, isAppend = false) {
    // Potree constructor in potree-core copies raw offset: pco.position.copy(pcoGeometry.offset);
    // In surveying (ASPRS LAS/LAZ): X = Easting, Y = Northing, Z = Elevation (Z-up).
    // In Three.js / BIM Scope (Y-up):
    // Three.js X = Easting
    // Three.js Y = Elevation (Z_las)
    // Three.js Z = -Northing (-Y_las)
    const rawOffset = (pco.pcoGeometry && pco.pcoGeometry.offset) ? pco.pcoGeometry.offset.clone() : pco.position.clone();
    pco.userData._rawOffset = rawOffset.clone();
    pco.position.set(rawOffset.x, rawOffset.z, -rawOffset.y);
    pco.rotation.x = -Math.PI / 2;
    pco.userData._isZUp = true;
    pco.isPointCloud = true;
    pco.userData.isPointCloud = true;
    pco.updateMatrixWorld(true);

    const pointCount = this.getPointCloudPointCount(pco);
    if (pointCount > 0) {
      pco.numPoints = pointCount;
      pco.userData.numPoints = pointCount;
    }

    // Initialize tight local bounding box from metadata if available
    this.computeTightLocalBoundingBox(pco);

    // Configure Point Cloud Material (per-cloud settings)
    this.configureMaterial(pco);

    // Add to scene
    this.app.scene.add(pco);
    this.pointClouds.push(pco);
    this.activePointCloud = pco;
    this.isPointCloudSelected = true;

    if (this.app && typeof this.app.clearSelection === 'function') {
      this.app.clearSelection(true);
    }

    // Update combined scene clipping bounds & link with existing clipping planes
    if (this.app && typeof this.app.updateClippingBounds === 'function') {
      this.app.updateClippingBounds(true);
    }
    this.syncClippingWithApp();

    // Update Left Sidebar Model Hierarchy & Status Bar Stats
    this.updateModelHierarchyTree();
    if (this.app && typeof this.app.updateStats === 'function') {
      this.app.updateStats();
    }
    if (this.app && typeof this.app.syncTreeSelection === 'function') {
      this.app.syncTreeSelection();
    }

    // Update Right Sidebar Inspector
    this.renderInspectorCard();

    const countStr = (pointCount || 0).toLocaleString();

    if (!isAppend) {
      pco.userData._pendingInitialFit = true;
      // Fit View to point cloud only when opened fresh
      this.fitPointCloudView(pco, true);
      if (this.app.showToast) {
        const msg = window.I18N ? window.I18N.t('pointCloudLoaded', { count: countStr }) : `Point cloud loaded: ${countStr} points`;
        this.app.showToast(msg, 3500);
      }
    } else {
      // Append mode: preserve current camera view
      const toastMsg = window.I18N ? window.I18N.t('fileAppendedToast', { name: pco.name }) : `File "${pco.name}" appended to scene. Double-click in tree to focus.`;
      if (this.app.showToast) {
        this.app.showToast(toastMsg, 4000);
      }
    }

    if (this.app._wakeRender) {
      this.app._wakeRender(3500);
    }
  }

  removePointCloud(pco) {
    if (!pco) return;
    const name = pco.name || 'Point Cloud';
    const idx = this.pointClouds.indexOf(pco);
    if (idx >= 0) {
      this.pointClouds.splice(idx, 1);
    }
    this.app.scene.remove(pco);
    try {
      if (pco.material && typeof pco.material.dispose === 'function') {
        pco.material.dispose();
      }
      if (pco.dispose && typeof pco.dispose === 'function') {
        pco.dispose();
      }
    } catch (e) {
      console.warn('[PointCloud] Dispose error:', e);
    }

    if (this.activePointCloud === pco) {
      this.activePointCloud = this.pointClouds[this.pointClouds.length - 1] || null;
      this.isPointCloudSelected = Boolean(this.activePointCloud);
    }

    // Rebuild tree & status bar stats
    this.updateModelHierarchyTree();
    if (this.app && typeof this.app.updateStats === 'function') {
      this.app.updateStats();
    }

    // Update inspector
    if (this.activePointCloud) {
      this.renderInspectorCard();
    } else {
      const card = document.getElementById('pointcloud-inspector-card');
      if (card) card.style.display = 'none';
      if (this.app.loadedModels && this.app.loadedModels.length > 0) {
        this.app.renderModelInfoInspector();
      }
    }

    if (this.app && typeof this.app.updateClippingBounds === 'function') {
      this.app.updateClippingBounds(true);
    }

    // Check if entire scene is empty
    if (this.app.checkEmptySceneState) {
      this.app.checkEmptySceneState();
    }

    const toastMsg = window.I18N ? window.I18N.t('fileRemovedToast', { name: name }) : `Removed "${name}" from scene.`;
    if (this.app.showToast) {
      this.app.showToast(toastMsg, 3000);
    }
    if (this.app._wakeRender) {
      this.app._wakeRender(300);
    }
  }

  clearPointClouds() {
    const list = [...this.pointClouds];
    list.forEach(pco => {
      this.app.scene.remove(pco);
      try {
        if (pco.material && typeof pco.material.dispose === 'function') pco.material.dispose();
        if (pco.dispose && typeof pco.dispose === 'function') pco.dispose();
      } catch (e) {}
    });
    this.pointClouds = [];
    this.activePointCloud = null;
    this.isPointCloudSelected = false;
    const card = document.getElementById('pointcloud-inspector-card');
    if (card) card.style.display = 'none';
  }

  toggleOrientation(pco = this.activePointCloud) {
    if (!pco) return;
    const isZUp = Boolean(pco.userData._isZUp);
    pco.userData._isZUp = !isZUp;
    const rawOffset = pco.userData._rawOffset || (pco.pcoGeometry && pco.pcoGeometry.offset) || new THREE.Vector3();
    if (pco.userData._isZUp) {
      pco.position.set(rawOffset.x, rawOffset.z, -rawOffset.y);
      pco.rotation.x = -Math.PI / 2;
    } else {
      pco.position.set(rawOffset.x, rawOffset.y, rawOffset.z);
      pco.rotation.x = 0;
    }
    pco.updateMatrixWorld(true);
    pco.userData._percentileComputed = false;
    pco.userData._percentileElevationRange = null;
    this.applyMaterialSettings(pco);
    if (this.app && typeof this.app.updateClippingBounds === 'function') {
      this.app.updateClippingBounds(true);
    }
    this.fitPointCloudView(pco);
    this.renderInspectorCard();
    if (this.app._wakeRender) this.app._wakeRender(1000);
  }

  getPointCloudPointCount(pco = this.activePointCloud) {
    if (!pco) return 0;
    if (pco.userData && typeof pco.userData.numPoints === 'number' && pco.userData.numPoints > 0) return pco.userData.numPoints;
    if (typeof pco.numPoints === 'number' && pco.numPoints > 0) return pco.numPoints;
    if (pco.pcoGeometry) {
      if (typeof pco.pcoGeometry.numPoints === 'number' && pco.pcoGeometry.numPoints > 0) return pco.pcoGeometry.numPoints;
      if (typeof pco.pcoGeometry.points === 'number' && pco.pcoGeometry.points > 0) return pco.pcoGeometry.points;
      if (pco.pcoGeometry.loader && pco.pcoGeometry.loader.metadata) {
        const meta = pco.pcoGeometry.loader.metadata;
        if (typeof meta.points === 'number' && meta.points > 0) return meta.points;
        if (typeof meta.numPoints === 'number' && meta.numPoints > 0) return meta.numPoints;
      }
    }
    return 0;
  }

  computeTightLocalBoundingBox(pco, lowerPct = 0.005, upperPct = 0.995) {
    if (!pco) return null;
    if (!pco.userData) pco.userData = {};

    // 1. Best source: loaded root node geometry in local pco space (excludes cubic octree padding and extreme noise outliers)
    const rootNode = (pco.pcoGeometry && pco.pcoGeometry.root) || pco.root;
    const rootGeo = rootNode && (rootNode.geometry || (rootNode.geometryNode && rootNode.geometryNode.geometry));
    if (rootGeo && rootGeo.attributes && rootGeo.attributes.position && rootGeo.attributes.position.array) {
      const pos = rootGeo.attributes.position;
      const count = pos.count || Math.floor(pos.array.length / 3);
      const arr = pos.array;
      if (count >= 10) {
        const xs = [];
        const ys = [];
        const zs = [];
        const nodeMin = (rootNode.boundingBox && rootNode.boundingBox.min) ? rootNode.boundingBox.min : { x: 0, y: 0, z: 0 };
        const stride = count > 25000 ? Math.ceil(count / 25000) : 1;
        for (let i = 0; i < count; i += stride) {
          const x = arr[i * 3] + nodeMin.x;
          const y = arr[i * 3 + 1] + nodeMin.y;
          const z = arr[i * 3 + 2] + nodeMin.z;
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            xs.push(x);
            ys.push(y);
            zs.push(z);
          }
        }
        if (xs.length >= 10) {
          xs.sort((a, b) => a - b);
          ys.sort((a, b) => a - b);
          zs.sort((a, b) => a - b);
          const lowIdx = Math.floor(xs.length * lowerPct);
          const highIdx = Math.min(xs.length - 1, Math.floor(xs.length * upperPct));
          const tightBox = new THREE.Box3(
            new THREE.Vector3(xs[lowIdx], ys[lowIdx], zs[lowIdx]),
            new THREE.Vector3(
              Math.max(xs[highIdx], xs[lowIdx] + 0.01),
              Math.max(ys[highIdx], ys[lowIdx] + 0.01),
              Math.max(zs[highIdx], zs[lowIdx] + 0.01)
            )
          );
          pco.userData._tightLocalBox = tightBox;
          pco.userData._tightBoxFromGeometry = true;
          if (pco.pcoGeometry) {
            pco.pcoGeometry.tightBoundingBox = tightBox.clone();
          }
          return tightBox;
        }
      }
    }

    // 2. Synchronous fallback from metadata.json 'position' attribute min/max (before root node worker completes)
    if (pco.pcoGeometry && pco.pcoGeometry.loader && pco.pcoGeometry.loader.metadata) {
      const meta = pco.pcoGeometry.loader.metadata;
      const offset = pco.pcoGeometry.offset || new THREE.Vector3();
      if (Array.isArray(meta.attributes)) {
        const posAttr = meta.attributes.find(a => a && a.name === 'position');
        if (posAttr && Array.isArray(posAttr.min) && Array.isArray(posAttr.max) && posAttr.min.length >= 3 && posAttr.max.length >= 3) {
          const minV = new THREE.Vector3(posAttr.min[0] - offset.x, posAttr.min[1] - offset.y, posAttr.min[2] - offset.z);
          const maxV = new THREE.Vector3(posAttr.max[0] - offset.x, posAttr.max[1] - offset.y, posAttr.max[2] - offset.z);
          if (maxV.x >= minV.x && maxV.y >= minV.y && maxV.z >= minV.z && (maxV.x > minV.x || maxV.y > minV.y || maxV.z > minV.z)) {
            const metaBox = new THREE.Box3(minV, maxV);
            pco.userData._tightLocalBox = metaBox;
            return metaBox;
          }
        }
      }
    }

    return pco.userData._tightLocalBox || null;
  }

  computePercentileElevationRange(pco, lowerPct = 0.015, upperPct = 0.985) {
    if (!pco) return null;

    pco.updateMatrixWorld(true);

    // 1. Collect world Y coordinates from loaded nodes (root node contains a uniform spatial subsample)
    const yVals = [];
    const nodes = [];
    if (pco.root) {
      nodes.push(pco.root);
    } else if (pco.pcoGeometry && pco.pcoGeometry.root && pco.pcoGeometry.root.geometry) {
      nodes.push(pco.pcoGeometry.root);
    }
    if (Array.isArray(pco.visibleNodes) && pco.visibleNodes.length > 0) {
      for (const vn of pco.visibleNodes) {
        if (vn && !nodes.includes(vn)) {
          nodes.push(vn);
        }
      }
    }

    for (const node of nodes) {
      const geo = node.geometry || (node.geometryNode && node.geometryNode.geometry);
      if (!geo || !geo.attributes || !geo.attributes.position) continue;
      const pos = geo.attributes.position;
      const count = pos.count || (pos.array ? Math.floor(pos.array.length / 3) : 0);
      const arr = pos.array;
      if (!arr) continue;

      let m = null;
      const sceneNode = node.sceneNode || (pco.root && pco.root.sceneNode);
      if (sceneNode) {
        sceneNode.updateMatrixWorld(true);
        m = sceneNode.matrixWorld.elements;
      } else {
        m = pco.matrixWorld.elements;
      }

      // Stride to sample up to ~30,000 points in milliseconds
      const stride = count > 30000 ? Math.ceil(count / 30000) : 1;
      for (let i = 0; i < count; i += stride) {
        const x = arr[i * 3];
        const y = arr[i * 3 + 1];
        const z = arr[i * 3 + 2];
        const worldY = m[1] * x + m[5] * y + m[9] * z + m[13];
        if (Number.isFinite(worldY)) {
          yVals.push(worldY);
        }
      }
    }

    if (yVals.length >= 20) {
      yVals.sort((a, b) => a - b);
      const lowIdx = Math.floor(yVals.length * lowerPct);
      const highIdx = Math.min(yVals.length - 1, Math.floor(yVals.length * upperPct));
      let pLow = yVals[lowIdx];
      let pHigh = yVals[highIdx];
      if (pHigh <= pLow + 0.001) pHigh = pLow + 1.0;
      return [pLow, pHigh];
    }

    // 2. Fallback: world bounding box
    const worldBox = this.getWorldBoundingBox(pco);
    if (worldBox) {
      let minY = worldBox.min.y;
      let maxY = worldBox.max.y;
      if (maxY > minY) return [minY, maxY];
    }

    return [0, 100];
  }

  configureMaterial(pco) {
    if (!pco || !pco.material) return;
    const mat = pco.material;
    const settings = this.getPointCloudSettings(pco);

    // Detect if RGB attribute exists
    const hasRgb = (
      (pco.pcoGeometry && pco.pcoGeometry.pointAttributes && pco.pcoGeometry.pointAttributes.attributes &&
       pco.pcoGeometry.pointAttributes.attributes.some(a => {
         const n = (a.name || '').toLowerCase();
         return n === 'rgb' || n === 'rgba' || n === 'color' || n === 'color_packed';
       })) ||
      (pco.pcoGeometry && pco.pcoGeometry.loader && pco.pcoGeometry.loader.metadata && pco.pcoGeometry.loader.metadata.attributes &&
       pco.pcoGeometry.loader.metadata.attributes.some(a => {
         const n = (a.name || '').toLowerCase();
         return n === 'rgb' || n === 'rgba' || n === 'color' || n === 'color_packed';
       }))
    );

    if (hasRgb) {
      settings.pointColorType = window.PotreeCore ? window.PotreeCore.PointColorType.RGB : 0;
    } else {
      settings.pointColorType = window.PotreeCore ? window.PotreeCore.PointColorType.ELEVATION : 3;
    }

    mat.size = settings.pointSize;
    mat.pointSizeType = settings.pointSizeType;
    mat.pointColorType = settings.pointColorType;
    mat.opacity = settings.opacity;
    mat.transparent = settings.opacity < 0.999;

    // Ensure RAINBOW visible spectrum gradient (Purple/Blue -> Cyan/Green/Yellow -> Orange/Red)
    if (window.PotreeCore && window.PotreeCore.RAINBOW) {
      mat.gradient = window.PotreeCore.RAINBOW;
    }

    // Set initial elevation range
    const elevRange = this.computePercentileElevationRange(pco);
    if (elevRange) {
      mat.elevationRange = elevRange;
      pco.userData._percentileElevationRange = elevRange;
    }

    // Set intensity range from metadata if available
    let intMin = 0;
    let intMax = 65535;
    if (pco.pcoGeometry && pco.pcoGeometry.loader && pco.pcoGeometry.loader.metadata) {
      const attrs = pco.pcoGeometry.loader.metadata.attributes || [];
      const intAttr = attrs.find(a => a.name === 'intensity');
      if (intAttr && Array.isArray(intAttr.max) && intAttr.max[0] > 0) {
        intMin = (intAttr.min && intAttr.min[0] !== undefined) ? intAttr.min[0] : 0;
        intMax = intAttr.max[0];
      }
    }
    mat.intensityRange = [intMin, intMax];

    if (mat.uniforms) {
      if (!mat.uniforms.clipEdgeThreshold) {
        mat.uniforms.clipEdgeThreshold = { type: 'f', value: this.clipEdgeThreshold || 0.010 };
      } else {
        mat.uniforms.clipEdgeThreshold.value = this.clipEdgeThreshold || 0.010;
      }
    }
  }

  update(camera, renderer) {
    if (!this.potree || this.pointClouds.length === 0) return;
    try {
      // Calculate total point budget across all clouds for LRU cache so clouds don't evict each other
      let totalBudget = 0;
      for (const pco of this.pointClouds) {
        const s = this.getPointCloudSettings(pco);
        totalBudget += (s.pointBudget || 2000000);
      }
      if (this.potree.lru) {
        this.potree.lru.pointBudget = Math.max(totalBudget, 1000000);
      }

      let hasLoading = false;
      for (const pco of this.pointClouds) {
        const s = this.getPointCloudSettings(pco);
        this.potree._pointBudget = s.pointBudget || 2000000;
        const res = this.potree.updatePointClouds([pco], camera, renderer);
        if (res && res.nodeLoadPromises && res.nodeLoadPromises.length > 0) {
          hasLoading = true;
        }
      }
      if (this.potree.numNodesLoading > 0) {
        hasLoading = true;
      }

      // Dynamically compute tight bounding box & percentile elevation range as soon as root node geometry is loaded
      for (const pco of this.pointClouds) {
        if (pco && pco.pcoGeometry && pco.pcoGeometry.root && pco.pcoGeometry.root.loaded && pco.pcoGeometry.root.geometry) {
          if (!pco.userData._percentileComputed) {
            const range = this.computePercentileElevationRange(pco);
            if (range) {
              pco.userData._percentileElevationRange = range;
              pco.userData._percentileComputed = true;
              if (pco.material) {
                pco.material.elevationRange = range;
              }
            }
          }
          if (!pco.userData._tightBoxFromGeometry) {
            this.computeTightLocalBoundingBox(pco);
            if (this.app && typeof this.app.updateClippingBounds === 'function') {
              this.app.updateClippingBounds(true);
            }
            if (pco.userData._pendingInitialFit) {
              pco.userData._pendingInitialFit = false;
              this.fitPointCloudView(pco, true);
            } else if (this.activePointCloud === pco && this.isPointCloudSelected) {
              this.renderInspectorCard();
            }
          }
        }
      }

      if (hasLoading) {
        if (this.app._wakeRender) this.app._wakeRender(600);
      }
    } catch (e) {
      // Catch any frame-rate worker synchronization glitches silently
    }
  }

  syncClippingWithApp() {
    if (!this.app || !this.app.clippingEngine) return;
    const clippingPlanes = this.app.clippingEngine.clippingPlanes || [];
    this.updateClipping(clippingPlanes);
  }

  updateClipping(planes) {
    const ClipMode = window.PotreeCore ? window.PotreeCore.ClipMode : { DISABLED: 0, CLIP_OUTSIDE: 1, HIGHLIGHT_INSIDE: 2 };
    const activePlanes = (planes && planes.length > 0) ? planes.map(p => p.clone()) : [];
    for (const pco of this.pointClouds) {
      if (pco && pco.material) {
        pco.material.clippingPlanes = activePlanes;
        if (typeof pco.material.syncClippingPlanes === 'function') {
          pco.material.syncClippingPlanes();
        }
        if (typeof pco.material.clipMode !== 'undefined') {
          pco.material.clipMode = activePlanes.length > 0 ? ClipMode.CLIP_OUTSIDE : ClipMode.DISABLED;
        }
        if (pco.material.uniforms) {
          if (!pco.material.uniforms.clipEdgeThreshold) {
            pco.material.uniforms.clipEdgeThreshold = { type: 'f', value: this.clipEdgeThreshold || 0.010 };
          } else {
            pco.material.uniforms.clipEdgeThreshold.value = this.clipEdgeThreshold || 0.010;
          }
        }
        if (typeof pco.material.syncClippingPlanes === 'function') {
          pco.material.syncClippingPlanes();
        }
        pco.material.needsUpdate = true;
      }
    }
    if (this.app) {
      this.app.needsRender = true;
      if (this.app._wakeRender) {
        this.app._wakeRender(300);
      }
    }
  }

  getWorldBoundingBox(pco = this.activePointCloud) {
    if (!pco) return null;
    pco.updateMatrixWorld(true);

    if (!pco.userData || !pco.userData._tightBoxFromGeometry) {
      this.computeTightLocalBoundingBox(pco);
    }

    let box = null;
    if (pco.userData && pco.userData._tightLocalBox) {
      box = pco.userData._tightLocalBox.clone();
    } else if (pco.pcoGeometry && pco.pcoGeometry.boundingBox) {
      box = pco.pcoGeometry.boundingBox.clone();
    } else if (pco.boundingBox) {
      box = pco.boundingBox.clone();
    }
    if (!box) return null;
    box.applyMatrix4(pco.matrixWorld);

    // Always clamp world Y (elevation) to the 1.5%-98.5% percentile elevation range when available to exclude octree cube padding and floating noise points
    if (pco.userData && Array.isArray(pco.userData._percentileElevationRange)) {
      const [pLow, pHigh] = pco.userData._percentileElevationRange;
      if (Number.isFinite(pLow) && Number.isFinite(pHigh) && pHigh > pLow) {
        box.min.y = pLow;
        box.max.y = pHigh;
      }
    }

    return box;
  }

  fitPointCloudView(pco = this.activePointCloud, immediate = false) {
    if (!pco || !this.app || !this.app.camera) return;
    this.activePointCloud = pco;
    this.isPointCloudSelected = true;
    if (this.app && typeof this.app.clearSelection === 'function') {
      this.app.clearSelection(true);
    }

    const box = this.getWorldBoundingBox(pco);
    if (!box) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 5.0);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 2.5);

    const fov = ((this.app.perspectiveCamera ? this.app.perspectiveCamera.fov : (this.app.camera.fov || 45))) * (Math.PI / 180);
    const aspect = (this.app.camera.aspect || (this.app.canvas ? this.app.canvas.clientWidth / Math.max(1, this.app.canvas.clientHeight) : 1.0)) || 1.0;
    const minAspect = Math.min(1.0, aspect);
    const cameraDist = Math.max((radius * 1.02) / (Math.tan(fov / 2) * minAspect), 5.0);

    const neededFar = Math.max(this.app.camera.far || 5000, cameraDist * 4 + maxDim * 2);
    if (this.app.camera.far < neededFar) {
      if (typeof this.app.setFarClip === 'function') {
        this.app.setFarClip(neededFar, true);
      } else {
        this.app.camera.far = neededFar;
        this.app.camera.updateProjectionMatrix();
      }
    }

    const offsetDir = new THREE.Vector3(0.85, 0.65, 0.85).normalize();
    const targetCam = center.clone().addScaledVector(offsetDir, cameraDist);

    if (this.app.pivotPoint) {
      this.app.pivotPoint.copy(center);
      if (typeof this.app.showPivotIndicator === 'function') {
        this.app.showPivotIndicator(center);
      }
    }

    if (this.app.controls && this.app.controls.target) {
      this.app.controls.target.copy(center);
    }

    if (immediate || !this.app.tweenCamera) {
      this.app.camera.position.copy(targetCam);
      this.app.camera.lookAt(center);
      if (this.app.controls) this.app.controls.update();
      this.app.camera.updateMatrixWorld(true);
      if (this.app.compass3d) this.app.compass3d.update();
      if (!this.app.isNavigatingViewHistory && typeof this.app.pushViewSnapshot === 'function') {
        this.app.pushViewSnapshot();
      }
    } else {
      this.app.tweenCamera(targetCam, center);
    }

    if (this.app.syncTreeSelection) {
      this.app.syncTreeSelection();
    }
    this.renderInspectorCard();

    if (this.app._wakeRender) {
      this.app._wakeRender(1000);
    }
  }

  centerToOrigin(pco = this.activePointCloud) {
    if (!pco) return;
    const box = this.getWorldBoundingBox(pco);
    if (!box) return;

    const center = box.getCenter(new THREE.Vector3());
    if (!pco.userData._originalPosition) {
      pco.userData._originalPosition = pco.position.clone();
    }

    pco.position.sub(center);
    pco.updateMatrixWorld(true);
    pco.userData._percentileComputed = false;
    pco.userData._percentileElevationRange = null;
    this.applyMaterialSettings();
    if (this.app && typeof this.app.updateClippingBounds === 'function') {
      this.app.updateClippingBounds(true);
    }

    this.fitPointCloudView(pco);
    this.renderInspectorCard();

    if (this.app.showToast) {
      const msg = window.I18N ? window.I18N.t('pointCloudCenteredToast') : 'Point cloud centered to [0, 0, 0]';
      this.app.showToast(msg, 3500);
    }
  }

  restoreOriginalCoordinates(pco = this.activePointCloud) {
    if (!pco || !pco.userData._originalPosition) return;
    pco.position.copy(pco.userData._originalPosition);
    pco.updateMatrixWorld(true);
    pco.userData._percentileComputed = false;
    pco.userData._percentileElevationRange = null;
    this.applyMaterialSettings();
    if (this.app && typeof this.app.updateClippingBounds === 'function') {
      this.app.updateClippingBounds(true);
    }

    this.fitPointCloudView(pco);
    this.renderInspectorCard();

    if (this.app.showToast) {
      const msg = window.I18N ? window.I18N.t('pointCloudRestoredToast') : 'Original coordinates restored';
      this.app.showToast(msg, 3500);
    }
  }

  isPointClipped(worldPt) {
    if (!this.app || !this.app.clippingEngine || !this.app.clippingEngine.enabled) return false;
    const planes = this.app.clippingEngine.clippingPlanes;
    if (!planes || planes.length === 0) return false;
    for (let i = 0; i < planes.length; i++) {
      if (planes[i].distanceToPoint(worldPt) < -1e-3) return true;
    }
    return false;
  }

  // --- SNAPPING & RAYCASTING ---
  raycast(raycaster, screenThreshold = 15, allowBoxFallback = false) {
    if (!raycaster || this.pointClouds.length === 0 || !this.app || !this.app.camera) {
      return null;
    }

    const visiblePcos = this.pointClouds.filter(p => p && p.visible);
    if (visiblePcos.length === 0) return null;

    // 1. Try GPU octree picker first
    if (this.picker && this.app.renderer) {
      try {
        const hit = this.picker.pick(
          this.app.renderer,
          this.app.camera,
          raycaster.ray,
          visiblePcos,
          { pickWindowSize: screenThreshold, pickClipped: false }
        );

        if (hit && hit.position && !this.isPointClipped(hit.position)) {
          return {
            point: hit.position.clone(),
            normal: (hit.normal && hit.normal.isVector3) ? hit.normal.clone() : new THREE.Vector3(0, 1, 0),
            distance: this.app.camera.position.distanceTo(hit.position),
            pointCloud: hit.pointCloud || hit.pointcloud || (visiblePcos.length === 1 ? visiblePcos[0] : null),
            index: hit.pointIndex
          };
        }
      } catch (e) {
        // Fallback to CPU octree point raycast
      }
    }

    // 2. Fast CPU ray-to-octree-points fallback (handles sparse gaps and headless WebGL reliably)
    const camPos = this.app.camera.position;
    let bestPt = null;
    let bestPco = null;
    let bestScore = Infinity;
    const tmpLocal = new THREE.Vector3();
    const tmpWorld = new THREE.Vector3();

    for (const pco of visiblePcos) {
      pco.updateMatrixWorld(true);
      const rootNode = (pco.pcoGeometry && pco.pcoGeometry.root) || pco.root;
      const candidateNodes = [];
      if (Array.isArray(pco.visibleNodes) && pco.visibleNodes.length > 0) {
        for (const vn of pco.visibleNodes) {
          if (vn) candidateNodes.push(vn);
        }
      }
      if (rootNode && !candidateNodes.includes(rootNode)) {
        candidateNodes.push(rootNode);
      }

      for (const node of candidateNodes) {
        const geo = node.geometry || (node.geometryNode && node.geometryNode.geometry);
        if (!geo || !geo.attributes || !geo.attributes.position || !geo.attributes.position.array) continue;
        const pos = geo.attributes.position;
        const count = pos.count || Math.floor(pos.array.length / 3);
        if (count <= 0) continue;
        const arr = pos.array;
        const nodeMin = (node.boundingBox && node.boundingBox.min) ? node.boundingBox.min : { x: 0, y: 0, z: 0 };
        const stride = count > 4000 ? Math.ceil(count / 4000) : 1;

        for (let i = 0; i < count; i += stride) {
          tmpLocal.set(
            arr[i * 3] + nodeMin.x,
            arr[i * 3 + 1] + nodeMin.y,
            arr[i * 3 + 2] + nodeMin.z
          );
          tmpWorld.copy(tmpLocal).applyMatrix4(pco.matrixWorld);
          if (this.isPointClipped(tmpWorld)) continue;

          const camDist = camPos.distanceTo(tmpWorld);
          if (camDist <= 0.05) continue;
          const perpSq = raycaster.ray.distanceSqToPoint(tmpWorld);
          const maxPerp = Math.max(0.35, camDist * (allowBoxFallback ? 0.08 : 0.032));
          if (perpSq <= maxPerp * maxPerp) {
            const score = Math.sqrt(perpSq) + camDist * 0.002;
            if (score < bestScore) {
              bestScore = score;
              bestPt = tmpWorld.clone();
              bestPco = pco;
            }
          }
        }
      }
    }

    if (bestPt) {
      return {
        point: bestPt,
        normal: new THREE.Vector3(0, 1, 0),
        distance: camPos.distanceTo(bestPt),
        pointCloud: bestPco,
        index: -1
      };
    }

    // 3. Bounding box intersection fallback when explicitly requested (e.g. right-click context menu on point cloud)
    if (allowBoxFallback) {
      let closestBoxHit = null;
      let closestBoxDist = Infinity;
      let closestBoxPco = null;
      const hitTarget = new THREE.Vector3();
      for (const pco of visiblePcos) {
        const wBox = this.getWorldBoundingBox(pco);
        if (!wBox || wBox.isEmpty()) continue;
        const hitPt = wBox.containsPoint(raycaster.ray.origin)
          ? wBox.getCenter(new THREE.Vector3())
          : raycaster.ray.intersectBox(wBox, hitTarget);
        if (hitPt) {
          const candidate = hitPt.clone();
          // Nudge slightly inside the box toward its center so it lies within the cloud
          const boxCenter = wBox.getCenter(new THREE.Vector3());
          candidate.lerp(boxCenter, 0.2);
          if (!this.isPointClipped(candidate)) {
            const d = camPos.distanceTo(candidate);
            if (d < closestBoxDist) {
              closestBoxDist = d;
              closestBoxHit = candidate;
              closestBoxPco = pco;
            }
          }
        }
      }
      if (closestBoxHit) {
        return {
          point: closestBoxHit,
          normal: new THREE.Vector3(0, 1, 0),
          distance: closestBoxDist,
          pointCloud: closestBoxPco,
          index: -1
        };
      }
    }

    return null;
  }

  // --- LEFT SIDEBAR MODEL HIERARCHY TREE ---
  updateModelHierarchyTree() {
    // Remove legacy DOM element if present
    const legacyEl = document.getElementById('tree-group-pointcloud');
    if (legacyEl) legacyEl.remove();

    // Rebuild or re-render unified VirtualBimTree
    if (this.app && this.app.buildHierarchyTree) {
      this.app.buildHierarchyTree();
    }
  }

  getColorModeLabel(pco = this.activePointCloud) {
    if (!pco || !pco.material) return 'RGB';
    const PointColorType = window.PotreeCore ? window.PotreeCore.PointColorType : { RGB: 0, COLOR: 1, DEPTH: 2, HEIGHT: 3, ELEVATION: 3, INTENSITY: 4, CLASSIFICATION: 5 };
    const pct = pco.material.pointColorType;
    if (pct === PointColorType.RGB || pct === 0) return 'RGB';
    if (pct === PointColorType.HEIGHT || pct === PointColorType.ELEVATION || pct === 3) return 'Elevation';
    if (pct === PointColorType.INTENSITY || pct === 4) return 'Intensity';
    if (pct === PointColorType.CLASSIFICATION || pct === 5) return 'Classification';
    return 'RGB';
  }

  toggleVisibility() {
    for (const pco of this.pointClouds) {
      pco.visible = !pco.visible;
    }
    if (this.app._wakeRender) this.app._wakeRender();
  }

  // --- RIGHT SIDEBAR INSPECTOR CARD ---
  renderInspectorCard() {
    const inspectorContainer = document.getElementById('inspector-content') || document.getElementById('sidebar-right');
    if (!inspectorContainer) return;
    const pco = this.activePointCloud;
    if (!pco) return;

    // When a point cloud is actively selected, show its inspector card cleanly without leftover element/model panels
    if (this.isPointCloudSelected) {
      Array.from(inspectorContainer.children).forEach(ch => {
        if (ch.id !== 'pointcloud-inspector-card') ch.remove();
      });
    }

    let card = document.getElementById('pointcloud-inspector-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'pointcloud-inspector-card';
      card.className = 'inspector-card pointcloud-card';
      const firstSection = inspectorContainer.querySelector('.inspector-section') || inspectorContainer.firstChild;
      if (firstSection) {
        inspectorContainer.insertBefore(card, firstSection);
      } else {
        inspectorContainer.appendChild(card);
      }
    }
    card.style.display = 'block';

    const isZh = (window.I18N ? window.I18N.currentLang : 'zh') === 'zh';
    const numPoints = this.getPointCloudPointCount(pco);
    const settings = this.getPointCloudSettings(pco);
    const pcName = pco.name || 'Point Cloud';

    let centerStr = '-';
    let sizeStr = '-';
    const box = this.getWorldBoundingBox(pco);
    if (box) {
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      centerStr = `X: ${c.x.toFixed(1)}, Y: ${(-c.z).toFixed(1)}, RL: ${c.y.toFixed(1)}`;
      sizeStr = `ΔX: ${s.x.toFixed(1)}m, ΔY: ${s.z.toFixed(1)}m, ΔRL: ${s.y.toFixed(1)}m`;
    }

    const hasOriginalPos = Boolean(pco.userData && pco.userData._originalPosition);
    const isZUp = Boolean(pco.userData && pco.userData._isZUp);
    const coordMapping = (pco.userData && pco.userData.coordinateMapping) || 'auto';

    card.innerHTML = `
      <div class="inspector-card-header" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:15px;">☁️</span>
          <span style="font-weight:700; font-size:13px; color:var(--accent); text-transform:uppercase; letter-spacing:0.5px;">${isZh ? '点云属性与渲染控制' : 'Point Cloud Properties'}</span>
        </div>
        <span style="font-size:11px; color:var(--text-secondary); font-family:var(--font-mono);">${((numPoints || 0)).toLocaleString()} pts</span>
      </div>
      <div style="font-size:12px; font-weight:600; color:var(--text-bright); margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${pcName}">
        📄 ${pcName}
      </div>

      <!-- Quick Action Buttons: Zoom & Center to Origin -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:12px;">
        <button type="button" id="btn-pc-zoom-fit" style="padding:6px 8px; font-size:11.5px; font-weight:700; background:var(--accent); color:#000; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>🎯</span> ${isZh ? '聚焦定位点云' : 'Zoom to Points'}
        </button>
        <button type="button" id="btn-pc-center-origin" style="padding:6px 8px; font-size:11.5px; font-weight:600; background:rgba(56,189,248,0.12); color:var(--accent); border:1px solid rgba(56,189,248,0.35); border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>${hasOriginalPos ? '↺' : '📍'}</span> ${hasOriginalPos ? (isZh ? '恢复原始坐标' : 'Restore Coords') : (isZh ? '移至原点居中' : 'Center to [0,0,0]')}
        </button>
      </div>

      <!-- Spatial Coordinate Readout Box -->
      <div style="background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; margin-bottom:12px; font-size:11px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
          <span style="color:var(--text-muted);">${isZh ? '空间中心' : 'Center'}:</span>
          <span style="font-family:var(--font-mono); color:var(--text-primary); font-weight:600;">${centerStr}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-muted);">${isZh ? '包围盒跨度' : 'Extents'}:</span>
          <span style="font-family:var(--font-mono); color:var(--text-secondary);">${sizeStr}</span>
        </div>
      </div>

      <!-- Cut Edge Red Line Slider -->
      <div class="pc-control-row" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
          <span>${isZh ? '剖切断面红线 (Cut Edge)' : 'Cut Edge Red Line'}</span>
          <span id="pc-val-cutedge" style="font-family:var(--font-mono); color:#ff3333; font-weight:700;">${this.clipEdgeThreshold > 0 ? (this.clipEdgeThreshold * 100).toFixed(1) + ' cm' : (isZh ? '关闭' : 'Off')}</span>
        </div>
        <input type="range" id="pc-slider-cutedge" min="0" max="0.10" step="0.005" value="${this.clipEdgeThreshold}" style="width:100%;">
      </div>

      <!-- Point Size Slider -->
      <div class="pc-control-row" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
          <span>${isZh ? '点尺寸 (Point Size)' : 'Point Size'}</span>
          <span id="pc-val-size" style="font-family:var(--font-mono); color:var(--accent); font-weight:700;">${settings.pointSize.toFixed(1)} px</span>
        </div>
        <input type="range" id="pc-slider-size" min="0.2" max="4.0" step="0.1" value="${settings.pointSize}" style="width:100%;">
      </div>

      <!-- Point Budget Stepped Slider -->
      <div class="pc-control-row" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
          <span>${isZh ? '点云预算 / 密度 (Budget)' : 'Point Budget'}</span>
          <span id="pc-val-budget" style="font-family:var(--font-mono); color:var(--accent); font-weight:700;">${this.getBudgetDisplay(settings.pointBudget)}</span>
        </div>
        <div class="pc-budget-slider-wrap" style="position:relative; padding:0 1px;">
          <input type="range" id="pc-slider-budget" min="0" max="3" step="1" value="${this.budgetToTierIndex(settings.pointBudget)}" style="width:100%; cursor:pointer;">
          <div class="pc-budget-ticks" id="pc-budget-ticks">
            <span class="pc-budget-tick ${this.budgetToTierIndex(settings.pointBudget) === 0 ? 'active' : ''}" data-tier="0">1M</span>
            <span class="pc-budget-tick ${this.budgetToTierIndex(settings.pointBudget) === 1 ? 'active' : ''}" data-tier="1">2M</span>
            <span class="pc-budget-tick ${this.budgetToTierIndex(settings.pointBudget) === 2 ? 'active' : ''}" data-tier="2">5M</span>
            <span class="pc-budget-tick ${this.budgetToTierIndex(settings.pointBudget) === 3 ? 'active' : ''}" data-tier="3">10M</span>
          </div>
        </div>
      </div>

      <!-- Color Mode Selector -->
      <div class="pc-control-row" style="margin-bottom:10px;">
        <div style="font-size:11.5px; margin-bottom:5px;">${isZh ? '着色模式 (Color Mode)' : 'Color Mode'}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px;">
          <button type="button" class="pc-color-btn ${settings.pointColorType === 0 ? 'active' : ''}" data-color="0" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '🎨 真彩色' : 'RGB'}
          </button>
          <button type="button" class="pc-color-btn ${settings.pointColorType === 3 ? 'active' : ''}" data-color="3" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '🌈 高程' : 'Elevation'}
          </button>
          <button type="button" class="pc-color-btn ${settings.pointColorType === 4 ? 'active' : ''}" data-color="4" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '💡 强度' : 'Intensity'}
          </button>
        </div>
      </div>

      <!-- Opacity Slider -->
      <div class="pc-control-row" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
          <span>${isZh ? '点云不透明度 (Opacity)' : 'Opacity'}</span>
          <span id="pc-val-opacity" style="font-family:var(--font-mono); color:var(--accent); font-weight:700;">${Math.round(settings.opacity * 100)}%</span>
        </div>
        <input type="range" id="pc-slider-opacity" min="0.1" max="1.0" step="0.05" value="${settings.opacity}" style="width:100%;">
      </div>

      <!-- Orientation (Up Axis) -->
      <div class="pc-control-row" style="margin-bottom:12px;">
        <div style="font-size:11.5px; margin-bottom:5px;">${isZh ? '高程轴向 (Up Axis)' : 'Elevation Up Axis'}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <button type="button" id="btn-pc-axis-z" class="pc-axis-btn ${isZUp ? 'active' : ''}" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '🔼 Z-Up (测量标准)' : '🔼 Z-Up (Default)'}
          </button>
          <button type="button" id="btn-pc-axis-y" class="pc-axis-btn ${!isZUp ? 'active' : ''}" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '🔄 Y-Up (原始直立)' : '🔄 Y-Up'}
          </button>
        </div>
      </div>

      <!-- Coordinate Mapping (大地测绘坐标映射) -->
      <div class="pc-control-row" style="margin-bottom:12px;">
        <div style="font-size:11.5px; margin-bottom:5px;">${isZh ? '坐标映射 (Coordinate Mapping)' : 'Coordinate Mapping'}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <button type="button" id="btn-pc-map-auto" class="pc-map-btn ${(!coordMapping || coordMapping === 'auto') ? 'active' : ''}" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '✨ 智能大地映射' : '✨ Auto Geodetic'}
          </button>
          <button type="button" id="btn-pc-map-swap" class="pc-map-btn ${coordMapping === 'swap_yz' ? 'active' : ''}" style="padding:4px 6px; font-size:11px; border-radius:4px; cursor:pointer;">
            ${isZh ? '🔀 互换 Y ⇄ Z' : '🔀 Swap Y ⇄ Z'}
          </button>
        </div>
      </div>
    `;

    // Hook events (bound to the currently active point cloud pco)
    const sliderCutEdge = card.querySelector('#pc-slider-cutedge');
    const valCutEdge = card.querySelector('#pc-val-cutedge');
    if (sliderCutEdge) {
      sliderCutEdge.addEventListener('input', (e) => {
        this.clipEdgeThreshold = parseFloat(e.target.value);
        if (valCutEdge) {
          valCutEdge.textContent = this.clipEdgeThreshold > 0 ? `${(this.clipEdgeThreshold * 100).toFixed(1)} cm` : (isZh ? '关闭' : 'Off');
        }
        this.syncClippingWithApp();
      });
    }

    const sliderSize = card.querySelector('#pc-slider-size');
    const valSize = card.querySelector('#pc-val-size');
    if (sliderSize) {
      sliderSize.addEventListener('input', (e) => {
        const s = this.getPointCloudSettings(pco);
        s.pointSize = parseFloat(e.target.value);
        if (valSize) valSize.textContent = `${s.pointSize.toFixed(1)} px`;
        this.applyMaterialSettings(pco);
      });
    }

    const sliderBudget = card.querySelector('#pc-slider-budget');
    const valBudget = card.querySelector('#pc-val-budget');
    const budgetTicks = card.querySelectorAll('.pc-budget-tick');

    const setBudgetTier = (tierIdx) => {
      const idx = Math.max(0, Math.min(3, parseInt(tierIdx, 10) || 0));
      if (sliderBudget) sliderBudget.value = idx;
      const s = this.getPointCloudSettings(pco);
      s.pointBudget = PC_BUDGET_TIERS[idx];
      if (valBudget) valBudget.textContent = `${PC_BUDGET_LABELS[idx]} pts`;
      budgetTicks.forEach(tick => {
        const t = parseInt(tick.getAttribute('data-tier'), 10);
        tick.classList.toggle('active', t === idx);
      });
      if (this.app._wakeRender) this.app._wakeRender(300);
    };

    if (sliderBudget) {
      sliderBudget.addEventListener('input', (e) => {
        setBudgetTier(e.target.value);
      });
    }

    budgetTicks.forEach(tick => {
      tick.addEventListener('click', (e) => {
        e.stopPropagation();
        const tier = tick.getAttribute('data-tier');
        setBudgetTier(tier);
      });
    });

    const colorBtns = card.querySelectorAll('.pc-color-btn');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const s = this.getPointCloudSettings(pco);
        s.pointColorType = parseInt(btn.getAttribute('data-color'), 10);
        this.applyMaterialSettings(pco);
      });
    });

    const sliderOpacity = card.querySelector('#pc-slider-opacity');
    const valOpacity = card.querySelector('#pc-val-opacity');
    if (sliderOpacity) {
      sliderOpacity.addEventListener('input', (e) => {
        const s = this.getPointCloudSettings(pco);
        s.opacity = parseFloat(e.target.value);
        if (valOpacity) valOpacity.textContent = `${Math.round(s.opacity * 100)}%`;
        this.applyMaterialSettings(pco);
      });
    }

    const btnZoomFit = card.querySelector('#btn-pc-zoom-fit');
    if (btnZoomFit) {
      btnZoomFit.addEventListener('click', () => this.fitPointCloudView(pco));
    }

    const btnCenter = card.querySelector('#btn-pc-center-origin');
    if (btnCenter) {
      btnCenter.addEventListener('click', () => {
        if (hasOriginalPos) {
          this.restoreOriginalCoordinates(pco);
        } else {
          this.centerToOrigin(pco);
        }
      });
    }

    const btnAxisZ = card.querySelector('#btn-pc-axis-z');
    const btnAxisY = card.querySelector('#btn-pc-axis-y');
    if (btnAxisZ && btnAxisY) {
      btnAxisZ.addEventListener('click', () => {
        if (!pco.userData._isZUp) {
          this.toggleOrientation(pco);
        }
      });
      btnAxisY.addEventListener('click', () => {
        if (pco.userData._isZUp) {
          this.toggleOrientation(pco);
        }
      });
    }

    const btnMapAuto = card.querySelector('#btn-pc-map-auto');
    const btnMapSwap = card.querySelector('#btn-pc-map-swap');
    if (btnMapAuto && btnMapSwap) {
      btnMapAuto.addEventListener('click', () => {
        pco.userData.coordinateMapping = 'auto';
        this.renderInspectorCard();
        if (this.app.renderMeasurementResults) this.app.renderMeasurementResults();
        if (this.app.updateMeasureMarkersAndCallouts) this.app.updateMeasureMarkersAndCallouts();
        if (this.app._wakeRender) this.app._wakeRender(200);
      });
      btnMapSwap.addEventListener('click', () => {
        const cur = pco.userData.coordinateMapping;
        pco.userData.coordinateMapping = (cur === 'swap_yz') ? 'asprs' : 'swap_yz';
        this.renderInspectorCard();
        if (this.app.renderMeasurementResults) this.app.renderMeasurementResults();
        if (this.app.updateMeasureMarkersAndCallouts) this.app.updateMeasureMarkersAndCallouts();
        if (this.app._wakeRender) this.app._wakeRender(200);
      });
    }
  }

  applyMaterialSettings(targetPco = null) {
    const list = targetPco ? [targetPco] : this.pointClouds;
    for (const pco of list) {
      if (pco && pco.material) {
        const s = this.getPointCloudSettings(pco);
        pco.material.size = s.pointSize;
        pco.material.pointColorType = s.pointColorType;

        // Ensure RAINBOW visible spectrum gradient
        if (window.PotreeCore && window.PotreeCore.RAINBOW) {
          pco.material.gradient = window.PotreeCore.RAINBOW;
        }

        // Apply 1.5% - 98.5% percentile elevation range
        let elevRange = pco.userData._percentileElevationRange;
        if (!elevRange || !pco.userData._percentileComputed) {
          elevRange = this.computePercentileElevationRange(pco);
          if (elevRange) {
            pco.userData._percentileElevationRange = elevRange;
            if (pco.pcoGeometry && pco.pcoGeometry.root && pco.pcoGeometry.root.geometry) {
              pco.userData._percentileComputed = true;
            }
          }
        }
        if (elevRange) {
          pco.material.elevationRange = elevRange;
        }

        let intMin = 0;
        let intMax = 65535;
        if (pco.pcoGeometry && pco.pcoGeometry.loader && pco.pcoGeometry.loader.metadata) {
          const attrs = pco.pcoGeometry.loader.metadata.attributes || [];
          const intAttr = attrs.find(a => a.name === 'intensity');
          if (intAttr && Array.isArray(intAttr.max) && intAttr.max[0] > 0) {
            intMin = (intAttr.min && intAttr.min[0] !== undefined) ? intAttr.min[0] : 0;
            intMax = intAttr.max[0];
          }
        }
        pco.material.intensityRange = [intMin, intMax];

        pco.material.opacity = s.opacity;
        pco.material.transparent = s.opacity < 0.999;
        if (pco.material.uniforms && pco.material.uniforms.clipEdgeThreshold) {
          pco.material.uniforms.clipEdgeThreshold.value = this.clipEdgeThreshold || 0.010;
        }
      }
    }
    if (this.app._wakeRender) {
      this.app._wakeRender(300);
    }
  }

  // --- MISSING OCTREE.BIN GUIDANCE MODAL ---
  showMissingBinModal(isAppend = false) {
    let modal = document.getElementById('missing-bin-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'missing-bin-modal';
      modal.className = 'las-converter-modal-overlay';
      document.body.appendChild(modal);
    }

    const isZh = (window.I18N ? window.I18N.currentLang : 'zh') === 'zh';

    modal.innerHTML = `
      <div class="las-modal-card">
        <div class="las-modal-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">⚠️</span>
            <div>
              <div class="las-modal-title">${isZh ? '缺少完整的点云数据文件 (metadata.json + octree.bin)' : 'Incomplete Point Cloud Files (metadata.json + octree.bin)'}</div>
              <div class="las-modal-subtitle">${isZh ? '仅检测到部分点云文件，需同时提供描述文件与二进制分块' : 'Only partial point cloud files were selected or dropped'}</div>
            </div>
          </div>
          <button type="button" class="las-modal-close" id="btn-close-missing-bin">✕</button>
        </div>

        <div class="las-modal-body">
          <div style="background:rgba(234,179,8,0.12); border:1px solid rgba(234,179,8,0.35); border-radius:8px; padding:12px; margin-bottom:14px; font-size:12.5px; line-height:1.6; color:var(--text-primary);">
            ${isZh
              ? '您刚才仅选择或拖入了部分点云文件。<br>受现代浏览器<strong>安全沙箱隔离限制</strong>，网页端无法自动读取您磁盘同目录下的其他配套文件（需包含 <code>metadata.json</code>、<code>octree.bin</code> 与 <code>hierarchy.bin</code>）。'
              : 'You only selected or dropped partial point cloud files.<br>Due to browser security sandbox restrictions, a web page cannot automatically read sibling files (<code>metadata.json</code>, <code>octree.bin</code>, and <code>hierarchy.bin</code>) from your local drive.'}
          </div>

          <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:var(--accent);">
            💡 ${isZh ? '请采用以下任意一种方式查看：' : 'Please use any of the following methods to view:'}
          </div>

          <div class="las-steps-container">
            <div class="las-step-item">
              <div class="las-step-num">1</div>
              <div class="las-step-content">
                <div class="las-step-title">${isZh ? '直接选择或拖入整个点云文件夹 (推荐)' : 'Select or drop the entire folder (Recommended)'}</div>
                <div class="las-step-desc">${isZh ? '点击下方「直接选择点云文件夹」按钮，或将 Las2Web 生成的整个文件夹直接拖入视口。' : 'Click "Select Point Cloud Folder" below, or drag the entire Potree folder directly into the viewport.'}</div>
              </div>
            </div>

            <div class="las-step-item">
              <div class="las-step-num">2</div>
              <div class="las-step-content">
                <div class="las-step-title">${isZh ? '多选文件同时打开或拖入' : 'Select all 3 files together'}</div>
                <div class="las-step-desc">${isZh ? '在文件夹内按 <code>Ctrl+A</code> 同时选中 <code>metadata.json</code>、<code>octree.bin</code>、<code>hierarchy.bin</code> 一并打开或拖入。' : 'Select metadata.json, octree.bin, and hierarchy.bin together when opening or dropping.'}</div>
              </div>
            </div>

            <div class="las-step-item">
              <div class="las-step-num">3</div>
              <div class="las-step-content">
                <div class="las-step-title">${isZh ? '通过 Las2Web 本地服务自动打开' : 'Auto-view via Las2Web local server'}</div>
                <div class="las-step-desc">${isZh ? '在 Las2Web 转换完成后直接点击「查看点云」，自动通过本地 HTTP 流式秒开。' : 'Click "View Point Cloud" in Las2Web to stream smoothly from local HTTP server.'}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="las-modal-footer" style="display:flex; gap:10px;">
          <button type="button" class="las-btn-download" id="btn-select-folder-missing-bin" style="flex:1.5; text-align:center; cursor:pointer;">
            📁 ${isZh ? '直接选择点云文件夹...' : 'Select Point Cloud Folder...'}
          </button>
          <button type="button" class="las-btn-dismiss" id="btn-dismiss-missing-bin" style="flex:1; text-align:center; cursor:pointer;">
            ${isZh ? '我知道了' : 'Got it'}
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.classList.add('visible');

    const closeBtn = modal.querySelector('#btn-close-missing-bin');
    const dismissBtn = modal.querySelector('#btn-dismiss-missing-bin');
    const selectFolderBtn = modal.querySelector('#btn-select-folder-missing-bin');
    const hide = () => {
      modal.classList.remove('visible');
      setTimeout(() => { modal.style.display = 'none'; }, 300);
    };

    if (closeBtn) closeBtn.onclick = hide;
    if (dismissBtn) dismissBtn.onclick = hide;
    if (selectFolderBtn) {
      selectFolderBtn.onclick = () => {
        hide();
        const folderInput = document.getElementById('folder-input');
        if (folderInput) {
          if (this.app) this.app._isAppendNextFile = Boolean(isAppend);
          folderInput.click();
        }
      };
    }
    modal.onclick = (e) => {
      if (e.target === modal) hide();
    };
  }

  // --- LAS/LAZ PREPROCESSING GUIDANCE MODAL ---
  showLasConverterModal(fileName = '') {
    let modal = document.getElementById('las-converter-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'las-converter-modal';
      modal.className = 'las-converter-modal-overlay';
      document.body.appendChild(modal);
    }

    const isZh = (window.I18N ? window.I18N.currentLang : 'zh') === 'zh';
    const releaseUrl = 'https://github.com/wwbim/Las2Web/releases/latest';

    modal.innerHTML = `
      <div class="las-modal-card">
        <div class="las-modal-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">☁️</span>
            <div>
              <div class="las-modal-title">${isZh ? '点云预处理向导 (Las2Web)' : 'Point Cloud Preprocessing Guide'}</div>
              <div class="las-modal-subtitle">${isZh ? '检测到原始 LAS / LAZ 激光点云文件' : 'Raw LAS / LAZ LiDAR point cloud detected'}</div>
            </div>
          </div>
          <button type="button" class="las-modal-close" id="btn-close-las-modal">✕</button>
        </div>

        <div class="las-modal-body">
          <div class="las-file-badge">
            <span style="color:var(--accent); font-weight:700;">📄 ${fileName || (isZh ? '原始点云文件' : 'Raw Point Cloud File')}</span>
            <span style="font-size:11px; opacity:0.75;">(.las / .laz)</span>
          </div>

          <div class="las-reason-box">
            <div class="las-reason-title">💡 ${isZh ? '为什么需要预处理？' : 'Why is Octree Tiling Required?'}</div>
            <div class="las-reason-desc">
              ${isZh
                ? '原始 .las/.laz 文件由海量无序散点构成（通常达数亿点），直接在浏览器中计算容易导致内存耗尽卡死。使用配套转换器 <b>Las2Web</b> 预处理为八叉树（Potree 2.x Octree），即可实现千万级点云 <b>60 FPS 流式秒级载入与平滑缩放</b>。'
                : 'Raw .las/.laz files contain millions of unindexed 3D points. Web browsers cannot directly process multi-gigabyte binary point clouds efficiently. Converting with <b>Las2Web</b> to Potree 2.x Octree format unlocks <b>60 FPS streaming and smooth LOD navigation</b>.'}
            </div>
          </div>

          <!-- 3-Step Illustrated Workflow -->
          <div class="las-steps-container">
            <div class="las-step-item">
              <div class="las-step-num">1</div>
              <div class="las-step-content">
                <div class="las-step-title">${isZh ? '下载并打开 Las2Web' : 'Download Las2Web'}</div>
                <div class="las-step-desc">${isZh ? '绿色便携版，无需 Python 或环境依赖，解压直接双击运行。' : 'Portable release, zero dependencies, runs instantly on Windows.'}</div>
              </div>
            </div>

            <div class="las-step-item">
              <div class="las-step-num">2</div>
              <div class="las-step-content">
                <div class="las-step-title">${isZh ? '拖入点云，即拖即转' : 'Drag & Drop to Convert'}</div>
                <div class="las-step-desc">${isZh ? '将 .las/.laz 直接拖入 Las2Web 窗口，全自动在同级目录生成切片文件夹。' : 'Drop your scan into Las2Web. It converts automatically in-place.'}</div>
              </div>
            </div>

            <div class="las-step-item">
              <div class="las-step-num">3</div>
              <div class="las-step-content">
                <div class="las-step-title">${isZh ? '一键唤起 BIM Scope 查看' : 'Auto-View in BIM Scope'}</div>
                <div class="las-step-desc">${isZh ? '转换完成后自动拉起本视口流畅查看，支持与 BIM 模型合模对比与测量。' : 'Auto-launches into this BIM Scope viewer for 3D inspection & measurement.'}</div>
              </div>
            </div>
          </div>

          <div class="las-tip-hint">
            💡 ${isZh ? '如果您已经转换过，请直接将生成的 <code><文件名>_potree</code> 文件夹拖入本视口即可直接加载！' : 'Tip: If you have already converted it, drag the <code><name>_potree</code> folder directly into BIM Scope!'}
          </div>
        </div>

        <div class="las-modal-footer">
          <a href="${releaseUrl}" target="_blank" rel="noopener noreferrer" class="las-btn-download" id="btn-download-las2web">
            ⬇️ ${isZh ? '从 GitHub 下载 Las2Web 便携版' : 'Download Las2Web (GitHub Release)'}
          </a>
          <button type="button" class="las-btn-dismiss" id="btn-dismiss-las-modal">
            ${isZh ? '我知道了 / 关闭' : 'Got it / Close'}
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.classList.add('visible');

    const closeBtn = modal.querySelector('#btn-close-las-modal');
    const dismissBtn = modal.querySelector('#btn-dismiss-las-modal');
    const hide = () => {
      modal.classList.remove('visible');
      setTimeout(() => { modal.style.display = 'none'; }, 300);
    };

    if (closeBtn) closeBtn.onclick = hide;
    if (dismissBtn) dismissBtn.onclick = hide;
    modal.onclick = (e) => {
      if (e.target === modal) hide();
    };
  }
}

window.BIMPointCloudManager = BIMPointCloudManager;

// Auto-patch PointCloudMaterial shader prototype if loaded
if (typeof window !== 'undefined' && window.PointCloudMaterial) {
  try {
    const tmpMgr = new BIMPointCloudManager(null);
    tmpMgr.patchPointCloudMaterialShader();
  } catch (e) {}
}
