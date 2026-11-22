'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_CONVERSATIONS = 200;
const MAX_TURNS = 80;
const MAX_TITLE = 80;
const MAX_PROMPT = 4000;
const MAX_EXPLANATION = 20000;

function now() {
  return Date.now();
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanTagList(value, maxItems = 8, maxLength = 32) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

const { downloadReceipt, attachJobStates } = require('./ai-feedback.cjs');

function cleanJob(value) {
  if (!['queued', 'running', 'done', 'error', 'cancelled', 'unknown'].includes(value?.status)) return null;
  return downloadReceipt(value, value.status);
}

function cleanLocalSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).filter(item => item && typeof item.source === 'string').map(item => ({
    source: text(item.source, 40), title: text(item.title, 200), preview: text(item.preview, 300),
    conversationId: text(item.conversationId, 120), turnId: text(item.turnId, 120), trackId: text(item.trackId, 120),
  }));
}

function cleanActions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 40)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = text(item.name, 60);
      const status = text(item.status, 20) || 'done';
      const detail = text(item.detail, 500);
      const jobs = Array.isArray(item.jobs) ? item.jobs.slice(0, 100).map(cleanJob).filter(Boolean) : [];
      return name ? { name, status, operation: item.operation === true, ...(detail ? { detail } : {}),
        ...(jobs.length ? { jobs } : {}) } : null;
    })
    .filter(Boolean);
}

function cleanSources(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = text(item.title, 200);
      const url = text(item.url, 2000);
      const site = text(item.site, 120);
      if (!title || !/^https?:\/\//i.test(url)) return null;
      return { title, url, ...(site ? { site } : {}) };
    })
    .filter(Boolean);
}

function cleanResult(value) {
  if (!value || typeof value !== 'object') return undefined;
  const intent = ['search', 'play', 'playlist', 'similar'].includes(value.intent) ? value.intent : 'search';
  const trackIds = Array.isArray(value.trackIds)
    ? [...new Set(value.trackIds.filter((id) => typeof id === 'string' && id.length <= 120))].slice(0, 50)
    : [];
  const actions = cleanActions(value.actions);
  const sources = cleanSources(value.sources);
  const localSources = cleanLocalSources(value.localSources);
  return {
    intent,
    title: text(value.title, 300),
    explanation: text(value.explanation, MAX_EXPLANATION),
    trackIds,
    ...(actions.length ? { actions } : {}),
    ...(sources.length ? { sources } : {}),
    ...(localSources.length ? { localSources } : {}),
    ...(typeof value.downloadSummary === 'string' ? { downloadSummary: text(value.downloadSummary, 1000) } : {}),
  };
}

function cleanTurn(value) {
  const prompt = text(value?.prompt, MAX_PROMPT);
  const error = text(value?.error, MAX_EXPLANATION);
  const result = cleanResult(value?.result);
  if (!prompt && !result && !error) throw new Error('消息不能为空');
  const activity = Array.isArray(value?.activity)
    ? value.activity.map((item) => text(item, 500)).filter(Boolean).slice(0, 40)
    : [];
  return {
    id: text(value?.id, 80) || `turn-${now()}-${crypto.randomBytes(4).toString('hex')}`,
    prompt,
    createdAt: Number.isFinite(value?.createdAt) ? value.createdAt : now(),
    ...(result ? { result } : {}),
    ...(error ? { error } : {}),
    ...(activity.length ? { activity } : {}),
    ...(value?.provider === 'deepseek' || value?.provider === 'local' ? { provider: value.provider } : {}),
    ...(Number.isInteger(value?.imageCount) && value.imageCount > 0 ? { imageCount: Math.min(4, value.imageCount) } : {}),
    ...(typeof value?.contextTrackId === 'string' && value.contextTrackId ? { contextTrackId: text(value.contextTrackId, 120) } : {}),
  };
}

function deriveTitle(turn) {
  const prompt = String(turn.prompt || '').replace(/\s+/g, ' ').trim();
  if (prompt) return prompt.slice(0, 48) || '新对话';
  if (turn.result?.title) return text(turn.result.title, 48);
  return '新对话';
}

function emptyStore() {
  return { version: 1, conversations: [] };
}

function loadStore(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || !Array.isArray(raw.conversations)) return emptyStore();
    const stamp = now();
    return {
      version: 1,
      conversations: raw.conversations
        .filter((item) => item && typeof item.id === 'string' && item.id)
        .map((item) => ({
          id: item.id,
          title: text(item.title, MAX_TITLE) || '新对话',
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : stamp,
          updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : stamp,
          pinned: Boolean(item.pinned),
          turns: Array.isArray(item.turns) ? item.turns.filter((turn) => turn && typeof turn === 'object') : [],
        })),
    };
  } catch {
    return emptyStore();
  }
}

function createConversationStore({ dataDir, emit }) {
  const file = path.join(dataDir, 'ai-conversations.json');
  const state = loadStore(file);
  let lastUpdated = 0;

  function summary(conversation) {
    const turns = Array.isArray(conversation.turns) ? conversation.turns : [];
    const last = turns.at(-1);
    const songIds = [...new Set(turns.flatMap((turn) => [
      ...(Array.isArray(turn.result?.trackIds) ? turn.result.trackIds : []),
      ...(turn.contextTrackId ? [turn.contextTrackId] : []),
    ]))].slice(0, 40);
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      pinned: Boolean(conversation.pinned),
      turnCount: turns.length,
      preview: text(
        last?.result?.explanation || last?.error || last?.prompt || '',
        160,
      ).replace(/\s+/g, ' '),
      songIds,
    };
  }

  function persist() {
    if (state.conversations.length > MAX_CONVERSATIONS) {
      const keep = new Set(
        [...state.conversations]
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
          .slice(0, MAX_CONVERSATIONS)
          .map((item) => item.id),
      );
      state.conversations = state.conversations.filter((item) => keep.has(item.id));
    }
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, file);
    lastUpdated = now();
  }

  function find(id) {
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) throw new Error('对话不存在或已被删除');
    return conversation;
  }

  function list() {
    return [...state.conversations]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map(summary);
  }

  function get(id) {
    const conversation = find(String(id || ''));
    return structuredClone(conversation);
  }

  function create({ title } = {}) {
    const stamp = now();
    const conversation = {
      id: `conv-${stamp}-${crypto.randomBytes(4).toString('hex')}`,
      title: text(title, MAX_TITLE) || '新对话',
      createdAt: stamp,
      updatedAt: stamp,
      pinned: false,
      turns: [],
    };
    state.conversations.unshift(conversation);
    persist();
    emit?.({ event: 'ai.conversation.updated', data: summary(conversation) });
    return summary(conversation);
  }

  function append(id, value) {
    const conversation = find(String(id || ''));
    const turn = cleanTurn(value || {});
    if (conversation.turns.length === 0 && (!conversation.title || conversation.title === '新对话')) {
      conversation.title = deriveTitle(turn);
    }
    conversation.turns.push(turn);
    if (conversation.turns.length > MAX_TURNS) conversation.turns = conversation.turns.slice(-MAX_TURNS);
    conversation.updatedAt = now();
    persist();
    const info = summary(conversation);
    emit?.({ event: 'ai.conversation.updated', data: info });
    return { conversation: info, turn };
  }

  function rename(id, title) {
    const conversation = find(String(id || ''));
    const next = text(title, MAX_TITLE);
    if (!next) throw new Error('对话标题不能为空');
    conversation.title = next;
    conversation.updatedAt = now();
    persist();
    const info = summary(conversation);
    emit?.({ event: 'ai.conversation.updated', data: info });
    return info;
  }

  function setPinned(id, pinned) {
    const conversation = find(String(id || ''));
    conversation.pinned = Boolean(pinned);
    conversation.updatedAt = now();
    persist();
    const info = summary(conversation);
    emit?.({ event: 'ai.conversation.updated', data: info });
    return info;
  }

  function remove(id) {
    const index = state.conversations.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('对话不存在或已被删除');
    const [removed] = state.conversations.splice(index, 1);
    persist();
    emit?.({ event: 'ai.conversation.deleted', data: { id: removed.id } });
    return { ok: true, id: removed.id };
  }

  function searchTurns() {
    return state.conversations.flatMap(conversation => conversation.turns.filter(turn => turn.prompt).map(turn => ({
      conversationId: conversation.id, turnId: turn.id, title: conversation.title,
      createdAt: turn.createdAt, contextTrackId: turn.contextTrackId, prompt: turn.prompt,
      answer: turn.result?.explanation,
    })));
  }

  function updateDownload(receipt) {
    const updates = [];
    for (const conversation of state.conversations) {
      for (const turn of conversation.turns) {
        let changed = false;
        if (!turn.result?.actions) continue;
        turn.result.actions = turn.result.actions.map(action => {
          if (!action.jobs?.some(job => job.jobId === receipt.jobId)) return action;
          changed = true;
          return attachJobStates(action, job => job.jobId === receipt.jobId ? { ...job, ...receipt, title: receipt.title || job.title } : job);
        });
        if (changed) updates.push({ conversationId: conversation.id, turnId: turn.id, actions: turn.result.actions, receipt });
      }
    }
    if (updates.length) persist();
    for (const data of updates) emit?.({ event: 'ai.download.updated', data });
    return updates;
  }

  function finishDownloadReport(conversationId, turnId, summaryText) {
    const turn = state.conversations.find(item => item.id === conversationId)?.turns.find(item => item.id === turnId);
    if (!turn?.result) return;
    turn.result.downloadSummary = text(summaryText, 1000);
    persist();
    emit?.({ event: 'ai.download.updated', data: { conversationId, turnId, downloadSummary: turn.result.downloadSummary } });
  }

  function markInterruptedDownloads() {
    let changed = false;
    for (const conversation of state.conversations) {
      for (const turn of conversation.turns) {
        if (!turn.result?.actions) continue;
        turn.result.actions = turn.result.actions.map(action => attachJobStates(action, job => {
          if (job.status !== 'queued' && job.status !== 'running') return job;
          changed = true;
          return { ...job, status: 'unknown' };
        }));
      }
    }
    if (changed) persist();
  }

  function downloadHistory() {
    return state.conversations.flatMap(conversation => conversation.turns.flatMap(turn =>
      (turn.result?.actions || []).flatMap(action => (action.jobs || []).map(job => ({
        ...job, conversationId: conversation.id, turnId: turn.id,
      })))));
  }

  function downloadContext(id) {
    const { turns } = find(id);
    return turns.flatMap(turn => (turn.result?.actions || []).flatMap(action => action.jobs || [])).slice(-20);
  }

  function messages(id, limit = 8) {
    const conversation = find(String(id || ''));
    const turns = conversation.turns.slice(-Math.max(1, Math.min(20, limit)));
    return turns.flatMap((turn) => {
      const messages = [{ role: 'user', content: turn.imageCount ? turn.prompt + ' [历史附图 ' + turn.imageCount + ' 张，本轮未重传]' : turn.prompt }];
      const content = turn.result?.explanation || turn.error || (turn.result?.title ?? '');
      if (content) messages.push({ role: 'assistant', content });
      return messages;
    });
  }

  return {
    list,
    get,
    create,
    append,
    rename,
    setPinned,
    remove,
    messages,
    has: id => state.conversations.some(conversation => conversation.id === id),
    searchTurns,
    updateDownload,
    finishDownloadReport,
    markInterruptedDownloads,
    downloadContext,
    downloadHistory,
    file,
    stats: () => ({ conversations: state.conversations.length, updatedAt: lastUpdated || Math.max(0, ...state.conversations.map((item) => item.updatedAt || 0)) }),
  };
}

module.exports = { createConversationStore };
