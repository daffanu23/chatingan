'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '@/lib/db/schema'
import type { Profile } from '@/lib/types'
import type { LocalConversation } from '@/lib/db/types'
import { requestNotificationPermission } from '@/lib/utils/notifications'
import { ThemeToggle } from '@/components/theme-toggle'
import { BackupModal } from './backup-modal'
import { getClientDeviceInfo } from '@/lib/device/client-device'

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
  selectedId,
  onSelect,
  onNewChat,
  onNewGroup,
}: {
  currentUser: Profile
  selectedId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onNewGroup: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'dm' | 'group'>('all')
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState({ deviceName: 'Browser', deviceId: '' })
  const supabase = createClient()
  const router = useRouter()

  // Ambil daftar percakapan 100% dari IndexedDB lokal secara reaktif via Dexie
  // Hitung jumlah pesan belum terbaca (unread) secara live dari tabel messages
  const localConversations = useLiveQuery(
    async () => {
      const convs = await localDb.conversations.orderBy('updated_at').reverse().toArray()
      return Promise.all(
        convs.map(async (c) => {
          const unreadMsgsCount = await localDb.messages
            .where('conversation_id')
            .equals(c.id)
            .filter((m) => m.sender_id !== currentUser.id && !m.is_deleted && m.status < 3)
            .count()
          return {
            ...c,
            unread_count: Math.max(c.unread_count || 0, unreadMsgsCount),
          }
        })
      )
    },
    [currentUser.id]
  ) || []

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        setNotifPermission(Notification.permission)
      }
      const info = getClientDeviceInfo(currentUser.id)
      setDeviceInfo({ deviceName: info.deviceName, deviceId: info.deviceId })
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

  function getConversationName(conv: LocalConversation): string {
    if (conv.type === 'group') return conv.name ?? 'Grup'
    const otherMember = conv.members.find((m) => m.user_id !== currentUser.id)
    return otherMember?.username ?? conv.name ?? 'Pengguna'
  }

  function getAvatarInitial(conv: LocalConversation): string {
    if (conv.type === 'group') return '👥'
    const otherMember = conv.members.find((m) => m.user_id !== currentUser.id)
    return otherMember?.username?.charAt(0).toUpperCase() ?? '?'
  }

  function isOnline(conv: LocalConversation): boolean {
    if (conv.type === 'group') return false
    const otherMember = conv.members.find((m) => m.user_id !== currentUser.id)
    return otherMember?.is_online ?? false
  }

  function formatTime(timestamp: number | string | undefined): string {
    if (!timestamp) return ''
    const date = new Date(timestamp)
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

  const filteredConversations = localConversations.filter((c) => {
    const name = getConversationName(c)
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase())
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
          <div className="min-w-0">
            <span className="text-sm font-semibold text-slate-900 dark:text-white leading-tight block truncate">
              {currentUser.username}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              ⚡ Local-First Sync
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Chat Baru berdasarkan Username */}
          <button
            onClick={onNewChat}
            title="Tambah Kontak / Chat Baru (@username)"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </button>

          {/* Buat Grup Baru */}
          <button
            onClick={onNewGroup}
            title="Buat Grup Baru"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>

          {/* Cadangan / Backup Riwayat Chat */}
          <button
            onClick={() => setShowBackupModal(true)}
            title="Cadangkan & Pulihkan Chat (Multi-Device)"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
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

      {/* Notification Banner */}
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
            placeholder="Cari obrolan lokal..."
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

      {/* Conversations List (100% dari IndexedDB Lokal) */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center px-4">
            <span className="text-3xl mb-2 opacity-50">💬</span>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Belum ada percakapan lokal</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Mulai chat baru dengan teman atau impor cadangan dari perangkat lain.
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedId === conv.id
            const unread = conv.unread_count || 0
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
                    {conv.last_message && (
                      <span className={`text-[10px] shrink-0 ml-2 ${unread > 0 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400'}`}>
                        {formatTime(conv.last_message.server_ts || conv.last_message.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className={`truncate flex-1 pr-2 text-[11px] ${unread > 0 ? 'font-semibold text-slate-900 dark:text-white' : ''}`}>
                      {conv.last_message ? (
                        conv.last_message.is_deleted ? (
                          <span className="italic text-slate-400">🚫 Pesan terhapus</span>
                        ) : conv.last_message.type === 'image' ? (
                          <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                            📷 Foto
                          </span>
                        ) : (
                          conv.last_message.content
                        )
                      ) : (
                        <span className="italic text-slate-400 text-[11px]">Belum ada pesan</span>
                      )}
                    </span>

                    {/* Badge */}
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

      {/* Device Info Footer */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 text-[10px] text-slate-400 flex items-center justify-between">
        <span className="truncate">Perangkat: {deviceInfo.deviceName}</span>
        <button
          onClick={() => setShowBackupModal(true)}
          className="text-indigo-500 hover:underline shrink-0"
        >
          Cadangkan
        </button>
      </div>

      {showBackupModal && <BackupModal onClose={() => setShowBackupModal(false)} />}
    </div>
  )
}
