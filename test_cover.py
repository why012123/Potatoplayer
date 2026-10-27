"""
test_cover.py — 测试音乐文件封面读取
完全复用 Potatoplayer.py 的封面读取逻辑。

用法:
  python3 test_cover.py
  然后选择音乐文件，会显示封面信息并弹窗展示。
  最后会扫描 source/music/ 下所有文件，统计封面读取成功率。
"""

import os
import sys
import io
import json
import tkinter as tk
from tkinter import filedialog, messagebox
import mutagen
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.id3 import APIC
from PIL import Image, ImageTk, ImageDraw

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MUSIC_DIR = os.path.join(BASE_DIR, "source", "music")
RATINGS_FILE = os.path.join(BASE_DIR, "source", "ratings.json")


def load_ratings():
    if os.path.exists(RATINGS_FILE):
        try:
            with open(RATINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def get_cover_from_mp3(audio):
    """从 MP3 文件读取封面 (APIC 帧)"""
    tags = audio.tags
    if tags is None:
        return None
    for tag in tags.values():
        if isinstance(tag, APIC):
            try:
                pic_data = tag.data
                if pic_data:
                    return Image.open(io.BytesIO(pic_data))
            except Exception as e:
                print(f"  [MP3 APIC] 读取失败: {e}")
    return None


def get_cover_from_flac(audio):
    """从 FLAC 文件读取封面 (pictures)"""
    try:
        if hasattr(audio, 'pictures') and audio.pictures:
            for pic in audio.pictures:
                try:
                    pic_data = pic.data
                    if pic_data:
                        return Image.open(io.BytesIO(pic_data))
                except Exception as e:
                    print(f"  [FLAC picture] 读取失败: {e}")
                    continue
    except Exception as e:
        print(f"  [FLAC] 读取失败: {e}")
    return None


def load_cover_from_file(filepath):
    """
    完全复用 Potatoplayer.py 的封面读取逻辑。
    返回 (PIL.Image 或 None, 详细信息字符串)
    """
    details = []
    cover_image = None

    try:
        audio = mutagen.File(filepath)
        if audio is None:
            return None, "mutagen 无法解析此文件"

        file_type = "MP3" if isinstance(audio, MP3) else "FLAC" if isinstance(audio, FLAC) else type(audio).__name__
        details.append(f"文件类型: {file_type}")

        tags = audio.tags
        if tags is None:
            details.append("无元数据标签 (tags is None)")
        else:
            details.append(f"标签对象: {type(tags).__name__}")
            details.append(f"标签项目数: {len(list(tags.values()))}")

            if isinstance(audio, MP3):
                details.append("→ 使用 MP3/APIC 方式读取")
                cover_image = get_cover_from_mp3(audio)

            elif isinstance(audio, FLAC):
                details.append("→ 使用 FLAC/pictures 方式读取")
                cover_image = get_cover_from_flac(audio)
            else:
                details.append(f"→ 不支持的文件格式，尝试通用方式...")
                # 也尝试通用方式
                cover_image = get_cover_from_mp3(audio)
                if cover_image is None:
                    cover_image = get_cover_from_flac(audio)

    except Exception as e:
        return None, f"打开文件失败: {e}"

    # 检查 ratings.json 中是否有外部封面路径
    try:
        ratings = load_ratings()
        user_data = ratings.get(filepath, {})
        if user_data.get("cover"):
            cover_path = user_data["cover"]
            details.append(f"ratings.json 中指定封面路径: {cover_path}")
            if os.path.exists(cover_path):
                try:
                    external_cover = Image.open(cover_path)
                    if cover_image is None:
                        cover_image = external_cover
                        details.append("  → 使用外部封面成功")
                    else:
                        details.append("  → 已有内嵌封面，跳过外部封面")
                except Exception as e:
                    details.append(f"  → 外部封面读取失败: {e}")
            else:
                details.append("  → 外部封面文件不存在")
    except Exception:
        pass

    if cover_image is not None:
        details.append(f"✅ 封面读取成功! 尺寸: {cover_image.size}, 模式: {cover_image.mode}")
    else:
        details.append("❌ 未找到封面")

    return cover_image, "\n".join(details)


class CoverViewer(tk.Tk):
    """简单的封面展示窗口"""

    def __init__(self):
        super().__init__()
        self.title("🎵 封面读取测试")
        self.geometry("600x750")
        self.configure(bg='#1e1e1e')

        # 顶部信息
        self.info_text = tk.Text(self, height=15, bg='#2a2a2a', fg='white',
                                  font=('Courier', 10), wrap=tk.WORD,
                                  relief='solid', bd=1)
        self.info_text.pack(fill=tk.X, padx=10, pady=(10, 5))

        # 封面显示
        self.cover_label = tk.Label(self, text="请选择一个音乐文件", bg='#333333',
                                     fg='white', font=('微软雅黑', 12))
        self.cover_label.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # 按钮行
        btn_frame = tk.Frame(self, bg='#1e1e1e')
        btn_frame.pack(fill=tk.X, padx=10, pady=10)

        tk.Button(btn_frame, text="📂 选择文件", command=self.select_file,
                   bg='#4a90d9', fg='white', font=('微软雅黑', 11),
                   relief='solid', bd=0, padx=20, pady=8).pack(side=tk.LEFT, padx=5)

        tk.Button(btn_frame, text="📁 扫描全部", command=self.scan_all,
                   bg='#333333', fg='white', font=('微软雅黑', 11),
                   relief='solid', bd=0, padx=20, pady=8).pack(side=tk.LEFT, padx=5)

        self.file_path = None

    def show_cover(self, filepath):
        """读取并展示文件的封面"""
        self.file_path = filepath
        cover, info = load_cover_from_file(filepath)

        # 显示文件信息
        self.info_text.delete('1.0', tk.END)
        self.info_text.insert(tk.END, f"文件: {filepath}\n")
        self.info_text.insert(tk.END, f"{'='*60}\n")
        self.info_text.insert(tk.END, info)

        # 显示封面
        if cover is not None:
            try:
                # 尝试圆形裁剪 (复用主程序逻辑)
                size = (200, 200)
                cover_resized = cover.resize(size, Image.Resampling.LANCZOS)
                if cover_resized.mode != 'RGBA':
                    cover_resized = cover_resized.convert('RGBA')
                # 圆形遮罩
                mask = Image.new("L", size, 0)
                draw = ImageDraw.Draw(mask)
                draw.ellipse((0, 0) + size, fill=255)
                cover_resized.putalpha(mask)
                photo = ImageTk.PhotoImage(cover_resized)
                self.cover_label.config(image=photo, text="", bg='#1e1e1e',
                                        width=200, height=200)
                self.cover_label.image = photo

                # 也显示完整原始封面
                preview = tk.Toplevel(self)
                preview.title("原始封面")
                orig_size = (400, 400)
                cover_preview = cover.resize(orig_size, Image.Resampling.LANCZOS)
                if cover_preview.mode != 'RGBA':
                    cover_preview = cover_preview.convert('RGBA')
                photo_preview = ImageTk.PhotoImage(cover_preview)
                lbl = tk.Label(preview, image=photo_preview, bg='#1e1e1e')
                lbl.pack()
                lbl.image = photo_preview
                preview.geometry(f"+{self.winfo_x() + 50}+{self.winfo_y() + 50}")
            except Exception as e:
                self.cover_label.config(text=f"展示封面时出错: {e}",
                                        bg='#333333', fg='red')
        else:
            self.cover_label.config(text="❌ 无封面", bg='#333333',
                                    fg='#aaaaaa', width=200, height=200)

    def select_file(self):
        """选择单个文件"""
        filepath = filedialog.askopenfilename(
            title="选择音乐文件",
            filetypes=[("音乐文件", "*.mp3 *.flac"), ("所有文件", "*.*")]
        )
        if filepath:
            self.show_cover(filepath)

    def scan_all(self):
        """扫描 source/music/ 下所有文件"""
        if not os.path.isdir(MUSIC_DIR):
            messagebox.showerror("错误", f"音乐目录不存在: {MUSIC_DIR}")
            return

        files = [f for f in os.listdir(MUSIC_DIR) if f.lower().endswith(('.mp3', '.flac'))]
        if not files:
            messagebox.showinfo("结果", "未找到音乐文件")
            return

        total = len(files)
        success = 0
        failed = 0
        details_list = []

        for fname in sorted(files):
            fpath = os.path.join(MUSIC_DIR, fname)
            cover, info = load_cover_from_file(fpath)

            # 提取标题
            try:
                audio = mutagen.File(fpath)
                title = ""
                if audio:
                    if isinstance(audio, MP3) and audio.tags:
                        title = str(audio.tags.get("TIT2", ""))
                    elif isinstance(audio, FLAC):
                        t = audio.tags.get("TITLE", [""])
                        title = str(t[0]) if isinstance(t, list) and t else str(t)
                if not title:
                    title = os.path.splitext(fname)[0]
            except:
                title = os.path.splitext(fname)[0]

            has_cover = "✅" if cover is not None else "❌"
            details_list.append(f"{has_cover} {fname} -> {title}")
            if cover is not None:
                success += 1
            else:
                failed += 1

        self.info_text.delete('1.0', tk.END)
        self.info_text.insert(tk.END, f"扫描结果: {total} 个文件\n")
        self.info_text.insert(tk.END, f"  ✅ 有封面: {success}\n")
        self.info_text.insert(tk.END, f"  ❌ 无封面: {failed}\n")
        self.info_text.insert(tk.END, f"{'='*60}\n")
        for d in details_list:
            self.info_text.insert(tk.END, d + "\n")

        messagebox.showinfo("扫描完成", f"共 {total} 个文件\n有封面: {success}\n无封面: {failed}")


if __name__ == '__main__':
    # 先打印基本信息
    print("=" * 60)
    print("🎵 封面读取测试工具")
    print("=" * 60)
    print(f"mutagen 版本: {mutagen.version}")
    print(f"Pillow 版本: {Image.__version__}")
    print(f"音乐目录: {MUSIC_DIR}")
    print("=" * 60)

    app = CoverViewer()
    app.mainloop()
