import type { NeteaseStatus, OnlineSource } from "@/types";

// Navigation must not restart a service or discard a valid account session.
const sessions = new Map<OnlineSource, { status: NeteaseStatus; at: number }>();
const pending = new Map<OnlineSource, Promise<NeteaseStatus>>();
const attempted = new Set<OnlineSource>();

export function onlineStatus(source: OnlineSource) {
  return sessions.get(source)?.status ?? null;
}

export function rememberOnlineStatus(source: OnlineSource, status: NeteaseStatus) {
  sessions.set(source, { status, at: Date.now() });
}

export function connectOnline(source: OnlineSource, force = false): Promise<NeteaseStatus> {
  const active = pending.get(source);
  if (active) return active;
  const cached = sessions.get(source);
  if (!force && cached && Date.now() - cached.at < 5 * 60_000) return Promise.resolve(cached.status);
  const request = (async () => {
    let status = await window.potato.invoke<NeteaseStatus>(`${source}.status`);
    if (!status.service && status.canStart && !attempted.has(source)) {
      attempted.add(source);
      rememberOnlineStatus(source, status);
      status = await window.potato.invoke<NeteaseStatus>(`${source}.startService`);
    }
    rememberOnlineStatus(source, status);
    return status;
  })().finally(() => pending.delete(source));
  pending.set(source, request);
  return request;
}
