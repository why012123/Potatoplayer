'use strict';

// Routing only chooses read tools / requests model tool use. It never infers a
// metadata value, changes a binding, or executes a write on the user's behalf.
const editFields = {
 title: '歌名|标题|title', artist: '歌手|艺术家|artist', album: '专辑|album',
 note: '备注|note', genre: '流派|genre', block: '区块', rating: '评分|分数|rating',
 year: '年份|year', lyricsOverride: '歌词', trackNo: '曲序|曲目编号',
};
// Only explicit assignments count. A field mentioned as a search condition is not a write.
function assignedFields(prompt) {
 return Object.entries(editFields).filter(([, names]) =>
  new RegExp('(?:' + names + ')\\s*(?:改成|改为|设为|设成|填为|填上|写成|写为|设置为|[:：=]|to\\b)', 'i').test(prompt)
 ).map(([field]) => field);
}
function taskPolicy(prompt, webEnabled = true) {
 const noWeb = /(?:不要|别|禁止|不用|无需|不许).{0,6}(?:联网|上网|搜索网页)|(?:do not|don't|without)\s+(?:browse|search the web)/i.test(prompt);
 const noAction = /(?:不要|别|禁止|不许|不用).{0,5}(?:改|编辑|更新|下载|播放|操作)|(?:只|仅仅|仅)(?:想|是)?(?:问|聊|讨论|解释)|\b(?:do not|don't)\s+(?:change|edit|download|play)/i.test(prompt);
 const research = /联网|上网|网上|搜索网页|查资料|查证|核实|来源|出处|背景|创作|作词|作曲|发行|发售|哪年|哪一年|什么时候|谁唱|演唱者|演出|新闻|最新|近况|介绍一下|讲讲.{0,12}(?:歌|专辑|歌手)|https?:\/\/|\b(?:research|browse|release|composer|latest|background)\b/i.test(prompt);
 const binding = /网易云.{0,8}(?:id|编号|标识)|qq\s*(?:音乐)?\s*(?:mid|id)|songmid|绑定/i.test(prompt);
 const read = /评论|热评|网友|查|搜|找|推荐|歌单|曲库|队列|评分|备注|统计|听歌|播放次数|时长|收藏|这首|这歌|当前.*歌|\b(?:find|search|recommend|library|queue)\b/i.test(prompt) || binding;
 const upgrade = /(?:升级|提升|提高|升到|换成(?!.{0,3}低)|替换(?!.{0,3}低)).{0,10}(?:音质|无损|hi-?res|母带|码率)|音质.{0,10}(?:升级|提升|提高|替换)|(?:hi-?res|hires|母带).{0,8}(?:升级|替换|重下|重新下载)/i.test(prompt);
 const downgrade = /降级|降档|降一档|降(?:为|到|至).{0,10}(?:无损|hi-?res|hires|母带|高音质|高品质|标准|音质|档位|码率|kbps|320)|(?:降低|压低|调低|下调).{0,8}(?:音质|档位|码率|比特率)|(?:音质|档位).{0,8}(?:降低|下降|调低|下调)|(?:体积|文件|容量).{0,6}(?:太大|过大)|太占|占空间|占用.{0,6}(?:空间|磁盘|硬盘)|压缩一下|(?:换成|改成|改低|降成).{0,4}低音质|\bdowngrade\b|\blower\s+(?:the\s+)?(?:quality|bitrate|tier)\b/i.test(prompt);
 const noMemory = /(?:不要|别|无需|不用).{0,8}(?:记住|记下|记录|保存|存进记忆|记(?:[，。！!]|$))|\b(?:do not|don't) (?:remember|save|record)\b/i.test(prompt);
 const explicitMemory = !noMemory && /(?:请|帮我|给我)?记住(?:我|这|那|刚才|[:：])|(?:请|帮我|给我)记(?:住|下|下来)|(?:存进|加入|写入).{0,6}记忆|\b(?:please remember|remember this|remember that)\b/i.test(prompt);
 const impression = !/[问吗么?？]$/.test(prompt) &&
  /我(?:觉得|感觉|喜欢|更喜欢|很喜欢|特别喜欢|不喜欢|听到|认为)|让我(?:想起|想到|觉得|感觉)|\bI (?:like|love|dislike|think|feel|find)\b/i.test(prompt) &&
  /这(?:一)?首|这歌|这段|这版|副歌|主歌|前奏|间奏|尾奏|旋律|编曲|人声|鼓点|唱腔|听感|\b(?:this song|this track|chorus|verse|intro|vocals)\b/i.test(prompt);
 // Looking up a task or a possible quality tier must never become a new download.
 const downloadStatus = /(?:查|看|查看|查询).{0,12}下载.{0,8}(?:进度|状态|结果|完成)|下载.{0,10}(?:进度|状态|结果|完成了吗|成功了吗|好了吗|还在|结束了吗)|\b(?:download (?:status|progress|results)|did .{0,50}download)\b/i.test(prompt);
 const qualityQuestion = /(?:能不能|能否|可不可以|是否能|可以|有没有|有哪些|哪些|查|看看|什么).{0,18}(?:升|降|音质|无损|hi-?res|母带|位深|采样率)|(?:音质|无损|hi-?res|母带).{0,8}(?:可以吗|行吗|能吗|吗[？?]?$|能否|可用档位)/i.test(prompt);
 const explicitDownload = /(?:帮我|给我|请|直接|现在|就|然后|并|再)\s*(?:马上)?(?:下载|升级|降级|更换|换成)|^(?:下载(?!\s*(?:完成|进度|结果|任务|状态|好|成功|结束))|升级音质|降级音质|把这|将这)|\b(?:please |then )?download (?:this|that|it|the)\b/i.test(prompt);
 const inspectionOnly = (downloadStatus || qualityQuestion) && !explicitDownload;
 const groups = [];
 if (explicitMemory) groups.push(['remember_song', 'remember_preference']);
 if (!noAction) {
  if (/(?:编辑|改|设|更新|补|填|绑定|清空|清除|删除).{0,24}(?:评分|分数|备注|年份|资料|信息|歌曲|歌名|歌手|专辑|歌词|流派|区块|封面|id|mid|绑定)|\b(?:edit|rename|update|set|change)\b.{0,32}\b(?:song|track|title|artist|album|genre|rating|year|notes?)\b|(?:评分|备注|年份|歌名|标题|歌手|专辑|流派|区块|id|mid).{0,8}(?:改|设|填|绑定)|打\s*\d+(?:\.\d+)?\s*分/i.test(prompt)) groups.push(binding ? ['update_tracks', 'update_track_bindings'] : ['update_tracks']);
  if (/^(?:请|帮我)?播放|并播放|然后播放|再播放|放一首|放点|放歌|暂停|下一首|上一首|音量|循环|随机播放|\b(?:play|pause|skip|volume)\b/i.test(prompt)) groups.push(['control_playback', 'arrange_queue']);
  if (!inspectionOnly && /下载|\bdownload\b/i.test(prompt)) groups.push(['download_netease', 'download_qq']);
  if (upgrade && !inspectionOnly) groups.push(['download_netease', 'download_qq', 'upgrade_track_quality']);
  if (downgrade && !inspectionOnly) groups.push(['change_track_quality']);
  if (/(?:创建|新建|建立|整理|重排|排好|添加|加入|移除|删除|改名).{0,16}(?:歌单|队列)|(?:歌单|队列).{0,16}(?:创建|整理|排序)/i.test(prompt)) groups.push(prompt.includes('歌单') ? ['manage_playlist'] : ['arrange_queue']);
  if (/收藏|取消喜欢/i.test(prompt) && /收藏这|并收藏|再收藏|然后收藏|加入|取消|设为|添加|移除|删/.test(prompt)) groups.push(['set_favorite']);
  if (/改成深色|改成浅色|换肤|换个主题|切换主题|(?:改|调|换|设).{0,12}(?:外观|颜色|主题|背景|深色|浅色|动画|字体)/.test(prompt)) groups.push(['set_appearance']);
 }
 const historyQuestion = /(?:搜|查|找|翻|回顾).{0,12}(?:旧对话|历史对话|记忆|聊天记录)|(?:上次|之前|以前).{0,8}(?:我说|我提到|我聊|说过)/.test(prompt);
 const useWeb = !historyQuestion && webEnabled && !noWeb && !/评论|热评|网友/.test(prompt) && research && !(/(?:本地|已保存|资料库|曲库).{0,10}(?:年份|信息|资料)/.test(prompt));
 const fields = noAction ? [] : assignedFields(prompt);
 if (fields.length && !groups.some(group => group.includes('update_tracks'))) groups.push(['update_tracks']);
 const countMatch = /(?:把|将|给|这|那)\s*(?:这|那)?\s*(\d{1,3}|[两二三四五六七八九十])\s*首/.exec(prompt);
 const numerals = {两:2, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10};
 // Apply a count only to a single shared assignment, never to a mixed list of instructions.
 const sharedAssignment = fields.length === 1 && !/[，,；;。]|分别|其中/.test(prompt);
 const trackCount = countMatch && sharedAssignment ? Number(countMatch[1]) || numerals[countMatch[1]] : 1;
 const writes = [...new Set(groups.flat())];
 return { groups, fields, trackCount, noMemory, impression, inspectionOnly, web: useWeb, noWeb, writes, needsTool: useWeb || read || /听感|回忆|旧对话|上次.{0,8}说|采样率|位深|编码|下载.{0,8}(?:状态|进度)|音质|均衡器|聆听统计/i.test(prompt) || upgrade || downgrade || writes.length > 0 };
}
function initialChoice(policy) {
 return policy.web ? {type:'function',function:{name:'web_search'}} : policy.needsTool ? 'required' : 'auto';
}
module.exports = { taskPolicy, initialChoice };
