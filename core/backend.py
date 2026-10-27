"""Potato Player 后端核心逻辑（无 UI 依赖）。

包含：路径常量、配置持久化、评分/歌词/元数据缓存、块/流派管理、
网易云 API 封装、音频扫描、VLC 播放引擎、歌单管理。
"""
import os
import io
import re
import csv
import json
import time
import random
import threading
import subprocess

import requests
import vlc
import mutagen
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.id3 import APIC
from PIL import Image

from .theme import resolve_theme, DEFAULT_BLOCK_COLOR

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MUSIC_DIR = os.path.join(BASE_DIR, "source", "music")
PLAYLIST_DIR = os.path.join(BASE_DIR, "source", "playlists")
LYRICS_DIR = os.path.join(BASE_DIR, "source", "lyrics")
COVERS_DIR = os.path.join(BASE_DIR, "source", "covers")
RATINGS_FILE = os.path.join(BASE_DIR, "source", "ratings.json")
BLOCKS_FILE = os.path.join(BASE_DIR, "source", "blocks.json")
GENRES_FILE = os.path.join(BASE_DIR, "source", "genres.json")
LYRICS_FILE = os.path.join(BASE_DIR, "source", "lyrics.json")
METADATA_CACHE_FILE = os.path.join(BASE_DIR, "source", "metadata_cache.csv")
CONFIG_FILE = os.path.join(BASE_DIR, "source", "config.json")
NETEASE_BINDINGS_FILE = os.path.join(BASE_DIR, "source", "netease_bindings.json")

SUPPORTED_EXTS = ('.mp3', '.flac')


def ensure_dirs():
    for d in (PLAYLIST_DIR, LYRICS_DIR, COVERS_DIR, MUSIC_DIR):
        os.makedirs(d, exist_ok=True)


# ==================== JSON / CSV 读写 ====================
def load_json_file(path, default):
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return default
    return default


def save_json_file(path, data):
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def load_ratings():
    return load_json_file(RATINGS_FILE, {})


def save_ratings(ratings_dict):
    save_json_file(RATINGS_FILE, ratings_dict)


def load_lyrics():
    return load_json_file(LYRICS_FILE, {})


def save_lyrics(lyrics_dict):
    save_json_file(LYRICS_FILE, lyrics_dict)


def load_blocks():
    blocks = load_json_file(BLOCKS_FILE, [])
    normalized = []
    for b in blocks:
        if isinstance(b, dict):
            if 'name' not in b:
                b['name'] = str(b)
            if 'color' not in b:
                b['color'] = DEFAULT_BLOCK_COLOR
            normalized.append(b)
        else:
            normalized.append({'name': str(b), 'color': DEFAULT_BLOCK_COLOR})
    save_json_file(BLOCKS_FILE, normalized)
    return normalized


def save_blocks(blocks):
    save_json_file(BLOCKS_FILE, blocks)


def load_genres():
    return load_json_file(GENRES_FILE, [])


def save_genres(genres):
    save_json_file(GENRES_FILE, genres)


def load_netease_bindings():
    return load_json_file(NETEASE_BINDINGS_FILE, {})


def save_netease_bindings(bindings):
    save_json_file(NETEASE_BINDINGS_FILE, bindings)


# ==================== 元数据缓存 (CSV) ====================
def load_metadata_cache():
    cache = {}
    if os.path.exists(METADATA_CACHE_FILE):
        try:
            with open(METADATA_CACHE_FILE, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    fp = row.get('filepath', '')
                    if fp:
                        cache[fp] = {
                            'title': row.get('title', ''),
                            'artist': row.get('artist', ''),
                            'duration': int(row.get('duration', '0') or '0'),
                        }
        except Exception:
            cache = {}
    return cache


def save_metadata_cache(cache):
    try:
        with open(METADATA_CACHE_FILE, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['filepath', 'title', 'artist', 'duration'])
            for fp, info in cache.items():
                writer.writerow([fp, info.get('title', ''), info.get('artist', ''),
                                 info.get('duration', 0)])
    except Exception:
        pass


# ==================== 配置 ====================
DEFAULT_CONFIG = {
    'note_display_mode': 'expanded',
    'artist_hidden': False,
    'cover_style': 'circle_rotate',
    'volume': 70,
    'play_mode': 'list_loop',
    'sort_mode': 'title',
    'backend': 'vlc',
    'show_index_headers': True,
    'comment_display_count': 15,
    'current_dl_br': 320000,
    'bilingual_lyrics': True,
    'prefer_chinese_lyrics': True,
    'theme': '紫夜 (默认)',
    'filter_sort_mode': 'title',
    'glass_mode': False,
    'glass_tint': 'dark',
    'bg_image_path': '',
    'bg_image_scale': 1.0,
    'bg_image_offset_x': 0,
    'bg_image_offset_y': 0,
}


def load_config():
    data = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data.update(json.load(f))
        except Exception:
            pass
    return data


def save_config(data):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ==================== 音频扫描 ====================
def scan_audio_files(directory):
    if not os.path.isdir(directory):
        return []
    files = [f for f in os.listdir(directory) if f.lower().endswith(SUPPORTED_EXTS)]
    files.sort()
    return [os.path.join(directory, f) for f in files]


# ==================== 歌词解析 ====================
def _parse_lrc_lines(lrc_path):
    """解析单个 LRC 文件，返回 {秒数: 文本}。"""
    result = {}
    if not os.path.exists(lrc_path):
        return result
    try:
        with open(lrc_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('{'):
                    continue
                if line.startswith('[') and ']' in line:
                    bracket_end = line.find(']')
                    time_str = line[1:bracket_end]
                    lyric_text = line[bracket_end + 1:]
                    try:
                        parts = time_str.split(':')
                        minutes = int(parts[0])
                        seconds = float(parts[1])
                        total = minutes * 60 + seconds
                        if lyric_text.strip():
                            result[total] = lyric_text.strip()
                    except Exception:
                        continue
    except Exception:
        pass
    return result


def parse_lrc_file(lrc_path, trans_lrc_path=None):
    """解析 LRC 文件，返回 [(秒数, 原文, 翻译), ...]（含双语合并）。"""
    main = _parse_lrc_lines(lrc_path)
    trans = _parse_lrc_lines(trans_lrc_path) if trans_lrc_path else {}
    lyrics_data = []
    for t in sorted(main.keys()):
        lyrics_data.append((t, main[t], trans.get(t, '')))
    return lyrics_data


# ==================== 歌曲信息加载 ====================
def get_duration_from_vlc(instance, filepath):
    try:
        media = instance.media_new(filepath)
        media.parse()
        dur_ms = media.get_duration()
        if dur_ms > 0:
            return dur_ms // 1000
    except Exception:
        pass
    return 0


def load_song_info(filepath, instance=None, ratings=None, lyrics=None,
                   metadata_cache=None, song_info_cache=None,
                   bilingual_lyrics=True, prefer_chinese_lyrics=True):
    """加载歌曲信息（标题、歌手、时长、封面、评分、歌词等）。

    结果会缓存到 song_info_cache（若传入）。
    """
    if song_info_cache is not None and filepath in song_info_cache:
        return song_info_cache[filepath]

    ratings = ratings if ratings is not None else {}
    lyrics = lyrics if lyrics is not None else {}
    metadata_cache = metadata_cache if metadata_cache is not None else {}

    raw_name = os.path.splitext(os.path.basename(filepath))[0]
    title = raw_name
    artist = "未知歌手"

    if ' - ' in raw_name:
        parts = raw_name.split(' - ', 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    duration_sec = 0
    cover_image = None

    try:
        audio = mutagen.File(filepath)
        if audio is not None:
            duration_sec = int(audio.info.length)
            tags = audio.tags
            if tags:
                if isinstance(audio, MP3):
                    if tags.get("TIT2"):
                        title = str(tags["TIT2"])
                    if tags.get("TPE1"):
                        artist = str(tags["TPE1"])
                elif isinstance(audio, FLAC):
                    t = tags.get("TITLE")
                    if t and isinstance(t, list) and t[0]:
                        title = str(t[0])
                    a = tags.get("ARTIST")
                    if a and isinstance(a, list) and a[0]:
                        artist = str(a[0])

            if isinstance(audio, MP3) and tags is not None:
                for tag in tags.values():
                    if isinstance(tag, APIC):
                        try:
                            if tag.data:
                                cover_image = Image.open(io.BytesIO(tag.data))
                                break
                        except Exception:
                            pass
            elif isinstance(audio, FLAC):
                try:
                    if hasattr(audio, 'pictures') and audio.pictures:
                        for pic in audio.pictures:
                            try:
                                if pic.data:
                                    cover_image = Image.open(io.BytesIO(pic.data))
                                    break
                            except Exception:
                                continue
                except Exception:
                    pass
    except Exception:
        pass

    if duration_sec == 0 and instance is not None:
        duration_sec = get_duration_from_vlc(instance, filepath)

    user_data = ratings.get(filepath, {})
    if user_data.get("title"):
        title = user_data["title"]
    if user_data.get("artist"):
        artist = user_data["artist"]
    cover_path = user_data.get("cover", "")
    if cover_path and os.path.exists(cover_path):
        try:
            cover_image = Image.open(cover_path)
        except Exception:
            cover_image = None

    # 歌词
    lyrics_data = lyrics.get(filepath, [])
    if isinstance(lyrics_data, str) and os.path.exists(lyrics_data):
        trans_path = lyrics_data.replace('.lrc', '.trans.lrc')
        parsed = parse_lrc_file(lyrics_data, trans_path if os.path.exists(trans_path) else None)
        if parsed:
            lyrics[filepath] = parsed
            lyrics_data = parsed

    if not bilingual_lyrics and lyrics_data and isinstance(lyrics_data, list) and lyrics_data:
        if isinstance(lyrics_data[0], (tuple, list)) and len(lyrics_data[0]) > 2:
            has_trans = any(len(it) > 2 and it[2] for it in lyrics_data)
            if has_trans:
                if prefer_chinese_lyrics:
                    lyrics_data = [(t, tr if tr else txt, '') for t, txt, tr in lyrics_data]
                else:
                    lyrics_data = [(t, txt, '') for t, txt, tr in lyrics_data]

    info = {
        "title": title,
        "artist": artist,
        "duration": duration_sec,
        "cover": cover_image,
        "score": user_data.get("score", 0),
        "note": user_data.get("note", ""),
        "genre": user_data.get("genre", ""),
        "block": user_data.get("block", ""),
        "comment": user_data.get("comment", ""),
        "play_count": user_data.get("play_count", 0),
        "lyrics": lyrics_data,
    }

    if song_info_cache is not None:
        song_info_cache[filepath] = info
    if metadata_cache is not None:
        metadata_cache[filepath] = {'title': title, 'artist': artist, 'duration': duration_sec}
    return info


# ==================== 缓存标题/歌手 ====================
def get_cached_title(filepath, metadata_cache=None, ratings=None):
    metadata_cache = metadata_cache if metadata_cache is not None else {}
    ratings = ratings if ratings is not None else {}

    title = None
    artist = None
    if filepath in metadata_cache:
        title = metadata_cache[filepath].get('title', '')
        artist = metadata_cache[filepath].get('artist', '')
    if not title:
        ud = ratings.get(filepath, {})
        title = ud.get('title', '')
        if not artist:
            artist = ud.get('artist', '')
    if not title:
        title = os.path.splitext(os.path.basename(filepath))[0]
    if artist and artist != '未知歌手' and title:
        return f"{artist} - {title}"
    return title


def get_cached_artist(filepath, metadata_cache=None, ratings=None):
    metadata_cache = metadata_cache if metadata_cache is not None else {}
    ratings = ratings if ratings is not None else {}
    if filepath in metadata_cache and metadata_cache[filepath].get('artist'):
        return metadata_cache[filepath]['artist']
    ud = ratings.get(filepath, {})
    if ud.get('artist'):
        return ud['artist']
    return '未知歌手'


def score_to_color(score):
    """0..10 映射到 琥珀→绿 渐变色。"""
    try:
        t = max(0.0, min(10.0, float(score))) / 10.0
    except Exception:
        t = 0.0
    r0, g0, b0 = (245, 158, 11)
    r1, g1, b1 = (34, 197, 94)
    r = int(r0 + (r1 - r0) * t)
    g = int(g0 + (g1 - g0) * t)
    b = int(b0 + (b1 - b0) * t)
    return f"#{r:02x}{g:02x}{b:02x}"


# ==================== 块颜色 ====================
def get_block_color(blocks, block_name):
    for b in blocks:
        if isinstance(b, dict) and b.get('name') == block_name:
            return b.get('color', DEFAULT_BLOCK_COLOR)
    return DEFAULT_BLOCK_COLOR


def set_block_color(blocks, block_name, color):
    for b in blocks:
        if isinstance(b, dict) and b.get('name') == block_name:
            b['color'] = color
            save_blocks(blocks)
            return True
    return False


# ==================== 歌单管理 ====================
def get_playlist_files():
    if not os.path.exists(PLAYLIST_DIR):
        return []
    files = [f for f in os.listdir(PLAYLIST_DIR) if f.endswith('.json')]
    files.sort()
    return [os.path.join(PLAYLIST_DIR, f) for f in files]


def save_current_playlist(name, playlist):
    if not name:
        return False
    filepath = os.path.join(PLAYLIST_DIR, name + '.json')
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(playlist, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def load_playlist(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return [p for p in data if os.path.exists(p)] if isinstance(data, list) else []
    except Exception:
        return []


# ==================== 网易云 API ====================
API_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "api", "api-enhanced-4.35.0"))
API_BASE = "http://localhost:3000"
COOKIE_PATH = os.path.join(BASE_DIR, "source", ".cookie")


class NeteaseClient:
    """网易云 API 封装（基于本地 api-enhanced 服务）。"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36"
        })
        self.cookie = None
        self.logged_in = False
        self.uid = ''
        self._proc = None
        if os.path.exists(COOKIE_PATH):
            try:
                with open(COOKIE_PATH, 'r') as f:
                    self.cookie = f.read().strip()
                if self.cookie:
                    self.logged_in = True
            except Exception:
                pass

    # ---- 基础 HTTP ----
    def _ts(self):
        return str(int(time.time() * 1000))

    def _get(self, path, cookie=None):
        sep = "&" if "?" in path else "?"
        url = f"{API_BASE}{path}{sep}timestamp={self._ts()}"
        ck = cookie if cookie is not None else self.cookie
        if ck:
            url += f"&cookie={requests.utils.quote(ck)}"
        return self.session.get(url, timeout=15)

    def _post(self, path, cookie=None, **kw):
        sep = "&" if "?" in path else "?"
        url = f"{API_BASE}{path}{sep}timestamp={self._ts()}"
        json_data = dict(kw)
        ck = cookie if cookie is not None else self.cookie
        if ck:
            json_data["cookie"] = ck
        return self.session.post(url, json=json_data, timeout=15)

    @staticmethod
    def _code(d):
        code = d.get('code')
        if code is not None:
            return code
        inner = d.get('data') or d.get('body')
        if isinstance(inner, dict):
            return inner.get('code')
        return None

    # ---- 服务管理 ----
    def server_check(self):
        try:
            return self.session.get(f"{API_BASE}/", timeout=3).status_code < 500
        except Exception:
            return False

    def server_start(self):
        def _start():
            try:
                self._proc = subprocess.Popen(
                    ["/usr/local/bin/node", "app.js"],
                    cwd=API_DIR,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                for _ in range(30):
                    time.sleep(1)
                    if self.server_check():
                        return
            except FileNotFoundError:
                pass
        threading.Thread(target=_start, daemon=True).start()

    def server_stop(self):
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None

    # ---- 登录 ----
    def save_cookie(self, cookie_str):
        self.cookie = cookie_str
        try:
            with open(COOKIE_PATH, 'w') as f:
                f.write(cookie_str)
        except Exception:
            pass

    def login_cellphone(self, phone, password):
        try:
            r = self._get(f"/login/cellphone?phone={phone}&password={requests.utils.quote(password)}")
            data = r.json()
            if data.get("code") == 200:
                self.logged_in = True
                cookie = data.get("cookie", "")
                if cookie:
                    self.save_cookie(cookie)
                profile = data.get("profile", {})
                return True, profile.get("nickname", phone)
            return False, data.get("message", data.get("msg", "登录失败"))
        except Exception as e:
            return False, str(e)

    def login_qrcode_key(self):
        try:
            r = self._get("/login/qr/key")
            data = r.json()
            if data.get("code") != 200:
                return False, "获取二维码密钥失败", None
            return True, data["data"]["unikey"], data["data"]["unikey"]
        except Exception as e:
            return False, str(e), None

    def login_qrcode_poll(self, unikey):
        try:
            r = self._get(f"/login/qr/check?key={unikey}&noCookie=true")
            data = r.json()
            code = data.get("code")
            if code == 803:
                self.logged_in = True
                cookie = data.get("cookie", "")
                if cookie:
                    self.save_cookie(cookie)
                return 1
            if code == 802:
                return 0
            if code == 801:
                return -1
            if code == 800:
                return -2
            return -1
        except Exception:
            return -1

    def logout(self):
        self.logged_in = False
        self.cookie = None
        try:
            os.remove(COOKIE_PATH)
        except Exception:
            pass

    # ---- 歌曲信息 ----
    def get_song_info(self, netease_id):
        try:
            r = self._get(f"/song/detail?ids={netease_id}")
            data = r.json()
            if data.get("code") != 200 or not data.get("songs"):
                return None
            song = data["songs"][0]
            artists = song.get("ar", [])
            album = song.get("al", {})
            album_name = album.get("name", "未知专辑") if album else "未知专辑"
            album_pic = album.get("picUrl", "") if isinstance(album, dict) else ""
            return {
                "name": song["name"],
                "artists": "/".join([a["name"] for a in artists]),
                "album": album_name,
                "cover_url": album_pic,
                "id": str(song["id"]),
            }
        except Exception:
            return None

    def fetch_cover(self, netease_id, save_path):
        info = self.get_song_info(netease_id)
        if not info or not info.get("cover_url"):
            return False
        try:
            resp = self.session.get(info["cover_url"], timeout=15)
            resp.raise_for_status()
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, 'wb') as f:
                f.write(resp.content)
            return True
        except Exception:
            return False

    def fetch_lyrics(self, netease_id):
        try:
            r = self._get(f"/lyric?id={netease_id}")
            data = r.json()
            if data.get("code") != 200:
                return None
            lrc = data.get("lrc", {}).get("lyric", "")
            tlyric = data.get("tlyric", {}).get("lyric", "")
            if not lrc:
                return None
            orig = lrc.strip()
            trans = tlyric.strip() if tlyric and tlyric.strip() else None
            return (orig, trans)
        except Exception:
            return None

    def fetch_comments(self, netease_id, page=1, page_size=20):
        try:
            offset = (page - 1) * page_size
            r = self._get(f"/comment/music?id={netease_id}&limit={page_size}&offset={offset}")
            data = r.json()
            if data.get("code") != 200:
                return [], 0
            total = data.get("total", 0)
            hot = data.get("hotComments", [])
            regular = data.get("comments", [])
            result = list(hot)
            if len(result) < page_size:
                existing = {c.get('commentId') for c in result}
                for c in regular:
                    if len(result) >= page_size:
                        break
                    if c.get('commentId') not in existing:
                        result.append(c)
            return result[:page_size], total
        except Exception:
            return [], 0

    def get_song_audio_url(self, netease_id, bitrate=320000):
        br_list = [bitrate]
        for br in [320000, 192000, 128000]:
            if br < bitrate:
                br_list.append(br)
        for br in br_list:
            if br >= 999000:
                try:
                    r = self._get(f"/song/download/url?id={netease_id}&br={br}")
                    data = r.json()
                    if self._code(data) == 200 and data.get("data"):
                        url = data["data"].get("url", "")
                        if url:
                            return url, data["data"].get("br", br)
                except Exception:
                    pass
            try:
                r = self._get(f"/song/url?id={netease_id}&br={br}")
                data = r.json()
                if self._code(data) != 200 or not data.get("data"):
                    continue
                for item in data["data"]:
                    if item.get("url"):
                        return item["url"], item.get("br", br)
            except Exception:
                continue
        return None, 0

    def download_song(self, netease_id, save_dir, bitrate=320000):
        info = self.get_song_info(netease_id)
        if not info:
            return False, "未找到该歌曲", None
        audio_url, got_br = self.get_song_audio_url(netease_id, bitrate)
        if not audio_url:
            return False, "无法获取播放地址（可能为VIP或下架歌曲，请尝试登录）", info
        ext = '.mp3'
        if got_br and got_br >= 999000:
            ext = '.flac'
        elif '.flac' in audio_url.lower():
            ext = '.flac'
        filename = f"{info['artists']} - {info['name']}{ext}"
        filename = re.sub(r'[\\/*?:"<>|]', '', filename)
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        try:
            resp = self.session.get(audio_url, stream=True, timeout=120)
            resp.raise_for_status()
            content_type = resp.headers.get('content-type', '').lower()
            if 'audio' not in content_type and 'octet' not in content_type and 'mpeg' not in content_type:
                first_chunk = next(resp.iter_content(8192), b'')
                if not first_chunk or len(first_chunk) < 512:
                    return False, "未获取到有效音频数据（VIP歌曲需要登录）。请在设置中登录网易云后重试。", info
                if first_chunk[:5] == b'<?xml' or first_chunk[:5] == b'<!DOC' \
                        or first_chunk[:1] == b'{' or first_chunk[:1] == b'<':
                    return False, "服务器返回了非音频数据（VIP歌曲需要登录）。请在设置中登录网易云后重试。", info
                with open(save_path, 'wb') as f:
                    f.write(first_chunk)
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)
            else:
                with open(save_path, 'wb') as f:
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)
            actual_size = os.path.getsize(save_path)
            if actual_size < 32768:
                os.remove(save_path)
                return False, f"下载文件太小({actual_size}字节)，可能是VIP限制。请登录后重试。", info
            return True, filename, info
        except Exception as e:
            if os.path.exists(save_path):
                try:
                    os.remove(save_path)
                except Exception:
                    pass
            return False, str(e), info

    def search_song(self, keyword, limit=5):
        try:
            r = self._get(f"/search?keywords={requests.utils.quote(keyword)}&type=1&limit={limit}")
            data = r.json()
            if data.get("code") != 200:
                return []
            songs = data.get("result", {}).get("songs", [])
            results = []
            for s in songs:
                artists = "/".join([a["name"] for a in s.get("ar", [])])
                album = s.get("al", {})
                album_name = album.get("name", "") if isinstance(album, dict) else ""
                results.append({
                    "id": str(s["id"]),
                    "name": s["name"],
                    "artists": artists,
                    "album": album_name,
                    "duration": s.get("dt", 0) or 0,
                    "fee": s.get("fee", 0),
                })
            return results
        except Exception:
            return []

    # ---- 歌单 ----
    def get_user_playlists(self):
        try:
            r = self._get("/user/playlist")
            data = r.json()
            if data.get("code") != 200 or not data.get("playlist"):
                return []
            return data["playlist"]
        except Exception:
            return []

    def search_playlists(self, keyword, limit=20):
        try:
            r = self._get(f"/search?keywords={requests.utils.quote(keyword)}&type=1000&limit={limit}")
            data = r.json()
            if data.get("code") != 200:
                return []
            return data.get("result", {}).get("playlists", [])
        except Exception:
            return []

    def get_playlist_detail(self, plid):
        try:
            r = self._get(f"/playlist/detail?id={plid}")
            data = r.json()
            if data.get("code") != 200 or not data.get("playlist"):
                return None
            return data["playlist"]
        except Exception:
            return None

    def daily_recommend_songs(self):
        try:
            r = self._get("/recommend/songs")
            data = r.json()
            if data.get("code") != 200 or not data.get("data"):
                return []
            return data["data"].get("dailySongs", [])
        except Exception:
            return []

    def account_info(self):
        try:
            r = self._post("/user/account")
            return r.json()
        except Exception:
            return {}

    def playlist_add_tracks(self, plid, ids_str):
        try:
            r = self._get(f"/playlist/tracks?op=add&pid={plid}&tracks={ids_str}")
            return r.json()
        except Exception:
            return {}

    def playlist_del_tracks(self, plid, ids_str):
        try:
            r = self._get(f"/playlist/tracks?op=del&pid={plid}&tracks={ids_str}")
            return r.json()
        except Exception:
            return {}


# ==================== 播放引擎 ====================
class Player:
    """VLC 播放引擎封装。"""

    def __init__(self, volume=70):
        self.instance = vlc.Instance()
        self.player = self.instance.media_player_new()
        self.player.audio_set_volume(int(volume))
        self.volume = int(volume)

    def play(self, filepath):
        self.player.stop()
        media = self.instance.media_new(filepath)
        self.player.set_media(media)
        self.player.play()

    def pause(self):
        self.player.pause()

    def resume(self):
        self.player.play()

    def stop(self):
        self.player.stop()

    def set_volume(self, volume):
        self.volume = int(volume)
        self.player.audio_set_volume(int(volume))

    def seek(self, seconds):
        self.player.set_time(int(seconds * 1000))

    def get_time(self):
        ms = self.player.get_time()
        return ms / 1000.0 if ms >= 0 else None

    def event_manager(self):
        return self.player.event_manager()

    def get_duration(self, filepath):
        return get_duration_from_vlc(self.instance, filepath)
