import { FieldKey } from "../store";

/**
 * Fields hidden by default. These are generally noisy / rarely-needed properties
 * that clutter the inspector for everyday editing.
 *
 * Edit this list to change what the "Reset to defaults" button restores.
 * Format: "ClassName.propKey" or bare "propKey" (applies across all classes).
 */
export const DEFAULT_HIDDEN_FIELDS: FieldKey[] = [
  // Object3D internals
  "Object3D.uuid",
  "Object3D.id",
  "Object3D.parent",
  "Object3D.children",
  "Object3D.layers",
  "Object3D.matrixWorld",
  "Object3D.matrixWorldNeedsUpdate",
  "Object3D.matrixAutoUpdate",
  "Object3D.renderOrder",
  // Mesh internals
  "Mesh.matrixAutoUpdate",
  "Mesh.matrixWorldAutoUpdate",
  "Mesh.matrixWorldNeedsUpdate",
  "Mesh.renderOrder",
  "Mesh.frustumCulled",
  // PointLight internals
  "PointLight.frustumCulled",
  "PointLight.matrixAutoUpdate",
  "PointLight.matrixWorldAutoUpdate",
  "PointLight.matrixWorldNeedsUpdate",
  "PointLight.renderOrder",
  "PointLight.receiveShadow",
  // Geometry internals
  "BufferGeometry.uuid",
  "BufferGeometry.id",

  // Material internals
  "Material.uuid",
  "Material.id",
  "Material.depthFunc",
  "Material.depthWrite",
  "Material.depthTest",
  "Material.displacementBias",
  "Material.displacementScale",

  // MeshStandardMaterial internals
  "MeshStandardMaterial.colorWrite",
  "MeshStandardMaterial.depthFunc",
  "MeshStandardMaterial.depthWrite",
  "MeshStandardMaterial.depthTest",
  "MeshStandardMaterial.displacementBias",
  "MeshStandardMaterial.displacementScale",
  "MeshStandardMaterial.allowOverride",
  "MeshStandardMaterial.alphaToHash",
  "MeshStandardMaterial.alphaToCoverage",
  "MeshStandardMaterial.name",
  "MeshStandardMaterial.forceSinglePass",
  "MeshStandardMaterial.polygonOffset",
  "MeshStandardMaterial.polygonOffsetFactor",
  "MeshStandardMaterial.polygonOffsetUnits",
  "MeshStandardMaterial.stencilFail",
  "MeshStandardMaterial.stencilFunc",
  "MeshStandardMaterial.stencilFuncMask",
  "MeshStandardMaterial.stencilRef",
  "MeshStandardMaterial.stencilWrite",
  "MeshStandardMaterial.stencilWriteMask",
  "MeshStandardMaterial.stencilZFail",
  "MeshStandardMaterial.stencilZPass",
  "MeshStandardMaterial.version",
  "MeshStandardMaterial.vertexColors",
  "MeshStandardMaterial.visible",
];
