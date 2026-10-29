import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition, Snapshot } from "../simulation";
import { createCableViews } from "./cable-views";
import { createCameraControls } from "./camera";
import { createConstructionViews } from "./construction-views";
import { toScene, type Frame } from "./interpolation";
import { createLighting } from "./lighting";
import { createMachineViews } from "./machine-views";
import { createMissionDirectorView } from "./mission-director-view";
import { pickStructure } from "./picking";
import { createLanderView } from "./lander-view";
import { createStockpileModel } from "./models";
import {
  createPlacementPreview,
  type PlacementPreview,
} from "./placement-preview";
import { createRobotViews } from "./robot-views";
import { createRoverViews } from "./rover-views";
import { createEarth, createGround } from "./scenery";

export type { Frame, PlacementPreview };

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
  structureOnScreen(
    structureId: string,
  ): { readonly x: number; readonly y: number } | undefined;
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
 * such as the CI runner. Firefox names the renderer, tidied, in RENDERER.
 */
function drawsInSoftware(webgl: THREE.WebGLRenderer): boolean {
  const context = webgl.getContext();
  const name: unknown = context.getParameter(context.RENDERER);
  return (
    typeof name === "string" &&
    /llvmpipe|softpipe|swiftshader|basic render driver/i.test(name)
  );
}

export function createRenderer(
  container: HTMLElement,
  initial: Snapshot,
): Renderer {
  const webgl = new THREE.WebGLRenderer({ antialias: true });
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
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);
  const landingSite = toScene(initial.lander.position);
  camera.position.copy(landingSite).add(new THREE.Vector3(17, 8, 21));
  camera.lookAt(landingSite);

  const earthDirection = new THREE.Vector3();
  camera.getWorldDirection(earthDirection);
  earthDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.12);
  const lighting = createLighting(catalogue.lunation, earthDirection);
  scene.add(
    createGround(
      initial.map,
      // Anisotropic filtering keeps the ground sharp towards the horizon at
      // almost no cost on a GPU, but drawn in software it slows every frame
      // several times over.
      drawsInSoftware(webgl) ? 1 : webgl.capabilities.getMaxAnisotropy(),
    ),
    createEarth(earthDirection),
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
  const missionDirector = createMissionDirectorView(scene);
  const robots = createRobotViews(scene);
  const machines = createMachineViews(scene);
  const rovers = createRoverViews(scene);
  const cables = createCableViews(scene);
  const constructions = createConstructionViews(scene);
  const placementPreview = createPlacementPreview(scene);

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
      lander.update(frame, realSeconds);
      stockpile.group.position.copy(toScene(current.stockpile.position));
      stockpile.showStock(
        current.stockpile.components.reduce(
          (total, stock) => total + stock.count,
          0,
        ),
      );
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
    },
  };
}
