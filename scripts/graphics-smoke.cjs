const {_electron: electron}=require('playwright-core');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),home=fs.mkdtempSync(path.join(os.tmpdir(),'potato-graphics-'));
 const env={...process.env,POTATOMUSIC_HOME:home,POTATO_HIDDEN:'1',POTATO_ALLOW_SECOND_INSTANCE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env});
 try {
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('.sidebar',{timeout:30000});
 await page.evaluate(()=>{localStorage.setItem('potato:appearance:v1',JSON.stringify({style:'classic',language:'en'}));localStorage.setItem('potato:theme','light')});
 await page.reload();await page.waitForSelector('.hero',{timeout:30000});
 await page.waitForFunction(()=>document.querySelector('.ambient__art')?.style.backgroundImage.includes('data:image/jpeg'));
 const read=()=>page.evaluate(()=>({prefs:JSON.parse(localStorage.getItem('potato:appearance:v1')||'{}'),blur:getComputedStyle(document.querySelector('.page-shell')).backdropFilter,searchBlur:getComputedStyle(document.querySelector('.topbar__search')).backdropFilter,background:!!document.querySelector('.ambient__art'),animation:document.documentElement.dataset.animation}));
 assert.equal((await read()).blur,'blur(20px) saturate(1.4)');
 assert.equal((await read()).searchBlur,'none');
 await page.locator('.topbar-avatar').click();await page.waitForSelector('.settings-page');assert.equal(await page.locator('[role="dialog"]').count(),0);
 await page.screenshot({path:path.join(root,'dist','settings-page.png')});
 const open=async()=>{await page.getByRole('button',{name:'Personalization',exact:true}).click();await page.waitForSelector('.personalization-dialog');await page.waitForTimeout(350)};
 await open();
 const rendering=page.getByRole('group',{name:'Rendering presets'}),animation=page.getByRole('group',{name:'Animation level'});
 await animation.getByRole('button',{name:'Off',exact:true}).click();
 for(const label of ['Light','Full','Balanced']) {
   await rendering.getByRole('button',{name:new RegExp('^'+label)}).click();
   const state=await read();assert.equal(state.animation,'off');
   assert.equal(state.blur,label==='Light'?'none':`blur(${label==='Full'?38:20}px) saturate(1.4)`);
   console.log('[graphics]',label, await page.evaluate(()=>Array.from(document.querySelectorAll('.app *')).filter(el=>getComputedStyle(el).backdropFilter!=='none').length),'backdrop-filter surfaces');
   if(label==='Light') {await page.waitForSelector('.ambient__art',{state:'detached'});assert.equal(state.searchBlur,'none')}
 }
 await page.getByLabel('Glass blur',{exact:true}).fill('12');
 await page.getByLabel('Glass blur',{exact:true}).dispatchEvent('input');
 assert.equal((await read()).prefs.graphics.glassBlur,12);
 await animation.getByRole('button',{name:'Full',exact:true}).click();assert.equal((await read()).prefs.graphics.glassBlur,12);
 await page.getByLabel('Control blur',{exact:false}).check();
 await page.getByLabel('Backdrop detail',{exact:true}).selectOption('high');
 await page.getByLabel('Depth shadows',{exact:false}).uncheck();
 await page.screenshot({path:path.join(root,'dist','personalization.png')});
 await page.keyboard.press('Escape');await page.waitForSelector('.personalization-dialog',{state:'detached'});assert.equal(await page.locator('.settings-page').count(),1);
 await page.reload();await page.waitForSelector('.sidebar');
 const saved=await read();assert.equal(saved.prefs.graphics.glassBlur,12);assert.equal(saved.prefs.graphics.controlBlur,true);assert.equal(saved.prefs.graphics.shadows,false);assert.equal(saved.prefs.graphics.backgroundDetail,'high');assert.equal(saved.prefs.animationLevel,'full');
 await page.locator('.brand--toggle').click();await page.waitForSelector('.app.brief');
 await page.locator('.brief-dock').getByRole('button',{name:'Open settings',exact:true}).click();await open();
 await page.screenshot({path:path.join(root,'dist','personalization-brief.png')});
 await page.keyboard.press('Escape');await page.waitForSelector('.personalization-dialog',{state:'detached'});
 assert.deepEqual(errors,[]);console.log('[graphics] migration, raster backdrop, independent presets, custom controls, persistence, Escape and Brief settings passed');
 } finally {await app.close();fs.rmSync(home,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exit(1)});
