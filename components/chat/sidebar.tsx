'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { Profile } from '@/lib/types'
import { requestNotificationPermission } from '@/lib/utils/notifications'
import { ThemeToggle } from '@/components/theme-toggle'

type ConversationItem = {
  id: string
  type: 'dm' | 'group'
  name: string | null
  avatar_url: string | null
  conversation_members: {
    user_id: string
    role: string
    profiles: Profile
  }[]
  lastMessage: {
    content: string | null
    type: string
    created_at: string
  } | null
}

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

export default function Sidebar({
  currentUser,
  conversations,
  selectedId,
  unreadCounts = {},
  onSelect,
  onNewChat,
  onNewGroup,
}: {
  currentUser: Profile
  conversations: ConversationItem[]
  selectedId: string | null
  unreadCounts?: Record<string, number>
  onSelect: (id: string) => void
  onNewChat: () => void
  onNewGroup: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'dm' | 'group'>('all')
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  async function handleEnableNotification() {
    const res = await requestNotificationPermission()
    setNotifPermission(res)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function getConversationName(conv: ConversationItem): string {
    if (conv.type === 'group') return conv.name ?? 'Grup'
    const otherMember = conv.conversation_members.find(
      (m) => m.user_id !== currentUser.id
    )
    return otherMember?.profiles.username ?? 'Pengguna'
  }

  function getAvatarInitial(conv: ConversationItem): string {
    if (conv.type === 'group') return '👥'
    const otherMember = conv.conversation_members.find(
      (m) => m.user_id !== currentUser.id
    )
    return otherMember?.profiles.username?.charAt(0).toUpperCase() ?? '?'
  }

  function isOnline(conv: ConversationItem): boolean {
    if (conv.type === 'group') return false
    const otherMember = conv.conversation_members.find(
      (m) => m.user_id !== currentUser.id
    )
    return otherMember?.profiles.is_online ?? false
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Kemarin'
    } else if (days < 7) {
      return date.toLocaleDateString('id-ID', { weekday: 'short' })
    }
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })
  }

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = getConversationName(c).toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (activeTab === 'dm') return c.type === 'dm'
    if (activeTab === 'group') return c.type === 'group'
    return true
  })

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
              {currentUser.username.charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white leading-tight block">
              {currentUser.username}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Online</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Chat Baru / Tambah User berdasarkan Username */}
          <button
            onClick={onNewChat}
            title="Tambah Kontak / Chat Baru"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tambah Kontak / Chat Baru"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </button>

          {/* Buat Grup Baru (Ikon Grup / Kumpulan Anggota) */}
          <button
            onClick={onNewGroup}
            title="Buat Grup Baru"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Buat Grup Baru"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>

          <ThemeToggle />

          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors ml-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Notification Banner if permission default */}
      {notifPermission === 'default' && (
        <div className="bg-indigo-50/90 dark:bg-indigo-950/40 px-3.5 py-2.5 flex items-center justify-between text-indigo-900 dark:text-indigo-200 border-b border-indigo-100 dark:border-indigo-900/50">
          <div className="flex items-center gap-2.5">
            <span className="text-sm">🔔</span>
            <p className="text-xs font-medium">Nyalakan notifikasi desktop?</p>
          </div>
          <button
            onClick={handleEnableNotification}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded-lg transition-all"
          >
            Izinkan
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-slate-800/60 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari obrolan..."
            className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 px-3.5 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Semua
        </button>
        <button
          onClick={() => setActiveTab('dm')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
            activeTab === 'dm'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Privat
        </button>
        <button
          onClick={() => setActiveTab('group')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
            activeTab === 'group'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Grup
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center px-4">
            <span className="text-3xl mb-2 opacity-50">💬</span>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Belum ada percakapan</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Mulai obrolan baru dengan teman Anda.</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedId === conv.id
            const unread = unreadCounts[conv.id] || 0
            const name = getConversationName(conv)
            const gradient = getGradient(name)

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100'
                    : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-slate-900 dark:text-white'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className={`h-11 w-11 rounded-2xl bg-gradient-to-tr ${gradient} flex items-center justify-center text-white text-sm font-semibold shadow-xs`}>
                    {getAvatarInitial(conv)}
                  </div>
                  {isOnline(conv) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>
                      {name}
                    </span>
                    {conv.lastMessage && (
                      <span className={`text-[10px] shrink-0 ml-2 ${unread > 0 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400'}`}>
                        {formatTime(conv.lastMessage.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className={`truncate flex-1 pr-2 text-[11px] ${unread > 0 ? 'font-semibold text-slate-900 dark:text-white' : ''}`}>
                      {conv.lastMessage ? (
                        conv.lastMessage.type === 'image' ? (
                          <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                            📷 Foto
                          </span>
                        ) : (
                          conv.lastMessage.content
                        )
                      ) : (
                        <span className="italic text-slate-400 text-[11px]">Belum ada pesan</span>
                      )}
                    </span>

                    {/* Modern Badge */}
                    {unread > 0 && (
                      <span className="chat-unread-badge shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
