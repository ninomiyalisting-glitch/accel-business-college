'use client'

import FolderBrowser from '@/components/FolderBrowser'

const ROOT_FOLDER_ID = '25313251'

export default function VideosPage() {
  // 見出し（動画ライブラリ）と「管理」は共通ヘッダーが出す。
  // パンくずは階層を開いたときだけ意味があるので、トップでは空にする。
  return <FolderBrowser projectId={ROOT_FOLDER_ID} breadcrumb={[]} />
}
