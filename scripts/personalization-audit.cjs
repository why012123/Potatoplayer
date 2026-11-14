// Audit rendered English copy, all text faces, and both corner choices across pages.
const { _electron: electron } = require('playwright-core');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'potato-personalization-'));const music=path.join(home,'music');fs.mkdirSync(music);
 const wav=Buffer.alloc(44+32000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(const name of ['Evening','Morning']){fs.writeFileSync(path.join(music,`Studio - ${name}.wav`),wav);fs.writeFileSync(path.join(music,`Studio - ${name}.lrc`),'[00:00.00]A line of music\n[00:01.00]Another line of music');}
 const env={...process.env,POTATOMUSIC_HOME:home,POTATOMUSIC_LIBRARY:music,POTATOMUSIC_IMPORT_SUPER:'0',POTATO_HIDDEN:'1',POTATO_ALLOW_SECOND_INSTANCE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 let app;const report=[];
 try{
  app=await electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env,timeout:40000});const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.ai-record-card',{timeout:45000});
  await page.evaluate(()=>{localStorage.setItem('potato:appearance:v1',JSON.stringify({language:'en',style:'editorial',display:'serif',corners:'soft',animationLevel:'off'}));localStorage.setItem('potato:theme','light');});await page.reload();await page.waitForSelector('.ai-home-library');
  const check=async(name)=>{
   await page.waitForTimeout(150);
   const findings=await page.evaluate(()=>{
    const text=[],fonts=[],radii=[];const visible=el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
    const walker=document.createTreeWalker(document.querySelector('.app'),NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const n=walker.currentNode,el=n.parentElement,value=n.textContent.trim();if(!value||!visible(el)||el.closest('svg,code,pre,script,style'))continue;
      if(/\p{Script=Han}/u.test(value)&&value!=='中文')text.push({value,tag:el.className});
      const font=getComputedStyle(el).fontFamily;if(!/Iowan|Palatino|Songti/.test(font))fonts.push({value:value.slice(0,50),font,tag:el.className});
    }
    for(const el of document.querySelectorAll('[aria-label],[title],[placeholder]')){if(!visible(el))continue;for(const a of ['aria-label','title','placeholder']){const v=el.getAttribute(a)||'';if(/\p{Script=Han}/u.test(v)&&!['中文','宇多田ヒカル'].includes(v))text.push({attr:a,value:v,tag:el.className});}}
    for(const el of document.querySelectorAll('.app *')){if(!visible(el)||el.matches('.style-preset__art, .ultra-case, .ultra-case__spine, .ultra-case__blank'))continue;const s=getComputedStyle(el),r=el.getBoundingClientRect();if(r.width<24||r.height<24||s.borderTopLeftRadius==='0px'||s.borderTopLeftRadius.includes('%')||parseFloat(s.borderTopLeftRadius)>=r.height/2)continue;
      if(s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.backgroundImage==='none'&&s.borderTopWidth==='0px'&&!el.classList.contains('cover'))continue;
      radii.push({tag:el.tagName,cls:el.className,html:el.outerHTML.slice(0,220),radius:s.borderTopLeftRadius,index:[...document.querySelectorAll('.app *')].indexOf(el)});
    }
    document.documentElement.dataset.corners='crisp';
    const matrix=[];const app=document.querySelector('.app');
    for(const style of ['classic','editorial'])for(const theme of ['light','dark'])for(const face of ['serif','sans']){
      Object.assign(document.documentElement.dataset,{style,theme,display:face});app.classList.toggle('theme-dark',theme==='dark');
      const nodes=document.createTreeWalker(app,NodeFilter.SHOW_TEXT);while(nodes.nextNode()){const el=nodes.currentNode.parentElement,value=nodes.currentNode.textContent.trim();if(!value||!visible(el)||el.closest('svg,code,pre,script,style'))continue;const family=getComputedStyle(el).fontFamily;const serif=/Iowan|Palatino|Songti/.test(family);if(serif!==(face==='serif'))matrix.push({style,theme,face,value:value.slice(0,40),family});}
    }
    Object.assign(document.documentElement.dataset,{style:'editorial',theme:'light',display:'serif'});app.classList.remove('theme-dark');
    const unchanged=radii.filter(item=>{const el=document.querySelectorAll('.app *')[item.index];return el&&getComputedStyle(el).borderTopLeftRadius===item.radius;});
    document.documentElement.dataset.corners='soft';return {text,fonts,matrix,unchanged};
   });
   report.push({name,...findings});fs.writeFileSync('/tmp/potato-personalization-audit.json',JSON.stringify(report,null,2));console.log(name, 'untranslated:',findings.text.length,'font mismatches:',findings.fonts.length,'fixed corners:',findings.unchanged.length);
  };
  const boot=await page.evaluate(()=>window.potato.invoke('bootstrap'));
  await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('backend:event',{event:'scan.done',data}),{...boot,tracks:boot.tracks.map((t,i)=>({...t,duration:i===0?27*3600+23*60:0}))});
  await page.waitForFunction(()=>document.querySelector('.ai-library-duration')?.textContent.includes('27'));
  await check('Home');await page.locator('.ai-library-overview').screenshot({path:'/tmp/potato-overview-english-serif.png'});await page.screenshot({path:'/tmp/potato-english-serif-home.png'});
  await page.getByRole('button',{name:'Now playing panel',exact:true}).click();await page.waitForSelector('.ai-np-lyrics');await check('Lyrics');
  await page.getByRole('tab',{name:/Play queue/}).click();await check('Queue');
  await page.getByRole('button',{name:'AI panel',exact:true}).click();
  await page.locator('.ai-assistant textarea').fill('What is the sample rate of this song?');await page.locator('.ai-assistant textarea').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ai-assistant').textContent.includes('8000 Hz'));await check('Local assistant result');
  const sidebarNav=async(label)=>{const items=()=>page.locator('.ai-sidebar .nav-item').filter({hasText:label}).first();const direct=items();if(await direct.count()&&await direct.isVisible()){await direct.click();return;}const more=page.locator('.ai-sidebar .nav-item--more').first();if(await more.count())await more.click();await items().click();};
  for(const name of ['Songs','Albums','Artists','Favorites','Collections','Comments','Discover']){await sidebarNav(name);await check(name);}
  for(const name of ['Daily mix','AI workspace','Listening stats','Song editor','Sync','Ultra']){await sidebarNav(name);await check(name);}
  await page.locator('.ai-sidebar .sidebar-settings').click();await check('Settings');
  await page.getByRole('button',{name:'Personalization',exact:true}).click();await page.waitForSelector('.personalization-dialog');await check('Personalization');await page.screenshot({path:'/tmp/potato-english-serif-settings.png'});await page.getByRole('button',{name:'Close personalization'}).click();await page.waitForSelector('.personalization-dialog',{state:'detached'});
  // Tool pages live under the sidebar "More" expander, opened by sidebarNav above.
  await page.getByRole('button',{name:'AI connection settings',exact:true}).click();await page.waitForSelector('.ai-connection-modal');await check('AI connection');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Downloads',exact:true}).click();await page.waitForSelector('.download-panel');await check('Downloads');
  fs.writeFileSync('/tmp/potato-personalization-audit.json',JSON.stringify(report,null,2));
  assert.deepEqual(report.flatMap(r=>r.text.map(x=>({page:r.name,...x}))),[],'English interface must not contain untranslated app copy');
  assert.deepEqual(report.flatMap(r=>r.fonts.map(x=>({page:r.name,...x}))),[],'All UI text must use the selected serif face');
  assert.deepEqual(report.flatMap(r=>r.matrix),[],'Both font choices must apply in classic/editorial and light/dark');
  assert.deepEqual(report.flatMap(r=>r.unchanged.map(x=>({page:r.name,...x}))),[],'Painted UI corners must respond to the corner preference (preset illustrations and CD cases keep their depicted geometry)');
  assert.equal(await page.locator('.ai-play-button').evaluate(el=>getComputedStyle(el).borderTopLeftRadius),'50%','Transport discs keep their circular shape');
  await page.keyboard.press('Escape');
  if (await page.locator('.download-panel').count()) {
    const close = page.locator('.download-panel__close');
    if (await close.count()) await close.click({ force: true }).catch(() => {});
    await page.waitForSelector('.download-panel', { state: 'detached', timeout: 5000 }).catch(() => {});
  }
  await page.locator('.ai-sidebar .sidebar-settings').click();
  await page.waitForSelector('.settings-page', { timeout: 10000 });
  // CSS locator instead of getByRole: closing overlays can leave an aria-hidden
  // ancestor for a tick, which hides the language group from the ARIA tree.
  await page.locator('.language-choice button').filter({hasText:'中文'}).first().click();
  await sidebarNav('首页');
  await page.waitForFunction(()=>document.querySelector('.ai-library-overview')?.textContent.includes('本地歌曲'));
  await page.locator('.ai-library-overview').screenshot({path:'/tmp/potato-overview-chinese-serif.png'});
  await page.reload();await page.waitForSelector('.ai-library-overview');
  assert((await page.locator('.ai-library-overview').innerText()).includes('本地歌曲'),'Language change must persist');
  assert.deepEqual(errors,[]);
  console.log('Rendered language, font and corner audit passed. Report: /tmp/potato-personalization-audit.json');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
