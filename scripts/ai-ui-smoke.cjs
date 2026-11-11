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
 assert.deepEqual(errors,[]);
 console.log('AI UI smoke passed: library, local recommendations, playback, playlist dialog; screenshots /tmp/potato-ai-*.png');
 } finally {await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
