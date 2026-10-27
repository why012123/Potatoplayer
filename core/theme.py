"""主题配色与字体定义（不依赖任何 UI 框架）。"""

import sys

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
        "BUTTON_BG": '#1e1e1e', "ENTRY_BG": '#111111',
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
        "BUTTON_BG": '#e5e7eb', "ENTRY_BG": '#f9fafb',
        "TEXT": '#111827', "TEXT_MUTED": '#4b5563',
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
        "BUTTON_BG": '#1a241a', "ENTRY_BG": '#0e150e',
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
        "BUTTON_BG": '#2d241c', "ENTRY_BG": '#171009',
        "TEXT": '#ffffff', "TEXT_MUTED": '#9c8b7a',
        "desc": "暗夜暖橙 · 温暖柔和"
    },
}

DEFAULT_THEME = "紫夜 (默认)"

# ── 主题中所有会被 UI 引用的颜色键 ──
COLOR_KEYS = (
    "BG_COLOR", "PANEL_BG", "CARD_BG", "TROUGH", "HOVER",
    "ACCENT", "ACCENT_HOVER", "ACCENT_PRESSED", "MUTED",
    "DANGER", "DANGER_HOVER", "SUCCESS", "WARNING",
    "CARD_HOVER", "CARD_ALTERNATE", "SEPARATOR", "INSERT_LINE",
    "BUTTON_BG", "ENTRY_BG", "TEXT", "TEXT_MUTED",
)


def resolve_theme(name):
    """按名称取主题字典，找不到时回退到默认主题（返回副本）。"""
    theme = THEME_PRESETS.get(name) or THEME_PRESETS[DEFAULT_THEME]
    return dict(theme)


# ── 字体 ──
if sys.platform == 'darwin':
    FONT_FAMILY = 'SF Pro Display'
    FONT_MONO_FAMILY = 'SF Mono'
    FALLBACK_FONT_FAMILY = 'PingFang SC'
else:
    FONT_FAMILY = '微软雅黑'
    FONT_MONO_FAMILY = 'Consolas'
    FALLBACK_FONT_FAMILY = 'Microsoft YaHei'

FONT_MAIN_SIZE = 11
FONT_TITLE_SIZE = 13
FONT_SMALL_SIZE = 9
FONT_MONO_SIZE = 10

# 分组索引条统一底色（块未指定颜色时）
DEFAULT_BLOCK_COLOR = '#1e3a8a'
