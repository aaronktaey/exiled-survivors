/**
 * Nox Survivors for PC (0.160): the built web game in an Electron window —
 * the Steam build, before Steamworks is wired in.
 *
 * The game is served from app://nox out of ./app (desktop/build.mjs puts the
 * build there), so it works offline and its storage belongs to the app. It
 * calls the live server by its full address, which answers app://nox with
 * CORS — keep SCHEME and HOST in step with CROSS_ORIGINS in server/http.ts.
 * No sign-in yet (the user's pick): records stay on this PC.
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, net, protocol, shell } = require('electron');

const SCHEME = 'app';
const HOST = 'nox';
const ROOT = path.join(__dirname, 'app');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** app://nox/<path> is ./app/<path>; nothing outside it. */
function serve() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (!file.startsWith(ROOT)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function open() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    title: 'Nox Survivors',
    backgroundColor: '#0a0a16',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.removeMenu();
  // Alt+Enter toggles full screen, as games do (F11 is the game's own debug key).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.alt && input.key === 'Enter') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Links out of the game (the privacy policy's mail address, sites in the credits) open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) {
      event.preventDefault();
      if (/^https?:|^mailto:/.test(url)) {
        void shell.openExternal(url);
      }
    }
  });
  void win.loadURL(`${SCHEME}://${HOST}/index.html`);
}

app.whenReady().then(() => {
  serve();
  open();
});
app.on('window-all-closed', () => app.quit());
