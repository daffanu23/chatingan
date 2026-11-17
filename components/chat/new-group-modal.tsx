'use client'

import { useState } from 'react'
import { ulid } from 'ulid'
import { upsertLocalConversation } from '@/lib/db/schema'
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

export default function NewGroupModal({
  currentUser,
  onClose,
  onCreated,
}: {
  currentUser: Profile
  onClose: () => void
  onCreated: (conversationId: string) => void
}) {
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([])
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
      console.error('[NewGroup] Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleUser(user: Profile) {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.id === user.id)
      if (exists) return prev.filter((u) => u.id !== user.id)
      return [...prev, user]
    })
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || selectedUsers.length === 0) return

    setCreating(true)

    try {
      const convId = `grp_${ulid().toLowerCase()}`
      const members = [
        {
          user_id: currentUser.id,
          role: 'admin',
          username: currentUser.username,
          avatar_url: currentUser.avatar_url,
          is_online: true,
        },
        ...selectedUsers.map((u) => ({
          user_id: u.id,
          role: 'member',
          username: u.username,
          avatar_url: u.avatar_url,
          is_online: u.is_online,
        })),
      ]

      await upsertLocalConversation({
        id: convId,
        type: 'group',
        name: groupName.trim(),
        avatar_url: null,
        created_by: currentUser.id,
        members,
        unread_count: 0,
        updated_at: Date.now(),
        created_at: new Date().toISOString(),
        last_message: null,
      })

      onCreated(convId)
    } catch (err) {
      console.error('[NewGroup] Error creating group:', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Buat Grup Baru</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Pilih anggota dan beri nama grup
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Group Name input */}
        <div className="mt-4">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nama Grup..."
            className="w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Selected Users Chips */}
        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 max-h-20 overflow-y-auto">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                onClick={() => toggleUser(user)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[11px] font-medium cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-500 transition-colors"
                title="Klik untuk menghapus"
              >
                @{user.username}
                <span className="text-[10px]">✕</span>
              </span>
            ))}
          </div>
        )}

        {/* Search Input */}
        <div className="mt-3">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/60 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <span className="text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cari anggota..."
              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
          {loading ? (
            <p className="text-center text-xs text-slate-400 py-4">Mencari...</p>
          ) : results.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-4">
              {search.length < 2 ? 'Ketik nama anggota' : 'Tidak ditemukan'}
            </p>
          ) : (
            results.map((user) => {
              const isSelected = selectedUsers.some((u) => u.id === user.id)
              const gradient = getGradient(user.username)
              return (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-lg bg-gradient-to-tr ${gradient} flex items-center justify-center text-white text-[10px] font-semibold`}
                    >
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-slate-900 dark:text-white truncate">
                      @{user.username}
                    </span>
                  </div>
                  <div
                    className={`h-4 w-4 rounded-md border flex items-center justify-center text-[10px] ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {isSelected && '✓'}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Action Button */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Batal
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={creating || !groupName.trim() || selectedUsers.length === 0}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {creating ? 'Membuat...' : 'Buat Grup'}
          </button>
        </div>
      </div>
    </div>
  )
}
