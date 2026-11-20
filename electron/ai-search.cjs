'use strict';

const SCOPES = ['tracks', 'quality', 'impressions', 'history', 'playlists', 'lyrics', 'stats', 'settings', 'playback', 'downloads', 'ultra'];
const DEFAULT_SCOPES = ['tracks', 'impressions', 'history', 'playlists'];
const PLAYBACK_FIELDS = ['trackId', 'playing', 'time', 'duration', 'volume', 'muted', 'repeat', 'shuffle', 'queue', 'queueIndex', 'engine', 'available'];
const AUDIO_FIELDS = ['playbackEngine', 'outputMode', 'exclusive', 'followSourceRate', 'crossfeedEnabled', 'crossfeedStrength', 'spatialEnabled', 'spatialX', 'spatialY'];
const normalize = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const compact = (value, max = 280) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

function searchScore(terms, fields) {
  if (!terms.length) return 1;
  const values = fields.map(normalize).filter(Boolean);
  return Math.max(0, ...terms.map(term => values.includes(term) ? 3 : values.some(value => value.includes(term)) ? 2 : 0));
}

async function searchApp({ args, data, invoke, memory, conversations, downloads, appearance, publicTrack }) {
  const { matchSongs } = await import('./song-match.mjs');
  const scopes = [...new Set(args.scopes?.length ? args.scopes : DEFAULT_SCOPES)];
  const limit = Math.floor(args.limit ?? 8);
  const offset = Math.floor(args.offset ?? 0);
  const query = compact(args.query);
  const queries = [query, ...(args.alternatives || [])].filter(term => normalize(term));
  const terms = [...new Set(queries.map(normalize))];
  const allTracks = data.tracks || [];
  const byId = new Map(allTracks.map(track => [track.id, track]));
  const favorites = new Set(data.favorites || []);
  const trackIds = new Set(args.trackIds || []);
  const trackFilters = Boolean(trackIds.size || args.minRating !== undefined || args.favoritesOnly || args.title ||
    args.artist || args.album || args.version || args.codec || args.minSampleRate || args.minBitDepth || args.minChannels);
  const eligible = matchSongs(allTracks.filter(track => (!trackIds.size || trackIds.has(track.id)) &&
    (!args.favoritesOnly || favorites.has(track.id)) &&
    (track.rating || 0) >= (args.minRating ?? 0) &&
    (!args.codec || normalize(track.codec) === normalize(args.codec)) &&
    (track.sampleRate || 0) >= (args.minSampleRate ?? 0) &&
    (track.bitDepth || 0) >= (args.minBitDepth ?? 0) &&
    (track.channels || 0) >= (args.minChannels ?? 0)), '', args).map(x => x.track);
  const eligibleIds = new Set(eligible.map(track => track.id));
  const hasLocalTrack = id => byId.has(id) && (!trackFilters || eligibleIds.has(id));
  const simplify = track => ({...publicTrack(track), note: compact(track.note), favorite: favorites.has(track.id)});
  const hits = [];
  const groups = {};
  const failures = {};
  const add = (scope, rows) => {
    groups[scope] = { total: rows.length, items: rows.slice(offset, offset + limit), nextOffset: offset + limit < rows.length ? offset + limit : null };
    hits.push(...groups[scope].items);
  };
  const recordTrack = (scope, track, extra = {}) => ({
    source: scope, trackId: track.id, title: track.title, artist: track.artist, ...extra,
  });

  for (const scope of scopes) {
    try {
      if (scope === 'tracks' || scope === 'quality') {
        const scores = new Map();
        for (const term of queries) {
          for (const { track, score } of matchSongs(eligible, term)) {
            scores.set(track.id, Math.max(scores.get(track.id) || 0, score));
          }
        }
        const ranked = eligible.map(track => ({
          track, score: Math.max(scores.get(track.id) || 0, searchScore(terms, [scope === 'quality' ? track.codec : ''])),
        })).filter(row => row.score).sort((a, b) => b.score - a.score);
        add(scope, ranked.map(({track}) => recordTrack(scope, track, { track: simplify(track) })));
      }
      if (scope === 'ultra') {
        const { buildArchives } = require('./ultra-archives.cjs');
        const rows = (buildArchives(data)?.records || []).filter(record => eligibleIds.has(record.trackId) &&
          searchScore(terms, [record.id, record.title, record.en, record.genre, record.category, record.date, record.abstract]));
        add(scope, rows.map(record => ({
          source: 'ultra', trackId: record.trackId, archiveId: record.id, title: record.title, artist: record.en,
          column: record.category, genre: record.genre, album: record.date, abstract: compact(record.abstract),
        })));
      }
      if (scope === 'impressions') {
        if (!memory) throw Error('歌曲记忆服务不可用');
        const snapshot = memory.snapshot();
        const rows = snapshot.songs.filter(entry => hasLocalTrack(entry.trackId)).flatMap(entry => {
          const identity = [entry.title, entry.artist, entry.album];
          return [
            { text: entry.summary, kind: 'summary' },
            ...entry.facts.map(fact => ({ text: fact.text, kind: 'fact', factId: fact.id, author: fact.source, tags: fact.tags })),
          ].filter(item => item.text).map(item => ({
            item, entry, score: searchScore(terms, [item.text, ...(item.tags || []), ...identity]),
          }));
        }).filter(row => row.score).sort((a,b) => b.score - a.score);
        add(scope, [
          ...rows.map(({item, entry}) => recordTrack('song_memory', byId.get(entry.trackId), { ...item, text: compact(item.text) })),
          ...(!trackFilters ? snapshot.profile.filter(entry => searchScore(terms, [entry.text, ...entry.tags]))
            .map(entry => ({ source: 'profile_memory', id: entry.id, text: compact(entry.text), author: entry.source })) : []),
        ]);
      }
      if (scope === 'history') {
        const rows = (conversations?.searchTurns() || []).map(row => {
          const track = byId.get(row.contextTrackId);
          return { ...row, score: searchScore(terms, [row.prompt, row.answer, row.title, track?.title, track?.artist]) };
        }).filter(row => row.score && (!trackFilters || eligibleIds.has(row.contextTrackId)))
          .sort((a,b) => b.score - a.score || b.createdAt - a.createdAt);
        add(scope, rows.map(row => ({
          source: 'history', conversationId: row.conversationId, turnId: row.turnId,
          title: row.title, createdAt: row.createdAt, contextTrackId: row.contextTrackId,
          trackTitle: byId.get(row.contextTrackId)?.title, prompt: compact(row.prompt, 480), answer: compact(row.answer),
        })));
      }
      if (scope === 'playlists') {
        const rows = (data.playlists || []).map(playlist => {
          const members = (playlist.trackIds || []).filter(id => byId.has(id));
          const titleHits = members.filter(id => searchScore(terms, [byId.get(id).title, byId.get(id).artist]));
          return { playlist, members, titleHits };
        }).filter(({playlist, members, titleHits}) => (searchScore(terms, [playlist.name]) || titleHits.length) &&
          (!trackFilters || members.some(id => eligibleIds.has(id))));
        add(scope, rows.map(({playlist, members, titleHits}) => ({
          source: 'playlists', playlistId: playlist.id, title: playlist.name, count: members.length,
          matches: (trackFilters ? members.filter(id => eligibleIds.has(id)) : terms.length && titleHits.length ? titleHits : members)
            .slice(0, 12).map(id => recordTrack('tracks', byId.get(id))),
        })));
      }
      if (scope === 'lyrics') {
        if (!terms.length && !trackFilters) throw Error('请给出歌词关键词或指定歌曲');
        // Scan pages on demand, since lyrics can be live sidecar files edited outside the app.
        const page = eligible.slice(offset, offset + 30);
        const rows = [];
        let checked = 0;
        for (const track of page) {
          const lyrics = await invoke('lyrics.get', { trackId: track.id });
          checked++;
          const lines = (lyrics?.lines || []).filter(line => searchScore(terms, [line.text, line.translation]));
          if (lines.length) rows.push(recordTrack('lyrics', track, {
            lines: lines.slice(0, 3).map(line => ({ time: line.time, text: compact(line.text), translation: compact(line.translation) })),
          }));
          if (rows.length >= limit) break;
        }
        groups.lyrics = {
          items: rows, checked, candidates: eligible.length,
          nextOffset: offset + checked < eligible.length ? offset + checked : null,
        };
        hits.push(...rows);
      }
      if (scope === 'stats') {
        const stats = await invoke('stats.get');
        const days = (stats.days || []).filter(day => (!args.fromDate || day.date >= args.fromDate) &&
          (!args.toDate || day.date <= args.toDate));
        const tracks = (stats.tracks || []).filter(track => (!trackFilters || eligibleIds.has(track.trackId)) &&
          searchScore(terms, [track.title, track.artist]));
        const scopedDays = terms.length ? days.filter(day => searchScore(terms, [day.date])) : days;
        const trackRows = tracks.map(track => ({ source: 'stats', period: 'all_time', ...pick(track, ['trackId', 'title', 'artist', 'seconds', 'plays', 'lastPlayedAt']) }));
        const dayRows = scopedDays.map(day => ({ source: 'stats', period: 'day', ...pick(day, ['date', 'seconds', 'plays', 'hours']) })).reverse();
        groups.stats = {
          dayCount: days.length, periodSeconds: days.reduce((sum, day) => sum + (day.seconds || 0), 0),
          periodPlays: days.reduce((sum, day) => sum + (day.plays || 0), 0),
          // Day totals and all-time per-song totals are separate data; no date-by-song attribution exists.
          days: dayRows.slice(offset, offset + limit), tracks: trackRows.slice(offset, offset + limit),
          nextOffset: offset + limit < Math.max(dayRows.length, trackRows.length) ? offset + limit : null,
        };
        hits.push(...groups.stats.tracks);
      }
      if (scope === 'settings') {
        const eq = await invoke('eq.state');
        const preset = value => value ? pick(value, ['name', 'preamp', 'points', 'bands']) : null;
        groups.settings = {
          source: 'settings', audio: pick(data.settings, AUDIO_FIELDS),
          appearance: pick(appearance, ['language', 'theme', 'accent', 'style', 'display', 'corners', 'density', 'atmosphere', 'animationLevel', 'backgroundTransition', 'pageTransitions']),
          graphics: pick(appearance?.graphics, ['glassBlur', 'controlBlur', 'coverBackground', 'backgroundDetail', 'shadows']),
          eq: { enabled: eq?.enabled, available: eq?.available, engine: eq?.engine, global: preset(eq?.global),
            songPreset: preset(eq?.songPreset), currentTrack: pick(eq?.currentTrack, ['id', 'title', 'artist', 'hasSongPreset']),
            presets: (eq?.presets || []).filter(p => searchScore(terms, [p.name])).slice(offset, offset + limit).map(preset),
          },
        };
      }
      if (scope === 'playback') {
        const state = await invoke('playback.state');
        const current = byId.get(state?.trackId);
        groups.playback = {
          source: 'playback', state: pick(state, PLAYBACK_FIELDS.filter(key => key !== 'queue')),
          queueCount: state?.queue?.length ?? 0,
          current: current ? simplify(current) : null,
          queue: (state?.queue || []).slice(offset, offset + limit).filter(id => byId.has(id)).map(id => recordTrack('tracks', byId.get(id))),
        };
      }
      if (scope === 'downloads') {
        add(scope, downloads().filter(job => searchScore(terms, [job.title, job.jobId, job.status, job.phase, job.quality]))
          .map(job => ({ source: 'downloads', ...job })));
      }
    } catch (error) {
      failures[scope] = compact(error.message, 180);
    }
  }
  return { groups, failures, trackIds: [...new Set(hits.map(row => row.trackId).filter(id => byId.has(id)))].slice(0, 12) };
}

module.exports = { SCOPES, searchApp, compact };
