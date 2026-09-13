#!/usr/bin/env python3
"""Captik Clipper fetcher — audio first, then only the parts the curator picked.

Downloading a whole long video before anything else is what made the old pipeline feel like it
was "recording" it: YouTube throttles single-stream downloads to roughly real time. Transcription
only needs the audio, and rendering only needs the chosen minutes, so this script fetches exactly
those. Fragmented (HLS) formats are preferred because yt-dlp pulls only the fragments inside a
requested range, several at a time (a 30 s 1080p section of a 52 min episode: 13 s).

Every command prints JSON lines on stdout:
  {"type": "progress", "stage": "audio" | "sections", "id": ..., "pct": 0..1}
  {"type": "section", "id": "c01", "file": "...", "start": 12.0, "end": 58.5}
  {"type": "done", ...}
  {"type": "error", "message": "..."}

Usage:
  python fetch.py info <url>
  python fetch.py audio <url> <out_dir>
  python fetch.py sections <url> <out_dir> <ranges.json>   # [{"id": "c01", "start": 12.5, "end": 58.0}]
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import yt_dlp
from yt_dlp.utils import download_range_func

sys.stdout.reconfigure(encoding="utf-8")

MAX_HEIGHT = int(os.environ.get("MAX_DOWNLOAD_HEIGHT", "1080"))
SECTION_PAD = 1.0  # seconds of slack either side; the pipeline aligns sections to the source audio
PARALLEL_SECTIONS = 3

COMMON = {
    "quiet": True,
    "no_warnings": True,
    "noprogress": True,
    "noplaylist": True,
    "js_runtimes": {"node": {}},
    "concurrent_fragment_downloads": 8,
    "retries": 5,
    "fragment_retries": 10,
}
if os.environ.get("YTDLP_COOKIES_FROM_BROWSER"):
    COMMON["cookiesfrombrowser"] = (os.environ["YTDLP_COOKIES_FROM_BROWSER"],)


def emit(**fields):
    print(json.dumps(fields, ensure_ascii=False), flush=True)


def progress_hook(stage, clip_id=None):
    last = {"t": 0.0}

    def hook(d):
        if d.get("status") != "downloading":
            return
        now = time.time()
        if now - last["t"] < 0.5:
            return
        last["t"] = now
        frag, frags = d.get("fragment_index"), d.get("fragment_count")
        total = d.get("total_bytes") or d.get("total_bytes_estimate")
        if frag and frags:
            pct = frag / frags
        elif total:
            pct = d.get("downloaded_bytes", 0) / total
        else:
            pct = None
        emit(type="progress", stage=stage, id=clip_id, pct=None if pct is None else round(min(pct, 1.0), 4))

    return hook


def extract(url):
    with yt_dlp.YoutubeDL({**COMMON, "skip_download": True}) as ydl:
        return ydl.extract_info(url, download=False)


def summarize(info):
    formats = info.get("formats") or []
    return {
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"),
        "webpage_url": info.get("webpage_url"),
        "thumbnail": info.get("thumbnail"),
        "view_count": info.get("view_count"),
        "extractor": info.get("extractor_key"),
        "description": (info.get("description") or "")[:1500],
        "has_audio_only": any(f.get("vcodec") == "none" and f.get("acodec") not in (None, "none") for f in formats),
        "has_hls": any(str(f.get("protocol", "")).startswith("m3u8") for f in formats),
    }


def cmd_info(url):
    emit(type="done", stage="info", meta=summarize(extract(url)))


def cmd_audio(url, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    # Extract and download in ONE YoutubeDL session: HLS manifests are bound to the session that
    # fetched them, and handing an info dict to a second instance gets 403 Forbidden.
    # Sites with no separate audio stream fall through to the best muxed file; the pipeline then
    # cuts sections from that local file instead of downloading again.
    opts = {
        **COMMON,
        # Measured on a 52 min YouTube episode: 48 kbps m4a (139) over https 20 s, HLS audio with
        # 8 parallel fragments 59 s, 128 kbps m4a 186 s. Whisper needs nothing better than 48 kbps.
        "format": f"139/ba[ext=m4a][abr<=64]/ba[protocol^=m3u8]/ba[ext=m4a]/ba/b[height<={MAX_HEIGHT}]/b",
        "outtmpl": os.path.join(out_dir, "source_audio.%(ext)s"),
        "progress_hooks": [progress_hook("audio")],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    dl = info["requested_downloads"][0]
    full_video = dl.get("vcodec") not in (None, "none")
    emit(type="done", stage="audio", file=dl["filepath"], full_video=full_video, meta=summarize(info))


def download_section(url, out_dir, r):
    start = max(0.0, float(r["start"]) - SECTION_PAD)
    end = float(r["end"]) + SECTION_PAD
    h = MAX_HEIGHT
    fmt = (
        f"bv*[height<={h}][protocol^=m3u8]+ba[protocol^=m3u8]/b[height<={h}][protocol^=m3u8]"
        f"/bv*[height<={h}]+ba/b[height<={h}]/b"
    )
    opts = {
        **COMMON,
        "format": fmt,
        "download_ranges": download_range_func(None, [(start, end)]),
        "outtmpl": os.path.join(out_dir, f"{r['id']}.%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [progress_hook("sections", r["id"])],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(url, download=True)
    return {"id": r["id"], "file": result["requested_downloads"][0]["filepath"], "start": start, "end": end}


def cmd_sections(url, out_dir, ranges_path):
    os.makedirs(out_dir, exist_ok=True)
    with open(ranges_path, encoding="utf-8") as fh:
        ranges = json.load(fh)
    failures = []
    with ThreadPoolExecutor(max_workers=PARALLEL_SECTIONS) as pool:
        futures = {pool.submit(download_section, url, out_dir, r): r for r in ranges}
        for fut in as_completed(futures):
            r = futures[fut]
            try:
                emit(type="section", **fut.result())
            except Exception as exc:  # one bad section must not sink the others
                failures.append(r["id"])
                emit(type="section_error", id=r["id"], message=str(exc)[:400])
    emit(type="done", stage="sections", failed=failures)


def main(argv):
    if len(argv) < 3:
        emit(type="error", message=__doc__.strip())
        return 2
    cmd, url = argv[1], argv[2]
    try:
        if cmd == "info":
            cmd_info(url)
        elif cmd == "audio" and len(argv) >= 4:
            cmd_audio(url, argv[3])
        elif cmd == "sections" and len(argv) >= 5:
            cmd_sections(url, argv[3], argv[4])
        else:
            emit(type="error", message=f"bad arguments for {cmd}")
            return 2
    except yt_dlp.utils.DownloadError as exc:
        emit(type="error", message=str(exc).replace("ERROR: ", "")[:600])
        return 1
    except Exception as exc:
        emit(type="error", message=f"{type(exc).__name__}: {exc}"[:600])
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
