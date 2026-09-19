# アクセルビジネスカレッジ — Claude 向け規約

診断士合格後のメンバー向けコミュニティアプリ。Slack ログインで入り、
記事・動画・イベント・ギャラリー・実務従事ポイントを扱う。

- Next.js 16（App Router）／ TypeScript ／ Tailwind CSS v3
- データベースと認証まわりは Supabase、ログインは Slack OAuth
- ホスティングは Vercel（本番 https://college.accel-dash.com）
- リポジトリ: `ninomiyalisting-glitch/accel-business-college`

## 扱っているデータの性質

**実在するメンバーの個人情報が入っています。** 氏名・顔写真・Slack ID・SNS アカウント・
投稿内容・実務従事ポイントなど。開発中でも次を守ってください。

- 個人名や写真をチャット・コミットメッセージ・スクリーンショットに出さない
- 本番データベースに対して、確認せずに DELETE / UPDATE / TRUNCATE を流さない
- テスト用のダミー会員を本番に作らない（ステージング側で行う）

## ブランチと環境

| 環境 | ブランチ | URL |
| --- | --- | --- |
| 本番 | `main` | https://college.accel-dash.com |
| ステージング | `staging` | https://stg.college.accel-dash.com |
| 個人の作業 | `feat/◯◯` など | Vercel が自動で作るプレビューURL |

`main` に入ったものが本番になります。**本番へ直接 push しないこと。**
必ず作業ブランチ → `staging` で確認 → プルリクエスト → 二宮がマージ、の順です。

プレビューURLは毎回変わるため、**Slack ログインは使えません**（Slack アプリに
登録されたリダイレクトURLと一致しないため）。ログインが必要な確認は
`staging` ブランチに push して、固定URLのステージングで行ってください。

## 作業の進め方

1. `git pull origin main` で最新を取り込む
2. 作業ブランチを切る（例: `feat/gallery-sort`）
3. `npm run dev` で手元で確認
4. `npm run build` が通ることを必ず確かめる（型エラーはここで出ます）
5. `staging` に push してステージングで動作確認
6. プルリクエストを作り、二宮がレビューして `main` にマージ

## 触るときの決めごと

**秘密情報**
- `SUPABASE_SERVICE_ROLE_KEY` は絶対にクライアント側（`"use client"` のファイル）へ持ち込まない。
  サーバー側では `src/lib/supabaseAdmin.ts` の `supabaseAdmin()` 経由でのみ使う
- `.env.local` をコミットしない。鍵の受け渡しはパスワードマネージャーで行う
- `NEXT_PUBLIC_` が付く環境変数はブラウザに出ます。付けるときはその前提で

**データベース**
- スキーマ変更は `supabase/*.sql` にファイルとして残す。画面で直接テーブルをいじらない
- RLS は必ず有効にする。新しいテーブルを足したらポリシーも同じファイルに書く
- 本番で SQL を流す前に、ステージングで同じ SQL を試す

**見た目**
- 色は Tailwind の設定（`tailwind.config.ts`）にあるブルー系パレットを使う。
  生の hex を直接書かない
- 書体は游ゴシック体。本文 16px、行高 1.8 を基準に

**認証**
- ログイン判定は `src/lib/session.ts` の `verifySession` と `middleware.ts` に集約されている。
  個別の画面で独自に判定を書かない
- 公開ページを増やすときは `middleware.ts` の `PUBLIC_PATHS` に足す。
  足し忘れるとログイン必須になり、足しすぎると会員情報が外に出ます

## 確認のしかた

```bash
npm run dev     # 手元で動かす
npm run build   # 型チェックとビルド。push 前に必ず通す
npm run lint    # 書き方のチェック
```

画面を変えたときは、**スマホ幅でも崩れていないか**を必ず見てください。
利用者の多くはスマホから開きます。

## 相談したほうがよいこと

- メンバーに通知が飛ぶ変更（Slack 通知、メール）
- 既存データの移行を伴う変更
- 公開範囲が変わる変更（ログイン不要ページの追加など）

これらは、先に二宮に確認してから進めてください。
