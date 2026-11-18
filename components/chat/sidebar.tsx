'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  localDb,
  deleteLocalConversation,
  togglePinConversation,
  toggleArchiveConversation,
  deduplicateLocalConversations,
} from '@/lib/db/schema'
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
  onDeleteConversation,
}: {
  currentUser: Profile
  selectedId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onNewGroup: () => void
  onDeleteConversation?: (id: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'dm' | 'group' | 'archived'>('all')
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState({ deviceName: 'Browser', deviceId: '' })

  // State untuk Action Sheet & Dialog Hapus Obrolan
  const [actionMenuConv, setActionMenuConv] = useState<LocalConversation | null>(null)
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<LocalConversation | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const isLongPressTriggeredRef = useRef(false)

  const supabase = createClient()
  const router = useRouter()

  // Otomatis deduplikasi jika ada DM duplikat dengan kontak yang sama
  useEffect(() => {
    if (currentUser?.id) {
      deduplicateLocalConversations(currentUser.id)
    }
  }, [currentUser?.id])

  // Ambil daftar percakapan 100% dari IndexedDB lokal secara reaktif via Dexie
  // Hitung unread count live dari tabel messages
  const localConversations = useLiveQuery(
    async () => {
      const convs = await localDb.conversations.toArray()
      const enhanced = await Promise.all(
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

      // Sort: Yang di-pin selalu paling atas, lalu urutkan berdasarkan updated_at DESC
      return enhanced.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        const timeA = typeof a.updated_at === 'number' ? a.updated_at : new Date(a.updated_at || 0).getTime()
        const timeB = typeof b.updated_at === 'number' ? b.updated_at : new Date(b.updated_at || 0).getTime()
        return timeB - timeA
      })
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
  }, [currentUser.id])

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

  // Touch & Long Press Handler
  function handleTouchStart(conv: LocalConversation, e: React.TouchEvent) {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    isLongPressTriggeredRef.current = false

    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true
      // Trigger vibrasi haptic di HP jika didukung
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(50)
      }
      setActionMenuConv(conv)
    }, 550)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)
    // Jika bergeser lebih dari 10px (sedang scroll), batalkan hold
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handleTouchEnd() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  async function handleTogglePin(conv: LocalConversation) {
    await togglePinConversation(conv.id)
    setActionMenuConv(null)
  }

  async function handleToggleArchive(conv: LocalConversation) {
    await toggleArchiveConversation(conv.id)
    setActionMenuConv(null)
  }

  async function handleExecuteDelete() {
    if (!confirmDeleteConv) return
    const idToDelete = confirmDeleteConv.id
    setConfirmDeleteConv(null)
    setActionMenuConv(null)

    await deleteLocalConversation(idToDelete)
    if (onDeleteConversation) {
      onDeleteConversation(idToDelete)
    }
  }

  const archivedCount = localConversations.filter((c) => c.is_archived).length

  const filteredConversations = localConversations.filter((c) => {
    const name = getConversationName(c)
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false

    if (activeTab === 'archived') {
      return Boolean(c.is_archived)
    }

    // Tab 'all', 'dm', 'group' menyembunyikan chat yang diarsipkan
    if (c.is_archived) return false

    if (activeTab === 'dm') return c.type === 'dm'
    if (activeTab === 'group') return c.type === 'group'
    return true
  })

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 select-none">
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
      <div className="flex items-center gap-1.5 px-3.5 pb-2 text-xs overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors shrink-0 ${
            activeTab === 'all'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Semua
        </button>
        <button
          onClick={() => setActiveTab('dm')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors shrink-0 ${
            activeTab === 'dm'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Privat
        </button>
        <button
          onClick={() => setActiveTab('group')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors shrink-0 ${
            activeTab === 'group'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Grup
        </button>

        {archivedCount > 0 && (
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 flex items-center gap-1 ${
              activeTab === 'archived'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>📁 Arsip</span>
            <span className="text-[10px] px-1 py-0.2 bg-slate-200 dark:bg-slate-700 rounded-full">
              {archivedCount}
            </span>
          </button>
        )}
      </div>

      {/* Conversations List (100% dari IndexedDB Lokal) */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center px-4">
            <span className="text-3xl mb-2 opacity-50">
              {activeTab === 'archived' ? '📁' : '💬'}
            </span>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {activeTab === 'archived' ? 'Tidak ada obrolan terarsip' : 'Belum ada obrolan lokal'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {activeTab === 'archived'
                ? 'Tahan lama obrolan untuk mengarsipkan obrolan penting.'
                : 'Mulai chat baru dengan teman atau impor cadangan dari perangkat lain.'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedId === conv.id
            const unread = conv.unread_count || 0
            const name = getConversationName(conv)
            const gradient = getGradient(name)
            const isPinned = Boolean(conv.is_pinned)

            return (
              <div
                key={conv.id}
                className="relative group"
                onTouchStart={(e) => handleTouchStart(conv, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setActionMenuConv(conv)
                }}
              >
                <button
                  onClick={() => {
                    if (isLongPressTriggeredRef.current) {
                      isLongPressTriggeredRef.current = false
                      return
                    }
                    onSelect(conv.id)
                  }}
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
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        {isPinned && (
                          <span className="text-xs text-indigo-500 shrink-0" title="Disematkan">
                            📌
                          </span>
                        )}
                        <span className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>
                          {name}
                        </span>
                      </div>
                      {conv.last_message && (
                        <span className={`text-[10px] shrink-0 ml-1 ${unread > 0 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400'}`}>
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
                          ) : conv.last_message.type === 'sticker' ? (
                            <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                              🎨 Stiker
                            </span>
                          ) : (
                            conv.last_message.content
                          )
                        ) : (
                          <span className="italic text-slate-400 text-[11px]">Belum ada pesan</span>
                        )}
                      </span>

                      {/* Badge / Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unread > 0 && (
                          <span className="chat-unread-badge shrink-0">
                            {unread}
                          </span>
                        )}
                        {/* 3-dots action trigger (Desktop hover & quick click) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActionMenuConv(conv)
                          }}
                          title="Pilihan obrolan"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-opacity"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1"/>
                            <circle cx="19" cy="12" r="1"/>
                            <circle cx="5" cy="12" r="1"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
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

      {/* WhatsApp-Style Action Menu Modal / Bottom Sheet */}
      {actionMenuConv && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setActionMenuConv(null)}
        >
          <div
            className="w-full sm:max-w-xs bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-4 shadow-xl border border-slate-200 dark:border-slate-800 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Opsi Obrolan
              </p>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {getConversationName(actionMenuConv)}
              </h4>
            </div>

            <div className="space-y-1">
              {/* Pin / Unpin */}
              <button
                onClick={() => handleTogglePin(actionMenuConv)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <span className="text-base">{actionMenuConv.is_pinned ? '📌' : '📍'}</span>
                <span>{actionMenuConv.is_pinned ? 'Lepas Sematan (Unpin)' : 'Sematkan Obrolan (Pin)'}</span>
              </button>

              {/* Archive / Unarchive */}
              <button
                onClick={() => handleToggleArchive(actionMenuConv)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <span className="text-base">📁</span>
                <span>{actionMenuConv.is_archived ? 'Buka Dari Arsip' : 'Arsipkan Obrolan'}</span>
              </button>

              {/* Hapus Obrolan */}
              <button
                onClick={() => {
                  setConfirmDeleteConv(actionMenuConv)
                  setActionMenuConv(null)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left"
              >
                <span className="text-base">🗑️</span>
                <span>Hapus Obrolan Ini</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setActionMenuConv(null)}
                className="w-full py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Hapus Obrolan */}
      {confirmDeleteConv && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setConfirmDeleteConv(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center text-lg shrink-0">
                🗑️
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Hapus Obrolan?
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Obrolan dengan <strong className="text-slate-900 dark:text-white">{getConversationName(confirmDeleteConv)}</strong> beserta semua riwayat pesan dan media akan dihapus permanen dari perangkat ini.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteConv(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteDelete}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
              >
                Hapus Obrolan
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackupModal && <BackupModal onClose={() => setShowBackupModal(false)} />}
    </div>
  )
}
