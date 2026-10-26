import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition, Snapshot } from "../simulation";
import { createCableViews } from "./cable-views";
import { createCameraControls } from "./camera";
import { createConstructionViews } from "./construction-views";
import { toScene, type Frame } from "./interpolation";
import { createLighting } from "./lighting";
import { createMachineViews } from "./machine-views";
import { createLanderModel } from "./models";
import {
  createPlacementPreview,
  type PlacementPreview,
} from "./placement-preview";
import { createRobotViews } from "./robot-views";
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
  /** Shows a Structure the player is about to place, or hides it when undefined. */
  showPlacementPreview(preview: PlacementPreview | undefined): void;
  /**
   * Forgets everything drawn on the base map, for a Campaign loaded in place
   * of the one it was drawing. The camera stays where it is.
   */
  startAfresh(): void;
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
    createGround(initial.map),
    createEarth(earthDirection),
    ...lighting.objects,
  );

  const cameraControls = createCameraControls(
    camera,
    webgl.domElement,
    initial.map,
    landingSite,
  );

  const lander = createLanderModel(catalogue.lander.footprintRadiusMetres);
  scene.add(lander);
  const robots = createRobotViews(scene);
  const machines = createMachineViews(scene);
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
      lander.position.copy(toScene(current.lander.position));
      robots.update(frame, realSeconds);
      machines.update(frame, realSeconds);
      cables.update(frame);
      constructions.update(frame, realSeconds, lighting.sunFacing);
      webgl.render(scene, camera);
    },
    pickGround(clientX, clientY) {
      const bounds = webgl.domElement.getBoundingClientRect();
      pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(groundPlane, hit) === null) {
        return undefined;
      }
      // Back from the scene (z south) to the ground (y north).
      return { x: hit.x, y: -hit.z };
    },
    showPlacementPreview(preview) {
      placementPreview.show(preview);
    },
    startAfresh() {
      robots.clear();
      machines.clear();
      cables.clear();
      constructions.clear();
    },
  };
}
