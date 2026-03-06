import * as THREE from "three/webgpu";
import { createObjectForKind, detectBuiltinObjectKind } from "./serializationCore";
import { makeCustomObject, isCustomObjectKind } from "../customObjectRegistry";
import type { ObjectKind } from "./sceneTypes";

export function makeObject(kind: ObjectKind): THREE.Object3D {
  return createObjectForKind(kind, {
    createCustomObject: (customKind) => {
      const custom = makeCustomObject(customKind as string);
      if (custom) custom.userData.r3eKind = customKind;
      return custom;
    },
  });
}

export function detectKind(obj: THREE.Object3D): ObjectKind {
  if (obj.userData.r3eKind && isCustomObjectKind(obj.userData.r3eKind as string)) {
    return obj.userData.r3eKind as ObjectKind;
  }
  return detectBuiltinObjectKind(obj);
}
