#!/usr/bin/env python3
"""
Slack export の thread_ts を既存 Supabase メッセージへ反映するスクリプト。
- created_at（= Slack の ts）でメッセージを特定し、thread_ts カラムのみ更新
- DBに存在しない新規メッセージは INSERT
- メッセージの重複追加はしない
"""

import json
import os
import time
import uuid
from datetime import datetime, timezone

import urllib.request
import urllib.error

SUPABASE_URL = "https://zcjgzviomuyirprfcrah.supabase.co"
SERVICE_KEY = "sb_secret_afOGUgHxhz10ZFfb5-xOVQ_GQlKQExm"
EXPORT_DIR = "/tmp/slack-export"
BATCH_SIZE = 100
PAGE_SIZE = 1000  # Supabase REST の1回あたり最大取得件数

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

HEADERS_WITH_COUNT = {
    **HEADERS,
    "Prefer": "count=exact",
}


def supabase_request(method, path, data=None, extra_headers=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data is not None else None
    headers = {**HEADERS, **(extra_headers or {})}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ERROR {e.code}: {err[:300]}")
        return e.code, None


def supabase_get_all(path_base):
    """ページネーションで全件取得"""
    results = []
    offset = 0
    while True:
        sep = "&" if "?" in path_base else "?"
        path = f"{path_base}{sep}limit={PAGE_SIZE}&offset={offset}"
        status, rows = supabase_request("GET", path)
        if not rows:
            break
        results.extend(rows)
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return results


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


def get_channel_map():
    """DB上のチャンネル名→IDマッピング"""
    status, rows = supabase_request("GET", "channels?select=id,name")
    if not rows:
        return {}
    return {r["name"]: r["id"] for r in rows}


def fetch_existing_messages_for_channel(channel_id):
    """チャンネルの既存メッセージ: created_at → id のマッピングを返す"""
    rows = supabase_get_all(f"messages?select=id,created_at&channel_id=eq.{channel_id}")
    return {r["created_at"]: r["id"] for r in rows}


def collect_messages_from_dir(channel_dir, channel_id, users):
    """Slackエクスポートのディレクトリからメッセージ一覧を収集"""
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
            thread_ts = ts_to_iso(slack_thread_ts) if slack_thread_ts else None
            messages.append({
                "channel_id": channel_id,
                "user_name": user_name,
                "content": text,
                "created_at": ts_to_iso(ts),
                "thread_ts": thread_ts,
            })
    return messages


def batch_patch_thread_ts(updates):
    """
    updates: list of {"id": ..., "thread_ts": ...}
    Supabase REST は個別PATCHのみ対応のため、バッチごとにIDリストでPATCH試行。
    thread_ts が同じ値のものをグループ化して効率化。
    """
    # thread_ts ごとにグループ化
    groups = {}
    for u in updates:
        key = u["thread_ts"]  # None も含む
        groups.setdefault(key, []).append(u["id"])

    patched = 0
    for thread_ts_val, ids in groups.items():
        # IDリストをチャンクに分割
        for i in range(0, len(ids), 50):
            chunk = ids[i:i+50]
            id_list = ",".join(chunk)
            path = f"messages?id=in.({id_list})"
            body = {"thread_ts": thread_ts_val}
            status, _ = supabase_request(
                "PATCH", path, data=body,
                extra_headers={"Prefer": "return=minimal"}
            )
            if status in (200, 204):
                patched += len(chunk)
            else:
                print(f"    PATCH failed (status {status}) for {len(chunk)} messages")
    return patched


def run():
    print("=== thread_ts 更新スクリプト開始 ===\n")

    print("ユーザー情報を読み込み中...")
    users = load_users()
    print(f"  {len(users)} ユーザー")

    print("Slackチャンネル一覧を読み込み中...")
    slack_channels = load_slack_channels()
    print(f"  {len(slack_channels)} チャンネル")

    print("DBのチャンネルマッピングを取得中...")
    channel_map = get_channel_map()
    print(f"  DB上のチャンネル数: {len(channel_map)}\n")

    total_updated = 0
    total_inserted = 0
    total_skipped = 0

    for ch in slack_channels:
        ch_name = ch.get("name", "")
        if not ch_name:
            continue
        channel_id = channel_map.get(ch_name)
        if not channel_id:
            print(f"[{ch_name}] DBに存在しないためスキップ")
            continue

        channel_dir = os.path.join(EXPORT_DIR, ch_name)
        messages = collect_messages_from_dir(channel_dir, channel_id, users)
        if not messages:
            total_skipped += 1
            continue

        print(f"[{ch_name}] {len(messages)} メッセージ処理中...")

        # DBの既存メッセージを取得 (created_at → id)
        existing = fetch_existing_messages_for_channel(channel_id)
        print(f"  DB既存: {len(existing)} 件")

        updates = []   # thread_ts を更新するもの
        inserts = []   # 新規INSERTするもの

        for msg in messages:
            ca = msg["created_at"]
            if ca in existing:
                # 既存 → thread_ts のみ更新対象
                if msg["thread_ts"] is not None:
                    updates.append({"id": existing[ca], "thread_ts": msg["thread_ts"]})
            else:
                # 新規 → INSERT
                inserts.append({
                    "id": str(uuid.uuid4()),
                    "channel_id": msg["channel_id"],
                    "user_name": msg["user_name"],
                    "content": msg["content"],
                    "created_at": msg["created_at"],
                    "thread_ts": msg["thread_ts"],
                })

        # thread_ts 更新
        if updates:
            print(f"  thread_ts を更新: {len(updates)} 件...")
            patched = batch_patch_thread_ts(updates)
            total_updated += patched
            print(f"  → {patched} 件更新完了")

        # 新規INSERT
        if inserts:
            print(f"  新規INSERT: {len(inserts)} 件...")
            ok = 0
            for i in range(0, len(inserts), BATCH_SIZE):
                batch = inserts[i:i+BATCH_SIZE]
                status, _ = supabase_request("POST", "messages", data=batch)
                if status in (200, 201):
                    ok += len(batch)
                else:
                    print(f"    INSERT batch {i//BATCH_SIZE} 失敗 (status {status})")
            total_inserted += ok
            print(f"  → {ok} 件INSERT完了")

        no_change = len(messages) - len(updates) - len(inserts)
        print(f"  thread_tsなしでスキップ: {no_change} 件\n")

    print("=" * 40)
    print(f"完了!")
    print(f"  thread_ts 更新: {total_updated} 件")
    print(f"  新規INSERT     : {total_inserted} 件")
    print(f"  チャンネルスキップ: {total_skipped} チャンネル")


if __name__ == "__main__":
    run()
