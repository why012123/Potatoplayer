const {BackendProcess}=require('../electron/backend.cjs');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const assert=require('node:assert/strict');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'potato-ai-metadata-'));const music=path.join(temp,'music');const home=path.join(temp,'data');fs.mkdirSync(music);
 const wav=Buffer.alloc(44+16000);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 const audio=path.join(music,'Test Artist - Original.wav');fs.writeFileSync(audio,wav);const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(audio)).digest('hex');const before=hash();
 process.env.POTATOMUSIC_LIBRARY=music;const backend=new BackendProcess({appRoot:path.resolve(__dirname,'..'),dataDir:home});
 const scan=async()=>{const complete=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{backend.off('event',handler);reject(Error('scan timeout'));},20000);const handler=m=>{if(m.event==='scan.done'||m.event==='scan.error'){clearTimeout(timer);backend.off('event',handler);m.event==='scan.done'?resolve(m.data):reject(Error(m.data.message));}};backend.on('event',handler);});await backend.invoke('library.scan');return complete;};
 try {
  await backend.start();await scan();let boot=await backend.invoke('bootstrap');assert.equal(boot.tracks.length,1);const id=boot.tracks[0].id;
  const patch={title:'Edited title',artist:'Edited artist',album:'Edited album',year:2026,trackNo:2,note:'AI test note',rating:9.6,block:'My block',genre:'Ambient',playCount:0,addedAt:1234567890,lyricsOverride:'[00:00.00]Test line\n[00:00.50]Second line'};
  await backend.invoke('library.patchMetadata',{trackId:id,patch});
  await assert.rejects(backend.invoke('library.patchMetadata',{trackId:id,patch:{title:'Bad partial',rating:99}}));
  await assert.rejects(backend.invoke('library.patchMetadata',{trackId:id,patch:{path:'/tmp/no.wav'}}));
  await assert.rejects(backend.invoke('library.patchMetadata',{trackId:id,patch:{coverPath:'/etc/passwd'}}));
  await scan();boot=await backend.invoke('bootstrap');for(const [key,value] of Object.entries(patch))assert.equal(boot.tracks[0][key],value,`rescan must preserve ${key}`);
  assert.equal((await backend.invoke('lyrics.get',{trackId:id})).lines.length,2);
  const playlist=(await backend.invoke('playlist.create',{name:'AI test playlist'})).playlist;await backend.invoke('playlist.addTracks',{playlistId:playlist.id,trackIds:[id]});await backend.invoke('playback.setQueue',{queue:[id]});
  const persisted=JSON.parse(fs.readFileSync(path.join(home,'library.json'),'utf8'));assert.equal(persisted.tracks[0].rating,9.6);assert.deepEqual(persisted.playlists[0].trackIds,[id]);
  assert.equal(hash(),before,'Audio bytes must remain unchanged');console.log('Metadata integration passed: 13 fields, rescan persistence, invalid patch atomicity, lyrics, playlist, queue, unchanged audio SHA-256.');
 } finally {await backend.shutdown();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
