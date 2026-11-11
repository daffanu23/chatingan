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
      document.title = `(${totalUnread}) WhatsApp Web`
    } else {
      document.title = 'WhatsApp Web'
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
            // 1. Play incoming message chime
            playNotificationSound()

            // 2. Find sender name
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

            // 3. Show in-app green toast popup banner
            setToast({ sender: senderName, text: messageText })
            setTimeout(() => setToast(null), 5000)

            // 4. Show desktop popup notification
            showDesktopNotification(senderName, {
              body: messageText,
            })

            // 5. Increment unread count if user is not currently looking at this conversation
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

    // Clear unread count for this conversation
    setUnreadCounts((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f0f2f5] dark:bg-[#0c1317] relative">
      {/* In-app Toast Notification Banner */}
      {toast && (
        <div
          className="wa-toast cursor-pointer hover:opacity-95 transition-opacity"
          onClick={() => {
            setToast(null)
          }}
        >
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-base shrink-0">
            💬
          </div>
          <div className="min-w-0 pr-2">
            <p className="text-xs font-bold leading-tight truncate">{toast.sender}</p>
            <p className="text-[11px] text-white/90 truncate max-w-[240px] mt-0.5">{toast.text}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setToast(null)
            }}
            className="text-white/70 hover:text-white text-xs ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Container simulating WA Web wrapper on desktop */}
      <div className="flex w-full h-full md:max-w-[1700px] md:mx-auto md:my-0 bg-white dark:bg-[#111b21] shadow-2xl overflow-hidden">
        {/* Sidebar */}
        <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex w-full md:w-[380px] lg:w-[420px] flex-col shrink-0`}>
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

        {/* Chat Area */}
        <div className={`${!mobileShowChat ? 'hidden' : 'flex'} md:flex flex-1 flex-col h-full overflow-hidden`}>
          {selectedConv ? (
            <ChatArea
              conversation={selectedConv}
              currentUser={currentUser}
              onBack={() => setMobileShowChat(false)}
            />
          ) : (
            /* WhatsApp Web Default Empty State */
            <div className="flex flex-1 flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#222e35] p-8 text-center border-b-[6px] border-[#00a884]">
              <div className="max-w-md space-y-4">
                <div className="w-48 h-48 mx-auto opacity-75 flex items-center justify-center rounded-full bg-[#e9edef] dark:bg-[#182229] text-7xl shadow-inner">
                  💬
                </div>
                <h1 className="text-3xl font-light text-[#41525d] dark:text-[#e9edef]">
                  WhatsApp Web
                </h1>
                <p className="text-sm text-[#667781] dark:text-[#8696a0] leading-relaxed">
                  Kirim dan terima pesan tanpa perlu menjaga ponsel Anda tetap online.
                  Gunakan WhatsApp di berbagai perangkat Anda sekaligus.
                </p>
                <div className="pt-8 flex items-center justify-center gap-2 text-xs text-[#8696a0]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span>Terenkripsi secara end-to-end</span>
                </div>
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
