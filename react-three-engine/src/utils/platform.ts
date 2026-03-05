// Track physical key state — metaKey/ctrlKey can be absent in pointer events on macOS
let _modKeyHeld = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Control" || e.key === "Meta") _modKeyHeld = true;
  }, { capture: true });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Control" || e.key === "Meta") _modKeyHeld = false;
  }, { capture: true });
  window.addEventListener("blur", () => { _modKeyHeld = false; }, { capture: true });
}

export const isModKey = (e: { ctrlKey: boolean; metaKey: boolean }) =>
  e.ctrlKey || e.metaKey || _modKeyHeld;
