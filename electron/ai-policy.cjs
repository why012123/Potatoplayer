'use strict';

// Routing only chooses read tools / requests model tool use. It never infers a
// metadata value, changes a binding, or executes a write on the user's behalf.
function taskPolicy(prompt, webEnabled = true) {
 const noWeb = /(?:不要|别|禁止|不用|无需|不许).{0,6}(?:联网|上网|搜索网页)|(?:do not|don't|without)\s+(?:browse|search the web)/i.test(prompt);
 const noAction = /(?:不要|别|禁止|不许|不用).{0,5}(?:修改|改动|下载|播放|操作)|(?:只|仅仅|仅)(?:想|是)?(?:问|聊|讨论|解释)|\b(?:do not|don't)\s+(?:change|edit|download|play)/i.test(prompt);
 const research = /联网|上网|网上|搜索网页|查资料|查证|核实|来源|出处|背景|创作|作词|作曲|发行|发售|哪年|哪一年|什么时候|谁唱|演唱者|演出|新闻|最新|近况|介绍一下|讲讲.{0,12}(?:歌|专辑|歌手)|https?:\/\/|\b(?:research|browse|release|composer|latest|background)\b/i.test(prompt);
 const binding = /网易云.{0,8}(?:id|编号|标识)|qq\s*(?:音乐)?\s*(?:mid|id)|songmid|绑定/i.test(prompt);
 const read = /评论|热评|网友|查|搜|找|推荐|歌单|曲库|队列|评分|备注|统计|听歌|播放次数|时长|收藏|这首|这歌|当前.*歌|\b(?:find|search|recommend|library|queue)\b/i.test(prompt) || binding;
 const upgrade = /(?:升级|提升|提高|升到|换成|替换).{0,10}(?:音质|无损|hi-?res|母带|码率)|音质.{0,10}(?:升级|提升|提高|替换)|(?:hi-?res|hires|母带).{0,8}(?:升级|替换|重下|重新下载)/i.test(prompt);
 let writes = [];
 if (!noAction) {
  if (/(?:改|设|更新|补|填|绑定|清空|清除|删除).{0,24}(?:评分|分数|备注|年份|资料|信息|歌名|歌手|专辑|歌词|封面|id|mid|绑定)|(?:评分|备注|年份|id|mid).{0,16}(?:改|设|填|绑定)|打\s*\d+(?:\.\d+)?\s*分/i.test(prompt)) writes.push('update_tracks', 'update_track_bindings');
  if (/播放|放一首|放点|放歌|暂停|下一首|上一首|音量|循环|随机播放|\b(?:play|pause|skip|volume)\b/i.test(prompt)) writes.push('control_playback', 'arrange_queue');
  if (/下载|\bdownload\b/i.test(prompt)) writes.push('download_netease', 'download_qq');
  if (upgrade) writes.push('download_netease', 'download_qq', 'upgrade_track_quality');
  if (/(?:创建|新建|建立|整理|重排|排好|添加|加入|移除|删除|改名).{0,16}(?:歌单|队列)|(?:歌单|队列).{0,16}(?:创建|整理|排序)/i.test(prompt)) writes.push('manage_playlist','arrange_queue');
  if (/收藏|取消喜欢/i.test(prompt) && /收藏这|加入|取消|设为|添加|移除|删/.test(prompt)) writes.push('set_favorite');
  if (/改成深色|改成浅色|换肤|换个主题|切换主题|(?:改|调|换|设).{0,12}(?:外观|颜色|主题|背景|深色|浅色|动画|字体)/.test(prompt)) writes.push('set_appearance');
 }
 const useWeb = webEnabled && !noWeb && !/评论|热评|网友/.test(prompt) && research && !(/(?:本地|已保存|资料库|曲库).{0,10}(?:年份|信息|资料)/.test(prompt));
 return { web: useWeb, noWeb, writes: [...new Set(writes)], needsTool: useWeb || read || upgrade || writes.length > 0 };
}
function initialChoice(policy) {
 return policy.web ? {type:'function',function:{name:'web_search'}} : policy.needsTool ? 'required' : 'auto';
}
module.exports = { taskPolicy, initialChoice };
