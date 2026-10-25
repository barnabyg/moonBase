import * as THREE from "three";
import type { LunationSchedule } from "../catalogue";
import type { LunationSnapshot } from "../simulation";

// The light of the lunar south pole. In Daylight the sun skims the horizon,
// circling the sky once every Lunation and casting long shadows. At Night the
// base is dark apart from a faint earthshine.

const MINUTES_PER_EARTH_DAY = 24 * 60;
const SUN_INTENSITY = 4;
/** The sun's height above the horizon at the start and end of Daylight, and midway through it. */
const SUN_ELEVATION_AT_EDGES = THREE.MathUtils.degToRad(4);
const SUN_ELEVATION_AT_MIDDLE = THREE.MathUtils.degToRad(9);
/** How long the sun takes to rise clear of the horizon, or to sink below it. */
const SUNRISE_MINUTES = 3 * 60;
/**
 * Where the sun rises, measured from east towards south. Chosen so that, when
 * a new Campaign begins, the sun lights the landing site from the side as seen
 * from the starting view.
 */
const SUNRISE_AZIMUTH = THREE.MathUtils.degToRad(-128);
const SKY_DISTANCE = 5000;
const SHADOW_MAP_SIZE = 2048;
const SUN_DISC_RADIUS = 24;

export interface Lighting {
  readonly objects: readonly THREE.Object3D[];
  /**
   * The angle for Object3D.rotation.y that turns a model's +z axis towards the
   * sun, or undefined at Night.
   */
  readonly sunFacing: number | undefined;
  /**
   * Places the sun for the current part of the Lunation, and fits its shadows
   * around the part of the map in view.
   */
  update(
    lunation: LunationSnapshot,
    focus: THREE.Vector3,
    viewRadius: number,
  ): void;
}

export function createLighting(
  schedule: LunationSchedule,
  earthDirection: THREE.Vector3,
): Lighting {
  const sun = new THREE.DirectionalLight(0xfff6e8, SUN_INTENSITY);
  sun.name = "Sun";
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.0004;

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_DISC_RADIUS, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff6e8, toneMapped: false }),
  );
  sunDisc.name = "Sun disc";

  // Sunlight scattered off the Regolith fills the shadows a little; at Night
  // only the faint blue earthshine is left.
  const fill = new THREE.HemisphereLight(0x101418, 0x4a4844, 0.6);
  const earthshine = new THREE.DirectionalLight(0x9db8ff, 0.12);
  earthshine.name = "Earthshine";
  earthshine.position.copy(earthDirection).setY(0.15).normalize();

  const daylightMinutes = schedule.daylightEarthDays * MINUTES_PER_EARTH_DAY;
  const lunationMinutes =
    daylightMinutes + schedule.nightEarthDays * MINUTES_PER_EARTH_DAY;
  const sunDirection = new THREE.Vector3();
  let shadowRadius = 0;
  let sunFacing: number | undefined;

  return {
    objects: [sun, sun.target, sunDisc, fill, earthshine],
    get sunFacing() {
      return sunFacing;
    },
    update(lunation, focus, viewRadius) {
      // The sun is dimmed rather than hidden at Night, because changing the
      // number of lights makes Three.js recompile every material.
      const isDaylight = lunation.part === "daylight";
      sunDisc.visible = isDaylight;
      fill.intensity = isDaylight ? 0.6 : 0.05;
      if (!isDaylight) {
        sun.intensity = 0;
        sunFacing = undefined;
        return;
      }

      const sinceSunrise = daylightMinutes - lunation.minutesRemaining;
      const throughDaylight = sinceSunrise / daylightMinutes;
      const azimuth =
        SUNRISE_AZIMUTH + (sinceSunrise / lunationMinutes) * Math.PI * 2;
      const elevation = THREE.MathUtils.lerp(
        SUN_ELEVATION_AT_EDGES,
        SUN_ELEVATION_AT_MIDDLE,
        Math.sin(throughDaylight * Math.PI),
      );
      sunDirection.set(
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(azimuth) * Math.cos(elevation),
      );
      sunFacing = Math.atan2(sunDirection.x, sunDirection.z);
      const risen = Math.min(sinceSunrise, lunation.minutesRemaining);
      sun.intensity =
        SUN_INTENSITY * THREE.MathUtils.clamp(risen / SUNRISE_MINUTES, 0, 1);
      sunDisc.position.copy(sunDirection).multiplyScalar(SKY_DISTANCE);

      // Shadows only need to cover what the camera can see, so the shadow
      // map's detail goes where the player is looking.
      const radius = THREE.MathUtils.clamp(viewRadius, 40, 700);
      sun.target.position.copy(focus);
      sun.position
        .copy(sunDirection)
        .multiplyScalar(radius * 2)
        .add(focus);
      if (radius !== shadowRadius) {
        shadowRadius = radius;
        const camera = sun.shadow.camera;
        camera.left = -radius;
        camera.right = radius;
        camera.top = radius;
        camera.bottom = -radius;
        camera.near = 1;
        camera.far = radius * 4;
        camera.updateProjectionMatrix();
        // With the sun this low, each shadow-map texel smears across a long
        // strip of ground, so the offset that stops surfaces shadowing
        // themselves has to grow with the texel size.
        sun.shadow.normalBias = ((radius * 2) / SHADOW_MAP_SIZE) * 1.5;
      }
    },
  };
}
