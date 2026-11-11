'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()

  async function handleSearch(query: string) {
    setSearch(query)
    if (query.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUser.id)
      .ilike('username', `%${query}%`)
      .limit(10)

    setResults(data ?? [])
    setLoading(false)
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

    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'group',
        name: groupName.trim(),
        created_by: currentUser.id,
      })
      .select()
      .single()

    if (convError || !newConv) {
      console.error('Failed to create group:', convError)
      setCreating(false)
      return
    }

    const members = [
      { conversation_id: newConv.id, user_id: currentUser.id, role: 'admin' as const },
      ...selectedUsers.map((u) => ({
        conversation_id: newConv.id,
        user_id: u.id,
        role: 'member' as const,
      })),
    ]

    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert(members)

    if (memberError) {
      console.error('Failed to add members:', memberError)
      setCreating(false)
      return
    }

    onCreated(newConv.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Buat Grup Baru</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Group Name Field */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
              Nama Grup
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Contoh: Tim Kerja / Teman Santai..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Selected Chips */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
                >
                  {user.username}
                  <button
                    onClick={() => toggleUser(user)}
                    className="hover:text-rose-500 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search Users Input */}
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cari anggota untuk ditambahkan..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-48 overflow-y-auto px-2 space-y-0.5">
          {loading ? (
            <p className="text-center text-xs text-slate-400 py-4">Mencari...</p>
          ) : results.length > 0 ? (
            results.map((user) => {
              const isSelected = selectedUsers.some((u) => u.id === user.id)
              return (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                    isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200' : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-slate-900 dark:text-white'
                  }`}
                >
                  <div className={`h-8 w-8 rounded-xl bg-gradient-to-tr ${getGradient(user.username)} flex items-center justify-center text-white text-[11px] font-semibold shrink-0`}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium flex-1 truncate">
                    {user.username}
                  </span>
                  {isSelected ? (
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">✓</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">+ Tambah</span>
                  )}
                </button>
              )
            })
          ) : search.length >= 2 ? (
            <p className="text-center text-xs text-slate-400 py-4">Pengguna tidak ditemukan</p>
          ) : null}
        </div>

        {/* Submit */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || selectedUsers.length === 0 || creating}
            className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm py-2.5 shadow-md shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {creating
              ? 'Membuat Grup...'
              : `Buat Grup (${selectedUsers.length + 1} anggota)`}
          </button>
        </div>
      </div>
    </div>
  )
}
