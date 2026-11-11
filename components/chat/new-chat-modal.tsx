'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

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

  async function handleSelectUser(user: Profile) {
    setCreating(true)

    // Check if DM already exists
    const { data: existingConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUser.id)

    if (existingConvs) {
      for (const conv of existingConvs) {
        const { data: otherMembers } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('conversation_id', conv.conversation_id)
          .eq('user_id', user.id)

        if (otherMembers && otherMembers.length > 0) {
          const { data: convData } = await supabase
            .from('conversations')
            .select('id, type')
            .eq('id', conv.conversation_id)
            .eq('type', 'dm')
            .single()

          if (convData) {
            onCreated(convData.id)
            return
          }
        }
      }
    }

    // Create new DM conversation
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'dm',
        created_by: currentUser.id,
      })
      .select()
      .single()

    if (convError || !newConv) {
      console.error('Failed to create conversation:', convError)
      setCreating(false)
      return
    }

    // Add members
    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert([
        { conversation_id: newConv.id, user_id: currentUser.id, role: 'admin' },
        { conversation_id: newConv.id, user_id: user.id, role: 'member' },
      ])

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
        {/* WA Style Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#008069] dark:bg-[#202c33] text-white">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">Chat Baru</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search Input Container */}
        <div className="p-3 bg-[#f0f2f5] dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#222d34]">
          <div className="flex items-center gap-2 bg-white dark:bg-[#202c33] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cari berdasarkan username..."
              autoFocus
              className="w-full bg-transparent text-sm text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
          {loading ? (
            <p className="text-center text-xs text-[#8696a0] py-8">Mencari pengguna...</p>
          ) : results.length > 0 ? (
            results.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                disabled={creating}
                className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] disabled:opacity-50 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white text-sm font-semibold shrink-0 shadow-xs">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#111b21] dark:text-[#e9edef] truncate">{user.username}</p>
                  <p className="text-[11px] text-[#00a884]">
                    {user.is_online ? '● Online' : 'Offline'}
                  </p>
                </div>
              </button>
            ))
          ) : search.length >= 2 ? (
            <p className="text-center text-xs text-[#8696a0] py-8">Pengguna tidak ditemukan</p>
          ) : (
            <p className="text-center text-xs text-[#8696a0] py-8">
              Ketik minimal 2 karakter untuk mencari teman
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
