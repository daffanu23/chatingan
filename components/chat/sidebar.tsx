'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { Profile } from '@/lib/types'
import { requestNotificationPermission } from '@/lib/utils/notifications'

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

  // Filter conversations based on search
  const filteredConversations = conversations.filter((c) =>
    getConversationName(c).toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#202c33]">
      {/* Top Header Bar (WA Web Style) */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#e9edef] dark:border-[#222d34]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white text-base font-semibold shadow-xs">
            {currentUser.username.charAt(0).toUpperCase()}
          </div>
          <div className="leading-tight">
            <span className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">
              {currentUser.username}
            </span>
            <span className="block text-[11px] text-[#00a884] font-medium">Online</span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 text-[#54656f] dark:text-[#aebac1]">
          <button
            onClick={onNewChat}
            title="Chat Baru"
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#374248] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="8" x2="12" y2="14"/>
              <line x1="9" y1="11" x2="15" y2="11"/>
            </svg>
          </button>

          <button
            onClick={onNewGroup}
            title="Grup Baru"
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#374248] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </button>

          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-2 rounded-full hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* WhatsApp Desktop Notification Banner if not granted */}
      {notifPermission === 'default' && (
        <div className="bg-[#53bdeb] dark:bg-[#182229] px-4 py-3 flex items-center justify-between text-white border-b border-black/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold">Aktifkan Notifikasi</p>
              <p className="text-[11px] text-white/80">Dapatkan notifikasi pesan baru di desktop</p>
            </div>
          </div>
          <button
            onClick={handleEnableNotification}
            className="px-2.5 py-1 bg-white text-[#111b21] text-xs font-bold rounded-full hover:bg-white/90 transition-all shadow-xs"
          >
            Nyalakan
          </button>
        </div>
      )}

      {/* Search Bar Container */}
      <div className="p-2 bg-white dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#202c33]">
        <div className="flex items-center gap-2 bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg px-3 py-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari atau mulai chat baru"
            className="w-full bg-transparent text-sm text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] focus:outline-none"
          />
        </div>
      </div>

      {/* Quick Action Badges */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#111b21] border-b border-[#f0f2f5] dark:border-[#202c33]">
        <button
          onClick={onNewChat}
          className="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold bg-[#e7fce3] dark:bg-[#005c4b]/50 text-[#008069] dark:text-[#25d366] hover:bg-[#d4f9cc] transition-all text-center"
        >
          + Chat Kontak
        </button>
        <button
          onClick={onNewGroup}
          className="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold bg-gray-100 dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 transition-all text-center"
        >
          + Buat Grup
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8696a0] px-4 text-center">
            <span className="text-4xl mb-3">💬</span>
            <p className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">Belum ada pesan</p>
            <p className="text-xs mt-1">Mulai obrolan baru dengan teman atau buat grup pertama Anda!</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedId === conv.id
            const isGrp = conv.type === 'group'
            const unread = unreadCounts[conv.id] || 0

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors text-left ${
                  isSelected ? 'bg-[#f0f2f5] dark:bg-[#2a3942]' : ''
                }`}
              >
                {/* Avatar with Online Badge */}
                <div className="relative shrink-0">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-base font-semibold shadow-sm ${
                    isGrp ? 'bg-[#54656f] dark:bg-[#6b7c85]' : 'bg-[#00a884]'
                  }`}>
                    {getAvatarInitial(conv)}
                  </div>
                  {isOnline(conv) && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[#25d366] border-2 border-white dark:border-[#111b21]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-[#111b21] dark:text-[#e9edef]' : 'font-medium text-[#111b21] dark:text-[#e9edef]'}`}>
                      {getConversationName(conv)}
                    </span>
                    {conv.lastMessage && (
                      <span className={`text-[11px] shrink-0 ml-2 ${unread > 0 ? 'text-[#25d366] font-bold' : 'text-[#667781] dark:text-[#8696a0]'}`}>
                        {formatTime(conv.lastMessage.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#667781] dark:text-[#8696a0] truncate">
                    <div className="truncate flex-1 pr-2">
                      {conv.lastMessage ? (
                        conv.lastMessage.type === 'image' ? (
                          <span className="flex items-center gap-1 text-[#00a884]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                              <circle cx="9" cy="9" r="2"/>
                              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                            </svg>
                            Foto
                          </span>
                        ) : (
                          <span className={`truncate ${unread > 0 ? 'font-semibold text-[#111b21] dark:text-[#e9edef]' : ''}`}>
                            {conv.lastMessage.content}
                          </span>
                        )
                      ) : (
                        <span className="italic text-gray-400">Belum ada obrolan</span>
                      )}
                    </div>

                    {/* WhatsApp Green Unread Badge */}
                    {unread > 0 && (
                      <span className="wa-badge">
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
