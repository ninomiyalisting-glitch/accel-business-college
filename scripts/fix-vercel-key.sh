#!/bin/sh
# Vercel の SUPABASE_SERVICE_ROLE_KEY を .env.local の値に揃える。
# 値は画面にもクリップボードにも出さず、ファイルから直接 Vercel に渡す。
set -e
cd "$HOME/accel-business-college"

KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r\n')
if [ -z "$KEY" ]; then
  echo "エラー: .env.local から鍵が読めませんでした"
  exit 1
fi
echo "使う鍵: $(printf %s "$KEY" | cut -c1-18)… ($(printf %s "$KEY" | wc -c | tr -d ' ') 文字)"
echo

echo "──────────────────────────────────────────"
echo "1) Vercel プロジェクトに接続します。"
echo "   Set up ...? → y"
echo "   Which scope? → accel-partners のチーム"
echo "   Link to existing project? → y"
echo "   project name → accel-business-college"
echo "──────────────────────────────────────────"
vercel link

echo
echo "2) 環境変数を入れ替えます（古い値を消してから入れます）"
for e in production preview development; do
  vercel env rm SUPABASE_SERVICE_ROLE_KEY "$e" -y >/dev/null 2>&1 || true
  printf %s "$KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY "$e"
  echo "   $e に設定しました"
done

echo
echo "3) 登録内容の確認（値は伏せられます）"
vercel env ls | grep -i supabase || true

echo
echo "完了しました。最後に以下を実行して再デプロイしてください。"
echo "  git commit --allow-empty -m \"service_role キーの更新を反映\" && git push"
