const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const target=path.join(root,'backend/target');const testClasses=path.join(target,'test-classes');fs.mkdirSync(testClasses,{recursive:true});
const cp=[path.join(target,'classes'),path.join(target,'lib','*')].join(path.delimiter);
execFileSync('javac',['-encoding','UTF-8','-cp',cp,'-d',testClasses,path.join(root,'backend/src/test/java/com/potatomusic/superapp/MigrationHarness.java')]);
const run=(from,to)=>execFileSync('java',['-cp',[testClasses,cp].join(path.delimiter),'com.potatomusic.superapp.MigrationHarness',from,to],{encoding:'utf8'});
const write=(dir,name,data)=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),JSON.stringify(data));};
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'potato-migration-'));
(async () => { try {
 const source=path.join(tmp,'original'),dest=path.join(tmp,'ai'),music=path.join(tmp,'library','music');fs.mkdirSync(music,{recursive:true});
 const wav=Buffer.alloc(44+16000);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 const audio=path.join(music,'Artist - Song.wav');fs.writeFileSync(audio,wav);const id=crypto.createHash('sha256').update(audio).digest('hex').slice(0,24);
 fs.mkdirSync(path.join(source,'covers'),{recursive:true});const cover=path.join(source,'covers','image.png');fs.writeFileSync(cover,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=','base64'));
 const local={id,path:audio,title:'Song',artist:'Artist',album:'',genre:'',block:'',note:'my new note',coverPath:null,duration:1,year:0,trackNo:0,playCount:3,rating:9.9,addedAt:Math.trunc(fs.statSync(audio).mtimeMs),fileSize:wav.length,metadataOverrides:['rating']};
 const old={...local,title:'Original Song',artist:'Original Artist',album:'Original Album',note:'old note',addedAt:1234567890000,year:2004,playCount:20,rating:8.6,coverPath:cover,neteaseId:'123',metadataOverrides:[]};
 const oldLibrary={libraryRoot:music,schemaVersion:2,tracks:[old],favorites:[id],playlists:[{id:'p',name:'Original list',trackIds:[id]}],blocks:[{name:'OST',color:'#123456'}],genres:[]};
 write(source,'library.json',oldLibrary);write(source,'settings.json',{libraryRoot:music,volume:.5,repeat:'all'});
 write(dest,'library.json',{...oldLibrary,tracks:[local],favorites:[],playlists:[],blocks:[]});write(dest,'settings.json',{libraryRoot:music,volume:.3});
 const stats=(seconds,plays)=>({schemaVersion:1,days:{'2026-11-11':{seconds,plays,hours:[seconds,...Array(23).fill(0)]}},tracks:{[id]:{title:'Song',artist:'Artist',seconds,plays,lastPlayedAt:1}}});
 write(source,'stats.json',stats(100,20));write(dest,'stats.json',stats(10,3));
 write(source,'eq.json',{version:2,on:false,global:{preamp:12},presets:{old:{preamp:10}},songs:{a:{nid:'123'}}});write(dest,'eq.json',{version:2,on:true,global:{preamp:11},presets:{new:{preamp:13}},songs:{}});
 write(source,'netease_bindings.json',{[audio]:{path:audio,neteaseId:'123',coverPath:cover,title:old.title,year:2004}});
 const before=fs.readFileSync(path.join(source,'library.json'));
 run(source,dest);const result=read(dest,'library.json');const t=result.tracks[0];
 assert.equal(t.rating,9.9,'new AI rating wins');assert.equal(t.note,'my new note','untracked custom note preserved');assert.equal(t.title,'Original Song');assert.equal(t.year,2004,'release year restored');assert.equal(t.addedAt,1234567890000,'original library addition time restored');assert.ok(t.metadataOverrides.includes('year'));assert.ok(t.coverPath.startsWith(path.join(dest,'covers')));assert.ok(fs.existsSync(t.coverPath));assert.equal(t.playCount,23);
 assert.equal(result.favorites.length,1);assert.equal(result.playlists.length,1);assert.equal(read(dest,'settings.json').volume,.3);assert.equal(read(dest,'settings.json').repeat,'all');
 assert.equal(read(dest,'stats.json').days['2026-11-11'].seconds,110);assert.equal(read(dest,'eq.json').on,true);assert.deepEqual(Object.keys(read(dest,'eq.json').presets).sort(),['new','old']);
 assert.equal(read(dest,'netease_bindings.json')[audio].coverPath,t.coverPath);assert.deepEqual(fs.readFileSync(path.join(source,'library.json')),before);assert.deepEqual(fs.readFileSync(audio),wav);
 // Simulate interrupted commit: journal replay is exact, never additive.
 fs.unlinkSync(path.join(dest,'migration-super-v1/completed.json'));run(source,dest);assert.equal(read(dest,'stats.json').days['2026-11-11'].seconds,110);
 // Completed migrations must leave later edits/removals alone.
 const updated=read(dest,'library.json');updated.favorites=[];updated.tracks[0].rating=0;write(dest,'library.json',updated);run(source,dest);assert.equal(read(dest,'library.json').tracks[0].rating,0);assert.equal(read(dest,'library.json').favorites.length,0);
 // First launch also restores metadata, artwork and history, without scan defaults.
 const fresh=path.join(tmp,'fresh');run(source,fresh);assert.equal(read(fresh,'library.json').tracks[0].year,2004);assert.equal(read(fresh,'library.json').favorites.length,1);
 // Verify real backend startup/repair and an explicit rescan do not regress the import.
 write(path.dirname(music),'ratings.json',{[audio]:{score:8.0,note:'stale legacy note'}});
 const {BackendProcess}=require('../electron/backend.cjs');
 const backend=new BackendProcess({appRoot:root,dataDir:dest});
 try {
  await backend.start();
  const beforeScan=await backend.invoke('bootstrap');assert.equal(beforeScan.tracks[0].rating,0,'intentionally cleared rating survives legacy repair');
  const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('scan timeout')),15000);backend.on('event',m=>{if(m.event==='scan.done'){clearTimeout(timer);resolve(m.data);}if(m.event==='scan.error'){clearTimeout(timer);reject(Error(m.data.message));}});});
  await backend.invoke('library.scan');const scanned=await done;assert.equal(scanned.tracks[0].year,2004);assert.equal(scanned.tracks[0].addedAt,1234567890000);assert.equal(scanned.tracks[0].coverPath,t.coverPath);assert.equal(scanned.tracks[0].rating,0);assert.equal(scanned.tracks[0].note,'my new note');
 } finally {await backend.shutdown();}
 console.log('Migration tests passed: metadata/year, artwork, newer edits, playlists/favorites, stats, EQ, crash replay, one-time behavior, fresh install, unchanged source/audio.');
} finally {fs.rmSync(tmp,{recursive:true,force:true});} })().catch(error=>{console.error(error);process.exitCode=1;});
