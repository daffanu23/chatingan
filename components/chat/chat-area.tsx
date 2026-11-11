'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/compress-image'
import { playNotificationSound } from '@/lib/utils/notifications'
import type { Profile, Message } from '@/lib/types'

type ConversationData = {
  id: string
  type: 'dm' | 'group'
  name: string | null
  conversation_members: {
    user_id: string
    role: string
    profiles: Profile
  }[]
}

type MessageSender = Pick<Profile, 'id' | 'username' | 'avatar_url'>

type MessageWithSender = Message & {
  profiles?: MessageSender | null
}

export default function ChatArea({
  conversation,
  currentUser,
  onBack,
}: {
  conversation: ConversationData
  currentUser: Profile
  onBack: () => void
}) {
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Mark unread messages as read
  const markAsRead = useCallback(async () => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .neq('sender_id', currentUser.id)
        .eq('is_read', false)
    } catch {
      // Ignore
    }
  }, [conversation.id, currentUser.id, supabase])

  // Fetch initial messages and mark as read
  useEffect(() => {
    async function fetchMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(id, username, avatar_url)')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .limit(100)

      if (data) {
        setMessages(data)
        markAsRead()
      }
    }
    fetchMessages()
  }, [conversation.id, markAsRead, supabase])

  // Subscribe to new messages & updates (for read receipts)
  useEffect(() => {
    const channel = supabase
      .channel(`chat-area:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message

          // If message is from someone else, play sound & mark read immediately
          if (newMsg.sender_id !== currentUser.id) {
            playNotificationSound()
            markAsRead()
          }

          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', newMsg.sender_id)
            .single()

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, { ...newMsg, profiles: profile ?? undefined }]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message
          // Update read status in local state
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedMsg.id
                ? { ...m, is_read: updatedMsg.is_read, read_at: updatedMsg.read_at }
                : m
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversation.id, currentUser.id, markAsRead, supabase])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || sending) return

    setSending(true)
    const content = newMessage.trim()
    setNewMessage('')

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      content,
      type: 'text',
      is_read: false,
    })

    if (error) {
      console.error('Failed to send message:', error)
      setNewMessage(content)
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    setSending(false)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress('Mengompresi gambar...')

    try {
      const originalSizeKb = (file.size / 1024).toFixed(0)

      // Client-side compression
      const compressed = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.7,
      })

      const compressedSizeKb = (compressed.size / 1024).toFixed(0)
      setUploadProgress(`Mengunggah (${originalSizeKb}KB ➔ ${compressedSizeKb}KB)...`)

      const fileName = `${conversation.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, compressed, {
          contentType: 'image/webp',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName)

      // Send image message
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: currentUser.id,
        type: 'image',
        image_url: urlData.publicUrl,
        content: null,
        is_read: false,
      })

      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
    } catch (error) {
      console.error('Failed to upload image:', error)
      alert('Gagal mengunggah gambar. Silakan coba lagi.')
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function getConversationTitle(): string {
    if (conversation.type === 'group') return conversation.name ?? 'Grup'
    const otherMember = conversation.conversation_members.find(
      (m) => m.user_id !== currentUser.id
    )
    return otherMember?.profiles.username ?? 'Pengguna'
  }

  function getMembersCount(): number {
    return conversation.conversation_members.length
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatDateSeparator(dateString: string): string {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'HARI INI'
    if (date.toDateString() === yesterday.toDateString()) return 'KEMARIN'
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).toUpperCase()
  }

  // Group messages by date
  const groupedMessages: { date: string; messages: MessageWithSender[] }[] = []
  messages.forEach((msg) => {
    const dateKey = new Date(msg.created_at).toDateString()
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.messages.push(msg)
    } else {
      groupedMessages.push({ date: dateKey, messages: [msg] })
    }
  })

  return (
    <div className="flex flex-col h-full bg-[#efeae2] dark:bg-[#0b141a]">
      {/* WhatsApp Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#e9edef] dark:border-[#222d34] z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="md:hidden text-[#54656f] dark:text-[#aebac1] p-1 -ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-[#374248]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>

          <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white text-base font-semibold shadow-xs">
            {conversation.type === 'group' ? '👥' : getConversationTitle().charAt(0).toUpperCase()}
          </div>

          <div className="leading-tight">
            <h2 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">
              {getConversationTitle()}
            </h2>
            <p className="text-[11px] text-[#667781] dark:text-[#8696a0]">
              {conversation.type === 'group'
                ? `${getMembersCount()} anggota`
                : conversation.conversation_members.find(
                    (m) => m.user_id !== currentUser.id
                  )?.profiles.is_online
                ? 'online'
                : 'terakhir dilihat baru-baru ini'}
            </p>
          </div>
        </div>

        {/* Header Right Icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => playNotificationSound()}
            title="Tes Suara Notifikasi"
            className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#374248] text-[#54656f] dark:text-[#aebac1] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-white/70 dark:bg-[#111b21]/70 text-[#00a884] font-medium border border-[#00a884]/20 shadow-xs">
            {conversation.type === 'group' ? 'Grup' : 'Privat'}
          </span>
        </div>
      </div>

      {/* Messages Scroll Area with WA background doodle */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 py-4 wa-chat-bg">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* WhatsApp Date Chip */}
            <div className="flex items-center justify-center my-3">
              <span className="text-[11px] font-semibold tracking-wider text-[#54656f] dark:text-[#8696a0] bg-white/90 dark:bg-[#182229]/90 px-3 py-1 rounded-md shadow-xs border border-black/5 dark:border-white/5">
                {formatDateSeparator(group.messages[0].created_at)}
              </span>
            </div>

            {group.messages.map((msg, idx) => {
              const isMe = msg.sender_id === currentUser.id
              const sender = msg.profiles
              const prevMsg = idx > 0 ? group.messages[idx - 1] : null
              const isFirstInSeries = !prevMsg || prevMsg.sender_id !== msg.sender_id

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${
                    isFirstInSeries ? 'mt-2.5' : 'mt-1'
                  }`}
                >
                  {/* Bubble Container */}
                  <div
                    className={`relative max-w-[85%] md:max-w-[65%] rounded-lg px-3 py-1.5 shadow-xs ${
                      isMe
                        ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none'
                        : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none'
                    }`}
                  >
                    {/* Sender name for group chats */}
                    {!isMe && conversation.type === 'group' && isFirstInSeries && (
                      <p className="text-[11px] font-bold text-[#008069] dark:text-[#25d366] mb-1">
                        {sender?.username ?? 'Pengguna'}
                      </p>
                    )}

                    {/* Image Attachment */}
                    {msg.type === 'image' && msg.image_url && (
                      <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-black/20">
                        <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={msg.image_url}
                            alt="Foto"
                            className="rounded-md max-w-full max-h-72 object-cover hover:opacity-95 transition-opacity cursor-pointer"
                            loading="lazy"
                          />
                        </a>
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.content && (
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words pr-12">
                        {msg.content}
                      </p>
                    )}

                    {/* Time & Real Delivery / Read Checkmark */}
                    <div className="flex items-center justify-end gap-1 float-right -mt-2 -mr-1 ml-2 text-[10px] text-[#667781] dark:text-[#8696a0]">
                      <span>{formatTime(msg.created_at)}</span>
                      {isMe && (
                        <span
                          className={msg.is_read ? 'text-[#53bdeb] font-bold' : 'text-[#8696a0]'}
                          title={msg.is_read ? 'Dibaca (Centang Biru)' : 'Terkirim (Belum dibaca)'}
                        >
                          ✓✓
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload Progress Bar if uploading */}
      {uploadProgress && (
        <div className="bg-[#e7fce3] dark:bg-[#005c4b] px-4 py-2 text-xs text-[#008069] dark:text-[#d9fdd3] flex items-center justify-between border-t border-[#00a884]/20 animate-pulse">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>{uploadProgress}</span>
          </div>
          <span className="font-semibold text-[11px]">Sistem Kompresi Aktif</span>
        </div>
      )}

      {/* Input Bar (WA Web Style) */}
      <div className="bg-[#f0f2f5] dark:bg-[#202c33] px-3 py-2.5 border-t border-[#e9edef] dark:border-[#222d34]">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-5xl mx-auto">
          {/* File Picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Kirim Gambar (Otomatis Dikompresi)"
            className="p-2 text-[#54656f] dark:text-[#aebac1] hover:text-[#111b21] dark:hover:text-white rounded-full hover:bg-gray-200 dark:hover:bg-[#374248] transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Ketik pesan..."
            className="flex-1 bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] dark:placeholder-[#8696a0] rounded-lg px-4 py-2.5 text-sm focus:outline-none shadow-2xs border border-transparent focus:border-gray-200 dark:focus:border-gray-700"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-full shadow-sm disabled:opacity-40 disabled:hover:bg-[#00a884] transition-all flex items-center justify-center shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
