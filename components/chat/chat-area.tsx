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

  // Fetch initial messages
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

  // Subscribe to changes in conversation messages
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

          if (newMsg.sender_id !== currentUser.id) {
            playNotificationSound()
            markAsRead()
          }

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

  // Auto-scroll
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
      alert('Gagal mengunggah gambar.')
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

    if (date.toDateString() === today.toDateString()) return 'Hari Ini'
    if (date.toDateString() === yesterday.toDateString()) return 'Kemarin'
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const title = getConversationTitle()
  const gradient = getGradient(title)

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
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950">
      {/* Modern Top Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 z-10 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Mobile Back Button */}
          <button
            onClick={onBack}
            className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Kembali ke daftar obrolan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>

          <div className={`h-10 w-10 rounded-2xl bg-gradient-to-tr ${gradient} flex items-center justify-center text-white text-sm font-semibold shadow-xs shrink-0`}>
            {conversation.type === 'group' ? '👥' : title.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {title}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {conversation.type === 'group'
                ? `${getMembersCount()} anggota`
                : conversation.conversation_members.find(
                    (m) => m.user_id !== currentUser.id
                  )?.profiles.is_online
                ? 'Aktif sekarang'
                : 'Offline'}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => playNotificationSound()}
            title="Tes Suara Notifikasi"
            className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </button>
          <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium hidden sm:inline-block">
            {conversation.type === 'group' ? 'Grup' : 'Privat'}
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-10 py-4 space-y-4">
        {groupedMessages.map((group) => (
          <div key={group.date} className="space-y-2">
            {/* Minimalist Date Chip */}
            <div className="flex items-center justify-center my-4">
              <span className="text-[10px] font-medium tracking-wide text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 px-3 py-1 rounded-full shadow-2xs">
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
                  <div
                    className={`relative max-w-[85%] sm:max-w-[70%] md:max-w-[60%] p-3 shadow-xs transition-all ${
                      isMe
                        ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-2xl rounded-br-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl rounded-bl-xs border border-slate-200/70 dark:border-slate-800/80'
                    }`}
                  >
                    {/* Sender name for group chats */}
                    {!isMe && conversation.type === 'group' && isFirstInSeries && (
                      <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                        {sender?.username ?? 'Pengguna'}
                      </p>
                    )}

                    {/* Image Attachment */}
                    {msg.type === 'image' && msg.image_url && (
                      <div className="mb-1.5 rounded-xl overflow-hidden bg-black/5 dark:bg-black/20">
                        <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={msg.image_url}
                            alt="Foto terkirim"
                            className="rounded-xl max-w-full max-h-80 object-cover hover:scale-[1.01] transition-transform cursor-pointer"
                            loading="lazy"
                          />
                        </a>
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.content && (
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words pr-10">
                        {msg.content}
                      </p>
                    )}

                    {/* Meta info: Time + Receipt */}
                    <div
                      className={`flex items-center justify-end gap-1 float-right -mt-1.5 -mr-0.5 ml-2 text-[9px] ${
                        isMe ? 'text-indigo-100/80' : 'text-slate-400'
                      }`}
                    >
                      <span>{formatTime(msg.created_at)}</span>
                      {isMe && (
                        <span
                          className={msg.is_read ? 'text-cyan-200 font-bold' : 'opacity-60'}
                          title={msg.is_read ? 'Dibaca' : 'Terkirim'}
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

      {/* Upload Progress Bar */}
      {uploadProgress && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2 text-xs text-indigo-600 dark:text-indigo-300 flex items-center justify-between border-t border-indigo-100 dark:border-indigo-900/40 animate-pulse">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>{uploadProgress}</span>
          </div>
          <span className="font-semibold text-[10px] uppercase tracking-wider">Kompresi Aktif</span>
        </div>
      )}

      {/* Floating Bottom Input Dock */}
      <div className="p-2 sm:p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
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
            title="Kirim Foto"
            className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Tulis pesan..."
            className="flex-1 bg-slate-100/80 dark:bg-slate-800/70 text-slate-900 dark:text-white placeholder:text-slate-400 rounded-xl px-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 transition-all border border-transparent"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all flex items-center justify-center shrink-0"
            aria-label="Kirim pesan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
