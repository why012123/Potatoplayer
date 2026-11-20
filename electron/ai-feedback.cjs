'use strict';

const { compact } = require('./ai-search.cjs');
const DOWNLOAD_TOOLS = new Set(['download_netease', 'download_qq', 'upgrade_track_quality', 'change_track_quality']);
const TERMINAL = new Set(['done', 'error', 'cancelled', 'unknown']);

function downloadReceipt(data, status = 'queued') {
  if (typeof data?.jobId !== 'string' || !data.jobId) return null;
  return {
    jobId: compact(data.jobId, 120), status, title: compact(data.title, 160),
    phase: compact(data.phase, 40), quality: compact(data.quality, 40),
    requestedQuality: compact(data.requestedQuality, 40), previousQuality: compact(data.previousQuality, 40),
    direction: compact(data.direction, 20),
    duplicate: Boolean(data.duplicate), replaced: Boolean(data.replaced),
    upgradeUnavailable: Boolean(data.upgradeUnavailable), downgradeUnavailable: Boolean(data.downgradeUnavailable),
    message: compact(data.message, 280),
  };
}

function outcome(name, output, args) {
  if (output?.cancelled) return { status: 'cancelled' };
  if (output?.ok === false || output?.error) return { status: 'error', detail: compact(output.message || output.error) };
  if (DOWNLOAD_TOOLS.has(name)) {
    const queued = Array.isArray(output?.queued) ? output.queued : [output];
    const jobs = queued.map(item => downloadReceipt(item)).filter(Boolean);
    const skipped = (output?.skipped || []).map(row => compact([row.title, row.reason || row.error].filter(Boolean).join(' · '), 120));
    return {
      status: jobs.length ? (skipped.length ? 'partial' : 'queued') : 'skipped',
      detail: skipped.slice(0, 5).join(' / ') || (!jobs.length ? 'No download was queued / 没有任务加入下载队列' : ''),
      jobs,
    };
  }
  if (name === 'update_tracks') {
    const count = output.updated.length;
    const skipped = (output.skipped || []).map(row => compact([row.title, row.reason].filter(Boolean).join(' · '), 120));
    return {
      status: skipped.length ? count ? 'partial' : 'error' : 'done',
      detail: [`${count} · ${Object.keys(args.patch).join(', ')}`, ...skipped.slice(0, 5)].join(' / '),
    };
  }
  if (name === 'set_favorite') {
    const skipped = (output.skipped || []).map(row => compact([row.title, row.reason].filter(Boolean).join(' · '), 120));
    return { status: skipped.length ? output.updated ? 'partial' : 'error' : 'done',
      detail: [String(output.updated), ...skipped.slice(0, 5)].join(' / ') };
  }
  if (name === 'remember_song') return { status: 'done', detail: compact(output?.memory?.title) };
  if (name === 'remember_preference') return { status: 'done', detail: compact(output?.memory?.text) };
  if (name === 'manage_playlist') return { status: 'done', detail: compact(output?.playlist?.name || output?.name) };
  return { status: 'done' };
}

function attachJobStates(action, resolve) {
  if (!action.jobs?.length) return action;
  const jobs = action.jobs.map(resolve);
  if (jobs.some(job => !TERMINAL.has(job.status))) return { ...action, jobs };
  const completed = jobs.filter(job => job.status === 'done' && !job.upgradeUnavailable && !job.downgradeUnavailable).length;
  let status = 'done';
  if (completed && (completed < jobs.length || action.detail)) status = 'partial';
  if (!completed) {
    if (jobs.some(job => job.status === 'error')) status = 'error';
    else if (jobs.every(job => job.status === 'cancelled')) status = 'cancelled';
    else if (jobs.some(job => job.status === 'unknown')) status = 'unknown';
    else status = 'skipped';
  }
  return { ...action, status, jobs };
}

function createDownloadTracker(onTerminal) {
  const jobs = new Map();
  function observe({ event, data } = {}) {
    const status = {
      'download.progress': data?.phase === 'queued' ? 'queued' : 'running',
      'download.done': 'done', 'download.error': 'error', 'download.cancelled': 'cancelled',
    }[event];
    if (!status || !data?.jobId) return;
    const previous = jobs.get(data.jobId);
    if (TERMINAL.has(previous?.status)) return;
    const receipt = downloadReceipt({ ...previous, ...data, title: data.title || previous?.title }, status);
    jobs.delete(receipt.jobId);
    jobs.set(receipt.jobId, receipt);
    if (jobs.size > 1000) jobs.delete(jobs.keys().next().value);
    if (TERMINAL.has(status)) onTerminal(receipt);
  }
  return {
    observe,
    snapshot: () => [...jobs.values()].reverse(),
    latest: receipt => {
      const latest = jobs.get(receipt.jobId);
      return latest ? { ...receipt, ...latest, title: latest.title || receipt.title,
        requestedQuality: latest.requestedQuality || receipt.requestedQuality,
        previousQuality: latest.previousQuality || receipt.previousQuality } : receipt;
    },
  };
}

module.exports = { createDownloadTracker, downloadReceipt, outcome, attachJobStates, TERMINAL, DOWNLOAD_TOOLS };
