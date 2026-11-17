'use client'

import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  localDb,
  saveCustomSticker,
  toggleStickerFavorite,
  deleteCustomSticker,
  seedDefaultStickersIfEmpty,
} from '@/lib/db/schema'
import type { LocalSticker } from '@/lib/db/types'

function StickerItem({
  sticker,
  onSelect,
  onToggleFavorite,
  onDelete,
}: {
  sticker: LocalSticker
  onSelect: (s: LocalSticker) => void
  onToggleFavorite: (id: string, e: React.MouseEvent) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!sticker.blob) return
    const objUrl = URL.createObjectURL(sticker.blob)
    setUrl(objUrl)
    return () => {
      URL.revokeObjectURL(objUrl)
    }
  }, [sticker.blob])

  if (!url) {
    return (
      <div className="aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
    )
  }

  return (
    <div
      onClick={() => onSelect(sticker)}
      className="group relative flex items-center justify-center p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer aspect-square"
      title={sticker.name}
    >
      <img
        src={url}
        alt={sticker.name}
        className="w-full h-full object-contain hover:scale-110 transition-transform"
        loading="lazy"
      />

      {/* Action overlay buttons: Favorite Star & Delete */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          type="button"
          onClick={(e) => onToggleFavorite(sticker.id, e)}
          className={`h-5 w-5 flex items-center justify-center rounded-full text-[10px] backdrop-blur-md shadow-xs transition-colors ${
            sticker.is_favorite
              ? 'bg-amber-400 text-slate-900 font-bold'
              : 'bg-black/60 hover:bg-black/80 text-white'
          }`}
          title={sticker.is_favorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
        >
          {sticker.is_favorite ? '★' : '☆'}
        </button>

        <button
          type="button"
          onClick={(e) => onDelete(sticker.id, e)}
          className="h-5 w-5 flex items-center justify-center rounded-full text-[10px] bg-black/60 hover:bg-rose-600 text-white backdrop-blur-md shadow-xs transition-colors"
          title="Hapus stiker"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function StickerPicker({
  onSelectSticker,
  onClose,
}: {
  onSelectSticker: (sticker: LocalSticker) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all')
  const [isAdding, setIsAdding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pastikan stiker default terpasang jika belum ada
  useEffect(() => {
    seedDefaultStickersIfEmpty()
  }, [])

  // Ambil stiker dari IndexedDB lokal secara reaktif
  const allStickers = useLiveQuery(
    async () => {
      const list = await localDb.custom_stickers.toArray()
      return list.sort((a, b) => b.created_at - a.created_at)
    },
    []
  ) || []

  const displayedStickers =
    activeTab === 'favorites'
      ? allStickers.filter((s) => s.is_favorite)
      : allStickers

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsAdding(true)
    try {
      // Simpan langsung ke IndexedDB lokal
      const cleanName = file.name.replace(/\.[^/.]+$/, '') || 'Stiker Saya'
      await saveCustomSticker(file, cleanName, false)
    } catch (err) {
      console.error('[StickerPicker] Failed to add sticker:', err)
    } finally {
      setIsAdding(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleToggleFavorite(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await toggleStickerFavorite(id)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm('Hapus stiker ini dari koleksi lokal Anda?')) {
      await deleteCustomSticker(id)
    }
  }

  return (
    <div className="w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-40 max-h-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            🎨 Semua ({allStickers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'favorites'
                ? 'bg-white dark:bg-slate-700 text-amber-500 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            ⭐ Favorit ({allStickers.filter((s) => s.is_favorite).length})
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Tombol Tambah Stiker Custom */}
          <button
            type="button"
            disabled={isAdding}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-colors"
            title="Tambah Stiker Custom dari Galeri"
          >
            <span>➕</span>
            <span className="hidden sm:inline">Tambah</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/gif,image/jpeg,image/svg+xml"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Tombol Tutup */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl"
            title="Tutup"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Grid List Stiker */}
      <div className="flex-1 overflow-y-auto p-3">
        {displayedStickers.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-slate-400">
            {activeTab === 'favorites' ? (
              <>
                <span className="text-3xl mb-2">⭐</span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Belum Ada Stiker Favorit
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  Arahkan kursor ke stiker apa pun lalu klik ikon bintang ★ untuk menyimpannya di sini.
                </p>
              </>
            ) : (
              <>
                <span className="text-3xl mb-2">🎨</span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Belum Ada Stiker
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  Klik tombol <strong>+ Tambah</strong> di atas untuk mengunggah stiker buatan Anda sendiri!
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {displayedStickers.map((sticker) => (
              <StickerItem
                key={sticker.id}
                sticker={sticker}
                onSelect={(s) => {
                  onSelectSticker(s)
                  onClose()
                }}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span>💾 Tersimpan 100% di penyimpanan lokal</span>
        <span>Klik untuk kirim</span>
      </div>
    </div>
  )
}
