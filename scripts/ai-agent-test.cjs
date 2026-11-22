const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createAiService}=require('../electron/ai-service.cjs');
const {createToolExecutor,validateTool}=require('../electron/ai-tools.cjs');
const track=(id,title)=>({id,title,artist:'Lia',album:'Air',genre:'ACG',block:'OST',note:'',rating:9,year:2000,trackNo:1,playCount:8,addedAt:1,duration:120,coverPath:null,neteaseId:'',qqId:''});
function backend() {
 const state={tracks:[track('a','鳥の詩'),track('b','夏影')],favorites:[],playlists:[],blocks:[],genres:[],playback:{trackId:'a',playing:false,queue:['a','b'],duration:120}};
 const calls=[];
 return {state,calls,invoke:async(method,p={})=>{
  calls.push({method,p});
  if(method==='bootstrap')return state;
  if(method==='playback.state')return state.playback;
  if(method==='library.patchMetadata') {const t=state.tracks.find(t=>t.id===p.trackId);Object.assign(t,p.patch);return {track:t};}
  if(method==='library.changeQualities') return {queuedCount:1,queued:[{jobId:'quality-job',trackId:'a',title:'鳥の詩',quality:p.quality}],skipped:[]};
  if(method==='playback.setQueue')state.playback.queue=p.queue;
  if(method==='playlist.create') {const playlist={id:'new',name:p.name,trackIds:[]};state.playlists.push(playlist);return {playlist};}
  if(method==='playlist.addTracks') {state.playlists.find(t=>t.id===p.playlistId).trackIds.push(...p.trackIds);return {ok:true};}
  if((method==='netease.search'||method==='netease.searchRich'))return [{id:'123',name:'鳥の詩',artists:'Lia'}];
  return {ok:true};
 }};
}
const secure={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().replace('encrypted:','')};
function sse(message) {
 const chunks=[];
 if(message.tool_calls)for(let i=0;i<message.tool_calls.length;i++){const c=message.tool_calls[i];chunks.push({choices:[{delta:{tool_calls:[{index:i,id:c.id,type:'function',function:{name:c.function.name,arguments:c.function.arguments}}]}}]});}
 if(message.content)chunks.push({choices:[{delta:{content:message.content}}]});
 chunks.push({choices:[{delta:{},finish_reason:message.tool_calls?'tool_calls':'stop'}]});
 const text=chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n';
 const bytes=new TextEncoder().encode(text);
 return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=13)c.enqueue(bytes.slice(i,i+13));c.close();}}),{status:200});
}
function setup(fetchImpl,extras={}) {const b=backend(); const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-agent-test-'));const events=[]; const service=createAiService({dataDir,safeStorage:secure,invoke:b.invoke,emit:e=>events.push(e),confirm:async()=>false,fetchImpl,...extras});return {b,dataDir,events,service};}
const call=(name,args,id='c1')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
test('Tool validation refuses filesystem fields, invalid rating and unknown tools',()=>{
 assert.throws(()=>validateTool('update_tracks',{trackIds:['a'],patch:{path:'/tmp/other.mp3'}}));
 assert.throws(()=>validateTool('update_tracks',{trackIds:['a'],patch:{rating:11}}));
 assert.throws(()=>validateTool('shell',{command:'rm'}));
 assert.throws(()=>validateTool('set_appearance',{patch:{css:'body{}'}}));
});
test('Real backend tool contract: metadata, ordered queue, playlists, NetEase array results',async()=>{
 const b=backend();const e=createToolExecutor({invoke:b.invoke,emit:()=>{},getAppearance:()=>({theme:'light'}),setAppearance:async()=>{},confirm:async()=>false});
 await e.execute('update_tracks',{trackIds:['a'],patch:{note:'夏日回忆',rating:9.6}});assert.equal(b.state.tracks[0].note,'夏日回忆');assert.equal(b.state.tracks[0].title,'鳥の詩');
 await assert.rejects(e.execute('update_tracks',{trackIds:['unknown'],patch:{rating:1}}));
 await e.execute('arrange_queue',{trackIds:['b','a'],mode:'replace'});assert.deepEqual(b.state.playback.queue,['b','a']);
 await e.execute('manage_playlist',{action:'create',name:'夏日',trackIds:['b','a']});assert.deepEqual(b.state.playlists[0].trackIds,['b','a']);
 await e.execute('manage_playlist',{action:'delete',playlistId:'new'});assert.ok(!b.calls.some(c=>c.method==='playlist.delete'));
 await assert.rejects(e.execute('download_netease',{id:'123'}));
 await e.execute('search_netease',{keywords:'鳥の詩'});await e.execute('download_netease',{id:'123',quality:'high'});assert.equal(b.calls.at(-1).method,'netease.download');assert.equal(b.calls.at(-1).p.title,'鳥の詩');
});
test('Streaming multi-round DeepSeek calls execute tools and protect key',async()=>{
 let requests=[];
 const s=setup(async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);assert.equal(url,'https://api.deepseek.com/chat/completions');return requests.length===1?sse({tool_calls:[call('update_tracks',{trackIds:['a'],patch:{note:'已更新',rating:9.6}})]}):sse({content:'已经更新备注和评分。'});});
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test-secret',model:'deepseek-flash'});
 const status=await s.service.handle('ai.status');assert.equal(status.hasKey,true);assert.ok(!JSON.stringify(status).includes('secret'));
 const result=await s.service.handle('ai.chat',{requestId:'1',prompt:'给这首歌打9.6分，备注改成已更新'});
 assert.equal(s.b.state.tracks[0].rating,9.6);assert.equal(result.explanation,'已经更新备注和评分。');
 assert.equal(requests[1].messages.at(-1).role,'tool');assert.equal(requests[0].thinking.type,'disabled');
 assert.ok(s.events.some(e=>e.data.type==='text'));assert.ok(s.events.some(e=>e.data.status==='done'));
 assert.equal((await s.service.handle('ai.status')).busy,false);
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('Appearance tool waits for renderer acknowledgement',async()=>{
 let n=0,service;
 const s=setup(async()=>++n===1?sse({tool_calls:[call('set_appearance',{patch:{theme:'dark',accent:'ocean'}})]}):sse({content:'已切换深色。'}),{emit:e=>{if(e.data.type==='appearance')queueMicrotask(()=>service.handle('ai.appearanceAck',{token:e.data.token}));}});service=s.service;
 await service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});const r=await service.handle('ai.chat',{requestId:'2',prompt:'改成深色'});assert.equal(r.actions[0].status,'done');fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('No encrypted storage never writes plaintext key',async()=>{
 const s=setup(async()=>sse({content:'Hi'}),{safeStorage:{isEncryptionAvailable:()=>false}});
 const status=await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-memory-only'});assert.equal(status.storage,'session');assert.ok(!fs.readFileSync(path.join(s.dataDir,'ai-settings.json'),'utf8').includes('sk-memory-only'));fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('401 errors and stream truncation reset busy state',async()=>{
 const s=setup(async()=>new Response('',{status:401}));await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});await assert.rejects(s.service.handle('ai.chat',{requestId:'3',prompt:'你好'}),/API Key/);assert.equal((await s.service.handle('ai.status')).busy,false);fs.rmSync(s.dataDir,{recursive:true,force:true});
 const t=setup(async()=>new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));await t.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});await assert.rejects(t.service.handle('ai.chat',{requestId:'4',prompt:'你好'}),/中断/);fs.rmSync(t.dataDir,{recursive:true,force:true});
});
test('Cancel aborts network and prevents tool execution',async()=>{
 const s=setup(async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}));await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});const pending=s.service.handle('ai.chat',{requestId:'5',prompt:'修改资料'});await new Promise(r=>setImmediate(r));await s.service.handle('ai.cancel',{requestId:'5'});await assert.rejects(pending,/已停止/);assert.equal(s.b.calls.filter(c=>c.method==='library.patchMetadata').length,0);assert.equal((await s.service.handle('ai.status')).busy,false);fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('Conversation history persists across service restarts and can be managed',async()=>{
 const s=setup(async()=>sse({content:'第一段回复'}));
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 const first=await s.service.handle('ai.chat',{requestId:'h1',prompt:'第一段对话'});
 assert.ok(first.conversationId,'chat returns a conversation id');
 let list=await s.service.handle('ai.conversations.list');
 assert.equal(list.length,1);
 assert.equal(list[0].turnCount,1);
 assert.equal(list[0].title,'第一段对话');
 await assert.rejects(s.service.handle('ai.chat',{requestId:'bad',prompt:'继续',conversationId:'missing'}),/不存在/);
 assert.equal((await s.service.handle('ai.status')).busy,false);
 const reopened=createAiService({dataDir:s.dataDir,safeStorage:secure,invoke:s.b.invoke,emit:()=>{},confirm:async()=>false,fetchImpl:async()=>sse({content:'后面的回复'})});
 const loaded=await reopened.handle('ai.conversations.get',{id:first.conversationId});
 assert.equal(loaded.turns.length,1);
 assert.equal(loaded.turns[0].prompt,'第一段对话');
 assert.equal(loaded.turns[0].result.explanation,'第一段回复');
 const renamed=await reopened.handle('ai.conversations.rename',{id:first.conversationId,title:'新的标题'});
 assert.equal(renamed.title,'新的标题');
 assert.equal((await reopened.handle('ai.conversations.pin',{id:first.conversationId,pinned:true})).pinned,true);
 const created=await reopened.handle('ai.conversations.create',{title:'本地记录'});
 const appended=await reopened.handle('ai.conversations.append',{id:created.id,turn:{prompt:'本地提问',result:{intent:'search',title:'',explanation:'本地回答',trackIds:['a']},provider:'local'}});
 assert.equal(appended.conversation.turnCount,1);
 const local=await reopened.handle('ai.conversations.get',{id:created.id});
 assert.equal(local.turns[0].result.trackIds[0],'a');
 await reopened.handle('ai.conversations.delete',{id:created.id});
 assert.ok(!(await reopened.handle('ai.conversations.list')).some((item)=>item.id===created.id));
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('Memory tools write song and profile memories and inject them into the next chat',async()=>{
 let requests=[];
 const s=setup(async(url,options)=>{
  assert.match(url,/chat\/completions$/);
  const body=JSON.parse(options.body);requests.push(body);
  if(body.messages.some((message)=>message.role==='tool'))return sse({content:'记住了。'});
  return sse({tool_calls:[
   call('remember_song',{trackId:'a',summary:'用户喜欢这首歌的副歌',facts:['适合夜晚听'],},'m1'),
   call('remember_preference',{text:'喜欢夜晚的钢琴曲',tags:['夜晚','钢琴'],importance:2},'m2'),
  ]});
 });
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 await s.service.handle('ai.chat',{requestId:'m1',prompt:'记住我喜欢这首歌的副歌',currentTrackId:'a'});
 let snapshot=await s.service.handle('ai.memory.snapshot');
 assert.equal(snapshot.stats.songs,1);
 assert.equal(snapshot.songs[0].trackId,'a');
 assert.equal(snapshot.songs[0].factCount,1);
 assert.equal(snapshot.stats.profile,1);
 assert.equal(snapshot.profile[0].text,'喜欢夜晚的钢琴曲');
 requests=[];
 await s.service.handle('ai.chat',{requestId:'m2',prompt:'再聊聊夜晚适合听什么',currentTrackId:'a'});
 const system=requests[0].messages[0].content;
 assert.match(system,/用户喜欢这首歌的副歌/);
 assert.match(system,/喜欢夜晚的钢琴曲/);
 assert.match(system,/长期记忆/);
 const replaced=await s.service.handle('ai.memory.song.upsert',{trackId:'a',summary:'更新后的摘要',facts:['只保留这一条'],replaceFacts:true});
 assert.equal(replaced.memory.facts.length,1);
 assert.equal(replaced.memory.summary,'更新后的摘要');
 await s.service.handle('ai.memory.song.delete',{trackId:'a'});
 assert.equal((await s.service.handle('ai.memory.snapshot')).stats.songs,0);
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('Web search uses DeepSeek Search, returns citations and feeds results back to the model',async()=>{
 let chatBodies=[];let searchBody=null;
 const s=setup(async(url,options)=>{
  if(url.endsWith('/chat/completions')){
   const body=JSON.parse(options.body);chatBodies.push(body);
   if(chatBodies.length===1)return sse({tool_calls:[call('web_search',{query:'鳥の詩 Lia 发行',count:3,needContent:true})]});
   return sse({content:'这是网页上的资料。来源：https://example.com/song'});
  }
  if(url.endsWith('/v1/tools/search')){
   searchBody=JSON.parse(options.body);
   return new Response(JSON.stringify({results:[{title:'Song background',url:'https://example.com/song',site_name:'Example',summary:'A summary',content:'Long page content',authority:3}]}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  throw Error(`unexpected URL ${url}`);
 });
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test',webSearchEnabled:true});
 const result=await s.service.handle('ai.chat',{requestId:'w1',prompt:'查一下这首歌的背景'});
 assert.equal(searchBody.query,'鳥の詩 Lia 发行');
 assert.equal(searchBody.count,3);
 assert.equal(searchBody.need_content,true);
 assert.equal(result.sources.length,1);
 assert.equal(result.sources[0].url,'https://example.com/song');
 const toolMessage=chatBodies[1].messages.find((message)=>message.role==='tool');
 assert.match(toolMessage.content,/Song background/);
 assert.match(toolMessage.content,/Long page content/);
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});
test('Web tools are omitted from the model request when the setting is off',async()=>{
 let body=null;
 const s=setup(async(url,options)=>{assert.match(url,/chat\/completions$/);body=JSON.parse(options.body);return sse({content:'Hi'});});
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test',webSearchEnabled:false});
 await s.service.handle('ai.chat',{requestId:'w2',prompt:'你好'});
 assert.ok(body.tools.some((tool)=>tool.function.name==='remember_song'));
 assert.ok(!body.tools.some((tool)=>tool.function.name==='web_search'));
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});

test('song matching prioritizes identity and preserves title words',async()=>{
 const {matchSongs,songQuery}=await import('../electron/song-match.mjs');
 const songs=[
  {...track('exact','寻找音乐'),rating:1,artist:'Mili'},
  {...track('tag','别的歌曲'),rating:10,note:'寻找音乐'},
  {...track('live','寻找音乐 (Live)'),rating:10,artist:'Mili'},
  {...track('cover','寻找音乐'),rating:10,artist:'Cover Band'},
  {...track('alias','鳥の詩'),aliases:['鸟之诗']},
 ];
 assert.equal(songQuery('请帮我播放 寻找音乐'),'寻找音乐');
 assert.deepEqual(matchSongs(songs,'Mili 寻找音乐').map(x=>x.track.id),['exact','live']);
 assert.equal(matchSongs(songs,'寻找音乐',{artist:'Mili'})[0].track.id,'exact');
 assert.deepEqual(matchSongs(songs,'鸟之诗').map(x=>x.track.id),['alias']);
 assert.deepEqual(matchSongs(songs,'Mili 寻找音乐',{version:'Live'}).map(x=>x.track.id),['live']);
 assert.deepEqual(matchSongs(songs,'寻找音乐',{artist:'Unknown'}),[]);
 assert.deepEqual(matchSongs(songs,'???'),[]);
 assert.deepEqual(matchSongs([{...track('x','Oliver'),album:''}],'',{version:'Live'}),[]);
});

test('library search keeps artist/version constraints and flags identical titles',async()=>{
 const b=backend();b.state.tracks=[{...track('a','鳥の詩'),rating:1}, {...track('b','鳥の詩 (Live)'),rating:10}, {...track('c','鳥の詩'),artist:'Other',rating:10}];
 const e=createToolExecutor({invoke:b.invoke,emit:()=>{},getAppearance:()=>({})});
 const exact=await e.execute('search_library',{query:'鳥の詩',artist:'Lia'});
 assert.equal(exact.tracks[0].id,'a');assert.equal(exact.ambiguous,false);
 assert.equal((await e.execute('search_library',{query:'鳥の詩'})).ambiguous,true);
 assert.deepEqual((await e.execute('search_library',{query:'鳥の詩',artist:'Lia',version:'Live'})).tracks.map(t=>t.id),['b']);
 assert.equal((await e.execute('search_library',{query:'鳥の詩',artist:'Missing'})).total,0);
});

test('online search filters unrelated singers and versions before exposing download IDs',async()=>{
 const b=backend();const invoke=async(method,args)=>(method==='netease.search'||method==='netease.searchRich')?[
  {id:'wrong',name:'鳥の詩',artists:[{name:'Other'}],album:{name:'Cover'}},
  {id:'live',name:'鳥の詩 (Live)',artists:'Lia',album:'Concert'},
  {id:'right',name:'鳥の詩',artists:'Lia',album:'Air'}
 ]:b.invoke(method,args);
 const e=createToolExecutor({invoke,emit:()=>{},getAppearance:()=>({})});
 const found=await e.execute('search_netease',{keywords:'鳥の詩 Lia',artist:'Lia',album:'Air'});
 assert.deepEqual(found.songs.map(t=>t.id),['right']);
 await assert.rejects(e.execute('download_netease',{id:'not-returned-by-api'}));
 await e.execute('download_netease',{id:'right'});assert.equal(b.calls.at(-1).p.id,'right');
});

test('Binding tools expose both IDs, accept platform URLs, preserve other fields and reject malformed IDs',async()=>{
 const b=backend();Object.assign(b.state.tracks[0],{neteaseId:'123',qqId:'001AbC'});
 const e=createToolExecutor({invoke:b.invoke,getAppearance:()=>({})});
 let r=await e.execute('get_track_bindings',{trackIds:['a']});assert.equal(r.tracks[0].qqMid,'001AbC');assert.equal(r.tracks[0].neteaseId,'123');
 r=await e.execute('update_track_bindings',{trackId:'a',neteaseId:'https://music.163.com/#/song?id=456'});
 assert.equal(r.before.neteaseId,'123');assert.equal(r.after.neteaseId,'456');assert.equal(r.after.qqMid,'001AbC');
 await e.execute('update_track_bindings',{trackId:'a',qqMid:'https://y.qq.com/n/ryqq/songDetail/002Xyz'});
 assert.equal(b.state.tracks[0].qqId,'002Xyz');assert.equal(b.state.tracks[0].neteaseId,'456');
 await e.execute('update_tracks',{trackIds:['a'],patch:{qqMid:'003Abc'}});assert.equal(b.state.tracks[0].qqId,'003Abc');
 await assert.rejects(e.execute('update_tracks',{trackIds:['a'],patch:{qqMid:'one',qqId:'two'}}));
 await assert.rejects(e.execute('update_track_bindings',{trackId:'a',neteaseId:'abc'}));
 await assert.rejects(e.execute('update_track_bindings',{trackId:'a',neteaseId:'https://example.com/?id=123'}));
 await e.execute('update_track_bindings',{trackId:'a',neteaseId:''});assert.equal(b.state.tracks[0].qqId,'003Abc');
 assert.equal((await e.execute('get_tracks',{trackIds:['a']})).tracks[0].qqMid,'003Abc');
 assert.equal((await e.execute('search_library',{qqMid:'003Abc'})).total,1);
});

test('QQ search returns verified MIDs, separate from NetEase IDs, and survives an executor turn',async()=>{
 const b=backend();const cache=new Map();
 const invoke=async(m,p)=>m==='qq.search'?[{id:'123',name:'鳥の詩',artists:'Lia',album:'Air'}]:b.invoke(m,p);
 const e=createToolExecutor({invoke,getAppearance:()=>({}),onlineCache:cache});
 assert.equal((await e.execute('search_qq',{keywords:'鳥の詩',artist:'Lia'})).songs[0].id,'123');
 await assert.rejects(e.execute('download_netease',{id:'123'}));
 const next=createToolExecutor({invoke,getAppearance:()=>({}),onlineCache:cache});
 await next.execute('download_qq',{id:'123'});assert.equal(b.calls.at(-1).method,'qq.download');
});

test('Task routing proactively browses research but respects no-web and ordinary chat',()=>{
 const {taskPolicy,initialChoice}=require('../electron/ai-policy.cjs');
 assert.equal(initialChoice(taskPolicy('这首歌的创作背景是什么')).function.name,'web_search');
 assert.equal(initialChoice(taskPolicy('把网易云ID改成123')),'required');
 assert.equal(initialChoice(taskPolicy('你好呀')),'auto');
 assert.equal(taskPolicy('不要联网，聊聊这首的背景').web,false);
 assert.equal(taskPolicy('介绍一下这张专辑',false).web,false);
 assert.deepEqual(taskPolicy('不要修改评分，只解释一下').writes,[]);
});

test('Chat receives current binding values and recovers a promise without action',async()=>{
 let n=0;const requests=[];
 const s=setup(async(url,opts)=>{requests.push(JSON.parse(opts.body));n++;return n===1?sse({content:'我来帮你修改。'}):n===2?sse({tool_calls:[call('update_track_bindings',{trackId:'a',neteaseId:'456'})]}):sse({content:'网易云 ID 已改为456。'});});
 Object.assign(s.b.state.tracks[0],{neteaseId:'123',qqId:'001Abc'});
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 const r=await s.service.handle('ai.chat',{requestId:'repair',prompt:'把这首歌网易云ID改成456'});
 assert.match(requests[0].messages[0].content,/"qqMid":"001Abc"/);assert.match(requests[0].messages[0].content,/"neteaseId":"123"/);
 assert.equal(requests[0].tool_choice,'required');assert.equal(requests[1].tool_choice,'required');
 assert.equal(s.b.state.tracks[0].neteaseId,'456');assert.equal(s.b.state.tracks[0].qqId,'001Abc');assert.equal(r.actions[0].status,'done');
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});

test('Read-only research is forced to search, while explicit no-web removes callable web tools',async()=>{
 const requests=[];
 const s=setup(async(url,opts)=>{if(url.endsWith('/v1/tools/search'))return Response.json({results:[{title:'Official',url:'https://example.com',summary:'Fact'}]});
 const body=JSON.parse(opts.body);requests.push(body);
 return body.messages.some(m=>m.role==='tool')?sse({content:'查询完成'}):sse({tool_calls:[call('web_search',{query:'Lia 鳥の詩 发行'})]});});
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 const r=await s.service.handle('ai.chat',{requestId:'research',prompt:'这首歌什么时候发行的'});
 assert.equal(requests[0].tool_choice.function.name,'web_search');assert.equal(r.sources.length,1);
 requests.length=0;
 const no=await s.service.handle('ai.chat',{requestId:'offline',prompt:'不要联网，只聊聊这首歌'});
 assert.ok(!requests[0].tools.some(t=>t.function.name==='web_search'));assert.equal(no.actions[0].status,'error');assert.equal(no.sources.length,0);
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});

test('A repeated write call does not enqueue/download/mutate twice',async()=>{
 let n=0;const s=setup(async()=>++n<3?sse({tool_calls:[call('update_tracks',{trackIds:['a'],patch:{note:'一次'}})]}):sse({content:'完成'}));
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 await s.service.handle('ai.chat',{requestId:'dedup',prompt:'把备注改成一次'});
 assert.equal(s.b.calls.filter(c=>c.method==='library.patchMetadata').length,1);
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});

test('Transient web failures retry, authorization failures do not',async()=>{
 for(const status of [503,401]) {
  let searches=0,chat=0;const s=setup(async(url)=>{
   if(url.endsWith('/v1/tools/search')){searches++;return searches===1?new Response('',{status}):Response.json({results:[]});}
   return ++chat===1?sse({tool_calls:[call('web_search',{query:'Lia'})]}):sse({content:'已尝试查询'});
  });
  await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
  await s.service.handle('ai.chat',{requestId:'retry',prompt:'查一下发行信息'});
  assert.equal(searches,status===503?2:1);fs.rmSync(s.dataDir,{recursive:true,force:true});
 }
});


test('Song search rejects unrelated platform hits, resolves official aliases and retries clean queries',async()=>{
 const b=backend();const searches=[];
 const invoke=async(m,p)=>{
  if(m!=='netease.searchRich')return b.invoke(m,p);
  searches.push(p.keywords);
  if(p.keywords==='帮我找鳥の詩')return [];
  return [{id:'wrong',name:'Unrelated',artists:'Other'}, {id:'right',name:'鳥の詩',alias:'鸟之诗',artists:'Lia',album:'Air'}, {id:'live',name:'鳥の詩 (Live)',artists:'Lia',album:'Concert'}];
 };
 const e=createToolExecutor({invoke,getAppearance:()=>({})});
 let r=await e.execute('search_netease',{keywords:'帮我找鳥の詩'});
 assert.deepEqual(searches,['帮我找鳥の詩','鳥の詩']);assert.equal(r.songs[0].id,'right');assert.ok(!r.songs.some(s=>s.id==='wrong'));
 await assert.rejects(e.execute('download_netease',{id:'not-returned-by-api'}));
 r=await e.execute('search_netease',{keywords:'鸟之诗 Lia',title:'鸟之诗',artist:'Lia'});assert.deepEqual(r.songs.map(s=>s.id),['right']);
 r=await e.execute('search_netease',{keywords:'鳥の詩 Lia',title:'鳥の詩',artist:'Lia',version:'原版'});assert.deepEqual(r.songs.map(s=>s.id),['right']);
 r=await e.execute('search_netease',{keywords:'Missing song'});assert.equal(r.total,0);assert.ok(r.candidates.length>0);
 assert.equal((await e.execute('search_library',{query:'请帮我播放 鳥の詩'})).tracks[0].id,'a');
});


test('Enhanced search preserves raw detail and current-song comments resolve the binding',async()=>{
 const b=backend();b.state.tracks[0].neteaseId='123';const calls=[];
 const raw={id:'123',name:'鳥の詩',artists:'Lia',album:'AIR',durationMs:336000,year:2000,bpm:null,raw:{credits:'composer',al:{id:1}}};
 const invoke=async(m,p)=>{calls.push({m,p});if(m==='netease.searchRich')return {engine:'api-enhanced',songs:[raw],total:1};if(m==='netease.comments')return {comments:[{content:'好听'}],hot:[],total:1};return b.invoke(m,p);};
 const e=createToolExecutor({invoke,getAppearance:()=>({})});
 const found=await e.execute('search_netease',{keywords:'鳥の詩'});
 assert.equal(found.songs[0].raw.credits,'composer');assert.equal(found.apiResults[0].year,2000);assert.equal(found.songs[0].bpm,null);
 const comments=await e.execute('get_netease_comments',{});assert.equal(comments.id,'123');assert.equal(comments.comments[0].content,'好听');assert.equal(calls.find(c=>c.m==='netease.comments').p.id,'123');
});

test('Audio specifications reach library tools and the live model context', async () => {
 const requests=[];
 const s=setup(async (_url, options) => {requests.push(JSON.parse(options.body));return sse({content:'采样率为 96 kHz。'});});
 Object.assign(s.b.state.tracks[0],{sampleRate:96000,bitDepth:24,channels:2,codec:'FLAC'});
 const executor=createToolExecutor({invoke:s.b.invoke,emit:()=>{},getAppearance:()=>({}),setAppearance:async()=>{},confirm:async()=>false});
 for(const [name,args] of [['search_library',{query:'鳥の詩'}],['get_tracks',{trackIds:['a']}],['get_context',{}]]) {
  const result=await executor.execute(name,args);const audio=result.currentTrack||result.tracks[0];
  assert.equal(audio.sampleRate,96000);assert.equal(audio.bitDepth,24);assert.equal(audio.channels,2);assert.equal(audio.codec,'FLAC');
 }
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 await s.service.handle('ai.chat',{requestId:'audio-specs',prompt:'What is this song’s sample rate?',currentTrackId:'a',appearance:{language:'en'}});
 assert.match(requests[0].messages[0].content,/"sampleRate":96000/);
 assert.match(requests[0].messages[0].content,/"bitDepth":24/);
 assert.match(requests[0].messages[0].content,/Reply in English/);
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});

test('Quality change tool supports explicit downgrade and maps to library.changeQualities',async()=>{
 const {taskPolicy}=require('../electron/ai-policy.cjs');
 const {tools}=require('../electron/ai-tools.cjs');
 const toolDef=tools.find(t=>t.function.name==='change_track_quality');
 assert.ok(toolDef,'change_track_quality is exposed to the model');
 assert.equal(toolDef.function.parameters.properties.quality.enum.join(','),'standard,high,lossless,hires,jymaster,auto');
 assert.match(toolDef.function.description,/降级/);
 assert.match(toolDef.function.description,/明确要求/);
 assert.match(tools.find(t=>t.function.name==='get_quality_options').function.description,/downgrades/);
 assert.match(tools.find(t=>t.function.name==='download_netease').function.description,/change_track_quality/);
 assert.match(tools.find(t=>t.function.name==='download_qq').function.description,/change_track_quality/);
 validateTool('change_track_quality',{trackIds:['a'],quality:'lossless'});
 validateTool('change_track_quality',{minRating:9.5,quality:'auto'});
 assert.throws(()=>validateTool('change_track_quality',{quality:'ultra'}));
 assert.throws(()=>validateTool('change_track_quality',{trackIds:['a'],quality:'lossless',allowDowngrade:true}));

 const downgradePolicy=taskPolicy('把这首超清母带降到无损，太大了');
 assert.ok(downgradePolicy.writes.includes('change_track_quality'));
 assert.ok(!downgradePolicy.writes.includes('upgrade_track_quality'));
 assert.equal(downgradePolicy.needsTool,true);
 assert.equal(taskPolicy('把音质升级到无损').writes.includes('upgrade_track_quality'),true);
 assert.ok(taskPolicy('这个文件太大，占空间，压缩一下').writes.includes('change_track_quality'));
 assert.ok(taskPolicy('换成一个更低音质，downgrade').writes.includes('change_track_quality'));
 assert.ok(taskPolicy('lower the quality to 320kbps').writes.includes('change_track_quality'));
 assert.ok(!taskPolicy('把音量降到50').writes.includes('change_track_quality'));
 assert.ok(!taskPolicy('把评分降到5').writes.includes('change_track_quality'));
 assert.deepEqual(taskPolicy('不要修改音质，只解释一下').writes,[]);

 const b=backend();
 const e=createToolExecutor({invoke:b.invoke,getAppearance:()=>({})});
 await e.execute('change_track_quality',{trackIds:['a'],quality:'lossless',limit:10});
 assert.equal(b.calls.at(-1).method,'library.changeQualities');
 assert.deepEqual(b.calls.at(-1).p,{trackIds:['a'],minRating:0,limit:10,quality:'lossless'});
 await e.execute('change_track_quality',{minRating:9.5,quality:'standard'});
 assert.deepEqual(b.calls.at(-1).p,{trackIds:[],minRating:9.5,limit:20,quality:'standard'});
 await assert.rejects(e.execute('change_track_quality',{quality:'lossless'}));
 await assert.rejects(e.execute('change_track_quality',{trackIds:['missing'],quality:'lossless'}));
});

test('Service executes a model-initiated downgrade once and reports the action',async()=>{
 let round=0;const requests=[];
 const s=setup(async(_url,options)=>{requests.push(JSON.parse(options.body));return (++round<3)?sse({tool_calls:[call('change_track_quality',{trackIds:['a'],quality:'lossless'})]}):sse({content:'无损版本已加入下载队列。'});});
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 const result=await s.service.handle('ai.chat',{requestId:'quality-downgrade',prompt:'把这首超清母带降到无损，太大了',currentTrackId:'a'});
 const calls=s.b.calls.filter(c=>c.method==='library.changeQualities');
 assert.equal(calls.length,1,'repeated identical quality change is deduplicated');
 assert.equal(calls[0].p.quality,'lossless');
 assert.deepEqual(calls[0].p.trackIds,['a']);
 assert.ok(requests[0].tools.some(t=>t.function.name==='change_track_quality'));
 const system=requests[0].messages[0].content;
 assert.match(system,/change_track_quality/);assert.match(system,/绝不自动降级/);assert.match(system,/downgradeAvailable/);assert.match(system,/不能自动回滚/);
 assert.equal(result.actions[0].name,'change_track_quality');
 assert.equal(result.actions[0].status,'queued');
 assert.equal(result.actions[0].jobs[0].jobId,'quality-job');
 assert.equal(result.explanation,'无损版本已加入下载队列。');
 fs.rmSync(s.dataDir,{recursive:true,force:true});
});

test('An invalid edit and a partially applied request both resume until the missing fields are saved',async()=>{
 const replies=[
  {tool_calls:[call('update_tracks',{trackIds:['wrong'],patch:{rating:8}})]},
  {content:'已经完成。'},
  {tool_calls:[call('update_tracks',{trackIds:['a'],patch:{rating:8}})]},
  {content:'已完成所有修改。'},
  {tool_calls:[call('update_tracks',{trackIds:['a'],patch:{note:'春'}})]},
  {content:'评分和备注已更新。'},
 ];
 const s=setup(async()=>sse(replies.shift()));
 try {
  await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
  const result=await s.service.handle('ai.chat',{requestId:'fields',prompt:'把评分改为8，备注设为春'});
  assert.equal(result.actions[0].status,'error');
  assert.equal(s.b.state.tracks[0].rating,8);
  assert.equal(s.b.state.tracks[0].note,'春');
  assert.equal(replies.length,0);
 } finally { fs.rmSync(s.dataDir,{recursive:true,force:true}); }
});

test('A counted batch is still pending after only the first track is edited',async()=>{
 const replies=[
  {tool_calls:[call('update_tracks',{trackIds:['a'],patch:{note:'春'}})]},
  {content:'两首都改好了。'},
  {tool_calls:[call('update_tracks',{trackIds:['b'],patch:{note:'春'}})]},
  {content:'两首备注已更新。'},
 ];
 const s=setup(async()=>sse(replies.shift()));
 try {
  await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
  await s.service.handle('ai.chat',{requestId:'batch',prompt:'把这两首歌的备注设为春'});
  assert.deepEqual(s.b.state.tracks.map(track=>track.note),['春','春']);
 } finally { fs.rmSync(s.dataDir,{recursive:true,force:true}); }
});

test('Unified search preserves audio specs, typed local sources and statistics periods', async () => {
  const b = backend();
  Object.assign(b.state.tracks[0], {codec:'FLAC', sampleRate:96000, bitDepth:24, path:'/private/fixture.flac'});
  Object.assign(b.state.tracks[1], {codec:'FLAC', sampleRate:44100, bitDepth:16});
  b.state.settings = {playbackEngine:'potatohq', outputMode:'pcm', libraryRoot:'/private/fixture'};
  b.state.playlists.push({id:'night',name:'Night',trackIds:['a']});
  const s = setup(async () => assert.fail('local search must never hit the provider'), {
    invoke: (method, args) => {
      if (method === 'stats.get') return {days:[{date:'2026-11-01',seconds:15,plays:1},{date:'2026-11-20',seconds:30,plays:2}],
        tracks:[{trackId:'a',title:'鳥の詩',seconds:45,plays:3}]};
      if (method === 'lyrics.get') return {lines:[{time:12,text:'A night of stars',translation:'星夜'}]};
      if (method === 'eq.state') return {enabled:true,currentTrack:{title:'鳥の詩',path:'/private/fixture.flac'}};
      return b.invoke(method,args);
    },
  });
  try {
    const c = await s.service.handle('ai.conversations.create',{title:'听感'});
    s.service.conversations.append(c.id,{prompt:'副歌像漂浮在海面',contextTrackId:'a'});
    await s.service.handle('ai.memory.song.upsert',{trackId:'a',facts:['副歌有漂浮感']});
    const impressions = await s.service.handle('ai.search',{scopes:['impressions','history'],query:'漂浮',trackIds:['a']});
    assert.equal(impressions.groups.impressions.items[0].source,'song_memory');
    assert.equal(impressions.groups.history.items[0].conversationId,c.id);
    const results = await s.service.handle('ai.search',{scopes:['quality','stats','playlists','lyrics','settings'],
      trackIds:['a'],minSampleRate:96000,minBitDepth:24,fromDate:'2026-11-20'});
    assert.equal(results.groups.quality.items[0].track.codec,'FLAC');
    assert.equal(results.groups.playlists.items[0].playlistId,'night');
    assert.equal(results.groups.lyrics.items[0].lines[0].time,12);
    assert.equal(results.groups.stats.periodSeconds,30);
    assert.equal(results.groups.stats.tracks[0].period,'all_time');
    assert.equal(results.groups.settings.eq.enabled,true);
    assert.doesNotMatch(JSON.stringify(results),/private.*fixture/);
  } finally { fs.rmSync(s.dataDir,{recursive:true,force:true}); }
});

test('Clear listening impressions get a memory review and opt-out removes write tools', async () => {
  const s = setup(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.messages.some(message => /别保存/.test(message.content || ''))) {
      assert.ok(!body.tools.some(tool => tool.function.name === 'remember_song'));
      return sse({content:'理解。'});
    }
    if (body.messages.at(-1).role === 'tool') return sse({content:'记下了副歌里的鼓点。'});
    if (body.messages.some(message => message.content?.startsWith('复核上一条'))) {
      return sse({tool_calls:[call('remember_song',{trackId:'a',facts:['用户喜欢副歌里的鼓点']})]});
    }
    return sse({content:'那段鼓点很突出。'});
  });
  try {
    await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
    const r = await s.service.handle('ai.chat',{requestId:'impression',prompt:'我很喜欢副歌里的鼓点',currentTrackId:'a'});
    assert.ok(r.actions.some(action => action.name==='remember_song' && action.operation && action.status==='done'));
    await s.service.handle('ai.chat',{requestId:'opt-out',prompt:'我很喜欢副歌里的鼓点，别保存',currentTrackId:'a'});
    assert.equal(s.service.memory.snapshot().stats.facts,1);
  } finally { fs.rmSync(s.dataDir,{recursive:true,force:true}); }
});

test('Download completion is persisted in the originating turn and automatically delivered to the model', async () => {
  const bodies = [];
  const s = setup(async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    if (body.messages[0].content.startsWith('You are reporting a completed download batch')) {
      assert.equal(body.tools,undefined,'background model must be unable to take actions');
      const notice = JSON.parse(body.messages[1].content);
      assert.equal(notice.type,'download_results');
      assert.equal(notice.jobs[0].status,'done');
      assert.equal(notice.jobs[0].replaced,true);
      assert.doesNotMatch(JSON.stringify(notice),/private/);
      return sse({content:'无损文件已替换旧版。'});
    }
    if (body.messages.at(-1).role === 'tool') {
      assert.equal(JSON.parse(body.messages.at(-1).content).operationFeedback.status,'queued');
      return sse({content:'已加入队列。'});
    }
    return sse({tool_calls:[call('change_track_quality',{trackIds:['a'],quality:'lossless'})]});
  });
  try {
    await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
    const r = await s.service.handle('ai.chat',{requestId:'job',prompt:'把这首歌降到无损',currentTrackId:'a'});
    assert.equal(r.actions[0].status,'queued');
    s.service.observeBackendEvent({event:'download.done',data:{jobId:'quality-job',title:'鳥の詩',quality:'lossless',replaced:true,path:'/private/fixture.flac'}});
    const read = () => s.service.conversations.get(r.conversationId).turns[0].result;
    assert.equal(read().actions[0].status,'done');
    for (let i=0;i<20 && !read().downloadSummary;i++) await new Promise(resolve=>setImmediate(resolve));
    assert.equal(read().downloadSummary,'无损文件已替换旧版。');
    assert.ok(s.events.some(event=>event.event==='ai.download.updated' && event.data.turnId===r.turnId));
    s.service.observeBackendEvent({event:'download.done',data:{jobId:'quality-job',replaced:true}});
    assert.equal(bodies.length,3,'one final report even if the event is repeated');
    const reopened = createAiService({dataDir:s.dataDir,safeStorage:secure,invoke:s.b.invoke,emit:()=>{},confirm:async()=>false});
    assert.equal(reopened.conversations.get(r.conversationId).turns[0].result.actions[0].jobs[0].status,'done');
  } finally { fs.rmSync(s.dataDir,{recursive:true,force:true}); }
});

test('Queries about download status and available quality cannot enqueue an operation', async () => {
  const { taskPolicy } = require('../electron/ai-policy.cjs');
  for (const prompt of ['刚才下载完成了吗？', '下载完成了吗？', '有哪些歌可以升级音质？', '查刚才下载的结果']) {
    assert.equal(taskPolicy(prompt).inspectionOnly,true);
    assert.equal(taskPolicy(prompt).writes.length,0);
  }
  assert.ok(taskPolicy('把这首歌的音质升级到无损').writes.includes('upgrade_track_quality'));
});

test('A passage question pins the sent lyric, retrieves both score sources and passes the visible pages to vision', async t => {
 const seen = [];
 const modelCalls = [];
 const b = backend();
 b.state.tracks[0].neteaseId = '301';
 b.state.playback = {trackId:'b', time:3, playing:true};
 const s = setup(async (url, options) => {
   const body = JSON.parse(options.body);
   if (url.endsWith('/v1/tools/search')) {
     assert.match(body.query, /鳥の詩 Lia/);
     assert.doesNotMatch(body.query, /line|private/i);
     return Response.json({results:[{url:'https://score.example/song',title:'鳥の詩 Lia chords',content:'Key: D major\nD G A\nsecond line'}]});
   }
   modelCalls.push(body);
   if (Array.isArray(body.messages.at(-1).content)) {
     assert.equal(body.model, 'deepseek-flash');
     assert.equal(body.messages.at(-1).content[1].image_url.url, 'https://p1.music.126.net/page.png');
     return sse({content:'可见第二句上行三度。'});
   }
   return sse({content:'这份谱在第二句上行三度。'});
 }, {invoke:async(method, args) => {
   seen.push({method,args});
   if (method === 'lyrics.get') return {lines:['first line','second line','third line'].map((text,i)=>({time:10*(i+1),text}))};
   if (method === 'netease.scoreList') return [{id:9822,name:'人声谱',musicKey:'D',playVersion:'原调',totalPageSize:2}];
   if (method === 'netease.scorePreview') return [{imageUrl:'http://p1.music.126.net/page.png'}];
   return b.invoke(method,args);
 }});
 t.after(()=>fs.rmSync(s.dataDir,{recursive:true,force:true}));
 await s.service.handle('ai.configure',{enabled:true, apiKey:'sk-test', model:'deepseek-pro'});
 const result = await s.service.handle('ai.chat',{requestId:'passage',prompt:'分析这段旋律为什么好听',currentTrackId:'b',playbackCursor:{trackId:'a',time:21,playing:true}});
 const toolData = modelCalls.at(-1).messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));
 assert.equal(toolData[0].position,21);
 assert.deepEqual([toolData[0].previous.text,toolData[0].current.text,toolData[0].next.text],['first line','second line','third line']);
 assert.equal(toolData[1].netease.sheets[0].key,'D');
 assert.match(toolData[1].web[0].nearLyric,/D G A/);
 assert.match(toolData[2].observations,/上行三度/);
 assert.equal(modelCalls.at(-1).model,'deepseek-pro');
 assert.deepEqual(seen.find(row=>row.method==='lyrics.get').args,{trackId:'a'});
 assert.deepEqual(seen.find(row=>row.method==='netease.scorePreview').args,{id:'9822'});
 assert.equal(result.sources.length,2);
 assert.deepEqual(result.actions.map(a=>a.name),['get_playing_passage','lookup_score','read_score_pages']);
});

test('A pasted image reaches Flash as image data without being stored or starting a score search',async t=>{
 const img='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOioAAAAASUVORK5CYII=';
 const s=setup(async(url,opts)=>{
   assert.match(url,/chat\/completions$/);
   const body=JSON.parse(opts.body);
   assert.equal(body.model,'deepseek-flash');
   assert.deepEqual(body.messages.at(-1).content,[{type:'text',text:'分析附图中的旋律'},{type:'image_url',image_url:{url:img,detail:'high'}}]);
   return sse({content:'看到了。'});
 });
 t.after(()=>fs.rmSync(s.dataDir,{recursive:true,force:true}));
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test',model:'deepseek-pro',webSearchEnabled:false});
 const result=await s.service.handle('ai.chat',{requestId:'paste',prompt:'分析附图中的旋律',images:[img]});
 const saved=await s.service.handle('ai.conversations.get',{id:result.conversationId});
 assert.equal(saved.turns[0].imageCount,1);
 assert.ok(!JSON.stringify(saved).includes('base64'));
 await assert.rejects(s.service.handle('ai.chat',{requestId:'bad',prompt:'看图',images:['file:///private/etc']}),/图片/);
});

test('Offline passage questions only read the pinned local lyrics, including intro and missing lyrics',async t=>{
 const {playbackPassage}=require('../electron/ai-score.cjs');
 const track={id:'a',title:'Intro'};
 assert.equal(playbackPassage(null,{},null).status,'no_playback');
 assert.equal(playbackPassage(track,{time:13},null).status,'no_timed_lyrics');
 const intro=playbackPassage(track,{time:0},{lines:[{time:10,text:'first'}]});
 assert.equal(intro.current,null);assert.equal(intro.next.text,'first');
 const s=setup(async(url,opts)=>{
   assert.match(url,/chat\/completions$/);
   const body=JSON.parse(opts.body);
   assert.ok(!body.tools.some(t=>['lookup_score','read_score_pages','web_search'].includes(t.function.name)));
   assert.equal(JSON.parse(body.messages.at(-1).content).status,'no_timed_lyrics');
   return sse({content:'无法确认这一段的调。'});
 });
 t.after(()=>fs.rmSync(s.dataDir,{recursive:true,force:true}));
 await s.service.handle('ai.configure',{enabled:true,apiKey:'sk-test'});
 const r=await s.service.handle('ai.chat',{requestId:'offline',prompt:'不要联网。这段好好听，是什么调？',playbackCursor:{trackId:'a',time:9,playing:false}});
 assert.deepEqual(r.actions.map(a=>a.name),['get_playing_passage']);
});

test('Web score pages survive NetEase failure; lyrics-only questions need no score search', async () => {
 const {lookupScore}=require('../electron/ai-score.cjs');
 const {taskPolicy}=require('../electron/ai-policy.cjs');
 const score=await lookupScore({
   track:{title:'Sample song',artist:'Test band',neteaseId:'301'},
   passage:{current:{text:'Sample words'}},
   invoke:async()=>{throw Error('service unavailable')},
   searchWeb:async()=>({results:[{title:'Test band — Sample song sheet music',url:'https://scores.example/song',content:''}]}),
   fetchWeb:async()=>({content:'Test band\nG Am\nSample words\n![sheet music page 2](/page2.png)'}),
   registerPage:url=>url
 });
 assert.equal(score.netease.status,'unavailable');
 assert.deepEqual(score.web[0].previewPages,['https://scores.example/page2.png']);
 assert.ok(score.web[0].artistMentioned);
 assert.match(score.web[0].nearLyric,/G Am/);
 assert.equal(taskPolicy('现在唱到的这句歌词是什么意思？').lyricPassage,true);
 assert.equal(taskPolicy('现在唱到的这句歌词是什么意思？').scorePassage,false);
 assert.equal(taskPolicy('这段好好听，是什么调').scorePassage,true);
});
