const { app, BrowserWindow } = require('electron');
console.log('electron api', !!app);
app.whenReady().then(async () => {
  console.log('ready');
  const win = new BrowserWindow({ width: 760, height: 300, show: true });
  await win.loadFile('/tmp/repro.html');
  console.log('loaded');
  await new Promise(r => setTimeout(r, 500));
  const boxes = await win.webContents.executeJavaScript(`(() => {
    const r = (s) => { const el = document.querySelector(s); if(!el) return null; const b = el.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right}; };
    return { card: r('.online-playlist-head'), actions: r('.online-playlist-head__actions'), dark: r('.button--dark'), scrollW: document.documentElement.scrollWidth, dpr: devicePixelRatio };
  })()`);
  console.log(JSON.stringify(boxes, null, 2));
  const img = await win.webContents.capturePage();
  require('fs').writeFileSync('/tmp/repro.png', img.toPNG());
  console.log('shot saved');
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });
