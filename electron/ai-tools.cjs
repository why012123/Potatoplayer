// Explicit tools: no shell, filesystem mutation, arbitrary RPC, or audio writes.
const str = (description) => ({type:'string',description});
const num = (description,minimum,maximum) => ({type:'number',description,minimum,maximum});
const en = (...values) => ({type:'string',enum:values});
const ids = {type:'array',items:{type:'string'},maxItems:200};
const texts = {type:'array',items:{type:'string'},maxItems:20};
const tags = {type:'array',items:{type:'string'},maxItems:8};
const obj = (properties,required=[]) => ({type:'object',properties,required,additionalProperties:false});
const tool = (name,description,properties={},required=[]) => ({type:'function',function:{name,description,parameters:obj(properties,required)}});
const metadata = {
 title:str('歌曲标题'),artist:str('歌手'),album:str('专辑'),genre:str('流派'),block:str('区块分类'),note:str('个人备注，最多2000字'),lyricsOverride:{type:'string',maxLength:30000,description:'LRC歌词覆盖，最多30000字，空字符串恢复原歌词。只保存到应用资料库。'},rating:num('用户评分0到10',0,10),year:num('发行年份，0表示未知',0,9999),trackNo:num('曲目编号',0,9999),playCount:num('播放次数',0,100000000),addedAt:num('添加时间，Unix毫秒',0,8640000000000000),neteaseId:str('网易云歌曲ID，数字或空'),qqId:str('QQ MID，字母数字或空'),coverFromTrackId:str('使用另一首本地歌曲的现有封面；空字符串清除封面')
};
const appearance = { theme:en('light','dark'),accent:en('cover','coral','sage','ocean','plum','gold'),display:en('serif','sans'),corners:en('soft','crisp'),density:en('comfortable','compact'),atmosphere:en('rich','still'),animationLevel:en('full','reduced','off'),backgroundTransition:{type:'boolean'},pageTransitions:{type:'boolean'} };
const tools = [
 tool('search_library','查本地歌曲。可按歌名、歌手、专辑、区块、流派、备注搜索；query为空列出曲库，支持评分/收藏筛选及分页。',{query:str('关键词'),offset:num('起始位置',0,100000),limit:num('返回数量',1,60),minRating:num('最低评分',0,10),favoritesOnly:{type:'boolean'},sort:en('rating','plays','recent','title')}),
 tool('get_context','读取当前播放、队列、歌单、流派、区块以及外观。不会返回账号或密钥。'),
 tool('get_tracks','读取准确ID的歌曲资料，修改前必须读取。',{trackIds:ids},['trackIds']),
 tool('get_lyrics','读取本地歌曲当前歌词，修改歌词前先读取。',{trackId:str('歌曲ID')},['trackId']),
 tool('update_tracks','修改歌曲资料，只更新传入字段，不修改音频文件。先确认歌名/ID再操作；用户要求修改时可直接执行。',{trackIds:ids,patch:obj(metadata)},['trackIds','patch']),
 tool('set_favorite','设置歌曲是否收藏。',{trackIds:ids,favorite:{type:'boolean'}},['trackIds','favorite']),
 tool('arrange_queue','按给定顺序设置、追加或插入播放队列；play=true从第一首开始播放。',{trackIds:ids,mode:en('replace','append','next'),play:{type:'boolean'}},['trackIds','mode']),
 tool('control_playback','播放控制，volume为0到100，seek为秒。',{action:en('play','pause','next','previous','seek','volume','shuffle','repeat'),value:num('音量或播放秒数',0,100000),enabled:{type:'boolean'},repeat:en('off','all','one')},['action']),
 tool('manage_playlist','创建/改名/添加/移除歌曲/按完整ID列表重排歌单。删除操作仅删歌单，不删文件。',{action:en('create','rename','add','remove','reorder','delete'),playlistId:str('已存在歌单ID'),name:str('歌单名称'),trackIds:ids},['action']),
 tool('search_netease','启动已有网易云服务并搜索在线歌曲。返回真实ID，不能虚构下载ID。',{keywords:str('歌名 歌手'),limit:num('结果数',1,30)},['keywords']),
 tool('download_netease','下载本次搜索结果的网易云歌曲到本地。加入真实下载队列，下载是否成功以任务状态为准。',{id:str('搜索返回的网易云歌曲ID'),quality:en('standard','high','lossless'),block:str('目标区块'),genre:str('目标流派')},['id']),
 tool('web_search','联网搜索网页。用于查歌曲背景、发行信息、创作者、版本、专辑故事或站外资料。返回标题、链接和摘要；needContent=true时附带正文节选。回答时注明来源。',{query:str('搜索词，可包含歌名/歌手/专辑'),count:num('结果数',1,8),needContent:{type:'boolean',description:'是否返回网页正文节选'}},['query']),
 tool('web_fetch','抓取一个网页并以 Markdown 正文返回。用于阅读搜索结果里的具体页面。',{url:str('http(s) 网页地址')},['url']),
 tool('get_song_memory','读取一首歌的独立长期记忆。聊到具体歌曲或准备写入记忆前先读。',{trackId:str('歌曲ID')},['trackId']),
 tool('list_memories','列出长期记忆与歌曲记忆索引，可按关键词筛选。',{query:str('可选关键词')}),
 tool('remember_song','为指定歌曲写入长期记忆。用户说“记住”或出现值得跨会话保留的歌曲偏好、听感、背景时使用；一次最多写 6 条事实，不要记寒暄和临时状态。',{trackId:str('歌曲ID'),summary:str('一句话记忆，最多600字'),facts:texts},['trackId']),
 tool('remember_preference','写入用户长期偏好或事实（歌手、风格、场景、习惯等）。只记稳定的偏好，不记隐私或临时情绪。',{text:str('记忆内容，最多500字'),tags:tags,importance:num('重要度0到3',0,3)},['text']),
 tool('forget_song_memory','删除一首歌的记忆，或只删除其中一条事实。',{trackId:str('歌曲ID'),factId:str('要删除的记忆片段ID')},['trackId']),
 tool('forget_preference','删除一条长期偏好记忆。',{id:str('记忆ID')},['id']),
 tool('set_appearance','修改软件外观设置，即时生效并持久化。',{patch:obj(appearance)},['patch']),
];
function validate(value,schema,path='参数') {
 if(schema.type==='object') {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error(`${path} 必须为对象`);
  for(const name of schema.required||[]) if(!(name in value)) throw Error(`缺少 ${path}.${name}`);
  for(const key of Object.keys(value)) { if(!Object.hasOwn(schema.properties,key)) throw Error(`不允许的参数 ${path}.${key}`); validate(value[key],schema.properties[key],`${path}.${key}`); }
 } else if(schema.type==='array') {
  if(!Array.isArray(value)||value.length>(schema.maxItems||200)) throw Error(`${path} 数量不合法`);
  for(const item of value) validate(item,schema.items,path);
 } else if(schema.type==='number') {
  if(typeof value!=='number'||!Number.isFinite(value)||value<schema.minimum||value>schema.maximum) throw Error(`${path} 数值不合法`);
 } else if(typeof value!==schema.type) throw Error(`${path} 类型错误`);
 if(schema.enum&&!schema.enum.includes(value)) throw Error(`${path} 取值不合法`);
 if(typeof value==='string'&&value.length>(schema.maxLength||4000)) throw Error(`${path} 过长`);
}
function validateTool(name,args) {
 const t=tools.find(t=>t.function.name===name); if(!t) throw Error(`未知工具: ${name}`);
 validate(args,t.function.parameters);
}
const publicTrack = t => ({id:t.id,title:t.title,artist:t.artist,album:t.album,block:t.block,genre:t.genre,note:t.note,rating:t.rating,year:t.year,trackNo:t.trackNo,playCount:t.playCount,addedAt:t.addedAt,neteaseId:t.neteaseId,qqId:t.qqId,duration:t.duration,hasCover:Boolean(t.coverPath)});
function createToolExecutor({invoke, emit, getAppearance, setAppearance, confirm, searchWeb, fetchWeb, memory}) {
 const knownOnline = new Map();
 const sources = [];
 let results=[];
 const addSources = (items) => {
   for (const item of items || []) {
     if (!item?.url || sources.some((source) => source.url === item.url)) continue;
     sources.push({title:item.title || item.url,url:item.url,site:item.site || item.site_name || ''});
   }
 };
 const checked = (all, input) => {
  const selected=[...new Set(input||[])];
  if(selected.some(id=>!all.some(t=>t.id===id))) throw Error('包含无效歌曲ID，请重新搜索曲库');
  return selected;
 };
 async function execute(name,args) {
  validateTool(name,args);
  const data = await invoke('bootstrap');
  const tracks = data.tracks;
  if(name==='search_library') {
   const q=(args.query||'').normalize('NFKC').toLowerCase();
   const found=tracks.filter(t=>(!q||[t.title,t.artist,t.album,t.block,t.genre,t.note].join(' ').normalize('NFKC').toLowerCase().includes(q))&&t.rating>=(args.minRating||0)&&(!args.favoritesOnly||data.favorites.includes(t.id)));
   found.sort(args.sort==='plays'?(a,b)=>b.playCount-a.playCount:args.sort==='recent'?(a,b)=>b.addedAt-a.addedAt:args.sort==='title'?(a,b)=>a.title.localeCompare(b.title):(a,b)=>b.rating-a.rating);
   const selected=found.slice(Math.floor(args.offset||0),Math.floor(args.offset||0)+Math.floor(args.limit||30));
   results=selected.map(t=>t.id);
   return {total:found.length,tracks:selected.map(publicTrack)};
  }
  if(name==='get_context') return {trackCount:tracks.length,playback:data.playback,playlists:data.playlists,blocks:data.blocks,genres:data.genres,appearance:getAppearance()};
  if(name==='get_lyrics') { checked(tracks,[args.trackId]); const payload=await invoke('lyrics.get',{trackId:args.trackId}); return {found:payload.found,lines:payload.lines}; }
  if(name==='get_tracks') return {tracks:checked(tracks,args.trackIds).map(id=>publicTrack(tracks.find(t=>t.id===id)))};
  if(name==='update_tracks') {
   const selected=checked(tracks,args.trackIds);
   if(!selected.length||!Object.keys(args.patch).length) throw Error('请选择歌曲和要修改的字段');
   const patch={...args.patch};
   if('coverFromTrackId' in patch) { const coverId=patch.coverFromTrackId; if(coverId&&!tracks.some(t=>t.id===coverId)) throw Error('封面来源歌曲不存在'); patch.coverPath=coverId?tracks.find(t=>t.id===coverId).coverPath||'':''; delete patch.coverFromTrackId; }
   const updated=[];
   for(const trackId of selected) { const result=await invoke('library.patchMetadata',{trackId,patch}); updated.push(publicTrack(result.track)); }
   return {updated};
  }
  if(name==='set_favorite') {
   const selected=checked(tracks,args.trackIds);
   for(const trackId of selected) if(data.favorites.includes(trackId)!==args.favorite) await invoke('library.toggleFavorite',{trackId});
   return {updated:selected.length,favorite:args.favorite};
  }
  if(name==='arrange_queue') {
   const selected=checked(tracks,args.trackIds); if(!selected.length) throw Error('播放队列不可为空');
   if(args.mode==='replace') { if(args.play) await invoke('playback.play',{trackId:selected[0],queue:selected}); else await invoke('playback.setQueue',{queue:selected}); }
   else { await invoke('playback.enqueueMany',{trackIds:selected,next:args.mode==='next'}); if(args.play) { const current=await invoke('playback.state'); await invoke('playback.play',{trackId:selected[0],queue:current.queue}); } }
   results=selected; return {queue:await invoke('playback.state')};
  }
  if(name==='control_playback') {
   const state=await invoke('playback.state');
   if(args.action==='play'||args.action==='pause') { if(!state.trackId) throw Error('当前没有歌曲，请先编排队列并播放'); if(state.playing!==(args.action==='play')) await invoke('playback.toggle'); }
   else if(['next','previous'].includes(args.action)) await invoke(`playback.${args.action}`);
   else if(args.action==='seek') { if(args.value===undefined) throw Error('缺少跳转秒数'); await invoke('playback.seek',{seconds:Math.min(args.value,state.duration)}); }
   else if(args.action==='volume') { if(args.value===undefined||args.value>100) throw Error('音量范围0到100'); await invoke('playback.volume',{volume:args.value}); }
   else if(args.action==='shuffle') { if(args.enabled===undefined) throw Error('缺少随机播放开关'); await invoke('playback.shuffle',{enabled:args.enabled}); }
   else if(args.action==='repeat') { if(!args.repeat) throw Error('缺少循环模式'); await invoke('playback.repeat',{mode:args.repeat}); }
   return await invoke('playback.state');
  }
  if(name==='manage_playlist') {
   const selected=checked(tracks,args.trackIds);
   const existing=data.playlists.find(p=>p.id===args.playlistId);
   if(args.action!=='create'&&!existing) throw Error('歌单不存在，请先读取上下文');
   if(['create','rename'].includes(args.action)&&!args.name?.trim()) throw Error('歌单名称不能为空');
   if(args.action==='create') { const created=await invoke('playlist.create',{name:args.name.trim()}); if(selected.length) await invoke('playlist.addTracks',{playlistId:created.playlist.id,trackIds:selected}); return {playlistId:created.playlist.id,name:args.name,added:selected.length}; }
   if(args.action==='rename') return await invoke('playlist.rename',{playlistId:args.playlistId,name:args.name.trim()});
   if(args.action==='add') return await invoke('playlist.addTracks',{playlistId:args.playlistId,trackIds:selected});
   if(args.action==='delete') { if(!await confirm(`删除歌单「${existing.name}」？`, '只删除歌单，不删除音频文件。')) return {cancelled:true}; return await invoke('playlist.delete',{playlistId:args.playlistId}); }
   if(args.action==='remove') { for(const trackId of selected) await invoke('playlist.removeTrack',{playlistId:args.playlistId,trackId}); return {removed:selected.length}; }
   if(args.action==='reorder') { if(selected.length!==existing.trackIds.length||existing.trackIds.some(id=>!selected.includes(id))) throw Error('重排必须提供歌单全部歌曲，不能遗漏'); for(const trackId of selected) await invoke('playlist.moveTrack',{playlistId:args.playlistId,trackId,beforeId:''}); return {ordered:selected}; }
  }
  if(name==='search_netease') {
   await invoke('netease.startService');
   const found=await invoke('netease.search',{keywords:args.keywords,limit:Math.floor(args.limit||15)});
   for(const song of Array.isArray(found)?found:found.songs||[]) knownOnline.set(String(song.id),song);
   return found;
  }
  if(name==='download_netease') {
   const song=knownOnline.get(args.id); if(!song) throw Error('请先搜索并使用搜索返回的歌曲ID');
   return await invoke('netease.download',{id:args.id,title:song.name,quality:args.quality||'high',block:args.block||'',genre:args.genre||''});
  }
  if(name==='web_search') {
   if(!searchWeb) throw Error('联网搜索未启用，请先在 AI 连接设置中打开');
   const result = await searchWeb({query:args.query,count:args.count,needContent:args.needContent});
   addSources(result?.results);
   return result;
  }
  if(name==='web_fetch') {
   if(!fetchWeb) throw Error('联网抓取未启用，请先在 AI 连接设置中打开');
   const result = await fetchWeb(args.url);
   addSources([result]);
   return result;
  }
  if(['get_song_memory','list_memories','remember_song','remember_preference','forget_song_memory','forget_preference'].includes(name)) {
   if(!memory) throw Error('记忆系统尚未就绪');
   if(name==='get_song_memory') return {memory:memory.findSong(args.trackId)};
   if(name==='list_memories') {
    const found=memory.search(args.query || '');
    return {stats:found.stats,songs:(found.songs||[]).slice(0,20),profile:(found.profile||[]).slice(0,30)};
   }
   if(name==='remember_song') {
    const track=tracks.find(t=>t.id===args.trackId);
    if(!track) throw Error('歌曲不存在，请先读取曲库');
    if(!args.summary?.trim() && !args.facts?.length) throw Error('记忆内容不能为空');
    return {memory:memory.upsertSong({trackId:track.id,title:track.title,artist:track.artist,album:track.album,year:track.year,summary:args.summary,facts:args.facts,source:'ai'})};
   }
   if(name==='remember_preference') return {memory:memory.upsertProfile({...args,source:'ai'})};
   if(name==='forget_song_memory') return memory.deleteSong(args.trackId,args.factId);
   if(name==='forget_preference') return memory.deleteProfile(args.id);
  }
  if(name==='set_appearance') { await setAppearance(args.patch); return {applied:args.patch}; }
  throw Error('工具尚未实现');
 }
 return {execute, resultIds:()=>results, sources:()=>sources};
}
module.exports={tools,validateTool,createToolExecutor};
