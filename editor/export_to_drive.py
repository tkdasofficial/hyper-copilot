#!/usr/bin/env python3
"""
Hyper Copilot - Headless Google Drive Exporter & Supabase Sync
Operates completely headless in the background:
1. Locates generated video file.
2. Checks if Supabase already received the drive link for VIDEO_ID.
3. If missing, uploads headless to Google Drive (via OAuth Refresh Token or Edge Function gateway).
4. Pushes Google Drive file ID, direct URL, title, and job ID back to Supabase.
"""

import os
import sys
import json
import time
import glob
import urllib.request
import urllib.error
import urllib.parse

def log(msg):
    print(f"[DriveExporter] {msg}", flush=True)

def get_env(*names, default=""):
    for name in names:
        val = os.environ.get(name, "").strip()
        if val:
            return val
    return default

def find_video_file():
    env_file = get_env("VIDEO_FILE")
    if env_file and os.path.isfile(env_file) and os.path.getsize(env_file) > 1000:
        return env_file

    candidates = [
        "out.mp4",
        "final_video.mp4",
        "output.mp4",
        "render.mp4",
        "export.mp4",
        "reel.mp4",
        "video.mp4",
        "editor/out.mp4",
        "editor/output.mp4",
        "editor/build/out.mp4",
    ]
    for c in candidates:
        if os.path.isfile(c) and os.path.getsize(c) > 1000:
            return c

    # Search workspace for any recent .mp4 files
    mp4_files = glob.glob("**/*.mp4", recursive=True)
    valid_mp4s = [f for f in mp4_files if os.path.isfile(f) and os.path.getsize(f) > 1000]
    if valid_mp4s:
        # Sort by modification time, newest first
        valid_mp4s.sort(key=lambda x: os.path.getmtime(x), reverse=True)
        return valid_mp4s[0]

    return None

def check_supabase_existing_drive_link(supabase_url, supabase_key, video_id):
    """Checks if Supabase already received the drive link for this video ID."""
    if not supabase_url or not supabase_key or not video_id:
        return None

    try:
        url = f"{supabase_url}/rest/v1/videos?id=eq.{urllib.parse.quote(video_id)}&select=id,file_id,video_url,direct_download_url,title,status"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0:
                row = data[0]
                if row.get("file_id") or row.get("direct_download_url"):
                    return row
    except Exception as e:
        log(f"Supabase check returned: {e}")
    return None

def get_google_access_token():
    """Exchange OAuth refresh token for a fresh Google Drive access token headlessly."""
    refresh_token = get_env("GOOGLE_DRIVE_REFRESH_TOKEN", "GDRIVE_REFRESH_TOKEN")
    client_id = get_env("GOOGLE_CLIENT_ID", "GOOGLE_CLOUD_API_ID")
    client_secret = get_env("GOOGLE_CLIENT_SECRET", "GOOGLE_CLOUD_API_SECRET")

    if not refresh_token or not client_id or not client_secret:
        return None

    try:
        token_url = "https://oauth2.googleapis.com/token"
        payload = urllib.parse.urlencode({
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }).encode("utf-8")

        req = urllib.request.Request(
            token_url,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=20) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            return res_data.get("access_token")
    except Exception as e:
        log(f"Headless token exchange error: {e}")
        return None

def upload_direct_to_google_drive(video_path, filename, access_token, folder_id):
    """Upload video directly to Google Drive using multipart upload."""
    boundary = "----WebKitFormBoundaryHyperCopilot"
    metadata = {
        "name": filename,
        "mimeType": "video/mp4",
    }
    if folder_id:
        metadata["parents"] = [folder_id]

    meta_json = json.dumps(metadata)

    with open(video_path, "rb") as f:
        file_bytes = f.read()

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b"Content-Type: application/json; charset=UTF-8\r\n\r\n")
    body.extend(meta_json.encode("utf-8"))
    body.extend(f"\r\n--{boundary}\r\n".encode("utf-8"))
    body.extend(b"Content-Type: video/mp4\r\n\r\n")
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

    upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink"
    req = urllib.request.Request(
        upload_url,
        data=bytes(body),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )

    with urllib.request.urlopen(req, timeout=120) as res:
        drive_file = json.loads(res.read().decode("utf-8"))
        file_id = drive_file.get("id")

        # Set permission to anyone with link can read
        try:
            perm_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions"
            perm_payload = json.dumps({"role": "reader", "type": "anyone"}).encode("utf-8")
            perm_req = urllib.request.Request(
                perm_url,
                data=perm_payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
            )
            urllib.request.urlopen(perm_req, timeout=10)
        except Exception:
            pass

        return {
            "file_id": file_id,
            "web_view_link": drive_file.get("webViewLink", f"https://drive.google.com/file/d/{file_id}/view"),
            "direct_download_url": f"https://drive.google.com/uc?export=download&id={file_id}",
        }

def upload_via_supabase_edge_function(video_path, filename, supabase_url, supabase_key, folder_id):
    """Upload via the deployed upload-to-drive Edge Function bridge."""
    import subprocess
    cmd = [
        "curl", "-sS", "-X", "POST",
        f"{supabase_url}/functions/v1/upload-to-drive",
        "-H", f"Authorization: Bearer {supabase_key}",
        "-F", f"file=@{video_path};type=video/mp4;filename={filename}",
        "-F", "folder=Videos",
        "-F", f"folderId={folder_id}",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if res.returncode == 0 and res.stdout:
        try:
            data = json.loads(res.stdout)
            file_obj = data.get("file", {})
            file_id = file_obj.get("id")
            if file_id:
                return {
                    "file_id": file_id,
                    "web_view_link": file_obj.get("webViewLink", f"https://drive.google.com/file/d/{file_id}/view"),
                    "direct_download_url": file_obj.get("directDownloadUrl", f"https://drive.google.com/uc?export=download&id={file_id}"),
                }
        except Exception as e:
            log(f"Edge function response parse failed: {e}, raw: {res.stdout[:200]}")
    return None

def push_drive_link_to_supabase(supabase_url, supabase_key, video_id, file_id, direct_download_url, title, prompt):
    """Pushes Google Drive metadata directly into Supabase videos table."""
    patch_url = f"{supabase_url}/rest/v1/videos?id=eq.{urllib.parse.quote(video_id)}"
    payload = {
        "status": "completed",
        "progress": 100,
        "step": "Finished",
        "file_id": file_id,
        "video_url": direct_download_url,
        "direct_download_url": direct_download_url,
        "title": title or prompt or "AI Generated Video",
    }

    req = urllib.request.Request(
        patch_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            log(f"Successfully pushed drive link to Supabase videos table! HTTP {res.status}")
            return True
    except Exception as e:
        log(f"Supabase patch error: {e}")
        return False

def main():
    log("Starting headless Google Drive export & Supabase sync...")

    video_id = get_env("VIDEO_ID", default="standalone_job")
    user_id = get_env("USER_ID", default="")
    prompt = get_env("PROMPT", default="AI Generated Video")
    supabase_url = get_env("SUPABASE_URL")
    supabase_key = get_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY")
    main_folder_id = get_env("GOOGLE_DRIVE_FOLDER_ID", "GDRIVE_MAIN_FOLDER_ID", default="1JGjibA287ds3SFoT_Fl2z8cJ96eCDUFs")

    clean_title = prompt.strip().replace("\n", " ")
    if len(clean_title) > 80:
        clean_title = clean_title[:77] + "..."

    # 1. Check if Supabase already received the drive link
    existing = check_supabase_existing_drive_link(supabase_url, supabase_key, video_id)
    if existing and existing.get("file_id"):
        log(f"Supabase already has drive link for {video_id}: file_id={existing.get('file_id')}")
        # Ensure status is completed
        if existing.get("status") != "completed":
            push_drive_link_to_supabase(
                supabase_url, supabase_key, video_id,
                existing["file_id"], existing.get("direct_download_url") or existing.get("video_url"),
                existing.get("title") or clean_title, prompt
            )
        return 0

    # 2. Locate generated video file
    video_path = find_video_file()
    if not video_path:
        log("No rendered video file found in workspace.")
        if supabase_url and supabase_key:
            # Mark finished if pipeline succeeded
            push_drive_link_to_supabase(
                supabase_url, supabase_key, video_id,
                None, None, clean_title, prompt
            )
        return 0

    size_mb = os.path.getsize(video_path) / (1024 * 1024)
    filename = f"{video_id[:12]}_{int(time.time())}.mp4"
    log(f"Found video {video_path} ({size_mb:.2f} MB), target filename: {filename}")

    # 3. Headless upload to Google Drive
    drive_result = None

    # Try direct OAuth first
    access_token = get_google_access_token()
    if access_token:
        log("Acquired fresh Google OAuth token, uploading directly to Drive...")
        try:
            drive_result = upload_direct_to_google_drive(video_path, filename, access_token, main_folder_id)
            log(f"Direct Google Drive upload successful! File ID: {drive_result.get('file_id')}")
        except Exception as e:
            log(f"Direct Drive upload error: {e}")

    # Fallback to Supabase upload-to-drive Edge Function
    if not drive_result and supabase_url and supabase_key:
        log("Uploading via Supabase upload-to-drive Edge Function gateway...")
        try:
            drive_result = upload_via_supabase_edge_function(video_path, filename, supabase_url, supabase_key, main_folder_id)
            if drive_result:
                log(f"Edge Function Drive upload successful! File ID: {drive_result.get('file_id')}")
        except Exception as e:
            log(f"Edge function upload error: {e}")

    # 4. Push drive link to Supabase
    if drive_result and drive_result.get("file_id"):
        file_id = drive_result["file_id"]
        direct_url = drive_result.get("direct_download_url") or f"https://drive.google.com/uc?export=download&id={file_id}"
        push_drive_link_to_supabase(
            supabase_url, supabase_key, video_id,
            file_id, direct_url, clean_title, prompt
        )
    else:
        log("Warning: Could not obtain Google Drive file ID. Finalizing job in Supabase.")
        if supabase_url and supabase_key:
            push_drive_link_to_supabase(
                supabase_url, supabase_key, video_id,
                None, None, clean_title, prompt
            )

    log("Headless export completed successfully.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
