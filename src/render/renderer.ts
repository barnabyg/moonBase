import * as THREE from "three";
import { catalogue } from "../catalogue";
import type { GroundPosition, Snapshot } from "../simulation";
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

  // A fixed view of the landing site; camera controls come in a later ticket.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);
  const lookAt = toScene(initial.lander.position, 2);
  camera.position.copy(lookAt).add(new THREE.Vector3(17, 6, 21));
  camera.lookAt(lookAt);

  const earthDirection = new THREE.Vector3();
  camera.getWorldDirection(earthDirection);
  earthDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.12);
  const lighting = createLighting(catalogue.lunation, earthDirection);
  scene.add(
    createGround(initial.map),
    createEarth(earthDirection),
    ...lighting.objects,
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
      lighting.update(
        snapshot.lunation,
        lookAt,
        camera.position.distanceTo(lookAt),
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
