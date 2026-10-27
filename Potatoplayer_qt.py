"""Potato Player —— PySide6 版本（Qt 重写）。

与 tkinter 版（Potatoplayer.py）功能对齐，UI 层全部使用 PySide6 重写，
后端逻辑复用 core.backend 与 core.theme。

运行：python Potatoplayer_qt.py
"""
import os
import sys
import io
import re
import json
import time
import random
import threading
import shutil

import vlc
import mutagen
from mutagen.mp3 import MP3
from mutagen.flac import FLAC

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QPushButton, QLineEdit, QListWidget, QListWidgetItem, QComboBox,
    QSpinBox, QDoubleSpinBox, QSlider, QScrollArea, QFrame, QStackedWidget,
    QMessageBox, QFileDialog, QMenu, QCheckBox, QRadioButton, QButtonGroup,
    QProgressBar, QTextEdit, QTabWidget, QToolButton, QSplitter, QSizePolicy,
    QAbstractItemView, QColorDialog,
)
from PySide6.QtCore import Qt, QTimer, QSize, Signal, QObject, QUrl
from PySide6.QtGui import (
    QColor, QPixmap, QImage, QPainter, QBrush, QFont, QIcon, QAction,
)

from PIL import Image, ImageDraw

from core.backend import (
    BASE_DIR, MUSIC_DIR, PLAYLIST_DIR, LYRICS_DIR, COVERS_DIR,
    ensure_dirs, load_config, save_config, DEFAULT_CONFIG,
    load_ratings, save_ratings, load_lyrics, save_lyrics,
    load_blocks, save_blocks, load_genres, save_genres,
    load_metadata_cache, save_metadata_cache,
    load_netease_bindings, save_netease_bindings,
    scan_audio_files, load_song_info, get_cached_title, get_cached_artist,
    score_to_color, get_block_color, set_block_color,
    get_playlist_files, save_current_playlist, load_playlist,
    parse_lrc_file, NeteaseClient, Player,
)
from core.theme import (
    THEME_PRESETS, resolve_theme, DEFAULT_THEME, COLOR_KEYS,
    FONT_FAMILY, FONT_MONO_FAMILY, FALLBACK_FONT_FAMILY,
    FONT_MAIN_SIZE, FONT_TITLE_SIZE, FONT_SMALL_SIZE, FONT_MONO_SIZE,
    DEFAULT_BLOCK_COLOR,
)

VERSION = '1.4.0'


def build_qss(theme: dict) -> str:
    """根据主题字典生成 QSS 样式表。"""
    bg = theme["BG_COLOR"]
    panel = theme["PANEL_BG"]
    card = theme["CARD_BG"]
    card_alt = theme["CARD_ALTERNATE"]
    card_hover = theme["CARD_HOVER"]
    trough = theme["TROUGH"]
    accent = theme["ACCENT"]
    accent_hover = theme["ACCENT_HOVER"]
    accent_pressed = theme["ACCENT_PRESSED"]
    muted = theme["MUTED"]
    danger = theme["DANGER"]
    danger_hover = theme["DANGER_HOVER"]
    success = theme["SUCCESS"]
    sep = theme["SEPARATOR"]
    text = theme["TEXT"]
    text_muted = theme["TEXT_MUTED"]
    entry_bg = theme.get("ENTRY_BG", "#111111")
    btn_bg = theme.get("BUTTON_BG", card)

    return f"""
* {{
    font-family: '{FONT_FAMILY}', '{FALLBACK_FONT_FAMILY}';
    font-size: {FONT_MAIN_SIZE}px;
    color: {text};
    outline: none;
}}
QMainWindow, QWidget#central {{ background: {bg}; }}
QFrame#panel {{ background: {panel}; }}
QLabel#muted {{ color: {muted}; }}
QLabel#title {{ font-size: {FONT_TITLE_SIZE}px; font-weight: bold; }}
QLabel#small {{ font-size: {FONT_SMALL_SIZE}px; color: {muted}; }}

QPushButton {{
    background: {btn_bg};
    border: none;
    border-radius: 6px;
    padding: 7px 12px;
    color: {text};
}}
QPushButton:hover {{ background: {accent_hover}; color: white; }}
QPushButton:pressed {{ background: {accent_pressed}; color: white; }}
QPushButton#accent {{ background: {accent}; color: white; }}
QPushButton#accent:hover {{ background: {accent_hover}; }}
QPushButton#accent:pressed {{ background: {accent_pressed}; }}
QPushButton#danger {{ background: {danger}; color: white; }}
QPushButton#danger:hover {{ background: {danger_hover}; }}
QPushButton#success {{ background: {success}; color: white; }}
QPushButton#iconBtn {{
    background: transparent;
    padding: 4px;
    font-size: 16px;
    border-radius: 4px;
}}
QPushButton#iconBtn:hover {{ background: {card_hover}; }}
QPushButton#playBtn {{
    background: {accent}; color: white;
    font-size: 20px; border-radius: 22px;
    min-width: 44px; max-width: 44px;
    min-height: 44px; max-height: 44px;
}}
QPushButton#playBtn:hover {{ background: {accent_hover}; }}

QLineEdit, QTextEdit, QComboBox, QSpinBox, QDoubleSpinBox {{
    background: {entry_bg};
    border: 1px solid {sep};
    border-radius: 5px;
    padding: 5px 8px;
    color: {text};
    selection-background-color: {accent};
}}
QLineEdit:focus, QTextEdit:focus, QComboBox:focus {{
    border: 1px solid {accent};
}}
QComboBox::drop-down {{ border: none; width: 22px; }}
QComboBox::down-arrow {{
    image: none;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid {muted};
    margin-right: 6px;
}}
QComboBox QAbstractItemView {{
    background: {card};
    color: {text};
    selection-background-color: {accent};
    border: 1px solid {sep};
}}

QListWidget {{
    background: {panel};
    border: none;
}}
QListWidget::item {{ padding: 6px 8px; }}
QListWidget::item:selected {{ background: {accent}; color: white; }}
QListWidget::item:hover:!selected {{ background: {card_hover}; }}

QSlider::groove:horizontal {{
    height: 6px; background: {trough}; border-radius: 3px;
}}
QSlider::sub-page:horizontal {{ background: {accent}; border-radius: 3px; }}
QSlider::handle:horizontal {{
    background: white; border: 2px solid {accent};
    width: 14px; margin: -5px 0; border-radius: 7px;
}}

QProgressBar {{
    background: {trough}; border: none; border-radius: 3px;
    height: 6px; text-align: center;
}}
QProgressBar::chunk {{ background: {accent}; border-radius: 3px; }}

QScrollBar:vertical {{
    background: {panel}; width: 10px; margin: 0;
}}
QScrollBar::handle:vertical {{
    background: {trough}; border-radius: 5px; min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{ background: {accent}; }}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
QScrollBar:horizontal {{
    background: {panel}; height: 10px; margin: 0;
}}
QScrollBar::handle:horizontal {{
    background: {trough}; border-radius: 5px; min-width: 30px;
}}
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{ width: 0; }}

QTabWidget::pane {{ border: 1px solid {sep}; background: {panel}; }}
QTabBar::tab {{
    background: {card}; color: {text}; padding: 7px 14px;
    border-top-left-radius: 5px; border-top-right-radius: 5px;
    margin-right: 2px;
}}
QTabBar::tab:selected {{ background: {accent}; color: white; }}
QTabBar::tab:hover:!selected {{ background: {card_hover}; }}

QMenu {{
    background: {card}; color: {text}; border: 1px solid {sep};
}}
QMenu::item {{ padding: 6px 20px; }}
QMenu::item:selected {{ background: {accent_hover}; color: white; }}

QToolTip {{
    background: {card}; color: {text}; border: 1px solid {sep};
}}
"""


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self._init_state()
        self._init_ui()
        self._init_playback()
        self._init_signals()
        self._load_initial()

    # ---------- 状态 ----------
    def _init_state(self):
        ensure_dirs()
        self.config = load_config()

        # 持久化数据
        self.ratings = load_ratings()
        self.lyrics = load_lyrics()
        self.blocks = load_blocks()
        self.genres = load_genres()
        self.metadata_cache = load_metadata_cache()
        self.netease_bindings = load_netease_bindings()
        self.song_info_cache = {}

        # 网易云客户端
        self.nc = NeteaseClient()

        # 主题
        self.theme_name = self.config.get('theme', DEFAULT_THEME)
        self.theme = resolve_theme(self.theme_name)

        # 配置项
        self.note_display_mode = self.config.get('note_display_mode', 'expanded')
        self.artist_hidden = self.config.get('artist_hidden', False)
        self.cover_style = self.config.get('cover_style', 'circle_rotate')
        self.current_volume = self.config.get('volume', 70)
        self.play_mode = self.config.get('play_mode', 'list_loop')
        self.sort_mode = self.config.get('sort_mode', 'title')
        self.filter_sort_mode = self.config.get('filter_sort_mode', 'title')
        self.show_index_headers = self.config.get('show_index_headers', True)
        self.comment_display_count = self.config.get('comment_display_count', 15)
        self.current_dl_br = self.config.get('current_dl_br', 320000)
        self.bilingual_lyrics = self.config.get('bilingual_lyrics', True)
        self.prefer_chinese_lyrics = self.config.get('prefer_chinese_lyrics', True)

        # 播放状态
        self.playlist = []              # 播放列表（文件路径）
        self.current_playlist_index = -1
        self.paused = False
        self.stopped = True
        self.dragging = False
        self.current_pos = 0.0
        self.last_tick = 0.0
        self.skip_updates = 0
        self.total_seconds = 0
        self.duration_str = "0:00"
        self.history = []
        self.list_seq_played_index = -1
        self.shuffle_queue = []
        self.shuffle_pos = 0
        self._switching_song = False

        # 选中 / 过滤
        self.selected_paths = set()
        self.filter_result_visible = False
        self.current_filter_paths = []
        self.collapsed_groups = set()
        self.rating_filter_active = False
        self.rating_filter_min = 0.0
        self.rating_filter_max = 10.0

        # 封面旋转
        self.cover_original_image = None
        self.cover_rotation_angle = 0.0

        # 歌词
        self.current_lyrics = []
        self.current_lyric_index = -1

        # 编辑
        self.edit_current_file = None

        # 播放器
        self.player = Player(self.current_volume)

        # 音频文件
        self.audio_paths = scan_audio_files(MUSIC_DIR)

        self._closing = False

    # ---------- UI ----------
    def _init_ui(self):
        self.setWindowTitle("Potato Player")
        self.resize(1200, 700)
        self.setMinimumSize(1000, 600)

        central = QWidget()
        central.setObjectName("central")
        self.setCentralWidget(central)
        root_layout = QHBoxLayout(central)
        root_layout.setContentsMargins(10, 10, 10, 10)
        root_layout.setSpacing(8)

        self.library_panel = SongLibraryPanel(self)
        self.playback_panel = PlaybackPanel(self)
        self.function_panels = FunctionPanels(self)

        root_layout.addWidget(self.library_panel, 3)
        root_layout.addWidget(self.playback_panel, 5)
        root_layout.addWidget(self.function_panels, 4)

        self.apply_theme(self.theme_name, save=False)

    def apply_theme(self, name, save=True):
        """应用主题（热切换）。"""
        self.theme_name = name
        self.theme = resolve_theme(name)
        self.setStyleSheet(build_qss(self.theme))
        if save:
            self.config['theme'] = name
            save_config(self.config)
        self.library_panel.refresh()
        self.playback_panel.refresh_current_song()
        self.function_panels.refresh_theme()

    def _init_playback(self):
        # 进度更新定时器
        self.progress_timer = QTimer(self)
        self.progress_timer.setInterval(300)
        self.progress_timer.timeout.connect(self.update_progress)

        # 封面旋转定时器
        self.cover_timer = QTimer(self)
        self.cover_timer.setInterval(100)
        self.cover_timer.timeout.connect(self.update_cover_rotation)

        # VLC 播放结束事件
        events = self.player.event_manager()
        events.event_attach(vlc.EventType.MediaPlayerEndReached, self._vlc_end_reached)

        # 歌词高亮随进度刷新
        self.lyrics_timer = QTimer(self)
        self.lyrics_timer.setInterval(200)
        self.lyrics_timer.timeout.connect(self.update_lyrics_display)

        self.progress_timer.start()
        self.cover_timer.start()
        self.lyrics_timer.start()

    def _vlc_end_reached(self, event):
        if self._switching_song:
            return
        QTimer.singleShot(0, self.next_song)

    def _init_signals(self):
        pass

    def _load_initial(self):
        # 启动 API 服务
        if not self.nc.server_check():
            self.nc.server_start()

    # ---------- 播放控制 ----------
    def play_file(self, filepath, add_to_history=True):
        if self._switching_song:
            return
        self._switching_song = True
        try:
            self._play_file_impl(filepath, add_to_history)
        finally:
            self._switching_song = False

    def _play_file_impl(self, filepath, add_to_history=True):
        old_index = self.current_playlist_index \
            if 0 <= self.current_playlist_index < len(self.playlist) else -1

        if self.play_mode == "random":
            if filepath not in self.playlist:
                self.playlist.append(filepath)
            self.current_playlist_index = self.playlist.index(filepath)
        elif self.play_mode == "list_sequential":
            if filepath not in self.playlist:
                self.playlist.append(filepath)
            self.current_playlist_index = self.playlist.index(filepath)
            if add_to_history and self.current_playlist_index > self.list_seq_played_index:
                self.list_seq_played_index = self.current_playlist_index
        else:
            if filepath in self.playlist:
                self.playlist.remove(filepath)
            self.playlist.insert(0, filepath)
            self.current_playlist_index = 0

        if add_to_history and not self.stopped and old_index != -1 \
                and old_index != self.current_playlist_index:
            if not self.history or self.history[-1] != old_index:
                self.history.append(old_index)

        if filepath in self.ratings:
            self.ratings[filepath]['play_count'] = self.ratings[filepath].get('play_count', 0) + 1
        else:
            self.ratings[filepath] = {'play_count': 1}
        save_ratings(self.ratings)

        if not add_to_history:
            self.selected_paths.clear()

        self.player.play(filepath)
        self.stopped = False
        self.paused = False
        self.current_pos = 0.0
        self.last_tick = time.time()
        self.skip_updates = 3

        self._refresh_after_play(filepath)

    def _refresh_after_play(self, filepath):
        self.playback_panel.refresh_current_song()
        self.playback_panel.update_play_button()
        self.playback_panel.update_bar()
        self.library_panel.refresh_playlist()
        self.library_panel.refresh()
        self.function_panels.refresh_current_song()

    def pause_or_resume(self):
        if self.stopped and self.playlist:
            idx = self.current_playlist_index \
                if 0 <= self.current_playlist_index < len(self.playlist) else 0
            self.play_file(self.playlist[idx], add_to_history=False)
            return
        if self.paused:
            self.player.resume()
            self.paused = False
            self.last_tick = time.time()
        else:
            self.player.pause()
            self.paused = True
        self.playback_panel.update_play_button()

    def stop(self):
        self.player.stop()
        self.stopped = True
        self.paused = False
        self.current_pos = 0.0
        self.skip_updates = 0
        self.history = []
        self.list_seq_played_index = -1
        self.playback_panel.update_play_button()
        self.playback_panel.update_bar()

    def seek(self, seconds):
        if not self.stopped:
            self.player.seek(seconds)
            self.current_pos = seconds
            self.last_tick = time.time()
            self.skip_updates = 2
            self.playback_panel.update_bar()

    def set_volume(self, value):
        self.current_volume = int(value)
        self.player.set_volume(self.current_volume)
        self.playback_panel.update_volume_label()
        self.config['volume'] = self.current_volume
        save_config(self.config)

    def next_song(self):
        if not self.playlist:
            return
        if self.play_mode == "single_loop":
            if 0 <= self.current_playlist_index < len(self.playlist):
                self.play_file(self.playlist[self.current_playlist_index], add_to_history=False)
            return
        elif self.play_mode == "random":
            if not self.shuffle_queue:
                self.regenerate_shuffle()
            self.shuffle_pos = (self.shuffle_pos + 1) % len(self.shuffle_queue)
            self.play_file(self.playlist[self.shuffle_queue[self.shuffle_pos]])
            return
        elif self.play_mode == "list_sequential":
            nxt = self.current_playlist_index + 1
            if nxt >= len(self.playlist):
                self.stop()
                return
            self.play_file(self.playlist[nxt])
            return
        else:
            if len(self.playlist) <= 1:
                if 0 <= self.current_playlist_index < len(self.playlist):
                    self.play_file(self.playlist[self.current_playlist_index], add_to_history=False)
                return
            old = self.playlist.pop(0)
            self.playlist.append(old)
            self.current_playlist_index = 0
            self.play_file(self.playlist[0], add_to_history=False)

    def prev_song(self):
        if not self.playlist:
            return
        if self.play_mode == "single_loop":
            if 0 <= self.current_playlist_index < len(self.playlist):
                self.play_file(self.playlist[self.current_playlist_index], add_to_history=False)
            return
        elif self.play_mode == "random":
            if self.history:
                prev_idx = self.history.pop()
                if 0 <= prev_idx < len(self.playlist):
                    self.play_file(self.playlist[prev_idx], add_to_history=False)
                    return
            if 0 <= self.current_playlist_index < len(self.playlist):
                self.play_file(self.playlist[self.current_playlist_index], add_to_history=False)
            return
        elif self.play_mode == "list_sequential":
            if self.history:
                prev_idx = self.history.pop()
                if 0 <= prev_idx < len(self.playlist):
                    self.play_file(self.playlist[prev_idx], add_to_history=False)
                    return
            if 0 <= self.current_playlist_index < len(self.playlist):
                self.play_file(self.playlist[self.current_playlist_index], add_to_history=False)
            return
        else:
            if len(self.playlist) <= 1:
                if 0 <= self.current_playlist_index < len(self.playlist):
                    self.play_file(self.playlist[self.current_playlist_index], add_to_history=False)
                return
            last = self.playlist.pop()
            self.playlist.insert(0, last)
            self.current_playlist_index = 0
            self.play_file(last, add_to_history=False)

    def regenerate_shuffle(self):
        if not self.playlist:
            return
        indices = list(range(len(self.playlist)))
        random.shuffle(indices)
        if not self.stopped and self.current_playlist_index in indices:
            indices.remove(self.current_playlist_index)
            indices.insert(0, self.current_playlist_index)
        self.shuffle_queue = indices
        self.shuffle_pos = 0

    def set_play_mode(self, mode):
        old = self.play_mode
        self.play_mode = mode
        self.config['play_mode'] = mode
        save_config(self.config)
        self.history = []

        if old == "random" and mode in ("list_loop", "list_sequential"):
            if not self.stopped and 0 <= self.current_playlist_index < len(self.playlist):
                cur = self.playlist[self.current_playlist_index]
                if cur in self.playlist:
                    self.playlist.remove(cur)
                self.playlist.insert(0, cur)
                self.current_playlist_index = 0
        if old == "list_sequential" and mode == "list_loop":
            if not self.stopped and 0 <= self.current_playlist_index < len(self.playlist):
                before = self.playlist[:self.current_playlist_index]
                after = self.playlist[self.current_playlist_index:]
                self.playlist[:] = after + before
                self.current_playlist_index = 0
        if mode == "list_sequential":
            self.list_seq_played_index = self.current_playlist_index \
                if 0 <= self.current_playlist_index < len(self.playlist) else -1
        if mode == "random":
            self.regenerate_shuffle()
        self.playback_panel.update_mode_display()
        self.library_panel.refresh_playlist()

    # ---------- 进度与封面 ----------
    def update_progress(self):
        if self._closing:
            return
        if self.skip_updates > 0:
            self.skip_updates -= 1
            return
        if not self.stopped and not self.paused and not self.dragging:
            t = self.player.get_time()
            if t is not None:
                self.current_pos = t
            else:
                now = time.time()
                self.current_pos += now - self.last_tick
                self.last_tick = now
            self.playback_panel.update_bar()
            if self.total_seconds > 0 and self.current_pos >= self.total_seconds - 0.5:
                if not self._switching_song:
                    self.next_song()

    def update_cover_rotation(self):
        if self._closing:
            return
        if self.cover_style != 'circle_rotate' or self.stopped or self.paused \
                or self.cover_original_image is None:
            return
        self.cover_rotation_angle = (self.cover_rotation_angle + 1.5) % 360
        self.playback_panel.update_cover_rotation(self.cover_rotation_angle)

    def update_lyrics_display(self):
        self.playback_panel.update_lyrics_display()

    # ---------- 歌曲信息 ----------
    def load_song_info(self, filepath):
        return load_song_info(
            filepath,
            instance=self.player.instance,
            ratings=self.ratings,
            lyrics=self.lyrics,
            metadata_cache=self.metadata_cache,
            song_info_cache=self.song_info_cache,
            bilingual_lyrics=self.bilingual_lyrics,
            prefer_chinese_lyrics=self.prefer_chinese_lyrics,
        )

    def get_cached_title(self, filepath):
        return get_cached_title(filepath, self.metadata_cache, self.ratings)

    def get_cached_artist(self, filepath):
        return get_cached_artist(filepath, self.metadata_cache, self.ratings)

    def get_block_color(self, name):
        return get_block_color(self.blocks, name)

    def current_song_path(self):
        if 0 <= self.current_playlist_index < len(self.playlist):
            return self.playlist[self.current_playlist_index]
        return None

    # ---------- 关闭 ----------
    def closeEvent(self, event):
        self._closing = True
        self.progress_timer.stop()
        self.cover_timer.stop()
        self.lyrics_timer.stop()
        try:
            self.player.stop()
        except Exception:
            pass
        try:
            save_metadata_cache(self.metadata_cache)
            save_ratings(self.ratings)
            save_lyrics(self.lyrics)
        except Exception:
            pass
        try:
            self.nc.server_stop()
        except Exception:
            pass
        event.accept()


class SongLibraryPanel(QWidget):
    def __init__(self, main):
        super().__init__()
        self.main = main
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        # 标题栏
        header = QFrame()
        header.setObjectName("panel")
        header.setStyleSheet(
            f"background: {self.main.theme['ACCENT']}; border-radius: 6px;")
        h_layout = QHBoxLayout(header)
        h_layout.setContentsMargins(12, 6, 12, 6)
        title = QLabel("🎵 音乐库")
        title.setStyleSheet("font-weight: bold; font-size: 13px; color: white;")
        self.count_badge = QLabel("")
        self.count_badge.setStyleSheet(
            f"background: {self.main.theme['ACCENT_PRESSED']}; color: white; "
            "padding: 1px 8px; border-radius: 8px; font-size: 9px;")
        h_layout.addWidget(title)
        h_layout.addStretch(1)
        h_layout.addWidget(self.count_badge)
        layout.addWidget(header)

        # 排序 + 操作行
        control = QHBoxLayout()
        control.setSpacing(6)
        sort_lbl = QLabel("排序：")
        sort_lbl.setObjectName("small")
        self.sort_combo = QComboBox()
        self.sort_combo.addItems(["标题", "歌手", "评分", "块", "流派", "播放次数"])
        self.sort_display_map = {
            'title': '标题', 'artist': '歌手', 'rating': '评分',
            'block': '块', 'genre': '流派', 'play_count': '播放次数',
        }
        self.sort_internal_map = {v: k for k, v in self.sort_display_map.items()}
        self.sort_combo.setCurrentText(self.sort_display_map.get(self.main.sort_mode, '标题'))
        self.sort_combo.currentTextChanged.connect(self._on_sort_changed)
        control.addWidget(sort_lbl)
        control.addWidget(self.sort_combo, 1)
        layout.addLayout(control)

        # 批量操作行
        bulk = QHBoxLayout()
        bulk.setSpacing(4)
        self.btn_select_all = QPushButton("全选")
        self.btn_select_all.clicked.connect(self.select_all_visible)
        self.btn_bulk = QPushButton("批量操作")
        self.btn_bulk.clicked.connect(self._toggle_bulk_panel)
        bulk.addWidget(self.btn_select_all)
        bulk.addWidget(self.btn_bulk)
        layout.addLayout(bulk)

        # 批量操作面板（默认隐藏）
        self.bulk_frame = QFrame()
        bulk_layout = QHBoxLayout(self.bulk_frame)
        bulk_layout.setContentsMargins(0, 0, 0, 0)
        bulk_layout.setSpacing(4)
        self.bulk_block_combo = QComboBox()
        self.bulk_block_combo.addItem("")
        for b in self.main.blocks:
            self.bulk_block_combo.addItem(b.get('name') if isinstance(b, dict) else b)
        self.bulk_genre_combo = QComboBox()
        self.bulk_genre_combo.addItem("")
        for g in self.main.genres:
            self.bulk_genre_combo.addItem(g)
        btn_set_block = QPushButton("设为块")
        btn_set_block.clicked.connect(self._bulk_set_block)
        btn_set_genre = QPushButton("设为流派")
        btn_set_genre.clicked.connect(self._bulk_set_genre)
        btn_add_pl = QPushButton("加入歌单")
        btn_add_pl.clicked.connect(self._bulk_add_to_playlist)
        btn_clear_sel = QPushButton("清除选择")
        btn_clear_sel.clicked.connect(self.clear_selection)
        for w in (self.bulk_block_combo, btn_set_block,
                  self.bulk_genre_combo, btn_set_genre, btn_add_pl, btn_clear_sel):
            bulk_layout.addWidget(w)
        self.bulk_frame.setVisible(False)
        layout.addWidget(self.bulk_frame)

        # 歌曲列表
        self.song_list = QListWidget()
        self.song_list.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.song_list.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.song_list.itemDoubleClicked.connect(self._on_double_click)
        self.song_list.itemSelectionChanged.connect(self._on_selection_changed)
        layout.addWidget(self.song_list, 1)

    def _on_sort_changed(self, text):
        self.main.sort_mode = self.sort_internal_map.get(text, 'title')
        self.main.config['sort_mode'] = self.main.sort_mode
        save_config(self.main.config)
        self.refresh()

    def _toggle_bulk_panel(self):
        self.bulk_frame.setVisible(not self.bulk_frame.isVisible())

    def _bulk_set_block(self):
        val = self.bulk_block_combo.currentText()
        if not self.main.selected_paths:
            QMessageBox.warning(self, "未选择", "请先选择要操作的曲目")
            return
        if not val:
            QMessageBox.warning(self, "未选择", "请先在块下拉框选择一个块")
            return
        for p in list(self.main.selected_paths):
            self.main.ratings.setdefault(p, {})['block'] = val
        save_ratings(self.main.ratings)
        self.main.song_info_cache.clear()
        self.refresh()
        self.clear_selection()

    def _bulk_set_genre(self):
        val = self.bulk_genre_combo.currentText()
        if not self.main.selected_paths:
            QMessageBox.warning(self, "未选择", "请先选择要操作的曲目")
            return
        if not val:
            QMessageBox.warning(self, "未选择", "请先在流派下拉框选择一个流派")
            return
        for p in list(self.main.selected_paths):
            self.main.ratings.setdefault(p, {})['genre'] = val
        save_ratings(self.main.ratings)
        self.main.song_info_cache.clear()
        self.refresh()
        self.clear_selection()

    def _bulk_add_to_playlist(self):
        paths = list(self.main.selected_paths)
        if not paths:
            QMessageBox.warning(self, "未选择", "请先选择要加入歌单的曲目")
            return
        added = 0
        for p in paths:
            if p not in self.main.playlist:
                self.main.playlist.append(p)
                added += 1
        self.refresh_playlist()
        self.clear_selection()

    def _on_double_click(self, item):
        path = item.data(Qt.UserRole)
        if path:
            self.main.play_file(path, add_to_history=False)

    def _on_selection_changed(self):
        # 更新选中集合（用于批量操作）
        self.main.selected_paths.clear()
        for item in self.song_list.selectedItems():
            path = item.data(Qt.UserRole)
            if path:
                self.main.selected_paths.add(path)

    def select_all_visible(self):
        count = self.song_list.count()
        if count == 0:
            return
        # 若全部已选中则清空，否则全选
        if len(self.song_list.selectedItems()) == count:
            self.song_list.clearSelection()
        else:
            self.song_list.selectAll()

    def clear_selection(self):
        self.song_list.clearSelection()
        self.main.selected_paths.clear()

    def refresh(self):
        """重建歌曲库列表。"""
        self.song_list.clear()
        paths = self._sorted_paths()
        paths = self._apply_filter(paths)
        self.count_badge.setText(f"{len(paths)} 首")

        idx = 0
        last_group = None
        for path in paths:
            if self.main.show_index_headers and self.main.sort_mode in ('block', 'genre', 'rating'):
                group = self._group_name(path)
                if group != last_group:
                    last_group = group
                    header = QListWidgetItem()
                    header.setFlags(Qt.NoItemFlags)
                    color = self._group_color(group)
                    header.setBackground(QColor(color))
                    header.setForeground(QColor("white"))
                    header.setText(f"  {group}")
                    self.song_list.addItem(header)

            item = QListWidgetItem()
            item.setData(Qt.UserRole, path)
            display = self._display_name(path)
            item.setText(display)
            score = float(self.main.ratings.get(path, {}).get('score', 0) or 0)
            if score != 0.0:
                item.setText(f"{display}    ★{score:.1f}")
                item.setForeground(QColor(score_to_color(score)))
            else:
                item.setForeground(QColor(self.main.theme['TEXT']))
            if idx % 2 == 1:
                item.setBackground(QColor(self.main.theme['CARD_ALTERNATE']))
            else:
                item.setBackground(QColor(self.main.theme['CARD_BG']))
            self.song_list.addItem(item)
            idx += 1

    def _sorted_paths(self):
        paths = list(self.main.audio_paths) if self.main.audio_paths else []
        sm = self.main.sort_mode
        if sm == 'title':
            paths.sort(key=lambda p: self.main.get_cached_title(p).lower())
        elif sm == 'artist':
            paths.sort(key=lambda p: self.main.get_cached_artist(p).lower())
        elif sm == 'rating':
            paths.sort(key=lambda p: self.main.ratings.get(p, {}).get('score', 0), reverse=True)
        elif sm == 'block':
            paths.sort(key=lambda p: (self.main.ratings.get(p, {}).get('block', '') == '',
                                      self.main.ratings.get(p, {}).get('block', '')))
        elif sm == 'genre':
            paths.sort(key=lambda p: (self.main.ratings.get(p, {}).get('genre', '') == '',
                                      self.main.ratings.get(p, {}).get('genre', '')))
        elif sm == 'play_count':
            paths.sort(key=lambda p: self.main.ratings.get(p, {}).get('play_count', 0), reverse=True)
        return paths

    def _apply_filter(self, paths):
        if self.main.rating_filter_active:
            lo = self.main.rating_filter_min
            hi = self.main.rating_filter_max
            return [p for p in paths
                    if lo <= float(self.main.ratings.get(p, {}).get('score', 0) or 0) <= hi]
        return paths

    def _display_name(self, path):
        if self.main.artist_hidden:
            info = self.main.load_song_info(path)
            name = info.get('title', os.path.basename(path))
        else:
            name = self.main.get_cached_title(path)
        note = str(self.main.ratings.get(path, {}).get('note', '') or '')
        if note:
            if self.main.note_display_mode == 'note_only':
                name = note[:30]
            elif self.main.note_display_mode == 'expanded':
                name = f"{name}  ({note[:27]})"
        return name

    def _group_name(self, path):
        if self.main.sort_mode == 'block':
            return self.main.ratings.get(path, {}).get('block', '') or '未分组'
        elif self.main.sort_mode == 'genre':
            return self.main.ratings.get(path, {}).get('genre', '') or '未分类'
        elif self.main.sort_mode == 'rating':
            score = float(self.main.ratings.get(path, {}).get('score', 0) or 0)
            base = int(score)
            return f"{base}+" if score >= base + 0.6 else str(base)
        return None

    def _group_color(self, group):
        if self.main.sort_mode == 'block':
            return self.main.get_block_color(group)
        return DEFAULT_BLOCK_COLOR

    def refresh_playlist(self):
        """播放列表在右侧面板中，转发调用。"""
        self.main.function_panels.refresh_playlist()


class PlaybackPanel(QWidget):
    def __init__(self, main):
        super().__init__()
        self.main = main
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        layout.setAlignment(Qt.AlignTop)

        # 封面
        self.cover_label = QLabel()
        self.cover_label.setFixedSize(200, 200)
        self.cover_label.setAlignment(Qt.AlignCenter)
        self.cover_label.setStyleSheet(
            f"background: {self.main.theme['PANEL_BG']}; border-radius: 100px;")
        layout.addWidget(self.cover_label, 0, Qt.AlignHCenter)

        # 标题
        self.title_label = QLabel("歌曲：...")
        self.title_label.setObjectName("title")
        self.title_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.title_label)
        self.artist_label = QLabel("歌手：...")
        self.artist_label.setObjectName("muted")
        self.artist_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.artist_label)
        self.duration_label = QLabel("时长：...")
        self.duration_label.setObjectName("small")
        self.duration_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.duration_label)

        # 进度条
        self.progress_slider = QSlider(Qt.Horizontal)
        self.progress_slider.setRange(0, 1000)
        self.progress_slider.sliderPressed.connect(self._on_slider_pressed)
        self.progress_slider.sliderReleased.connect(self._on_slider_released)
        layout.addWidget(self.progress_slider)
        self.time_label = QLabel("0:00 / 0:00")
        self.time_label.setObjectName("small")
        self.time_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.time_label)

        # 歌词
        self.lyrics_label = QLabel()
        self.lyrics_label.setAlignment(Qt.AlignCenter)
        self.lyrics_label.setWordWrap(True)
        self.lyrics_label.setMinimumHeight(120)
        layout.addWidget(self.lyrics_label)

        # 音量
        vol_layout = QHBoxLayout()
        self.volume_label = QLabel(f"音量：{self.main.current_volume}%")
        self.volume_label.setObjectName("small")
        self.volume_slider = QSlider(Qt.Horizontal)
        self.volume_slider.setRange(0, 100)
        self.volume_slider.setValue(self.main.current_volume)
        self.volume_slider.valueChanged.connect(self.main.set_volume)
        self.volume_slider.setFixedWidth(160)
        vol_layout.addStretch(1)
        vol_layout.addWidget(self.volume_label)
        vol_layout.addWidget(self.volume_slider)
        vol_layout.addStretch(1)
        layout.addLayout(vol_layout)

        # 评分
        score_layout = QHBoxLayout()
        score_lbl = QLabel("评分：")
        score_lbl.setObjectName("small")
        self.score_spin = QDoubleSpinBox()
        self.score_spin.setRange(0.0, 10.0)
        self.score_spin.setSingleStep(0.1)
        self.score_spin.setFixedWidth(80)
        btn_save_score = QPushButton("保存")
        btn_save_score.clicked.connect(self._save_score)
        score_layout.addStretch(1)
        score_layout.addWidget(score_lbl)
        score_layout.addWidget(self.score_spin)
        score_layout.addWidget(btn_save_score)
        score_layout.addStretch(1)
        layout.addLayout(score_layout)

        # 控制按钮
        ctrl = QHBoxLayout()
        ctrl.setAlignment(Qt.AlignCenter)
        ctrl.setSpacing(8)
        self.btn_prev = QPushButton("⏮")
        self.btn_prev.setObjectName("iconBtn")
        self.btn_prev.clicked.connect(self.main.prev_song)
        self.btn_play = QPushButton("▶")
        self.btn_play.setObjectName("playBtn")
        self.btn_play.clicked.connect(self.main.pause_or_resume)
        self.btn_next = QPushButton("⏭")
        self.btn_next.setObjectName("iconBtn")
        self.btn_next.clicked.connect(self.main.next_song)
        self.btn_stop = QPushButton("⏹")
        self.btn_stop.setObjectName("iconBtn")
        self.btn_stop.clicked.connect(self.main.stop)
        for b in (self.btn_prev, self.btn_play, self.btn_next, self.btn_stop):
            ctrl.addWidget(b)
        layout.addLayout(ctrl)

        # 播放模式
        mode_layout = QHBoxLayout()
        mode_layout.setAlignment(Qt.AlignCenter)
        self.mode_combo = QComboBox()
        self.mode_combo.addItems(["循环播放", "列表播放", "单曲循环", "随机播放"])
        self.mode_map = {
            'list_loop': '循环播放', 'list_sequential': '列表播放',
            'single_loop': '单曲循环', 'random': '随机播放',
        }
        self.mode_internal = {v: k for k, v in self.mode_map.items()}
        self.mode_combo.setCurrentText(self.mode_map.get(self.main.play_mode, '循环播放'))
        self.mode_combo.currentTextChanged.connect(self._on_mode_changed)
        mode_layout.addWidget(QLabel("模式："))
        mode_layout.addWidget(self.mode_combo)
        layout.addLayout(mode_layout)

        layout.addStretch(1)

    def _on_slider_pressed(self):
        self.main.dragging = True

    def _on_slider_released(self):
        self.main.dragging = False
        if self.main.total_seconds > 0:
            frac = self.progress_slider.value() / 1000.0
            self.main.seek(frac * self.main.total_seconds)

    def _save_score(self):
        path = self.main.current_song_path()
        if not path:
            return
        score = self.score_spin.value()
        self.main.ratings.setdefault(path, {})['score'] = score
        save_ratings(self.main.ratings)
        self.main.library_panel.refresh()

    def _on_mode_changed(self, text):
        mode = self.mode_internal.get(text, 'list_loop')
        self.main.set_play_mode(mode)

    # ---------- 刷新方法 ----------
    def refresh_current_song(self):
        path = self.main.current_song_path()
        if not path:
            self.title_label.setText("歌曲：...")
            self.artist_label.setText("歌手：...")
            self.duration_label.setText("时长：...")
            self.cover_label.clear()
            self.score_spin.setValue(0.0)
            self.main.current_lyrics = []
            self.main.current_lyric_index = -1
            self.lyrics_label.clear()
            return
        info = self.main.load_song_info(path)
        self.title_label.setText(f"歌曲：{info['title']}")
        self.artist_label.setText(f"歌手：{info['artist']}")
        self.main.total_seconds = info['duration']
        self.main.duration_str = f"{info['duration'] // 60}:{info['duration'] % 60:02d}" \
            if info['duration'] > 0 else "未知时长"
        self.duration_label.setText(f"时长：{self.main.duration_str}")
        self.score_spin.setValue(float(self.main.ratings.get(path, {}).get('score', 0) or 0))
        self.main.current_lyrics = info.get('lyrics', [])
        self.main.current_lyric_index = -1
        self._update_cover(info.get('cover'))

    def _update_cover(self, cover):
        self.main.cover_original_image = cover
        self.main.cover_rotation_angle = 0.0
        if cover is None:
            self.cover_label.clear()
            self.cover_label.setText("无封面")
            return
        try:
            pixmap = self._cover_pixmap(cover, 0.0)
            self.cover_label.setPixmap(pixmap)
        except Exception:
            self.cover_label.clear()
            self.cover_label.setText("封面错误")

    def _cover_pixmap(self, cover, angle):
        size = 200
        img = cover.copy()
        img = img.resize((size, size), Image.Resampling.LANCZOS)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        if self.main.cover_style == 'circle_rotate':
            mask = Image.new("L", (size, size), 0)
            draw = ImageDraw.Draw(mask)
            draw.ellipse((0, 0, size, size), fill=255)
            img = img.rotate(-angle, resample=Image.Resampling.BICUBIC,
                             center=(size // 2, size // 2))
            img.putalpha(mask)
        data = img.tobytes("raw", "RGBA")
        qimg = QImage(data, size, size, QImage.Format_RGBA8888)
        return QPixmap.fromImage(qimg)

    def update_cover_rotation(self, angle):
        if self.main.cover_original_image is None:
            return
        try:
            self.cover_label.setPixmap(self._cover_pixmap(self.main.cover_original_image, angle))
        except Exception:
            pass

    def update_play_button(self):
        if self.main.stopped or self.main.paused:
            self.btn_play.setText("▶")
        else:
            self.btn_play.setText("⏸")

    def update_bar(self):
        if self.main.total_seconds == 0:
            frac = 0
        else:
            frac = min(self.main.current_pos / self.main.total_seconds, 1.0)
        if not self.main.dragging:
            self.progress_slider.setValue(int(frac * 1000))
        if self.main.total_seconds > 0:
            m = int(self.main.current_pos) // 60
            s = int(self.main.current_pos) % 60
            self.time_label.setText(f"{m}:{s:02d} / {self.main.duration_str}")
        else:
            self.time_label.setText(f"? / {self.main.duration_str}")

    def update_volume_label(self):
        self.volume_label.setText(f"音量：{self.main.current_volume}%")

    def update_mode_display(self):
        self.mode_combo.blockSignals(True)
        self.mode_combo.setCurrentText(self.mode_map.get(self.main.play_mode, '循环播放'))
        self.mode_combo.blockSignals(False)

    def update_lyrics_display(self):
        lyrics = self.main.current_lyrics
        if not lyrics:
            self.lyrics_label.clear()
            return
        idx = -1
        for i, item in enumerate(lyrics):
            if self.main.current_pos >= item[0]:
                idx = i
            else:
                break
        self.main.current_lyric_index = idx
        if 0 <= idx < len(lyrics):
            cur = lyrics[idx]
            trans = cur[2] if len(cur) > 2 else ''
            text = cur[1]
            if trans:
                text += f"\n{trans}"
            self.lyrics_label.setText(text)
        else:
            self.lyrics_label.clear()

    def refresh_theme(self):
        self.cover_label.setStyleSheet(
            f"background: {self.main.theme['PANEL_BG']}; border-radius: 100px;")


class FunctionPanels(QWidget):
    def __init__(self, main):
        super().__init__()
        self.main = main
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        # 标题栏
        header = QFrame()
        header.setStyleSheet(
            f"background: {self.main.theme['ACCENT']}; border-radius: 6px;")
        h_layout = QHBoxLayout(header)
        h_layout.setContentsMargins(12, 6, 12, 6)
        title = QLabel("⚙ 功能面板")
        title.setStyleSheet("font-weight: bold; font-size: 13px; color: white;")
        h_layout.addWidget(title)
        layout.addWidget(header)

        # 功能选择器
        self.editor_combo = QComboBox()
        self.editor_items = [
            "播放列表", "歌单", "歌曲编辑", "搜索与筛选", "网易云音乐",
            "评论", "歌词", "块", "流派", "设置",
        ]
        self.editor_combo.addItems(self.editor_items)
        self.editor_combo.currentTextChanged.connect(self._switch)
        layout.addWidget(self.editor_combo)

        # 堆叠面板
        self.stack = QStackedWidget()
        layout.addWidget(self.stack, 1)

        # 各面板占位（子面板在 _switch 中按需构建）
        self.panels = {}

    def _switch(self, name):
        if name not in self.panels:
            self._build_panel(name)
        self.stack.setCurrentWidget(self.panels[name])

    def _build_panel(self, name):
        if name == "播放列表":
            w = self._build_playlist_panel()
        elif name == "歌单":
            w = self._build_saved_playlists_panel()
        elif name == "歌曲编辑":
            w = self._build_song_edit_panel()
        elif name == "搜索与筛选":
            w = self._build_filter_panel()
        elif name == "网易云音乐":
            w = self._build_netease_panel()
        elif name == "评论":
            w = self._build_comments_panel()
        elif name == "歌词":
            w = self._build_lyrics_panel()
        elif name == "块":
            w = self._build_blocks_panel()
        elif name == "流派":
            w = self._build_genres_panel()
        elif name == "设置":
            w = self._build_settings_panel()
        else:
            w = QLabel(name)
        self.panels[name] = w
        self.stack.addWidget(w)

    # ---------- 播放列表 ----------
    def _build_playlist_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        header = QLabel("▶️ 当前播放列表")
        header.setObjectName("title")
        layout.addWidget(header)

        self.playlist_list = QListWidget()
        self.playlist_list.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.playlist_list.itemDoubleClicked.connect(self._pl_double_click)
        self.playlist_list.setDragDropMode(QAbstractItemView.InternalMove)
        self.playlist_list.setDefaultDropAction(Qt.MoveAction)
        self.playlist_list.model().rowsMoved.connect(self._pl_sync_order)
        layout.addWidget(self.playlist_list, 1)

        btn_row = QHBoxLayout()
        btn_save = QPushButton("保存到歌单")
        btn_save.clicked.connect(self._save_playlist)
        btn_clear = QPushButton("清空列表")
        btn_clear.setObjectName("danger")
        btn_clear.clicked.connect(self._clear_playlist)
        btn_remove = QPushButton("移除选中")
        btn_remove.clicked.connect(self._remove_from_playlist)
        for b in (btn_save, btn_remove, btn_clear):
            btn_row.addWidget(b)
        layout.addLayout(btn_row)
        return w

    def refresh_playlist(self):
        if not hasattr(self, 'playlist_list'):
            return
        self.playlist_list.clear()
        for i, path in enumerate(self.main.playlist):
            item = QListWidgetItem()
            item.setData(Qt.UserRole, path)
            item.setText(self.main.get_cached_title(path) or os.path.basename(path))
            if i == self.main.current_playlist_index and not self.main.stopped:
                item.setForeground(QColor(self.main.theme['ACCENT']))
            if i % 2 == 1:
                item.setBackground(QColor(self.main.theme['CARD_ALTERNATE']))
            else:
                item.setBackground(QColor(self.main.theme['CARD_BG']))
            self.playlist_list.addItem(item)

    def _pl_double_click(self, item):
        path = item.data(Qt.UserRole)
        if path:
            self.main.play_file(path, add_to_history=False)

    def _pl_sync_order(self, *args):
        """拖拽重排后同步 playlist 数据顺序。"""
        new_order = [self.playlist_list.item(i).data(Qt.UserRole)
                     for i in range(self.playlist_list.count())]
        if len(new_order) != len(self.main.playlist):
            return
        # 更新当前播放索引
        cur = self.main.current_song_path()
        self.main.playlist[:] = new_order
        if cur is not None and cur in self.main.playlist:
            self.main.current_playlist_index = self.main.playlist.index(cur)

    def _save_playlist(self):
        from PySide6.QtWidgets import QInputDialog
        name, ok = QInputDialog.getText(self, "保存歌单", "请输入歌单名称：")
        if ok and name.strip():
            if save_current_playlist(name.strip(), self.main.playlist):
                QMessageBox.information(self, "成功", f"歌单“{name}”已保存")

    def _clear_playlist(self):
        if QMessageBox.question(self, "清空列表", "确认清空当前播放列表吗？") == QMessageBox.Yes:
            self.main.playlist.clear()
            self.main.current_playlist_index = -1
            self.main.list_seq_played_index = -1
            self.main.player.stop()
            self.main.stopped = True
            self.main.paused = False
            self.refresh_playlist()
            self.main.playback_panel.refresh_current_song()
            self.main.playback_panel.update_play_button()

    def _remove_from_playlist(self):
        rows = sorted([self.playlist_list.row(i) for i in self.playlist_list.selectedIndexes()],
                      reverse=True)
        if not rows:
            QMessageBox.warning(self, "未选择", "请先选择要移除的歌曲")
            return
        for r in rows:
            if 0 <= r < len(self.main.playlist):
                self.main.playlist.pop(r)
        if self.main.current_playlist_index >= len(self.main.playlist):
            self.main.current_playlist_index = len(self.main.playlist) - 1
        if not self.main.playlist:
            self.main.player.stop()
            self.main.stopped = True
            self.main.paused = False
        self.refresh_playlist()

    # ---------- 刷新入口 ----------
    def refresh_current_song(self):
        pass

    def refresh_theme(self):
        pass

    # ---------- 已保存歌单 ----------
    def _build_saved_playlists_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        header = QLabel("📋 已保存的歌单")
        header.setObjectName("title")
        layout.addWidget(header)

        self.saved_pl_list = QListWidget()
        self.saved_pl_list.itemDoubleClicked.connect(self._open_playlist_detail)
        layout.addWidget(self.saved_pl_list, 1)

        btn_row = QHBoxLayout()
        btn_add = QPushButton("添加到播放列表")
        btn_add.clicked.connect(self._saved_pl_add_to_queue)
        btn_del = QPushButton("删除歌单")
        btn_del.setObjectName("danger")
        btn_del.clicked.connect(self._saved_pl_delete)
        btn_row.addWidget(btn_add)
        btn_row.addWidget(btn_del)
        layout.addLayout(btn_row)
        self.refresh_saved_playlists()
        return w

    def refresh_saved_playlists(self):
        if not hasattr(self, 'saved_pl_list'):
            return
        self.saved_pl_list.clear()
        for fp in get_playlist_files():
            item = QListWidgetItem(os.path.splitext(os.path.basename(fp))[0])
            item.setData(Qt.UserRole, fp)
            self.saved_pl_list.addItem(item)

    def _saved_pl_add_to_queue(self):
        item = self.saved_pl_list.currentItem()
        if not item:
            QMessageBox.warning(self, "未选择", "请先选择一个歌单")
            return
        fp = item.data(Qt.UserRole)
        added = 0
        for s in load_playlist(fp):
            if s not in self.main.playlist:
                self.main.playlist.append(s)
                added += 1
        self.refresh_playlist()

    def _saved_pl_delete(self):
        item = self.saved_pl_list.currentItem()
        if not item:
            QMessageBox.warning(self, "未选择", "请先选择一个歌单")
            return
        fp = item.data(Qt.UserRole)
        if QMessageBox.question(self, "删除歌单",
                                f"确认删除歌单：{os.path.basename(fp)} ?") == QMessageBox.Yes:
            try:
                os.remove(fp)
            except Exception as e:
                QMessageBox.critical(self, "错误", f"删除失败：{e}")
            self.refresh_saved_playlists()

    # ---------- 块管理 ----------
    def _build_blocks_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        header = QLabel("📋 块管理")
        header.setObjectName("title")
        layout.addWidget(header)

        self.blocks_list = QListWidget()
        self.blocks_list.itemDoubleClicked.connect(self._open_block_editor)
        layout.addWidget(self.blocks_list, 1)

        # 输入行
        input_row = QHBoxLayout()
        self.block_entry = QLineEdit()
        self.block_entry.setPlaceholderText("输入块名称")
        btn_add = QPushButton("添加块")
        btn_add.clicked.connect(self._block_add)
        input_row.addWidget(self.block_entry, 1)
        input_row.addWidget(btn_add)
        layout.addLayout(input_row)

        btn_row = QHBoxLayout()
        btn_color = QPushButton("🎨 改色")
        btn_color.clicked.connect(self._block_edit_color)
        btn_del = QPushButton("删除块")
        btn_del.setObjectName("danger")
        btn_del.clicked.connect(self._block_delete)
        btn_row.addWidget(btn_color)
        btn_row.addWidget(btn_del)
        layout.addLayout(btn_row)
        self.refresh_blocks()
        return w

    def refresh_blocks(self):
        if not hasattr(self, 'blocks_list'):
            return
        self.blocks_list.clear()
        for b in self.main.blocks:
            name = b.get('name') if isinstance(b, dict) else b
            color = b.get('color', DEFAULT_BLOCK_COLOR) if isinstance(b, dict) else DEFAULT_BLOCK_COLOR
            count = len([p for p, ud in self.main.ratings.items()
                         if ud.get('block', '') == name])
            item = QListWidgetItem(f"{name}  ({count}首)")
            item.setData(Qt.UserRole, name)
            item.setForeground(QColor(color))
            self.blocks_list.addItem(item)

    def _block_add(self):
        name = self.block_entry.text().strip()
        if not name:
            QMessageBox.warning(self, "提示", "请输入块名称")
            return
        if any(b.get('name') == name for b in self.main.blocks if isinstance(b, dict)):
            QMessageBox.warning(self, "提示", "该块已存在")
            return
        self.main.blocks.append({'name': name, 'color': DEFAULT_BLOCK_COLOR})
        save_blocks(self.main.blocks)
        self.block_entry.clear()
        self.refresh_blocks()

    def _block_delete(self):
        item = self.blocks_list.currentItem()
        if not item:
            QMessageBox.warning(self, "未选择", "请选择要删除的块")
            return
        name = item.data(Qt.UserRole)
        if QMessageBox.question(self, "确认", f"删除块：{name} ?") != QMessageBox.Yes:
            return
        self.main.blocks[:] = [b for b in self.main.blocks
                               if (b.get('name') if isinstance(b, dict) else b) != name]
        save_blocks(self.main.blocks)
        for k, v in list(self.main.ratings.items()):
            if v.get('block') == name:
                v['block'] = ''
        save_ratings(self.main.ratings)
        self.main.song_info_cache.clear()
        self.main.library_panel.refresh()
        self.refresh_blocks()

    def _block_edit_color(self):
        item = self.blocks_list.currentItem()
        if not item:
            return
        name = item.data(Qt.UserRole)
        color = QColorDialog.getColor(QColor(self.main.get_block_color(name)), self, f"选择 {name} 的颜色")
        if color.isValid():
            set_block_color(self.main.blocks, name, color.name())
            self.main.library_panel.refresh()
            self.refresh_blocks()

    # ---------- 流派管理 ----------
    def _build_genres_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        header = QLabel("🎶 流派管理")
        header.setObjectName("title")
        layout.addWidget(header)

        self.genres_list = QListWidget()
        self.genres_list.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.genres_list.itemDoubleClicked.connect(self._open_genre_editor)
        layout.addWidget(self.genres_list, 1)

        input_row = QHBoxLayout()
        self.genre_entry = QLineEdit()
        self.genre_entry.setPlaceholderText("输入流派名称")
        btn_add = QPushButton("添加")
        btn_add.clicked.connect(self._genre_add)
        input_row.addWidget(self.genre_entry, 1)
        input_row.addWidget(btn_add)
        layout.addLayout(input_row)

        btn_del = QPushButton("删除选中")
        btn_del.setObjectName("danger")
        btn_del.clicked.connect(self._genre_delete)
        layout.addWidget(btn_del)
        self.refresh_genres()
        return w

    def refresh_genres(self):
        if not hasattr(self, 'genres_list'):
            return
        self.genres_list.clear()
        for g in self.main.genres:
            count = len([p for p, ud in self.main.ratings.items()
                         if ud.get('genre', '') == g])
            self.genres_list.addItem(f"{g}  ({count}首)")

    def _genre_add(self):
        name = self.genre_entry.text().strip()
        if not name:
            return
        if name in self.main.genres:
            QMessageBox.warning(self, "提示", "该流派已存在")
            return
        self.main.genres.append(name)
        save_genres(self.main.genres)
        self.genre_entry.clear()
        self.refresh_genres()

    def _genre_delete(self):
        rows = sorted([self.genres_list.row(i) for i in self.genres_list.selectedIndexes()],
                      reverse=True)
        if not rows:
            QMessageBox.warning(self, "未选择", "请先选择要删除的流派")
            return
        names = [self.main.genres[r] for r in rows if 0 <= r < len(self.main.genres)]
        if QMessageBox.question(self, "确认",
                                f"删除 {len(names)} 个流派吗？") != QMessageBox.Yes:
            return
        for g in names:
            if g in self.main.genres:
                self.main.genres.remove(g)
            for k, v in list(self.main.ratings.items()):
                if v.get('genre') == g:
                    v['genre'] = ''
        save_genres(self.main.genres)
        save_ratings(self.main.ratings)
        self.main.song_info_cache.clear()
        self.main.library_panel.refresh()
        self.refresh_genres()

    # ---------- 二级编辑器（块 / 流派 / 歌单详情） ----------
    def _open_editor(self, key, builder):
        """打开二级编辑器页面（加入 stack 并切换）。"""
        if key not in self.panels:
            w = builder()
            self.panels[key] = w
            self.stack.addWidget(w)
        self.stack.setCurrentWidget(self.panels[key])

    def _editor_header(self, title, back_target):
        """编辑器头部：返回按钮 + 标题。"""
        header = QFrame()
        header.setStyleSheet(f"background: {self.main.theme['ACCENT']}; border-radius: 6px;")
        h = QHBoxLayout(header)
        h.setContentsMargins(8, 4, 8, 4)
        back_btn = QPushButton("✕")
        back_btn.setFixedWidth(28)
        back_btn.clicked.connect(lambda: self._switch(back_target))
        lbl = QLabel(title)
        lbl.setStyleSheet("font-weight: bold; font-size: 13px; color: white;")
        h.addWidget(back_btn)
        h.addWidget(lbl)
        h.addStretch(1)
        return header

    def _make_draggable_list(self):
        """创建支持内部拖拽重排的列表。"""
        lst = QListWidget()
        lst.setSelectionMode(QAbstractItemView.ExtendedSelection)
        lst.setDragDropMode(QAbstractItemView.InternalMove)
        lst.setDefaultDropAction(Qt.MoveAction)
        return lst

    def _open_block_editor(self, item=None):
        name = item.data(Qt.UserRole) if item else (self.blocks_list.currentItem().data(Qt.UserRole)
                                                    if self.blocks_list.currentItem() else None)
        if not name:
            return
        self._open_editor(f"块编辑:{name}", lambda: self._build_block_editor(name))

    def _build_block_editor(self, name):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        layout.addWidget(self._editor_header(f"🧩 块：{name}", "块"))

        songs = [p for p, ud in self.main.ratings.items() if ud.get('block', '') == name]
        self._cur_editor_songs = songs
        lst = self._make_draggable_list()
        lst.itemDoubleClicked.connect(lambda i: self.main.play_file(i.data(Qt.UserRole), add_to_history=False))
        layout.addWidget(lst, 1)

        btn1 = QHBoxLayout()
        b_all = QPushButton("全选")
        b_all.clicked.connect(lambda: (lst.selectAll() if len(lst.selectedItems()) != lst.count() else lst.clearSelection()))
        b_remove = QPushButton("移除选中")
        b_remove.clicked.connect(lambda: self._editor_remove_selected(lst, songs, name, 'block'))
        btn1.addWidget(b_all)
        btn1.addWidget(b_remove)
        layout.addLayout(btn1)

        btn2 = QHBoxLayout()
        b_pl = QPushButton("加入歌单")
        b_pl.clicked.connect(lambda: self._editor_add_to_playlist(lst, songs))
        b_left = QPushButton("从左边栏添加")
        b_left.clicked.connect(lambda: self._editor_add_from_left(lst, songs, name, 'block'))
        btn2.addWidget(b_pl)
        btn2.addWidget(b_left)
        layout.addLayout(btn2)

        self._fill_editor_list(lst, songs)
        # 拖拽重排后同步 songs 顺序
        lst.model().rowsMoved.connect(lambda *_: self._sync_editor_order(lst, songs))
        return w

    def _open_genre_editor(self, item=None):
        name = item.data(Qt.UserRole) if item else (self.genres_list.currentItem().data(Qt.UserRole)
                                                    if self.genres_list.currentItem() else None)
        if not name:
            return
        self._open_editor(f"流派编辑:{name}", lambda: self._build_genre_editor(name))

    def _build_genre_editor(self, name):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        layout.addWidget(self._editor_header(f"🎶 流派：{name}", "流派"))

        songs = [p for p, ud in self.main.ratings.items() if ud.get('genre', '') == name]
        self._cur_editor_songs = songs
        lst = self._make_draggable_list()
        lst.itemDoubleClicked.connect(lambda i: self.main.play_file(i.data(Qt.UserRole), add_to_history=False))
        layout.addWidget(lst, 1)

        btn1 = QHBoxLayout()
        b_all = QPushButton("全选")
        b_all.clicked.connect(lambda: (lst.selectAll() if len(lst.selectedItems()) != lst.count() else lst.clearSelection()))
        b_remove = QPushButton("移除选中")
        b_remove.clicked.connect(lambda: self._editor_remove_selected(lst, songs, name, 'genre'))
        btn1.addWidget(b_all)
        btn1.addWidget(b_remove)
        layout.addLayout(btn1)

        btn2 = QHBoxLayout()
        b_pl = QPushButton("加入歌单")
        b_pl.clicked.connect(lambda: self._editor_add_to_playlist(lst, songs))
        b_left = QPushButton("从左边栏添加")
        b_left.clicked.connect(lambda: self._editor_add_from_left(lst, songs, name, 'genre'))
        btn2.addWidget(b_pl)
        btn2.addWidget(b_left)
        layout.addLayout(btn2)

        self._fill_editor_list(lst, songs)
        lst.model().rowsMoved.connect(lambda *_: self._sync_editor_order(lst, songs))
        return w

    def _open_playlist_detail(self, item=None):
        fp = item.data(Qt.UserRole) if item else (self.saved_pl_list.currentItem().data(Qt.UserRole)
                                                  if self.saved_pl_list.currentItem() else None)
        if not fp:
            return
        self._open_editor(f"歌单详情:{fp}", lambda: self._build_playlist_detail(fp))

    def _build_playlist_detail(self, fp):
        name = os.path.splitext(os.path.basename(fp))[0]
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        layout.addWidget(self._editor_header(f"📋 歌单：{name}", "歌单"))

        songs = load_playlist(fp)
        lst = self._make_draggable_list()
        lst.itemDoubleClicked.connect(lambda i: self.main.play_file(i.data(Qt.UserRole), add_to_history=False))
        layout.addWidget(lst, 1)

        btn1 = QHBoxLayout()
        b_all = QPushButton("全选")
        b_all.clicked.connect(lambda: (lst.selectAll() if len(lst.selectedItems()) != lst.count() else lst.clearSelection()))
        b_remove = QPushButton("移除选中")
        b_remove.clicked.connect(lambda: self._pl_detail_remove(lst, songs, fp))
        btn1.addWidget(b_all)
        btn1.addWidget(b_remove)
        layout.addLayout(btn1)

        btn2 = QHBoxLayout()
        b_pl = QPushButton("加入播放列表")
        b_pl.clicked.connect(lambda: self._editor_add_to_playlist(lst, songs))
        b_left = QPushButton("从左边栏添加")
        b_left.clicked.connect(lambda: self._pl_detail_add_from_left(lst, songs, fp))
        btn2.addWidget(b_pl)
        btn2.addWidget(b_left)
        layout.addLayout(btn2)

        self._fill_editor_list(lst, songs)
        lst.model().rowsMoved.connect(lambda *_: self._pl_detail_save_order(lst, songs, fp))
        return w

    # ---- 编辑器共用辅助 ----
    def _fill_editor_list(self, lst, songs):
        lst.clear()
        for p in songs:
            item = QListWidgetItem(self.main.get_cached_title(p) or os.path.basename(p))
            item.setData(Qt.UserRole, p)
            lst.addItem(item)

    def _sync_editor_order(self, lst, songs):
        songs[:] = [lst.item(i).data(Qt.UserRole) for i in range(lst.count())]

    def _editor_remove_selected(self, lst, songs, name, field):
        sel = [lst.row(i) for i in lst.selectedIndexes()]
        if not sel:
            QMessageBox.warning(self, "未选择", "请先选择要移除的曲目")
            return
        for r in sorted(sel, reverse=True):
            if 0 <= r < len(songs):
                p = songs.pop(r)
                ud = self.main.ratings.get(p, {})
                if ud.get(field):
                    ud[field] = ''
                    self.main.ratings[p] = ud
        save_ratings(self.main.ratings)
        self.main.song_info_cache.clear()
        self.main.library_panel.refresh()
        self._fill_editor_list(lst, songs)

    def _editor_add_to_playlist(self, lst, songs):
        sel = [lst.row(i) for i in lst.selectedIndexes()]
        if not sel:
            QMessageBox.warning(self, "未选择", "请先选择曲目")
            return
        added = 0
        for r in sorted(sel):
            if 0 <= r < len(songs):
                p = songs[r]
                if p not in self.main.playlist:
                    self.main.playlist.append(p)
                    added += 1
        self.refresh_playlist()
        QMessageBox.information(self, "已添加", f"已将 {added} 首曲目加入播放列表")

    def _editor_add_from_left(self, lst, songs, name, field):
        if not self.main.selected_paths:
            QMessageBox.warning(self, "未选择", "请先在左边栏选择要添加的曲目")
            return
        added = 0
        for p in list(self.main.selected_paths):
            if p not in songs:
                songs.append(p)
                self.main.ratings.setdefault(p, {})[field] = name
                added += 1
        if added:
            save_ratings(self.main.ratings)
            self.main.song_info_cache.clear()
            self.main.library_panel.refresh()
            self._fill_editor_list(lst, songs)

    def _pl_detail_remove(self, lst, songs, fp):
        sel = [lst.row(i) for i in lst.selectedIndexes()]
        if not sel:
            QMessageBox.warning(self, "未选择", "请先选择要移除的曲目")
            return
        for r in sorted(sel, reverse=True):
            if 0 <= r < len(songs):
                songs.pop(r)
        self._pl_detail_save(songs, fp)
        self._fill_editor_list(lst, songs)

    def _pl_detail_add_from_left(self, lst, songs, fp):
        if not self.main.selected_paths:
            QMessageBox.warning(self, "未选择", "请先在左边栏选择曲目")
            return
        for p in list(self.main.selected_paths):
            if p not in songs:
                songs.append(p)
        self._pl_detail_save(songs, fp)
        self._fill_editor_list(lst, songs)

    def _pl_detail_save_order(self, lst, songs, fp):
        songs[:] = [lst.item(i).data(Qt.UserRole) for i in range(lst.count())]
        self._pl_detail_save(songs, fp)

    def _pl_detail_save(self, songs, fp):
        try:
            with open(fp, 'w', encoding='utf-8') as f:
                json.dump(songs, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    # ---------- 歌曲编辑 ----------
    def _build_song_edit_panel(self):
        w = QWidget()
        outer = QVBoxLayout(w)
        outer.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(8)
        layout.setAlignment(Qt.AlignTop)

        # 封面
        self.edit_cover_label = QLabel("无封面")
        self.edit_cover_label.setFixedSize(120, 120)
        self.edit_cover_label.setAlignment(Qt.AlignCenter)
        self.edit_cover_label.setStyleSheet(
            f"background: {self.main.theme['CARD_BG']}; border-radius: 8px;")
        layout.addWidget(self.edit_cover_label, 0, Qt.AlignHCenter)
        btn_cover = QPushButton("更换封面")
        btn_cover.clicked.connect(self._choose_cover)
        layout.addWidget(btn_cover)

        # 基本信息
        self.edit_title = QLineEdit()
        self.edit_title.setPlaceholderText("歌名")
        self.edit_artist = QLineEdit()
        self.edit_artist.setPlaceholderText("歌手")
        self.edit_score = QDoubleSpinBox()
        self.edit_score.setRange(0.0, 10.0)
        self.edit_score.setSingleStep(0.1)
        layout.addWidget(self._field("歌名：", self.edit_title))
        layout.addWidget(self._field("歌手：", self.edit_artist))
        layout.addWidget(self._field("评分：", self.edit_score))

        # 标签
        self.edit_note = QLineEdit()
        self.edit_note.setPlaceholderText("备注")
        self.edit_genre = QComboBox()
        self.edit_genre.setEditable(True)
        self.edit_genre.addItems(self.main.genres)
        self.edit_block = QComboBox()
        self.edit_block.setEditable(True)
        self.edit_block.addItems([b.get('name') if isinstance(b, dict) else b
                                  for b in self.main.blocks])
        self.edit_comment = QLineEdit()
        self.edit_comment.setPlaceholderText("评论")
        layout.addWidget(self._field("备注：", self.edit_note))
        layout.addWidget(self._field("流派：", self.edit_genre))
        layout.addWidget(self._field("块：", self.edit_block))
        layout.addWidget(self._field("评论：", self.edit_comment))

        # 网易云绑定
        self.edit_netease_id = QLineEdit()
        self.edit_netease_id.setPlaceholderText("网易云歌曲链接或ID")
        layout.addWidget(self._field("绑定ID：", self.edit_netease_id))
        net_row = QHBoxLayout()
        btn_bind = QPushButton("绑定")
        btn_bind.clicked.connect(self._netease_bind)
        btn_unbind = QPushButton("解除")
        btn_unbind.clicked.connect(self._netease_unbind)
        btn_auto = QPushButton("自动绑定")
        btn_auto.clicked.connect(self._netease_auto_bind)
        net_row.addWidget(btn_bind)
        net_row.addWidget(btn_unbind)
        net_row.addWidget(btn_auto)
        layout.addLayout(net_row)
        btn_import_lrc = QPushButton("从网易云导入歌词")
        btn_import_lrc.clicked.connect(self._netease_import_lyrics)
        layout.addWidget(btn_import_lrc)

        # 操作
        btn_load = QPushButton("加载当前播放歌曲")
        btn_load.clicked.connect(self._load_current_to_editor)
        btn_save = QPushButton("💾 保存修改")
        btn_save.setObjectName("accent")
        btn_save.clicked.connect(self._save_edited)
        btn_import = QPushButton("导入歌曲")
        btn_import.clicked.connect(self._import_songs)
        btn_del = QPushButton("删除歌曲")
        btn_del.setObjectName("danger")
        btn_del.clicked.connect(self._delete_current_song)
        for b in (btn_load, btn_save, btn_import, btn_del):
            layout.addWidget(b)

        scroll.setWidget(container)
        outer.addWidget(scroll)
        return w

    def _field(self, label, widget):
        h = QHBoxLayout()
        lbl = QLabel(label)
        lbl.setObjectName("small")
        lbl.setFixedWidth(52)
        h.addWidget(lbl)
        h.addWidget(widget, 1)
        holder = QWidget()
        holder.setLayout(h)
        return holder

    def _load_current_to_editor(self):
        path = self.main.current_song_path()
        if not path:
            QMessageBox.information(self, "提示", "请先播放一首歌曲")
            return
        self._fill_editor(path)

    def _fill_editor(self, path):
        info = self.main.load_song_info(path)
        self.main.edit_current_file = path
        self.edit_title.setText(info['title'])
        self.edit_artist.setText(info['artist'])
        self.edit_score.setValue(float(info.get('score', 0) or 0))
        self.edit_note.setText(info.get('note', ''))
        self.edit_genre.setCurrentText(info.get('genre', ''))
        self.edit_block.setCurrentText(info.get('block', ''))
        self.edit_comment.setText(info.get('comment', ''))
        nid = self.main.netease_bindings.get(path, '')
        self.edit_netease_id.setText(nid)
        self._update_edit_cover(info.get('cover'))

    def _update_edit_cover(self, cover):
        if cover is None:
            self.edit_cover_label.setText("无封面")
            self.edit_cover_label.setPixmap(QPixmap())
            return
        try:
            img = cover.copy()
            img = img.resize((120, 120), Image.Resampling.LANCZOS)
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            data = img.tobytes("raw", "RGBA")
            qimg = QImage(data, 120, 120, QImage.Format_RGBA8888)
            self.edit_cover_label.setPixmap(QPixmap.fromImage(qimg))
        except Exception:
            self.edit_cover_label.setText("无封面")

    def _choose_cover(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "选择封面图片", "", "图片 (*.jpg *.jpeg *.png *.bmp)")
        if path:
            self.main.edit_current_file = self.main.current_song_path()
            try:
                self._update_edit_cover(Image.open(path))
                self._pending_cover = path
            except Exception:
                QMessageBox.warning(self, "错误", "无效图片")

    def _save_edited(self):
        path = self.main.edit_current_file or self.main.current_song_path()
        if not path:
            QMessageBox.warning(self, "提示", "请先加载一首歌曲")
            return
        self.main.ratings[path] = {
            "title": self.edit_title.text(),
            "artist": self.edit_artist.text(),
            "cover": getattr(self, '_pending_cover', '')
            or self.main.ratings.get(path, {}).get('cover', ''),
            "score": self.edit_score.value(),
            "note": self.edit_note.text(),
            "genre": self.edit_genre.currentText(),
            "block": self.edit_block.currentText(),
            "comment": self.edit_comment.text(),
        }
        save_ratings(self.main.ratings)
        self.main.song_info_cache.pop(path, None)
        self._pending_cover = ''
        self.main.playback_panel.refresh_current_song()
        self.main.library_panel.refresh()
        QMessageBox.information(self, "保存", "歌曲信息已更新")

    def _delete_current_song(self):
        path = self.main.edit_current_file or self.main.current_song_path()
        if not path:
            QMessageBox.warning(self, "警告", "请先选择要删除的歌曲")
            return
        if QMessageBox.question(self, "确认",
                                f"确定要删除这首歌曲吗？\n{os.path.basename(path)}\n\n删除后无法恢复！") != QMessageBox.Yes:
            return
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception as e:
            QMessageBox.critical(self, "错误", f"删除失败：{e}")
            return
        self.main.ratings.pop(path, None)
        self.main.lyrics.pop(path, None)
        self.main.song_info_cache.pop(path, None)
        self.main.metadata_cache.pop(path, None)
        if path in self.main.playlist:
            self.main.playlist.remove(path)
        self.main.audio_paths = [p for p in self.main.audio_paths if p != path]
        save_ratings(self.main.ratings)
        save_lyrics(self.main.lyrics)
        save_metadata_cache(self.main.metadata_cache)
        self.main.library_panel.refresh()
        self.refresh_playlist()
        QMessageBox.information(self, "成功", f"已删除：{os.path.basename(path)}")

    def _import_songs(self):
        paths, _ = QFileDialog.getOpenFileNames(
            self, "选择要导入的音乐文件", "", "音乐文件 (*.mp3 *.flac)")
        if not paths:
            return
        imported = 0
        skipped = 0
        for src in paths:
            raw = os.path.splitext(os.path.basename(src))[0]
            ext = os.path.splitext(os.path.basename(src))[1].lower()
            title, artist = raw, "未知歌手"
            try:
                audio = mutagen.File(src)
                if audio is not None and audio.tags:
                    if isinstance(audio, MP3):
                        if audio.tags.get("TIT2"):
                            title = str(audio.tags["TIT2"])
                        if audio.tags.get("TPE1"):
                            artist = str(audio.tags["TPE1"])
                    elif isinstance(audio, FLAC):
                        t = audio.tags.get("TITLE", [])
                        a = audio.tags.get("ARTIST", [])
                        if t and isinstance(t, list) and t[0]:
                            title = str(t[0])
                        if a and isinstance(a, list) and a[0]:
                            artist = str(a[0])
            except Exception:
                pass
            if artist == "未知歌手" and ' - ' in raw:
                parts = raw.split(' - ', 1)
                artist, title = parts[0].strip(), parts[1].strip()
            new_name = f"{artist} - {title}{ext}"
            for ch in '/\\:*?"<>|':
                new_name = new_name.replace(ch, '_')
            dst = os.path.join(MUSIC_DIR, new_name)
            if os.path.exists(dst):
                skipped += 1
                continue
            try:
                shutil.move(src, dst)
                self.main.ratings[dst] = {'title': title, 'artist': artist}
                imported += 1
            except Exception as e:
                skipped += 1
        save_ratings(self.main.ratings)
        self.main.audio_paths = scan_audio_files(MUSIC_DIR)
        self.main.song_info_cache.clear()
        self.main.library_panel.refresh()
        QMessageBox.information(self, "导入结果",
                                f"成功导入 {imported} 首，跳过 {skipped} 首")

    # 网易云绑定
    def _netease_bind(self):
        path = self.main.current_song_path()
        if not path:
            QMessageBox.warning(self, "提示", "请先播放一首歌曲")
            return
        val = self.edit_netease_id.text().strip()
        nid = re.sub(r'.*[?&]id=(\d+).*', r'\1', val) if val else ''
        if not nid.isdigit():
            nid = val if val.isdigit() else ''
        if not nid:
            QMessageBox.critical(self, "错误", "无法识别的链接，请输入纯数字ID或完整URL")
            return
        info = self.main.nc.get_song_info(nid)
        if not info:
            QMessageBox.critical(self, "错误", f"无法找到ID为 {nid} 的歌曲")
            return
        self.main.netease_bindings[path] = nid
        save_netease_bindings(self.main.netease_bindings)
        self.edit_netease_id.setText(nid)
        QMessageBox.information(self, "绑定成功", f"已绑定到: {info['name']} - {info['artists']}")

    def _netease_unbind(self):
        path = self.main.current_song_path()
        if not path:
            return
        if path in self.main.netease_bindings:
            del self.main.netease_bindings[path]
            save_netease_bindings(self.main.netease_bindings)
            self.edit_netease_id.clear()
            QMessageBox.information(self, "已解除", "已解除网易云绑定")

    def _netease_auto_bind(self):
        path = self.main.current_song_path()
        if not path:
            QMessageBox.warning(self, "提示", "请先播放一首歌曲")
            return
        info = self.main.load_song_info(path)
        keyword = f"{info.get('artist', '')} {info.get('title', '')}".strip()

        def _work():
            results = self.main.nc.search_song(keyword, limit=1)
            if results:
                self.main.netease_bindings[path] = results[0]['id']
                save_netease_bindings(self.main.netease_bindings)
                self.edit_netease_id.setText(results[0]['id'])
                QMessageBox.information(self, "自动绑定成功",
                                        f"已绑定到: {results[0]['name']} - {results[0]['artists']}")
            else:
                QMessageBox.warning(self, "未找到", f"未找到「{keyword}」的匹配歌曲")
        threading.Thread(target=_work, daemon=True).start()

    def _netease_import_lyrics(self):
        path = self.main.current_song_path()
        if not path:
            QMessageBox.warning(self, "提示", "请先播放一首歌曲")
            return
        nid = self.main.netease_bindings.get(path) or self.edit_netease_id.text().strip()
        if not nid.isdigit():
            QMessageBox.warning(self, "提示", "请先绑定网易云ID")
            return

        def _work():
            lrc_tuple = self.main.nc.fetch_lyrics(nid)
            if not lrc_tuple:
                QMessageBox.critical(self, "错误", "未找到该歌曲的歌词")
                return
            info = self.main.load_song_info(path)
            title = info.get('title', os.path.splitext(os.path.basename(path))[0])
            artist = info.get('artist', '')
            self._save_netease_lyrics(path, lrc_tuple, artist, title)
            self.main.song_info_cache.pop(path, None)
            self.main.playback_panel.refresh_current_song()
            QMessageBox.information(self, "导入成功", "歌词已导入并解析。")
        threading.Thread(target=_work, daemon=True).start()

    def _save_netease_lyrics(self, saved_path, lrc_tuple, artist='', title=''):
        if not lrc_tuple:
            return
        orig, trans = lrc_tuple
        lfn = f"{artist} - {title}.lrc" if artist else f"{title}.lrc"
        lfn = re.sub(r'[\\/*?:"<>|]', '', lfn)
        dest = os.path.join(LYRICS_DIR, lfn)
        try:
            with open(dest, 'w', encoding='utf-8') as f:
                f.write(orig)
            self.main.lyrics[saved_path] = dest
            if trans:
                trans_fn = lfn.replace('.lrc', '.trans.lrc')
                with open(os.path.join(LYRICS_DIR, trans_fn), 'w', encoding='utf-8') as f:
                    f.write(trans)
            save_lyrics(self.main.lyrics)
        except Exception:
            pass

    # ---------- 评论 ----------
    def _build_comments_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        header = QLabel("💬 网易云评论")
        header.setObjectName("title")
        layout.addWidget(header)

        self.comments_status = QLabel("播放一首歌后加载评论")
        self.comments_status.setObjectName("muted")
        layout.addWidget(self.comments_status)

        self.comments_list = QListWidget()
        self.comments_list.setWordWrap(True)
        layout.addWidget(self.comments_list, 1)

        btn = QPushButton("🔄 加载评论")
        btn.clicked.connect(self._load_comments)
        layout.addWidget(btn)
        return w

    def _load_comments(self):
        path = self.main.current_song_path()
        if not path:
            self.comments_status.setText("请先播放一首歌曲")
            return
        nid = self.main.netease_bindings.get(path)
        if not nid:
            self.comments_status.setText("当前歌曲未绑定网易云ID")
            return
        self.comments_status.setText("正在加载评论...")

        def _work():
            comments, total = self.main.nc.fetch_comments(
                nid, page_size=max(5, min(30, self.main.comment_display_count)))
            self.comments_list.clear()
            if total == 0:
                self.comments_status.setText("暂无评论")
                return
            self.comments_status.setText(f"共 {total} 条评论")
            for i, c in enumerate(comments, 1):
                user = c.get('user', {})
                nick = user.get('nickname', '匿名用户')
                content = c.get('content', '')
                likes = c.get('likedCount', 0)
                item = QListWidgetItem(f"#{i} {nick}  👍{likes}\n{content}")
                item.setBackground(QColor(self.main.theme['CARD_BG']))
                self.comments_list.addItem(item)
        threading.Thread(target=_work, daemon=True).start()

    # ---------- 歌词查看 ----------
    def _build_lyrics_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        header = QLabel("📝 歌词查看")
        header.setObjectName("title")
        layout.addWidget(header)

        self.lyrics_status = QLabel("播放一首歌曲后显示歌词")
        self.lyrics_status.setObjectName("muted")
        layout.addWidget(self.lyrics_status)

        self.lyrics_text = QTextEdit()
        self.lyrics_text.setReadOnly(True)
        layout.addWidget(self.lyrics_text, 1)

        btn_row = QHBoxLayout()
        btn_load = QPushButton("🔄 刷新")
        btn_load.clicked.connect(self._load_lyrics_static)
        btn_copy = QPushButton("📋 复制")
        btn_copy.clicked.connect(self._copy_lyrics)
        btn_row.addWidget(btn_load)
        btn_row.addWidget(btn_copy)
        layout.addLayout(btn_row)
        return w

    def _load_lyrics_static(self):
        self.lyrics_text.clear()
        path = self.main.current_song_path()
        if not path:
            self.lyrics_status.setText("请先播放一首歌曲")
            return
        info = self.main.load_song_info(path)
        lyr = info.get('lyrics', [])
        if not lyr:
            self.lyrics_status.setText("该歌曲无歌词数据")
            return
        self.lyrics_status.setText(
            f"「{info.get('artist', '')} - {info.get('title', '')}」共 {len(lyr)} 行")
        has_trans = any(len(item) > 2 and item[2] for item in lyr)
        lines = []
        for item in lyr:
            t = item[0]
            txt = item[1]
            trans = item[2] if len(item) > 2 else ''
            m, s = int(t // 60), int(t % 60)
            line = f"[{m:02d}:{s:02d}] {txt}"
            if has_trans and trans:
                line += f"\n        {trans}"
            lines.append(line)
        self.lyrics_text.setPlainText("\n".join(lines))

    def _copy_lyrics(self):
        content = self.lyrics_text.toPlainText().strip()
        if content:
            QApplication.clipboard().setText(content)
            self.lyrics_status.setText("✅ 已复制到剪贴板")

    # ---------- 搜索与筛选 ----------
    def _build_filter_panel(self):
        w = QWidget()
        outer = QVBoxLayout(w)
        outer.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(8)
        layout.setAlignment(Qt.AlignTop)

        header = QLabel("🔎 搜索与筛选")
        header.setObjectName("title")
        layout.addWidget(header)

        # 搜索
        self.filter_search = QLineEdit()
        self.filter_search.setPlaceholderText("搜索标题/歌手/备注/评论...")
        layout.addWidget(self.filter_search)

        # 评分筛选
        self.filter_min = QDoubleSpinBox()
        self.filter_min.setRange(0.0, 10.0)
        self.filter_min.setValue(0.0)
        self.filter_max = QDoubleSpinBox()
        self.filter_max.setRange(0.0, 10.0)
        self.filter_max.setValue(10.0)
        layout.addWidget(self._field("最低分：", self.filter_min))
        layout.addWidget(self._field("最高分：", self.filter_max))

        # 块/流派筛选
        self.filter_block = QComboBox()
        self.filter_block.addItem("")
        self.filter_block.addItems([b.get('name') if isinstance(b, dict) else b
                                    for b in self.main.blocks])
        self.filter_genre = QComboBox()
        self.filter_genre.addItem("")
        self.filter_genre.addItems(self.main.genres)
        layout.addWidget(self._field("块：", self.filter_block))
        layout.addWidget(self._field("流派：", self.filter_genre))

        # 排序（筛选结果）
        self.filter_sort_combo = QComboBox()
        self.filter_sort_combo.addItems(["标题", "歌手", "评分", "块", "流派", "播放次数"])
        layout.addWidget(self._field("排序：", self.filter_sort_combo))

        # 按钮
        btn_apply = QPushButton("✅ 应用筛选")
        btn_apply.setObjectName("accent")
        btn_apply.clicked.connect(self._apply_filter)
        btn_reset = QPushButton("🔄 复位")
        btn_reset.clicked.connect(self._reset_filter)
        layout.addWidget(btn_apply)
        layout.addWidget(btn_reset)

        scroll.setWidget(container)
        outer.addWidget(scroll)
        return w

    def _apply_filter(self):
        q = self.filter_search.text().strip().lower()
        lo = self.filter_min.value()
        hi = self.filter_max.value()
        sel_block = self.filter_block.currentText().strip()
        sel_genre = self.filter_genre.currentText().strip()

        sort_map = {'标题': 'title', '歌手': 'artist', '评分': 'rating',
                    '块': 'block', '流派': 'genre', '播放次数': 'play_count'}
        self.main.filter_sort_mode = sort_map.get(self.filter_sort_combo.currentText(), 'title')

        allp = scan_audio_files(MUSIC_DIR)
        res = []
        for p in allp:
            info = self.main.load_song_info(p)
            ud = self.main.ratings.get(p, {})
            if q:
                hay = (info.get('title', '') + info.get('artist', '') +
                       os.path.basename(p) + ud.get('note', '') + ud.get('comment', '')).lower()
                if q not in hay:
                    continue
            s = float(ud.get('score', 0) or 0)
            if not (lo <= s <= hi):
                continue
            if sel_block and ud.get('block', '') != sel_block:
                continue
            if sel_genre and ud.get('genre', '') != sel_genre:
                continue
            res.append(p)

        # 排序
        sm = self.main.filter_sort_mode
        if sm == 'title':
            res.sort(key=lambda p: self.main.get_cached_title(p).lower())
        elif sm == 'artist':
            res.sort(key=lambda p: self.main.get_cached_artist(p).lower())
        elif sm == 'rating':
            res.sort(key=lambda p: self.main.ratings.get(p, {}).get('score', 0), reverse=True)
        elif sm == 'block':
            res.sort(key=lambda p: (self.main.ratings.get(p, {}).get('block', '') == '',
                                    self.main.ratings.get(p, {}).get('block', '')))
        elif sm == 'genre':
            res.sort(key=lambda p: (self.main.ratings.get(p, {}).get('genre', '') == '',
                                    self.main.ratings.get(p, {}).get('genre', '')))
        elif sm == 'play_count':
            res.sort(key=lambda p: self.main.ratings.get(p, {}).get('play_count', 0), reverse=True)

        self.main.audio_paths = res
        self.main.filter_result_visible = True
        self.main.library_panel.refresh()
        QMessageBox.information(self, "筛选完成", f"筛选结果：{len(res)} 首歌曲")

    def _reset_filter(self):
        self.filter_search.clear()
        self.filter_min.setValue(0.0)
        self.filter_max.setValue(10.0)
        self.filter_block.setCurrentIndex(0)
        self.filter_genre.setCurrentIndex(0)
        self.main.audio_paths = scan_audio_files(MUSIC_DIR)
        self.main.filter_result_visible = False
        self.main.library_panel.refresh()

    # ---------- 网易云音乐 ----------
    def _build_netease_panel(self):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        header = QLabel("🎵 网易云音乐")
        header.setObjectName("title")
        layout.addWidget(header)

        self.nc_status = QLabel(self._nc_status_text())
        self.nc_status.setObjectName("muted")
        layout.addWidget(self.nc_status)

        tabs = QTabWidget()
        layout.addWidget(tabs, 1)

        # 登录 tab
        login_tab = QWidget()
        login_layout = QVBoxLayout(login_tab)
        login_layout.setAlignment(Qt.AlignTop)
        login_layout.setSpacing(6)

        # 账号信息
        self.nc_account_label = QLabel("未登录")
        self.nc_account_label.setWordWrap(True)
        login_layout.addWidget(self.nc_account_label)

        # 手机号登录
        self.nc_phone = QLineEdit()
        self.nc_phone.setPlaceholderText("手机号")
        self.nc_password = QLineEdit()
        self.nc_password.setPlaceholderText("密码")
        self.nc_password.setEchoMode(QLineEdit.Password)
        login_layout.addWidget(self._field("手机号：", self.nc_phone))
        login_layout.addWidget(self._field("密码：", self.nc_password))
        btn_phone = QPushButton("手机号登录")
        btn_phone.clicked.connect(self._nc_phone_login)
        login_layout.addWidget(btn_phone)

        # Cookie 登录
        self.nc_cookie = QLineEdit()
        self.nc_cookie.setPlaceholderText("浏览器 F12 → Cookie → MUSIC_U 值")
        login_layout.addWidget(self._field("Cookie：", self.nc_cookie))
        btn_cookie = QPushButton("Cookie 登录")
        btn_cookie.clicked.connect(self._nc_cookie_login)
        login_layout.addWidget(btn_cookie)

        # 二维码登录
        btn_qr = QPushButton("📱 二维码登录")
        btn_qr.clicked.connect(self._nc_qr_login)
        login_layout.addWidget(btn_qr)

        btn_refresh = QPushButton("🔄 刷新账号信息")
        btn_refresh.clicked.connect(self._nc_refresh_account)
        btn_logout = QPushButton("🚪 退出登录")
        btn_logout.setObjectName("danger")
        btn_logout.clicked.connect(self._nc_logout)
        login_layout.addWidget(btn_refresh)
        login_layout.addWidget(btn_logout)
        tabs.addTab(login_tab, "登录")

        # 搜索下载 tab
        search_tab = QWidget()
        search_layout = QVBoxLayout(search_tab)
        search_layout.setAlignment(Qt.AlignTop)
        search_layout.setSpacing(6)
        self.nc_search = QLineEdit()
        self.nc_search.setPlaceholderText("输入歌手/歌名搜索")
        self.nc_search.returnPressed.connect(self._nc_search)
        search_layout.addWidget(self.nc_search)
        btn_search = QPushButton("🔍 搜索")
        btn_search.clicked.connect(self._nc_search)
        search_layout.addWidget(btn_search)
        self.nc_bitrate = QComboBox()
        self.nc_bitrate.addItems(["标准 128k", "中等 192k", "高品质 320k", "无损 999k"])
        self.nc_bitrate.setCurrentText("高品质 320k")
        search_layout.addWidget(self._field("音质：", self.nc_bitrate))
        self.nc_results = QListWidget()
        self.nc_results.itemDoubleClicked.connect(self._nc_download_item)
        search_layout.addWidget(self.nc_results, 1)
        tabs.addTab(search_tab, "搜索下载")

        # 单曲导入 tab
        import_tab = QWidget()
        import_layout = QVBoxLayout(import_tab)
        import_layout.setAlignment(Qt.AlignTop)
        import_layout.setSpacing(6)
        self.nc_import_id = QLineEdit()
        self.nc_import_id.setPlaceholderText("输入网易云歌曲ID或链接")
        self.nc_import_id.returnPressed.connect(self._nc_import_single)
        import_layout.addWidget(self.nc_import_id)
        btn_import = QPushButton("📥 导入单曲")
        btn_import.clicked.connect(self._nc_import_single)
        import_layout.addWidget(btn_import)
        tabs.addTab(import_tab, "导入单曲")

        # 歌单浏览 tab
        pl_tab = QWidget()
        pl_layout = QVBoxLayout(pl_tab)
        pl_layout.setSpacing(6)
        self.nc_pl_source = QComboBox()
        self.nc_pl_source.addItems(["我的歌单", "每日推荐"])
        self.nc_pl_source.currentTextChanged.connect(self._nc_load_playlists)
        pl_layout.addWidget(self.nc_pl_source)
        self.nc_playlists = QListWidget()
        self.nc_playlists.itemDoubleClicked.connect(self._nc_playlist_songs)
        pl_layout.addWidget(self.nc_playlists, 1)
        tabs.addTab(pl_tab, "歌单")

        # 批量操作 tab
        batch_tab = QWidget()
        batch_layout = QVBoxLayout(batch_tab)
        batch_layout.setAlignment(Qt.AlignTop)
        batch_layout.setSpacing(6)
        btn_batch_bind = QPushButton("🔍 批量自动绑定网易云ID")
        btn_batch_bind.clicked.connect(self._nc_batch_bind)
        btn_batch_lyrics = QPushButton("📝 一键导入所有歌词")
        btn_batch_lyrics.clicked.connect(self._nc_batch_lyrics)
        batch_layout.addWidget(btn_batch_bind)
        batch_layout.addWidget(btn_batch_lyrics)
        self.nc_batch_status = QLabel("")
        self.nc_batch_status.setObjectName("muted")
        self.nc_batch_status.setWordWrap(True)
        batch_layout.addWidget(self.nc_batch_status)
        tabs.addTab(batch_tab, "批量操作")

        return w

    def _nc_status_text(self):
        return "✅ 已登录" if self.main.nc.logged_in else "⚠️ 未登录（VIP歌曲可能无法下载）"

    def _nc_phone_login(self):
        phone = self.nc_phone.text().strip()
        pw = self.nc_password.text().strip()
        if not phone or not pw:
            return
        self.nc_status.setText("正在登录...")

        def _work():
            ok, msg = self.main.nc.login_cellphone(phone, pw)
            self.nc_status.setText(self._nc_status_text())
            if ok:
                QMessageBox.information(self, "登录成功", f"✅ {msg}")
            else:
                QMessageBox.warning(self, "登录失败", msg)
        threading.Thread(target=_work, daemon=True).start()

    def _nc_cookie_login(self):
        val = self.nc_cookie.text().strip()
        if not val:
            return
        if '=' in val and 'MUSIC_U=' not in val:
            val = f"MUSIC_U={val}"
        elif '=' not in val:
            val = f"MUSIC_U={val}"
        try:
            r = self.main.nc._post("/user/account", cookie=val)
            d = r.json()
            if d.get("code") == 200 and (d.get("account") or d.get("profile")):
                self.main.nc.logged_in = True
                self.main.nc.save_cookie(val)
                self.nc_status.setText(self._nc_status_text())
                QMessageBox.information(self, "登录成功", "Cookie 登录成功")
            else:
                QMessageBox.warning(self, "登录失败", "Cookie 无效")
        except Exception as e:
            QMessageBox.warning(self, "登录失败", str(e))

    def _nc_qr_login(self):
        ok, msg, unikey = self.main.nc.login_qrcode_key()
        if not ok:
            QMessageBox.warning(self, "错误", msg)
            return
        qr_url = f"https://music.163.com/login?codekey={unikey}"
        try:
            import qrcode
            img = qrcode.make(qr_url).resize((200, 200), Image.Resampling.LANCZOS)
            img.save('/tmp/potato_qr.png')
            dlg = QMessageBox(self)
            dlg.setWindowTitle("扫码登录")
            dlg.setText("请用网易云APP扫描以下二维码\n（二维码已保存到 /tmp/potato_qr.png）")
            dlg.setStandardButtons(QMessageBox.Cancel)
            dlg.show()
        except Exception:
            pass

        self.nc_status.setText("请用网易云APP扫码...")

        def _poll():
            for _ in range(120):
                try:
                    st = self.main.nc.login_qrcode_poll(unikey)
                except Exception:
                    time.sleep(2)
                    continue
                if st == 1:
                    self.nc_status.setText(self._nc_status_text())
                    QMessageBox.information(self, "登录成功", "✅ 登录成功")
                    return
                elif st == 0:
                    self.nc_status.setText("已扫码，请确认...")
                elif st == -2:
                    self.nc_status.setText("二维码已过期")
                    return
                time.sleep(1.5)
            self.nc_status.setText("登录超时")
        threading.Thread(target=_poll, daemon=True).start()

    def _nc_logout(self):
        self.main.nc.logout()
        self.nc_status.setText(self._nc_status_text())
        self.nc_account_label.setText("未登录")

    def _nc_refresh_account(self):
        if not self.main.nc.logged_in:
            self.nc_account_label.setText("未登录")
            return

        def _work():
            d = self.main.nc.account_info()
            code = self.main.nc._code(d)
            if code != 200:
                self.nc_account_label.setText("登录状态异常")
                return
            prof = d.get("profile") or {}
            acct = d.get("account") or {}
            nick = prof.get("nickname") or acct.get("userName", "用户")
            self.main.nc.uid = prof.get("userId") or acct.get("id") or ""
            vip = acct.get("vipType", 0)
            vip_text = f"👑 VIP{vip}" if vip > 0 else "非VIP用户"
            self.nc_account_label.setText(f"{nick}\n{vip_text}")
        threading.Thread(target=_work, daemon=True).start()

    def _nc_bitrate_map(self):
        return {'标准 128k': 128000, '中等 192k': 192000,
                '高品质 320k': 320000, '无损 999k': 999000}

    def _nc_search(self):
        kw = self.nc_search.text().strip()
        if not kw:
            return
        self.nc_results.clear()
        self.nc_results.addItem("搜索中...")

        def _work():
            songs = self.main.nc.search_song(kw, limit=30)
            self.nc_results.clear()
            fee_map = {0: '免费', 1: 'VIP', 4: 'VIP', 8: '付费'}
            for i, s in enumerate(songs, 1):
                item = QListWidgetItem(
                    f"#{i} {s['name']} - {s['artists']} [{fee_map.get(s.get('fee', 0), '')}]")
                item.setData(Qt.UserRole, s['id'])
                item.setData(Qt.UserRole + 1, s['name'])
                item.setData(Qt.UserRole + 2, s['artists'])
                self.nc_results.addItem(item)
        threading.Thread(target=_work, daemon=True).start()

    def _nc_download_item(self, item):
        nid = item.data(Qt.UserRole)
        name = item.data(Qt.UserRole + 1)
        artists = item.data(Qt.UserRole + 2)
        if nid:
            self._nc_download(nid, name, artists)

    def _nc_import_single(self):
        val = self.nc_import_id.text().strip()
        nid = re.sub(r'.*[?&]id=(\d+).*', r'\1', val) if val else ''
        if not nid.isdigit():
            nid = val if val.isdigit() else ''
        if not nid:
            QMessageBox.critical(self, "错误", "无法识别的链接或ID")
            return
        self._nc_download(nid)

    def _nc_download(self, nid, name='', artists=''):
        br = self._nc_bitrate_map().get(self.nc_bitrate.currentText(), 320000)

        def _work():
            ok, msg, info = self.main.nc.download_song(nid, MUSIC_DIR, br)
            saved_path = os.path.join(MUSIC_DIR, msg) if ok else None
            if ok and saved_path:
                lrc = self.main.nc.fetch_lyrics(nid)
                if lrc:
                    art = info['artists'] if info else artists
                    tit = info['name'] if info else name
                    self._save_netease_lyrics(saved_path, lrc, art, tit)
                self.main.netease_bindings[saved_path] = nid
                save_netease_bindings(self.main.netease_bindings)
                cover_path = os.path.join(COVERS_DIR, f'{nid}.jpg')
                if self.main.nc.fetch_cover(nid, cover_path):
                    self.main.ratings.setdefault(saved_path, {})['cover'] = cover_path
                    save_ratings(self.main.ratings)
                self.main.audio_paths = scan_audio_files(MUSIC_DIR)
                self.main.song_info_cache.clear()
                self.main.library_panel.refresh()
                QMessageBox.information(self, "下载完成", f"✅ {msg}")
            else:
                QMessageBox.critical(self, "下载失败", msg)
        threading.Thread(target=_work, daemon=True).start()

    # ---- 歌单浏览 ----
    def _nc_load_playlists(self):
        src = self.nc_pl_source.currentText()
        self.nc_playlists.clear()
        if not self.main.nc.logged_in:
            self.nc_playlists.addItem("请先登录")
            return
        self.nc_playlists.addItem("加载中...")

        if src == "我的歌单":
            def _work():
                pls = self.main.nc.get_user_playlists()
                self.nc_playlists.clear()
                for pl in pls:
                    item = QListWidgetItem(f"{pl.get('name', '未命名')} ({pl.get('trackCount', 0)}首)")
                    item.setData(Qt.UserRole, str(pl.get('id', '')))
                    item.setData(Qt.UserRole + 1, pl.get('name', '未命名'))
                    self.nc_playlists.addItem(item)
            threading.Thread(target=_work, daemon=True).start()
        else:
            def _work():
                songs = self.main.nc.daily_recommend_songs()
                self.nc_playlists.clear()
                for s in songs:
                    item = QListWidgetItem(f"{s.get('name', '')} - "
                                           f"{'/'.join([a['name'] for a in s.get('ar', [])])}")
                    item.setData(Qt.UserRole, str(s.get('id', '')))
                    item.setData(Qt.UserRole + 1, s.get('name', ''))
                    item.setData(Qt.UserRole + 2,
                                 '/'.join([a['name'] for a in s.get('ar', [])]))
                    self.nc_playlists.addItem(item)
            threading.Thread(target=_work, daemon=True).start()

    def _nc_playlist_songs(self, item):
        plid = item.data(Qt.UserRole)
        plname = item.data(Qt.UserRole + 1)
        if not plid:
            return

        def _work():
            detail = self.main.nc.get_playlist_detail(plid)
            if not detail:
                QMessageBox.warning(self, "错误", "加载歌单详情失败")
                return
            tracks = detail.get("tracks", [])
            self.nc_playlists.clear()
            for t in tracks:
                sid = str(t.get('id', ''))
                name = t.get('name', '')
                artists = '/'.join([a['name'] for a in t.get('ar', [])])
                item2 = QListWidgetItem(f"{name} - {artists}")
                item2.setData(Qt.UserRole, sid)
                item2.setData(Qt.UserRole + 1, name)
                item2.setData(Qt.UserRole + 2, artists)
                self.nc_playlists.addItem(item2)
        threading.Thread(target=_work, daemon=True).start()

    # ---- 批量操作 ----
    def _nc_batch_bind(self):
        allp = scan_audio_files(MUSIC_DIR)
        existing = self.main.netease_bindings
        to_bind = [p for p in allp if p not in existing]
        if not to_bind:
            QMessageBox.information(self, "完成", "所有歌曲已绑定")
            return
        if QMessageBox.question(self, "确认",
                                f"将为 {len(to_bind)} 首未绑定歌曲自动搜索绑定网易云ID，可能耗时较久，继续？") != QMessageBox.Yes:
            return

        def _work():
            bound = 0
            for i, p in enumerate(to_bind):
                info = self.main.load_song_info(p)
                kw = f"{info.get('artist', '')} {info.get('title', '')}".strip()
                if not kw:
                    continue
                try:
                    r = self.main.nc.search_song(kw, limit=1)
                    if r:
                        self.main.netease_bindings[p] = r[0]['id']
                        bound += 1
                except Exception:
                    pass
                if (i + 1) % 5 == 0 or i == len(to_bind) - 1:
                    self.nc_batch_status.setText(f"处理中 {i+1}/{len(to_bind)}... 已绑定 {bound}")
            save_netease_bindings(self.main.netease_bindings)
            self.main.song_info_cache.clear()
            self.nc_batch_status.setText(f"✅ 完成：绑定 {bound}/{len(to_bind)} 首")
        threading.Thread(target=_work, daemon=True).start()

    def _nc_batch_lyrics(self):
        bindings = self.main.netease_bindings
        to_process = [(p, nid) for p, nid in bindings.items() if os.path.exists(p)]
        if not to_process:
            QMessageBox.information(self, "完成", "没有已绑定ID的歌曲")
            return
        if QMessageBox.question(self, "确认",
                                f"将为 {len(to_process)} 首已绑定歌曲从网易云获取歌词，继续？") != QMessageBox.Yes:
            return

        def _work():
            ok_count = 0
            for i, (p, nid) in enumerate(to_process):
                try:
                    lrc = self.main.nc.fetch_lyrics(nid)
                    if lrc:
                        info = self.main.load_song_info(p)
                        self._save_netease_lyrics(p, lrc,
                                                 info.get('artist', ''),
                                                 info.get('title', ''))
                        ok_count += 1
                except Exception:
                    pass
                if (i + 1) % 5 == 0 or i == len(to_process) - 1:
                    self.nc_batch_status.setText(f"导入歌词 {i+1}/{len(to_process)}... 完成 {ok_count}")
            save_lyrics(self.main.lyrics)
            self.main.song_info_cache.clear()
            self.nc_batch_status.setText(f"✅ 歌词完成：{ok_count}/{len(to_process)} 首")
        threading.Thread(target=_work, daemon=True).start()

    # ---------- 设置 ----------
    def _build_settings_panel(self):
        w = QWidget()
        outer = QVBoxLayout(w)
        outer.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(8)
        layout.setAlignment(Qt.AlignTop)

        header = QLabel("⚙️ 设置")
        header.setObjectName("title")
        layout.addWidget(header)

        # 主题
        theme_group = QLabel("🎨 主题配色")
        theme_group.setObjectName("title")
        layout.addWidget(theme_group)
        self.theme_combo = QComboBox()
        self.theme_combo.addItems(list(THEME_PRESETS.keys()))
        self.theme_combo.setCurrentText(self.main.theme_name)
        layout.addWidget(self.theme_combo)
        btn_theme = QPushButton("✨ 应用主题")
        btn_theme.setObjectName("accent")
        btn_theme.clicked.connect(lambda: self.main.apply_theme(self.theme_combo.currentText()))
        layout.addWidget(btn_theme)

        # 备注显示
        layout.addWidget(self._group_title("歌曲备注显示"))
        self.note_combo = QComboBox()
        self.note_combo.addItems(["默认展开", "默认折叠", "仅显示备注"])
        note_map = {'expanded': '默认展开', 'folded': '默认折叠', 'note_only': '仅显示备注'}
        self.note_combo.setCurrentText(note_map.get(self.main.note_display_mode, '默认展开'))
        layout.addWidget(self.note_combo)
        btn_note = QPushButton("保存备注设置")
        btn_note.clicked.connect(self._save_note_setting)
        layout.addWidget(btn_note)

        # 歌手显示
        layout.addWidget(self._group_title("歌手显示"))
        self.artist_check = QCheckBox("隐藏歌手")
        self.artist_check.setChecked(self.main.artist_hidden)
        layout.addWidget(self.artist_check)
        btn_artist = QPushButton("保存歌手设置")
        btn_artist.clicked.connect(self._save_artist_setting)
        layout.addWidget(btn_artist)

        # 封面样式
        layout.addWidget(self._group_title("封面样式"))
        self.cover_style_combo = QComboBox()
        self.cover_style_combo.addItems(["🎵 圆形旋转", "🔲 方形静态"])
        cover_map = {'circle_rotate': '🎵 圆形旋转', 'square_static': '🔲 方形静态'}
        self.cover_style_combo.setCurrentText(cover_map.get(self.main.cover_style, '🎵 圆形旋转'))
        layout.addWidget(self.cover_style_combo)
        btn_cover = QPushButton("应用封面样式")
        btn_cover.clicked.connect(self._save_cover_style)
        layout.addWidget(btn_cover)

        # 索引条
        layout.addWidget(self._group_title("索引条显示"))
        self.index_check = QCheckBox("显示索引条")
        self.index_check.setChecked(self.main.show_index_headers)
        layout.addWidget(self.index_check)
        btn_index = QPushButton("保存索引条设置")
        btn_index.clicked.connect(self._save_index_setting)
        layout.addWidget(btn_index)

        # 双语歌词
        layout.addWidget(self._group_title("歌词显示"))
        self.bilingual_check = QCheckBox("启用双语歌词（原文+翻译）")
        self.bilingual_check.setChecked(self.main.bilingual_lyrics)
        self.prefer_cn_combo = QComboBox()
        self.prefer_cn_combo.addItems(["中文", "原文"])
        self.prefer_cn_combo.setCurrentText("中文" if self.main.prefer_chinese_lyrics else "原文")
        layout.addWidget(self.bilingual_check)
        layout.addWidget(self._field("关闭双语时优先：", self.prefer_cn_combo))
        btn_lyric = QPushButton("应用歌词设置")
        btn_lyric.clicked.connect(self._save_lyric_setting)
        layout.addWidget(btn_lyric)

        # 后端切换
        layout.addWidget(self._group_title("播放后端"))
        self.backend_combo = QComboBox()
        self.backend_combo.addItems(["vlc"])
        self.backend_combo.setCurrentText(self.main.config.get('backend', 'vlc'))
        layout.addWidget(self.backend_combo)
        btn_backend = QPushButton("应用后端")
        btn_backend.clicked.connect(self._save_backend)
        layout.addWidget(btn_backend)

        # 工具
        layout.addWidget(self._group_title("工具"))
        btn_rescan = QPushButton("🔄 刷新歌曲库")
        btn_rescan.clicked.connect(self._rescan)
        layout.addWidget(btn_rescan)
        btn_batch_lyrics = QPushButton("📝 批量导入歌词(.lrc)")
        btn_batch_lyrics.clicked.connect(self._batch_import_lyrics)
        layout.addWidget(btn_batch_lyrics)
        btn_batch_delete = QPushButton("🗑 批量删除歌曲")
        btn_batch_delete.setObjectName("danger")
        btn_batch_delete.clicked.connect(self._batch_delete_songs)
        layout.addWidget(btn_batch_delete)

        # 版本
        ver = QLabel(f"版本：{VERSION}")
        ver.setObjectName("small")
        layout.addWidget(ver)

        scroll.setWidget(container)
        outer.addWidget(scroll)
        return w

    def _group_title(self, text):
        lbl = QLabel(text)
        lbl.setObjectName("title")
        return lbl

    def _save_note_setting(self):
        note_map = {'默认展开': 'expanded', '默认折叠': 'folded', '仅显示备注': 'note_only'}
        self.main.note_display_mode = note_map.get(self.note_combo.currentText(), 'expanded')
        self.main.config['note_display_mode'] = self.main.note_display_mode
        save_config(self.main.config)
        self.main.library_panel.refresh()

    def _save_artist_setting(self):
        self.main.artist_hidden = self.artist_check.isChecked()
        self.main.config['artist_hidden'] = self.main.artist_hidden
        save_config(self.main.config)
        self.main.library_panel.refresh()

    def _save_cover_style(self):
        cover_map = {'🎵 圆形旋转': 'circle_rotate', '🔲 方形静态': 'square_static'}
        self.main.cover_style = cover_map.get(self.cover_style_combo.currentText(), 'circle_rotate')
        self.main.config['cover_style'] = self.main.cover_style
        save_config(self.main.config)
        self.main.cover_original_image = None
        if self.main.current_song_path():
            self.main.song_info_cache.pop(self.main.current_song_path(), None)
        self.main.playback_panel.refresh_current_song()

    def _save_index_setting(self):
        self.main.show_index_headers = self.index_check.isChecked()
        self.main.config['show_index_headers'] = self.main.show_index_headers
        save_config(self.main.config)
        self.main.library_panel.refresh()

    def _save_lyric_setting(self):
        self.main.bilingual_lyrics = self.bilingual_check.isChecked()
        self.main.prefer_chinese_lyrics = self.prefer_cn_combo.currentText() == "中文"
        self.main.config['bilingual_lyrics'] = self.main.bilingual_lyrics
        self.main.config['prefer_chinese_lyrics'] = self.main.prefer_chinese_lyrics
        save_config(self.main.config)
        self.main.song_info_cache.clear()
        self.main.playback_panel.refresh_current_song()

    def _save_backend(self):
        val = self.backend_combo.currentText()
        self.main.config['backend'] = val
        save_config(self.main.config)
        QMessageBox.information(self, "已应用", f"后端已切换为 {val}")

    def _rescan(self):
        self.main.audio_paths = scan_audio_files(MUSIC_DIR)
        self.main.song_info_cache.clear()
        self.main.library_panel.refresh()
        QMessageBox.information(self, "已刷新", "音乐库已刷新")

    def _batch_import_lyrics(self):
        folder = QFileDialog.getExistingDirectory(self, "选择包含 .lrc 文件的文件夹")
        if not folder:
            return
        lrc_files = {}
        for f in os.listdir(folder):
            if f.endswith('.lrc') and not f.endswith('.trans.lrc'):
                name = os.path.splitext(f)[0]
                lrc_files[name] = os.path.join(folder, f)

        imported = 0
        matched = set()
        for path in self.main.audio_paths:
            music_name = os.path.splitext(os.path.basename(path))[0]
            if music_name in lrc_files:
                data = parse_lrc_file(lrc_files[music_name])
                if data:
                    self.main.lyrics[path] = data
                    imported += 1
                    matched.add(music_name)
                    continue
            info = self.main.load_song_info(path)
            title = info.get('title', '').strip()
            artist = info.get('artist', '').strip()
            key = f"{artist} - {title}" if artist and title else title
            if key and key in lrc_files:
                data = parse_lrc_file(lrc_files[key])
                if data:
                    self.main.lyrics[path] = data
                    imported += 1
                    matched.add(key)

        for name in matched:
            try:
                src = lrc_files[name]
                dst = os.path.join(LYRICS_DIR, os.path.basename(src))
                if os.path.exists(dst):
                    os.remove(dst)
                shutil.move(src, dst)
            except Exception:
                pass

        save_lyrics(self.main.lyrics)
        self.main.song_info_cache.clear()
        QMessageBox.information(self, "批量导入歌词",
                                f"成功导入 {imported} 首歌词，剩余 {len(lrc_files) - len(matched)} 个文件未匹配")

    def _batch_delete_songs(self):
        if not self.main.selected_paths:
            QMessageBox.information(self, "提示", "请先在左边栏选择要删除的歌曲")
            return
        sel = list(self.main.selected_paths)
        if QMessageBox.question(self, "确认",
                                f"确定要删除选中的 {len(sel)} 首歌曲吗？（此操作不可恢复！）") != QMessageBox.Yes:
            return
        deleted = 0
        for p in sel:
            try:
                if os.path.exists(p):
                    os.remove(p)
                self.main.ratings.pop(p, None)
                self.main.lyrics.pop(p, None)
                if p in self.main.playlist:
                    self.main.playlist.remove(p)
                deleted += 1
            except Exception:
                pass
        self.main.audio_paths = scan_audio_files(MUSIC_DIR)
        self.main.song_info_cache.clear()
        self.main.selected_paths.clear()
        save_ratings(self.main.ratings)
        save_lyrics(self.main.lyrics)
        self.main.library_panel.refresh()
        self.refresh_playlist()
        QMessageBox.information(self, "完成", f"已删除 {deleted} 首歌曲")

    def _placeholder(self, text):
        w = QLabel(text)
        w.setAlignment(Qt.AlignCenter)
        w.setObjectName("muted")
        return w


def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()

