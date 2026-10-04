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
    this.helpersVisible = true; // Visibility toggle for Section Plane & Box helpers and gizmos
    this.boxHelpersVisible = true; // Backwards compatibility alias
    this.rotationSnap5Deg = false; // 5-degree angle snapping toggle
    this.showCutawayWireframe = false; // Toggle to show architectural wireframe on cut-off side
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
    this.dragStartBaseDeg = 0;
    this.dragStartAzimuth = 0;
    
    this.onGizmoChange = null;
    this.onGizmoHover = null;
    
    // Dynamic Section Capping & Bold Cut Contour State
    this.activeModel = null;
    this.solidMeshes = [];
    this.stencilGroups = [];
    this.capPlaneGeo = null;
    this.planeCapMesh = null;
    this.boxCapMeshes = [];
    this.boxCapMats = [];
    this.cutContourRibbon = null;
    this.cutContourLines = null;

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
      color: 0x0099ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.36,
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
      new THREE.LineBasicMaterial({ color: 0x0078ff, linewidth: 2.5 })
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
      new THREE.LineBasicMaterial({ color: 0x0078ff, linewidth: 2.5 })
    );
    this.boxWireframe.userData = { isBoxHelper: true, isGizmo: true };
    this.boxWireframe.raycast = () => {}; // Never pickable/selectable
    this.boxGroup.add(this.boxWireframe);
    
    // Oriented semi-transparent fill
    this.boxFill = new THREE.Mesh(
      unitBoxGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0099ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.085,
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

    // ====================================================
    // 3. DYNAMIC SECTION CAPPING & BOLD CUT CONTOURS
    // ====================================================
    this.cappingGroup = new THREE.Group();
    this.cappingGroup.visible = false;
    this.scene.add(this.cappingGroup);

    this.cutContourGroup = new THREE.Group();
    this.cutContourGroup.visible = false;
    this.scene.add(this.cutContourGroup);

    this.initCappingAndContours();
  }
  
  // ----------------------------------------------------
  // SECTION PLANE GIZMO SETUP (1/3 Scale & Thin Profiles)
  // ----------------------------------------------------
  initPlaneGizmo() {
    // A. Normal Translation Arrow (slender: radius 0.04, length 1.2)
    this.planeArrowGroup = new THREE.Group();
    this.planeArrowGroup.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', baseColor: 0x0066ff };
    
    const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 16);
    stemGeo.translate(0, 0.6, 0);
    const coneGeo = new THREE.ConeGeometry(0.14, 0.35, 16);
    coneGeo.translate(0, 1.35, 0);
    
    this.planeArrowMat = new THREE.MeshBasicMaterial({
      color: 0x0066ff,
      depthTest: false,
      transparent: true,
      opacity: 1.0,
      clippingPlanes: []
    });
    this.planeArrowMat.renderOrder = 10000;
    
    const stemMesh = new THREE.Mesh(stemGeo, this.planeArrowMat);
    stemMesh.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', parentGroup: this.planeArrowGroup, _origColor: 0x0066ff };
    const coneMesh = new THREE.Mesh(coneGeo, this.planeArrowMat);
    coneMesh.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', parentGroup: this.planeArrowGroup, _origColor: 0x0066ff };
    this.planeArrowGroup.add(stemMesh);
    this.planeArrowGroup.add(coneMesh);
    
    // Hit cylinder matching the slender arrow
    const hitCylGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 8);
    hitCylGeo.translate(0, 0.8, 0);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, clippingPlanes: [] });
    const hitMesh = new THREE.Mesh(hitCylGeo, hitMat);
    hitMesh.userData = { isGizmo: true, type: 'plane', part: 'translateNormal', parentGroup: this.planeArrowGroup };
    this.planeArrowGroup.add(hitMesh);
    
    // Default orient arrow towards cut-away side (local -Z for un-inverted Align Z)
    this.planeArrowGroup.rotation.x = -Math.PI / 2;
    this.planeGizmoGroup.add(this.planeArrowGroup);
    
    // B. Center Knob (slender: radius 0.18)
    const knobGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const knobMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      transparent: true,
      opacity: 1.0,
      clippingPlanes: []
    });
    knobMat.renderOrder = 10000;
    this.planeCenterKnob = new THREE.Mesh(knobGeo, knobMat);
    this.planeCenterKnob.userData = { isGizmo: true, type: 'plane', part: 'translateCenter' };
    this.planeGizmoGroup.add(this.planeCenterKnob);
    
    // C. Thin Rotation Rings (radius ~0.95, tube ~0.025)
    // 1. Pitch Ring (around local X axis) - Red
    this.planeRotX = this.createRingHelper(0.95, 0.025, 0xff1744, 'plane', 'rotateX');
    this.planeRotX.rotation.y = Math.PI / 2;
    this.planeGizmoGroup.add(this.planeRotX);
    
    // 2. Yaw Ring (around local Y axis) - Green
    this.planeRotY = this.createRingHelper(0.95, 0.025, 0x00e676, 'plane', 'rotateY');
    this.planeRotY.rotation.x = Math.PI / 2;
    this.planeGizmoGroup.add(this.planeRotY);
    
    // 3. Roll Ring (around local Z axis / normal) - Blue
    this.planeRotZ = this.createRingHelper(1.15, 0.025, 0x0066ff, 'plane', 'rotateZ');
    this.planeGizmoGroup.add(this.planeRotZ);
  }
  
  // ----------------------------------------------------
  // SECTION BOX GIZMO SETUP (Outward Arrows + Midpoint Rotation Rings)
  // ----------------------------------------------------
  initBoxGizmo() {
    this.faceHandles = {};
    
    // 6 Face Handles: +X/-X (Red East/West), +Y/-Y (Blue Height RL), +Z/-Z (Green Northing)
    const faceConfigs = [
      { id: 'xPos', normal: new THREE.Vector3(1, 0, 0), color: 0xff1744, label: '+X East' },
      { id: 'xNeg', normal: new THREE.Vector3(-1, 0, 0), color: 0xff1744, label: '-X West' },
      { id: 'yPos', normal: new THREE.Vector3(0, 1, 0), color: 0x0066ff, label: '+Y Height Top' },
      { id: 'yNeg', normal: new THREE.Vector3(0, -1, 0), color: 0x0066ff, label: '-Y Height Bottom' },
      { id: 'zPos', normal: new THREE.Vector3(0, 0, 1), color: 0x00e676, label: '+Z Northing South' },
      { id: 'zNeg', normal: new THREE.Vector3(0, 0, -1), color: 0x00e676, label: '-Z Northing North' }
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
      opacity: 1.0,
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
      baseColor: 0xffa800,
      label: `Rotate around ${label}`
    };
    ringGroup.position.set(0, 1.0, 0); // Positioned at exact midpoint of arrow shaft (y = 1.0)
    
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffa800, // Gold / Amber
      depthTest: false,
      transparent: true,
      opacity: 1.0,
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
      opacity: 1.0,
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
  // DYNAMIC SECTION CAPPING & BOLD CUT CONTOURS
  // ----------------------------------------------------
  initCappingAndContours() {
    this.activeModel = null;
    this.solidMeshes = [];
    this.stencilGroups = [];

    // Shared Stencil Materials for Section Plane
    this.planeStencilMatBack = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.IncrementWrapStencilOp,
      stencilZFail: THREE.IncrementWrapStencilOp,
      stencilZPass: THREE.IncrementWrapStencilOp,
      side: THREE.BackSide,
      clippingPlanes: [this.singlePlane]
    });

    this.planeStencilMatFront = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.DecrementWrapStencilOp,
      stencilZFail: THREE.DecrementWrapStencilOp,
      stencilZPass: THREE.DecrementWrapStencilOp,
      side: THREE.FrontSide,
      clippingPlanes: [this.singlePlane]
    });

    // Shared Stencil Materials for Section Box (6 faces)
    this.boxStencilMatsBack = [];
    this.boxStencilMatsFront = [];
    for (let k = 0; k < 6; k++) {
      this.boxStencilMatsBack.push(new THREE.MeshBasicMaterial({
        depthWrite: false,
        depthTest: false,
        colorWrite: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.IncrementWrapStencilOp,
        stencilZFail: THREE.IncrementWrapStencilOp,
        stencilZPass: THREE.IncrementWrapStencilOp,
        side: THREE.BackSide,
        clippingPlanes: [this.boxPlanes[k]]
      }));

      this.boxStencilMatsFront.push(new THREE.MeshBasicMaterial({
        depthWrite: false,
        depthTest: false,
        colorWrite: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.DecrementWrapStencilOp,
        stencilZFail: THREE.DecrementWrapStencilOp,
        stencilZPass: THREE.DecrementWrapStencilOp,
        side: THREE.FrontSide,
        clippingPlanes: [this.boxPlanes[k]]
      }));
    }

    // Dynamic 45-degree screen-space hatching cap plane material generator
    this.capPlaneGeo = new THREE.PlaneGeometry(1, 1);

    // Section Plane Cap Mesh
    this.planeCapMat = this.createCapMaterial([]);
    this.planeCapMesh = new THREE.Mesh(this.capPlaneGeo, this.planeCapMat);
    this.planeCapMesh.renderOrder = 2;
    this.planeCapMesh.userData = { isCapHelper: true, isGizmo: true };
    this.planeCapMesh.raycast = () => {};
    this.planeCapMesh.onAfterRender = (renderer) => {
      renderer.clearStencil();
    };
    this.cappingGroup.add(this.planeCapMesh);

    // Section Box Cap Meshes (6 faces)
    this.boxCapMeshes = [];
    this.boxCapMats = [];
    for (let k = 0; k < 6; k++) {
      const bMat = this.createCapMaterial(this.boxPlanes.filter((_, idx) => idx !== k));
      this.boxCapMats.push(bMat);
      const bMesh = new THREE.Mesh(this.capPlaneGeo, bMat);
      bMesh.renderOrder = (k + 1) * 2; // 2, 4, 6, 8, 10, 12
      bMesh.userData = { isCapHelper: true, isGizmo: true };
      bMesh.raycast = () => {};
      bMesh.onAfterRender = (renderer) => {
        renderer.clearStencil();
      };
      this.boxCapMeshes.push(bMesh);
      this.cappingGroup.add(bMesh);
    }

    // Bold Cut Contour Mesh: Solid Ribbon (two triangles per segment) + Crisp Center Line
    const ribbonGeo = new THREE.BufferGeometry();
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -4.0
    });
    this.cutContourRibbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    this.cutContourRibbon.renderOrder = 25;
    this.cutContourRibbon.userData = { isCapHelper: true, isGizmo: true };
    this.cutContourRibbon.raycast = () => {};
    this.cutContourGroup.add(this.cutContourRibbon);

    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x0f172a,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -3.0,
      polygonOffsetUnits: -6.0
    });
    this.cutContourLines = new THREE.LineSegments(lineGeo, lineMat);
    this.cutContourLines.renderOrder = 26;
    this.cutContourLines.userData = { isCapHelper: true, isGizmo: true };
    this.cutContourLines.raycast = () => {};
    this.cutContourGroup.add(this.cutContourLines);
  }

  createCapMaterial(clipPlanes = []) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd9b606,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
      clippingPlanes: clipPlanes,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0
    });

    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        
        // Architectural 45-degree diagonal screen-space hatching
        float coord = gl_FragCoord.x + gl_FragCoord.y;
        float spacing = 14.0;   // 14px constant screen-space spacing
        float lineWidth = 1.8; // 1.8px constant anti-aliased line thickness
        float m = mod(coord, spacing);
        float line = smoothstep(lineWidth, 0.0, m) + smoothstep(spacing - lineWidth, spacing, m);
        
        // User-specified warm golden mustard yellow base (#d9b606)
        vec3 bgColor = vec3(0.851, 0.714, 0.024);
        // Deep bronze/amber hatch line
        vec3 hatchColor = vec3(0.380, 0.231, 0.016);
        
        gl_FragColor = vec4(mix(bgColor, hatchColor, line), 1.0);
        `
      );
    };

    return mat;
  }

  isSolidMesh(mesh) {
    if (!mesh || !mesh.isMesh || !mesh.geometry) return false;
    let curr = mesh;
    while (curr) {
      if (curr.userData?.isGizmo || curr.userData?.isPlaneHelperMesh ||
          curr.userData?.isPivotHelper || curr.userData?.isHighlightOverlay ||
          curr.userData?.isHoverOverlay || curr.userData?.isCapHelper ||
          curr.userData?.isStencilGroup || curr.userData?.isStencilHelper) {
        return false;
      }
      curr = curr.parent;
    }

    // Exclude open site/terrain/topography meshes from stencil capping
    // (Open surface meshes lack closed back-faces and cause stencil buffer winding leaks)
    const cat = (mesh.userData?.category || mesh.userData?.rawCategory || mesh.name || '').toLowerCase();
    const elemName = (mesh.userData?.element || '').toLowerCase();
    if (cat.includes('site') || cat.includes('terrain') || cat.includes('topograph') ||
        elemName.includes('turf') || elemName.includes('strata') || elemName.includes('topography')) {
      if (!elemName.includes('foundation') && !elemName.includes('pad')) {
        return false;
      }
    }

    const mat = mesh.material;
    if (mat) {
      if (Array.isArray(mat)) {
        if (mat.some(m => m.transparent && m.opacity < 0.6)) return false;
      } else {
        if (mat.transparent && mat.opacity < 0.6) return false;
      }
    }
    return true;
  }

  setModel(model) {
    this.clearModel();
    this.activeModel = model;
    if (!model) return;

    const solidMeshes = [];
    model.traverse(obj => {
      if (obj.isMesh && obj.geometry && this.isSolidMesh(obj)) {
        solidMeshes.push(obj);
      }
    });
    this.solidMeshes = solidMeshes;

    this.setupStencilGroups();
    this.update();
  }

  clearModel() {
    if (this.stencilGroups) {
      this.stencilGroups.forEach(entry => {
        if (entry.parentMesh && entry.sGroup) {
          entry.parentMesh.remove(entry.sGroup);
        }
      });
      this.stencilGroups = [];
    }
    if (this.solidMeshes) {
      this.solidMeshes.forEach(mesh => {
        if (mesh.userData && mesh.userData._origRenderOrder !== undefined) {
          mesh.renderOrder = mesh.userData._origRenderOrder;
        } else {
          mesh.renderOrder = 0;
        }
      });
      this.solidMeshes = [];
    }
    this.activeModel = null;
    this.clearCutContours();
  }

  setupStencilGroups() {
    if (!this.solidMeshes) return;
    this.stencilGroups = [];

    this.solidMeshes.forEach(mesh => {
      const sGroup = new THREE.Group();
      sGroup.userData = { isStencilGroup: true, isGizmo: true };
      sGroup.raycast = () => {};

      // 1. Single Plane pair
      const pBack = new THREE.Mesh(mesh.geometry, this.planeStencilMatBack);
      pBack.renderOrder = 1;
      pBack.raycast = () => {};
      pBack.userData = { isGizmo: true, isStencilHelper: true };

      const pFront = new THREE.Mesh(mesh.geometry, this.planeStencilMatFront);
      pFront.renderOrder = 1;
      pFront.raycast = () => {};
      pFront.userData = { isGizmo: true, isStencilHelper: true };

      const planePair = new THREE.Group();
      planePair.add(pBack);
      planePair.add(pFront);
      sGroup.add(planePair);

      // 2. Box pairs (6 faces)
      const boxPairs = [];
      for (let k = 0; k < 6; k++) {
        const bBack = new THREE.Mesh(mesh.geometry, this.boxStencilMatsBack[k]);
        bBack.renderOrder = (k + 1) * 2 - 1; // 1, 3, 5, 7, 9, 11
        bBack.raycast = () => {};
        bBack.userData = { isGizmo: true, isStencilHelper: true };

        const bFront = new THREE.Mesh(mesh.geometry, this.boxStencilMatsFront[k]);
        bFront.renderOrder = (k + 1) * 2 - 1;
        bFront.raycast = () => {};
        bFront.userData = { isGizmo: true, isStencilHelper: true };

        const bPair = new THREE.Group();
        bPair.add(bBack);
        bPair.add(bFront);
        sGroup.add(bPair);
        boxPairs.push(bPair);
      }

      mesh.add(sGroup);
      this.stencilGroups.push({ sGroup, planePair, boxPairs, parentMesh: mesh });
    });
  }

  clearCutContours() {
    if (this.cutContourRibbon && this.cutContourRibbon.geometry) {
      this.cutContourRibbon.geometry.dispose();
      this.cutContourRibbon.geometry = new THREE.BufferGeometry();
      this.cutContourRibbon.visible = false;
    }
    if (this.cutContourLines && this.cutContourLines.geometry) {
      this.cutContourLines.geometry.dispose();
      this.cutContourLines.geometry = new THREE.BufferGeometry();
      this.cutContourLines.visible = false;
    }
  }

  updateCutContour() {
    if (!this.enabled || !this.solidMeshes || this.solidMeshes.length === 0) {
      this.clearCutContours();
      return;
    }

    const ribbonPositions = [];
    const linePositions = [];

    const planesToIntersect = this.mode === 'box' ? this.boxPlanes : [this.singlePlane];
    const boundsMaxDim = Math.max(
      this.bounds.max.x - this.bounds.min.x,
      this.bounds.max.y - this.bounds.min.y,
      this.bounds.max.z - this.bounds.min.z,
      10
    );
    // Ribbon half width: half of previous thickness (refined architectural line weight)
    const halfWidth = Math.max(0.0075, Math.min(0.03, boundsMaxDim * 0.00045));

    const meshBox = new THREE.Box3();
    const invMatrix = new THREE.Matrix4();
    const localPlane = new THREE.Plane();
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const pA = new THREE.Vector3(), pB = new THREE.Vector3();
    const wA = new THREE.Vector3(), wB = new THREE.Vector3();
    const segDir = new THREE.Vector3(), inPlanePerp = new THREE.Vector3();

    for (let pi = 0; pi < planesToIntersect.length; pi++) {
      const cutPlane = planesToIntersect[pi];
      const otherBoxPlanes = this.mode === 'box' ? this.boxPlanes.filter((_, idx) => idx !== pi) : null;
      const planeNormal = cutPlane.normal;

      // Orthonormal in-plane basis for round end caps (圆头) and rounded corner joints
      let uX = 0, uY = 0, uZ = 0;
      if (Math.abs(planeNormal.z) < 0.9) {
        uX = planeNormal.y;
        uY = -planeNormal.x;
        uZ = 0;
      } else {
        uX = -planeNormal.z;
        uY = 0;
        uZ = planeNormal.x;
      }
      const uLen = Math.hypot(uX, uY, uZ);
      uX /= uLen; uY /= uLen; uZ /= uLen;

      let vX = planeNormal.y * uZ - planeNormal.z * uY;
      let vY = planeNormal.z * uX - planeNormal.x * uZ;
      let vZ = planeNormal.x * uY - planeNormal.y * uX;
      const vLen = Math.hypot(vX, vY, vZ);
      vX /= vLen; vY /= vLen; vZ /= vLen;

      // Precalculate 16-segment circle offsets for round end caps
      const M = 16;
      const circleOffsets = [];
      for (let j = 0; j < M; j++) {
        const theta = (j * 2 * Math.PI) / M;
        const cosT = Math.cos(theta) * halfWidth;
        const sinT = Math.sin(theta) * halfWidth;
        circleOffsets.push({
          dx: cosT * uX + sinT * vX,
          dy: cosT * uY + sinT * vY,
          dz: cosT * uZ + sinT * vZ
        });
      }

      // Unique endpoint registry for round end caps on this cutting plane
      const planeEndPoints = [];
      const seenEndPoints = new Set();
      const prec = 2000; // 0.5mm spatial quantization
      const registerEndPoint = (pt) => {
        const key = `${Math.round(pt.x * prec)}_${Math.round(pt.y * prec)}_${Math.round(pt.z * prec)}`;
        if (!seenEndPoints.has(key)) {
          seenEndPoints.add(key);
          planeEndPoints.push({ x: pt.x, y: pt.y, z: pt.z });
        }
      };

      for (let mi = 0; mi < this.solidMeshes.length; mi++) {
        const mesh = this.solidMeshes[mi];
        if (!mesh.visible || !mesh.parent) continue;

        meshBox.setFromObject(mesh);
        if (meshBox.isEmpty() || !meshBox.intersectsPlane(cutPlane)) continue;

        const geom = mesh.geometry;
        if (!geom || !geom.attributes || !geom.attributes.position) continue;

        const posAttr = geom.attributes.position;
        const indexAttr = geom.index;
        const vertexCount = indexAttr ? indexAttr.count : posAttr.count;
        if (vertexCount < 3) continue;

        invMatrix.copy(mesh.matrixWorld).invert();
        localPlane.copy(cutPlane).applyMatrix4(invMatrix);
        const ln = localPlane.normal;
        const ld = localPlane.constant;

        const getIdx = (t) => (indexAttr ? indexAttr.getX(t) : t);

        for (let t = 0; t < vertexCount; t += 3) {
          const i0 = getIdx(t);
          const i1 = getIdx(t + 1);
          const i2 = getIdx(t + 2);

          vA.fromBufferAttribute(posAttr, i0);
          vB.fromBufferAttribute(posAttr, i1);
          vC.fromBufferAttribute(posAttr, i2);

          const d0 = vA.x * ln.x + vA.y * ln.y + vA.z * ln.z + ld;
          const d1 = vB.x * ln.x + vB.y * ln.y + vB.z * ln.z + ld;
          const d2 = vC.x * ln.x + vC.y * ln.y + vC.z * ln.z + ld;

          if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0)) continue;

          // Triangle intersects cutting plane! Compute 2 intersection points in local space:
          if ((d0 >= 0 && d1 < 0 && d2 < 0) || (d0 <= 0 && d1 > 0 && d2 > 0)) {
            const t1 = -d0 / (d1 - d0);
            const t2 = -d0 / (d2 - d0);
            pA.copy(vA).lerp(vB, t1);
            pB.copy(vA).lerp(vC, t2);
          } else if ((d1 >= 0 && d0 < 0 && d2 < 0) || (d1 <= 0 && d0 > 0 && d2 > 0)) {
            const t1 = -d1 / (d0 - d1);
            const t2 = -d1 / (d2 - d1);
            pA.copy(vB).lerp(vA, t1);
            pB.copy(vB).lerp(vC, t2);
          } else {
            const t1 = -d2 / (d0 - d2);
            const t2 = -d2 / (d1 - d2);
            pA.copy(vC).lerp(vA, t1);
            pB.copy(vC).lerp(vB, t2);
          }

          if (pA.distanceToSquared(pB) < 1e-7) continue;

          // Transform to world coordinates:
          wA.copy(pA).applyMatrix4(mesh.matrixWorld);
          wB.copy(pB).applyMatrix4(mesh.matrixWorld);

          // If in Box mode, clip segment [wA, wB] against remaining 5 box planes:
          let clipRes = null;
          if (otherBoxPlanes) {
            clipRes = this.clipSegmentAgainstPlanes(wA, wB, otherBoxPlanes);
            if (!clipRes) continue;
          }

          // Line segment (recorded for structural test assertions)
          linePositions.push(wA.x, wA.y, wA.z, wB.x, wB.y, wB.z);

          // Generate bold ribbon quad (2 triangles) along the cutting plane
          segDir.subVectors(wB, wA).normalize();
          inPlanePerp.crossVectors(segDir, planeNormal).normalize().multiplyScalar(halfWidth);

          const q1x = wA.x + inPlanePerp.x, q1y = wA.y + inPlanePerp.y, q1z = wA.z + inPlanePerp.z;
          const q2x = wA.x - inPlanePerp.x, q2y = wA.y - inPlanePerp.y, q2z = wA.z - inPlanePerp.z;
          const q3x = wB.x + inPlanePerp.x, q3y = wB.y + inPlanePerp.y, q3z = wB.z + inPlanePerp.z;
          const q4x = wB.x - inPlanePerp.x, q4y = wB.y - inPlanePerp.y, q4z = wB.z - inPlanePerp.z;

          // Triangle 1: q1, q2, q3
          ribbonPositions.push(q1x, q1y, q1z, q2x, q2y, q2z, q3x, q3y, q3z);
          // Triangle 2: q2, q4, q3
          ribbonPositions.push(q2x, q2y, q2z, q4x, q4y, q4z, q3x, q3y, q3z);

          // Register endpoints for round end caps (圆头) and rounded corner joints
          if (!clipRes || !clipRes.clipped0) {
            registerEndPoint(wA);
          }
          if (!clipRes || !clipRes.clipped1) {
            registerEndPoint(wB);
          }
        }
      }

      // Emit round end caps (16-triangle circular fan at each unique endpoint)
      for (let ei = 0; ei < planeEndPoints.length; ei++) {
        const ep = planeEndPoints[ei];
        for (let j = 0; j < M; j++) {
          const jNext = (j + 1) % M;
          const c1 = circleOffsets[j];
          const c2 = circleOffsets[jNext];
          ribbonPositions.push(
            ep.x, ep.y, ep.z,
            ep.x + c1.dx, ep.y + c1.dy, ep.z + c1.dz,
            ep.x + c2.dx, ep.y + c2.dy, ep.z + c2.dz
          );
        }
      }
    }

    if (ribbonPositions.length > 0) {
      this.cutContourRibbon.geometry.dispose();
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonPositions, 3));
      this.cutContourRibbon.geometry = rGeo;
      this.cutContourRibbon.visible = true;
    } else {
      this.cutContourRibbon.visible = false;
    }

    if (linePositions.length > 0) {
      this.cutContourLines.geometry.dispose();
      const lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      this.cutContourLines.geometry = lGeo;
      this.cutContourLines.visible = false; // Hide 1px lines to avoid rasterization z-fighting dashed lines on top of the ribbon
    } else {
      this.cutContourLines.visible = false;
    }
  }

  clipSegmentAgainstPlanes(p0, p1, planes) {
    let u0 = 0.0;
    let u1 = 1.0;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;

    for (let i = 0; i < planes.length; i++) {
      const pl = planes[i];
      const n = pl.normal;
      const c = pl.constant;
      const d0 = n.x * p0.x + n.y * p0.y + n.z * p0.z + c;
      const d1 = n.x * p1.x + n.y * p1.y + n.z * p1.z + c;

      if (d0 < 0 && d1 < 0) return null; // Both outside
      if (d0 >= 0 && d1 >= 0) continue;   // Both inside

      const t = d0 / (d0 - d1);
      if (d0 < 0) {
        if (t > u0) u0 = t;
      } else {
        if (t < u1) u1 = t;
      }
      if (u0 > u1) return null;
    }

    const clipped0 = (u0 > 1e-4);
    const clipped1 = (u1 < 1.0 - 1e-4);

    const p0x = p0.x, p0y = p0.y, p0z = p0.z;
    p0.set(p0x + u0 * dx, p0y + u0 * dy, p0z + u0 * dz);
    p1.set(p0x + u1 * dx, p0y + u1 * dy, p0z + u1 * dz);
    return { clipped0, clipped1 };
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
    
    if (this.planeCapMesh) {
      this.planeCapMesh.scale.set(maxDim * 3, maxDim * 3, 1);
    }
    if (this.boxCapMeshes) {
      this.boxCapMeshes.forEach(bm => bm.scale.set(maxDim * 3, maxDim * 3, 1));
    }
    
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
  
  setBoxFromBounds(elemBox, pad = 0.08) {
    const center = new THREE.Vector3();
    elemBox.getCenter(center);
    const size = new THREE.Vector3();
    elemBox.getSize(size);
    
    this.boxCenter.copy(center);
    this.boxHalfSizes.set(
      Math.max(0.05, size.x * 0.5 + pad),
      Math.max(0.05, size.y * 0.5 + pad),
      Math.max(0.05, size.z * 0.5 + pad)
    );
    this.boxQuaternion.identity();
    
    this.computeBoxRangesFromState();
    this.updateBoxPlanesAndHelpers();
    if (this.onGizmoChange) this.onGizmoChange();
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
    if (!this.enabled || !this.helpersVisible) return [];
    if (this.mode === 'plane') {
      return [
        this.planeArrowGroup,
        this.planeCenterKnob,
        this.planeRotX,
        this.planeRotY,
        this.planeRotZ
      ];
    } else {
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
    if (!hitObject) return;
    const group = hitObject.userData?.parentGroup || hitObject;
    if (this.hoveredGizmo === group) return;
    this.clearHoverGizmo();
    
    this.hoveredGizmo = group;
    // Highlight all visible meshes in this specific component: vibrant yellow hover glow
    const hoverColor = 0xffea00;
    const baseColor = group.userData?.baseColor;
    group.traverse(m => {
      if (m.isMesh && m.material && m.material.visible !== false) {
        if (m.userData._origColor === undefined) {
          m.userData._origColor = baseColor !== undefined ? baseColor : (m.material.color ? m.material.color.getHex() : undefined);
        }
        if (m.material.color) m.material.color.setHex(hoverColor);
      }
    });
    
    if (this.onGizmoHover) {
      this.onGizmoHover(group.userData);
    }
  }
  
  clearHoverGizmo() {
    if (!this.hoveredGizmo) return;
    const baseColor = this.hoveredGizmo.userData?.baseColor;
    this.hoveredGizmo.traverse(m => {
      if (m.isMesh && m.material && m.material.color) {
        if (baseColor !== undefined) {
          m.material.color.setHex(baseColor);
        } else if (m.userData._origColor !== undefined) {
          m.material.color.setHex(m.userData._origColor);
        }
      }
    });
    this.hoveredGizmo = null;
    if (this.onGizmoHover) this.onGizmoHover(null);
  }
  
  // ----------------------------------------------------
  // GIZMO DRAG MANIPULATION
  // ----------------------------------------------------
  startDrag(hitObject, raycaster, camera, event) {
    if (!hitObject) return;
    const group = hitObject.userData?.parentGroup || hitObject;
    const data = group.userData || {};
    this.activeDragGizmo = group;
    
    if (data.type === 'plane') {
      if (data.part === 'translateNormal') {
        const arrowDirLocal = new THREE.Vector3(0, 0, this.planeInvert ? 1 : -1);
        const arrowDirWorld = arrowDirLocal.applyQuaternion(this.planeGroup.quaternion).normalize();
        const p0 = this.planeGroup.position.clone();
        const w = new THREE.Vector3().subVectors(camera.position, p0);
        let m = new THREE.Vector3().subVectors(w, arrowDirWorld.clone().multiplyScalar(w.dot(arrowDirWorld)));
        if (m.lengthSq() < 0.0001) m = camera.up.clone().cross(arrowDirWorld);
        m.normalize();
        
        this.dragPlane.setFromNormalAndCoplanarPoint(m, p0);
        this.dragStartHit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit)) {
          this.dragStartHit.copy(p0);
        }
        this.dragStartPos = p0;
        this.dragNormal = arrowDirWorld;
      } else if (data.part === 'translateCenter') {
        const camDir = camera.getWorldDirection(new THREE.Vector3()).negate();
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir, this.planeGroup.position);
        this.dragStartHit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit)) {
          this.dragStartHit.copy(this.planeGroup.position);
        }
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
        if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit)) {
          this.dragStartHit.copy(pivot);
        }
        this.dragStartVec = new THREE.Vector3().subVectors(this.dragStartHit, pivot).projectOnPlane(axis).normalize();
        this.dragStartQuat = this.planeGroup.quaternion.clone();
        this.dragAxis = axis;

        const startEuler = new THREE.Euler().setFromQuaternion(this.planeGroup.quaternion, 'YXZ');
        if (data.part === 'rotateX') {
          this.dragStartBaseDeg = THREE.MathUtils.radToDeg(startEuler.x);
        } else if (data.part === 'rotateY') {
          this.dragStartBaseDeg = THREE.MathUtils.radToDeg(startEuler.y);
        } else {
          this.dragStartBaseDeg = THREE.MathUtils.radToDeg(startEuler.z);
        }
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
        if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit)) {
          this.dragStartHit.copy(p0);
        }
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
        if (!raycaster.ray.intersectPlane(this.dragPlane, this.dragStartHit)) {
          this.dragStartHit.copy(pivot);
        }
        this.dragStartVec = new THREE.Vector3().subVectors(this.dragStartHit, pivot).projectOnPlane(axis).normalize();
        this.dragStartQuat = this.boxQuaternion.clone();
        this.dragAxis = axis;
        this.dragFace = data.face;
        this.dragStartAzimuth = this.getBoxRotationAzimuth();
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
          const totalDeg = (this.dragStartBaseDeg || 0) + THREE.MathUtils.radToDeg(angle);
          const snappedDeg = Math.round(totalDeg / 5) * 5;
          angle = THREE.MathUtils.degToRad(snappedDeg - (this.dragStartBaseDeg || 0));
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
          const totalDeg = (this.dragStartAzimuth || 0) + THREE.MathUtils.radToDeg(angle);
          const snappedDeg = Math.round(totalDeg / 5) * 5;
          angle = THREE.MathUtils.degToRad(snappedDeg - (this.dragStartAzimuth || 0));
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

    // 1. Dynamic arrow orientation: points towards cut-off side (-normal)
    // Local -Z is cut side when planeInvert is false; local +Z when true
    if (this.planeArrowGroup) {
      this.planeArrowGroup.rotation.x = this.planeInvert ? (Math.PI / 2) : (-Math.PI / 2);
    }

    // 2. Dynamic arrow color following dominant axis
    this.updatePlaneArrowAppearance();
    
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
    
    // Update Cap Mesh position, orientation & visibility
    if (this.planeCapMesh) {
      this.planeCapMesh.visible = (this.enabled && this.mode === 'plane');
      const coplanarPoint = normal.clone().multiplyScalar(-constant);
      this.planeCapMesh.position.copy(coplanarPoint);
      this.planeCapMesh.lookAt(coplanarPoint.clone().sub(normal));
    }
    if (this.boxCapMeshes) {
      this.boxCapMeshes.forEach(bm => bm.visible = (this.enabled && this.mode === 'box'));
    }

    if (this.planeStencilMatBack) {
      this.planeStencilMatBack.clippingPlanes = [this.singlePlane];
      this.planeStencilMatBack.needsUpdate = true;
    }
    if (this.planeStencilMatFront) {
      this.planeStencilMatFront.clippingPlanes = [this.singlePlane];
      this.planeStencilMatFront.needsUpdate = true;
    }

    this.applyPlanesToMaterials([this.singlePlane]);
    this.updateCutContour();
  }

  updatePlaneArrowAppearance() {
    if (!this.planeArrowMat || !this.planeArrowGroup) return;
    const worldNormal = new THREE.Vector3(0, 0, this.planeInvert ? -1 : 1).applyQuaternion(this.planeGroup.quaternion).normalize();
    const absX = Math.abs(worldNormal.x); // BIM X (Easting)
    const absZ = Math.abs(worldNormal.y); // BIM Z (Elevation RL Height)
    const absY = Math.abs(worldNormal.z); // BIM Y (Northing)

    let axisColor = 0x0066ff; // Default Z Blue
    if (absZ >= absX && absZ >= absY) {
      axisColor = 0x0066ff; // Blue (Elevation RL)
    } else if (absX >= absY) {
      axisColor = 0xff1744; // Red (Easting)
    } else {
      axisColor = 0x00e676; // Green (Northing)
    }

    this.planeArrowGroup.userData.baseColor = axisColor;
    this.planeArrowGroup.traverse(m => {
      if (m.isMesh && m.userData) {
        m.userData._origColor = axisColor;
      }
    });

    if (this.hoveredGizmo !== this.planeArrowGroup) {
      this.planeArrowMat.color.setHex(axisColor);
    }
  }

  movePlaneToTarget(elemBox) {
    if (!elemBox || elemBox.isEmpty()) return;

    // Normal pointing into retained half-space
    const normal = new THREE.Vector3(0, 0, this.planeInvert ? -1 : 1).applyQuaternion(this.planeGroup.quaternion).normalize();

    // Find the critical corner of elemBox that minimizes normal.dot(p)
    const criticalCorner = new THREE.Vector3(
      normal.x >= 0 ? elemBox.min.x : elemBox.max.x,
      normal.y >= 0 ? elemBox.min.y : elemBox.max.y,
      normal.z >= 0 ? elemBox.min.z : elemBox.max.z
    );

    // Back off slightly (0.015m = 1.5cm) towards the cut side (-normal)
    // to strictly preserve 100% element visibility without slicing
    const planeContactPoint = criticalCorner.clone().addScaledVector(normal, -0.015);

    // Project element center onto the cutting plane to position the gizmo directly over the element
    const elemCenter = new THREE.Vector3();
    elemBox.getCenter(elemCenter);
    const distToPlane = normal.dot(new THREE.Vector3().subVectors(elemCenter, planeContactPoint));
    const gizmoCenter = elemCenter.clone().addScaledVector(normal, -distToPlane);

    this.planeGroup.position.copy(gizmoCenter);
    this.updatePlaneFromState();
    if (this.onGizmoChange) this.onGizmoChange();
  }
  
  setPlaneAxis(axis) {
    this.planeAxis = axis;
    if (this.enabled && this.mode === 'plane') {
      this.planeGroup.visible = this.helpersVisible;
    }
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

      if (this.boxCapMeshes && this.boxCapMeshes[idx]) {
        this.boxCapMeshes[idx].visible = (this.enabled && this.mode === 'box');
        this.boxCapMeshes[idx].position.copy(worldPos);
        this.boxCapMeshes[idx].lookAt(worldPos.clone().sub(worldNormal));
      }

      if (this.boxStencilMatsBack && this.boxStencilMatsBack[idx]) {
        this.boxStencilMatsBack[idx].clippingPlanes = [this.boxPlanes[idx]];
        this.boxStencilMatsBack[idx].needsUpdate = true;
      }
      if (this.boxStencilMatsFront && this.boxStencilMatsFront[idx]) {
        this.boxStencilMatsFront[idx].clippingPlanes = [this.boxPlanes[idx]];
        this.boxStencilMatsFront[idx].needsUpdate = true;
      }
      if (this.boxCapMats && this.boxCapMats[idx]) {
        this.boxCapMats[idx].clippingPlanes = this.boxPlanes.filter((_, i) => i !== idx);
        this.boxCapMats[idx].needsUpdate = true;
      }
    });

    if (this.planeCapMesh) {
      this.planeCapMesh.visible = (this.enabled && this.mode === 'plane');
    }
    
    // Update backward compatibility boxHelper
    const bMin = new THREE.Vector3().subVectors(this.boxCenter, this.boxHalfSizes);
    const bMax = new THREE.Vector3().addVectors(this.boxCenter, this.boxHalfSizes);
    this.boxHelper.box.set(bMin, bMax);
    
    this.applyPlanesToMaterials(this.boxPlanes);
    this.updateCutContour();
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

  setHelpersVisible(visible) {
    this.helpersVisible = !!visible;
    this.boxHelpersVisible = this.helpersVisible;
    if (!this.helpersVisible && this.hoveredGizmo) {
      this.clearHoverGizmo();
    }
    if (!this.enabled) {
      this.planeGroup.visible = false;
      this.boxGroup.visible = false;
    } else if (this.mode === 'plane') {
      this.planeGroup.visible = this.helpersVisible;
      this.boxGroup.visible = false;
    } else {
      this.planeGroup.visible = false;
      this.boxGroup.visible = this.helpersVisible;
    }
    if (this.onGizmoChange) this.onGizmoChange();
  }

  toggleHelpersVisible() {
    this.setHelpersVisible(!this.helpersVisible);
    return this.helpersVisible;
  }

  setBoxHelpersVisible(visible) {
    this.setHelpersVisible(visible);
  }

  toggleBoxHelpersVisible() {
    return this.toggleHelpersVisible();
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
      if (this.cappingGroup) this.cappingGroup.visible = false;
      if (this.cutContourGroup) this.cutContourGroup.visible = false;
      if (this.stencilGroups) {
        this.stencilGroups.forEach(e => {
          if (e.sGroup) e.sGroup.visible = false;
        });
      }
      if (this.solidMeshes) {
        this.solidMeshes.forEach(m => {
          if (m.userData && m.userData._origRenderOrder !== undefined) {
            m.renderOrder = m.userData._origRenderOrder;
          } else {
            m.renderOrder = 0;
          }
        });
      }
      this.clearCutContours();
      return;
    }
    
    if (this.cappingGroup) this.cappingGroup.visible = true;
    if (this.cutContourGroup) this.cutContourGroup.visible = true;

    if (this.solidMeshes) {
      this.solidMeshes.forEach(m => {
        if (m.userData._origRenderOrder === undefined) {
          m.userData._origRenderOrder = m.renderOrder;
        }
        m.renderOrder = 20;
      });
    }

    if (this.mode === 'plane') {
      this.boxGroup.visible = false;
      this.planeGroup.visible = this.helpersVisible;
      if (this.planeCapMesh) this.planeCapMesh.visible = true;
      if (this.boxCapMeshes) this.boxCapMeshes.forEach(bm => bm.visible = false);

      if (this.stencilGroups) {
        this.stencilGroups.forEach(e => {
          if (e.sGroup) e.sGroup.visible = true;
          if (e.planePair) e.planePair.visible = true;
          if (e.boxPairs) e.boxPairs.forEach(bp => bp.visible = false);
        });
      }

      this.setPlaneAxis(this.planeAxis);
    } else {
      this.planeGroup.visible = false;
      this.boxGroup.visible = this.helpersVisible;
      if (this.planeCapMesh) this.planeCapMesh.visible = false;
      if (this.boxCapMeshes) this.boxCapMeshes.forEach(bm => bm.visible = true);

      if (this.stencilGroups) {
        this.stencilGroups.forEach(e => {
          if (e.sGroup) e.sGroup.visible = true;
          if (e.planePair) e.planePair.visible = false;
          if (e.boxPairs) e.boxPairs.forEach(bp => bp.visible = true);
        });
      }

      this.updateBoxPlanesAndHelpers();
    }
  }
  
  get clippingPlanes() {
    return this.enabled ? (this.mode === 'box' ? this.boxPlanes : [this.singlePlane]) : [];
  }

  applyPlanesToMaterials(planes) {
    const effectivePlanes = this.enabled ? planes : [];
    const edgePlanes = (this.enabled && !this.showCutawayWireframe) ? effectivePlanes : [];
    this.scene.traverse((obj) => {
      // Sync clipping planes to architectural edge line segments if present
      if (obj.isMesh && obj.userData && obj.userData.edgeLines && obj.userData.edgeLines.material) {
        obj.userData.edgeLines.material.clippingPlanes = edgePlanes;
        obj.userData.edgeLines.material.needsUpdate = true;
      }

      if (obj.isMesh && obj.material) {
        // Skip clipping helpers, gizmos, capping and stencil overlays completely
        let curr = obj;
        let isGizmoOrHelper = false;
        while (curr) {
          if (curr === this.planeGroup || curr === this.boxGroup || 
              curr === this.cappingGroup || curr === this.cutContourGroup ||
              curr.userData?.isGizmo || curr.userData?.isPlaneHelperMesh || 
              curr.userData?.isPivotHelper || curr.userData?.isHighlightOverlay || curr.userData?.isHoverOverlay ||
              curr.userData?.isCapHelper || curr.userData?.isStencilGroup || curr.userData?.isStencilHelper) {
            isGizmoOrHelper = true;
            break;
          }
          curr = curr.parent;
        }
        if (isGizmoOrHelper || obj === this.planeMesh || obj === this.boxFill) return;

        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => {
            m.clippingPlanes = effectivePlanes;
            m.clipShadows = true;
            m.needsUpdate = true;
          });
        } else {
          obj.material.clippingPlanes = effectivePlanes;
          obj.material.clipShadows = true;
          obj.material.needsUpdate = true;
        }
      }
    });
  }
  
  clearPlanesFromMaterials() {
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.userData && obj.userData.edgeLines && obj.userData.edgeLines.material) {
        obj.userData.edgeLines.material.clippingPlanes = [];
        obj.userData.edgeLines.material.needsUpdate = true;
      }

      if (obj.isMesh && obj.material) {
        let curr = obj;
        let isGizmoOrHelper = false;
        while (curr) {
          if (curr === this.planeGroup || curr === this.boxGroup || 
              curr === this.cappingGroup || curr === this.cutContourGroup ||
              curr.userData?.isGizmo || curr.userData?.isPlaneHelperMesh || 
              curr.userData?.isPivotHelper || curr.userData?.isHighlightOverlay || curr.userData?.isHoverOverlay ||
              curr.userData?.isCapHelper || curr.userData?.isStencilGroup || curr.userData?.isStencilHelper) {
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
    this.helpersVisible = true;
    this.boxHelpersVisible = true;
    this.rotationSnap5Deg = false;
    this.showCutawayWireframe = false;
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
