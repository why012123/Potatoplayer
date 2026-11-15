const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');

(async () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-sidebar-'));
  const music = path.join(home, 'music'); fs.mkdirSync(music);
  const wav = Buffer.alloc(44 + 16000 * 60);
  wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
  for (const name of ['Test Artist - Morning','Test Artist - Evening']) fs.writeFileSync(path.join(music,name+'.wav'),wav);
  const env = {...process.env,POTATOMUSIC_HOME:home,POTATOMUSIC_LIBRARY:music,POTATO_HIDDEN:'1',POTATO_ALLOW_SECOND_INSTANCE:'1'};
  delete env.ELECTRON_RUN_AS_NODE; delete env.DEEPSEEK_API_KEY;
  let app;
  try {
    app = await electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env,timeout:40000});
    const page = await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('.sidebar',{timeout:45000});
    await page.evaluate(()=>{
      localStorage.setItem('potato:appearance:v1',JSON.stringify({language:'en',style:'editorial',animationLevel:'full',pageTransitions:false}));
      localStorage.setItem('potato:theme','light');
      localStorage.setItem('potato:right-panel','1');localStorage.setItem('potato:right-panel-mode','player');
    });
    await page.reload();await page.waitForSelector('.now-playing',{timeout:45000});
    await page.waitForFunction(async()=>(await window.potato.invoke('bootstrap')).tracks.length===2);
    const playingId=await page.evaluate(async()=>{
      const data=await window.potato.invoke('bootstrap');
      await window.potato.invoke('playback.volume',{volume:0});await window.potato.invoke('playback.mute',{muted:true});
      await window.potato.invoke('playback.play',{trackId:data.tracks[0].id,queue:data.tracks.map(t=>t.id)});
      return data.tracks[0].id;
    });
    await page.getByRole('button',{name:'Songs',exact:true}).click();
    const toggle=page.getByRole('button',{name:'Switch to AI chat',exact:true});
    await toggle.waitFor();
    const buttons=await page.locator('.now-playing__head-actions > button').evaluateAll(els=>els.map(el=>({name:el.getAttribute('aria-label'),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,cls:el.className})));
    assert.equal(buttons.length,4);assert.equal(buttons[2].name,'Switch to AI chat');
    assert.ok(buttons.every(b=>b.w===buttons[0].w && b.h===buttons[0].h && b.cls===buttons[0].cls),'four controls use identical sizing and styling');
    await page.screenshot({path:'/tmp/super-sidebar-player.png'});
    await page.evaluate(()=>{window.__sidebarShell=document.querySelector('.right-panel-shell');});
    assert.equal(await page.locator('.playback-view .np-tabs').count(),0);
    await toggle.click();
    const text=page.getByRole('textbox',{name:'Message to music assistant'});
    await text.fill('draft survives toggles');
    await page.getByRole('button',{name:'Switch to play queue',exact:true}).click();
    assert.equal(await page.locator('.queue-sidebar .queue-row').count(),2);
    await page.screenshot({path:'/tmp/super-sidebar-queue.png'});
    await page.getByRole('button',{name:'Minimize play queue',exact:true}).click();
    await page.getByRole('button',{name:'Expand play queue',exact:true}).click();
    await page.evaluate(()=>{window.__sidebarShell=document.querySelector('.right-panel-shell');});
    await page.getByRole('button',{name:'Switch to playback',exact:true}).click();
    const frames=await page.evaluate(async()=>{
      const samples=[];
      for(let i=0;i<12;i++) {
        await new Promise(requestAnimationFrame);
        const shell=document.querySelector('.right-panel-shell');const box=shell.getBoundingClientRect();
        samples.push({same:shell===window.__sidebarShell,x:box.x,y:box.y,w:box.width,h:box.height,
          transform:getComputedStyle(shell).transform,art:getComputedStyle(document.querySelector('.now-playing__art-wrap')).transform});
      }
      return samples;
    });
    assert.ok(frames.every(f=>f.same&&f.transform==='none'&&f.art==='none'),'switch does not remount or move the pane/cover');
    assert.ok(frames.every(f=>Math.abs(f.x-frames[0].x)<.5&&Math.abs(f.y-frames[0].y)<.5&&Math.abs(f.h-frames[0].h)<.5));

    await page.getByRole('button',{name:'Switch to AI chat',exact:true}).click();assert.equal(await text.inputValue(),'draft survives toggles');
    await text.fill('find Morning');await text.press('Enter');
    await page.waitForSelector('.ai-side-transcript .ai-result-track');
    assert.equal(await page.locator('.ai-side-transcript .ai-result-track strong').innerText(),'Morning');
    assert.ok(await page.getByRole('button',{name:'Songs',exact:true}).evaluate(el=>el.classList.contains('is-active')));
    assert.equal(await page.locator('.ai-workspace-page').count(),0,'sidebar send must not navigate');
    assert.equal((await page.evaluate(()=>window.potato.invoke('playback.state'))).trackId,playingId);
    await page.screenshot({path:'/tmp/super-sidebar-chat.png'});
    await page.waitForFunction(()=>document.querySelector('.ai-side-composer').getAttribute('aria-busy')==='false');
    await text.fill('keep this draft');
    await page.getByRole('button',{name:'Minimize AI chat',exact:true}).click();
    assert.equal(await page.locator('.mini-player').count(),0);assert.equal(await text.inputValue(),'keep this draft');
    assert.equal(await page.locator('.ai-mini-reply').count(),0,'old replies must not pop up when minimizing');
    await text.fill('find Evening');await text.press('Enter');
    await page.waitForSelector('.ai-mini-reply .ai-result-track');
    assert.equal(await page.locator('.ai-mini-reply .ai-result-track strong').innerText(),'Evening');
    await page.screenshot({path:'/tmp/super-sidebar-compact.png'});
    await page.locator('.ai-mini-reply').hover();await page.waitForTimeout(13000);
    assert.equal(await page.locator('.ai-mini-reply').count(),1,'hover pauses dismissal');
    await page.mouse.move(2,2);
    await page.getByRole('button',{name:'Close reply',exact:true}).focus();await page.waitForTimeout(13000);
    assert.equal(await page.locator('.ai-mini-reply').count(),1,'keyboard focus pauses dismissal');
    await text.focus();
    await page.waitForTimeout(13000);
    await page.waitForSelector('.ai-mini-reply',{state:'detached',timeout:3000}).catch(async error => {
      console.error('Popup state:',await page.locator('.ai-mini-reply').evaluate(el=>({hover:el.matches(':hover'),focus:el.contains(document.activeElement),active:document.activeElement?.outerHTML,opacity:getComputedStyle(el).opacity})));
      throw error;
    });
    await page.getByRole('button',{name:'Expand AI chat',exact:true}).click();
    assert.equal(await page.locator('.ai-side-transcript .ai-turn').count(),2,'dismissal preserves history');
    await page.getByRole('button',{name:'Minimize AI chat',exact:true}).click();
    await text.fill('find Morning');await text.press('Enter');await page.waitForSelector('.ai-mini-reply');
    await page.getByRole('button',{name:'View conversation',exact:true}).click();
    assert.equal(await page.locator('.ai-side-transcript .ai-turn').count(),3);
    await page.getByRole('button',{name:'Minimize AI chat',exact:true}).click();
    await page.reload();await page.waitForSelector('.ai-mini-chat',{timeout:45000});
    assert.equal(await page.locator('.ai-mini-reply').count(),0,'reload never replays stale notifications');
    await page.getByRole('button',{name:'Expand AI chat',exact:true}).click();
    await page.getByRole('button',{name:'Switch to play queue',exact:true}).click();
    await page.getByRole('button',{name:'Switch to playback',exact:true}).click();
    await page.getByRole('button',{name:'Switch to AI chat',exact:true}).click();
    await page.getByRole('button',{name:'Switch to play queue',exact:true}).click();
    const titles=await page.locator('.queue-row__text strong').allTextContents();
    await page.locator('.queue-sidebar').getByRole('button',{name:'Play '+titles[1],exact:true}).click();
    await page.waitForFunction(title=>document.querySelector('.queue-row.is-current strong')?.textContent===title,titles[1]);
    // The remove control is intentionally revealed only on row hover/focus.
    await page.locator('.queue-sidebar .queue-row').filter({has:page.getByRole('button',{name:'Play '+titles[0],exact:true})}).hover();
    await page.getByRole('button',{name:'Remove '+titles[0]+' from queue',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.queue-sidebar .queue-row').length===1);
    await page.getByRole('button',{name:'Switch to playback',exact:true}).click();
    await page.getByRole('button',{name:'Hide now playing',exact:true}).click();await page.waitForSelector('.mini-player');
    assert.equal(await page.locator('.ai-mini-chat').count(),0);
    assert.deepEqual(errors,[]);
    console.log('Right sidebar passed: three views, identical toggle, stable pane/cover, queue playback/removal/collapse, draft preservation, compact replies, hover/focus timer, history, reload, original mini player.');
  } finally {if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
