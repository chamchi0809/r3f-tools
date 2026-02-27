import { Sprite2D } from "three-flatland";

/** Factory that creates a visible Sprite2D placeholder (no texture yet). */
export default function createSprite2D(): Sprite2D {
  const sprite = new Sprite2D();
  // Sprite2D starts invisible until a texture is set; make it visible in the editor
  // so it can be selected and have a texture assigned via the Inspector.
  sprite.visible = true;
  return sprite;
}
