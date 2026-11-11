import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition, Snapshot } from "../simulation";
import { createCableViews } from "./cable-views";
import {
  createCameraControls,
  FAR_PLANE_METRES,
  FIELD_OF_VIEW_DEGREES,
} from "./camera";
import { createConstructionViews } from "./construction-views";
import { toScene, type Frame } from "./interpolation";
import { createLighting } from "./lighting";
import { createMachineViews } from "./machine-views";
import { createMapMarker, type MapSubject, type Marked } from "./map-marker";
import { createMissionDirectorView } from "./mission-director-view";
import { pickStructure } from "./picking";
import { createLanderView } from "./lander-view";
import { createStockpileModel } from "./models";
import {
  createPlacementPreview,
  type PlacementPreview,
} from "./placement-preview";
import { createIceStoreView } from "./ice-store-view";
import { createRegolithHeapView } from "./regolith-heap-view";
import { createRobotViews } from "./robot-views";
import { createRoverViews } from "./rover-views";
import { createEarth, createGround } from "./scenery";
import { createStars } from "./stars";

export type { Frame, MapSubject, PlacementPreview };

/** A point on the screen, in client pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface Renderer {
  /** The element the 3D view is drawn on, which receives the player's pointer input. */
  readonly canvas: HTMLCanvasElement;
  /** Draws the scene as the frame describes it. It never changes the simulation. */
  render(frame: Frame): void;
  /**
   * The point on the ground under a position on the screen, in client
   * pixels, or undefined if the ground isn't there (such as in the sky).
   */
  pickGround(clientX: number, clientY: number): GroundPosition | undefined;
  /**
   * The id of the Structure drawn under a position on the screen, in
   * client pixels, whether commissioned, under Construction or being
   * dismantled, or undefined if there is none there. It reads what was
   * last drawn and changes nothing.
   */
  pickStructure(clientX: number, clientY: number): string | undefined;
  /**
   * Where a Structure stands on the screen, in client pixels, as last
   * drawn, or undefined if it isn't drawn or is behind the camera.
   */
  structureOnScreen(structureId: string): ScreenPoint | undefined;
  /**
   * Moves the camera to look at something on the base map, from the side
   * and as steeply as it looks now, and marks it there for a few seconds.
   * Returns whether it is on the map: a Robot or the Rover away on an
   * Expedition isn't, and then nothing changes.
   */
  showOnMap(subject: MapSubject): boolean;
  /**
   * Marks something on the base map for as long as it is pointed out,
   * without moving the camera, or stops when undefined.
   */
  pointOut(subject: MapSubject | undefined): void;
  /** Shows a Structure the player is about to place, or hides it when undefined. */
  showPlacementPreview(preview: PlacementPreview | undefined): void;
  /**
   * Forgets everything drawn on the base map, for a Campaign loaded in place
   * of the one it was drawing. The camera stays where it is.
   */
  startAfresh(): void;
}

/**
 * Whether WebGL is drawn by the CPU, as on a machine without a usable GPU,
 * such as the CI runner (SwiftShader) or Windows without a graphics driver
 * (Microsoft Basic Render Driver). Chromium puts "WebKit WebGL" in RENDERER
 * and the real name in the debug extension's UNMASKED_RENDERER_WEBGL.
 */
function drawsInSoftware(webgl: THREE.WebGLRenderer): boolean {
  const context = webgl.getContext();
  const debug = context.getExtension("WEBGL_debug_renderer_info");
  const name: unknown = context.getParameter(
    debug === null ? context.RENDERER : debug.UNMASKED_RENDERER_WEBGL,
  );
  return (
    typeof name === "string" &&
    /llvmpipe|softpipe|swiftshader|basic render driver/i.test(name)
  );
}

export function createRenderer(
  container: HTMLElement,
  initial: Snapshot,
): Renderer {
  let webgl = new THREE.WebGLRenderer({ antialias: true });
  const software = drawsInSoftware(webgl);
  if (software) {
    // Multisampling smooths edges at almost no cost on a GPU, but drawn in
    // software it cut the frame rate from 8.7 to 5.4 a second (SwiftShader
    // in Chromium, at 1280 × 720). A context can't turn it off once made, so
    // make another; machines with a GPU still make only one.
    webgl.dispose();
    webgl.forceContextLoss();
    webgl = new THREE.WebGLRenderer({ antialias: false });
  }
  webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.toneMapping = THREE.ACESFilmicToneMapping;
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.PCFShadowMap;
  container.append(webgl.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // The game opens on a view of the landing site, which the player can then
  // pan, rotate and zoom.
  const camera = new THREE.PerspectiveCamera(
    FIELD_OF_VIEW_DEGREES,
    1,
    0.1,
    FAR_PLANE_METRES,
  );
  const landingSite = toScene(initial.lander.position);
  camera.position.copy(landingSite).add(new THREE.Vector3(17, 8, 21));
  camera.lookAt(landingSite);

  const earthDirection = new THREE.Vector3();
  camera.getWorldDirection(earthDirection);
  earthDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.12);
  const lighting = createLighting(catalogue.lunation, earthDirection);
  const ground = createGround(
    initial.map,
    // Anisotropic filtering keeps the ground sharp towards the horizon at
    // almost no cost on a GPU, but drawn in software it slows every frame
    // several times over.
    software ? 1 : webgl.capabilities.getMaxAnisotropy(),
  );
  const stars = createStars();
  scene.add(
    ground.group,
    createEarth(earthDirection),
    stars.object,
    ...lighting.objects,
  );

  const cameraControls = createCameraControls(
    camera,
    webgl.domElement,
    initial.map,
    landingSite,
  );

  const lander = createLanderView(scene);
  const stockpile = createStockpileModel(
    catalogue.stockpile.footprintRadiusMetres,
  );
  scene.add(stockpile.group);
  const regolithHeap = createRegolithHeapView(scene, ground.material);
  const iceStore = createIceStoreView(scene);
  const missionDirector = createMissionDirectorView(scene);
  const robots = createRobotViews(scene);
  const machines = createMachineViews(scene);
  const rovers = createRoverViews(scene);
  const cables = createCableViews(scene);
  const constructions = createConstructionViews(scene, ground.material);
  const placementPreview = createPlacementPreview(scene);
  const marker = createMapMarker(scene);

  /** How far the mark goes round a Robot, a Machine and a Rover, in metres. */
  const MARK_RADIUS_METRES = { robot: 1.2, machine: 3, rover: 2.5 };

  /** Where something on the base map was last drawn, if it is on it. */
  function where(subject: MapSubject): Marked | undefined {
    if (subject.kind === "structure") {
      const position = constructions.positionOf(subject.id);
      const radiusMetres = constructions.radiusOf(subject.id);
      return position === undefined || radiusMetres === undefined
        ? undefined
        : { position, radiusMetres };
    }
    const position = (
      subject.kind === "robot"
        ? robots
        : subject.kind === "machine"
          ? machines
          : rovers
    ).positionOf(subject.id);
    return position === undefined
      ? undefined
      : { position, radiusMetres: MARK_RADIUS_METRES[subject.kind] };
  }

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    webgl.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const projected = new THREE.Vector3();

  /** Aims the ray at a position on the screen, in client pixels. */
  function aim(clientX: number, clientY: number): void {
    const bounds = webgl.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }

  /** The point on the ground the ray meets, or undefined if it doesn't. */
  function groundHit(): GroundPosition | undefined {
    if (raycaster.ray.intersectPlane(groundPlane, hit) === null) {
      return undefined;
    }
    // Back from the scene (z south) to the ground (y north).
    return { x: hit.x, y: -hit.z };
  }

  return {
    canvas: webgl.domElement,
    render(frame) {
      const { current } = frame;
      const realSeconds = performance.now() / 1000;
      cameraControls.update();
      const { focus } = cameraControls;
      lighting.update(
        current.lunation,
        focus,
        camera.position.distanceTo(focus),
      );
      stars.update(current.lunation, camera.position);
      lander.update(frame, realSeconds);
      stockpile.group.position.copy(toScene(current.stockpile.position));
      stockpile.showStock(
        current.stockpile.components.reduce(
          (total, stock) => total + stock.count,
          0,
        ),
      );
      regolithHeap.update(frame);
      iceStore.update(frame);
      robots.update(frame, realSeconds);
      machines.update(frame, realSeconds);
      rovers.update(frame);
      cables.update(frame);
      missionDirector.update(frame, realSeconds);
      // Their Habitat lights up once they reach it.
      const home =
        current.missionDirector.residence === "habitat" &&
        missionDirector.walkingTo !== current.missionDirector.habitatId
          ? current.missionDirector.habitatId
          : undefined;
      constructions.update(frame, realSeconds, lighting.sunFacing, home);
      // What is marked, on the element too, for anything that reads the page
      // rather than the picture, as the end-to-end tests do.
      const marked = marker.update(realSeconds, where, camera.position)?.id;
      const { dataset } = webgl.domElement;
      if (marked === undefined) delete dataset["marked"];
      else if (dataset["marked"] !== marked) dataset["marked"] = marked;
      webgl.render(scene, camera);
    },
    pickGround(clientX, clientY) {
      aim(clientX, clientY);
      return groundHit();
    },
    pickStructure(clientX, clientY) {
      aim(clientX, clientY);
      return pickStructure(
        raycaster.intersectObjects(constructions.pickable(), true),
        groundHit(),
        constructions.sites(),
      );
    },
    structureOnScreen(structureId) {
      const position = constructions.positionOf(structureId);
      if (position === undefined) return undefined;
      projected.copy(position).project(camera);
      // Behind the camera, or past the far plane.
      if (projected.z > 1) return undefined;
      const bounds = webgl.domElement.getBoundingClientRect();
      return {
        x: bounds.left + ((projected.x + 1) / 2) * bounds.width,
        y: bounds.top + ((1 - projected.y) / 2) * bounds.height,
      };
    },
    showOnMap(subject) {
      const marked = where(subject);
      if (marked === undefined) return false;
      cameraControls.lookAt(marked.position);
      marker.show(subject, performance.now() / 1000);
      return true;
    },
    pointOut(subject) {
      marker.pointOut(subject);
    },
    showPlacementPreview(preview) {
      placementPreview.show(preview);
    },
    startAfresh() {
      missionDirector.clear();
      robots.clear();
      machines.clear();
      rovers.clear();
      cables.clear();
      constructions.clear();
      marker.clear();
    },
  };
}
