#!/usr/bin/env python3
"""
Dunda na Fes — Isolated Audio Separator Entry Point (Phase 2 Full Implementation)

This is the ONLY Python file in Dunda na Fes.
It is invoked by the Node.js backend as a one-shot child process per job.
It never talks to the browser or SQLite database.

All machine-readable events are emitted as single-line JSON objects (JSONL) on stdout.
All internal library logs and tqdm progress bars are routed to stderr so stdout
remains 100% clean JSON lines.

Full contract: see `docs/separator-contract.md` and `separator/README.md`.
"""

import argparse
import ctypes
from ctypes import wintypes
import errno
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
from importlib.metadata import version, PackageNotFoundError


# Documented exit codes (must match docs/separator-contract.md)
EXIT_OK = 0
EXIT_INVALID_ARGS = 1
EXIT_MISSING_DEPENDENCY = 2
EXIT_FFMPEG_MISSING = 3
EXIT_INPUT_NOT_FOUND = 4
EXIT_MODEL_ERROR = 5
EXIT_SEPARATION_FAILED = 6

DEFAULT_MODEL = "UVR-MDX-NET-Inst_HQ_3.onnx"
FALLBACK_MODEL = "Kim_Vocal_2.onnx"
SUPPORTED_OUTPUT_FORMATS = ("wav", "mp3", "flac")


def emit_json(payload: dict) -> None:
    """Print a single line of machine-readable JSON to stdout and flush immediately."""
    sys.__stdout__.write(json.dumps(payload) + "\n")
    sys.__stdout__.flush()


def emit_progress(stage: str, percent: int, message: str) -> None:
    """Emit a structured progress event on stdout."""
    clamped = max(0, min(100, int(percent)))
    emit_json(
        {
            "type": "progress",
            "stage": stage,
            "percent": clamped,
            "message": message,
        }
    )


def emit_error(code: str, message: str) -> None:
    """Emit a structured human-readable error event on stdout."""
    emit_json(
        {
            "type": "error",
            "code": code,
            "message": message,
        }
    )


class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD),
        ("PageFaultCount", wintypes.DWORD),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]


def get_peak_memory_mb() -> float:
    """
    Query the OS for this process's peak physical RAM usage (PeakWorkingSetSize) in MB.
    Uses Windows Win32 API (psapi.GetProcessMemoryInfo) with 64-bit HANDLE types.
    """
    if os.name == "nt":
        try:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            psapi = ctypes.WinDLL("psapi", use_last_error=True)

            kernel32.GetCurrentProcess.restype = wintypes.HANDLE
            psapi.GetProcessMemoryInfo.argtypes = [
                wintypes.HANDLE,
                ctypes.POINTER(PROCESS_MEMORY_COUNTERS),
                wintypes.DWORD,
            ]
            psapi.GetProcessMemoryInfo.restype = wintypes.BOOL

            counters = PROCESS_MEMORY_COUNTERS()
            counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
            handle = kernel32.GetCurrentProcess()
            ok = psapi.GetProcessMemoryInfo(
                handle, ctypes.byref(counters), counters.cb
            )
            if ok:
                return round(counters.PeakWorkingSetSize / (1024 * 1024), 2)
        except Exception:
            pass
    return 0.0


def configure_ffmpeg_env(ffmpeg_bin: str) -> str | None:
    """
    Resolve ffmpeg executable path and ensure its parent directory is on os.environ["PATH"]
    so child libraries (pydub, librosa, audio-separator) can invoke both ffmpeg and ffprobe.
    Also checks standard Windows WinGet installation locations if the current shell
    was opened before FFmpeg was installed.
    """
    resolved = None
    if os.path.isabs(ffmpeg_bin) and os.path.isfile(ffmpeg_bin):
        resolved = ffmpeg_bin
    elif os.path.isabs(ffmpeg_bin) and os.path.isdir(ffmpeg_bin):
        candidate = os.path.join(ffmpeg_bin, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        resolved = candidate if os.path.isfile(candidate) else None
    else:
        resolved = shutil.which(ffmpeg_bin)

    # Fallback: check Windows WinGet Links / Packages directories if not yet on shell PATH
    if not resolved and os.name == "nt" and ffmpeg_bin.lower() in ("ffmpeg", "ffmpeg.exe"):
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            winget_link = os.path.join(
                local_app_data, "Microsoft", "WinGet", "Links", "ffmpeg.exe"
            )
            if os.path.isfile(winget_link):
                resolved = winget_link
            else:
                packages_dir = os.path.join(
                    local_app_data, "Microsoft", "WinGet", "Packages"
                )
                if os.path.isdir(packages_dir):
                    for root, _dirs, files in os.walk(packages_dir):
                        if "ffmpeg.exe" in [f.lower() for f in files]:
                            resolved = os.path.join(root, "ffmpeg.exe")
                            break

    if resolved:
        ffmpeg_dir = os.path.dirname(os.path.abspath(resolved))
        current_path = os.environ.get("PATH", "")
        if ffmpeg_dir.lower() not in current_path.lower():
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path

    return resolved


def check_ffmpeg(ffmpeg_bin: str = "ffmpeg") -> dict:
    """Verify that FFmpeg is installed and returns its version string."""
    resolved = configure_ffmpeg_env(ffmpeg_bin)
    if not resolved:
        return {
            "ok": False,
            "path": None,
            "version": None,
            "error": f"'{ffmpeg_bin}' not found on PATH.",
        }

    try:
        proc = subprocess.run(
            [resolved, "-version"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        first_line = proc.stdout.splitlines()[0] if proc.stdout else "Unknown version"
        return {"ok": True, "path": resolved, "version": first_line}
    except Exception as exc:
        return {"ok": False, "path": resolved, "version": None, "error": str(exc)}


def check_audio_separator() -> dict:
    """Verify that audio-separator and onnxruntime can be imported."""
    try:
        import onnxruntime as ort  # type: ignore
        from audio_separator.separator import Separator  # type: ignore  # noqa: F401

        pkg_ver = version("audio-separator")
        providers = ort.get_available_providers()
        return {
            "ok": True,
            "version": pkg_ver,
            "onnxruntimeVersion": ort.__version__,
            "providers": providers,
        }
    except PackageNotFoundError:
        return {
            "ok": False,
            "error": "Package 'audio-separator' is not installed in this Python environment.",
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"Failed to import audio-separator or onnxruntime: {exc}",
        }


def run_environment_check(ffmpeg_bin: str) -> int:
    """Run readiness checks for Python, audio-separator, and FFmpeg."""
    ffmpeg_status = check_ffmpeg(ffmpeg_bin)
    sep_status = check_audio_separator()

    all_ok = sep_status.get("ok", False) and ffmpeg_status.get("ok", False)

    report = {
        "type": "check_result",
        "ok": all_ok,
        "python": {
            "version": sys.version.split()[0],
            "executable": sys.executable,
        },
        "audioSeparator": sep_status,
        "ffmpeg": ffmpeg_status,
    }
    emit_json(report)

    if not sep_status.get("ok", False):
        return EXIT_MISSING_DEPENDENCY
    if not ffmpeg_status.get("ok", False):
        return EXIT_FFMPEG_MISSING
    return EXIT_OK


class SeparationLogHandler(logging.Handler):
    """
    Intercepts internal log messages from `audio-separator` to emit exact,
    real-time progress updates while keeping stdout clean.
    """

    def __init__(self) -> None:
        super().__init__()
        self.last_stage = ""
        self.last_percent = 25
        self.current_part = 1
        self.total_parts = 1

    def emit(self, record: logging.LogRecord) -> None:
        msg = record.getMessage()
        lower = msg.lower()
        if "preparing mix" in lower and self.last_stage != "preparing":
            self.last_stage = "preparing"
            if self.last_percent < 30:
                self.last_percent = 30
                emit_progress("separating", 30, "Decoding and preparing audio waveform...")
        elif "normalizing mix" in lower and self.last_stage != "normalizing":
            self.last_stage = "normalizing"
            if self.last_percent < 35:
                self.last_percent = 35
                emit_progress("separating", 35, "Normalizing audio mix for AI separation...")
        elif "processing chunk " in lower:
            try:
                after_prefix = lower.split("processing chunk ", 1)[1]
                ratio_part = after_prefix.split(":", 1)[0].strip()
                current_str, total_str = ratio_part.split("/", 1)
                current_idx = int(current_str)
                total_idx = max(1, int(total_str))

                # Distinguish outer AudioChunker parts ("Processing chunk 1/5: C:\...")
                # from inner MDX STFT chunks ("Processing chunk 1/42: Start 0, End ...")
                if "start " not in lower:
                    self.current_part = current_idx
                    self.total_parts = total_idx
                    overall_frac = (self.current_part - 1) / self.total_parts
                    pct = max(self.last_percent, 35 + int(overall_frac * 50))
                    self.last_percent = pct
                    emit_progress(
                        "separating",
                        pct,
                        f"Separating long track: starting part {self.current_part} of {self.total_parts}...",
                    )
                else:
                    if self.total_parts > 1:
                        overall_frac = (
                            (self.current_part - 1) + (current_idx / total_idx)
                        ) / self.total_parts
                        pct = 35 + int(overall_frac * 50)
                        label = f"Separating part {self.current_part}/{self.total_parts} (chunk {current_idx}/{total_idx})..."
                    else:
                        pct = 38 + int((current_idx / total_idx) * 44)
                        label = f"Separating audio chunks ({current_idx}/{total_idx})..."

                    if pct > self.last_percent:
                        self.last_percent = pct
                        emit_progress("separating", pct, label)
            except Exception:
                pass
        elif "producing secondary source" in lower and self.last_stage != "secondary":
            self.last_stage = "secondary"
            if self.total_parts == 1 and self.last_percent < 84:
                self.last_percent = 84
                emit_progress("separating", self.last_percent, "Computing complementary stem...")
        elif "saving " in lower and "stem to" in lower:
            if self.total_parts == 1:
                self.last_percent = max(self.last_percent, 90)
                emit_progress("exporting", self.last_percent, "Writing separated stem audio file to disk...")
        elif "merging " in lower and "chunks into" in lower:
            self.last_percent = max(self.last_percent, 92)
            emit_progress("exporting", self.last_percent, "Merging separated audio parts into final stems...")


def is_disk_full_error(exc: BaseException) -> bool:
    """Detect OS disk-full errors (ENOSPC on POSIX/Windows or WinError 112)."""
    if isinstance(exc, OSError):
        if getattr(exc, "errno", None) == errno.ENOSPC:
            return True
        if getattr(exc, "winerror", None) == 112:  # ERROR_DISK_FULL on Windows
            return True
    msg = str(exc).lower()
    return "no space left on device" in msg or "not enough space on the disk" in msg


def is_wav_completely_silent(wav_path: str, min_amplitude: int = 3) -> bool:
    """
    Inspect a 16-bit PCM WAV file in chunks to determine if the entire track
    is digital silence (peak sample amplitude < min_amplitude out of 32767).
    Breaks on the very first audible chunk (<1 ms for normal tracks).
    """
    import array
    import wave

    try:
        with wave.open(wav_path, "rb") as wf:
            if wf.getnframes() == 0:
                return True
            while True:
                raw_bytes = wf.readframes(16384)
                if not raw_bytes:
                    break
                if any(raw_bytes):
                    samples = array.array("h")
                    samples.frombytes(raw_bytes)
                    if max(abs(s) for s in samples) >= min_amplitude:
                        return False
        return True
    except Exception:
        return False


def run_separation(args: argparse.Namespace) -> int:
    """Execute full audio separation into Vocals and Instrumental stems."""
    start_time = time.perf_counter()
    emit_progress("starting", 5, "Validating environment and input audio file...")

    # 1. Verify FFmpeg is available before importing pydub/audio-separator
    ffmpeg_status = check_ffmpeg(args.ffmpeg_path)
    if not ffmpeg_status.get("ok", False):
        emit_error(
            "FFMPEG_MISSING",
            "FFmpeg is not installed or could not be found on PATH. Please install FFmpeg or set FFMPEG_PATH.",
        )
        return EXIT_FFMPEG_MISSING

    ffmpeg_resolved = ffmpeg_status.get("path") or "ffmpeg"

    # 2. Verify input file exists and is non-empty
    input_path = os.path.abspath(args.input)
    if not os.path.isfile(input_path):
        emit_error(
            "INPUT_NOT_FOUND",
            f"Input audio file was not found: {args.input}",
        )
        return EXIT_INPUT_NOT_FOUND

    input_size_bytes = os.path.getsize(input_path)
    if input_size_bytes == 0:
        emit_error(
            "INPUT_EMPTY",
            "The input audio file is empty (0 bytes) and cannot be processed.",
        )
        return EXIT_INPUT_NOT_FOUND

    # 3. Validate output format
    output_format = args.output_format.lower().strip()
    if output_format not in SUPPORTED_OUTPUT_FORMATS:
        emit_error(
            "INVALID_ARGS",
            f"Unsupported output format '{args.output_format}'. Choose from: {', '.join(SUPPORTED_OUTPUT_FORMATS)}.",
        )
        return EXIT_INVALID_ARGS

    # 4. Prepare directories and verify sufficient free disk space
    output_dir = os.path.abspath(args.output_dir)
    model_dir = os.path.abspath(args.model_dir)
    try:
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(model_dir, exist_ok=True)

        free_bytes = shutil.disk_usage(output_dir).free
        min_required_bytes = max(30 * 1024 * 1024, input_size_bytes * 3)
        if free_bytes < min_required_bytes:
            emit_error(
                "DISK_FULL",
                "Your disk is full (not enough free storage space to write separated audio stems). Please free up disk space and try again.",
            )
            return EXIT_SEPARATION_FAILED
    except Exception as exc:
        if is_disk_full_error(exc):
            emit_error(
                "DISK_FULL",
                "Your disk is full (not enough free storage space to create working directories). Please free up disk space and try again.",
            )
            return EXIT_SEPARATION_FAILED
        emit_error("FILESYSTEM_ERROR", f"Could not create working directories: {exc}")
        return EXIT_SEPARATION_FAILED

    # 5. Pre-decode and normalize ALL input audio (including mono or non-44.1kHz WAV,
    # MP3, FLAC, M4A, OGG) to a 44.1 kHz 2-channel stereo 16-bit PCM WAV via FFmpeg.
    # This guarantees mono tracks are cleanly upmixed to stereo and catches corrupt/truncated
    # audio containers before loading the neural network.
    decoded_temp_wav = os.path.join(output_dir, "_decoded_input_44k.wav")
    try:
        emit_progress("starting", 8, "Verifying and decoding audio stream via FFmpeg...")
        subprocess.run(
            [
                ffmpeg_resolved,
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-i",
                input_path,
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "44100",
                "-ac",
                "2",
                decoded_temp_wav,
            ],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            check=True,
        )
        if not os.path.isfile(decoded_temp_wav) or os.path.getsize(decoded_temp_wav) <= 44:
            raise RuntimeError("Decoded WAV file contained no audio samples.")
    except Exception as exc:
        if os.path.isfile(decoded_temp_wav):
            try:
                os.remove(decoded_temp_wav)
            except Exception:
                pass
        if is_disk_full_error(exc):
            emit_error(
                "DISK_FULL",
                "Your disk ran out of free space while decoding the audio file. Please free up disk space and try again.",
            )
            return EXIT_SEPARATION_FAILED
        emit_error(
            "CORRUPT_AUDIO_FILE",
            "The audio file appears to be corrupted, truncated, or in an unreadable encoding and could not be decoded.",
        )
        return EXIT_SEPARATION_FAILED

    # 6. Check if the decoded audio is 100% digital silence before loading the 64 MB AI model
    # (MDX STFT normalization divides by max peak amplitude, which produces NaNs on pure silence)
    if is_wav_completely_silent(decoded_temp_wav):
        if os.path.isfile(decoded_temp_wav):
            try:
                os.remove(decoded_temp_wav)
            except Exception:
                pass
        emit_error(
            "SILENT_AUDIO_FILE",
            "The audio file contains only silence — no audible vocals or instruments were detected to separate.",
        )
        return EXIT_SEPARATION_FAILED

    # 7. Import audio-separator while redirecting any library stdout noise to stderr
    original_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        from audio_separator.separator import Separator  # type: ignore
    except Exception as exc:
        sys.stdout = original_stdout
        if os.path.isfile(decoded_temp_wav):
            try:
                os.remove(decoded_temp_wav)
            except Exception:
                pass
        emit_error(
            "MISSING_DEPENDENCY",
            f"Audio separation library failed to load: {exc}",
        )
        return EXIT_MISSING_DEPENDENCY

    # 8. Initialize Separator and load requested model (with optional fallback)
    requested_model = args.model or DEFAULT_MODEL
    model_used = requested_model

    try:
        emit_progress(
            "loading_model",
            12,
            f"Initializing AI separator and loading model '{requested_model}'...",
        )

        # Use log_level=logging.INFO during load_model() so ONNX Runtime C++ does not
        # set ort_session_options.log_severity_level = 0 (verbose), then switch logger
        # to DEBUG right after load_model() so our SeparationLogHandler receives chunk logs.
        # chunk_duration=300 splits tracks longer than 5 minutes into 5-minute segments
        # so 20+ minute medleys never exhaust system RAM.
        separator = Separator(
            log_level=logging.INFO,
            model_file_dir=model_dir,
            output_dir=output_dir,
            output_format=output_format.upper(),
            use_soundfile=(output_format == "wav"),
            chunk_duration=300,
        )

        # Attach our custom log handler to translate internal stages into JSON progress
        separator.logger.handlers.clear()
        stderr_handler = logging.StreamHandler(sys.stderr)
        stderr_handler.setLevel(logging.WARNING)
        separator.logger.addHandler(stderr_handler)
        separator.logger.addHandler(SeparationLogHandler())

        try:
            separator.load_model(model_filename=requested_model)
        except Exception as primary_err:
            if args.fallback_model and args.fallback_model != requested_model:
                emit_progress(
                    "loading_model",
                    16,
                    f"Primary model '{requested_model}' failed; switching to fallback '{args.fallback_model}'...",
                )
                model_used = args.fallback_model
                separator.load_model(model_filename=model_used)
            else:
                raise primary_err

        # Enable DEBUG on Python logger now that ONNX session is created so
        # "Processing chunk X/Y" messages flow into SeparationLogHandler
        separator.logger.setLevel(logging.DEBUG)

        emit_progress(
            "separating",
            25,
            f"Model '{model_used}' loaded. Separating vocals and instrumental on CPU...",
        )
    except Exception as exc:
        sys.stdout = original_stdout
        if os.path.isfile(decoded_temp_wav):
            try:
                os.remove(decoded_temp_wav)
            except Exception:
                pass
        if is_disk_full_error(exc):
            emit_error(
                "DISK_FULL",
                "Your disk ran out of free space while loading the AI model. Please free up disk space and try again.",
            )
            return EXIT_SEPARATION_FAILED
        emit_error(
            "MODEL_ERROR",
            f"Could not load AI model '{model_used}'. Ensure the model file is present in storage/models or check your internet connection.",
        )
        return EXIT_MODEL_ERROR

    # 9. Run separation (SeparationLogHandler emits real-time chunk progress on stdout)
    try:
        custom_names = {
            "Vocals": "vocals",
            "Instrumental": "instrumental",
        }
        output_files = separator.separate(decoded_temp_wav, custom_output_names=custom_names)
    except MemoryError:
        sys.stdout = original_stdout
        emit_error(
            "OUT_OF_MEMORY",
            "Your computer ran out of available RAM while separating this track. Close other heavy apps and try again.",
        )
        return EXIT_SEPARATION_FAILED
    except Exception as exc:
        sys.stdout = original_stdout
        if is_disk_full_error(exc):
            emit_error(
                "DISK_FULL",
                "Your disk ran out of free storage space while writing the separated stems. Please free up disk space and try again.",
            )
            return EXIT_SEPARATION_FAILED
        emit_error(
            "SEPARATION_FAILED",
            "Failed to separate the audio file. It may be corrupted or in an unsupported encoding.",
        )
        return EXIT_SEPARATION_FAILED
    finally:
        sys.stdout = original_stdout
        if decoded_temp_wav and os.path.isfile(decoded_temp_wav):
            try:
                os.remove(decoded_temp_wav)
            except Exception:
                pass

    # 8. Resolve and verify both output files exist on disk and are non-empty
    expected_vocals = os.path.join(output_dir, f"vocals.{output_format}")
    expected_inst = os.path.join(output_dir, f"instrumental.{output_format}")

    # If custom_output_names returned relative filenames inside output_dir, normalize them
    if not os.path.isfile(expected_vocals) or not os.path.isfile(expected_inst):
        for fpath in output_files or []:
            full_p = fpath if os.path.isabs(fpath) else os.path.join(output_dir, fpath)
            lower_name = os.path.basename(full_p).lower()
            if "vocal" in lower_name and os.path.isfile(full_p):
                expected_vocals = full_p
            elif "inst" in lower_name and os.path.isfile(full_p):
                expected_inst = full_p

    if not os.path.isfile(expected_vocals) or not os.path.isfile(expected_inst):
        emit_error(
            "OUTPUT_MISSING",
            "Separation finished, but one or both stem files (vocals/instrumental) were not written to disk.",
        )
        return EXIT_SEPARATION_FAILED

    if os.path.getsize(expected_vocals) == 0 or os.path.getsize(expected_inst) == 0:
        emit_error(
            "OUTPUT_EMPTY",
            "One of the generated stem files is 0 bytes.",
        )
        return EXIT_SEPARATION_FAILED

    elapsed_sec = round(time.perf_counter() - start_time, 2)
    peak_ram_mb = get_peak_memory_mb()

    emit_json(
        {
            "type": "complete",
            "percent": 100,
            "vocalsPath": os.path.abspath(expected_vocals),
            "instrumentalPath": os.path.abspath(expected_inst),
            "outputFormat": output_format,
            "modelUsed": model_used,
            "elapsedSeconds": elapsed_sec,
            "peakMemoryMb": peak_ram_mb,
        }
    )
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Dunda na Fes — Isolated Python Audio Separator CLI"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify that audio-separator, onnxruntime, and FFmpeg are installed and working.",
    )
    parser.add_argument(
        "--input",
        help="Path to the input audio file to separate.",
    )
    parser.add_argument(
        "--output-dir",
        help="Directory where vocals.<ext> and instrumental.<ext> will be written.",
    )
    parser.add_argument(
        "--model-dir",
        default=os.path.join(os.path.dirname(__file__), "..", "storage", "models"),
        help="Directory where ONNX model weights are cached (default: ../storage/models).",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Primary model filename to use (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--fallback-model",
        default=FALLBACK_MODEL,
        help=f"Fallback model filename if primary fails to load (default: {FALLBACK_MODEL}).",
    )
    parser.add_argument(
        "--output-format",
        default="wav",
        help="Output audio format: wav, mp3, or flac (default: wav).",
    )
    parser.add_argument(
        "--ffmpeg-path",
        default="ffmpeg",
        help="Optional path or command name for ffmpeg executable (default: ffmpeg).",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.check:
        return run_environment_check(args.ffmpeg_path)

    if not args.input or not args.output_dir:
        emit_error(
            "INVALID_ARGS",
            "Both --input and --output-dir are required (or pass --check to verify environment).",
        )
        return EXIT_INVALID_ARGS

    return run_separation(args)


if __name__ == "__main__":
    sys.exit(main())
