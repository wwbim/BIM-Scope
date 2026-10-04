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
    this.customIntensity = 1.5;
    this.customColor = '#ffffff';
    this.customAmbient = 0.6;
    
    this.isTimelapseRunning = false;
    this.timelapseSpeed = 2.0; // minutes per frame
    
    this.center = new THREE.Vector3(0, 0, 0);
    this.initLights();
    this.update();
  }
  
  initLights() {
    // Directional Sun Light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1200;
    const d = 400;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    
    // Target
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sunLight.target = this.sunTarget;
    
    // Ambient Light
    this.ambientLight = new THREE.AmbientLight(0x94a3b8, 0.7);
    this.scene.add(this.ambientLight);
    
    // Hemisphere light for soft sky/ground bounce
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 0.55);
    this.scene.add(this.hemiLight);

    // Camera Headlight (soft fill light that follows the camera)
    this.headLight = new THREE.DirectionalLight(0xffffff, 0.35);
    this.headLight.castShadow = false;
    this.scene.add(this.headLight);
  }

  setCamera(camera) {
    if (this.headLight && camera) {
      this.headLight.position.copy(camera.position);
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
    const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
    const elevation = 90 - (zenith * 180 / Math.PI);
    
    // Solar Azimuth Angle from North clockwise (0° = North, 90° = East, 180° = South, 270° = West)
    const x = -Math.cos(decl) * Math.sin(haRad);
    const y = Math.sin(decl) * Math.cos(latRad) - Math.cos(decl) * Math.sin(latRad) * Math.cos(haRad);
    let azimuth = Math.atan2(x, y) * 180 / Math.PI;
    if (azimuth < 0) azimuth += 360;
    
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
    let ambientIntensity = 0.6;
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
          color.setRGB(1.0, 0.58, 0.28);
          intensity = 0.8 * (el / 10);
          ambientIntensity = 0.4;
        } else if (el < 30) {
          // Warm mid-morning/afternoon
          color.setRGB(1.0, 0.88, 0.72);
          intensity = 0.8 + 0.6 * ((el - 10) / 20);
          ambientIntensity = 0.55;
        } else {
          // High tropical noon
          color.setRGB(1.0, 0.98, 0.92);
          intensity = 1.4 + 0.4 * Math.sin((el - 30) / 60 * Math.PI * 0.5);
          ambientIntensity = 0.7;
        }
      } else {
        // Night
        intensity = 0;
        ambientIntensity = 0.25;
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
    
    // Position Sun relative to scene center
    const r = 500;
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
    this.hemiLight.intensity = ambientIntensity * 0.7;
    
    return {
      azimuth: az,
      elevation: el,
      intensity: intensity,
      isDay: isDay
    };
  }
  
  setCenter(center) {
    if (center && center.isVector3) {
      this.center.copy(center);
      if (this.sunTarget) {
        this.sunTarget.position.copy(center);
      }
      this.update();
    }
  }

  stepTimelapse() {
    if (!this.isTimelapseRunning) return;
    this.timeMinutes = (this.timeMinutes + this.timelapseSpeed) % 1440;
    return this.update();
  }
}
