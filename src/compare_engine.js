/**
 * BIM Scope - Model Comparison Engine (IFC & Universal 3D)
 * @author WWBIM
 * Supports dual-revision differential analysis, 4-color semantic shading,
 * transient yellow ghost mesh on geometry drift, dual-mode difference tree,
 * 3-metric interactive filter pills, unchanged opacity slider, and property diff inspector.
 */

class ModelCompareEngine {
  constructor(app) {
    this.app = app;
    this.isActive = false;

    // Files state
    this.fileNew = null; // { file: File, name: string, isCurrent: boolean, text: string, model: THREE.Group }
    this.fileOld = null; // { file: File, name: string, isCurrent: boolean, text: string, model: THREE.Group }

    // Diff results
    this.diffData = null; // { added: [], deleted: [], modified: [], unchanged: [] }
    this.origMaterials = new Map(); // mesh.id -> THREE.Material
    this.deletedGroup = null; // THREE.Group for red translucent deleted meshes
    this.activeGhostMesh = null; // Yellow translucent ghost mesh on selected modified element

    // Viewport & UI preferences
    this.unchangedOpacity = 0.30; // Default 30%
    this.activeFilter = null; // null | 'added' | 'deleted' | 'modified'
    this.treeMode = 'hierarchy'; // 'hierarchy' | 'status'

    this.initDOM();
  }

  // Initialize DOM event listeners and elements
  initDOM() {
    // 1. Navbar tool button
    const btnCompare = document.getElementById('btn-tool-compare');
    if (btnCompare) {
      btnCompare.addEventListener('click', () => {
        this.openSetupModal();
      });
    }

    // 2. Banner exit button
    const btnBannerExit = document.getElementById('btn-banner-exit-compare');
    if (btnBannerExit) {
      btnBannerExit.addEventListener('click', () => {
        this.exitCompareMode();
      });
    }

    // 3. Setup Modal Controls
    const modal = document.getElementById('compare-setup-modal');
    const btnClose = document.getElementById('btn-compare-modal-close');
    const btnCancel = document.getElementById('btn-compare-cancel');
    const btnStart = document.getElementById('btn-compare-start');
    const btnSwap = document.getElementById('btn-compare-swap');

    if (btnClose) btnClose.addEventListener('click', () => this.closeSetupModal());
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeSetupModal());
    if (btnStart) btnStart.addEventListener('click', () => this.startComparison());
    if (btnSwap) btnSwap.addEventListener('click', () => this.swapFiles());

    // File input handlers
    const inputNew = document.getElementById('input-compare-new');
    const inputOld = document.getElementById('input-compare-old');
    const zoneNew = document.getElementById('zone-compare-new');
    const zoneOld = document.getElementById('zone-compare-old');

    if (zoneNew && inputNew) {
      zoneNew.addEventListener('click', () => inputNew.click());
      inputNew.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.setFile('new', e.target.files[0]);
        }
      });
      this.setupDropZone(zoneNew, (f) => this.setFile('new', f));
    }

    if (zoneOld && inputOld) {
      zoneOld.addEventListener('click', () => inputOld.click());
      inputOld.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.setFile('old', e.target.files[0]);
        }
      });
      this.setupDropZone(zoneOld, (f) => this.setFile('old', f));
    }
  }

  setupDropZone(el, onFileDrop) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        onFileDrop(e.dataTransfer.files[0]);
      }
    });
  }

  openSetupModal() {
    const modal = document.getElementById('compare-setup-modal');
    if (!modal) return;

    // Check currently loaded model in viewport
    const curInfo = this.app.currentModelInfo;
    if (curInfo && !curInfo.isDemo && this.app.activeModel) {
      // Default left (New) to currently loaded model
      this.fileNew = {
        name: curInfo.fileName,
        isCurrent: true,
        size: curInfo.fileSize || '',
        model: this.app.activeModel
      };
    }

    this.renderZoneUI('new');
    this.renderZoneUI('old');
    this.updateStartButtonState();

    modal.classList.add('active');
  }

  closeSetupModal() {
    const modal = document.getElementById('compare-setup-modal');
    if (modal) modal.classList.remove('active');
  }

  setFile(target, file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'ifc') {
      showToast(I18N.t('compareFormatMismatch', { extA: 'ifc', extB: ext }), 'warning');
      return;
    }

    const sizeStr = file.size > 1048576 ? 
      `${(file.size / 1048576).toFixed(2)} MB` : 
      `${(file.size / 1024).toFixed(1)} KB`;

    if (target === 'new') {
      this.fileNew = {
        file: file,
        name: file.name,
        isCurrent: false,
        size: sizeStr,
        text: null,
        model: null
      };
    } else {
      this.fileOld = {
        file: file,
        name: file.name,
        isCurrent: false,
        size: sizeStr,
        text: null,
        model: null
      };
    }

    this.renderZoneUI(target);
    this.updateStartButtonState();
  }

  swapFiles() {
    const temp = this.fileNew;
    this.fileNew = this.fileOld;
    this.fileOld = temp;

    this.renderZoneUI('new');
    this.renderZoneUI('old');
    this.updateStartButtonState();
  }

  renderZoneUI(target) {
    const info = target === 'new' ? this.fileNew : this.fileOld;
    const nameEl = document.getElementById(`zone-${target}-filename`);
    const sizeEl = document.getElementById(`zone-${target}-size`);
    const hintEl = document.getElementById(`zone-${target}-hint`);
    const statusEl = document.getElementById(`zone-${target}-status`);

    if (!nameEl) return;

    if (info) {
      nameEl.textContent = info.name;
      nameEl.title = info.name;
      if (sizeEl) sizeEl.textContent = info.size || '';
      if (hintEl) hintEl.textContent = info.isCurrent ? I18N.t('compareCurrentLoaded') : '';
      if (statusEl) statusEl.textContent = '✓ Ready';
    } else {
      nameEl.textContent = I18N.t('compareSelectFilePrompt');
      nameEl.title = '';
      if (sizeEl) sizeEl.textContent = '';
      if (hintEl) hintEl.textContent = '';
      if (statusEl) statusEl.textContent = '';
    }
  }

  updateStartButtonState() {
    const btnStart = document.getElementById('btn-compare-start');
    if (!btnStart) return;
    const ready = (this.fileNew && this.fileOld);
    btnStart.disabled = !ready;
  }

  // Execute comparison loading pipeline
  async startComparison() {
    if (!this.fileNew || !this.fileOld) {
      showToast(I18N.t('compareNeedFiles'), 'warning');
      return;
    }

    this.closeSetupModal();
    this.app.showProgressModal(true);
    this.app.updateProgress(I18N.t('compareParsingModels'), 15);

    try {
      // 1. Prepare New Model
      let modelNew = null;
      if (this.fileNew.isCurrent && this.fileNew.model) {
        modelNew = this.fileNew.model;
      } else if (this.fileNew.file) {
        this.app.updateProgress(I18N.t('compareParsingModels') + ' (New)', 25);
        const textNew = await this.readFileAsText(this.fileNew.file);
        const parserNew = new IFCParser();
        modelNew = parserNew.parseText(textNew);
        // Replace active model with New Model
        this.app.clearModel();
        this.app.setModel(modelNew);
        this.fileNew.model = modelNew;
      }

      // 2. Prepare Old Model
      this.app.updateProgress(I18N.t('compareParsingModels') + ' (Old)', 55);
      let modelOld = null;
      if (this.fileOld.isCurrent && this.fileOld.model) {
        modelOld = this.fileOld.model;
      } else if (this.fileOld.file) {
        const textOld = await this.readFileAsText(this.fileOld.file);
        const parserOld = new IFCParser();
        modelOld = parserOld.parseText(textOld);
        this.fileOld.model = modelOld;
      }

      if (!modelNew || !modelOld) {
        throw new Error("Failed to generate 3D representations for comparison models.");
      }

      this.app.updateProgress(I18N.t('compareParsingModels') + ' (Diffing)', 80);

      // 3. Compute Diff
      this.computeModelDiff(modelNew, modelOld);

      // 4. Assemble Viewport Materials & Ghosting
      this.applyComparisonViewportShading(modelNew, modelOld);

      // 5. Activate UI Tab and Banner
      this.activateComparisonUI();

      this.app.showProgressModal(false);
      showToast(`${I18N.t('compareStatusBanner')}: +${this.diffData.added.length} | -${this.diffData.deleted.length} | ~${this.diffData.modified.length}`, 'success');

    } catch (err) {
      console.error("Comparison execution error:", err);
      this.app.showProgressModal(false);
      showToast("Comparison error: " + err.message, "danger");
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("File read error: " + e.target.error));
      reader.readAsText(file);
    });
  }

  // Core Differential Algorithm (IFC GUID & Geometric / Property Analysis)
  computeModelDiff(modelNew, modelOld) {
    if (modelNew.updateMatrixWorld) modelNew.updateMatrixWorld(true);
    if (modelOld.updateMatrixWorld) modelOld.updateMatrixWorld(true);

    const getMeshes = (root) => {
      const list = [];
      root.traverse(o => {
        if (o.isMesh && this.app.isModelElementMesh(o) && o.geometry) {
          list.push(o);
        }
      });
      return list;
    };

    const meshesNew = getMeshes(modelNew);
    const meshesOld = getMeshes(modelOld);

    const mapNew = new Map();
    const mapOld = new Map();

    meshesNew.forEach(m => {
      const key = (m.userData && (m.userData.guid || m.userData.id)) || m.name || m.uuid;
      mapNew.set(String(key), m);
    });

    meshesOld.forEach(m => {
      const key = (m.userData && (m.userData.guid || m.userData.id)) || m.name || m.uuid;
      mapOld.set(String(key), m);
    });

    const added = [];
    const deleted = [];
    const modified = [];
    const unchanged = [];

    // Find Added & Modified vs Unchanged
    mapNew.forEach((meshNew, key) => {
      if (!mapOld.has(key)) {
        // Exists in New, not in Old -> ADDED
        meshNew.userData = meshNew.userData || {};
        meshNew.userData.compareStatus = 'added';
        added.push(meshNew);
      } else {
        // Exists in both -> Check modifications
        const meshOld = mapOld.get(key);
        const geomDiff = this.checkGeometryDrift(meshNew, meshOld);
        const propDiff = this.checkPropertyDiff(meshNew, meshOld);

        if (geomDiff.changed || propDiff.changed) {
          meshNew.userData = meshNew.userData || {};
          meshNew.userData.compareStatus = 'modified';
          meshNew.userData.compareGeomChanged = geomDiff.changed;
          meshNew.userData.compareGeomDetails = geomDiff.details;
          meshNew.userData.comparePropsChanged = propDiff.changed;
          meshNew.userData.compareDiffList = propDiff.diffList;
          meshNew.userData.compareOldMesh = meshOld; // Cached reference for ghost mesh
          modified.push(meshNew);
        } else {
          meshNew.userData = meshNew.userData || {};
          meshNew.userData.compareStatus = 'unchanged';
          unchanged.push(meshNew);
        }
      }
    });

    // Find Deleted (Exists in Old, not in New)
    mapOld.forEach((meshOld, key) => {
      if (!mapNew.has(key)) {
        meshOld.userData = meshOld.userData || {};
        meshOld.userData.compareStatus = 'deleted';
        deleted.push(meshOld);
      }
    });

    this.diffData = {
      added: added,
      deleted: deleted,
      modified: modified,
      unchanged: unchanged,
      mapNew: mapNew,
      mapOld: mapOld
    };
  }

  // Geometric shape & positional drift detection (> 2mm threshold)
  checkGeometryDrift(mNew, mOld) {
    if (mNew.updateWorldMatrix) mNew.updateWorldMatrix(true, false);
    if (mOld.updateWorldMatrix) mOld.updateWorldMatrix(true, false);

    if (!mNew.geometry.boundingBox) mNew.geometry.computeBoundingBox();
    if (!mOld.geometry.boundingBox) mOld.geometry.computeBoundingBox();

    const boxNew = mNew.geometry.boundingBox.clone().applyMatrix4(mNew.matrixWorld);
    const boxOld = mOld.geometry.boundingBox.clone().applyMatrix4(mOld.matrixWorld);

    const centerNew = new THREE.Vector3();
    const centerOld = new THREE.Vector3();
    boxNew.getCenter(centerNew);
    boxOld.getCenter(centerOld);

    const centerDist = centerNew.distanceTo(centerOld);
    const sizeNew = new THREE.Vector3();
    const sizeOld = new THREE.Vector3();
    boxNew.getSize(sizeNew);
    boxOld.getSize(sizeOld);

    const sizeDelta = sizeNew.distanceTo(sizeOld);

    const TOLERANCE = 0.002; // 2mm tolerance
    const changed = (centerDist > TOLERANCE || sizeDelta > TOLERANCE);

    return {
      changed: changed,
      details: {
        centerDrift: centerDist,
        sizeDelta: sizeDelta,
        oldCenter: centerOld,
        newCenter: centerNew
      }
    };
  }

  // Deep comparison of IFC metadata, Psets, and basic attributes
  checkPropertyDiff(mNew, mOld) {
    const uNew = mNew.userData || {};
    const uOld = mOld.userData || {};
    const diffList = [];

    // Basic attributes
    const attrs = [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'IFC Type' },
      { key: 'category', label: 'Category' },
      { key: 'level', label: 'Storey Level' }
    ];

    attrs.forEach(a => {
      const vOld = (uOld[a.key] != null) ? String(uOld[a.key]).trim() : '';
      const vNew = (uNew[a.key] != null) ? String(uNew[a.key]).trim() : '';
      if (vOld && vNew && vOld !== vNew) {
        diffList.push({
          group: 'Attributes',
          prop: a.label,
          oldVal: vOld,
          newVal: vNew
        });
      }
    });

    // Psets map
    const getPsetDict = (psets) => {
      const dict = {};
      if (!Array.isArray(psets)) return dict;
      psets.forEach(pset => {
        const psetName = pset.name || 'Custom';
        if (Array.isArray(pset.properties)) {
          pset.properties.forEach(p => {
            const propName = p.name || '';
            const propVal = p.value != null ? String(p.value).trim() : '';
            if (propName) {
              dict[`${psetName}::${propName}`] = { psetName, propName, propVal };
            }
          });
        }
      });
      return dict;
    };

    const dictOld = getPsetDict(uOld.psets);
    const dictNew = getPsetDict(uNew.psets);

    // Check changed or removed in new
    Object.keys(dictOld).forEach(key => {
      const itemOld = dictOld[key];
      const itemNew = dictNew[key];
      if (!itemNew) {
        diffList.push({
          group: itemOld.psetName,
          prop: itemOld.propName,
          oldVal: itemOld.propVal,
          newVal: '— (Deleted)'
        });
      } else if (itemOld.propVal !== itemNew.propVal) {
        diffList.push({
          group: itemOld.psetName,
          prop: itemOld.propName,
          oldVal: itemOld.propVal,
          newVal: itemNew.propVal
        });
      }
    });

    // Check newly added properties
    Object.keys(dictNew).forEach(key => {
      if (!dictOld[key]) {
        const itemNew = dictNew[key];
        diffList.push({
          group: itemNew.psetName,
          prop: itemNew.propName,
          oldVal: '— (None)',
          newVal: itemNew.propVal
        });
      }
    });

    return {
      changed: diffList.length > 0,
      diffList: diffList
    };
  }

  // 3D Viewport Semantic Shaders and Deleted Elements Injection
  applyComparisonViewportShading(modelNew, modelOld) {
    this.isActive = true;
    this.origMaterials.clear();

    // 1. Backup and override materials for New Model
    modelNew.traverse(obj => {
      if (obj.isMesh && this.app.isModelElementMesh(obj)) {
        this.origMaterials.set(obj.id, obj.material);

        const status = obj.userData.compareStatus || 'unchanged';
        let compMat;

        if (status === 'added') {
          // Vibrant Green
          compMat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            roughness: 0.5,
            metalness: 0.1
          });
        } else if (status === 'modified') {
          // Orange-Yellow
          compMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            roughness: 0.5,
            metalness: 0.1
          });
        } else {
          // Unchanged: Neutral Gray-White with opacity slider
          compMat = new THREE.MeshStandardMaterial({
            color: 0xd8dce2,
            roughness: 0.75,
            metalness: 0.05,
            transparent: true,
            opacity: this.unchangedOpacity,
            depthWrite: this.unchangedOpacity >= 0.95
          });
        }

        // Preserve clipping planes
        if (this.app.clippingEngine && this.app.clippingEngine.clippingPlanes) {
          compMat.clippingPlanes = this.app.clippingEngine.clippingPlanes;
        }

        obj.material = compMat;
      }
    });

    // 2. Inject Deleted Elements (from Old Model) into Scene
    if (this.deletedGroup) {
      this.app.scene.remove(this.deletedGroup);
    }

    this.deletedGroup = new THREE.Group();
    this.deletedGroup.name = "CompareDeletedGroup";

    const delMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    if (this.app.clippingEngine && this.app.clippingEngine.clippingPlanes) {
      delMaterial.clippingPlanes = this.app.clippingEngine.clippingPlanes;
    }

    this.diffData.deleted.forEach(oldMesh => {
      const delMesh = new THREE.Mesh(oldMesh.geometry.clone(), delMaterial);
      delMesh.matrixAutoUpdate = false;
      delMesh.matrix.copy(oldMesh.matrixWorld);
      delMesh.userData = Object.assign({}, oldMesh.userData, {
        isDeletedCompare: true,
        compareStatus: 'deleted'
      });
      this.deletedGroup.add(delMesh);
    });

    this.app.scene.add(this.deletedGroup);
  }

  // Update opacity of unchanged elements in realtime
  setUnchangedOpacity(opacityVal) {
    this.unchangedOpacity = opacityVal;
    if (!this.diffData || !this.diffData.unchanged) return;

    const op = opacityVal / 100;
    this.diffData.unchanged.forEach(m => {
      if (m.material) {
        m.material.opacity = op;
        m.material.transparent = op < 0.99;
        m.material.depthWrite = op >= 0.95;
        m.visible = op > 0.01;
      }
    });
  }

  // Ghost Mesh Handling on Element Selection
  onElementSelected(mesh) {
    this.clearGhostMesh();

    if (!this.isActive || !mesh || !mesh.userData) return;

    // Only render ghost mesh if this is a modified element with geometric shape / position drift!
    if (mesh.userData.compareStatus === 'modified' && mesh.userData.compareGeomChanged) {
      const oldMesh = mesh.userData.compareOldMesh;
      if (oldMesh && oldMesh.geometry) {
        const ghostMat = new THREE.MeshStandardMaterial({
          color: 0xfbbf24, // Warm yellow
          emissive: 0x713f12,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          roughness: 0.3,
          metalness: 0.1,
          side: THREE.DoubleSide
        });

        if (this.app.clippingEngine && this.app.clippingEngine.clippingPlanes) {
          ghostMat.clippingPlanes = this.app.clippingEngine.clippingPlanes;
        }

        const ghostMesh = new THREE.Mesh(oldMesh.geometry.clone(), ghostMat);
        ghostMesh.matrixAutoUpdate = false;
        ghostMesh.matrix.copy(oldMesh.matrixWorld);
        ghostMesh.userData = { isGhostMesh: true, isGizmo: true };
        ghostMesh.renderOrder = 999;

        this.app.scene.add(ghostMesh);
        this.activeGhostMesh = ghostMesh;
      }
    }
  }

  onSelectionCleared() {
    this.clearGhostMesh();
  }

  clearGhostMesh() {
    if (this.activeGhostMesh) {
      this.app.scene.remove(this.activeGhostMesh);
      if (this.activeGhostMesh.geometry) this.activeGhostMesh.geometry.dispose();
      if (this.activeGhostMesh.material) this.activeGhostMesh.material.dispose();
      this.activeGhostMesh = null;
    }
  }

  // Comparison UI: Top Sticky Banner & Sidebar Tab Setup
  activateComparisonUI() {
    // 1. Top Banner
    const banner = document.getElementById('compare-status-banner');
    const fileNewEl = document.getElementById('banner-file-new');
    const fileOldEl = document.getElementById('banner-file-old');

    if (banner && fileNewEl && fileOldEl) {
      fileNewEl.textContent = this.fileNew ? this.fileNew.name : 'New';
      fileOldEl.textContent = this.fileOld ? this.fileOld.name : 'Old';
      banner.classList.add('active');
    }

    // 2. Insert Compare Tab into Sidebar if not present
    const tabsNav = document.getElementById('sidebar-tabs-nav');
    const contentPanel = document.getElementById('sidebar-tab-content-panel');

    let btnCompareTab = document.getElementById('tab-btn-compare');
    if (!btnCompareTab && tabsNav) {
      btnCompareTab = document.createElement('button');
      btnCompareTab.id = 'tab-btn-compare';
      btnCompareTab.className = 'tab-btn tab-compare-badge active';
      btnCompareTab.setAttribute('data-tab', 'tab-compare-content');
      btnCompareTab.textContent = I18N.t('compareTabTitle');
      tabsNav.insertBefore(btnCompareTab, tabsNav.firstChild);

      btnCompareTab.addEventListener('click', () => {
        this.app.switchLeftTab('tab-compare-content');
      });
    }

    let tabContent = document.getElementById('tab-compare-content');
    if (!tabContent && contentPanel) {
      tabContent = document.createElement('div');
      tabContent.id = 'tab-compare-content';
      tabContent.className = 'tab-content active';
      contentPanel.insertBefore(tabContent, contentPanel.firstChild);
    }

    // Deactivate other tabs and activate Compare tab
    document.querySelectorAll('.sidebar-tabs-nav .tab-btn').forEach(b => {
      b.classList.toggle('active', b.id === 'tab-btn-compare');
    });
    document.querySelectorAll('.sidebar-tab-content-panel .tab-content').forEach(c => {
      c.classList.toggle('active', c.id === 'tab-compare-content');
    });

    // 3. Render Compare Tab Content
    this.renderCompareTabContent();
  }

  renderCompareTabContent() {
    const container = document.getElementById('tab-compare-content');
    if (!container || !this.diffData) return;

    const addCount = this.diffData.added.length;
    const delCount = this.diffData.deleted.length;
    const modCount = this.diffData.modified.length;

    container.innerHTML = `
      <div class="compare-controls-card">
        <!-- 1. Opacity Slider for Unchanged -->
        <div class="compare-slider-row">
          <div class="compare-slider-header">
            <span>${I18N.t('compareOpacitySliderLabel')}</span>
            <span class="compare-slider-val" id="compare-opacity-val">${Math.round(this.unchangedOpacity * 100)}%</span>
          </div>
          <input type="range" min="0" max="100" step="5" value="${Math.round(this.unchangedOpacity * 100)}" 
            class="compare-slider" id="compare-opacity-slider">
        </div>

        <!-- 2. Three Metric Pill Badges (Filter Chips) -->
        <div class="compare-pills-row">
          <div class="compare-pill pill-green ${this.activeFilter === 'added' ? 'active' : ''}" id="pill-added" title="Click to filter added elements">
            <span class="compare-pill-count">+${addCount}</span>
            <span class="compare-pill-label">${I18N.t('compareMetricAdded')}</span>
          </div>
          <div class="compare-pill pill-red ${this.activeFilter === 'deleted' ? 'active' : ''}" id="pill-deleted" title="Click to filter deleted elements">
            <span class="compare-pill-count">-${delCount}</span>
            <span class="compare-pill-label">${I18N.t('compareMetricDeleted')}</span>
          </div>
          <div class="compare-pill pill-orange ${this.activeFilter === 'modified' ? 'active' : ''}" id="pill-modified" title="Click to filter modified elements">
            <span class="compare-pill-count">~${modCount}</span>
            <span class="compare-pill-label">${I18N.t('compareMetricModified')}</span>
          </div>
        </div>

        <!-- 3. Dual Organization Mode Switcher -->
        <div class="compare-mode-row">
          <button class="compare-mode-btn ${this.treeMode === 'hierarchy' ? 'active' : ''}" id="btn-mode-hierarchy">
            ${I18N.t('compareModeUnified')}
          </button>
          <button class="compare-mode-btn ${this.treeMode === 'status' ? 'active' : ''}" id="btn-mode-status">
            ${I18N.t('compareModeStatus')}
          </button>
        </div>
      </div>

      <!-- Difference Tree Container -->
      <div class="tree-container" id="compare-diff-tree"></div>
    `;

    // Bind slider
    const slider = document.getElementById('compare-opacity-slider');
    const valText = document.getElementById('compare-opacity-val');
    if (slider) {
      slider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (valText) valText.textContent = `${val}%`;
        this.setUnchangedOpacity(val);
      };
    }

    // Bind pill filters
    const pillAdd = document.getElementById('pill-added');
    const pillDel = document.getElementById('pill-deleted');
    const pillMod = document.getElementById('pill-modified');

    const toggleFilter = (status) => {
      this.activeFilter = (this.activeFilter === status) ? null : status;
      this.renderCompareTabContent();
    };

    if (pillAdd) pillAdd.onclick = () => toggleFilter('added');
    if (pillDel) pillDel.onclick = () => toggleFilter('deleted');
    if (pillMod) pillMod.onclick = () => toggleFilter('modified');

    // Bind mode switcher
    const btnHier = document.getElementById('btn-mode-hierarchy');
    const btnStat = document.getElementById('btn-mode-status');
    if (btnHier) {
      btnHier.onclick = () => {
        this.treeMode = 'hierarchy';
        this.renderCompareTabContent();
      };
    }
    if (btnStat) {
      btnStat.onclick = () => {
        this.treeMode = 'status';
        this.renderCompareTabContent();
      };
    }

    // Render tree based on mode
    this.renderDiffTree();
  }

  // Render Difference Tree
  renderDiffTree() {
    const container = document.getElementById('compare-diff-tree');
    if (!container || !this.diffData) return;

    container.innerHTML = '';

    // Filter elements
    let elements = [];
    if (this.activeFilter === 'added') elements = this.diffData.added;
    else if (this.activeFilter === 'deleted') elements = this.diffData.deleted;
    else if (this.activeFilter === 'modified') elements = this.diffData.modified;
    else elements = [...this.diffData.added, ...this.diffData.deleted, ...this.diffData.modified];

    if (elements.length === 0) {
      container.innerHTML = `
        <div style="padding:20px 10px;text-align:center;color:var(--text-muted);font-size:12px">
          ${I18N.t('compareNoDiffsFound')}
        </div>
      `;
      return;
    }

    if (this.treeMode === 'hierarchy') {
      this.renderUnifiedHierarchyTree(container, elements);
    } else {
      this.renderStatusGroupedTree(container, elements);
    }
  }

  // Mode 1: Unified Spatial Hierarchy Tree (Storey -> Category -> Element)
  renderUnifiedHierarchyTree(container, elements) {
    const tree = {};

    elements.forEach(mesh => {
      const u = mesh.userData || {};
      const level = u.level || 'Ground Level';
      const cat = u.category || u.rawCategory || 'Elements';

      if (!tree[level]) tree[level] = {};
      if (!tree[level][cat]) tree[level][cat] = [];

      tree[level][cat].push(mesh);
    });

    Object.keys(tree).sort().forEach(levelName => {
      const branchLevel = document.createElement('div');
      branchLevel.className = 'tree-node expanded';

      const levelHeader = document.createElement('div');
      levelHeader.className = 'tree-header';
      levelHeader.innerHTML = `
        <span class="tree-arrow">&#9660;</span>
        <span class="tree-icon">🏢</span>
        <span class="tree-label">${this.app.escapeHtml(levelName)}</span>
      `;

      const levelChildren = document.createElement('div');
      levelChildren.className = 'tree-children';

      levelHeader.onclick = (e) => {
        e.stopPropagation();
        branchLevel.classList.toggle('expanded');
        const arrow = levelHeader.querySelector('.tree-arrow');
        if (arrow) arrow.innerHTML = branchLevel.classList.contains('expanded') ? '&#9660;' : '&#9654;';
      };

      Object.keys(tree[levelName]).sort().forEach(catName => {
        const catGroup = document.createElement('div');
        catGroup.className = 'tree-node expanded';

        const catHeader = document.createElement('div');
        catHeader.className = 'tree-header';
        catHeader.innerHTML = `
          <span class="tree-arrow">&#9660;</span>
          <span class="tree-icon">📦</span>
          <span class="tree-label">${this.app.escapeHtml(catName)} (${tree[levelName][catName].length})</span>
        `;

        const catChildren = document.createElement('div');
        catChildren.className = 'tree-children';

        catHeader.onclick = (e) => {
          e.stopPropagation();
          catGroup.classList.toggle('expanded');
          const arrow = catHeader.querySelector('.tree-arrow');
          if (arrow) arrow.innerHTML = catGroup.classList.contains('expanded') ? '&#9660;' : '&#9654;';
        };

        tree[levelName][catName].forEach(mesh => {
          const item = this.createDiffTreeNode(mesh);
          catChildren.appendChild(item);
        });

        catGroup.appendChild(catHeader);
        catGroup.appendChild(catChildren);
        levelChildren.appendChild(catGroup);
      });

      branchLevel.appendChild(levelHeader);
      branchLevel.appendChild(levelChildren);
      container.appendChild(branchLevel);
    });
  }

  // Mode 2: Status-Grouped Tree (Added Group, Deleted Group, Modified Group)
  renderStatusGroupedTree(container, elements) {
    const groups = [
      { key: 'added', title: I18N.t('compareDiffGroupAdded'), items: this.diffData.added, dotClass: 'dot-added', color: '#22c55e' },
      { key: 'deleted', title: I18N.t('compareDiffGroupDeleted'), items: this.diffData.deleted, dotClass: 'dot-deleted', color: '#ef4444' },
      { key: 'modified', title: I18N.t('compareDiffGroupModified'), items: this.diffData.modified, dotClass: 'dot-modified', color: '#f59e0b' }
    ];

    groups.forEach(g => {
      // If activeFilter is set and doesn't match this group, skip
      if (this.activeFilter && this.activeFilter !== g.key) return;
      if (g.items.length === 0) return;

      const card = document.createElement('div');
      card.className = 'compare-group-card';

      const header = document.createElement('div');
      header.className = 'compare-group-header';
      header.innerHTML = `
        <div class="group-title" style="color:${g.color}">
          <span class="diff-status-dot ${g.dotClass}"></span>
          <span>${g.title}</span>
          <span style="font-size:11px;opacity:0.8">(${g.items.length})</span>
        </div>
        <span class="group-arrow">&#9660;</span>
      `;

      const body = document.createElement('div');
      body.className = 'compare-group-body';

      header.onclick = () => {
        card.classList.toggle('collapsed');
      };

      g.items.forEach(mesh => {
        const item = this.createDiffTreeNode(mesh);
        body.appendChild(item);
      });

      card.appendChild(header);
      card.appendChild(body);
      container.appendChild(card);
    });
  }

  // Create single difference tree leaf element
  createDiffTreeNode(mesh) {
    const u = mesh.userData || {};
    const status = u.compareStatus || 'modified';
    const name = u.name || `${u.type || 'Element'} #${u.id || ''}`;

    let dotClass = 'dot-modified';
    if (status === 'added') dotClass = 'dot-added';
    else if (status === 'deleted') dotClass = 'dot-deleted';

    const item = document.createElement('div');
    item.className = 'diff-tree-node';

    let ghostBadge = '';
    if (status === 'modified' && u.compareGeomChanged) {
      ghostBadge = `<span class="diff-tag-ghost" title="${I18N.t('compareDiffGeomChanged')}">Ghost</span>`;
    }

    item.innerHTML = `
      <span class="diff-status-dot ${dotClass}"></span>
      <span class="diff-tree-name" title="${this.app.escapeHtml(name)}">${this.app.escapeHtml(name)}</span>
      ${ghostBadge}
    `;

    item.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.diff-tree-node').forEach(n => n.classList.remove('selected'));
      item.classList.add('selected');

      // Select element and focus in 3D
      this.app.selectElement(mesh);
      if (this.app.zoomToElement) {
        this.app.zoomToElement(mesh);
      }
    };

    return item;
  }

  // Render Diff Inspector Table when Modified Element is selected
  renderDiffInspectorCard(mesh, container) {
    if (!this.isActive || !mesh || !mesh.userData) return;
    const u = mesh.userData;

    if (u.compareStatus !== 'modified') return;

    const diffList = u.compareDiffList || [];
    const geomChanged = u.compareGeomChanged;

    let rowsHtml = '';
    if (diffList.length > 0) {
      diffList.forEach(d => {
        rowsHtml += `
          <tr>
            <td class="prop-name">${this.app.escapeHtml(d.prop)}</td>
            <td class="old-val">${this.app.escapeHtml(d.oldVal)}</td>
            <td class="new-val">${this.app.escapeHtml(d.newVal)}</td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="3" style="color:var(--text-muted);text-align:center;padding:10px">
            ${I18N.t('compareDiffGeomChanged')}
          </td>
        </tr>
      `;
    }

    let ghostNotice = '';
    if (geomChanged) {
      ghostNotice = `
        <div class="diff-ghost-indicator">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <span>${I18N.t('compareDiffGeomChanged')}</span>
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = 'diff-inspector-card';
    card.innerHTML = `
      <div class="diff-summary-row">
        <span class="diff-summary-badge">${I18N.t('compareInspectorDiffTitle')}</span>
        <span style="font-size:11px;color:var(--text-secondary)">${diffList.length} changed</span>
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
    `;

    container.insertBefore(card, container.firstChild);
  }

  // Exit Comparison Mode and Restore Original Materials
  exitCompareMode() {
    if (!this.isActive) return;
    this.isActive = false;

    // 1. Hide Top Banner
    const banner = document.getElementById('compare-status-banner');
    if (banner) banner.classList.remove('active');

    // 2. Remove Ghost Mesh
    this.clearGhostMesh();

    // 3. Restore Original Materials & Clean Metadata for Active Model
    if (this.app.activeModel) {
      this.app.activeModel.traverse(obj => {
        if (obj.isMesh) {
          if (this.origMaterials.has(obj.id)) {
            obj.material = this.origMaterials.get(obj.id);
          }
          if (obj.userData) {
            delete obj.userData.compareStatus;
            delete obj.userData.compareGeomChanged;
            delete obj.userData.comparePropsChanged;
            delete obj.userData.compareDiffList;
            delete obj.userData.compareOldMesh;
          }
        }
      });
    }
    this.origMaterials.clear();

    // 4. Remove Injected Deleted Meshes
    if (this.deletedGroup) {
      this.app.scene.remove(this.deletedGroup);
      this.deletedGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      this.deletedGroup = null;
    }

    // 5. Remove Compare Tab from Sidebar
    const btnCompareTab = document.getElementById('tab-btn-compare');
    if (btnCompareTab) btnCompareTab.remove();

    const tabContent = document.getElementById('tab-compare-content');
    if (tabContent) tabContent.remove();

    // 6. Switch back to Structures tab
    this.app.switchLeftTab('tab-struct-content');

    // 7. Clear selection to refresh inspector
    this.app.clearSelection();

    showToast(I18N.t('compareExitConfirm'), 'success');
  }
}
