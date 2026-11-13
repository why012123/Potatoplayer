const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const root = path.resolve(__dirname, '..');
 const home = fs.mkdtempSync(path.join(os.tmpdir(),'potato-ai-ui-')); const music = path.join(home, 'music'); fs.mkdirSync(music);
 const wav = Buffer.alloc(44 + 160000); wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(160000,40);
 for (const name of ['Test Artist - Morning', 'Test Artist - Evening', 'Test Artist - Forest', 'Test Artist - Sea']) fs.writeFileSync(path.join(music,name+'.wav'),wav);
 const env = { ...process.env, POTATOMUSIC_HOME: home, POTATOMUSIC_LIBRARY: music, POTATO_HIDDEN:'1', POTATO_ALLOW_SECOND_INSTANCE:'1' }; delete env.ELECTRON_RUN_AS_NODE;
 const app = await electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env,timeout:40000});
 try {
 const page = await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('.ai-sidebar',{timeout:45000});
 await page.waitForFunction(()=>document.querySelectorAll('.ai-record-card').length===4,{},{timeout:45000});
 await page.evaluate(async()=>{await window.potato.invoke('playback.volume',{volume:0}); await window.potato.invoke('playback.mute',{muted:true});});
 await page.screenshot({path:'/tmp/potato-ai-home.png'});
 await page.getByRole('button',{name:'AI 连接设置',exact:true}).click();
 await page.waitForSelector('.ai-connection-modal');
 await page.keyboard.press('Escape');
 await page.waitForSelector('.ai-connection-modal',{state:'detached'});
 await page.getByRole('button',{name:'推荐一份歌单',exact:false}).click();
 await page.waitForSelector('.ai-result-track');
 assert.ok(await page.locator('.ai-result-track').count()>0);
 await page.getByRole('button',{name:'播放全部',exact:true}).click();
 await page.waitForFunction(async()=>Boolean((await window.potato.invoke('playback.state')).trackId));
 await page.getByRole('button',{name:'保存到歌单',exact:true}).click();
 await page.waitForSelector('.playlist-dialog');
 await page.keyboard.press('Escape');
 await page.waitForSelector('.playlist-dialog',{state:'detached'});
 await page.screenshot({path:'/tmp/potato-ai-assistant.png'});
 await page.getByRole('button',{name:'切换主题',exact:true}).click();
 await page.screenshot({path:'/tmp/potato-ai-dark.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 // Exercise the actual offline provider through the UI, including constrained recommendations.
 async function ask(query) {
   const count=await page.locator('.ai-turn').count();
   await page.getByRole('textbox',{name:'向音乐助手提问',exact:true}).fill(query);
   await page.getByRole('button',{name:'发送音乐请求',exact:true}).click();
   await page.waitForFunction(n=>document.querySelectorAll('.ai-turn').length>n,count);
   await page.locator('.ai-turn').last().locator('h3').waitFor();
   return page.locator('.ai-turn').last();
 }
 let turn=await ask('播放 Morning');
 assert.equal(await turn.locator('.ai-result-track').count(),1);
 assert.equal(await turn.locator('.ai-result-track strong').innerText(),'Morning');
 turn=await ask('为我推荐 Missing Artist 的歌曲');
 assert.equal(await turn.locator('.ai-result-track').count(),0);
 assert.match(await turn.innerText(),/暂时没有匹配/);
 turn=await ask('为我推荐 Test Artist 的歌曲');
 assert.equal(await turn.locator('.ai-result-track').count(),4);
 // Narrow desktop layout must keep the player separate from the content and assistant.
 await page.setViewportSize({width:980,height:740});
 await page.screenshot({path:'/tmp/potato-ai-compact.png'});
 const bounds=await page.evaluate(()=>{
   const player=document.querySelector('.ai-player').getBoundingClientRect();
   return ['.page-shell','.ai-assistant'].map(selector=>document.querySelector(selector).getBoundingClientRect().bottom<=player.top);
 });
 assert.deepEqual(bounds,[true,true]);
 await page.evaluate(()=>document.documentElement.dataset.glass='off');
 assert.equal(await page.locator('.ai-assistant').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
 assert.deepEqual(errors,[]);
 console.log('AI UI smoke passed: library, local recommendations, playback, playlist dialog; screenshots /tmp/potato-ai-*.png');
 } finally {await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
