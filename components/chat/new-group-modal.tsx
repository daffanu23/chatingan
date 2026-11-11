'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

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

    // Create group conversation
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

    // Add members
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#008069] dark:bg-[#202c33] text-white">
          <h2 className="text-lg font-semibold">Buat Grup Baru</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Group Name Field */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] mb-1.5">
              Subjek Grup
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ketik nama grup..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33] px-3.5 py-2.5 text-sm text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] focus:border-[#00a884] focus:outline-none"
            />
          </div>

          {/* Selected Badges */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedUsers.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-[#e7fce3] dark:bg-[#005c4b]/50 px-3 py-1 text-xs font-medium text-[#008069] dark:text-[#25d366]"
                >
                  {user.username}
                  <button
                    onClick={() => toggleUser(user)}
                    className="hover:text-red-500 font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search Users Input */}
          <div className="pt-1">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cari anggota untuk ditambahkan..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33] px-3.5 py-2 text-sm text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] focus:border-[#00a884] focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-48 overflow-y-auto px-2 divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
          {loading ? (
            <p className="text-center text-xs text-[#8696a0] py-4">Mencari...</p>
          ) : results.length > 0 ? (
            results.map((user) => {
              const isSelected = selectedUsers.some((u) => u.id === user.id)
              return (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors ${
                    isSelected ? 'bg-[#e7fce3]/60 dark:bg-[#005c4b]/30' : ''
                  }`}
                >
                  <div className="h-9 w-9 rounded-full bg-[#54656f] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-[#111b21] dark:text-[#e9edef] flex-1 text-left truncate">
                    {user.username}
                  </p>
                  {isSelected ? (
                    <span className="text-[#00a884] font-bold text-sm">✓ Terpilih</span>
                  ) : (
                    <span className="text-xs text-gray-400">+ Tambah</span>
                  )}
                </button>
              )
            })
          ) : search.length >= 2 ? (
            <p className="text-center text-xs text-[#8696a0] py-4">Pengguna tidak ditemukan</p>
          ) : null}
        </div>

        {/* Footer Button */}
        <div className="p-4 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-[#e9edef] dark:border-[#222d34]">
          <button
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || selectedUsers.length === 0 || creating}
            className="w-full rounded-xl bg-[#00a884] hover:bg-[#008f6f] px-4 py-2.5 text-sm font-semibold text-white shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
