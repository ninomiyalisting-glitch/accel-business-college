#!/usr/bin/env python3
"""新しい Slack Bot トークンを .env.local に書き込む。

ターミナルへの貼り付けを一切必要としない。
このスクリプトを起動したあとに Slack でトークンをコピーし、
Enter を押すだけでよい（クリップボードはこちらから読む）。
"""
import io
import json
import os
import re
import subprocess
import urllib.request

ENV = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env.local'))
KEY = 'SLACK_BOT_TOKEN'


def clipboard() -> str:
    try:
        return subprocess.run(['pbpaste'], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception as e:
        return ''


print('=' * 60)
print('この画面のまま、Slack で Bot User OAuth Token をコピーしてください。')
print('  1. https://api.slack.com/apps → 該当アプリ')
print('  2. OAuth & Permissions → Reinstall to Workspace')
print('  3. Bot User OAuth Token（xoxb- で始まる）をコピー')
print()
print('コピーしたら、ここに戻って Enter だけ押してください。')
print('（ターミナルに貼り付ける必要はありません）')
print('=' * 60)
input('準備できたら Enter: ')

token = clipboard()

if not token:
    raise SystemExit('クリップボードが空でした。コピーしてから、もう一度実行してください。')
if token.startswith('python3') or '/' in token.split('-')[0]:
    raise SystemExit('クリップボードにコマンド文が入っています。Slack でトークンをコピーし直してください。')
if not token.startswith('xoxb-'):
    raise SystemExit(f'xoxb- で始まっていません（先頭: {token[:10]}…）。コピーし直してください。')
if len(token) < 40:
    raise SystemExit(f'短すぎます（{len(token)} 文字）。コピーが途中で切れています。')
if re.search(r'\s', token):
    raise SystemExit('空白や改行が混ざっています。コピーし直してください。')

print(f'\n読み取りました: {token[:12]}… / {len(token)} 文字')

print('Slack で有効性を確認します…')
req = urllib.request.Request(
    'https://slack.com/api/conversations.list?types=public_channel&limit=5',
    headers={'Authorization': f'Bearer {token}'},
)
with urllib.request.urlopen(req, timeout=20) as res:
    body = json.load(res)

if not body.get('ok'):
    raise SystemExit(f'このトークンは使えません（error: {body.get("error")}）。書き込まずに中止しました。')

names = [c['name'] for c in body.get('channels', [])]
print(f'有効です。チャンネル {len(names)} 件取得: {", ".join(names[:5])}')
if not names:
    raise SystemExit('チャンネルが 0 件でした。Bot がチャンネルに参加しているか確認してください。中止します。')

lines = io.open(ENV, encoding='utf-8').read().split('\n')
found = False
for i, line in enumerate(lines):
    if line.startswith(KEY + '='):
        lines[i] = f'{KEY}={token}'
        found = True
if not found:
    if lines and lines[-1] == '':
        lines.insert(len(lines) - 1, f'{KEY}={token}')
    else:
        lines.append(f'{KEY}={token}')
io.open(ENV, 'w', encoding='utf-8').write('\n'.join(lines))

print(f'\n.env.local を更新しました。')
print('=== 更新後のキー一覧（値は出しません）===')
for line in io.open(ENV, encoding='utf-8'):
    if '=' in line:
        k, v = line.rstrip('\n').split('=', 1)
        print(f'  {k} ({len(v)} 文字)')
print('\nトークンはクリップボードに残っています。次に Vercel へ入れるのでそのままにしてください。')
