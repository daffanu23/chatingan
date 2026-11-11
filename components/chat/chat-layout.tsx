'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import Sidebar from './sidebar'
import ChatArea from './chat-area'
import NewChatModal from './new-chat-modal'
import NewGroupModal from './new-group-modal'
import { playNotificationSound, showDesktopNotification } from '@/lib/utils/notifications'

type ConversationWithDetails = {
  id: string
  type: 'dm' | 'group'
  name: string | null
  avatar_url: string | null
  created_by: string
  created_at: string
  updated_at: string
  conversation_members: {
    user_id: string
    role: string
    profiles: Profile
  }[]
  lastMessage: {
    id: string
    content: string | null
    type: string
    created_at: string
    sender_id: string
  } | null
}

export default function ChatLayout({
  currentUser,
  initialConversations,
  initialUnreadCounts = {},
}: {
  currentUser: Profile
  initialConversations: ConversationWithDetails[]
  initialUnreadCounts?: Record<string, number>
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(initialUnreadCounts)
  const [toast, setToast] = useState<{ sender: string; text: string } | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [mobileShowChat, setMobileShowChat] = useState(false)

  const selectedConvRef = useRef<string | null>(null)
  selectedConvRef.current = selectedConversation

  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations

  const supabase = createClient()

  // Update dynamic document title when there are unread messages
  useEffect(() => {
    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Pulse — Obrolan Baru`
    } else {
      document.title = 'Pulse — Modern Chat'
    }
  }, [unreadCounts])

  // Realtime subscription for conversation membership & new messages
  useEffect(() => {
    const channel = supabase
      .channel('chat-global-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          refreshConversations()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMessage = payload.new as {
            id: string
            conversation_id: string
            content: string | null
            type: string
            created_at: string
            sender_id: string
          }

          // Update conversation list & last message
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === newMessage.conversation_id)
            if (!exists) {
              refreshConversations()
              return prev
            }
            return prev
              .map((conv) =>
                conv.id === newMessage.conversation_id
                  ? { ...conv, lastMessage: newMessage, updated_at: newMessage.created_at }
                  : conv
              )
              .sort(
                (a, b) =>
                  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
              )
          })

          // Handle Notifications if message is from someone else
          if (newMessage.sender_id !== currentUser.id) {
            playNotificationSound()

            const conv = conversationsRef.current.find(
              (c) => c.id === newMessage.conversation_id
            )
            let senderName = 'Pesan Baru'
            if (conv) {
              if (conv.type === 'group') {
                const member = conv.conversation_members.find(
                  (m) => m.user_id === newMessage.sender_id
                )
                senderName = `${member?.profiles.username || 'Anggota'} (${conv.name || 'Grup'})`
              } else {
                const other = conv.conversation_members.find(
                  (m) => m.user_id !== currentUser.id
                )
                senderName = other?.profiles.username || 'Kontak'
              }
            }

            const messageText =
              newMessage.type === 'image'
                ? '📷 Mengirim sebuah foto'
                : newMessage.content || 'Pesan baru'

            setToast({ sender: senderName, text: messageText })
            setTimeout(() => setToast(null), 5000)

            showDesktopNotification(senderName, {
              body: messageText,
            })

            if (selectedConvRef.current !== newMessage.conversation_id) {
              setUnreadCounts((prev) => ({
                ...prev,
                [newMessage.conversation_id]: (prev[newMessage.conversation_id] || 0) + 1,
              }))
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updatedMessage = payload.new as {
            id: string
            conversation_id: string
            is_read: boolean
          }
          setConversations((prev) =>
            prev.map((c) =>
              c.lastMessage?.id === updatedMessage.id
                ? {
                    ...c,
                    lastMessage: {
                      ...c.lastMessage,
                      is_read: updatedMessage.is_read,
                    },
                  }
                : c
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser.id, supabase])

  const refreshConversations = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_members (
          user_id,
          role,
          profiles (
            id,
            username,
            avatar_url,
            is_online
          )
        ),
        messages (
          id,
          content,
          type,
          created_at,
          sender_id,
          is_read
        )
      `)
      .order('updated_at', { ascending: false })

    if (data) {
      const mapped = data.map((conv) => {
        const sorted = (conv.messages ?? []).sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        return { ...conv, lastMessage: sorted[0] ?? null }
      })
      setConversations(mapped as ConversationWithDetails[])
    }
  }, [supabase])

  const selectedConv = conversations.find((c) => c.id === selectedConversation) ?? null

  function handleSelectConversation(id: string) {
    setSelectedConversation(id)
    setMobileShowChat(true)

    setUnreadCounts((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
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
        {/* Sidebar: Full screen on mobile when no chat is open, fixed width on desktop */}
        <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex w-full md:w-[340px] lg:w-[380px] flex-col shrink-0 h-full`}>
          <Sidebar
            currentUser={currentUser}
            conversations={conversations}
            selectedId={selectedConversation}
            unreadCounts={unreadCounts}
            onSelect={handleSelectConversation}
            onNewChat={() => setShowNewChat(true)}
            onNewGroup={() => setShowNewGroup(true)}
          />
        </div>

        {/* Chat Area: Full screen on mobile when chat is selected, flex-1 on desktop */}
        <div className={`${!mobileShowChat ? 'hidden' : 'flex'} md:flex flex-1 flex-col h-full overflow-hidden bg-white dark:bg-slate-900`}>
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
                  💬
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Pilih Obrolan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Pilih salah satu percakapan di sebelah kiri atau mulai obrolan baru dengan teman.
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
            refreshConversations()
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
            refreshConversations()
            handleSelectConversation(id)
          }}
        />
      )}
    </div>
  )
}
