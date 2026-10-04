/**
 * BIM Scope Section & Clipping Engine
 * @author WWBIM
 */
class ClippingEngine {
  constructor(scene, renderer) {
    this.author = "WWBIM";
    this.scene = scene;
    this.renderer = renderer;
    this.renderer.localClippingEnabled = true;
    
    this.enabled = false;
    this.mode = 'plane'; // 'plane' or 'box'
    
    // Bounds of current model
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-100, -20, -100),
      new THREE.Vector3(100, 50, 100)
    );
    
    // ----------------------------------------------------
    // Section Plane State (Z-up: Z = Elevation, X = Easting, Y = Northing)
    // ----------------------------------------------------
    this.planeAxis = 'Z'; // Default Z-up
    this.planeOffset = 0.5; // 0 to 1 normalized
    this.planeInvert = false;
    this.singlePlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    
    // ----------------------------------------------------
    // Section Box State (Oriented Bounding Box)
    // ----------------------------------------------------
    this.boxCenter = new THREE.Vector3(0, 15, 0);
    this.boxHalfSizes = new THREE.Vector3(25, 15, 25);
    this.boxQuaternion = new THREE.Quaternion(); // Identity (unrotated)
    
    this.boxRanges = {
      minX: 0.0, maxX: 1.0,
      minY: 0.0, maxY: 1.0,
      minZ: 0.0, maxZ: 1.0
    };
    
    this.boxPlanes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), // +X face (points inward -X)
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),  // -X face (points inward +X)
      new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), // +Y face (points inward -Y)
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),  // -Y face (points inward +Y)
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), // +Z face (points inward -Z)
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)   // -Z face (points inward +Z)
    ];
    
    // Drag and Hover interaction state
    this.hoveredGizmo = null;
    this.activeDragGizmo = null;
    this.boxHelpersVisible = true; // Visibility toggle for Section Box wireframe & gizmos
    this.rotationSnap5Deg = false; // 5-degree angle snapping toggle
    this.dragPlane = new THREE.Plane();
    this.dragStartHit = new THREE.Vector3();
    this.dragStartPos = new THREE.Vector3();
    this.dragStartQuat = new THREE.Quaternion();
    this.dragStartCenter = new THREE.Vector3();
    this.dragStartHalfSizes = new THREE.Vector3();
    this.dragNormal = new THREE.Vector3();
    this.dragAxis = new THREE.Vector3();
    this.dragStartVec = new THREE.Vector3();
    this.dragFace = null;
    
    this.onGizmoChange = null;
    this.onGizmoHover = null;
    
    this.initHelpers();
  }
  
  initHelpers() {
    // ====================================================
    // 1. SECTION PLANE 3D GROUP & GIZMOS
    // ====================================================
    this.planeGroup = new THREE.Group();
    this.planeGroup.visible = false;
    this.scene.add(this.planeGroup);
    
    // Visual cutting plane (1x1 unit square, scaled in setBounds)
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    this.planeMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    this.planeMesh = new THREE.Mesh(planeGeo, this.planeMat);
    this.planeMesh.userData = { isPlaneHelperMesh: true, isGizmo: true };
    this.planeMesh.raycast = () => {}; // Never pickable/selectable
    this.planeGroup.add(this.planeMesh);
    
    // Wireframe edges for cutting plane
    const planeEdgesGeo = new THREE.EdgesGeometry(planeGeo);
    this.planeEdges = new THREE.LineSegments(
      planeEdgesGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 1.5 })
    );
    this.planeEdges.userData = { isPlaneHelperMesh: true, isGizmo: true };
    this.planeEdges.raycast = () => {}; // Never pickable/selectable
    this.planeGroup.add(this.planeEdges);
    
    // Backward compatibility alias
    this.planeHelper = this.planeMesh;
    
    // Plane Gizmo Group (Scaled to 1/3 size with slender lines)
    this.planeGizmoGroup = new THREE.Group();
    this.planeGroup.add(this.planeGizmoGroup);
    this.initPlaneGizmo();

    // ====================================================
    // 2. SECTION BOX 3D GROUP & GIZMOS
    // ====================================================
    this.boxGroup = new THREE.Group();
    this.boxGroup.visible = false;
    this.scene.add(this.boxGroup);
    
    // Oriented wireframe box edges
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxEdgesGeo = new THREE.EdgesGeometry(unitBoxGeo);
    this.boxWireframe = new THREE.LineSegments(
      boxEdgesGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })
    );
    this.boxWireframe.userData = { isBoxHelper: true, isGizmo: true };
    this.boxWireframe.raycast = () => {}; // Never pickable/selectable
    this.boxGroup.add(this.boxWireframe);
    
    // Oriented semi-transparent fill
    this.boxFill = new THREE.Mesh(
      unitBoxGeo,
      new THREE.MeshBasicMaterial({
        color: 0x00d2ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.035,
        depthWrite: false
      })
    );
    this.boxFill.userData = { isBoxHelper: true, isGizmo: true };
    this.boxFill.raycast = () => {}; // Never pickable/selectable
    this.boxGroup.add(this.boxFill);
    
    // Backward compatibility helper
    this.boxHelper = {
      visible: false,
      box: new THREE.Box3()
    };
    
    // Box Gizmo Group (6 Face Outward Arrows with Midpoint Rotation Rings)
    this.boxGizmoGroup = new THREE.Group();
    this.boxGroup.add(this.boxGizmoGroup);
    this.initBoxGizmo();
  }
  
  // ----------------------------------------------------
  // SECTION PLANE GIZMO SETUP (1/3 Scale & Thin Profiles)
  // ----------------------------------------------------
  initPlaneGizmo() {
    // A. Normal Translation Arrow (slender: radius 0.04, length 1.2)
    this.planeArrowGroup = new THREE.Group();
    this.planeArrowGroup.userData = { isGizmo: true, type: 'plane', part: 'translateNormal' };
    
    const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 16);
    stemGeo.translate(0, 0.6, 0);
    const coneGeo = new THREE.ConeGeometry(0.14, 0.35, 16);
    coneGeo.translate(0, 1.35, 0);
    
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      clippingPlanes: []
    });
    arrowMat.renderOrder = 10000;
    
    const stemMesh = new THREE.Mesh(stemGeo, arrowMat);
    stemMesh.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', parentGroup: this.planeArrowGroup };
    const coneMesh = new THREE.Mesh(coneGeo, arrowMat);
    coneMesh.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', parentGroup: this.planeArrowGroup };
    this.planeArrowGroup.add(stemMesh);
    this.planeArrowGroup.add(coneMesh);
    
    // Hit cylinder matching the slender arrow
    const hitCylGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 8);
    hitCylGeo.translate(0, 0.8, 0);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, clippingPlanes: [] });
    const hitMesh = new THREE.Mesh(hitCylGeo, hitMat);
    hitMesh.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', parentGroup: this.planeArrowGroup };
    this.planeArrowGroup.add(hitMesh);
    
    // Orient arrow along +Z (plane local normal)
    this.planeArrowGroup.rotation.x = Math.PI / 2;
    this.planeGizmoGroup.add(this.planeArrowGroup);
    
    // B. Center Knob (slender: radius 0.18)
    const knobGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const knobMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      clippingPlanes: []
    });
    knobMat.renderOrder = 10000;
    this.planeCenterKnob = new THREE.Mesh(knobGeo, knobMat);
    this.planeCenterKnob.userData = { isGizmo: true, type: 'plane', part: 'translateCenter' };
    this.planeGizmoGroup.add(this.planeCenterKnob);
    
    // C. Thin Rotation Rings (radius ~0.95, tube ~0.025)
    // 1. Pitch Ring (around local X axis) - Red
    this.planeRotX = this.createRingHelper(0.95, 0.025, 0xff4757, 'plane', 'rotateX');
    this.planeRotX.rotation.y = Math.PI / 2;
    this.planeGizmoGroup.add(this.planeRotX);
    
    // 2. Yaw Ring (around local Y axis) - Green
    this.planeRotY = this.createRingHelper(0.95, 0.025, 0x2ed573, 'plane', 'rotateY');
    this.planeRotY.rotation.x = Math.PI / 2;
    this.planeGizmoGroup.add(this.planeRotY);
    
    // 3. Roll Ring (around local Z axis / normal) - Blue
    this.planeRotZ = this.createRingHelper(1.15, 0.025, 0x1e90ff, 'plane', 'rotateZ');
    this.planeGizmoGroup.add(this.planeRotZ);
  }
  
  // ----------------------------------------------------
  // SECTION BOX GIZMO SETUP (Outward Arrows + Midpoint Rotation Rings)
  // ----------------------------------------------------
  initBoxGizmo() {
    this.faceHandles = {};
    
    // 6 Face Handles: +X/-X (Red East/West), +Y/-Y (Blue Height RL), +Z/-Z (Green Northing)
    const faceConfigs = [
      { id: 'xPos', normal: new THREE.Vector3(1, 0, 0), color: 0xff4757, label: '+X East' },
      { id: 'xNeg', normal: new THREE.Vector3(-1, 0, 0), color: 0xff4757, label: '-X West' },
      { id: 'yPos', normal: new THREE.Vector3(0, 1, 0), color: 0x1e90ff, label: '+Y Height Top' },
      { id: 'yNeg', normal: new THREE.Vector3(0, -1, 0), color: 0x1e90ff, label: '-Y Height Bottom' },
      { id: 'zPos', normal: new THREE.Vector3(0, 0, 1), color: 0x2ed573, label: '+Z Northing South' },
      { id: 'zNeg', normal: new THREE.Vector3(0, 0, -1), color: 0x2ed573, label: '-Z Northing North' }
    ];
    
    faceConfigs.forEach(cfg => {
      const handle = this.createFaceHandle(cfg.id, cfg.normal, cfg.color, cfg.label);
      this.faceHandles[cfg.id] = handle;
      this.boxGizmoGroup.add(handle);
    });
  }
  
  createFaceHandle(faceId, normal, colorHex, label) {
    const group = new THREE.Group();
    group.userData = {
      isGizmo: true,
      type: 'box',
      part: 'faceGroup',
      face: faceId,
      normal: normal.clone(),
      baseColor: colorHex,
      label: label
    };
    
    const arrowMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      clippingPlanes: []
    });
    arrowMat.renderOrder = 10000;
    
    // 1. OUTWARD ARROW (perpendicular to face, pointing outward)
    const arrowGroup = new THREE.Group();
    arrowGroup.userData = {
      isGizmo: true,
      type: 'box',
      part: 'faceArrow',
      face: faceId,
      normal: normal.clone(),
      baseColor: colorHex,
      label: `Drag ${label}`
    };
    
    // Arrow stem (cylinder: length 2.0m)
    const stemGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.0, 16);
    stemGeo.translate(0, 1.0, 0);
    const stemMesh = new THREE.Mesh(stemGeo, arrowMat);
    stemMesh.userData = { isGizmo: true, type: 'box', part: 'faceArrow', face: faceId, parentGroup: arrowGroup, handleGroup: group };
    arrowGroup.add(stemMesh);
    
    // Arrow cone head (cone: height 0.75m, starts at y = 2.0m)
    const coneGeo = new THREE.ConeGeometry(0.34, 0.75, 16);
    coneGeo.translate(0, 2.375, 0);
    const coneMesh = new THREE.Mesh(coneGeo, arrowMat);
    coneMesh.userData = { isGizmo: true, type: 'box', part: 'faceArrow', face: faceId, parentGroup: arrowGroup, handleGroup: group };
    arrowGroup.add(coneMesh);
    
    // Arrow hit cylinder (precise hit shape along the arrow only)
    const arrowHitGeo = new THREE.CylinderGeometry(0.36, 0.36, 2.8, 8);
    arrowHitGeo.translate(0, 1.4, 0);
    const arrowHitMat = new THREE.MeshBasicMaterial({ visible: false, clippingPlanes: [] });
    const arrowHitMesh = new THREE.Mesh(arrowHitGeo, arrowHitMat);
    arrowHitMesh.userData = {
      isGizmo: true,
      type: 'box',
      part: 'faceArrow',
      face: faceId,
      parentGroup: arrowGroup,
      handleGroup: group
    };
    arrowGroup.add(arrowHitMesh);
    group.add(arrowGroup);
    group.arrowGroup = arrowGroup;
    
    // 2. PERPENDICULAR ROTATION RING IN THE MIDDLE OF THE ARROW
    const ringGroup = new THREE.Group();
    ringGroup.userData = {
      isGizmo: true,
      type: 'box',
      part: 'faceRotate',
      face: faceId,
      normal: normal.clone(),
      baseColor: 0xffd32a,
      label: `Rotate around ${label}`
    };
    ringGroup.position.set(0, 1.0, 0); // Positioned at exact midpoint of arrow shaft (y = 1.0)
    
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd32a, // Gold
      depthTest: false,
      transparent: true,
      opacity: 0.92,
      clippingPlanes: []
    });
    ringMat.renderOrder = 10000;
    
    const ringRadius = 0.92;
    const ringTube = 0.055;
    const ringGeo = new THREE.TorusGeometry(ringRadius, ringTube, 16, 48);
    ringGeo.rotateX(Math.PI / 2); // Perpendicular to arrow shaft
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.userData = { isGizmo: true, type: 'box', part: 'faceRotate', face: faceId, parentGroup: ringGroup, handleGroup: group };
    ringGroup.add(ringMesh);
    
    // Precise hit torus for the ring
    const ringHitGeo = new THREE.TorusGeometry(ringRadius, 0.22, 8, 24);
    ringHitGeo.rotateX(Math.PI / 2);
    const ringHitMat = new THREE.MeshBasicMaterial({ visible: false, clippingPlanes: [] });
    const ringHitMesh = new THREE.Mesh(ringHitGeo, ringHitMat);
    ringHitMesh.userData = {
      isGizmo: true,
      type: 'box',
      part: 'faceRotate',
      face: faceId,
      parentGroup: ringGroup,
      handleGroup: group
    };
    ringGroup.add(ringHitMesh);
    group.add(ringGroup);
    group.ringGroup = ringGroup;
    
    // Align handle along outward face normal (cylinder default is +Y)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    
    return group;
  }
  
  createRingHelper(radius, tube, colorHex, gizmoType, partName) {
    const group = new THREE.Group();
    group.userData = { isGizmo: true, type: gizmoType, part: partName, baseColor: colorHex };
    
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
      clippingPlanes: []
    });
    mat.renderOrder = 10000;
    
    const ringGeo = new THREE.TorusGeometry(radius, tube, 12, 48);
    const ringMesh = new THREE.Mesh(ringGeo, mat);
    ringMesh.userData = { isGizmo: true, type: gizmoType, part: partName, parentGroup: group };
    group.add(ringMesh);
    
    // Precise hit torus for raycast picking
    const hitGeo = new THREE.TorusGeometry(radius, Math.max(tube * 4.0, 0.14), 8, 24);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, clippingPlanes: [] });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.userData = { isGizmo: true, type: gizmoType, part: partName, parentGroup: group };
    group.add(hitMesh);
    
    return group;
  }
  
  // ----------------------------------------------------
  // BOUNDS & RESIZING
  // ----------------------------------------------------
  setBounds(box3) {
    this.bounds.copy(box3);
    const size = new THREE.Vector3();
    this.bounds.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 50) * 1.5;
    
    this.planeMesh.scale.set(maxDim, maxDim, 1);
    this.planeEdges.scale.set(maxDim, maxDim, 1);
    
    // Scale plane gizmo to exactly 1/3 of previous size
    const gizmoScale = Math.max(0.35, maxDim * 0.017);
    this.planeGizmoGroup.scale.setScalar(gizmoScale);
    
    // Default box sizes matching current model bounds
    this.setFromBoxRanges(this.boxRanges);
    this.update();
  }
  
  setFromBoxRanges(ranges) {
    this.boxRanges = Object.assign(this.boxRanges, ranges);
    const min = this.bounds.min;
    const size = new THREE.Vector3().subVectors(this.bounds.max, min);
    
    // Z-up mapping: X=Easting, Y=Northing, Z=Elevation
    const wMinX = min.x + this.boxRanges.minX * size.x;
    const wMaxX = min.x + this.boxRanges.maxX * size.x;
    const wMinY = min.y + this.boxRanges.minZ * size.y; // Elevation (Three.js Y)
    const wMaxY = min.y + this.boxRanges.maxZ * size.y;
    const wMinZ = min.z + this.boxRanges.minY * size.z; // Northing (Three.js Z)
    const wMaxZ = min.z + this.boxRanges.maxY * size.z;
    
    this.boxCenter.set(
      (wMinX + wMaxX) * 0.5,
      (wMinY + wMaxY) * 0.5,
      (wMinZ + wMaxZ) * 0.5
    );
    this.boxHalfSizes.set(
      Math.max(0.2, (wMaxX - wMinX) * 0.5),
      Math.max(0.2, (wMaxY - wMinY) * 0.5),
      Math.max(0.2, (wMaxZ - wMinZ) * 0.5)
    );
    
    this.updateBoxPlanesAndHelpers();
  }
  
  setBoxFromBounds(elemBox, pad = 0.15) {
    const center = new THREE.Vector3();
    elemBox.getCenter(center);
    const size = new THREE.Vector3();
    elemBox.getSize(size);
    
    this.boxCenter.copy(center);
    this.boxHalfSizes.set(
      Math.max(0.3, size.x * 0.5 + pad),
      Math.max(0.3, size.y * 0.5 + pad),
      Math.max(0.3, size.z * 0.5 + pad)
    );
    this.boxQuaternion.identity();
    
    this.computeBoxRangesFromState();
    this.updateBoxPlanesAndHelpers();
  }
  
  computeBoxRangesFromState() {
    const min = this.bounds.min;
    const size = new THREE.Vector3().subVectors(this.bounds.max, min);
    const bMin = new THREE.Vector3().subVectors(this.boxCenter, this.boxHalfSizes);
    const bMax = new THREE.Vector3().addVectors(this.boxCenter, this.boxHalfSizes);
    
    // Z-up mapping:
    this.boxRanges.minX = Math.max(0, Math.min(1, (bMin.x - min.x) / (size.x || 1)));
    this.boxRanges.maxX = Math.max(0, Math.min(1, (bMax.x - min.x) / (size.x || 1)));
    this.boxRanges.minY = Math.max(0, Math.min(1, (bMin.z - min.z) / (size.z || 1))); // Northing
    this.boxRanges.maxY = Math.max(0, Math.min(1, (bMax.z - min.z) / (size.z || 1)));
    this.boxRanges.minZ = Math.max(0, Math.min(1, (bMin.y - min.y) / (size.y || 1))); // Elevation
    this.boxRanges.maxZ = Math.max(0, Math.min(1, (bMax.y - min.y) / (size.y || 1)));
  }
  
  // ----------------------------------------------------
  // GIZMO RAYCAST PICKING & HOVER
  // ----------------------------------------------------
  getInteractiveGizmos() {
    if (!this.enabled) return [];
    if (this.mode === 'plane') {
      return [
        this.planeArrowGroup,
        this.planeCenterKnob,
        this.planeRotX,
        this.planeRotY,
        this.planeRotZ
      ];
    } else {
      if (!this.boxHelpersVisible) return [];
      // Only the face arrows and face rotation rings are interactive!
      const list = [];
      Object.values(this.faceHandles).forEach(h => {
        if (h.arrowGroup) list.push(h.arrowGroup);
        if (h.ringGroup) list.push(h.ringGroup);
      });
      return list;
    }
  }
  
  intersectGizmos(raycaster) {
    if (!this.enabled) return [];
    const roots = this.getInteractiveGizmos();
    return raycaster.intersectObjects(roots, true);
  }
  
  setHoverGizmo(hitObject) {
    const group = hitObject.userData?.parentGroup || hitObject;
    if (this.hoveredGizmo === group) return;
    this.clearHoverGizmo();
    
    this.hoveredGizmo = group;
    // Highlight all visible meshes in this specific component only
    group.traverse(m => {
      if (m.isMesh && m.material && m.material.visible !== false) {
        if (m.userData._origColor === undefined) m.userData._origColor = m.material.color.getHex();
        m.material.color.setHex(0xffffff); // Bright white hover glow
      }
    });
    
    if (this.onGizmoHover) {
      this.onGizmoHover(group.userData);
    }
  }
  
  clearHoverGizmo() {
    if (!this.hoveredGizmo) return;
    this.hoveredGizmo.traverse(m => {
      if (m.isMesh && m.material && m.userData._origColor !== undefined) {
        m.material.color.setHex(m.userData._origColor);
      }
    });
    this.hoveredGizmo = null;
    if (this.onGizmoHover) this.onGizmoHover(null);
  }
  
  // ----------------------------------------------------
  // GIZMO DRAG MANIPULATION
  // ----------------------------------------------------
  startDrag(hitObject, raycaster, camera, event) {
    const group = hitObject.userData?.parentGroup || hitObject;
    const data = group.userData || {};
    this.activeDragGizmo = group;
    
    if (data.type === 'plane') {
      if (data.part === 'translateNormal') {
        const n = new THREE.Vector3(0, 0, this.planeInvert ? -1 : 1).applyQuaternion(this.planeGroup.quaternion);
        const p0 = this.planeGroup.position.clone();
        const w = new THREE.Vector3().subVectors(camera.position, p0);
        let m = new THREE.Vector3().subVectors(w, n.clone().multiplyScalar(w.dot(n)));
        if (m.lengthSq() < 0.0001) m = camera.up.clone().cross(n);
        m.normalize();
        
        this.dragPlane.setFromNormalAndCoplanarPoint(m, p0);
        this.dragStartHit = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit);
        this.dragStartPos = p0;
        this.dragNormal = n;
      } else if (data.part === 'translateCenter') {
        const camDir = camera.getWorldDirection(new THREE.Vector3()).negate();
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir, this.planeGroup.position);
        this.dragStartHit = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit);
        this.dragStartPos = this.planeGroup.position.clone();
      } else if (data.part.startsWith('rotate')) {
        let axis = new THREE.Vector3();
        if (data.part === 'rotateX') axis.set(1, 0, 0);
        else if (data.part === 'rotateY') axis.set(0, 1, 0);
        else axis.set(0, 0, 1);
        axis.applyQuaternion(this.planeGroup.quaternion).normalize();
        
        const pivot = this.planeGroup.position.clone();
        this.dragPlane.setFromNormalAndCoplanarPoint(axis, pivot);
        this.dragStartHit = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit);
        this.dragStartVec = new THREE.Vector3().subVectors(this.dragStartHit, pivot).projectOnPlane(axis).normalize();
        this.dragStartQuat = this.planeGroup.quaternion.clone();
        this.dragAxis = axis;
      }
    } else if (data.type === 'box') {
      const handleGroup = hitObject.userData?.handleGroup || group.parent || group;
      const faceNormalLoc = (data.normal || handleGroup.userData?.normal || new THREE.Vector3(1, 0, 0)).clone();
      const worldNormal = faceNormalLoc.clone().applyQuaternion(this.boxQuaternion).normalize();
      
      if (data.part === 'faceArrow') {
        // Drag face outward / inward
        const p0 = faceNormalLoc.clone().multiply(this.boxHalfSizes).applyQuaternion(this.boxQuaternion).add(this.boxCenter);
        const w = new THREE.Vector3().subVectors(camera.position, p0);
        let m = new THREE.Vector3().subVectors(w, worldNormal.clone().multiplyScalar(w.dot(worldNormal)));
        if (m.lengthSq() < 0.0001) m = camera.up.clone().cross(worldNormal);
        m.normalize();
        
        this.dragPlane.setFromNormalAndCoplanarPoint(m, p0);
        this.dragStartHit = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit);
        this.dragNormal = worldNormal;
        this.dragFace = data.face;
        this.dragStartCenter = this.boxCenter.clone();
        this.dragStartHalfSizes = this.boxHalfSizes.clone();
      } else if (data.part === 'faceRotate') {
        // Rotate box around the face normal axis passing through the box center
        const axis = worldNormal;
        const pivot = this.boxCenter.clone();
        
        this.dragPlane.setFromNormalAndCoplanarPoint(axis, pivot);
        this.dragStartHit = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit);
        this.dragStartVec = new THREE.Vector3().subVectors(this.dragStartHit, pivot).projectOnPlane(axis).normalize();
        this.dragStartQuat = this.boxQuaternion.clone();
        this.dragAxis = axis;
        this.dragFace = data.face;
      }
    }
  }
  
  onDrag(raycaster, camera, event) {
    if (!this.activeDragGizmo) return;
    const data = this.activeDragGizmo.userData || {};
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(this.dragPlane, hit)) return;
    
    if (data.type === 'plane') {
      if (data.part === 'translateNormal') {
        const delta = new THREE.Vector3().subVectors(hit, this.dragStartHit).dot(this.dragNormal);
        this.planeGroup.position.copy(this.dragStartPos).addScaledVector(this.dragNormal, delta);
        this.updatePlaneFromState();
      } else if (data.part === 'translateCenter') {
        const delta = new THREE.Vector3().subVectors(hit, this.dragStartHit);
        this.planeGroup.position.copy(this.dragStartPos).add(delta);
        this.updatePlaneFromState();
      } else if (data.part.startsWith('rotate')) {
        const pivot = this.planeGroup.position;
        const vCur = new THREE.Vector3().subVectors(hit, pivot).projectOnPlane(this.dragAxis).normalize();
        const cos = Math.max(-1, Math.min(1, this.dragStartVec.dot(vCur)));
        const cross = new THREE.Vector3().crossVectors(this.dragStartVec, vCur);
        const sin = cross.dot(this.dragAxis);
        let angle = Math.atan2(sin, cos);
        if (this.rotationSnap5Deg) {
          const deg = Math.round(THREE.MathUtils.radToDeg(angle) / 5) * 5;
          angle = THREE.MathUtils.degToRad(deg);
        }
        
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(this.dragAxis, angle);
        this.planeGroup.quaternion.copy(deltaQ).multiply(this.dragStartQuat);
        this.updatePlaneFromState();
      }
    } else if (data.type === 'box') {
      if (data.part === 'faceArrow') {
        const delta = new THREE.Vector3().subVectors(hit, this.dragStartHit).dot(this.dragNormal);
        this.applyBoxFaceDelta(this.dragFace, delta);
      } else if (data.part === 'faceRotate') {
        const pivot = this.boxCenter;
        const vCur = new THREE.Vector3().subVectors(hit, pivot).projectOnPlane(this.dragAxis).normalize();
        const cos = Math.max(-1, Math.min(1, this.dragStartVec.dot(vCur)));
        const cross = new THREE.Vector3().crossVectors(this.dragStartVec, vCur);
        const sin = cross.dot(this.dragAxis);
        let angle = Math.atan2(sin, cos);
        if (this.rotationSnap5Deg) {
          const deg = Math.round(THREE.MathUtils.radToDeg(angle) / 5) * 5;
          angle = THREE.MathUtils.degToRad(deg);
        }
        
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(this.dragAxis, angle);
        this.boxQuaternion.copy(deltaQ).multiply(this.dragStartQuat);
        this.updateBoxPlanesAndHelpers();
      }
    }
    
    if (this.onGizmoChange) this.onGizmoChange();
  }
  
  applyBoxFaceDelta(faceId, delta) {
    const H = this.dragStartHalfSizes.clone();
    let shiftLoc = new THREE.Vector3();
    
    if (faceId === 'xPos') {
      const hx = Math.max(0.3, H.x + delta * 0.5);
      const actualDelta = (hx - H.x) * 2;
      this.boxHalfSizes.x = hx;
      shiftLoc.set(actualDelta * 0.5, 0, 0);
    } else if (faceId === 'xNeg') {
      const hx = Math.max(0.3, H.x + delta * 0.5);
      const actualDelta = (hx - H.x) * 2;
      this.boxHalfSizes.x = hx;
      shiftLoc.set(-actualDelta * 0.5, 0, 0);
    } else if (faceId === 'yPos') {
      const hy = Math.max(0.3, H.y + delta * 0.5);
      const actualDelta = (hy - H.y) * 2;
      this.boxHalfSizes.y = hy;
      shiftLoc.set(0, actualDelta * 0.5, 0);
    } else if (faceId === 'yNeg') {
      const hy = Math.max(0.3, H.y + delta * 0.5);
      const actualDelta = (hy - H.y) * 2;
      this.boxHalfSizes.y = hy;
      shiftLoc.set(0, -actualDelta * 0.5, 0);
    } else if (faceId === 'zPos') {
      const hz = Math.max(0.3, H.z + delta * 0.5);
      const actualDelta = (hz - H.z) * 2;
      this.boxHalfSizes.z = hz;
      shiftLoc.set(0, 0, actualDelta * 0.5);
    } else if (faceId === 'zNeg') {
      const hz = Math.max(0.3, H.z + delta * 0.5);
      const actualDelta = (hz - H.z) * 2;
      this.boxHalfSizes.z = hz;
      shiftLoc.set(0, 0, -actualDelta * 0.5);
    }
    
    const shiftWorld = shiftLoc.applyQuaternion(this.boxQuaternion);
    this.boxCenter.copy(this.dragStartCenter).add(shiftWorld);
    
    this.computeBoxRangesFromState();
    this.updateBoxPlanesAndHelpers();
  }
  
  endDrag() {
    this.activeDragGizmo = null;
    this.dragFace = null;
    if (this.onGizmoChange) this.onGizmoChange();
  }
  
  // ----------------------------------------------------
  // SECTION PLANE MATH & UPDATES
  // ----------------------------------------------------
  updatePlaneFromState() {
    const normal = new THREE.Vector3(0, 0, this.planeInvert ? -1 : 1).applyQuaternion(this.planeGroup.quaternion);
    const constant = -normal.dot(this.planeGroup.position);
    this.singlePlane.set(normal, constant);
    
    // Update offset relative to bounds
    const min = this.bounds.min;
    const size = new THREE.Vector3().subVectors(this.bounds.max, min);
    if (this.planeAxis === 'Z') {
      this.planeOffset = Math.max(0, Math.min(1, (this.planeGroup.position.y - min.y) / (size.y || 1)));
    } else if (this.planeAxis === 'X') {
      this.planeOffset = Math.max(0, Math.min(1, (this.planeGroup.position.x - min.x) / (size.x || 1)));
    } else if (this.planeAxis === 'Y') {
      this.planeOffset = Math.max(0, Math.min(1, (this.planeGroup.position.z - min.z) / (size.z || 1)));
    }
    
    this.applyPlanesToMaterials([this.singlePlane]);
  }
  
  setPlaneAxis(axis) {
    this.planeAxis = axis;
    const min = this.bounds.min;
    const size = new THREE.Vector3().subVectors(this.bounds.max, min);
    const center = new THREE.Vector3();
    this.bounds.getCenter(center);
    
    if (axis === 'Z') { // Elevation Height cut (Three.js Y)
      const val = min.y + this.planeOffset * size.y;
      this.planeGroup.position.set(center.x, val, center.z);
      this.planeGroup.rotation.set(Math.PI / 2, 0, 0);
    } else if (axis === 'X') { // Easting cut (Three.js X)
      const val = min.x + this.planeOffset * size.x;
      this.planeGroup.position.set(val, center.y, center.z);
      this.planeGroup.rotation.set(0, Math.PI / 2, 0);
    } else { // Northing cut (Three.js Z)
      const val = min.z + this.planeOffset * size.z;
      this.planeGroup.position.set(center.x, center.y, val);
      this.planeGroup.rotation.set(0, 0, 0);
    }
    
    this.updatePlaneFromState();
  }
  
  // ----------------------------------------------------
  // SECTION BOX MATH & UPDATES
  // ----------------------------------------------------
  updateBoxPlanesAndHelpers() {
    const hx = this.boxHalfSizes.x;
    const hy = this.boxHalfSizes.y;
    const hz = this.boxHalfSizes.z;
    
    this.boxGroup.position.copy(this.boxCenter);
    this.boxGroup.quaternion.copy(this.boxQuaternion);
    
    // Scale wireframe and volume fill
    this.boxWireframe.scale.set(hx * 2, hy * 2, hz * 2);
    this.boxFill.scale.set(hx * 2, hy * 2, hz * 2);
    
    // Update 6 face handles local positions
    if (this.faceHandles) {
      if (this.faceHandles.xPos) this.faceHandles.xPos.position.set(hx, 0, 0);
      if (this.faceHandles.xNeg) this.faceHandles.xNeg.position.set(-hx, 0, 0);
      if (this.faceHandles.yPos) this.faceHandles.yPos.position.set(0, hy, 0);
      if (this.faceHandles.yNeg) this.faceHandles.yNeg.position.set(0, -hy, 0);
      if (this.faceHandles.zPos) this.faceHandles.zPos.position.set(0, 0, hz);
      if (this.faceHandles.zNeg) this.faceHandles.zNeg.position.set(0, 0, -hz);
      
      // Proportionate scaling for face handles
      const minDim = Math.min(hx, hy, hz);
      const handleScale = Math.max(0.7, Math.min(2.2, minDim * 0.16));
      Object.values(this.faceHandles).forEach(h => {
        h.scale.setScalar(handleScale);
      });
    }
    
    // Compute 6 world-space clipping planes
    const faces = [
      { normalLoc: new THREE.Vector3(-1, 0, 0), posLoc: new THREE.Vector3(hx, 0, 0) },   // +X face
      { normalLoc: new THREE.Vector3(1, 0, 0), posLoc: new THREE.Vector3(-hx, 0, 0) },   // -X face
      { normalLoc: new THREE.Vector3(0, -1, 0), posLoc: new THREE.Vector3(0, hy, 0) },   // +Y face
      { normalLoc: new THREE.Vector3(0, 1, 0), posLoc: new THREE.Vector3(0, -hy, 0) },   // -Y face
      { normalLoc: new THREE.Vector3(0, 0, -1), posLoc: new THREE.Vector3(0, 0, hz) },   // +Z face
      { normalLoc: new THREE.Vector3(0, 0, 1), posLoc: new THREE.Vector3(0, 0, -hz) }    // -Z face
    ];
    
    faces.forEach((f, idx) => {
      const worldNormal = f.normalLoc.clone().applyQuaternion(this.boxQuaternion).normalize();
      const worldPos = f.posLoc.clone().applyQuaternion(this.boxQuaternion).add(this.boxCenter);
      const D = -worldNormal.dot(worldPos);
      this.boxPlanes[idx].set(worldNormal, D);
    });
    
    // Update backward compatibility boxHelper
    const bMin = new THREE.Vector3().subVectors(this.boxCenter, this.boxHalfSizes);
    const bMax = new THREE.Vector3().addVectors(this.boxCenter, this.boxHalfSizes);
    this.boxHelper.box.set(bMin, bMax);
    
    this.applyPlanesToMaterials(this.boxPlanes);
  }
  
  setBoxRotationAzimuth(degrees) {
    if (this.rotationSnap5Deg) {
      degrees = Math.round(degrees / 5) * 5;
    }
    const rad = THREE.MathUtils.degToRad(degrees);
    this.boxQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    this.updateBoxPlanesAndHelpers();
  }
  
  getBoxRotationAzimuth() {
    const euler = new THREE.Euler().setFromQuaternion(this.boxQuaternion, 'YXZ');
    let deg = Math.round(THREE.MathUtils.radToDeg(euler.y)) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }

  setBoxHelpersVisible(visible) {
    this.boxHelpersVisible = !!visible;
    if (this.enabled && this.mode === 'box') {
      this.boxGroup.visible = this.boxHelpersVisible;
    }
    if (this.onGizmoChange) this.onGizmoChange();
  }

  toggleBoxHelpersVisible() {
    this.setBoxHelpersVisible(!this.boxHelpersVisible);
    return this.boxHelpersVisible;
  }

  setRotationSnap5Deg(enabled) {
    this.rotationSnap5Deg = !!enabled;
    if (this.onGizmoChange) this.onGizmoChange();
  }

  resetBoxRotation() {
    this.boxQuaternion.identity();
    this.updateBoxPlanesAndHelpers();
    if (this.onGizmoChange) this.onGizmoChange();
  }

  resetPlaneRotation() {
    if (this.planeAxis === 'Z') {
      this.planeGroup.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    } else if (this.planeAxis === 'X') {
      this.planeGroup.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    } else {
      this.planeGroup.quaternion.setFromEuler(new THREE.Euler(0, 0, 0));
    }
    this.updatePlaneFromState();
    if (this.onGizmoChange) this.onGizmoChange();
  }

  resetSectionRotation() {
    if (this.mode === 'box') {
      this.resetBoxRotation();
    } else {
      this.resetPlaneRotation();
    }
  }
  
  // ----------------------------------------------------
  // MAIN ENGINE UPDATE LOOP
  // ----------------------------------------------------
  update() {
    if (!this.enabled) {
      this.clearPlanesFromMaterials();
      this.planeGroup.visible = false;
      this.boxGroup.visible = false;
      return;
    }
    
    if (this.mode === 'plane') {
      this.boxGroup.visible = false;
      this.planeGroup.visible = true;
      this.setPlaneAxis(this.planeAxis);
    } else {
      this.planeGroup.visible = false;
      this.boxGroup.visible = this.boxHelpersVisible;
      this.updateBoxPlanesAndHelpers();
    }
  }
  
  applyPlanesToMaterials(planes) {
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        // Skip clipping helpers, gizmos, and overlays completely
        let curr = obj;
        let isGizmoOrHelper = false;
        while (curr) {
          if (curr === this.planeGroup || curr === this.boxGroup || 
              curr.userData?.isGizmo || curr.userData?.isPlaneHelperMesh || 
              curr.userData?.isPivotHelper || curr.userData?.isHighlightOverlay || curr.userData?.isHoverOverlay) {
            isGizmoOrHelper = true;
            break;
          }
          curr = curr.parent;
        }
        if (isGizmoOrHelper || obj === this.planeMesh || obj === this.boxFill) return;

        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => {
            m.clippingPlanes = planes;
            m.clipShadows = true;
            m.needsUpdate = true;
          });
        } else {
          obj.material.clippingPlanes = planes;
          obj.material.clipShadows = true;
          obj.material.needsUpdate = true;
        }
      }
    });
  }
  
  clearPlanesFromMaterials() {
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        let curr = obj;
        let isGizmoOrHelper = false;
        while (curr) {
          if (curr === this.planeGroup || curr === this.boxGroup || 
              curr.userData?.isGizmo || curr.userData?.isPlaneHelperMesh || 
              curr.userData?.isPivotHelper || curr.userData?.isHighlightOverlay || curr.userData?.isHoverOverlay) {
            isGizmoOrHelper = true;
            break;
          }
          curr = curr.parent;
        }
        if (isGizmoOrHelper || obj === this.planeMesh || obj === this.boxFill) return;

        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => {
            m.clippingPlanes = [];
            m.needsUpdate = true;
          });
        } else {
          obj.material.clippingPlanes = [];
          obj.material.needsUpdate = true;
        }
      }
    });
  }
  
  reset() {
    this.enabled = false;
    this.boxHelpersVisible = true;
    this.rotationSnap5Deg = false;
    this.planeAxis = 'Z';
    this.planeOffset = 0.5;
    this.planeInvert = false;
    this.boxQuaternion.identity();
    this.boxRanges = {
      minX: 0.0, maxX: 1.0,
      minY: 0.0, maxY: 1.0,
      minZ: 0.0, maxZ: 1.0
    };
    this.setFromBoxRanges(this.boxRanges);
    this.update();
  }
}
