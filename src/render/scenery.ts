import * as THREE from "three";
import type { MapSnapshot } from "../simulation";

// The look of the south pole: grey Regolith, a black sky and Earth low on the
// horizon. The sun and its long shadows are in lighting.ts.

/** A small, fixed pseudo-random sequence, so the scenery looks the same on every load. */
export function fixedRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function createGround(map: MapSnapshot): THREE.Group {
  const ground = new THREE.Group();
  ground.name = "Regolith";

  const baseMap = new THREE.Mesh(
    new THREE.PlaneGeometry(map.widthMetres, map.depthMetres),
    new THREE.MeshStandardMaterial({
      color: 0x7d7b78,
      roughness: 1,
      metalness: 0,
    }),
  );
  baseMap.rotation.x = -Math.PI / 2;
  baseMap.receiveShadow = true;

  // The land beyond the base map, so that the map does not float in space.
  const surroundings = new THREE.Mesh(
    new THREE.CircleGeometry(6000, 48),
    new THREE.MeshStandardMaterial({
      color: 0x5f5d5a,
      roughness: 1,
      metalness: 0,
    }),
  );
  surroundings.rotation.x = -Math.PI / 2;
  surroundings.position.y = -0.02;
  ground.add(baseMap, surroundings);

  const random = fixedRandom(1969);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x6e6b67,
    roughness: 1,
    flatShading: true,
  });
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  for (let index = 0; index < 160; index++) {
    const distance = 14 + random() * 300;
    const angle = random() * Math.PI * 2;
    const size = 0.15 + random() ** 3 * 1.6;
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(
      Math.cos(angle) * distance,
      size * 0.3,
      Math.sin(angle) * distance,
    );
    rock.scale.set(
      size * (0.8 + random() * 0.6),
      size * 0.6,
      size * (0.8 + random() * 0.6),
    );
    rock.rotation.set(
      random() * Math.PI,
      random() * Math.PI,
      random() * Math.PI,
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    ground.add(rock);
  }

  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x86837f,
    roughness: 1,
    flatShading: true,
  });
  for (let index = 0; index < 14; index++) {
    const distance = 40 + random() * 400;
    const angle = random() * Math.PI * 2;
    const radius = 3 + random() * 18;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius, radius * 0.12, 4, 18),
      rimMaterial,
    );
    rim.rotation.x = -Math.PI / 2;
    rim.scale.z = 0.35;
    rim.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    rim.castShadow = true;
    rim.receiveShadow = true;
    ground.add(rim);
  }
  return ground;
}

/** Earth, low on the horizon in the given direction. */
export function createEarth(direction: THREE.Vector3): THREE.Mesh {
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.MeshStandardMaterial({
      color: 0x3f6fc9,
      emissive: 0x0d2350,
      roughness: 0.8,
      metalness: 0,
    }),
  );
  earth.name = "Earth";
  const horizontal = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  earth.position.copy(horizontal.multiplyScalar(5200)).setY(190);
  return earth;
}
