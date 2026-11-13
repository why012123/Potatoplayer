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
  if(method==='playback.setQueue')state.playback.queue=p.queue;
  if(method==='playlist.create') {const playlist={id:'new',name:p.name,trackIds:[]};state.playlists.push(playlist);return {playlist};}
  if(method==='playlist.addTracks') {state.playlists.find(t=>t.id===p.playlistId).trackIds.push(...p.trackIds);return {ok:true};}
  if(method==='netease.search')return [{id:'123',name:'鳥の詩',artists:'Lia'}];
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
