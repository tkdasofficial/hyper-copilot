#!/usr/bin/env python3
"""
Hyper Copilot & Video Agent — C++ Engine & Script-to-Video Pipeline
Implements strict non-looping stock footage rules, dynamic 12-15 keyword generation,
karaoke-style burned-in subtitles with user-defined font sizes, and smooth transitions.
"""

import os
import sys
import json
import math
import time
import shutil
import random
import asyncio
import subprocess
import requests
from pathlib import Path

# Environment Configuration
def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or "").strip() or default

VIDEO_ID = env("VIDEO_ID", f"vid_{int(time.time())}")
USER_ID = env("USER_ID", "local_user")
PROMPT = env("PROMPT", "Epic documentary about ocean depths and mysterious cosmic phenomena")
NEGATIVE_PROMPT = env("NEGATIVE_PROMPT", "blurry, low quality, glitch, watermarks")
VOICE_GENDER = env("VOICE_GENDER", "male").lower()
VOICE_PERSONA = env("VOICE_PERSONA", "Cosmic Documentary")
ASPECT_RATIO = env("ASPECT_RATIO", "16:9")
RESOLUTION = env("RESOLUTION", "1080p")
FPS = int(env("FPS", "60").replace("FPS", "").strip() or "60")
CAPTIONS = env("CAPTIONS", "true").lower() in ("true", "1", "yes")

# Duration handling
raw_dur_sec = env("DURATION_SECONDS")
raw_dur_min = env("DURATION_MINUTES")
if raw_dur_sec and raw_dur_sec.isdigit() and int(raw_dur_sec) > 0:
    TOTAL_DURATION = int(raw_dur_sec)
elif raw_dur_min and raw_dur_min.isdigit() and int(raw_dur_min) > 0:
    TOTAL_DURATION = int(raw_dur_min) * 60
else:
    TOTAL_DURATION = 60 # Default 60 seconds

# Caption settings
raw_caption_scale = env("CAPTION_SCALE", "4")
raw_caption_size = env("CAPTION_SIZE", "")
if raw_caption_size.lower() in ("small", "medium", "large"):
    CAPTION_SIZE = raw_caption_size.capitalize()
elif raw_caption_scale == "2":
    CAPTION_SIZE = "Small"
elif raw_caption_scale == "6":
    CAPTION_SIZE = "Large"
else:
    CAPTION_SIZE = "Medium"

CAPTION_STYLE = env("CAPTION_STYLE", "Dynamic").capitalize()

# API Keys
PEXELS_API_KEY = env("PEXELS_API_KEY")
PIXABAY_API_KEY = env("PIXABAY_API_KEY")
CLOUDFLARE_ACCOUNT_ID = env("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = env("CLOUDFLARE_API_TOKEN")
SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")

# Target dimensions
if ASPECT_RATIO == "9:16":
    TARGET_WIDTH = 1080 if "1080" in RESOLUTION else 720
    TARGET_HEIGHT = 1920 if "1080" in RESOLUTION else 1280
else:
    TARGET_WIDTH = 1920 if "1080" in RESOLUTION else 1280
    TARGET_HEIGHT = 1080 if "1080" in RESOLUTION else 720

WORKDIR = Path(f"/tmp/hyper_render_{VIDEO_ID}")
WORKDIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR = WORKDIR / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

def update_supabase(progress: int, step: str, status: str = "processing"):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        url = f"{SUPABASE_URL}/rest/v1/videos?id=eq.{VIDEO_ID}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        data = {"status": status, "step": step, "progress": progress}
        requests.patch(url, headers=headers, json=data, timeout=5)
    except Exception as e:
        print(f"[Supabase] Progress update error: {e}", file=sys.stderr)

# ==============================================================================
# 1. DYNAMIC SCRIPT & KEYWORD GENERATOR (STRICT RULE: 12-15+ KEYWORDS PER 60s)
# ==============================================================================
def generate_storyboard(prompt: str, total_duration: int) -> list:
    """
    Produces at least 12 to 15 distinct, highly-specific scenes for a 60-second video.
    For longer videos, scenes scale with 3.5 - 4.5 seconds per scene.
    Each scene has a unique primary query, secondary query, narration, and transition.
    """
    print(f"\n[Storyboard] Generating visual storyboard for {total_duration}s (Prompt: '{prompt}')")
    
    # Calculate required scene count
    # 60 seconds -> minimum 15 scenes (average 4.0s per scene)
    target_scene_dur = 4.0
    num_scenes = max(15, math.ceil(total_duration / target_scene_dur)) if total_duration >= 45 else max(4, math.ceil(total_duration / 3.5))
    print(f"[Storyboard] Target scene count: {num_scenes} (Target duration: ~{total_duration / num_scenes:.1f}s per scene)")

    # Attempt AI generation if Cloudflare credentials are available
    ai_storyboard = None
    if CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN:
        try:
            cf_url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct"
            headers = {"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}", "Content-Type": "application/json"}
            system_prompt = (
                f"You are a master cinematic documentary editor. You must divide a {total_duration}-second video "
                f"into exactly {num_scenes} distinct visual scenes. For EVERY scene, output a highly-specific visual "
                "search query (3 to 6 descriptive words: cinematic, nature, macro, aerial, drone, etc.), "
                "a secondary distinct keyword in case the first clip is too short, and a punchy 1-2 sentence voiceover script. "
                "Format ONLY as a valid JSON array of objects with keys: "
                "['scene', 'primary_query', 'secondary_query', 'narration', 'transition']."
            )
            payload = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Topic: {prompt}"}
                ]
            }
            res = requests.post(cf_url, headers=headers, json=payload, timeout=20)
            if res.ok:
                resp_json = res.json()
                raw_text = resp_json.get("result", {}).get("response", "")
                start = raw_text.find("[")
                end = raw_text.rfind("]")
                if start != -1 and end != -1:
                    parsed = json.loads(raw_text[start:end+1])
                    if len(parsed) >= num_scenes * 0.8:
                        ai_storyboard = parsed
                        print(f"[Storyboard] Cloudflare AI produced {len(ai_storyboard)} distinct scenes!")
        except Exception as e:
            print(f"[Storyboard] Cloudflare AI storyboard fallback: {e}")

    # High-quality programmatic storyboard expansion (fallback or primary)
    base_keywords = [
        ("deep ocean hydrothermal vent underwater drone", "deep sea bioluminescence dark abyss"),
        ("macro coral reef glowing sunbeams underwater", "exotic tropical sea turtles gliding"),
        ("majestic manta ray swimming clear blue water", "giant humpback whale breaching ocean"),
        ("ancient geological rock strata canyon aerial", "dramatic volcanic lava flow night cinematic"),
        ("starry nebula cosmic galaxy hubble telescope", "deep space telescope distant star cluster"),
        ("dense foggy misty pine forest morning sun", "sunlight breaking through forest canopy trees"),
        ("cascading waterfall lush green jungle aerial 4k", "crystal clear mountain river stream stones"),
        ("snowy mountain peak clouds timelapse 4k", "cinematic glacier ice breaking ocean arctic"),
        ("northern lights aurora borealis starry night sky", "glowing green aurora reflections calm lake"),
        ("mysterious underwater submarine searchlights", "deep ocean floor rover exploration robotic"),
        ("stormy ocean waves crashing dark cliff rock", "turbulent stormy sea waves dramatic lighting"),
        ("vibrant jellyfish drifting glowing dark water", "microscopic plankton glowing marine biology"),
        ("golden sunset over vast calm open ocean", "coastal shoreline waves receding golden hour"),
        ("desert sand dunes shifting wind aerial cinematic", "vast arid desert landscape sunset rocks"),
        ("sparkling galaxy cosmic dust nebula deep cosmos", "supernova explosion concept astronomy 4k"),
        ("underwater kelp forest sunlight dancing water", "sea otters diving ocean kelp canopy"),
        ("tropical volcanic island surrounded blue ocean", "aerial coastline turquoise reef lagoon")
    ]

    # Incorporate user prompt terms into keywords
    prompt_words = [w for w in prompt.lower().replace(",", " ").split() if len(w) > 3 and w not in ("about", "video", "documentary", "short", "epic", "reel")]
    
    scenes = []
    accum_time = 0.0
    clip_dur = total_duration / num_scenes

    for i in range(num_scenes):
        start_t = accum_time
        end_t = min(total_duration, accum_time + clip_dur) if i < num_scenes - 1 else total_duration
        actual_dur = end_t - start_t
        accum_time = end_t

        kw_pair = base_keywords[i % len(base_keywords)]
        # Inject user prompt specifics
        if prompt_words:
            p_inject = prompt_words[i % len(prompt_words)]
            primary = f"{p_inject} {kw_pair[0]}"
            secondary = f"{p_inject} {kw_pair[1]}"
        else:
            primary = kw_pair[0]
            secondary = kw_pair[1]

        if ai_storyboard and i < len(ai_storyboard):
            ai_item = ai_storyboard[i]
            primary = ai_item.get("primary_query", primary)
            secondary = ai_item.get("secondary_query", secondary)
            narr = ai_item.get("narration", f"Exploring the breathtaking horizons of {prompt}.")
            trans = ai_item.get("transition", "fade")
        else:
            narr = f"Witness the profound intricacies of nature as we uncover {primary} across timeless landscapes."
            trans = random.choice(["fade", "crossfade", "wipeleft", "circlecrop"])

        scenes.append({
            "index": i,
            "start_time": round(start_t, 2),
            "end_time": round(end_t, 2),
            "duration": round(actual_dur, 2),
            "primary_query": primary,
            "secondary_query": secondary,
            "narration": narr,
            "transition": trans
        })

    print(f"[Storyboard] Successfully built {len(scenes)} distinct visual scenes with unique search terms.")
    return scenes

# ==============================================================================
# 2. AUDIO SYNTHESIS & WORD-LEVEL KARAOKE TIMESTAMPS
# ==============================================================================
async def synthesize_audio_with_word_timings(full_script: str, audio_out: Path) -> list:
    """
    Generates narration audio and real-time word-level synchronization using Edge TTS.
    """
    print(f"[Audio] Synthesizing speech narration ({VOICE_GENDER})...")
    voice = "en-US-ChristopherNeural" if VOICE_GENDER == "male" else "en-US-JennyNeural"
    
    word_timings = []
    
    try:
        import edge_tts
        communicate = edge_tts.Communicate(full_script, voice)
        submaker = edge_tts.SubMaker()
        
        with open(audio_out, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    # Offset and duration are in 100-nanosecond units (ticks), 1 tick = 1e-7 s
                    start_s = chunk["offset"] / 10000000.0
                    dur_s = chunk["duration"] / 10000000.0
                    word_text = chunk["text"]
                    word_timings.append({
                        "word": word_text,
                        "start_time": round(start_s, 3),
                        "end_time": round(start_s + dur_s, 3)
                    })
        print(f"[Audio] Edge TTS synthesis complete: {len(word_timings)} words tracked with timestamps.")
        return word_timings
    except Exception as e:
        print(f"[Audio] Edge TTS word stream note: {e}. Generating audio fallback via ffmpeg synthetic tone...", file=sys.stderr)
        # Fallback silent audio track with proportional word timings
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
            "-t", str(TOTAL_DURATION), "-q:a", "9", "-acodec", "libmp3lame", str(audio_out)
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        words = full_script.split()
        if words:
            w_dur = TOTAL_DURATION / len(words)
            for idx, w in enumerate(words):
                st = idx * w_dur
                word_timings.append({
                    "word": w,
                    "start_time": round(st, 3),
                    "end_time": round(st + w_dur * 0.9, 3)
                })
        return word_timings

# ==============================================================================
# 3. STOCK FOOTAGE FETCHER (STRICT RULE: ABSOLUTELY NO LOOPING)
# ==============================================================================
USED_VIDEO_IDS = set()

def get_clip_duration(filepath: Path) -> float:
    """Uses ffprobe to inspect exact duration of a video file."""
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(filepath)
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        return 5.0

def fetch_stock_video_pexels(query: str, orientation: str) -> dict | None:
    if not PEXELS_API_KEY:
        return None
    try:
        url = "https://api.pexels.com/videos/search"
        headers = {"Authorization": PEXELS_API_KEY}
        params = {
            "query": query,
            "orientation": "portrait" if orientation == "9:16" else "landscape",
            "size": "medium",
            "per_page": 10
        }
        res = requests.get(url, headers=headers, params=params, timeout=10)
        if not res.ok:
            return None
        data = res.json()
        videos = data.get("videos", [])
        for v in videos:
            vid = f"pexels_{v.get('id')}"
            if vid in USED_VIDEO_IDS:
                continue
            v_files = v.get("video_files", [])
            # Prefer 1080p or 720p mp4
            v_files.sort(key=lambda x: (x.get("width", 0) * x.get("height", 0)), reverse=True)
            for f in v_files:
                link = f.get("link")
                if link and f.get("file_type") == "video/mp4":
                    USED_VIDEO_IDS.add(vid)
                    return {
                        "id": vid,
                        "url": link,
                        "duration": float(v.get("duration", 5.0))
                    }
    except Exception as e:
        print(f"[Pexels] Query error ('{query}'): {e}", file=sys.stderr)
    return None

def fetch_stock_video_pixabay(query: str) -> dict | None:
    if not PIXABAY_API_KEY:
        return None
    try:
        url = "https://pixabay.com/api/videos/"
        params = {
            "key": PIXABAY_API_KEY,
            "q": query,
            "video_type": "all",
            "per_page": 10
        }
        res = requests.get(url, params=params, timeout=10)
        if not res.ok:
            return None
        hits = res.json().get("hits", [])
        for hit in hits:
            vid = f"pixabay_{hit.get('id')}"
            if vid in USED_VIDEO_IDS:
                continue
            videos = hit.get("videos", {})
            chosen = videos.get("medium") or videos.get("large") or videos.get("small")
            if chosen and chosen.get("url"):
                USED_VIDEO_IDS.add(vid)
                return {
                    "id": vid,
                    "url": chosen.get("url"),
                    "duration": float(hit.get("duration", 5.0))
                }
    except Exception as e:
        print(f"[Pixabay] Query error ('{query}'): {e}", file=sys.stderr)
    return None

def download_video(url: str, dest: Path) -> bool:
    try:
        with requests.get(url, stream=True, timeout=25) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
        return True
    except Exception as e:
        print(f"[Download] Failed to download {url}: {e}", file=sys.stderr)
        return False

def generate_fallback_clip(dest: Path, duration: float, label: str):
    """Generates an aesthetic high-resolution animated motion graphic if stock APIs are unavailable."""
    color1 = random.choice(["#0d1b2a", "#1b263b", "#415a77", "#10002b", "#240046", "#03045e", "#0077b6"])
    color2 = random.choice(["#14213d", "#003566", "#3d0066", "#023e8a", "#001219", "#005f73"])
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c={color1}:s={TARGET_WIDTH}x{TARGET_HEIGHT}:d={duration}:r={FPS}",
        "-vf", f"drawtext=font='DejaVu Sans':text='{label[:30]}':fontsize=36:fontcolor=white@0.3:x=(w-text_w)/2:y=(h-text_h)/2",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(dest)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def acquire_clips_for_scene(scene: dict, scene_index: int) -> list:
    """
    Acquires clips for a scene.
    STRICT RULE: ABSOLUTELY NO LOOPING!
    If a fetched clip is shorter than segment duration, DO NOT LOOP IT.
    Fetch an additional distinct clip using related secondary keyword to fill the remaining duration.
    """
    needed_dur = scene["duration"]
    clips = []
    current_time_filled = 0.0

    print(f"\n[Scene {scene_index+1}] Filling {needed_dur}s timeline. Primary: '{scene['primary_query']}'")

    queries_to_try = [scene["primary_query"], scene["secondary_query"]]
    sub_index = 0

    while current_time_filled < needed_dur - 0.05:
        remaining_needed = needed_dur - current_time_filled
        curr_query = queries_to_try[sub_index] if sub_index < len(queries_to_try) else f"{scene['primary_query']} aerial 4k"

        stock_info = fetch_stock_video_pexels(curr_query, ASPECT_RATIO) or fetch_stock_video_pixabay(curr_query)
        clip_path = ASSETS_DIR / f"scene_{scene_index}_part_{sub_index}.mp4"

        if stock_info and download_video(stock_info["url"], clip_path):
            actual_dur = get_clip_duration(clip_path)
            # Clip duration to use in timeline
            use_dur = min(remaining_needed, actual_dur)
            
            clips.append({
                "file": str(clip_path),
                "duration": round(use_dur, 2),
                "trim_start": 0.0,
                "transition": scene["transition"],
                "transition_duration": 0.4
            })
            current_time_filled += use_dur
            print(f"  -> Added distinct clip {sub_index+1}: {clip_path.name} (Source duration: {actual_dur:.1f}s, used: {use_dur:.1f}s)")

            if actual_dur < remaining_needed:
                print(f"  [NO LOOPING] Clip {sub_index+1} ({actual_dur:.1f}s) is shorter than remaining segment ({remaining_needed:.1f}s). Fetching secondary distinct clip!")
        else:
            # Fallback procedural visual if network or quota unavailable
            generate_fallback_clip(clip_path, remaining_needed, scene["primary_query"])
            clips.append({
                "file": str(clip_path),
                "duration": round(remaining_needed, 2),
                "trim_start": 0.0,
                "transition": scene["transition"],
                "transition_duration": 0.4
            })
            current_time_filled += remaining_needed
            print(f"  -> Created procedural scene clip: {clip_path.name} ({remaining_needed:.1f}s)")

        sub_index += 1

    return clips

# ==============================================================================
# 4. SUBTITLE & CAPTION ENGINE (KARAOKE SYNCHRONIZATION & ACCURATE SIZING)
# ==============================================================================
def generate_ass_subtitles(word_timings: list, ass_path: Path):
    """
    Produces ASS subtitle format with:
    1. Exact pixel font size: Small: 28px, Medium: 42px, Large: 56px (scaled relative to 1080p).
    2. Karaoke-style real-time word highlight.
    3. Center-bottom alignment, solid outline, and shadow for readability.
    """
    # Font sizing calculation:
    # 1080p horizontal (1920x1080): Small = 28, Medium = 42, Large = 56
    # 1080p vertical (1080x1920): Small = 48, Medium = 72, Large = 96
    if ASPECT_RATIO == "9:16":
        font_size = 48 if CAPTION_SIZE == "Small" else (96 if CAPTION_SIZE == "Large" else 72)
        margin_v = int(TARGET_HEIGHT * 0.18)
    else:
        font_size = 28 if CAPTION_SIZE == "Small" else (56 if CAPTION_SIZE == "Large" else 42)
        margin_v = int(TARGET_HEIGHT * 0.08)

    outline = 4 if TARGET_HEIGHT >= 1080 else 3
    shadow = 2

    # High contrast karaoke highlight colors:
    # Active word in bright gold / cyan, previous/upcoming words in clean white
    highlight_color = "&H0000E6FF" if CAPTION_STYLE == "Dynamic" else "&H0000FFFF"
    dim_color = "&H00C0C0C0"

    def format_ass_time(sec: float) -> str:
        sec = max(0.0, sec)
        cs = int(round(sec * 100)) % 100
        tot_s = int(sec)
        s = tot_s % 60
        tot_m = tot_s // 60
        m = tot_m % 60
        h = tot_m // 60
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    header = f"""[Script Info]
Title: Hyper Copilot Dynamic Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: {TARGET_WIDTH}
PlayResY: {TARGET_HEIGHT}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{font_size},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,{outline},{shadow},2,30,30,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lines = [header]

    # Group words into short rhythmic phrases (3 to 5 words each)
    chunk_size = 4
    for i in range(0, len(word_timings), chunk_size):
        chunk = word_timings[i:i+chunk_size]
        if not chunk:
            continue
        chunk_start = chunk[0]["start_time"]
        chunk_end = chunk[-1]["end_time"]

        # For each word in the phrase, render active word karaoke highlight
        for w_idx, active_w in enumerate(chunk):
            w_start = active_w["start_time"]
            w_end = active_w["end_time"]
            if w_end <= w_start:
                w_end = w_start + 0.25

            t1 = format_ass_time(w_start)
            t2 = format_ass_time(w_end)

            line_text = "{\\an2}"
            for c_idx, w in enumerate(chunk):
                word_str = w["word"]
                if c_idx == w_idx:
                    # Active karaoke word
                    line_text += f"{{\\c{highlight_color}}}{{\\b1}}{word_str}{{\\b0}}{{\\c&H00FFFFFF&}} "
                elif c_idx < w_idx:
                    # Already spoken
                    line_text += f"{{\\c&H00FFFFFF&}}{word_str} "
                else:
                    # Upcoming in phrase
                    line_text += f"{{\\c{dim_color}}}{word_str}{{\\c&H00FFFFFF&}} "

            lines.append(f"Dialogue: 0,{t1},{t2},Default,,0,0,0,,{line_text.strip()}\n")

    with open(ass_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"[Subtitles] ASS file saved: {ass_path} ({len(lines)} dialogue events, Font size: {font_size}px, Alignment: Center-Bottom)")

# ==============================================================================
# 5. C++ HEADLESS EDITOR & FFMPEG FILTER GRAPH EXECUTION
# ==============================================================================
def execute_render_pipeline(scenes_file: Path, audio_file: Path, captions_file: Path | None, output_file: Path):
    """
    Renders video using C++ hyper_editor or direct FFmpeg filter graph.
    Bakes/burns subtitles directly into final mp4.
    """
    print(f"\n[Engine] Initializing C++ Scene Builder & Filter Graph...")
    hyper_editor_bin = Path("editor/build/hyper_editor")

    if hyper_editor_bin.exists() and os.access(hyper_editor_bin, os.X_OK):
        print(f"[Engine] Invoking compiled C++ HyperEditor binary: {hyper_editor_bin}")
        cmd = [
            str(hyper_editor_bin),
            "--scenes", str(scenes_file),
            "--audio", str(audio_file),
            "--output", str(output_file),
            "--width", str(TARGET_WIDTH),
            "--height", str(TARGET_HEIGHT),
            "--fps", str(FPS),
            "--caption-size", CAPTION_SIZE,
            "--caption-style", CAPTION_STYLE,
            "--render"
        ]
        if captions_file and captions_file.exists():
            cmd.extend(["--captions", str(captions_file)])
        
        ret = subprocess.run(cmd)
        if ret.returncode == 0 and output_file.exists():
            print(f"[Engine] C++ HyperEditor render successful: {output_file}")
            return True
        print(f"[Engine] C++ binary returned code {ret.returncode}. Executing direct FFmpeg graph construction...")

    # Direct Python-side implementation of the exact same C++ Filter Graph logic
    with open(scenes_file, "r") as f:
        scenes_data = json.load(f)

    flat_clips = []
    for s in scenes_data:
        for c in s.get("clips", []):
            flat_clips.append(c)

    if not flat_clips:
        raise RuntimeError("No visual clips available for timeline!")

    print(f"[Engine] Constructing FFmpeg filter complex for {len(flat_clips)} distinct clips...")

    ffmpeg_cmd = ["ffmpeg", "-y"]
    # Inputs
    for c in flat_clips:
        ffmpeg_cmd.extend(["-i", c["file"]])

    audio_idx = len(flat_clips)
    ffmpeg_cmd.extend(["-i", str(audio_file)])

    # Filter complex construction with scaling, trimming, crossfading, and subtitle burning
    fc_parts = []
    for i, c in enumerate(flat_clips):
        trim_start = c.get("trim_start", 0.0)
        dur = c.get("duration", 4.0)
        fc_parts.append(
            f"[{i}:v]trim=start={trim_start}:duration={dur},setpts=PTS-STARTPTS,"
            f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=increase,"
            f"crop={TARGET_WIDTH}:{TARGET_HEIGHT},setsar=1,fps={FPS},format=yuv420p[v{i}];"
        )

    # Crossfade transitions
    current_stream = "[v0]"
    if len(flat_clips) > 1:
        accum_dur = flat_clips[0]["duration"]
        for i in range(1, len(flat_clips)):
            td = 0.4
            offset = max(0.1, accum_dur - td)
            next_stream = f"[vx{i}]"
            fc_parts.append(
                f"{current_stream}[v{i}]xfade=transition=fade:duration={td:.2f}:offset={offset:.2f}{next_stream};"
            )
            current_stream = next_stream
            accum_dur = offset + flat_clips[i]["duration"]

    # Burn-in subtitles
    final_video = "[vout]"
    if captions_file and captions_file.exists():
        escaped_ass = str(captions_file).replace(":", "\\:").replace("'", "\\'")
        fc_parts.append(f"{current_stream}ass='{escaped_ass}'{final_video}")
    else:
        fc_parts.append(f"{current_stream}copy{final_video}")

    filter_complex = "".join(fc_parts)

    ffmpeg_cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", f"{audio_idx}:a:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-shortest",
        str(output_file)
    ])

    print(f"[Engine] Executing FFmpeg Render Command...")
    res = subprocess.run(ffmpeg_cmd)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg pipeline render failed with code {res.returncode}")

    print(f"[Engine] Render completed successfully -> {output_file} ({output_file.stat().st_size / 1024 / 1024:.2f} MB)")
    return True

# ==============================================================================
# MAIN PIPELINE ENTRY POINT
# ==============================================================================
async def main_async():
    print("=" * 70)
    print("  HYPER COPILOT C++ BACKEND PIPELINE & SCRIPT-TO-VIDEO MAPPER")
    print("=" * 70)
    print(f"Video ID: {VIDEO_ID}")
    print(f"Prompt: {PROMPT}")
    print(f"Duration: {TOTAL_DURATION}s | Resolution: {RESOLUTION} ({TARGET_WIDTH}x{TARGET_HEIGHT}@{FPS}fps)")
    print(f"Captions: {CAPTIONS} | Size: {CAPTION_SIZE} | Style: {CAPTION_STYLE}")
    print("=" * 70)

    update_supabase(10, "Designing Storyboard & Visual Prompts")

    # Step 1: Generate Storyboard with 12-15+ distinct keywords per 60s
    storyboard = generate_storyboard(PROMPT, TOTAL_DURATION)
    full_script = " ".join([s["narration"] for s in storyboard])

    update_supabase(25, "Synthesizing Voiceover & Word Timestamps")

    # Step 2: Synthesize Audio & Word Timings
    audio_file = WORKDIR / "narration.mp3"
    word_timings = await synthesize_audio_with_word_timings(full_script, audio_file)

    # Step 3: Fetch Stock Clips (STRICT NO LOOPING)
    update_supabase(40, "Acquiring Stock Footage (Strict No-Looping)")
    for s_idx, scene in enumerate(storyboard):
        clips = acquire_clips_for_scene(scene, s_idx)
        scene["clips"] = clips

    scenes_json_path = WORKDIR / "scenes.json"
    with open(scenes_json_path, "w") as f:
        json.dump(storyboard, f, indent=2)

    # Step 4: Generate ASS Subtitles
    captions_ass_path = None
    if CAPTIONS:
        update_supabase(65, "Baking Synchronized Karaoke Captions")
        captions_ass_path = WORKDIR / "captions.ass"
        generate_ass_subtitles(word_timings, captions_ass_path)

    # Step 5: Render Video (Burn-in subtitles, transitions, zero-looping timeline)
    update_supabase(80, "Executing C++ Scene Builder & Filter Graph")
    output_mp4 = Path("out.mp4")
    execute_render_pipeline(scenes_json_path, audio_file, captions_ass_path, output_mp4)

    update_supabase(95, "Finalizing Output Assets")
    print(f"\n[Pipeline] Video Generation Complete! Final output saved to: {output_mp4.resolve()}")

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
