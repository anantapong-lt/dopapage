from __future__ import annotations

import faulthandler
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import os
import json
from pathlib import Path
import platform
import sys
import tempfile
import traceback
from threading import Event
import time
import uuid

# The frozen desktop executable has no stdout stream. Hugging Face otherwise
# creates a tqdm progress bar that writes to None and aborts the download.
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import httpx
from PySide6.QtCore import QAbstractTableModel, QEvent, QLocale, QModelIndex, QStringListModel, Qt, QSettings, QThread, QTimer, QUrl, Signal
from PySide6.QtGui import QColor, QPainter
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtWidgets import QApplication, QCompleter, QDialog, QFrame, QGraphicsDropShadowEffect, QGridLayout, QHBoxLayout, QHeaderView, QLabel, QProgressBar, QSpinBox, QStyle, QStyleOptionViewItem, QVBoxLayout, QWidget
from qfluentwidgets import BodyLabel, CheckBox, ComboBox, EditableComboBox, FluentIcon, FluentWindow, IndeterminateProgressRing, InfoBar, InfoBarPosition, LineEdit, MessageBox, NavigationItemPosition, PasswordLineEdit, PrimaryPushButton, ProgressBar, PushButton, SubtitleLabel, TableItemDelegate, TableView, TextEdit, Theme, setCustomStyleSheet, setTheme, setThemeColor
from qfluentwidgets.common.router import qrouter

from .api import ApiClient, ApiError, ApiUnauthorizedError
from .renderer import RenderError, RenderSettings, VoxCpmRenderer, performance_logger
from .ffmpeg_setup import FFmpegSetupCancelled, ffmpeg_path, install_ffmpeg, verify_ffmpeg
from .secure_store import clear_login_credentials, clear_refresh_token, load_login_credentials, load_refresh_token, save_login_credentials, save_refresh_token

def packaged_api_url() -> str | None:
    if not getattr(sys, "frozen", False):
        return None
    try:
        config = json.loads((Path(sys._MEIPASS) / "bootstrap-config.json").read_text(encoding="utf-8"))  # type: ignore[attr-defined]
    except (OSError, json.JSONDecodeError):
        return None
    api_url = config.get("api_url") if isinstance(config, dict) else None
    return api_url.strip() if isinstance(api_url, str) and api_url.strip() else None


DEFAULT_API_URL = os.environ.get("READJI_TTS_API_URL") or packaged_api_url() or "http://localhost:4000"


def development_version() -> str:
    """Read the project version when the app is started without the bootstrap."""
    try:
        for line in (Path(__file__).resolve().parents[2] / "pyproject.toml").read_text(encoding="utf-8").splitlines():
            if line.startswith("version = "):
                return line.removeprefix("version = ").strip().strip('"')
    except OSError:
        pass
    return ""


RUNTIME_VERSION = os.environ.get("READJI_TTS_RUNTIME_VERSION") or development_version()
DEFAULT_PREVIEW_TEXT = "สวัสดีค่ะ นี่คือตัวอย่างเสียงที่สร้างจากการตั้งค่าปัจจุบัน"
VOXCPM_MODEL_ID = "openbmb/VoxCPM2"
# Pin the model revision so Hugging Face does not need a separate repo-info
# lookup. Some networks return an empty response for that lookup even though
# the model files themselves are publicly downloadable.
VOXCPM_MODEL_REVISION = "32279effe8c19989596f05d353d1447f51d9e915"
VOXCPM_REQUIRED_FILES = (
    "config.json",
    "model.safetensors",
    "audiovae.pth",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "tokenization_voxcpm2.py",
)
PROGRESS_REPORT_INTERVAL = 5
JOB_STATUS_POLL_SECONDS = 3
CHAPTER_PAGE_SIZE = 20
# Shared palette from apps/web/src/app/globals.css.
WEB_COLORS = {
    "background": "#f1efeb",
    "foreground": "#2d1d20",
    "card": "#fffdfa",
    "primary": "#ff6f63",
    "primary_foreground": "#ffffff",
    "secondary": "#f1e8e2",
    "muted": "#f0efeb",
    "muted_foreground": "#74676a",
    "accent": "#f7ece8",
    "border": "#e5dfd9",
    "input": "#ddd5ce",
}
WEB_CONTROL_STYLE = """
    PushButton, ComboBox {{
        background: {card}; color: {foreground};
        border: 1px solid {input}; border-radius: 8px;
    }}
    PushButton:hover, ComboBox:hover {{ background: {accent}; }}
    PushButton:pressed, ComboBox:pressed {{ background: {secondary}; }}
    PushButton:focus, ComboBox:focus {{ border-color: {primary}; }}
    PushButton:disabled, ComboBox:disabled {{
        background: {muted}; color: {muted_foreground}; border-color: {border};
    }}
    PrimaryPushButton {{
        background: {primary}; color: {primary_foreground}; border-color: {primary};
    }}
    PrimaryPushButton:hover {{ background: #ff7d72; border-color: #ff7d72; }}
    PrimaryPushButton:pressed {{ background: #eb665b; border-color: #eb665b; }}
    PrimaryPushButton:focus {{ border-color: {foreground}; }}
    PrimaryPushButton:disabled {{ background: #ffaaa2; color: {card}; border-color: #ffaaa2; }}
""".format_map(WEB_COLORS)

TTS_JOB_STATUS = {
    "QUEUED": "queued",
    "PROCESSING": "processing",
    "DONE": "done",
    "FAILED": "failed",
    "CANCELLED": "cancelled",
}


def application_root() -> Path:
    """Return the directory containing application-owned, bundled resources."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[2]

VOICE_SLOT = {
    "FEMALE": "female",
    "YOUNG_MALE": "young_male",
    "OLD_MALE": "old_male",
}
VOICE_LABELS = {
    VOICE_SLOT["FEMALE"]: "ผู้หญิง",
    VOICE_SLOT["YOUNG_MALE"]: "ผู้ชายวัยหนุ่ม",
    VOICE_SLOT["OLD_MALE"]: "ผู้ชายสูงวัย",
}

STATUS_PRESENTATION = {
    TTS_JOB_STATUS["QUEUED"]: ("อยู่ในคิว", "#fff7ed", "#c2410c"),
    TTS_JOB_STATUS["PROCESSING"]: ("กำลังสร้างเสียง", "#eff6ff", "#1d4ed8"),
    TTS_JOB_STATUS["DONE"]: ("สร้างเสร็จแล้ว", "#ecfdf5", "#047857"),
    TTS_JOB_STATUS["FAILED"]: ("สร้างไม่สำเร็จ", "#fef2f2", "#b91c1c"),
    TTS_JOB_STATUS["CANCELLED"]: ("ยกเลิกแล้ว", "#f4f4f5", "#52525b"),
}

TABLE_COLUMN = {
    "STORY": 0,
    "CHAPTER": 1,
    "WORDS": 2,
    "VOICE": 3,
    "STATUS": 4,
    "ACTION": 5,
}


class ChaptersTableModel(QAbstractTableModel):
    headers = ("นิยาย", "ตอน", "คำ", "เสียง", "สถานะ", "การทำงาน")

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.chapters: list[dict] = []
        self.selected_voices: dict[str, str] = {}

    def replace(self, chapters: list[dict]) -> None:
        self.beginResetModel()
        self.chapters = chapters
        self.endResetModel()

    def chapter_at(self, row: int) -> dict:
        return self.chapters[row]

    def update_chapter(self, chapter_id: str, changes: dict) -> int | None:
        for row, chapter in enumerate(self.chapters):
            if chapter["chapter_id"] == chapter_id:
                chapter.update(changes)
                self.dataChanged.emit(self.index(row, 0), self.index(row, self.columnCount() - 1), [])
                return row
        return None

    @staticmethod
    def saved_voice_for(chapter: dict) -> str:
        saved_voice = chapter.get("latest_voice_slot")
        if saved_voice not in VOICE_LABELS:
            saved_voice = VOICE_SLOT["FEMALE"]
        return saved_voice

    def voice_for(self, chapter: dict) -> str:
        saved_voice = self.saved_voice_for(chapter)
        if chapter.get("latest_job_status") in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]):
            return saved_voice
        return self.selected_voices.get(chapter["chapter_id"], saved_voice)

    def has_voice_change(self, chapter: dict) -> bool:
        """Return whether a completed chapter has a newly selected voice."""
        if chapter.get("latest_job_status") in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]):
            return False
        selected_voice = self.selected_voices.get(chapter["chapter_id"])
        return selected_voice is not None and selected_voice != self.saved_voice_for(chapter)

    def flags(self, index: QModelIndex):
        flags = super().flags(index)
        if index.isValid() and index.column() == TABLE_COLUMN["VOICE"]:
            chapter = self.chapter_at(index.row())
            if chapter.get("latest_job_status") not in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]):
                flags |= Qt.ItemFlag.ItemIsEditable
        return flags

    def setData(self, index: QModelIndex, value, role: int = Qt.ItemDataRole.EditRole) -> bool:
        if (not index.isValid() or index.column() != TABLE_COLUMN["VOICE"]
                or role != Qt.ItemDataRole.EditRole or value not in VOICE_LABELS
                or not (self.flags(index) & Qt.ItemFlag.ItemIsEditable)):
            return False
        chapter = self.chapter_at(index.row())
        chapter_id = chapter["chapter_id"]
        if value == self.saved_voice_for(chapter):
            self.selected_voices.pop(chapter_id, None)
        else:
            self.selected_voices[chapter_id] = value
        self.dataChanged.emit(
            index,
            self.index(index.row(), TABLE_COLUMN["ACTION"]),
            [Qt.ItemDataRole.DisplayRole, Qt.ItemDataRole.EditRole],
        )
        return True

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:
        return 0 if parent.isValid() else len(self.chapters)

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        return 0 if parent.isValid() else len(self.headers)

    def headerData(self, section: int, orientation: Qt.Orientation, role: int = Qt.ItemDataRole.DisplayRole):
        if orientation == Qt.Orientation.Horizontal and role == Qt.ItemDataRole.DisplayRole:
            return self.headers[section]
        return None

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole):
        if not index.isValid() or index.row() >= len(self.chapters):
            return None
        chapter = self.chapters[index.row()]
        if index.column() == TABLE_COLUMN["VOICE"]:
            if role == Qt.ItemDataRole.EditRole:
                return self.voice_for(chapter)
            if role == Qt.ItemDataRole.ToolTipRole:
                return "ยกเลิกงานเดิมก่อนเปลี่ยนเสียง" if chapter.get("latest_job_status") in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]) else "เลือกเสียงสำหรับตอนนี้ก่อนเข้าคิว"
        if role == Qt.ItemDataRole.TextAlignmentRole and index.column() in (TABLE_COLUMN["WORDS"], TABLE_COLUMN["VOICE"]):
            return Qt.AlignmentFlag.AlignCenter
        if role != Qt.ItemDataRole.DisplayRole:
            return None
        values = (
            chapter["story_title"],
            f"{chapter['chapter_number']}: {chapter['chapter_title']}",
            str(chapter["word_count"]),
            VOICE_LABELS[self.voice_for(chapter)],
            "",
            "",
        )
        return values[index.column()]


class ChapterTableDelegate(TableItemDelegate):
    action_clicked = Signal(str)

    def initStyleOption(self, option: QStyleOptionViewItem, index: QModelIndex) -> None:
        super().initStyleOption(option, index)
        if index.column() == TABLE_COLUMN["VOICE"] and self.parent().isPersistentEditorOpen(index):
            # QStyledItemDelegate rebuilds the text from DisplayRole during
            # paint, so suppress it here, underneath the translucent ComboBox.
            # Keep the model's label and the normal row background intact.
            option.text = ""

    def createEditor(self, parent, option, index):
        if index.column() != TABLE_COLUMN["VOICE"]:
            return super().createEditor(parent, option, index)
        editor = ComboBox(parent)
        setCustomStyleSheet(editor, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
        editor.setMinimumWidth(0)
        editor.setFixedHeight(32)
        for value, label in VOICE_LABELS.items():
            editor.addItem(label, userData=value)
        editor.currentIndexChanged.connect(lambda _index: self.commitData.emit(editor))
        return editor

    def setEditorData(self, editor, index) -> None:
        if index.column() != TABLE_COLUMN["VOICE"]:
            super().setEditorData(editor, index)
            return
        editor.blockSignals(True)
        editor.setCurrentIndex(editor.findData(index.data(Qt.ItemDataRole.EditRole)))
        editor.blockSignals(False)

    def setModelData(self, editor, model, index) -> None:
        if index.column() == TABLE_COLUMN["VOICE"]:
            model.setData(index, editor.currentData(), Qt.ItemDataRole.EditRole)
        else:
            super().setModelData(editor, model, index)

    def updateEditorGeometry(self, editor, option, index) -> None:
        if index.column() != TABLE_COLUMN["VOICE"]:
            super().updateEditorGeometry(editor, option, index)
            return
        rect = option.rect.adjusted(6, 0, -6, 0)
        rect.setWidth(max(0, rect.width()))
        rect.setHeight(32)
        rect.moveTop(option.rect.top() + (option.rect.height() - 32) // 2)
        editor.setMaximumWidth(rect.width())
        editor.setGeometry(rect)

    @staticmethod
    def _content_rect(rect):
        return rect.adjusted(8, 9, -8, -9)

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index: QModelIndex) -> None:
        model = index.model()
        if not isinstance(model, ChaptersTableModel):
            super().paint(painter, option, index)
            return
        chapter = model.chapter_at(index.row())
        column = index.column()
        if column not in (TABLE_COLUMN["STATUS"], TABLE_COLUMN["ACTION"]):
            super().paint(painter, option, index)
            return
        super().paint(painter, option, index)
        if column == TABLE_COLUMN["STATUS"]:
            label, background, color = STATUS_PRESENTATION.get(chapter.get("latest_job_status"), ("ยังไม่ได้สร้าง", WEB_COLORS["muted"], WEB_COLORS["muted_foreground"]))
            if chapter.get("latest_job_status") == TTS_JOB_STATUS["PROCESSING"] and chapter.get("latest_progress") is not None:
                label = f"{label} {chapter['latest_progress']}%"
            self._paint_pill(painter, self._content_rect(option.rect), label, background, color)
            return
        job_status = chapter.get("latest_job_status")
        if job_status not in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]):
            if job_status == TTS_JOB_STATUS["DONE"] and not model.has_voice_change(chapter):
                return
            label = "สร้างใหม่" if job_status == TTS_JOB_STATUS["DONE"] else "เข้าคิว"
            self._paint_pill(painter, self._content_rect(option.rect), label, WEB_COLORS["primary"], WEB_COLORS["primary_foreground"])

    @staticmethod
    def _paint_pill(painter: QPainter, rect, text: str, background: str, color: str) -> None:
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(background))
        painter.drawRoundedRect(rect, 9, 9)
        painter.setPen(QColor(color))
        painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, text)
        painter.restore()

    def editorEvent(self, event, model, option: QStyleOptionViewItem, index: QModelIndex) -> bool:
        if index.column() != TABLE_COLUMN["ACTION"] or not isinstance(model, ChaptersTableModel):
            return super().editorEvent(event, model, option, index)
        chapter = model.chapter_at(index.row())
        if chapter.get("latest_job_status") in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]):
            return False
        if (chapter.get("latest_job_status") == TTS_JOB_STATUS["DONE"]
                and not model.has_voice_change(chapter)):
            return False
        if event.type() == QEvent.Type.MouseButtonRelease and event.button() == Qt.MouseButton.LeftButton:
            if self._content_rect(option.rect).contains(event.position().toPoint()):
                self.action_clicked.emit(chapter["chapter_id"])
                return True
        return super().editorEvent(event, model, option, index)


class LoginThread(QThread):
    succeeded = Signal(object, str, str)
    failed = Signal(str)

    def __init__(self, email: str, password: str) -> None:
        super().__init__()
        self.email = email
        self.password = password

    def run(self) -> None:
        try:
            client = ApiClient(DEFAULT_API_URL)
            result = client.login(self.email, self.password, platform.node() or "Windows Agent")
            self.succeeded.emit(client, result["refresh_token"], result["user"]["display_name"])
        except (ApiError, httpx.HTTPError) as error:
            self.failed.emit(str(error))


def voxcpm_model_directory() -> Path:
    """Return the stable, normal-directory location of the VoxCPM2 files.

    Hugging Face's snapshot cache relies on symlink-style metadata.  That cache
    can fail in frozen Windows applications when its repository lookup returns
    no metadata, despite every model file being public.  A normal local model
    directory is resilient to that failure and can be resumed file by file.
    """
    directory = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "Readji" / "TTS Agent" / "models" / f"VoxCPM2-{VOXCPM_MODEL_REVISION}"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def is_voxcpm_model_cached() -> bool:
    directory = voxcpm_model_directory()
    return all((directory / filename).is_file() for filename in VOXCPM_REQUIRED_FILES)


class ModelDownloadThread(QThread):
    completed = Signal()
    failed = Signal(str)
    status_changed = Signal(str)

    def run(self) -> None:
        try:
            from huggingface_hub import hf_hub_download

            directory = voxcpm_model_directory()
            for index, filename in enumerate(VOXCPM_REQUIRED_FILES, start=1):
                self.status_changed.emit(f"กำลังดาวน์โหลดไฟล์ {index}/{len(VOXCPM_REQUIRED_FILES)}: {filename}")
                hf_hub_download(
                    VOXCPM_MODEL_ID,
                    filename,
                    revision=VOXCPM_MODEL_REVISION,
                    local_dir=str(directory),
                )
            self.completed.emit()
        except Exception as error:
            try:
                log_path = voxcpm_model_directory().parent / "model-download-error.log"
                log_path.write_text(traceback.format_exc(), encoding="utf-8")
            except OSError:
                pass
            self.failed.emit(f"{type(error).__name__}: {error}")


class ModelDownloadDialog(QDialog):
    ready = Signal()

    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.setWindowTitle("กำลังเตรียม VoxCPM2")
        # Downloading is already on a QThread. Do not lock the entire app
        # while several gigabytes are transferred; the queue-start controls
        # are disabled separately until the model is ready.
        self.setModal(False)
        self.setWindowModality(Qt.WindowModality.NonModal)
        self.setFixedWidth(460)
        self.setWindowFlag(Qt.WindowCloseButtonHint, False)
        self.setObjectName("modelDownloadDialog")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("""
            QDialog#modelDownloadDialog {{ background: {card}; }}
            QDialog#modelDownloadDialog QLabel {{ color: {foreground}; background: transparent; }}
            QDialog#modelDownloadDialog QProgressBar {{
                min-height: 8px; border: 0; border-radius: 4px; background: {muted};
            }}
            QDialog#modelDownloadDialog QProgressBar::chunk {{
                border-radius: 4px; background: {primary};
            }}
        """.format_map(WEB_COLORS))
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 28, 28, 28)
        layout.setSpacing(12)
        layout.addWidget(SubtitleLabel("กำลังดาวน์โหลดโมเดลเสียงครั้งแรก", self))
        layout.addWidget(BodyLabel("กำลังดาวน์โหลด openbmb/VoxCPM2 (ประมาณ 5 GB)\nกรุณาอย่าปิดโปรแกรมหรือเริ่มงานซ้ำระหว่างดาวน์โหลด", self))
        self.progress = QProgressBar(self)
        self.progress.setRange(0, 0)
        layout.addWidget(self.progress)
        self.status = BodyLabel("กำลังเชื่อมต่อ Hugging Face...", self)
        self.status.setStyleSheet("color: #71717a;")
        layout.addWidget(self.status)
        self.thread = ModelDownloadThread()
        self.thread.completed.connect(self._completed)
        self.thread.failed.connect(self._failed)
        self.thread.status_changed.connect(self.status.setText)

    def start(self) -> None:
        self.thread.start()
        self.show()

    def _completed(self) -> None:
        self.progress.setRange(0, 1)
        self.progress.setValue(1)
        self.status.setText("ดาวน์โหลดโมเดลเสร็จแล้ว กำลังเริ่มงาน...")
        self.ready.emit()
        self.accept()

    def _failed(self, message: str) -> None:
        self.progress.setRange(0, 1)
        self.progress.setValue(0)
        self.status.setText(f"ดาวน์โหลดไม่สำเร็จ: {message}")
        self.setWindowFlag(Qt.WindowCloseButtonHint, True)
        self.show()


class FFmpegSetupThread(QThread):
    progress = Signal(int, int, str)

    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.cancel_requested = Event()
        self.error_message: str | None = None
        self.cancelled = False

    def run(self) -> None:
        try:
            install_ffmpeg(self.progress.emit, self.cancel_requested)
        except FFmpegSetupCancelled:
            self.cancelled = True
        except Exception as error:
            self.error_message = str(error)


class FFmpegSetupDialog(QDialog):
    ready = Signal()
    setup_failed = Signal()

    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.thread: FFmpegSetupThread | None = None
        self.setModal(True)
        self.setFixedWidth(520)
        self.setWindowTitle("กำลังเตรียมระบบประมวลผลเสียง")
        self.setObjectName("processingPreparationDialog")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("""
            QDialog#processingPreparationDialog {{ background: {card}; }}
            QDialog#processingPreparationDialog QLabel {{ color: {foreground}; background: transparent; }}
            QDialog#processingPreparationDialog QProgressBar {{
                min-height: 8px; border: 0; border-radius: 4px; background: {muted};
            }}
            QDialog#processingPreparationDialog QProgressBar::chunk {{
                border-radius: 4px; background: {primary};
            }}
            QDialog#processingPreparationDialog PushButton {{
                min-height: 32px; padding: 0 14px; color: {foreground};
                background: {card}; border: 1px solid {input}; border-radius: 8px;
            }}
            QDialog#processingPreparationDialog PrimaryPushButton {{
                color: {primary_foreground}; background: {primary}; border-color: {primary};
            }}
        """.format_map(WEB_COLORS))
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.addWidget(SubtitleLabel("กำลังเตรียมระบบประมวลผลเสียง", self))
        hint = BodyLabel(
            "หากยังไม่มี FFmpeg แอปจะดาวน์โหลดจาก gyan.dev ประมาณ 104 MB\n"
            "ติดตั้งไว้ใช้เฉพาะแอป ไม่แก้ PATH และยังไม่เริ่มแปลงเสียง", self,
        )
        hint.setWordWrap(True)
        layout.addWidget(hint)
        location = BodyLabel(str(ffmpeg_path().parent), self)
        location.setWordWrap(True)
        layout.addWidget(location)
        self.progress = QProgressBar(self)
        layout.addWidget(self.progress)
        self.status = BodyLabel("กำลังตรวจสอบ...", self)
        self.status.setWordWrap(True)
        layout.addWidget(self.status)
        buttons = QHBoxLayout()
        self.retry_button = PrimaryPushButton("ลองใหม่", self)
        self.retry_button.clicked.connect(self.start)
        self.cancel_button = PushButton("ยกเลิก", self)
        self.cancel_button.clicked.connect(self.reject)
        buttons.addStretch(1)
        buttons.addWidget(self.retry_button)
        buttons.addWidget(self.cancel_button)
        layout.addLayout(buttons)

    def start(self) -> None:
        if self.thread is not None:
            if self.thread.isRunning():
                return
            self.thread.deleteLater()
        self.retry_button.hide()
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText("ยกเลิก")
        self.progress.setRange(0, 0)
        self.status.setText("กำลังตรวจสอบ FFmpeg...")
        self.thread = FFmpegSetupThread(self)
        self.thread.progress.connect(self._progress)
        self.thread.finished.connect(self._completed)
        self.show()
        self.thread.start()

    def _progress(self, done: int, total: int, message: str) -> None:
        if self.thread is not None and self.thread.cancel_requested.is_set():
            return
        self.progress.setRange(0, 100 if total else 0)
        if total:
            self.progress.setValue(min(100, int(done * 100 / total)))
        if done > 1:
            amount = f"{done / 1024 / 1024:.1f} MB"
            if total:
                amount += f" / {total / 1024 / 1024:.1f} MB"
            message += f" {amount}"
        self.status.setText(message)

    def _completed(self) -> None:
        if self.thread is None:
            return
        if self.thread.cancelled or self.thread.cancel_requested.is_set():
            super().reject()
        elif self.thread.error_message:
            self.setup_failed.emit()
            self.progress.setRange(0, 100)
            self.progress.setValue(0)
            self.status.setText(f"เตรียม FFmpeg ไม่สำเร็จ: {self.thread.error_message}")
            self.retry_button.show()
            self.cancel_button.setText("ปิด")
        else:
            self.ready.emit()

    def show_model_preparing(self) -> None:
        """Continue the same preparation dialog while VoxCPM2 loads on the GPU."""
        self.setWindowTitle("กำลังเตรียมระบบประมวลผลเสียง")
        self.retry_button.hide()
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText("ยกเลิก")
        self.progress.setRange(0, 0)
        self.status.setText("กำลังโหลดโมเดลเสียงเข้าสู่ GPU และปรับแต่งระบบให้พร้อมใช้งาน...")
        self.show()

    def reject(self) -> None:
        if self.thread is not None and self.thread.isRunning():
            self.thread.cancel_requested.set()
            self.cancel_button.setEnabled(False)
            self.status.setText("กำลังยกเลิกการดาวน์โหลด กรุณารอสักครู่...")
            return
        super().reject()

    def closeEvent(self, event) -> None:
        if self.thread is not None and self.thread.isRunning():
            self.reject()
            event.ignore()
            return
        super().closeEvent(event)


class ModelPreparingDialog(QDialog):
    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.setObjectName("modelPreparingDialog")
        self.setWindowTitle("กำลังเตรียมโมเดลเสียง")
        # GPU preload runs in a background thread, so users should still be
        # able to move the window or review the queue while it completes.
        self.setModal(False)
        self.setWindowModality(Qt.WindowModality.NonModal)
        self.setFixedSize(360, 170)
        self.setStyleSheet("QDialog#modelPreparingDialog { background: #fafafa; } QLabel { color: #18181b; background: transparent; }")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 28, 28, 28)
        layout.setSpacing(12)
        self.spinner = IndeterminateProgressRing(self)
        self.spinner.setFixedSize(34, 34)
        layout.addWidget(self.spinner, 0, Qt.AlignmentFlag.AlignHCenter)
        self.message = BodyLabel("กำลังโหลดโมเดลเสียงเข้าสู่ GPU...", self)
        self.message.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        layout.addWidget(self.message)


class ShutdownDialog(QDialog):
    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.setObjectName("shutdownDialog")
        self.setWindowTitle("กำลังปิดโปรแกรม")
        self.setModal(True)
        self.setWindowFlag(Qt.WindowType.WindowCloseButtonHint, False)
        self.setFixedWidth(480)
        self.setStyleSheet("QDialog#shutdownDialog { background: #fffdfa; } QLabel { color: #2d1d20; background: transparent; }")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 28, 28, 28)
        layout.setSpacing(16)
        heading = SubtitleLabel("กำลังปิดโปรแกรม", self)
        heading.setAlignment(Qt.AlignCenter)
        layout.addWidget(heading)
        message = BodyLabel("กำลังรอให้งานเบื้องหลังหยุดก่อนปิดโปรแกรม\nโปรแกรมจะปิดอัตโนมัติเมื่อดำเนินการเสร็จ", self)
        message.setAlignment(Qt.AlignCenter)
        message.setWordWrap(True)
        layout.addWidget(message)
        progress = QProgressBar(self)
        progress.setRange(0, 0)
        progress.setTextVisible(False)
        layout.addWidget(progress)

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self.move(self.parentWidget().frameGeometry().center() - self.rect().center())

    def reject(self) -> None:
        # Escape must not dismiss the status while shutdown is still pending.
        pass

    def closeEvent(self, event) -> None:
        event.ignore()


class ModelPreloadThread(QThread):
    def __init__(self, renderer: VoxCpmRenderer) -> None:
        super().__init__()
        self.renderer = renderer
        self.error_message: str | None = None

    def run(self) -> None:
        try:
            self.renderer.preload()
        except Exception as error:
            self.error_message = f"{type(error).__name__}: {error}"


class LoginPage(QWidget):
    signed_in = Signal(object, str)

    def __init__(self) -> None:
        super().__init__()
        self.login_thread: LoginThread | None = None
        # Match apps/web/src/app/globals.css and the Web AuthCard.
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("""
            LoginPage { background: #f1efeb; }
            QLabel { background: transparent; color: #2d1d20; }
        """)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 24, 24, 24)
        outer.addStretch(1)
        card = QFrame(self, objectName="loginCard")
        card.setMaximumWidth(600)
        card.setStyleSheet("QFrame#loginCard { background: #fffdfa; border: 1px solid #e5dfd9; border-radius: 32px; }")
        shadow = QGraphicsDropShadowEffect(card)
        shadow.setBlurRadius(50)
        shadow.setOffset(0, 16)
        shadow.setColor(QColor(45, 29, 32, 26))
        card.setGraphicsEffect(shadow)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(40, 40, 40, 40)
        layout.setSpacing(0)
        logo = QLabel(card)
        logo.setAlignment(Qt.AlignCenter)
        logo.setFixedHeight(128)
        logo.setAccessibleName("Dopapage")
        logo.setText("DOPAPAGE")
        logo.setStyleSheet("color: #ff6f63; font-size: 34px; font-weight: 800; letter-spacing: 2px;")
        layout.addWidget(logo)
        layout.addSpacing(28)
        divider = QFrame(card)
        divider.setFixedHeight(1)
        divider.setStyleSheet("background: #e5dfd9; border: none;")
        layout.addWidget(divider)
        layout.addSpacing(28)
        heading = SubtitleLabel("เข้าสู่ระบบ Dopapage TTS Agent", card)
        heading.setAlignment(Qt.AlignCenter)
        heading.setStyleSheet("color: #2d1d20; font-size: 18px; font-weight: 700;")
        layout.addWidget(heading)
        layout.addSpacing(24)
        self.email = LineEdit(card)
        self.email.setPlaceholderText("อีเมล")
        self.email.setAccessibleName("อีเมล")
        self.email.setClearButtonEnabled(True)
        self.password = PasswordLineEdit(card)
        self.password.setPlaceholderText("รหัสผ่าน")
        self.password.setAccessibleName("รหัสผ่าน")
        for field in (self.email, self.password):
            field.setFixedHeight(48)
            field.setCustomFocusedBorderColor("#ff6f63", "#ff6f63")
            field.setStyleSheet("""
                QLineEdit {
                    background: #fffdfa; color: #2d1d20;
                    border: 1px solid #ddd5ce; border-radius: 12px;
                    padding: 0 12px; font-size: 14px;
                    selection-background-color: #ff6f63; selection-color: #ffffff;
                }
                QLineEdit:hover { border-color: #b6a8a1; }
                QLineEdit:focus { border-color: #ff6f63; }
                QLineEdit:disabled { background: #f0efeb; color: #74676a; }
            """)
            layout.addWidget(field)
            layout.addSpacing(16)
        self.remember_login = CheckBox("บันทึกอีเมลและรหัสผ่าน", card)
        self.remember_login.setTextColor("#2d1d20", "#2d1d20")
        self.remember_login.setCheckedColor("#ff6f63", "#ff6f63")
        self.remember_login.toggled.connect(self._remember_login_changed)
        layout.addWidget(self.remember_login)
        layout.addSpacing(16)
        self.login_button = PrimaryPushButton("เข้าสู่ระบบ", card)
        self.login_button.setFixedHeight(44)
        self.login_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.login_button.setStyleSheet("""
            QPushButton {
                background: #ff6f63; color: #ffffff; border: none;
                border-radius: 8px; padding: 0 16px; font-size: 16px; font-weight: 500;
            }
            QPushButton:hover { background: #ff7d72; }
            QPushButton:pressed { background: #eb665b; }
            QPushButton:focus { border: 2px solid #2d1d20; }
            QPushButton:disabled { background: #ffaaa2; color: #fffdfa; }
        """)
        self.login_button.clicked.connect(self._login)
        self.password.returnPressed.connect(self._login)
        layout.addWidget(self.login_button)
        layout.addSpacing(20)
        hint = BodyLabel("ใช้บัญชีนักเขียนเดียวกับเว็บไซต์\nเลือกบันทึกข้อมูลเพื่อเติมอีเมลและรหัสผ่านในครั้งถัดไป", card)
        hint.setAlignment(Qt.AlignCenter)
        hint.setWordWrap(True)
        hint.setStyleSheet("color: #74676a; font-size: 13px;")
        layout.addWidget(hint)
        card_row = QHBoxLayout()
        card_row.addStretch()
        card_row.addWidget(card, 1)
        card_row.addStretch()
        outer.addLayout(card_row)
        outer.addStretch(1)
        QTimer.singleShot(0, self.restore_saved_login)

    def restore_saved_login(self) -> None:
        try:
            credentials = load_login_credentials(DEFAULT_API_URL)
        except Exception:
            InfoBar.warning("อ่านข้อมูลที่บันทึกไม่สำเร็จ", "กรุณากรอกอีเมลและรหัสผ่านเพื่อเข้าสู่ระบบ", parent=self, position=InfoBarPosition.TOP)
            return
        self.remember_login.blockSignals(True)
        self.remember_login.setChecked(credentials is not None)
        self.remember_login.blockSignals(False)
        if credentials is not None:
            self.email.setText(credentials[0])
            self.password.setText(credentials[1])

    def _remember_login_changed(self, checked: bool) -> None:
        if checked:
            return
        try:
            clear_login_credentials(DEFAULT_API_URL)
        except Exception:
            self.remember_login.blockSignals(True)
            self.remember_login.setChecked(True)
            self.remember_login.blockSignals(False)
            InfoBar.error("ลบข้อมูลที่บันทึกไม่สำเร็จ", "กรุณาลองยกเลิกการบันทึกอีกครั้ง", parent=self, position=InfoBarPosition.TOP)

    def _login(self) -> None:
        if self.login_thread is not None:
            return
        if not self.email.text().strip() or not self.password.text():
            InfoBar.warning("ข้อมูลไม่ครบ", "กรุณากรอกอีเมลและรหัสผ่าน", parent=self, position=InfoBarPosition.TOP); return
        self.login_button.setEnabled(False)
        self.login_button.setText("กำลังเข้าสู่ระบบ...")
        self.email.setEnabled(False)
        self.password.setEnabled(False)
        self.remember_login.setEnabled(False)
        self.login_thread = LoginThread(self.email.text().strip(), self.password.text())
        self.login_thread.succeeded.connect(self._login_succeeded)
        self.login_thread.failed.connect(self._login_failed)
        self.login_thread.finished.connect(self._finish_login)
        self.login_thread.start()

    def _login_succeeded(self, client: ApiClient, refresh_token: str, display_name: str) -> None:
        save_refresh_token(refresh_token)
        try:
            if self.remember_login.isChecked():
                save_login_credentials(DEFAULT_API_URL, self.email.text().strip(), self.password.text())
            else:
                clear_login_credentials(DEFAULT_API_URL)
        except Exception:
            InfoBar.warning("บันทึกข้อมูลเข้าสู่ระบบไม่สำเร็จ", "ครั้งถัดไปกรุณากรอกข้อมูลเข้าสู่ระบบอีกครั้ง", parent=self.window(), position=InfoBarPosition.TOP)
        self.password.clear()
        self.signed_in.emit(client, display_name)

    def _login_failed(self, message: str) -> None:
        InfoBar.error("เข้าสู่ระบบไม่สำเร็จ", message, parent=self, position=InfoBarPosition.TOP)

    def _finish_login(self) -> None:
        if self.login_thread is not None:
            self.login_thread.deleteLater()
        self.login_thread = None
        self.email.setEnabled(True)
        self.password.setEnabled(True)
        self.remember_login.setEnabled(True)
        self.login_button.setEnabled(True)
        self.login_button.setText("เข้าสู่ระบบ")


class PreviewRenderThread(QThread):
    succeeded = Signal(str)
    failed = Signal(str)
    progress_updated = Signal(int, int)

    def __init__(self, renderer: VoxCpmRenderer, settings: RenderSettings, voice_slot: str, text: str) -> None:
        super().__init__()
        self.renderer = renderer
        self.settings = settings
        self.voice_slot = voice_slot
        self.text = text

    def run(self) -> None:
        try:
            output, _duration, _timeline = self.renderer.render(
                self.text,
                self.voice_slot,
                self.settings,
                lambda done, total: self.progress_updated.emit(done, total),
            )
            self.succeeded.emit(str(output))
        except Exception as error:
            self.failed.emit(f"{type(error).__name__}: {error}")


class AudioSettingsPage(QWidget):
    def __init__(self, settings: QSettings) -> None:
        super().__init__()
        self.settings = settings
        self.renderer: VoxCpmRenderer | None = None
        self.jobs_page: JobsPage | None = None
        self.preview_thread: PreviewRenderThread | None = None
        self.audio_output = QAudioOutput(self)
        self.audio_output.setVolume(0.9)
        self.player = QMediaPlayer(self)
        self.player.setAudioOutput(self.audio_output)
        self.setObjectName("audio-settings-page")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("""
            AudioSettingsPage {{ background: {background}; }}
            QLabel {{ color: {foreground}; background: transparent; }}
        """.format_map(WEB_COLORS))
        layout = QVBoxLayout(self)
        layout.setContentsMargins(40, 32, 40, 32)
        layout.setSpacing(20)
        layout.addWidget(SubtitleLabel("ตั้งค่าการแปลงเสียง", self))
        description = BodyLabel("เลือกคุณภาพตามความเร็ว พื้นที่จัดเก็บ และเสียงที่ต้องการฟัง", self)
        description.setStyleSheet(f"color: {WEB_COLORS['muted_foreground']}; background: transparent;")
        layout.addWidget(description)
        self.timesteps = ComboBox(self)
        self.timesteps.addItem("เร็ว — 4 ขั้นตอน", userData=4)
        self.timesteps.addItem("สมดุล — 6 ขั้นตอน", userData=6)
        self.timesteps.addItem("คุณภาพสูง — 8 ขั้นตอน", userData=8)
        self.sample_rate = ComboBox(self)
        self.sample_rate.addItem("ประหยัดพื้นที่ — 24 kHz", userData=24_000)
        self.sample_rate.addItem("สมดุล — 32 kHz", userData=32_000)
        self.sample_rate.addItem("คุณภาพสูง — 48 kHz", userData=48_000)
        self.bitrate = ComboBox(self)
        self.bitrate.addItem("ประหยัดพื้นที่ — 48 kbps", userData="48k")
        self.bitrate.addItem("สมดุล — 64 kbps", userData="64k")
        self.bitrate.addItem("คุณภาพสูง — 96 kbps", userData="96k")

        def setting_card(title: str, detail: str, control: ComboBox) -> QFrame:
            card = QFrame(self)
            card.setObjectName("audioSettingCard")
            card.setStyleSheet(f"""
                QFrame#audioSettingCard {{ background: {WEB_COLORS['card']}; border: 1px solid {WEB_COLORS['border']}; border-radius: 14px; }}
            """)
            card_layout = QVBoxLayout(card)
            card_layout.setContentsMargins(18, 16, 18, 18)
            card_layout.setSpacing(6)
            heading = BodyLabel(title, card)
            heading.setStyleSheet(f"color: {WEB_COLORS['foreground']}; font-weight: 700; background: transparent; border: none;")
            hint = BodyLabel(detail, card)
            hint.setWordWrap(True)
            hint.setStyleSheet(f"color: {WEB_COLORS['muted_foreground']}; background: transparent; border: none;")
            setCustomStyleSheet(control, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
            card_layout.addWidget(heading)
            card_layout.addWidget(hint)
            card_layout.addSpacing(8)
            card_layout.addWidget(control)
            return card

        setting_grid = QGridLayout()
        setting_grid.setHorizontalSpacing(14)
        setting_grid.setVerticalSpacing(14)
        setting_grid.addWidget(setting_card("ความเร็วในการสร้าง", "ขั้นตอนน้อยสร้างไวขึ้น แต่อาจมีเสียงรบกวนมากขึ้น", self.timesteps), 0, 0)
        setting_grid.addWidget(setting_card("ความละเอียดเสียง", "ค่าสูงให้รายละเอียดดีขึ้น แต่ใช้พื้นที่ไฟล์มากขึ้น", self.sample_rate), 0, 1)
        setting_grid.addWidget(setting_card("คุณภาพไฟล์ MP3", "ค่าสูงช่วยเก็บรายละเอียดเสียงหลังบีบอัด", self.bitrate), 0, 2)
        for column in range(3):
            setting_grid.setColumnStretch(column, 1)
        layout.addLayout(setting_grid)

        preview_card = QFrame(self)
        preview_card.setObjectName("audioPreviewCard")
        preview_card.setStyleSheet(f"""
            QFrame#audioPreviewCard {{ background: {WEB_COLORS['card']}; border: 1px solid {WEB_COLORS['border']}; border-radius: 16px; }}
        """)
        preview_layout = QVBoxLayout(preview_card)
        preview_layout.setContentsMargins(22, 20, 22, 20)
        preview_layout.setSpacing(10)
        preview_title = BodyLabel("ทดลองฟังเสียง", preview_card)
        preview_title.setStyleSheet(f"color: {WEB_COLORS['foreground']}; font-size: 16px; font-weight: 700; background: transparent; border: none;")
        preview_hint = BodyLabel("ระบบจะสร้างตัวอย่างใหม่ด้วยค่าที่เลือกด้านบน โดยไม่กระทบคิวงาน", preview_card)
        preview_hint.setStyleSheet(f"color: {WEB_COLORS['muted_foreground']}; background: transparent; border: none;")
        preview_layout.addWidget(preview_title)
        preview_layout.addWidget(preview_hint)
        preview_text_header = QHBoxLayout()
        preview_text_label = BodyLabel("ข้อความตัวอย่าง", preview_card)
        preview_text_label.setStyleSheet(f"color: {WEB_COLORS['foreground']}; font-weight: 700; background: transparent; border: none;")
        self.reset_preview_text_button = PushButton("คืนค่าเริ่มต้น", preview_card)
        self.reset_preview_text_button.clicked.connect(lambda: self.preview_text.setPlainText(DEFAULT_PREVIEW_TEXT))
        setCustomStyleSheet(self.reset_preview_text_button, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
        preview_text_header.addWidget(preview_text_label)
        preview_text_header.addStretch(1)
        preview_text_header.addWidget(self.reset_preview_text_button)
        preview_layout.addLayout(preview_text_header)
        self.preview_text = TextEdit(preview_card)
        self.preview_text.setPlainText(DEFAULT_PREVIEW_TEXT)
        self.preview_text.setPlaceholderText("พิมพ์ข้อความที่ต้องการทดลองฟัง")
        self.preview_text.setFixedHeight(92)
        setCustomStyleSheet(self.preview_text, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
        preview_layout.addWidget(self.preview_text)
        preview_controls = QHBoxLayout()
        preview_controls.setSpacing(10)
        self.voice = ComboBox(preview_card)
        self.voice.addItem("เสียงผู้หญิง", userData="female")
        self.voice.addItem("เสียงผู้ชายวัยรุ่น", userData="young_male")
        self.voice.addItem("เสียงผู้ชายผู้ใหญ่", userData="old_male")
        self.voice.setMinimumWidth(250)
        self.preview_button = PrimaryPushButton("ทดสอบ", preview_card)
        self.stop_preview_button = PushButton("หยุดเสียง", preview_card)
        self.stop_preview_button.clicked.connect(self.stop_preview)
        self.stop_preview_button.setVisible(False)
        for control in (self.voice, self.preview_button, self.stop_preview_button):
            setCustomStyleSheet(control, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
        preview_controls.addWidget(self.voice)
        preview_controls.addWidget(self.preview_button)
        preview_controls.addWidget(self.stop_preview_button)
        preview_controls.addStretch(1)
        preview_layout.addLayout(preview_controls)
        self.preview_progress = ProgressBar(preview_card)
        self.preview_progress.setCustomBarColor(WEB_COLORS["primary"], WEB_COLORS["primary"])
        self.preview_progress.setVisible(False)
        preview_layout.addWidget(self.preview_progress)
        self.status = BodyLabel("ค่าที่เลือกจะถูกบันทึกอัตโนมัติ และใช้กับงานใหม่", preview_card)
        self.status.setStyleSheet(f"color: {WEB_COLORS['muted_foreground']}; background: transparent; border: none;")
        preview_layout.addWidget(self.status)
        layout.addWidget(preview_card)
        layout.addStretch(1)
        self.preview_button.clicked.connect(self.preview)
        self._restore()
        for control in (self.timesteps, self.sample_rate, self.bitrate):
            control.currentIndexChanged.connect(self._save)

    def set_renderer(self, renderer: VoxCpmRenderer) -> None:
        self.renderer = renderer

    def set_jobs_page(self, jobs_page: "JobsPage") -> None:
        self.jobs_page = jobs_page

    def _restore(self) -> None:
        for control, key, fallback in (
            (self.timesteps, "audio/inference_timesteps", 8),
            (self.sample_rate, "audio/output_sample_rate", 48_000),
            (self.bitrate, "audio/mp3_bitrate", "96k"),
        ):
            index = control.findData(self.settings.value(key, fallback))
            control.setCurrentIndex(index if index >= 0 else control.findData(fallback))

    def _save(self, _index: int) -> None:
        settings = self.render_settings()
        self.settings.setValue("audio/inference_timesteps", settings.inference_timesteps)
        self.settings.setValue("audio/output_sample_rate", settings.output_sample_rate)
        self.settings.setValue("audio/mp3_bitrate", settings.mp3_bitrate)
        self.settings.sync()
        self.status.setText("บันทึกการตั้งค่าแล้ว งานใหม่จะใช้ค่านี้")

    def render_settings(self) -> RenderSettings:
        return RenderSettings.from_wire({
            "inference_timesteps": self.timesteps.currentData(),
            "output_sample_rate": self.sample_rate.currentData(),
            "mp3_bitrate": self.bitrate.currentData(),
        })

    def preview(self) -> None:
        if self.preview_thread is not None or self.renderer is None:
            return
        text = self.preview_text.toPlainText().strip()
        if not text:
            self.status.setText("กรุณาใส่ข้อความก่อนสร้างเสียงตัวอย่าง")
            return
        if self.jobs_page is not None and self.jobs_page.thread is not None and self.jobs_page.thread.isRunning():
            self.status.setText("รอให้งานที่กำลังประมวลผลเสร็จก่อน จึงจะฟังตัวอย่างได้")
            return
        self.preview_button.setEnabled(False)
        self.preview_button.setText("กำลังสร้างตัวอย่าง...")
        self.stop_preview_button.setVisible(True)
        self.preview_progress.setValue(0)
        self.preview_progress.setVisible(True)
        self.status.setText("กำลังสร้างตัวอย่างด้วยค่าที่เลือก")
        self.preview_thread = PreviewRenderThread(self.renderer, self.render_settings(), self.voice.currentData(), text)
        self.preview_thread.progress_updated.connect(self._set_preview_progress)
        self.preview_thread.succeeded.connect(self._preview_ready)
        self.preview_thread.failed.connect(self._preview_failed)
        self.preview_thread.finished.connect(self._preview_finished)
        self.preview_thread.start()

    def _set_preview_progress(self, done: int, total: int) -> None:
        percent = round(done * 100 / total) if total else 0
        self.preview_progress.setValue(percent)
        self.status.setText(f"กำลังสร้างเสียงตัวอย่าง {done}/{total} ช่วง ({percent}%)")

    def stop_preview(self) -> None:
        self.player.stop()
        self.preview_progress.setVisible(False)
        self.stop_preview_button.setVisible(False)
        self.status.setText("หยุดเสียงตัวอย่างแล้ว")

    def _preview_ready(self, output: str) -> None:
        self.preview_progress.setValue(100)
        self.player.setSource(QUrl.fromLocalFile(output))
        self.player.play()
        self.status.setText("กำลังเล่นเสียงตัวอย่าง")

    def _preview_failed(self, message: str) -> None:
        self.preview_progress.setVisible(False)
        self.stop_preview_button.setVisible(False)
        self.status.setText(f"สร้างเสียงตัวอย่างไม่สำเร็จ: {message}")

    def _preview_finished(self) -> None:
        if self.preview_thread is not None:
            self.preview_thread.deleteLater()
        self.preview_thread = None
        self.preview_button.setEnabled(True)
        self.preview_button.setText("ทดสอบ")


class RenderThread(QThread):
    started_job = Signal(str, str, str, str); progress = Signal(int, int, float); succeeded = Signal(str); failed = Signal(str); cancelled = Signal(); idle = Signal()
    job_completed = Signal(str)
    pipeline_status = Signal(str)
    def __init__(self, client: ApiClient, worker_id: str, renderer: VoxCpmRenderer, settings: RenderSettings) -> None:
        super().__init__(); self.client = client; self.worker_id = worker_id; self.renderer = renderer; self.settings = settings; self.started_at = 0.0; self.cancel_requested = Event()
        self.job_id: str | None = None
        self.last_status_poll = 0.0

    def request_cancel(self) -> None:
        self.cancel_requested.set()

    def _raise_if_cancelled(self) -> None:
        if self.cancel_requested.is_set():
            raise RenderCancelled()
        now = time.monotonic()
        if self.job_id and now - self.last_status_poll >= JOB_STATUS_POLL_SECONDS:
            self.last_status_poll = now
            status = self.client.job_status(self.job_id)
            performance_logger().info("job=%s status_poll_seconds=%.3f", self.job_id, time.monotonic() - now)
            if status == TTS_JOB_STATUS["CANCELLED"]:
                self.cancel_requested.set()
                raise RenderCancelled()

    def run(self) -> None:
        # Own the pooled API session until both rendering and uploading stop.
        original_client = self.client
        try:
            with ApiClient(original_client.base_url, original_client.access_token) as client:
                self.client = client
                self._run_pipeline()
        except Exception as error:
            self.failed.emit(f"{type(error).__name__}: {error}")

    def _settle_error(self, job: dict | None, error: Exception) -> str | None:
        if job is not None:
            try:
                status = self.client.job_status(job["id"])
                if status in (TTS_JOB_STATUS["CANCELLED"], TTS_JOB_STATUS["DONE"]):
                    return None
            except (ApiError, httpx.HTTPError):
                pass
        if isinstance(error, RenderCancelled):
            if job is not None:
                try:
                    self.client.cancel_job(job["id"], self.worker_id)
                except Exception as status_error:
                    return f"หยุดงานแล้ว แต่บันทึกสถานะยกเลิกไม่สำเร็จ: {status_error}"
            return None
        message = f"{type(error).__name__}: {error}"
        if job is not None:
            try:
                self.client.fail_job(job["id"], self.worker_id, message)
            except Exception as status_error:
                message += f" | บันทึกสถานะงานไม่สำเร็จ: {status_error}"
        return message

    @staticmethod
    def _remove_output(output: Path | None) -> None:
        if output is None:
            return
        # Delete only the renderer's known output, never a recursive directory.
        output = output.resolve()
        if (output.name != "full.mp3" or not output.parent.name.startswith("readji-tts-")
                or output.parent.parent != Path(tempfile.gettempdir()).resolve()):
            return
        try:
            output.unlink(missing_ok=True)
            output.parent.rmdir()
        except OSError:
            performance_logger().info("temporary output cleanup deferred")

    def _upload_job(self, job: dict, output: Path, duration: float, timeline: list[dict], http: httpx.Client) -> str | None:
        last_poll = 0.0

        def check_cancel() -> None:
            nonlocal last_poll
            if self.cancel_requested.is_set():
                raise RenderCancelled()
            now = time.monotonic()
            if now - last_poll >= JOB_STATUS_POLL_SECONDS:
                last_poll = now
                if self.client.job_status(job["id"]) == TTS_JOB_STATUS["CANCELLED"]:
                    raise RenderCancelled()

        def data():
            with output.open("rb") as stream:
                while True:
                    check_cancel()
                    block = stream.read(256 * 1024)
                    if not block:
                        return
                    yield block

        try:
            check_cancel()
            started = time.monotonic()
            upload = self.client.upload_url(job["id"], self.worker_id)
            performance_logger().info("job=%s upload_url_seconds=%.3f", job["id"], time.monotonic() - started)
            started = time.monotonic()
            # Storage requests have no API Authorization header. Reuse their own pool.
            response = http.put(upload["upload_url"], content=data(), headers={
                "Content-Type": "audio/mpeg", "Content-Length": str(output.stat().st_size),
            })
            response.raise_for_status()
            performance_logger().info("job=%s upload_seconds=%.3f", job["id"], time.monotonic() - started)
            check_cancel()
            started = time.monotonic()
            self.client.complete_job(job["id"], self.worker_id, duration, timeline)
            performance_logger().info("job=%s complete_seconds=%.3f", job["id"], time.monotonic() - started)
            self.job_completed.emit(job["id"])
            return None
        except Exception as error:
            self.cancel_requested.set()
            performance_logger().info("job=%s upload_stopped error_type=%s", job["id"], type(error).__name__)
            return self._settle_error(job, error)
        finally:
            self._remove_output(output)

    def _run_pipeline(self) -> None:
        job = None
        output = None
        pending = None
        errors = []
        exhausted = False
        logger = performance_logger()
        pipeline_started = time.monotonic()
        try:
            verify_ffmpeg()
            with httpx.Client(timeout=120, limits=httpx.Limits(
                max_connections=1, max_keepalive_connections=1, keepalive_expiry=120,
            )) as http, ThreadPoolExecutor(max_workers=1, thread_name_prefix="tts-upload") as uploader:
                try:
                    while True:
                        self._raise_if_cancelled()
                        started = time.monotonic()
                        job = self.client.claim_job(self.worker_id)
                        logger.info("claim_seconds=%.3f", time.monotonic() - started)
                        if job is None:
                            exhausted = True
                            break
                        self.job_id = job["id"]
                        self.last_status_poll = 0.0
                        self._raise_if_cancelled()
                        self.started_at = time.monotonic()
                        self.started_job.emit(job["chapter_id"], f"{job['story_title']} — {job['chapter_title']}", job["id"], job["voice_slot"])
                        logger.info("job=%s render_started", job["id"])
                        output, duration, timeline = self.renderer.render(
                            job["text"], job["voice_slot"], self.settings,
                            lambda done, total: self._progress(job["id"], done, total),
                            check_cancel=self._raise_if_cancelled,
                        )
                        logger.info("job=%s render_seconds=%.3f audio_seconds=%.3f", job["id"], time.monotonic() - self.started_at, duration)
                        self._raise_if_cancelled()
                        # Do not claim another chapter while one upload and one
                        # rendered output are outstanding. Poll cancellation while waiting.
                        if pending is not None:
                            if not pending.done():
                                self.pipeline_status.emit("สร้างเสียงตอนนี้แล้ว กำลังรออัปโหลดตอนก่อนหน้า...")
                            while True:
                                self._raise_if_cancelled()
                                try:
                                    message = pending.result(timeout=0.2)
                                    break
                                except FutureTimeoutError:
                                    continue
                            pending = None
                            if message:
                                errors.append(message)
                            self._raise_if_cancelled()
                        pending = uploader.submit(self._upload_job, job, output, duration, timeline, http)
                        job = None
                        output = None
                        self.job_id = None
                except Exception as error:
                    self.cancel_requested.set()
                    message = self._settle_error(job, error)
                    if message:
                        errors.append(message)
                    self._remove_output(output)
                finally:
                    # QThread stays alive until the upload has persisted its final
                    # status, so shutdown/logout cannot abandon an owned job.
                    if pending is not None:
                        if exhausted and not self.cancel_requested.is_set():
                            self.pipeline_status.emit("สร้างเสียงครบแล้ว กำลังรออัปโหลดตอนสุดท้าย...")
                        message = pending.result()
                        if message:
                            errors.append(message)
        except Exception as error:
            self.cancel_requested.set()
            errors.append(f"{type(error).__name__}: {error}")
        logger.info("pipeline_seconds=%.3f errors=%d cancelled=%s", time.monotonic() - pipeline_started, len(errors), self.cancel_requested.is_set())
        if errors:
            self.failed.emit(" | ".join(errors))
        elif self.cancel_requested.is_set():
            self.cancelled.emit()
        elif exhausted:
            self.idle.emit()
    def _progress(self, job_id: str, done: int, total: int) -> None:
        self._raise_if_cancelled()
        if done % PROGRESS_REPORT_INTERVAL == 0 or done == total:
            started = time.monotonic()
            self.client.update_progress(job_id, self.worker_id, done, total)
            performance_logger().info("job=%s progress_api_seconds=%.3f done=%d total=%d", job_id, time.monotonic() - started, done, total)
        elapsed = time.monotonic() - self.started_at
        remaining = (elapsed / done) * (total - done) if done else 0.0
        self.progress.emit(done, total, remaining)


class LogoutThread(QThread):
    completed = Signal()

    def run(self) -> None:
        clear_refresh_token()
        self.completed.emit()


class RenderCancelled(RuntimeError):
    pass


class CancelAllJobsThread(QThread):
    def __init__(self, client: ApiClient) -> None:
        super().__init__()
        self.client = client
        self.error_message: str | None = None

    def run(self) -> None:
        try:
            self.client.cancel_all_jobs()
        except Exception as error:
            self.error_message = str(error)


class QueueJobThread(QThread):
    def __init__(self, client: ApiClient, chapter: dict, voice: str, parent: QWidget) -> None:
        super().__init__(parent)
        self.client = client
        self.chapter_id = chapter["chapter_id"]
        self.voice = voice
        self.previous = {key: chapter.get(key) for key in (
            "latest_job_status", "latest_job_id", "latest_voice_slot", "latest_progress",
        )}
        self.result: dict | None = None
        self.error_message: str | None = None

    def run(self) -> None:
        try:
            self.result = self.client.queue_job(self.chapter_id, self.voice)
        except Exception as error:
            self.error_message = str(error)


class JobsPage(QWidget):
    signed_out = Signal()
    logout_started = Signal()
    shutdown_complete = Signal()
    def __init__(self, settings: QSettings) -> None:
        super().__init__(); self.settings = settings; self.client: ApiClient | None = None; self.worker_id = settings.value("worker_id", "") or str(uuid.uuid4()); settings.setValue("worker_id", self.worker_id); self.thread: RenderThread | None = None; self.logout_thread: LogoutThread | None = None; self.model_download_dialog: ModelDownloadDialog | None = None; self.renderer: VoxCpmRenderer | None = None; self.preload_thread: ModelPreloadThread | None = None; self.model_ready = False; self.rendering_chapter_id: str | None = None; self.shutdown_requested = False
        self.page = 1
        self.total_pages = 0
        self.rendering_job_id: str | None = None
        self.rendering_progress = 0
        self.cancel_all_thread: CancelAllJobsThread | None = None
        self.cancelling_all = False
        self.queue_threads: dict[str, QueueJobThread] = {}
        # Packaged launches go through the bootstrap, which installs and verifies
        # FFmpeg before this process starts. Keep the development fallback below
        # for direct source launches that bypass the bootstrap.
        self.ffmpeg_ready = bool(os.environ.get("READJI_TTS_RUNTIME_VERSION"))
        self.start_requested = False
        self.model_preparing_dialog: ModelPreparingDialog | None = None
        self.ffmpeg_setup_dialog: FFmpegSetupDialog | None = None
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("""
            JobsPage {{ background: {background}; }}
            QLabel {{ color: {foreground}; background: transparent; }}
        """.format_map(WEB_COLORS))
        layout = QVBoxLayout(self); layout.setContentsMargins(24, 24, 24, 24)
        row = QHBoxLayout(); self.title = SubtitleLabel("ตอนของฉัน"); self.refresh_button = PushButton("รีเฟรช"); self.render_button = PrimaryPushButton("เริ่มประมวลผลคิวทั้งหมด")
        self.refresh_button.clicked.connect(self.refresh_catalog); self.render_button.clicked.connect(self.render_next)
        row.addWidget(self.title); row.addStretch(1)
        for button in (self.refresh_button, self.render_button): row.addWidget(button)
        layout.addLayout(row)
        filters = QHBoxLayout()
        filters.addWidget(BodyLabel("เรื่อง", self))
        self.story_filter = EditableComboBox(self)
        self.story_filter.setMinimumWidth(240)
        self.story_filter.setPlaceholderText("ค้นหาหรือเลือกเรื่อง")
        self.story_completer_model = QStringListModel(self.story_filter)
        self.story_completer = QCompleter(self.story_completer_model, self.story_filter)
        self.story_completer.setCaseSensitivity(Qt.CaseInsensitive)
        self.story_completer.setFilterMode(Qt.MatchContains)
        self.story_completer.setCompletionMode(QCompleter.PopupCompletion)
        self.story_completer.activated[str].connect(self._select_story_from_search)
        self.story_filter.setCompleter(self.story_completer)
        self.story_filter.addItem("เลือกเรื่องก่อนแสดงตอน", userData=None)
        self.story_filter.currentIndexChanged.connect(self._story_changed)
        filters.addWidget(self.story_filter, 1)
        self.audio_status_filter = ComboBox(self)
        self.audio_status_filter.setMinimumWidth(180)
        self.audio_status_filter.addItem("ยังไม่มีเสียง", userData="missing")
        self.audio_status_filter.addItem("ทั้งหมด", userData="all")
        self.audio_status_filter.addItem("มีเสียงแล้ว", userData="available")
        self.audio_status_filter.currentIndexChanged.connect(self._audio_status_changed)
        filters.addWidget(self.audio_status_filter)
        self.sort_filter = ComboBox(self)
        self.sort_filter.setMinimumWidth(190)
        self.sort_filter.addItem("ลำดับตอน: น้อยไปมาก", userData="chapter_asc")
        self.sort_filter.addItem("ลำดับตอน: มากไปน้อย", userData="chapter_desc")
        self.sort_filter.addItem("ชื่อตอน: A–Z", userData="title_asc")
        self.sort_filter.addItem("ชื่อตอน: Z–A", userData="title_desc")
        self.sort_filter.currentIndexChanged.connect(self._sort_changed)
        filters.addWidget(self.sort_filter)
        self.cancel_all_button = PushButton("ยกเลิกงานทั้งหมด", self)
        self.cancel_all_button.clicked.connect(self.cancel_all_jobs)
        filters.addWidget(self.cancel_all_button)
        layout.addLayout(filters)
        self.table = TableView(self); self.chapters_model = ChaptersTableModel(self.table); self.table_delegate = ChapterTableDelegate(self.table); self.table.setModel(self.chapters_model); self.table.setItemDelegate(self.table_delegate); self.table_delegate.action_clicked.connect(self.queue)
        self.table.setShowGrid(False); self.table.setAlternatingRowColors(True); self.table.verticalHeader().setVisible(False); self.table.verticalHeader().setDefaultSectionSize(58)
        self.table.horizontalHeader().setDefaultAlignment(Qt.AlignVCenter | Qt.AlignLeft)
        for column in range(self.chapters_model.columnCount()): self.table.horizontalHeader().setSectionResizeMode(column, QHeaderView.Fixed)
        self.table.setCheckedColor(WEB_COLORS["accent"], WEB_COLORS["accent"])
        self.table.setStyleSheet("""
            QTableView {{
                background: {card}; color: {foreground};
                border: 1px solid {border}; border-radius: 16px;
                alternate-background-color: {muted};
                selection-background-color: {accent}; selection-color: {foreground};
            }}
            QTableView::item {{ border: none; }}
            QHeaderView::section {{
                background: {background}; color: {muted_foreground};
                border: none; border-bottom: 1px solid {border};
                font-weight: 600; padding: 12px;
            }}
            QTableCornerButton::section {{ background: {background}; border: none; }}
        """.format_map(WEB_COLORS))
        layout.addWidget(self.table, 1)
        pagination = QHBoxLayout()
        self.page_label = BodyLabel("กรุณาเลือกเรื่อง", self)
        self.first_button = PushButton("หน้าแรก", self)
        self.previous_button = PushButton("ก่อนหน้า", self)
        self.page_picker = QSpinBox(self)
        self.page_picker.setMinimumWidth(88)
        self.page_picker.setLocale(QLocale(QLocale.Language.English, QLocale.Country.UnitedStates))
        self.page_picker.setRange(1, 1)
        self.page_picker.setEnabled(False)
        self.page_picker.valueChanged.connect(self._go_to_page)
        self.next_button = PushButton("ถัดไป", self)
        self.last_button = PushButton("หน้าสุดท้าย", self)
        self.first_button.clicked.connect(lambda: self._go_to_page(1))
        self.previous_button.clicked.connect(lambda: self._change_page(-1))
        self.next_button.clicked.connect(lambda: self._change_page(1))
        self.last_button.clicked.connect(lambda: self._go_to_page(self.total_pages))
        pagination.addWidget(self.page_label)
        pagination.addStretch(1)
        pagination.addWidget(self.first_button)
        pagination.addWidget(self.previous_button)
        pagination.addWidget(self.page_picker)
        pagination.addWidget(self.next_button)
        pagination.addWidget(self.last_button)
        layout.addLayout(pagination)
        self._update_pagination(0)
        self.progress = ProgressBar(self)
        self.status_icon = QLabel("✓", self)
        self.status_icon.setStyleSheet("color: #16a34a; font-size: 18px; font-weight: 700; background: transparent;")
        self.status_icon.hide()
        self.status = BodyLabel("กำลังรอเตรียมโมเดลเสียง", self)
        status_row = QHBoxLayout()
        status_row.setContentsMargins(0, 0, 0, 0)
        status_row.setSpacing(6)
        status_row.addWidget(self.status_icon)
        status_row.addWidget(self.status)
        status_row.addStretch(1)
        layout.addWidget(self.progress)
        layout.addLayout(status_row)
        self.progress.setCustomBarColor(WEB_COLORS["primary"], WEB_COLORS["primary"])
        for control in (self.refresh_button, self.render_button, self.story_filter,
                        self.cancel_all_button, self.first_button, self.previous_button, self.next_button, self.last_button):
            setCustomStyleSheet(control, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
        for control in (self.audio_status_filter, self.sort_filter):
            setCustomStyleSheet(control, WEB_CONTROL_STYLE, WEB_CONTROL_STYLE)
        for label in (self.page_label, self.status):
            label.setStyleSheet(f"color: {WEB_COLORS['muted_foreground']}; background: transparent;")

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._resize_table_columns()

    def _show_ready_status(self) -> None:
        self.status_icon.show()
        self.status.setStyleSheet("color: #16a34a; background: transparent;")
        self.status.setText("พร้อมใช้งาน")

    def _hide_ready_status(self) -> None:
        self.status_icon.hide()
        self.status.setStyleSheet(f"color: {WEB_COLORS['muted_foreground']}; background: transparent;")

    def _resize_table_columns(self) -> None:
        available = max(self.table.viewport().width(), 1)
        proportions = (0.22, 0.25, 0.08, 0.16, 0.14, 0.15)
        widths = [int(available * proportion) for proportion in proportions]
        widths[-1] += available - sum(widths)
        for column, width in enumerate(widths):
            self.table.setColumnWidth(column, width)

    def set_renderer(self, renderer: VoxCpmRenderer) -> None:
        self.renderer = renderer

    def render_settings(self) -> RenderSettings:
        try:
            return RenderSettings.from_wire({
                "inference_timesteps": int(self.settings.value("audio/inference_timesteps", 8)),
                "output_sample_rate": int(self.settings.value("audio/output_sample_rate", 48_000)),
                "mp3_bitrate": str(self.settings.value("audio/mp3_bitrate", "96k")),
            })
        except (TypeError, ValueError, RenderError):
            return RenderSettings()

    def preload_model(self) -> None:
        if self.shutdown_requested or not self.renderer or self.preload_thread is not None:
            return
        self._hide_ready_status()
        if not is_voxcpm_model_cached():
            if self.model_download_dialog is not None and self.model_download_dialog.thread.isRunning():
                self.model_download_dialog.show()
                return
            self.render_button.setEnabled(False)
            self.status.setText("กำลังดาวน์โหลด VoxCPM2 เพื่อเตรียมใช้งานครั้งแรก...")
            self.model_download_dialog = ModelDownloadDialog(self)
            self.model_download_dialog.ready.connect(self.preload_model)
            self.model_download_dialog.thread.failed.connect(self._model_preload_failed)
            self.model_download_dialog.rejected.connect(self._cancel_pending_start)
            self.model_download_dialog.finished.connect(self._model_download_finished)
            self.model_download_dialog.start()
            return
        self.model_ready = False
        self.render_button.setEnabled(not self.start_requested and not self.cancelling_all)
        mode = " และ warm-up โดยใช้ cache บนดิสก์เมื่อมีผล compile ที่เข้ากันได้" if self.renderer.compile_enabled else ""
        self.status.setText(f"กำลังโหลด VoxCPM2 จากดิสก์เข้า GPU{mode}...")
        self.preload_thread = ModelPreloadThread(self.renderer)
        self.preload_thread.finished.connect(self._model_preload_finished)
        self.preload_thread.start()

    def _model_preload_finished(self) -> None:
        thread = self.preload_thread
        if thread is None:
            return
        message = thread.error_message
        self.preload_thread = None
        thread.deleteLater()
        if self.shutdown_requested:
            return
        if message is not None:
            self._model_preload_failed(message)
        else:
            self._model_preloaded()

    def _model_preloaded(self) -> None:
        self.model_ready = True
        self.render_button.setEnabled(not self.cancelling_all)
        self._show_ready_status()
        if self.model_preparing_dialog is not None:
            self.model_preparing_dialog.accept()
        if self.ffmpeg_setup_dialog is not None and self.ffmpeg_setup_dialog.isVisible():
            self.ffmpeg_setup_dialog.accept()
        self._continue_start()

    def _model_preload_failed(self, message: str) -> None:
        self._cancel_pending_start()
        if self.model_preparing_dialog is not None:
            self.model_preparing_dialog.accept()
        if self.ffmpeg_setup_dialog is not None and self.ffmpeg_setup_dialog.isVisible():
            self.ffmpeg_setup_dialog.accept()
        self.model_ready = False
        self.render_button.setEnabled(not self.cancelling_all)
        self._hide_ready_status()
        self.status.setText("เตรียมโมเดลเสียงไม่สำเร็จ")
        InfoBar.error("โหลด VoxCPM2 ไม่สำเร็จ", message, parent=self, position=InfoBarPosition.TOP)
    def set_client(self, client: ApiClient, name: str) -> None:
        self.client = client
        self.chapters_model.selected_voices.clear()
        self.title.setText("ตอนที่ยังไม่มีเสียง")
        self.story_filter.blockSignals(True)
        self.story_filter.clear()
        self.story_filter.addItem("เลือกเรื่องก่อนแสดงตอน", userData=None)
        self.story_filter.blockSignals(False)
        self.page = 1
        self.total_pages = 0
        self.chapters_model.replace([])
        self._update_pagination(0)
        self.refresh_catalog()

    def refresh_catalog(self) -> None:
        if not self.client: return
        selected = self.story_filter.currentData()
        try:
            stories = self.client.list_stories()
            self.story_filter.blockSignals(True)
            self.story_filter.clear()
            self.story_filter.addItem("เลือกเรื่องก่อนแสดงตอน", userData=None)
            for story in stories:
                self.story_filter.addItem(story["title"], userData=story["id"])
            self.story_completer_model.setStringList([story["title"] for story in stories])
            index = self.story_filter.findData(selected) if selected else -1
            self.story_filter.setCurrentIndex(index if index > 0 else (1 if stories else 0))
            self.story_filter.blockSignals(False)
            if self.story_filter.currentData() != selected:
                self.page = 1
            self.load_chapters()
        except ApiUnauthorizedError:
            self.logout()
        except (ApiError, httpx.HTTPError) as error:
            InfoBar.error("โหลดรายชื่อเรื่องไม่สำเร็จ", str(error), parent=self, position=InfoBarPosition.TOP)

    def _story_changed(self, _index: int) -> None:
        self.page = 1
        self.load_chapters()

    def _select_story_from_search(self, title: str) -> None:
        index = self.story_filter.findText(title)
        if index >= 0:
            self.story_filter.setCurrentIndex(index)

    def _audio_status_changed(self, _index: int) -> None:
        self.page = 1
        self.load_chapters()

    def _sort_changed(self, _index: int) -> None:
        self.page = 1
        self.load_chapters()

    def _change_page(self, delta: int) -> None:
        self._go_to_page(self.page + delta)

    def _go_to_page(self, page: int) -> None:
        if not self.total_pages:
            return
        target = max(1, min(page, self.total_pages))
        if target == self.page:
            return
        self.page = target
        self.load_chapters()

    def _update_pagination(self, total: int) -> None:
        has_pages = self.total_pages > 0
        self.first_button.setEnabled(has_pages and self.page > 1)
        self.previous_button.setEnabled(has_pages and self.page > 1)
        self.next_button.setEnabled(has_pages and self.page < self.total_pages)
        self.last_button.setEnabled(has_pages and self.page < self.total_pages)
        self.page_picker.blockSignals(True)
        self.page_picker.setRange(1, max(1, self.total_pages))
        self.page_picker.setValue(max(1, min(self.page, max(1, self.total_pages))))
        self.page_picker.blockSignals(False)
        self.page_picker.setEnabled(has_pages)
        if not self.story_filter.currentData():
            self.page_label.setText("กรุณาเลือกเรื่องก่อนแสดงตอน")
        elif not total:
            self.page_label.setText("ไม่มีตอนที่ตรงกับสถานะเสียงที่เลือกในเรื่องนี้")
        else:
            first_item = (self.page - 1) * CHAPTER_PAGE_SIZE + 1
            last_item = min(self.page * CHAPTER_PAGE_SIZE, total)
            self.page_label.setText(f"แสดง {first_item}–{last_item} จาก {total:,} ตอน · หน้า {self.page}/{self.total_pages}")

    def load_chapters(self) -> None:
        if not self.client: return
        self.chapters_model.replace([])
        story_id = self.story_filter.currentData()
        if not story_id:
            self.total_pages = 0
            self._update_pagination(0)
            return
        try:
            audio_status = self.audio_status_filter.currentData()
            sort_by = self.sort_filter.currentData()
            result = self.client.list_chapters(story_id, audio_status, sort_by, self.page, CHAPTER_PAGE_SIZE)
            self.total_pages = result["pagination"]["total_pages"]
            if self.page > max(1, self.total_pages):
                self.page = max(1, self.total_pages)
                result = self.client.list_chapters(story_id, audio_status, sort_by, self.page, CHAPTER_PAGE_SIZE)
            self.total_pages = result["pagination"]["total_pages"]
            for item in result["items"]:
                if (item.get("latest_job_id") == self.rendering_job_id
                        and item.get("latest_job_status") == TTS_JOB_STATUS["PROCESSING"]):
                    item["latest_progress"] = max(item.get("latest_progress") or 0, self.rendering_progress)
                pending = self.queue_threads.get(item["chapter_id"])
                if pending and item.get("latest_job_id") == pending.previous["latest_job_id"]:
                    item.update({"latest_job_status": TTS_JOB_STATUS["QUEUED"],
                                 "latest_voice_slot": pending.voice, "latest_progress": 0, "_queue_pending": True})
            self.chapters_model.replace(result["items"])
            self._update_pagination(result["pagination"]["total"])
            self._resize_table_columns()
            for row in range(self.chapters_model.rowCount()):
                index = self.chapters_model.index(row, TABLE_COLUMN["VOICE"])
                if self.chapters_model.flags(index) & Qt.ItemFlag.ItemIsEditable:
                    self.table.openPersistentEditor(index)
            QTimer.singleShot(0, self._resize_table_columns)
            self.table.viewport().update()
        except ApiUnauthorizedError:
            self.logout()
        except (ApiError, httpx.HTTPError) as error:
            self.total_pages = 0
            self._update_pagination(0)
            self.page_label.setText("โหลดรายการไม่สำเร็จ กรุณากดรีเฟรช")
            InfoBar.error("โหลดรายการไม่สำเร็จ", str(error), parent=self, position=InfoBarPosition.TOP)
    def queue(self, chapter_id: str) -> None:
        if not self.client or self.cancelling_all or self.shutdown_requested or self.logout_thread is not None or chapter_id in self.queue_threads: return
        chapter = next((item for item in self.chapters_model.chapters if item["chapter_id"] == chapter_id), None)
        if chapter is None or chapter.get("latest_job_status") in (TTS_JOB_STATUS["QUEUED"], TTS_JOB_STATUS["PROCESSING"]):
            return
        voice = self.chapters_model.voice_for(chapter)
        thread = QueueJobThread(self.client, chapter, voice, self)
        self.queue_threads[chapter_id] = thread
        self.chapters_model.selected_voices[chapter_id] = voice
        row = next(row for row, item in enumerate(self.chapters_model.chapters) if item["chapter_id"] == chapter_id)
        self.table.closePersistentEditor(self.chapters_model.index(row, TABLE_COLUMN["VOICE"]))
        self.chapters_model.update_chapter(chapter_id, {
            "latest_job_status": TTS_JOB_STATUS["QUEUED"], "latest_voice_slot": voice,
            "latest_progress": 0, "_queue_pending": True,
        })
        thread.finished.connect(self._queue_job_finished)
        thread.start()

    def _queue_job_finished(self) -> None:
        thread = self.sender()
        if not isinstance(thread, QueueJobThread):
            return
        chapter_id = thread.chapter_id
        self.queue_threads.pop(chapter_id, None)
        chapter = next((item for item in self.chapters_model.chapters if item["chapter_id"] == chapter_id), None)
        if thread.error_message:
            self._cancel_pending_start()
            if chapter and chapter.get("_queue_pending"):
                row = self.chapters_model.update_chapter(chapter_id, {**thread.previous, "_queue_pending": False})
                if row is not None:
                    self.table.openPersistentEditor(self.chapters_model.index(row, TABLE_COLUMN["VOICE"]))
            if not self.shutdown_requested:
                InfoBar.error("เพิ่มงานไม่สำเร็จ", f"คืนสถานะแถวแล้ว: {thread.error_message}", parent=self, position=InfoBarPosition.TOP)
        elif thread.result is not None:
            # A refresh may already show a more recent processing/done state.
            if chapter and chapter.get("_queue_pending"):
                self.chapters_model.update_chapter(chapter_id, {
                    "latest_job_status": thread.result["status"], "latest_job_id": thread.result["id"],
                    "latest_voice_slot": thread.result["voice_slot"], "_queue_pending": False,
                })
            self.chapters_model.selected_voices.pop(chapter_id, None)
            if not self.shutdown_requested and not self.cancelling_all:
                InfoBar.success("เพิ่มเข้าคิวแล้ว", f"เสียง{VOICE_LABELS[thread.voice]}", parent=self, position=InfoBarPosition.TOP)
        thread.deleteLater()
        if self.cancelling_all and not self.queue_threads and self.cancel_all_thread is None:
            self._start_cancel_all_request()
        elif not self.queue_threads:
            self._continue_start()
    def render_next(self) -> None:
        if self.shutdown_requested or self.cancelling_all or self.logout_thread is not None or not self.client or self.thread is not None: return
        self.start_requested = True
        self._continue_start()

    def _continue_start(self) -> None:
        if not self.start_requested or self.shutdown_requested or self.cancelling_all or self.logout_thread is not None or not self.client:
            return
        if self.thread is not None:
            return
        self.render_button.setEnabled(False)
        if self.queue_threads:
            self.status.setText("กำลังรอ API ยืนยันคิว แล้วจะเริ่มงานอัตโนมัติ...")
            return
        if not self.ffmpeg_ready:
            if self.ffmpeg_setup_dialog is not None and self.ffmpeg_setup_dialog.isVisible():
                self.ffmpeg_setup_dialog.raise_()
                return
            self.render_button.setEnabled(False)
            if self.ffmpeg_setup_dialog is not None:
                self.ffmpeg_setup_dialog.deleteLater()
            self.ffmpeg_setup_dialog = FFmpegSetupDialog(self.window())
            self.ffmpeg_setup_dialog.ready.connect(self._ffmpeg_ready)
            self.ffmpeg_setup_dialog.setup_failed.connect(self._cancel_pending_start)
            self.ffmpeg_setup_dialog.finished.connect(self._ffmpeg_setup_finished)
            self.ffmpeg_setup_dialog.start()
            return
        if not self.model_ready or not self.renderer or not self.renderer.is_ready:
            if self.ffmpeg_setup_dialog is not None and self.ffmpeg_setup_dialog.isVisible():
                self.ffmpeg_setup_dialog.show_model_preparing()
            else:
                if self.model_preparing_dialog is None:
                    self.model_preparing_dialog = ModelPreparingDialog(self.window())
                    self.model_preparing_dialog.rejected.connect(self._cancel_pending_start)
                self.model_preparing_dialog.show()
            self.preload_model()
            return
        # Keep the request active until the queue is empty or processing stops.
        if self.ffmpeg_setup_dialog is not None and self.ffmpeg_setup_dialog.isVisible():
            self.ffmpeg_setup_dialog.accept()
        self._begin_render()

    def _cancel_pending_start(self) -> None:
        self.start_requested = False
        self.render_button.setEnabled(not self.shutdown_requested and not self.cancelling_all and not (self.thread and self.thread.isRunning()))

    def _ffmpeg_ready(self) -> None:
        self.ffmpeg_ready = True
        self._continue_start()

    def _ffmpeg_setup_finished(self, result: int) -> None:
        if result == QDialog.DialogCode.Rejected:
            self._cancel_pending_start()

    def _model_download_finished(self) -> None:
        if not is_voxcpm_model_cached():
            self.render_button.setEnabled(True)

    def _begin_render(self) -> None:
        if self.cancelling_all or not self.client or not self.renderer or (self.thread and self.thread.isRunning()): return
        self._hide_ready_status()
        self.rendering_chapter_id = None
        self.rendering_job_id = None
        self.rendering_progress = 0
        self.thread = RenderThread(self.client, self.worker_id, self.renderer, self.render_settings())
        self.thread.job_completed.connect(self._job_uploaded)
        self.thread.pipeline_status.connect(self.status.setText)
        self.thread.started_job.connect(self._started_job); self.thread.progress.connect(self._set_progress)
        self.thread.idle.connect(self._queue_empty); self.thread.succeeded.connect(lambda msg: self._finished(msg, True)); self.thread.failed.connect(lambda msg: self._finished(msg, False)); self.thread.cancelled.connect(self._render_cancelled)
        self.render_button.setEnabled(False); self.thread.finished.connect(self._render_thread_finished); self.thread.start()
    def _job_uploaded(self, job_id: str) -> None:
        # An older chapter may finish uploading while the next is rendering.
        # Refresh persisted rows without resetting the active chapter's progress.
        if not self.shutdown_requested:
            self.load_chapters()

    def _started_job(self, chapter_id: str, title: str, job_id: str, voice: str) -> None:
        self.rendering_chapter_id = chapter_id
        self.rendering_job_id = job_id
        self.rendering_progress = 0
        # This event is emitted only after the API successfully claims the job.
        # Update the existing row on the UI thread without resetting the table.
        for row, chapter in enumerate(self.chapters_model.chapters):
            if chapter["chapter_id"] == chapter_id:
                self.table.closePersistentEditor(self.chapters_model.index(row, TABLE_COLUMN["VOICE"]))
                self.chapters_model.update_chapter(chapter_id, {
                    "latest_job_id": job_id,
                    "latest_job_status": TTS_JOB_STATUS["PROCESSING"],
                    "latest_voice_slot": voice,
                    "latest_progress": 0,
                    "_queue_pending": False,
                })
                break
        self.status.setText(f"กำลังสร้างเสียง: {title} | กำลังคำนวณเวลาโดยประมาณ...")

    @staticmethod
    def _format_duration(seconds: float) -> str:
        rounded = max(0, round(seconds))
        minutes, seconds = divmod(rounded, 60)
        return f"{minutes} นาที {seconds:02d} วินาที" if minutes else f"{seconds} วินาที"

    def _set_progress(self, done: int, total: int, remaining: float) -> None:
        if self.cancelling_all or self.shutdown_requested:
            return
        self.rendering_progress = round(done * 100 / total) if total else 0
        for chapter in self.chapters_model.chapters:
            if (chapter["chapter_id"] == self.rendering_chapter_id
                    and chapter.get("latest_job_id") == self.rendering_job_id
                    and chapter.get("latest_job_status") == TTS_JOB_STATUS["PROCESSING"]):
                self.chapters_model.update_chapter(chapter["chapter_id"], {"latest_progress": self.rendering_progress})
                break
        self.progress.setValue(self.rendering_progress)
        self.status.setText(f"กำลังสร้างเสียง {done}/{total} ช่วง | คาดว่าจะเสร็จใน {self._format_duration(remaining)}")

    def cancel_all_jobs(self) -> None:
        if not self.client or self.cancelling_all:
            return
        dialog = MessageBox(
            "ยกเลิกงานทั้งหมด?",
            "ยกเลิกงานที่รอคิวและกำลังแปลงทั้งหมดของบัญชีนี้ ทุกเรื่องและทุกหน้า\n"
            "รวมถึงงานบน Agent เครื่องอื่น โดยไม่ลบเสียงที่สร้างเสร็จแล้ว",
            self.window(),
        )
        dialog.yesButton.setText("ยืนยันยกเลิกงานทั้งหมด")
        dialog.cancelButton.setText("กลับ")
        if not dialog.exec():
            return
        self._cancel_pending_start()
        self.cancelling_all = True
        self.cancel_all_button.setEnabled(False)
        self.cancel_all_button.setText("กำลังยกเลิก...")
        self.render_button.setEnabled(False)
        self.table.setEnabled(False)
        self.status.setText("กำลังหยุดการแปลงและยกเลิกงานทั้งหมด...")
        if self.thread and self.thread.isRunning():
            self.thread.request_cancel()
        if self.queue_threads:
            self.status.setText("กำลังรอคำขอเข้าคิวที่ส่งไปแล้ว ก่อนยกเลิกทั้งหมด...")
            return
        self._start_cancel_all_request()

    def _start_cancel_all_request(self) -> None:
        # Wait for in-flight enqueues, so they cannot recreate jobs after cancel-all.
        self.cancel_all_thread = CancelAllJobsThread(self.client)
        self.cancel_all_thread.finished.connect(self._cancel_all_finished)
        self.cancel_all_thread.start()

    def _cancel_all_finished(self) -> None:
        thread = self.cancel_all_thread
        if thread is None:
            return
        error = thread.error_message
        self.cancel_all_thread = None
        thread.deleteLater()
        if error:
            self.status.setText(f"ยกเลิกงานทั้งหมดไม่สำเร็จ: {error}")
            InfoBar.error("ยกเลิกงานทั้งหมดไม่สำเร็จ", error, parent=self, position=InfoBarPosition.TOP)
        else:
            self.status.setText("ยกเลิกงานในคิวและงานที่กำลังแปลงทั้งหมดแล้ว")
            InfoBar.success("ยกเลิกงานแล้ว", "ไม่ลบเสียงที่สร้างเสร็จแล้ว", parent=self, position=InfoBarPosition.TOP)
        if not self.shutdown_requested:
            self.load_chapters()
        self._finish_cancellation_controls()

    def _finish_cancellation_controls(self) -> None:
        if self.queue_threads or self.cancel_all_thread is not None or (self.thread and self.thread.isRunning()):
            return
        self.cancelling_all = False
        self.cancel_all_button.setText("ยกเลิกงานทั้งหมด")
        self.cancel_all_button.setEnabled(not self.shutdown_requested)
        self.table.setEnabled(not self.shutdown_requested)
        self.render_button.setEnabled(not self.shutdown_requested and self.preload_thread is None)

    def request_shutdown(self) -> bool:
        self.shutdown_requested = True
        self._cancel_pending_start()
        if self.ffmpeg_setup_dialog is not None and self.ffmpeg_setup_dialog.thread is not None:
            self.ffmpeg_setup_dialog.thread.cancel_requested.set()
        if self.thread and self.thread.isRunning():
            self.thread.request_cancel()
        if self.renderer is not None:
            self.renderer.request_shutdown()
        if not self.thread or not self.thread.isRunning():
            return False
        self.render_button.setEnabled(False)
        self.status.setText("กำลังยกเลิกงานและบันทึกสถานะก่อนปิดโปรแกรม...")
        return True

    def _render_cancelled(self) -> None:
        self._cancel_pending_start()
        self.rendering_job_id = None
        self.rendering_chapter_id = None
        self.progress.setValue(0)
        self.status.setText("ยกเลิกงานแล้ว")
        if not self.shutdown_requested:
            self.load_chapters()

    def _render_thread_finished(self) -> None:
        thread = self.thread
        self.thread = None
        if thread is not None:
            thread.deleteLater()
        self.model_ready = self.renderer is not None and self.renderer.is_ready
        self.render_button.setEnabled(not self.shutdown_requested and not self.cancelling_all and not self.start_requested)
        if self.cancelling_all:
            self._finish_cancellation_controls()
        if self.shutdown_requested:
            self.shutdown_complete.emit()
            return
        if getattr(self, "logout_after_pipeline", False):
            self.logout_after_pipeline = False
            self.logout()
            return
        self._continue_start()

    def _queue_empty(self) -> None:
        self._cancel_pending_start()
        self.rendering_job_id = None
        self.rendering_chapter_id = None
        self.progress.setValue(0)
        self.status.setText("ไม่มีงานเหลือในคิวแล้ว")
        if not self.shutdown_requested:
            self._notice("ประมวลผลคิวครบแล้ว", "ไม่มีงานที่รอประมวลผลในคิว")

    def _notice(self, title: str, message: str) -> None: InfoBar.info(title, message, parent=self, position=InfoBarPosition.TOP)
    def _finished(self, message: str, success: bool) -> None:
        self.rendering_job_id = None
        self.rendering_chapter_id = None
        if not success:
            self._cancel_pending_start()
            self.ffmpeg_ready = False
        self.progress.setValue(0); self.status.setText("พร้อมทำงาน" if success else message); (InfoBar.success if success else InfoBar.error)("TTS Agent", message, parent=self, position=InfoBarPosition.TOP)
        if not self.shutdown_requested: self.load_chapters()
    def logout(self) -> None:
        self._cancel_pending_start()
        if self.thread and self.thread.isRunning():
            self.logout_after_pipeline = True
            self.thread.request_cancel()
            self.status.setText("กำลังหยุดสร้างและอัปโหลดเสียงก่อนออกจากระบบ...")
            return
        if self.queue_threads:
            self._notice("กำลังส่งคิว", "กรุณารอให้คำขอเข้าคิวเสร็จก่อนออกจากระบบ")
            return
        if self.cancelling_all:
            self._notice("กำลังยกเลิกงาน", "กรุณารอให้ยกเลิกงานเสร็จก่อนออกจากระบบ")
            return
        if self.logout_thread and self.logout_thread.isRunning():
            return
        self.logout_started.emit()
        self.logout_thread = LogoutThread()
        self.logout_thread.finished.connect(self._logout_completed)
        self.logout_thread.start()

    def _logout_completed(self) -> None:
        if self.logout_thread is not None:
            self.logout_thread.deleteLater()
        self.logout_thread = None
        self.client = None
        self.signed_out.emit()


class MainWindow(FluentWindow):
    def __init__(self) -> None:
        super().__init__(); self.settings = QSettings("Dopapage", "TTS Agent"); self.login_page = LoginPage(); self.jobs_page = JobsPage(self.settings); self.audio_settings_page = AudioSettingsPage(self.settings)
        self.setWindowTitle(f"Dopapage v{RUNTIME_VERSION}" if RUNTIME_VERSION else "Dopapage")
        self.setMicaEffectEnabled(False)
        self.setCustomBackgroundColor(WEB_COLORS["background"], WEB_COLORS["background"])
        navigation_style = """
            NavigationInterface, NavigationPanel {{ background: {card}; border: none; }}
            NavigationPanel[menu=true] {{ border: 1px solid {border}; }}
        """.format_map(WEB_COLORS)
        setCustomStyleSheet(self.navigationInterface, navigation_style, navigation_style)
        setCustomStyleSheet(self.navigationInterface.panel, navigation_style, navigation_style)
        voices_root = application_root() / "assets" / "voices"
        renderer = VoxCpmRenderer(voices_root)
        self.jobs_page.set_renderer(renderer)
        self.audio_settings_page.set_renderer(renderer)
        self.audio_settings_page.set_jobs_page(self.jobs_page)
        self.login_page.setObjectName("login-page"); self.jobs_page.setObjectName("jobs-page"); self.addSubInterface(self.login_page, FluentIcon.PEOPLE, "เข้าสู่ระบบ")
        self.login_added = True; self.jobs_added = False; self.audio_settings_added = False; self.logout_navigation_item = None; self.closing_after_render = False; self.navigationInterface.hide(); self.login_page.signed_in.connect(self._signed_in); self.jobs_page.logout_started.connect(self._logout_started); self.jobs_page.signed_out.connect(self._signed_out); self.jobs_page.shutdown_complete.connect(self._finish_shutdown); self.resize(1080, 720); self.jobs_page.preload_model(); self._restore_session()
    def _restore_session(self) -> None:
        token = load_refresh_token()
        if not token: return
        try:
            client = ApiClient(DEFAULT_API_URL); result = client.refresh(token); self._signed_in(client, result["user"]["display_name"])
        except (ApiError, httpx.HTTPError): clear_refresh_token()
    def _signed_in(self, client: ApiClient, name: str) -> None:
        if not self.jobs_added: self.addSubInterface(self.jobs_page, FluentIcon.MUSIC, "งานเสียง"); self.jobs_added = True
        if not self.audio_settings_added: self.addSubInterface(self.audio_settings_page, FluentIcon.SETTING, "ตั้งค่าเสียง"); self.audio_settings_added = True
        if self.logout_navigation_item is None: self.logout_navigation_item = self.navigationInterface.addItem("logout", FluentIcon.POWER_BUTTON, "ออกจากระบบ", self.jobs_page.logout, selectable=False, position=NavigationItemPosition.BOTTOM)
        if self.login_added: self.removeInterface(self.login_page); self.login_added = False
        qrouter.setDefaultRouteKey(self.stackedWidget, self.jobs_page.objectName())
        self.navigationInterface.show(); self.switchTo(self.jobs_page)
        self.jobs_page.set_client(client, name)

    def _logout_started(self) -> None:
        if self.logout_navigation_item is not None:
            self.logout_navigation_item.setEnabled(False)
            self.logout_navigation_item.setText("กำลังออกจากระบบ...")

    def _signed_out(self) -> None:
        self.login_page.restore_saved_login()
        if not self.login_added:
            self.addSubInterface(self.login_page, FluentIcon.PEOPLE, "เข้าสู่ระบบ")
            self.login_added = True
        self.switchTo(self.login_page)
        if self.logout_navigation_item is not None:
            self.navigationInterface.removeWidget("logout")
            self.logout_navigation_item = None
        if self.jobs_added:
            self.removeInterface(self.jobs_page)
            self.jobs_added = False
        if self.audio_settings_added:
            self.removeInterface(self.audio_settings_page)
            self.audio_settings_added = False
        qrouter.setDefaultRouteKey(self.stackedWidget, self.login_page.objectName())
        self.navigationInterface.hide()

    def closeEvent(self, event) -> None:
        if not self.closing_after_render:
            self.closing_after_render = True
            self.shutdown_dialog = ShutdownDialog(self)
            self.shutdown_dialog.show()
            self.shutdown_dialog.raise_()
            self.jobs_page.request_shutdown()
            self.shutdown_timer = QTimer(self)
            self.shutdown_timer.setInterval(250)
            self.shutdown_timer.timeout.connect(self._finish_shutdown)
            self.shutdown_timer.start()
        if self._has_running_threads():
            event.ignore()
            return
        self.shutdown_timer.stop()
        if self.jobs_page.renderer is not None:
            self.jobs_page.renderer.close()
        self.shutdown_dialog.accept()
        event.accept()

    def _has_running_threads(self) -> bool:
        # Keep the window alive until enqueue completion slots have reconciled
        # state and (if requested) started the subsequent bulk cancellation.
        if self.jobs_page.queue_threads:
            return True
        download_dialog = self.jobs_page.model_download_dialog
        threads = (
            self.login_page.login_thread,
            self.jobs_page.preload_thread,
            self.jobs_page.thread,
            self.jobs_page.logout_thread,
            self.jobs_page.cancel_all_thread,
            self.audio_settings_page.preview_thread,
            self.jobs_page.ffmpeg_setup_dialog.thread if self.jobs_page.ffmpeg_setup_dialog is not None else None,
            download_dialog.thread if download_dialog is not None else None,
        )
        # wait(0) also checks native thread cleanup without blocking the UI.
        return any(thread is not None and not thread.wait(0) for thread in threads)

    def _finish_shutdown(self) -> None:
        if self.closing_after_render and not self._has_running_threads():
            self.close()


def main() -> None:
    if sys.stderr is not None:
        faulthandler.enable()
    app = QApplication(sys.argv)
    setTheme(Theme.LIGHT)
    setThemeColor(WEB_COLORS["primary"])
    window = MainWindow(); window.show(); sys.exit(app.exec())


if __name__ == "__main__": main()
