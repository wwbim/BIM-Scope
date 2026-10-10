/**
 * BIM Scope Solar & Lighting Engine
 * @author WWBIM
 */
class SolarEngine {
  constructor(scene, renderer) {
    this.author = "WWBIM";
    this.scene = scene;
    this.renderer = renderer;
    
    this.mode = 'singapore'; // 'singapore' or 'custom'
    this.lat = 1.3521;       // Singapore Latitude
    this.lon = 103.8198;     // Singapore Longitude
    this.timezone = 8;       // UTC+8
    
    this.currentDate = new Date();
    this.timeMinutes = 13 * 60 + 8; // Default 13:08 SST (around solar noon in SG)
    
    // Custom light settings
    this.customAzimuth = 145;
    this.customElevation = 55;
    this.customIntensity = 2.0;
    this.customColor = '#ffffff';
    this.customAmbient = 0.30;
    
    this.isTimelapseRunning = false;
    this.timelapseSpeed = 2.0; // minutes per frame
    
    this.center = new THREE.Vector3(0, 0, 0);
    this.modelRadius = 35;
    this.sunDistance = 150;
    this.initLights();
    this.updateShadowFrustum();
    this.update();
  }
  
  initLights() {
    // Directional Sun Light (crisp direct sunlight with normal-bias)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0002;
    this.sunLight.shadow.normalBias = 0.06;
    this.sunLight.shadow.radius = 1.2;
    this.scene.add(this.sunLight);
    
    // Target
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sunLight.target = this.sunTarget;
    
    // Ambient Light (subtle ambient fill to maintain rich contrast)
    this.ambientLight = new THREE.AmbientLight(0x94a3b8, 0.30);
    this.scene.add(this.ambientLight);
    
    // Hemisphere light for soft sky/ground bounce (sky: soft sky tint, ground: warm dark slate)
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.22);
    this.scene.add(this.hemiLight);

    // Camera Headlight (minimal non-washing fill to keep deep crevices subtly readable)
    this.headLight = new THREE.DirectionalLight(0xffffff, 0.08);
    this.headLight.castShadow = false;
    this.headLightTarget = new THREE.Object3D();
    this.scene.add(this.headLightTarget);
    this.headLight.target = this.headLightTarget;
    this.scene.add(this.headLight);
  }

  updateShadowFrustum() {
    if (!this.sunLight || !this.sunLight.shadow) return;
    const r = this.modelRadius || 35;
    // Cover the model plus ground shadow projection margin (factor ~1.3)
    const d = Math.max(18, Math.ceil(r * 1.3));
    const cam = this.sunLight.shadow.camera;
    cam.left = -d;
    cam.right = d;
    cam.top = d;
    cam.bottom = -d;

    this.sunDistance = Math.max(120, Math.ceil(r * 3.5));
    cam.near = Math.max(5, this.sunDistance - r * 1.8);
    cam.far = this.sunDistance + r * 1.8;
    cam.updateProjectionMatrix();
    this.sunLight.shadow.needsUpdate = true;
  }

  setCamera(camera, target) {
    if (this.headLight && camera) {
      this.headLight.position.copy(camera.position);
      if (target && this.headLightTarget) {
        this.headLightTarget.position.copy(target);
      }
    }
  }
  
  // Calculate Singapore Solar Position (NOAA / PSA Algorithm)
  calculateSingaporeSun(date, minutesOfDay) {
    const d = (date instanceof Date) ? date : new Date(date);
    const year = d.getFullYear();
    const startOfYear = new Date(year, 0, 1, 0, 0, 0);
    const currentDateNoon = new Date(year, d.getMonth(), d.getDate(), 12, 0, 0);
    const diff = currentDateNoon - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay) + 1;
    
    const hour = minutesOfDay / 60;
    const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
    const totalDays = isLeap ? 366 : 365;
    const gamma = (2 * Math.PI / totalDays) * (dayOfYear - 1 + (hour - 12) / 24);
    
    // Equation of time in minutes
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
      
    // Solar declination in radians
    const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
      
    // Time offset in minutes (Singapore UTC+8 is approx 1 hour ahead of true local solar time)
    const timeOffset = eqtime + 4 * this.lon - 60 * this.timezone;
    const trueSolarTime = (minutesOfDay + timeOffset + 1440) % 1440;
    
    // Hour angle in radians (haRad = 0 at solar noon)
    const hourAngleDeg = (trueSolarTime / 4) - 180;
    const haRad = hourAngleDeg * Math.PI / 180;
    const latRad = this.lat * Math.PI / 180;
    
    // Zenith angle
    const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);
    const clampedZenith = Math.max(-1, Math.min(1, isFinite(cosZenith) ? cosZenith : 0));
    const zenith = Math.acos(clampedZenith);
    let elevation = 90 - (zenith * 180 / Math.PI);
    
    // Solar Azimuth Angle from North clockwise (0° = North, 90° = East, 180° = South, 270° = West)
    const x = -Math.cos(decl) * Math.sin(haRad);
    const y = Math.sin(decl) * Math.cos(latRad) - Math.cos(decl) * Math.sin(latRad) * Math.cos(haRad);
    let azimuth = Math.atan2(x, y) * 180 / Math.PI;
    if (azimuth < 0) azimuth += 360;
    
    if (!isFinite(elevation)) elevation = 45;
    if (!isFinite(azimuth)) azimuth = 180;
    
    return {
      elevation: Math.round(elevation * 10) / 10,
      azimuth: Math.round(azimuth * 10) / 10,
      isDay: elevation > 0
    };
  }
  
  update() {
    let az = 0;
    let el = 0;
    let intensity = 1.0;
    let color = new THREE.Color(0xffffff);
    let ambientIntensity = 0.30;
    let isDay = true;
    
    if (this.mode === 'singapore') {
      const solar = this.calculateSingaporeSun(this.currentDate, this.timeMinutes);
      az = solar.azimuth;
      el = solar.elevation;
      isDay = solar.isDay;
      
      if (el > 0) {
        // Daylight phase
        if (el < 10) {
          // Dawn / Dusk golden hour
          color.setRGB(1.0, 0.62, 0.32);
          intensity = 1.2 * (el / 10);
          ambientIntensity = 0.20;
        } else if (el < 30) {
          // Warm mid-morning/afternoon
          color.setRGB(1.0, 0.90, 0.76);
          intensity = 1.2 + 0.8 * ((el - 10) / 20);
          ambientIntensity = 0.26;
        } else {
          // High tropical noon
          color.setRGB(1.0, 0.98, 0.94);
          intensity = 1.8 + 0.4 * Math.sin((el - 30) / 60 * Math.PI * 0.5);
          ambientIntensity = 0.30;
        }
      } else {
        // Night
        intensity = 0;
        ambientIntensity = 0.15;
        this.sunLight.castShadow = false;
      }
    } else {
      // Custom mode
      az = this.customAzimuth;
      el = this.customElevation;
      intensity = this.customIntensity;
      color.setStyle(this.customColor);
      ambientIntensity = this.customAmbient;
      isDay = el > 0;
    }
    
    // Position Sun relative to scene center using adapted sun distance
    const r = this.sunDistance || 150;
    const azRad = az * Math.PI / 180;
    const elRad = Math.max(0.01, el) * Math.PI / 180;
    
    const x = r * Math.sin(azRad) * Math.cos(elRad);
    const y = r * Math.sin(elRad);
    const z = -r * Math.cos(azRad) * Math.cos(elRad);
    
    const cx = this.center ? this.center.x : 0;
    const cy = this.center ? this.center.y : 0;
    const cz = this.center ? this.center.z : 0;

    this.sunLight.position.set(cx + x, cy + y, cz + z);
    if (this.sunTarget) {
      this.sunTarget.position.set(cx, cy, cz);
    }
    this.sunLight.color.copy(color);
    this.sunLight.intensity = intensity;
    this.sunLight.castShadow = isDay;
    
    this.ambientLight.intensity = ambientIntensity;
    this.hemiLight.intensity = ambientIntensity * 0.75;
    
    return {
      azimuth: az,
      elevation: el,
      intensity: intensity,
      isDay: isDay
    };
  }
  
  setCenter(center, box) {
    if (center && center.isVector3) {
      this.center.copy(center);
      if (this.sunTarget) {
        this.sunTarget.position.copy(center);
      }
    }
    if (box && !box.isEmpty()) {
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      this.modelRadius = Math.max(15, sphere.radius);
      this.updateShadowFrustum();
    }
    this.update();
  }

  stepTimelapse() {
    if (!this.isTimelapseRunning) return;
    this.timeMinutes = (this.timeMinutes + this.timelapseSpeed) % 1440;
    return this.update();
  }
}
