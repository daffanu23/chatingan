'use client'

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '@/lib/db/schema'
import { syncEngine } from '@/lib/sync/sync-engine'
import type { Profile } from '@/lib/types'
import Sidebar from './sidebar'
import ChatArea from './chat-area'
import NewChatModal from './new-chat-modal'
import NewGroupModal from './new-group-modal'

export default function ChatLayout({
  currentUser,
}: {
  currentUser: Profile
}) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ sender: string; text: string } | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [mobileShowChat, setMobileShowChat] = useState(false)

  // Ambil daftar percakapan 100% dari IndexedDB lokal secara reaktif beserta unread count live
  const conversations = useLiveQuery(
    async () => {
      const convs = await localDb.conversations.toArray()
      if (!currentUser?.id) return convs
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
    [currentUser?.id]
  ) || []

  // Ambil percakapan yang sedang dipilih
  const selectedConv = conversations.find((c) => c.id === selectedConversationId) ?? null

  // Inisialisasi SyncEngine (Device registration, WebSockets, offline queue drain, persistent storage)
  useEffect(() => {
    if (currentUser?.id) {
      syncEngine.initialize(currentUser.id)
      syncEngine.setNotificationCallback((sender, text) => {
        setToast({ sender, text })
        setTimeout(() => setToast(null), 5000)
      })
    }
  }, [currentUser?.id])

  // Update dynamic document title ketika ada unread messages di IndexedDB
  useEffect(() => {
    const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0)
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Pulse — Obrolan Baru`
    } else {
      document.title = 'Pulse — Hybrid Local-First Chat'
    }
  }, [conversations])

  function handleSelectConversation(id: string) {
    setSelectedConversationId(id)
    setMobileShowChat(true)
  }

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 relative">
      {/* Aesthetic Toast Notification Banner */}
      {toast && (
        <div
          className="modern-toast cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setToast(null)}
        >
          <div className="h-7 w-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
            ✦
          </div>
          <div className="min-w-0 pr-1">
            <p className="text-xs font-semibold leading-tight truncate">{toast.sender}</p>
            <p className="text-[11px] text-slate-300 truncate max-w-[220px] mt-0.5">{toast.text}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setToast(null)
            }}
            className="text-slate-400 hover:text-white text-xs ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="flex w-full h-full overflow-hidden">
        {/* Sidebar: Full screen on mobile saat chat tidak aktif, fixed width di desktop */}
        <div
          className={`${
            mobileShowChat ? 'hidden' : 'flex'
          } md:flex w-full md:w-[340px] lg:w-[380px] flex-col shrink-0 h-full`}
        >
          <Sidebar
            currentUser={currentUser}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            onNewChat={() => setShowNewChat(true)}
            onNewGroup={() => setShowNewGroup(true)}
          />
        </div>

        {/* Chat Area: Full screen on mobile saat chat dipilih, flex-1 di desktop */}
        <div
          className={`${
            !mobileShowChat ? 'hidden' : 'flex'
          } md:flex flex-1 flex-col h-full overflow-hidden bg-white dark:bg-slate-900`}
        >
          {selectedConv ? (
            <ChatArea
              conversation={selectedConv}
              currentUser={currentUser}
              onBack={() => setMobileShowChat(false)}
            />
          ) : (
            /* Modern Aesthetic Empty State */
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950">
              <div className="max-w-sm space-y-4 flex flex-col items-center">
                <div className="h-16 w-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl shadow-sm">
                  ⚡
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Pilih Obrolan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Pesan disimpan 100% di browser Anda (Local-First IndexedDB) dan tersinkronisasi instan ke seluruh perangkat aktif Anda.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium text-xs hover:opacity-90 transition-opacity"
                >
                  Mulai Chat Baru
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          currentUser={currentUser}
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => {
            setShowNewChat(false)
            handleSelectConversation(id)
          }}
        />
      )}
      {showNewGroup && (
        <NewGroupModal
          currentUser={currentUser}
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => {
            setShowNewGroup(false)
            handleSelectConversation(id)
          }}
        />
      )}
    </div>
  )
}
