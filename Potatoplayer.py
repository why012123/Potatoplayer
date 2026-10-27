import os
import sys
import io
import time
import random
import json
import re
import threading
import subprocess
import requests
import vlc
# optional pygame backend
pygame_available = False
try:
    import pygame
    pygame_available = True
except Exception:
    pygame_available = False
import mutagen
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.id3 import APIC
from PIL import Image, ImageTk, ImageDraw
import csv
import tkinter as tk
from tkinter import ttk, Listbox, END, HORIZONTAL, Menu, Menubutton, simpledialog, messagebox, Canvas, Frame, Scrollbar, Spinbox, Label, Button, Entry, filedialog

# ==================== 初始化 ====================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Program version
VERSION = '1.3.5'
# ── 主题配色 ──
BG_COLOR = '#0d0d0d'          # 主背景（深邃黑）
PANEL_BG = '#151515'          # 面板背景
CARD_BG = '#1e1e1e'           # 卡片/行背景
TROUGH = '#2a2a2a'            # 滑块凹槽
HOVER = '#2e2e2e'             # 通用悬停
ACCENT = '#7c5cff'            # 强调色（现代紫）
ACCENT_HOVER = '#9475ff'      # 强调色悬停
ACCENT_PRESSED = '#5a3dd8'    # 强调色按下
MUTED = '#888888'             # 次级文字
DANGER = '#e74c3c'            # 危险操作红
DANGER_HOVER = '#f55a4e'      # 危险悬停
SUCCESS = '#2ecc71'           # 成功绿
WARNING = '#f39c12'           # 警告橙
INSERT_LINE = '#7c5cff'       # 拖拽插入指示线
SEPARATOR = '#252525'         # 分割线颜色
# ── 字体 ──
FONT_MAIN = ('SF Pro Display', 11) if sys.platform == 'darwin' else ('微软雅黑', 11)
FONT_TITLE = ('SF Pro Display', 13, 'bold') if sys.platform == 'darwin' else ('微软雅黑', 13, 'bold')
FONT_SMALL = ('SF Pro Display', 9) if sys.platform == 'darwin' else ('微软雅黑', 9)
FONT_MONO = ('SF Mono', 10) if sys.platform == 'darwin' else ('Consolas', 10)
CARD_HOVER = '#282828'        # 行 hover 背景
CARD_ALTERNATE = '#1a1a1a'    # 交替行颜色
TEXT = '#ffffff'              # 主文字色
TEXT_MUTED = '#888888'        # 次级文字色

# ── 主题预设 ──
THEME_PRESETS = {
    "紫夜 (默认)": {
        "BG_COLOR": '#0d0d0d', "PANEL_BG": '#151515', "CARD_BG": '#1e1e1e',
        "TROUGH": '#2a2a2a', "HOVER": '#2e2e2e',
        "ACCENT": '#7c5cff', "ACCENT_HOVER": '#9475ff', "ACCENT_PRESSED": '#5a3dd8',
        "MUTED": '#888888', "DANGER": '#e74c3c', "DANGER_HOVER": '#f55a4e',
        "SUCCESS": '#2ecc71', "WARNING": '#f39c12',
        "CARD_HOVER": '#282828', "CARD_ALTERNATE": '#1a1a1a',
        "SEPARATOR": '#252525', "INSERT_LINE": '#7c5cff',
        "BUTTON_BG": '#1e1e1e',
        "TEXT": '#ffffff', "TEXT_MUTED": '#888888',
        "desc": "深邃暗紫 · 护眼暗色系"
    },
    "蓝白": {
        "BG_COLOR": '#f0f2f5', "PANEL_BG": '#ffffff', "CARD_BG": '#f7f8fa',
        "TROUGH": '#dde1e6', "HOVER": '#e8ecf1',
        "ACCENT": '#2563eb', "ACCENT_HOVER": '#3b82f6', "ACCENT_PRESSED": '#1d4ed8',
        "MUTED": '#6b7280', "DANGER": '#dc2626', "DANGER_HOVER": '#ef4444',
        "SUCCESS": '#16a34a', "WARNING": '#d97706',
        "CARD_HOVER": '#e8ecf1', "CARD_ALTERNATE": '#f0f2f5',
        "SEPARATOR": '#d1d5db', "INSERT_LINE": '#2563eb',
        "BUTTON_BG": '#e5e7eb',
        "TEXT": '#111827', "TEXT_MUTED": '#4b5563',
        "ENTRY_BG": '#f9fafb',
        "desc": "清新蓝白 · 明亮简洁"
    },
    "墨绿": {
        "BG_COLOR": '#0a0f0a', "PANEL_BG": '#111a11', "CARD_BG": '#1a241a',
        "TROUGH": '#263326', "HOVER": '#2a352a',
        "ACCENT": '#10b981', "ACCENT_HOVER": '#34d399', "ACCENT_PRESSED": '#059669',
        "MUTED": '#6b8b6b', "DANGER": '#ef4444', "DANGER_HOVER": '#f87171',
        "SUCCESS": '#22c55e', "WARNING": '#f59e0b',
        "CARD_HOVER": '#243324', "CARD_ALTERNATE": '#152015',
        "SEPARATOR": '#1f2f1f', "INSERT_LINE": '#10b981',
        "BUTTON_BG": '#1a241a',
        "TEXT": '#ffffff', "TEXT_MUTED": '#6b8b6b',
        "desc": "暗夜墨绿 · 自然沉稳"
    },
    "暖橙": {
        "BG_COLOR": '#1a1410', "PANEL_BG": '#241c16', "CARD_BG": '#2d241c',
        "TROUGH": '#3d3228', "HOVER": '#382e24',
        "ACCENT": '#f97316', "ACCENT_HOVER": '#fb923c', "ACCENT_PRESSED": '#ea580c',
        "MUTED": '#9c8b7a', "DANGER": '#ef4444', "DANGER_HOVER": '#f87171',
        "SUCCESS": '#22c55e', "WARNING": '#eab308',
        "CARD_HOVER": '#342a20', "CARD_ALTERNATE": '#201a12',
        "SEPARATOR": '#33281c', "INSERT_LINE": '#f97316',
        "BUTTON_BG": '#2d241c',
        "TEXT": '#ffffff', "TEXT_MUTED": '#9c8b7a',
        "desc": "暗夜暖橙 · 温暖柔和"
    },
}

def _resolve_theme_color(theme, key, fallback=None):
    """从主题字典取色，带后备值"""
    return theme.get(key, fallback)

def _configure_ttk_styles():
    """根据当前全局颜色变量重新配置所有 ttk 样式"""
    style = ttk.Style()
    style.theme_use('clam')
    style.configure('.', background=BG_COLOR, foreground=TEXT, fieldbackground=BG_COLOR)

    style.configure('TButton', font=FONT_MAIN, padding=(10, 6), background=CARD_BG,
                    foreground=TEXT, borderwidth=0, focusthickness=0,
                    relief='flat', anchor='center')
    style.map('TButton',
        background=[('active', ACCENT_HOVER), ('pressed', ACCENT_PRESSED), ('!active', CARD_BG)],
        foreground=[('disabled', MUTED)],
        relief=[('pressed', 'sunken')])

    style.configure('Accent.TButton', font=FONT_MAIN, padding=(12, 7), background=ACCENT,
                    foreground='white', borderwidth=0, focusthickness=0,
                    relief='flat', anchor='center')
    style.map('Accent.TButton',
        background=[('active', ACCENT_HOVER), ('pressed', ACCENT_PRESSED)],
        foreground=[('disabled', MUTED)])

    style.configure('Small.TButton', font=FONT_SMALL, padding=(6, 3), background=CARD_BG,
                    foreground=TEXT, borderwidth=0, focusthickness=0, relief='flat')
    style.map('Small.TButton',
        background=[('active', ACCENT_HOVER), ('pressed', ACCENT_PRESSED)])

    style.configure('Danger.TButton', font=FONT_MAIN, padding=(10, 6), background=DANGER,
                    foreground='white', borderwidth=0, focusthickness=0, relief='flat')
    style.map('Danger.TButton',
        background=[('active', DANGER_HOVER), ('pressed', '#c0392b')])

    style.configure('Success.TButton', font=FONT_MAIN, padding=(10, 6), background=SUCCESS,
                    foreground='white', borderwidth=0, focusthickness=0, relief='flat')
    style.map('Success.TButton',
        background=[('active', '#58d68d'), ('pressed', '#27ae60')])

    style.configure('Horizontal.TScale', background=BG_COLOR, troughcolor=TROUGH,
                    sliderlength=22, sliderrelief='flat', borderwidth=0)
    style.map('Horizontal.TScale',
        background=[('active', BG_COLOR)],
        troughcolor=[('active', TROUGH)],
        slidercolor=[('active', ACCENT)])

    entry_bg = _current_theme_extra.get('ENTRY_BG', '#0a0a0a')
    style.configure('Black.TCombobox', fieldbackground=entry_bg, background=entry_bg,
                    foreground=TEXT, arrowcolor=ACCENT, padding=6,
                    borderwidth=1, relief='solid')
    style.map('Black.TCombobox',
        fieldbackground=[('readonly', entry_bg), ('focus', '#111111')],
        background=[('readonly', entry_bg)],
        arrowcolor=[('active', ACCENT_HOVER)])

    style.configure('Vertical.TScrollbar', troughcolor=BG_COLOR, background=TROUGH,
                    bordercolor=BG_COLOR, arrowcolor=MUTED, arrowsize=14,
                    borderwidth=0, relief='flat')
    style.map('Vertical.TScrollbar',
        background=[('active', ACCENT), ('!active', TROUGH)],
        arrowcolor=[('active', 'white')])

    style.configure('Horizontal.TScrollbar', troughcolor=BG_COLOR, background=TROUGH,
                    bordercolor=BG_COLOR, arrowcolor=MUTED, arrowsize=14,
                    borderwidth=0, relief='flat')
    style.map('Horizontal.TScrollbar',
        background=[('active', ACCENT), ('!active', TROUGH)],
        arrowcolor=[('active', 'white')])

    btn_bg = _current_theme_extra.get('BUTTON_BG', '#222222')
    style.configure('Library.TButton', font=FONT_MAIN, background=btn_bg,
                    foreground=TEXT, padding=(8, 3), borderwidth=0,
                    focusthickness=0, relief='flat')
    style.map('Library.TButton',
        background=[('active', ACCENT_HOVER), ('pressed', ACCENT_PRESSED)],
        foreground=[('disabled', MUTED)])

    style.configure('TLabelframe', background=PANEL_BG, foreground=TEXT,
                    bordercolor=SEPARATOR, relief='solid', borderwidth=1, padding=8)
    style.configure('TLabelframe.Label', background=PANEL_BG, foreground=TEXT,
                    font=FONT_TITLE)

    style.configure('TEntry', fieldbackground=entry_bg, foreground=TEXT,
                    borderwidth=1, padding=6, relief='solid', bordercolor=SEPARATOR)
    style.map('TEntry',
        fieldbackground=[('focus', '#111111'), ('!focus', entry_bg)],
        bordercolor=[('focus', ACCENT)])

    style.configure('TProgressbar', troughcolor=TROUGH, background=ACCENT,
                    borderwidth=0, thickness=6)
    style.configure('Accent.Horizontal.TProgressbar', troughcolor=TROUGH,
                    background=ACCENT, borderwidth=0, thickness=6)

_current_theme_name = ""
_current_theme_extra = {}

def _load_theme_vars(theme_name):
    """仅更新全局颜色变量，不触发 UI 操作（用于 root 创建前）"""
    global BG_COLOR, PANEL_BG, CARD_BG, TROUGH, HOVER
    global ACCENT, ACCENT_HOVER, ACCENT_PRESSED, MUTED, DANGER, DANGER_HOVER
    global SUCCESS, WARNING, INSERT_LINE, SEPARATOR
    global CARD_HOVER, CARD_ALTERNATE
    global TEXT, TEXT_MUTED
    global _current_theme_name, _current_theme_extra

    theme = THEME_PRESETS.get(theme_name)
    if not theme:
        return False

    _current_theme_name = theme_name
    _current_theme_extra = {k: v for k, v in theme.items() if k not in [
        "BG_COLOR", "PANEL_BG", "CARD_BG", "TROUGH", "HOVER",
        "ACCENT", "ACCENT_HOVER", "ACCENT_PRESSED", "MUTED", "DANGER", "DANGER_HOVER",
        "SUCCESS", "WARNING", "INSERT_LINE", "SEPARATOR",
        "CARD_HOVER", "CARD_ALTERNATE", "TEXT", "TEXT_MUTED", "desc"
    ]}

    BG_COLOR = theme["BG_COLOR"]
    PANEL_BG = theme["PANEL_BG"]
    CARD_BG = theme["CARD_BG"]
    TROUGH = theme["TROUGH"]
    HOVER = theme["HOVER"]
    ACCENT = theme["ACCENT"]
    ACCENT_HOVER = theme["ACCENT_HOVER"]
    ACCENT_PRESSED = theme["ACCENT_PRESSED"]
    MUTED = theme["MUTED"]
    DANGER = theme["DANGER"]
    DANGER_HOVER = theme["DANGER_HOVER"]
    SUCCESS = theme["SUCCESS"]
    WARNING = theme["WARNING"]
    INSERT_LINE = theme.get("INSERT_LINE", ACCENT)
    SEPARATOR = theme.get("SEPARATOR", TROUGH)
    CARD_HOVER = theme.get("CARD_HOVER", HOVER)
    CARD_ALTERNATE = theme.get("CARD_ALTERNATE", CARD_BG)
    TEXT = theme.get("TEXT", '#ffffff')
    TEXT_MUTED = theme.get("TEXT_MUTED", MUTED)
    return True

def apply_theme(theme_name):
    """应用指定主题（热切换）：更新全局颜色 + ttk 样式 + 同步配置"""
    if not _load_theme_vars(theme_name):
        return False
    _configure_ttk_styles()
    try:
        root.configure(bg=BG_COLOR)
    except Exception:
        pass
    _refresh_all_colors()
    sync_config_to_disk()
    return True

def _refresh_all_colors():
    """遍历所有 tk 控件，更新前景色 / 背景色匹配当前主题"""
    try:
        _walk_refresh(root)
    except Exception:
        pass

def _walk_refresh(widget):
    """递归更新控件颜色（跳过 ttk 控件和颜色指示条）"""
    try:
        cls = widget.winfo_class()
        bg = None
        try:
            bg = widget.cget('bg') if hasattr(widget, 'cget') else None
        except Exception:
            pass
        # 跳过颜色指示条（保持块颜色不变）
        if getattr(widget, 'is_color_indicator', False):
            pass
        elif cls in ('Label', 'Button', 'Checkbutton', 'Radiobutton', 'Menubutton'):
            if bg and bg not in ('SystemButtonFace',):
                try:
                    widget.config(fg='white' if bg == ACCENT else TEXT)
                except Exception:
                    pass
        elif cls in ('Entry', 'Spinbox', 'Text'):
            try:
                widget.config(fg=TEXT)
            except Exception:
                pass
        elif cls == 'Listbox':
            try:
                widget.config(fg=TEXT)
            except Exception:
                pass
        elif cls == 'Menu':
            try:
                widget.config(fg='white')  # 菜单一律白字
            except Exception:
                pass
    except Exception:
        pass
    try:
        for child in widget.winfo_children():
            _walk_refresh(child)
    except Exception:
        pass


def _schedule_color_refresh(delay_ms=100):
    """延迟刷新全局颜色（在面板重建后补调）"""
    if not _closing:
        root.after(delay_ms, _refresh_all_colors)


def get_current_theme_name():
    return _current_theme_name

MUSIC_DIR = os.path.join(BASE_DIR, "source", "music")
PLAYLIST_DIR = os.path.join(BASE_DIR, "source", "playlists")
LYRICS_DIR = os.path.join(BASE_DIR, "source", "lyrics")
RATINGS_FILE = os.path.join(BASE_DIR, "source", "ratings.json")
BLOCKS_FILE = os.path.join(BASE_DIR, "source", "blocks.json")
GENRES_FILE = os.path.join(BASE_DIR, "source", "genres.json")
LYRICS_FILE = os.path.join(BASE_DIR, "source", "lyrics.json")
METADATA_CACHE_FILE = os.path.join(BASE_DIR, "source", "metadata_cache.csv")
CONFIG_FILE = os.path.join(BASE_DIR, "source", "config.json")
NETEASE_BINDINGS_FILE = os.path.join(BASE_DIR, "source", "netease_bindings.json")

# ==================== 网易云API Enhanced 配置 ====================
API_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "api", "api-enhanced-4.35.0"))
API_BASE = "http://localhost:3000"
COOKIE_PATH = os.path.join(BASE_DIR, "source", ".cookie")

_api_session = None
_api_cookie = None  # 登录后的cookie字符串
_api_proc = None    # node 子进程

def _ensure_api_session():
    global _api_session
    if _api_session is None:
        _api_session = requests.Session()
        _api_session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36"
        })
    return _api_session

def _ts():
    return str(int(time.time() * 1000))

def _api_get(path, cookie=None):
    """调用 api-enhanced GET 接口"""
    sep = "&" if "?" in path else "?"
    url = f"{API_BASE}{path}{sep}timestamp={_ts()}"
    ck = cookie or _api_cookie
    if ck:
        url += f"&cookie={requests.utils.quote(ck)}"
    return _ensure_api_session().get(url, timeout=15)

def _api_post(path, cookie=None, **kw):
    """调用 api-enhanced POST 接口"""
    sep = "&" if "?" in path else "?"
    url = f"{API_BASE}{path}{sep}timestamp={_ts()}"
    json_data = dict(kw)
    ck = cookie or _api_cookie
    if ck:
        json_data["cookie"] = ck
    return _ensure_api_session().post(url, json=json_data, timeout=15)

def _api_server_check():
    """检查 API 服务是否运行"""
    try:
        return _ensure_api_session().get(f"{API_BASE}/", timeout=3).status_code < 500
    except:
        return False

def _api_server_start():
    """启动 API 服务 (后台线程)"""
    global _api_proc
    def _start():
        try:
            _api_proc = subprocess.Popen(
                ["/usr/local/bin/node", "app.js"],
                cwd=API_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            for _ in range(30):
                time.sleep(1)
                if _api_server_check():
                    return
        except FileNotFoundError:
            pass
    threading.Thread(target=_start, daemon=True).start()

def _api_server_stop():
    """停止 API 服务"""
    global _api_proc
    if _api_proc:
        try:
            _api_proc.terminate()
            _api_proc.wait(timeout=5)
        except:
            try:
                _api_proc.kill()
            except:
                pass
        _api_proc = None

def _get_api_code(d):
    """兼容不同API模块返回格式，提取code。
    部分模块(如login_status)会在body外再包一层data，需要穿透提取。"""
    code = d.get('code')
    if code is not None:
        return code
    # login_status 返回格式: { data: { code: 200, ... } }
    inner = d.get('data') or d.get('body')
    if isinstance(inner, dict):
        return inner.get('code')
    return None

def _load_cookie():
    """从文件加载 cookie（不做在线验证，避免误退登）"""
    global _api_cookie, netease_logged_in
    if os.path.exists(COOKIE_PATH):
        try:
            with open(COOKIE_PATH, 'r') as f:
                _api_cookie = f.read().strip()
            if _api_cookie:
                netease_logged_in = True
            return True
        except:
            pass
    return False

def _save_cookie(cookie_str):
    """保存 cookie 到文件"""
    global _api_cookie
    _api_cookie = cookie_str
    try:
        with open(COOKIE_PATH, 'w') as f:
            f.write(cookie_str)
    except:
        pass

os.makedirs(PLAYLIST_DIR, exist_ok=True)
os.makedirs(LYRICS_DIR, exist_ok=True)

SUPPORTED_EXTS = ('.mp3', '.flac')

def scan_audio_files(directory):
    if not os.path.isdir(directory):
        return []
    files = [f for f in os.listdir(directory)
             if f.lower().endswith(SUPPORTED_EXTS)]
    files.sort()
    return [os.path.join(directory, f) for f in files]

audio_paths = scan_audio_files(MUSIC_DIR)
if not audio_paths:
    print("错误：music 文件夹里没有音频文件！")
    sys.exit(1)

# ==================== 评分持久化 ====================
def load_ratings():
    if os.path.exists(RATINGS_FILE):
        with open(RATINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_ratings(ratings_dict):
    with open(RATINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(ratings_dict, f, ensure_ascii=False, indent=2)
    # 保存ratings时同步更新元数据缓存
    _sync_cache_from_ratings()

ratings = load_ratings()

# ==================== 配置持久化 (config.json) ====================
_default_config = {
    'note_display_mode': 'expanded',
    'artist_hidden': False,
    'cover_style': 'circle_rotate',
    'volume': 70,
    'play_mode': 'list_loop',
    'sort_mode': 'title',
    'backend': 'vlc',
    'show_index_headers': True,
    'comment_display_count': 15,
    'theme': '紫夜 (默认)',
}

# 列表顺序播放的"已播放位置"追踪（用于确定下一首/上一首）
list_seq_played_index = -1  # 已播放到的最高索引（列表播放模式下）

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return {**_default_config, **json.load(f)}
        except Exception:
            return dict(_default_config)
    return dict(_default_config)

def save_config(data):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

_config = load_config()
note_display_mode = _config.get('note_display_mode', 'expanded')
artist_hidden_default = _config.get('artist_hidden', False)
cover_style = _config.get('cover_style', 'circle_rotate')
current_volume = _config.get('volume', 70)
play_mode = _config.get('play_mode', 'list_loop')
sort_mode = _config.get('sort_mode', 'title')
backend = _config.get('backend', 'vlc')
show_index_headers = _config.get('show_index_headers', True)
comment_display_count = _config.get('comment_display_count', 15)
current_dl_br = _config.get('current_dl_br', 320000)  # 下载音质默认值
bilingual_lyrics = _config.get('bilingual_lyrics', True)
prefer_chinese_lyrics = _config.get('prefer_chinese_lyrics', True)

# 加载主题（仅设置颜色变量，不触发 UI——root 尚未创建）
_loaded_theme = _config.get('theme', '紫夜 (默认)')
_load_theme_vars(_loaded_theme)

def sync_config_to_disk():
    """将当前设置写入 config.json"""
    save_config({
        'note_display_mode': note_display_mode,
        'artist_hidden': artist_hidden_default,
        'cover_style': cover_style,
        'volume': current_volume,
        'play_mode': play_mode,
        'sort_mode': sort_mode,
        'backend': backend,
        'show_index_headers': show_index_headers,
        'comment_display_count': comment_display_count,
        'current_dl_br': current_dl_br,
        'bilingual_lyrics': bilingual_lyrics,
        'prefer_chinese_lyrics': prefer_chinese_lyrics,
        'theme': _current_theme_name,
    })

# ==================== 元数据缓存 (CSV) ====================
# 持久化在 metadata_cache.csv，读取快于 mutagen 解析
metadata_cache = {}  # {filepath: {'title': str, 'artist': str, 'duration': int}}

def load_metadata_cache():
    """启动时加载 CSV 缓存"""
    global metadata_cache
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
                            'duration': int(row.get('duration', '0') or '0')
                        }
        except Exception:
            cache = {}
    metadata_cache = cache

def save_metadata_cache():
    """将缓存写入 CSV（只在有变更时调用）"""
    try:
        with open(METADATA_CACHE_FILE, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['filepath', 'title', 'artist', 'duration'])
            for fp, info in metadata_cache.items():
                writer.writerow([fp, info.get('title', ''), info.get('artist', ''), info.get('duration', 0)])
    except Exception:
        pass

def _sync_cache_from_ratings():
    """从 ratings 同步数据到 cache"""
    changed = False
    for fp, ud in ratings.items():
        if fp not in metadata_cache:
            metadata_cache[fp] = {'title': ud.get('title', ''), 'artist': ud.get('artist', ''), 'duration': 0}
            changed = True
        else:
            t = ud.get('title', '')
            a = ud.get('artist', '')
            if t and metadata_cache[fp].get('title') != t:
                metadata_cache[fp]['title'] = t
                changed = True
            if a and metadata_cache[fp].get('artist') != a:
                metadata_cache[fp]['artist'] = a
                changed = True
    if changed:
        save_metadata_cache()

def get_cached_title(filepath):
    """从缓存快速获取显示名（歌手 - 歌名），不触发 mutagen"""
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
    
    # 返回 "歌手 - 歌名" 格式
    if artist and artist != '未知歌手' and title:
        return f"{artist} - {title}"
    return title

def get_cached_artist(filepath):
    """从缓存快速获取歌手，不触发 mutagen"""
    if filepath in metadata_cache and metadata_cache[filepath].get('artist'):
        return metadata_cache[filepath]['artist']
    ud = ratings.get(filepath, {})
    if ud.get('artist'):
        return ud['artist']
    return '未知歌手'

def update_cache_from_load(filepath, title, artist, duration):
    """load_song_info 解析出数据后同步到缓存"""
    if filepath not in metadata_cache or metadata_cache[filepath].get('title') != title or metadata_cache[filepath].get('artist') != artist:
        metadata_cache[filepath] = {'title': title, 'artist': artist, 'duration': duration}
        # 每 20 条写一次
        if len(metadata_cache) % 20 == 0:
            save_metadata_cache()

# ==================== 歌词管理 ====================
def load_lyrics():
    """加载歌词数据"""
    if os.path.exists(LYRICS_FILE):
        try:
            with open(LYRICS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_lyrics(lyrics_dict):
    """保存歌词数据"""
    try:
        with open(LYRICS_FILE, 'w', encoding='utf-8') as f:
            json.dump(lyrics_dict, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"保存歌词出错: {e}")

def parse_lrc_file(lrc_path, trans_lrc_path=None):
    """解析LRC文件，返回行歌词列表
    返回格式：[(时间秒数, 歌词文本, 翻译文本或空), ...]
    如果提供翻译文件路径，会合并双语歌词
    """
    lyrics_data = []
    try:
        with open(lrc_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('{'):
                    continue
                if line.startswith('[') and ']' in line:
                    bracket_end = line.find(']')
                    time_str = line[1:bracket_end]
                    lyric_text = line[bracket_end+1:]
                    try:
                        parts = time_str.split(':')
                        minutes = int(parts[0])
                        seconds = float(parts[1])
                        total_seconds = minutes * 60 + seconds
                        if lyric_text.strip():
                            lyrics_data.append((total_seconds, lyric_text.strip(), ''))
                    except Exception:
                        continue
        # 合并翻译歌词
        if trans_lrc_path and os.path.exists(trans_lrc_path):
            trans_map = {}
            with open(trans_lrc_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('{'):
                        continue
                    if line.startswith('[') and ']' in line:
                        bracket_end = line.find(']')
                        time_str = line[1:bracket_end]
                        lyric_text = line[bracket_end+1:]
                        try:
                            parts = time_str.split(':')
                            minutes = int(parts[0])
                            seconds = float(parts[1])
                            total_seconds = minutes * 60 + seconds
                            if lyric_text.strip():
                                trans_map[total_seconds] = lyric_text.strip()
                        except Exception:
                            continue
            for i, (t, txt, _) in enumerate(lyrics_data):
                if t in trans_map:
                    lyrics_data[i] = (t, txt, trans_map[t])
        # 检测内联双语格式：同一时间戳出现两次 → 第二条是翻译
        seen = {}
        merged = []
        for t, txt, tr in lyrics_data:
            if t in seen:
                idx = seen[t]
                merged[idx] = (t, merged[idx][1], txt)
            else:
                seen[t] = len(merged)
                merged.append((t, txt, tr))
        if len(merged) < len(lyrics_data):
            lyrics_data = merged
        lyrics_data.sort(key=lambda x: x[0])
        return lyrics_data
    except Exception as e:
        print(f"解析LRC文件失败: {e}")
        return []

lyrics = load_lyrics()

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

# ==================== 网易云音乐绑定管理 ====================
def load_netease_bindings():
    """加载歌曲与网易云ID的绑定关系 {本地文件路径: 网易云歌曲ID}"""
    return load_json_file(NETEASE_BINDINGS_FILE, {})

def save_netease_bindings(bindings):
    """保存歌曲与网易云ID的绑定关系"""
    save_json_file(NETEASE_BINDINGS_FILE, bindings)

def get_netease_song_id(filepath):
    """获取本地歌曲绑定的网易云歌曲ID，如果没有绑定则返回None"""
    bindings = load_netease_bindings()
    return bindings.get(filepath)

def bind_netease_song(filepath, netease_id):
    """绑定本地歌曲到网易云歌曲ID"""
    bindings = load_netease_bindings()
    bindings[filepath] = netease_id
    save_netease_bindings(bindings)

def unbind_netease_song(filepath):
    """解除本地歌曲的网易云绑定"""
    bindings = load_netease_bindings()
    if filepath in bindings:
        del bindings[filepath]
        save_netease_bindings(bindings)

# ==================== 网易云音乐API (via api-enhanced) ====================
def netease_extract_song_id(input_str):
    """从输入的URL或纯数字ID中提取歌曲ID"""
    match = re.search(r'id=(\d+)', input_str)
    if match:
        return match.group(1)
    if input_str.isdigit():
        return input_str
    return None

def netease_get_song_info(netease_id):
    """获取网易云歌曲基本信息（通过 api-enhanced /song/detail）"""
    try:
        r = _api_get(f"/song/detail?ids={netease_id}")
        data = r.json()
        if data.get("code") != 200 or not data.get("songs"):
            return None
        song = data["songs"][0]
        artists = song.get("ar", [])
        album = song.get("al", {})
        album_name = album.get("name", "未知专辑") if album else "未知专辑"
        album_pic_url = album.get("picUrl", "") if isinstance(album, dict) else ""
        return {
            "name": song["name"],
            "artists": "/".join([a["name"] for a in artists]),
            "album": album_name,
            "cover_url": album_pic_url,
            "id": str(song["id"]),
        }
    except Exception:
        return None

def netease_fetch_cover(netease_id, save_path):
    """下载网易云歌曲封面图片到指定路径"""
    info = netease_get_song_info(netease_id)
    if not info or not info.get("cover_url"):
        return False
    try:
        resp = _ensure_api_session().get(info["cover_url"], timeout=15)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, 'wb') as f:
            f.write(resp.content)
        return True
    except Exception:
        return False

def netease_fetch_lyrics(netease_id):
    """获取网易云歌曲歌词（通过 api-enhanced /lyric）
    返回 (original_lrc, translation_lrc) 或 (original_lrc, None) 或 None"""
    try:
        r = _api_get(f"/lyric?id={netease_id}")
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

def netease_fetch_comments(netease_id, page=1, page_size=20):
    """获取网易云歌曲评论（通过 api-enhanced /comment/music）"""
    try:
        offset = (page - 1) * page_size
        r = _api_get(f"/comment/music?id={netease_id}&limit={page_size}&offset={offset}")
        data = r.json()
        if data.get("code") != 200:
            return [], 0
        total = data.get("total", 0)
        hot_comments = data.get("hotComments", [])
        regular_comments = data.get("comments", [])
        if len(hot_comments) >= page_size:
            result = hot_comments[:page_size]
        else:
            result = hot_comments.copy()
            needed = page_size - len(result)
            existing_ids = {c.get('commentId') for c in result}
            for c in regular_comments:
                if len(result) >= page_size:
                    break
                if c.get('commentId') not in existing_ids:
                    result.append(c)
        return result, total
    except Exception:
        return [], 0

def _save_netease_lyrics(saved_path, lrc_tuple, artist='', title=''):
    """将 netease_fetch_lyrics 的结果保存为 .lrc 和 .trans.lrc"""
    if not lrc_tuple or not saved_path:
        return
    orig, trans = lrc_tuple
    lfn = f"{artist} - {title}.lrc" if artist else f"{title}.lrc"
    lfn = re.sub(r'[\\/*?:"<>|]', '', lfn)
    dest_lrc = os.path.join(LYRICS_DIR, lfn)
    try:
        with open(dest_lrc, 'w', encoding='utf-8') as f:
            f.write(orig)
        lyrics[saved_path] = dest_lrc
        if trans:
            trans_fn = lfn.replace('.lrc', '.trans.lrc')
            dest_trans = os.path.join(LYRICS_DIR, trans_fn)
            with open(dest_trans, 'w', encoding='utf-8') as f:
                f.write(trans)
        save_lyrics(lyrics)
    except:
        pass

# ==================== 网易云登录与下载 (via api-enhanced) ====================
netease_logged_in = False
netease_uid = ''  # 登录用户的网易云UID

def netease_login_cellphone(phone, password):
    """手机号登录（通过 api-enhanced /login/cellphone）"""
    global netease_logged_in, _api_cookie
    try:
        r = _api_get(f"/login/cellphone?phone={phone}&password={requests.utils.quote(password)}")
        data = r.json()
        if data.get("code") == 200:
            netease_logged_in = True
            cookie = data.get("cookie", "")
            if cookie:
                _save_cookie(cookie)
            profile = data.get("profile", {})
            return True, profile.get("nickname", phone)
        else:
            return False, data.get("message", data.get("msg", "登录失败"))
    except Exception as e:
        return False, str(e)

def netease_login_qrcode():
    """QR码登录第一步：获取unikey（通过 api-enhanced /login/qr/key）"""
    global netease_logged_in
    try:
        r = _api_get("/login/qr/key")
        data = r.json()
        if data.get("code") != 200:
            return False, "获取二维码密钥失败", None
        unikey = data["data"]["unikey"]
        return True, unikey, unikey
    except Exception as e:
        return False, str(e), None

def netease_login_qrcode_poll(unikey):
    """轮询QR码状态（通过 api-enhanced /login/qr/check）"""
    global netease_logged_in, _api_cookie
    try:
        r = _api_get(f"/login/qr/check?key={unikey}&noCookie=true")
        data = r.json()
        code = data.get("code")
        if code == 803:
            netease_logged_in = True
            cookie = data.get("cookie", "")
            if cookie:
                _save_cookie(cookie)
            return 1
        elif code == 802: return 0
        elif code == 801: return -1
        elif code == 800: return -2
        return -1
    except Exception:
        return -1

def netease_is_logged_in():
    return netease_logged_in

def netease_logout():
    global netease_logged_in, _api_cookie
    netease_logged_in = False
    _api_cookie = None
    try:
        os.remove(COOKIE_PATH)
    except:
        pass

def netease_get_song_audio_url(netease_id, bitrate=320000):
    """获取歌曲播放URL。对高音质请求额外尝试下载接口。
    返回 (url, actual_bitrate)"""
    # 构建尝试列表：请求值优先，然后从高到低回退
    br_list = [bitrate]
    for br in [320000, 192000, 128000]:
        if br < bitrate:
            br_list.append(br)
    for br in br_list:
        if br >= 999000:
            # 无损及以上：优先用下载接口
            try:
                r = _api_get(f"/song/download/url?id={netease_id}&br={br}")
                data = r.json()
                if _get_api_code(data) == 200 and data.get("data"):
                    url = data["data"].get("url", "")
                    if url:
                        return url, data["data"].get("br", br)
            except:
                pass
        # 标准流媒体接口
        try:
            r = _api_get(f"/song/url?id={netease_id}&br={br}")
            data = r.json()
            if _get_api_code(data) != 200 or not data.get("data"):
                continue
            for item in data["data"]:
                if item.get("url"):
                    return item["url"], item.get("br", br)
        except Exception:
            continue
    return None, 0

def netease_download_song(netease_id, save_dir, bitrate=320000):
    """下载网易云歌曲"""
    info = netease_get_song_info(netease_id)
    if not info:
        return False, "未找到该歌曲", None
    audio_url, got_br = netease_get_song_audio_url(netease_id, bitrate)
    if not audio_url:
        return False, "无法获取播放地址（可能为VIP或下架歌曲，请尝试登录）", info
    # 根据实际获取的音质和URL推断扩展名
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
        resp = _ensure_api_session().get(audio_url, stream=True, timeout=120)
        resp.raise_for_status()
        content_type = resp.headers.get('content-type', '').lower()
        if 'audio' not in content_type and 'octet' not in content_type and 'mpeg' not in content_type:
            first_chunk = next(resp.iter_content(8192), b'')
            if not first_chunk or len(first_chunk) < 512:
                return False, "未获取到有效音频数据（VIP歌曲需要登录）。请在设置中登录网易云后重试。", info
            if first_chunk[:5] == b'<?xml' or first_chunk[:5] == b'<!DOC' or first_chunk[:1] == b'{' or first_chunk[:1] == b'<':
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
            try: os.remove(save_path)
            except: pass
        return False, str(e), info

def netease_search_song(keyword, limit=5):
    """按关键词搜索歌曲（通过 api-enhanced /search）"""
    try:
        r = _api_get(f"/search?keywords={requests.utils.quote(keyword)}&type=1&limit={limit}")
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

blocks = load_json_file(BLOCKS_FILE, [])
genres = load_json_file(GENRES_FILE, [])

# Normalize blocks format: convert string array to object array with colors
def normalize_blocks():
    global blocks
    normalized = []
    for b in blocks:
        if isinstance(b, dict):
            # Already object format
            if 'name' not in b:
                b['name'] = str(b)
            if 'color' not in b:
                b['color'] = '#1e3a8a'  # default dark blue
            normalized.append(b)
        else:
            # String format, convert to object
            normalized.append({'name': str(b), 'color': '#1e3a8a'})
    blocks = normalized
    save_json_file(BLOCKS_FILE, blocks)

normalize_blocks()

# Helper function to get block color by name
def get_block_color(block_name):
    for b in blocks:
        if isinstance(b, dict) and b.get('name') == block_name:
            return b.get('color', '#1e3a8a')
    return '#1e3a8a'

# Helper function to setup row hover effect
def setup_row_hover(row_widget, original_bg, hover_bg=None, child_widgets=None, path=None):
    """Setup hover effect for a song row, respecting selection state.
    
    If the row's path is in selected_paths, the ACCENT color is preserved
    during hover instead of being overridden.
    """
    if hover_bg is None:
        hover_bg = CARD_HOVER
    if child_widgets is None:
        child_widgets = []
    
    def _is_selected():
        if path is None:
            return False
        return path in selected_paths
    
    def on_enter(event=None):
        if _is_selected():
            selected_bg = ACCENT
            row_widget.config(bg=selected_bg)
            for w in child_widgets:
                if hasattr(w, 'config'):
                    # Don't change color_bar background (keep block color)
                    if getattr(w, 'is_color_indicator', False):
                        continue
                    w.config(bg=selected_bg)
        else:
            row_widget.config(bg=hover_bg)
            for w in child_widgets:
                if hasattr(w, 'config'):
                    # Don't change color_bar background (keep block color)
                    if getattr(w, 'is_color_indicator', False):
                        continue
                    w.config(bg=hover_bg)
    
    def on_leave(event=None):
        if _is_selected():
            selected_bg = ACCENT
            row_widget.config(bg=selected_bg)
            for w in child_widgets:
                if hasattr(w, 'config'):
                    if getattr(w, 'is_color_indicator', False):
                        continue
                    w.config(bg=selected_bg)
        else:
            row_widget.config(bg=original_bg)
            for w in child_widgets:
                if hasattr(w, 'config'):
                    if getattr(w, 'is_color_indicator', False):
                        continue
                    w.config(bg=original_bg)
    
    row_widget.bind('<Enter>', on_enter)
    row_widget.bind('<Leave>', on_leave)
    # Also bind to children
    for widget in child_widgets:
        widget.bind('<Enter>', on_enter)
        widget.bind('<Leave>', on_leave)

# Helper function to set block color by name
def set_block_color(block_name, color):
    for b in blocks:
        if isinstance(b, dict) and b.get('name') == block_name:
            b['color'] = color
            save_json_file(BLOCKS_FILE, blocks)
            return True
    return False

# ==================== VLC 播放引擎 ====================
instance = vlc.Instance()
player = instance.media_player_new()
player.audio_set_volume(current_volume)

playlist = []
current_playlist_index = -1
paused = False
stopped = True
dragging = False
current_pos = 0.0
last_tick = 0.0
skip_updates = 0
# play_mode, sort_mode, backend, note_display_mode 等从 config.json 加载
history = []
# Global filter variables
filter_search_var = None
filter_rating_min_var = None
filter_rating_max_var = None
filter_block_var = None
filter_genre_var = None
filter_expanded = True

# Scrolling text support
scrolling_labels = {}  # {label_widget: {original_text, current_pos, full_text}}
scroll_animation_id = None

song_info_cache = {}
total_seconds = 0
duration_str = "0:00"

# 分组折叠状态
collapsed_groups = set()  # 被折叠的分组名集合

shuffle_queue = []
shuffle_pos = 0

# Play mark tracking
currently_playing_path = None
marked_library_row = None
marked_filter_row = None

# ==================== 关闭标志 ====================
_closing = False  # 关闭时阻止after循环继续调度
_switching_song = False  # 切歌防重入锁，防止play_file被并发调用导致卡死

# 歌词显示相关
current_lyrics = []  # 当前歌曲的歌词列表
current_lyric_index = -1  # 当前显示的歌词行索引
lyrics_label = None  # 歌词显示标签 (unused, kept for compat)
lyrics_canvas = None  # 歌词Canvas (set in UI build)

# 封面样式: 'circle_rotate' 或 'square_static'
cover_style = 'circle_rotate'
cover_rotation_angle = 0.0
cover_original_image = None  # 缓存的原始封面图片 (PIL.Image)

# ==================== 元数据 ====================
def score_to_color(score: float) -> str:
    # map 0.0..10.0 to color gradient from warm orange to vibrant green
    try:
        t = max(0.0, min(10.0, float(score))) / 10.0
    except Exception:
        t = 0.0
    # start color (warm amber) → end color (vibrant green)
    r0, g0, b0 = (245, 158, 11)   # amber
    r1, g1, b1 = (34, 197, 94)    # green
    r = int(r0 + (r1 - r0) * t)
    g = int(g0 + (g1 - g0) * t)
    b = int(b0 + (b1 - b0) * t)
    return f"#{r:02x}{g:02x}{b:02x}"


# Simple tooltip helper
class SimpleTooltip:
    def __init__(self, widget, text_func):
        self.widget = widget
        self.text_func = text_func
        self.tipwindow = None
        widget.bind('<Enter>', self.enter)
        widget.bind('<Leave>', self.leave)
        widget.bind('<Motion>', self.motion)

    def enter(self, event=None):
        self.showtip()

    def motion(self, event=None):
        if self.tipwindow:
            x = event.x_root + 10
            y = event.y_root + 10
            self.tipwindow.geometry(f'+{x}+{y}')

    def leave(self, event=None):
        self.hidetip()

    def showtip(self):
        text = self.text_func()
        if not text:
            return
        if self.tipwindow or not text:
            return
        self.tipwindow = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_attributes('-topmost', True)
        label = tk.Label(tw, text=text, justify=tk.LEFT,
                         background='#222', foreground='white', relief=tk.SOLID, borderwidth=1,
                         font=('微软雅黑', 9))
        label.pack(ipadx=4, ipady=2)
        # position near mouse
        try:
            x = self.widget.winfo_pointerx() + 10
            y = self.widget.winfo_pointery() + 10
            tw.geometry(f'+{x}+{y}')
        except Exception:
            pass

    def hidetip(self):
        tw = self.tipwindow
        self.tipwindow = None
        if tw:
            tw.destroy()

def get_duration_from_vlc(filepath):
    try:
        media = instance.media_new(filepath)
        media.parse()
        dur_ms = media.get_duration()
        if dur_ms > 0:
            return dur_ms // 1000
    except:
        pass
    return 0

def load_song_info(filepath):
    if filepath in song_info_cache:
        return song_info_cache[filepath]

    raw_name = os.path.splitext(os.path.basename(filepath))[0]
    title = raw_name
    artist = "未知歌手"
    
    # 尝试从文件名解析 "歌手 - 歌名"
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
                    if tags.get("TIT2"): title = str(tags["TIT2"])
                    if tags.get("TPE1"): artist = str(tags["TPE1"])
                elif isinstance(audio, FLAC):
                    t = tags.get("TITLE")
                    if t and isinstance(t, list) and t[0]: title = str(t[0])
                    a = tags.get("ARTIST")
                    if a and isinstance(a, list) and a[0]: artist = str(a[0])
            
            # 修复：更完善的封面图片读取逻辑
            if isinstance(audio, MP3):
                if tags is not None:
                    for tag in tags.values():
                        if isinstance(tag, APIC):
                            try:
                                pic_data = tag.data
                                if pic_data:
                                    cover_image = Image.open(io.BytesIO(pic_data))
                                    break
                            except Exception as e:
                                pass
            elif isinstance(audio, FLAC):
                try:
                    if hasattr(audio, 'pictures') and audio.pictures:
                        for pic in audio.pictures:
                            try:
                                pic_data = pic.data
                                if pic_data:
                                    cover_image = Image.open(io.BytesIO(pic_data))
                                    break
                            except Exception as e:
                                continue
                except Exception as e:
                    pass
    except Exception as e:
        pass

    if duration_sec == 0:
        duration_sec = get_duration_from_vlc(filepath)

    user_data = ratings.get(filepath, {})
    if user_data.get("title"):
        title = user_data["title"]
    if user_data.get("artist"):
        artist = user_data["artist"]
    if user_data.get("cover"):
        cover_path = user_data["cover"]
        if os.path.exists(cover_path):
            try:
                cover_image = Image.open(cover_path)
            except:
                cover_image = None
    score = user_data.get("score", 0)
    note = user_data.get("note", "")
    genre = user_data.get("genre", "")
    block = user_data.get("block", "")
    comment = user_data.get("comment", "")
    play_count = user_data.get("play_count", 0)
    
    # 加载歌词
    lyrics_data = lyrics.get(filepath, [])
    # 如果歌词存的是文件路径字符串，解析为列表（含翻译）
    if isinstance(lyrics_data, str) and os.path.exists(lyrics_data):
        trans_path = lyrics_data.replace('.lrc', '.trans.lrc')
        parsed = parse_lrc_file(lyrics_data, trans_path if os.path.exists(trans_path) else None)
        if parsed:
            lyrics[filepath] = parsed
            save_lyrics(lyrics)
            lyrics_data = parsed
    # 双语设置关闭时选择单语
    if not bilingual_lyrics and lyrics_data and isinstance(lyrics_data, list) and len(lyrics_data) > 0:
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
        "score": score,
        "note": note,
        "genre": genre,
        "block": block,
        "comment": comment,
        "play_count": play_count,
        "lyrics": lyrics_data
    }
    song_info_cache[filepath] = info
    # 同步到元数据缓存
    update_cache_from_load(filepath, title, artist, duration_sec)
    return info

# ==================== 播放标记 ====================
def update_play_mark(filepath):
    """Mark the currently playing song with raised relief"""
    global currently_playing_path, marked_library_row, marked_filter_row

    def _safe_clear_mark(row_ref):
        """安全清除播放标记，防止 row 已被销毁"""
        if row_ref:
            try:
                if row_ref.winfo_exists():
                    for child in row_ref.winfo_children():
                        if not getattr(child, 'is_color_indicator', False):
                            child.config(relief='flat')
            except Exception:
                pass
        return None

    _safe_clear_mark(marked_library_row)
    _safe_clear_mark(marked_filter_row)
    marked_library_row = None
    marked_filter_row = None
    
    currently_playing_path = filepath
    
    # Find and mark the row in song_rows (library view)
    for row in song_rows:
        if getattr(row, 'path', None) == filepath:
            try:
                if row.winfo_exists():
                    for child in row.winfo_children():
                        if not getattr(child, 'is_color_indicator', False):
                            child.config(relief='raised')
                    marked_library_row = row
            except Exception:
                pass
            break
    
    # Find and mark the row in filter_song_rows (filter results view)
    for row in filter_song_rows:
        if getattr(row, 'song_path', None) == filepath:
            try:
                if row.winfo_exists():
                    for child in row.winfo_children():
                        if not getattr(child, 'is_color_indicator', False):
                            child.config(relief='raised')
                    marked_filter_row = row
            except Exception:
                pass
            break

def clear_play_mark():
    """Clear the play mark when playback stops"""
    global currently_playing_path, marked_library_row, marked_filter_row
    def _safe_clear(row_ref):
        if row_ref:
            try:
                if row_ref.winfo_exists():
                    for child in row_ref.winfo_children():
                        if not getattr(child, 'is_color_indicator', False):
                            child.config(relief='flat')
            except Exception:
                pass
        return None
    _safe_clear(marked_library_row)
    _safe_clear(marked_filter_row)
    marked_library_row = None
    marked_filter_row = None
    
    currently_playing_path = None

# ==================== 播放控制 ====================
def play_file(filepath, add_to_history=True):
    global stopped, paused, current_pos, last_tick, skip_updates, current_playlist_index, history, selected_paths
    global list_seq_played_index, _switching_song
    
    # 防重入：如果正在切歌中，忽略本次调用
    if _switching_song:
        return
    _switching_song = True
    
    try:
        _play_file_impl(filepath, add_to_history)
    finally:
        _switching_song = False


def _play_file_impl(filepath, add_to_history=True):
    global stopped, paused, current_pos, last_tick, skip_updates, current_playlist_index, history, selected_paths
    global list_seq_played_index
    
    # 记录旧索引（用于历史记录）
    old_index = current_playlist_index if 0 <= current_playlist_index < len(playlist) else -1
    
    if play_mode == "random":
        # 随机模式：不移到第一位，保持播放列表顺序不变
        if filepath not in playlist:
            playlist.append(filepath)
        current_playlist_index = playlist.index(filepath)
    elif play_mode == "list_sequential":
        # 列表播放模式：播放中的歌不一定要处于第一位
        if filepath not in playlist:
            playlist.append(filepath)
        current_playlist_index = playlist.index(filepath)
        # 更新已播放位置
        if add_to_history and current_playlist_index > list_seq_played_index:
            list_seq_played_index = current_playlist_index
    else:
        # 循环模式 (list_loop / single_loop)：当前播放的歌保持在列表第一位
        if filepath in playlist:
            playlist.remove(filepath)
        playlist.insert(0, filepath)
        current_playlist_index = 0

    # 历史记录：存入切换到当前歌曲之前的那首的索引
    if add_to_history and not stopped and old_index != -1 and old_index != current_playlist_index:
        if not history or history[-1] != old_index:
            history.append(old_index)

    # 增加播放次数统计
    if filepath in ratings:
        ratings[filepath]['play_count'] = ratings[filepath].get('play_count', 0) + 1
    else:
        ratings[filepath] = {'play_count': 1}
    save_ratings(ratings)
    
    # 双击播放时清除选中
    if not add_to_history:
        selected_paths.clear()
        refresh_song_library(skip_rescan=True)

    # 播放列表状态更新
    update_playlist_listbox()

    if backend == 'vlc':
        # 先停止当前播放，防止set_media阻塞导致卡死
        try:
            player.stop()
        except Exception:
            pass
        media = instance.media_new(filepath)
        player.set_media(media)
        player.play()
        stopped = False
        paused = False
        current_pos = 0.0
        last_tick = time.time()
        skip_updates = 3  # give VLC extra time to stabilize for new files
        init_progress_on_play()
    else:
        # pygame backend
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(buffer=8192)
            pygame.mixer.music.load(filepath)
            pygame.mixer.music.play()
            init_progress_on_play()
            stopped = False
            paused = False
            current_pos = 0.0
            last_tick = time.time()
            skip_updates = 0
            # stop vlc if it was playing
            try:
                player.stop()
            except Exception:
                pass
        except Exception as e:
            messagebox.showerror("错误", f"Pygame 播放失败：{e}")
            return
    update_ui_for_current_song()
    update_play_button()
    update_bar()
    update_playlist_listbox()
    update_play_mark(filepath)
    # 双击时清除选中并刷新库
    if not add_to_history:
        selected_paths.clear()
        refresh_song_library(skip_rescan=True)

def pause_or_resume():
    global paused, stopped, last_tick
    if stopped and playlist:
        # 恢复播放上次的歌曲（而非始终从列表第一位播放）
        resume_idx = current_playlist_index if 0 <= current_playlist_index < len(playlist) else 0
        play_file(playlist[resume_idx], add_to_history=False)
        return
    if backend == 'vlc':
        if paused:
            player.play()
            paused = False
            last_tick = time.time()
        else:
            player.pause()
            paused = True
    else:
        if paused:
            pygame.mixer.music.unpause()
            paused = False
            last_tick = time.time()
        else:
            pygame.mixer.music.pause()
            paused = True
    update_play_button()

def stop():
    global stopped, paused, current_pos, skip_updates, history, list_seq_played_index
    if backend == 'vlc':
        player.stop()
    else:
        try:
            pygame.mixer.music.stop()
        except Exception:
            pass
    stopped = True
    paused = False
    current_pos = 0.0
    skip_updates = 0
    history = []
    list_seq_played_index = -1
    update_play_button()
    update_bar()
    clear_play_mark()

def seek(seconds):
    global current_pos, last_tick, skip_updates
    if not stopped:
        if backend == 'vlc':
            player.set_time(int(seconds * 1000))
        else:
            try:
                pygame.mixer.music.set_pos(float(seconds))
            except Exception:
                pass
        current_pos = seconds
        last_tick = time.time()
        skip_updates = 2
        update_bar()

def set_volume(val):
    global current_volume
    volume = int(float(val))
    if backend == 'vlc':
        player.audio_set_volume(volume)
    else:
        try:
            pygame.mixer.music.set_volume(float(volume) / 100.0)
        except Exception:
            pass
    current_volume = volume
    volume_label.config(text=f"音量：{volume}%")
    sync_config_to_disk()

# ==================== 切歌与模式 ====================
def regenerate_shuffle():
    global shuffle_queue, shuffle_pos
    if not playlist: return
    indices = list(range(len(playlist)))
    random.shuffle(indices)
    if not stopped and current_playlist_index in indices:
        indices.remove(current_playlist_index)
        indices.insert(0, current_playlist_index)
        shuffle_pos = 0
    shuffle_queue = indices

def set_play_mode(mode):
    global play_mode, history, shuffle_queue, shuffle_pos, list_seq_played_index
    global current_playlist_index
    
    old_mode = play_mode
    play_mode = mode
    sync_config_to_disk()
    history = []
    
    # 从随机模式切换到循环模式：把正在播放的歌移到第一位（保持播放不中断）
    if old_mode == "random" and mode in ("list_loop", "list_sequential"):
        if not stopped and 0 <= current_playlist_index < len(playlist):
            current_song = playlist[current_playlist_index]
            if current_song in playlist:
                playlist.remove(current_song)
            playlist.insert(0, current_song)
            current_playlist_index = 0
            update_playlist_listbox()
    
    # 从列表播放切换到循环播放：前面歌曲按相对顺序移到末尾，当前歌移到第一位
    if old_mode == "list_sequential" and mode == "list_loop":
        if not stopped and 0 <= current_playlist_index < len(playlist):
            # 把当前歌前面的所有歌曲按相对顺序移到末尾
            before = playlist[:current_playlist_index]
            after = playlist[current_playlist_index:]
            playlist[:] = after + before
            current_playlist_index = 0
            update_playlist_listbox()
    
    # 切换到列表播放模式：初始化已播放位置
    if mode == "list_sequential":
        list_seq_played_index = current_playlist_index if 0 <= current_playlist_index < len(playlist) else -1
    
    if mode == "random":
        regenerate_shuffle()
    
    update_mode_display()

def next_song():
    global current_playlist_index, shuffle_pos, shuffle_queue, stopped, paused
    global list_seq_played_index
    
    if not playlist:
        return
    
    if play_mode == "single_loop":
        if 0 <= current_playlist_index < len(playlist):
            play_file(playlist[current_playlist_index], add_to_history=False)
        return
    
    elif play_mode == "random":
        # 随机模式：从shuffle队列取下一首，不移动播放列表
        if not shuffle_queue:
            regenerate_shuffle()
        shuffle_pos = (shuffle_pos + 1) % len(shuffle_queue)
        next_idx = shuffle_queue[shuffle_pos]
        play_file(playlist[next_idx])
        return
    
    elif play_mode == "list_sequential":
        # 列表播放模式：播放当前歌下方的歌，到底部则停止
        next_idx = current_playlist_index + 1
        if next_idx >= len(playlist):
            # 到达列表底部，停止播放
            stop()
            return
        play_file(playlist[next_idx])
        return
    
    else:
        # 循环模式 (list_loop)：当前歌曲移到末尾，新的第一首自动成为当前歌曲
        if len(playlist) <= 1:
            # 只有一首歌，重播
            if 0 <= current_playlist_index < len(playlist):
                play_file(playlist[current_playlist_index], add_to_history=False)
            return
        
        # 将当前第一首移到末尾
        old_song = playlist.pop(0)
        playlist.append(old_song)
        
        # 新第一首即为要播放的歌曲
        current_playlist_index = 0
        play_file(playlist[0], add_to_history=False)
        update_playlist_listbox()


def prev_song():
    global current_playlist_index, history
    global list_seq_played_index
    
    if not playlist:
        return
    
    if play_mode == "single_loop":
        if 0 <= current_playlist_index < len(playlist):
            play_file(playlist[current_playlist_index], add_to_history=False)
        return
    
    elif play_mode == "random":
        # 随机模式：从历史记录回到上一首播放的歌
        if history:
            prev_idx = history.pop()
            if 0 <= prev_idx < len(playlist):
                play_file(playlist[prev_idx], add_to_history=False)
                return
        # 无历史记录，重播当前歌曲
        if 0 <= current_playlist_index < len(playlist):
            play_file(playlist[current_playlist_index], add_to_history=False)
        return
    
    elif play_mode == "list_sequential":
        # 列表播放模式：播放前一首歌
        if history:
            prev_idx = history.pop()
            if 0 <= prev_idx < len(playlist):
                play_file(playlist[prev_idx], add_to_history=False)
                return
        # 无历史或当前是第一首，重播当前
        if 0 <= current_playlist_index < len(playlist):
            play_file(playlist[current_playlist_index], add_to_history=False)
        return
    
    else:
        # 循环模式 (list_loop)：所有歌曲后移一位，最后一首移到第一位并播放
        if len(playlist) <= 1:
            if 0 <= current_playlist_index < len(playlist):
                play_file(playlist[current_playlist_index], add_to_history=False)
            return
        
        # 所有歌曲后移一位（保持相对位置不变），最后一首移到第一位
        last_song = playlist.pop()
        playlist.insert(0, last_song)
        
        current_playlist_index = 0
        play_file(last_song, add_to_history=False)
        update_playlist_listbox()

# ==================== UI 更新函数 ====================
COVER_SIZE = 200

def update_ui_for_current_song():
    global total_seconds, duration_str, current_lyrics, current_lyric_index
    if current_playlist_index == -1 or not playlist:
        title_label.config(text="歌曲：...")
        artist_label.config(text="歌手：...")
        duration_label.config(text="时长：...")
        cover_label.config(image='', bg=PANEL_BG, text="")
        score_var.set(0.0)
        current_lyrics = []
        current_lyric_index = -1
        return
    filepath = playlist[current_playlist_index]
    info = load_song_info(filepath)
    title_label.config(text=f"歌曲：{info['title']}")
    artist_label.config(text=f"歌手：{info['artist']}")
    total_seconds = info['duration']
    duration_str = f"{total_seconds // 60}:{total_seconds % 60:02d}" if total_seconds > 0 else "未知时长"
    duration_label.config(text=f"时长：{duration_str}")
    
    # 加载当前歌曲的歌词
    current_lyrics = info.get('lyrics', [])
    current_lyric_index = -1
    
    # Update score spinbox with current song's score
    current_score = float(ratings.get(filepath, {}).get('score', 0.0) or 0.0)
    score_var.set(current_score)

    cover = info['cover']
    global cover_original_image, cover_rotation_angle
    cover_original_image = cover  # Cache for rotation
    cover_rotation_angle = 0.0
    if cover:
        try:
            size = (COVER_SIZE, COVER_SIZE)
            cover_resized = cover.resize(size, Image.Resampling.LANCZOS)
            if cover_resized.mode != 'RGBA':
                cover_resized = cover_resized.convert('RGBA')
            
            if cover_style == 'circle_rotate':
                # 圆形遮罩
                mask = Image.new("L", size, 0)
                draw = ImageDraw.Draw(mask)
                draw.ellipse((0, 0) + size, fill=255)
                cover_resized.putalpha(mask)
            
            photo = ImageTk.PhotoImage(cover_resized)
            cover_label.config(image=photo, bg=BG_COLOR, width=COVER_SIZE, height=COVER_SIZE)
            cover_label.image = photo
        except Exception as e:
            try:
                size = (COVER_SIZE, COVER_SIZE)
                cover_resized = cover.resize(size, Image.Resampling.LANCZOS)
                if cover_resized.mode != 'RGBA':
                    cover_resized = cover_resized.convert('RGBA')
                photo = ImageTk.PhotoImage(cover_resized)
                cover_label.config(image=photo, bg=BG_COLOR, width=COVER_SIZE, height=COVER_SIZE)
                cover_label.image = photo
            except Exception as e2:
                cover_label.config(image='', bg=PANEL_BG, text=f"封面错误", width=COVER_SIZE//10, height=COVER_SIZE//20)
    else:
        cover_label.config(image='', bg=PANEL_BG, text="", width=COVER_SIZE//10, height=COVER_SIZE//20)

def update_play_button():
    if stopped:
        play_btn.config(text="▶")
    elif paused:
        play_btn.config(text="▶")
    else:
        play_btn.config(text="⏸")

BAR_WIDTH = 400
BAR_HEIGHT = 6
KNOB_RADIUS = 7

def update_bar():
    if total_seconds == 0:
        frac = 0
    else:
        frac = min(current_pos / total_seconds, 1.0)
    fill_width = int(frac * BAR_WIDTH)
    knob_x = 20 + fill_width
    bar_canvas.coords(bg_bar, 20, 15, 20 + BAR_WIDTH, 15 + BAR_HEIGHT)
    bar_canvas.coords(played_bar, 20, 15, knob_x, 15 + BAR_HEIGHT)
    bar_canvas.coords(knob, knob_x - KNOB_RADIUS, 15 + BAR_HEIGHT//2 - KNOB_RADIUS,
                      knob_x + KNOB_RADIUS, 15 + BAR_HEIGHT//2 + KNOB_RADIUS)
    if total_seconds > 0:
        mins = int(current_pos) // 60
        secs = int(current_pos) % 60
        time_label.config(text=f"{mins}:{secs:02d} / {duration_str}")
    else:
        time_label.config(text=f"? / {duration_str}")
    
    # 更新歌词显示
    update_lyrics_display()

# 用Canvas实现富文本歌词（支持双语：原文+翻译，显示前1句+当前2句+后1句，每句含翻译共3对=6行）
def update_lyrics_display():
    """更新歌词显示 - 前一句灰色，当前句蓝色加粗+翻译，后一句灰色"""
    global current_lyrics, current_lyric_index
    try:
        if not lyrics_canvas:
            return
        if not current_lyrics:
            lyrics_canvas.delete('all')
            return
        
        lyrics_canvas.delete('all')
        
        # 根据当前播放位置找到对应的歌词行
        for i, item in enumerate(current_lyrics):
            lyric_time = item[0]
            if current_pos >= lyric_time:
                current_lyric_index = i
            else:
                break
        
        canvas_w = lyrics_canvas.winfo_width() or 300
        canvas_h = lyrics_canvas.winfo_height() or 100
        center_x = canvas_w // 2
        
        has_trans = any(len(item) > 2 and item[2] for item in current_lyrics)
        
        if 0 <= current_lyric_index < len(current_lyrics):
            # 计算需要显示的行
            prev_item = current_lyrics[current_lyric_index - 1] if current_lyric_index > 0 else None
            cur_item = current_lyrics[current_lyric_index]
            next_item = current_lyrics[current_lyric_index + 1] if current_lyric_index + 1 < len(current_lyrics) else None
            
            # 如果有翻译，每句显示2行；否则每句1行
            lines_per_slot = 2 if has_trans else 1
            row_h = 20 if has_trans else 14
            y_pos = 5
            
            # 前一句 - 灰色
            if prev_item:
                lyrics_canvas.create_text(
                    center_x, y_pos,
                    text=prev_item[1][:50],
                    fill='#666666', font=('微软雅黑', 9),
                    anchor='n', width=canvas_w - 10)
                y_pos += row_h
                if has_trans:
                    trans_prev = prev_item[2] if len(prev_item) > 2 else ''
                    lyrics_canvas.create_text(
                        center_x, y_pos,
                        text=trans_prev[:50] if trans_prev else '',
                        fill='#555555', font=('微软雅黑', 8),
                        anchor='n', width=canvas_w - 10)
                    y_pos += row_h
                y_pos += 2
            
            # 当前句 - 蓝色加粗 + 翻译青色
            lyrics_canvas.create_text(
                center_x, y_pos,
                text=cur_item[1][:50],
                fill=ACCENT, font=FONT_TITLE,
                anchor='n', width=canvas_w - 10)
            y_pos += row_h + 2
            if has_trans:
                trans_cur = cur_item[2] if len(cur_item) > 2 else ''
                lyrics_canvas.create_text(
                    center_x, y_pos,
                    text=trans_cur[:50] if trans_cur else '',
                    fill='#66ccff', font=('微软雅黑', 10, 'bold'),
                    anchor='n', width=canvas_w - 10)
                y_pos += row_h
            
            y_pos += 4
            
            # 后一句 - 灰色
            if next_item:
                lyrics_canvas.create_text(
                    center_x, y_pos,
                    text=next_item[1][:50],
                    fill='#666666', font=('微软雅黑', 9),
                    anchor='n', width=canvas_w - 10)
                y_pos += row_h
                if has_trans:
                    trans_next = next_item[2] if len(next_item) > 2 else ''
                    lyrics_canvas.create_text(
                        center_x, y_pos,
                        text=trans_next[:50] if trans_next else '',
                        fill='#555555', font=('微软雅黑', 8),
                        anchor='n', width=canvas_w - 10)
        else:
            lyrics_canvas.create_text(center_x, 5, text="",
                                       fill='#aaaaaa', font=('微软雅黑', 10),
                                       anchor='n')
    except Exception:
        pass  # 防止歌词解析异常导致进度定时器链断裂


def update_mode_display():
    mode_text = {"list_loop": "循环播放", "list_sequential": "列表播放", "single_loop": "单曲循环", "random": "随机播放"}
    mode_menu_button.config(text=f"模式：{mode_text.get(play_mode, play_mode)}")

# ==================== 歌单管理 ====================
def get_playlist_files():
    if not os.path.exists(PLAYLIST_DIR):
        return []
    files = [f for f in os.listdir(PLAYLIST_DIR) if f.endswith('.json')]
    return [os.path.join(PLAYLIST_DIR, f) for f in files]

def save_current_playlist(name):
    if not name:
        return
    filepath = os.path.join(PLAYLIST_DIR, name + '.json')
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(playlist, f, ensure_ascii=False, indent=2)
        messagebox.showinfo("成功", f"歌单“{name}”已保存")
        if editor_mode.get() == "歌单":
            refresh_playlist_editor()
    except Exception as e:
        messagebox.showerror("错误", f"保存失败：{e}")

def load_playlist(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        valid = [p for p in data if os.path.exists(p)]
        return valid
    except:
        return []

# ==================== 歌曲编辑功能 ====================
def edit_song_info(filepath):
    global edit_current_file
    info = load_song_info(filepath)
    edit_title_var.set(info['title'])
    edit_artist_var.set(info['artist'])
    edit_score_var.set(float(info.get('score', 0.0)))
    edit_note_var.set(info.get('note', ''))
    edit_genre_var.set(info.get('genre', ''))
    edit_block_var.set(info.get('block', ''))
    edit_comment_var.set(info.get('comment', ''))
    # 同步回填网易云绑定ID
    netease_bind_var.set(get_netease_song_id(filepath) or "")
    user_data = ratings.get(filepath, {})
    cover_path = user_data.get("cover", "")
    edit_cover_path_var.set(cover_path)
    cover = info['cover']
    if cover:
        try:
            img = cover.resize((120, 120), Image.Resampling.LANCZOS)
            photo = ImageTk.PhotoImage(img)
            edit_cover_label.config(image=photo, bg=BG_COLOR)
            edit_cover_label.image = photo
        except:
            edit_cover_label.config(image='', bg=PANEL_BG, text="无封面")
    else:
        edit_cover_label.config(image='', bg=PANEL_BG, text="无封面")
    edit_current_file = filepath

def save_edited_info():
    filepath = edit_current_file
    if not filepath:
        return
    new_title = edit_title_var.get()
    new_artist = edit_artist_var.get()
    new_score = float(edit_score_var.get())
    new_note = edit_note_var.get()
    new_genre = edit_genre_var.get()
    new_block = edit_block_var.get()
    new_comment = edit_comment_var.get()
    cover_path = edit_cover_path_var.get()

    ratings[filepath] = {
        "title": new_title,
        "artist": new_artist,
        "cover": cover_path if cover_path else "",
        "score": new_score,
        "note": new_note,
        "genre": new_genre,
        "block": new_block,
        "comment": new_comment
    }
    save_ratings(ratings)
    song_info_cache.pop(filepath, None)
    if playlist and current_playlist_index != -1 and playlist[current_playlist_index] == filepath:
        update_ui_for_current_song()
    messagebox.showinfo("保存", "歌曲信息已更新")
    # Auto-refresh library display after saving
    refresh_song_library(skip_rescan=True)

def choose_cover_image():
    path = filedialog.askopenfilename(filetypes=[("Image files", "*.jpg *.jpeg *.png *.bmp")])
    if path:
        edit_cover_path_var.set(path)
        try:
            img = Image.open(path)
            img = img.resize((120, 120), Image.Resampling.LANCZOS)
            photo = ImageTk.PhotoImage(img)
            edit_cover_label.config(image=photo, bg=BG_COLOR)
            edit_cover_label.image = photo
        except:
            edit_cover_label.config(image='', bg=PANEL_BG, text="无效图片")

def delete_current_song():
    """删除当前编辑的歌曲"""
    global audio_paths, current_playlist_index, stopped, paused
    filepath = edit_current_file
    if not filepath:
        messagebox.showwarning("警告", "请先选择要删除的歌曲")
        return
    
    # 确认删除
    if not messagebox.askyesno("确认", f"确定要删除这首歌曲吗？\n{os.path.basename(filepath)}\n\n删除后将无法恢复！"):
        return
    
    # 检查是否删除了正在播放的歌曲
    currently_playing_deleted = False
    if not stopped and 0 <= current_playlist_index < len(playlist):
        if playlist[current_playlist_index] == filepath:
            currently_playing_deleted = True
    
    try:
        # 删除文件
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # 从ratings中删除记录
        ratings.pop(filepath, None)
        save_ratings(ratings)
        
        # 从lyrics中删除记录
        lyrics.pop(filepath, None)
        save_lyrics(lyrics)
        
        # 从缓存中删除
        song_info_cache.pop(filepath, None)
        metadata_cache.pop(filepath, None)
        save_metadata_cache()
        
        # 从播放列表中删除（保持播放顺序不变，仅删除目标歌曲）
        if filepath in playlist:
            playlist.remove(filepath)
        
        # 从音频文件列表中删除
        audio_paths = [p for p in audio_paths if p != filepath]
        
        # 如果删除了正在播放的歌，自动播放下一首
        if currently_playing_deleted:
            if playlist:
                if current_playlist_index >= len(playlist):
                    current_playlist_index = len(playlist) - 1
                play_file(playlist[current_playlist_index], add_to_history=False)
            else:
                try:
                    player.stop()
                except Exception:
                    pass
                stopped = True
                paused = False
                current_playlist_index = -1
                update_ui_for_current_song()
                update_play_button()
        
        messagebox.showinfo("成功", f"已删除歌曲：{os.path.basename(filepath)}")
        # skip_rescan=True: audio_paths 已在上方过滤，后台线程不再触碰文件系统
        refresh_song_library(skip_rescan=True)
        update_playlist_listbox()
    except Exception as e:
        messagebox.showerror("错误", f"删除失败：{str(e)}")


def import_song_files():
    """导入歌曲文件到音乐库，按'歌手 - 歌名'格式命名"""
    paths = filedialog.askopenfilenames(
        title="选择要导入的音乐文件",
        filetypes=[("音乐文件", "*.mp3 *.flac"), ("所有文件", "*.*")]
    )
    if not paths:
        return
    
    import shutil
    imported = 0
    skipped = 0
    
    for src_path in paths:
        orig_fname = os.path.basename(src_path)
        raw_name = os.path.splitext(orig_fname)[0]
        ext = os.path.splitext(orig_fname)[1].lower()
        
        # 1) 尝试从文件标签中解析 歌手 和 歌名
        title = raw_name
        artist = '未知歌手'
        try:
            audio = mutagen.File(src_path)
            if audio is not None and audio.tags:
                if isinstance(audio, MP3):
                    if audio.tags.get("TIT2"): title = str(audio.tags["TIT2"])
                    if audio.tags.get("TPE1"): artist = str(audio.tags["TPE1"])
                elif isinstance(audio, FLAC):
                    t = audio.tags.get("TITLE", [])
                    if t and isinstance(t, list) and t[0]: title = str(t[0])
                    a = audio.tags.get("ARTIST", [])
                    if a and isinstance(a, list) and a[0]: artist = str(a[0])
        except Exception:
            pass
        
        # 2) 如果标签中没拿到有效数据，尝试从文件名解析 "歌手 - 歌名"
        if artist == '未知歌手' and ' - ' in raw_name:
            parts = raw_name.split(' - ', 1)
            artist = parts[0].strip()
            title = parts[1].strip()
        
        # 3) 生成目标文件名：歌手 - 歌名.ext
        new_fname = f"{artist} - {title}{ext}"
        
        # 过滤掉文件名中的非法字符
        invalid_chars = '/\\:*?"<>|'
        for ch in invalid_chars:
            new_fname = new_fname.replace(ch, '_')
        
        dst_path = os.path.join(MUSIC_DIR, new_fname)
        
        # 检查是否已存在
        if os.path.exists(dst_path):
            if not messagebox.askyesno("文件已存在", f"{new_fname} 已存在，是否覆盖？"):
                skipped += 1
                continue
            os.remove(dst_path)
        
        try:
            # 移动文件到音乐库
            shutil.move(src_path, dst_path)
            
            # 尝试解析元数据写入缓存
            try:
                # 重新读取 duration（从移动后的文件）
                audio = mutagen.File(dst_path)
                duration = 0
                if audio is not None:
                    try:
                        duration = int(audio.info.length)
                    except Exception:
                        pass
                
                metadata_cache[dst_path] = {'title': title, 'artist': artist, 'duration': duration}
                ratings[dst_path] = {'title': title, 'artist': artist}
            except Exception:
                pass
            
            imported += 1
        except Exception as e:
            messagebox.showerror("导入失败", f"导入 {orig_fname} 失败：{str(e)}")
            skipped += 1
    
    # 保存变更
    save_metadata_cache()
    save_ratings(ratings)
    
    # 刷新库
    global audio_paths
    audio_paths = scan_audio_files(MUSIC_DIR)
    song_info_cache.clear()
    
    msg = f"导入完成！\n成功导入：{imported} 首"
    if skipped:
        msg += f"\n跳过：{skipped} 首"
    messagebox.showinfo("导入结果", msg)
    refresh_song_library()

def set_scrolling_label(label_widget, full_text, max_chars=20):
    """设置标签为滚动文本（如果文本超过指定长度）"""
    global scrolling_labels
    
    if len(full_text) <= max_chars:
        # 短文本，不需要滚动
        label_widget.config(text=full_text)
        if label_widget in scrolling_labels:
            del scrolling_labels[label_widget]
    else:
        # 长文本，需要滚动
        label_widget.config(text=full_text[:max_chars])
        scrolling_labels[label_widget] = {
            'full_text': full_text,
            'max_chars': max_chars,
            'pos': 0,
            'direction': 1,  # 1 forward, -1 backward
        }
        animate_scroll()

def animate_scroll():
    """动画：滚动文本"""
    global scroll_animation_id
    
    if _closing:
        scroll_animation_id = None
        return
    
    # 取消之前的动画
    if scroll_animation_id:
        root.after_cancel(scroll_animation_id)
    
    # 遍历所有需要滚动的标签
    for label_widget in list(scrolling_labels.keys()):
        try:
            data = scrolling_labels[label_widget]
            full_text = data['full_text']
            max_chars = data['max_chars']
            pos = data['pos']
            direction = data['direction']
            
            # 显示当前位置的文本段
            if pos + max_chars > len(full_text):
                displayed = full_text[pos:] + "  " + full_text[:max_chars - (len(full_text) - pos) - 2]
            else:
                displayed = full_text[pos:pos + max_chars]
            
            label_widget.config(text=displayed)
            
            # 更新位置
            pos = (pos + 1) % len(full_text)
            data['pos'] = pos
        except tk.TclError:
            # Label已被销毁
            if label_widget in scrolling_labels:
                del scrolling_labels[label_widget]
    
    # 继续动画（仅在有滚动标签时）
    if scrolling_labels and not _closing:
        scroll_animation_id = root.after(300, animate_scroll)
    else:
        scroll_animation_id = None

def clear_play_history():
    """清空当前歌曲的播放历史"""
    filepath = edit_current_file
    if not filepath:
        messagebox.showwarning("警告", "请先选择要清空的歌曲")
        return
    
    if filepath in ratings:
        ratings[filepath]['play_count'] = 0
        save_ratings(ratings)
        song_info_cache.pop(filepath, None)
        refresh_song_library(skip_rescan=True)
        messagebox.showinfo("成功", "已清空该歌曲的播放历史")
    else:
        messagebox.showinfo("提示", "该歌曲还未被播放过")

def import_lyrics():
    """导入LRC格式的歌词文件，移动到source/lyrics文件夹"""
    filepath = edit_current_file
    if not filepath:
        messagebox.showwarning("警告", "请先选择要导入歌词的歌曲")
        return
    
    lrc_path = filedialog.askopenfilename(filetypes=[("Lyrics files", "*.lrc"), ("All files", "*.*")])
    if not lrc_path:
        return
    
    try:
        lyrics_data = parse_lrc_file(lrc_path)
        if not lyrics_data:
            messagebox.showwarning("提示", "未能解析LRC文件，文件可能为空或格式不正确")
            return
        
        # 保存歌词数据到JSON
        lyrics[filepath] = lyrics_data
        save_lyrics(lyrics)
        
        # 将.lrc文件移动到 source/lyrics/ 文件夹
        import shutil
        lrc_fname = os.path.basename(lrc_path)
        dst_lrc = os.path.join(LYRICS_DIR, lrc_fname)
        if os.path.exists(dst_lrc):
            os.remove(dst_lrc)
        shutil.move(lrc_path, dst_lrc)
        
        # 清除缓存以便重新加载
        song_info_cache.pop(filepath, None)
        
        messagebox.showinfo("成功", f"已导入 {len(lyrics_data)} 行歌词，文件已移至 {LYRICS_DIR}")
    except Exception as e:
        messagebox.showerror("错误", f"导入歌词失败：{str(e)}")

def batch_import_lyrics():
    """批量导入歌词：从指定文件夹扫描.lrc文件，按歌曲名自动匹配，并移动到source/lyrics"""
    lyrics_folder = filedialog.askdirectory(title="选择包含.lrc文件的文件夹")
    if not lyrics_folder:
        return
    
    import shutil
    
    try:
        imported_count = 0
        skipped_count = 0
        moved_count = 0
        
        # 获取所有.lrc文件
        lrc_files = {}
        for f in os.listdir(lyrics_folder):
            if f.endswith('.lrc'):
                # 以文件名（不含扩展名）作为匹配键
                name = os.path.splitext(f)[0]
                lrc_files[name] = os.path.join(lyrics_folder, f)
        
        # 记录已匹配的lrc文件名（用于后续移动）
        matched_lrc_names = set()
        
        # 遍历所有音乐文件，尝试匹配歌词
        for music_path in audio_paths:
            # 获取音乐文件名（不含扩展名）
            music_name = os.path.splitext(os.path.basename(music_path))[0]
            
            matched = False
            # 尝试精确匹配文件名
            if music_name in lrc_files:
                try:
                    lyrics_data = parse_lrc_file(lrc_files[music_name])
                    if lyrics_data:
                        lyrics[music_path] = lyrics_data
                        imported_count += 1
                        matched_lrc_names.add(music_name)
                        matched = True
                    else:
                        skipped_count += 1
                except Exception:
                    skipped_count += 1
            if not matched:
                # 尝试模糊匹配（获取歌曲信息进行匹配）
                try:
                    info = load_song_info(music_path)
                    title = info.get('title', '').strip()
                    artist = info.get('artist', '').strip()
                    
                    # 尝试"歌手 - 歌曲"的格式匹配
                    if artist and title:
                        match_name = f"{artist} - {title}"
                        if match_name in lrc_files:
                            lyrics_data = parse_lrc_file(lrc_files[match_name])
                            if lyrics_data:
                                lyrics[music_path] = lyrics_data
                                imported_count += 1
                                matched_lrc_names.add(match_name)
                                continue
                    
                    # 尝试仅匹配歌曲名
                    if title and title in lrc_files:
                        lyrics_data = parse_lrc_file(lrc_files[title])
                        if lyrics_data:
                            lyrics[music_path] = lyrics_data
                            imported_count += 1
                            matched_lrc_names.add(title)
                except Exception:
                    pass
        
        # 将匹配成功的 .lrc 文件移动到 source/lyrics/
        for lrc_name in matched_lrc_names:
            try:
                src = lrc_files[lrc_name]
                dst = os.path.join(LYRICS_DIR, os.path.basename(src))
                if os.path.exists(dst):
                    os.remove(dst)
                shutil.move(src, dst)
                moved_count += 1
            except Exception:
                pass
        
        # 保存更新的歌词
        save_lyrics(lyrics)
        
        # 清除缓存
        song_info_cache.clear()
        
        message = f"批量导入完成！\n成功导入：{imported_count} 首\n已移动：{moved_count} 个.lrc文件\n无法匹配：{len(lrc_files) - imported_count} 个文件"
        messagebox.showinfo("批量导入歌词", message)
    except Exception as e:
        messagebox.showerror("错误", f"批量导入歌词失败：{str(e)}")

# ==================== 透明模式 ====================
glass_mode = False
glass_tint = 'dark'              # 'dark' / 'light'
bg_image_path = ""
bg_image_offset_x = 0
bg_image_offset_y = 0
bg_image_scale = 1.0
bg_image_original = None
_bg_canvas = None                # 根窗口上的背景 Canvas（place 填满整个 root）
_bg_canvas_img = None            # Canvas 上的图片 ID

def _has_bg_image():
    return bool(bg_image_path and os.path.exists(bg_image_path))

def _load_bg_image():
    global bg_image_original
    if not _has_bg_image():
        bg_image_original = None
        return None
    try:
        img = Image.open(bg_image_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        bg_image_original = img
        return img
    except Exception:
        bg_image_original = None
        return None

def _draw_background():
    """在 root 上的背景 Canvas 绘制图片 + 色调遮罩"""
    global _bg_canvas, _bg_canvas_img
    if _bg_canvas is None:
        return
    _bg_canvas.delete('all')
    _bg_canvas_img = None
    if not _has_bg_image():
        return
    img = _load_bg_image()
    if img is None:
        return
    cw = _bg_canvas.winfo_width() or 1200
    ch = _bg_canvas.winfo_height() or 700
    iw, ih = img.size
    scale = max(cw / iw, ch / ih) * bg_image_scale
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (cw - nw) // 2 + bg_image_offset_x
    oy = (ch - nh) // 2 + bg_image_offset_y
    base = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    base.paste(resized, (ox, oy), resized)
    # 色调遮罩（比 root alpha 更直观的控制）
    if glass_tint == 'light':
        overlay = Image.new('RGBA', (cw, ch), (255, 255, 255, 80))
    else:
        overlay = Image.new('RGBA', (cw, ch), (0, 0, 0, 100))
    base = Image.alpha_composite(base, overlay)
    tk_img = ImageTk.PhotoImage(base)
    _bg_canvas_img = _bg_canvas.create_image(0, 0, anchor='nw', image=tk_img)
    _bg_canvas._tk_bg = tk_img

def _clear_bg_image():
    global bg_image_path, bg_image_original, bg_image_scale, bg_image_offset_x, bg_image_offset_y
    bg_image_path = ""
    bg_image_original = None
    bg_image_scale = 1.0
    bg_image_offset_x = 0
    bg_image_offset_y = 0
    if _bg_canvas is not None:
        _bg_canvas.delete('all')

def toggle_glass_mode(on: bool):
    """开关透明模式（同窗 Canvas + root alpha）"""
    global glass_mode
    glass_mode = on
    sync_config_to_disk()
    try:
        if on and _has_bg_image():
            root.attributes('-alpha', 0.88)
            _draw_background()
        else:
            root.attributes('-alpha', 1.0)
    except Exception:
        pass

def _get_tinted_rgba(base_hex, alpha):
    """将 HEX 颜色转为带 alpha 的 RGBA 元组。用于面板半透明覆盖。"""
    h = base_hex.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, alpha)

def open_bg_image_dialog():
    """打开背景图选择 + 裁切/缩放对话框"""
    global bg_image_path, bg_image_scale, bg_image_offset_x, bg_image_offset_y
    path = filedialog.askopenfilename(
        title="选择背景图片",
        filetypes=[("图片", "*.jpg *.jpeg *.png *.bmp *.gif"), ("所有文件", "*.*")]
    )
    if not path:
        return
    bg_image_path = path
    img = _load_bg_image()
    if img is None:
        messagebox.showerror("错误", "无法加载该图片")
        bg_image_path = ""
        return
    crop_dlg = tk.Toplevel(root)
    crop_dlg.title("调整背景图片")
    crop_dlg.geometry("800x620")
    crop_dlg.configure(bg=PANEL_BG)
    crop_dlg.transient(root)
    crop_dlg.grab_set()
    preview_w, preview_h = 760, 400
    p_canvas = Canvas(crop_dlg, width=preview_w, height=preview_h, bg='#000', highlightthickness=0)
    p_canvas.pack(pady=(10, 5))
    orig_img = img.copy()
    iw, ih = orig_img.size
    _zoom = tk.DoubleVar(value=bg_image_scale if bg_image_scale > 0 else 1.0)
    _ox = tk.IntVar(value=bg_image_offset_x)
    _oy = tk.IntVar(value=bg_image_offset_y)

    def _render_preview():
        p_canvas.delete('all')
        scale = _zoom.get()
        nw, nh = max(10, int(iw * scale)), max(10, int(ih * scale))
        try: pv = orig_img.resize((nw, nh), Image.Resampling.LANCZOS)
        except: return
        dx = (preview_w - nw) // 2 + _ox.get()
        dy = (preview_h - nh) // 2 + _oy.get()
        ws = min(preview_w * 0.7 / 1200, preview_h * 0.7 / 700)
        wx = (preview_w - int(1200 * ws)) // 2
        wy = (preview_h - int(700 * ws)) // 2
        p_canvas.create_rectangle(wx, wy, wx + int(1200 * ws), wy + int(700 * ws),
                                  outline=ACCENT, width=2, dash=(8, 4))
        p_canvas.create_text(wx + int(600 * ws), wy - 14,
                            text="窗口可视区", fill=ACCENT, font=('微软雅黑', 9))
        tkpv = ImageTk.PhotoImage(pv)
        p_canvas.create_image(dx, dy, anchor='nw', image=tkpv)
        p_canvas._tkpv = tkpv

    ctrl = Frame(crop_dlg, bg=PANEL_BG)
    ctrl.pack(fill=tk.X, padx=16, pady=8)
    zr = Frame(ctrl, bg=PANEL_BG)
    zr.pack(fill=tk.X, pady=4)
    tk.Label(zr, text="缩放：", bg=PANEL_BG, fg=TEXT, font=FONT_SMALL, width=6).pack(side=tk.LEFT)
    zs = ttk.Scale(zr, from_=0.3, to=3.0, variable=_zoom, orient=HORIZONTAL, command=lambda v: _render_preview())
    zs.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
    zvl = tk.Label(zr, text="1.0x", bg=PANEL_BG, fg=MUTED, font=FONT_SMALL, width=6)
    zvl.pack(side=tk.RIGHT)
    def _uzl(*_): zvl.config(text=f"{float(_zoom.get()):.1f}x")
    _zoom.trace_add('write', _uzl)
    pr = Frame(ctrl, bg=PANEL_BG)
    pr.pack(fill=tk.X, pady=4)
    tk.Label(pr, text="平移X：", bg=PANEL_BG, fg=TEXT, font=FONT_SMALL, width=6).pack(side=tk.LEFT)
    xs = ttk.Scale(pr, from_=-500, to=500, variable=_ox, orient=HORIZONTAL, command=lambda v: _render_preview())
    xs.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
    tk.Label(pr, text="平移Y：", bg=PANEL_BG, fg=TEXT, font=FONT_SMALL, width=6).pack(side=tk.LEFT)
    ys = ttk.Scale(pr, from_=-500, to=500, variable=_oy, orient=HORIZONTAL, command=lambda v: _render_preview())
    ys.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
    br = Frame(ctrl, bg=PANEL_BG)
    br.pack(fill=tk.X, pady=(10, 0))
    def _ok():
        global bg_image_scale, bg_image_offset_x, bg_image_offset_y
        bg_image_scale = float(_zoom.get())
        bg_image_offset_x = _ox.get()
        bg_image_offset_y = _oy.get()
        bg_image_path = path
        crop_dlg.destroy()
        sync_config_to_disk()
        messagebox.showinfo("已设置", "背景图片已应用")
    def _cancel():
        global bg_image_path
        bg_image_path = ""
        bg_image_original = None
        crop_dlg.destroy()
    ttk.Button(br, text="✅ 确定", command=_ok, style='Accent.TButton').pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
    ttk.Button(br, text="🔄 复位", command=lambda: (_zoom.set(1.0), _ox.set(0), _oy.set(0), _render_preview())).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
    ttk.Button(br, text="❌ 取消", command=_cancel).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
    _render_preview()

# ==================== 界面构建 ====================
_is_initial_load = True  # 仅第一次加载显示进度条

root = tk.Tk()
root.title("Potato Player")
root.geometry("1200x700")
root.resizable(False, False)
root.configure(bg=BG_COLOR)

# ── 背景层 Canvas（同窗，place 铺满，所有后续 widget 自然叠在其上） ──
_bg_canvas = tk.Canvas(root, highlightthickness=0, bg=BG_COLOR)
_bg_canvas.place(x=0, y=0, relwidth=1, relheight=1)
# 注意：不要用 _bg_canvas.lower() —— Canvas 的方法签名与 Widget 不同。
# 用 place 层级确保 bg_canvas 位于所有 pack 控件之下（place 的 widget 默认低层级）。

# ── 初始主题样式 ──
_configure_ttk_styles()

# ==================== 左侧歌曲库 ====================
left_width = 360
left_frame = tk.Frame(root, bg=PANEL_BG, width=left_width)
left_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(12, 8), pady=12)
left_frame.pack_propagate(False)

# ── 面板标题栏（渐变紫） ──
header_frame = tk.Frame(left_frame, bg=ACCENT)
header_frame.pack(fill=tk.X, pady=(0, 8))
header_inner = tk.Frame(header_frame, bg=ACCENT)
header_inner.pack(fill=tk.X, padx=12, pady=6)
tk.Label(header_inner, text="🎵  音乐库", font=FONT_TITLE, bg=ACCENT,
         fg='white').pack(side=tk.LEFT)
count_badge = tk.Label(header_inner, text="", font=FONT_SMALL, bg=ACCENT_PRESSED,
                       fg='white', padx=8, pady=1)
count_badge.pack(side=tk.RIGHT)
# 歌曲计数会在 refresh 时更新

# ── 排序控件行 ──
control_row = Frame(left_frame, bg=PANEL_BG)
control_row.pack(fill=tk.X, pady=(0, 8))

sort_lbl = tk.Label(control_row, text='排序：', bg=PANEL_BG, fg=MUTED, font=FONT_SMALL)
sort_lbl.pack(side=tk.LEFT, padx=(4, 4))
# Map sort modes to display names
sort_mode_display = {'title': '标题', 'artist': '歌手', 'rating': '评分', 'block': '块', 'genre': '流派', 'play_count': '播放次数'}
sort_var = tk.StringVar(value=sort_mode_display.get(sort_mode, sort_mode))
def set_sort_mode(val):
    global sort_mode
    # Convert display names to internal sort modes
    sort_mode_map = {'标题': 'title', '歌手': 'artist', '评分': 'rating', '块': 'block', '流派': 'genre', '播放次数': 'play_count'}
    sort_mode = sort_mode_map.get(val, val)
    sync_config_to_disk()
    sort_var.set(val)
    refresh_song_library(skip_rescan=True)

sort_menu = tk.OptionMenu(control_row, sort_var, '标题', '歌手', '评分', '块', '流派', '播放次数', command=set_sort_mode)
sort_menu.config(bg=PANEL_BG, fg=TEXT, activebackground=PANEL_BG, highlightthickness=0)
try:
    sort_menu['menu'].config(bg=TROUGH, fg='white')
except Exception:
    pass
sort_menu.pack(side=tk.LEFT, padx=4)

# rating filter controls
rating_filter_min_var = tk.DoubleVar(value=0.0)
rating_filter_max_var = tk.DoubleVar(value=10.0)
rating_filter_active_var = tk.BooleanVar(value=False)
# whether filter details are expanded
filter_expanded = True

def apply_rating_filter():
    rating_filter_active_var.set(True)
    refresh_song_library(skip_rescan=True)
    update_filter_status()

def clear_rating_filter():
    rating_filter_active_var.set(False)
    rating_filter_min_var.set(0.0)
    rating_filter_max_var.set(10.0)
    refresh_song_library(skip_rescan=True)
    update_filter_status()

# filter controls removed from left panel; moved to 设置（右侧功能）面板

def add_all_to_playlist():
    for p in audio_paths:
        if p not in playlist:
            playlist.append(p)
    update_playlist_listbox()

# 加载元数据缓存（快速，不触发 mutagen）
try:
    load_metadata_cache()
except Exception:
    pass

# ── 加载进度条 ──
loading_frame = Frame(left_frame, bg=PANEL_BG)
loading_label = tk.Label(loading_frame, text="🎵  正在加载歌曲库…", bg=PANEL_BG,
                         fg=MUTED, font=FONT_MAIN)
loading_label.pack(pady=(30, 8))
loading_progress = ttk.Progressbar(loading_frame, mode='indeterminate',
                                   length=260, style='Accent.Horizontal.TProgressbar')
loading_progress.pack(pady=(0, 30))

def show_loading_bar():
    canvas.pack_forget()
    vsb_canvas.pack_forget()
    loading_frame.pack(fill=tk.X, pady=20)
    loading_progress.start(15)

def hide_loading_bar():
    loading_progress.stop()
    loading_frame.pack_forget()
    canvas.pack(side="left", fill="both", expand=True)
    vsb_canvas.pack(side="right", fill="y")

# quick jump to playlist editor
# '播放列表' quick button removed per user request; '全部加入' moved to bottom

canvas = Canvas(left_frame, bg=PANEL_BG, highlightthickness=0, width=left_width-20)
scrollbar = None
scrollable_frame = Frame(canvas, bg=PANEL_BG)

scrollable_frame.bind(
    "<Configure>",
    lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
)

canvas.create_window((0, 0), window=scrollable_frame, anchor="nw", width=left_width-30)

# custom dark scrollbar using Canvas to avoid native white overlay
def on_canvas_scroll(first, last):
    try:
        f = float(first)
        l = float(last)
    except:
        return
    h = vsb_canvas.winfo_height()
    if h <= 0:
        return
    thumb_h = max(int((l - f) * h), 30)
    y1 = int(f * h)
    y2 = y1 + thumb_h
    vsb_canvas.coords(vsb_thumb, 2, y1, 10, y2)

canvas.configure(yscrollcommand=on_canvas_scroll)

canvas.pack(side="left", fill="both", expand=True)
vsb_canvas = Canvas(left_frame, width=14, bg=PANEL_BG, highlightthickness=0)
vsb_canvas.pack(side="right", fill="y")
vsb_thumb = vsb_canvas.create_rectangle(2, 0, 12, 60, fill=TROUGH, outline='', width=0)

def vsb_click(event):
    h = vsb_canvas.winfo_height()
    frac = event.y / max(h, 1)
    if frac < 0: frac = 0
    if frac > 1: frac = 1
    canvas.yview_moveto(frac)

def vsb_drag(event):
    vsb_click(event)

vsb_canvas.bind('<Button-1>', vsb_click)
vsb_canvas.bind('<B1-Motion>', vsb_drag)

def sync_vsb_on_resize(e=None):
    f, l = canvas.yview()
    on_canvas_scroll(f, l)

vsb_canvas.bind('<Configure>', sync_vsb_on_resize)

def on_canvas_mousewheel(event):
    # Cross-platform mousewheel scrolling
    if hasattr(event, 'delta'):
        # macOS / Windows: event.delta gives platform-independent direction
        delta = event.delta
        if abs(delta) >= 1:
            canvas.yview_scroll(-1 * int(delta / abs(delta)), 'units')
        else:
            # macOS fractional deltas
            canvas.yview_scroll(-1 * int(delta * 3), 'units')
    elif hasattr(event, 'num') and event.num in (4, 5):
        # Linux: Button-4 = up, Button-5 = down
        canvas.yview_scroll(-1 if event.num == 4 else 1, 'units')
    else:
        canvas.yview_scroll(-1, 'units')
    return 'break'

def on_filter_canvas_mousewheel(event):
    """Mousewheel handler for filter results canvas."""
    if hasattr(event, 'delta'):
        delta = event.delta
        if abs(delta) >= 1:
            filter_canvas.yview_scroll(-1 * int(delta / abs(delta)), 'units')
        else:
            filter_canvas.yview_scroll(-1 * int(delta * 3), 'units')
    elif hasattr(event, 'num') and event.num in (4, 5):
        filter_canvas.yview_scroll(-1 if event.num == 4 else 1, 'units')
    else:
        filter_canvas.yview_scroll(-1, 'units')
    return 'break'

def bind_mousewheel_recursive(widget):
    """Recursively bind mousewheel events to widget and all children for event capture"""
    widget.bind('<MouseWheel>', on_canvas_mousewheel, add='+')
    widget.bind('<Button-4>', on_canvas_mousewheel, add='+')
    widget.bind('<Button-5>', on_canvas_mousewheel, add='+')
    for child in widget.winfo_children():
        bind_mousewheel_recursive(child)

# Initial binding to main canvas
canvas.bind('<MouseWheel>', on_canvas_mousewheel)      # Windows and macOS
canvas.bind('<Button-4>', on_canvas_mousewheel)        # Linux scroll up
canvas.bind('<Button-5>', on_canvas_mousewheel)        # Linux scroll down
scrollable_frame.bind('<MouseWheel>', on_canvas_mousewheel)
scrollable_frame.bind('<Button-4>', on_canvas_mousewheel)
scrollable_frame.bind('<Button-5>', on_canvas_mousewheel)

song_rows = []
selected_paths = set()

# ==================== 筛选结果窗口框架 ====================
filter_result_visible = False
filter_song_rows = []

# Create filter result window frame (initially hidden)
filter_result_frame = tk.Frame(left_frame, bg=PANEL_BG)
filter_result_frame.pack(side=tk.LEFT, fill=tk.Y, expand=True)
filter_result_frame.pack_forget()  # Initially hidden

def _init_filter_result_window():
    """Initialize the filter result window UI"""
    global filter_canvas, filter_scrollable_frame, filter_vsb_canvas, filter_vsb_thumb
    
    # ── 筛选结果标题栏 ──
    title_bar = Frame(filter_result_frame, bg=ACCENT)
    title_bar.pack(fill=tk.X, pady=(0, 4))
    title_inner = Frame(title_bar, bg=ACCENT)
    title_inner.pack(fill=tk.X, padx=12, pady=6)
    
    tk.Label(title_inner, text="🔍  筛选结果", font=FONT_TITLE, bg=ACCENT,
             fg='white').pack(side=tk.LEFT, expand=True)
    
    close_btn = tk.Label(title_inner, text="✕", font=FONT_TITLE, bg=ACCENT,
                         fg='white', width=2, cursor='hand2')
    close_btn.pack(side=tk.RIGHT)
    close_btn.bind('<Button-1>', lambda e: back_to_library())
    # 关闭按钮 hover 效果
    def _close_enter(e): close_btn.config(bg=ACCENT_PRESSED)
    def _close_leave(e): close_btn.config(bg=ACCENT)
    close_btn.bind('<Enter>', _close_enter)
    close_btn.bind('<Leave>', _close_leave)
    
    # Canvas and scrollable frame for filter results
    filter_canvas = Canvas(filter_result_frame, bg=PANEL_BG, highlightthickness=0, width=left_width-20)
    filter_scrollable_frame = Frame(filter_canvas, bg=PANEL_BG)
    
    filter_scrollable_frame.bind(
        "<Configure>",
        lambda e: filter_canvas.configure(scrollregion=filter_canvas.bbox("all"))
    )
    
    filter_canvas.create_window((0, 0), window=filter_scrollable_frame, anchor="nw", width=left_width-30)
    
    # Filter result scrollbar
    def on_filter_scroll(first, last):
        try:
            f = float(first)
            l = float(last)
        except:
            return
        h = filter_vsb_canvas.winfo_height()
        if h <= 0:
            return
        thumb_h = max(int((l - f) * h), 30)
        y1 = int(f * h)
        y2 = y1 + thumb_h
        filter_vsb_canvas.coords(filter_vsb_thumb, 2, y1, 10, y2)
    
    filter_canvas.configure(yscrollcommand=on_filter_scroll)
    filter_canvas.pack(side="left", fill="both", expand=True)
    
    filter_vsb_canvas = Canvas(filter_result_frame, width=14, bg=PANEL_BG, highlightthickness=0)
    filter_vsb_canvas.pack(side="right", fill="y")
    filter_vsb_thumb = filter_vsb_canvas.create_rectangle(2, 0, 12, 60, fill=TROUGH, outline='', width=0)
    
    def filter_vsb_click(event):
        h = filter_vsb_canvas.winfo_height()
        frac = event.y / max(h, 1)
        if frac < 0: frac = 0
        if frac > 1: frac = 1
        filter_canvas.yview_moveto(frac)
    
    def filter_vsb_drag(event):
        filter_vsb_click(event)
    
    filter_vsb_canvas.bind('<Button-1>', filter_vsb_click)
    filter_vsb_canvas.bind('<B1-Motion>', filter_vsb_drag)
    
    def filter_sync_vsb_on_resize(e=None):
        f, l = filter_canvas.yview()
        on_filter_scroll(f, l)
    
    filter_vsb_canvas.bind('<Configure>', filter_sync_vsb_on_resize)
    
    # Bind mousewheel to filter result window
    filter_canvas.bind('<MouseWheel>', on_filter_canvas_mousewheel)
    filter_scrollable_frame.bind('<MouseWheel>', on_filter_canvas_mousewheel)
    filter_canvas.bind('<Button-4>', on_filter_canvas_mousewheel)
    filter_canvas.bind('<Button-5>', on_filter_canvas_mousewheel)

_init_filter_result_window()

# Control bar for filter result window (select all, add to playlist buttons)
filter_control_row = Frame(left_frame, bg=PANEL_BG)
filter_control_row.pack(fill=tk.X, pady=6)
filter_control_row.pack_forget()  # Initially hidden

filter_sort_mode = 'title'  # Sort mode for filter results (independent of library sort)
current_filter_paths = []  # 当前筛选结果路径列表（排序后，供视图内操作使用）

def _setup_filter_control_buttons():
    """Setup buttons in filter control row"""
    for w in filter_control_row.winfo_children():
        w.destroy()
    
    # Sort dropdown
    tk.Label(filter_control_row, text='排序：', bg=PANEL_BG, fg=TEXT, font=('微软雅黑', 9)).pack(side=tk.LEFT, padx=(4, 2))
    sort_mode_display = {'title': '标题', 'artist': '歌手', 'rating': '评分', 'block': '块', 'genre': '流派', 'play_count': '播放次数'}
    fsort_var = tk.StringVar(value=sort_mode_display.get(filter_sort_mode, filter_sort_mode))
    
    def set_filter_sort(val):
        global filter_sort_mode
        sort_map = {'标题': 'title', '歌手': 'artist', '评分': 'rating', '块': 'block', '流派': 'genre', '播放次数': 'play_count'}
        filter_sort_mode = sort_map.get(val, val)
        fsort_var.set(val)
        # Re-sort and re-render current filter results
        if filter_result_visible and current_filter_paths:
            re_sort_and_show(current_filter_paths)
    
    sort_menu = tk.OptionMenu(filter_control_row, fsort_var, '标题', '歌手', '评分', '块', '流派', '播放次数', command=set_filter_sort)
    sort_menu.config(bg=PANEL_BG, fg=TEXT, activebackground=PANEL_BG, highlightthickness=0, font=('微软雅黑', 9))
    try:
        sort_menu['menu'].config(bg=TROUGH, fg='white', font=('微软雅黑', 9))
    except Exception:
        pass
    sort_menu.pack(side=tk.LEFT, padx=2)
    
    ttk.Button(filter_control_row, text='全选', command=select_all_visible).pack(side=tk.LEFT, padx=4)
    ttk.Button(filter_control_row, text='全部加入', command=bulk_add_selected_to_playlist).pack(side=tk.LEFT, padx=4)

def re_sort_and_show(paths):
    """Re-sort filtered paths by filter_sort_mode and re-render."""
    global filter_sort_mode
    sorted_paths = list(paths)
    
    if filter_sort_mode == 'title':
        def title_key(p):
            return get_cached_title(p).lower()
        sorted_paths.sort(key=title_key)
    elif filter_sort_mode == 'artist':
        def artist_key(p):
            a = get_cached_artist(p)
            return a.lower() or os.path.basename(p).lower()
        sorted_paths.sort(key=artist_key)
    elif filter_sort_mode == 'rating':
        sorted_paths.sort(key=lambda p: ratings.get(p, {}).get('score', 0), reverse=True)
    elif filter_sort_mode == 'block':
        def block_key(p):
            block = ratings.get(p, {}).get('block', '')
            return (block == '', block)
        sorted_paths.sort(key=block_key)
    elif filter_sort_mode == 'genre':
        def genre_key(p):
            genre = ratings.get(p, {}).get('genre', '')
            return (genre == '', genre)
        sorted_paths.sort(key=genre_key)
    elif filter_sort_mode == 'play_count':
        sorted_paths.sort(key=lambda p: ratings.get(p, {}).get('play_count', 0), reverse=True)
    
    show_filter_results(sorted_paths)

# Note: _setup_filter_control_buttons() will be called after select_all_visible() and bulk_add_selected_to_playlist() are defined

def refresh_song_library(skip_rescan=False):
    """Refresh song library display - async background loading.
    内置防抖机制：短时间多次调用只执行最后一次，避免重复渲染和块错位。"""
    global audio_paths, sort_mode
    import threading
    
    # 仅初始加载显示进度条
    global _is_initial_load
    if _is_initial_load:
        root.after(0, show_loading_bar)
    
    # ---- 防抖：取消之前的延迟刷新，安排新的 ----
    if not hasattr(refresh_song_library, '_debounce_id'):
        refresh_song_library._debounce_id = None
    if refresh_song_library._debounce_id is not None:
        root.after_cancel(refresh_song_library._debounce_id)
    
    # ---- 刷新计数：每次调用递增，后台线程结束后只认最新 ----
    if not hasattr(refresh_song_library, '_refresh_id'):
        refresh_song_library._refresh_id = 0
    refresh_song_library._refresh_id += 1
    cur_refresh_id = refresh_song_library._refresh_id
    
    def _do_refresh():
        """防抖后实际执行刷新（在主线程调用，避免重复启动线程）"""
        # 如果防抖期间又有新请求，cur_refresh_id 已过期
        if refresh_song_library._refresh_id != cur_refresh_id:
            return
        thread = threading.Thread(target=lambda: _load_library_async(cur_refresh_id), daemon=True)
        thread.start()
    
    # 初始加载立即执行，其他情况用50ms防抖
    delay = 0 if _is_initial_load else 50
    refresh_song_library._debounce_id = root.after(delay, _do_refresh)
    
    def _load_library_async(my_refresh_id):
        """Background thread to load and sort songs"""
        global audio_paths
        try:
            # 如果线程启动期间又有新请求，直接放弃
            if refresh_song_library._refresh_id != my_refresh_id:
                return
            
            # Rescan directory for audio files (unless skip_rescan is True)
            if not skip_rescan:
                audio_paths = scan_audio_files(MUSIC_DIR)
            
            # 扫描完再检查一次
            if refresh_song_library._refresh_id != my_refresh_id:
                return
            
            # Make a copy for sorting to avoid threading issues
            sorted_paths = list(audio_paths) if audio_paths else []
            
            if sort_mode == 'title':
                def title_key(p):
                    return get_cached_title(p).lower()
                sorted_paths.sort(key=title_key)
            elif sort_mode == 'artist':
                def artist_key(p):
                    a = get_cached_artist(p)
                    return a.lower() or os.path.basename(p).lower()
                sorted_paths.sort(key=artist_key)
            elif sort_mode == 'rating':
                sorted_paths.sort(key=lambda p: ratings.get(p, {}).get('score', 0), reverse=True)
            elif sort_mode == 'block':
                def block_key(p):
                    block = ratings.get(p, {}).get('block', '')
                    return (block == '', block)  # Empty blocks sort last
                sorted_paths.sort(key=block_key)
            elif sort_mode == 'genre':
                def genre_key(p):
                    genre = ratings.get(p, {}).get('genre', '')
                    return (genre == '', genre)  # Empty genres sort last
                sorted_paths.sort(key=genre_key)
            elif sort_mode == 'play_count':
                sorted_paths.sort(key=lambda p: ratings.get(p, {}).get('play_count', 0), reverse=True)
            
            # 排序完成后再检查
            if refresh_song_library._refresh_id != my_refresh_id:
                return
            
            # Update global audio_paths with sorted results
            audio_paths = sorted_paths
            
            # Apply rating filter if active
            display_paths = audio_paths
            try:
                if rating_filter_active_var.get():
                    lo = float(rating_filter_min_var.get())
                    hi = float(rating_filter_max_var.get())
                    display_paths = [p for p in audio_paths if lo <= float(ratings.get(p, {}).get('score', 0) or 0.0) <= hi]
            except Exception as e:
                display_paths = audio_paths
            
            # 最终检查：只有最新请求才调度 UI 渲染
            if refresh_song_library._refresh_id != my_refresh_id:
                return
            root.after(0, lambda: _render_song_list(display_paths, my_refresh_id))
        except Exception as e:
            print(f"Error loading library: {e}")
            import traceback
            traceback.print_exc()
    
    def _render_song_list(display_paths, my_refresh_id):
        """Render the song list on main thread"""
        # 如果已经不是最新的刷新请求，跳过
        if refresh_song_library._refresh_id != my_refresh_id:
            return
        
        # 代数计数器：防止旧的 _add_songs_batch 回调与新的 _render_song_list 交叉执行
        if not hasattr(_render_song_list, '_gen'):
            _render_song_list._gen = 0
        _render_song_list._gen += 1
        cur_gen = _render_song_list._gen
        
        # Clear existing rows
        for row in song_rows:
            row.destroy()
        song_rows.clear()
        
        # Update status label
        try:
            update_filter_status()
        except Exception:
            pass
        
        # Render songs in batches to keep UI responsive
        right_drag_state = {'active': False, 'start_idx': -1, 'mode': None}
        
        def _apply_selection_color(row, selected):
            """Apply/remove selection highlight to all children AND the row itself."""
            bg = ACCENT if selected else getattr(row, 'original_bg', CARD_BG)
            # 同时更新 row Frame 自身背景，确保高光覆盖整行（含上下栏）
            try:
                row.config(bg=bg)
            except Exception:
                pass
            for c in row.winfo_children():
                if not getattr(c, 'is_color_indicator', False):
                    try:
                        c.config(bg=bg)
                    except:
                        pass
        
        def _build_row_bindings(row, row_idx, fpath):
            """Bind click, right-drag, and mousewheel to row and all its children."""
            # Left-click toggle selection (works on whole row)
            def _row_toggle(e, path=fpath, r=row):
                toggle_select(path, r)
                return 'break'
            
            # Right-click press begins drag
            def _rclick_press(e, path=fpath, r=row, ri=row_idx):
                if path in selected_paths:
                    right_drag_state['mode'] = 'deselect'
                else:
                    right_drag_state['mode'] = 'select'
                right_drag_state['start_idx'] = ri
                right_drag_state['active'] = True
                # Apply to starting row
                if right_drag_state['mode'] == 'select':
                    if path not in selected_paths:
                        selected_paths.add(path)
                    _apply_selection_color(r, True)
                else:
                    selected_paths.discard(path)
                    _apply_selection_color(r, False)
                return 'break'
            
            # B3-Motion: sweep across rows
            def _rclick_motion(e):
                if not right_drag_state['active']:
                    return 'break'
                # Find current row index from y position
                scroll_y = scrollable_frame.winfo_rooty()
                target_y = e.y_root - scroll_y
                current_rows = song_rows
                if not current_rows:
                    return 'break'
                # Binary search for nearest row
                lo, hi = 0, len(current_rows) - 1
                while lo < hi:
                    mid = (lo + hi) // 2
                    if current_rows[mid].winfo_y() < target_y:
                        lo = mid + 1
                    else:
                        hi = mid
                # Now sweep from start_idx to lo
                si = right_drag_state['start_idx']
                ei = lo
                if si > ei:
                    si, ei = ei, si
                mode = right_drag_state['mode']
                for ri in range(si, ei + 1):
                    if 0 <= ri < len(current_rows):
                        r = current_rows[ri]
                        p = getattr(r, 'path', None)
                        if not p:
                            continue
                        if mode == 'select':
                            if p not in selected_paths:
                                selected_paths.add(p)
                            _apply_selection_color(r, True)
                        else:
                            selected_paths.discard(p)
                            _apply_selection_color(r, False)
                return 'break'
            
            def _rclick_release(e):
                right_drag_state['active'] = False
                right_drag_state['start_idx'] = -1
                return 'break'
            
            # Double click play
            def _row_dbl(e, p=fpath):
                play_file(p, add_to_history=False)
            
            # Mousewheel: forward to canvas
            def _row_wheel(e):
                return on_canvas_mousewheel(e)
            
            # Bind to row and ALL children
            widgets = [row] + list(row.winfo_children())
            for w in widgets:
                w.bind('<Button-1>', _row_toggle, add='+')
                w.bind('<Button-3>', _rclick_press, add='+')
                w.bind('<B3-Motion>', _rclick_motion, add='+')
                w.bind('<ButtonRelease-3>', _rclick_release, add='+')
                w.bind('<Double-Button-1>', _row_dbl, add='+')
                w.bind('<MouseWheel>', _row_wheel, add='+')
        
        # 分组索引条相关
        _last_group_name = None  # 跨批次跟踪当前分组
        
        def _get_rating_group(score):
            """根据评分配置分组名（每隔0.5一组，x.6+显示为x+）"""
            score = float(score or 0.0)
            base = int(score)
            if score >= base + 0.6:
                return f"{base}+"
            return str(base)
        
        def _get_group_name(fpath):
            """获取歌曲的分组名（按块/流派/评分排序时）"""
            if sort_mode == 'block':
                return ratings.get(fpath, {}).get('block', '') or '未分组'
            elif sort_mode == 'genre':
                return ratings.get(fpath, {}).get('genre', '') or '未分类'
            elif sort_mode == 'rating':
                score = ratings.get(fpath, {}).get('score', 0) or 0
                return _get_rating_group(score)
            return None
        
        def _get_group_color(group_name):
            """获取分组索引条颜色"""
            if sort_mode == 'block':
                if group_name == '未分组':
                    return '#1e3a8a'
                return get_block_color(group_name)
            elif sort_mode == 'genre':
                return '#1e3a8a'  # 流派默认深蓝色
            elif sort_mode == 'rating':
                return '#1e3a8a'  # 评分统一深蓝色
            return '#1e3a8a'
        
        def _insert_group_header(group_name, color):
            """插入分组索引条，返回header Frame"""
            header = Frame(scrollable_frame, bg=color, pady=3)
            header.group_name = group_name
            header.pack(fill=tk.X, padx=5, pady=(10, 3))
            
            # 左侧：分组名
            arrow = '▼' if group_name not in collapsed_groups else '▶'
            name_lbl = Label(header, text=f"  {arrow}  {group_name}", bg=color, fg='white',
                            font=FONT_TITLE, anchor='w')
            name_lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
            
            # 右侧：歌曲数量稍后计算，这里先占位
            count_lbl = Label(header, text="", bg=color, fg='#cccccc',
                             font=FONT_SMALL)
            count_lbl.pack(side=tk.RIGHT, padx=12)
            header.count_lbl = count_lbl
            
            # 右侧：块内全选按钮（三角形恒朝下）
            select_btn = Label(header, text='▼', bg=color, fg='white', 
                             font=('微软雅黑', 13, 'bold'), width=3, anchor='center')
            select_btn.pack(side=tk.RIGHT, padx=4)
            
            def toggle_group(e=None, gn=group_name):
                if gn in collapsed_groups:
                    collapsed_groups.remove(gn)
                else:
                    collapsed_groups.add(gn)
                refresh_song_library(skip_rescan=True)
            
            def select_group(e=None, gn=group_name):
                global selected_paths
                group_paths = [p for p in display_paths if _get_group_name(p) == gn]
                all_selected = all(p in selected_paths for p in group_paths) if group_paths else False
                if all_selected:
                    for p in group_paths:
                        selected_paths.discard(p)
                else:
                    for p in group_paths:
                        selected_paths.add(p)
                refresh_song_library(skip_rescan=True)
            
            name_lbl.bind('<Button-1>', toggle_group)
            select_btn.bind('<Button-1>', select_group)
            
            # 双击索引条名称：选中/取消所有块内歌曲
            name_lbl.bind('<Double-Button-1>', select_group)
            
            # 鼠标滚轮转发到 canvas
            for hw in [header, name_lbl, count_lbl, select_btn]:
                hw.bind('<MouseWheel>', lambda e: on_canvas_mousewheel(e), add='+')
                hw.bind('<Button-4>', lambda e: on_canvas_mousewheel(e), add='+')
                hw.bind('<Button-5>', lambda e: on_canvas_mousewheel(e), add='+')
            
            return header
        
        def _add_songs_batch(start_idx=0, batch_size=10):
            global _is_initial_load
            # 代数不匹配或新请求到来：跳过后面的批次
            if _render_song_list._gen != cur_gen or refresh_song_library._refresh_id != my_refresh_id:
                return
            nonlocal _last_group_name
            # 初始加载每批10首快速展示，后续刷新用50首
            if not _is_initial_load:
                batch_size = 50
            end_idx = min(start_idx + batch_size, len(display_paths))
            
            for idx in range(start_idx, end_idx):
                fpath = display_paths[idx]
                
                # === 分组索引条（按块/流派/评分排序时） ===
                if show_index_headers and sort_mode in ('block', 'genre', 'rating'):
                    group_name = _get_group_name(fpath)
                    if group_name != _last_group_name:
                        _last_group_name = group_name
                        color = _get_group_color(group_name)
                        header = _insert_group_header(group_name, color)
                        song_rows.append(header)  # 把header也加到song_rows用于清理
                    
                    # 如果分组被折叠，跳过此歌曲
                    if group_name in collapsed_groups:
                        continue
                
                # Use alternating row colors for better readability
                row_bg = CARD_BG if idx % 2 == 0 else CARD_ALTERNATE
                row = Frame(scrollable_frame, bg=row_bg, pady=1)
                row.path = fpath
                row.original_bg = row_bg
                row.pack(fill=tk.X, padx=5)
                
                # display_name 从 get_cached_title 获取（歌手 - 歌名），隐藏歌手时仅显示歌名
                if artist_hidden_default:
                    info = load_song_info(fpath)
                    display_name = info.get('title', os.path.basename(fpath))
                else:
                    display_name = get_cached_title(fpath)
                
                score = float(ratings.get(fpath, {}).get('score', 0.0))
                note = str(ratings.get(fpath, {}).get('note', '') or '')
                # Handle note display based on display mode
                if note:
                    if note_display_mode == 'note_only':
                        display_name = note if len(note) <= 30 else note[:27] + '...'
                    elif note_display_mode == 'expanded':
                        note_short = note if len(note) <= 30 else note[:27] + '...'
                        display_name = f"{display_name}  ({note_short})"
                
                lbl = Label(row, text=display_name, anchor="w", bg=row_bg, fg=TEXT,
                            font=FONT_MAIN, padx=5)
                lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
                
                set_scrolling_label(lbl, display_name, max_chars=30)
                
                # Block color bar
                block_name = ratings.get(fpath, {}).get('block', '')
                block_color = get_block_color(block_name) if block_name else '#1e3a8a'
                color_bar = Frame(row, bg=block_color, height=8)
                color_bar.pack(side=tk.BOTTOM, fill=tk.X)
                color_bar.is_color_indicator = True
                
                setup_row_hover(row, row_bg, CARD_HOVER, [lbl, color_bar], path=fpath)
                
                # Play count
                play_count = ratings.get(fpath, {}).get('play_count', 0)
                
                # Score badge
                if sort_mode == 'rating' or (score and score != 0.0):
                    color = score_to_color(score)
                    score_lbl = Label(row, text=f"★{score:.1f}", bg=row_bg, fg=color, font=FONT_MAIN)
                    score_lbl.pack(side=tk.RIGHT, padx=(0,4), pady=6)
                
                if sort_mode == 'play_count':
                    play_count_lbl = Label(row, text=f"▶{play_count}", bg=row_bg, fg='#aaaaaa', font=FONT_MAIN)
                    play_count_lbl.pack(side=tk.RIGHT, padx=(0,4), pady=6)
                
                add_btn = Label(row, text="＋", bg=row_bg, fg='white', font=("微软雅黑", 10, "bold"),
                        width=3, anchor='center')
                add_btn.pack(side=tk.RIGHT, padx=6, pady=6)
                add_btn.bind('<Button-1>', lambda e, p=fpath: add_to_playlist_by_path(p))
                
                # Apply whole-row bindings
                _build_row_bindings(row, idx, fpath)
                
                song_rows.append(row)
            
            # Restore selected items visual state
            for row in song_rows:
                try:
                    p = getattr(row, 'path', None)
                except Exception:
                    p = None
                if p and p in selected_paths:
                    _apply_selection_color(row, True)
            
            # 更新分组索引条的歌曲数量
            if show_index_headers and sort_mode in ('block', 'genre', 'rating'):
                group_counts = {}
                for p in display_paths:
                    gn = _get_group_name(p)
                    group_counts[gn] = group_counts.get(gn, 0) + 1
                for row in song_rows:
                    if getattr(row, 'count_lbl', None) and getattr(row, 'group_name', None):
                        gn = row.group_name
                        cnt = group_counts.get(gn, 0)
                        collapsed_mark = ' (已折叠)' if gn in collapsed_groups else ''
                        row.count_lbl.config(text=f"{cnt}首{collapsed_mark}")
            
            # Schedule next batch
            if end_idx < len(display_paths) and not _closing:
                root.after(5, lambda: _add_songs_batch(end_idx, batch_size) if (_render_song_list._gen == cur_gen and refresh_song_library._refresh_id == my_refresh_id) else None)
            else:
                # 所有批次渲染完毕
                if _is_initial_load:
                    _is_initial_load = False
                    root.after(200, hide_loading_bar)
        
        # Start rendering batches
        _add_songs_batch()

def show_filter_results(filtered_paths):
    """Display filtered results in a separate window"""
    global filter_result_visible, filter_song_rows, current_filter_paths
    
    # 保存排序后的路径（供视图内操作使用）
    current_filter_paths = list(filtered_paths)
    
    # 防止重复调用造成叠加渲染：每进入一次递增代数，旧批次检测到代数不匹配就跳过
    if not hasattr(show_filter_results, '_gen'):
        show_filter_results._gen = 0
    show_filter_results._gen += 1
    cur_gen = show_filter_results._gen
    
    # Hide library controls, show filter result window and controls
    control_row.pack_forget()
    canvas.pack_forget()
    vsb_canvas.pack_forget()
    filter_control_row.pack(fill=tk.X, pady=6)
    filter_result_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=2, pady=2)
    filter_result_visible = True
    
    # Clear previous results
    for row in filter_song_rows:
        row.destroy()
    filter_song_rows.clear()
    
    # Render filtered songs in batches (with whole-row click, right-drag, mousewheel)
    filter_right_drag_state = {'active': False, 'start_idx': -1, 'mode': None}
    
    def _f_apply_selection_color(row, selected):
        bg = ACCENT if selected else getattr(row, 'original_bg', CARD_BG)
        # 同时更新 row Frame 自身背景
        try:
            row.config(bg=bg)
        except Exception:
            pass
        for c in row.winfo_children():
            if not getattr(c, 'is_color_indicator', False):
                try:
                    c.config(bg=bg)
                except:
                    pass
    
    def _f_build_bindings(row, row_idx, fpath):
        def _f_toggle(e, path=fpath, r=row):
            toggle_select(path, r)
            return 'break'
        def _f_rclick_press(e, path=fpath, r=row, ri=row_idx):
            if path in selected_paths:
                filter_right_drag_state['mode'] = 'deselect'
            else:
                filter_right_drag_state['mode'] = 'select'
            filter_right_drag_state['start_idx'] = ri
            filter_right_drag_state['active'] = True
            if filter_right_drag_state['mode'] == 'select':
                if path not in selected_paths:
                    selected_paths.add(path)
                _f_apply_selection_color(r, True)
            else:
                selected_paths.discard(path)
                _f_apply_selection_color(r, False)
            return 'break'
        def _f_rclick_motion(e):
            if not filter_right_drag_state['active']:
                return 'break'
            target_y = e.y_root - filter_scrollable_frame.winfo_rooty()
            rows = filter_song_rows
            if not rows:
                return 'break'
            lo, hi = 0, len(rows) - 1
            while lo < hi:
                mid = (lo + hi) // 2
                if rows[mid].winfo_y() < target_y:
                    lo = mid + 1
                else:
                    hi = mid
            si, ei = filter_right_drag_state['start_idx'], lo
            if si > ei:
                si, ei = ei, si
            mode = filter_right_drag_state['mode']
            for ri in range(si, ei + 1):
                if 0 <= ri < len(rows):
                    r = rows[ri]
                    p = getattr(r, 'path', None)
                    if not p:
                        continue
                    if mode == 'select':
                        if p not in selected_paths:
                            selected_paths.add(p)
                        _f_apply_selection_color(r, True)
                    else:
                        selected_paths.discard(p)
                        _f_apply_selection_color(r, False)
            return 'break'
        def _f_rclick_release(e):
            filter_right_drag_state['active'] = False
            return 'break'
        def _f_dbl(e, p=fpath):
            play_file(p, add_to_history=False)
        def _f_wheel(e):
            return on_filter_canvas_mousewheel(e)
        
        for w in [row] + list(row.winfo_children()):
            w.bind('<Button-1>', _f_toggle, add='+')
            w.bind('<Button-3>', _f_rclick_press, add='+')
            w.bind('<B3-Motion>', _f_rclick_motion, add='+')
            w.bind('<ButtonRelease-3>', _f_rclick_release, add='+')
            w.bind('<Double-Button-1>', _f_dbl, add='+')
            w.bind('<MouseWheel>', _f_wheel, add='+')
    
    # 分组索引条相关（筛选结果）- 使用 filter_sort_mode（独立于库的 sort_mode）
    _f_last_group_name = None
    
    def _f_get_rating_group(score):
        score = float(score or 0.0)
        base = int(score)
        if score >= base + 0.6:
            return f"{base}+"
        return str(base)

    def _f_get_group_name(fpath):
        if filter_sort_mode == 'block':
            return ratings.get(fpath, {}).get('block', '') or '未分组'
        elif filter_sort_mode == 'genre':
            return ratings.get(fpath, {}).get('genre', '') or '未分类'
        elif filter_sort_mode == 'rating':
            score = ratings.get(fpath, {}).get('score', 0) or 0
            return _f_get_rating_group(score)
        return None
    
    def _f_get_group_color(group_name):
        if filter_sort_mode == 'block':
            if group_name == '未分组':
                return '#1e3a8a'
            return get_block_color(group_name)
        elif filter_sort_mode == 'genre':
            return '#1e3a8a'
        elif filter_sort_mode == 'rating':
            return '#1e3a8a'
        return '#1e3a8a'
    
    def _f_insert_group_header(group_name, color):
        header = Frame(filter_scrollable_frame, bg=color, pady=3)
        header.group_name = group_name
        header.pack(fill=tk.X, padx=5, pady=(8, 2))
        
        arrow = '▼' if group_name not in collapsed_groups else '▶'
        name_lbl = Label(header, text=f"  {arrow}  {group_name}", bg=color, fg='white',
                        font=('微软雅黑', 11, 'bold'), anchor='w')
        name_lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        count_lbl_f = Label(header, text="", bg=color, fg='#cccccc', font=('微软雅黑', 9))
        count_lbl_f.pack(side=tk.RIGHT, padx=12)
        header.count_lbl = count_lbl_f
        
        # 右侧：块内全选按钮（三角形恒朝下）
        select_btn_f = Label(header, text='▼', bg=color, fg='white',
                            font=('微软雅黑', 13, 'bold'), width=3, anchor='center')
        select_btn_f.pack(side=tk.RIGHT, padx=4)
        
        def toggle_group(e=None, gn=group_name):
            if gn in collapsed_groups:
                collapsed_groups.remove(gn)
            else:
                collapsed_groups.add(gn)
            show_filter_results(current_filter_paths)
        
        def select_group_f(e=None, gn=group_name):
            global selected_paths
            group_paths = [p for p in current_filter_paths if _f_get_group_name(p) == gn]
            all_selected = all(p in selected_paths for p in group_paths) if group_paths else False
            if all_selected:
                for p in group_paths:
                    selected_paths.discard(p)
            else:
                for p in group_paths:
                    selected_paths.add(p)
            show_filter_results(current_filter_paths)
        
        name_lbl.bind('<Button-1>', toggle_group)
        select_btn_f.bind('<Button-1>', select_group_f)
        
        # 鼠标滚轮转发到 filter_canvas
        for hw in [header, name_lbl, count_lbl_f, select_btn_f]:
            hw.bind('<MouseWheel>', lambda e: on_filter_canvas_mousewheel(e), add='+')
            hw.bind('<Button-4>', lambda e: on_filter_canvas_mousewheel(e), add='+')
            hw.bind('<Button-5>', lambda e: on_filter_canvas_mousewheel(e), add='+')
        
        return header
    
    def _add_filter_songs_batch(start_idx=0, batch_size=50):
        nonlocal _f_last_group_name
        end_idx = min(start_idx + batch_size, len(filtered_paths))
        
        for idx in range(start_idx, end_idx):
            fpath = filtered_paths[idx]
            
            # === 分组索引条（按块/流派/评分排序时） ===
            if show_index_headers and filter_sort_mode in ('block', 'genre', 'rating'):
                group_name = _f_get_group_name(fpath)
                if group_name != _f_last_group_name:
                    _f_last_group_name = group_name
                    color = _f_get_group_color(group_name)
                    header = _f_insert_group_header(group_name, color)
                    filter_song_rows.append(header)
                
                if group_name in collapsed_groups:
                    continue
            
            # Use alternating row colors for better readability
            row_bg = CARD_BG if idx % 2 == 0 else CARD_ALTERNATE
            row = Frame(filter_scrollable_frame, bg=row_bg, pady=1)
            row.path = fpath
            row.original_bg = row_bg
            row.pack(fill=tk.X, padx=5)
            
            info = load_song_info(fpath)
            # display_name 从 get_cached_title 获取（歌手 - 歌名），隐藏歌手时仅显示歌名
            if artist_hidden_default:
                display_name = info.get('title', os.path.basename(fpath))
            else:
                display_name = get_cached_title(fpath)
            
            score = float(ratings.get(fpath, {}).get('score', 0.0))
            note = str(ratings.get(fpath, {}).get('note', '') or '')
            # Handle note display based on display mode
            if note:
                if note_display_mode == 'note_only':
                    # Only show the note
                    display_name = note if len(note) <= 30 else note[:27] + '...'
                elif note_display_mode == 'expanded':
                    # Show title + note
                    note_short = note if len(note) <= 30 else note[:27] + '...'
                    display_name = f"{display_name}  ({note_short})"
                # If 'folded', don't append note
            
            lbl = Label(row, text=display_name, anchor="w", bg=row_bg, fg=TEXT,
                        font=FONT_MAIN, padx=5)
            lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
            
            # Enable text scrolling for long song names
            set_scrolling_label(lbl, display_name, max_chars=30)
            
            block_name = ratings.get(fpath, {}).get('block', '')
            block_color = get_block_color(block_name) if block_name else '#1e3a8a'
            
            color_bar = Frame(row, bg=block_color, height=8)
            color_bar.pack(side=tk.BOTTOM, fill=tk.X)
            color_bar.is_color_indicator = True
            
            # Setup hover effect for filter result rows too (selection-aware)
            setup_row_hover(row, row_bg, CARD_HOVER, [lbl, color_bar], path=fpath)
            
            # Get play count
            play_count = ratings.get(fpath, {}).get('play_count', 0)
            
            if filter_sort_mode == 'rating' or (score and score != 0.0):
                color = score_to_color(score)
                score_lbl = Label(row, text=f"★{score:.1f}", bg=row_bg, fg=color, font=FONT_MAIN)
                score_lbl.pack(side=tk.RIGHT, padx=(0,4), pady=6)
            
            if filter_sort_mode == 'play_count':
                play_count_lbl = Label(row, text=f"▶{play_count}", bg=row_bg, fg='#aaaaaa', font=FONT_MAIN)
                play_count_lbl.pack(side=tk.RIGHT, padx=(0,4), pady=6)
            
            add_btn = Label(row, text="＋", bg=row_bg, fg='white', font=("微软雅黑", 10, "bold"),
                    width=3, anchor='center')
            add_btn.pack(side=tk.RIGHT, padx=6, pady=6)
            add_btn.bind('<Button-1>', lambda e, p=fpath: add_to_playlist_by_path(p))
            
            # Apply whole-row bindings
            _f_build_bindings(row, idx, fpath)
            
            filter_song_rows.append(row)
        
        # Restore selected items visual state
        for row in filter_song_rows:
            try:
                p = getattr(row, 'path', None)
            except Exception:
                p = None
            if p and p in selected_paths:
                _f_apply_selection_color(row, True)
        
        # 更新分组索引条的歌曲数量
        if show_index_headers and filter_sort_mode in ('block', 'genre', 'rating'):
            group_counts = {}
            for p in current_filter_paths:
                gn = _f_get_group_name(p)
                group_counts[gn] = group_counts.get(gn, 0) + 1
            for row in filter_song_rows:
                if getattr(row, 'count_lbl', None) and getattr(row, 'group_name', None):
                    gn = row.group_name
                    cnt = group_counts.get(gn, 0)
                    collapsed_mark = ' (已折叠)' if gn in collapsed_groups else ''
                    row.count_lbl.config(text=f"{cnt}首{collapsed_mark}")
        
        if end_idx < len(filtered_paths) and not _closing:
            root.after(50, lambda: _add_filter_songs_batch(end_idx, batch_size) if show_filter_results._gen == cur_gen else None)
    
    def _start_batch():
        if show_filter_results._gen == cur_gen:
            _add_filter_songs_batch()
    
    _start_batch()

def back_to_library():
    """Return to the main library view"""
    global filter_result_visible, filter_song_rows, audio_paths
    
    # 恢复完整音乐库（重新扫描目录）
    audio_paths = scan_audio_files(MUSIC_DIR)
    
    # Hide filter result window and controls, show library
    filter_control_row.pack_forget()
    filter_result_frame.pack_forget()
    control_row.pack(fill=tk.X, pady=6)
    canvas.pack(side="left", fill="both", expand=True)
    vsb_canvas.pack(side="right", fill="y")
    filter_result_visible = False
    clear_selection()
    refresh_song_library(skip_rescan=True)


def add_to_playlist_by_path(path):
    # Always allow adding even when playlist is empty
    if path not in playlist:
        playlist.append(path)
        # if no current index, set to first item
        global current_playlist_index
        if current_playlist_index == -1:
            current_playlist_index = 0
        if editor_mode.get() == "播放列表":
            update_playlist_listbox()
        update_ui_for_current_song()

def toggle_select(path, row, label_widget=None):
    """Toggle selection state for a song row."""
    global selected_paths
    if path in selected_paths:
        selected_paths.remove(path)
        # restore visuals using stored original_bg (preserves alternating colors)
        restore_bg = getattr(row, 'original_bg', CARD_BG)
        try:
            row.config(bg=restore_bg)
            for c in row.winfo_children():
                if not getattr(c, 'is_color_indicator', False):
                    c.config(bg=restore_bg)
        except:
            pass
    else:
        selected_paths.add(path)
        try:
            row.config(bg=ACCENT)
            for c in row.winfo_children():
                if not getattr(c, 'is_color_indicator', False):
                    c.config(bg=ACCENT)
        except:
            pass
        # 歌曲编辑模式下，从左边栏新选中歌曲则强制进入该歌曲的编辑页面
        if editor_mode.get() == "歌曲编辑":
            edit_song_info(path)

def clear_selection():
    global selected_paths
    if not selected_paths:
        return
    selected_paths.clear()
    # Clear visual highlighting directly in current view
    current_rows = filter_song_rows if filter_result_visible else song_rows
    for row in current_rows:
        # 跳过索引条 header（没有 path 属性）
        if not hasattr(row, 'path'):
            continue
        restore_bg = getattr(row, 'original_bg', CARD_BG)
        try:
            row.config(bg=restore_bg)
            for c in row.winfo_children():
                if not getattr(c, 'is_color_indicator', False):
                    c.config(bg=restore_bg)
        except:
            pass

def bulk_set_block(val):
    if not selected_paths:
        messagebox.showwarning('未选择', '请先选择要操作的曲目')
        return
    if not val:
        messagebox.showwarning('未选择', '请先在块下拉框选择一个块')
        return
    changed = False
    for p in list(selected_paths):
        ud = ratings.get(p, {})
        ud['block'] = val
        ratings[p] = ud
        changed = True
    if changed:
        save_ratings(ratings)
        song_info_cache.clear()
        refresh_song_library(skip_rescan=True)
        clear_selection()
        messagebox.showinfo('已应用', f'已将选中曲目设置为块：{val}')

def bulk_set_genre(val):
    if not selected_paths:
        messagebox.showwarning('未选择', '请先选择要操作的曲目')
        return
    if not val:
        messagebox.showwarning('未选择', '请先在流派下拉框选择一个流派')
        return
    changed = False
    for p in list(selected_paths):
        ud = ratings.get(p, {})
        ud['genre'] = val
        ratings[p] = ud
        changed = True
    if changed:
        save_ratings(ratings)
        song_info_cache.clear()
        refresh_song_library(skip_rescan=True)
        clear_selection()
        messagebox.showinfo('已应用', f'已将选中曲目设置为流派：{val}')

def bulk_add_selected_to_playlist():
    paths = []
    if selected_paths:
        paths = list(selected_paths)
    else:
        # if in block editor, use its selection
        try:
            bes = globals().get('block_editor_state')
            if bes and bes.get('selected'):
                order = bes.get('order', [])
                sel = sorted(list(bes.get('selected')))
                paths = [order[i] for i in sel if 0 <= i < len(order)]
        except Exception:
            paths = []
    if not paths:
        messagebox.showwarning('未选择', '请先选择要添加到歌单的曲目')
        return
    added = 0
    for p in paths:
        if p not in playlist:
            playlist.append(p)
            added += 1
    if added:
        update_playlist_listbox()
        messagebox.showinfo('已添加', f'已将 {added} 首曲目添加到播放列表')
    else:
        messagebox.showinfo('已完成', '选中曲目已全部在播放列表中')
    clear_selection()

def select_all_visible():
    """Toggle select all visible song rows in the library or filter results.
    If all visible are selected, clear selection; otherwise select them."""
    # Use appropriate song_rows based on current view
    current_rows = filter_song_rows if filter_result_visible else song_rows
    visible = [getattr(row, 'path', None) for row in current_rows]
    visible = [p for p in visible if p]
    if not visible:
        return
    visible_set = set(visible)
    # if all visible are already selected -> clear
    if visible_set.issubset(selected_paths) and selected_paths:
        clear_selection()
        return
    # otherwise select all visible
    selected_paths.clear()
    for row in current_rows:
        p = getattr(row, 'path', None)
        if p and p in visible_set:
            selected_paths.add(p)
            try:
                row.config(bg=ACCENT)
                for c in row.winfo_children():
                    if not getattr(c, 'is_color_indicator', False):
                        c.config(bg=ACCENT)
            except:
                pass

# Now that all functions are defined, setup the filter control buttons
_setup_filter_control_buttons()

def context_bulk_action():
    """Perform context-sensitive bulk action: if right editor is 播放列表, add selected to playlist; else toggle bulk panel."""
    mode = editor_mode.get()
    if mode == '播放列表':
        bulk_add_selected_to_playlist()
    else:
        toggle_bulk_panel()

def toggle_bulk_panel():
    try:
        if bulk_frame.winfo_ismapped():
            bulk_frame.pack_forget()
        else:
            bulk_frame.pack(fill=tk.X, pady=(6,8), padx=6)
    except Exception:
        try:
            bulk_frame.pack(fill=tk.X, pady=(6,8), padx=6)
        except:
            pass

refresh_song_library()

# place selection and batch buttons at top-right of left control row
ttk.Button(control_row, text='全选', command=select_all_visible).pack(side=tk.RIGHT, padx=6)
ttk.Button(control_row, text='批量操作', command=context_bulk_action).pack(side=tk.RIGHT, padx=6)

# 批量操作控件（块 / 流派 / 添加到歌单） - 默认隐藏，使用 `批量操作` 按钮切换显示
bulk_frame = Frame(left_frame, bg=PANEL_BG)
tk.Label(bulk_frame, text='批量操作：', bg=PANEL_BG, fg=TEXT, font=('微软雅黑', 10)).pack(side=tk.LEFT, padx=(2,6))
bulk_block_var = tk.StringVar()
bulk_block_cb = ttk.Combobox(bulk_frame, values=[''] + blocks, textvariable=bulk_block_var, width=12, style='Black.TCombobox')
bulk_block_cb.pack(side=tk.LEFT, padx=4)
ttk.Button(bulk_frame, text='设为块', command=lambda: bulk_set_block(bulk_block_var.get())).pack(side=tk.LEFT, padx=4)
bulk_genre_var = tk.StringVar()
bulk_genre_cb = ttk.Combobox(bulk_frame, values=[''] + genres, textvariable=bulk_genre_var, width=12, style='Black.TCombobox')
bulk_genre_cb.pack(side=tk.LEFT, padx=4)
ttk.Button(bulk_frame, text='设为流派', command=lambda: bulk_set_genre(bulk_genre_var.get())).pack(side=tk.LEFT, padx=4)
ttk.Button(bulk_frame, text='添加到歌单', command=bulk_add_selected_to_playlist).pack(side=tk.LEFT, padx=6)
ttk.Button(bulk_frame, text='清除选择', command=clear_selection).pack(side=tk.RIGHT, padx=6)

# ==================== 中间播放主区域 ====================
middle_frame = tk.Frame(root, bg=BG_COLOR)
middle_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(8, 8), pady=12)

cover_label = tk.Label(middle_frame, text="", font=FONT_MAIN,
                       bg=PANEL_BG, fg=TEXT, width=COVER_SIZE//10, height=COVER_SIZE//20)
cover_label.pack(pady=(10, 5))
cover_label.pack_propagate(False)
cover_label.config(width=COVER_SIZE//10, height=COVER_SIZE//20)

info_frame = tk.Frame(middle_frame, bg=BG_COLOR)
info_frame.pack(pady=5)

def show_song_details():
    if not playlist or current_playlist_index == -1:
        messagebox.showinfo('详细信息', '当前没有正在播放的歌曲')
        return
    filepath = playlist[current_playlist_index]
    info = load_song_info(filepath)
    ud = ratings.get(filepath, {})
    score = float(ud.get('score', info.get('score', 0) or 0.0) or 0.0)
    note = ud.get('note', '') or info.get('note', '')
    comment = ud.get('comment', '')
    genre = ud.get('genre', '')
    block = ud.get('block', '')
    bitrate_str = "未知"
    try:
        audio = mutagen.File(filepath)
        if audio and hasattr(audio.info, 'bitrate'):
            br = audio.info.bitrate
            bitrate_str = f"{br // 1000}kbps" if br else "未知"
    except:
        pass
    txt = f"歌曲：{info.get('title','')}\n歌手：{info.get('artist','')}\n评分：{score:.1f}\n比特率：{bitrate_str}\n备注：{note}\n评论：{comment}\n流派：{genre}\n块：{block}"
    messagebox.showinfo('歌曲详情', txt)

row_title = tk.Frame(info_frame, bg=BG_COLOR)
row_title.pack()
title_label = tk.Label(row_title, text="歌曲：...", font=FONT_TITLE,
                       bg=BG_COLOR, fg=TEXT)
title_label.pack(side=tk.LEFT)
details_lbl = tk.Label(row_title, text='详情', bg=BG_COLOR, fg=ACCENT, cursor='hand2', font=FONT_SMALL)
details_lbl.pack(side=tk.LEFT, padx=8)
def _on_details_click(event=None):
    show_song_details()
    return 'break'
def _on_details_enter(event=None):
    try:
        details_lbl.config(fg=ACCENT_HOVER)
    except:
        pass
    return 'break'
def _on_details_leave(event=None):
    try:
        details_lbl.config(fg=ACCENT)
    except:
        pass
    return 'break'
details_lbl.bind('<Button-1>', _on_details_click)
details_lbl.bind('<Enter>', _on_details_enter)
details_lbl.bind('<Leave>', _on_details_leave)
artist_label = tk.Label(info_frame, text="歌手：...", font=FONT_MAIN,
                        bg=BG_COLOR, fg=MUTED)
artist_label.pack(pady=2)
duration_label = tk.Label(info_frame, text="时长：...", font=FONT_MAIN,
                          bg=BG_COLOR, fg=MUTED)
duration_label.pack()

# ── 进度条 ──
bar_frame = tk.Frame(middle_frame, bg=BG_COLOR, height=40)
bar_frame.pack(fill=tk.X, pady=10, padx=20)

bar_canvas = tk.Canvas(bar_frame, width=20 + BAR_WIDTH + 20, height=40,
                       bg=BG_COLOR, highlightthickness=0)
bar_canvas.pack()

bg_bar = bar_canvas.create_rectangle(20, 15, 20 + BAR_WIDTH, 15 + BAR_HEIGHT,
                                     fill=TROUGH, outline='', width=0)
played_bar = bar_canvas.create_rectangle(20, 15, 20, 15 + BAR_HEIGHT,
                                         fill=ACCENT, outline='', width=0)
knob = bar_canvas.create_oval(20 - KNOB_RADIUS, 15 + BAR_HEIGHT//2 - KNOB_RADIUS,
                              20 + KNOB_RADIUS, 15 + BAR_HEIGHT//2 + KNOB_RADIUS,
                              fill='white', outline=ACCENT, width=2)

def on_bar_click(event):
    x = event.x
    if x < 20: x = 20
    if x > 20 + BAR_WIDTH: x = 20 + BAR_WIDTH
    if total_seconds > 0:
        frac = (x - 20) / BAR_WIDTH
        seek(frac * total_seconds)

def on_knob_press(event):
    global dragging
    dragging = True

def on_knob_motion(event):
    global dragging, current_pos
    if dragging and total_seconds > 0:
        x = event.x
        if x < 20: x = 20
        if x > 20 + BAR_WIDTH: x = 20 + BAR_WIDTH
        frac = (x - 20) / BAR_WIDTH
        current_pos = frac * total_seconds
        update_bar()

def on_knob_release(event):
    global dragging
    if dragging:
        dragging = False
        seek(current_pos)

bar_canvas.bind("<Button-1>", on_bar_click)
bar_canvas.tag_bind(knob, "<ButtonPress-1>", on_knob_press)
bar_canvas.tag_bind(knob, "<B1-Motion>", on_knob_motion)
bar_canvas.tag_bind(knob, "<ButtonRelease-1>", on_knob_release)

time_label = tk.Label(middle_frame, text="0:00 / 0:00", font=FONT_SMALL,
                      bg=BG_COLOR, fg=MUTED)
time_label.pack(pady=(0, 10))

# ── 歌词显示 (Canvas) ──
lyrics_canvas = tk.Canvas(middle_frame, height=140, bg=BG_COLOR, highlightthickness=0)
lyrics_canvas.pack(fill=tk.X, padx=10, pady=5)
lyrics_label = None  # kept for backward compat

# ── 音量 ──
volume_frame = tk.Frame(middle_frame, bg=BG_COLOR)
volume_frame.pack(pady=5)

volume_label = tk.Label(volume_frame, text="音量：70%", font=FONT_SMALL,
                        bg=BG_COLOR, fg=MUTED, width=8)
volume_label.pack(side=tk.LEFT, padx=5)

volume_scale = ttk.Scale(volume_frame, from_=0, to=100, orient=HORIZONTAL, length=200,
                         command=set_volume, value=70, style='Horizontal.TScale')
volume_scale.pack(side=tk.LEFT, padx=5)

# ── 评分编辑 ──
score_frame = tk.Frame(middle_frame, bg=BG_COLOR)
score_frame.pack(pady=5)

score_label = tk.Label(score_frame, text="评分：", font=FONT_SMALL,
                       bg=BG_COLOR, fg=MUTED)
score_label.pack(side=tk.LEFT, padx=5)

score_var = tk.DoubleVar(value=0.0)
score_spinbox = tk.Spinbox(score_frame, from_=0, to=10, textvariable=score_var, width=4,
                          bg=CARD_BG, fg=TEXT, font=FONT_SMALL, justify='center',
                          buttonbackground=CARD_BG, relief='solid', bd=1,
                          readonlybackground=CARD_BG)
score_spinbox.pack(side=tk.LEFT, padx=2)

def update_current_song_score():
    """Update score of currently playing song"""
    if current_playlist_index == -1 or not playlist:
        return
    try:
        score = float(score_var.get())
        if 0 <= score <= 10:
            filepath = playlist[current_playlist_index]
            if filepath not in ratings:
                ratings[filepath] = {}
            ratings[filepath]['score'] = score
            save_ratings(ratings)
            refresh_song_library(skip_rescan=True)
    except:
        pass

score_update_btn = ttk.Button(score_frame, text="保存", width=4, command=update_current_song_score, style='Small.TButton')
score_update_btn.pack(side=tk.LEFT, padx=2)

# ── 播放控制按钮 ──
control_frame = tk.Frame(middle_frame, bg=BG_COLOR)
control_frame.pack(pady=10)

prev_btn = ttk.Button(control_frame, text="⏮", width=4, command=prev_song, style='Small.TButton')
prev_btn.pack(side=tk.LEFT, padx=4)

play_btn = ttk.Button(control_frame, text="▶", width=5, command=pause_or_resume, style='Accent.TButton')
play_btn.pack(side=tk.LEFT, padx=4)

next_btn = ttk.Button(control_frame, text="⏭", width=4, command=next_song, style='Small.TButton')
next_btn.pack(side=tk.LEFT, padx=4)

stop_btn = ttk.Button(control_frame, text="⏹", width=4, command=stop, style='Danger.TButton')
stop_btn.pack(side=tk.LEFT, padx=4)

# ── 播放模式菜单 ──
mode_menu_frame = tk.Frame(middle_frame, bg=BG_COLOR)
mode_menu_frame.pack(pady=5)

mode_menu_button = Menubutton(mode_menu_frame, text="模式：列表循环", relief=tk.FLAT,
                              bg=CARD_BG, fg=TEXT, activebackground=ACCENT_HOVER,
                              activeforeground='white', font=FONT_SMALL,
                              padx=10, pady=3)
mode_menu_button.pack()

mode_menu = Menu(mode_menu_button, tearoff=0, bg=TROUGH, fg='white',
                 activebackground=ACCENT_HOVER, activeforeground='white',
                 font=FONT_SMALL)
mode_menu.add_command(label="循环播放", command=lambda: set_play_mode("list_loop"))
mode_menu.add_command(label="列表播放", command=lambda: set_play_mode("list_sequential"))
mode_menu.add_command(label="单曲循环", command=lambda: set_play_mode("single_loop"))
mode_menu.add_command(label="随机播放", command=lambda: set_play_mode("random"))
mode_menu_button.config(menu=mode_menu)

# ==================== 右侧编辑栏 ====================
right_frame = tk.Frame(root, bg=PANEL_BG, width=380)
right_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(8, 12), pady=12)
right_frame.pack_propagate(False)

# ── 启动时恢复透明模式（同窗方案：Draw BG + Set Alpha） ──
if glass_mode and _has_bg_image():
    root.after(150, lambda: toggle_glass_mode(True))

# ── 功能选择器标题栏 ──
editor_mode = tk.StringVar(value="播放列表")
editor_header = tk.Frame(right_frame, bg=ACCENT)
editor_header.pack(fill=tk.X, pady=(0, 8))
editor_inner = tk.Frame(editor_header, bg=ACCENT)
editor_inner.pack(fill=tk.X, padx=12, pady=6)

tk.Label(editor_inner, text="⚙  功能面板", font=FONT_TITLE,
         bg=ACCENT, fg='white').pack(side=tk.LEFT)

editor_menu_frame = tk.Frame(right_frame, bg=PANEL_BG)
editor_menu_frame.pack(fill=tk.X, pady=(0, 10))

tk.Label(editor_menu_frame, text="功能：", font=FONT_SMALL,
         bg=PANEL_BG, fg=MUTED).pack(side=tk.LEFT, padx=(4, 4))

editor_option = Menubutton(editor_menu_frame, textvariable=editor_mode, relief=tk.FLAT,
                           bg=CARD_BG, fg=TEXT, activebackground=ACCENT_HOVER,
                           activeforeground='white', font=FONT_MAIN,
                           padx=10, pady=4)
editor_option.pack(side=tk.LEFT)

# filter status label (shows active range when filter is applied)
filter_status_lbl = tk.Label(editor_menu_frame, text='', bg=PANEL_BG, fg=ACCENT, font=FONT_SMALL)
filter_status_lbl.pack(side=tk.LEFT, padx=(8, 4))

def update_filter_status():
    try:
        active = rating_filter_active_var.get()
    except Exception:
        active = False
    if active:
        try:
            lo = float(rating_filter_min_var.get())
            hi = float(rating_filter_max_var.get())
        except Exception:
            lo, hi = 0.0, 10.0
        filter_status_lbl.config(text=f"筛选：{lo:.1f}-{hi:.1f}", fg=ACCENT)
    else:
        filter_status_lbl.config(text='', fg=ACCENT)

SimpleTooltip(filter_status_lbl, lambda: filter_status_lbl.cget('text'))

# quick access button to open filter panel (removed to avoid duplicate entry)

editor_menu = Menu(editor_option, tearoff=0, bg=TROUGH, fg='white',
                   activebackground=HOVER, activeforeground='white')
editor_menu.add_command(label="播放列表", command=lambda: switch_editor("播放列表"))
editor_menu.add_command(label="歌单", command=lambda: switch_editor("歌单"))
editor_menu.add_command(label="歌曲编辑", command=lambda: switch_editor("歌曲编辑"))
editor_menu.add_command(label="搜索与筛选", command=lambda: switch_editor("筛选"))
editor_menu.add_command(label="网易云音乐", command=lambda: switch_editor("网易云"))
editor_menu.add_command(label="歌单管理", command=lambda: switch_editor("日推"))
editor_menu.add_command(label="评论", command=lambda: switch_editor("评论"))
editor_menu.add_command(label="歌词", command=lambda: switch_editor("歌词"))
editor_menu.add_command(label="块", command=lambda: switch_editor("块"))
editor_menu.add_command(label="流派", command=lambda: switch_editor("流派"))
editor_menu.add_command(label="设置", command=lambda: switch_editor("设置"))
editor_option.config(menu=editor_menu)

playlist_panel = Frame(right_frame, bg=PANEL_BG)
playlist_editor_panel = Frame(right_frame, bg=PANEL_BG)
song_edit_panel = Frame(right_frame, bg=PANEL_BG)
filter_panel = Frame(right_frame, bg=PANEL_BG)
comments_panel = Frame(right_frame, bg=PANEL_BG)
netease_search_panel = Frame(right_frame, bg=PANEL_BG)
netease_panel = Frame(right_frame, bg=PANEL_BG)
daily_panel = Frame(right_frame, bg=PANEL_BG)
lyrics_panel = Frame(right_frame, bg=PANEL_BG)
blocks_panel = Frame(right_frame, bg=PANEL_BG)
genres_panel = Frame(right_frame, bg=PANEL_BG)
block_editor_panel = Frame(right_frame, bg=PANEL_BG)
genre_editor_panel = Frame(right_frame, bg=PANEL_BG)
settings_panel = Frame(right_frame, bg=PANEL_BG)
playlist_detail_panel = Frame(right_frame, bg=PANEL_BG)

def build_blocks_panel():
    for w in blocks_panel.winfo_children():
        w.destroy()
    # Enhanced header for blocks panel
    header_blocks = tk.Frame(blocks_panel, bg=ACCENT)
    header_blocks.pack(fill=tk.X, pady=0)
    tk.Label(header_blocks, text="📋 块 管理", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)
    
    # Container for blocks with colors
    blocks_container = Frame(blocks_panel, bg=PANEL_BG)
    blocks_container.pack(padx=6, pady=4, fill=tk.BOTH, expand=True)
    
    # List with color indicators - beautified
    for i, b in enumerate(blocks):
        block_name = b.get('name') if isinstance(b, dict) else b
        block_color = b.get('color', '#1e3a8a') if isinstance(b, dict) else '#1e3a8a'
        
        row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
        row = Frame(blocks_container, bg=row_bg, height=32)
        row.pack(fill=tk.X, pady=1, padx=2)
        
        # Color indicator - bigger
        color_box = Frame(row, bg=block_color, width=16)
        color_box.pack(side=tk.LEFT, padx=(0, 6), fill=tk.Y)
        color_box.pack_propagate(False)
        
        # Block name on left
        lbl = Label(row, text=block_name, bg=row_bg, fg=TEXT, anchor='w', 
                   font=FONT_MAIN, padx=5)
        lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # Song count
        count = len([p for p, ud in ratings.items() if ud.get('block', '') == block_name])
        count_lbl = Label(row, text=f"{count}首", bg=row_bg, fg=MUTED, font=('微软雅黑', 9))
        count_lbl.pack(side=tk.RIGHT, padx=(0, 4))
        
        # Edit color button
        def _edit_color(bn=block_name):
            _change_block_color(bn)
        color_btn = Label(row, text='🎨', bg=row_bg, fg=TEXT, width=3, anchor='center', cursor='hand2')
        color_btn.pack(side=tk.RIGHT, padx=2)
        color_btn.bind('<Button-1>', lambda e, bn=block_name: _edit_color(bn))
        
        # Double-click to edit block contents
        lbl.bind('<Double-1>', lambda e, bn=block_name: open_block_editor(bn))
    
    def _change_block_color(block_name):
        from tkinter.colorchooser import askcolor
        _, color = askcolor(color=get_block_color(block_name), title=f'选择 {block_name} 的颜色')
        if color:
            set_block_color(block_name, color)
            refresh_song_library(skip_rescan=True)
            build_blocks_panel()
    
    # 输入+按钮区域
    entry_frame = Frame(blocks_panel, bg=PANEL_BG)
    entry_frame.pack(fill=tk.X, padx=8, pady=(6, 2))
    entry_var = tk.StringVar()
    entry = Entry(entry_frame, textvariable=entry_var, font=FONT_MAIN, bg='#111111', fg=TEXT, insertbackground='white', relief='solid', bd=1)
    entry.pack(fill=tk.X, side=tk.LEFT, expand=True, ipady=3)
    ttk.Button(entry_frame, text='＋', width=3, command=lambda: add_block_cmd(), style='Small.TButton').pack(side=tk.RIGHT, padx=(4, 0))

    def add_block_cmd():
        name = entry_var.get().strip()
        if not name:
            messagebox.showwarning('提示', '请输入块名称')
            return
        if any(b.get('name') == name for b in blocks if isinstance(b, dict)):
            messagebox.showwarning('提示', '该块已存在')
            return
        # Create new block with default color
        blocks.append({'name': name, 'color': '#1e3a8a'})
        save_json_file(BLOCKS_FILE, blocks)
        entry_var.set('')
        try:
            edit_block_cb['values'] = [b.get('name') if isinstance(b, dict) else b for b in blocks]
        except Exception:
            pass
        if filter_panel.winfo_ismapped():
            build_filter_panel()
        build_blocks_panel()

    def delete_block_cmd():
        if not blocks:
            messagebox.showwarning('未选择', '没有块可以删除')
            return
        # Show a simple dialog to select which block to delete
        block_names = [b.get('name') if isinstance(b, dict) else b for b in blocks]
        if not block_names:
            return
        name = simpledialog.askstring('删除块', f'要删除的块（可选项：{", ".join(block_names)}）：')
        if not name or name not in block_names:
            return
        if not messagebox.askyesno('确认', f'删除块：{name} ?'):
            return
        blocks[:] = [b for b in blocks if (b.get('name') if isinstance(b, dict) else b) != name]
        save_json_file(BLOCKS_FILE, blocks)
        # clear ratings entries that referenced this block
        changed = False
        for k, v in list(ratings.items()):
            if v.get('block') == name:
                v['block'] = ''
                changed = True
        if changed:
            save_ratings(ratings)
            song_info_cache.clear()
            refresh_song_library(skip_rescan=True)
        try:
            edit_block_cb['values'] = [b.get('name') if isinstance(b, dict) else b for b in blocks]
        except Exception:
            pass
        if filter_panel.winfo_ismapped():
            build_filter_panel()
        build_blocks_panel()

    btn_frame = Frame(blocks_panel, bg=PANEL_BG)
    btn_frame.pack(fill=tk.X, padx=8, pady=6)
    ttk.Button(btn_frame, text='添加块', command=add_block_cmd).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(btn_frame, text='删除块', command=delete_block_cmd, style='Danger.TButton').pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

def open_block_editor(name):
    """Open the block editor for the given block name."""
    editor_mode.set('块编辑')
    playlist_panel.pack_forget()
    playlist_editor_panel.pack_forget()
    song_edit_panel.pack_forget()
    filter_panel.pack_forget()
    blocks_panel.pack_forget()
    genres_panel.pack_forget()
    settings_panel.pack_forget()
    build_block_editor(name)
    block_editor_panel.pack(fill=tk.BOTH, expand=True)

def build_block_editor(name):
    for w in block_editor_panel.winfo_children():
        w.destroy()
    header = Frame(block_editor_panel, bg=ACCENT)
    header.pack(fill=tk.X, pady=0)
    back_btn = ttk.Button(header, text='✕', width=3, command=lambda: switch_editor('块'))
    back_btn.pack(side=tk.LEFT, padx=6, pady=4)
    tk.Label(header, text=f"🧩 块：{name}", font=FONT_TITLE, bg=ACCENT, fg='white').pack(side=tk.LEFT, pady=4)

    # collect songs in this block
    songs = [p for p,ud in ratings.items() if ud.get('block','') == name]
    # keep an in-session order
    block_order = songs.copy()

    # selection and drag state
    be_drag = {"widget": None, "index": None}
    block_selected = set()

    lb = Listbox(block_editor_panel, width=40, height=12, bg=CARD_BG, fg=TEXT, selectbackground=ACCENT)
    lb.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

    def refresh_block_listbox():
        lb.delete(0, END)
        for p in block_order:
            title = load_song_info(p).get('title') or os.path.basename(p)
            lb.insert(END, title)
        # restore selection
        try:
            lb.select_clear(0, END)
        except:
            pass
        for idx in list(block_selected):
            if 0 <= idx < len(block_order):
                try:
                    lb.selection_set(idx)
                except:
                    pass

    def be_on_button_press(event):
        idx = lb.nearest(event.y)
        if idx >= 0:
            be_drag['widget'] = lb
            be_drag['index'] = idx

    def be_on_motion(event):
        w = be_drag.get('widget')
        if not w:
            return
        idx = w.nearest(event.y)
        try:
            w.selection_clear(0, END)
            w.selection_set(idx)
        except:
            pass

    def be_on_button_release(event):
        src = be_drag.get('index')
        w = be_drag.get('widget')
        if w is None or src is None:
            return
        dst = w.nearest(event.y)
        if dst < 0 or dst == src:
            be_drag['widget'] = None
            be_drag['index'] = None
            return
        item = block_order.pop(src)
        block_order.insert(dst, item)
        refresh_block_listbox()
        be_drag['widget'] = None
        be_drag['index'] = None

    def be_toggle_selection(event):
        idx = lb.nearest(event.y)
        if idx < 0:
            return 'break'
        if idx in block_selected:
            block_selected.remove(idx)
            try:
                lb.selection_clear(idx)
            except:
                pass
        else:
            block_selected.add(idx)
            try:
                lb.selection_set(idx)
            except:
                pass
        be_on_button_press(event)
        return 'break'

    lb.bind('<Button-1>', be_toggle_selection)
    lb.bind('<B1-Motion>', be_on_motion)
    lb.bind('<ButtonRelease-1>', be_on_button_release)

    # bottom controls: two rows of buttons
    be_btn_frame_row1 = Frame(block_editor_panel, bg=PANEL_BG)
    be_btn_frame_row1.pack(fill=tk.X, pady=(6, 2), padx=8)
    
    be_btn_frame_row2 = Frame(block_editor_panel, bg=PANEL_BG)
    be_btn_frame_row2.pack(fill=tk.X, pady=(2, 6), padx=8)
    
    # state tracker for toggle select all
    be_select_state = {'all': False}
    
    def be_select_all():
        nonlocal block_selected
        if be_select_state['all']:
            block_selected.clear()
            be_select_state['all'] = False
        else:
            block_selected.clear()
            for i in range(len(block_order)):
                block_selected.add(i)
            be_select_state['all'] = True
        refresh_block_listbox()
    
    def be_add_to_playlist():
        nonlocal block_order, block_selected
        if not block_selected:
            messagebox.showwarning('未选择', '请先选择要添加的曲目')
            return
        paths = [block_order[i] for i in sorted(list(block_selected)) if 0 <= i < len(block_order)]
        added = 0
        for p in paths:
            if p not in playlist:
                playlist.append(p)
                added += 1
        if added:
            update_playlist_listbox()
        pl_select_state['all'] = False
        messagebox.showinfo('已添加', f'已将 {added} 首曲目添加到播放列表')

    def be_remove_selected():
        nonlocal block_order, block_selected
        if not block_selected:
            messagebox.showwarning('未选择', '请先选择要移除的曲目')
            return
        indices = sorted(list(block_selected), reverse=True)
        for idx in indices:
            if 0 <= idx < len(block_order):
                p = block_order.pop(idx)
                # clear block tag in ratings
                ud = ratings.get(p, {})
                if ud.get('block'):
                    ud['block'] = ''
                    ratings[p] = ud
        save_ratings(ratings)
        block_selected.clear()
        refresh_block_listbox()

    def be_add_from_left_sidebar():
        # Add selected songs from left sidebar to current block
        nonlocal block_order, block_selected
        if not selected_paths:
            messagebox.showwarning('未选择', '请先在左边栏选择要添加的曲目')
            return
        added = 0
        for p in list(selected_paths):
            if p not in block_order:
                block_order.append(p)
                # update ratings to mark this song as part of current block
                ud = ratings.get(p, {})
                ud['block'] = name
                ratings[p] = ud
                added += 1
        if added:
            save_ratings(ratings)
            song_info_cache.clear()
            refresh_block_listbox()
            messagebox.showinfo('已添加', f'已将 {added} 首曲目添加到块')

    # Row 1: select all and remove selected
    ttk.Button(be_btn_frame_row1, text='全选', command=be_select_all).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(be_btn_frame_row1, text='移除选中', command=be_remove_selected).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    
    # Row 2: add to playlist, add from left sidebar
    ttk.Button(be_btn_frame_row2, text='添加到歌单', command=be_add_to_playlist).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(be_btn_frame_row2, text='从左边栏添加', command=be_add_from_left_sidebar).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

    refresh_block_listbox()

    # expose block editor selection for global bulk actions
    try:
        global block_editor_state
        block_editor_state = {
            'order': block_order,
            'selected': block_selected,
            'listbox': lb
        }
    except Exception:
        pass

def build_genres_panel():
    for w in genres_panel.winfo_children():
        w.destroy()
    
    # Enhanced header for genres panel
    header_genres = tk.Frame(genres_panel, bg=ACCENT)
    header_genres.pack(fill=tk.X, pady=0)
    tk.Label(header_genres, text="🎶 流派 管理", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)
    
    # Container for genres
    genres_container = Frame(genres_panel, bg=PANEL_BG)
    genres_container.pack(padx=6, pady=4, fill=tk.BOTH, expand=True)
    
    # Genre rows with alternating colors and song counts
    genre_selected = set()
    g_select_state = {'all': False}
    
    for i, g in enumerate(genres):
        row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
        row = Frame(genres_container, bg=row_bg, height=30)
        row.pack(fill=tk.X, pady=1, padx=2)
        
        # Genre name
        lbl = Label(row, text=g, bg=row_bg, fg=TEXT, anchor='w',
                   font=FONT_MAIN, padx=8)
        lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # Song count
        count = len([p for p, ud in ratings.items() if ud.get('genre', '') == g])
        count_lbl = Label(row, text=f"{count}首", bg=row_bg, fg=MUTED, font=('微软雅黑', 9))
        count_lbl.pack(side=tk.RIGHT, padx=(0, 8))
        
        # Double-click to open genre editor
        lbl.bind('<Double-1>', lambda e, gn=g: open_genre_editor(gn))
        
        # Selection toggle on click
        def _toggle_genre_sel(event, idx=i, r=row, l=lbl, cl=count_lbl):
            nonlocal genre_selected
            if idx in genre_selected:
                genre_selected.remove(idx)
                r.config(bg=row_bg)
                l.config(bg=row_bg)
                cl.config(bg=row_bg)
            else:
                genre_selected.add(idx)
                r.config(bg=ACCENT)
                l.config(bg=ACCENT)
                cl.config(bg=ACCENT)
            g_select_state['all'] = len(genre_selected) == len(genres)
        lbl.bind('<Button-1>', _toggle_genre_sel)
    
    # Buttons
    def g_select_all():
        nonlocal genre_selected
        if g_select_state['all']:
            genre_selected.clear()
            g_select_state['all'] = False
        else:
            genre_selected.clear()
            for i in range(len(genres)):
                genre_selected.add(i)
            g_select_state['all'] = True
        build_genres_panel()
    
    def g_delete_selected():
        nonlocal genre_selected
        if not genre_selected:
            messagebox.showwarning('未选择', '请先选择要删除的流派')
            return
        selected_genres = [genres[i] for i in sorted(list(genre_selected), reverse=True)]
        if not messagebox.askyesno('确认', f'删除 {len(selected_genres)} 个流派吗？'):
            return
        
        for g in selected_genres:
            try:
                genres.remove(g)
            except ValueError:
                pass
            for k, v in list(ratings.items()):
                if v.get('genre') == g:
                    v['genre'] = ''
        
        save_json_file(GENRES_FILE, genres)
        save_ratings(ratings)
        song_info_cache.clear()
        genre_selected.clear()
        build_genres_panel()
        try:
            edit_genre_cb['values'] = genres
        except Exception:
            pass
        if filter_panel.winfo_ismapped():
            build_filter_panel()
    
    def g_add_new():
        name = simpledialog.askstring('添加流派', '请输入流派名称：')
        if not name:
            return
        name = name.strip()
        if name in genres:
            messagebox.showwarning('提示', '该流派已存在')
            return
        genres.append(name)
        save_json_file(GENRES_FILE, genres)
        build_genres_panel()
        try:
            edit_genre_cb['values'] = genres
        except Exception:
            pass
        if filter_panel.winfo_ismapped():
            build_filter_panel()
    
    btn_row1 = Frame(genres_panel, bg=PANEL_BG)
    btn_row1.pack(fill=tk.X, pady=(6, 6), padx=8)
    
    ttk.Button(btn_row1, text='全选', command=g_select_all).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(btn_row1, text='添加', command=g_add_new).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(btn_row1, text='删除选中', command=g_delete_selected, style='Danger.TButton').pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

def open_genre_editor(name):
    """Open the genre editor for the given genre name."""
    editor_mode.set('流派编辑')
    playlist_panel.pack_forget()
    playlist_editor_panel.pack_forget()
    song_edit_panel.pack_forget()
    filter_panel.pack_forget()
    blocks_panel.pack_forget()
    genres_panel.pack_forget()
    settings_panel.pack_forget()
    block_editor_panel.pack_forget()
    build_genre_editor(name)
    genre_editor_panel.pack(fill=tk.BOTH, expand=True)

def build_genre_editor(name):
    for w in genre_editor_panel.winfo_children():
        w.destroy()
    
    header = Frame(genre_editor_panel, bg=ACCENT)
    header.pack(fill=tk.X, pady=0)
    back_btn = ttk.Button(header, text='✕', width=3, command=lambda: switch_editor('流派'))
    back_btn.pack(side=tk.LEFT, padx=6, pady=4)
    tk.Label(header, text=f"🎶 流派：{name}", font=FONT_TITLE, bg=ACCENT, fg='white').pack(side=tk.LEFT, pady=4)

    # collect songs in this genre
    songs = [p for p, ud in ratings.items() if ud.get('genre', '') == name]
    genre_order = songs.copy()

    # selection state
    ge_drag = {"widget": None, "index": None}
    genre_selected = set()

    lb = Listbox(genre_editor_panel, width=40, height=12, bg=CARD_BG, fg=TEXT, selectbackground=ACCENT)
    lb.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

    def refresh_genre_listbox():
        lb.delete(0, 'end')
        for p in genre_order:
            title = load_song_info(p).get('title') or os.path.basename(p)
            lb.insert(END, title)
        try:
            lb.select_clear(0, 'end')
        except:
            pass
        for idx in list(genre_selected):
            if 0 <= idx < len(genre_order):
                try:
                    lb.selection_set(idx)
                except:
                    pass

    def ge_on_button_press(event):
        idx = lb.nearest(event.y)
        if idx >= 0:
            ge_drag['widget'] = lb
            ge_drag['index'] = idx

    def ge_on_motion(event):
        w = ge_drag.get('widget')
        if not w:
            return
        idx = w.nearest(event.y)
        try:
            w.selection_clear(0, 'end')
            w.selection_set(idx)
        except:
            pass

    def ge_on_button_release(event):
        src = ge_drag.get('index')
        w = ge_drag.get('widget')
        if w is None or src is None:
            return
        dst = w.nearest(event.y)
        if dst < 0 or dst == src:
            ge_drag['widget'] = None
            ge_drag['index'] = None
            return
        item = genre_order.pop(src)
        genre_order.insert(dst, item)
        refresh_genre_listbox()
        ge_drag['widget'] = None
        ge_drag['index'] = None

    def ge_toggle_selection(event):
        idx = lb.nearest(event.y)
        if idx < 0:
            return 'break'
        if idx in genre_selected:
            genre_selected.remove(idx)
            try:
                lb.selection_clear(idx)
            except:
                pass
        else:
            genre_selected.add(idx)
            try:
                lb.selection_set(idx)
            except:
                pass
        ge_on_button_press(event)
        return 'break'

    lb.bind('<Button-1>', ge_toggle_selection)
    lb.bind('<B1-Motion>', ge_on_motion)
    lb.bind('<ButtonRelease-1>', ge_on_button_release)

    # Two rows of buttons
    ge_btn_row1 = Frame(genre_editor_panel, bg=PANEL_BG)
    ge_btn_row1.pack(fill=tk.X, pady=(6, 2), padx=8)
    
    ge_btn_row2 = Frame(genre_editor_panel, bg=PANEL_BG)
    ge_btn_row2.pack(fill=tk.X, pady=(2, 6), padx=8)

    ge_select_state = {'all': False}

    def ge_select_all():
        nonlocal genre_selected
        if ge_select_state['all']:
            genre_selected.clear()
            ge_select_state['all'] = False
        else:
            genre_selected.clear()
            for i in range(len(genre_order)):
                genre_selected.add(i)
            ge_select_state['all'] = True
        refresh_genre_listbox()

    def ge_remove_selected():
        nonlocal genre_order, genre_selected
        if not genre_selected:
            messagebox.showwarning('未选择', '请先选择要移除的曲目')
            return
        indices = sorted(list(genre_selected), reverse=True)
        for idx in indices:
            if 0 <= idx < len(genre_order):
                p = genre_order.pop(idx)
                ud = ratings.get(p, {})
                if ud.get('genre') == name:
                    ud['genre'] = ''
                    ratings[p] = ud
        save_ratings(ratings)
        genre_selected.clear()
        refresh_genre_listbox()

    def ge_add_to_playlist():
        nonlocal genre_order, genre_selected
        if not genre_selected:
            messagebox.showwarning('未选择', '请先选择要添加的曲目')
            return
        paths = [genre_order[i] for i in sorted(list(genre_selected)) if 0 <= i < len(genre_order)]
        added = 0
        for p in paths:
            if p not in playlist:
                playlist.append(p)
                added += 1
        if added:
            update_playlist_listbox()
        pl_select_state['all'] = False
        messagebox.showinfo('已添加', f'已将 {added} 首曲目添加到播放列表')

    def ge_add_from_left_sidebar():
        nonlocal genre_order, genre_selected
        if not selected_paths:
            messagebox.showwarning('未选择', '请先在左边栏选择要添加的曲目')
            return
        added = 0
        for p in list(selected_paths):
            if p not in genre_order:
                genre_order.append(p)
                ud = ratings.get(p, {})
                ud['genre'] = name
                ratings[p] = ud
                added += 1
        if added:
            save_ratings(ratings)
            song_info_cache.clear()
            refresh_genre_listbox()
            messagebox.showinfo('已添加', f'已将 {added} 首曲目添加到流派')

    ttk.Button(ge_btn_row1, text='全选', command=ge_select_all).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(ge_btn_row1, text='移除选中', command=ge_remove_selected).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

    ttk.Button(ge_btn_row2, text='添加到歌单', command=ge_add_to_playlist).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(ge_btn_row2, text='从左边栏添加', command=ge_add_from_left_sidebar).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

    refresh_genre_listbox()


# ===== 播放列表功能函数 (在按钮之前定义) =====
def remove_from_playlist():
    global current_playlist_index, stopped, paused
    if playlist_selected:
        indices = sorted(list(playlist_selected), reverse=True)
    else:
        if current_playlist_index != -1 and 0 <= current_playlist_index < len(playlist):
            indices = [current_playlist_index]
        else:
            return
    
    # 检查是否删除了正在播放的歌曲
    currently_playing_deleted = False
    if not stopped and 0 <= current_playlist_index < len(playlist):
        current_song_path = playlist[current_playlist_index]
        for idx in indices:
            if 0 <= idx < len(playlist) and playlist[idx] == current_song_path:
                currently_playing_deleted = True
                break
    
    for idx in indices:
        if 0 <= idx < len(playlist):
            try:
                playlist.pop(idx)
            except Exception:
                pass
    
    if not playlist:
        try:
            player.stop()
        except Exception:
            pass
        stopped = True
        paused = False
        current_playlist_index = -1
        update_playlist_listbox()
        update_ui_for_current_song()
        update_play_button()
        playlist_selected.clear()
    else:
        if currently_playing_deleted:
            # 删除了正在播放的歌，自动播放下一首
            if current_playlist_index >= len(playlist):
                current_playlist_index = len(playlist) - 1
            # 调用 next_song 逻辑（但不改变历史记录）
            # 直接播放当前位置的歌
            play_file(playlist[current_playlist_index], add_to_history=False)
        else:
            if current_playlist_index >= len(playlist):
                current_playlist_index = len(playlist) - 1
        playlist_selected.clear()
        update_playlist_listbox()
        update_ui_for_current_song()

def pl_select_all():
    if pl_select_state['all']:
        playlist_selected.clear()
        pl_select_state['all'] = False
    else:
        playlist_selected.clear()
        for i in range(len(playlist)):
            playlist_selected.add(i)
        pl_select_state['all'] = True
    update_playlist_listbox()

def save_playlist():
    name = simpledialog.askstring("保存歌单", "请输入歌单名称：")
    if name:
        save_current_playlist(name)

def clear_playlist():
    global playlist, current_playlist_index, stopped, paused, list_seq_played_index
    if messagebox.askyesno("清空列表", "确认清空当前播放列表吗？"):
        playlist.clear()
        current_playlist_index = -1
        list_seq_played_index = -1
        player.stop()
        stopped = True
        paused = False
        update_playlist_listbox()
        update_ui_for_current_song()
        update_play_button()

# --- 播放列表面板 ---
header_playlist = tk.Frame(playlist_panel, bg=ACCENT)
header_playlist.pack(fill=tk.X, pady=0)
tk.Label(header_playlist, text="▶️ 当前播放列表", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)

# Button rows FIRST so they get space (must pack before expand=True canvas)
playlist_btn_row1 = Frame(playlist_panel, bg=PANEL_BG)
playlist_btn_row1.pack(fill=tk.X, pady=(6, 2), padx=8)

playlist_btn_row2 = Frame(playlist_panel, bg=PANEL_BG)
playlist_btn_row2.pack(fill=tk.X, pady=(2, 6), padx=8)

ttk.Button(playlist_btn_row1, text='全选', command=pl_select_all).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
ttk.Button(playlist_btn_row1, text='移除选中', command=remove_from_playlist).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

ttk.Button(playlist_btn_row2, text='💾 保存到歌单', command=save_playlist).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
ttk.Button(playlist_btn_row2, text='🗑 清空列表', command=clear_playlist).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

# Canvas-based playlist display (matches song library appearance) - pack AFTER buttons
playlist_canvas = Canvas(playlist_panel, bg=PANEL_BG, highlightthickness=0)
playlist_scrollbar = ttk.Scrollbar(playlist_panel, orient='vertical', command=playlist_canvas.yview)
playlist_canvas.configure(yscrollcommand=playlist_scrollbar.set)
playlist_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
playlist_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, pady=2)

# Scrollable frame inside canvas
playlist_scrollable_frame = Frame(playlist_canvas, bg=PANEL_BG)
playlist_canvas.create_window((0, 0), window=playlist_scrollable_frame, anchor='nw')
playlist_scrollable_frame.bind('<Configure>', lambda e: playlist_canvas.configure(scrollregion=playlist_canvas.bbox('all')))
def _pl_resize(event):
    playlist_canvas.itemconfig(1, width=event.width)
playlist_canvas.bind('<Configure>', _pl_resize)
def _pl_mousewheel(event):
    playlist_canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')
    return 'break'
playlist_canvas.bind('<MouseWheel>', _pl_mousewheel)
playlist_scrollable_frame.bind('<MouseWheel>', _pl_mousewheel)

# Playlist row storage
playlist_rows = []
playlist_selected = set()
pl_select_state = {'all': False}

# Drag-reorder state
_drag = {"widget": None, "drag_idx": None, "start_y": 0, "orig_idx": None, "target_idx": None}

def _pl_apply_selection_color(row, selected):
    """Apply/remove selection highlight to playlist row."""
    bg = ACCENT if selected else getattr(row, 'original_bg', CARD_BG)
    # 同时更新 row Frame 自身背景，确保高光覆盖整行
    try:
        row.config(bg=bg)
    except Exception:
        pass
    for c in row.winfo_children():
        if not getattr(c, 'is_color_indicator', False):
            try:
                c.config(bg=bg)
            except:
                pass

def update_playlist_listbox():
    """Refresh playlist display with Frame-based rows matching library style."""
    global playlist_rows
    
    # 循环模式强制首位检查（3c）：渲染前先确保正在播放的歌在第一位
    enforce_loop_mode_position()
    
    # Clear old rows
    for r in playlist_rows:
        r.destroy()
    playlist_rows.clear()
    
    for idx, filepath in enumerate(playlist):
        row_bg = CARD_BG if idx % 2 == 0 else CARD_ALTERNATE
        row = Frame(playlist_scrollable_frame, bg=row_bg, pady=1)
        row.path = filepath
        row.original_bg = row_bg
        row.pack(fill=tk.X, padx=5)
        
        # display_name 从 get_cached_title 获取（歌手 - 歌名），隐藏歌手时仅显示歌名
        if artist_hidden_default:
            info = load_song_info(filepath)
            display_name = info.get('title', os.path.basename(filepath))
        else:
            display_name = get_cached_title(filepath)
        if not display_name:
            display_name = os.path.basename(filepath)
        
        # Block color bar
        block_name = ratings.get(filepath, {}).get('block', '')
        block_color = get_block_color(block_name) if block_name else '#1e3a8a'
        color_bar = Frame(row, bg=block_color, height=6)
        color_bar.pack(side=tk.BOTTOM, fill=tk.X)
        color_bar.is_color_indicator = True
        
        lbl = Label(row, text=display_name, anchor="w", bg=row_bg, fg=TEXT,
                    font=FONT_MAIN, padx=5)
        lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # Score badge
        score = float(ratings.get(filepath, {}).get('score', 0))
        score_widgets = [lbl]
        if score != 0.0:
            color = score_to_color(score)
            score_lbl = Label(row, text=f"★{score:.1f}", bg=row_bg, fg=color, font=FONT_MAIN)
            score_lbl.pack(side=tk.RIGHT, padx=(0,4), pady=6)
            score_widgets.append(score_lbl)
        
        # Hover effect that respects playlist_selected
        def _pl_hover_enter(e, i=idx, r=row, widgets=score_widgets):
            if i in playlist_selected:
                return
            r.config(bg=CARD_HOVER)
            for w in widgets:
                if not getattr(w, 'is_color_indicator', False):
                    w.config(bg=CARD_HOVER)
        def _pl_hover_leave(e, i=idx, r=row, bg=row_bg, widgets=score_widgets):
            if i in playlist_selected:
                _pl_apply_selection_color(r, True)
                return
            r.config(bg=bg)
            for w in widgets:
                if not getattr(w, 'is_color_indicator', False):
                    w.config(bg=bg)
        
        for w in [row] + score_widgets:
            w.bind('<Enter>', _pl_hover_enter, add='+')
            w.bind('<Leave>', _pl_hover_leave, add='+')
        
        # Current playing: blue text
        if idx == current_playlist_index and not stopped:
            try:
                lbl.config(fg=ACCENT)
            except:
                pass
        
        # Restore selection state
        if idx in playlist_selected:
            _pl_apply_selection_color(row, True)
        
        # === WHOLE-ROW BINDINGS (click, drag, dbl-click) ===
        pl_widgets = [row] + list(row.winfo_children())
        
        # Left-click: toggle selection + prepare drag
        def _pl_press(e, i=idx, r=row):
            if i in playlist_selected:
                playlist_selected.remove(i)
                _pl_apply_selection_color(r, False)
            else:
                playlist_selected.add(i)
                _pl_apply_selection_color(r, True)
            pl_select_state['all'] = len(playlist_selected) == len(playlist)
            # Prepare drag: 记录拖拽起始位置，但不立即交换
            _drag['widget'] = r
            _drag['drag_idx'] = i
            _drag['orig_idx'] = i
            _drag['target_idx'] = i
            _drag['start_y'] = e.y_root
            return 'break'
        
        # B1-Motion: 拖拽过程中只记录目标位置，不做实际交换
        def _pl_drag(e):
            if _drag.get('orig_idx') is None:
                return 'break'
            scroll_y = playlist_scrollable_frame.winfo_rooty()
            target_y = e.y_root - scroll_y
            new_target = None
            for ri, pr in enumerate(playlist_rows):
                y = pr.winfo_y()
                h = pr.winfo_height()
                if y <= target_y <= y + h:
                    new_target = ri
                    break
            
            # 如果目标位置与之前记录的不同，更新视觉效果
            if new_target is not None and new_target != _drag.get('target_idx'):
                # 还原上一个目标行的视觉
                old_target = _drag.get('target_idx')
                if old_target is not None and old_target < len(playlist_rows):
                    try:
                        old_r = playlist_rows[old_target]
                        old_r.config(bg=getattr(old_r, 'original_bg', CARD_BG))
                    except Exception:
                        pass
                # 高亮新目标行
                if new_target < len(playlist_rows):
                    try:
                        new_r = playlist_rows[new_target]
                        new_r.config(bg='#5a7fd9')  # 目标位置高亮色
                    except Exception:
                        pass
                _drag['target_idx'] = new_target
            
            return 'break'
        
        def _pl_release(e):
            global current_playlist_index
            orig = _drag.get('orig_idx')
            target = _drag.get('target_idx')
            
            # 清除拖拽高亮
            if target is not None and target < len(playlist_rows):
                try:
                    target_row = playlist_rows[target]
                    target_row.config(bg=getattr(target_row, 'original_bg', CARD_BG))
                except Exception:
                    pass
            
            loop_insert_triggered = False  # 标记是否触发了循环模式插入保护
            
            if orig is not None and target is not None and target != orig:
                dragged_item = playlist[orig]
                current_song = playlist[current_playlist_index] if 0 <= current_playlist_index < len(playlist) else None
                
                # 循环模式下：如果把非正在播放的歌拖到第一位，则移到第二位并执行下一首
                if play_mode == "list_loop" and target == 0 and not stopped and dragged_item != current_song:
                    # 不放到第一位，改为放到第二位
                    target = 1
                    loop_insert_triggered = True
                
                # 仅在松开时做一次 pop+insert，保持其他歌曲相对顺序
                item = playlist.pop(orig)
                playlist.insert(target, item)
                
                # 修复播放索引
                if current_playlist_index == orig:
                    current_playlist_index = target
                elif orig < target and orig < current_playlist_index <= target:
                    current_playlist_index -= 1
                elif target < orig and target <= current_playlist_index < orig:
                    current_playlist_index += 1
                
                # 拖拽后清除所有选中（拖拽不应保留选中状态）
                playlist_selected.clear()
                update_playlist_listbox()
                
                # 循环模式下插入到第二位后，执行下一首
                if loop_insert_triggered:
                    root.after(50, next_song)
            
            # 重置拖拽状态
            _drag['widget'] = None
            _drag['drag_idx'] = None
            _drag['orig_idx'] = None
            _drag['target_idx'] = None
            _drag['start_y'] = 0
            return 'break'
        
        # Double-click: play
        def _pl_dbl(e, p=filepath):
            play_file(p, add_to_history=False)
            return 'break'
        
        for w in pl_widgets:
            w.bind('<Button-1>', _pl_press, add='+')
            w.bind('<B1-Motion>', _pl_drag, add='+')
            w.bind('<ButtonRelease-1>', _pl_release, add='+')
            w.bind('<Double-Button-1>', _pl_dbl, add='+')
            # Forward mousewheel to canvas
            w.bind('<MouseWheel>', _pl_mousewheel, add='+')
        
        playlist_rows.append(row)
    
    # Scroll to current playing song
    if current_playlist_index != -1 and 0 <= current_playlist_index < len(playlist_rows):
        try:
            row = playlist_rows[current_playlist_index]
            playlist_canvas.yview_moveto(row.winfo_y() / max(playlist_scrollable_frame.winfo_height(), 1))
        except:
            pass


def enforce_loop_mode_position():
    """循环模式下，强制当前播放的歌曲保持在列表第一位（仅修改数据，不触发渲染）"""
    global current_playlist_index
    if play_mode != "list_loop":
        return
    if stopped:
        return
    if not playlist:
        return
    if current_playlist_index == 0:
        return  # 已经在第一位
    
    # 正在播放的歌不在第一位，强制移到第一位（保持其他歌曲相对顺序不变）
    if 0 <= current_playlist_index < len(playlist):
        current_song = playlist.pop(current_playlist_index)
        playlist.insert(0, current_song)
        current_playlist_index = 0

# --- 歌单面板 ---
header_editor = tk.Frame(playlist_editor_panel, bg=ACCENT)
header_editor.pack(fill=tk.X, pady=0)
tk.Label(header_editor, text="📋 已保存的歌单", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)
playlist_editor_listbox = Listbox(playlist_editor_panel, width=25, height=12, exportselection=False,
                                  font=FONT_MAIN, bg=CARD_BG, fg=TEXT,
                                  selectbackground=ACCENT, selectforeground="white",
                                  highlightthickness=0, bd=0)
playlist_editor_listbox.pack(fill=tk.BOTH, expand=True, pady=5)

# maintain in-session order for playlist files
playlist_editor_order = []
def refresh_playlist_editor():
    global playlist_editor_order
    files = get_playlist_files()
    # initialize or sync order list
    if not playlist_editor_order or set(playlist_editor_order) != set(files):
        playlist_editor_order = files.copy()
    playlist_editor_listbox.delete(0, END)
    for f in playlist_editor_order:
        name = os.path.splitext(os.path.basename(f))[0]
        playlist_editor_listbox.insert(END, name)

def add_playlist_to_queue():
    selection = playlist_editor_listbox.curselection()
    if selection:
        idx = selection[0]
        filepath = get_playlist_files()[idx]
        songs = load_playlist(filepath)
        for s in songs:
            if s not in playlist:
                playlist.append(s)
        update_playlist_listbox()

def delete_selected_playlist():
    sel = playlist_editor_listbox.curselection()
    if not sel:
        messagebox.showwarning('未选择', '请先选择一个歌单')
        return
    idx = sel[0]
    filepath = playlist_editor_order[idx]
    if messagebox.askyesno('删除歌单', f'确认删除歌单：{os.path.basename(filepath)} ?'):
        try:
            os.remove(filepath)
        except Exception as e:
            messagebox.showerror('错误', f'删除失败：{e}')
        refresh_playlist_editor()

playlist_editor_bottom = Frame(playlist_editor_panel, bg=PANEL_BG)
playlist_editor_bottom.pack(fill=tk.X, pady=8, padx=8)

ttk.Button(playlist_editor_bottom, text="▶ 添加到列表", command=add_playlist_to_queue).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
ttk.Button(playlist_editor_bottom, text="🗑 删除歌单", command=delete_selected_playlist, style='Danger.TButton').pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

# 歌单列表拖拽换序（仅会话内保存顺序）
pe_drag = {"widget": None, "index": None}
def pe_on_button_press(event):
    lb = event.widget
    idx = lb.nearest(event.y)
    if idx >= 0:
        pe_drag['widget'] = lb
        pe_drag['index'] = idx

def pe_on_motion(event):
    lb = pe_drag.get('widget')
    if not lb:
        return
    idx = lb.nearest(event.y)
    try:
        lb.selection_clear(0, END)
        lb.selection_set(idx)
    except:
        pass

def pe_on_button_release(event):
    lb = pe_drag.get('widget')
    src = pe_drag.get('index')
    if lb is None or src is None:
        return
    dst = lb.nearest(event.y)
    if dst < 0 or dst == src:
        pe_drag['widget'] = None
        pe_drag['index'] = None
        return
    global playlist_editor_order
    item = playlist_editor_order.pop(src)
    playlist_editor_order.insert(dst, item)
    refresh_playlist_editor()
    pe_drag['widget'] = None
    pe_drag['index'] = None

playlist_editor_listbox.bind('<Button-1>', pe_on_button_press)
playlist_editor_listbox.bind('<B1-Motion>', pe_on_motion)
playlist_editor_listbox.bind('<ButtonRelease-1>', pe_on_button_release)

# --- 歌曲编辑面板 ---
edit_current_file = None
edit_title_var = tk.StringVar()
edit_artist_var = tk.StringVar()
edit_score_var = tk.DoubleVar(value=0.0)
edit_cover_path_var = tk.StringVar()
edit_note_var = tk.StringVar()
edit_genre_var = tk.StringVar()
edit_block_var = tk.StringVar()
edit_comment_var = tk.StringVar()

# 创建可滚动画布
song_edit_canvas = Canvas(song_edit_panel, bg=PANEL_BG, highlightthickness=0)
song_edit_scrollbar = ttk.Scrollbar(song_edit_panel, orient='vertical', command=song_edit_canvas.yview)
song_edit_canvas.configure(yscrollcommand=song_edit_scrollbar.set)
song_edit_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
song_edit_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

song_edit_container = Frame(song_edit_canvas, bg=PANEL_BG)
song_edit_canvas.create_window((0, 0), window=song_edit_container, anchor='nw')
song_edit_container.bind('<Configure>', lambda e: song_edit_canvas.configure(scrollregion=song_edit_canvas.bbox('all')))
# Dynamically resize container width to match canvas width
def _se_resize(event):
    song_edit_canvas.itemconfig(1, width=event.width)
song_edit_canvas.bind('<Configure>', _se_resize)
# Bind mousewheel to canvas
def _se_mousewheel(event):
    song_edit_canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')
    return 'break'
song_edit_canvas.bind('<MouseWheel>', _se_mousewheel)
song_edit_container.bind('<MouseWheel>', _se_mousewheel)

# Enhanced header
tk.Label(song_edit_container, text="✏️ 歌曲编辑", font=FONT_TITLE,
         bg=ACCENT, fg='white').pack(fill=tk.X, pady=0)

# 封面区域
cover_frame = Frame(song_edit_container, bg=PANEL_BG)
cover_frame.pack(pady=8)
edit_cover_label = tk.Label(cover_frame, text="无封面", bg=CARD_BG, fg=TEXT,
                       width=15, height=7, relief='solid', bd=1)
edit_cover_label.pack()
cover_btn = ttk.Button(cover_frame, text="更换封面", command=choose_cover_image, style='Small.TButton')
cover_btn.pack(pady=(4, 0))

# 基本信息分组
basic_frame = ttk.LabelFrame(song_edit_container, text="基本信息", padding=8)
basic_frame.pack(fill=tk.X, padx=8, pady=4)

row1 = Frame(basic_frame, bg=PANEL_BG)
row1.pack(fill=tk.X, pady=3)
Label(row1, text="歌名：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
Entry(row1, textvariable=edit_title_var, font=FONT_MAIN, width=22, bg='#111111', fg=TEXT, insertbackground='white', relief='solid', bd=1).pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

row2 = Frame(basic_frame, bg=PANEL_BG)
row2.pack(fill=tk.X, pady=3)
Label(row2, text="歌手：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
Entry(row2, textvariable=edit_artist_var, font=FONT_MAIN, width=22, bg='#111111', fg=TEXT, insertbackground='white', relief='solid', bd=1).pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

row3 = Frame(basic_frame, bg=PANEL_BG)
row3.pack(fill=tk.X, pady=3)
Label(row3, text="评分：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
Spinbox(row3, from_=0.0, to=10.0, increment=0.1, textvariable=edit_score_var, width=6,
        bg='#111111', fg=TEXT, buttonbackground=CARD_BG, relief='solid', bd=1,
        readonlybackground='#111111').pack(side=tk.LEFT, padx=5)

# 标签分组
tags_frame = ttk.LabelFrame(song_edit_container, text="标签信息", padding=8)
tags_frame.pack(fill=tk.X, padx=8, pady=4)

row4 = Frame(tags_frame, bg=PANEL_BG)
row4.pack(fill=tk.X, pady=3)
Label(row4, text="备注：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
Entry(row4, textvariable=edit_note_var, font=FONT_MAIN, width=24, bg='#111111', fg=TEXT, insertbackground='white', relief='solid', bd=1).pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

row5 = Frame(tags_frame, bg=PANEL_BG)
row5.pack(fill=tk.X, pady=3)
Label(row5, text="流派：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
edit_genre_cb = ttk.Combobox(row5, values=genres, textvariable=edit_genre_var, width=18, style='Black.TCombobox')
edit_genre_cb.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

row6 = Frame(tags_frame, bg=PANEL_BG)
row6.pack(fill=tk.X, pady=3)
Label(row6, text="块：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
block_names = [b.get('name') if isinstance(b, dict) else b for b in blocks]
edit_block_cb = ttk.Combobox(row6, values=block_names, textvariable=edit_block_var, width=18, style='Black.TCombobox')
edit_block_cb.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

row7 = Frame(tags_frame, bg=PANEL_BG)
row7.pack(fill=tk.X, pady=3)
Label(row7, text="评论：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=5, anchor='w').pack(side=tk.LEFT)
Entry(row7, textvariable=edit_comment_var, font=FONT_MAIN, width=28, bg='#111111', fg=TEXT, insertbackground='white', relief='solid', bd=1).pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

# 网易云绑定分组
netease_frame = ttk.LabelFrame(song_edit_container, text="网易云音乐", padding=8)
netease_frame.pack(fill=tk.X, padx=8, pady=4)

netease_bind_var = tk.StringVar()

row_n1 = Frame(netease_frame, bg=PANEL_BG)
row_n1.pack(fill=tk.X, pady=3)
Label(row_n1, text="绑定ID：", bg=PANEL_BG, fg=TEXT, font=FONT_MAIN, width=7, anchor='w').pack(side=tk.LEFT)
Entry(row_n1, textvariable=netease_bind_var, font=FONT_MAIN, width=20,
      bg='#111111', fg=TEXT, insertbackground='white', relief='solid', bd=1).pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

netease_btn_row = Frame(netease_frame, bg=PANEL_BG)
netease_btn_row.pack(fill=tk.X, pady=(4, 0))

def netease_do_bind():
    if not playlist or current_playlist_index == -1:
        messagebox.showwarning('提示', '请先播放一首歌曲')
        return
    val = netease_bind_var.get().strip()
    if not val:
        messagebox.showwarning('提示', '请输入网易云歌曲链接或ID')
        return
    nid = netease_extract_song_id(val)
    if not nid:
        messagebox.showerror('错误', '无法识别的链接，请输入纯数字ID或完整URL')
        return
    info = netease_get_song_info(nid)
    if not info:
        messagebox.showerror('错误', f'无法找到ID为 {nid} 的歌曲')
        return
    cp = playlist[current_playlist_index]
    bind_netease_song(cp, nid)
    netease_bind_var.set(nid)
    messagebox.showinfo('绑定成功', f'已绑定到: {info["name"]} - {info["artists"]}')

def netease_do_unbind():
    if not playlist or current_playlist_index == -1:
        return
    cp = playlist[current_playlist_index]
    if not get_netease_song_id(cp):
        messagebox.showinfo('提示', '当前歌曲未绑定')
        return
    unbind_netease_song(cp)
    netease_bind_var.set("")
    messagebox.showinfo('已解除', '已解除网易云绑定')

def netease_import_lyrics():
    if not playlist or current_playlist_index == -1:
        messagebox.showwarning('提示', '请先播放一首歌曲')
        return
    cp = playlist[current_playlist_index]
    nid = get_netease_song_id(cp)
    if not nid:
        val = netease_bind_var.get().strip()
        nid = netease_extract_song_id(val)
    if not nid:
        messagebox.showwarning('提示', '请先绑定网易云ID，或在输入框中填入ID')
        return

    def _do_import():
        lrc_tuple = netease_fetch_lyrics(nid)
        root.after(0, lambda: _on_import_done(lrc_tuple))
    def _on_import_done(lrc_tuple):
        if not lrc_tuple:
            messagebox.showerror('错误', '未找到该歌曲的歌词')
            return
        song_info = load_song_info(cp)
        song_title = song_info.get('title', os.path.splitext(os.path.basename(cp))[0])
        artist = song_info.get('artist', '')
        _save_netease_lyrics(cp, lrc_tuple, artist, song_title)
        song_info_cache.pop(cp, None)
        update_ui_for_current_song()
        messagebox.showinfo('导入成功', '歌词已导入并解析。')

    threading.Thread(target=_do_import, daemon=True).start()

def netease_auto_bind():
    """根据当前歌曲的歌手+歌名自动搜索并绑定网易云ID"""
    if not playlist or current_playlist_index == -1:
        messagebox.showwarning('提示', '请先播放一首歌曲')
        return
    cp = playlist[current_playlist_index]
    info = load_song_info(cp)
    title = info.get('title', '')
    artist = info.get('artist', '未知歌手')
    keyword = f"{artist} {title}".strip()
    if not keyword:
        messagebox.showwarning('提示', '无法读取歌曲信息')
        return

    def _search():
        results = netease_search_song(keyword, limit=1)
        root.after(0, lambda: _on_search_done(results))
    def _on_search_done(results):
        if not results:
            title2 = info.get('title', '')
            def _retry():
                r2 = netease_search_song(title2, limit=1)
                root.after(0, lambda: _on_retry(r2))
            def _on_retry(r2):
                if r2:
                    r = r2[0]
                    bind_netease_song(cp, r['id'])
                    netease_bind_var.set(r['id'])
                    messagebox.showinfo('自动绑定成功',
                        f"已绑定到: {r['name']} - {r['artists']}\n(ID: {r['id']})")
                else:
                    messagebox.showwarning('未找到',
                        f'搜索 "{info.get("title", keyword)}" 未找到匹配的网易云歌曲，请手动输入ID')
            threading.Thread(target=_retry, daemon=True).start()
            return
        r = results[0]
        bind_netease_song(cp, r['id'])
        netease_bind_var.set(r['id'])
        messagebox.showinfo('自动绑定成功',
            f"已绑定到: {r['name']} - {r['artists']}\n(ID: {r['id']})")

    threading.Thread(target=_search, daemon=True).start()

def netease_import_cover_for_current():
    """从网易云导入封面，保存为本地图片文件（不嵌入音频文件），ratings中记录路径"""
    filepath = edit_current_file
    if not filepath:
        messagebox.showwarning('提示', '请先在歌曲编辑中加载一首歌曲')
        return
    if not playlist or current_playlist_index == -1:
        messagebox.showwarning('提示', '请先播放一首歌曲')
        return
    cp = playlist[current_playlist_index]
    nid = get_netease_song_id(cp)
    if not nid:
        val = netease_bind_var.get().strip()
        nid = netease_extract_song_id(val)
    if not nid:
        messagebox.showwarning('提示', '请先绑定网易云ID')
        return
    info = netease_get_song_info(nid)
    if not info or not info.get('cover_url'):
        messagebox.showerror('错误', '无法获取封面信息')
        return
    def _dl():
        # 封面保存到 source/cover_{netease_id}.jpg
        cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
        os.makedirs(cover_dir, exist_ok=True)
        cover_path = os.path.join(cover_dir, f'{nid}.jpg')
        ok = netease_fetch_cover(nid, cover_path)
        root.after(0, lambda: _done(cover_path, ok))
    def _done(cover_path, ok):
        if not ok:
            messagebox.showerror('错误', '下载封面失败')
            return
        try:
            # 保存封面路径到ratings（本地文件优先）
            ratings[filepath] = {**ratings.get(filepath, {}), 'cover': cover_path}
            save_ratings(ratings)
            song_info_cache.pop(filepath, None)
            if cp == filepath:
                update_ui_for_current_song()
            # 刷新封面显示
            edit_cover_path_var.set(cover_path)
            try:
                img = Image.open(cover_path)
                img = img.resize((120, 120), Image.Resampling.LANCZOS)
                photo = ImageTk.PhotoImage(img)
                edit_cover_label.config(image=photo, bg=BG_COLOR)
                edit_cover_label.image = photo
            except Exception:
                pass
            messagebox.showinfo('导入成功', f'封面已保存到本地:\n{os.path.basename(cover_path)}')
        except Exception as e:
            messagebox.showerror('错误', f'保存封面失败: {str(e)}')
    threading.Thread(target=_dl, daemon=True).start()

ttk.Button(netease_btn_row, text='🔗 绑定', command=netease_do_bind,
           style='Accent.TButton').pack(side=tk.LEFT, padx=(0, 4), fill=tk.X, expand=True)
ttk.Button(netease_btn_row, text='解除', command=netease_do_unbind).pack(
    side=tk.LEFT, padx=(4, 0), fill=tk.X, expand=True)
ttk.Button(netease_frame, text='🔍 自动绑定ID', command=netease_auto_bind,
           style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))
ttk.Button(netease_frame, text='📝 从网易云导入歌词', command=netease_import_lyrics,
           style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))
ttk.Button(netease_frame, text='🖼️ 从网易云导入封面', command=netease_import_cover_for_current,
           style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))

# 操作按钮分组
action_frame = Frame(song_edit_container, bg=PANEL_BG)
action_frame.pack(fill=tk.X, padx=8, pady=8)

save_edit_btn = ttk.Button(action_frame, text="💾 保存修改", command=save_edited_info, style='Accent.TButton')
save_edit_btn.pack(fill=tk.X, pady=2)

def load_current_song_to_editor():
    if not playlist or current_playlist_index == -1:
        # 播放列表为空时清除编辑器内容并显示空状态
        edit_title_var.set('')
        edit_artist_var.set('')
        edit_score_var.set(0.0)
        edit_note_var.set('')
        edit_genre_var.set('')
        edit_block_var.set('')
        edit_comment_var.set('')
        netease_bind_var.set('')
        edit_cover_path_var.set('')
        edit_cover_label.config(image='', bg=PANEL_BG, text='无封面')
        edit_current_file = None
        messagebox.showinfo('提示', '播放列表为空，请先添加歌曲到播放列表')
        return
    edit_song_info(playlist[current_playlist_index])
    # 回填网易云绑定ID
    cp = playlist[current_playlist_index]
    nid = get_netease_song_id(cp)
    netease_bind_var.set(nid if nid else "")

load_current_btn = ttk.Button(action_frame, text="📂 加载当前播放歌曲", command=load_current_song_to_editor)
load_current_btn.pack(fill=tk.X, pady=2)

lyrics_btn = ttk.Button(action_frame, text="📝 导入歌词(.lrc)", command=import_lyrics)
lyrics_btn.pack(fill=tk.X, pady=2)

clear_history_btn = ttk.Button(action_frame, text="🗑 清空播放历史", command=clear_play_history)
clear_history_btn.pack(fill=tk.X, pady=2)

delete_song_btn = ttk.Button(action_frame, text="❌ 删除歌曲", command=delete_current_song, style='Danger.TButton')
delete_song_btn.pack(fill=tk.X, pady=2)

import_btn = ttk.Button(action_frame, text="📥 导入歌曲", command=import_song_files)
import_btn.pack(fill=tk.X, pady=2)

# ==================== 网易云搜索面板 ====================
def build_netease_search_panel():
    """构建网易云搜索面板"""
    for w in netease_search_panel.winfo_children():
        w.destroy()

    # 可滚动画布
    ns_canvas = Canvas(netease_search_panel, bg=PANEL_BG, highlightthickness=0, bd=0)
    ns_scrollbar = ttk.Scrollbar(netease_search_panel, orient='vertical', command=ns_canvas.yview)
    ns_canvas.configure(yscrollcommand=ns_scrollbar.set)
    ns_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    ns_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    ns_container = Frame(ns_canvas, bg=PANEL_BG)
    ns_canvas.create_window((0, 0), window=ns_container, anchor='nw')
    ns_container.bind('<Configure>', lambda e: ns_canvas.configure(scrollregion=ns_canvas.bbox('all')))
    def _ns_resize(event):
        ns_canvas.itemconfig(1, width=event.width)
    ns_canvas.bind('<Configure>', _ns_resize)
    def _ns_mw(event):
        ns_canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')
        return 'break'
    ns_canvas.bind('<MouseWheel>', _ns_mw)
    ns_container.bind('<MouseWheel>', _ns_mw)

    # Header
    header = Frame(ns_container, bg=ACCENT)
    header.pack(fill=tk.X, pady=(0, 6))
    tk.Label(header, text="🔍 网易云搜索", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4)

    # 登录状态条
    login_bar = Frame(ns_container, bg=CARD_BG)
    login_bar.pack(fill=tk.X, padx=8, pady=(2, 6))
    login_icon = "✅" if netease_logged_in else "⚠️"
    login_text = "已登录 (可下载VIP歌曲)" if netease_logged_in else "未登录 (VIP歌曲可能无法下载，请到设置中登录)"
    ns_login_label = tk.Label(login_bar, text=f"{login_icon} {login_text}",
        bg=CARD_BG, fg='#00cc66' if netease_logged_in else '#ccaa44',
        font=('微软雅黑', 8), wraplength=340)
    ns_login_label.pack(padx=6, pady=3)

    # 搜索输入行
    search_frame = Frame(ns_container, bg=PANEL_BG)
    search_frame.pack(fill=tk.X, padx=8, pady=4)

    ns_keyword_var = tk.StringVar()
    ns_entry = Entry(search_frame, textvariable=ns_keyword_var, font=FONT_MAIN,
        bg='#111111', fg='white', insertbackground='white', relief='solid', bd=1)
    ns_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=3)
    ns_entry.bind('<Return>', lambda e: do_search())

    ttk.Button(search_frame, text='搜索', command=lambda: do_search(),
        style='Accent.TButton', width=8).pack(side=tk.RIGHT, padx=(4, 0))

    # 结果统计
    ns_status = tk.Label(ns_container, text="输入歌手、歌名或备注关键词搜索", bg=PANEL_BG,
        fg=MUTED, font=('微软雅黑', 9))
    ns_status.pack(fill=tk.X, padx=8, pady=2)

    # 结果列表容器
    ns_results = Frame(ns_container, bg=PANEL_BG)
    ns_results.pack(fill=tk.BOTH, expand=True, padx=4, pady=2)

    def do_search():
        kw = ns_keyword_var.get().strip()
        if not kw:
            return
        for w in ns_results.winfo_children():
            w.destroy()
        ns_status.config(text=f"正在搜索「{kw}」...", fg=ACCENT)
        root.update_idletasks()
        def _bg():
            songs = netease_search_song(kw, limit=30)
            root.after(0, lambda: _show(songs))
        def _show(songs):
            if not songs:
                ns_status.config(text=f"未找到「{kw}」的搜索结果", fg=MUTED)
                return
            ns_status.config(text=f"找到 {len(songs)} 首结果", fg='#00cc66')
            for i, s in enumerate(songs):
                row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
                card = Frame(ns_results, bg=row_bg)
                card.pack(fill=tk.X, pady=1, padx=2)

                # 第一行: 序号 + 歌名 + fee标签
                line1 = Frame(card, bg=row_bg)
                line1.pack(fill=tk.X, padx=6, pady=(4, 1))

                fee = s.get('fee', 0)
                fee_map = {0: ('免费', '#00cc66'), 1: ('VIP', '#e6a817'),
                           4: ('VIP', '#e6a817'), 8: ('付费', '#cc4444')}
                fee_label, fee_color = fee_map.get(fee, ('', MUTED))
                tk.Label(line1, text=f"#{i+1} {s['name']}", bg=row_bg, fg='white',
                    font=('微软雅黑', 10, 'bold'), anchor='w').pack(side=tk.LEFT)
                tk.Label(line1, text=fee_label, bg=row_bg, fg=fee_color,
                    font=('微软雅黑', 7, 'bold')).pack(side=tk.RIGHT, padx=(2, 0))

                # 第二行: 歌手 / ID + 复制按钮
                line2 = Frame(card, bg=row_bg)
                line2.pack(fill=tk.X, padx=6, pady=(0, 1))
                tk.Label(line2, text=f"👤 {s.get('artists', '')}  |  ID: {s['id']}",
                    bg=row_bg, fg=MUTED, font=('微软雅黑', 8)).pack(side=tk.LEFT)
                def _copy_id(sid=s['id']):
                    root.clipboard_clear()
                    root.clipboard_append(sid)
                    ns_status.config(text=f"已复制 ID: {sid}", fg='#00cc66')
                copy_btn = tk.Label(line2, text='📋', bg=row_bg, fg=ACCENT,
                    font=('微软雅黑', 9), cursor='hand2')
                copy_btn.pack(side=tk.RIGHT)
                copy_btn.bind('<Button-1>', lambda e, sid=s['id']: _copy_id(sid))

                # 第三行: 专辑 / 时长
                album = s.get('album', '')
                dur = s.get('duration', 0)
                dur = dur // 1000 if dur else 0
                dur_str = f"{dur//60}:{dur%60:02d}" if dur else "??:??"
                line3 = Frame(card, bg=row_bg)
                line3.pack(fill=tk.X, padx=6, pady=(0, 3))
                if album:
                    tk.Label(line3, text=f"💿 {album}",
                        bg=row_bg, fg=MUTED, font=('微软雅黑', 8)).pack(side=tk.LEFT)
                tk.Label(line3, text=f"⏱ {dur_str}",
                    bg=row_bg, fg='#555', font=('微软雅黑', 7)).pack(side=tk.RIGHT)

                # 下载按钮行
                dl_btn = ttk.Button(card, text='📥 下载(含歌词封面)', style='Small.TButton',
                    command=lambda nid=s['id'], name=s['name'], artists=s.get('artists',''):
                        _download_song(nid, name, artists))
                dl_btn.pack(fill=tk.X, padx=6, pady=(0, 4))

                # 双击卡片也可以下载
                for widget in [card, line1, line2, line3] + list(card.winfo_children()):
                    widget.bind('<Double-Button-1>',
                        lambda e, nid=s['id'], name=s['name'], artists=s.get('artists',''):
                            _download_song(nid, name, artists))

        threading.Thread(target=_bg, daemon=True).start()

    def _download_song(nid, name, artists):
        ns_status.config(text=f"正在下载: {name} - {artists}...", fg=ACCENT)
        root.update_idletasks()
        def _dl():
            ok, msg, info = netease_download_song(nid, MUSIC_DIR)
            lrc_ok = False
            saved_path = os.path.join(MUSIC_DIR, msg) if ok else None
            if ok:
                lrc_tuple = netease_fetch_lyrics(nid)
                if lrc_tuple:
                    _save_netease_lyrics(saved_path, lrc_tuple, artists, name)
                    lrc_ok = True
                # 自动绑定
                bind_netease_song(saved_path, nid)
                # 下载封面并设置到ratings
                cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                os.makedirs(cover_dir, exist_ok=True)
                cover_path = os.path.join(cover_dir, f'{nid}.jpg')
                if netease_fetch_cover(nid, cover_path):
                    ratings[saved_path] = {**ratings.get(saved_path, {}), 'cover': cover_path}
                    save_ratings(ratings)
                # 刷新库（延迟执行确保文件落盘）
                global audio_paths
                audio_paths = scan_audio_files(MUSIC_DIR)
                song_info_cache.clear()
                refresh_song_library()
            root.after(0, lambda: _done(ok, msg, name, artists, lrc_ok, saved_path))
        def _done(ok, msg, name, artists, lrc_ok, saved_path):
            if ok:
                txt = f"✅ {artists} - {name}\\n\\n已下载到 music 文件夹\\n✅ 已自动绑定网易云ID"
                if lrc_ok: txt += "\\n✅ 歌词已下载"
                txt += "\\n✅ 封面已下载"
                ns_status.config(text=f"✅ 下载完成: {name}", fg='#00cc66')
                messagebox.showinfo('下载完成', txt)
            else:
                ns_status.config(text=f"下载失败: {msg}", fg='#cc4444')
                messagebox.showerror('下载失败', f"{artists} - {name}\\n\\n{msg}")
        threading.Thread(target=_dl, daemon=True).start()

# ==================== 网易云音乐综合面板 ====================
def build_netease_panel():
    """构建网易云音乐综合面板：搜索 + 登录 + 账号信息 + 评论 + 导入"""
    for w in netease_panel.winfo_children():
        w.destroy()

    # 可滚动画布
    np_canvas = Canvas(netease_panel, bg=PANEL_BG, highlightthickness=0, bd=0)
    np_scrollbar = ttk.Scrollbar(netease_panel, orient='vertical', command=np_canvas.yview)
    np_canvas.configure(yscrollcommand=np_scrollbar.set)
    np_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    np_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    np_container = Frame(np_canvas, bg=PANEL_BG)
    np_canvas.create_window((0, 0), window=np_container, anchor='nw')
    np_container.bind('<Configure>', lambda e: np_canvas.configure(scrollregion=np_canvas.bbox('all')))
    def _np_resize(event):
        np_canvas.itemconfig(1, width=event.width)
    np_canvas.bind('<Configure>', _np_resize)
    def _np_mw(event):
        np_canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')
        return 'break'
    np_canvas.bind('<MouseWheel>', _np_mw)
    np_container.bind('<MouseWheel>', _np_mw)

    # ===== Header =====
    header = Frame(np_container, bg=ACCENT)
    header.pack(fill=tk.X, pady=(0, 6))
    tk.Label(header, text="🎵 网易云音乐", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)

    # ===== 账号信息区 =====
    account_group = ttk.LabelFrame(np_container, text="账号信息", padding=8)
    account_group.pack(fill=tk.X, padx=6, pady=4)

    avatar_label = tk.Label(account_group, bg=PANEL_BG, width=10, height=5)
    avatar_label.pack(pady=4)

    nick_label = tk.Label(account_group, text="未登录", font=('微软雅黑', 13, 'bold'), bg=PANEL_BG, fg=TEXT)
    nick_label.pack()

    vip_label = tk.Label(account_group, text="", font=('微软雅黑', 10), bg=PANEL_BG, fg='#888')
    vip_label.pack()

    phone_label = tk.Label(account_group, text="", font=('微软雅黑', 9), bg=PANEL_BG, fg='#888')
    phone_label.pack()

    def refresh_account_display():
        if not netease_logged_in:
            avatar_label.config(image='')
            nick_label.config(text="未登录", fg=TEXT)
            vip_label.config(text="请先登录以获取账号信息")
            phone_label.config(text="")
            return
        def _fetch():
            try:
                r = _api_post("/user/account")
                d = r.json()
                root.after(0, lambda: _show(d))
            except Exception as e:
                root.after(0, lambda: nick_label.config(text=f"获取失败: {e}", fg='#cc4444'))
        def _show(d):
            global netease_uid
            if _get_api_code(d) != 200:
                nick_label.config(text="登录状态异常", fg='#cc4444')
                return
            prof = d.get("profile") or {}
            acct = d.get("account") or {}
            nick = prof.get("nickname") or acct.get("userName", "用户")
            avatar_url = prof.get("avatarUrl") or ""
            uid = prof.get("userId") or acct.get("id") or ""
            netease_uid = uid  # 保存UID供其他功能使用
            vip = acct.get("vipType", 0)
            nick_label.config(text=nick, fg=TEXT)
            vip_text = ""
            if vip > 0:
                vip_years = acct.get("vipYears", 0)
                vip_text = f"👑 VIP{vip}" + (f" (第{vip_years}年)" if vip_years else "")
            else:
                vip_text = "非VIP用户"
            vip_label.config(text=vip_text)
            # 获取手机号
            if uid:
                try:
                    r2 = _api_get(f"/user/detail?uid={uid}")
                    d2 = r2.json()
                    if d2.get("code") == 200:
                        bindings = d2.get("bindings", d2.get("profile", {}).get("bindings", []))
                        for b in bindings:
                            if b.get("type") == 1 and b.get("url", "").startswith("tel:"):
                                phone_label.config(text=f"📱 绑定手机: {b['url'].replace('tel:','')}")
                                break
                except:
                    pass
            if avatar_url:
                threading.Thread(target=_load_avatar, args=(avatar_url,), daemon=True).start()
        def _load_avatar(url):
            try:
                session = _ensure_api_session()
                resp = session.get(url, timeout=10)
                img = Image.open(io.BytesIO(resp.content)).resize((64, 64), Image.Resampling.LANCZOS)
                tk_img = ImageTk.PhotoImage(img)
                root.after(0, lambda: (avatar_label.config(image=tk_img), setattr(avatar_label, 'image', tk_img)))
            except:
                pass
        threading.Thread(target=_fetch, daemon=True).start()

    btn_row = Frame(account_group, bg=PANEL_BG)
    btn_row.pack(fill=tk.X, pady=(4, 0))
    ttk.Button(btn_row, text='🔄 刷新', command=refresh_account_display).pack(side=tk.LEFT, padx=2, fill=tk.X, expand=True)
    ttk.Button(btn_row, text='🚪 退出', command=lambda: (netease_logout(), refresh_account_display())).pack(side=tk.LEFT, padx=2, fill=tk.X, expand=True)

    # ===== 登录区 =====
    login_group = ttk.LabelFrame(np_container, text="登录", padding=8)
    login_group.pack(fill=tk.X, padx=6, pady=4)

    login_notebook = ttk.Notebook(login_group)
    login_notebook.pack(fill=tk.X, pady=2)

    # Cookie 登录
    cookie_tab = Frame(login_notebook, bg=PANEL_BG, padx=4, pady=4)
    login_notebook.add(cookie_tab, text='Cookie')
    tk.Label(cookie_tab, text='浏览器 F12 → Cookie → MUSIC_U', bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 8)).pack(fill=tk.X, pady=2)
    cookie_var = tk.StringVar()
    Entry(cookie_tab, textvariable=cookie_var, font=FONT_MAIN, bg='#111111', fg='white', insertbackground='white', relief='solid', bd=1).pack(fill=tk.X, ipady=3, pady=4)
    cookie_st = tk.Label(cookie_tab, text='', bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    cookie_st.pack(fill=tk.X)
    def do_cookie_login():
        global netease_logged_in
        val = cookie_var.get().strip()
        if not val: return
        if '=' in val and 'MUSIC_U=' not in val: val = f"MUSIC_U={val}"
        elif '=' not in val: val = f"MUSIC_U={val}"
        try:
            r = _api_post("/user/account", cookie=val)
            d = r.json()
            if d.get("code") == 200 and (d.get("account") or d.get("profile")):
                netease_logged_in = True; _save_cookie(val)
                cookie_st.config(text='✅ 登录成功', fg='#00cc66')
                refresh_account_display()
                return
            cookie_st.config(text='Cookie无效', fg='#cc4444')
        except Exception as e:
            cookie_st.config(text=str(e), fg='#cc4444')
    ttk.Button(cookie_tab, text='🔑 登录', command=do_cookie_login, style='Accent.TButton').pack(fill=tk.X, pady=(4,0))

    # 手机号登录
    phone_tab = Frame(login_notebook, bg=PANEL_BG, padx=4, pady=4)
    login_notebook.add(phone_tab, text='手机号')
    tk.Label(phone_tab, text='手机号：', bg=PANEL_BG, fg='white', font=('微软雅黑', 9)).pack(anchor='w', pady=(2,0))
    phone_var = tk.StringVar()
    Entry(phone_tab, textvariable=phone_var, font=FONT_MAIN, bg='#111111', fg='white', insertbackground='white', relief='solid', bd=1).pack(fill=tk.X, ipady=3, pady=2)
    tk.Label(phone_tab, text='密码：', bg=PANEL_BG, fg='white', font=('微软雅黑', 9)).pack(anchor='w', pady=(2,0))
    pw_var = tk.StringVar()
    Entry(phone_tab, textvariable=pw_var, font=FONT_MAIN, show='*', bg='#111111', fg='white', insertbackground='white', relief='solid', bd=1).pack(fill=tk.X, ipady=3, pady=2)
    phone_st = tk.Label(phone_tab, text='', bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    phone_st.pack(fill=tk.X)
    def do_phone_login():
        phone = phone_var.get().strip(); pw = pw_var.get().strip()
        if not phone or not pw: return
        phone_st.config(text="正在登录...", fg=ACCENT)
        root.update_idletasks()
        ok, msg = netease_login_cellphone(phone, pw)
        if ok:
            phone_st.config(text=f"✅ {msg}", fg='#00cc66')
            refresh_account_display()
        else:
            phone_st.config(text=msg, fg='#cc4444')
    ttk.Button(phone_tab, text='🔑 登录', command=do_phone_login, style='Accent.TButton').pack(fill=tk.X, pady=(4,0))

    # 二维码登录
    qr_tab = Frame(login_notebook, bg=PANEL_BG, padx=4, pady=4)
    login_notebook.add(qr_tab, text='二维码')
    qr_st = tk.Label(qr_tab, text='点击生成二维码', bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    qr_st.pack(fill=tk.X, pady=2)
    def do_qr_login():
        if getattr(do_qr_login, '_active', False): return
        do_qr_login._active = True
        qr_st.config(text='正在生成...', fg=ACCENT)
        root.update_idletasks()
        ok, msg, unikey = netease_login_qrcode()
        if not ok:
            qr_st.config(text=msg, fg='#cc4444'); do_qr_login._active = False; return
        qr_url = f"https://music.163.com/login?codekey={unikey}"
        qr_st.config(text='请用网易云APP扫码', fg=ACCENT)
        try:
            import qrcode
            qr_img = qrcode.make(qr_url).resize((160, 160), Image.Resampling.LANCZOS)
            qr_photo = ImageTk.PhotoImage(qr_img)
        except:
            qr_photo = None
        for w in qr_tab.winfo_children():
            if getattr(w, '_qr', False): w.destroy()
        if qr_photo:
            ql = tk.Label(qr_tab, image=qr_photo, bg=PANEL_BG)
            ql.image = qr_photo; ql._qr = True
            ql.pack(pady=6)
        def poll():
            for _ in range(120):
                if not do_qr_login._active: return
                try:
                    st = netease_login_qrcode_poll(unikey)
                except:
                    time.sleep(2); continue
                if st == 1:
                    do_qr_login._active = False
                    root.after(0, lambda: (qr_st.config(text='✅ 登录成功', fg='#00cc66'), refresh_account_display()))
                    return
                elif st == 0:
                    root.after(0, lambda: qr_st.config(text='已扫码，请确认...', fg=ACCENT))
                elif st == -2:
                    do_qr_login._active = False
                    root.after(0, lambda: qr_st.config(text='二维码已过期', fg='#cc4444'))
                    return
                time.sleep(1.5)
            do_qr_login._active = False
            root.after(0, lambda: qr_st.config(text='超时', fg='#cc4444'))
        threading.Thread(target=poll, daemon=True).start()
    ttk.Button(qr_tab, text='📱 生成二维码', command=do_qr_login, style='Accent.TButton').pack(fill=tk.X, pady=(4,0))

    # ===== 搜索下载区 =====
    search_group = ttk.LabelFrame(np_container, text="搜索下载", padding=8)
    search_group.pack(fill=tk.X, padx=6, pady=4)

    # 音质选择行
    br_row = Frame(search_group, bg=PANEL_BG)
    br_row.pack(fill=tk.X, pady=(0, 2))
    tk.Label(br_row, text='音质：', bg=PANEL_BG, fg='white', font=('微软雅黑', 9)).pack(side=tk.LEFT)
    br_map = {'标准 128k': 128000, '中等 192k': 192000, '高品质 320k': 320000, '无损 999k': 999000}
    br_display = {v: k for k, v in br_map.items()}
    br_var = tk.StringVar(value=br_display.get(current_dl_br, '高品质 320k'))
    br_menu = ttk.Combobox(br_row, values=list(br_map.keys()), textvariable=br_var, width=14, state='readonly')
    br_menu.pack(side=tk.LEFT, padx=4)
    br_menu.bind('<<ComboboxSelected>>', lambda e: _sync_br())
    def _sync_br():
        global current_dl_br
        current_dl_br = br_map.get(br_var.get(), 320000)
        sync_config_to_disk()
    tk.Button(br_row, text='💾', bg=PANEL_BG, fg=ACCENT, relief='flat', font=('微软雅黑', 9),
              command=_sync_br, cursor='hand2').pack(side=tk.LEFT)

    search_row = Frame(search_group, bg=PANEL_BG)
    search_row.pack(fill=tk.X, pady=2)
    search_var = tk.StringVar()
    search_entry = Entry(search_row, textvariable=search_var, font=FONT_MAIN, bg='#111111', fg='white',
          insertbackground='white', relief='solid', bd=1)
    search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=3)
    ttk.Button(search_row, text='搜索', style='Accent.TButton', width=6, command=lambda: do_search()).pack(side=tk.RIGHT, padx=(4,0))
    search_entry.bind('<Return>', lambda e: do_search())

    search_st = tk.Label(search_group, text="输入歌手/歌名搜索", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    search_st.pack(fill=tk.X, pady=(2,0))

    search_results = Frame(search_group, bg=PANEL_BG)
    search_results.pack(fill=tk.BOTH, expand=True, pady=2)

    def do_search():
        kw = search_var.get().strip()
        if not kw: return
        for w in search_results.winfo_children(): w.destroy()
        search_st.config(text=f"搜索「{kw}」...", fg=ACCENT)
        root.update_idletasks()
        def _bg():
            songs = netease_search_song(kw, limit=30)
            root.after(0, lambda: _show(songs))
        def _show(songs):
            if not songs:
                search_st.config(text=f"未找到「{kw}」", fg=MUTED); return
            search_st.config(text=f"找到 {len(songs)} 首", fg='#00cc66')
            for i, s in enumerate(songs):
                row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
                card = Frame(search_results, bg=row_bg)
                card.pack(fill=tk.X, pady=1, padx=2)
                fee = s.get('fee', 0)
                fee_map = {0: ('免费', '#00cc66'), 1: ('VIP', '#e6a817'),
                           4: ('VIP', '#e6a817'), 8: ('付费', '#cc4444')}
                fl, fc = fee_map.get(fee, ('', MUTED))
                line1 = Frame(card, bg=row_bg)
                line1.pack(fill=tk.X, padx=6, pady=(4,1))
                tk.Label(line1, text=f"#{i+1} {s['name']}", bg=row_bg, fg='white',
                         font=('微软雅黑', 9, 'bold'), anchor='w').pack(side=tk.LEFT)
                tk.Label(line1, text=fl, bg=row_bg, fg=fc, font=('微软雅黑', 7, 'bold')).pack(side=tk.RIGHT)
                line2 = Frame(card, bg=row_bg)
                line2.pack(fill=tk.X, padx=6, pady=(0,3))
                dur = s.get('duration', 0) // 1000 if s.get('duration') else 0
                dur_str = f"{dur//60}:{dur%60:02d}" if dur else "??:??"
                tk.Label(line2, text=f"👤 {s.get('artists','')}  |  ID:{s['id']}  |  ⏱{dur_str}",
                         bg=row_bg, fg=MUTED, font=('微软雅黑', 8)).pack(side=tk.LEFT)
                def _dl(nid=s['id'], name=s['name'], artists=s.get('artists','')):
                    search_st.config(text=f"下载中: {name}...", fg=ACCENT)
                    root.update_idletasks()
                    def _d():
                        ok, msg, info = netease_download_song(nid, MUSIC_DIR, current_dl_br)
                        saved_path = os.path.join(MUSIC_DIR, msg) if ok else None
                        lrc_ok = False
                        if ok and saved_path:
                            lrc_tuple = netease_fetch_lyrics(nid)
                            if lrc_tuple:
                                _save_netease_lyrics(saved_path, lrc_tuple, artists, name)
                                lrc_ok = True
                            bind_netease_song(saved_path, nid)
                            cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                            os.makedirs(cover_dir, exist_ok=True)
                            cp = os.path.join(cover_dir, f'{nid}.jpg')
                            if netease_fetch_cover(nid, cp):
                                ratings[saved_path] = {**ratings.get(saved_path, {}), 'cover': cp}
                                save_ratings(ratings)
                            global audio_paths
                            audio_paths = scan_audio_files(MUSIC_DIR)
                            song_info_cache.clear()
                            refresh_song_library()
                        root.after(0, lambda: _done(ok, msg, name, artists, lrc_ok))
                    def _done(ok, msg, name, artists, lrc_ok):
                        if ok:
                            t = f"✅ {artists} - {name}\\n\\n已下载到 music 文件夹\\n✅ 歌词+封面已自动下载"
                            search_st.config(text=f"✅ 完成: {name}", fg='#00cc66')
                            messagebox.showinfo('下载完成', t)
                        else:
                            search_st.config(text=f"失败: {msg}", fg='#cc4444')
                            messagebox.showerror('下载失败', f"{artists} - {name}\\n\\n{msg}")
                    threading.Thread(target=_d, daemon=True).start()
                dl_btn = ttk.Button(card, text='📥 下载(含歌词封面)', style='Small.TButton', command=_dl)
                dl_btn.pack(fill=tk.X, padx=6, pady=(0,4))
        threading.Thread(target=_bg, daemon=True).start()

    # ===== 导入单曲区 =====
    import_group = ttk.LabelFrame(np_container, text="导入单曲", padding=8)
    import_group.pack(fill=tk.X, padx=6, pady=4)

    import_var = tk.StringVar()
    import_row = Frame(import_group, bg=PANEL_BG)
    import_row.pack(fill=tk.X, pady=2)
    Entry(import_row, textvariable=import_var, font=FONT_MAIN, bg='#111111', fg='white',
          insertbackground='white', relief='solid', bd=1).pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=3)
    ttk.Button(import_row, text='导入', style='Accent.TButton', width=6, command=lambda: do_import()).pack(side=tk.RIGHT, padx=(4,0))
    import_st = tk.Label(import_group, text="输入网易云歌曲ID或链接", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    import_st.pack(fill=tk.X, pady=(2,0))

    def do_import():
        val = import_var.get().strip()
        if not val: return
        nid = netease_extract_song_id(val)
        if not nid:
            messagebox.showerror('错误', '无法识别的链接或ID'); return
        import_st.config(text="正在下载...", fg=ACCENT)
        root.update_idletasks()
        def _dl():
            ok, msg, info = netease_download_song(nid, MUSIC_DIR, current_dl_br)
            saved_path = os.path.join(MUSIC_DIR, msg) if ok else None
            if ok and saved_path:
                lrc_tuple = netease_fetch_lyrics(nid)
                if lrc_tuple:
                    art_n = info['artists'] if info else ''; tit_n = info['name'] if info else msg
                    _save_netease_lyrics(saved_path, lrc_tuple, art_n, tit_n)
                bind_netease_song(saved_path, nid)
                cover_dir = os.path.join(BASE_DIR, 'source', 'covers'); os.makedirs(cover_dir, exist_ok=True)
                cp = os.path.join(cover_dir, f'{nid}.jpg')
                if netease_fetch_cover(nid, cp):
                    ratings[saved_path] = {**ratings.get(saved_path, {}), 'cover': cp}; save_ratings(ratings)
                global audio_paths
                audio_paths = scan_audio_files(MUSIC_DIR); song_info_cache.clear(); refresh_song_library()
            root.after(0, lambda: _done(ok, msg))
        def _done(ok, msg):
            if ok:
                import_st.config(text=f"✅ 已导入: {msg}", fg='#00cc66')
                messagebox.showinfo('导入成功', f'歌曲已下载:\\n{msg}\\n✅ 已自动绑定ID+歌词+封面')
            else:
                import_st.config(text=f"失败: {msg}", fg='#cc4444'); messagebox.showerror('导入失败', msg)
            import_var.set("")
        threading.Thread(target=_dl, daemon=True).start()

    # ===== 批量操作区 =====
    batch_group = ttk.LabelFrame(np_container, text="批量操作", padding=8)
    batch_group.pack(fill=tk.X, padx=6, pady=4)

    batch_st = tk.Label(batch_group, text="", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    batch_st.pack(fill=tk.X, pady=(0,4))

    def do_batch_bind():
        all_paths = scan_audio_files(MUSIC_DIR)
        existing = load_netease_bindings()
        to_bind = [p for p in all_paths if p not in existing]
        if not to_bind:
            messagebox.showinfo('完成', '所有歌曲已绑定'); return
        if not messagebox.askyesno('确认', f'将为 {len(to_bind)} 首未绑定歌曲自动搜索绑定网易云ID\\n\\n需要联网，可能耗时较久'):
            return
        batch_st.config(text=f"处理中 0/{len(to_bind)}...", fg=ACCENT)
        def _bg():
            bound = 0
            for i, p in enumerate(to_bind):
                info = load_song_info(p)
                kw = f"{info.get('artist','')} {info.get('title','')}".strip()
                if not kw: continue
                try:
                    r = netease_search_song(kw, limit=1)
                    if r: bind_netease_song(p, r[0]['id']); bound += 1
                except: pass
                if (i+1) % 5 == 0 or i == len(to_bind)-1:
                    root.after(0, lambda i=i+1, b=bound: batch_st.config(
                        text=f"处理中 {i}/{len(to_bind)}...已绑定 {b} 首", fg=ACCENT))
            root.after(0, lambda: batch_st.config(text=f"✅ 完成: 绑定 {bound}/{len(to_bind)} 首", fg='#00cc66'))
            song_info_cache.clear()
            root.after(200, lambda: refresh_song_library(skip_rescan=True))
        threading.Thread(target=_bg, daemon=True).start()

    ttk.Button(batch_group, text='🔍 批量自动绑定网易云ID', command=do_batch_bind).pack(fill=tk.X, pady=2)

    def do_batch_lyrics():
        """一键导入/更新所有已绑定ID的歌曲的歌词"""
        bindings = load_netease_bindings()
        to_process = [(p, nid) for p, nid in bindings.items() if os.path.exists(p)]
        if not to_process:
            messagebox.showinfo('完成', '没有已绑定ID的歌曲'); return
        if not messagebox.askyesno('确认', f'将为 {len(to_process)} 首已绑定歌曲从网易云获取歌词\\n\\n需要联网，可能耗时较久'):
            return
        batch_st.config(text=f"导入歌词 0/{len(to_process)}...", fg=ACCENT)
        def _bg():
            ok_count = 0
            for i, (p, nid) in enumerate(to_process):
                try:
                    lrc_tuple = netease_fetch_lyrics(nid)
                    if lrc_tuple:
                        info = load_song_info(p)
                        artist = info.get('artist', ''); title = info.get('title', '')
                        _save_netease_lyrics(p, lrc_tuple, artist, title)
                        ok_count += 1
                except: pass
                if (i+1) % 5 == 0 or i == len(to_process)-1:
                    root.after(0, lambda i=i+1, o=ok_count: batch_st.config(
                        text=f"导入歌词 {i}/{len(to_process)}...完成 {o} 首", fg=ACCENT))
            save_lyrics(lyrics); song_info_cache.clear()
            root.after(0, lambda: batch_st.config(
                text=f"✅ 歌词完成: {ok_count}/{len(to_process)} 首", fg='#00cc66'))
            root.after(100, lambda: refresh_song_library(skip_rescan=True))
        threading.Thread(target=_bg, daemon=True).start()
    
    ttk.Button(batch_group, text='📝 一键导入所有歌词', command=do_batch_lyrics).pack(fill=tk.X, pady=2)
    ttk.Button(batch_group, text='🔍 批量自动绑定网易云ID', command=do_batch_bind).pack(fill=tk.X, pady=2)

    # ===== 评论区 =====
    comment_group = ttk.LabelFrame(np_container, text="当前歌曲评论", padding=8)
    comment_group.pack(fill=tk.X, padx=6, pady=4)

    comment_info = tk.Label(comment_group, text="播放一首歌后加载评论", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9), wraplength=340)
    comment_info.pack(fill=tk.X, pady=2)

    comment_container = Frame(comment_group, bg=PANEL_BG)
    comment_container.pack(fill=tk.BOTH, expand=True)

    def load_comments():
        for w in comment_container.winfo_children(): w.destroy()
        if not playlist or current_playlist_index == -1:
            comment_info.config(text="请先播放一首歌曲"); return
        cp = playlist[current_playlist_index]
        nid = get_netease_song_id(cp)
        if not nid:
            comment_info.config(text="当前歌曲未绑定网易云ID"); return
        comment_info.config(text="正在加载评论...", fg=ACCENT)
        root.update_idletasks()
        info = load_song_info(cp)
        def _bg():
            comments, total = netease_fetch_comments(nid, page_size=max(5, min(30, comment_display_count)))
            root.after(0, lambda: _show(comments, total, info))
        def _show(comments, total, info):
            comment_info.config(text=f"「{info.get('title','')}」共{total}条", fg='#00cc66')
# ==================== 歌词查看面板 ====================
def build_lyrics_panel():
    """静态歌词查看面板 - 不跟随播放滚动，可复制"""
    for w in lyrics_panel.winfo_children():
        w.destroy()

    header_l = Frame(lyrics_panel, bg=ACCENT)
    header_l.pack(fill=tk.X, pady=0)
    tk.Label(header_l, text="📝 歌词查看", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)

    # 歌词文本区域
    text_frame = Frame(lyrics_panel, bg=PANEL_BG)
    text_frame.pack(fill=tk.BOTH, expand=True, padx=6, pady=4)

    lyrics_text = tk.Text(text_frame, bg='#111111', fg=TEXT, font=('微软雅黑', 11),
                          wrap=tk.WORD, relief='flat', bd=0, padx=8, pady=8,
                          insertbackground='white')
    lyrics_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    scrollbar_l = ttk.Scrollbar(text_frame, orient='vertical', command=lyrics_text.yview)
    scrollbar_l.pack(side=tk.RIGHT, fill=tk.Y)
    lyrics_text.configure(yscrollcommand=scrollbar_l.set)

    # 底部状态+按钮行
    bottom_l = Frame(lyrics_panel, bg=PANEL_BG)
    bottom_l.pack(fill=tk.X, padx=6, pady=4)

    status_l = tk.Label(bottom_l, text="播放一首歌曲后显示歌词", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    status_l.pack(side=tk.LEFT, padx=4)

    def load_lyrics_static():
        lyrics_text.delete('1.0', tk.END)
        if not playlist or current_playlist_index == -1:
            status_l.config(text="请先播放一首歌曲"); return
        cp = playlist[current_playlist_index]
        info = load_song_info(cp)
        title = info.get('title', '未知'); artist = info.get('artist', '')
        lyr = info.get('lyrics', [])
        if not lyr:
            status_l.config(text="该歌曲无歌词数据"); return
        status_l.config(text=f"「{artist} - {title}」共 {len(lyr)} 行")
        has_trans = any(len(item) > 2 and item[2] for item in lyr)
        for item in lyr:
            t = item[0]; txt = item[1]; trans = item[2] if len(item) > 2 else ''
            m = int(t // 60); s = int(t % 60)
            line = f"[{m:02d}:{s:02d}] {txt}"
            if has_trans and trans:
                line += f"\n{'':>8}{trans}"  # 翻译缩进
            lyrics_text.insert(tk.END, line + '\n')
        lyrics_text.see('1.0')

    def copy_lyrics():
        content = lyrics_text.get('1.0', tk.END).strip()
        if content and content != '该歌曲无歌词数据':
            root.clipboard_clear()
            root.clipboard_append(content)
            status_l.config(text="✅ 已复制到剪贴板", fg='#00cc66')

    ttk.Button(bottom_l, text='🔄 刷新', command=load_lyrics_static).pack(side=tk.LEFT, padx=4)
    ttk.Button(bottom_l, text='📋 复制', command=copy_lyrics).pack(side=tk.LEFT, padx=4)

    # 自动加载
    root.after(100, load_lyrics_static)

# ==================== 导入歌单面板（网易云歌单浏览 + 本地管理） ====================
def _song_already_exists(netease_id, name='', artist=''):
    """判断本地是否已有匹配歌曲（网易云ID匹配 或 歌手+歌名匹配）"""
    all_paths = scan_audio_files(MUSIC_DIR)
    bindings = load_netease_bindings()
    if netease_id:
        for p in all_paths:
            if bindings.get(p) == netease_id:
                return True
    if name and artist:
        target = f"{artist} - {name}"
        for p in all_paths:
            if get_cached_title(p) == target:
                return True
            if os.path.splitext(os.path.basename(p))[0] == target:
                return True
    return False

def build_daily_panel():
    """歌单管理面板 - 网易云歌单浏览（仅网易云，无本地歌单）"""
    for w in daily_panel.winfo_children():
        w.destroy()

    # ---- 防止并发访问的标志 ----
    import threading
    netease_lock = threading.Lock()
    netease_loading = {'flag': False}

    # ---- 网易云歌单区 ----
    h = Frame(daily_panel, bg=ACCENT)
    h.pack(fill=tk.X)
    tk.Label(h, text="📥 网易云歌单", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)

    # 来源选择器
    src_frame = Frame(daily_panel, bg=PANEL_BG)
    src_frame.pack(fill=tk.X, padx=6, pady=(4, 0))
    tk.Label(src_frame, text='来源：', bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9)).pack(side=tk.LEFT)
    src_var = tk.StringVar(value='我的歌单')
    src_menu = ttk.Combobox(src_frame, values=['我的歌单', '每日推荐', '搜索歌单'],
                            textvariable=src_var, width=12, state='readonly')
    src_menu.pack(side=tk.LEFT, padx=4)
    src_menu.bind('<<ComboboxSelected>>', lambda e: refresh_netease_view())

    # 搜索行
    search_f = Frame(daily_panel, bg=PANEL_BG)
    search_var = tk.StringVar()
    se = Entry(search_f, textvariable=search_var, font=FONT_MAIN, bg='#111111', fg='white',
               insertbackground='white', relief='solid', bd=1)
    se.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=3, padx=(6, 0))
    ttk.Button(search_f, text='搜索', width=6, command=lambda: do_search_playlist()).pack(side=tk.RIGHT, padx=(4, 6))
    se.bind('<Return>', lambda e: do_search_playlist())

    st = tk.Label(daily_panel, text="", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    st.pack(fill=tk.X, padx=8, pady=2)

    # 创建一个 container 来包含网易云内容区和按钮栏
    canvas_container = Frame(daily_panel, bg=PANEL_BG)
    canvas_container.pack(fill=tk.BOTH, expand=True)
    
    # 网易云内容滚动区（在 container 中展开）
    nc_canvas = Canvas(canvas_container, bg=PANEL_BG, highlightthickness=0, bd=0)
    nc_sb = ttk.Scrollbar(canvas_container, orient='vertical', command=nc_canvas.yview)
    nc_canvas.configure(yscrollcommand=nc_sb.set)
    nc_sb.pack(side=tk.RIGHT, fill=tk.Y)
    nc_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    # 歌单歌曲查看按钮栏（固定在画布下方，不随滚动移动）
    view_btn_bar = Frame(daily_panel, bg=PANEL_BG)
    # 初始隐藏，查看歌单歌曲时显示

    # 本地歌单区（固定在底部，但不在网易云歌单管理中显示）
    local_header = Frame(daily_panel, bg=CARD_BG)
    tk.Label(local_header, text='📋 本地歌单', bg=CARD_BG, fg=ACCENT,
             font=('微软雅黑', 9, 'bold')).pack(side=tk.LEFT, padx=8, pady=3)
    ttk.Button(local_header, text='＋', width=2, command=lambda: new_playlist(),
               style='Small.TButton').pack(side=tk.RIGHT, padx=4, pady=2)

    local_container = Frame(daily_panel, bg=PANEL_BG)

    nc_ct = Frame(nc_canvas, bg=PANEL_BG)
    nc_canvas.create_window((0, 0), window=nc_ct, anchor='nw')
    nc_ct.bind('<Configure>', lambda e: nc_canvas.configure(scrollregion=nc_canvas.bbox('all')))
    def _nc_resize(e): nc_canvas.itemconfig(1, width=e.width)
    nc_canvas.bind('<Configure>', _nc_resize)
    def _nc_mw(e): nc_canvas.yview_scroll(-1 if e.delta > 0 else 1, 'units'); return 'break'
    nc_canvas.bind('<MouseWheel>', _nc_mw)
    nc_ct.bind('<MouseWheel>', _nc_mw)

    # ---- 本地歌单刷新（不在歌单管理中显示）----
    def refresh_local_playlists():
        # 本地歌单刷新逻辑保留供其他模块使用
        pass
    
    def new_playlist():
        # 新建歌单函数保留供其他模块使用
        pass

    # 追踪当前显示的歌单来源
    current_view_source = {'is_my': False, 'plid': None, 'plname': None, 'songs': []}

    # ---- 网易云视图 ----
    def refresh_netease_view():
        for w in nc_ct.winfo_children():
            w.destroy()
        view_btn_bar.pack_forget()  # 隐藏查看歌曲按钮栏
        local_header.pack(fill=tk.X)  # 恢复本地歌单区域显示
        # 每次进入网易云视图时，后台静默验证登录状态（失败不影响已保存的cookie）
        if netease_logged_in:
            def _check():
                try:
                    r = _api_get("/login/status")
                    code = _get_api_code(r.json())
                    # 只有明确返回非200且非None才标记失效
                    if code is not None and code != 200:
                        global netease_logged_in, _api_cookie
                        netease_logged_in = False
                        _api_cookie = None
                except:
                    pass
            threading.Thread(target=_check, daemon=True).start()
        src = src_var.get()
        if src == '我的歌单':
            search_f.pack_forget()
            st.config(text="正在加载我的歌单...", fg=ACCENT)
            threading.Thread(target=load_my_playlists, daemon=True).start()
        elif src == '每日推荐':
            search_f.pack_forget()
            st.config(text="正在获取每日推荐...", fg=ACCENT)
            threading.Thread(target=load_daily_rec, daemon=True).start()
        elif src == '搜索歌单':
            search_f.pack(before=st, fill=tk.X, padx=6, pady=(4, 2))
            st.config(text="输入关键词搜索歌单", fg=MUTED)

    def load_my_playlists():
        global netease_uid
        # 防止并发加载
        if netease_loading['flag']:
            return
        with netease_lock:
            if netease_loading['flag']:
                return
            netease_loading['flag'] = True
        try:
            uid = netease_uid
            if uid:
                r = _api_get(f"/user/playlist?uid={uid}")
            else:
                r = _api_get("/user/playlist")
            d = r.json()
            if d.get("code") != 200 or not d.get("playlist"):
                root.after(0, lambda: st.config(text="获取失败，请先登录网易云", fg='#cc4444'))
                return
            pls = d["playlist"]
            root.after(0, lambda: _show_netease_playlists(pls, is_my=True))
        except Exception as e:
            root.after(0, lambda: st.config(text=str(e), fg='#cc4444'))
        finally:
            netease_loading['flag'] = False

    def do_search_playlist():
        kw = search_var.get().strip()
        if not kw: return
        if netease_loading['flag']:
            st.config(text="正在加载中，请稍候...", fg=MUTED)
            return
        for w in nc_ct.winfo_children():
            w.destroy()
        view_btn_bar.pack_forget()
        local_header.pack_forget()  # 搜索时隐藏本地歌单
        st.config(text=f"搜索歌单「{kw}」...", fg=ACCENT)
        threading.Thread(target=lambda: _search_playlists(kw), daemon=True).start()

    def _search_playlists(kw):
        if netease_loading['flag']:
            return
        with netease_lock:
            if netease_loading['flag']:
                return
            netease_loading['flag'] = True
        try:
            r = _api_get(f"/search?keywords={requests.utils.quote(kw)}&type=1000&limit=20")
            d = r.json()
            if d.get("code") != 200:
                root.after(0, lambda: st.config(text="搜索失败", fg='#cc4444'))
                return
            pls = d.get("result", {}).get("playlists", [])
            root.after(0, lambda: _show_netease_playlists(pls, is_my=False))
        except Exception as e:
            root.after(0, lambda: st.config(text=f"搜索错误: {str(e)}", fg='#cc4444'))
        finally:
            netease_loading['flag'] = False

    def _show_netease_playlists(pls, is_my=False):
        for w in nc_ct.winfo_children():
            w.destroy()
        view_btn_bar.pack_forget()  # 隐藏查看歌曲按钮栏
        local_header.pack(fill=tk.X)  # 显示本地歌单
        
        # 强制垃圾回收
        import gc
        gc.collect()
        
        if not pls:
            st.config(text="未找到歌单", fg=MUTED); return
        
        if is_my:
            # 大封面网格视图（我的歌单）- 两列等宽
            st.config(text=f"找到 {len(pls)} 个我的歌单", fg='#00cc66')
            current_view_source['is_my'] = True
            
            # 使用Frame和grid布局实现两列等宽网格
            grid_container = Frame(nc_ct, bg=PANEL_BG)
            grid_container.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
            
            # 设置列权重为等宽
            grid_container.columnconfigure(0, weight=1)
            grid_container.columnconfigure(1, weight=1)
            
            for i, pl in enumerate(pls):
                plid = str(pl.get('id', ''))
                plname = pl.get('name', '未命名')
                track_count = pl.get('trackCount', pl.get('trackNum', 0))
                cover_url = pl.get('coverImgUrl', '')
                
                # 计算行列位置
                row_idx = i // 2
                col_idx = i % 2
                
                card = Frame(grid_container, bg=CARD_BG)
                card.grid(row=row_idx, column=col_idx, sticky='nsew', padx=4, pady=4)
                
                # 加载封面图片
                cover_img = None
                try:
                    if cover_url:
                        import io
                        resp = requests.get(cover_url, timeout=2)
                        if resp.status_code == 200:
                            img = Image.open(io.BytesIO(resp.content))
                            img = img.resize((140, 140), Image.Resampling.LANCZOS)
                            cover_img = ImageTk.PhotoImage(img)
                except:
                    pass
                
                # 封面标签
                if cover_img:
                    cover_label = tk.Label(card, image=cover_img, bg=CARD_BG)
                    cover_label.image = cover_img  # 保留引用防止垃圾回收
                else:
                    cover_label = tk.Label(card, text='📀', font=('微软雅黑', 48), bg=CARD_BG, fg=ACCENT)
                cover_label.pack(pady=(8, 4), expand=True)
                
                # 歌单名称
                name_label = tk.Label(card, text=plname, font=('微软雅黑', 10, 'bold'), 
                                     bg=CARD_BG, fg='white', wraplength=120)
                name_label.pack(pady=2)
                
                # 歌曲数量
                count_label = tk.Label(card, text=f"{track_count}首", font=('微软雅黑', 8), 
                                      bg=CARD_BG, fg=MUTED)
                count_label.pack(pady=(0, 8))
                
                # 绑定点击事件：点击进入查看歌曲
                cover_label.bind('<Button-1>', lambda e, pid=plid, pn=plname: view_playlist_songs(pid, pn))
                name_label.bind('<Button-1>', lambda e, pid=plid, pn=plname: view_playlist_songs(pid, pn))
                cover_label.config(cursor='hand2')
                name_label.config(cursor='hand2')
        else:
            # 列表视图（搜索结果等）
            st.config(text=f"找到 {len(pls)} 个网易云歌单", fg='#00cc66')
            current_view_source['is_my'] = False
            for i, pl in enumerate(pls):
                plid = str(pl.get('id', ''))
                plname = pl.get('name', '未命名')
                track_count = pl.get('trackCount', pl.get('trackNum', 0))
                creator = pl.get('creator', {}) if isinstance(pl.get('creator'), dict) else pl.get('creator', pl)
                creator_name = creator.get('nickname', '') if isinstance(creator, dict) else str(creator) if creator else ''
                row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
                card = Frame(nc_ct, bg=row_bg)
                card.pack(fill=tk.X, pady=1, padx=2)
                r1 = Frame(card, bg=row_bg)
                r1.pack(fill=tk.X, padx=6, pady=(3, 1))
                tk.Label(r1, text=f"☁️ {plname}", bg=row_bg, fg='white',
                         font=('微软雅黑', 9, 'bold'), anchor='w').pack(side=tk.LEFT)
                tk.Label(r1, text=f"{track_count}首", bg=row_bg, fg=MUTED,
                         font=('微软雅黑', 8)).pack(side=tk.RIGHT)
                r2 = Frame(card, bg=row_bg)
                r2.pack(fill=tk.X, padx=6, pady=(0, 2))
                extra = f"by {creator_name}" if creator_name else ""
                tk.Label(r2, text=extra, bg=row_bg, fg=MUTED, font=('微软雅黑', 7)).pack(side=tk.LEFT)
                btn_row = Frame(card, bg=row_bg)
                btn_row.pack(fill=tk.X, padx=6, pady=(0, 4))
                ttk.Button(btn_row, text='👁 查看歌曲', style='Small.TButton',
                           command=lambda pid=plid, pn=plname: view_playlist_songs(pid, pn)).pack(
                               side=tk.LEFT, padx=(0, 4), fill=tk.X, expand=True)
                ttk.Button(btn_row, text='📥 导入全部', style='Small.TButton',
                           command=lambda pid=plid, pn=plname: import_netease_playlist(pid, pn)).pack(
                               side=tk.LEFT, fill=tk.X, expand=True)
                ttk.Button(btn_row, text='⬆️ 上传本地', style='Small.TButton',
                           command=lambda pid=plid, pn=plname: upload_local_to_netease(pid, pn)).pack(
                               side=tk.LEFT, padx=(4, 0), fill=tk.X, expand=True)

    def load_daily_rec():
        try:
            r = _api_get("/recommend/songs")
            d = r.json()
            if d.get("code") != 200 or not d.get("data"):
                root.after(0, lambda: st.config(text="获取每日推荐失败，请先登录", fg='#cc4444'))
                return
            songs = d["data"].get("dailySongs", [])
            if not songs:
                root.after(0, lambda: st.config(text="今日暂无推荐", fg=MUTED)); return
            td = time.strftime('%m.%d')
            source_name = f"{td}日推"
            parsed = [{
                'id': str(s.get('id', '')), 'name': s.get('name', ''),
                'artists': '/'.join([a['name'] for a in s.get('ar', [])]),
                'fee': s.get('fee', 0),
                'album': (s.get('al', {}) or {}).get('name', '') if isinstance(s.get('al'), dict) else '',
                'duration': (s.get('dt', 0) or 0) // 1000
            } for s in songs]
            root.after(0, lambda: _show_daily_songs(parsed, source_name))
        except Exception as e:
            root.after(0, lambda: st.config(text=str(e), fg='#cc4444'))

    # ---- 查看歌单歌曲（在线预览，不下载） ----
    def view_playlist_songs(plid, plname):
        for w in nc_ct.winfo_children():
            w.destroy()
        st.config(text=f"加载「{plname}」歌曲列表...", fg=ACCENT)
        threading.Thread(target=lambda: _fetch_and_show(plid, plname), daemon=True).start()

    def _fetch_and_show(plid, plname):
        try:
            r = _api_get(f"/playlist/detail?id={plid}")
            d = r.json()
            if d.get("code") != 200 or not d.get("playlist"):
                root.after(0, lambda: st.config(text="加载歌单详情失败", fg='#cc4444'))
                return
            tracks = d["playlist"].get("tracks", [])
            songs = [{
                'id': str(t.get('id', '')), 'name': t.get('name', ''),
                'artists': '/'.join([a['name'] for a in t.get('ar', [])]),
                'fee': t.get('fee', 0),
                'album': (t.get('al', {}) or {}).get('name', '') if isinstance(t.get('al'), dict) else '',
                'duration': (t.get('dt', 0) or 0) // 1000
            } for t in tracks]
            root.after(0, lambda: _show_view_songs(songs, plname, plid, is_my=current_view_source['is_my']))
        except Exception as e:
            root.after(0, lambda: st.config(text=str(e), fg='#cc4444'))

    def _show_view_songs(songs, plname, plid, is_my=False, preselected=None):
        # 清空滚动区域
        for w in nc_ct.winfo_children():
            w.destroy()
        # 隐藏之前的按钮栏
        view_btn_bar.pack_forget()
        for w in view_btn_bar.winfo_children():
            w.destroy()
        # 隐藏本地歌单区域（查看网易云歌单时）
        local_header.pack_forget()
        
        # 强制垃圾回收，释放内存
        import gc
        gc.collect()
        
        st.config(text=f"「{plname}」共 {len(songs)} 首", fg='#00cc66')
        
        # 预加载本地绑定（用于🟢标记）
        local_bindings = load_netease_bindings()
        local_sids = set(local_bindings.values())
        
        # ---- 多选状态（支持从全选传入预选集合）----
        selected_songs = preselected if preselected is not None else set()
        select_all_var = tk.BooleanVar(value=False)
        
        def _toggle_song(sid, check_btn):
            if sid in selected_songs:
                selected_songs.discard(sid)
                check_btn.config(text='☐')
            else:
                selected_songs.add(sid)
                check_btn.config(text='☑')
        
        def _toggle_all():
            nonlocal selected_songs
            if select_all_var.get():
                selected_songs = {s['id'] for s in songs}
            else:
                selected_songs = set()
            # 刷新视图并传入预选集合
            _show_view_songs(songs, plname, plid, is_my, preselected=selected_songs)
        
        # 返回按钮 + 全选（右上方）
        back_row = Frame(nc_ct, bg=PANEL_BG)
        back_row.pack(fill=tk.X, pady=(0, 4))
        ttk.Button(back_row, text='← 返回歌单列表',
                   command=lambda: (threading.Thread(target=load_my_playlists, daemon=True).start() if is_my else refresh_netease_view())
                   ).pack(side=tk.LEFT, padx=6)
        
        # 全选框放在右上
        if is_my:
            ttk.Checkbutton(back_row, text='全选', variable=select_all_var,
                           command=_toggle_all, style='Small.TButton').pack(side=tk.RIGHT, padx=6)
        
        # ---- 歌曲列表 ----
        for i, s in enumerate(songs):
            sid = s['id']
            row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
            in_local = sid in local_sids
            
            card = Frame(nc_ct, bg=row_bg)
            card.pack(fill=tk.X, pady=1, padx=2)
            
            # hover 效果
            def _on_enter(e, c=card, bg=row_bg):
                c.configure(bg='#3a3a3a')
                for child in c.winfo_children():
                    try: child.configure(bg='#3a3a3a')
                    except: pass
            def _on_leave(e, c=card, bg=row_bg):
                c.configure(bg=bg)
                for child in c.winfo_children():
                    try: child.configure(bg=bg)
                    except: pass
            card.bind('<Enter>', _on_enter)
            card.bind('<Leave>', _on_leave)
            
            fee_map = {0: ('免费', '#00cc66'), 1: ('VIP', '#e6a817'), 4: ('VIP', '#e6a817'), 8: ('付费', '#cc4444')}
            fl, fc = fee_map.get(s.get('fee', 0), ('', MUTED))
            dur_s = f"{s['duration'] // 60}:{s['duration'] % 60:02d}" if s['duration'] else "??:??"
            
            r1 = Frame(card, bg=row_bg)
            r1.pack(fill=tk.X, padx=6, pady=(3, 1))
            
            if is_my:
                # 多选复选框 - 使用Button确保点击可靠
                chk_text = '☑' if sid in selected_songs else '☐'
                chk = tk.Button(r1, text=chk_text, bg=row_bg, fg=ACCENT,
                               font=('微软雅黑', 11), cursor='hand2',
                               relief='flat', bd=0, highlightthickness=0,
                               activebackground='#3a3a3a', activeforeground=ACCENT,
                               command=lambda sid=sid, cb=None: None)
                # 用config重新绑定command（因为需要在循环中正确捕获）
                chk.config(command=lambda s=sid, c=chk: _toggle_song(s, c))
                chk.pack(side=tk.LEFT, padx=(0, 4))
                # hover 颜色跟随
                chk.bind('<Enter>', lambda e, c=chk: c.configure(bg='#3a3a3a'))
                chk.bind('<Leave>', lambda e, c=chk, orig_bg=row_bg: c.configure(bg=orig_bg))
            
            # 歌曲名 + 本地标记
            name_text = f"#{i + 1} {s['name']}"
            if in_local:
                name_text += ' 🟢'
            name_lbl = tk.Label(r1, text=name_text, bg=row_bg, fg='white',
                               font=('微软雅黑', 9, 'bold'), anchor='w')
            name_lbl.pack(side=tk.LEFT)
            
            tk.Label(r1, text=fl, bg=row_bg, fg=fc,
                    font=('微软雅黑', 7, 'bold')).pack(side=tk.RIGHT)
            
            r2 = Frame(card, bg=row_bg)
            r2.pack(fill=tk.X, padx=6, pady=(0, 3))
            tk.Label(r2, text=f"👤 {s.get('artists', '')}  |  💿 {s.get('album', '')}  |  ⏱ {dur_s}",
                     bg=row_bg, fg=MUTED, font=('微软雅黑', 8)).pack(side=tk.LEFT)
            
            # 仅非"我的歌单"显示下载按钮
            if not is_my:
                ttk.Button(card, text='📥 下载单曲', style='Small.TButton',
                           command=lambda sid=sid, nm=s['name'], ar=s.get('artists', ''):
                               _download_single(sid, nm, ar)).pack(fill=tk.X, padx=6, pady=(0, 4))
        
        # 即使歌曲为空也显示按钮栏（方便操作）
        
        # ---- 固定底部按钮栏 ----
        # 先清空并创建新的按钮栏
        btn_row1 = Frame(view_btn_bar, bg=PANEL_BG)
        btn_row2 = Frame(view_btn_bar, bg=PANEL_BG)
        
        def pd_delete_selected():
            if not selected_songs:
                st.config(text="请先选择要删除的歌曲", fg='#cc4444')
                return
            st.config(text=f"正在删除 {len(selected_songs)} 首...", fg=ACCENT)
            ids = ','.join(sorted(selected_songs))
            def _bg():
                try:
                    r = _api_get(f"/playlist/tracks?op=del&pid={plid}&tracks={ids}")
                    d = r.json()
                    code = _get_api_code(d)
                    if code == 200:
                        root.after(0, lambda: st.config(text=f"✓ 已从歌单中删除 {len(selected_songs)} 首", fg='#00cc66'))
                        root.after(800, lambda: threading.Thread(target=load_my_playlists, daemon=True).start())
                    else:
                        # 提取详细错误信息（含"绑定手机号"等业务提示）
                        detail = d.get('message') or d.get('msg') or ''
                        inner_data = d.get('data') or d.get('body')
                        if isinstance(inner_data, dict):
                            detail = inner_data.get('message') or inner_data.get('msg') or detail
                        if not detail:
                            detail = f'code={code}'
                        root.after(0, lambda: st.config(text=f"删除失败: {detail}", fg='#cc4444'))
                except Exception as e:
                    root.after(0, lambda: st.config(text=f"删除异常: {e}", fg='#cc4444'))
            threading.Thread(target=_bg, daemon=True).start()
        
        def pd_import_selected():
            # 导入选中：把左侧栏选中的歌曲（本地）添加到当前网易云歌单（云端）
            if not selected_paths:
                st.config(text="请先在左侧栏选择要导入的本地歌曲", fg='#cc4444')
                return
            st.config(text=f"正在导入 {len(selected_paths)} 首...", fg=ACCENT)
            def _bg():
                bindings = load_netease_bindings()
                added = 0
                failed = 0
                fail_reasons = []
                for p in selected_paths:
                    nid = bindings.get(p, '')
                    if not nid:
                        failed += 1
                        fail_reasons.append(f"{os.path.basename(p)}: 未绑定网易云ID")
                        continue
                    try:
                        r = _api_get(f"/playlist/tracks?op=add&pid={plid}&tracks={nid}")
                        d = r.json()
                        code = _get_api_code(d)
                        if code == 200:
                            added += 1
                        else:
                            failed += 1
                            inner_data = d.get('data') or d.get('body') or {}
                            detail = (d.get('message') or d.get('msg') or
                                     (inner_data.get('message') if isinstance(inner_data, dict) else '') or
                                     f'code={code}')
                            fail_reasons.append(f"{os.path.basename(p)}: {detail}")
                    except Exception as e:
                        failed += 1
                        fail_reasons.append(f"{os.path.basename(p)}: {e}")
                msg = f"✓ 已添加 {added} 首"
                if failed > 0:
                    msg += f"，{failed} 首失败"
                    if fail_reasons:
                        msg += '\n' + '\n'.join(fail_reasons[:3])
                        if len(fail_reasons) > 3:
                            msg += f'\n...等共{len(fail_reasons)}条'
                root.after(0, lambda: st.config(text=msg, fg='#00cc66'))
            threading.Thread(target=_bg, daemon=True).start()
        
        def pd_import_to_destination():
            """智能导入：已有本地歌曲直接关联，没有则下载"""
            try:
                # 预加载本地状态
                all_paths = scan_audio_files(MUSIC_DIR)
                bindings = load_netease_bindings()
                pl_names = [os.path.splitext(os.path.basename(f))[0] for f in get_playlist_files()]
                block_names = [b.get('name') if isinstance(b, dict) else b for b in blocks]
                genre_names = list(genres)
                
                import_dialog = tk.Toplevel(root)
                import_dialog.title("选择导入目标")
                import_dialog.geometry("400x380")
                import_dialog.configure(bg=PANEL_BG)
                tk.Label(import_dialog, text="选择导入目标（已有歌曲将跳过下载直接关联）：", bg=PANEL_BG, fg='white',
                        font=('微软雅黑', 10)).pack(padx=10, pady=(10, 5))
                target_var = tk.StringVar(value="local_playlist")
                tk.Radiobutton(import_dialog, text="本地歌单", variable=target_var,
                              value="local_playlist", bg=PANEL_BG, fg='white',
                              selectcolor=CARD_BG).pack(anchor=tk.W, padx=20)
                tk.Radiobutton(import_dialog, text="块（Block）", variable=target_var,
                              value="block", bg=PANEL_BG, fg='white',
                              selectcolor=CARD_BG).pack(anchor=tk.W, padx=20)
                tk.Radiobutton(import_dialog, text="流派（Genre）", variable=target_var,
                              value="genre", bg=PANEL_BG, fg='white',
                              selectcolor=CARD_BG).pack(anchor=tk.W, padx=20)
                
                # 目标选择下拉框
                sub_frame = Frame(import_dialog, bg=PANEL_BG)
                sub_frame.pack(fill=tk.X, padx=20, pady=(6, 10))
                tk.Label(sub_frame, text="目标名称：", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9)).pack(side=tk.LEFT)
                sub_var = tk.StringVar()
                sub_cb = ttk.Combobox(sub_frame, textvariable=sub_var, width=22, state='readonly')
                sub_cb.pack(side=tk.LEFT, padx=4)
                # 新建目标
                new_var = tk.StringVar()
                tk.Label(sub_frame, text="或新建：", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9)).pack(side=tk.LEFT, padx=(8, 0))
                new_entry = Entry(sub_frame, textvariable=new_var, font=('微软雅黑', 9), bg='#111111', fg='white',
                                 insertbackground='white', relief='solid', bd=1, width=12)
                new_entry.pack(side=tk.LEFT, padx=4)
                
                def _update_sub_list(*args):
                    t = target_var.get()
                    if t == 'local_playlist':
                        sub_cb['values'] = pl_names
                    elif t == 'block':
                        sub_cb['values'] = block_names
                    elif t == 'genre':
                        sub_cb['values'] = genre_names
                    if sub_cb['values']:
                        sub_cb.current(0)
                target_var.trace('w', _update_sub_list)
                _update_sub_list()
                
                def do_import():
                    target = target_var.get()
                    target_name = new_var.get().strip() or sub_var.get()
                    if not target_name:
                        st.config(text="请选择或输入目标名称", fg='#cc4444')
                        return
                    import_dialog.destroy()
                    st.config(text=f"正在智能导入到「{target_name}」...", fg=ACCENT)
                    def _bg():
                        nonlocal all_paths, bindings
                        # 刷新最新状态
                        all_paths = scan_audio_files(MUSIC_DIR)
                        bindings = load_netease_bindings()
                        exist_count = 0
                        downloaded = 0
                        new_paths = []
                        for s in songs:
                            sid = s['id']
                            matched = None
                            # 1. 查找本地是否已有
                            for p in all_paths:
                                if bindings.get(p) == sid:
                                    matched = p; break
                            if not matched:
                                ar = s.get('artists', '')
                                target_str = f"{ar} - {s['name']}"
                                for p in all_paths:
                                    if os.path.splitext(os.path.basename(p))[0] == target_str:
                                        matched = p; break
                            if matched:
                                exist_count += 1
                                new_paths.append(matched)
                                continue
                            # 2. 不存在则下载
                            ok, fn, info = netease_download_song(sid, MUSIC_DIR, current_dl_br)
                            if ok:
                                sp = os.path.join(MUSIC_DIR, fn)
                                downloaded += 1
                                new_paths.append(sp)
                                # 下载元数据
                                lt = netease_fetch_lyrics(sid)
                                if lt:
                                    _save_netease_lyrics(sp, lt, s.get('artists', ''), s['name'])
                                bind_netease_song(sp, sid)
                                cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                                os.makedirs(cover_dir, exist_ok=True)
                                cp = os.path.join(cover_dir, f'{sid}.jpg')
                                if netease_fetch_cover(sid, cp):
                                    ratings[sp] = {**ratings.get(sp, {}), 'cover': cp}
                        
                        # 3. 将歌曲关联到目标
                        assigned = 0
                        if target == 'local_playlist':
                            pl_path = os.path.join(PLAYLIST_DIR, target_name + '.json')
                            if os.path.exists(pl_path):
                                try:
                                    with open(pl_path, 'r', encoding='utf-8') as f:
                                        pl_songs = json.load(f)
                                    if not isinstance(pl_songs, list):
                                        pl_songs = []
                                except:
                                    pl_songs = []
                            else:
                                pl_songs = []
                            for p in new_paths:
                                if p not in pl_songs:
                                    pl_songs.append(p)
                                    assigned += 1
                            with open(pl_path, 'w', encoding='utf-8') as f:
                                json.dump(pl_songs, f, ensure_ascii=False, indent=2)
                        elif target == 'block':
                            # 确保块存在
                            found = False
                            for i, b in enumerate(blocks):
                                bn = b.get('name') if isinstance(b, dict) else b
                                if bn == target_name:
                                    found = True; break
                            if not found:
                                blocks.append({'name': target_name, 'color': '#1e3a8a'})
                                save_json_file(BLOCKS_FILE, blocks)
                            for p in new_paths:
                                old = ratings.get(p, {})
                                old['block'] = target_name
                                ratings[p] = old
                                assigned += 1
                            save_ratings(ratings)
                        elif target == 'genre':
                            if target_name not in genres:
                                genres.append(target_name)
                                save_json_file(GENRES_FILE, genres)
                            for p in new_paths:
                                old = ratings.get(p, {})
                                old['genre'] = target_name
                                ratings[p] = old
                                assigned += 1
                            save_ratings(ratings)
                        
                        global audio_paths
                        audio_paths = scan_audio_files(MUSIC_DIR)
                        song_info_cache.clear()
                        root.after(0, lambda: refresh_song_library())
                        root.after(0, lambda: st.config(
                            text=f"「{target_name}」已存在 {exist_count} 首 · 下载 {downloaded} 首 · 关联 {assigned} 首",
                            fg='#00cc66'))
                    threading.Thread(target=_bg, daemon=True).start()
                ttk.Button(import_dialog, text="确认导入", command=do_import).pack(pady=15)
            except Exception as e:
                st.config(text=str(e), fg='#cc4444')
        
        # 第一行按钮
        if is_my:
            ttk.Button(btn_row1, text='🗑 删除选中', command=pd_delete_selected).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
            ttk.Button(btn_row1, text='📥 导入选中', command=pd_import_selected).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
        else:
            def pd_import_all_songs():
                st.config(text=f"正在智能导入 {len(songs)} 首...", fg=ACCENT)
                def _bg():
                    all_paths = scan_audio_files(MUSIC_DIR)
                    bindings = load_netease_bindings()
                    exist_count = 0
                    downloaded = 0
                    for s in songs:
                        sid = s['id']
                        matched = None
                        for p in all_paths:
                            if bindings.get(p) == sid:
                                matched = p; break
                        if not matched:
                            ar = s.get('artists', '')
                            target_str = f"{ar} - {s['name']}"
                            for p in all_paths:
                                if os.path.splitext(os.path.basename(p))[0] == target_str:
                                    matched = p; break
                        if matched:
                            exist_count += 1
                            continue
                        try:
                            ok, fn, info = netease_download_song(sid, MUSIC_DIR, current_dl_br)
                            if ok:
                                sp = os.path.join(MUSIC_DIR, fn)
                                downloaded += 1
                                lt = netease_fetch_lyrics(sid)
                                if lt:
                                    _save_netease_lyrics(sp, lt, s.get('artists', ''), s['name'])
                                bind_netease_song(sp, sid)
                                cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                                os.makedirs(cover_dir, exist_ok=True)
                                cp = os.path.join(cover_dir, f'{sid}.jpg')
                                if netease_fetch_cover(sid, cp):
                                    ratings[sp] = {**ratings.get(sp, {}), 'cover': cp}
                                    save_ratings(ratings)
                        except:
                            pass
                    global audio_paths
                    audio_paths = scan_audio_files(MUSIC_DIR)
                    song_info_cache.clear()
                    root.after(0, lambda: refresh_song_library())
                    root.after(0, lambda: st.config(
                        text=f"✓ 已存在 {exist_count} 首 · 下载 {downloaded} 首", fg='#00cc66'))
                threading.Thread(target=_bg, daemon=True).start()
            
            ttk.Button(btn_row1, text='📥 导入全部', command=pd_import_all_songs).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
            ttk.Button(btn_row1, text='📀 批量下载', command=pd_import_all_songs).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
        
        btn_row1.pack(fill=tk.X, padx=4, pady=(6, 2))
        
        # 第二行按钮
        ttk.Button(btn_row2, text='📍 导入到', command=pd_import_to_destination).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
        ttk.Button(btn_row2, text='ℹ️ 歌单详情', 
                   command=lambda: messagebox.showinfo('歌单信息',
                       f'歌单名称：{plname}\n歌曲数量：{len(songs)}\n歌单ID：{plid}')).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
        
        btn_row2.pack(fill=tk.X, padx=4, pady=(2, 6))
        
        # 显示按钮栏
        view_btn_bar.pack(fill=tk.X)

    # ---- 每日推荐歌曲 ----
    def _show_daily_songs(songs, source_name):
        for w in nc_ct.winfo_children():
            w.destroy()
        view_btn_bar.pack_forget()  # 隐藏查看歌曲按钮栏
        if not songs:
            st.config(text="歌单中无歌曲", fg=MUTED); return
        st.config(text=f"「{source_name}」共 {len(songs)} 首", fg='#00cc66')
        for i, s in enumerate(songs):
            row_bg = CARD_BG if i % 2 == 0 else CARD_ALTERNATE
            card = Frame(nc_ct, bg=row_bg)
            card.pack(fill=tk.X, pady=1, padx=2)
            fee_map = {0: ('免费', '#00cc66'), 1: ('VIP', '#e6a817'), 4: ('VIP', '#e6a817'), 8: ('付费', '#cc4444')}
            fl, fc = fee_map.get(s.get('fee', 0), ('', MUTED))
            dur_s = f"{s['duration'] // 60}:{s['duration'] % 60:02d}" if s['duration'] else "??:??"
            r1 = Frame(card, bg=row_bg)
            r1.pack(fill=tk.X, padx=6, pady=(3, 1))
            tk.Label(r1, text=f"#{i + 1} {s['name']}", bg=row_bg, fg='white',
                     font=('微软雅黑', 9, 'bold'), anchor='w').pack(side=tk.LEFT)
            tk.Label(r1, text=fl, bg=row_bg, fg=fc, font=('微软雅黑', 7, 'bold')).pack(side=tk.RIGHT)
            r2 = Frame(card, bg=row_bg)
            r2.pack(fill=tk.X, padx=6, pady=(0, 3))
            tk.Label(r2, text=f"👤 {s.get('artists', '')}  |  💿 {s.get('album', '')}  |  ⏱ {dur_s}",
                     bg=row_bg, fg=MUTED, font=('微软雅黑', 8)).pack(side=tk.LEFT)
            ttk.Button(card, text='📥 下载单曲', style='Small.TButton',
                       command=lambda sid=s['id'], nm=s['name'], ar=s.get('artists', ''):
                           _download_single(sid, nm, ar)).pack(fill=tk.X, padx=6, pady=(0, 4))

    # ---- 单曲下载 ----
    def _download_single(sid, name, artists):
        st.config(text=f"下载中: {artists} - {name}...", fg=ACCENT)
        def _bg():
            try:
                ok, fn, info = netease_download_song(sid, MUSIC_DIR, current_dl_br)
                if ok:
                    sp = os.path.join(MUSIC_DIR, fn)
                    lt = netease_fetch_lyrics(sid)
                    if lt:
                        _save_netease_lyrics(sp, lt, artists, name)
                    bind_netease_song(sp, sid)
                    cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                    os.makedirs(cover_dir, exist_ok=True)
                    cp = os.path.join(cover_dir, f'{sid}.jpg')
                    if netease_fetch_cover(sid, cp):
                        ratings[sp] = {**ratings.get(sp, {}), 'cover': cp}
                        save_ratings(ratings)
                    global audio_paths
                    audio_paths = scan_audio_files(MUSIC_DIR)
                    song_info_cache.clear()
                    root.after(0, lambda: refresh_song_library())
                    root.after(0, lambda: st.config(text=f"✅ 已下载: {artists} - {name}", fg='#00cc66'))
                else:
                    root.after(0, lambda: st.config(text=f"下载失败: {info}", fg='#cc4444'))
            except Exception as e:
                root.after(0, lambda: st.config(text=str(e), fg='#cc4444'))
        threading.Thread(target=_bg, daemon=True).start()

    # ---- 导入全部到本地歌单 ----
    def import_netease_playlist(plid, plname):
        for w in nc_ct.winfo_children():
            w.destroy()
        view_btn_bar.pack_forget()
        st.config(text=f"正在导入「{plname}」...", fg=ACCENT)
        threading.Thread(target=lambda: _do_import_playlist(plid, plname), daemon=True).start()

    def _do_import_playlist(plid, plname):
        try:
            r = _api_get(f"/playlist/detail?id={plid}")
            d = r.json()
            if d.get("code") != 200 or not d.get("playlist"):
                root.after(0, lambda: st.config(text="加载歌单详情失败", fg='#cc4444'))
                return
            tracks = d["playlist"].get("tracks", [])
            if not tracks:
                root.after(0, lambda: st.config(text="歌单中无歌曲", fg=MUTED)); return
            pl_path = os.path.join(PLAYLIST_DIR, plname + '.json')
            if os.path.exists(pl_path):
                try:
                    with open(pl_path, 'r', encoding='utf-8') as f:
                        existing = json.load(f)
                    pl_songs = existing if isinstance(existing, list) else []
                except:
                    pl_songs = []
            else:
                pl_songs = []
            bindings = load_netease_bindings()
            all_paths = scan_audio_files(MUSIC_DIR)
            new_songs = []
            exist_count = 0
            for t in tracks:
                sid = str(t.get('id', ''))
                matched = None
                for p in all_paths:
                    if bindings.get(p) == sid:
                        matched = p; break
                if not matched:
                    ar = '/'.join([a['name'] for a in t.get('ar', [])])
                    target = f"{ar} - {t.get('name', '')}"
                    for p in all_paths:
                        if os.path.splitext(os.path.basename(p))[0] == target:
                            matched = p; break
                if matched:
                    if matched not in pl_songs:
                        pl_songs.append(matched)
                        new_songs.append(matched)
                    exist_count += 1
                    continue
                try:
                    ok, fn, info = netease_download_song(sid, MUSIC_DIR, current_dl_br)
                    if ok:
                        sp = os.path.join(MUSIC_DIR, fn)
                        pl_songs.append(sp)
                        new_songs.append(sp)
                        lt = netease_fetch_lyrics(sid)
                        if lt:
                            _save_netease_lyrics(sp, lt,
                                '/'.join([a['name'] for a in t.get('ar', [])]),
                                t.get('name', ''))
                        bind_netease_song(sp, sid)
                        cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                        os.makedirs(cover_dir, exist_ok=True)
                        cp = os.path.join(cover_dir, f'{sid}.jpg')
                        if netease_fetch_cover(sid, cp):
                            ratings[sp] = {**ratings.get(sp, {}), 'cover': cp}
                            save_ratings(ratings)
                except:
                    pass
            with open(pl_path, 'w', encoding='utf-8') as f:
                json.dump(pl_songs, f, ensure_ascii=False, indent=2)
            global audio_paths
            audio_paths = scan_audio_files(MUSIC_DIR)
            song_info_cache.clear()
            root.after(0, lambda: refresh_song_library())
            root.after(0, lambda: refresh_local_playlists())
            root.after(0, lambda: st.config(
                text=f"「{plname}」新增 {len(new_songs)} 首 · 已存在 {exist_count} 首", fg='#00cc66'))
        except Exception as e:
            root.after(0, lambda: st.config(text=str(e), fg='#cc4444'))

    # ---- 上传本地歌曲到网易云歌单 ----
    def upload_local_to_netease(plid, plname):
        """从本地歌单（同名或手动选）上传歌曲ID到网易云歌单"""
        # 弹窗选歌曲来源
        dialog = tk.Toplevel(root)
        dialog.title(f'上传到「{plname}」')
        dialog.geometry('500x400')
        dialog.configure(bg=PANEL_BG)
        dialog.transient(root)
        dialog.grab_set()

        tk.Label(dialog, text=f'上传本地歌曲到网易云歌单「{plname}」', bg=PANEL_BG, fg='white',
                 font=('微软雅黑', 10, 'bold')).pack(pady=10)

        # 来源选择
        src_label = tk.Label(dialog, text='选择来源：', bg=PANEL_BG, fg='white', font=('微软雅黑', 9))
        src_label.pack(anchor='w', padx=12)

        src_var2 = tk.StringVar(value='从本地歌单')
        src_frame2 = Frame(dialog, bg=PANEL_BG)
        src_frame2.pack(fill=tk.X, padx=12, pady=4)
        src_combo = ttk.Combobox(src_frame2, values=['从本地歌单', '从全部本地歌曲'],
                                 textvariable=src_var2, width=20, state='readonly')
        src_combo.pack(side=tk.LEFT)

        # 本地歌单列表
        list_frame = Frame(dialog, bg=PANEL_BG)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=6)

        lb = tk.Listbox(list_frame, bg=CARD_BG, fg='white', selectbackground=ACCENT,
                        font=('微软雅黑', 10), activestyle='none')
        lb.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb = ttk.Scrollbar(list_frame, orient='vertical', command=lb.yview)
        lb.configure(yscrollcommand=sb.set)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        def refresh_src():
            lb.delete(0, tk.END)
            if src_var2.get() == '从本地歌单':
                files = get_playlist_files()
                for fp in files:
                    name = os.path.splitext(os.path.basename(fp))[0]
                    lb.insert(tk.END, f"📋 {name}")
            else:
                for p in scan_audio_files(MUSIC_DIR):
                    info = load_song_info(p)
                    title = info.get('title') if info else os.path.basename(p)
                    lb.insert(tk.END, title)

        src_combo.bind('<<ComboboxSelected>>', lambda e: refresh_src())
        refresh_src()

        status_dlg = tk.Label(dialog, text='', bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
        status_dlg.pack(pady=4)

        def do_upload():
            sel = lb.curselection()
            if src_var2.get() == '从本地歌单':
                if not sel:
                    status_dlg.config(text='请先选择一个本地歌单', fg='#cc4444'); return
                idx = sel[0]
                files = get_playlist_files()
                fp = files[idx]
                try:
                    with open(fp, 'r', encoding='utf-8') as f:
                        songs = json.load(f)
                except:
                    status_dlg.config(text='读取歌单失败', fg='#cc4444'); return
                paths = songs if isinstance(songs, list) else []
            else:
                paths = scan_audio_files(MUSIC_DIR)

            bindings = load_netease_bindings()
            ids_to_add = []
            skipped = 0
            for p in paths:
                nid = bindings.get(p, '')
                if nid:
                    ids_to_add.append(nid)
                else:
                    skipped += 1

            if not ids_to_add:
                status_dlg.config(text=f'无已绑定的歌曲（{skipped}首未绑定）', fg='#cc4444'); return

            status_dlg.config(text=f'上传 {len(ids_to_add)} 首中...', fg=ACCENT)
            dialog.update_idletasks()

            def _bg_upload():
                try:
                    ids_str = ','.join(ids_to_add)
                    r = _api_get(f"/playlist/tracks?op=add&pid={plid}&tracks={ids_str}")
                    d = r.json()
                    code = _get_api_code(d)
                    if code == 200 or d.get("status") == 200:
                        msg = f'✅ 已上传 {len(ids_to_add)} 首'
                        if skipped:
                            msg += f'（{skipped}首未绑定已跳过）'
                        root.after(0, lambda: status_dlg.config(text=msg, fg='#00cc66'))
                    else:
                        inner_data = d.get('data') or d.get('body') or {}
                        detail = (d.get('message') or d.get('msg') or
                                 (inner_data.get('message') if isinstance(inner_data, dict) else '') or
                                 f'code={code}')
                        root.after(0, lambda: status_dlg.config(
                            text=f'上传失败: {detail}', fg='#cc4444'))
                except Exception as e:
                    root.after(0, lambda: status_dlg.config(text=str(e), fg='#cc4444'))
            threading.Thread(target=_bg_upload, daemon=True).start()

        btn_frame_dlg = Frame(dialog, bg=PANEL_BG)
        btn_frame_dlg.pack(pady=10)
        ttk.Button(btn_frame_dlg, text='⬆️ 上传到网易云', command=do_upload,
                   style='Accent.TButton').pack(side=tk.LEFT, padx=6)
        ttk.Button(btn_frame_dlg, text='关闭', command=dialog.destroy).pack(side=tk.LEFT, padx=6)

    # 初始加载
    refresh_netease_view()
    refresh_local_playlists()


# ==================== 歌单详情编辑面板（块详情风格） ====================
def open_playlist_detail(name):
    """打开歌单详情编辑器"""
    editor_mode.set('歌单编辑')
    playlist_panel.pack_forget()
    playlist_editor_panel.pack_forget()
    song_edit_panel.pack_forget()
    filter_panel.pack_forget()
    comments_panel.pack_forget()
    netease_search_panel.pack_forget()
    netease_panel.pack_forget()
    daily_panel.pack_forget()
    lyrics_panel.pack_forget()
    blocks_panel.pack_forget()
    genres_panel.pack_forget()
    settings_panel.pack_forget()
    block_editor_panel.pack_forget()
    genre_editor_panel.pack_forget()
    build_playlist_detail(name)
    playlist_detail_panel.pack(fill=tk.BOTH, expand=True)


def build_playlist_detail(name):
    """构建歌单详情编辑器（与块编辑器完全一致的交互逻辑）"""
    for w in playlist_detail_panel.winfo_children():
        w.destroy()

    pl_path = os.path.join(PLAYLIST_DIR, name + '.json')

    header = Frame(playlist_detail_panel, bg=ACCENT)
    header.pack(fill=tk.X, pady=0)
    back_btn = ttk.Button(header, text='✕', width=3, command=lambda: switch_editor('日推'))
    back_btn.pack(side=tk.LEFT, padx=6, pady=4)
    tk.Label(header, text=f"📋 歌单：{name}", font=FONT_TITLE, bg=ACCENT, fg='white').pack(side=tk.LEFT, pady=4)

    try:
        with open(pl_path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        pl_songs = raw if isinstance(raw, list) else []
    except:
        pl_songs = []

    pl_songs = [p for p in pl_songs if os.path.exists(p)]

    def save_playlist():
        with open(pl_path, 'w', encoding='utf-8') as f:
            json.dump(pl_songs, f, ensure_ascii=False, indent=2)

    pd_drag = {"widget": None, "index": None}
    pd_selected = set()
    pd_select_state = {'all': False}

    lb = tk.Listbox(playlist_detail_panel, width=40, height=14, bg=CARD_BG, fg=TEXT,
                    selectbackground=ACCENT, selectforeground='white',
                    font=('微软雅黑', 10), activestyle='none')
    lb.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

    def refresh_listbox():
        lb.delete(0, tk.END)
        for p in pl_songs:
            info = load_song_info(p)
            title = info.get('title') if info else os.path.basename(p)
            lb.insert(tk.END, title)
        try:
            lb.selection_clear(0, tk.END)
        except:
            pass
        for idx in list(pd_selected):
            if 0 <= idx < len(pl_songs):
                try:
                    lb.selection_set(idx)
                except:
                    pass

    def pd_on_button_press(event):
        idx = lb.nearest(event.y)
        if idx >= 0:
            pd_drag['widget'] = lb
            pd_drag['index'] = idx

    def pd_on_motion(event):
        w = pd_drag.get('widget')
        if not w:
            return
        idx = w.nearest(event.y)
        try:
            w.selection_clear(0, tk.END)
            w.selection_set(idx)
        except:
            pass

    def pd_on_button_release(event):
        src = pd_drag.get('index')
        w = pd_drag.get('widget')
        if w is None or src is None:
            return
        dst = w.nearest(event.y)
        if dst < 0 or dst == src:
            pd_drag['widget'] = None
            pd_drag['index'] = None
            return
        item = pl_songs.pop(src)
        pl_songs.insert(dst, item)
        save_playlist()
        refresh_listbox()
        pd_drag['widget'] = None
        pd_drag['index'] = None

    def pd_toggle_selection(event):
        idx = lb.nearest(event.y)
        if idx < 0:
            return 'break'
        if idx in pd_selected:
            pd_selected.remove(idx)
            try:
                lb.selection_clear(idx)
            except:
                pass
        else:
            pd_selected.add(idx)
            try:
                lb.selection_set(idx)
            except:
                pass
        pd_select_state['all'] = len(pd_selected) == len(pl_songs)
        pd_on_button_press(event)
        return 'break'

    lb.bind('<Button-1>', pd_toggle_selection)
    lb.bind('<B1-Motion>', pd_on_motion)
    lb.bind('<ButtonRelease-1>', pd_on_button_release)

    btn_row1 = Frame(playlist_detail_panel, bg=PANEL_BG)
    btn_row1.pack(fill=tk.X, pady=(6, 2), padx=8)
    btn_row2 = Frame(playlist_detail_panel, bg=PANEL_BG)
    btn_row2.pack(fill=tk.X, pady=(2, 6), padx=8)

    def pd_select_all():
        if pd_select_state['all']:
            pd_selected.clear()
            pd_select_state['all'] = False
        else:
            pd_selected.clear()
            for i in range(len(pl_songs)):
                pd_selected.add(i)
            pd_select_state['all'] = True
        refresh_listbox()

    def pd_remove_selected():
        if not pd_selected:
            messagebox.showwarning('未选择', '请先选择要移除的曲目')
            return
        indices = sorted(list(pd_selected), reverse=True)
        for idx in indices:
            if 0 <= idx < len(pl_songs):
                pl_songs.pop(idx)
        save_playlist()
        pd_selected.clear()
        pd_select_state['all'] = False
        refresh_listbox()

    def pd_add_from_left():
        """从左边栏添加歌曲到歌单 - 只接受已绑定网易云ID的歌曲"""
        if not selected_paths:
            messagebox.showwarning('未选择', '请先在左边栏选择要添加的曲目')
            return
        bindings = load_netease_bindings()
        added = 0
        skipped = 0
        for p in selected_paths:
            if p in pl_songs:
                continue
            nid = bindings.get(p, '')
            if not nid:
                skipped += 1
                continue
            pl_songs.append(p)
            added += 1
        if added:
            save_playlist()
            refresh_listbox()
            msg = f'已添加 {added} 首'
            if skipped:
                msg += f'，跳过 {skipped} 首（未绑定网易云ID）'
            messagebox.showinfo('完成', msg)
        else:
            if skipped:
                messagebox.showwarning('提示', f'选中的 {skipped} 首均未绑定网易云ID，无法添加。请先在「歌曲编辑」页面绑定')
            else:
                messagebox.showinfo('提示', '选中歌曲已在歌单中')

    def pd_add_to_queue():
        if not pd_selected:
            messagebox.showwarning('未选择', '请先选择歌曲')
            return
        global playlist
        added = 0
        for idx in sorted(pd_selected):
            if 0 <= idx < len(pl_songs):
                p = pl_songs[idx]
                if p not in playlist:
                    playlist.append(p)
                    added += 1
        if added:
            update_playlist_listbox()
        pd_select_state['all'] = False
        messagebox.showinfo('已添加', f'已将 {added} 首添加到播放列表')

    def pd_import_netease():
        url = simpledialog.askstring('从网易云导入', '粘贴网易云歌单链接或歌单ID：')
        if not url: return
        import re
        m = re.search(r'[?&]id=(\d+)', url) or re.search(r'(\d{5,})', url)
        if not m:
            messagebox.showerror('错误', '无法识别歌单ID')
            return
        plid = m.group(1)
        def _bg():
            try:
                r = _api_get(f'/playlist/detail?id={plid}')
                d = r.json()
                if d.get('code') != 200 or not d.get('playlist'):
                    root.after(0, lambda: messagebox.showerror('错误', '获取歌单详情失败'))
                    return
                tracks = d['playlist'].get('tracks', [])
                if not tracks:
                    root.after(0, lambda: messagebox.showinfo('提示', '歌单中无歌曲'))
                    return
                bindings = load_netease_bindings()
                all_paths = scan_audio_files(MUSIC_DIR)
                new_songs = []
                exist_count = 0
                for t in tracks:
                    sid = str(t.get('id', ''))
                    matched = None
                    for p in all_paths:
                        if bindings.get(p) == sid:
                            matched = p; break
                    if not matched:
                        ar = '/'.join([a['name'] for a in t.get('ar', [])])
                        target = f"{ar} - {t.get('name', '')}"
                        for p in all_paths:
                            if os.path.splitext(os.path.basename(p))[0] == target:
                                matched = p; break
                    if matched:
                        if matched not in pl_songs:
                            pl_songs.append(matched)
                            new_songs.append(matched)
                        exist_count += 1
                        continue
                    try:
                        ok, fn, info = netease_download_song(sid, MUSIC_DIR, current_dl_br)
                        if ok:
                            sp = os.path.join(MUSIC_DIR, fn)
                            pl_songs.append(sp)
                            new_songs.append(sp)
                            lt = netease_fetch_lyrics(sid)
                            if lt:
                                _save_netease_lyrics(sp, lt,
                                    '/'.join([a['name'] for a in t.get('ar', [])]),
                                    t.get('name', ''))
                            bind_netease_song(sp, sid)
                            cover_dir = os.path.join(BASE_DIR, 'source', 'covers')
                            os.makedirs(cover_dir, exist_ok=True)
                            cp = os.path.join(cover_dir, f'{sid}.jpg')
                            if netease_fetch_cover(sid, cp):
                                ratings[sp] = {**ratings.get(sp, {}), 'cover': cp}
                                save_ratings(ratings)
                    except:
                        pass
                save_playlist()
                global audio_paths
                audio_paths = scan_audio_files(MUSIC_DIR)
                song_info_cache.clear()
                root.after(0, lambda: refresh_song_library())
                root.after(0, lambda: refresh_listbox())
                root.after(0, lambda: messagebox.showinfo(
                    '完成',
                    f'歌单「{name}」新增 {len(new_songs)} 首 · 已存在 {exist_count} 首'))
            except Exception as e:
                root.after(0, lambda: messagebox.showerror('错误', str(e)))
        threading.Thread(target=_bg, daemon=True).start()

    ttk.Button(btn_row1, text='全选', command=pd_select_all).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(btn_row1, text='移除选中', command=pd_remove_selected).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

    ttk.Button(btn_row2, text='从左边栏添加', command=pd_add_from_left).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(btn_row2, text='▶ 添加到播放列表', command=pd_add_to_queue).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
    ttk.Button(btn_row2, text='☁️ 从网易云导入', command=pd_import_netease,
               style='Accent.TButton').pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)

    refresh_listbox()



def build_settings_panel():
    """构建设置面板"""
    for w in settings_panel.winfo_children():
        w.destroy()
    
    # 创建可滚动画布
    settings_canvas = Canvas(settings_panel, bg=PANEL_BG, highlightthickness=0)
    settings_scrollbar = ttk.Scrollbar(settings_panel, orient='vertical', command=settings_canvas.yview)
    settings_canvas.configure(yscrollcommand=settings_scrollbar.set)
    settings_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    settings_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    
    settings_container = Frame(settings_canvas, bg=PANEL_BG)
    settings_canvas.create_window((0, 0), window=settings_container, anchor='nw')
    settings_container.bind('<Configure>', lambda e: settings_canvas.configure(scrollregion=settings_canvas.bbox('all')))
    def _st_resize(event):
        settings_canvas.itemconfig(1, width=event.width)
    settings_canvas.bind('<Configure>', _st_resize)
    def _st_mousewheel(event):
        settings_canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')
        return 'break'
    settings_canvas.bind('<MouseWheel>', _st_mousewheel)
    settings_container.bind('<MouseWheel>', _st_mousewheel)
    
    # Enhanced header for settings
    header_settings = Frame(settings_container, bg=ACCENT)
    header_settings.pack(fill=tk.X, pady=(0, 6))
    tk.Label(header_settings, text="⚙️ 设置", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4)
    row = Frame(settings_container, bg=CARD_BG)
    row.pack(fill=tk.X, pady=4, padx=6)
    tk.Label(row, text="后端：", font=FONT_MAIN, bg=CARD_BG, fg=TEXT).pack(side=tk.LEFT)
    global backend_var, backend_menu_widget
    backend_var = tk.StringVar(value=backend)
    vals = ['vlc'] + (['pygame'] if pygame_available else [])
    backend_display = tk.Label(row, textvariable=backend_var, bg=CARD_BG, fg=TEXT, padx=10, pady=4)
    backend_display.pack(side=tk.LEFT, padx=6)
    backend_menu_widget = tk.Menu(row, tearoff=0, bg=TROUGH, fg='white')
    for v in vals:
        def _make_cmd(val):
            return lambda: backend_var.set(val)
        backend_menu_widget.add_command(label=v, command=_make_cmd(v))
    def show_backend_menu(event=None):
        try:
            x = backend_display.winfo_rootx()
            y = backend_display.winfo_rooty() + backend_display.winfo_height()
            backend_menu_widget.tk_popup(x, y)
        finally:
            backend_menu_widget.grab_release()
    backend_display.bind('<Button-1>', show_backend_menu)
    def apply_backend():
        val = backend_var.get()
        if val == 'pygame' and not pygame_available:
            messagebox.showerror('错误', '未检测到 pygame，可通过 pip install pygame 安装')
            return
        global backend
        backend = val
        messagebox.showinfo('已应用', f'后端已切换为 {backend}')
    ttk.Button(settings_container, text='应用', command=apply_backend, style='Accent.TButton').pack(pady=8, padx=24, fill=tk.X)
    
    # Separator
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # 工具按钮分组
    tool_frame = ttk.LabelFrame(settings_container, text="工具", padding=8)
    tool_frame.pack(fill=tk.X, padx=8, pady=4)
    
    def rescan_music():
        global audio_paths
        audio_paths = scan_audio_files(MUSIC_DIR)
        song_info_cache.clear()
        refresh_song_library()
        messagebox.showinfo('已刷新', '音乐库已刷新')
    ttk.Button(tool_frame, text='🔄 刷新歌曲库', command=rescan_music).pack(fill=tk.X, pady=2)
    ttk.Button(tool_frame, text='📝 批量导入歌词', command=batch_import_lyrics).pack(fill=tk.X, pady=2)
    
    def open_batch_delete_dialog():
        """打开批量删除对话框 - 删除左边栏选中的歌曲"""
        global audio_paths, selected_paths
        
        if not selected_paths:
            messagebox.showinfo('提示', '请先在左边栏选择要删除的歌曲（Ctrl+点击多选）')
            return
        
        delete_window = tk.Toplevel(root)
        delete_window.title("批量删除歌曲")
        delete_window.geometry("500x500")
        delete_window.configure(bg=PANEL_BG)
        
        # 标题
        tk.Label(delete_window, text=f"已选中 {len(selected_paths)} 首歌曲（左边栏选中），确认删除？", 
                bg=PANEL_BG, fg='#ff6666', font=('微软雅黑', 10, 'bold')).pack(padx=10, pady=(10, 5))
        
        # 将selected_paths转为有序列表便于显示
        sel_list = list(selected_paths)
        delete_checked = set(range(len(sel_list)))  # 默认全部勾选
        delete_all_var = tk.BooleanVar(value=True)
        
        # 按钮栏
        btn_row = Frame(delete_window, bg=PANEL_BG)
        btn_row.pack(fill=tk.X, padx=10, pady=(0, 5))
        
        def _toggle_all():
            if delete_all_var.get():
                delete_checked.update(range(len(sel_list)))
            else:
                delete_checked.clear()
            delete_all_var.set(len(delete_checked) == len(sel_list))
            refresh_listbox()
        
        select_all_btn = ttk.Checkbutton(btn_row, text='全选', variable=delete_all_var, command=_toggle_all)
        select_all_btn.pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text='清空选择', 
                  command=lambda: (delete_checked.clear(), delete_all_var.set(False), refresh_listbox())).pack(side=tk.LEFT, padx=4)
        
        # 列表框
        list_frame = Frame(delete_window, bg=PANEL_BG)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        delete_listbox = tk.Listbox(list_frame, bg=CARD_BG, fg=TEXT, 
                                   selectbackground=ACCENT, selectforeground='white',
                                   font=('微软雅黑', 9), activestyle='none')
        delete_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        delete_scrollbar = ttk.Scrollbar(list_frame, orient='vertical', command=delete_listbox.yview)
        delete_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        delete_listbox.config(yscrollcommand=delete_scrollbar.set)
        
        def refresh_listbox():
            delete_listbox.delete(0, tk.END)
            for i, p in enumerate(sel_list):
                info = load_song_info(p)
                title = info.get('title') if info else os.path.basename(p)
                prefix = '☑ ' if i in delete_checked else '☐ '
                delete_listbox.insert(tk.END, prefix + title)
            delete_listbox.selection_clear(0, tk.END)
            for idx in delete_checked:
                if 0 <= idx < len(sel_list):
                    delete_listbox.selection_set(idx)
            _update_btn_text()
        
        def _toggle_item(event):
            idx = delete_listbox.nearest(event.y)
            if idx < 0:
                return 'break'
            if idx in delete_checked:
                delete_checked.remove(idx)
            else:
                delete_checked.add(idx)
            delete_all_var.set(len(delete_checked) == len(sel_list))
            refresh_listbox()
            return 'break'
        
        delete_listbox.bind('<Button-1>', _toggle_item)
        
        # 删除按钮
        delete_btn_row = Frame(delete_window, bg=PANEL_BG)
        delete_btn_row.pack(fill=tk.X, padx=10, pady=(5, 10))
        
        def do_delete_selected():
            if not delete_checked:
                messagebox.showwarning('提示', '请先勾选要删除的歌曲')
                return
            if not messagebox.askyesno('确认', f'确定要删除勾选的 {len(delete_checked)} 首歌曲吗？\n（此操作不可恢复！）'):
                return
            deleted = 0
            for idx in sorted(delete_checked, reverse=True):
                if 0 <= idx < len(sel_list):
                    try:
                        p = sel_list[idx]
                        os.remove(p)
                        selected_paths.discard(p)
                        deleted += 1
                    except Exception as e:
                        print(f"删除失败 {sel_list[idx]}: {e}")
            if deleted > 0:
                new_audio_paths = scan_audio_files(MUSIC_DIR)
                audio_paths[:] = new_audio_paths
                song_info_cache.clear()
                refresh_song_library()
                messagebox.showinfo('完成', f'已删除 {deleted} 首歌曲')
                delete_window.destroy()
            else:
                messagebox.showerror('错误', '删除失败，请检查文件权限')
        
        del_btn = ttk.Button(delete_btn_row, text=f'🗑 确认删除 ({len(delete_checked)})', 
                  command=do_delete_selected, style='Danger.TButton')
        del_btn.pack(fill=tk.X)
        
        def _update_btn_text():
            del_btn.config(text=f'🗑 确认删除 ({len(delete_checked)})')
        
        ttk.Button(delete_btn_row, text='关闭', command=delete_window.destroy).pack(fill=tk.X, pady=(4, 0))
        
        refresh_listbox()
    
    ttk.Button(tool_frame, text='🗑 批量删除歌曲', command=open_batch_delete_dialog, style='Danger.TButton').pack(fill=tk.X, pady=2)
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # note display mode setting - 使用LabelFrame
    note_group = ttk.LabelFrame(settings_container, text="歌曲备注显示", padding=8)
    note_group.pack(fill=tk.X, padx=8, pady=4)
    
    note_display_var = tk.StringVar(value=note_display_mode)
    def save_note_setting():
        global note_display_mode
        note_display_mode = note_display_var.get()
        sync_config_to_disk()
        mode_text = {'expanded': '默认展开', 'folded': '默认折叠', 'note_only': '仅显示备注'}[note_display_mode]
        messagebox.showinfo('已保存', f'歌曲备注将{mode_text}')
        refresh_song_library(skip_rescan=True)
    
    note_frame = Frame(note_group, bg=PANEL_BG)
    note_frame.pack(fill=tk.X)
    tk.Radiobutton(note_frame, text='默认展开', variable=note_display_var, value='expanded', 
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_MAIN, activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    tk.Radiobutton(note_frame, text='默认折叠', variable=note_display_var, value='folded',
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_MAIN, activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    tk.Radiobutton(note_frame, text='仅显示备注', variable=note_display_var, value='note_only',
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_MAIN, activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    ttk.Button(note_group, text='保存', command=save_note_setting, style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # artist display setting - 使用LabelFrame
    artist_group = ttk.LabelFrame(settings_container, text="歌手显示", padding=8)
    artist_group.pack(fill=tk.X, padx=8, pady=4)
    
    artist_hidden_var = tk.BooleanVar(value=artist_hidden_default)
    def save_artist_setting():
        global artist_hidden_default
        artist_hidden_default = artist_hidden_var.get()
        sync_config_to_disk()
        messagebox.showinfo('已保存', f'歌手信息将{"隐藏" if artist_hidden_default else "显示"}')
        refresh_song_library()
    
    artist_frame = Frame(artist_group, bg=PANEL_BG)
    artist_frame.pack(fill=tk.X)
    tk.Radiobutton(artist_frame, text='显示歌手', variable=artist_hidden_var, value=False,
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_MAIN, activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    tk.Radiobutton(artist_frame, text='隐藏歌手', variable=artist_hidden_var, value=True,
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_MAIN, activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    ttk.Button(artist_group, text='保存', command=save_artist_setting, style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # 封面样式设置
    cover_group = ttk.LabelFrame(settings_container, text="封面样式", padding=8)
    cover_group.pack(fill=tk.X, padx=8, pady=4)
    
    cover_style_var = tk.StringVar(value=cover_style)
    def save_cover_style():
        global cover_style, cover_original_image, cover_rotation_angle
        cover_style = cover_style_var.get()
        sync_config_to_disk()
        cover_rotation_angle = 0.0
        messagebox.showinfo('已保存', f'封面样式已切换')
        # 刷新当前封面
        if current_playlist_index != -1 and playlist:
            cover_original_image = None
            song_info_cache.pop(playlist[current_playlist_index], None)
            update_ui_for_current_song()
    
    cover_frame = Frame(cover_group, bg=PANEL_BG)
    cover_frame.pack(fill=tk.X)
    tk.Radiobutton(cover_frame, text='🎵 圆形旋转', variable=cover_style_var, value='circle_rotate',
                   bg=PANEL_BG, fg='white', selectcolor=ACCENT, font=FONT_MAIN,
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=2)
    tk.Radiobutton(cover_frame, text='🔲 方形静态', variable=cover_style_var, value='square_static',
                   bg=PANEL_BG, fg='white', selectcolor=ACCENT, font=FONT_MAIN,
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=2)
    ttk.Button(cover_group, text='应用', command=save_cover_style, style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # 索引条显示设置
    index_group = ttk.LabelFrame(settings_container, text="索引条显示", padding=8)
    index_group.pack(fill=tk.X, padx=8, pady=4)
    
    index_headers_var = tk.BooleanVar(value=show_index_headers)
    def save_index_headers_setting():
        global show_index_headers
        show_index_headers = index_headers_var.get()
        sync_config_to_disk()
        messagebox.showinfo('已保存', f'索引条将{"显示" if show_index_headers else "隐藏"}')
        refresh_song_library()
    
    index_frame = Frame(index_group, bg=PANEL_BG)
    index_frame.pack(fill=tk.X)
    tk.Radiobutton(index_frame, text='显示索引条', variable=index_headers_var, value=True,
                   bg=PANEL_BG, fg='white', selectcolor=ACCENT, font=FONT_MAIN,
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    tk.Radiobutton(index_frame, text='隐藏索引条', variable=index_headers_var, value=False,
                   bg=PANEL_BG, fg='white', selectcolor=ACCENT, font=FONT_MAIN,
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=1)
    ttk.Button(index_group, text='保存', command=save_index_headers_setting, style='Accent.TButton').pack(fill=tk.X, pady=(4, 0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # 双语歌词设置
    lyric_group = ttk.LabelFrame(settings_container, text="歌词显示", padding=8)
    lyric_group.pack(fill=tk.X, padx=8, pady=4)
    lyric_bilingual_var = tk.BooleanVar(value=bilingual_lyrics)
    lyric_prefer_cn_var = tk.BooleanVar(value=prefer_chinese_lyrics)
    def save_lyric_setting():
        global bilingual_lyrics, prefer_chinese_lyrics
        bilingual_lyrics = lyric_bilingual_var.get()
        prefer_chinese_lyrics = lyric_prefer_cn_var.get()
        sync_config_to_disk()
        song_info_cache.clear()
        if current_playlist_index != -1 and playlist:
            update_ui_for_current_song()
        messagebox.showinfo('已保存', f"双语: {'开' if bilingual_lyrics else '关'}, 单语偏好: {'中文' if prefer_chinese_lyrics else '原文'}")
        refresh_song_library(skip_rescan=True)
    tk.Checkbutton(lyric_group, text='启用双语歌词（原文+翻译）', variable=lyric_bilingual_var,
                   bg=PANEL_BG, fg='white', selectcolor=CARD_BG, font=FONT_MAIN,
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(anchor='w', pady=2)
    cn_f = Frame(lyric_group, bg=PANEL_BG)
    cn_f.pack(fill=tk.X, pady=(4,0))
    tk.Label(cn_f, text='关闭双语时优先显示：', bg=PANEL_BG, fg='white', font=('微软雅黑',9)).pack(side=tk.LEFT)
    tk.Radiobutton(cn_f, text='中文', variable=lyric_prefer_cn_var, value=True,
                   bg=PANEL_BG, fg='white', selectcolor=ACCENT, font=('微软雅黑',9),
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(side=tk.LEFT, padx=4)
    tk.Radiobutton(cn_f, text='原文', variable=lyric_prefer_cn_var, value=False,
                   bg=PANEL_BG, fg='white', selectcolor=ACCENT, font=('微软雅黑',9),
                   activebackground=PANEL_BG, activeforeground=TEXT).pack(side=tk.LEFT, padx=4)
    ttk.Button(lyric_group, text='应用', command=save_lyric_setting, style='Accent.TButton').pack(fill=tk.X, pady=(4,0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # ── 主题设置 ──
    theme_group = ttk.LabelFrame(settings_container, text="🎨 主题配色", padding=8)
    theme_group.pack(fill=tk.X, padx=8, pady=4)
    
    theme_names = list(THEME_PRESETS.keys())
    theme_var = tk.StringVar(value=_current_theme_name if _current_theme_name in THEME_PRESETS else theme_names[0])
    
    theme_desc_label = tk.Label(theme_group, text="", bg=PANEL_BG, fg=MUTED, font=FONT_SMALL)
    theme_desc_label.pack(fill=tk.X, pady=(0, 4))
    
    def _update_theme_desc(*args):
        t = THEME_PRESETS.get(theme_var.get(), {})
        theme_desc_label.config(text=t.get("desc", ""))
    theme_var.trace_add('write', _update_theme_desc)
    _update_theme_desc()
    
    theme_row = Frame(theme_group, bg=PANEL_BG)
    theme_row.pack(fill=tk.X, pady=2)
    tk.Label(theme_row, text="预设方案：", bg=PANEL_BG, fg='white', font=FONT_SMALL).pack(side=tk.LEFT, padx=(0, 4))
    
    theme_cb = ttk.Combobox(theme_row, values=theme_names, textvariable=theme_var,
                            state='readonly', style='Black.TCombobox')
    theme_cb.pack(side=tk.LEFT, fill=tk.X, expand=True)
    
    def apply_theme_setting():
        name = theme_var.get()
        if apply_theme(name):
            # 更新画布/框架级别的背景色
            try:
                left_frame.config(bg=PANEL_BG)
                middle_frame.config(bg=BG_COLOR)
                right_frame.config(bg=PANEL_BG)
                canvas.config(bg=PANEL_BG)
                scrollable_frame.config(bg=PANEL_BG)
                vsb_canvas.config(bg=PANEL_BG)
                vsb_canvas.itemconfig(vsb_thumb, fill=TROUGH)
                filter_result_frame.config(bg=PANEL_BG)
                filter_canvas.config(bg=PANEL_BG)
                filter_scrollable_frame.config(bg=PANEL_BG)
                filter_vsb_canvas.config(bg=PANEL_BG)
                filter_vsb_canvas.itemconfig(filter_vsb_thumb, fill=TROUGH)
                control_row.config(bg=PANEL_BG)
                editor_menu_frame.config(bg=PANEL_BG)
                editor_header.config(bg=ACCENT)
                editor_inner.config(bg=ACCENT)
                header_frame.config(bg=ACCENT)
                header_inner.config(bg=ACCENT)
                bar_canvas.config(bg=BG_COLOR)
                bar_canvas.itemconfig(bg_bar, fill=TROUGH)
                bar_canvas.itemconfig(played_bar, fill=ACCENT)
                bar_canvas.itemconfig(knob, outline=ACCENT)
                lyrics_canvas.config(bg=BG_COLOR)
                volume_frame.config(bg=BG_COLOR)
                score_frame.config(bg=BG_COLOR)
                control_frame.config(bg=BG_COLOR)
                mode_menu_frame.config(bg=BG_COLOR)
                info_frame.config(bg=BG_COLOR)
                row_title.config(bg=BG_COLOR)
            except Exception:
                pass
            refresh_song_library(skip_rescan=True)
            # 延迟刷新：等歌曲库异步构建完毕后再补调颜色
            _schedule_color_refresh(250)
            messagebox.showinfo('主题已应用', f'已切换到「{name}」')
        else:
            messagebox.showerror('错误', '主题应用失败')
    
    btn_theme_row = Frame(theme_group, bg=PANEL_BG)
    btn_theme_row.pack(fill=tk.X, pady=(6, 0))
    ttk.Button(btn_theme_row, text='✨ 应用主题', command=apply_theme_setting,
               style='Accent.TButton').pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 3))
    ttk.Button(btn_theme_row, text='🔄 恢复默认', command=lambda: (
        theme_var.set('紫夜 (默认)'), apply_theme_setting()
    )).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(3, 0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # ── 透明模式 ──
    glass_group = ttk.LabelFrame(settings_container, text="🪟 透明模式", padding=8)
    glass_group.pack(fill=tk.X, padx=8, pady=4)
    
    glass_enabled_var = tk.BooleanVar(value=glass_mode)
    glass_tint_var = tk.StringVar(value=glass_tint)
    glass_has_bg = tk.BooleanVar(value=_has_bg_image())
    
    glass_bg_label = tk.Label(glass_group, text="", bg=PANEL_BG, fg=MUTED, font=FONT_SMALL)
    glass_bg_label.pack(fill=tk.X, pady=(0, 4))
    def _update_glass_status():
        glass_has_bg.set(_has_bg_image())
        if _has_bg_image():
            glass_bg_label.config(text=f"✅ 已设背景：{os.path.basename(bg_image_path)}", fg=SUCCESS)
        else:
            glass_bg_label.config(text="⚠️ 尚未设置背景图片", fg=WARNING)
    _update_glass_status()
    
    def _apply_glass():
        toggle_glass_mode(glass_enabled_var.get())
        sync_config_to_disk()
    
    glass_toggle = tk.Checkbutton(glass_group,
        text='启用玻璃效果（窗口微透明 + 背景图）',
        variable=glass_enabled_var,
        bg=PANEL_BG, fg=TEXT, selectcolor=CARD_BG, font=FONT_MAIN,
        activebackground=PANEL_BG, activeforeground=TEXT,
        command=_apply_glass)
    glass_toggle.pack(anchor='w', pady=2)
    
    tint_row = Frame(glass_group, bg=PANEL_BG)
    tint_row.pack(fill=tk.X, pady=(4, 2))
    tk.Label(tint_row, text="色调：", bg=PANEL_BG, fg=TEXT, font=FONT_SMALL).pack(side=tk.LEFT, padx=(0, 4))
    def _set_tint(val):
        global glass_tint
        glass_tint = val
        sync_config_to_disk()
        if glass_mode and _has_bg_image():
            _draw_background()
    tk.Radiobutton(tint_row, text='深色', variable=glass_tint_var, value='dark',
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_SMALL,
                   activebackground=PANEL_BG, activeforeground=TEXT,
                   command=lambda: _set_tint('dark')).pack(side=tk.LEFT, padx=4)
    tk.Radiobutton(tint_row, text='浅色', variable=glass_tint_var, value='light',
                   bg=PANEL_BG, fg=TEXT, selectcolor=ACCENT, font=FONT_SMALL,
                   activebackground=PANEL_BG, activeforeground=TEXT,
                   command=lambda: _set_tint('light')).pack(side=tk.LEFT, padx=4)
    
    alpha_row = Frame(glass_group, bg=PANEL_BG)
    alpha_row.pack(fill=tk.X, pady=(4, 4))
    tk.Label(alpha_row, text="透明度：", bg=PANEL_BG, fg=TEXT, font=FONT_SMALL).pack(side=tk.LEFT)
    alpha_var = tk.IntVar(value=12)
    alpha_scale = ttk.Scale(alpha_row, from_=0, to=35, variable=alpha_var, orient=HORIZONTAL)
    alpha_scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
    alpha_label = tk.Label(alpha_row, text="0.88", bg=PANEL_BG, fg=MUTED, font=FONT_SMALL, width=5)
    alpha_label.pack(side=tk.RIGHT)
    def _update_alpha_label(*args):
        v = int(alpha_var.get()) if alpha_var.get() else 12
        # root alpha = 1 - v/100，即 88%→0% 透明
        alpha_label.config(text=f"{1 - v/100:.2f}")
        if glass_mode:
            try:
                root.attributes('-alpha', 1 - v / 100)
            except Exception:
                pass
    alpha_var.trace_add('write', _update_alpha_label)
    
    glass_btn = Frame(glass_group, bg=PANEL_BG)
    glass_btn.pack(fill=tk.X, pady=4)
    ttk.Button(glass_btn, text='🖼️ 选择背景', command=lambda: (
        open_bg_image_dialog(), _update_glass_status(),
        _apply_glass()
    )).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 3))
    ttk.Button(glass_btn, text='🗑 清除', command=lambda: (
        _clear_bg_image(), _update_glass_status(),
        glass_enabled_var.set(False), toggle_glass_mode(False)
    ), style='Danger.TButton').pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(3, 0))
    
    ttk.Separator(settings_container, orient='horizontal').pack(fill=tk.X, padx=12, pady=4)
    
    # 版本信息
    ver_frame = Frame(settings_container, bg=PANEL_BG)
    ver_frame.pack(fill=tk.X, pady=6)
    tk.Label(ver_frame, text=f"版本：{VERSION}", bg=PANEL_BG, fg=MUTED, font=FONT_SMALL).pack()

def build_filter_panel():
    global filter_search_var, filter_rating_min_var, filter_rating_max_var, filter_block_var, filter_genre_var
    
    # Initialize filter variables on first run
    if filter_search_var is None:
        filter_search_var = tk.StringVar()
    if filter_rating_min_var is None:
        filter_rating_min_var = tk.DoubleVar(value=0.0)
    if filter_rating_max_var is None:
        filter_rating_max_var = tk.DoubleVar(value=10.0)
    if filter_block_var is None:
        filter_block_var = tk.StringVar()
    if filter_genre_var is None:
        filter_genre_var = tk.StringVar()
    
    # Clear panel
    for w in filter_panel.winfo_children():
        w.destroy()
    filter_panel.configure(padx=0, pady=0)
    
    # ===== Enhanced header =====
    header_filter = tk.Frame(filter_panel, bg=ACCENT)
    header_filter.pack(fill=tk.X, pady=0)
    tk.Label(header_filter, text='🔎 筛选设置', font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4, padx=8)
    
    # ===== 搜索行 =====
    search_frame = tk.Frame(filter_panel, bg=PANEL_BG)
    search_frame.pack(fill=tk.X, padx=10, pady=(8, 4))
    tk.Label(search_frame, text='🔍 搜索：', bg=PANEL_BG, fg='white', font=FONT_MAIN).pack(side=tk.LEFT)
    search_entry = Entry(search_frame, textvariable=filter_search_var, font=FONT_MAIN,
                         bg='#111111', fg='white', insertbackground='white', relief='solid', bd=1)
    search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(6, 0), ipady=3)
    
    # ===== 操作按钮行（展开/隐藏 + 复位） =====
    action_frame = tk.Frame(filter_panel, bg=PANEL_BG)
    action_frame.pack(fill=tk.X, padx=10, pady=4)
    
    def toggle_filter():
        global filter_expanded
        filter_expanded = not filter_expanded
        build_filter_panel()
    
    toggle_text = '🔽 隐藏筛选条件' if filter_expanded else '▶️ 展开筛选条件'
    ttk.Button(action_frame, text=toggle_text, command=toggle_filter).pack(side=tk.LEFT, padx=(0, 6), fill=tk.X, expand=True)
    
    def _reset():
        filter_search_var.set('')
        filter_rating_min_var.set(0.0)
        filter_rating_max_var.set(10.0)
        filter_block_var.set('')
        filter_genre_var.set('')
        global audio_paths
        audio_paths = list(ratings.keys()) if ratings else []
        refresh_song_library()
        messagebox.showinfo('筛选已复位', '筛选已复位')
    
    ttk.Button(action_frame, text='🔄 复位', command=_reset).pack(side=tk.LEFT, padx=(6, 0), fill=tk.X, expand=True)
    
    # ===== 筛选详细区域 (可折叠) =====
    if filter_expanded:
        # 评分区域
        rating_group = ttk.LabelFrame(filter_panel, text="评分筛选", padding=8)
        rating_group.pack(fill=tk.X, padx=10, pady=4)
        
        rating_row_min = Frame(rating_group, bg=PANEL_BG)
        rating_row_min.pack(fill=tk.X, pady=1)
        tk.Label(rating_row_min, text='最低分：', bg=PANEL_BG, fg='white', width=8, anchor='w').pack(side=tk.LEFT)
        Spinbox(rating_row_min, from_=0.0, to=10.0, increment=0.1, textvariable=filter_rating_min_var, width=10,
                bg='#111111', fg='white', buttonbackground=CARD_BG, relief='solid', bd=1).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
        
        rating_row_max = Frame(rating_group, bg=PANEL_BG)
        rating_row_max.pack(fill=tk.X, pady=1)
        tk.Label(rating_row_max, text='最高分：', bg=PANEL_BG, fg='white', width=8, anchor='w').pack(side=tk.LEFT)
        Spinbox(rating_row_max, from_=0.0, to=10.0, increment=0.1, textvariable=filter_rating_max_var, width=10,
                bg='#111111', fg='white', buttonbackground=CARD_BG, relief='solid', bd=1).pack(side=tk.LEFT, padx=4, fill=tk.X, expand=True)
        
        # 块筛选
        block_group = ttk.LabelFrame(filter_panel, text="块筛选", padding=8)
        block_group.pack(fill=tk.X, padx=10, pady=4)
        
        block_row = Frame(block_group, bg=PANEL_BG)
        block_row.pack(fill=tk.X)
        filter_block_names = [''] + [b.get('name') if isinstance(b, dict) else b for b in blocks]
        block_cb = ttk.Combobox(block_row, values=filter_block_names, textvariable=filter_block_var, style='Black.TCombobox')
        block_cb.pack(fill=tk.X, expand=True, ipady=2)
        
        # 流派筛选
        genre_group = ttk.LabelFrame(filter_panel, text="流派筛选", padding=8)
        genre_group.pack(fill=tk.X, padx=10, pady=4)
        
        genre_row = Frame(genre_group, bg=PANEL_BG)
        genre_row.pack(fill=tk.X)
        genre_cb = ttk.Combobox(genre_row, values=[''] + genres, textvariable=filter_genre_var, style='Black.TCombobox')
        genre_cb.pack(fill=tk.X, expand=True, ipady=2)
        
        # 应用按钮
        def apply_all_filters():
            global audio_paths
            q = filter_search_var.get().strip().lower()
            try:
                lo = float(filter_rating_min_var.get())
                hi = float(filter_rating_max_var.get())
            except Exception:
                lo = None
                hi = None
            sel_block = filter_block_var.get().strip()
            sel_genre = filter_genre_var.get().strip()
            
            allp = scan_audio_files(MUSIC_DIR)
            res = []
            for p in allp:
                info = load_song_info(p)
                ud = ratings.get(p, {})
                if q:
                    hay = (info.get('title', '') + info.get('artist', '') + os.path.basename(p) + ud.get('note', '') + ud.get('comment', '')).lower()
                    if q not in hay:
                        continue
                if lo is not None and hi is not None:
                    s = float(ud.get('score', 0) or 0.0)
                    if not (lo <= s <= hi):
                        continue
                if sel_block:
                    if ud.get('block', '') != sel_block:
                        continue
                if sel_genre:
                    if ud.get('genre', '') != sel_genre:
                        continue
                res.append(p)
            audio_paths = res
            # 按 filter_sort_mode 排序后传给 show_filter_results
            re_sort_and_show(res)
            messagebox.showinfo('筛选完成', f'筛选结果：{len(res)} 首歌曲')
        
        ttk.Button(filter_panel, text='✅ 应用筛选', command=apply_all_filters, style='Accent.TButton').pack(fill=tk.X, padx=10, pady=(8, 12), ipady=2)

# ==================== 评论面板 ====================
def build_comments_panel():
    """构建网易云音乐评论面板 (纯展示，绑定在歌曲编辑页)"""
    for w in comments_panel.winfo_children():
        w.destroy()

    # 可滚动画布
    c_canvas = Canvas(comments_panel, bg=PANEL_BG, highlightthickness=0, bd=0)
    c_scrollbar = ttk.Scrollbar(comments_panel, orient='vertical', command=c_canvas.yview)
    c_canvas.configure(yscrollcommand=c_scrollbar.set)
    c_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    c_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    container = Frame(c_canvas, bg=PANEL_BG)
    c_canvas.create_window((0, 0), window=container, anchor='nw')
    container.bind('<Configure>', lambda e: c_canvas.configure(scrollregion=c_canvas.bbox('all')))
    def _c_resize(event):
        c_canvas.itemconfig(1, width=event.width)
    c_canvas.bind('<Configure>', _c_resize)
    def _c_mousewheel(event):
        c_canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')
        return 'break'
    c_canvas.bind('<MouseWheel>', _c_mousewheel)
    container.bind('<MouseWheel>', _c_mousewheel)

    # Header
    header = Frame(container, bg=ACCENT)
    header.pack(fill=tk.X, pady=(0, 6))
    tk.Label(header, text="💬 网易云评论", font=FONT_TITLE, bg=ACCENT, fg='white').pack(pady=4)

    # 辅助函数
    def _get_current_path():
        return playlist[current_playlist_index] if (current_playlist_index != -1 and playlist) else None

    cp = _get_current_path()
    current_song_info = load_song_info(cp) if cp else None
    current_title = current_song_info.get('title', '未选择歌曲') if current_song_info else '未选择歌曲'

    song_label = tk.Label(container, text=f"当前歌曲：{current_title}",
                          bg=PANEL_BG, fg='white', font=FONT_MAIN, wraplength=420)
    song_label.pack(fill=tk.X, padx=8, pady=(4, 2))

    # 绑定状态
    bound_id = get_netease_song_id(cp) if cp else None
    bind_status_var = tk.StringVar()
    if bound_id:
        bind_status_var.set(f"✅ 已绑定网易云ID: {bound_id}")
    else:
        bind_status_var.set("⚠️ 未绑定 — 请在「歌曲编辑」页面绑定网易云ID")
    bind_status_label = tk.Label(container, textvariable=bind_status_var,
                                  bg=PANEL_BG, fg=MUTED if bound_id else '#cc4444',
                                  font=('微软雅黑', 9))
    bind_status_label.pack(fill=tk.X, padx=8, pady=(0, 4))

    # 若未绑定，显示引导提示
    if not bound_id:
        hint_frame = Frame(container, bg=CARD_BG)
        hint_frame.pack(fill=tk.X, padx=12, pady=12)
        tk.Label(hint_frame, text="📝 请在「歌曲编辑」页面绑定网易云ID\n\n"
                 "切换到歌曲编辑 → 粘贴网易云歌曲链接或ID → 点击绑定",
                 bg=CARD_BG, fg=MUTED, font=('微软雅黑', 9), justify='left').pack(padx=12, pady=12)
        return

    # 评论统计和操作
    stat_frame = Frame(container, bg=PANEL_BG)
    stat_frame.pack(fill=tk.X, padx=8, pady=4)

    comment_count_label = tk.Label(stat_frame, text="", bg=PANEL_BG, fg=ACCENT, font=('微软雅黑', 10))
    comment_count_label.pack(side=tk.LEFT)
    comment_status_label = tk.Label(stat_frame, text="", bg=PANEL_BG, fg=MUTED, font=('微软雅黑', 9))
    comment_status_label.pack(side=tk.RIGHT)

    ttk.Separator(container, orient='horizontal').pack(fill=tk.X, padx=8, pady=4)

    # 评论列表容器
    comments_container = Frame(container, bg=PANEL_BG)
    comments_container.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)

    def do_fetch_comments():
        cp = _get_current_path()
        if not cp:
            return
        nid = get_netease_song_id(cp)
        if not nid:
            return
        for w in comments_container.winfo_children():
            w.destroy()
        comment_status_label.config(text="正在加载...")
        root.update_idletasks()
        limit = max(5, min(50, comment_display_count))
        hot_comments, total = netease_fetch_comments(nid, page=1, page_size=limit)
        if total == 0:
            comment_status_label.config(text="暂无评论")
            comment_count_label.config(text="")
            return
        comment_count_label.config(text=f"共 {total} 条评论")
        comment_status_label.config(text=f"显示 {len(hot_comments)} 条")

        for i, c in enumerate(hot_comments, 1):
            user = c.get('user', {})
            nickname = user.get('nickname', '匿名用户')
            content = c.get('content', '')
            likes = c.get('likedCount', 0)
            ts = c.get('time', 0)
            time_str = time.strftime('%Y-%m-%d %H:%M', time.localtime(ts / 1000)) if ts else '未知时间'

            row_bg = CARD_BG if i % 2 == 1 else CARD_ALTERNATE
            card = Frame(comments_container, bg=row_bg)
            card.pack(fill=tk.X, pady=1, padx=2)

            # 用户名 / 点赞
            top_row = Frame(card, bg=row_bg)
            top_row.pack(fill=tk.X, padx=6, pady=(4, 2))
            tk.Label(top_row, text=f"#{i} {nickname}", bg=row_bg, fg=ACCENT,
                     font=('微软雅黑', 9, 'bold'), anchor='w').pack(side=tk.LEFT)
            tk.Label(top_row, text=f"👍 {likes}  {time_str}", bg=row_bg, fg=MUTED,
                     font=('微软雅黑', 8)).pack(side=tk.RIGHT)

            # 内容
            tk.Label(card, text=content, bg=row_bg, fg='white',
                     font=('微软雅黑', 10), wraplength=400, justify='left', anchor='w').pack(
                         fill=tk.X, padx=6, pady=(0, 4))

            # 回复
            replied = c.get('beReplied', [])
            for j, reply in enumerate(replied[:2]):
                reply_user = reply.get('user', {})
                reply_name = reply_user.get('nickname', '匿名用户')
                reply_content = reply.get('content', '')
                if len(reply_content) > 180:
                    reply_content = reply_content[:180] + '...'
                reply_frame = Frame(card, bg=PANEL_BG)
                reply_frame.pack(fill=tk.X, padx=6, pady=1)
                tk.Label(reply_frame, text=f"↪ {reply_name}: {reply_content}",
                         bg=PANEL_BG, fg=MUTED, font=FONT_SMALL, wraplength=380,
                         justify='left', anchor='w').pack(fill=tk.X, padx=4, pady=2)

    # 自动加载评论
    root.after(150, do_fetch_comments)

def switch_editor(mode):
    editor_mode.set(mode)
    playlist_panel.pack_forget()
    playlist_editor_panel.pack_forget()
    song_edit_panel.pack_forget()
    filter_panel.pack_forget()
    comments_panel.pack_forget()
    netease_search_panel.pack_forget()
    netease_panel.pack_forget()
    daily_panel.pack_forget()
    lyrics_panel.pack_forget()
    blocks_panel.pack_forget()
    genres_panel.pack_forget()
    settings_panel.pack_forget()
    block_editor_panel.pack_forget()
    genre_editor_panel.pack_forget()
    playlist_detail_panel.pack_forget()
    if mode == "播放列表":
        playlist_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "歌单":
        playlist_editor_panel.pack(fill=tk.BOTH, expand=True)
        refresh_playlist_editor()
    elif mode == "歌曲编辑":
        song_edit_panel.pack(fill=tk.BOTH, expand=True)
        load_current_song_to_editor()
    elif mode == "筛选":
        build_filter_panel()
        filter_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "评论":
        build_comments_panel()
        comments_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "歌词":
        build_lyrics_panel()
        lyrics_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "搜索":
        build_netease_search_panel()
        netease_search_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "网易云":
        build_netease_panel()
        netease_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "日推":
        build_daily_panel()
        daily_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "歌单编辑":
        pass  # handled by open_playlist_detail()
    elif mode == "块":
        build_blocks_panel()
        blocks_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "流派":
        build_genres_panel()
        genres_panel.pack(fill=tk.BOTH, expand=True)
    elif mode == "设置":
        build_settings_panel()
        settings_panel.pack(fill=tk.BOTH, expand=True)

switch_editor("播放列表")

# ==================== 封面旋转动画 ====================
def update_cover_rotation():
    """播放时每帧旋转封面 (仅 circle_rotate 模式)"""
    global cover_rotation_angle
    if _closing:
        return
    if cover_style != 'circle_rotate' or stopped or paused or cover_original_image is None:
        if not _closing:
            root.after(100, update_cover_rotation)
        return
    
    cover_rotation_angle = (cover_rotation_angle + 1.5) % 360
    
    try:
        size = (COVER_SIZE, COVER_SIZE)
        img = cover_original_image.copy()
        img = img.resize(size, Image.Resampling.LANCZOS)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # 圆形遮罩 (抠除背景，旋转时只有封面转)
        mask = Image.new("L", size, 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0) + size, fill=255)
        
        rotated = img.rotate(-cover_rotation_angle, resample=Image.Resampling.BICUBIC,
                             center=(COVER_SIZE//2, COVER_SIZE//2))
        rotated.putalpha(mask)
        
        photo = ImageTk.PhotoImage(rotated)
        cover_label.config(image=photo)
        cover_label.image = photo
    except Exception:
        pass
    
    if not _closing:
        root.after(100, update_cover_rotation)

# ==================== 进度刷新 ====================
def update_progress():
    global current_pos, last_tick, skip_updates, dragging

    if _closing:
        return

    try:
        if skip_updates > 0:
            skip_updates -= 1
            return

        if not stopped and not paused and not dragging:
            if backend == 'vlc':
                ms = player.get_time()
                if ms >= 0:
                    pos_sec = ms / 1000.0
                    if pos_sec < 0.1 and current_pos > 1.0:
                        pass
                    else:
                        current_pos = pos_sec
                else:
                    now = time.time()
                    elapsed = now - last_tick
                    last_tick = now
                    current_pos += elapsed
                    if total_seconds > 0 and current_pos > total_seconds:
                        current_pos = total_seconds
            else:
                try:
                    ms = pygame.mixer.music.get_pos()
                    if ms >= 0:
                        pos_sec = ms / 1000.0
                        current_pos = pos_sec
                    else:
                        now = time.time()
                        elapsed = now - last_tick
                        last_tick = now
                        current_pos += elapsed
                        if total_seconds > 0 and current_pos > total_seconds:
                            current_pos = total_seconds
                except Exception:
                    now = time.time()
                    elapsed = now - last_tick
                    last_tick = now
                    current_pos += elapsed
                    if total_seconds > 0 and current_pos > total_seconds:
                        current_pos = total_seconds

            update_bar()

            if total_seconds > 0 and current_pos >= total_seconds - 0.5:
                if not _switching_song:  # 防重入：正在切歌中则跳过
                    next_song()
                return
    except Exception:
        pass  # 防止任何异常导致定时器链断裂
    finally:
        if not _closing:
            root.after(300, update_progress)


def init_progress_on_play():
    global current_pos, last_tick, skip_updates
    if _closing:
        return
    current_pos = 0.0
    last_tick = time.time()
    skip_updates = 1
    update_bar()
    try:
        # ensure progress loop is running
        root.after(300, update_progress)
    except Exception:
        pass

def on_end_reached(event):
    if _closing:
        return
    # 如果正在切歌中（update_progress已经触发了next_song），跳过VLC事件
    if _switching_song:
        return
    root.after(0, next_song)

events = player.event_manager()
events.event_attach(vlc.EventType.MediaPlayerEndReached, on_end_reached)

# ==================== 关闭处理 ====================
def on_closing():
    """安全关闭：清理资源，保存数据，防止卡死"""
    global _closing, scroll_animation_id
    _closing = True
    
    # 取消所有after回调
    if scroll_animation_id:
        try:
            root.after_cancel(scroll_animation_id)
        except Exception:
            pass
    try:
        root.after_cancel(update_progress)
    except Exception:
        pass
    try:
        root.after_cancel(update_cover_rotation)
    except Exception:
        pass
    
    # 停止播放
    try:
        player.stop()
    except Exception:
        pass
    
    # 清理pygame
    if pygame_available:
        try:
            if pygame.mixer.get_init():
                pygame.mixer.music.stop()
                pygame.mixer.quit()
        except Exception:
            pass
    
    # 保存数据
    try:
        save_metadata_cache()
    except Exception:
        pass
    try:
        save_ratings(ratings)
    except Exception:
        pass
    try:
        save_lyrics(lyrics)
    except Exception:
        pass
    try:
        sync_config_to_disk()
    except Exception:
        pass
    
    # 停止 API 服务
    try:
        _api_server_stop()
    except Exception:
        pass
    
    # 销毁窗口
    try:
        root.destroy()
    except Exception:
        pass
    
    # 强制退出（杀死所有后台线程，防止卡死）
    os._exit(0)

# ==================== 启动 ====================
total_seconds = 0
duration_str = "0:00"
update_mode_display()
update_bar()
# 立即显示UI窗口，然后异步加载歌曲库（允许大型库快速响应）
root.update_idletasks()
# 加载歌曲库 - 现在使用后台线程，不会冻结UI
root.after(10, lambda: refresh_song_library(skip_rescan=True))
# 延迟更新当前歌曲信息
root.after(100, update_ui_for_current_song)
# 启动封面旋转动画循环
root.after(200, update_cover_rotation)
# start periodic progress updates
root.after(300, update_progress)
# 注册关闭事件处理（防止关闭时卡死）
root.protocol("WM_DELETE_WINDOW", on_closing)

# 启动 API 服务并加载 cookie
if not _api_server_check():
    _api_server_start()
    # 等待 API 启动（最多 15 秒）
    for _ in range(15):
        time.sleep(1)
        if _api_server_check():
            break
_load_cookie()

root.mainloop()