'use strict';

function playbackPassage(track, cursor, lyrics) {
  if (!track) return { status: 'no_playback', track: null };
  const position = Number.isFinite(cursor.time) ? Math.max(0, cursor.time) : null;
  const lines = lyrics?.lines || [];
  // Use the same tolerance as the visible karaoke highlight.
  const index = position === null ? -1 : lines.findLastIndex(line => line.time <= position + 0.08);
  const lineAt = i => {
    const line = lines[i];
    return line ? { number: i + 1, time: line.time, text: line.text, translation: line.translation || '' } : null;
  };
  return { track: { id: track.id, title: track.title, artist: track.artist, album: track.album, duration: track.duration },
    position, playing: Boolean(cursor.playing), nextCueTime: lines[index + 1]?.time ?? null,
    status: !lines.length ? 'no_timed_lyrics' : position === null ? 'unknown_position' : index < 0 ? 'before_first_line' : 'timed_line',
    previous: lineAt(index - 1), current: lineAt(index), next: position === null ? null : lineAt(index + 1) };
}

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const sheetWords = /乐谱|谱面|曲谱|琴谱|简谱|五线谱|吉他谱|钢琴谱|楽譜|sheet music|score|chords?|tablature/i;

function neteasePreviewImages(payload) {
  const urls = [];
  function visit(value) {
    if (urls.length >= 16 || !value) return;
    if (typeof value === 'string') {
      try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
            /(?:^|\.)(?:music\.126\.net|music\.163\.com)$/i.test(url.hostname)) {
          url.protocol = 'https:';
          if (!urls.includes(url.href)) urls.push(url.href);
        }
      } catch { /* Not a URL. */ }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (!/cover|icon|avatar|thumbnail/i.test(key)) visit(child);
      }
    }
  }
  visit(payload);
  return urls;
}

async function neteaseScores(track, invoke) {
  await invoke('netease.startService');
  let id = track.neteaseId;
  if (!id) {
    const result = await invoke('netease.searchRich', { keywords: [track.title, track.artist].join(' '), limit: 8 });
    let matches = (result.songs || []).filter(row => normalize(row.name) === normalize(track.title) &&
      normalize(track.artist) && normalize(row.artists) === normalize(track.artist));
    if (matches.length > 1 && track.album) matches = matches.filter(row => normalize(row.album) === normalize(track.album));
    if (matches.length !== 1) return { status: 'no_unique_recording' };
    id = matches[0].id;
  }
  const list = await invoke('netease.scoreList', { id });
  const sheets = (Array.isArray(list) ? list : []).slice(0, 16).map(row => ({
    id: String(row.id), name: row.name, arrangement: row.playVersion, key: row.musicKey,
    bpm: row.bpm || null, pages: row.totalPageSize, style: row.chordName
  }));
  const url = 'https://music.163.com/song?id=' + encodeURIComponent(id);
  const result = { url, sheets, status: sheets.length ? 'catalogue' : 'no_scores' };
  // Vocal sheets have the best chance of including lyrics for passage alignment.
  const selected = sheets.find(sheet => /人声|弹唱/.test(sheet.name + sheet.arrangement)) || sheets[0];
  if (selected) {
    const alternate = sheets.find(sheet => sheet.id !== selected.id && sheet.name !== selected.name);
    for (const sheet of [selected, alternate].filter(Boolean)) {
      result.previewSheetId = sheet.id;
      try {
        result.images = neteasePreviewImages(await invoke('netease.scorePreview', { id: sheet.id }));
        result.previewStatus = result.images.length ? 'available' : 'no_visible_pages';
        if (result.images.length) break;
      } catch (error) { result.previewStatus = error.message; break; }
    }
  }
  return result;
}

async function webScores(track, searchWeb, fetchWeb, passage) {
  const query = [track.title.slice(0, 66), (track.artist || '').slice(0, 36), '乐谱 楽譜 sheet music chords'].join(' ');
  const { results } = await searchWeb({ query, count: 5, needContent: true });
  const pages = [];
  for (const result of results) {
    if (pages.length === 3) break;
    if (!sheetWords.test([result.title, result.snippet, result.content].join(' '))) continue;
    if (!normalize([result.title, result.snippet, result.content].join(' ')).includes(normalize(track.title))) continue;
    let content = result.content;
    if (!content) {
      try { content = (await fetchWeb(result.url)).content; } catch { /* Keep this as a search lead only. */ }
    }
    const images = [];
    for (const match of (content || '').matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      if (!sheetWords.test(match[1] + ' ' + match[2]) || /logo|avatar|cover|封面/i.test(match[1])) continue;
      try {
        const url = new URL(match[2], result.url);
        if (url.protocol === 'https:' && !url.username && !url.password) images.push(url.href);
      } catch { /* Skip malformed Markdown links. */ }
    }
    const line = passage?.current?.text;
    const offset = line && content ? content.indexOf(line) : -1;
    const artistMentioned = Boolean(track.artist && normalize([result.title, content].join(' ')).includes(normalize(track.artist)));
    pages.push({ title: result.title, url: result.url, artistMentioned, status: content ? 'page_text' : 'search_lead',
      text: (content || result.snippet || '').slice(0, 2400),
      repeatedLyric: offset >= 0 && content.indexOf(line, offset + line.length) >= 0,
      nearLyric: offset >= 0 ? content.slice(Math.max(0, offset - 380), offset + line.length + 380) : '',
      images: images.slice(0, 8) });
  }
  return pages;
}

async function lookupScore({track, invoke, searchWeb, fetchWeb, passage, registerPage}) {
  const [catalogue, sites] = await Promise.allSettled([
    neteaseScores(track, invoke), webScores(track, searchWeb, fetchWeb, passage)
  ]);
  const netease = catalogue.status === 'fulfilled' ? catalogue.value : { status: 'unavailable', reason: catalogue.reason.message };
  const web = sites.status === 'fulfilled' ? sites.value : [];
  for (const item of [netease, ...web]) {
    const images = item.images || [];
    item.previewPages = images.map((url, index) => registerPage(url, item.url, index + 1));
    delete item.images;
  }
  return { song: {title:track.title, artist:track.artist, album:track.album}, netease, web,
    webError: sites.status === 'rejected' ? sites.reason.message : undefined };
}

module.exports = { playbackPassage, lookupScore };
