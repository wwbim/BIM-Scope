/**
 * Pure JavaScript IFC Parser (Supports IFC2X3, IFC4, and IFC4.3 add2)
 * Built-in STEP (ISO 10303-21) parser for zero-dependency local execution
 * @author WWBIM
 */
/**
 * Pure JavaScript CSG (Constructive Solid Geometry) via BSP Tree
 * Optimized for Three.js BufferGeometry subtraction (wall openings, cutouts)
 * @author WWBIM
 */
const IFCCSG = (function() {
  function Vertex(pos, normal, uv) {
    this.pos = pos ? pos.clone() : new THREE.Vector3();
    this.normal = normal ? normal.clone() : new THREE.Vector3();
    this.uv = uv ? uv.clone() : new THREE.Vector2();
  }
  Vertex.prototype.clone = function() {
    return new Vertex(this.pos, this.normal, this.uv);
  };
  Vertex.prototype.interpolate = function(other, t) {
    return new Vertex(
      this.pos.clone().lerp(other.pos, t),
      this.normal.clone().lerp(other.normal, t).normalize(),
      this.uv.clone().lerp(other.uv, t)
    );
  };

  function Plane(normal, w) {
    this.normal = normal;
    this.w = w;
  }
  Plane.EPSILON = 1e-5;
  Plane.fromPoints = function(a, b, c) {
    const n = new THREE.Vector3().crossVectors(
      b.pos.clone().sub(a.pos),
      c.pos.clone().sub(a.pos)
    ).normalize();
    return new Plane(n, n.dot(a.pos));
  };
  Plane.prototype.clone = function() {
    return new Plane(this.normal.clone(), this.w);
  };
  Plane.prototype.flip = function() {
    this.normal.negate();
    this.w = -this.w;
  };
  Plane.prototype.splitPolygon = function(polygon, coplanarFront, coplanarBack, front, back) {
    const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
    let polygonType = 0;
    const types = [];
    for (let i = 0; i < polygon.vertices.length; i++) {
      const t = this.normal.dot(polygon.vertices[i].pos) - this.w;
      const type = (t < -Plane.EPSILON) ? BACK : (t > Plane.EPSILON) ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }
    switch (polygonType) {
      case COPLANAR:
        (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
        break;
      case FRONT:
        front.push(polygon);
        break;
      case BACK:
        back.push(polygon);
        break;
      case SPANNING:
        const f = [], b = [];
        for (let i = 0; i < polygon.vertices.length; i++) {
          const j = (i + 1) % polygon.vertices.length;
          const ti = types[i], tj = types[j];
          const vi = polygon.vertices[i], vj = polygon.vertices[j];
          if (ti !== BACK) f.push(vi);
          if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);
          if ((ti | tj) === SPANNING) {
            const t = (this.w - this.normal.dot(vi.pos)) / this.normal.dot(vj.pos.clone().sub(vi.pos));
            const v = vi.interpolate(vj, t);
            f.push(v);
            b.push(v.clone());
          }
        }
        if (f.length >= 3) front.push(new Polygon(f, polygon.shared));
        if (b.length >= 3) back.push(new Polygon(b, polygon.shared));
        break;
    }
  };

  function Polygon(vertices, shared) {
    this.vertices = vertices;
    this.shared = shared;
    this.plane = Plane.fromPoints(vertices[0], vertices[1], vertices[2]);
  }
  Polygon.prototype.clone = function() {
    return new Polygon(this.vertices.map(v => v.clone()), this.shared);
  };
  Polygon.prototype.flip = function() {
    this.vertices.reverse().forEach(v => v.normal.negate());
    this.plane.flip();
  };

  function Node(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons) this.build(polygons);
  }
  Node.prototype.clone = function() {
    const node = new Node();
    node.plane = this.plane && this.plane.clone();
    node.front = this.front && this.front.clone();
    node.back = this.back && this.back.clone();
    node.polygons = this.polygons.map(p => p.clone());
    return node;
  };
  Node.prototype.invert = function() {
    for (let i = 0; i < this.polygons.length; i++) this.polygons[i].flip();
    if (this.plane) this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const temp = this.front;
    this.front = this.back;
    this.back = temp;
  };
  Node.prototype.clipPolygons = function(polygons) {
    if (!this.plane) return polygons.slice();
    let front = [], back = [];
    for (let i = 0; i < polygons.length; i++) {
      this.plane.splitPolygon(polygons[i], front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];
    return front.concat(back);
  };
  Node.prototype.clipTo = function(bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  };
  Node.prototype.allPolygons = function() {
    let polygons = this.polygons.slice();
    if (this.front) polygons = polygons.concat(this.front.allPolygons());
    if (this.back) polygons = polygons.concat(this.back.allPolygons());
    return polygons;
  };
  Node.prototype.build = function(polygons) {
    if (!polygons.length) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    const front = [], back = [];
    for (let i = 0; i < polygons.length; i++) {
      this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
    }
    if (front.length) {
      if (!this.front) this.front = new Node();
      this.front.build(front);
    }
    if (back.length) {
      if (!this.back) this.back = new Node();
      this.back.build(back);
    }
  };

  function CSGTree() {
    this.polygons = [];
  }
  CSGTree.fromPolygons = function(polygons) {
    const csg = new CSGTree();
    csg.polygons = polygons;
    return csg;
  };
  CSGTree.prototype.clone = function() {
    const csg = new CSGTree();
    csg.polygons = this.polygons.map(p => p.clone());
    return csg;
  };
  CSGTree.prototype.toPolygons = function() {
    return this.polygons;
  };
  CSGTree.prototype.subtract = function(csg) {
    const a = new Node(this.clone().polygons);
    const b = new Node(csg.clone().polygons);
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return CSGTree.fromPolygons(a.allPolygons());
  };

  function fromGeometry(geom) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const polygons = [];
    if (!pos) return new CSGTree();
    for (let i = 0; i < pos.count; i += 3) {
      const verts = [];
      for (let j = 0; j < 3; j++) {
        const idx = i + j;
        const p = new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
        const n = norm ? new THREE.Vector3(norm.getX(idx), norm.getY(idx), norm.getZ(idx)) : new THREE.Vector3(0, 1, 0);
        const u = uv ? new THREE.Vector2(uv.getX(idx), uv.getY(idx)) : new THREE.Vector2(0, 0);
        verts.push(new Vertex(p, n, u));
      }
      const d1 = verts[1].pos.clone().sub(verts[0].pos);
      const d2 = verts[2].pos.clone().sub(verts[0].pos);
      if (d1.cross(d2).lengthSq() > 1e-12) {
        polygons.push(new Polygon(verts));
      }
    }
    return CSGTree.fromPolygons(polygons);
  }

  function toGeometry(csg) {
    const polygons = csg.toPolygons();
    const positions = [];
    const normals = [];
    for (let i = 0; i < polygons.length; i++) {
      const poly = polygons[i];
      const verts = poly.vertices;
      for (let j = 1; j < verts.length - 1; j++) {
        positions.push(verts[0].pos.x, verts[0].pos.y, verts[0].pos.z);
        positions.push(verts[j].pos.x, verts[j].pos.y, verts[j].pos.z);
        positions.push(verts[j + 1].pos.x, verts[j + 1].pos.y, verts[j + 1].pos.z);

        const n = poly.plane.normal;
        normals.push(n.x, n.y, n.z);
        normals.push(n.x, n.y, n.z);
        normals.push(n.x, n.y, n.z);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geom;
  }

  function subtract(geomA, geomB) {
    const a = fromGeometry(geomA);
    const b = fromGeometry(geomB);
    return toGeometry(a.subtract(b));
  }

  return {
    fromGeometry: fromGeometry,
    toGeometry: toGeometry,
    subtract: subtract
  };
})();

class IFCParser {
  constructor() {
    this.author = "WWBIM";
    this.schema = "IFC4X3_ADD2";
    this.mvd = null;
    this.software = null;
    this.fileOriginatingSystem = null;
    this.filePreprocessor = null;
    this.fileMetadata = null;
    this.entities = new Map();
    this.elements = [];
    this.spatialTree = null;
    this.styleMap = new Map(); // itemId / shapeId / prodId -> style object { color, opacity, transparent, roughness, metalness }
    this.materialStyleMap = new Map(); // prodId -> style object
    this.voidsMap = new Map(); // hostElementId -> [openingElementId, ...]
    this.propertiesMap = new Map(); // prodId -> Array<{ psetId, name, properties: [] }>
    this.quantitiesMap = new Map(); // prodId -> Array<{ qsetId, name, quantities: [] }>
    this.typesMap = new Map(); // prodId -> { typeId, typeClass, typeName, typeGuid, typeTag, psets: [] }
    this.materialsMap = new Map(); // prodId -> { materialNames: [], layers: [] }
    this.unitScale = 1.0; // mm to m or m to m
    this.angleScale = Math.PI / 180; // Default: Degrees to Radians (standard in >95% architectural IFC)
  }
  
  get formattedSchema() {
    if (!this.schema) return 'IFC';
    const s = this.schema.trim().toUpperCase();
    if (s.startsWith('IFC4X3')) return 'IFC 4.3';
    if (s.startsWith('IFC4X2')) return 'IFC 4.2';
    if (s.startsWith('IFC4X1')) return 'IFC 4.1';
    if (s.startsWith('IFC4')) return 'IFC 4';
    if (s.startsWith('IFC2X3')) return 'IFC 2x3';
    if (s.startsWith('IFC2X2')) return 'IFC 2x2';
    if (s.startsWith('IFC2X')) return 'IFC 2x';
    if (s.startsWith('IFC')) return 'IFC ' + s.substring(3).toLowerCase();
    return `IFC ${this.schema}`;
  }
  
  // Revit Standard Category Default Materials
  // Replicating Revit viewport "Consistent Colors / Shaded" mode defaults
  static RevitCategoryDefaults = {
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
    // 2. Doors (Warm Architectural Wood Tone)
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
    FLOOR: {
      category: 'Floor / Slab',
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
      metalness: 0.35
    },
    // 6. Concrete Beams (Clean Structural RC Light Grey)
    CONCRETE_BEAM: {
      category: 'Beam',
      color: 0xcbd5e1,
      opacity: 1.0,
      transparent: false,
      roughness: 0.7,
      metalness: 0.05
    },
    // 7. Concrete Columns (Architectural Concrete Column Light Grey)
    CONCRETE_COLUMN: {
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
      color: 0x94a3b8,
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
      category: 'MEP Duct',
      color: 0x94a3b8,
      opacity: 1.0,
      transparent: false,
      roughness: 0.35,
      metalness: 0.5
    },
    // 14. MEP Pipes (Industrial Piping Blue)
    MEP_PIPE: {
      category: 'MEP Pipe',
      color: 0x38bdf8,
      opacity: 1.0,
      transparent: false,
      roughness: 0.35,
      metalness: 0.4
    },
    // 15. MEP Cable Trays & Electrical (Amber / Industrial)
    MEP_ELECTRICAL: {
      category: 'MEP Electrical',
      color: 0xf59e0b,
      opacity: 1.0,
      transparent: false,
      roughness: 0.45,
      metalness: 0.2
    },
    // 16. Site & Civil (Asphalt Road / Pavement)
    ROAD: {
      category: 'Road & Pavement',
      color: 0x1e293b,
      opacity: 1.0,
      transparent: false,
      roughness: 0.85,
      metalness: 0.02
    },
    // 17. Landscape / Vegetation (Soft Natural Green)
    LANDSCAPE: {
      category: 'Landscape',
      color: 0x22c55e,
      opacity: 1.0,
      transparent: false,
      roughness: 0.9,
      metalness: 0.0
    },
    // 18. Default Architectural Fallback
    DEFAULT: {
      category: 'Structure',
      color: 0xd1d5db,
      opacity: 1.0,
      transparent: false,
      roughness: 0.65,
      metalness: 0.05
    }
  };

  static CategoryColors = {
    'IFCSLAB': 0xb8b3ad,
    'IFCCOLUMN': 0xd1d5db,
    'IFCWALL': 0xece7de,
    'IFCWALLSTANDARDCASE': 0xece7de,
    'IFCROOF': 0x4b5563,
    'IFCBEAM': 0xcbd5e1,
    'IFCMEMBER': 0x3b4754,
    'IFCPLATE': 0x3b4754,
    'IFCRAMP': 0xb8b3ad,
    'IFCRAMPFLIGHT': 0xb8b3ad,
    'IFCSTAIR': 0x9ca3af,
    'IFCSTAIRFLIGHT': 0x9ca3af,
    'IFCFOOTING': 0x94a3b8,
    'IFCPILE': 0x94a3b8,
    'IFCDEEPFOUNDATION': 0x94a3b8,
    'IFCRAIL': 0x3b4754,
    'IFCTRACKELEMENT': 0x3b4754,
    'IFCTUNNEL': 0x94a3b8,
    'IFCCIVILELEMENT': 0x94a3b8,
    'IFCBUILTELEMENT': 0x94a3b8,
    'IFCGEOTECHNICALELEMENT': 0x78716c,
    'IFCEARTHWORKS': 0x78716c,
    'IFCDOOR': 0xb48256,
    'IFCWINDOW': 0x7dd3fc,
    'IFCRAILING': 0x64748b,
    'IFCCOVERING': 0xf1f5f9,
    'IFCFURNISHINGELEMENT': 0xa1a1aa,
    'IFCFLOWTERMINAL': 0x94a3b8,
    'IFCFLOWSEGMENT': 0x38bdf8,
    'IFCFLOWFITTING': 0x94a3b8,
    'IFCDISTRIBUTIONELEMENT': 0x38bdf8,
    'DEFAULT': 0xd1d5db
  };
  
  parseText(text, onProgress) {
    if (onProgress) onProgress(0.1, "Tokenizing STEP records...");
    this.entities.clear();
    this.elements = [];
    this.styleMap.clear();
    this.materialStyleMap.clear();
    this.propertiesMap.clear();
    this.quantitiesMap.clear();
    this.typesMap.clear();
    this.materialsMap.clear();
    
    // 1. Detect Schema & Header Metadata (Schema, MVD, Originating System, Preprocessor)
    this.parseHeaderMetadata(text);
    
    // 2. Tokenize STEP lines
    // Match #123 = IFCTYPE(args);
    const regex = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\);(?=\s*#|\s*ENDSEC)/g;
    let match;
    let count = 0;
    
    // Clean comments first
    const cleanText = text.replace(/\/\*[\s\S]*?\*\//g, '');
    
    while ((match = regex.exec(cleanText)) !== null) {
      const id = parseInt(match[1], 10);
      const type = match[2].toUpperCase();
      const rawArgs = match[3];
      
      this.entities.set(id, {
        id: id,
        type: type,
        rawArgs: rawArgs,
        parsedArgs: null
      });
      count++;
    }
    
    // 2b. Resolve Exporting Software & Model Metadata
    this.resolveModelMetadata();
    
    if (onProgress) onProgress(0.35, `Indexed ${count} IFC entities. Resolving styles and spatial hierarchy...`);
    
    // 3. Resolve Units
    this.detectUnits();

    // 4. Resolve Surface Styles & Colors (IFCCOLOURRGB, IFCSURFACESTYLE, IFCSTYLEDITEM)
    this.buildStyleMap();
    
    // 5. Build Hierarchy
    this.buildHierarchy();
    
    // 5b. Index Void Openings (IFCRELVOIDSELEMENT)
    this.buildVoidsMap();

    // 5c. Index Property Sets & Quantities (IFCRELDEFINESBYPROPERTIES)
    this.buildPropertiesMap();

    // 5d. Index Type Definitions (IFCRELDEFINESBYTYPE)
    this.buildTypesMap();

    // 5e. Index Materials & Layer Sets (IFCRELASSOCIATESMATERIAL)
    this.buildMaterialsMap();
    
    if (onProgress) onProgress(0.5, "Reconstructing 3D geometries...");
    
    // 6. Build 3D Meshes
    const rootGroup = new THREE.Group();
    rootGroup.name = "IFC_Model";
    
    // Find all physical products
    const products = [];
    for (const [id, ent] of this.entities.entries()) {
      if (this.isProductType(ent.type)) {
        products.push(ent);
      } else if (ent.type.startsWith('IFC')) {
        // Fallback for custom or novel IFC types with placement and shape
        const args = this.parseArgs(ent.rawArgs);
        if (args.length >= 7 && args[5] && args[5].startsWith('#') && args[6] && args[6].startsWith('#')) {
          if (!this.isSpatialType(ent.type)) {
            products.push(ent);
          }
        }
      }
    }
    
    let processed = 0;
    const totalProducts = products.length;
    
    for (const prod of products) {
      try {
        const mesh = this.buildProductMesh(prod);
        if (mesh) {
          rootGroup.add(mesh);
        }
      } catch (err) {
        console.warn(`Error building IFC mesh #${prod.id} (${prod.type}):`, err);
      }
      processed++;
      if (processed % 40 === 0 && onProgress) {
        onProgress(0.5 + 0.45 * (processed / Math.max(1, totalProducts)), `Built ${processed}/${totalProducts} elements...`);
      }
    }
    
    if (onProgress) onProgress(1.0, "IFC model ready");
    return rootGroup;
  }
  
  detectUnits() {
    this.unitScale = 1.0;
    this.angleScale = Math.PI / 180; // Default: Degrees (used by Revit/Archicad)

    // 1. Check IFCUNITASSIGNMENT for project assigned units
    let assignedUnitIds = [];
    for (const ent of this.entities.values()) {
      if (ent.type === 'IFCUNITASSIGNMENT') {
        assignedUnitIds = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        break;
      }
    }

    if (assignedUnitIds.length > 0) {
      for (const uId of assignedUnitIds) {
        const uEnt = this.getEntity(uId);
        if (!uEnt) continue;
        const str = uEnt.rawArgs.toUpperCase();
        if (str.includes('.LENGTHUNIT.')) {
          if (str.includes('.MILLI.')) {
            this.unitScale = 0.001; // mm to m
          } else if (str.includes('.METRE.')) {
            this.unitScale = 1.0;   // m
          }
        } else if (str.includes('.PLANEANGLEUNIT.')) {
          if (str.includes('DEGREE')) {
            this.angleScale = Math.PI / 180;
          } else if (str.includes('.RADIAN.')) {
            this.angleScale = 1.0;
          }
        }
      }
      return;
    }

    // Fallback: scan entities
    for (const ent of this.entities.values()) {
      if (ent.type === 'IFCSIUNIT') {
        const str = ent.rawArgs.toUpperCase();
        if (str.includes('.LENGTHUNIT.')) {
          if (str.includes('.MILLI.')) {
            this.unitScale = 0.001;
            break;
          } else if (str.includes('.METRE.')) {
            this.unitScale = 1.0;
            break;
          }
        }
      } else if (ent.type === 'IFCCONVERSIONBASEDUNIT') {
        const str = ent.rawArgs.toUpperCase();
        if (str.includes('.PLANEANGLEUNIT.') && str.includes('DEGREE')) {
          this.angleScale = Math.PI / 180;
        }
      }
    }
  }

  // Parse Surface Styles, Colors, Presentation Layers, and Materials
  buildStyleMap() {
    this.styleMap.clear();
    this.materialStyleMap.clear();

    // 1. Resolve IFCCOLOURRGB(Name, Red, Green, Blue)
    const colors = new Map();
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCCOLOURRGB') {
        const args = this.parseArgs(ent.rawArgs);
        let rVal = NaN, gVal = NaN, bVal = NaN;
        if (args.length >= 4) {
          // Arg 0 is label/name (e.g. 'white', '252', 'green', $), args 1,2,3 are RGB
          rVal = parseFloat(args[1]);
          gVal = parseFloat(args[2]);
          bVal = parseFloat(args[3]);
        } else if (args.length === 3) {
          rVal = parseFloat(args[0]);
          gVal = parseFloat(args[1]);
          bVal = parseFloat(args[2]);
        }
        if (!isNaN(rVal) && !isNaN(gVal) && !isNaN(bVal)) {
          const r = Math.min(255, Math.max(0, Math.round(rVal * 255)));
          const g = Math.min(255, Math.max(0, Math.round(gVal * 255)));
          const b = Math.min(255, Math.max(0, Math.round(bVal * 255)));
          const hex = (r << 16) | (g << 8) | b;
          colors.set(id, { color: hex, r: rVal, g: gVal, b: bVal });
        }
      }
    }
    
    // 2. Resolve IFCSURFACESTYLESHADING and IFCSURFACESTYLERENDERING
    const surfaceStyles = new Map();
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCSURFACESTYLESHADING' || ent.type === 'IFCSURFACESTYLERENDERING') {
        const args = this.parseArgs(ent.rawArgs);
        const colRef = args[0] ? parseInt(args[0].replace(/#/g, ''), 10) : null;
        let transparency = 0.0;
        if (args[1] && args[1] !== '$') {
          transparency = parseFloat(args[1]) || 0.0;
        }
        if (colRef && colors.has(colRef)) {
          const c = colors.get(colRef);
          const isTrans = transparency > 0.02;
          surfaceStyles.set(id, {
            color: c.color,
            opacity: isTrans ? Math.max(0.1, 1.0 - transparency) : 1.0,
            transparent: isTrans,
            roughness: 0.6,
            metalness: 0.1
          });
        }
      }
    }

    // 3. Resolve IFCSURFACESTYLE
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCSURFACESTYLE') {
        const args = this.parseArgs(ent.rawArgs);
        const styleName = args[0] ? args[0].replace(/'/g, '').trim() : '';
        const lowerName = styleName.toLowerCase();
        const isGlassName = lowerName.includes('glass') || lowerName.includes('glaz') ||
                            lowerName.includes('translucent') || lowerName.includes('clear') || lowerName.includes('pane');
        const isMetalName = lowerName.includes('steel') || lowerName.includes('metal') || lowerName.includes('iron') ||
                            lowerName.includes('aluminium') || lowerName.includes('aluminum') || lowerName.includes('zinc') ||
                            lowerName.includes('mesh');
        const refs = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const ref of refs) {
          if (surfaceStyles.has(ref)) {
            const base = surfaceStyles.get(ref);
            const styleObj = { ...base, name: styleName };
            if (isMetalName) {
              styleObj.transparent = false;
              styleObj.opacity = 1.0;
              styleObj.metalness = 0.82;
              styleObj.roughness = 0.28;
            } else if (isGlassName) {
              styleObj.transparent = true;
              if (!base.transparent || styleObj.opacity >= 0.99) {
                styleObj.opacity = 0.35;
              }
              const isNearWhite = styleObj.color === 0xffffff || styleObj.color === 0xf0f7f3 || ((styleObj.color >> 16) > 230 && ((styleObj.color >> 8) & 0xff) > 230 && (styleObj.color & 0xff) > 230);
              if (isNearWhite || !styleObj.color) {
                styleObj.color = 0x7dd3fc;
              }
              styleObj.roughness = 0.05;
              styleObj.metalness = 0.1;
            } else {
              // Non-glass architectural materials (concrete, masonry, timber, finishes) should remain solid opaque
              styleObj.transparent = false;
              styleObj.opacity = 1.0;
            }
            surfaceStyles.set(id, styleObj);
            break;
          } else if (colors.has(ref)) {
            const c = colors.get(ref);
            const isNearWhite = c.color === 0xffffff || c.color === 0xf0f7f3 || ((c.color >> 16) > 230 && ((c.color >> 8) & 0xff) > 230 && (c.color & 0xff) > 230);
            const glassColor = (isGlassName && (isNearWhite || !c.color)) ? 0x7dd3fc : c.color;
            surfaceStyles.set(id, {
              name: styleName,
              color: glassColor,
              opacity: isGlassName ? 0.35 : 1.0,
              transparent: isGlassName,
              roughness: isGlassName ? 0.05 : (isMetalName ? 0.28 : 0.6),
              metalness: isMetalName ? 0.82 : 0.1
            });
            break;
          }
        }
      }
    }

    // 3b. Resolve IFCPRESENTATIONSTYLEASSIGNMENT (Revit standard style wrapper)
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCPRESENTATIONSTYLEASSIGNMENT') {
        const refs = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const ref of refs) {
          if (surfaceStyles.has(ref)) {
            surfaceStyles.set(id, surfaceStyles.get(ref));
            break;
          }
        }
      }
    }
    
    // 4. Map IFCSTYLEDITEM to target representation / item / product and its own ID
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCSTYLEDITEM') {
        const args = this.parseArgs(ent.rawArgs);
        const itemRef = args[0] && args[0] !== '$' ? parseInt(args[0].replace(/#/g, ''), 10) : null;
        const styleRefs = [...(args[1] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        let resolvedStyle = null;
        for (const sRef of styleRefs) {
          if (surfaceStyles.has(sRef)) {
            resolvedStyle = surfaceStyles.get(sRef);
            break;
          } else if (colors.has(sRef)) {
            const c = colors.get(sRef);
            resolvedStyle = {
              color: c.color,
              opacity: 1.0,
              transparent: false,
              roughness: 0.6,
              metalness: 0.1
            };
            break;
          }
        }
        if (resolvedStyle) {
          this.styleMap.set(id, resolvedStyle);
          if (itemRef) {
            this.styleMap.set(itemRef, resolvedStyle);
          }
        }
      }
    }

    // 4b. Map IFCSTYLEDREPRESENTATION to styles
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCSTYLEDREPRESENTATION') {
        const refs = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const r of refs) {
          if (this.styleMap.has(r)) {
            this.styleMap.set(id, this.styleMap.get(r));
            break;
          }
        }
      }
    }

    // 4c. Map IFCMATERIALDEFINITIONREPRESENTATION (Material -> StyledRepresentation)
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCMATERIALDEFINITIONREPRESENTATION') {
        const args = this.parseArgs(ent.rawArgs);
        const repRefs = [...(args[2] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const matRef = args[3] ? parseInt(args[3].replace(/#/g, ''), 10) : null;
        if (matRef) {
          for (const repId of repRefs) {
            if (this.styleMap.has(repId)) {
              this.styleMap.set(matRef, this.styleMap.get(repId));
              break;
            }
          }
        }
      }
    }

    // 5. Map IFCPRESENTATIONLAYERWITHSTYLE to items (Civil 3D & AutoCAD style assignment)
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCPRESENTATIONLAYERWITHSTYLE') {
        const args = this.parseArgs(ent.rawArgs);
        const itemsStr = args[2] || '';
        const itemIds = [...itemsStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const lastArg = args[args.length - 1] || '';
        const styleIds = [...lastArg.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        let resolvedStyle = null;
        for (const sId of styleIds) {
          if (surfaceStyles.has(sId)) {
            resolvedStyle = surfaceStyles.get(sId);
            break;
          } else if (colors.has(sId)) {
            resolvedStyle = {
              color: colors.get(sId).color,
              opacity: 1.0,
              transparent: false,
              roughness: 0.6,
              metalness: 0.1
            };
            break;
          }
        }
        if (resolvedStyle) {
          for (const itId of itemIds) {
            if (!this.styleMap.has(itId)) {
              this.styleMap.set(itId, resolvedStyle);
            }
          }
        }
      }
    }

    // 6. Map IFCMATERIAL, IFCMATERIALLAYER, IFCMATERIALLAYERSET, IFCMATERIALLAYERSETUSAGE
    const materials = new Map();
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCMATERIAL') {
        const args = this.parseArgs(ent.rawArgs);
        const matName = args[0] ? args[0].replace(/'/g, '') : '';
        materials.set(id, matName);
        const lowerMat = matName.toLowerCase();
        if (lowerMat.includes('glass') || lowerMat.includes('glaz') || lowerMat.includes('clear')) {
          this.styleMap.set(id, { name: matName, color: 0x7dd3fc, opacity: 0.35, transparent: true, roughness: 0.1, metalness: 0.1 });
        } else if (lowerMat.includes('steel') || lowerMat.includes('metal') || lowerMat.includes('iron') || lowerMat.includes('zinc') || lowerMat.includes('aluminium') || lowerMat.includes('aluminum') || lowerMat.includes('mesh')) {
          const cur = this.styleMap.get(id);
          if (!cur || cur.color >= 0xeeeeee) {
            this.styleMap.set(id, { name: matName, color: 0x475569, opacity: 1.0, transparent: false, roughness: 0.5, metalness: 0.35 });
          }
        } else if (!this.styleMap.has(id)) {
          const c = this.getColorByName(matName, 'MATERIAL');
          if (c !== null) {
            this.styleMap.set(id, { name: matName, color: c, opacity: 1.0, transparent: false, roughness: 0.6, metalness: 0.1 });
          }
        }
      }
    }

    // Map IFCMATERIALLAYER -> underlying material
    const materialLayers = new Map();
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCMATERIALLAYER') {
        const args = this.parseArgs(ent.rawArgs);
        const matRef = args[0] ? parseInt(args[0].replace(/#/g, ''), 10) : null;
        if (matRef) {
          materialLayers.set(id, matRef);
          if (this.styleMap.has(matRef)) {
            this.styleMap.set(id, this.styleMap.get(matRef));
          }
        }
      }
    }

    // Map IFCMATERIALLAYERSET -> first layer's material
    const materialLayerSets = new Map();
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCMATERIALLAYERSET') {
        const layerRefs = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const lRef of layerRefs) {
          const matRef = materialLayers.get(lRef);
          if (matRef) {
            materialLayerSets.set(id, matRef);
            if (this.styleMap.has(matRef)) {
              this.styleMap.set(id, this.styleMap.get(matRef));
            }
            break;
          }
        }
      }
    }

    // Map IFCMATERIALLAYERSETUSAGE -> layer set's material
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCMATERIALLAYERSETUSAGE') {
        const args = this.parseArgs(ent.rawArgs);
        const setRef = args[0] ? parseInt(args[0].replace(/#/g, ''), 10) : null;
        if (setRef) {
          const matRef = materialLayerSets.get(setRef);
          if (matRef && this.styleMap.has(matRef)) {
            this.styleMap.set(id, this.styleMap.get(matRef));
          } else if (setRef && this.styleMap.has(setRef)) {
            this.styleMap.set(id, this.styleMap.get(setRef));
          }
        }
      }
    }

    // 7. Associate Materials via IFCRELASSOCIATESMATERIAL
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCRELASSOCIATESMATERIAL') {
        const args = this.parseArgs(ent.rawArgs);
        const relObjs = [...(args[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const matRef = args[5] ? parseInt(args[5].replace(/#/g, ''), 10) : null;
        if (matRef) {
          let style = this.styleMap.get(matRef);
          if (!style && materials.has(matRef)) {
            const mName = materials.get(matRef);
            const c = this.getColorByName(mName, 'MATERIAL');
            if (c !== null) {
              style = { color: c, opacity: 1.0, transparent: false, roughness: 0.6, metalness: 0.1 };
            }
          }
          if (style) {
            for (const objId of relObjs) {
              this.materialStyleMap.set(objId, style);
            }
          }
        }
      }
    }

    // 8. Propagate Type Materials via IFCRELDEFINESBYTYPE
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCRELDEFINESBYTYPE') {
        const args = this.parseArgs(ent.rawArgs);
        const relObjs = [...(args[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const typeRef = args[5] ? parseInt(args[5].replace(/#/g, ''), 10) : null;
        if (typeRef && this.materialStyleMap.has(typeRef)) {
          const tStyle = this.materialStyleMap.get(typeRef);
          for (const objId of relObjs) {
            if (!this.materialStyleMap.has(objId)) {
              this.materialStyleMap.set(objId, tStyle);
            }
          }
        }
      }
    }
  }

  isSpatialType(type) {
    return type === 'IFCPROJECT' ||
           type === 'IFCSITE' ||
           type === 'IFCBUILDING' ||
           type === 'IFCFACILITY' ||
           type === 'IFCROAD' ||
           type === 'IFCRAILWAY' ||
           type === 'IFCBRIDGE' ||
           type === 'IFCBUILDINGSTOREY' ||
           type === 'IFCSPACE' ||
           type === 'IFCOPENINGELEMENT' ||
           type === 'IFCVOID' ||
           type === 'IFCGRID';
  }
  
  isProductType(type) {
    if (!type || !type.startsWith('IFC')) return false;
    if (this.isSpatialType(type)) return false;
    if (type === 'IFCANNOTATION' || type === 'IFCGEOMETRICREPRESENTATIONCONTEXT' ||
        type === 'IFCUNITASSIGNMENT' || type === 'IFCOWNERHISTORY' ||
        type === 'IFCPERSON' || type === 'IFCORGANIZATION') {
      return false;
    }
    return type.startsWith('IFCBUILT') ||
           type.startsWith('IFCBUILDING') ||
           type.startsWith('IFCCIVIL') ||
           type.startsWith('IFCWALL') ||
           type.startsWith('IFCSLAB') ||
           type.startsWith('IFCCOLUMN') ||
           type.startsWith('IFCBEAM') ||
           type.startsWith('IFCROOF') ||
           type.startsWith('IFCMEMBER') ||
           type.startsWith('IFCPLATE') ||
           type.startsWith('IFCFOOTING') ||
           type.startsWith('IFCPILE') ||
           type.startsWith('IFCRAIL') ||
           type.startsWith('IFCTRACK') ||
           type.startsWith('IFCTUNNEL') ||
           type.startsWith('IFCGEOTECHNICAL') ||
           type.startsWith('IFCDOOR') ||
           type.startsWith('IFCWINDOW') ||
           type.startsWith('IFCSTAIR') ||
           type.startsWith('IFCRAMP') ||
           type.startsWith('IFCRAILING') ||
           type.startsWith('IFCCOVERING') ||
           type.startsWith('IFCCURTAIN') ||
           type.startsWith('IFCFURNISH') ||
           type.startsWith('IFCFLOW') ||
           type.startsWith('IFCDISTRIBUTION') ||
           type.startsWith('IFCELEMENT') ||
           type.startsWith('IFCGEOGRAPHIC') ||
           type.startsWith('IFCDEEPFOUNDATION') ||
           type.startsWith('IFCEARTHWORKS') ||
           type.endsWith('ELEMENT');
  }
  
  // Fast argument parser handling nested parens and quotes
  parseArgs(raw) {
    const args = [];
    let depth = 0;
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === "'" && raw[i - 1] !== '\\') {
        inQuote = !inQuote;
        current += c;
      } else if (!inQuote && c === '(') {
        depth++;
        current += c;
      } else if (!inQuote && c === ')') {
        depth--;
        current += c;
      } else if (!inQuote && c === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    if (current.trim().length > 0) {
      args.push(current.trim());
    }
    return args;
  }
  
  cleanStepArg(str) {
    if (!str) return '';
    let s = str.trim();
    if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
      s = s.substring(1, s.length - 1).replace(/''/g, "'");
    }
    return s.trim();
  }

  cleanStepList(str) {
    if (!str) return [];
    let s = str.trim();
    if (s.startsWith('(') && s.endsWith(')')) {
      s = s.substring(1, s.length - 1).trim();
    }
    const items = [...s.matchAll(/'([^']*)'/g)].map(m => m[1].trim()).filter(v => v.length > 0 && v !== '$' && v !== "''");
    if (items.length === 0 && s && !s.startsWith("'") && s !== '$' && s !== "''") {
      return [s];
    }
    return items;
  }

  parseHeaderMetadata(text) {
    this.mvd = null;
    this.software = null;
    this.fileOriginatingSystem = null;
    this.filePreprocessor = null;
    this.headerFileName = null;
    this.headerTimestamp = null;
    this.headerAuthor = [];
    this.headerOrganization = [];
    this.headerAuthorization = null;
    this.projectName = null;
    this.projectDescription = null;
    this.projectPhase = null;
    this.fileMetadata = null;

    // 1. Detect Schema
    const schemaMatch = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
    if (schemaMatch) {
      this.schema = schemaMatch[1];
    }

    // 2. Detect MVD (Model View Definition) from FILE_DESCRIPTION
    const descMatch = text.match(/FILE_DESCRIPTION\s*\(\s*\(([\s\S]*?)\)\s*,/i) ||
                      text.match(/FILE_DESCRIPTION\s*\(([\s\S]*?)\);/i);
    if (descMatch) {
      const descContent = descMatch[1];
      const vdBracket = descContent.match(/ViewDefinition\s*\[\s*([^\]]+)\s*\]/i);
      if (vdBracket) {
        this.mvd = vdBracket[1].trim();
      } else {
        const vdColon = descContent.match(/ViewDefinition\s*[:=]\s*([^',;\)]+)/i);
        if (vdColon) {
          this.mvd = vdColon[1].trim();
        } else {
          const strMatches = [...descContent.matchAll(/'([^']*)'/g)].map(m => m[1].trim());
          for (const s of strMatches) {
            if (!s || s === '2;1' || s === '$') continue;
            const lower = s.toLowerCase();
            if (lower.includes('coordinationview') || lower.includes('referenceview') || 
                lower.includes('designtransferview') || lower.includes('alignmentview') ||
                lower.includes('quantitytakeoff') || lower.includes('structuralanalysis')) {
              this.mvd = s;
              break;
            }
          }
          if (!this.mvd) {
            for (const s of strMatches) {
              if (s && s !== '2;1' && s !== '$' && !s.toLowerCase().includes('not specified') && !s.toLowerCase().includes('unknown')) {
                this.mvd = s;
                break;
              }
            }
          }
        }
      }
    }

    // 3. Detect Originating System, Authors, Orgs & Preprocessor from FILE_NAME
    const fnMatch = text.match(/FILE_NAME\s*\(([\s\S]*?)\);/i);
    if (fnMatch) {
      const rawArgs = this.parseArgs(fnMatch[1]);
      const argsFn = rawArgs.map(a => this.cleanStepArg(a));
      // Standard ISO 10303-21 FILE_NAME:
      // args[0]: name, args[1]: timestamp, args[2]: author, args[3]: org,
      // args[4]: preprocessor_version, args[5]: originating_system, args[6]: authorization
      if (argsFn.length > 0 && argsFn[0] && argsFn[0] !== '$') {
        this.headerFileName = argsFn[0];
      }
      if (argsFn.length > 1 && argsFn[1] && argsFn[1] !== '$') {
        this.headerTimestamp = argsFn[1];
      }
      if (rawArgs.length > 2 && rawArgs[2]) {
        this.headerAuthor = this.cleanStepList(rawArgs[2]);
      }
      if (rawArgs.length > 3 && rawArgs[3]) {
        this.headerOrganization = this.cleanStepList(rawArgs[3]);
      }
      if (argsFn.length > 4 && argsFn[4] && argsFn[4] !== '$') {
        this.filePreprocessor = argsFn[4];
      }
      if (argsFn.length > 5 && argsFn[5] && argsFn[5] !== '$') {
        this.fileOriginatingSystem = argsFn[5];
      }
      if (argsFn.length > 6 && argsFn[6] && argsFn[6] !== '$') {
        this.headerAuthorization = argsFn[6];
      }
    }
  }

  resolveExportingSoftware() {
    let appFullName = null;
    let appVersion = null;

    for (const ent of this.entities.values()) {
      if (ent.type === 'IFCAPPLICATION') {
        const args = this.parseArgs(ent.rawArgs).map(a => this.cleanStepArg(a));
        // IFCAPPLICATION(ApplicationDeveloper, Version, ApplicationFullName, ApplicationIdentifier)
        if (args.length >= 3 && args[2]) {
          appFullName = args[2];
        }
        if (args.length >= 2 && args[1]) {
          appVersion = args[1];
        }
        if (appFullName) break;
      }
    }

    if (appFullName && appFullName.toLowerCase() !== 'none' && appFullName.toLowerCase() !== 'unknown' && appFullName.toLowerCase() !== '$') {
      this.software = appFullName;
    } else if (this.fileOriginatingSystem && this.fileOriginatingSystem.toLowerCase() !== 'none' && this.fileOriginatingSystem.toLowerCase() !== 'unknown' && this.fileOriginatingSystem.toLowerCase() !== '$') {
      this.software = this.fileOriginatingSystem;
    } else if (this.filePreprocessor && this.filePreprocessor.toLowerCase() !== 'none' && this.filePreprocessor.toLowerCase() !== 'unknown' && this.filePreprocessor.toLowerCase() !== '$') {
      this.software = this.filePreprocessor;
    } else {
      this.software = null;
    }
  }

  resolveModelMetadata() {
    this.resolveExportingSoftware();

    // 1. Scan IFCPROJECT
    for (const ent of this.entities.values()) {
      if (ent.type === 'IFCPROJECT') {
        const args = this.parseArgs(ent.rawArgs).map(a => this.cleanStepArg(a));
        // IFCPROJECT(GlobalId, OwnerHistory, Name, Description, ObjectType, LongName, Phase, RepresentationContexts, UnitsInContext)
        if (args.length >= 3 && args[2] && args[2] !== '$') {
          this.projectName = args[2];
        }
        if (args.length >= 4 && args[3] && args[3] !== '$') {
          this.projectDescription = args[3];
        }
        if (args.length >= 7 && args[6] && args[6] !== '$') {
          this.projectPhase = args[6];
        } else if (args.length >= 6 && args[5] && args[5] !== '$') {
          this.projectPhase = args[5];
        }
        break;
      }
    }

    // 2. Scan IFCORGANIZATION & IFCPERSON if header fields were empty
    let extraOrg = [];
    let extraAuthor = [];
    for (const ent of this.entities.values()) {
      if (ent.type === 'IFCORGANIZATION') {
        const args = this.parseArgs(ent.rawArgs).map(a => this.cleanStepArg(a));
        // IFCORGANIZATION(Id, Name, Description, Roles, Addresses)
        const orgName = (args[1] && args[1] !== '$') ? args[1] : (args[0] && args[0] !== '$' ? args[0] : null);
        if (orgName && !orgName.toLowerCase().includes('revit') && !orgName.toLowerCase().includes('autodesk') && !extraOrg.includes(orgName)) {
          extraOrg.push(orgName);
        }
      } else if (ent.type === 'IFCPERSON') {
        const args = this.parseArgs(ent.rawArgs).map(a => this.cleanStepArg(a));
        // IFCPERSON(Id, FamilyName, GivenName, MiddleNames, PrefixTitles, SuffixTitles, Roles, Addresses)
        const family = (args[1] && args[1] !== '$') ? args[1] : '';
        const given = (args[2] && args[2] !== '$') ? args[2] : '';
        const pName = `${given} ${family}`.trim() || (args[0] && args[0] !== '$' ? args[0] : null);
        if (pName && !extraAuthor.includes(pName)) {
          extraAuthor.push(pName);
        }
      }
    }

    const finalAuthors = (this.headerAuthor && this.headerAuthor.length > 0) ? this.headerAuthor : extraAuthor;
    const finalOrgs = (this.headerOrganization && this.headerOrganization.length > 0) ? this.headerOrganization : extraOrg;

    this.authorName = finalAuthors.join(', ') || null;
    this.orgName = finalOrgs.join(', ') || null;

    this.fileMetadata = {
      headerFileName: this.headerFileName,
      schema: this.formattedSchema,
      rawSchema: this.schema,
      mvd: this.mvd,
      software: this.software,
      preprocessor: this.filePreprocessor,
      originatingSystem: this.fileOriginatingSystem,
      exportTimestamp: this.headerTimestamp,
      author: this.authorName,
      organization: this.orgName,
      authorization: this.headerAuthorization,
      projectName: this.projectName,
      projectDescription: this.projectDescription,
      projectPhase: this.projectPhase
    };
  }
  
  getEntity(id) {
    if (id == null) return null;
    if (typeof id === 'number') return this.entities.get(id);
    if (typeof id === 'string') {
      const clean = id.replace(/#/g, '').trim();
      const num = parseInt(clean, 10);
      if (!isNaN(num)) return this.entities.get(num);
    }
    return null;
  }
  
  buildHierarchy() {
    this.spatialTree = {
      projects: [],
      sites: [],
      buildings: [],
      storeys: [],
      elementMap: new Map() // elementId -> containerName
    };
    
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCPROJECT') {
        this.spatialTree.projects.push(ent);
      } else if (ent.type === 'IFCSITE') {
        this.spatialTree.sites.push(ent);
      } else if (ent.type === 'IFCBUILDING' || ent.type === 'IFCFACILITY' || ent.type === 'IFCRAILWAY' || ent.type === 'IFCROAD') {
        this.spatialTree.buildings.push(ent);
      } else if (ent.type === 'IFCBUILDINGSTOREY') {
        this.spatialTree.storeys.push(ent);
      } else if (ent.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
        const args = this.parseArgs(ent.rawArgs);
        // args[4] = list of elements, args[5] = container
        const elemListStr = args[4] || '';
        const containerRef = args[5] || '';
        const containerEnt = this.getEntity(containerRef);
        const containerName = containerEnt ? this.extractName(containerEnt) : 'Level 1';
        
        const elemIds = [...elemListStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const eId of elemIds) {
          this.spatialTree.elementMap.set(eId, containerName);
        }
      }
    }
  }

  buildVoidsMap() {
    this.voidsMap.clear();
    for (const [id, ent] of this.entities.entries()) {
      if (ent.type === 'IFCRELVOIDSELEMENT') {
        const args = this.parseArgs(ent.rawArgs);
        // IFCRELVOIDSELEMENT(GlobalId, OwnerHistory, Name, Description, RelatingBuildingElement, RelatedOpeningElement)
        if (args.length >= 6) {
          const hostId = parseInt((args[4] || '').replace(/#/g, '').trim(), 10);
          const opId = parseInt((args[5] || '').replace(/#/g, '').trim(), 10);
          if (!isNaN(hostId) && !isNaN(opId)) {
            if (!this.voidsMap.has(hostId)) {
              this.voidsMap.set(hostId, []);
            }
            this.voidsMap.get(hostId).push(opId);
          }
        }
      }
    }
  }

  parsePropertyValue(rawVal) {
    if (!rawVal || rawVal === '$') return '';
    rawVal = rawVal.trim();
    if (rawVal === '.T.') return true;
    if (rawVal === '.F.') return false;
    if (rawVal === '.U.') return null;
    if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
      return rawVal.slice(1, -1);
    }
    const m = rawVal.match(/^[A-Z0-9_]+\s*\(\s*(['"].*?['"]|[0-9.\-eE]+|\.[TFU]\.)\s*\)$/i);
    if (m) {
      let inner = m[1].trim();
      if (inner.startsWith("'") && inner.endsWith("'")) return inner.slice(1, -1);
      if (inner.startsWith('"') && inner.endsWith('"')) return inner.slice(1, -1);
      if (inner === '.T.') return true;
      if (inner === '.F.') return false;
      if (inner === '.U.') return null;
      const num = parseFloat(inner);
      return !isNaN(num) ? num : inner;
    }
    const num = parseFloat(rawVal);
    if (!isNaN(num) && String(num) === rawVal) return num;
    return rawVal;
  }

  buildPropertiesMap() {
    this.propertiesMap.clear();
    this.quantitiesMap.clear();

    for (const [id, ent] of this.entities) {
      if (ent.type === 'IFCRELDEFINESBYPROPERTIES') {
        const args = this.parseArgs(ent.rawArgs);
        if (args.length >= 6) {
          const relObjs = [...(args[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
          const psetRef = args[5] ? parseInt(args[5].replace(/#/g, ''), 10) : null;
          if (!psetRef) continue;

          const psetEnt = this.getEntity(psetRef);
          if (!psetEnt) continue;

          if (psetEnt.type === 'IFCPROPERTYSET') {
            const psetArgs = this.parseArgs(psetEnt.rawArgs);
            const psetName = psetArgs[2] ? psetArgs[2].replace(/'/g, '').trim() : `Pset #${psetRef}`;
            const propRefs = [...(psetArgs[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
            const props = [];

            for (const pr of propRefs) {
              const propEnt = this.getEntity(pr);
              if (!propEnt) continue;
              const propArgs = this.parseArgs(propEnt.rawArgs);
              const pName = propArgs[0] ? propArgs[0].replace(/'/g, '').trim() : `Property #${pr}`;

              if (propEnt.type === 'IFCPROPERTYSINGLEVALUE') {
                const val = this.parsePropertyValue(propArgs[2]);
                props.push({ name: pName, value: val, type: 'SingleValue', raw: propArgs[2] });
              } else if (propEnt.type === 'IFCPROPERTYENUMERATEDVALUE' || propEnt.type === 'IFCPROPERTYLISTVALUE') {
                const vals = [...(propArgs[2] || '').matchAll(/['"]([^'"]+)['"]|([0-9.\-]+)/g)].map(m => m[1] || m[2]);
                props.push({ name: pName, value: vals.join(', '), type: 'EnumeratedValue', raw: propArgs[2] });
              } else if (propEnt.type === 'IFCCOMPLEXPROPERTY') {
                props.push({ name: pName, value: propArgs[3] || '', type: 'ComplexProperty', raw: propArgs[3] });
              } else {
                props.push({ name: pName, value: this.parsePropertyValue(propArgs[2]), type: propEnt.type, raw: propArgs[2] });
              }
            }

            const psetObj = { psetId: psetRef, name: psetName, properties: props };
            for (const objId of relObjs) {
              let list = this.propertiesMap.get(objId);
              if (!list) { list = []; this.propertiesMap.set(objId, list); }
              list.push(psetObj);
            }
          } else if (psetEnt.type === 'IFCELEMENTQUANTITY') {
            const qArgs = this.parseArgs(psetEnt.rawArgs);
            const qsetName = qArgs[2] ? qArgs[2].replace(/'/g, '').trim() : `Qto #${psetRef}`;
            const qRefs = [...(qArgs[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
            const quants = [];

            for (const qr of qRefs) {
              const qEnt = this.getEntity(qr);
              if (!qEnt) continue;
              const qa = this.parseArgs(qEnt.rawArgs);
              const qName = qa[0] ? qa[0].replace(/'/g, '').trim() : `Quantity #${qr}`;
              const qVal = parseFloat(qa[3]) || qa[3];
              quants.push({ name: qName, value: qVal, type: qEnt.type });
            }

            const qsetObj = { qsetId: psetRef, name: qsetName, quantities: quants };
            for (const objId of relObjs) {
              let list = this.quantitiesMap.get(objId);
              if (!list) { list = []; this.quantitiesMap.set(objId, list); }
              list.push(qsetObj);
            }
          }
        }
      }
    }
  }

  buildTypesMap() {
    this.typesMap.clear();

    for (const [id, ent] of this.entities) {
      if (ent.type === 'IFCRELDEFINESBYTYPE') {
        const args = this.parseArgs(ent.rawArgs);
        if (args.length >= 6) {
          const relObjs = [...(args[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
          const typeRef = args[5] ? parseInt(args[5].replace(/#/g, ''), 10) : null;
          if (!typeRef) continue;

          const typeEnt = this.getEntity(typeRef);
          if (!typeEnt) continue;

          const tArgs = this.parseArgs(typeEnt.rawArgs);
          const typeGuid = tArgs[0] ? tArgs[0].replace(/'/g, '') : '';
          const typeName = tArgs[2] && tArgs[2] !== '$' ? tArgs[2].replace(/'/g, '') : `${typeEnt.type} #${typeRef}`;
          const typeTag = tArgs[7] && tArgs[7] !== '$' ? tArgs[7].replace(/'/g, '') : (tArgs[8] && tArgs[8] !== '$' ? tArgs[8].replace(/'/g, '') : '');

          const typePsets = this.propertiesMap.get(typeRef) || [];

          const typeObj = {
            id: typeRef,
            typeId: typeRef,
            type: typeEnt.type,
            typeClass: typeEnt.type,
            name: typeName,
            typeName: typeName,
            guid: typeGuid,
            typeGuid: typeGuid,
            typeTag: typeTag,
            psets: typePsets
          };

          for (const objId of relObjs) {
            this.typesMap.set(objId, typeObj);
          }
        }
      }
    }
  }

  buildMaterialsMap() {
    this.materialsMap.clear();

    for (const [id, ent] of this.entities) {
      if (ent.type === 'IFCRELASSOCIATESMATERIAL') {
        const args = this.parseArgs(ent.rawArgs);
        if (args.length >= 6) {
          const relObjs = [...(args[4] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
          const matRef = args[5] ? parseInt(args[5].replace(/#/g, ''), 10) : null;
          if (!matRef) continue;

          const matEnt = this.getEntity(matRef);
          if (!matEnt) continue;

          const materialNames = [];
          const layers = [];

          if (matEnt.type === 'IFCMATERIAL') {
            const mArgs = this.parseArgs(matEnt.rawArgs);
            const mName = mArgs[0] ? mArgs[0].replace(/'/g, '').trim() : `Material #${matRef}`;
            materialNames.push(mName);
          } else if (matEnt.type === 'IFCMATERIALLIST') {
            const mRefs = [...matEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
            for (const r of mRefs) {
              const subEnt = this.getEntity(r);
              if (subEnt && subEnt.type === 'IFCMATERIAL') {
                const subArgs = this.parseArgs(subEnt.rawArgs);
                materialNames.push(subArgs[0] ? subArgs[0].replace(/'/g, '').trim() : `Material #${r}`);
              }
            }
          } else if (matEnt.type === 'IFCMATERIALLAYERSETUSAGE') {
            const usageArgs = this.parseArgs(matEnt.rawArgs);
            const layerSetRef = usageArgs[0] ? parseInt(usageArgs[0].replace(/#/g, ''), 10) : null;
            if (layerSetRef) {
              const setEnt = this.getEntity(layerSetRef);
              if (setEnt && setEnt.type === 'IFCMATERIALLAYERSET') {
                const setArgs = this.parseArgs(setEnt.rawArgs);
                const layerRefs = [...(setArgs[0] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
                for (const lr of layerRefs) {
                  const lyEnt = this.getEntity(lr);
                  if (lyEnt) {
                    const lyArgs = this.parseArgs(lyEnt.rawArgs);
                    const subMatRef = lyArgs[0] ? parseInt(lyArgs[0].replace(/#/g, ''), 10) : null;
                    let subMatName = 'Unknown Material';
                    if (subMatRef) {
                      const smEnt = this.getEntity(subMatRef);
                      if (smEnt) {
                        const smArgs = this.parseArgs(smEnt.rawArgs);
                        subMatName = smArgs[0] ? smArgs[0].replace(/'/g, '').trim() : `Material #${subMatRef}`;
                      }
                    }
                    const rawThick = parseFloat(lyArgs[1]) || 0;
                    const thick = rawThick * (this.unitScale || 1.0);
                    const layerName = lyArgs[3] && lyArgs[3] !== '$' ? lyArgs[3].replace(/'/g, '').trim() : '';
                    const dispName = layerName || subMatName || 'Layer';
                    layers.push({
                      materialName: subMatName,
                      thickness: thick,
                      name: dispName,
                      layerName: dispName
                    });
                    if (!materialNames.includes(dispName)) {
                      materialNames.push(dispName);
                    }
                  }
                }
              }
            }
          }

          const primaryName = materialNames.join(', ') || (layers.length > 0 ? layers[0].name : 'Default Material');
          const matObj = {
            name: primaryName,
            type: layers.length > 0 ? 'layers' : (materialNames.length > 1 ? 'list' : 'single'),
            materialNames,
            layers
          };
          for (const objId of relObjs) {
            this.materialsMap.set(objId, matObj);
          }
        }
      }
    }
  }
  
  extractName(ent) {
    const args = this.parseArgs(ent.rawArgs);
    if (args[2] && args[2].startsWith("'") && args[2].endsWith("'")) {
      return args[2].slice(1, -1);
    }
    return `${ent.type}_${ent.id}`;
  }
  
  // Placement Matrix computation (Pure native IFC coordinates)
  getPlacementMatrix(placementRef) {
    const matrix = new THREE.Matrix4();
    if (!placementRef || placementRef === '$') return matrix;
    
    const ent = this.getEntity(placementRef);
    if (!ent) return matrix;
    
    if (ent.type === 'IFCLOCALPLACEMENT') {
      const args = this.parseArgs(ent.rawArgs);
      const relTo = args[0];
      const relPlacement = args[1];
      
      const localMat = this.getPlacement3DMatrix(relPlacement);
      if (relTo && relTo !== '$') {
        const parentMat = this.getPlacementMatrix(relTo);
        matrix.multiplyMatrices(parentMat, localMat);
      } else {
        matrix.copy(localMat);
      }
    } else {
      matrix.copy(this.getPlacement3DMatrix(placementRef));
    }
    return matrix;
  }

  // Relative placement matrix from child coordinate space to parent coordinate space
  getPlacementRelativeMatrix(childPlacementRef, parentPlacementRef) {
    const childMat = this.getPlacementMatrix(childPlacementRef);
    if (!parentPlacementRef || parentPlacementRef === '$') {
      return childMat;
    }
    const parentMat = this.getPlacementMatrix(parentPlacementRef);
    const invParent = new THREE.Matrix4().copy(parentMat).invert();
    return new THREE.Matrix4().multiplyMatrices(invParent, childMat);
  }
  
  getPlacement3DMatrix(ref) {
    const mat = new THREE.Matrix4();
    if (!ref || ref === '$') return mat;
    const ent = this.getEntity(ref);
    if (!ent) return mat;
    
    const args = this.parseArgs(ent.rawArgs);
    if (ent.type === 'IFCAXIS2PLACEMENT3D') {
      const origin = this.getPoint(args[0]) || new THREE.Vector3(0, 0, 0);
      const zAxis = this.getDirection(args[1], new THREE.Vector3(0, 0, 1));
      const refDir = this.getDirection(args[2], new THREE.Vector3(1, 0, 0));
      
      const Z = zAxis.clone().normalize();
      let X = refDir.clone().normalize();
      X.sub(Z.clone().multiplyScalar(X.dot(Z)));
      if (X.lengthSq() < 1e-10) {
        X = Math.abs(Z.z) < 0.9 ? new THREE.Vector3(-Z.y, Z.x, 0) : new THREE.Vector3(0, -Z.z, Z.y);
      }
      X.normalize();
      const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
      
      mat.makeBasis(X, Y, Z);
      mat.setPosition(origin);
      return mat;
    } else if (ent.type === 'IFCAXIS2PLACEMENT2D') {
      const origin = this.getPoint(args[0]) || new THREE.Vector3(0, 0, 0);
      const refDir = this.getDirection(args[1], new THREE.Vector3(1, 0, 0));
      const X = new THREE.Vector3(refDir.x, refDir.y, 0).normalize();
      const Z = new THREE.Vector3(0, 0, 1);
      const Y = new THREE.Vector3(-X.y, X.x, 0);
      
      mat.makeBasis(X, Y, Z);
      mat.setPosition(origin);
      return mat;
    } else if (ent.type === 'IFCCARTESIANTRANSFORMATIONOPERATOR3D') {
      const origin = this.getPoint(args[2]) || new THREE.Vector3(0, 0, 0);
      const scale = (args[3] && args[3] !== '$') ? parseFloat(args[3]) || 1.0 : 1.0;
      const X = this.getDirection(args[0], new THREE.Vector3(1, 0, 0)).multiplyScalar(scale);
      const Y = this.getDirection(args[1], new THREE.Vector3(0, 1, 0)).multiplyScalar(scale);
      const Z = this.getDirection(args[4], new THREE.Vector3(0, 0, 1)).multiplyScalar(scale);
      
      mat.makeBasis(X, Y, Z);
      mat.setPosition(origin);
      return mat;
    } else if (ent.type === 'IFCCARTESIANTRANSFORMATIONOPERATOR2D') {
      const origin = this.getPoint(args[2]) || new THREE.Vector3(0, 0, 0);
      const scale = (args[3] && args[3] !== '$') ? parseFloat(args[3]) || 1.0 : 1.0;
      const X = this.getDirection(args[0], new THREE.Vector3(1, 0, 0)).multiplyScalar(scale);
      const Y = this.getDirection(args[1], new THREE.Vector3(0, 1, 0)).multiplyScalar(scale);
      const Z = new THREE.Vector3(0, 0, scale);
      
      mat.makeBasis(X, Y, Z);
      mat.setPosition(origin);
      return mat;
    }
    return mat;
  }
  
  getAxis2Placement3DMatrix(ref) {
    return this.getPlacement3DMatrix(ref);
  }
  
  getPoint(ref) {
    const ent = this.getEntity(ref);
    if (!ent || ent.type !== 'IFCCARTESIANPOINT') return null;
    const nums = ent.rawArgs.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (!nums || nums.length < 2) return null;
    const x = parseFloat(nums[0]) * this.unitScale;
    const y = parseFloat(nums[1]) * this.unitScale;
    const z = (nums.length >= 3 ? parseFloat(nums[2]) : 0.0) * this.unitScale;
    // Native IFC Cartesian point (X, Y, Z)
    return new THREE.Vector3(x, y, z);
  }
  
  getDirection(ref, defaultVec = new THREE.Vector3(0, 0, 1)) {
    if (!ref || ref === '$') return defaultVec.clone();
    const ent = this.getEntity(ref);
    if (!ent || ent.type !== 'IFCDIRECTION') return defaultVec.clone();
    const nums = ent.rawArgs.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (!nums || nums.length < 2) return defaultVec.clone();
    const x = parseFloat(nums[0]);
    const y = parseFloat(nums[1]);
    const z = nums.length >= 3 ? parseFloat(nums[2]) : 0.0;
    const vec = new THREE.Vector3(x, y, z);
    if (vec.lengthSq() > 1e-12) {
      return vec.normalize();
    }
    return defaultVec.clone();
  }
  
  isDefaultOrGreyscaleStyle(style) {
    if (!style) return true;
    if (style.transparent && style.opacity < 0.99) return false;
    if (style.name) {
      const lower = style.name.toLowerCase();
      if (lower.includes('glass') || lower.includes('glaz') || lower.includes('mesh') ||
          lower.includes('steel') || lower.includes('metal') || lower.includes('zinc') ||
          lower.includes('aluminium') || lower.includes('aluminum') || lower.includes('concrete') ||
          lower.includes('timber') || lower.includes('wood') || lower.includes('brick')) {
        return false;
      }
      if (lower.includes('default') || lower.includes('white') || lower.includes('standard')) {
        return true;
      }
    }
    const c = style.color;
    if (c === undefined || c === null) return true;
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    const delta = Math.max(r, g, b) - Math.min(r, g, b);
    return delta <= 14;
  }

  resolveRevitCategoryMaterial(type, name = '', matName = '') {
    const raw = (type + ' ' + name + ' ' + matName).toLowerCase();
    const D = IFCParser.RevitCategoryDefaults;

    // 1. Windows, Curtain Wall Panels & Glazing (semi-transparent sky blue)
    const isFrameItem = raw.includes('frame') || raw.includes('sash') || raw.includes('mullion') ||
                        raw.includes('metal') || raw.includes('zinc') || raw.includes('aluminium') || raw.includes('aluminum');
    const isGlassItem = raw.includes('glass') || raw.includes('glaz') || raw.includes('glazing') ||
                        raw.includes('pane') || raw.includes('panel - glass') || raw.includes('clear');

    if (isGlassItem || (!isFrameItem && (type === 'IFCWINDOW' || raw.includes('window') ||
        raw.includes('skylight') || (type === 'IFCCURTAINWALL' && !raw.includes('mullion'))))) {
      return D.GLAZING;
    }
    if (type === 'IFCWINDOW' && isFrameItem) {
      return D.STEEL_FRAMING;
    }

    // 2. Doors & Wood
    if (type === 'IFCDOOR' || raw.includes('door') || raw.includes('timber') || raw.includes('wood')) {
      return D.DOOR;
    }

    // 3. Site & Landscape
    if (raw.includes('grass') || raw.includes('turf') || raw.includes('green') || raw.includes('vegetation') || raw.includes('landscape')) {
      return D.LANDSCAPE;
    }
    if (raw.includes('asphalt') || raw.includes('bitumen') || raw.includes('wearing') || raw.includes('pave') || raw.includes('lane') || raw.includes('road')) {
      return D.ROAD;
    }

    // 4. Structural Foundations, Pile Caps, Piles
    if (type === 'IFCFOOTING' || type === 'IFCPILE' || type === 'IFCDEEPFOUNDATION' ||
        raw.includes('footing') || raw.includes('pile') || raw.includes('foundation') || raw.includes('substructure') ||
        raw.includes('cap-1') || raw.includes('cap-2') || raw.includes('cap-4') || raw.includes('cap-6') || raw.includes('pile cap')) {
      return D.FOUNDATION;
    }

    // Concrete vs Steel discrimination
    const isConcrete = raw.includes('concrete') || raw.includes(' rc ') || raw.includes('rc_') || raw.includes('_rc') ||
                       raw.includes('rc beam') || raw.includes('rc column') || raw.includes('cast-in-place') || raw.includes('precast');

    let isSteel = raw.includes('steel') || raw.includes('metal') || raw.includes('iron') ||
                  raw.includes('shs') || raw.includes('chs') || raw.includes('rhs') ||
                  raw.includes('hollow section') || raw.includes('hollow tube') || raw.includes('tube-column') ||
                  raw.includes('l-angle') || raw.includes('t250x') || raw.includes('rail track') ||
                  raw.includes('tube-roof') || raw.includes('truss') || raw.includes('flange') ||
                  raw.includes('cross-member') || raw.includes('bracing') || raw.includes('universal beam') ||
                  raw.includes('universal column') || raw.includes('wide flange') ||
                  Boolean(raw.match(/\b(ub|uc|shs|chs|rhs)\b/));

    if (isConcrete && !raw.includes('steel') && !raw.includes('tube-roof') && !raw.includes('truss')) {
      isSteel = false;
    }

    // 5. Dedicated Structural Steel Types
    if ((isSteel || type === 'IFCMEMBER' || type === 'IFCPLATE' || type === 'IFCRAIL' || type === 'IFCTRACKELEMENT') && !isConcrete) {
      return D.STEEL_FRAMING;
    }

    // 6. Beams
    if (type === 'IFCBEAM' || raw.includes('beam') || raw.includes('girder')) {
      return (isSteel && !isConcrete) ? D.STEEL_FRAMING : D.CONCRETE_BEAM;
    }

    // 7. Columns
    if (type === 'IFCCOLUMN' || raw.includes('column') || raw.includes('pillar')) {
      return (isSteel && !isConcrete) ? D.STEEL_FRAMING : D.CONCRETE_COLUMN;
    }

    // 8. Floors / Slabs
    if (type === 'IFCSLAB' || raw.includes('floor') || raw.includes('slab') || raw.includes('deck')) {
      return D.FLOOR;
    }

    // 9. Walls
    if (type === 'IFCWALL' || type === 'IFCWALLSTANDARDCASE' || raw.includes('wall')) {
      return D.WALL;
    }

    // 10. Stairs
    if (type === 'IFCSTAIR' || type === 'IFCSTAIRFLIGHT' || raw.includes('stair')) {
      return D.STAIR;
    }

    // 11. Railings & Guardrails
    if (type === 'IFCRAILING' || raw.includes('railing') || raw.includes('guardrail') || raw.includes('handrail') || raw.includes('balustrade')) {
      if (raw.includes('stainless') || raw.includes('chrome') || raw.includes('nickel') || raw.includes('polished')) {
        return { category: 'Railing', color: 0xd4d4d8, opacity: 1.0, transparent: false, roughness: 0.22, metalness: 0.88 };
      }
      if (raw.includes('carbon') || raw.includes('iron') || raw.includes('dark steel')) {
        return { category: 'Railing', color: 0x475569, opacity: 1.0, transparent: false, roughness: 0.35, metalness: 0.80 };
      }
      if (raw.includes('aluminium') || raw.includes('aluminum') || raw.includes('alloy')) {
        return { category: 'Railing', color: 0xcbd5e1, opacity: 1.0, transparent: false, roughness: 0.38, metalness: 0.75 };
      }
      return D.RAILING;
    }

    // 12. Roofs
    if (type === 'IFCROOF' || raw.includes('roof') || raw.includes('canopy')) {
      return D.ROOF;
    }

    // 13. Ceilings / Coverings
    if (type === 'IFCCOVERING' || raw.includes('ceiling')) {
      return D.CEILING;
    }

    // 14. MEP
    if (raw.includes('duct') || raw.includes('hvac') || raw.includes('air')) {
      return D.MEP_DUCT;
    }
    if (raw.includes('pipe') || raw.includes('plumb') || raw.includes('drain') || raw.includes('sewer') || raw.includes('sprinkler')) {
      return D.MEP_PIPE;
    }
    if (raw.includes('cable') || raw.includes('tray') || raw.includes('conduit') || raw.includes('electr')) {
      return D.MEP_ELECTRICAL;
    }
    if (type.startsWith('IFCFLOW') || type.startsWith('IFCDISTRIBUTION')) {
      return D.MEP_PIPE;
    }

    return D.DEFAULT;
  }

  // Style resolver checking item, mappedItem, rep, shape, product, material, keyword, and Revit Category Defaults
  resolveStyle(prodId, shapeRef, itemId, repId, name, type, mappedItemId) {
    let resolved = null;

    // 1. Direct Item Style from IFCSTYLEDITEM or IFCPRESENTATIONLAYERWITHSTYLE
    if (itemId && this.styleMap.has(itemId)) {
      resolved = this.styleMap.get(itemId);
    }
    // 1b. Mapped Item Style
    else if (mappedItemId && this.styleMap.has(mappedItemId)) {
      resolved = this.styleMap.get(mappedItemId);
    }
    // 2. Shape Representation style
    else if (repId && this.styleMap.has(repId)) {
      resolved = this.styleMap.get(repId);
    }
    // 3. Product Definition Shape style
    else if (shapeRef) {
      const shapeId = typeof shapeRef === 'string' ? parseInt(shapeRef.replace(/#/g, ''), 10) : shapeRef;
      if (shapeId && this.styleMap.has(shapeId)) {
        resolved = this.styleMap.get(shapeId);
      }
    }

    // 4. Material style from IFCRELASSOCIATESMATERIAL
    if (!resolved && prodId && this.materialStyleMap && this.materialStyleMap.has(prodId)) {
      resolved = this.materialStyleMap.get(prodId);
    }

    // 5. Direct Product style
    if (!resolved && prodId && this.styleMap.has(prodId)) {
      resolved = this.styleMap.get(prodId);
    }

    // If file defines an explicit NON-GREYSCALE / non-default style, respect and preserve it!
    if (resolved && !this.isDefaultOrGreyscaleStyle(resolved)) {
      if (resolved.name) {
        const lower = resolved.name.toLowerCase();
        if (lower.includes('glass') || lower.includes('glaz') || lower.includes('clear') || lower.includes('pane')) {
          const isNearWhite = resolved.color === 0xffffff || resolved.color === 0xf0f7f3 || ((resolved.color >> 16) > 230 && ((resolved.color >> 8) & 0xff) > 230 && (resolved.color & 0xff) > 230);
          return {
            ...resolved,
            color: (isNearWhite || !resolved.color) ? 0x7dd3fc : resolved.color,
            transparent: true,
            opacity: resolved.opacity < 0.99 ? resolved.opacity : 0.35,
            roughness: 0.05,
            metalness: 0.1
          };
        }

        if (lower.includes('steel') || lower.includes('metal') || lower.includes('iron') ||
            lower.includes('aluminium') || lower.includes('aluminum') || lower.includes('chrome') ||
            lower.includes('nickel') || lower.includes('brass') || lower.includes('copper') ||
            lower.includes('mesh')) {
          let metalColor = resolved.color;
          let metalness = 0.82;
          let roughness = 0.28;

          // 1. Stainless Steel / Chrome / Polished Metal
          if (lower.includes('stainless') || lower.includes('chrome') || lower.includes('nickel') ||
              lower.includes('metal - steel') || lower.includes('polished')) {
            metalColor = 0xd4d4d8; // Bright silver steel
            metalness = 0.88;
            roughness = 0.22;
          }
          // 2. Carbon Steel / Dark Structural Steel / Cast Iron / Mesh
          else if (lower.includes('carbon') || lower.includes('iron') || lower.includes('dark steel') || lower.includes('mesh')) {
            metalColor = (resolved.color && resolved.color !== 0xffffff && resolved.color !== 0xf7f7f7) ? resolved.color : 0x475569;
            metalness = 0.82;
            roughness = 0.30;
          }
          // 3. Aluminium / Light Alloy
          else if (lower.includes('aluminium') || lower.includes('aluminum') || lower.includes('alloy')) {
            metalColor = 0xcbd5e1; // Light cool silver aluminium
            metalness = 0.75;
            roughness = 0.38;
          }
          // 4. Brass / Gold / Copper / Bronze
          else if (lower.includes('brass') || lower.includes('gold')) {
            metalColor = 0xd4af37;
            metalness = 0.85;
            roughness = 0.25;
          } else if (lower.includes('copper') || lower.includes('bronze')) {
            metalColor = 0xb87333;
            metalness = 0.85;
            roughness = 0.28;
          } else {
            // General Architectural Metal (e.g. railing posts, frames)
            metalColor = (resolved.color && resolved.color !== 0xffffff && resolved.color !== 0xf7f7f7) ? resolved.color : 0x94a3b8;
            metalness = 0.82;
            roughness = 0.28;
          }

          return {
            ...resolved,
            color: metalColor,
            metalness: metalness,
            roughness: roughness,
            transparent: false,
            opacity: 1.0
          };
        }
      }
      
      // If product is a railing and material is not genuine glass, ensure it is solid opaque
      if (type === 'IFCRAILING' || (name && name.toLowerCase().includes('railing'))) {
        const matNameLower = ((resolved.name || '')).toLowerCase();
        const isTrueGlass = matNameLower.includes('glass') || matNameLower.includes('glaz') || matNameLower.includes('pane');
        if (!isTrueGlass) {
          return {
            ...resolved,
            transparent: false,
            opacity: 1.0
          };
        }
      }
      
      return resolved;
    }

    // Otherwise, apply Revit Category Default Material (intelligent category + keyword mapping)
    const revitMat = this.resolveRevitCategoryMaterial(type, name, (resolved && resolved.name) || '');
    return revitMat;
  }

  collectOpeningGeometries(openingIds, hostPlacementRef) {
    if (!openingIds || openingIds.length === 0) return [];
    const openingGeoms = [];
    for (const opId of openingIds) {
      const opEnt = this.getEntity(opId);
      if (!opEnt) continue;
      const opArgs = this.parseArgs(opEnt.rawArgs);
      const opPlacementRef = opArgs[5];
      const opShapeRef = opArgs[6];
      if (!opShapeRef || opShapeRef === '$') continue;

      const opParts = this.collectProductParts(opShapeRef);
      if (!opParts || opParts.length === 0) continue;
      const opGeomList = opParts.map(p => p.geom).filter(Boolean);
      if (opGeomList.length === 0) continue;

      const opMerged = this.mergeGeometries(opGeomList);
      if (!opMerged) continue;

      const relMat = this.getPlacementRelativeMatrix(opPlacementRef, hostPlacementRef);
      const opTransformed = opMerged.clone();
      opTransformed.applyMatrix4(relMat);
      openingGeoms.push(opTransformed);
    }
    return openingGeoms;
  }

  applyOpeningsToGeometry(sourceGeom, openingGeoms) {
    if (!sourceGeom || !openingGeoms || openingGeoms.length === 0) return sourceGeom;
    let currentGeom = sourceGeom;
    for (const opGeom of openingGeoms) {
      if (!opGeom) continue;
      try {
        const wallCSG = IFCCSG.fromGeometry(currentGeom);
        const opCSG = IFCCSG.fromGeometry(opGeom);
        const subCSG = wallCSG.subtract(opCSG);
        const nextGeom = IFCCSG.toGeometry(subCSG);
        if (nextGeom && nextGeom.getAttribute('position') && nextGeom.getAttribute('position').count >= 3) {
          currentGeom = nextGeom;
        }
      } catch (err) {
        console.warn('Opening CSG subtraction skipped on error:', err);
      }
    }
    currentGeom.computeVertexNormals();
    return currentGeom;
  }

  // High-performance creased normals generator (smooth shading on curved surfaces while keeping sharp 90 deg corners crisp)
  computeCreasedNormals(geometry, creaseAngle = 55) {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const index = geometry.index;
    const vertexCount = index ? index.count : pos.count;
    if (vertexCount < 3) return geometry;

    const precision = 1e4;
    const cosCrease = Math.cos((creaseAngle * Math.PI) / 180);
    const getIdx = (t) => (index ? index.getX(t) : t);

    const triCount = Math.floor(vertexCount / 3);
    const faceNormals = new Float32Array(triCount * 3);

    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const fn = new THREE.Vector3();

    // 1. Compute face normal for every triangle
    for (let t = 0; t < triCount; t++) {
      const i0 = getIdx(t * 3);
      const i1 = getIdx(t * 3 + 1);
      const i2 = getIdx(t * 3 + 2);

      va.fromBufferAttribute(pos, i0);
      vb.fromBufferAttribute(pos, i1);
      vc.fromBufferAttribute(pos, i2);

      ab.subVectors(vb, va);
      ac.subVectors(vc, va);
      fn.crossVectors(ab, ac);
      const len = fn.length();
      if (len > 1e-9) fn.multiplyScalar(1 / len);
      else fn.set(0, 1, 0);

      faceNormals[t * 3] = fn.x;
      faceNormals[t * 3 + 1] = fn.y;
      faceNormals[t * 3 + 2] = fn.z;
    }

    // 2. Build spatial map of vertex position -> list of { t: triIdx, vi: vertIdx }
    const posMap = new Map();
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = getIdx(t * 3 + k);
        va.fromBufferAttribute(pos, vi);
        const hash = `${Math.round(va.x * precision)},${Math.round(va.y * precision)},${Math.round(va.z * precision)}`;
        let list = posMap.get(hash);
        if (!list) {
          list = [];
          posMap.set(hash, list);
        }
        list.push({ t, vi });
      }
    }

    // 3. For each vertex of each triangle, average face normals of neighboring triangles within creaseAngle
    const normalArray = new Float32Array(pos.count * 3);
    const smoothNorm = new THREE.Vector3();
    const otherNorm = new THREE.Vector3();

    for (const list of posMap.values()) {
      for (let i = 0; i < list.length; i++) {
        const itemA = list[i];
        fn.set(faceNormals[itemA.t * 3], faceNormals[itemA.t * 3 + 1], faceNormals[itemA.t * 3 + 2]);
        smoothNorm.copy(fn);

        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const itemB = list[j];
          otherNorm.set(faceNormals[itemB.t * 3], faceNormals[itemB.t * 3 + 1], faceNormals[itemB.t * 3 + 2]);
          if (fn.dot(otherNorm) >= cosCrease) {
            smoothNorm.add(otherNorm);
          }
        }
        const sLen = smoothNorm.length();
        if (sLen > 1e-9) smoothNorm.multiplyScalar(1 / sLen);
        else smoothNorm.copy(fn);

        const targetIdx = itemA.vi * 3;
        normalArray[targetIdx] = smoothNorm.x;
        normalArray[targetIdx + 1] = smoothNorm.y;
        normalArray[targetIdx + 2] = smoothNorm.z;
      }
    }

    geometry.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
    return geometry;
  }

  // Procedural expanded metal mesh alpha texture (seamless tileable diamond wire grid, zero external assets)
  getExpandedMeshAlphaTexture() {
    if (this._expandedMeshTexture) return this._expandedMeshTexture;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background: solid black (0 alpha / transparent hole for alphaTest)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Foreground: crisp white diamond wire grid (solid metal wire)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const W = 64.0;
    const H = 32.0;
    const slope = H / W; // 0.5

    for (let c = -size * 2; c <= size * 2; c += H) {
      ctx.beginPath();
      ctx.moveTo(-size, slope * (-size) + c);
      ctx.lineTo(size * 2, slope * (size * 2) + c);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-size, -slope * (-size) + c);
      ctx.lineTo(size * 2, -slope * (size * 2) + c);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    this._expandedMeshTexture = texture;
    return texture;
  }

  // Geometric aspect ratio analyzer: detects whether a component part is a genuine thin expanded mesh plate/panel
  // Accurately discriminates thin mesh sheets (5~8mm) from solid posts (50mm), intermediate balusters/subposts (19mm),
  // clamping bars/beads (19mm), base plates, and top handrails.
  isExpandedMeshPanel(geom) {
    if (!geom || !geom.attributes || !geom.attributes.position) return false;
    const pos = geom.attributes.position;
    if (!pos || pos.count < 3) return false;

    // Compute bounding box dimensions
    if (!geom.boundingBox) geom.computeBoundingBox();
    const box = geom.boundingBox;
    const dx = box ? (box.max.x - box.min.x) : 0;
    const dy = box ? (box.max.y - box.min.y) : 0;
    const dz = box ? (box.max.z - box.min.z) : 0;
    const dims = [dx, dy, dz].sort((a, b) => a - b);
    const dMin = dims[0];
    const dMid = dims[1];
    const dMax = dims[2];

    const isMm = Math.max(dx, dy, dz) > 20.0;
    const scale = isMm ? 0.001 : 1.0;
    const sMin = dMin * scale;
    const sMid = dMid * scale;
    const sMax = dMax * scale;
    const sDz = dz * scale;

    // 1. Fast Path: Flat axis-aligned or oriented plate
    // Plate thickness must be <= 10mm (0.010m).
    // All 19mm balusters/subposts and 19mm clamping bars have sMin = 0.019m > 0.010m!
    // Mesh panels must also be wide (>= 150mm), tall (>= 200mm), and high aspect ratio (>= 15.0)
    if (sMin <= 0.010 && sMid >= 0.15 && sMax >= 0.20 && (sMid / sMin) >= 15.0) {
      // Must be a vertical panel standing in elevation (height sDz >= 0.20m), not a horizontal floor base plate
      if (sDz >= 0.20) return true;
    }

    // 2. Differential Geometry Check (Gauss's Divergence Theorem):
    // Handles continuous L-shaped corner panels (where bounding box min dimension is large, e.g. dz = 0.925m)
    // as well as sloped/curved mesh panels.
    const posArr = pos.array;
    const index = geom.index ? geom.index.array : null;
    const triCount = index ? (index.length / 3) : (pos.count / 3);

    let totalArea = 0;
    let totalSignedVol = 0;
    let areaZ = 0;

    for (let i = 0; i < triCount; i++) {
      let i0 = index ? index[i * 3] : i * 3;
      let i1 = index ? index[i * 3 + 1] : i * 3 + 1;
      let i2 = index ? index[i * 3 + 2] : i * 3 + 2;

      const x0 = posArr[i0 * 3], y0 = posArr[i0 * 3 + 1], z0 = posArr[i0 * 3 + 2];
      const x1 = posArr[i1 * 3], y1 = posArr[i1 * 3 + 1], z1 = posArr[i1 * 3 + 2];
      const x2 = posArr[i2 * 3], y2 = posArr[i2 * 3 + 1], z2 = posArr[i2 * 3 + 2];

      const v1x = x1 - x0, v1y = y1 - y0, v1z = z1 - z0;
      const v2x = x2 - x0, v2y = y2 - y0, v2z = z2 - z0;

      const cx = v1y * v2z - v1z * v2y;
      const cy = v1z * v2x - v1x * v2z;
      const cz = v1x * v2y - v1y * v2x;

      const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      totalArea += area;
      totalSignedVol += (x0 * cx + y0 * cy + z0 * cz) / 6.0;

      const len = 2.0 * area;
      if (len > 1e-9 && Math.abs(cz / len) > 0.8) {
        areaZ += area;
      }
    }

    if (totalArea <= 1e-5) return false;

    const totalVol = Math.abs(totalSignedVol);
    const tEff = ((2.0 * totalVol) / totalArea) * scale;
    const sArea = totalArea * scale * scale;

    // Expanded mesh panel differential characteristics:
    // - tEff <= 9mm (19mm square rods have tEff = 9.5mm, 5~8mm plates have tEff = 5~8mm)
    // - Substantial panel area >= 0.30 m^2
    // - Vertical elevation height sDz >= 0.30m (excludes horizontal clamping bars where sDz = 0.019m)
    // - Facade facing: top/bottom area < 10% of total area (excludes base plates & horizontal bars)
    const isFacade = (areaZ / totalArea) < 0.10;
    if (tEff <= 0.009 && sArea >= 0.30 && sDz >= 0.30 && isFacade) {
      return true;
    }

    return false;
  }

  // Triplanar planar UV projector for thin panels (supports flat, L-corner, and sloped panels)
  computeGeometryPlanarUVs(geom) {
    if (!geom || !geom.attributes || !geom.attributes.position) return new Float32Array(0);
    const pos = geom.attributes.position;
    const count = pos.count;
    const uvs = new Float32Array(count * 2);

    if (!geom.boundingBox) geom.computeBoundingBox();
    const box = geom.boundingBox;
    const dx = box ? (box.max.x - box.min.x) : 0;
    const dy = box ? (box.max.y - box.min.y) : 0;
    const dz = box ? (box.max.z - box.min.z) : 0;
    const maxSpan = Math.max(dx, dy, dz);

    // Tile period: 0.08m (80mm contains 2 diamonds wide by 4 diamonds high)
    const isMm = maxSpan > 20.0;
    const tileW = isMm ? 80.0 : 0.08;
    const tileH = isMm ? 80.0 : 0.08;

    const posArr = pos.array;
    const index = geom.index ? geom.index.array : null;
    const triCount = index ? (index.length / 3) : (count / 3);

    for (let t = 0; t < triCount; t++) {
      let i0, i1, i2;
      if (index) {
        i0 = index[t * 3];
        i1 = index[t * 3 + 1];
        i2 = index[t * 3 + 2];
      } else {
        i0 = t * 3;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }

      const x0 = posArr[i0 * 3], y0 = posArr[i0 * 3 + 1], z0 = posArr[i0 * 3 + 2];
      const x1 = posArr[i1 * 3], y1 = posArr[i1 * 3 + 1], z1 = posArr[i1 * 3 + 2];
      const x2 = posArr[i2 * 3], y2 = posArr[i2 * 3 + 1], z2 = posArr[i2 * 3 + 2];

      const v1x = x1 - x0, v1y = y1 - y0, v1z = z1 - z0;
      const v2x = x2 - x0, v2y = y2 - y0, v2z = z2 - z0;

      const nx = Math.abs(v1y * v2z - v1z * v2y);
      const ny = Math.abs(v1z * v2x - v1x * v2z);
      const nz = Math.abs(v1x * v2y - v1y * v2x);

      // Triplanar projection based on dominant face normal
      const vIndices = [i0, i1, i2];
      for (let j = 0; j < 3; j++) {
        const vi = vIndices[j];
        const vx = posArr[vi * 3];
        const vy = posArr[vi * 3 + 1];
        const vz = posArr[vi * 3 + 2];

        let u, v;
        if (nx >= ny && nx >= nz) {
          // Facing X: panel runs along Y-Z plane
          u = vy / tileW;
          v = vz / tileH;
        } else if (ny >= nx && ny >= nz) {
          // Facing Y: panel runs along X-Z plane
          u = vx / tileW;
          v = vz / tileH;
        } else {
          // Facing Z: horizontal top/bottom edges
          u = vx / tileW;
          v = vy / tileH;
        }
        uvs[vi * 2] = u;
        uvs[vi * 2 + 1] = v;
      }
    }
    return uvs;
  }

  generatePlanarUVs(geom) {
    if (!geom) return;
    if (geom.index) {
      const nonIndexed = geom.toNonIndexed();
      geom.setAttribute('position', nonIndexed.getAttribute('position'));
      if (nonIndexed.getAttribute('normal')) geom.setAttribute('normal', nonIndexed.getAttribute('normal'));
      geom.setIndex(null);
    }
    const uvs = this.computeGeometryPlanarUVs(geom);
    if (uvs && uvs.length > 0) {
      geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
  }

  // Mesh builder for IFC Product supporting multi-material components (e.g. railing posts vs mesh/glass panels, window frames vs glazing)
  buildProductMesh(prod) {
    const args = this.parseArgs(prod.rawArgs);
    const guid = args[0] ? args[0].replace(/'/g, '') : `ID_${prod.id}`;
    const name = args[2] && args[2] !== '$' ? args[2].replace(/'/g, '') : `${prod.type} #${prod.id}`;
    const placementRef = args[5];
    const shapeRef = args[6];
    
    if (!shapeRef || shapeRef === '$') return null;
    
    const parts = this.collectProductParts(shapeRef);
    if (!parts || parts.length === 0) return null;

    // Resolve styles for all parts
    const styledParts = [];
    const isRailingProd = prod.type === 'IFCRAILING' || (name && name.toLowerCase().includes('railing'));

    for (const part of parts) {
      if (!part.geom || !part.geom.getAttribute('position') || part.geom.getAttribute('position').count === 0) {
        continue;
      }
      let style = this.resolveStyle(
        prod.id,
        shapeRef,
        part.itemId,
        part.repId,
        name,
        prod.type,
        part.mappedItemId
      );

      // Intelligent Railing Part Discrimination: Mesh Panel vs Solid Posts/Handrails/Frames
      const styleNameLower = (style && style.name ? style.name.toLowerCase() : '');
      const isMeshTagged = styleNameLower.includes('mesh') || styleNameLower.includes('grating') || styleNameLower.includes('expanded');

      if (isMeshTagged || (isRailingProd && styleNameLower.includes('expanded'))) {
        if (this.isExpandedMeshPanel(part.geom)) {
          style = {
            ...style,
            name: 'Expanded Metal Mesh',
            isMeshCutout: true,
            color: 0x334155, // dark metallic diamond mesh
            metalness: 0.85,
            roughness: 0.28,
            transparent: false,
            opacity: 1.0
          };
        } else {
          // Posts, handrails, brackets, frames remain solid metal
          style = {
            ...style,
            name: (style.name || 'Metal') + ' (Solid Framework)',
            isMeshCutout: false,
            color: (style.color && style.color !== 0xffffff && style.color !== 0xf7f7f7) ? style.color : 0x94a3b8,
            metalness: 0.82,
            roughness: 0.28,
            transparent: false,
            opacity: 1.0
          };
        }
      }

      styledParts.push({
        geom: part.geom,
        style: style
      });
    }

    if (styledParts.length === 0) return null;

    // Helper: format a style to a unique cache key
    const getStyleKey = (s) => {
      let c = s.color !== undefined ? s.color : 0x94a3b8;
      if (c === 0x000000) c = 0x18181b;
      const op = s.opacity !== undefined ? s.opacity.toFixed(2) : '1.00';
      const tr = s.transparent ? '1' : '0';
      const r = (s.roughness !== undefined ? s.roughness : 0.65).toFixed(2);
      const m = (s.metalness !== undefined ? s.metalness : 0.05).toFixed(2);
      const mc = s.isMeshCutout ? '1' : '0';
      return `${c}_${op}_${tr}_${r}_${m}_${mc}`;
    };

    // Helper: build THREE.MeshStandardMaterial from style
    const buildMaterial = (s) => {
      let c = s.color !== undefined ? s.color : 0x94a3b8;
      if (c === 0x000000) c = 0x18181b;
      const isTrans = Boolean(s.transparent);
      const op = s.opacity !== undefined ? s.opacity : 1.0;
      const isCutout = Boolean(s.isMeshCutout);
      const mat = new THREE.MeshStandardMaterial({
        color: c,
        roughness: s.roughness !== undefined ? s.roughness : 0.65,
        metalness: s.metalness !== undefined ? s.metalness : 0.05,
        transparent: isTrans,
        opacity: op,
        depthWrite: isTrans ? false : true,
        side: THREE.DoubleSide
      });
      if (isCutout) {
        mat.alphaMap = this.getExpandedMeshAlphaTexture();
        mat.alphaTest = 0.5;
        mat.transparent = false;
        mat.depthWrite = true;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
      }
      mat.userData = {
        originalTransparent: isTrans,
        originalOpacity: op,
        originalColor: c,
        isMeshCutout: isCutout
      };
      return mat;
    };

    // Group parts by style key
    const groupsMap = new Map();
    for (const sp of styledParts) {
      const key = getStyleKey(sp.style);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          style: sp.style,
          geoms: []
        });
      }
      groupsMap.get(key).geoms.push(sp.geom);
    }

    // Check for void openings (e.g. IFCRELVOIDSELEMENT / IFCOPENINGELEMENT for windows, doors)
    const voidOpeningIds = this.voidsMap.get(prod.id);
    const openingGeoms = (voidOpeningIds && voidOpeningIds.length > 0) ?
      this.collectOpeningGeometries(voidOpeningIds, placementRef) : [];

    let finalMesh = null;
    let primaryColor = 0x94a3b8;

    if (groupsMap.size === 1) {
      // Single material product
      const entry = groupsMap.values().next().value;
      let mergedGeom = this.mergeGeometries(entry.geoms);
      if (!mergedGeom || !mergedGeom.getAttribute('position') || mergedGeom.getAttribute('position').count === 0) {
        return null;
      }
      if (openingGeoms.length > 0) {
        mergedGeom = this.applyOpeningsToGeometry(mergedGeom, openingGeoms);
      }
      this.computeCreasedNormals(mergedGeom, 55);
      if (entry.style.isMeshCutout) {
        this.generatePlanarUVs(mergedGeom);
      }
      const material = buildMaterial(entry.style);
      primaryColor = material.color.getHex();
      finalMesh = new THREE.Mesh(mergedGeom, material);
    } else {
      // Multi-material product: sort groups so opaque parts come first, transparent parts last
      const groupList = Array.from(groupsMap.values()).sort((a, b) => {
        const aTrans = a.style.transparent ? 1 : 0;
        const bTrans = b.style.transparent ? 1 : 0;
        return aTrans - bTrans;
      });

      // Convert all geometries to non-indexed for seamless merging with geometry groups
      let totalVertices = 0;
      const preparedGroups = [];
      for (const grp of groupList) {
        let nonIndexed = grp.geoms.map(g => (g && g.index) ? g.toNonIndexed() : g).filter(Boolean);
        if (openingGeoms.length > 0) {
          nonIndexed = nonIndexed.map(g => this.applyOpeningsToGeometry(g, openingGeoms));
        }
        let grpVerts = 0;
        for (const g of nonIndexed) {
          const pos = g.getAttribute('position');
          if (pos) grpVerts += pos.count;
        }
        if (grpVerts > 0) {
          preparedGroups.push({
            style: grp.style,
            geoms: nonIndexed,
            vertexCount: grpVerts
          });
          totalVertices += grpVerts;
        }
      }

      if (totalVertices === 0) return null;

      const mergedPositions = new Float32Array(totalVertices * 3);
      const mergedUVs = new Float32Array(totalVertices * 2);
      const unifiedGeom = new THREE.BufferGeometry();
      const materialsArray = [];
      let currentOffset = 0; // in vertices
      let hasAnyMeshCutout = false;

      for (let i = 0; i < preparedGroups.length; i++) {
        const grp = preparedGroups[i];
        if (grp.style.isMeshCutout) hasAnyMeshCutout = true;
        const startVertex = currentOffset;
        for (const g of grp.geoms) {
          const pos = g.getAttribute('position');
          if (pos) {
            mergedPositions.set(pos.array, currentOffset * 3);
            if (grp.style.isMeshCutout) {
              const uvs = this.computeGeometryPlanarUVs(g);
              mergedUVs.set(uvs, currentOffset * 2);
            }
            currentOffset += pos.count;
          }
        }
        unifiedGeom.addGroup(startVertex, grp.vertexCount, i);
        materialsArray.push(buildMaterial(grp.style));
      }

      unifiedGeom.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
      if (hasAnyMeshCutout) {
        unifiedGeom.setAttribute('uv', new THREE.BufferAttribute(mergedUVs, 2));
      }
      this.computeCreasedNormals(unifiedGeom, 55);
      primaryColor = materialsArray[0].color.getHex();
      finalMesh = new THREE.Mesh(unifiedGeom, materialsArray);
    }

    finalMesh.name = name;
    finalMesh.castShadow = true;
    finalMesh.receiveShadow = true;
    
    // Apply placement: Native IFC placement hierarchy transformed by single global IFC Z-up -> Three.js Y-up mapping
    const placementMatrix = this.getPlacementMatrix(placementRef);
    
    // T: Three_X = IFC_X, Three_Y = IFC_Z, Three_Z = -IFC_Y
    const T_IFC_TO_THREE = new THREE.Matrix4().set(
      1,  0,  0,  0,
      0,  0,  1,  0,
      0, -1,  0,  0,
      0,  0,  0,  1
    );
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(T_IFC_TO_THREE, placementMatrix);
    finalMesh.applyMatrix4(worldMatrix);
    
    // Compute bounds & RL range in Three.js coordinates
    finalMesh.geometry.computeBoundingBox();
    const box = finalMesh.geometry.boundingBox.clone().applyMatrix4(worldMatrix);
    
    // Calculate geometric surface area & solid volume
    let geomArea = 0;
    let geomVolume = 0;
    const gPos = finalMesh.geometry.attributes.position;
    if (gPos && gPos.count >= 3) {
      const gArr = gPos.array;
      const gIdx = finalMesh.geometry.index ? finalMesh.geometry.index.array : null;
      const tCount = gIdx ? (gIdx.length / 3) : (gPos.count / 3);
      for (let t = 0; t < tCount; t++) {
        const i0 = gIdx ? gIdx[t * 3] : t * 3;
        const i1 = gIdx ? gIdx[t * 3 + 1] : t * 3 + 1;
        const i2 = gIdx ? gIdx[t * 3 + 2] : t * 3 + 2;
        const x0 = gArr[i0 * 3], y0 = gArr[i0 * 3 + 1], z0 = gArr[i0 * 3 + 2];
        const x1 = gArr[i1 * 3], y1 = gArr[i1 * 3 + 1], z1 = gArr[i1 * 3 + 2];
        const x2 = gArr[i2 * 3], y2 = gArr[i2 * 3 + 1], z2 = gArr[i2 * 3 + 2];
        const cx = (y1 - y0) * (z2 - z0) - (z1 - z0) * (y2 - y0);
        const cy = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
        const cz = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
        const a = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
        geomArea += a;
        geomVolume += (x0 * cx + y0 * cy + z0 * cz) / 6.0;
      }
      geomVolume = Math.abs(geomVolume);
    }
    
    // Store Comprehensive BIM Metadata
    const levelName = this.spatialTree.elementMap.get(prod.id) || "Ground Level";
    finalMesh.userData = {
      id: prod.id,
      guid: guid,
      name: name,
      type: prod.type,
      category: this.formatCategoryName(prod.type, name),
      rawCategory: this.formatCategoryName(prod.type, name),
      structure: this.guessStructureName(name, prod.type, levelName),
      level: levelName,
      rlMin: box.min.y.toFixed(3),
      rlMax: box.max.y.toFixed(3),
      height: (box.max.y - box.min.y).toFixed(3),
      width: (box.max.x - box.min.x).toFixed(2),
      length: (box.max.z - box.min.z).toFixed(2),
      rawType: prod.type,
      originalColor: primaryColor,
      // Comprehensive BIM Metadata for Inspector Tabs
      rawEntity: `#${prod.id}= ${prod.type}(${prod.rawArgs});`,
      psets: this.propertiesMap.get(prod.id) || [],
      qsets: this.quantitiesMap.get(prod.id) || [],
      typeInfo: this.typesMap.get(prod.id) || null,
      materials: this.materialsMap.get(prod.id) || null,
      spatial: {
        storey: levelName,
        elevation: (this.spatialTree && this.spatialTree.elevationMap) ? this.spatialTree.elevationMap.get(levelName) : null
      },
      geometryStats: {
        triangles: gPos ? (finalMesh.geometry.index ? finalMesh.geometry.index.count / 3 : gPos.count / 3) : 0,
        vertices: gPos ? gPos.count : 0,
        areaM2: geomArea.toFixed(3),
        volumeM3: geomVolume.toFixed(4),
        boxMin: { x: box.min.x.toFixed(3), y: box.min.y.toFixed(3), z: box.min.z.toFixed(3) },
        boxMax: { x: box.max.x.toFixed(3), y: box.max.y.toFixed(3), z: box.max.z.toFixed(3) },
        center: { x: ((box.min.x + box.max.x) / 2).toFixed(3), y: ((box.min.y + box.max.y) / 2).toFixed(3), z: ((box.min.z + box.max.z) / 2).toFixed(3) },
        lengthM: (box.max.x - box.min.x).toFixed(3),
        widthM: (box.max.z - box.min.z).toFixed(3),
        heightM: (box.max.y - box.min.y).toFixed(3)
      }
    };
    
    return finalMesh;
  }

  getColorByName(name, type) {
    const raw = (name + ' ' + type).toLowerCase();
    if (raw.includes('daylight') || raw.includes('slope') || raw.includes('grass') || raw.includes('turf') || raw.includes('green') || raw.includes('vegetation')) return 0x22c55e; // green grass
    if (raw.includes('guardrail') || raw.includes('barrier') || raw.includes('railing') || raw.includes('white') || raw.includes('marking') || raw.includes('line')) return 0xf8fafc; // white / light silver
    if (raw.includes('pave') || raw.includes('lane') || raw.includes('asphalt') || raw.includes('bitumen') || raw.includes('wearing') || raw.includes('road')) return 0x1e293b; // asphalt dark
    if (raw.includes('kerb') || raw.includes('curb')) return 0x94a3b8; // concrete kerb
    if (raw.includes('base') || raw.includes('subbase') || raw.includes('aggregate')) return 0x475569; // stone base
    if (raw.includes('drain') || raw.includes('culvert') || raw.includes('pipe') || raw.includes('manhole')) return 0x64748b;
    if (raw.includes('datum') || raw.includes('soil') || raw.includes('earth') || raw.includes('fill') || raw.includes('cut')) return 0x8d6e63;
    if (raw.includes('roof') || raw.includes('canopy') || raw.includes('truss') || raw.includes('shs') || raw.includes('cross-member')) return 0x475569; // dark charcoal steel for roof trusses
    if (raw.includes('steel') || raw.includes('metal') || raw.includes('iron')) return 0x475569; // dark structural steel
    if (raw.includes('beam') || raw.includes('girder') || raw.includes('column') || raw.includes('pillar') || raw.includes('slab') || raw.includes('floor') || raw.includes('deck') || raw.includes('footing') || raw.includes('pile') || raw.includes('concrete')) return 0xd1d5db; // clean structural light grey
    if (raw.includes('glass') || raw.includes('glaz')) return 0x81d4fa;
    return null;
  }
  
  collectProductParts(shapeDefRef) {
    const shapeEnt = this.getEntity(shapeDefRef);
    if (!shapeEnt) return [];
    
    const shapeArgs = this.parseArgs(shapeEnt.rawArgs);
    // shapeArgs[2] is list of representations
    const repRefs = [...(shapeArgs[2] || '').matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
    if (repRefs.length === 0) return [];

    // Prioritize 3D representations over 2D curves/annotations
    const candidates = [];
    for (const repId of repRefs) {
      const repEnt = this.getEntity(repId);
      if (!repEnt || repEnt.type !== 'IFCSHAPEREPRESENTATION') continue;
      const repArgs = this.parseArgs(repEnt.rawArgs);
      const iden = (repArgs[1] || '').replace(/['"]/g, '').toLowerCase();
      const type = (repArgs[2] || '').replace(/['"]/g, '').toLowerCase();
      
      // Skip pure 2D or plan annotation representations when 3D body exists
      if (iden === 'axis' || iden === 'footprint' || iden === 'annotation' || type === 'curve2d') {
        continue;
      }
      let score = 1;
      if (iden === 'body') score += 10;
      if (type === 'sweptsolid' || type === 'mappedrepresentation' || type === 'brep' || type === 'surfacemodel' || type === 'tessellation') score += 5;
      candidates.push({ repId, repEnt, repArgs, score });
    }
    candidates.sort((a, b) => b.score - a.score);

    const tryList = candidates.length > 0 ? candidates : repRefs.map(repId => {
      const repEnt = this.getEntity(repId);
      return repEnt ? { repId, repEnt, repArgs: this.parseArgs(repEnt.rawArgs), score: 0 } : null;
    }).filter(Boolean);

    for (const { repId, repArgs } of tryList) {
      const itemsStr = repArgs[3] || '';
      const itemIds = [...itemsStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
      const parts = [];
      for (const itemId of itemIds) {
        const itemEnt = this.getEntity(itemId);
        if (!itemEnt) continue;
        
        if (itemEnt.type === 'IFCMAPPEDITEM') {
          const mappedParts = this.buildMappedItemParts(itemEnt);
          if (mappedParts && mappedParts.length > 0) {
            parts.push(...mappedParts);
          }
        } else {
          const geom = this.buildShapeItem(itemEnt);
          if (geom && geom.getAttribute('position') && geom.getAttribute('position').count > 0) {
            parts.push({
              geom: geom,
              itemId: itemId,
              repId: repId
            });
          }
        }
      }
      if (parts.length > 0) {
        return parts;
      }
    }
    return [];
  }

  buildShapeRepresentation(shapeDefRef) {
    const parts = this.collectProductParts(shapeDefRef);
    if (!parts || parts.length === 0) return null;
    const merged = this.mergeGeometries(parts.map(p => p.geom));
    if (merged) {
      merged.userData = merged.userData || {};
      merged.userData.itemId = parts[0].itemId;
      merged.userData.repId = parts[0].repId;
      merged.userData.mappedItem = parts[0].mappedItemId;
    }
    return merged;
  }

  mergeGeometries(geoms) {
    if (!geoms || geoms.length === 0) return null;
    // Always convert indexed geometries to non-indexed so face connectivity remains uncorrupted
    const nonIndexed = geoms.map(g => (g && g.index) ? g.toNonIndexed() : g).filter(Boolean);
    if (nonIndexed.length === 0) return null;
    if (nonIndexed.length === 1) return nonIndexed[0];
    let totalVerts = 0;
    for (const g of nonIndexed) {
      const pos = g.getAttribute('position');
      if (pos) totalVerts += pos.array.length;
    }
    if (totalVerts === 0) return null;
    const mergedArray = new Float32Array(totalVerts);
    let offset = 0;
    for (const g of nonIndexed) {
      const pos = g.getAttribute('position');
      if (pos) {
        mergedArray.set(pos.array, offset);
        offset += pos.array.length;
      }
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedArray, 3));
    merged.computeVertexNormals();
    return merged;
  }

  buildShapeItem(itemEnt) {
    if (!itemEnt) return null;
    const type = itemEnt.type;
    
    // 1. Tessellated Face Set (IFC4 / IFC4.3 standard)
    if (type === 'IFCTRIANGULATEDFACESET') {
      return this.buildTriangulatedFaceSet(itemEnt);
    }
    // 2. Polygonal Face Set (IFC4 / IFC4.3)
    if (type === 'IFCPOLYGONALFACESET') {
      return this.buildPolygonalFaceSet(itemEnt);
    }
    // 3. Faceted B-Rep / Shell Surface Model / Face Based Surface Model
    if (type === 'IFCFACETEDBREP' || type === 'IFCSHELLBASEDSURFACEMODEL' || type === 'IFCFACEBASEDSURFACEMODEL' ||
        type === 'IFCCONNECTEDFACESET' || type === 'IFCCLOSEDSHELL' || type === 'IFCOPENSHELL') {
      return this.buildFacetedBrep(itemEnt);
    }
    // 4. Extruded Area Solid
    if (type === 'IFCEXTRUDEDAREASOLID') {
      return this.buildExtrudedAreaSolid(itemEnt);
    }
    // 5. Boolean Result / Boolean Clipping Result (cutouts for doors, windows, openings)
    if (type === 'IFCBOOLEANCLIPPINGRESULT' || type === 'IFCBOOLEANRESULT') {
      const args = this.parseArgs(itemEnt.rawArgs);
      const firstOperandRef = args[1];
      const firstEnt = this.getEntity(firstOperandRef);
      if (firstEnt) return this.buildShapeItem(firstEnt);
    }
    // 6. Mapped Item (instances pointing to RepresentationMap)
    if (type === 'IFCMAPPEDITEM') {
      return this.buildMappedItem(itemEnt);
    }
    
    return null;
  }
  
  // IFC4 / IFC4.3 TriangulatedFaceSet (Native IFC coordinates)
  buildTriangulatedFaceSet(ent) {
    const args = this.parseArgs(ent.rawArgs);
    const coordListEnt = this.getEntity(args[0]);
    if (!coordListEnt) return null;
    
    // Extract points
    const pts = [];
    const ptMatches = coordListEnt.rawArgs.matchAll(/\(\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\)/g);
    for (const m of ptMatches) {
      const x = parseFloat(m[1]) * this.unitScale;
      const y = parseFloat(m[2]) * this.unitScale;
      const z = parseFloat(m[3]) * this.unitScale;
      pts.push(new THREE.Vector3(x, y, z));
    }
    
    // Extract indices
    const indicesStr = args[3] || args[1] || '';
    const triMatches = indicesStr.matchAll(/\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g);
    const positions = [];
    
    for (const tri of triMatches) {
      const i1 = parseInt(tri[1], 10) - 1;
      const i2 = parseInt(tri[2], 10) - 1;
      const i3 = parseInt(tri[3], 10) - 1;
      if (pts[i1] && pts[i2] && pts[i3]) {
        positions.push(pts[i1].x, pts[i1].y, pts[i1].z);
        positions.push(pts[i2].x, pts[i2].y, pts[i2].z);
        positions.push(pts[i3].x, pts[i3].y, pts[i3].z);
      }
    }
    
    if (positions.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geom;
  }

  // Universal robust 3D polygon triangulation (handles non-convex/concave polygons, holes, and arbitrary 3D planes)
  triangulate3DPolygon(pts, holesList = []) {
    if (!pts || pts.length < 3) return [];
    if (pts.length === 3 && (!holesList || holesList.length === 0)) {
      return [pts[0], pts[1], pts[2]];
    }

    try {
      // 1. Compute Newell's unit normal from outer contour
      let nx = 0, ny = 0, nz = 0;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const c = pts[i];
        const nxt = pts[(i + 1) % n];
        nx += (c.y - nxt.y) * (c.z + nxt.z);
        ny += (c.z - nxt.z) * (c.x + nxt.x);
        nz += (c.x - nxt.x) * (c.y + nxt.y);
      }
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-10) {
        return [];
      }
      const normal = new THREE.Vector3(nx / len, ny / len, nz / len);

      // 2. Build right-handed orthonormal basis (u, v, normal)
      const ref = (Math.abs(normal.z) < 0.9) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const u = new THREE.Vector3().crossVectors(ref, normal).normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();

      // 3. Project outer contour and holes to 2D
      const pts2D = pts.map(p => new THREE.Vector2(p.dot(u), p.dot(v)));
      const holes2D = (holesList && holesList.length > 0) ? holesList.map(h => 
        h.map(p => new THREE.Vector2(p.dot(u), p.dot(v)))
      ).filter(h => h.length >= 3) : [];

      const allPts3D = [...pts];
      if (holesList && holesList.length > 0) {
        for (const h of holesList) {
          if (h && h.length >= 3) {
            allPts3D.push(...h);
          }
        }
      }

      // 4. Triangulate using Three.js ShapeUtils.triangulateShape (earcut)
      const triangles = THREE.ShapeUtils.triangulateShape(pts2D, holes2D);
      if (triangles && triangles.length > 0) {
        const result = [];
        for (const tri of triangles) {
          const p0 = allPts3D[tri[0]];
          const p1 = allPts3D[tri[1]];
          const p2 = allPts3D[tri[2]];
          if (p0 && p1 && p2) {
            result.push(p0, p1, p2);
          }
        }
        return result;
      }
    } catch (err) {
      console.warn("3D polygon triangulation fallback to fan:", err);
    }

    // Fallback: standard fan triangulation on outer contour
    const result = [];
    for (let i = 1; i < pts.length - 1; i++) {
      result.push(pts[0], pts[i], pts[i + 1]);
    }
    return result;
  }

  // IFC4 / IFC4.3 PolygonalFaceSet (Native IFC coordinates)
  buildPolygonalFaceSet(ent) {
    const args = this.parseArgs(ent.rawArgs);
    const coordListEnt = this.getEntity(args[0]);
    if (!coordListEnt) return null;
    
    const pts = [];
    const ptMatches = coordListEnt.rawArgs.matchAll(/\(\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\)/g);
    for (const m of ptMatches) {
      const x = parseFloat(m[1]) * this.unitScale;
      const y = parseFloat(m[2]) * this.unitScale;
      const z = parseFloat(m[3]) * this.unitScale;
      pts.push(new THREE.Vector3(x, y, z));
    }
    
    const facesRefStr = args[2] || '';
    const faceIds = [...facesRefStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
    const positions = [];
    
    for (const fId of faceIds) {
      const fEnt = this.getEntity(fId);
      if (!fEnt) continue;
      const indices = [...fEnt.rawArgs.matchAll(/(\d+)/g)].map(m => parseInt(m[1], 10) - 1);
      if (indices.length >= 3) {
        const polyPts = indices.map(idx => pts[idx]).filter(Boolean);
        if (polyPts.length >= 3) {
          const triVerts = this.triangulate3DPolygon(polyPts);
          for (const v of triVerts) {
            positions.push(v.x, v.y, v.z);
          }
        }
      }
    }
    
    if (positions.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geom;
  }

  // Mapped Item (IFCMAPPEDITEM) constituent parts with individual itemId and transformed geometry
  buildMappedItemParts(ent) {
    const args = this.parseArgs(ent.rawArgs);
    const mapSourceEnt = this.getEntity(args[0]);
    const mapTargetRef = args[1];
    if (!mapSourceEnt) return [];
    
    const mapArgs = this.parseArgs(mapSourceEnt.rawArgs);
    const mapOriginRef = mapArgs[0];
    const mappedRepRef = mapArgs[1];
    const repEnt = this.getEntity(mappedRepRef);
    if (!repEnt) return [];
    
    const repArgs = this.parseArgs(repEnt.rawArgs);
    const itemsStr = repArgs[3] || '';
    const itemIds = [...itemsStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
    
    // M = Target * Origin^-1
    const originMat = this.getPlacement3DMatrix(mapOriginRef);
    const targetMat = this.getPlacement3DMatrix(mapTargetRef);
    const invOrigin = new THREE.Matrix4().copy(originMat).invert();
    const mapTransform = new THREE.Matrix4().multiplyMatrices(targetMat, invOrigin);
    
    const mappedRepId = typeof mappedRepRef === 'string' ? parseInt(mappedRepRef.replace(/#/g, ''), 10) : mappedRepRef;
    const parts = [];
    
    for (const itemId of itemIds) {
      const itemEnt = this.getEntity(itemId);
      if (!itemEnt) continue;
      
      if (itemEnt.type === 'IFCMAPPEDITEM') {
        const subParts = this.buildMappedItemParts(itemEnt);
        for (const sp of subParts) {
          sp.geom.applyMatrix4(mapTransform);
          parts.push(sp);
        }
      } else {
        const geom = this.buildShapeItem(itemEnt);
        if (geom && geom.getAttribute('position') && geom.getAttribute('position').count > 0) {
          geom.applyMatrix4(mapTransform);
          parts.push({
            geom: geom,
            itemId: itemId,
            repId: mappedRepId,
            mappedItemId: ent.id
          });
        }
      }
    }
    return parts;
  }

  // Mapped Item (IFCMAPPEDITEM) with Origin & Target transform (backward-compatibility wrapper)
  buildMappedItem(ent) {
    const parts = this.buildMappedItemParts(ent);
    if (!parts || parts.length === 0) return null;
    const mergedGeom = this.mergeGeometries(parts.map(p => p.geom));
    if (mergedGeom) {
      mergedGeom.userData = mergedGeom.userData || {};
      mergedGeom.userData.itemId = parts[0].itemId;
      mergedGeom.userData.repId = parts[0].repId;
      mergedGeom.userData.mappedItem = ent.id;
    }
    return mergedGeom;
  }
  
  // Faceted B-Rep / Shell Models / Connected Face Sets (Native IFC coordinates)
  buildFacetedBrep(ent) {
    if (!ent) return null;
    let faceRefs = [];
    
    if (ent.type === 'IFCFACETEDBREP') {
      const args = this.parseArgs(ent.rawArgs);
      const shellEnt = this.getEntity(args[0]);
      if (shellEnt) {
        faceRefs = [...shellEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
      }
    } else if (ent.type === 'IFCSHELLBASEDSURFACEMODEL' || ent.type === 'IFCFACEBASEDSURFACEMODEL') {
      const setRefs = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
      for (const sId of setRefs) {
        const sEnt = this.getEntity(sId);
        if (sEnt) {
          const fRefs = [...sEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
          faceRefs.push(...fRefs);
        }
      }
    } else if (ent.type === 'IFCCONNECTEDFACESET' || ent.type === 'IFCCLOSEDSHELL' || ent.type === 'IFCOPENSHELL') {
      faceRefs = [...ent.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
    }
    
    if (faceRefs.length === 0) return null;
    
    const positions = [];
    for (const faceId of faceRefs) {
      const faceEnt = this.getEntity(faceId);
      if (!faceEnt) continue;
      
      const boundRefs = [...faceEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
      let outerPts = null;
      const holes = [];
      for (const bId of boundRefs) {
        const boundEnt = this.getEntity(bId);
        if (!boundEnt) continue;
        
        const loopMatch = boundEnt.rawArgs.match(/#(\d+)/);
        if (!loopMatch) continue;
        const loopEnt = this.getEntity(loopMatch[1]);
        if (!loopEnt) continue;
        
        const ptRefs = [...loopEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const polyPts = [];
        for (const pId of ptRefs) {
          const pt = this.getPoint(pId);
          if (pt) polyPts.push(pt);
        }
        if (polyPts.length < 3) continue;

        if (boundEnt.type === 'IFCFACEOUTERBOUND' || (!outerPts && boundRefs.length === 1)) {
          outerPts = polyPts;
        } else if (!outerPts) {
          outerPts = polyPts;
        } else {
          holes.push(polyPts);
        }
      }

      if (outerPts && outerPts.length >= 3) {
        const triVerts = this.triangulate3DPolygon(outerPts, holes);
        for (const v of triVerts) {
          positions.push(v.x, v.y, v.z);
        }
      }
    }
    
    if (positions.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.computeCreasedNormals(geom, 55);
    return geom;
  }
  
  buildCurve2DPath(curveEnt) {
    if (!curveEnt) return null;
    const path = new THREE.Path();
    
    if (curveEnt.type === 'IFCPOLYLINE') {
      const ptRefs = [...curveEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
      if (ptRefs.length < 2) return null;
      let first = true;
      for (const pId of ptRefs) {
        const ptEnt = this.getEntity(pId);
        if (!ptEnt) continue;
        const nums = ptEnt.rawArgs.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
        if (nums && nums.length >= 2) {
          const px = parseFloat(nums[0]) * this.unitScale;
          const py = parseFloat(nums[1]) * this.unitScale;
          if (first) {
            path.moveTo(px, py);
            first = false;
          } else {
            path.lineTo(px, py);
          }
        }
      }
      path.closePath();
      return path;
    } else if (curveEnt.type === 'IFCCOMPOSITECURVE') {
      const segRefs = [...curveEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
      let first = true;
      for (const sId of segRefs) {
        const segEnt = this.getEntity(sId);
        if (!segEnt) continue;
        const subRefs = [...segEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const scId of subRefs) {
          const subEnt = this.getEntity(scId);
          if (!subEnt) continue;
          if (subEnt.type === 'IFCPOLYLINE') {
            const ptRefs = [...subEnt.rawArgs.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
            for (const pId of ptRefs) {
              const pt = this.getPoint(pId);
              if (!pt) continue;
              if (first) {
                path.moveTo(pt.x, pt.y);
                first = false;
              } else {
                path.lineTo(pt.x, pt.y);
              }
            }
          } else if (subEnt.type === 'IFCTRIMMEDCURVE') {
            const tcArgs = this.parseArgs(subEnt.rawArgs);
            const basisEnt = this.getEntity(tcArgs[0]);
            if (basisEnt && basisEnt.type === 'IFCCIRCLE') {
              const cArgs = this.parseArgs(basisEnt.rawArgs);
              const centerMat = this.getPlacement3DMatrix(cArgs[0]);
              const r = (parseFloat(cArgs[1]) || 500) * this.unitScale;
              
              const parseAngle = (str) => {
                if (!str) return 0;
                const numM = str.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/);
                if (numM) {
                  let v = parseFloat(numM[0]);
                  return v * this.angleScale;
                }
                const ptRefM = str.match(/#(\d+)/);
                if (ptRefM) {
                  const pt = this.getPoint(parseInt(ptRefM[1], 10));
                  if (pt) {
                    const invMat = new THREE.Matrix4().copy(centerMat).invert();
                    const localPt = pt.clone().applyMatrix4(invMat);
                    return Math.atan2(localPt.y, localPt.x);
                  }
                }
                return 0;
              };
              
              const a1 = parseAngle(tcArgs[1] || '0');
              const a2 = parseAngle(tcArgs[2] || '0');
              const sense = !(tcArgs[3] || '').toUpperCase().includes('F');
              
              const steps = 16;
              let startA = a1;
              let endA = a2;
              if (sense && endA < startA) endA += Math.PI * 2;
              if (!sense && endA > startA) endA -= Math.PI * 2;
              
              const localVec = new THREE.Vector3();
              for (let step = 0; step <= steps; step++) {
                const t = step / steps;
                const ang = startA + (endA - startA) * t;
                localVec.set(r * Math.cos(ang), r * Math.sin(ang), 0).applyMatrix4(centerMat);
                const px = localVec.x;
                const py = localVec.y;
                if (first) {
                  path.moveTo(px, py);
                  first = false;
                } else {
                  path.lineTo(px, py);
                }
              }
            }
          } else if (subEnt.type === 'IFCCIRCLE') {
            const cArgs = this.parseArgs(subEnt.rawArgs);
            const centerMat = this.getPlacement3DMatrix(cArgs[0]);
            const cx = centerMat.elements[12];
            const cy = centerMat.elements[13];
            const r = (parseFloat(cArgs[1]) || 500) * this.unitScale;
            path.absarc(cx, cy, r, 0, Math.PI * 2, false);
            first = false;
          }
        }
      }
      path.closePath();
      return path;
    }
    return null;
  }

  buildCurve2DShape(curveEnt) {
    const path = this.buildCurve2DPath(curveEnt);
    if (!path) return null;
    const shape = new THREE.Shape();
    shape.curves = path.curves;
    return shape;
  }

  // Extruded Area Solid (Full support for profiles, 2D placement, extrusion direction, and 3D solid placement)
  buildExtrudedAreaSolid(ent) {
    const args = this.parseArgs(ent.rawArgs);
    const profileEnt = this.getEntity(args[0]);
    const posRef = args[1];
    const dirRef = args[2];
    const depth = (parseFloat(args[3]) || 1.0) * this.unitScale;
    
    if (!profileEnt) return null;
    
    let geom = null;
    const pType = profileEnt.type;
    const pArgs = this.parseArgs(profileEnt.rawArgs);
    
    if (pType === 'IFCRECTANGLEPROFILEDEF') {
      const pos2dRef = pArgs[2];
      const xDim = (parseFloat(pArgs[3]) || 1000) * this.unitScale;
      const yDim = (parseFloat(pArgs[4]) || 1000) * this.unitScale;
      // In native IFC coordinates, profile is in XY plane, extrusion along +Z from 0 to depth
      geom = new THREE.BoxGeometry(xDim, yDim, depth);
      geom.translate(0, 0, depth / 2);
      if (pos2dRef && pos2dRef !== '$') {
        const pos2dMat = this.getPlacement3DMatrix(pos2dRef);
        geom.applyMatrix4(pos2dMat);
      }
    } else if (pType === 'IFCCIRCLEPROFILEDEF') {
      const pos2dRef = pArgs[2];
      const radius = (parseFloat(pArgs[3]) || parseFloat(pArgs[2]) || 500) * this.unitScale;
      geom = new THREE.CylinderGeometry(radius, radius, depth, 16);
      // Three.js Cylinder is along Y. Rotate around X by PI/2 so its axis is along Z:
      geom.rotateX(Math.PI / 2);
      geom.translate(0, 0, depth / 2);
      if (pos2dRef && pos2dRef !== '$') {
        const pos2dMat = this.getPlacement3DMatrix(pos2dRef);
        geom.applyMatrix4(pos2dMat);
      }
    } else if (pType === 'IFCCIRCLEHOLLOWPROFILEDEF') {
      const pos2dRef = pArgs[2];
      const radius = (parseFloat(pArgs[3]) || 500) * this.unitScale;
      // High-precision smooth cylinder along Z (prevents earcut triangulation bugs on concentric rings)
      geom = new THREE.CylinderGeometry(radius, radius, depth, 16);
      geom.rotateX(Math.PI / 2);
      geom.translate(0, 0, depth / 2);
      if (pos2dRef && pos2dRef !== '$') {
        const pos2dMat = this.getPlacement3DMatrix(pos2dRef);
        geom.applyMatrix4(pos2dMat);
      }
    } else if (pType === 'IFCARBITRARYCLOSEDPROFILEDEF') {
      const curveEnt = this.getEntity(pArgs[2]);
      if (curveEnt) {
        const shape = this.buildCurve2DShape(curveEnt);
        if (shape) {
          geom = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: false
          });
        }
      }
      if (!geom) {
        geom = new THREE.BoxGeometry(1.0, 1.0, depth);
        geom.translate(0, 0, depth / 2);
      }
    } else if (pType === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
      const outerCurveEnt = this.getEntity(pArgs[2]);
      if (outerCurveEnt) {
        const shape = this.buildCurve2DShape(outerCurveEnt);
        if (shape) {
          const innerCurvesStr = pArgs[3] || '';
          const innerRefs = [...innerCurvesStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
          for (const inRef of innerRefs) {
            const inEnt = this.getEntity(inRef);
            if (inEnt) {
              const holePath = this.buildCurve2DPath(inEnt);
              if (holePath) shape.holes.push(holePath);
            }
          }
          geom = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: false
          });
        }
      }
      if (!geom) {
        geom = new THREE.BoxGeometry(1.0, 1.0, depth);
        geom.translate(0, 0, depth / 2);
      }
    } else {
      // Default solid prism
      geom = new THREE.BoxGeometry(1.0, 1.0, depth || 3.0);
      geom.translate(0, 0, (depth || 3.0) / 2);
    }
    
    if (!geom) return null;
    
    // Handle extrusion direction vector if not along +Z
    const dir = this.getDirection(dirRef, new THREE.Vector3(0, 0, 1));
    const zDefault = new THREE.Vector3(0, 0, 1);
    if (dir.distanceTo(zDefault) > 1e-4) {
      const d = dir.clone().normalize();
      // An extruded solid sweeps the 2D profile (in XY plane, z=0) along direction d by depth z:
      // x' = x + z * d.x, y' = y + z * d.y, z' = z * d.z.
      // Unlike rigid rotation (rotateX/setFromUnitVectors) which flips or tilts the profile plane,
      // this preserves the profile's XY coordinates at z=0 and correctly translates the extrusion cap.
      const extrudeMat = new THREE.Matrix4().set(
        1, 0, d.x, 0,
        0, 1, d.y, 0,
        0, 0, d.z, 0,
        0, 0, 0,   1
      );
      geom.applyMatrix4(extrudeMat);

      // When d.z < 0, the determinant is negative (reflection across XY plane),
      // which inverts triangle winding order. Reverse triangle index winding so faces point outwards.
      if (d.z < 0) {
        if (geom.index) {
          const idxArr = geom.index.array;
          for (let i = 0; i < idxArr.length; i += 3) {
            const tmp = idxArr[i + 1];
            idxArr[i + 1] = idxArr[i + 2];
            idxArr[i + 2] = tmp;
          }
          geom.index.needsUpdate = true;
        } else if (geom.attributes && geom.attributes.position) {
          const pos = geom.attributes.position;
          for (let i = 0; i < pos.count; i += 3) {
            const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
            const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
            pos.setXYZ(i + 1, x2, y2, z2);
            pos.setXYZ(i + 2, x1, y1, z1);
          }
          pos.needsUpdate = true;
        }
      }
      geom.computeVertexNormals();
    }
    
    // Apply 3D local placement of the solid (Position)
    if (posRef && posRef !== '$') {
      const posMat = this.getPlacement3DMatrix(posRef);
      geom.applyMatrix4(posMat);
    }
    
    return geom;
  }
  
  formatCategoryName(type, name = '') {
    const raw = (name + ' ' + type).toLowerCase();
    if (raw.includes('kerb') || raw.includes('curb')) return 'Kerb & Barrier';
    if (raw.includes('pave') || raw.includes('lane') || raw.includes('road')) return 'Road & Pavement';
    if (raw.includes('base') || raw.includes('subbase')) return 'Road Base Course';
    if (raw.includes('drain') || raw.includes('culvert')) return 'Drainage & Utilities';
    if (raw.includes('island') || raw.includes('footpath') || raw.includes('walk')) return 'Footpath & Island';
    if (raw.includes('door')) return 'Door';
    if (raw.includes('window') || raw.includes('glass') || raw.includes('glaz')) return 'Window / Glazing';
    if (raw.includes('footing') || raw.includes('pile') || raw.includes('foundation') || raw.includes('cap-') || raw.includes('pile cap')) return 'Foundation';
    if (raw.includes('wall')) return 'Wall';
    if (raw.includes('slab') || raw.includes('floor') || raw.includes('deck')) return 'Floor / Slab';

    const isConcrete = raw.includes('concrete') || raw.includes(' rc ') || raw.includes('rc_') || raw.includes('precast');
    const isSteel = raw.includes('steel') || raw.includes('metal') || raw.includes('shs') || raw.includes('chs') || raw.includes('rhs') ||
                    raw.includes('hollow section') || raw.includes('hollow tube') || raw.includes('tube-roof') || raw.includes('truss') ||
                    raw.includes('l-angle') || raw.includes('cross-member') || raw.includes('bracing') || type === 'IFCMEMBER' || type === 'IFCPLATE';

    if (raw.includes('column') || raw.includes('pillar')) {
      return (isSteel && !isConcrete) ? 'Steel Column' : 'Column';
    }
    if (raw.includes('beam') || raw.includes('girder')) {
      return (isSteel && !isConcrete) ? 'Steel Framing' : 'Beam';
    }
    if (isSteel) return 'Steel Framing';
    if (raw.includes('roof') || raw.includes('canopy')) return 'Roof';
    if (raw.includes('stair')) return 'Stair';
    if (raw.includes('railing') || raw.includes('guardrail')) return 'Railing';
    if (raw.includes('rail')) return 'Rail Track';
    if (raw.includes('tunnel')) return 'Tunnel';
    
    return type.replace(/^IFC/, '').replace(/STANDARDCASE$/, '').replace(/ELEMENT$/, '').toLowerCase();
  }
  
  guessStructureName(name, type, spatialName = '') {
    const lower = (name + ' ' + type + ' ' + spatialName).toLowerCase();
    if (spatialName && spatialName !== 'Default Level' && spatialName !== 'Level 1' && spatialName !== 'Ground Level' && spatialName.toLowerCase() !== 'unknownname' && spatialName.toLowerCase() !== 'unknown') {
      return spatialName;
    }
    if (lower.includes('road') || lower.includes('kerb') || lower.includes('pave') || lower.includes('lane')) {
      return 'Road & Highway Infrastructure';
    }
    if (lower.includes('admin')) return 'Rail Administration Building';
    if (lower.includes('workshop') || lower.includes('stabling')) return 'Rail Workshop & Rail Stabling';
    if (lower.includes('bus') || lower.includes('depot')) return 'Bus Depot (multi-storey)';
    if (lower.includes('tunnel')) return 'Cut & Cover Tunnel';
    if (lower.includes('erss')) return 'Notional ERSS (EC tunnel)';
    if (lower.includes('track') || lower.includes('rail')) return 'Rail tracks (depot alignment)';
    if (lower.includes('bridge') || lower.includes('truss')) return 'Cable bridges (steel trusses)';
    return 'Site & Infrastructure';
  }
}
