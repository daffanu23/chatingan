'use client'

import { useState } from 'react'
import { ulid } from 'ulid'
import { localDb, upsertLocalConversation } from '@/lib/db/schema'
import type { Profile } from '@/lib/types'

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-violet-600 to-indigo-600',
]

function getGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export default function NewChatModal({
  currentUser,
  onClose,
  onCreated,
}: {
  currentUser: Profile
  onClose: () => void
  onCreated: (conversationId: string) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  async function handleSearch(query: string) {
    setSearch(query)
    if (query.trim().length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.users || [])
      }
    } catch (err) {
      console.error('[NewChat] Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectUser(targetUser: Profile) {
    setCreating(true)

    try {
      // 1. Cek apakah room DM dengan user ini sudah ada di IndexedDB lokal
      const existingConvs = await localDb.conversations.toArray()
      const existingDm = existingConvs.find(
        (c) =>
          c.type === 'dm' &&
          c.members.some((m) => m.user_id === targetUser.id) &&
          c.members.some((m) => m.user_id === currentUser.id)
      )

      if (existingDm) {
        onCreated(existingDm.id)
        return
      }

      // 2. Buat ID percakapan deterministik atau unik untuk DM
      const conversationId = `dm_${[currentUser.id, targetUser.id].sort().join('_')}`

      // 3. Simpan langsung ke IndexedDB lokal
      await upsertLocalConversation({
        id: conversationId,
        type: 'dm',
        name: targetUser.username,
        avatar_url: targetUser.avatar_url,
        created_by: currentUser.id,
        members: [
          {
            user_id: currentUser.id,
            role: 'member',
            username: currentUser.username,
            avatar_url: currentUser.avatar_url,
            is_online: true,
          },
          {
            user_id: targetUser.id,
            role: 'member',
            username: targetUser.username,
            avatar_url: targetUser.avatar_url,
            is_online: targetUser.is_online,
          },
        ],
        unread_count: 0,
        updated_at: Date.now(),
        created_at: new Date().toISOString(),
        last_message: null,
      })

      onCreated(conversationId)
    } catch (err) {
      console.error('[NewChat] Error creating local conversation:', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Obrolan Baru</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cari username teman Anda (@username)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Search input */}
        <div className="mt-4">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/60 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
            <span className="text-slate-400 text-xs">@</span>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Ketik username..."
              autoFocus
              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="mt-4 max-h-60 overflow-y-auto space-y-1">
          {loading ? (
            <p className="text-center text-xs text-slate-400 py-6">Mencari...</p>
          ) : results.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-6">
              {search.length < 2
                ? 'Ketik minimal 2 karakter untuk mencari teman'
                : 'Pengguna tidak ditemukan'}
            </p>
          ) : (
            results.map((user) => {
              const gradient = getGradient(user.username)
              return (
                <button
                  key={user.id}
                  disabled={creating}
                  onClick={() => handleSelectUser(user)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="relative shrink-0">
                    <div
                      className={`h-9 w-9 rounded-xl bg-gradient-to-tr ${gradient} flex items-center justify-center text-white text-xs font-semibold shadow-xs`}
                    >
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    {user.is_online && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                      @{user.username}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {user.is_online ? 'Sedang online' : 'Offline'}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
