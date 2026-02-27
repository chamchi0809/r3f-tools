declare module "virtual:react-three-engine/config" {
  export const editorConfig: {
    savePath: string | null;
    apiBase: string;
    prefabUrls: Record<string, string> | null;
    publicDir: string | null;
  };
}

declare module "virtual:react-three-engine/objects" {
  import type { CustomObjectEntry } from "react-three-engine";
  export const customObjectRegistry: Map<string, CustomObjectEntry>;
}
