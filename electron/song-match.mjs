// Shared by the renderer's offline assistant and the model's library tool.
export const normalizeSongText = (value = '') => String(value).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const tokens = (value) => String(value).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const contains = (field, term) => {
  if (/^[a-z0-9]+$/i.test(term)) return tokens(field).includes(term);
  return normalizeSongText(field).includes(normalizeSongText(term));
};

// Strip commands only at the edges: words such as “寻找” and “音乐” can be titles.
export function songQuery(prompt) {
  return prompt.trim()
    .replace(/^(?:(?:请|帮我|给我|为我)\s*)+/, '')
    .replace(/^(?:找一首|找一些|找点|找歌|找|搜索|播放|放一首|放点|推荐|生成|整理|听听)\s*/, '')
    .replace(/^(?:search|play|find|recommend)\s+/i, '')
    .replace(/(?:的歌曲|的音乐|的歌|的歌单|歌单)$/, '').trim();
}

export function matchSongs(tracks, query = '', filters = {}) {
  const q = normalizeSongText(query);
  const words = tokens(query);
  if (query.trim() && !words.length) return [];
  const matches = [];
  for (const track of tracks) {
    const title = normalizeSongText(track.title);
    const artist = normalizeSongText(track.artist);
    const aliases = (track.aliases || []).map(normalizeSongText);
    // Structured constraints are never relaxed by a higher user rating.
    if (['title', 'artist', 'album', 'version'].some((key) => {
      if (!filters[key]) return false;
      if(key === 'version' && /^(原版|原曲|录音室|原唱|studio|original)$/i.test(filters[key].trim())) return /(?:\blive\b|\bremix\b|\bcover\b|\binstrumental\b|off[ -]?vocal|伴奏|翻唱|现场|ライブ|歌ってみた)/i.test(track.title);
      const fields = key === 'version' ? [track.title, track.album] : [track[key], ...(key === 'title' ? track.aliases || [] : [])];
      const constraint = tokens(filters[key]);
      return !constraint.length || !fields.some((field) => normalizeSongText(field) === normalizeSongText(filters[key]) || constraint.every((word) => contains(field || '', word)));
    })) continue;
    const exactTitle = Boolean(q && (title === q || aliases.includes(q)));
    const exactIdentity = Boolean(q && artist && [title,...aliases].some(name=>name + artist === q || artist + name === q));
    const identity = [track.title, track.artist, ...(track.aliases || [])];
    const fields = [...identity, track.album, track.genre, track.block, track.note, track.neteaseId, track.qqId].map((v) => v || '');
    if (q && !exactTitle && !exactIdentity && !words.every((word) => fields.some((field) => contains(field, word)))) continue;
    const identityMatch = words.length > 0 && words.every((word) => identity.some((field) => contains(field || '', word)));
    const score = exactTitle ? 100 : exactIdentity ? 95 : identityMatch ? 70 : q ? 30 : 0;
    matches.push({ track, score, reason: exactTitle ? '歌名或别名完全匹配' : exactIdentity ? '歌名与歌手匹配' : identityMatch ? '歌名／歌手关键词匹配' : q ? '专辑或标签匹配' : '曲库筛选' });
  }
  return matches.sort((a, b) => b.score - a.score || (b.track.rating || 0) - (a.track.rating || 0));
}
