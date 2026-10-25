import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition, Snapshot } from "../simulation";
import { createCameraControls } from "./camera";
import { createLighting } from "./lighting";
import { createLanderModel, createRobotModel } from "./models";
import { createEarth, createGround } from "./scenery";

export interface Renderer {
  /** Draws the scene as the given snapshot describes it. It never changes the simulation. */
  render(snapshot: Snapshot): void;
}

/** Maps a simulation ground position (x east, y north) onto the Three.js scene (x east, z south). */
function toScene(position: GroundPosition, height = 0): THREE.Vector3 {
  return new THREE.Vector3(position.x, height, -position.y);
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
  const robots = new Map<string, THREE.Group>();

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    webgl.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  return {
    render(snapshot) {
      cameraControls.update();
      const { focus } = cameraControls;
      lighting.update(
        snapshot.lunation,
        focus,
        camera.position.distanceTo(focus),
      );
      lander.position.copy(toScene(snapshot.lander.position));
      for (const robot of snapshot.robots) {
        let model = robots.get(robot.id);
        if (model === undefined) {
          model = createRobotModel();
          robots.set(robot.id, model);
          scene.add(model);
        }
        model.position.copy(toScene(robot.position));
        model.lookAt(toScene(snapshot.lander.position));
      }
      webgl.render(scene, camera);
    },
  };
}
