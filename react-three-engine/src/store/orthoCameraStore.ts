export type OrthoAxis = "x" | "y" | "z";

const sharedTarget = { x: 0, y: 0, z: 0 };

type Listener = (target: Readonly<{ x: number; y: number; z: number }>, source: string) => void;
const listeners = new Set<Listener>();

export function subscribeOrthoTarget(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateOrthoTarget(
  axes: OrthoAxis[],
  values: { x?: number; y?: number; z?: number },
  source: string,
): void {
  let changed = false;
  for (const axis of axes) {
    const v = values[axis];
    if (v !== undefined && sharedTarget[axis] !== v) {
      sharedTarget[axis] = v;
      changed = true;
    }
  }
  if (changed) {
    for (const fn of listeners) fn(sharedTarget, source);
  }
}

export function getOrthoTarget(): Readonly<{ x: number; y: number; z: number }> {
  return sharedTarget;
}
