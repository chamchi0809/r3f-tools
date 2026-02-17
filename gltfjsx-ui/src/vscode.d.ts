declare module "vscode" {
  export type Thenable<T> = PromiseLike<T>;

  export interface Disposable {
    dispose(): void;
  }

  export interface OutputChannel {
    append(value: string): void;
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
  }

  export interface Uri {
    fsPath: string;
  }

  export namespace Uri {
    function file(path: string): Uri;
    function joinPath(base: Uri, ...pathSegments: string[]): Uri;
  }

  export interface WorkspaceFolder {
    uri: Uri;
  }

  export interface Workspace {
    workspaceFolders?: WorkspaceFolder[];
    openTextDocument(path: string): Thenable<TextDocument>;
  }

  export interface TextDocument {
    uri: Uri;
  }

  export interface Webview {
    html: string;
    onDidReceiveMessage(handler: (message: unknown) => void): Disposable;
    asWebviewUri(uri: Uri): Uri;
    postMessage(message: unknown): Thenable<boolean>;
  }

  export interface WebviewPanel {
    webview: Webview;
  }

  export interface WebviewView {
    webview: Webview;
    show?(preserveFocus?: boolean): void;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void;
  }

  export interface WebviewPanelOptions {
    enableScripts?: boolean;
    localResourceRoots?: Uri[];
  }

  export interface OpenDialogOptions {
    canSelectFiles: boolean;
    canSelectFolders: boolean;
    canSelectMany: boolean;
    defaultUri?: Uri;
    filters?: Record<string, string[]>;
  }

  export interface Window {
    createOutputChannel(name: string): OutputChannel;
    showErrorMessage(message: string): Thenable<string | undefined>;
    createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn,
      options?: WebviewPanelOptions,
    ): WebviewPanel;
    showOpenDialog(options: OpenDialogOptions): Thenable<Uri[] | undefined>;
    showTextDocument(document: TextDocument, options?: { preview?: boolean }): Thenable<void>;
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable;
  }

  export interface Commands {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  }

  export interface Memento {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
    workspaceState: Memento;
    extensionUri: Uri;
  }

  export enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3,
  }

  export const window: Window;
  export const workspace: Workspace;
  export const commands: Commands;
}
