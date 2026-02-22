import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

type GltfjsxOptions = {
  inputFile: string;
  outputFile?: string;
  transform: boolean;
  instance: boolean;
  instanceAll: boolean;
  types: boolean;
  verbose: boolean;
  draco: boolean;
  shadows: boolean;
  meta: boolean;
  debug: boolean;
  precision?: number;
  root?: string;
  printWidth?: number;
  keepNames: boolean;
  keepGroups: boolean;
  bones: boolean;
  exportDefault: boolean;
  postProcess: boolean;
  autoSave: boolean;
};

const DEFAULT_OPTIONS: GltfjsxOptions = {
  inputFile: "",
  outputFile: "",
  transform: false,
  instance: false,
  instanceAll: false,
  types: true,
  verbose: false,
  draco: false,
  shadows: false,
  meta: false,
  debug: false,
  precision: undefined,
  root: "",
  printWidth: undefined,
  keepNames: false,
  keepGroups: false,
  bones: false,
  exportDefault: false,
  postProcess: true,
  autoSave: false,
};

const CHANNEL_NAME = "gltfjsx";
const EXTENSION_MESSAGE = {
  ready: "gltfjsx:ready",
  run: "gltfjsx:run",
  browseInput: "gltfjsx:browseInput",
  browseOutput: "gltfjsx:browseOutput",
  loadedState: "gltfjsx:loadedState",
  saveState: "gltfjsx:saveState",
} as const;

type WebviewMessage =
  | { type: typeof EXTENSION_MESSAGE.ready }
  | { type: typeof EXTENSION_MESSAGE.run; payload: GltfjsxOptions }
  | { type: typeof EXTENSION_MESSAGE.browseInput }
  | { type: typeof EXTENSION_MESSAGE.browseOutput }
  | { type: typeof EXTENSION_MESSAGE.saveState; payload: GltfjsxOptions }
  | { type: "gltfjsx:openOutput"; payload: { path: string } };

type WebviewResponse =
  | { type: "gltfjsx:state"; payload: GltfjsxOptions }
  | { type: "gltfjsx:patch"; payload: Partial<GltfjsxOptions> }
  | {
      type: "gltfjsx:result";
      payload: { success: boolean; stdout: string; stderr: string; command: string };
    }
  | { type: "gltfjsx:error"; payload: { message: string } };

const getWorkspaceRoot = () => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  return folders[0].uri.fsPath;
};

const buildCommandArgs = (options: GltfjsxOptions) => {
  const args: string[] = ["gltfjsx"];

  if (options.inputFile) {
    args.push(options.inputFile);
  }

  if (options.transform) args.push("--transform");
  if (options.instance) args.push("--instance");
  if (options.instanceAll) args.push("--instanceall");
  if (options.types) args.push("--types");
  if (options.verbose) args.push("--verbose");
  if (options.draco) args.push("--draco");
  if (options.shadows) args.push("--shadows");
  if (options.meta) args.push("--meta");
  if (options.debug) args.push("--debug");
  if (options.keepNames) args.push("--keepnames");
  if (options.keepGroups) args.push("--keepgroups");
  if (options.bones) args.push("--bones");
  if (options.exportDefault) args.push("--exportdefault");

  if (options.precision !== undefined) {
    args.push("--precision", String(options.precision));
  }
  if (options.root) {
    args.push("--root", options.root);
  }
  if (options.printWidth !== undefined) {
    args.push("--printwidth", String(options.printWidth));
  }

  if (options.outputFile) {
    args.push("--output", options.outputFile);
  }

  return args;
};

const buildCommandString = (command: string, args: string[]) => {
  const parts = [command, ...args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg))];
  return parts.join(" ");
};

const _resolveWebviewAsset = (
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  assetPath: string,
) => {
  const assetUri = vscode.Uri.joinPath(extensionUri, "dist-webview", assetPath);
  return webview.asWebviewUri(assetUri);
};

const getWebviewHtml = (webview: vscode.Webview, extensionUri: vscode.Uri) => {
  const indexPath = vscode.Uri.joinPath(extensionUri, "dist-webview", "index.html");
  const html = fs.readFileSync(indexPath.fsPath, "utf8");

  const baseUri = vscode.Uri.joinPath(extensionUri, "dist-webview");
  const baseWebviewUri = webview.asWebviewUri(baseUri);

  return html
    .replace(/\s?href="\.\//g, ` href="${baseWebviewUri.toString()}/`)
    .replace(/\s?src="\.\//g, ` src="${baseWebviewUri.toString()}/`)
    .replace(/<base href="\.\//g, `<base href="${baseWebviewUri.toString()}/`);
};

class GltfjsxViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gltfjsx.sidePanel";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist-webview")],
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);
    this.attachMessageHandler(webviewView.webview);
  }

  public show() {
    this.view?.show?.(true);
  }

  private attachMessageHandler(webview: vscode.Webview) {
    const stateKey = "gltfjsx.state";
    webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        return;
      }

      if (message.type === EXTENSION_MESSAGE.ready) {
        const saved = this.context.workspaceState.get<GltfjsxOptions>(stateKey, DEFAULT_OPTIONS);
        webview.postMessage({ type: "gltfjsx:state", payload: saved } satisfies WebviewResponse);
        return;
      }

      if (message.type === EXTENSION_MESSAGE.saveState) {
        this.context.workspaceState.update(stateKey, message.payload);
        return;
      }

      if (
        message.type === EXTENSION_MESSAGE.browseInput ||
        message.type === EXTENSION_MESSAGE.browseOutput
      ) {
        const filters: Record<string, string[]> = {
          "3D Models": ["glb", "gltf"],
          "TypeScript/JSX": ["tsx", "ts", "jsx", "js"],
        };
        const mode = message.type === EXTENSION_MESSAGE.browseInput ? "input" : "output";
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri: vscode.Uri.file(workspaceRoot),
          filters:
            mode === "input"
              ? { "3D Models": filters["3D Models"] }
              : { "TypeScript/JSX": filters["TypeScript/JSX"] },
        });
        if (picked && picked[0]) {
          const relative = path.relative(workspaceRoot, picked[0].fsPath);
          webview.postMessage({
            type: "gltfjsx:patch",
            payload: mode === "input" ? { inputFile: relative } : { outputFile: relative },
          } satisfies WebviewResponse);
        }
        return;
      }

      if (message.type === EXTENSION_MESSAGE.run) {
        const options = message.payload;
        if (!options.inputFile) {
          webview.postMessage({
            type: "gltfjsx:error",
            payload: { message: "Input file is required." },
          } satisfies WebviewResponse);
          return;
        }

        this.channel.show(true);
        const result = await runGltfjsx(workspaceRoot, options, this.channel);

        if (options.postProcess && options.outputFile) {
          const post = await runPostProcess(
            workspaceRoot,
            options.outputFile,
            this.channel,
            this.extensionUri,
            options.root,
          );
          if (!post.success) {
            webview.postMessage({
              type: "gltfjsx:result",
              payload: {
                success: false,
                stdout: `${result.stdout}\n${post.stdout}`,
                stderr: `${result.stderr}\n${post.stderr}`,
                command: `${result.command}\n${post.command}`,
              },
            } satisfies WebviewResponse);
            return;
          }
        }

        webview.postMessage({
          type: "gltfjsx:result",
          payload: result,
        } satisfies WebviewResponse);
      }

      if (message.type === "gltfjsx:openOutput") {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
          return;
        }
        const targetPath = path.isAbsolute(message.payload.path)
          ? message.payload.path
          : path.join(workspaceRoot, message.payload.path);
        if (fs.existsSync(targetPath)) {
          const document = await vscode.workspace.openTextDocument(targetPath);
          await vscode.window.showTextDocument(document, { preview: false });
        } else {
          vscode.window.showErrorMessage("Generated file not found.");
        }
      }
    });
  }
}

const getTransformedFileName = (inputFile: string) => {
  const extension = path.extname(inputFile);
  const base = path.basename(inputFile, extension);
  return `${base}-transformed${extension}`;
};

const findTransformedFile = (candidates: string[]) => {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && "code" in error;
};

const moveFile = async (fromPath: string, toPath: string) => {
  if (fromPath === toPath) {
    return;
  }

  if (!fs.existsSync(fromPath)) {
    return;
  }

  if (fs.existsSync(toPath)) {
    await fs.promises.unlink(toPath);
  }

  try {
    await fs.promises.rename(fromPath, toPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "EXDEV") {
      await fs.promises.copyFile(fromPath, toPath);
      await fs.promises.unlink(fromPath);
      return;
    }
    throw error;
  }
};

const runGltfjsx = async (
  workspaceRoot: string,
  options: GltfjsxOptions,
  channel: vscode.OutputChannel,
) => {
  return new Promise<{ success: boolean; stdout: string; stderr: string; command: string }>(
    (resolve) => {
      const resolvedInputFile = path.isAbsolute(options.inputFile)
        ? options.inputFile
        : path.resolve(workspaceRoot, options.inputFile);
      const resolvedOutputFile = options.outputFile
        ? path.isAbsolute(options.outputFile)
          ? options.outputFile
          : path.resolve(workspaceRoot, options.outputFile)
        : undefined;
      const commandOptions = {
        ...options,
        inputFile: resolvedInputFile,
        outputFile: resolvedOutputFile,
      };
      const args = buildCommandArgs(commandOptions);
      const isWindows = process.platform === "win32";
      const npxCommandString = buildCommandString("npx", args);
      const command = isWindows ? "cmd.exe" : "npx";
      const spawnArgs = isWindows ? ["/d", "/s", "/c", npxCommandString] : args;
      const commandString = isWindows ? `cmd.exe /d /s /c ${npxCommandString}` : npxCommandString;
      const runCwd = workspaceRoot;

      channel.appendLine(`\n${commandString}`);
      const child = spawn(command, spawnArgs, {
        cwd: runCwd,
        shell: false,
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        channel.append(text);
      });

      child.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        channel.append(text);
      });

      child.on("error", (error) => {
        channel.appendLine(`\n[error] ${error.message}`);
        resolve({
          success: false,
          stdout,
          stderr: stderr || error.message,
          command: commandString,
        });
      });

      child.on("close", async (code) => {
        const success = code === 0;
        if (success && options.transform) {
          const transformedName = getTransformedFileName(resolvedInputFile);
          const inputDir = path.dirname(resolvedInputFile);
          const outputDir = resolvedOutputFile ? path.dirname(resolvedOutputFile) : undefined;
          const candidates = [
            outputDir ? path.join(outputDir, transformedName) : undefined,
            path.join(runCwd, transformedName),
            path.join(inputDir, transformedName),
          ].filter((value): value is string => Boolean(value));
          const sourcePath = findTransformedFile(candidates);
          const targetPath = path.join(inputDir, transformedName);

          if (sourcePath && sourcePath !== targetPath) {
            try {
              await moveFile(sourcePath, targetPath);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              channel.appendLine(`\n[transform] Failed to move transformed file: ${message}`);
            }
          }
        }

        resolve({
          success,
          stdout,
          stderr,
          command: commandString,
        });
      });
    },
  );
};

const runPostProcess = async (
  workspaceRoot: string,
  outputFile: string,
  channel: vscode.OutputChannel,
  extensionUri: vscode.Uri,
  rootPath: string | undefined,
) => {
  const scriptPath = path.join(
    workspaceRoot,
    "tools",
    "gltfjsx-vscode",
    "scripts",
    "fix-gltfjsx.mjs",
  );
  const fallbackPath = vscode.Uri.joinPath(extensionUri, "scripts", "fix-gltfjsx.mjs").fsPath;
  const resolvedScriptPath = fs.existsSync(scriptPath) ? scriptPath : fallbackPath;
  if (!fs.existsSync(resolvedScriptPath)) {
    channel.appendLine("[postprocess] fix-gltfjsx.mjs not found, skipping.");
    return {
      success: false,
      stdout: "",
      stderr: "fix-gltfjsx.mjs not found",
      command: "",
    };
  }

  const resolvedOutputFile = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(workspaceRoot, outputFile);

  return new Promise<{ success: boolean; stdout: string; stderr: string; command: string }>(
    (resolve) => {
      const command = process.execPath;
      const rootArg = rootPath ? ["--root", rootPath] : [];
      const args = [resolvedScriptPath, resolvedOutputFile, ...rootArg];
      const commandString = buildCommandString(command, args);
      channel.appendLine(`\n${commandString}`);

      const child = spawn(command, args, { cwd: workspaceRoot, shell: false });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        channel.append(text);
      });

      child.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        channel.append(text);
      });

      child.on("error", (error) => {
        channel.appendLine(`\n[postprocess error] ${error.message}`);
        resolve({
          success: false,
          stdout,
          stderr: stderr || error.message,
          command: commandString,
        });
      });

      child.on("close", (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          command: commandString,
        });
      });
    },
  );
};

export const activate = (context: vscode.ExtensionContext) => {
  const channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  const viewProvider = new GltfjsxViewProvider(context.extensionUri, context, channel);

  const registerView = vscode.window.registerWebviewViewProvider(
    GltfjsxViewProvider.viewType,
    viewProvider,
  );

  const command = vscode.commands.registerCommand("gltfjsx.open", () => {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage("Open a workspace folder to use gltfjsx UI.");
      return;
    }

    viewProvider.show();
  });

  context.subscriptions.push(command, registerView, channel);
};

export const deactivate = () => {};
