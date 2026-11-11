'use client'

import { useState, useEffect, useRef } from 'react'

type EmojiCategory = {
  id: string
  name: string
  icon: string
  emojis: string[]
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Wajah & Emosi',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '🥹', '😅', '😂', '🤣', '🥲', '☺️', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
      '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏',
      '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺',
      '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨',
      '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤥',
      '😶', '😐', '😑', '😬', '🫨', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱',
      '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒',
      '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️',
    ],
  },
  {
    id: 'gestures',
    name: 'Gestur & Orang',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫸', '🫷', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕',
      '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶',
      '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶',
      '👂', '🦻', '👃', '🫀', '🫁', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄',
      '🫦', '🫂', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓',
    ],
  },
  {
    id: 'hearts',
    name: 'Hati & Simbol',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️',
      '✨', '⭐', '🌟', '💫', '💥', '💢', '💦', '💨', '🔥', '💯', '💤', '🎉',
      '🎊', '🎯', '🎰', '🎲', '🎵', '🎶', '💡', '🔔', '📣', '📢', '💬', '💭',
    ],
  },
  {
    id: 'animals',
    name: 'Hewan & Alam',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁',
      '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤',
      '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌',
      '🐞', '🐜', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟',
      '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓', '🐘', '🦏', '🌸', '🌹', '🌻',
    ],
  },
  {
    id: 'food',
    name: 'Makanan & Minuman',
    icon: '🍔',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒',
      '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍔', '🍟', '🍕', '🌭', '🥪',
      '🌮', '🌯', '🥗', '🥘', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤',
      '🍙', '🍚', '🍢', '🍡', '🍧', '🍨', '🍦', '🍰', '🎂', '🍮', '🍭', '🍬',
      '🍫', '🍿', '🍩', '🍪', '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂',
    ],
  },
  {
    id: 'activities',
    name: 'Aktivitas & Olahraga',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓',
      '🏸', '🏒', '🥊', '🥋', '🛹', '🛼', '🏋️', '🚴', '🏆', '🥇', '🥈', '🥉',
      '🏅', '🎖️', '🎫', '🎟️', '🎪', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁',
      '🎷', '🎺', '🎸', '🎮', '🕹️', '🧩', '🚀', '🛸', '✈️', '⛵', '🚗', '🛵',
    ],
  },
]

export function IosEmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<string>('smileys')
  const [search, setSearch] = useState('')
  const [recents, setRecents] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Load recents from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pulse-recent-emojis')
      if (stored) {
        setRecents(JSON.parse(stored))
      }
    } catch (_) {}
  }, [])

  function handleSelectEmoji(emoji: string) {
    onSelect(emoji)
    // Update recents
    try {
      const updated = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, 24)
      setRecents(updated)
      localStorage.setItem('pulse-recent-emojis', JSON.stringify(updated))
    } catch (_) {}
  }

  // Close when clicking outside
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [onClose])

  // Filter emojis if search is non-empty
  const allFilteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    : null

  return (
    <div
      ref={containerRef}
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro Text", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      }}
      className="absolute bottom-full mb-3 left-2 sm:left-4 z-40 w-[320px] sm:w-[360px] max-w-[calc(100vw-1rem)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col h-[380px] sm:h-[400px] animate-in fade-in zoom-in-95 duration-200"
    >
      {/* iOS Style Search Header */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/30 transition-all">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-400 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari emoji..."
            className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Emoji Scroll Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 overscroll-contain">
        {allFilteredEmojis ? (
          <div>
            <h4 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2 px-1">
              Hasil Pencarian
            </h4>
            <div className="grid grid-cols-7 gap-1">
              {allFilteredEmojis.map((emoji, idx) => (
                <button
                  key={`${emoji}-${idx}`}
                  type="button"
                  onClick={() => handleSelectEmoji(emoji)}
                  className="h-10 w-10 flex items-center justify-center text-2xl hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-transform active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Sering Digunakan (Recent) */}
            {recents.length > 0 && activeTab === 'smileys' && (
              <div>
                <h4 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2 px-1">
                  Sering Digunakan
                </h4>
                <div className="grid grid-cols-7 gap-1">
                  {recents.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleSelectEmoji(emoji)}
                      className="h-10 w-10 flex items-center justify-center text-2xl hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-transform active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Category */}
            {EMOJI_CATEGORIES.filter((c) => c.id === activeTab).map((cat) => (
              <div key={cat.id}>
                <h4 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2 px-1">
                  {cat.name}
                </h4>
                <div className="grid grid-cols-7 gap-1">
                  {cat.emojis.map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      type="button"
                      onClick={() => handleSelectEmoji(emoji)}
                      className="h-10 w-10 flex items-center justify-center text-2xl hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-transform active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* iOS Style Bottom Category Bar */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-around shrink-0">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setActiveTab(cat.id)
              setSearch('')
            }}
            title={cat.name}
            className={`p-1.5 rounded-xl text-lg transition-all ${
              activeTab === cat.id && !search
                ? 'bg-slate-200/90 dark:bg-slate-800 scale-110 shadow-xs'
                : 'opacity-60 hover:opacity-100 hover:scale-105'
            }`}
          >
            {cat.icon}
          </button>
        ))}
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white"
          title="Tutup"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
