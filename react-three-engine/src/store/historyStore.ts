/**
 * historyStore.ts
 *
 * Command-pattern undo/redo system for the scene editor.
 *
 * Design:
 * - Each `SceneCommand` stores only the delta (before/after values), NOT the whole scene.
 * - `execute()` applies the forward change, `undo()` applies the reverse.
 * - The store holds an `undoStack` (past commands) and a `redoStack` (undone commands).
 * - Calling `executeCommand()` clears the redo stack (standard UX).
 * - Commands that are "transparent" (e.g. continuous dragging) can be merged with the
 *   previous command of the same type by setting `mergeKey`.
 */

import { create } from "zustand";

// ─── Command interface ────────────────────────────────────────────────────────

export interface SceneCommand {
  /** Human-readable label shown in the History pane. */
  readonly label: string;
  /**
   * Optional merge key. If two consecutive commands share the same mergeKey,
   * the second one replaces the first (e.g. dragging a number field fires many
   * setTransform calls — we only want one undo step).
   */
  readonly mergeKey?: string;
  /** Apply the command. Called once at creation by executeCommand(). */
  execute(): void;
  /** Reverse the command. */
  undo(): void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 200;

interface HistoryState {
  /** Stack of executed commands (most recent last). */
  undoStack: SceneCommand[];
  /** Stack of undone commands (most recent last). */
  redoStack: SceneCommand[];

  canUndo: boolean;
  canRedo: boolean;

  /**
   * Execute a command and push it onto the undo stack.
   * If `cmd.mergeKey` matches the top of the stack, the top is replaced
   * (the new command already has the latest "before" state baked in).
   */
  executeCommand: (cmd: SceneCommand) => void;
  undo: () => void;
  redo: () => void;
  /** Wipe both stacks (e.g. when loading a new scene). */
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  executeCommand: (cmd) => {
    cmd.execute();
    set((s) => {
      let undoStack = s.undoStack;

      // Merge: replace the top command if it shares the mergeKey
      if (
        cmd.mergeKey &&
        undoStack.length > 0 &&
        undoStack[undoStack.length - 1].mergeKey === cmd.mergeKey
      ) {
        undoStack = [...undoStack.slice(0, -1), cmd];
      } else {
        undoStack = [...undoStack, cmd];
        // Enforce max size
        if (undoStack.length > MAX_HISTORY) {
          undoStack = undoStack.slice(undoStack.length - MAX_HISTORY);
        }
      }

      return {
        undoStack,
        redoStack: [], // any new action clears the redo stack
        canUndo: undoStack.length > 0,
        canRedo: false,
      };
    });
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const cmd = undoStack[undoStack.length - 1];
    cmd.undo();
    set((s) => {
      const newUndo = s.undoStack.slice(0, -1);
      const newRedo = [...s.redoStack, cmd];
      return {
        undoStack: newUndo,
        redoStack: newRedo,
        canUndo: newUndo.length > 0,
        canRedo: newRedo.length > 0,
      };
    });
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const cmd = redoStack[redoStack.length - 1];
    cmd.execute();
    set((s) => {
      const newRedo = s.redoStack.slice(0, -1);
      const newUndo = [...s.undoStack, cmd];
      return {
        undoStack: newUndo,
        redoStack: newRedo,
        canUndo: newUndo.length > 0,
        canRedo: newRedo.length > 0,
      };
    });
  },

  clear: () => set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false }),
}));

// ─── Stable action references ─────────────────────────────────────────────────

export const historyActions = {
  executeCommand: (cmd: SceneCommand) => useHistoryStore.getState().executeCommand(cmd),
  undo: () => useHistoryStore.getState().undo(),
  redo: () => useHistoryStore.getState().redo(),
  clear: () => useHistoryStore.getState().clear(),
};
