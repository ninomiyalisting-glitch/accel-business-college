'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, ImageIcon } from 'lucide-react'

interface Props {
  initialValue?: string
  onChange: (html: string) => void
  onImageUpload?: (file: File) => Promise<string>
  placeholder?: string
  minHeight?: number
}

function ToolBtn({ onMouseDown, title, children }: { onMouseDown: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onMouseDown() }}
      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
      title={title}
    >
      {children}
    </button>
  )
}

const Divider = () => <div className="w-px h-5 bg-gray-300 mx-0.5" />

export default function RichTextEditor({ initialValue = '', onChange, onImageUpload, placeholder = '本文を入力...', minHeight = 320 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialValue
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only on mount

  const exec = useCallback((command: string, value?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(command, false, value ?? undefined)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    editorRef.current?.focus()
  }, [onChange])

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  const handleLink = useCallback(() => {
    const url = prompt('リンクのURLを入力してください:')
    if (url) exec('createLink', url)
  }, [exec])

  const handleImage = useCallback(() => {
    if (!onImageUpload) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const url = await onImageUpload(file)
        exec('insertHTML', `<img src="${url}" alt="" class="article-img" />`)
      } catch {
        alert('画像のアップロードに失敗しました')
      }
    }
    input.click()
  }, [onImageUpload, exec])

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-100 flex-wrap">
        <ToolBtn onMouseDown={() => exec('bold')} title="太字"><Bold size={15} /></ToolBtn>
        <ToolBtn onMouseDown={() => exec('italic')} title="斜体"><Italic size={15} /></ToolBtn>
        <Divider />
        <ToolBtn onMouseDown={() => exec('formatBlock', 'h2')} title="見出し2"><Heading2 size={15} /></ToolBtn>
        <ToolBtn onMouseDown={() => exec('formatBlock', 'h3')} title="見出し3"><Heading3 size={15} /></ToolBtn>
        <Divider />
        <ToolBtn onMouseDown={() => exec('insertUnorderedList')} title="箇条書き"><List size={15} /></ToolBtn>
        <ToolBtn onMouseDown={() => exec('insertOrderedList')} title="番号付きリスト"><ListOrdered size={15} /></ToolBtn>
        <Divider />
        <ToolBtn onMouseDown={handleLink} title="リンク挿入"><Link2 size={15} /></ToolBtn>
        {onImageUpload && (
          <ToolBtn onMouseDown={handleImage} title="画像挿入"><ImageIcon size={15} /></ToolBtn>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="article-editor p-4 focus:outline-none text-gray-800 leading-relaxed"
        style={{ minHeight }}
      />
    </div>
  )
}
