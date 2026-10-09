// Procedural BIM Generator for Modern Hillside Villa
// Master Refined Architecture:
// 1. Continuous Seamless 3-Layer Geological Soil Strata (Topsoil, Subsoil, Bedrock) with no surface breaching
// 2. Pure Unified Building Pad (RL 0.00) with True Vertical Excavation Step into Hillside
// 3. L-Shaped Dual Concrete Retaining Walls (North & East) cleanly retaining excavated hill
// 4. Fully Enclosed West Entrance Wall (no missing sections) with Grand Double Clear Glass Entrance Door
// 5. Grand Panoramic Living Room Floor-to-Ceiling Glazed Sliding Facade (10.8m wide, transparent glass)
// 6. 4 Resort-Style Woven Wicker & Teak Armchairs with all 4 chairs correctly facing table center
// 7. Interior Timber Staircase & Architectural Eaves Soffit Ceilings

class CRLDemoModel {
  static Palette = {
    padConcrete: 0xb5b0a6,   // Clean architectural bluestone/concrete building pad #b5b0a6
    walls: 0xb07d4c,         // Vertical timber siding #b07d4c
    wallAccent: 0x8f5e32,    // Deep timber batten relief #8f5e32
    roofs: 0xd4dae2,         // Standing seam zinc roof silver-gray #d4dae2
    roofTrim: 0x9ea8b5,      // Zinc eaves and verge trim #9ea8b5
    soffit: 0x2e3238,        // Charcoal eave soffit under-cladding #2e3238
    glass: 0x90b8db,         // High-clarity architectural low-E glass #90b8db
    mullions: 0x24272e,      // Charcoal black aluminum door & window frames #24272e
    columns: 0x3d332a,       // Dark timber structural columns #3d332a
    railings: 0xb88653,      // Solid timber terrace parapet #b88653
    decking: 0xc99b66,       // Balcony teak wood plank deck #c99b66
    groundGrass: 0x5e7545,   // Lush contoured lawn turf #5e7545
    concreteWall: 0xa4a49e,  // Cast-in-place fair-faced concrete retaining wall #a4a49e
    strataTop: 0x4a3324,     // Topsoil humus rich dark brown #4a3324
    strataMid: 0x7d4c2a,     // Subsoil reddish-ochre clay #7d4c2a
    strataBot: 0x524338,     // Weathered sandstone bedrock #524338
    pathway: 0xa49e93,       // Garden stone flagstone paving #a49e93
    furnitureTeak: 0x5a280a, // Burnished oiled teakwood crest rail & tabletop #5a280a
    furnitureWicker: 0xb66318, // Warm golden amber woven honey rattan cane #b66318
    furnitureWeave: 0x783a0e, // Deep roasted caramel woven rattan rings #783a0e
    furnitureCushion: 0xebe3d3,// Oatmeal outdoor canvas linen cushion #ebe3d3
    furniturePiping: 0x9c5116, // Honey rattan cushion welt piping #9c5116
    furnitureMetal: 0x18191c, // Matte charcoal black steel legs & apron #18191c
    furnitureBrass: 0xcda036, // Polished satin brass ferrule sleeves & feet #cda036
    staircase: 0x9c6f44,     // Natural oak interior staircase #9c6f44
    interiorWall: 0xd8cbba   // Warm cream interior partition #d8cbba
  };

  static create() {
    const root = new THREE.Group();
    root.name = "Modern_Hillside_Villa";

    const structures = {};
    const getGroup = (name) => {
      if (!structures[name]) {
        const g = new THREE.Group();
        g.name = name;
        g.userData = { isStructureGroup: true, structureName: name };
        structures[name] = g;
        root.add(g);
      }
      return structures[name];
    };

    // Helper to create BIM Mesh with full IFC metadata
    const addBimElement = (geom, color, meta, parentGroup, options = {}) => {
      let mat;
      if (options.isGlass) {
        mat = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.05,
          metalness: 0.35,
          transparent: true,
          opacity: options.opacity !== undefined ? options.opacity : 0.35,
          side: THREE.DoubleSide
        });
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: color,
          roughness: options.roughness !== undefined ? options.roughness : 0.65,
          metalness: options.metalness !== undefined ? options.metalness : 0.15,
          side: THREE.DoubleSide
        });
      }

      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = meta.element || meta.name;
      mesh.userData = {
        structure: meta.structure,
        level: meta.level || "Ground Level (RL +0.00)",
        category: meta.category,
        element: meta.element || meta.name,
        rlMin: meta.rlMin || "0.000",
        rlMax: meta.rlMax || "3.400",
        height: meta.height || "3.00 m",
        dimensions: meta.dimensions || "10.0m x 4.0m x 3.0m",
        guid: meta.guid || ("VILLA_" + Math.random().toString(36).substring(2, 10).toUpperCase()),
        rawCategory: meta.rawCategory || meta.category,
        description: meta.description || "Architectural BIM element according to residential villa design specification."
      };
      parentGroup.add(mesh);
      return mesh;
    };

    // =========================================================================
    // 1. SITE & TOPOGRAPHY (IfcSite) - Solid Enclosed Block with Seamless Strata
    // =========================================================================
    const siteGroup = getGroup("Site & Topography (场地与地形)");

    const siteW = 46.0; // along X from -23.0 to +23.0
    const siteL = 32.0; // along Z from -16.0 to +16.0
    const yBase = -3.8; // Level bottom horizontal datum

    // Building Pad excavation footprint:
    // West: -13.0, East: 12.5, North: -5.5, South: 7.8
    const padMinX = -13.0, padMaxX = 12.5;
    const padMinZ = -5.5, padMaxZ = 7.8;

    // Natural hillside elevation function (Civil engineered hillside cut & gentle daylight lawn)
    const getMacroElevation = (x, z) => {
      const dSouth = Math.max(0.0, z - 7.8);
      const dWest  = Math.max(0.0, -13.0 - x);
      const dNorth = Math.max(0.0, -5.5 - z);
      const dEast  = Math.max(0.0, x - 12.5);

      // Normalized cut coordinates along North and East pad edges:
      const tX = Math.min(1.0, Math.max(0.0, (x - (-13.0)) / (12.5 - (-13.0))));
      const tZ = Math.min(1.0, Math.max(0.0, (z - (-5.5)) / (7.8 - (-5.5))));
      const cutFaceY = -0.14 + 1.99 * tX * (1.0 - tZ);

      // Hillside rises to North and East behind retaining walls:
      const hillHeight = cutFaceY + 0.08 * dNorth + 0.07 * dEast;

      // Gentle garden lawn descending smoothly from RL -0.14m at pad edge (14cm step, NO CLIFF!):
      const distSW = Math.sqrt(dSouth * dSouth + dWest * dWest);
      const lawnHeight = -0.14 - 0.065 * distSW;

      let base;
      if (z <= -5.5 && x <= -13.0) {
        const denom = dNorth + dWest;
        const blend = denom === 0.0 ? 0.5 : dNorth / denom;
        base = blend * hillHeight + (1.0 - blend) * lawnHeight;
      } else if (x >= 12.5 && z >= 7.8) {
        const denom = dEast + dSouth;
        const blend = denom === 0.0 ? 0.5 : dEast / denom;
        base = blend * hillHeight + (1.0 - blend) * lawnHeight;
      } else if (z <= -5.5 || x >= 12.5) {
        base = hillHeight;
      } else {
        base = lawnHeight;
      }

      const ripple = 0.05 * Math.sin(x * 0.25) * Math.cos(z * 0.25);
      return base + ripple;
    };

    // Terrain surface height function outside building pad
    const getGroundElevation = (x, z) => {
      if (x >= padMinX && x <= padMaxX && z >= padMinZ && z <= padMaxZ) {
        return 0.0;
      }
      return getMacroElevation(x, z);
    };

    // -------------------------------------------------------------------------
    // Clean Unified Building Pad (RL 0.00, thickness 0.35m down to -0.35m)
    // One single clean, professional foundation slab covering villa and porch!
    // Sits naturally embedded in the turf with a standard 14cm plinth reveal.
    // -------------------------------------------------------------------------
    const padWidth = padMaxX - padMinX; // 25.5m
    const padLength = padMaxZ - padMinZ; // 13.3m
    const padCenterX = (padMinX + padMaxX) / 2; // -0.25m
    const padCenterZ = (padMinZ + padMaxZ) / 2; // 1.15m

    const buildingPadGeo = new THREE.BoxGeometry(padWidth, 0.35, padLength);
    buildingPadGeo.translate(padCenterX, -0.175, padCenterZ);
    addBimElement(buildingPadGeo, CRLDemoModel.Palette.padConcrete, {
      structure: "Site & Topography (场地与地形)",
      element: "Engineered Building Pad Foundation (RL +0.00)",
      category: "Site & Terrain",
      rawCategory: "Site & Terrain",
      level: "Ground Level (RL +0.00)",
      rlMin: "-0.350",
      rlMax: "0.000",
      height: "0.35 m",
      dimensions: `${padWidth.toFixed(1)}m x ${padLength.toFixed(1)}m x 0.35m`,
      description: "Monolithic reinforced architectural foundation pad creating a level building plateau at RL +0.00."
    }, siteGroup, { roughness: 0.7 });

    // -------------------------------------------------------------------------
    // L-Shaped Dual Concrete Retaining Walls holding back the excavated hillside
    // 1. North Retaining Wall (along Z = padMinZ = -5.5m)
    // 2. East Retaining Wall (along X = padMaxX = 12.5m)
    // -------------------------------------------------------------------------
    // North Retaining Wall: X from -7.0 to 12.8, Z = -5.5
    // Height from RL 0.00 up to hill peak ~ RL +2.40 (height 2.40m, thickness 0.40m)
    const northRetainWallGeo = new THREE.BoxGeometry(19.8, 2.40, 0.40);
    northRetainWallGeo.translate(2.9, 1.20, -5.7);
    addBimElement(northRetainWallGeo, CRLDemoModel.Palette.concreteWall, {
      structure: "Site & Topography (场地与地形)",
      element: "North Cast Concrete Retaining Wall",
      category: "Walls",
      rawCategory: "Walls",
      level: "Ground Level (RL +0.00 ~ +2.40)",
      rlMin: "0.000",
      rlMax: "2.400",
      height: "2.40 m",
      dimensions: "19.80m x 2.40m x 0.40m",
      description: "Reinforced fair-faced concrete retaining wall cleanly retaining the northern hillside cut."
    }, siteGroup, { roughness: 0.55, metalness: 0.1 });

    // East Retaining Wall: X = 12.5m, Z from -5.7 to +7.8 (Length 13.50m)
    // Seamlessly corners with North Retaining Wall to form a complete monolithic L-barrier
    const eastRetainWallGeo = new THREE.BoxGeometry(0.40, 2.20, 13.50);
    eastRetainWallGeo.translate(12.7, 1.10, 1.05);
    addBimElement(eastRetainWallGeo, CRLDemoModel.Palette.concreteWall, {
      structure: "Site & Topography (场地与地形)",
      element: "East Cast Concrete Retaining Wall",
      category: "Walls",
      rawCategory: "Walls",
      level: "Ground Level (RL +0.00 ~ +2.20)",
      rlMin: "0.000",
      rlMax: "2.200",
      height: "2.20 m",
      dimensions: "0.40m x 2.20m x 13.50m",
      description: "Reinforced fair-faced concrete retaining wall cleanly retaining the eastern slope cut."
    }, siteGroup, { roughness: 0.55, metalness: 0.1 });

    // -------------------------------------------------------------------------
    // Contoured Turf Lawn Top Surface with Clean Vertical Excavation Cuts
    // Constructed via 4 border patches (North, East, South, West) around pad.
    // Turf stops cleanly against the retaining walls at natural hillside elevation!
    // Zero distorted diagonal slopes sliding through the walls or into RL 0.00!
    // -------------------------------------------------------------------------
    const turfPositions = [];
    const turfUvs = [];
    const turfIndices = [];
    let vertOffset = 0;

    const addTurfPatch = (xMin, xMax, zMin, zMax, segX, segZ) => {
      const startIdx = vertOffset;
      for (let j = 0; j <= segZ; j++) {
        const vz = zMin + (j / segZ) * (zMax - zMin);
        for (let i = 0; i <= segX; i++) {
          const vx = xMin + (i / segX) * (xMax - xMin);
          const vy = getMacroElevation(vx, vz);
          turfPositions.push(vx, vy, vz);
          turfUvs.push((vx + 23.0) / 46.0, (vz + 16.0) / 32.0);
          vertOffset++;
        }
      }
      for (let j = 0; j < segZ; j++) {
        for (let i = 0; i < segX; i++) {
          const a = startIdx + j * (segX + 1) + i;
          const b = a + 1;
          const c = a + (segX + 1);
          const d = c + 1;
          turfIndices.push(a, c, b);
          turfIndices.push(b, c, d);
        }
      }
    };

    // Patch 1: North Hillside (runs directly up to back face of North Retaining Wall at Z = -5.5)
    addTurfPatch(-23.0, 23.0, -16.0, -5.5, 36, 14);
    // Patch 2: East Rear Slope (runs directly up to back face of East Retaining Wall at X = 12.5)
    addTurfPatch(12.5, 23.0, -5.5, 7.8, 12, 14);
    // Patch 3: South Front Slope (descends from South pad edge at Z = 7.8 towards perimeter)
    addTurfPatch(-23.0, 23.0, 7.8, 16.0, 36, 12);
    // Patch 4: West Entrance Lawn (slopes from West pad edge at X = -13.0 towards perimeter)
    addTurfPatch(-23.0, -13.0, -5.5, 7.8, 12, 14);

    const turfGeo = new THREE.BufferGeometry();
    turfGeo.setAttribute('position', new THREE.Float32BufferAttribute(turfPositions, 3));
    turfGeo.setAttribute('uv', new THREE.Float32BufferAttribute(turfUvs, 2));
    turfGeo.setIndex(turfIndices);
    turfGeo.computeVertexNormals();

    addBimElement(turfGeo, CRLDemoModel.Palette.groundGrass, {
      structure: "Site & Topography (场地与地形)",
      element: "Contoured Natural Turf Topography",
      category: "Site & Terrain",
      rawCategory: "Site & Terrain",
      level: "Site Surface (RL -2.80 ~ +2.20)",
      dimensions: "46.0m x 32.0m x 5.0m",
      description: "Natural contoured hillside turf surrounding the excavated building pad."
    }, siteGroup, { roughness: 0.88 });

    // -------------------------------------------------------------------------
    // Continuous Seamless 3-Layer Geological Strata around the 4 Vertical Cuts
    // Mathematical Guarantee:
    // All layers are proportional to local depth H = (Y_top - yBase).
    // Top layer = 22% of H, Mid layer = 38% of H, Bot layer = remaining 40% of H.
    // Uses smooth angle theta = atan2(z, x) so corners match seamlessly!
    // -------------------------------------------------------------------------
    const getStrataBounds = (x, z) => {
      const yTop = getMacroElevation(x, z);
      const H = yTop - yBase; // strictly positive (from ~1.0m to ~6.0m)
      const theta = Math.atan2(z, x);

      // Layer 1 (Topsoil) boundary: strictly below yTop
      const t1Ratio = 0.22 + 0.04 * Math.sin(2 * theta);
      const y1 = yTop - H * t1Ratio;

      // Layer 2 (Subsoil) boundary: strictly below y1 and above yBase
      const t2Ratio = 0.60 + 0.05 * Math.cos(2 * theta + 0.6);
      const y2 = yTop - H * t2Ratio;

      return { yTop, y1, y2, yBase };
    };

    const makeStrataMesh = (isXAxis, fixedCoord, startVar, endVar, segs = 36) => {
      const step = (endVar - startVar) / segs;
      
      const buildBandGeo = (getTopY, getBotY) => {
        const geo = new THREE.BufferGeometry();
        const pos = [];
        const uvs = [];

        for (let i = 0; i <= segs; i++) {
          const v = startVar + i * step;
          const x = isXAxis ? v : fixedCoord;
          const z = isXAxis ? fixedCoord : v;
          const bounds = getStrataBounds(x, z);
          const topY = getTopY(bounds);
          const botY = getBotY(bounds);

          if (isXAxis) {
            pos.push(v, topY, fixedCoord);
            pos.push(v, botY, fixedCoord);
          } else {
            pos.push(fixedCoord, topY, v);
            pos.push(fixedCoord, botY, v);
          }
          uvs.push(i / segs, 1.0, i / segs, 0.0);
        }

        const idx = [];
        for (let i = 0; i < segs; i++) {
          const i2 = i * 2;
          idx.push(i2, i2 + 1, i2 + 2);
          idx.push(i2 + 1, i2 + 3, i2 + 2);
        }
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.computeVertexNormals();
        return geo;
      };

      return {
        top: buildBandGeo(b => b.yTop, b => b.y1),
        mid: buildBandGeo(b => b.y1, b => b.y2),
        bot: buildBandGeo(b => b.y2, b => b.yBase)
      };
    };

    // Generate for all 4 perimeters:
    const faces = [
      { name: "South", isX: true,  coord: 16.0,  s: -siteW/2, e: siteW/2 },
      { name: "North", isX: true,  coord: -16.0, s: -siteW/2, e: siteW/2 },
      { name: "East",  isX: false, coord: 23.0,  s: -siteL/2, e: siteL/2 },
      { name: "West",  isX: false, coord: -23.0, s: -siteL/2, e: siteL/2 }
    ];

    faces.forEach(f => {
      const bands = makeStrataMesh(f.isX, f.coord, f.s, f.e);
      addBimElement(bands.top, CRLDemoModel.Palette.strataTop, {
        structure: "Site & Topography (场地与地形)",
        element: `Geological Topsoil Strata (${f.name})`,
        category: "Site & Terrain",
        level: "Subterranean Strata"
      }, siteGroup);

      addBimElement(bands.mid, CRLDemoModel.Palette.strataMid, {
        structure: "Site & Topography (场地与地形)",
        element: `Geological Subsoil Clay Strata (${f.name})`,
        category: "Site & Terrain",
        level: "Subterranean Strata"
      }, siteGroup);

      addBimElement(bands.bot, CRLDemoModel.Palette.strataBot, {
        structure: "Site & Topography (场地与地形)",
        element: `Geological Bedrock Strata (${f.name})`,
        category: "Site & Terrain",
        level: "Subterranean Strata"
      }, siteGroup);
    });

    // Fully Closed Bottom Horizontal Bedrock Datum Slab (Y = -3.8m)
    const basePlateGeo = new THREE.PlaneGeometry(siteW, siteL);
    basePlateGeo.rotateX(Math.PI / 2);
    basePlateGeo.translate(0, yBase, 0);
    addBimElement(basePlateGeo, CRLDemoModel.Palette.strataBot, {
      structure: "Site & Topography (场地与地形)",
      element: "Solid Subterranean Bedrock Base (RL -3.80)",
      category: "Site & Terrain",
      level: "Base Datum (RL -3.80)",
      dimensions: "46.0m x 32.0m x 0.1m",
      description: "Level horizontal bottom plate sealing the entire solid site volume."
    }, siteGroup, { roughness: 0.9 });

    // Rear Paved Access Walkway (leading from stone path to rear patio door)
    const pathGeo = new THREE.BoxGeometry(14.0, 0.10, 2.4);
    pathGeo.rotateY(-0.16);
    pathGeo.translate(13.2, 0.05, -5.8);
    addBimElement(pathGeo, CRLDemoModel.Palette.pathway, {
      structure: "Site & Topography (场地与地形)",
      element: "Rear Courtyard Stone Pathway",
      category: "Site & Terrain",
      level: "Ground Level (RL +0.05)",
      dimensions: "14.0m x 0.10m x 2.4m"
    }, siteGroup);

    // =========================================================================
    // 2. LOWER LEVEL & COVERED PORCH (IfcWall, IfcDoor, IfcWindow, IfcColumn)
    // =========================================================================
    const lowerGroup = getGroup("Lower Level & Covered Porch (底层与架空廊道)");

    // Dual-Tier Stone Entry Steps connecting Building Pad to Foyer
    const step1Geo = new THREE.BoxGeometry(0.7, 0.16, 3.8);
    step1Geo.translate(-12.8, -0.08, 0.0);
    addBimElement(step1Geo, CRLDemoModel.Palette.padConcrete, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Foyer Stone Step - Upper Tier",
      category: "Slabs & decks",
      level: "Ground Level (RL +0.00)",
      dimensions: "0.7m x 0.16m x 3.8m"
    }, lowerGroup);

    const step2Geo = new THREE.BoxGeometry(0.7, 0.08, 4.2);
    step2Geo.translate(-13.5, -0.04, 0.0);
    addBimElement(step2Geo, CRLDemoModel.Palette.padConcrete, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Foyer Stone Step - Lower Tier",
      category: "Slabs & decks",
      level: "Ground Level (RL +0.00)",
      dimensions: "0.7m x 0.08m x 4.2m"
    }, lowerGroup);

    // -------------------------------------------------------------------------
    // West Entrance Wall: FULLY ENCLOSED FROM Z = -4.8m TO Z = +7.2m!
    // No missing sections! Seamless corner with South Wall!
    // -------------------------------------------------------------------------
    // North section of entry wall (Z: -4.8 to -1.4)
    const entryNorthWallGeo = new THREE.BoxGeometry(0.35, 3.4, 3.4);
    entryNorthWallGeo.translate(-6.0, 1.7, -3.1);
    addBimElement(entryNorthWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Wall (North Section)",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "0.35m x 3.40m x 3.40m"
    }, lowerGroup);

    // Transom header wall above the entrance door (Z: -1.4 to 1.4, Y: 2.5 to 3.4)
    const entryHeaderWallGeo = new THREE.BoxGeometry(0.35, 0.9, 2.8);
    entryHeaderWallGeo.translate(-6.0, 2.95, 0.0);
    addBimElement(entryHeaderWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Door Transom Wall Header",
      category: "Walls",
      level: "Ground Level (RL +2.50 ~ +3.40)",
      dimensions: "0.35m x 0.90m x 2.80m"
    }, lowerGroup);

    // Center-South section of entry wall (Z: 1.4 to 4.8)
    const entrySouthWallGeo = new THREE.BoxGeometry(0.35, 3.4, 3.4);
    entrySouthWallGeo.translate(-6.0, 1.7, 3.1);
    addBimElement(entrySouthWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Wall (South Center Section)",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "0.35m x 3.40m x 3.40m"
    }, lowerGroup);

    // Crucial Corner Return Wall: Closing Z = 4.8 to Z = 7.2! (Previously missing!)
    const entryReturnWallGeo = new THREE.BoxGeometry(0.35, 3.4, 2.4);
    entryReturnWallGeo.translate(-6.0, 1.7, 6.0);
    addBimElement(entryReturnWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Corner Return Wall (South Extension)",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "0.35m x 3.40m x 2.40m",
      description: "Seamlessly joins the covered entrance foyer to the south pavilion facade."
    }, lowerGroup);

    // -------------------------------------------------------------------------
    // Grand Double Clear-Glass Entrance Door (Frame + Truly Transparent Glass)
    // Opening: Z from -1.3m to +1.3m (width 2.6m), Y from 0.0m to 2.5m (height 2.5m)
    // -------------------------------------------------------------------------
    // Frame Mullions (Perimeter jambs and center divider, NOT a solid box!)
    const doorFrameGroup = new THREE.Group();
    doorFrameGroup.name = "Entrance_Door_Mullion_Frame";

    // Left Jamb (Z = -1.3)
    const dj1 = new THREE.BoxGeometry(0.12, 2.5, 0.08); dj1.translate(-6.0, 1.25, -1.3);
    // Right Jamb (Z = 1.3)
    const dj2 = new THREE.BoxGeometry(0.12, 2.5, 0.08); dj2.translate(-6.0, 1.25, 1.3);
    // Center Mullion (Z = 0.0)
    const djC = new THREE.BoxGeometry(0.12, 2.5, 0.08); djC.translate(-6.0, 1.25, 0.0);
    // Top Header Transom
    const djH = new THREE.BoxGeometry(0.12, 0.08, 2.68); djH.translate(-6.0, 2.46, 0.0);

    [dj1, dj2, djC, djH].forEach((g, idx) => {
      addBimElement(g, CRLDemoModel.Palette.mullions, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Entrance Door Architectural Frame M-${idx + 1}`,
        category: "Doors & Entrances",
        level: "Ground Level (RL +0.00 ~ +2.50)",
        dimensions: "0.12m x 2.50m x 0.08m"
      }, lowerGroup, { roughness: 0.25, metalness: 0.85 });
    });

    // Left Clear Glass Door Leaf (Z in [-1.26, -0.04])
    const doorLeftGlass = new THREE.BoxGeometry(0.04, 2.38, 1.22);
    doorLeftGlass.translate(-6.0, 1.25, -0.65);
    addBimElement(doorLeftGlass, CRLDemoModel.Palette.glass, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Double Door - Clear Glass Leaf (North)",
      category: "Doors & Entrances",
      level: "Ground Level (RL +0.00 ~ +2.50)",
      dimensions: "0.04m x 2.38m x 1.22m",
      description: "Clear architectural double-glazed entrance leaf."
    }, lowerGroup, { isGlass: true, opacity: 0.30 });

    // Right Clear Glass Door Leaf (Z in [0.04, 1.26])
    const doorRightGlass = new THREE.BoxGeometry(0.04, 2.38, 1.22);
    doorRightGlass.translate(-6.0, 1.25, 0.65);
    addBimElement(doorRightGlass, CRLDemoModel.Palette.glass, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Entrance Double Door - Clear Glass Leaf (South)",
      category: "Doors & Entrances",
      level: "Ground Level (RL +0.00 ~ +2.50)",
      dimensions: "0.04m x 2.38m x 1.22m",
      description: "Clear architectural double-glazed entrance leaf."
    }, lowerGroup, { isGlass: true, opacity: 0.30 });

    // Stainless Steel Vertical Pull Handles on Both Door Leaves
    [-0.12, 0.12].forEach((dz, idx) => {
      const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 16);
      handleGeo.translate(-6.15, 1.25, dz);
      addBimElement(handleGeo, 0xe2e8f0, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Stainless Steel Entrance Door Pull Handle ${idx + 1}`,
        category: "Doors & Entrances",
        level: "Ground Level (RL +0.65 ~ +1.85)",
        dimensions: "0.04m x 1.20m x 0.04m"
      }, lowerGroup, { roughness: 0.1, metalness: 0.95 });
    });

    // -------------------------------------------------------------------------
    // South Facade (Z = 7.2m): GRAND PANORAMIC 10.8M FLOOR-TO-CEILING GLASS FACADE
    // Spans X from -3.0m to +7.8m (10.8m wide, 2.6m high, ~60% of entire south facade!)
    // Solid end piers with timber battens on flanks
    // -------------------------------------------------------------------------
    // West Solid Pier (X in [-6.0, -3.0], width 3.0m)
    const southWestPierGeo = new THREE.BoxGeometry(3.0, 3.4, 0.35);
    southWestPierGeo.translate(-4.5, 1.7, 7.2);
    addBimElement(southWestPierGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Lower Level South Wall - West Anchor Pier",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "3.00m x 3.40m x 0.35m"
    }, lowerGroup);

    // East Solid Pier (X in [7.8, 11.2], width 3.4m)
    const southEastPierGeo = new THREE.BoxGeometry(3.4, 3.4, 0.35);
    southEastPierGeo.translate(9.5, 1.7, 7.2);
    addBimElement(southEastPierGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Lower Level South Wall - East Anchor Pier",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "3.40m x 3.40m x 0.35m"
    }, lowerGroup);

    // Continuous Lintels above the Grand Glazed Sliders (X in [-3.0, 7.8], Y in [2.6, 3.4])
    const southSliderHeaderGeo = new THREE.BoxGeometry(10.8, 0.8, 0.35);
    southSliderHeaderGeo.translate(2.4, 3.0, 7.2);
    addBimElement(southSliderHeaderGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Living Room Panoramic Glazing Wall Header",
      category: "Walls",
      level: "Ground Level (RL +2.60 ~ +3.40)",
      dimensions: "10.80m x 0.80m x 0.35m"
    }, lowerGroup);

    // 4 Wide Panoramic Transparent Glass Sliding Panels (Each 2.65m wide, 2.52m high)
    const numSliders = 4;
    const sliderW = 2.68;
    for (let i = 0; i < numSliders; i++) {
      const sx = -3.0 + i * sliderW + sliderW / 2;

      // Transparent Sliding Glass Panel
      const spGlass = new THREE.BoxGeometry(sliderW - 0.12, 2.50, 0.04);
      spGlass.translate(sx, 1.30, 7.2);
      addBimElement(spGlass, CRLDemoModel.Palette.glass, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Living Panoramic Sliding Glass Panel S-${i + 1}`,
        category: "Windows & Glazing",
        level: "Ground Level (RL +0.00 ~ +2.60)",
        dimensions: `${(sliderW - 0.12).toFixed(2)}m x 2.50m x 0.04m`,
        description: "Expansive floor-to-ceiling panoramic sliding double-glazed panel."
      }, lowerGroup, { isGlass: true, opacity: 0.32 });

      // Aluminum Mullion Stile Frame for each sliding leaf
      const stLeft = new THREE.BoxGeometry(0.08, 2.58, 0.08);
      stLeft.translate(sx - sliderW / 2 + 0.04, 1.30, 7.2);
      addBimElement(stLeft, CRLDemoModel.Palette.mullions, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Panoramic Slider Structural Mullion ${i + 1}`,
        category: "Windows & Glazing",
        dimensions: "0.08m x 2.58m x 0.08m"
      }, lowerGroup, { roughness: 0.25, metalness: 0.85 });
    }
    // End mullion at X = 7.8
    const stEnd = new THREE.BoxGeometry(0.08, 2.58, 0.08);
    stEnd.translate(7.8, 1.30, 7.2);
    addBimElement(stEnd, CRLDemoModel.Palette.mullions, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Panoramic Slider Structural Mullion End",
      category: "Windows & Glazing",
      dimensions: "0.08m x 2.58m x 0.08m"
    }, lowerGroup, { roughness: 0.25, metalness: 0.85 });

    // Decorative Timber Battens on the West & East anchor piers
    for (let bx = -5.8; bx <= -3.2; bx += 0.6) {
      const slatGeo = new THREE.BoxGeometry(0.08, 3.36, 0.08);
      slatGeo.translate(bx, 1.7, 7.42);
      addBimElement(slatGeo, CRLDemoModel.Palette.wallAccent, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Timber Batten Slat W-${bx.toFixed(1)}`,
        category: "Walls",
        dimensions: "0.08m x 3.36m x 0.08m"
      }, lowerGroup);
    }
    for (let bx = 8.0; bx <= 11.0; bx += 0.6) {
      const slatGeo = new THREE.BoxGeometry(0.08, 3.36, 0.08);
      slatGeo.translate(bx, 1.7, 7.42);
      addBimElement(slatGeo, CRLDemoModel.Palette.wallAccent, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Timber Batten Slat E-${bx.toFixed(1)}`,
        category: "Walls",
        dimensions: "0.08m x 3.36m x 0.08m"
      }, lowerGroup);
    }

    // -------------------------------------------------------------------------
    // East / Rear Wall (X = 11.2m): Fully Enclosed Thermal Envelope with Garden Door
    // -------------------------------------------------------------------------
    const rearWallGeo = new THREE.BoxGeometry(0.35, 3.4, 12.0);
    rearWallGeo.translate(11.2, 1.7, 1.2);
    addBimElement(rearWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Lower Level Rear Enclosure Wall (East)",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "0.35m x 3.40m x 12.0m"
    }, lowerGroup);

    // Rear Garden Access Door with Glass
    const rearDoorFrame = new THREE.BoxGeometry(0.12, 2.3, 1.1);
    rearDoorFrame.translate(11.4, 1.15, -2.5);
    addBimElement(rearDoorFrame, CRLDemoModel.Palette.mullions, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Rear Garden Service Door Architectural Frame",
      category: "Doors & Entrances",
      level: "Ground Level (RL +0.00 ~ +2.30)",
      dimensions: "0.12m x 2.30m x 1.10m"
    }, lowerGroup, { roughness: 0.25, metalness: 0.85 });

    const rearDoorGlass = new THREE.BoxGeometry(0.04, 2.1, 0.9);
    rearDoorGlass.translate(11.4, 1.15, -2.5);
    addBimElement(rearDoorGlass, CRLDemoModel.Palette.glass, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Rear Garden Door Vision Glazing",
      category: "Doors & Entrances",
      level: "Ground Level (RL +0.00 ~ +2.30)",
      dimensions: "0.04m x 2.10m x 0.90m"
    }, lowerGroup, { isGlass: true, opacity: 0.35 });

    // -------------------------------------------------------------------------
    // North Wall (Z = -4.8m): Fully Enclosed with High Clerestory Ribbon Windows
    // -------------------------------------------------------------------------
    const northWallGeo = new THREE.BoxGeometry(17.2, 3.4, 0.35);
    northWallGeo.translate(2.6, 1.7, -4.8);
    addBimElement(northWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "Lower Level North Insulated Wall",
      category: "Walls",
      level: "Ground Level (RL +0.00 ~ +3.40)",
      dimensions: "17.2m x 3.40m x 0.35m"
    }, lowerGroup);

    const northClerestoryGlass = new THREE.BoxGeometry(10.2, 0.75, 0.06);
    northClerestoryGlass.translate(3.0, 2.7, -4.95);
    addBimElement(northClerestoryGlass, CRLDemoModel.Palette.glass, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "North Clerestory Daylighting Ribbon Window",
      category: "Windows & Glazing",
      level: "Ground Level (RL +2.30 ~ +3.05)",
      dimensions: "10.20m x 0.75m x 0.06m"
    }, lowerGroup, { isGlass: true, opacity: 0.35 });

    const northClerestoryFrame = new THREE.BoxGeometry(10.35, 0.85, 0.12);
    northClerestoryFrame.translate(3.0, 2.7, -4.95);
    addBimElement(northClerestoryFrame, CRLDemoModel.Palette.mullions, {
      structure: "Lower Level & Covered Porch (底层与架空廊道)",
      element: "North Clerestory Window Frame",
      category: "Windows & Glazing",
      level: "Ground Level (RL +2.30 ~ +3.05)",
      dimensions: "10.35m x 0.85m x 0.12m"
    }, lowerGroup, { roughness: 0.25, metalness: 0.85 });

    // Porch Structural Columns
    const colCoords = [
      { id: "C1", x: -12.2, z: 4.4 },
      { id: "C2", x: -12.2, z: 0.0 },
      { id: "C3", x: -12.2, z: -4.4 },
      { id: "C4", x: -6.1, z: 4.8 }
    ];
    colCoords.forEach(c => {
      const colGeo = new THREE.BoxGeometry(0.24, 3.4, 0.24);
      colGeo.translate(c.x, 1.7, c.z);
      addBimElement(colGeo, CRLDemoModel.Palette.columns, {
        structure: "Lower Level & Covered Porch (底层与架空廊道)",
        element: `Porch Structural Column ${c.id}`,
        category: "Columns & Posts",
        level: "Ground Level (RL +0.00 ~ +3.40)",
        dimensions: "0.24m x 3.40m x 0.24m"
      }, lowerGroup);
    });

    // =========================================================================
    // 3. UPPER LIVING PAVILION (IfcWall, IfcSlab, IfcWindow, IfcStair)
    // =========================================================================
    const upperGroup = getGroup("Upper Living Pavilion (二层主建筑体)");

    // First Floor Structural Slab (RL +3.40)
    const upperSlabGeo = new THREE.BoxGeometry(17.5, 0.35, 9.6);
    upperSlabGeo.translate(2.5, 3.4, 0.0);
    addBimElement(upperSlabGeo, CRLDemoModel.Palette.slabs, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Upper Floor Structural Slab",
      category: "Slabs & decks",
      level: "First Floor Level (RL +3.40)",
      dimensions: "17.5m x 9.6m x 0.35m"
    }, upperGroup);

    // Lower Level Terrace Roof Slab (Flat roof over extended lower South pavilion)
    const terraceRoofGeo = new THREE.BoxGeometry(18.6, 0.3, 2.6);
    terraceRoofGeo.translate(2.5, 3.4, 6.0);
    addBimElement(terraceRoofGeo, CRLDemoModel.Palette.slabs, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Lower Pavilion Flat Roof Slab",
      category: "Slabs & decks",
      level: "First Floor Level (RL +3.40)",
      dimensions: "18.6m x 2.60m x 0.30m"
    }, upperGroup);

    // -------------------------------------------------------------------------
    // Upper Floor Side Walls with PRECISE EAVES HEIGHT JUNCTION (Y = 3.40 ~ 5.75m)
    // Height = exactly 2.35m (5.75 - 3.40). No protruding above roof plane!
    // -------------------------------------------------------------------------
    const upperWallHeight = 2.35;
    const upperWallCenterY = 3.40 + upperWallHeight / 2; // Y = 4.575

    // South Exterior Timber Wall (at Z = 4.65)
    const upperSouthWallGeo = new THREE.BoxGeometry(17.5, upperWallHeight, 0.35);
    upperSouthWallGeo.translate(2.5, upperWallCenterY, 4.65);
    addBimElement(upperSouthWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Upper Floor Timber Wall (South)",
      category: "Walls",
      level: "First Floor (RL +3.40 ~ +5.75)",
      rlMin: "3.400",
      rlMax: "5.750",
      height: "2.35 m",
      dimensions: "17.5m x 2.35m x 0.35m"
    }, upperGroup);

    // Timber vertical battens relief details on Upper South wall
    for (let bx = -5.5; bx <= 10.5; bx += 0.8) {
      if (bx > 0.0 && bx < 4.0) continue; // window opening
      const slatGeo = new THREE.BoxGeometry(0.06, upperWallHeight - 0.04, 0.06);
      slatGeo.translate(bx, upperWallCenterY, 4.85);
      addBimElement(slatGeo, CRLDemoModel.Palette.wallAccent, {
        structure: "Upper Living Pavilion (二层主建筑体)",
        element: `Upper Batten Slat (S) ${bx.toFixed(1)}`,
        category: "Walls",
        level: "First Floor (RL +3.40 ~ +5.75)",
        dimensions: `0.06m x ${(upperWallHeight - 0.04).toFixed(2)}m x 0.06m`
      }, upperGroup);
    }

    // North Exterior Timber Wall (at Z = -4.65)
    const upperNorthWallGeo = new THREE.BoxGeometry(17.5, upperWallHeight, 0.35);
    upperNorthWallGeo.translate(2.5, upperWallCenterY, -4.65);
    addBimElement(upperNorthWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Upper Floor Timber Wall (North)",
      category: "Walls",
      level: "First Floor (RL +3.40 ~ +5.75)",
      dimensions: "17.5m x 2.35m x 0.35m"
    }, upperGroup);

    // East / Rear Wall (at X = 11.2, Z from -4.65 to +4.65)
    const upperEastWallGeo = new THREE.BoxGeometry(0.35, upperWallHeight, 9.6);
    upperEastWallGeo.translate(11.2, upperWallCenterY, 0.0);
    addBimElement(upperEastWallGeo, CRLDemoModel.Palette.walls, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Upper Floor Rear Wall (East)",
      category: "Walls",
      level: "First Floor (RL +3.40 ~ +5.75)",
      dimensions: "0.35m x 2.35m x 9.6m"
    }, upperGroup);

    // -------------------------------------------------------------------------
    // Triangular Gable Pediments (West Front & East Rear)
    // Ridge apex Y = 8.24m, Eaves Y = 5.75m -> Peak height above eave = 2.49m
    // -------------------------------------------------------------------------
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-4.65, 0);
    gableShape.lineTo(4.65, 0);
    gableShape.lineTo(0, 2.49);
    gableShape.closePath();

    const gableWestGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.35, bevelEnabled: false });
    gableWestGeo.rotateY(Math.PI / 2);
    gableWestGeo.translate(-5.95, 5.75, 0.0);
    addBimElement(gableWestGeo, CRLDemoModel.Palette.walls, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "West Gable Pediment Wall (Front)",
      category: "Walls",
      level: "Gable Pediment (RL +5.75 ~ +8.24)",
      dimensions: "0.35m x 2.49m x 9.30m"
    }, upperGroup);

    const gableEastGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.35, bevelEnabled: false });
    gableEastGeo.rotateY(Math.PI / 2);
    gableEastGeo.translate(11.0, 5.75, 0.0);
    addBimElement(gableEastGeo, CRLDemoModel.Palette.walls, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "East Gable Pediment Wall (Rear)",
      category: "Walls",
      level: "Gable Pediment (RL +5.75 ~ +8.24)",
      dimensions: "0.35m x 2.49m x 9.30m"
    }, upperGroup);

    // -------------------------------------------------------------------------
    // West Front Glass Curtain Wall (5 Panels, X = -6.15)
    // -------------------------------------------------------------------------
    const curtainGroup = getGroup("Southwest Glass Curtain Wall (落地玻璃幕墙)");
    const numPanels = 5;
    const panelW = 1.72;
    const glassH = 2.30;
    for (let p = 0; p < numPanels; p++) {
      const pz = -3.5 + p * (panelW + 0.05);
      const glassGeo = new THREE.BoxGeometry(0.04, glassH, panelW);
      glassGeo.translate(-6.15, 4.58, pz);
      addBimElement(glassGeo, CRLDemoModel.Palette.glass, {
        structure: "Upper Living Pavilion (二层主建筑体)",
        element: `West Curtain Wall - Glass Panel ${p + 1}`,
        category: "Windows & Glazing",
        level: "First Floor (RL +3.40 ~ +5.75)",
        dimensions: `0.04m x 2.30m x ${panelW.toFixed(2)}m`,
        description: "Double-glazed low-E architectural tempered glass panel with acoustic interlayer."
      }, curtainGroup, { isGlass: true, opacity: 0.32 });

      const mullionGeo = new THREE.BoxGeometry(0.12, glassH + 0.08, 0.06);
      mullionGeo.translate(-6.15, 4.58, pz - panelW / 2);
      addBimElement(mullionGeo, CRLDemoModel.Palette.mullions, {
        structure: "Upper Living Pavilion (二层主建筑体)",
        element: `Curtain Wall Structural Mullion M-${p + 1}`,
        category: "Windows & Glazing",
        level: "First Floor (RL +3.40 ~ +5.75)",
        dimensions: "0.12m x 2.38m x 0.06m"
      }, curtainGroup, { roughness: 0.25, metalness: 0.85 });
    }
    const endMullionGeo = new THREE.BoxGeometry(0.12, glassH + 0.08, 0.06);
    endMullionGeo.translate(-6.15, 4.58, 3.8);
    addBimElement(endMullionGeo, CRLDemoModel.Palette.mullions, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Curtain Wall Structural Mullion M-End",
      category: "Windows & Glazing",
      level: "First Floor (RL +3.40 ~ +5.75)",
      dimensions: "0.12m x 2.38m x 0.06m"
    }, curtainGroup, { roughness: 0.25, metalness: 0.85 });

    const headerTransomGeo = new THREE.BoxGeometry(0.14, 0.08, 9.0);
    headerTransomGeo.translate(-6.15, 5.75, 0.0);
    addBimElement(headerTransomGeo, CRLDemoModel.Palette.mullions, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Curtain Wall Header Transom",
      category: "Windows & Glazing",
      level: "First Floor (RL +5.75)",
      dimensions: "0.14m x 0.08m x 9.0m"
    }, curtainGroup, { roughness: 0.25, metalness: 0.85 });

    // Upper Floor South Ribbon Window
    const ribbonGlassGeo = new THREE.BoxGeometry(3.6, 0.85, 0.06);
    ribbonGlassGeo.translate(2.0, 4.65, 4.85);
    addBimElement(ribbonGlassGeo, CRLDemoModel.Palette.glass, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Upper Floor South Ribbon Window",
      category: "Windows & Glazing",
      level: "First Floor (RL +4.20 ~ +5.10)",
      dimensions: "3.60m x 0.85m x 0.06m"
    }, upperGroup, { isGlass: true, opacity: 0.32 });

    const ribbonFrameGeo = new THREE.BoxGeometry(3.75, 0.95, 0.12);
    ribbonFrameGeo.translate(2.0, 4.65, 4.82);
    addBimElement(ribbonFrameGeo, CRLDemoModel.Palette.mullions, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "South Ribbon Window Architectural Frame",
      category: "Windows & Glazing",
      level: "First Floor (RL +4.20 ~ +5.10)",
      dimensions: "3.75m x 0.95m x 0.12m"
    }, upperGroup);

    // -------------------------------------------------------------------------
    // Interior Timber Staircase & Screen Partition (Visible through curtain wall)
    // -------------------------------------------------------------------------
    const stairXStart = -4.8, stairXEnd = -1.2;
    const numTreads = 14;
    const treadDepth = (stairXEnd - stairXStart) / numTreads;
    const riserHeight = 3.40 / numTreads;

    for (let s = 0; s < numTreads; s++) {
      const sx = stairXStart + s * treadDepth;
      const treadGeo = new THREE.BoxGeometry(treadDepth + 0.04, 0.05, 1.1);
      treadGeo.translate(sx, s * riserHeight + 0.025, -2.8);
      addBimElement(treadGeo, CRLDemoModel.Palette.staircase, {
        structure: "Upper Living Pavilion (二层主建筑体)",
        element: `Interior Oak Stair Tread T-${s + 1}`,
        category: "Stairs & Ramps",
        level: `Stairway (RL +${(s * riserHeight).toFixed(2)})`,
        dimensions: `0.30m x 0.05m x 1.10m`
      }, upperGroup, { roughness: 0.5 });
    }

    const stringerGeo = new THREE.BoxGeometry(3.8, 0.06, 0.05);
    stringerGeo.rotateZ(Math.atan2(3.4, 3.6));
    stringerGeo.translate(-3.0, 1.7, -2.2);
    addBimElement(stringerGeo, CRLDemoModel.Palette.mullions, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Architectural Steel Stair Handrail & Stringer",
      category: "Stairs & Ramps",
      level: "Stairway (RL +0.00 ~ +3.40)",
      dimensions: "3.80m x 0.06m x 0.05m"
    }, upperGroup, { metalness: 0.85, roughness: 0.2 });

    const partitionGeo = new THREE.BoxGeometry(0.12, 2.2, 3.2);
    partitionGeo.translate(-1.0, 4.5, -1.8);
    addBimElement(partitionGeo, CRLDemoModel.Palette.interiorWall, {
      structure: "Upper Living Pavilion (二层主建筑体)",
      element: "Interior Timber Slat Partition Screen",
      category: "Walls",
      level: "First Floor (RL +3.40 ~ +5.60)",
      dimensions: "0.12m x 2.20m x 3.20m"
    }, upperGroup, { roughness: 0.6 });

    // =========================================================================
    // 4. CANTILEVERED BALCONY TERRACE (IfcSlab, IfcRailing, IfcFurniture)
    // =========================================================================
    const balconyGroup = getGroup("Cantilevered Balcony Terrace (悬挑观景露台)");

    // Balcony Deck Slab (RL +3.40, top surface at Y = 3.54)
    const balconyDeckGeo = new THREE.BoxGeometry(6.2, 0.28, 9.6);
    balconyDeckGeo.translate(-9.2, 3.4, 0.0);
    addBimElement(balconyDeckGeo, CRLDemoModel.Palette.decking, {
      structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
      element: "Cantilevered Balcony Timber Deck",
      category: "Slabs & decks",
      level: "First Floor Level (RL +3.40)",
      dimensions: "6.2m x 9.6m x 0.28m"
    }, balconyGroup, { roughness: 0.6 });

    // Parapets
    const parapetWestGeo = new THREE.BoxGeometry(0.22, 1.05, 9.6);
    parapetWestGeo.translate(-12.2, 4.05, 0.0);
    addBimElement(parapetWestGeo, CRLDemoModel.Palette.railings, {
      structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
      element: "Balcony Timber Parapet (West Front)",
      category: "Railings & Parapets",
      level: "Balcony Parapet (RL +3.54 ~ +4.59)",
      dimensions: "0.22m x 1.05m x 9.6m"
    }, balconyGroup);

    const parapetSouthGeo = new THREE.BoxGeometry(6.2, 1.05, 0.22);
    parapetSouthGeo.translate(-9.2, 4.05, 4.7);
    addBimElement(parapetSouthGeo, CRLDemoModel.Palette.railings, {
      structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
      element: "Balcony Timber Parapet (South Side)",
      category: "Railings & Parapets",
      level: "Balcony Parapet (RL +3.54 ~ +4.59)",
      dimensions: "6.2m x 1.05m x 0.22m"
    }, balconyGroup);

    const parapetNorthGeo = new THREE.BoxGeometry(6.2, 1.05, 0.22);
    parapetNorthGeo.translate(-9.2, 4.05, -4.7);
    addBimElement(parapetNorthGeo, CRLDemoModel.Palette.railings, {
      structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
      element: "Balcony Timber Parapet (North Side)",
      category: "Railings & Parapets",
      level: "Balcony Parapet (RL +3.54 ~ +4.59)",
      dimensions: "6.2m x 1.05m x 0.22m"
    }, balconyGroup);

    // -------------------------------------------------------------------------
    // Outdoor Dining Table Center at (-9.0, -0.80).
    // Length along Z: 1.60m, Width along X: 0.90m. Top surface at Y = 4.22m (RL +4.22).
    // Deck surface is at Y = 3.54m. Table clearance is 0.68m.
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // Architectural Multi-Slat Teakwood Dining Table (Center at -9.00, -0.80)
    // 5 solid teakwood planks with shadow reveal gaps, angled metal trestle legs & brass feet
    // Top surface at Y = 4.24m (RL +4.24, height 0.70m above deck RL +3.54)
    // -------------------------------------------------------------------------
    const numPlanks = 5;
    const plankW = 0.176;
    const plankGap = 0.008;
    const totalTableW = numPlanks * plankW + (numPlanks - 1) * plankGap; // 0.912m
    const tableLengthZ = 1.64;

    for (let p = 0; p < numPlanks; p++) {
      const px = -9.00 - (totalTableW / 2) + p * (plankW + plankGap) + plankW / 2;
      const plankGeo = new THREE.BoxGeometry(plankW, 0.045, tableLengthZ);
      plankGeo.translate(px, 4.215, -0.80);
      addBimElement(plankGeo, CRLDemoModel.Palette.furnitureTeak, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Solid Teak Tabletop Plank P-${p + 1}`,
        category: "Furniture",
        level: "Balcony Terrace (RL +3.54 ~ +4.24)",
        dimensions: `${plankW.toFixed(2)}m x ${tableLengthZ.toFixed(2)}m x 0.05m`,
        description: "Satin-finished solid teakwood slatted outdoor dining plank."
      }, balconyGroup, { roughness: 0.42 });
    }

    // Under-Table Teak Apron Frame (supporting planks)
    const apronGeoX1 = new THREE.BoxGeometry(totalTableW - 0.06, 0.04, 0.03);
    apronGeoX1.translate(-9.00, 4.175, -1.50);
    const apronGeoX2 = new THREE.BoxGeometry(totalTableW - 0.06, 0.04, 0.03);
    apronGeoX2.translate(-9.00, 4.175, -0.10);
    const apronGeoZ1 = new THREE.BoxGeometry(0.03, 0.04, 1.40);
    apronGeoZ1.translate(-9.38, 4.175, -0.80);
    const apronGeoZ2 = new THREE.BoxGeometry(0.03, 0.04, 1.40);
    apronGeoZ2.translate(-8.62, 4.175, -0.80);
    [apronGeoX1, apronGeoX2, apronGeoZ1, apronGeoZ2].forEach((ap, idx) => {
      addBimElement(ap, CRLDemoModel.Palette.furnitureTeak, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Dining Table Structural Apron Rail ${idx + 1}`,
        category: "Furniture"
      }, balconyGroup, { roughness: 0.45 });
    });

    // 4 Architectural Steel Corner Legs (Clean solid vertical contact from Deck Y = 3.54 to Table Y = 4.195)
    const tableLegCoords = [
      [-8.64, -1.48],
      [-8.64, -0.12],
      [-9.36, -1.48],
      [-9.36, -0.12]
    ];
    tableLegCoords.forEach(([lx, lz], idx) => {
      const legGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.655, 16);
      legGeo.translate(lx, 3.868, lz);
      addBimElement(legGeo, CRLDemoModel.Palette.furnitureMetal, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Dining Table Steel Leg ${idx + 1}`,
        category: "Furniture",
        level: "Balcony Terrace (RL +3.54 ~ +4.195)",
        dimensions: "0.05m x 0.655m x 0.05m"
      }, balconyGroup, { metalness: 0.85, roughness: 0.25 });
    });

    // Centerpiece: Contemporary Ceramic Tray with Succulent Planter
    const trayGeo = new THREE.BoxGeometry(0.24, 0.02, 0.48);
    trayGeo.translate(-9.00, 4.248, -0.80);
    addBimElement(trayGeo, CRLDemoModel.Palette.furnitureMetal, {
      structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
      element: "Balcony Table Slate Ceramic Decorative Tray",
      category: "Furniture"
    }, balconyGroup, { roughness: 0.7 });

    const planterGeo = new THREE.CylinderGeometry(0.065, 0.050, 0.05, 16);
    planterGeo.translate(-9.00, 4.28, -0.80);
    addBimElement(planterGeo, 0x4a5d42, {
      structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
      element: "Balcony Table Succulent Ceramic Planter",
      category: "Furniture"
    }, balconyGroup, { roughness: 0.6 });

    // -------------------------------------------------------------------------
    // 4 RESORT-STYLE WOVEN HONEY RATTAN TUB ARMCHAIRS (真·蜜糖色藤编弧形桶型椅)
    // 100% MATHEMATICALLY VERIFIED ORIENTATIONS & SEAT TUCK-IN:
    // ALL 4 CHAIRS FACE DIRECTLY INTO TABLE CENTER (-9.00, -0.80)!
    // - West Chair (at X = -9.88, Z = -0.80): Faces East (+X, rot = +Math.PI / 2)
    // - East Chair (at X = -8.12, Z = -0.80): Faces West (-X, rot = -Math.PI / 2)
    // - North Chair (at X = -9.00, Z = -1.95): Faces South (+Z, rot = 0.0)
    // - South Chair (at X = -9.00, Z = +0.35): Faces North (-Z, rot = Math.PI)
    //
    // ARCHITECTURAL ANATOMY PER CHAIR:
    // 1. 4 Tapered Black Steel Legs (clean direct contact from deck Y = 3.54 to plinth Y = 3.92)
    // 2. Woven Rattan Drum Plinth Base (Height 0.07m, Y = 3.92 ~ 3.99)
    // 3. Plush Oatmeal Canvas Linen Cushion with Honey Rattan Piping Welt
    // 4. 22 3D Vertical Honey-Rattan Cane Reeds (立藤经线)
    // 5. 6 3D Horizontal Roasted Caramel Rattan Rings (纬编藤箍)
    // 6. Ergonomic 234-deg Horseshoe Curved Bucket Shell (弧形环抱式桶型背壳)
    // 7. Continuous Rolled Burnished Teakwood Armrest Crest Rail (柚木扶手压顶顶圈)
    // -------------------------------------------------------------------------
    const chairConfigs = [
      { x: -9.88, z: -0.80, rot:  Math.PI / 2, name: "West Chair (Facing East to Table)" },
      { x: -8.12, z: -0.80, rot: -Math.PI / 2, name: "East Chair (Facing West to Table)" },
      { x: -9.00, z: -1.95, rot:  0.0,         name: "North Chair (Facing South to Table)" },
      { x: -9.00, z:  0.35, rot:  Math.PI,     name: "South Chair (Facing North to Table)" }
    ];

    chairConfigs.forEach((cc, ci) => {
      const chairGroup = new THREE.Group();
      chairGroup.name = `Resort_Tub_Armchair_${ci + 1}`;

      // A. 4 Outward-Splayed Slender Tapered Legs (RL +3.54 ~ +3.92, cleanly connecting deck to seat)
      const legOffsets = [
        { dx: -0.17, dz:  0.15, tiltZ:  0.08, tiltX: -0.08 }, // Front Left
        { dx:  0.17, dz:  0.15, tiltZ: -0.08, tiltX: -0.08 }, // Front Right
        { dx: -0.17, dz: -0.19, tiltZ:  0.08, tiltX:  0.08 }, // Back Left
        { dx:  0.17, dz: -0.19, tiltZ: -0.08, tiltX:  0.08 }  // Back Right
      ];
      legOffsets.forEach((lo, li) => {
        const legCyl = new THREE.CylinderGeometry(0.012, 0.016, 0.38, 12);
        legCyl.rotateZ(lo.tiltZ);
        legCyl.rotateX(lo.tiltX);
        legCyl.translate(lo.dx, 3.73, lo.dz);
        addBimElement(legCyl, CRLDemoModel.Palette.furnitureMetal, {
          structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
          element: `Armchair ${ci + 1} Tapered Bronze Leg ${li + 1}`,
          category: "Furniture",
          level: "Balcony Terrace (RL +3.54 ~ +3.92)",
          dimensions: "0.03m x 0.38m x 0.03m"
        }, chairGroup, { roughness: 0.35, metalness: 0.85 });
      });

      // C. Woven Honey Rattan Circular Plinth Drum (Y = 3.92 ~ 3.99)
      const baseBasket = new THREE.CylinderGeometry(0.26, 0.245, 0.07, 24);
      baseBasket.translate(0, 3.955, -0.02);
      addBimElement(baseBasket, CRLDemoModel.Palette.furnitureWicker, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Armchair ${ci + 1} Woven Honey Rattan Plinth`,
        category: "Furniture",
        level: "Balcony Terrace (RL +3.92 ~ +3.99)",
        dimensions: "0.52m x 0.07m x 0.52m",
        description: "Hand-woven all-weather golden honey rattan circular seat support plinth."
      }, chairGroup, { roughness: 0.65 });

      // Plinth Perimeter Accent Cord
      const plinthCordCurve = new THREE.EllipseCurve(0, -0.02, 0.258, 0.258, 0, 2 * Math.PI, false, 0);
      const plinthCordPts = plinthCordCurve.getPoints(28).map(p => new THREE.Vector3(p.x, 3.93, p.y));
      const plinthCordCat = new THREE.CatmullRomCurve3(plinthCordPts, true);
      const plinthCordGeo = new THREE.TubeGeometry(plinthCordCat, 28, 0.007, 8, true);
      addBimElement(plinthCordGeo, CRLDemoModel.Palette.furnitureWeave, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Armchair ${ci + 1} Plinth Weave Accent Cord`,
        category: "Furniture"
      }, chairGroup, { roughness: 0.60 });

      // D. Deep Oatmeal Canvas Linen Cushion (Y = 3.99 ~ 4.07)
      const seatCushion = new THREE.CylinderGeometry(0.245, 0.245, 0.08, 24);
      seatCushion.translate(0, 4.03, -0.02);
      addBimElement(seatCushion, CRLDemoModel.Palette.furnitureCushion, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Armchair ${ci + 1} Oatmeal Linen Seat Cushion`,
        category: "Furniture",
        level: "Balcony Terrace (RL +3.99 ~ +4.07)",
        dimensions: "0.49m x 0.08m x 0.49m",
        description: "High-resilience foam cushion upholstered in weather-resistant oatmeal canvas linen."
      }, chairGroup, { roughness: 0.90 });

      // Cushion Top Perimeter Piping Welt Cord
      const pipingCurve = new THREE.EllipseCurve(0, -0.02, 0.245, 0.245, 0, 2 * Math.PI, false, 0);
      const pipingPts = pipingCurve.getPoints(32).map(p => new THREE.Vector3(p.x, 4.07, p.y));
      const pipingCatmull = new THREE.CatmullRomCurve3(pipingPts, true);
      const pipingGeo = new THREE.TubeGeometry(pipingCatmull, 32, 0.006, 8, true);
      addBimElement(pipingGeo, CRLDemoModel.Palette.furniturePiping, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Armchair ${ci + 1} Cushion Piping Welt Cord`,
        category: "Furniture"
      }, chairGroup, { roughness: 0.65 });

      // E. Parametric Ergonomic Horseshoe Bucket Backing Shell (弧形环抱式桶型背壳)
      // Wraps around the back (local Z < 0) and sides, leaving front open (+Z)
      const phiStart = -Math.PI * 0.65; // -117 deg
      const phiEnd   =  Math.PI * 0.65; // +117 deg
      const rShell   = 0.27;

      const numArc = 24;
      const numH = 5;
      const tubGeo = new THREE.BufferGeometry();
      const tubPos = [];
      const tubUvs = [];

      for (let j = 0; j <= numH; j++) {
        const v = j / numH;
        for (let i = 0; i <= numArc; i++) {
          const u = i / numArc;
          const phi = phiStart + u * (phiEnd - phiStart);
          const x = (rShell - 0.005) * Math.sin(phi);
          const z = -0.04 - (rShell - 0.005) * Math.cos(phi);

          // Ergonomic sloping profile: peak at backrest (Y = 4.45), sloping smoothly to armrests (Y = 4.22)
          const armFactor = Math.max(0, Math.cos(phi));
          const yTop = 4.22 + 0.23 * Math.pow(armFactor, 0.7);
          const yBot = 3.96;
          const y = yBot + v * (yTop - yBot);

          tubPos.push(x, y, z);
          tubUvs.push(u, v);
        }
      }

      const tubIndices = [];
      for (let j = 0; j < numH; j++) {
        for (let i = 0; i < numArc; i++) {
          const a = j * (numArc + 1) + i;
          const b = a + 1;
          const c = a + (numArc + 1);
          const d = c + 1;
          tubIndices.push(a, c, b);
          tubIndices.push(b, c, d);
        }
      }
      tubGeo.setIndex(tubIndices);
      tubGeo.setAttribute('position', new THREE.Float32BufferAttribute(tubPos, 3));
      tubGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tubUvs, 2));
      tubGeo.computeVertexNormals();

      addBimElement(tubGeo, CRLDemoModel.Palette.furnitureWicker, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Armchair ${ci + 1} Curved Honey Rattan Tub Shell`,
        category: "Furniture",
        level: "Balcony Terrace (RL +3.96 ~ +4.45)",
        dimensions: "0.54m x 0.49m x 0.50m",
        description: "Continuous curved tub armchair bucket shell in rich golden amber honey rattan."
      }, chairGroup, { roughness: 0.65 });

      // F. 22 3D Vertical Honey-Rattan Cane Reeds (立藤经向骨架)
      // Generates unmistakable true-3D fluting and shadow lines around the curved back!
      const numReeds = 22;
      for (let k = 0; k < numReeds; k++) {
        const phi = phiStart + (k / (numReeds - 1)) * (phiEnd - phiStart);
        const rx = (rShell + 0.003) * Math.sin(phi);
        const rz = -0.04 - (rShell + 0.003) * Math.cos(phi);
        const armFactor = Math.max(0, Math.cos(phi));
        const yTop = 4.22 + 0.23 * Math.pow(armFactor, 0.7);
        const yBot = 3.96;
        const hReed = yTop - yBot;

        const reedGeo = new THREE.CylinderGeometry(0.006, 0.006, hReed, 8);
        reedGeo.translate(rx, yBot + hReed / 2, rz);
        addBimElement(reedGeo, CRLDemoModel.Palette.furnitureWicker, {
          structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
          element: `Armchair ${ci + 1} Vertical Rattan Cane Reed ${k + 1}`,
          category: "Furniture"
        }, chairGroup, { roughness: 0.60 });
      }

      // G. 6 3D Horizontal Roasted Caramel Rattan Weave Rings (纬编藤箍密环)
      [0.15, 0.32, 0.50, 0.68, 0.84, 0.95].forEach((relH, bIdx) => {
        const bandPts = [];
        for (let i = 0; i <= 28; i++) {
          const phi = phiStart + (i / 28) * (phiEnd - phiStart);
          const x = (rShell + 0.009) * Math.sin(phi);
          const z = -0.04 - (rShell + 0.009) * Math.cos(phi);
          const armFactor = Math.max(0, Math.cos(phi));
          const yTop = 4.22 + 0.23 * Math.pow(armFactor, 0.7);
          const y = 3.96 + relH * (yTop - 3.96);
          bandPts.push(new THREE.Vector3(x, y, z));
        }
        const curve = new THREE.CatmullRomCurve3(bandPts);
        const bandGeo = new THREE.TubeGeometry(curve, 28, 0.007, 8, false);
        addBimElement(bandGeo, CRLDemoModel.Palette.furnitureWeave, {
          structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
          element: `Armchair ${ci + 1} Roasted Caramel Wicker Ring ${bIdx + 1}`,
          category: "Furniture"
        }, chairGroup, { roughness: 0.58 });
      });

      // H. Continuous Rolled Burnished Teakwood Armrest Crest Rail (柚木扶手压顶顶圈)
      const rimPts = [];
      for (let i = 0; i <= 28; i++) {
        const phi = phiStart + (i / 28) * (phiEnd - phiStart);
        const x = rShell * Math.sin(phi);
        const z = -0.04 - rShell * Math.cos(phi);
        const armFactor = Math.max(0, Math.cos(phi));
        const yTop = 4.22 + 0.23 * Math.pow(armFactor, 0.7);
        rimPts.push(new THREE.Vector3(x, yTop + 0.014, z));
      }
      const rimCurve = new THREE.CatmullRomCurve3(rimPts);
      const rimGeo = new THREE.TubeGeometry(rimCurve, 28, 0.018, 10, false);
      addBimElement(rimGeo, CRLDemoModel.Palette.furnitureTeak, {
        structure: "Cantilevered Balcony Terrace (悬挑观景露台)",
        element: `Armchair ${ci + 1} Burnished Teak Crest & Armrest Rail`,
        category: "Furniture",
        description: "Smooth continuous bent teakwood rim contouring seamlessly from armrests to high backrest."
      }, chairGroup, { roughness: 0.40 });

      // Rotate and position entire chair to strictly face table center!
      chairGroup.rotation.y = cc.rot;
      chairGroup.position.set(cc.x, 0, cc.z);
      balconyGroup.add(chairGroup);
    });

    // =========================================================================
    // 5. GABLED ROOF STRUCTURE (IfcRoof) - Standing-seam Zinc Roof & Soffits
    // =========================================================================
    const roofGroup = getGroup("Gabled Roof Structure (人字双坡锌钢屋面)");

    const roofLength = 19.2;
    const slopeWidth = 5.86;
    const pitchAngle = Math.atan2(8.36 - 5.75, 5.3); // ~26.2 degrees

    // South Slope Roof Panel
    const southRoofGeo = new THREE.BoxGeometry(roofLength, 0.12, slopeWidth);
    southRoofGeo.rotateX(pitchAngle);
    southRoofGeo.translate(2.8, 7.05, 2.65);
    addBimElement(southRoofGeo, CRLDemoModel.Palette.roofs, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "Standing Seam Zinc Roof Panel (South Slope)",
      category: "Roofs",
      rawCategory: "Roofs",
      level: "Roof Level (RL +5.75 ~ +8.36)",
      dimensions: `19.20m x 0.12m x 5.86m`,
      description: "Pre-weathered titanium zinc standing-seam roof cladding with high solar reflectance."
    }, roofGroup, { roughness: 0.35, metalness: 0.5 });

    // North Slope Roof Panel
    const northRoofGeo = new THREE.BoxGeometry(roofLength, 0.12, slopeWidth);
    northRoofGeo.rotateX(-pitchAngle);
    northRoofGeo.translate(2.8, 7.05, -2.65);
    addBimElement(northRoofGeo, CRLDemoModel.Palette.roofs, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "Standing Seam Zinc Roof Panel (North Slope)",
      category: "Roofs",
      rawCategory: "Roofs",
      level: "Roof Level (RL +5.75 ~ +8.36)",
      dimensions: `19.20m x 0.12m x 5.86m`,
      description: "Pre-weathered titanium zinc standing-seam roof cladding."
    }, roofGroup, { roughness: 0.35, metalness: 0.5 });

    // Architectural Soffit Ceilings under eaves
    const southSoffitGeo = new THREE.BoxGeometry(roofLength - 0.2, 0.04, 0.65);
    southSoffitGeo.translate(2.8, 5.74, 4.975);
    addBimElement(southSoffitGeo, CRLDemoModel.Palette.soffit, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "South Eave Architectural Soffit Panel",
      category: "Roofs",
      level: "Roof Eave (RL +5.74)",
      dimensions: "19.00m x 0.04m x 0.65m"
    }, roofGroup, { roughness: 0.6, metalness: 0.2 });

    const northSoffitGeo = new THREE.BoxGeometry(roofLength - 0.2, 0.04, 0.65);
    northSoffitGeo.translate(2.8, 5.74, -4.975);
    addBimElement(northSoffitGeo, CRLDemoModel.Palette.soffit, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "North Eave Architectural Soffit Panel",
      category: "Roofs",
      level: "Roof Eave (RL +5.74)",
      dimensions: "19.00m x 0.04m x 0.65m"
    }, roofGroup, { roughness: 0.6, metalness: 0.2 });

    // Standing Seam Ribs along the roof (spaced every 1.1m)
    for (let rx = -6.2; rx <= 11.8; rx += 1.1) {
      const ribSouthGeo = new THREE.BoxGeometry(0.04, 0.05, slopeWidth);
      ribSouthGeo.rotateX(pitchAngle);
      ribSouthGeo.translate(rx, 7.12, 2.65);
      addBimElement(ribSouthGeo, CRLDemoModel.Palette.roofTrim, {
        structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
        element: `Standing Seam Rib S-${rx.toFixed(1)}`,
        category: "Roofs",
        dimensions: "0.04m x 0.05m x 5.86m"
      }, roofGroup, { metalness: 0.7 });

      const ribNorthGeo = new THREE.BoxGeometry(0.04, 0.05, slopeWidth);
      ribNorthGeo.rotateX(-pitchAngle);
      ribNorthGeo.translate(rx, 7.12, -2.65);
      addBimElement(ribNorthGeo, CRLDemoModel.Palette.roofTrim, {
        structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
        element: `Standing Seam Rib N-${rx.toFixed(1)}`,
        category: "Roofs",
        dimensions: "0.04m x 0.05m x 5.86m"
      }, roofGroup, { metalness: 0.7 });
    }

    // Zinc Ridge Cap & Flashing
    const ridgeCapGeo = new THREE.BoxGeometry(roofLength + 0.2, 0.1, 0.35);
    ridgeCapGeo.translate(2.8, 8.42, 0.0);
    addBimElement(ridgeCapGeo, CRLDemoModel.Palette.roofTrim, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "Zinc Ridge Cap & Continuous Flashing",
      category: "Roofs",
      level: "Roof Apex (RL +8.42)",
      dimensions: `${(roofLength + 0.2).toFixed(2)}m x 0.10m x 0.35m`
    }, roofGroup, { metalness: 0.7 });

    // Eaves Fascia & Gutter (South & North)
    const fasciaSouthGeo = new THREE.BoxGeometry(roofLength, 0.25, 0.12);
    fasciaSouthGeo.translate(2.8, 5.72, 5.3);
    addBimElement(fasciaSouthGeo, CRLDemoModel.Palette.roofTrim, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "Eaves Fascia & Gutter Trim (South)",
      category: "Roofs",
      dimensions: "19.20m x 0.25m x 0.12m"
    }, roofGroup);

    const fasciaNorthGeo = new THREE.BoxGeometry(roofLength, 0.25, 0.12);
    fasciaNorthGeo.translate(2.8, 5.72, -5.3);
    addBimElement(fasciaNorthGeo, CRLDemoModel.Palette.roofTrim, {
      structure: "Gabled Roof Structure (人字双坡锌钢屋面)",
      element: "Eaves Fascia & Gutter Trim (North)",
      category: "Roofs",
      dimensions: "19.20m x 0.25m x 0.12m"
    }, roofGroup);

    return root;
  }
}

// Global alias for compatibility
const VillaDemoModel = CRLDemoModel;
