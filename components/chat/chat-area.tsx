'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '@/lib/db/schema'
import { syncEngine } from '@/lib/sync/sync-engine'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/compress-image'
import { IosEmojiPicker } from './ios-emoji-picker'
import { CameraModal } from './camera-modal'
import type { Profile } from '@/lib/types'
import type { LocalConversation, LocalMessage, MessageStatus } from '@/lib/db/types'

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
      // not JSON
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

function formatTime(timestamp: number | string): string {
  return new Date(timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateSeparator(timestamp: number | string): string {
  const date = new Date(timestamp)
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

// Komponen indikator status pengiriman monotonic
function MessageStatusIndicator({ status }: { status: MessageStatus }) {
  if (status === 0) {
    // 0: PENDING
    return (
      <span className="opacity-60 text-[10px]" title="Menunggu pengiriman (Pending)">
        🕒
      </span>
    )
  }
  if (status === 1) {
    // 1: SENT (Centang 1)
    return (
      <span className="opacity-70 font-semibold" title="Terkirim ke Server">
        ✓
      </span>
    )
  }
  if (status === 2) {
    // 2: DELIVERED (Centang 2 Abu)
    return (
      <span className="opacity-80 font-bold" title="Terkirim ke Perangkat Tujuan">
        ✓✓
      </span>
    )
  }
  // 3: READ (Centang 2 Biru)
  return (
    <span className="text-cyan-200 font-bold" title="Dibaca oleh Penerima">
      ✓✓
    </span>
  )
}

function MessageBubbleItem({
  msg,
  isMe,
  senderUsername,
  isFirstInSeries,
  isGroup,
  onReply,
  onDelete,
  onScrollToMessage,
}: {
  msg: LocalMessage
  isMe: boolean
  senderUsername: string
  isFirstInSeries: boolean
  isGroup: boolean
  onReply: (msg: LocalMessage) => void
  onDelete: (msg: LocalMessage) => void
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
    if (deltaX > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      const clamped = Math.min(deltaX * 0.55, 65)
      setSwipeOffset(clamped)
      setIsSwiping(true)
    }
  }

  function handleTouchEnd() {
    if (swipeOffset >= 35) {
      onReply(msg)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(25)
        } catch (_) {}
      }
    } else {
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
            {senderUsername}
          </p>
        )}

        {/* Reply Quote Block */}
        {!msg.is_deleted && parsed.reply && (
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

        {/* Tombstone Deleted Message Notice */}
        {msg.is_deleted ? (
          <p className="text-xs italic opacity-75 flex items-center gap-1.5 py-0.5">
            <span>🚫</span>
            <span>Pesan telah dihapus</span>
          </p>
        ) : (
          <>
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
            {parsed.text && (
              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words pr-12">
                {parsed.text}
              </p>
            )}
          </>
        )}

        {/* Meta info: Time + Status Tick */}
        <div
          className={`flex items-center justify-end gap-1 float-right -mt-1.5 -mr-0.5 ml-2 text-[9px] ${
            isMe ? 'text-indigo-100/80' : 'text-slate-400'
          }`}
        >
          <span>{formatTime(msg.server_ts || msg.local_ts)}</span>
          {isMe && !msg.is_deleted && <MessageStatusIndicator status={msg.status} />}
        </div>
      </div>

      {/* Action buttons (Reply & Tombstone Delete) */}
      <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'order-1 pr-1' : 'order-2 pl-1'}`}>
        {!msg.is_deleted && (
          <button
            type="button"
            onClick={() => onReply(msg)}
            title="Balas pesan"
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
        )}
        {isMe && !msg.is_deleted && (
          <button
            type="button"
            onClick={() => onDelete(msg)}
            title="Hapus pesan (Tombstone)"
            className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 text-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default function ChatArea({
  conversation,
  currentUser,
  onBack,
}: {
  conversation: LocalConversation
  currentUser: Profile
  onBack: () => void
}) {
  const [newMessage, setNewMessage] = useState('')
  const [replyingTo, setReplyingTo] = useState<LocalMessage | null>(null)
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

  // Ambil pesan 100% dari IndexedDB lokal secara reaktif dengan Dexie
  // Urutkan berdasarkan server_ts ASC (lalu ULID sebagai tie-breaker)
  const localMessages = useLiveQuery(
    async () => {
      const msgs = await localDb.messages
        .where('conversation_id')
        .equals(conversation.id)
        .toArray()
      return msgs.sort((a, b) => (a.server_ts || a.local_ts) - (b.server_ts || b.local_ts) || a.id.localeCompare(b.id))
    },
    [conversation.id]
  ) || []

  // Read receipt: tandai semua pesan di room sebagai telah dibaca
  useEffect(() => {
    syncEngine.setActiveConversation(conversation.id)
    syncEngine.markConversationAsRead(conversation.id)

    function handleWindowFocus() {
      syncEngine.markConversationAsRead(conversation.id)
    }

    window.addEventListener('focus', handleWindowFocus)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      syncEngine.setActiveConversation(null)
    }
  }, [conversation.id])

  // Scroll to bottom saat ada pesan baru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages.length])

  // Close attach menu saat klik di luar
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

  function handleStartReply(msg: LocalMessage) {
    setReplyingTo(msg)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 60)
  }

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

  const recipientUserIds = conversation.members
    .filter((m) => m.user_id !== currentUser.id)
    .map((m) => m.user_id)

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || sending) return

    setSending(true)
    const rawText = newMessage.trim()
    setNewMessage('')

    let content = rawText
    if (replyingTo) {
      const parsed = parseMessageContent(replyingTo.content)
      const snippet = replyingTo.type === 'image' ? '📷 Foto' : (parsed.text || 'Pesan')
      const senderMember = conversation.members.find((m) => m.user_id === replyingTo.sender_id)
      content = JSON.stringify({
        _reply: {
          id: replyingTo.id,
          sender: senderMember?.username || 'Pengguna',
          snippet: snippet.length > 80 ? snippet.slice(0, 80) + '...' : snippet,
        },
        text: rawText,
      })
      setReplyingTo(null)
    }

    try {
      await syncEngine.sendMessage({
        conversationId: conversation.id,
        content,
        type: 'text',
        recipientUserIds,
        conversationMeta: {
          type: conversation.type,
          name: conversation.name,
          members: conversation.members,
        },
      })
    } catch (err) {
      console.error('[ChatArea] Send message error:', err)
      setNewMessage(rawText)
    } finally {
      setSending(false)
    }
  }

  async function uploadImageFile(file: File) {
    setUploading(true)
    setUploadProgress('Mengompresi gambar...')

    try {
      const compressed = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.7,
      })

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
        const senderMember = conversation.members.find((m) => m.user_id === replyingTo.sender_id)
        imageReplyContent = JSON.stringify({
          _reply: {
            id: replyingTo.id,
            sender: senderMember?.username || 'Pengguna',
            snippet: snippet.length > 80 ? snippet.slice(0, 80) + '...' : snippet,
          },
          text: '',
        })
        setReplyingTo(null)
      }

      await syncEngine.sendMessage({
        conversationId: conversation.id,
        content: imageReplyContent,
        type: 'image',
        imageUrl: urlData.publicUrl,
        recipientUserIds,
        conversationMeta: {
          type: conversation.type,
          name: conversation.name,
          members: conversation.members,
        },
      })
    } catch (error) {
      console.error('[ChatArea] Upload error:', error)
      alert('Gagal mengunggah gambar.')
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteMessage(msg: LocalMessage) {
    if (confirm('Apakah Anda yakin ingin menghapus pesan ini untuk semua perangkat?')) {
      await syncEngine.deleteMessage(conversation.id, msg.id, recipientUserIds)
    }
  }

  function getConversationTitle(): string {
    if (conversation.type === 'group') return conversation.name ?? 'Grup'
    const otherMember = conversation.members.find((m) => m.user_id !== currentUser.id)
    return otherMember?.username ?? conversation.name ?? 'Pengguna'
  }

  const title = getConversationTitle()
  const gradient = getGradient(title)

  // Kelompokkan pesan per tanggal
  const groupedMessages: { date: string; messages: LocalMessage[] }[] = []
  localMessages.forEach((msg) => {
    const dateKey = new Date(msg.server_ts || msg.local_ts).toDateString()
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.messages.push(msg)
    } else {
      groupedMessages.push({ date: dateKey, messages: [msg] })
    }
  })

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 z-10 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={onBack}
            className="md:hidden p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div className="relative">
            <div className={`h-10 w-10 rounded-2xl bg-gradient-to-tr ${gradient} flex items-center justify-center text-white text-sm font-semibold shadow-xs`}>
              {title.charAt(0).toUpperCase()}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
              {title}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {conversation.type === 'group'
                ? `${conversation.members.length} anggota`
                : 'Enkripsi Lokal & Sinkronisasi Perangkat'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages List Area (100% dari IndexedDB lokal) */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-1">
        {groupedMessages.map((group) => (
          <div key={group.date} className="space-y-1">
            {/* Date separator */}
            <div className="flex items-center justify-center my-3">
              <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-slate-200/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 shadow-2xs">
                {formatDateSeparator(group.date)}
              </span>
            </div>

            {/* Messages in this group */}
            {group.messages.map((msg, index) => {
              const isMe = msg.sender_id === currentUser.id
              const prevMsg = group.messages[index - 1]
              const isFirstInSeries = !prevMsg || prevMsg.sender_id !== msg.sender_id
              const senderMember = conversation.members.find((m) => m.user_id === msg.sender_id)
              const senderUsername = senderMember?.username || (isMe ? 'Saya' : 'Pengguna')

              return (
                <MessageBubbleItem
                  key={msg.id}
                  msg={msg}
                  isMe={isMe}
                  senderUsername={senderUsername}
                  isFirstInSeries={isFirstInSeries}
                  isGroup={conversation.type === 'group'}
                  onReply={handleStartReply}
                  onDelete={handleDeleteMessage}
                  onScrollToMessage={handleScrollToMessage}
                />
              )
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0 relative">
        {/* Active Reply Banner */}
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between p-2 rounded-xl bg-indigo-50/70 dark:bg-slate-800 border-l-4 border-indigo-500 text-xs animate-in slide-in-from-bottom-2 duration-150">
            <div className="min-w-0 pr-2">
              <p className="font-semibold text-indigo-600 dark:text-indigo-400 text-[11px]">
                Membalas pesan
              </p>
              <p className="text-slate-600 dark:text-slate-300 truncate text-[11px]">
                {replyingTo.type === 'image' ? '📷 Foto' : replyingTo.content}
              </p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Upload Progress Indicator */}
        {uploading && (
          <div className="mb-2 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs flex items-center gap-2">
            <div className="animate-spin h-3.5 w-3.5 border-2 border-indigo-600 border-t-transparent rounded-full" />
            <span>{uploadProgress || 'Mengunggah foto...'}</span>
          </div>
        )}

        {/* Form Input */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {/* Attachment Button */}
          <div className="relative" ref={attachMenuRef}>
            <button
              type="button"
              onClick={() => setShowAttachMenu((prev) => !prev)}
              className="p-2.5 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Lampiran"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            {/* Attach popup */}
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 w-44 bg-white dark:bg-slate-900 rounded-2xl p-1.5 shadow-xl border border-slate-200 dark:border-slate-800 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(false)
                    fileInputRef.current?.click()
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <span>🖼️</span> Galeri Foto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(false)
                    setShowCameraModal(true)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <span>📷</span> Ambil Foto
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadImageFile(file)
            }}
            className="hidden"
          />

          {/* Emoji Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="p-2.5 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Emoji"
            >
              😊
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 z-30">
                <IosEmojiPicker
                  onSelect={(emoji: string) => setNewMessage((prev) => prev + emoji)}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            )}
          </div>

          {/* Input text */}
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Tulis pesan..."
            className="flex-1 bg-slate-100 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 px-4 py-2.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-colors"
            title="Kirim Pesan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>

      {/* Camera Modal */}
      {showCameraModal && (
        <CameraModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={(file) => {
            setShowCameraModal(false)
            uploadImageFile(file)
          }}
        />
      )}
    </div>
  )
}
