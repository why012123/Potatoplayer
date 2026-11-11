const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, message) { for(let i=0;i<150;i++){if(await fn())return;await delay(100);}throw Error(message); }
function wav() { const b=Buffer.alloc(176444); b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(176400,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b; }
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'potato-playlist-download-'));
 const music=path.join(home,'music');fs.mkdirSync(music);fs.mkdirSync(path.join(home,'covers'));
 const tracks=Array.from({length:5},(_,i)=>({id:`fixture-${i}`,path:path.join(music,`Song ${i}.wav`),title:`测试曲目 ${i+1}`,artist:'Potato Studio',album:'Queue regression',duration:120+i*30,coverPath:null,block:'',genre:'',rating:0,playCount:0}));
 for(const t of tracks)fs.writeFileSync(t.path,wav());
 fs.writeFileSync(path.join(home,'library.json'),JSON.stringify({tracks,playlists:[],favorites:[],blocks:[],genres:[]}));
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({libraryRoot:music,volume:0,playbackEngine:'vlc'}));
 let audioStarted=[], audioClosed=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const port=server.address().port;
  if(url.pathname==='/audio'){
   const id=url.searchParams.get('id');audioStarted.push(id);res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':id==='1'?10000000:wav().length});
   if(id==='1'){res.write(Buffer.alloc(65536));const timer=setInterval(()=>res.write(Buffer.alloc(4096)),100);res.on('close',()=>{clearInterval(timer);audioClosed.push(id);});}
   else res.end(wav());return;
  }
  let data={code:200};
  if(url.pathname==='/song/detail')data={songs:[{id:url.searchParams.get('ids'),name:'Test '+url.searchParams.get('ids'),ar:[{name:'Local fixture'}],al:{name:'Tests',picUrl:''}}]};
  if(url.pathname==='/song/url/v1')data={data:[{url:`http://127.0.0.1:${port}/audio?id=${url.searchParams.get('id')}`,type:'wav'}]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let app;
 try {
  const env={...process.env,POTATOMUSIC_HOME:home,POTATO_HIDDEN:'1',POTATO_ALLOW_SECOND_INSTANCE:'1',POTATOMUSIC_API_BASE:`http://127.0.0.1:${server.address().port}`};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env,timeout:40000});
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.sidebar');
  await page.evaluate(()=>{localStorage.setItem('potato:appearance:v1',JSON.stringify({language:'zh',style:'editorial'}));localStorage.setItem('potato:theme','light');});await page.reload();await page.waitForSelector('.sidebar');
  const invoke=(method,params={})=>page.evaluate(([m,p])=>window.potato.invoke(m,p),[method,params]);
  const boot=await invoke('bootstrap');assert.equal(boot.tracks.length,5);
  boot.tracks.forEach((t,i)=>{tracks[i].id=t.id;});
  const {playlist}=await invoke('playlist.create',{name:'MM2027'});
  await invoke('playlist.addTracks',{playlistId:playlist.id,trackIds:tracks.map(t=>t.id)});
  await page.locator('.playlist-link').filter({hasText:'MM2027'}).click();
  await page.locator('.playlist-drag-handle').nth(1).focus();await page.keyboard.press('Alt+ArrowUp');
  await until(async()=> (await invoke('bootstrap')).playlists.find(p=>p.id===playlist.id).trackIds[0]===tracks[1].id,'keyboard reorder');
  await page.locator('.playlist-drag-handle').nth(0).dragTo(page.locator('.track-table__row-wrap').nth(3));
  await until(async()=> (await invoke('bootstrap')).playlists.find(p=>p.id===playlist.id).trackIds.join(',')===[tracks[0].id,tracks[2].id,tracks[1].id,tracks[3].id,tracks[4].id].join(','),'drag reorder');
  await page.reload();await page.waitForSelector('.sidebar');await page.locator('.playlist-link').filter({hasText:'MM2027'}).click();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'library.json'))).playlists.find(p=>p.id===playlist.id).trackIds,[tracks[0].id,tracks[2].id,tracks[1].id,tracks[3].id,tracks[4].id]);
  await page.screenshot({path:path.join(root,'dist/review-playlist-light.png')});
  await page.locator('.playlist-more summary').click();assert.equal(await page.locator('.playlist-more__menu button:visible').count(),5);
  await page.screenshot({path:path.join(root,'dist/review-playlist-menu.png')});
  const menuTop = await page.locator('.playlist-more__menu button').nth(1).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
  assert(menuTop,'menu is above sticky table header');await page.keyboard.press('Escape');
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:path.join(root,'dist/review-playlist-dark.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.evaluate(()=>{window.downloadEvents=[];window.potato.onEvent(e=>{if(e.event.startsWith('download.'))window.downloadEvents.push(e);});});
  const jobs=[];for(const id of ['1','2','3'])jobs.push(await invoke('netease.download',{id,title:'Test '+id}));
  await until(()=>audioStarted.includes('1'),'first download starts');assert(!audioStarted.includes('2')&&!audioStarted.includes('3'));
  assert.equal(await page.locator('.download-item').count(),3,'all tasks visible immediately');
  await page.locator('.download-item').filter({hasText:'Test 2'}).locator('button').click();
  await page.locator('.download-item').filter({hasText:'Test 1'}).locator('button').click();
  await until(()=>audioClosed.includes('1'),'cancel closes actual HTTP stream');
  await until(()=>page.evaluate(()=>window.downloadEvents.some(e=>e.event==='download.done'&&e.data.neteaseId==='3')),'next download completes');
  const events=await page.evaluate(()=>window.downloadEvents);
  for(const job of jobs.slice(0,2)) { assert(events.some(e=>e.event==='download.cancelled'&&e.data.jobId===job.jobId)); assert(!events.some(e=>e.event==='download.done'&&e.data.jobId===job.jobId)); }
  assert(!audioStarted.includes('2'),'cancelled queued task never starts');
  assert(!fs.readdirSync(music).some(f=>f.endsWith('.part')||f.includes('.tmp')),'temporary downloads cleaned');
  assert.deepEqual(errors,[]);console.log('Playlist drag/keyboard/persistence, menu, FIFO visibility, waiting/active cancel and HTTP cleanup passed.');
 } finally { if(app)await app.close();server.closeAllConnections();await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
