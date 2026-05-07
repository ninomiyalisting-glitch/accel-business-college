#!/usr/bin/env python3
"""Slack export → Supabase importer"""

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone

import urllib.request
import urllib.error

SUPABASE_URL = "https://zcjgzviomuyirprfcrah.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjamd6dmlvbXV5aXJwcmZjcmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjA2MTYsImV4cCI6MjA4OTk5NjYxNn0.IZ4S2cSG6mWQO-IamZ_LygJ4bMkJgOxbyWHbiGq-3C4"
SERVICE_KEY = "sb_secret_afOGUgHxhz10ZFfb5-xOVQ_GQlKQExm"
EXPORT_DIR = "/tmp/slack-export"
BATCH_SIZE = 100

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def supabase_get(path):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def supabase_post(path, data):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ERROR {e.code}: {err[:200]}")
        return e.code


def ts_to_iso(ts_str):
    try:
        ts = float(ts_str)
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return datetime.now(tz=timezone.utc).isoformat()


def load_users():
    path = os.path.join(EXPORT_DIR, "users.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        users = json.load(f)
    mapping = {}
    for u in users:
        uid = u.get("id", "")
        profile = u.get("profile", {})
        name = (
            profile.get("display_name")
            or profile.get("real_name")
            or u.get("name")
            or uid
        )
        mapping[uid] = name
    return mapping


def load_slack_channels():
    path = os.path.join(EXPORT_DIR, "channels.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_existing_channels():
    rows = supabase_get("channels?select=id,name")
    return {r["name"]: r["id"] for r in rows}


def upsert_channels(slack_channels):
    """Insert missing Slack channels, return name→id mapping."""
    existing = get_existing_channels()
    to_insert = []
    for ch in slack_channels:
        name = ch.get("name", "")
        if name and name not in existing:
            purpose = ch.get("purpose", {}).get("value", "") or ch.get("topic", {}).get("value", "")
            new_id = str(uuid.uuid4())
            to_insert.append({
                "id": new_id,
                "name": name,
                "description": purpose or None,
                "created_at": ts_to_iso(str(ch.get("created", time.time()))),
            })
            existing[name] = new_id

    if to_insert:
        print(f"Inserting {len(to_insert)} new channels...")
        for i in range(0, len(to_insert), BATCH_SIZE):
            supabase_post("channels", to_insert[i:i+BATCH_SIZE])

    return existing


def collect_messages_from_dir(channel_dir, channel_id, users):
    messages = []
    if not os.path.isdir(channel_dir):
        return messages
    for fname in sorted(os.listdir(channel_dir)):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(channel_dir, fname)
        try:
            with open(fpath, encoding="utf-8") as f:
                daily = json.load(f)
        except Exception:
            continue
        for msg in daily:
            # Skip deleted, system, bot messages
            if msg.get("subtype") in ("tombstone", "bot_message", "channel_join", "channel_leave"):
                continue
            if msg.get("hidden"):
                continue
            if msg.get("type") != "message":
                continue
            text = msg.get("text", "").strip()
            if not text:
                continue
            user_id = msg.get("user", "")
            user_name = users.get(user_id, user_id) if user_id else "unknown"
            ts = msg.get("ts", "")
            slack_thread_ts = msg.get("thread_ts")
            # thread_ts is set when this message is a reply (thread_ts != ts) or a thread parent (thread_ts == ts)
            thread_ts = ts_to_iso(slack_thread_ts) if slack_thread_ts else None
            row = {
                "id": str(uuid.uuid4()),
                "channel_id": channel_id,
                "user_name": user_name,
                "content": text,
                "created_at": ts_to_iso(ts),
            }
            if thread_ts:
                row["thread_ts"] = thread_ts
            messages.append(row)
    return messages


def import_all():
    print("Loading users...")
    users = load_users()
    print(f"  {len(users)} users loaded")

    print("Loading Slack channels...")
    slack_channels = load_slack_channels()
    print(f"  {len(slack_channels)} channels in export")

    print("Upserting channels to Supabase...")
    channel_map = upsert_channels(slack_channels)
    print(f"  Total channels in DB: {len(channel_map)}")

    total_inserted = 0
    total_skipped = 0

    for ch in slack_channels:
        ch_name = ch.get("name", "")
        if not ch_name:
            continue
        channel_id = channel_map.get(ch_name)
        if not channel_id:
            print(f"  WARN: no ID for channel '{ch_name}', skipping")
            continue

        channel_dir = os.path.join(EXPORT_DIR, ch_name)
        messages = collect_messages_from_dir(channel_dir, channel_id, users)
        if not messages:
            total_skipped += 1
            continue

        print(f"  [{ch_name}] {len(messages)} messages → inserting...")
        ok = 0
        for i in range(0, len(messages), BATCH_SIZE):
            batch = messages[i:i+BATCH_SIZE]
            status = supabase_post("messages", batch)
            if status in (200, 201):
                ok += len(batch)
            else:
                print(f"    batch {i//BATCH_SIZE} failed (status {status})")
        total_inserted += ok
        print(f"    → {ok} inserted")

    print(f"\nDone. Total messages inserted: {total_inserted}, channels skipped (no msgs): {total_skipped}")


if __name__ == "__main__":
    import_all()
