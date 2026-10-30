import * as THREE from "three";
import { catalogue } from "../catalogue";
import { uncoveredIceStore } from "../simulation";
import { toScene, type Frame } from "./interpolation";
import { createIceStoreModel } from "./models";

/** Draws the base's ice store beside the stockpile's mat, filling and emptying with the stock. */
export function createIceStoreView(scene: THREE.Scene) {
  const model = createIceStoreModel(catalogue.stockpile.iceStore.containers);
  scene.add(model.group);
  return {
    update(frame: Frame): void {
      const store = uncoveredIceStore(frame.current);
      model.group.visible = store !== undefined;
      if (store === undefined) return;
      model.group.position.copy(toScene(store.position));
      model.showLevels(store.containerLevels);
    },
  };
}
