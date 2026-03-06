import * as THREE from "three/webgpu";
import {
  buildGeometry,
  readGeometryParams,
  buildMaterial,
  readMaterialProps,
  readLightProps,
  readCameraProps,
  readShadowProps,
  applyLightProps,
  applyCameraProps,
  applyShadowProps,
  materializeSerializedSubtree,
  snapshotSerializedSubtree,
  buildRawBufferGeometry,
  applyRawBufferGeometry,
  snapshotRawBufferGeometry,
  createBuiltinObject,
  createObjectForKind,
} from "../dist/core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon;
}

function testGeometryRoundTrip() {
  const original = new THREE.CapsuleGeometry(0.7, 1.4, 6, 12);
  original.parameters.length = 1.4;
  const snapshot = readGeometryParams(original);
  const rebuilt = buildGeometry(snapshot);

  assert(rebuilt.type === "CapsuleGeometry", "geometry type should round-trip");
  assert(approx(rebuilt.parameters.radius, 0.7), "capsule radius should round-trip");
  assert(approx(rebuilt.parameters.length, 1.4), "capsule length should round-trip");

  const edited = new THREE.BoxGeometry(1, 1, 1);
  edited.getAttribute("position").setXYZ(0, 9, 8, 7);
  edited.userData.r3eEdited = true;
  const editedSnapshot = readGeometryParams(edited);
  const rebuiltEdited = buildGeometry(editedSnapshot);

  assert(rebuiltEdited.type === "BufferGeometry", "edited geometry should serialize as buffer geometry");
  assert(rebuiltEdited.getAttribute("position").getX(0) === 9, "edited buffer data should round-trip");
}

function testMaterialRoundTrip() {
  const original = new THREE.MeshPhysicalMaterial({
    color: "#ff5500",
    roughness: 0.23,
    metalness: 0.67,
    transmission: 0.42,
    thickness: 0.9,
    clearcoat: 0.11,
    clearcoatRoughness: 0.19,
    opacity: 0.8,
    transparent: true,
  });
  original.side = THREE.DoubleSide;

  const snapshot = readMaterialProps(original);
  const rebuilt = buildMaterial(snapshot);

  assert(rebuilt.type === "MeshPhysicalMaterial", "material type should round-trip");
  assert(rebuilt.color.getHexString() === "ff5500", "material color should round-trip");
  assert(approx(rebuilt.roughness, 0.23), "roughness should round-trip");
  assert(approx(rebuilt.metalness, 0.67), "metalness should round-trip");
  assert(approx(rebuilt.transmission, 0.42), "transmission should round-trip");
  assert(rebuilt.side === THREE.DoubleSide, "side should round-trip");
}

function testMaterialSnapshotWithMap() {
  const tex = new THREE.Texture();
  tex.userData.r3eUrl = "/textures/test.png";
  const original = new THREE.MeshStandardMaterial({ color: "#336699", map: tex, roughness: 0.4 });

  const snapshot = readMaterialProps(original);

  assert(snapshot.maps?.map === "/textures/test.png", "material snapshot should preserve lightweight map url");
  assert(!("textures" in snapshot), "material snapshot should omit heavy texture payloads");
  assert(!("images" in snapshot), "material snapshot should omit heavy image payloads");
}

function testLightRoundTrip() {
  const source = new THREE.DirectionalLight("#44aa88", 2.5);
  source.castShadow = true;
  source.shadow.bias = 0.01;
  source.shadow.normalBias = 0.02;
  source.shadow.radius = 3;
  source.shadow.mapSize.set(1024, 512);
  source.shadow.camera.left = -4;
  source.shadow.camera.right = 5;
  source.shadow.camera.top = 6;
  source.shadow.camera.bottom = -7;

  const target = new THREE.DirectionalLight();
  target.position.set(1, 2, 3);

  applyLightProps(target, readLightProps(source));
  const shadow = readShadowProps(source);
  if (shadow) applyShadowProps(target, shadow);

  assert(target.position.x === 1, "light transform should remain unchanged");
  assert(target.color.getHexString() === "44aa88", "light color should round-trip");
  assert(approx(target.intensity, 2.5), "light intensity should round-trip");
  assert(target.castShadow === true, "light castShadow should round-trip");
  assert(approx(target.shadow.bias, 0.01), "light shadow bias should round-trip");
  assert(target.shadow.mapSize.x === 1024, "light shadow map width should round-trip");
}

function testCameraRoundTrip() {
  const source = new THREE.PerspectiveCamera(72, 1, 0.5, 250);
  source.zoom = 1.7;
  source.filmGauge = 42;
  source.filmOffset = 1.25;
  source.focus = 9;

  const target = new THREE.PerspectiveCamera();
  target.position.set(3, 4, 5);

  applyCameraProps(target, readCameraProps(source));

  assert(target.position.z === 5, "camera transform should remain unchanged");
  assert(approx(target.fov, 72), "camera fov should round-trip");
  assert(approx(target.zoom, 1.7), "camera zoom should round-trip");
  assert(approx(target.filmGauge, 42), "camera filmGauge should round-trip");
}

function testSubtreeRoundTrip() {
  const parent = new THREE.Group();
  parent.uuid = "group-1";
  parent.name = "Parent";
  parent.position.set(1, 2, 3);

  const child = new THREE.Mesh(
    new THREE.BoxGeometry(2, 3, 4),
    new THREE.MeshStandardMaterial({ color: "#336699", roughness: 0.4 }),
  );
  child.uuid = "mesh-1";
  child.name = "ChildMesh";
  child.position.set(4, 5, 6);
  parent.add(child);

  const nodes = new Map([
    ["group-1", { kind: "group", childUUIDs: ["mesh-1"] }],
    ["mesh-1", { kind: "mesh", childUUIDs: [] }],
  ]);
  const objects = new Map([
    ["group-1", parent],
    ["mesh-1", child],
  ]);

  const snapshot = snapshotSerializedSubtree(
    "group-1",
    (uuid) => nodes.get(uuid),
    (uuid) => objects.get(uuid),
    (uuid) => (uuid === "mesh-1" ? ["solid", "hero"] : undefined),
  );

  assert(snapshot !== null, "subtree snapshot should be created");
  assert(snapshot.children.length === 1, "subtree snapshot should include child nodes");
  assert(snapshot.children[0].tags?.includes("hero"), "subtree snapshot should include tags");

  const rebuilt = materializeSerializedSubtree(snapshot, (kind) => {
    switch (kind) {
      case "mesh":
        return new THREE.Mesh();
      case "group":
      default:
        return new THREE.Group();
    }
  });

  assert(rebuilt.uuid === "group-1", "rebuilt subtree should preserve root uuid");
  assert(rebuilt.children.length === 1, "rebuilt subtree should preserve children");
  const rebuiltChild = rebuilt.children[0];
  assert(rebuiltChild.uuid === "mesh-1", "rebuilt subtree should preserve child uuid");
  assert(rebuiltChild instanceof THREE.Mesh, "rebuilt subtree should restore mesh child");
  assert(rebuiltChild.material.color.getHexString() === "336699", "rebuilt subtree should restore material");
}

function testRawBufferHelpers() {
  const source = new THREE.BufferGeometry();
  source.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  );
  source.setIndex([0, 1, 2]);

  const snapshot = snapshotRawBufferGeometry(source);
  assert(snapshot !== null, "raw buffer snapshot should exist");

  const rebuilt = buildRawBufferGeometry(snapshot);
  assert(rebuilt.getAttribute("position").count === 3, "rebuilt raw geometry should keep positions");
  assert(rebuilt.getIndex()?.count === 3, "rebuilt raw geometry should keep indices");
  assert(rebuilt.userData.r3eEdited === true, "rebuilt raw geometry should be marked edited");

  const target = new THREE.BufferGeometry();
  applyRawBufferGeometry(target, {
    positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]),
    indices: new Uint32Array([0, 1, 2]),
  });
  assert(target.getAttribute("position").getX(1) === 2, "applied raw geometry should update positions");
  assert(target.getIndex()?.count === 3, "applied raw geometry should update indices");
}

function testBuiltinObjectFactory() {
  const mesh = createBuiltinObject("mesh");
  assert(mesh instanceof THREE.Mesh, "builtin mesh factory should create meshes");
  assert(mesh.name === "Mesh", "builtin mesh factory should set default name");

  const light = createBuiltinObject("directionalLight");
  assert(light instanceof THREE.DirectionalLight, "builtin light factory should create directional lights");
  assert(light.position.x === 5, "builtin light factory should set default position");

  const custom = createObjectForKind("customPanel", {
    createCustomObject: () => {
      const group = new THREE.Group();
      group.name = "CustomPanel";
      return group;
    },
  });
  assert(custom.name === "CustomPanel", "custom object factory should use provided custom creator");
  assert(custom.userData.r3eKind === "customPanel", "custom object factory should stamp custom kind");
}

testGeometryRoundTrip();
testMaterialRoundTrip();
testMaterialSnapshotWithMap();
testLightRoundTrip();
testCameraRoundTrip();
testSubtreeRoundTrip();
testRawBufferHelpers();
testBuiltinObjectFactory();

console.log("serialization round-trip checks passed");
