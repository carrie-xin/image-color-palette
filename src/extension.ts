// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// 支持的图片扩展名
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

/**
 * 激活扩展入口
 * @param {vscode.ExtensionContext} context 扩展上下文
 * @return {void} 无返回
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "image-color-palette" is now active!');

  // hello world 示例命令
  const disposable = vscode.commands.registerCommand('image-color-palette.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from image-color-palette!');
  });
  context.subscriptions.push(disposable);

  // 生成图片色卡命令
  const genPalette = vscode.commands.registerCommand('image-color-palette.generatePalette', async (resource: vscode.Uri) => {
    try {
      const target = await ensureTargetImage(resource);
      if (!target) { return; }

      openPaletteWebview(context, target);
    } catch (err: any) {
      vscode.window.showErrorMessage(`生成图片色卡失败: ${err?.message || String(err)}`);
    }
  });
  context.subscriptions.push(genPalette);
}

/**
 * 校验并获取目标图片 URI
 * @param {vscode.Uri | undefined} resource 资源管理器传入的文件 URI
 * @return {Promise<vscode.Uri | undefined>} 校验后的图片 URI
 */
async function ensureTargetImage(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
	// 如果没有传入，从活动编辑器获取
	let uri = resource;
	if (!uri) {
		uri = vscode.window.activeTextEditor?.document.uri;
	}
	if (!uri) {
		vscode.window.showWarningMessage('请在资源管理器中选择一张图片，或右键图片使用“生成图片色卡”。');
		return undefined;
	}

	const ext = uri.path.substring(uri.path.lastIndexOf('.')).toLowerCase();
	if (!IMAGE_EXTS.includes(ext)) {
		vscode.window.showWarningMessage('仅支持图片文件：png/jpg/jpeg/gif/webp/bmp/svg');
		return undefined;
	}
	return uri;
}

/**
 * 打开 Webview 面板并注入 UI 与脚本
 * @param {vscode.ExtensionContext} context 扩展上下文
 * @param {vscode.Uri} imgUri 目标图片 URI
 * @return {void} 无返回
 */
function openPaletteWebview(context: vscode.ExtensionContext, imgUri: vscode.Uri): void {
  // 创建并显示webview面板
  const panel = vscode.window.createWebviewPanel(
    'imageColorPalette',
    '图片色卡',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  // 处理webview消息
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'copy':
          vscode.env.clipboard.writeText(message.hex);
          vscode.window.showInformationMessage(`已复制色号: ${message.hex}`);
          break;
        case 'copyAll':
          vscode.env.clipboard.writeText(message.colors.join('\n'));
          vscode.window.showInformationMessage(`已复制${message.colors.length}个色号`);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  // 获取webview内容
  const imageUri = panel.webview.asWebviewUri(imgUri);
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'paletteView.js')
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'palette.css')
  );

  panel.webview.html = getWebviewHtml(imageUri.toString(), scriptUri.toString(), styleUri.toString());
}

/**
 * 生成 webview HTML
 * @param {string} imgSrc 图片 webview 可访问的 URL
 * @param {string} scriptUri 脚本 URL
 * @param {string} styleUri 样式 URL
 * @return {string} HTML 字符串
 */
function getWebviewHtml(imgSrc: string, scriptUri: string, styleUri: string): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" href="${styleUri}">
<title>图片色卡</title>
</head>
<body>
  <div id="app">
    <div class="image-wrap"><img id="sourceImage" src="${imgSrc}" alt="source"/></div>
    <div id="paletteWrap" class="palette-wrap"></div>
  </div>
  <script>window.__VSC__ = acquireVsCodeApi && acquireVsCodeApi();</script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}
