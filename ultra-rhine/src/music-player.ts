import { records } from './data';
import './music-player.css';

type State = { trackId: string | null; playing: boolean; time: number; duration: number; volume: number; muted: boolean };
type Track = { id: string; title: string; artist: string; album: string; coverPath?: string };
const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;

export let playMusicSelection: (index: number) => void = () => {};

/** Event-driven transport: no polling, animation loop or spectrum subscription. */
export function mountMusicPlayer(selected: () => number, reveal: (index: number) => void, notify: (message: string) => void) {
  const bridge = window.potato;
  if (!bridge) return;
  document.body.classList.add('music-terminal');
  const dock = document.createElement('section');
  dock.className = 'music-transport';
  dock.setAttribute('aria-label', '音乐播放控制');
  dock.innerHTML = `<div class="transport-art">♪</div><button class="transport-track" title="定位正在播放的歌曲"><small>NOW PLAYING / 正在播放</small><strong>选择一首音乐</strong><span>浏览音乐库，点击播放开始聆听</span></button><div class="transport-main"><div class="transport-buttons"><button data-command="previous" aria-label="上一首">Ⅰ◀</button><button data-command="toggle" aria-label="播放" class="transport-play">▶</button><button data-command="next" aria-label="下一首">▶Ⅰ</button></div><label class="transport-progress"><output>0:00</output><input type="range" aria-label="播放进度" min="0" max="1" step="0.1" value="0" disabled><output>0:00</output></label></div><label class="transport-volume">音量<input aria-label="音量" type="range" min="0" max="1" step="0.01" value="0.8"></label>`;
  document.querySelector('#stage')!.append(dock);
  const q = <T extends HTMLElement>(s: string) => dock.querySelector<T>(s)!;
  const seek = q<HTMLInputElement>('.transport-progress input');
  const volume = q<HTMLInputElement>('.transport-volume input');
  const tracks = new Map<string, Track>();
  let state: State = { trackId: null, playing: false, time: 0, duration: 0, volume: .8, muted: false };
  let lastTrack: string | null | undefined, coverToken = 0, revision = 0;
  const invoke = (method: string, params?: Record<string, unknown>) => bridge.invoke(method, params).catch(() => notify('播放操作未完成，请检查音频引擎或文件是否可用'));
  const paint = () => {
    if (document.hidden) return;
    const play = q<HTMLButtonElement>('[data-command="toggle"]');
    play.textContent = state.playing ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', state.playing ? '暂停' : '播放');
    seek.max = String(state.duration || 1);
    seek.disabled = !state.trackId || state.duration <= 0;
    if (document.activeElement !== seek) seek.value = String(state.time);
    q<HTMLOutputElement>('.transport-progress output:first-child').textContent = clock(state.time);
    q<HTMLOutputElement>('.transport-progress output:last-child').textContent = clock(state.duration);
    if (document.activeElement !== volume) volume.value = String(state.muted ? 0 : state.volume);
    if (lastTrack === state.trackId) return;
    lastTrack = state.trackId;
    const record = records.find(r => r.trackId === state.trackId), track = tracks.get(state.trackId ?? '');
    q('strong').textContent = track?.title ?? record?.title ?? '选择一首音乐';
    q('.transport-track span').textContent = track ? `${track.artist} · ${track.album}` : record ? `${record.en} · ${record.date}` : '浏览音乐库，点击播放开始聆听';
    const art = q('.transport-art'), path = track?.coverPath ?? record?.coverPath, token = ++coverToken;
    art.textContent = '♪';
    if (path) void bridge.coverData(path).then(url => {
      if (!url || token !== coverToken) return;
      const img = new Image(); img.alt = ''; img.src = url; art.replaceChildren(img);
    }).catch(() => undefined);
  };
  dock.addEventListener('click', event => {
    const command = (event.target as Element).closest<HTMLElement>('[data-command]')?.dataset.command;
    if (command === 'toggle' && !state.trackId) {
      const trackId = records[selected()]?.trackId;
      if (trackId) void invoke('playback.play', { trackId, queue: records.flatMap(r => r.trackId ? [r.trackId] : []), startAt: 0 });
    } else if (command) void invoke(`playback.${command}`);
    if ((event.target as Element).closest('.transport-track')) {
      const index = records.findIndex(r => r.trackId === state.trackId);
      if (index >= 0) reveal(index);
    }
  });
  // Native range keys and button Enter must not also navigate the archive.
  dock.addEventListener('keydown', event => event.stopPropagation());
  seek.addEventListener('input', () => { q('.transport-progress output:first-child').textContent = clock(Number(seek.value)); });
  seek.addEventListener('change', () => { void invoke('playback.seek', { seconds: Number(seek.value) }); });
  volume.addEventListener('change', () => { void invoke('playback.volume', { volume: Number(volume.value) }); });
  const unsubscribe = bridge.onEvent(({ event, data }) => {
    if (event === 'playback.state' || event === 'playback.time' || event === 'playback.track') {
      revision++;
      state = { ...state, ...(event === 'playback.track' ? (data as { state: State }).state : data as Partial<State>) };
      paint();
    }
  });
  playMusicSelection = index => {
    const trackId = records[index]?.trackId;
    if (!trackId) return;
    if (trackId === state.trackId) void invoke('playback.toggle');
    else void invoke('playback.play', { trackId, queue: records.flatMap(r => r.trackId ? [r.trackId] : []), startAt: 0 });
  };
  const initialRevision = revision;
  void bridge.invoke<{ playback: State; tracks: Track[] }>('bootstrap').then(data => {
    data.tracks.forEach(track => tracks.set(track.id, track));
    if (revision === initialRevision) state = data.playback;
    lastTrack = undefined; paint();
  }).catch(() => notify('无法连接音乐库，请检查播放器后端'));
  document.addEventListener('visibilitychange', paint);
  window.addEventListener('pagehide', () => { unsubscribe(); document.removeEventListener('visibilitychange', paint); }, { once: true });
  paint();
}
