'use client'

import { use, useEffect, useState } from 'react'
import FolderBrowser from '@/components/FolderBrowser'

const ROOT_FOLDER_ID = '25313251'
const ROOT_FOLDER_NAME = 'ビジカレ勉強会'

interface VimeoAlbum { uri: string; name: string }

function getAlbumId(uri: string) { return uri.split('/').pop() ?? '' }

export default function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = use(params)
  const [folderName, setFolderName] = useState<string>(
    folderId === ROOT_FOLDER_ID ? ROOT_FOLDER_NAME : 'フォルダ'
  )

  // サブフォルダ名解決 (フォルダリストから検索)
  useEffect(() => {
    if (folderId === ROOT_FOLDER_ID) return
    fetch('/api/vimeo/albums')
      .then((r) => r.json())
      .then((data) => {
        const albums: VimeoAlbum[] = data.data ?? []
        const match = albums.find((a) => getAlbumId(a.uri) === folderId)
        if (match) setFolderName(match.name)
      })
      .catch(() => {})
  }, [folderId])

  return (
    <FolderBrowser
      projectId={folderId}
      breadcrumb={[
        { label: ROOT_FOLDER_NAME, href: '/videos' },
        { label: folderName },
      ]}
    />
  )
}
