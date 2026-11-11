'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/compress-image'
import { playNotificationSound } from '@/lib/utils/notifications'
import { IosEmojiPicker } from './ios-emoji-picker'
import { CameraModal } from './camera-modal'
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

type ReplyData = {
  id: string
  sender: string
  snippet: string
}

type ParsedMessage = {
  text: string
  reply?: ReplyData
}

function parseMessageContent(raw: string | null): ParsedMessage {
  if (!raw) return { text: '' }
  if (raw.startsWith('{"_reply":')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed._reply && typeof parsed.text === 'string') {
        return { text: parsed.text, reply: parsed._reply }
      }
    } catch {
      // not JSON, fallback
    }
  }
  return { text: raw }
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

// Sub-component for individual message bubble with double-tap & swipe gesture
function MessageBubbleItem({
  msg,
  isMe,
  sender,
  isFirstInSeries,
  isGroup,
  onReply,
  onScrollToMessage,
}: {
  msg: MessageWithSender
  isMe: boolean
  sender?: MessageSender | null
  isFirstInSeries: boolean
  isGroup: boolean
  onReply: (msg: MessageWithSender) => void
  onScrollToMessage: (id: string) => void
}) {
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const lastTapRef = useRef(0)

  const parsed = parseMessageContent(msg.content)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }

  function handleTouchMove(e: React.TouchEvent) {
    const deltaX = e.touches[0].clientX - touchStartXRef.current
    const deltaY = e.touches[0].clientY - touchStartYRef.current
    // If swiping right and horizontal motion is dominant
    if (deltaX > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      const clamped = Math.min(deltaX * 0.55, 65)
      setSwipeOffset(clamped)
      setIsSwiping(true)
    }
  }

  function handleTouchEnd() {
    if (swipeOffset >= 35) {
      // Swiped right past threshold -> trigger reply
      onReply(msg)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(25)
        } catch (_) {}
      }
    } else {
      // Check double tap
      const now = Date.now()
      if (now - lastTapRef.current < 320) {
        onReply(msg)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(25)
          } catch (_) {}
        }
        lastTapRef.current = 0
      } else {
        lastTapRef.current = now
      }
    }
    setSwipeOffset(0)
    setIsSwiping(false)
  }

  return (
    <div
      id={`msg-${msg.id}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={() => onReply(msg)}
      className={`group relative flex items-center w-full px-1.5 py-0.5 cursor-pointer sm:cursor-default select-none sm:select-text ${
        isMe ? 'justify-end' : 'justify-start'
      } ${isFirstInSeries ? 'mt-2.5' : 'mt-1'}`}
      title="Double tap atau geser ke kanan untuk membalas"
    >
      {/* Swipe reveal reply indicator */}
      {swipeOffset > 0 && (
        <div
          className="absolute left-2 z-0 flex items-center justify-center h-8 w-8 rounded-full bg-indigo-500/20 text-indigo-500 transition-opacity"
          style={{ opacity: Math.min(swipeOffset / 35, 1) }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7"/>
            <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </div>
      )}

      {/* Desktop hover reply button for received messages */}
      {!isMe && (
        <button
          type="button"
          onClick={() => onReply(msg)}
          title="Balas pesan (Double click / Geser)"
          className="hidden md:flex p-1.5 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all text-xs shrink-0 order-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7"/>
            <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </button>
      )}

      {/* Main Message Bubble */}
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`relative max-w-[85%] sm:max-w-[70%] md:max-w-[60%] p-3 shadow-xs select-text transition-all ${
          isMe
            ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-2xl rounded-br-xs order-2'
            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl rounded-bl-xs border border-slate-200/70 dark:border-slate-800/80 order-1'
        }`}
      >
        {/* Sender name for group chats */}
        {!isMe && isGroup && isFirstInSeries && (
          <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
            {sender?.username ?? 'Pengguna'}
          </p>
        )}

        {/* Reply Quote Block (if this message is a reply) */}
        {parsed.reply && (
          <div
            onClick={(e) => {
              e.stopPropagation()
              onScrollToMessage(parsed.reply!.id)
            }}
            className={`mb-2 w-full text-left p-2 rounded-xl border-l-[3px] transition-all cursor-pointer ${
              isMe
                ? 'bg-black/15 hover:bg-black/25 border-white/90 text-white'
                : 'bg-indigo-50/70 dark:bg-slate-800/80 hover:bg-indigo-100/70 dark:hover:bg-slate-800 border-indigo-500 text-slate-800 dark:text-slate-200'
            }`}
            title="Klik untuk melihat pesan yang dibalas"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] opacity-75">↩</span>
              <span
                className={`text-[11px] font-bold truncate ${
                  isMe ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'
                }`}
              >
                {parsed.reply.sender}
              </span>
            </div>
            <p
              className={`text-[11px] truncate opacity-90 ${
                isMe ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {parsed.reply.snippet}
            </p>
          </div>
        )}

        {/* Image Attachment */}
        {msg.type === 'image' && msg.image_url && (
          <div className="mb-1.5 rounded-xl overflow-hidden bg-black/5 dark:bg-black/20">
            {msg.image_url.toLowerCase().includes('.heic') ? (
              <div className="p-3 text-center bg-indigo-950/20 dark:bg-black/40 rounded-xl">
                <span className="text-xl block mb-1">📸</span>
                <p className="text-[11px] font-medium text-slate-200 mb-1.5">Foto HEIC</p>
                <a
                  href={msg.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[10px] font-semibold transition-colors"
                >
                  Buka / Unduh Gambar
                </a>
              </div>
            ) : (
              <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={msg.image_url}
                  alt="Foto terkirim"
                  className="rounded-xl max-w-full max-h-80 object-cover hover:scale-[1.01] transition-transform cursor-pointer"
                  loading="lazy"
                />
              </a>
            )}
          </div>
        )}

        {/* Text Message */}
        {parsed.text && (
          <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words pr-10">
            {parsed.text}
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

      {/* Desktop hover reply button for sent messages */}
      {isMe && (
        <button
          type="button"
          onClick={() => onReply(msg)}
          title="Balas pesan (Double tap / Geser)"
          className="hidden md:flex p-1.5 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all text-xs shrink-0 order-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7"/>
            <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </button>
      )}
    </div>
  )
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
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Close attach menu when clicking outside
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false)
      }
    }
    if (showAttachMenu) {
      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('touchstart', handlePointerDown)
    }
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [showAttachMenu])
  function handleSelectEmoji(emoji: string) {
    setNewMessage((prev) => prev + emoji)
  }

  // Start reply and focus text input
  function handleStartReply(msg: MessageWithSender) {
    setReplyingTo(msg)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 60)
  }

  // Smooth scroll to target message when clicking quote
  function handleScrollToMessage(targetId: string) {
    const el = document.getElementById(`msg-${targetId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('highlight-target')
      setTimeout(() => {
        el.classList.remove('highlight-target')
      }, 1500)
    }
  }

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

          // Fetch sender profile
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', newMsg.sender_id)
            .single()

          const messageWithSender: MessageWithSender = {
            ...newMsg,
            profiles: senderProfile,
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, messageWithSender]
          })

          if (newMsg.sender_id !== currentUser.id) {
            playNotificationSound()
            markAsRead()
          }
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

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || sending) return

    setSending(true)
    const rawText = newMessage.trim()
    setNewMessage('')

    // Build payload with reply metadata if active
    let content = rawText
    if (replyingTo) {
      const parsed = parseMessageContent(replyingTo.content)
      const snippet = replyingTo.type === 'image' ? '📷 Foto' : (parsed.text || 'Pesan')
      content = JSON.stringify({
        _reply: {
          id: replyingTo.id,
          sender: replyingTo.profiles?.username || 'Pengguna',
          snippet: snippet.length > 80 ? snippet.slice(0, 80) + '...' : snippet,
        },
        text: rawText,
      })
      setReplyingTo(null)
    }

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      content,
      type: 'text',
      is_read: false,
    })

    if (error) {
      console.error('Failed to send message:', error)
      setNewMessage(rawText)
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    setSending(false)
  }

  async function uploadImageFile(file: File) {
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
      if (compressed.size < file.size) {
        setUploadProgress(`Mengunggah (${originalSizeKb}KB ➔ ${compressedSizeKb}KB)...`)
      } else {
        setUploadProgress(`Mengunggah (${originalSizeKb}KB)...`)
      }

      const ext = compressed.type === 'image/webp' ? 'webp' : (file.name.split('.').pop()?.toLowerCase() || 'jpg')
      const fileName = `${conversation.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, compressed, {
          contentType: compressed.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName)

      let imageReplyContent: string | null = null
      if (replyingTo) {
        const parsed = parseMessageContent(replyingTo.content)
        const snippet = replyingTo.type === 'image' ? '📷 Foto' : (parsed.text || 'Pesan')
        imageReplyContent = JSON.stringify({
          _reply: {
            id: replyingTo.id,
            sender: replyingTo.profiles?.username || 'Pengguna',
            snippet: snippet.length > 80 ? snippet.slice(0, 80) + '...' : snippet,
          },
          text: '',
        })
        setReplyingTo(null)
      }

      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: currentUser.id,
        type: 'image',
        image_url: urlData.publicUrl,
        content: imageReplyContent,
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

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      uploadImageFile(file)
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
                <MessageBubbleItem
                  key={msg.id}
                  msg={msg}
                  isMe={isMe}
                  sender={sender}
                  isFirstInSeries={isFirstInSeries}
                  isGroup={conversation.type === 'group'}
                  onReply={handleStartReply}
                  onScrollToMessage={handleScrollToMessage}
                />
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

      {/* Bottom Floating Input Dock */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shrink-0">
        {/* Reply Bar Preview (if actively replying) */}
        {replyingTo && (
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 bg-slate-100/95 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs transition-all">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                ↩
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                  Membalas <span className="text-indigo-600 dark:text-indigo-400">@{replyingTo.profiles?.username || 'Pengguna'}</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px] sm:max-w-md mt-0.5">
                  {replyingTo.type === 'image'
                    ? '📷 Foto'
                    : parseMessageContent(replyingTo.content).text || 'Pesan'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
              title="Batal membalas (Esc)"
              aria-label="Batal membalas"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-2 sm:p-3 relative">
          {/* iOS Emoji Picker */}
          {showEmojiPicker && (
            <IosEmojiPicker
              onSelect={handleSelectEmoji}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}

          {/* Attachment Popup Menu (+) */}
          {showAttachMenu && (
            <div
              ref={attachMenuRef}
              className="absolute bottom-full mb-3 left-2 sm:left-4 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 p-1.5 min-w-[190px] flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
            >
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false)
                  setShowCameraModal(true)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left w-full group"
              >
                <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                    <circle cx="12" cy="13" r="3"/>
                  </svg>
                </div>
                <div>
                  <span className="block font-semibold">Kamera</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Buka kamera & ambil foto</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false)
                  fileInputRef.current?.click()
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left w-full group"
              >
                <div className="h-8 w-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                  </svg>
                </div>
                <div>
                  <span className="block font-semibold">Galeri & Foto</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Pilih dari perangkat</span>
                </div>
              </button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
            {/* Hidden File Picker (Gallery) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* Action / Attachment Toggle Button (+) */}
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu((prev) => !prev)
                setShowEmojiPicker(false)
              }}
              disabled={uploading}
              title="Lampiran (Kamera / Galeri)"
              className={`p-2.5 rounded-xl transition-all duration-200 shrink-0 ${
                showAttachMenu
                  ? 'bg-indigo-600 text-white rotate-45 shadow-sm shadow-indigo-600/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label="Tambah Lampiran"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>

            {/* Emoji Picker Toggle */}
            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker((v) => !v)
                setShowAttachMenu(false)
              }}
              title="Emoji"
              className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                showEmojiPicker
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                  : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
            </button>

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setReplyingTo(null)
                  setShowEmojiPicker(false)
                  setShowAttachMenu(false)
                }
              }}
              onFocus={() => { /* picker closes via click-outside */ }}
              placeholder={replyingTo ? 'Tulis balasan Anda...' : 'Tulis pesan...'}
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

      {/* Live Camera Viewfinder Modal */}
      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={uploadImageFile}
      />
    </div>
  )
}
