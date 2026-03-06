import type { CustomObjectKind } from "../customObjectTypes";
import type { SerializedObjectSnapshot } from "./serializationCore";

export type BuiltinObjectKind =
  | "mesh"
  | "group"
  | "ambientLight"
  | "directionalLight"
  | "pointLight"
  | "perspectiveCamera";

export type ObjectKind = BuiltinObjectKind | CustomObjectKind;

export type SerializedObject = SerializedObjectSnapshot<ObjectKind>;

export interface SceneNode {
  uuid: string;
  name: string;
  kind: ObjectKind;
  parentUUID: string | null;
  childUUIDs: string[];
}
