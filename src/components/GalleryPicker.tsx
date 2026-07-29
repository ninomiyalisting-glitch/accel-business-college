'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface PhotoCategory {
  id: string
  name: string
  cover_image_url: string | null
}

interface Photo {
  id: string
  category_id: string
  image_url: string
}

export function GalleryPicker({
  onSelect,
  selectedUrl,
}: {
  onSelect: (url: string) => void
  selectedUrl?: string
}) {
  const [categories, setCategories] = useState<PhotoCategory[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [activeCat, setActiveCat] = useState<string>('')
  const [loadingCats, setLoadingCats] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)

  useEffect(() => {
    supabase
      .from('photo_categories')
      .select('id, name, cover_image_url')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as PhotoCategory[]
        setCategories(list)
        if (list.length > 0) setActiveCat(list[0].id)
        setLoadingCats(false)
      })
  }, [])

  useEffect(() => {
    if (!activeCat) return
    setLoadingPhotos(true)
    supabase
      .from('photos')
      .select('id, category_id, image_url')
      .eq('category_id', activeCat)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPhotos((data ?? []) as Photo[])
        setLoadingPhotos(false)
      })
  }, [activeCat])

  if (loadingCats) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-[#2563eb] rounded-full animate-spin" />
      </div>
    )
  }
  if (categories.length === 0) {
    return <p className="text-center py-8 text-xs text-gray-400">ギャラリーが空です</p>
  }

  return (
    <div className="space-y-3">
      <select
        value={activeCat}
        onChange={(e) => setActiveCat(e.target.value)}
        className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {loadingPhotos ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-[#2563eb] rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-center py-6 text-xs text-gray-400">このカテゴリーには画像がありません</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const isSelected = selectedUrl === p.image_url
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.image_url)}
                className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected ? 'border-[#2563eb] ring-2 ring-[#2563eb]/30' : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                {isSelected && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#2563eb] flex items-center justify-center text-white">
                    <Check size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
