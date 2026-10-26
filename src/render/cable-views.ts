import * as THREE from "three";
import type { CableSnapshot } from "../simulation";
import { toScene, type Frame } from "./interpolation";

const cableMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8741c,
  metalness: 0.2,
  roughness: 0.7,
});
const CABLE_RADIUS = 0.05;

interface CableView {
  readonly mesh: THREE.Mesh;
  /** Identifies the route the mesh was built from, to tell when it has grown. */
  routeKey: string;
}

/**
 * Draws every power cable along the ground, as far as the Robot has laid it,
 * so that it visibly grows behind the Robot.
 */
export function createCableViews(scene: THREE.Scene) {
  const views = new Map<string, CableView>();

  return {
    update(frame: Frame): void {
      const seen = new Set<string>();
      for (const cable of frame.current.cables) {
        const id = cable.toStructureId;
        seen.add(id);
        let view = views.get(id);
        if (view === undefined) {
          const mesh = new THREE.Mesh(
            new THREE.BufferGeometry(),
            cableMaterial,
          );
          mesh.name = "Power cable";
          mesh.receiveShadow = true;
          scene.add(mesh);
          view = { mesh, routeKey: "" };
          views.set(id, view);
        }
        // Snapshots are fresh copies, so tell a grown route by its end.
        const last = cable.route.at(-1);
        const routeKey = `${cable.route.length}:${last?.x ?? ""},${last?.y ?? ""}`;
        if (view.routeKey !== routeKey) {
          view.mesh.geometry.dispose();
          view.mesh.geometry = cableGeometry(cable.route);
          view.routeKey = routeKey;
        }
      }
      for (const [id, view] of views) {
        if (!seen.has(id)) {
          scene.remove(view.mesh);
          view.mesh.geometry.dispose();
          views.delete(id);
        }
      }
    },
  };
}

/** A thin tube lying on the ground along the route. */
function cableGeometry(route: CableSnapshot["route"]): THREE.BufferGeometry {
  if (route.length < 2) return new THREE.BufferGeometry();
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let index = 1; index < route.length; index++) {
    const from = route[index - 1];
    const to = route[index];
    if (from === undefined || to === undefined) continue;
    path.add(
      new THREE.LineCurve3(
        toScene(from, CABLE_RADIUS),
        toScene(to, CABLE_RADIUS),
      ),
    );
  }
  return new THREE.TubeGeometry(
    path,
    Math.max(route.length - 1, 1) * 2,
    CABLE_RADIUS,
    4,
    false,
  );
}
