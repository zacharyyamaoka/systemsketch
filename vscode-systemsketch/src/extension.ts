import * as vscode from 'vscode'
import { readFileSync } from 'node:fs'
import {
  createCompatibilityCopyText,
  documentSuffix,
  documentTitle,
  newerDocumentVersion,
  SYSTEMSKETCH_SUFFIX,
  type EmbedToHostMessage,
  type HostToEmbedMessage,
} from '../../src/embed/sharedWithHost'
import { CanvasCheckpointStore } from './checkpointStore'
import { enqueueSessionWrite } from './sessionWriteQueue'

const VIEW_TYPE = 'systemsketch.editor'

/**
 * SystemSketch as a VS Code / Cursor editor.
 *
 * The extension is deliberately thin. It does not know what a Block is, what a
 * cable is, or how a board is drawn — it opens the file the IDE gave it, hands
 * the text to a webview running a real SystemSketch build, and writes back
 * whatever the canvas returns. Everything a person can do to a board is a
 * property of the app, so an extension that stays this small cannot fall
 * behind it.
 *
 * File management is the IDE's, on purpose. There is no New, no Open, no Save
 * As and no recents here: the tree on the left already does all four, better,
 * and a second file manager inside an editor pane would only be a place for
 * the two to disagree.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new SystemSketchEditorProvider(context), {
      // Recovery intentionally has one durable checkpoint per document URI.
      // Keep one canvas owner for that URI; source + canvas side-by-side still
      // works, while two canvases cannot race to replace each other's recovery.
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('systemsketch.openSource', (resource?: vscode.Uri) =>
      openWith(resource, 'default', vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('systemsketch.openCanvas', (resource?: vscode.Uri) =>
      openWith(resource, VIEW_TYPE, vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('systemsketch.openSourceToSide', (resource?: vscode.Uri) =>
      openWith(resource, 'default', vscode.ViewColumn.Beside)),
    vscode.commands.registerCommand('systemsketch.openCanvasToSide', (resource?: vscode.Uri) =>
      openWith(resource, VIEW_TYPE, vscode.ViewColumn.Beside)),
    vscode.commands.registerCommand('systemsketch.showBuild', () => showBundledBuild(context)),
  )
}

export function deactivate(): void {
  // VS Code owns every disposable registered above.
}

/** What `scripts/stage_app.mjs` recorded about the app build being shipped. */
interface StagedApp {
  stableBuild: string | null
  version: string | null
  releasedAt: string | null
  channel: 'stable' | 'development'
  matchesStable: boolean
}

function stagedApp(context: vscode.ExtensionContext): StagedApp | null {
  try {
    const path = vscode.Uri.joinPath(context.extensionUri, 'dist', 'app', 'app.json')
    return JSON.parse(readFileSync(path.fsPath, 'utf8')) as StagedApp
  } catch {
    return null
  }
}

async function showBundledBuild(context: vscode.ExtensionContext): Promise<void> {
  const app = stagedApp(context)
  if (!app) {
    await vscode.window.showWarningMessage('SystemSketch: no app build is staged in this extension.')
    return
  }
  const channel = app.channel === 'stable'
    ? `Stable ${app.stableBuild} (${app.version ?? 'unversioned'})`
    : 'a development build — not the published Stable release'
  await vscode.window.showInformationMessage(`SystemSketch canvas: ${channel}.`)
}

class SystemSketchEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly checkpoints: CanvasCheckpointStore

  constructor(private readonly context: vscode.ExtensionContext) {
    this.checkpoints = new CanvasCheckpointStore(context.globalStorageUri.fsPath)
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const appRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'app')
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }
    panel.webview.html = this.webviewHtml(panel.webview, appRoot)

    let disposed = false
    /** Text this extension itself wrote, so its echo is not read as an edit. */
    let expectedText: string | null = null
    let writes = Promise.resolve()
    const sourceUri = document.uri.toString()
    let session = createNonce()

    const post = (message: HostToEmbedMessage): Thenable<boolean> =>
      (disposed ? Promise.resolve(false) : panel.webview.postMessage(message))

    const reportCheckpointError = (cause: unknown): void => {
      void post({
        type: 'host-error',
        message: cause instanceof Error ? cause.message : 'Could not retain the canvas checkpoint',
        retryable: false,
      })
    }
    const clearCheckpoint = (checkpointSession = session): void => {
      try {
        // Multiple canvas panes may share one TextDocument. Only the pane that
        // owns the stored checkpoint may discard it: another pane also sees
        // this document event, but its panel-local `expectedText` cannot tell
        // that the write originated next door.
        this.checkpoints.clear(sourceUri, checkpointSession)
      } catch (cause) {
        reportCheckpointError(cause)
      }
    }
    const settleCheckpoint = (
      checkpointSession: string,
      revision: number,
      sourceText: string,
    ): void => {
      try {
        this.checkpoints.settle(sourceUri, checkpointSession, revision, sourceText)
      } catch (cause) {
        reportCheckpointError(cause)
      }
    }

    const open = (): void => {
      let recovery: { snapshot: unknown } | null = null
      try {
        recovery = this.checkpoints.adopt(sourceUri, document.getText(), session)
      } catch (cause) {
        reportCheckpointError(cause)
      }
      void post({
        type: 'open',
        path: document.uri.fsPath,
        text: document.getText(),
        version: document.version,
        readOnly: isReadOnly(document.uri),
        session,
        recovery: recovery ? { snapshot: recovery.snapshot } : undefined,
      })
      void post({ type: 'appearance', colorScheme: currentColorScheme() })
    }

    const documentChanges = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return
      const text = event.document.getText()
      if (expectedText !== null && text === expectedText) {
        expectedText = null
        void post({ type: 'accepted', version: event.document.version })
        return
      }
      // Someone else moved the file: the JSON was hand-edited, a generator
      // rewrote it, or a branch changed under the open tab. The canvas reloads.
      expectedText = null
      clearCheckpoint()
      session = createNonce()
      void post({
        type: 'external-change',
        text,
        version: event.document.version,
        session,
        reason: 'source-edit',
      })
    })

    const themeChanges = vscode.window.onDidChangeActiveColorTheme(() => {
      void post({ type: 'appearance', colorScheme: currentColorScheme() })
    })

    const messages = panel.webview.onDidReceiveMessage((raw: EmbedToHostMessage) => {
      if (typeof raw !== 'object' || raw === null) return
      if (raw.type === 'ready') {
        open()
        return
      }
      if (raw.type === 'embed-error') {
        void vscode.window.showErrorMessage(`SystemSketch: ${raw.message}`)
        return
      }
      if (raw.type === 'checkpoint') {
        if (isReadOnly(document.uri) || raw.session !== session) return
        try {
          this.checkpoints.save(
            sourceUri,
            document.getText(),
            session,
            raw.revision,
            raw.snapshot,
          )
        } catch (cause) {
          reportCheckpointError(cause)
        }
        return
      }
      if (raw.type === 'checkpoint-settled') {
        if (raw.session !== session) return
        settleCheckpoint(session, raw.revision, document.getText())
        return
      }
      if (raw.type === 'request-compatible-copy') {
        if (raw.session !== session || raw.baseVersion !== document.version) return
        const source = document.getText()
        if (!newerDocumentVersion(document.uri.fsPath, source)) return
        const requestedSession = raw.session
        const requestedVersion = raw.baseVersion
        void createCompatibilityCopy(document.uri, source, () => (
          session === requestedSession
          && document.version === requestedVersion
          && document.getText() === source
          && newerDocumentVersion(document.uri.fsPath, document.getText()) !== null
        )).catch(async (cause: unknown) => {
          await post({
            type: 'host-error',
            message: cause instanceof Error ? cause.message : 'Could not create the editable copy',
            retryable: false,
          })
        })
        return
      }
      if (raw.type !== 'change' || isReadOnly(document.uri) || raw.session !== session) return

      writes = enqueueSessionWrite(writes, raw.session, () => session, async () => {
        if (raw.session !== session) return
        // The canvas edited a version of the file that no longer exists. Do not
        // resolve that by preferring one side: hand the newer document back and
        // let the board be redrawn from what is actually there.
        if (raw.baseVersion !== document.version) {
          clearCheckpoint(raw.session)
          session = createNonce()
          await post({
            type: 'external-change',
            text: document.getText(),
            version: document.version,
            session,
            reason: 'stale-change',
          })
          return
        }
        if (raw.text === document.getText()) {
          settleCheckpoint(
            raw.session,
            raw.checkpointRevision,
            raw.text,
          )
          await post({ type: 'accepted', version: document.version })
          return
        }
        expectedText = raw.text
        const replaced = await replaceDocumentText(document, raw.text)
        if (raw.session !== session) return
        if (replaced) {
          settleCheckpoint(
            raw.session,
            raw.checkpointRevision,
            raw.text,
          )
          return
        }

        expectedText = null
        await post({
          type: 'host-error',
          message: 'The editor could not apply this canvas edit. Retry to keep the live board.',
        })
      }).catch(async (cause: unknown) => {
        if (raw.session !== session) return
        expectedText = null
        await post({
          type: 'host-error',
          message: cause instanceof Error ? cause.message : 'Unknown editor failure',
        })
      })
    })

    panel.onDidDispose(() => {
      disposed = true
      messages.dispose()
      themeChanges.dispose()
      documentChanges.dispose()
    })
  }

  /**
   * The staged app's own `index.html`, served as the webview's document.
   *
   * Only three things are added to it: a `<base>` so the relative asset URLs
   * vite emitted resolve inside the extension, a strict CSP with a per-panel
   * nonce, and the host bridge — installed *before* the app bundle runs, which
   * is what lets `App.tsx` decide it is embedded on its very first render
   * rather than mounting the workspace app and then tearing it down.
   */
  private webviewHtml(webview: vscode.Webview, appRoot: vscode.Uri): string {
    const base = `${webview.asWebviewUri(appRoot)}/`
    const nonce = createNonce()
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data: blob:`,
      `font-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `connect-src ${webview.cspSource} data: blob:`,
      'worker-src blob:',
    ].join('; ')
    const bridge = `<script nonce="${nonce}">
      const api = acquireVsCodeApi();
      window.__systemSketchEmbedHost = { host: 'vscode', post: (message) => api.postMessage(message) };
    </script>`

    let html: string
    try {
      html = readFileSync(vscode.Uri.joinPath(appRoot, 'index.html').fsPath, 'utf8')
    } catch {
      return `<!doctype html><html><body style="font:13px system-ui;padding:24px">
        <h2>SystemSketch is not staged</h2>
        <p>Run <code>npm run build</code> in <code>vscode-systemsketch/</code> to stage the app.</p>
      </body></html>`
    }

    return html
      .replace(
        '<head>',
        `<head>\n    <base href="${base}">\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
      )
      // Vite emits a bare module script and a stylesheet; both need the nonce,
      // and `crossorigin` must go because a webview URI is a different origin
      // from the document and there is no CORS header to satisfy it.
      .replace(/<script /g, `<script nonce="${nonce}" `)
      .replace(/ crossorigin/g, '')
      .replace('</head>', `${bridge}\n  </head>`)
  }
}

async function createCompatibilityCopy(
  sourceUri: vscode.Uri,
  source: string,
  isStillCurrent: () => boolean,
): Promise<void> {
  const stem = documentTitle(sourceUri.path)
  const slash = sourceUri.path.lastIndexOf('/')
  const defaultUri = sourceUri.with({
    path: `${sourceUri.path.slice(0, slash + 1)}${stem} compatible copy.systemsketch`,
  })
  const destination = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'SystemSketch document': ['systemsketch'] },
    saveLabel: 'Create editable copy',
    title: 'Create an editable current-format copy',
  })
  if (!destination) return
  if (documentSuffix(destination.path) !== SYSTEMSKETCH_SUFFIX) {
    throw new Error('An editable compatibility copy must end with .systemsketch')
  }
  if (!isStillCurrent()) {
    throw new Error('The source file changed while the copy dialog was open. Try again from the latest version.')
  }
  const copy = createCompatibilityCopyText(destination.fsPath, source)
  await vscode.workspace.fs.writeFile(destination, Buffer.from(copy, 'utf8'))
  await vscode.commands.executeCommand(
    'vscode.openWith',
    destination,
    VIEW_TYPE,
    vscode.ViewColumn.Active,
  )
}

function currentColorScheme(): 'light' | 'dark' {
  const kind = vscode.window.activeColorTheme.kind
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    ? 'dark'
    : 'light'
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit()
  const end = document.lineAt(document.lineCount - 1).range.end
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), end), text)
  return vscode.workspace.applyEdit(edit)
}

function activeResource(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) return input.uri
  return vscode.window.activeTextEditor?.document.uri
}

async function openWith(
  resource: vscode.Uri | undefined,
  editorId: string,
  column: vscode.ViewColumn,
): Promise<void> {
  const uri = resource instanceof vscode.Uri ? resource : activeResource()
  if (!uri) {
    await vscode.window.showInformationMessage('Open a .systemsketch or .tldr file first.')
    return
  }
  if (documentSuffix(uri.path) === null) {
    await vscode.window.showInformationMessage(
      `SystemSketch does not open ${documentTitle(uri.path)}; it reads .systemsketch and .tldr.`,
    )
    return
  }
  await vscode.commands.executeCommand('vscode.openWith', uri, editorId, column)
}

/** A revision opened from source control is a view of history, not a board to edit. */
function isReadOnly(uri: vscode.Uri): boolean {
  return uri.scheme === 'git' || uri.scheme === 'vscode-scm' || uri.scheme === 'conflictResolution'
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''
  for (let index = 0; index < 32; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return value
}
