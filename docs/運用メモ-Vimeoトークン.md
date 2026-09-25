# Vimeo アクセストークンの運用メモ

動画のアップロード・フォルダ格納は Vimeo API を `VIMEO_ACCESS_TOKEN`（Vercel 環境変数）で呼んでいる。

## 必要なスコープ
Public / Private / Create / Edit / Delete / Upload / **Interact** / Video Files

- `interact` が無いと「アップロードはできるがフォルダに入らない」状態になる
- スコープは生成後に追加できない。足りなければ新しいトークンを生成する
- 生成時は「Authenticated (you)」を選ぶ（Unauthenticated は public のみ）

## 本番トークンの権限を確認する
`/videos/manage` を管理者で開く。権限が足りなければページ上部に黄色の警告が出る
（`/api/vimeo/manage/token-check` が Vimeo の `/oauth/verify` を呼んでいる。トークン自体は表示しない）。

Vercel 側は Sensitive にしているため `vercel env pull` では中身を取れない。確認は上記の警告で行う。

## トークンを差し替える手順
```bash
cd ~/accel-business-college
vercel env rm VIMEO_ACCESS_TOKEN production --scope accelpartners --yes
vercel env add VIMEO_ACCESS_TOKEN production --sensitive --scope accelpartners   # 値を貼って Enter
vercel --prod --scope accelpartners                                              # 環境変数は次のデプロイから反映
```
差し替え後、`/videos/manage` の警告が消えたことを確認してから Vimeo の古いトークンを削除する。
`.env.local` の `VIMEO_ACCESS_TOKEN` も同じ値に揃える（ローカル開発用。本番には無関係）。

## フォルダ格納の仕組み（2026-09 時点）
- 動画作成 `POST /me/videos` に `folder_uri`（`/users/{owner}/projects/{id}`）を渡して最初からフォルダ内に作る
- 失敗時はルートに作ってから `PUT {folder uri}/videos/{video_id}` で追加を試す（最大3回）
- フォルダ配下への `POST .../projects/{id}/videos` は Vimeo に存在しない（405）
- チームライブラリのフォルダは所有者がチームオーナーなので、`/me/...` ではなくフォルダの `uri` をそのまま使う
