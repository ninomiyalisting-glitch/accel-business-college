'use client'

import FolderBrowser from '@/components/FolderBrowser'

const ROOT_FOLDER_ID = '25313251'
const ROOT_FOLDER_NAME = 'ビジカレ勉強会'

export default function VideosPage() {
  return (
    <FolderBrowser
      projectId={ROOT_FOLDER_ID}
      breadcrumb={[{ label: ROOT_FOLDER_NAME }]}
      backHref="/dashboard"
      backLabel="ダッシュボード"
    />
  )
}
