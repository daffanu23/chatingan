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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Mulai Obrolan Baru</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-slate-800/60 rounded-xl px-3 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cari username kontak..."
              autoFocus
              className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto px-2 pb-4 space-y-1">
          {loading ? (
            <p className="text-center text-xs text-slate-400 py-6">Mencari...</p>
          ) : results.length > 0 ? (
            results.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                disabled={creating}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-100/80 dark:hover:bg-slate-800/60 disabled:opacity-50 transition-colors text-left"
              >
                <div className={`h-10 w-10 rounded-2xl bg-gradient-to-tr ${getGradient(user.username)} flex items-center justify-center text-white text-xs font-semibold shadow-xs shrink-0`}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user.username}</p>
                  <p className="text-[10px] text-slate-400">
                    {user.is_online ? '● Online' : 'Offline'}
                  </p>
                </div>
              </button>
            ))
          ) : search.length >= 2 ? (
            <p className="text-center text-xs text-slate-400 py-6">Pengguna tidak ditemukan</p>
          ) : (
            <p className="text-center text-xs text-slate-400 py-6">
              Ketik minimal 2 huruf untuk mencari
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
