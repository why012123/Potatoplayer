'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FACTS = 40;
const MAX_PROFILE = 120;
const MAX_CONTEXT_CHARS = 3600;

function now() {
  return Date.now();
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function tags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => clean(item, 24)).filter(Boolean))].slice(0, 8);
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function emptyState() {
  return { version: 1, songs: {}, profile: [] };
}

function load(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyState();
    const stamp = now();
    const songs = {};
    if (raw.songs && typeof raw.songs === 'object' && !Array.isArray(raw.songs)) {
      for (const [trackId, entry] of Object.entries(raw.songs)) {
        if (!entry || typeof entry !== 'object' || !trackId) continue;
        songs[trackId] = {
          trackId,
          title: clean(entry.title, 300),
          artist: clean(entry.artist, 300),
          album: clean(entry.album, 300),
          year: Number.isFinite(entry.year) ? entry.year : 0,
          summary: clean(entry.summary, 600),
          facts: Array.isArray(entry.facts)
            ? entry.facts
                .filter((fact) => fact && typeof fact.text === 'string' && fact.text.trim())
                .map((fact) => ({
                  id: clean(fact.id, 80) || `fact-${stamp}-${crypto.randomBytes(3).toString('hex')}`,
                  text: clean(fact.text, 500),
                  createdAt: Number.isFinite(fact.createdAt) ? fact.createdAt : stamp,
                  source: fact.source === 'user' ? 'user' : 'ai',
                  tags: tags(fact.tags),
                }))
            : [],
          createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : stamp,
          updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : stamp,
        };
      }
    }
    return {
      version: 1,
      songs,
      profile: Array.isArray(raw.profile)
        ? raw.profile
            .filter((item) => item && typeof item.id === 'string' && clean(item.text, 500))
            .map((item) => ({
              id: item.id,
              text: clean(item.text, 500),
              tags: tags(item.tags),
              importance: Math.max(0, Math.min(3, Math.floor(Number(item.importance) || 0))),
              source: item.source === 'user' ? 'user' : 'ai',
              createdAt: Number.isFinite(item.createdAt) ? item.createdAt : stamp,
              updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : stamp,
            }))
        : [],
    };
  } catch {
    return emptyState();
  }
}

function createMemoryStore({ dataDir, emit }) {
  const file = path.join(dataDir, 'ai-memory.json');
  const state = load(file);

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, file);
  }

  function emitUpdate() {
    emit?.({ event: 'ai.memory.updated', data: snapshot().stats });
  }

  function cleanFact(value, source = 'ai') {
    if (typeof value === 'string') value = { text: value };
    const text = clean(value?.text, 500);
    if (!text) return null;
    return {
      id: clean(value?.id, 80) || `fact-${now()}-${crypto.randomBytes(3).toString('hex')}`,
      text,
      createdAt: Number.isFinite(value?.createdAt) ? value.createdAt : now(),
      source: value?.source === 'user' ? 'user' : source,
      tags: tags(value?.tags),
    };
  }

  function upsertSong(input = {}) {
    const trackId = clean(input.trackId, 120);
    if (!trackId) throw new Error('缺少歌曲 ID');
    const existing = state.songs[trackId];
    const summary = clean(input.summary, 600);
    const incomingFacts = Array.isArray(input.facts)
      ? input.facts.map((item) => cleanFact(item, input.source === 'user' ? 'user' : 'ai')).filter(Boolean)
      : [];
    if (!existing && !summary && !incomingFacts.length) throw new Error('记忆内容不能为空');
    const entry = existing || {
      trackId,
      title: '',
      artist: '',
      album: '',
      year: 0,
      summary: '',
      facts: [],
      createdAt: now(),
      updatedAt: now(),
    };
    entry.title = clean(input.title, 300) || entry.title;
    entry.artist = clean(input.artist, 300) || entry.artist;
    entry.album = clean(input.album, 300) || entry.album;
    if (Number.isFinite(input.year) && input.year > 0) entry.year = Math.floor(input.year);
    if (summary) entry.summary = summary;
    // AI tool writes append facts; the memory editor sends the complete list,
    // which also lets the user remove a line by deleting it.
    if (input.replaceFacts === true) entry.facts = [];
    const seen = new Set(entry.facts.map((fact) => normalize(fact.text)));
    for (const fact of incomingFacts) {
      if (seen.has(normalize(fact.text))) continue;
      seen.add(normalize(fact.text));
      entry.facts.push(fact);
    }
    if (entry.facts.length > MAX_FACTS) entry.facts = entry.facts.slice(-MAX_FACTS);
    entry.updatedAt = now();
    state.songs[trackId] = entry;
    persist();
    emitUpdate();
    return structuredClone(entry);
  }

  function deleteSong(trackId, factId) {
    const entry = state.songs[clean(trackId, 120)];
    if (!entry) throw new Error('这首歌还没有记忆');
    if (factId) {
      const before = entry.facts.length;
      entry.facts = entry.facts.filter((fact) => fact.id !== factId);
      if (entry.facts.length === before) throw new Error('记忆片段不存在');
      if (!entry.summary && !entry.facts.length) delete state.songs[entry.trackId];
      else entry.updatedAt = now();
    } else {
      delete state.songs[entry.trackId];
    }
    persist();
    emitUpdate();
    return { ok: true };
  }

  function upsertProfile(input = {}) {
    const value = clean(input.text, 500);
    if (!value) throw new Error('长期记忆内容不能为空');
    const id = clean(input.id, 80);
    let entry = id ? state.profile.find((item) => item.id === id) : state.profile.find((item) => normalize(item.text) === normalize(value));
    if (!entry) {
      entry = {
        id: id || `mem-${now()}-${crypto.randomBytes(3).toString('hex')}`,
        text: value,
        tags: tags(input.tags),
        importance: Math.max(0, Math.min(3, Math.floor(Number(input.importance) || 1))),
        source: input.source === 'user' ? 'user' : 'ai',
        createdAt: now(),
        updatedAt: now(),
      };
      state.profile.push(entry);
    } else {
      entry.text = value;
      entry.tags = tags(input.tags) || entry.tags;
      if (Number.isFinite(input.importance)) entry.importance = Math.max(0, Math.min(3, Math.floor(input.importance)));
      entry.source = input.source === 'user' ? 'user' : entry.source;
      entry.updatedAt = now();
    }
    if (state.profile.length > MAX_PROFILE) state.profile = state.profile.slice(-MAX_PROFILE);
    persist();
    emitUpdate();
    return structuredClone(entry);
  }

  function deleteProfile(id) {
    const before = state.profile.length;
    state.profile = state.profile.filter((item) => item.id !== id);
    if (state.profile.length === before) throw new Error('记忆条目不存在');
    persist();
    emitUpdate();
    return { ok: true };
  }

  function snapshot() {
    const songs = Object.values(state.songs)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => ({
        ...structuredClone(entry),
        factCount: entry.facts.length,
      }));
    const profile = [...state.profile].sort((a, b) => (b.importance || 0) - (a.importance || 0) || b.updatedAt - a.updatedAt);
    const facts = songs.reduce((sum, entry) => sum + entry.facts.length, 0);
    return {
      songs,
      profile,
      stats: {
        songs: songs.length,
        facts,
        profile: profile.length,
        updatedAt: Math.max(0, ...songs.map((item) => item.updatedAt || 0), ...profile.map((item) => item.updatedAt || 0)),
      },
    };
  }

  function findSong(trackId) {
    const entry = state.songs[clean(trackId, 120)];
    return entry ? structuredClone(entry) : null;
  }

  function context({ prompt = '', currentTrackId = '' } = {}) {
    const query = normalize(prompt);
    const sections = [];
    const current = currentTrackId ? state.songs[clean(currentTrackId, 120)] : null;
    if (current) {
      const facts = current.facts.slice(-6).map((fact) => fact.text);
      sections.push(`当前歌曲《${current.title || current.trackId}》的记忆：${[current.summary, ...facts].filter(Boolean).join("；")}`);
    }
    const mentioned = Object.values(state.songs)
      .filter((entry) => entry.trackId !== currentTrackId && query)
      .filter((entry) => {
        const title = normalize(entry.title);
        const artist = normalize(entry.artist);
        return (title.length > 1 && query.includes(title)) || (artist.length > 2 && query.includes(artist));
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
    for (const entry of mentioned) {
      sections.push(`歌曲《${entry.title}》/ ${entry.artist}：${[entry.summary, ...entry.facts.slice(-4).map((fact) => fact.text)].filter(Boolean).join("；")}`);
    }
    const profile = [...state.profile]
      .map((entry) => {
        const keywordHits = entry.tags.reduce(
          (count, tag) => count + (normalize(tag) && query.includes(normalize(tag)) ? 1 : 0),
          0,
        );
        return { entry, score: (entry.importance || 1) * 10 + keywordHits * 4 + (entry.updatedAt || 0) / 1e13 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ entry }) => `- ${entry.text}${entry.tags.length ? `（${entry.tags.join(' / ')}）` : ''}`);
    if (profile.length) sections.push(`用户长期偏好与事实：\n${profile.join('\n')}`);
    if (!sections.length) return '';
    return sections.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
  }

  function search(query) {
    const needle = normalize(query);
    if (!needle) return snapshot();
    const songs = Object.values(state.songs)
      .filter((entry) => normalize([entry.title, entry.artist, entry.album, entry.summary, ...entry.facts.map((fact) => fact.text)].join(' ')).includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => ({ ...structuredClone(entry), factCount: entry.facts.length }));
    const profile = state.profile.filter((entry) => normalize([entry.text, ...entry.tags].join(' ')).includes(needle));
    return { songs, profile, stats: snapshot().stats };
  }

  return {
    snapshot,
    findSong,
    upsertSong,
    deleteSong,
    upsertProfile,
    deleteProfile,
    context,
    search,
    file,
  };
}

module.exports = { createMemoryStore };
