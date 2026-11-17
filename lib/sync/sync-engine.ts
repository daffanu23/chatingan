import { createClient } from '@/lib/supabase/client'
import { ulid } from 'ulid'
import {
  localDb,
  saveLocalMessage,
  updateMessageStatusMonotonic,
  applyMessageTombstone,
  upsertLocalConversation,
  initPersistedStorage,
} from '@/lib/db/schema'
import { cacheRemoteMediaToLocal } from '@/lib/media/local-media'
import { getClientDeviceInfo, registerDeviceOnServer } from '@/lib/device/client-device'
import type {
  LocalConversation,
  LocalMessage,
  MessageStatus,
  SyncEvent,
  SyncEventType,
} from '@/lib/db/types'
import { playNotificationSound, showDesktopNotification } from '@/lib/utils/notifications'

export class SyncEngine {
  private static instance: SyncEngine | null = null
  private supabase = createClient()
  private userId: string | null = null
  private deviceId: string = ''
  private realtimeChannel: any = null
  private isPulling = false
  private onNotificationCallback?: (sender: string, text: string) => void
  private activeConversationId: string | null = null

  private constructor() {
    if (typeof window !== 'undefined') {
      const info = getClientDeviceInfo()
      this.deviceId = info.deviceId
    }
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine()
    }
    return SyncEngine.instance
  }

  public setActiveConversation(convId: string | null) {
    this.activeConversationId = convId
  }

  public setNotificationCallback(cb: (sender: string, text: string) => void) {
    this.onNotificationCallback = cb
  }

  /**
   * Inisialisasi Sync Engine:
   * 1. Request navigator.storage.persist()
   * 2. Registrasi device_id ke server
   * 3. Subscribe WebSocket channel Supabase Realtime
   * 4. Drain antrean offline / pending events
   */
  public async initialize(userId: string): Promise<void> {
    this.userId = userId
    this.deviceId = getClientDeviceInfo(userId).deviceId
    await initPersistedStorage()

    // 1. Daftarkan perangkat aktif
    await registerDeviceOnServer(userId)

    // 2. Setup Realtime WebSocket Channel
    this.setupRealtimeSubscription(userId)

    // 3. Tarik antrean pesan tertunda yang tersimpan di server
    await this.drainPendingQueue()

    // 4. Setup periodic heartbeat & online listener
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.drainPendingQueue()
        this.resubscribeIfNecessary()
      })

      // Interval 5 menit untuk heartbeat device
      setInterval(() => {
        if (this.userId) {
          registerDeviceOnServer(this.userId)
        }
      }, 5 * 60 * 1000)
    }
  }

  private setupRealtimeSubscription(userId: string) {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel)
    }

    const channelName = `sync:user:${userId}`
    this.realtimeChannel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'device_message_queue',
          filter: `target_user_id=eq.${userId}`,
        },
        (payload: any) => {
          const item = payload?.new
          if (item) {
            // Hanya proses jika ditujukan untuk device ini atau target device cocok
            if (!item.target_device_id || item.target_device_id === this.deviceId) {
              const syncEvent: SyncEvent = {
                id: item.id,
                event_id: item.event_id,
                event_type: item.event_type as SyncEventType,
                sender_id: item.sender_id,
                sender_device_id: item.sender_device_id,
                target_user_id: item.target_user_id,
                target_device_id: item.target_device_id,
                server_ts: item.server_ts,
                payload: item.payload,
              }
              this.handleIncomingSyncEvent(syncEvent, item.id)
            }
          }
        }
      )
      .on('broadcast', { event: 'sync_event' }, (payload: any) => {
        if (payload && payload.payload) {
          this.handleIncomingSyncEvent(payload.payload)
        }
      })
      .subscribe((status: string) => {
        console.log(`[WebSocket] Sync channel status (${channelName}):`, status)
      })
  }

  private resubscribeIfNecessary() {
    if (this.userId) {
      this.setupRealtimeSubscription(this.userId)
    }
  }

  /**
   * Memproses satu event sinkronisasi yang masuk (dari WebSocket atau dari antrean pull)
   */
  public async handleIncomingSyncEvent(event: SyncEvent, queueId?: number): Promise<void> {
    const { event_type, sender_id, sender_device_id, payload, server_ts } = event
    const parsedServerTs = typeof server_ts === 'number' ? server_ts : new Date(server_ts).getTime()

    try {
      if (event_type === 'message:new') {
        const msgId = payload.message_id
        const convId = payload.conversation_id
        const isFromMe = sender_id === this.userId

        // 1. Pastikan percakapan lokal sudah ada
        if (payload.conversation_metadata) {
          const meta = payload.conversation_metadata
          const existingConv = await localDb.conversations.get(convId)
          if (!existingConv) {
            await upsertLocalConversation({
              id: convId,
              type: meta.type,
              name: meta.name || null,
              avatar_url: null,
              created_by: sender_id,
              members: meta.members || [],
              unread_count: isFromMe || this.activeConversationId === convId ? 0 : 1,
              updated_at: parsedServerTs,
              created_at: payload.created_at || new Date(parsedServerTs).toISOString(),
            })
          }
        }

        // 2. Simpan pesan lokal
        const localMsg: LocalMessage = {
          id: msgId,
          conversation_id: convId,
          sender_id: sender_id,
          sender_device_id: sender_device_id,
          content: payload.content || null,
          type: payload.type || 'text',
          image_url: payload.image_url || null,
          status: isFromMe ? 1 : 2, // Jika pesan dari diri sendiri (self-sync) status SENT, jika dari orang lain DELIVERED
          is_deleted: false,
          local_ts: Date.now(),
          server_ts: parsedServerTs,
          created_at: payload.created_at || new Date(parsedServerTs).toISOString(),
        }

        await saveLocalMessage(localMsg)

        // Jika pesan bertipe gambar, otomatis unduh dan simpan file fisik Blob ke IndexedDB lokal
        if (localMsg.type === 'image' && localMsg.image_url) {
          cacheRemoteMediaToLocal(msgId, convId, localMsg.image_url)
        }

        // 3. Jika pesan dari orang lain
        if (!isFromMe) {
          // Kirim status DELIVERED kembali ke pengirim
          this.sendStatusUpdate(convId, msgId, 2, [sender_id])

          // Periksa apakah layar obrolan sedang terbuka DAN tab peramban sedang fokus di depan mata pengguna
          const isChatCurrentlyOpenAndFocused =
            this.activeConversationId === convId &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible' &&
            document.hasFocus()

          if (!isChatCurrentlyOpenAndFocused) {
            playNotificationSound()
            const conv = await localDb.conversations.get(convId)
            const senderMember = conv?.members.find((m) => m.user_id === sender_id)
            const senderName = senderMember?.username || 'Pesan Baru'
            const textPreview =
              payload.type === 'image'
                ? '📷 Foto'
                : payload.type === 'sticker'
                ? '🎨 Stiker'
                : payload.content || 'Pesan baru'

            showDesktopNotification(senderName, { body: textPreview })
            if (this.onNotificationCallback) {
              this.onNotificationCallback(senderName, textPreview)
            }

            // Tambah unread_count di percakapan lokal
            if (conv) {
              await localDb.conversations.update(convId, {
                unread_count: (conv.unread_count || 0) + 1,
              })
            }
          } else {
            // Jika room sedang aktif dibuka dan sedang dilihat pengguna, langsung kirim status READ
            this.sendStatusUpdate(convId, msgId, 3, [sender_id])
            await updateMessageStatusMonotonic(msgId, 3, parsedServerTs)
          }
        }
      } else if (event_type === 'message:status') {
        const msgId = payload.message_id
        const newStatus = payload.status as MessageStatus
        if (typeof newStatus === 'number') {
          await updateMessageStatusMonotonic(msgId, newStatus, parsedServerTs)
        }
      } else if (event_type === 'message:delete') {
        const msgId = payload.message_id
        const convId = payload.conversation_id
        await applyMessageTombstone(msgId, convId, parsedServerTs)
      }

      // 4. Kirim ACK ke server agar server LANGSUNG menghapus event ini dari antrean
      if (queueId) {
        await this.ackQueueItems([queueId])
      } else if (event.event_id) {
        await this.ackEventIds([event.event_id])
      }
    } catch (err) {
      console.error('[SyncEngine] Error handling incoming event:', err)
    }
  }

  /**
   * Tarik dan proses antrean pesan yang tertunda saat offline
   */
  public async drainPendingQueue(): Promise<void> {
    if (this.isPulling || !this.deviceId) return
    this.isPulling = true

    try {
      const res = await fetch(`/api/sync/pull?deviceId=${encodeURIComponent(this.deviceId)}`)
      if (!res.ok) {
        this.isPulling = false
        return
      }

      const data = await res.json()
      const events: any[] = data.events || []

      if (events.length === 0) {
        this.isPulling = false
        return
      }

      const queueIdsToDelete: number[] = []

      for (const item of events) {
        const syncEvent: SyncEvent = {
          id: item.id,
          event_id: item.event_id,
          event_type: item.event_type as SyncEventType,
          sender_id: item.sender_id,
          sender_device_id: item.sender_device_id,
          target_user_id: item.target_user_id,
          target_device_id: item.target_device_id,
          server_ts: item.server_ts,
          payload: item.payload,
        }

        await this.handleIncomingSyncEvent(syncEvent, item.id)
        queueIdsToDelete.push(item.id)
      }

      if (queueIdsToDelete.length > 0) {
        await this.ackQueueItems(queueIdsToDelete)
      }
    } catch (err) {
      console.error('[SyncEngine] Error draining queue:', err)
    } finally {
      this.isPulling = false
    }
  }

  /**
   * Kirim konfirmasi ACK untuk menghapus baris dari database server secara permanen
   */
  private async ackQueueItems(queueIds: number[]): Promise<void> {
    try {
      await fetch('/api/sync/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          queueIds,
        }),
      })
    } catch (err) {
      console.warn('[SyncEngine] ACK queue error:', err)
    }
  }

  private async ackEventIds(eventIds: string[]): Promise<void> {
    try {
      await fetch('/api/sync/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          eventIds,
        }),
      })
    } catch (err) {
      console.warn('[SyncEngine] ACK event error:', err)
    }
  }

  /**
   * Mengirim pesan baru (Text / Image)
   */
  public async sendMessage({
    conversationId,
    content,
    type = 'text',
    imageUrl = null,
    recipientUserIds,
    conversationMeta,
    customMessageId,
  }: {
    conversationId: string
    content: string | null
    type?: 'text' | 'image' | 'sticker'
    imageUrl?: string | null
    recipientUserIds: string[]
    conversationMeta?: any
    customMessageId?: string
  }): Promise<LocalMessage> {
    if (!this.userId) throw new Error('SyncEngine not initialized with user')

    const messageId = customMessageId || ulid()
    const now = Date.now()

    // 1. Simpan langsung ke IndexedDB lokal dengan status 0: PENDING
    const localMsg: LocalMessage = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: this.userId,
      sender_device_id: this.deviceId,
      content,
      type,
      image_url: imageUrl,
      status: 0, // PENDING
      is_deleted: false,
      local_ts: now,
      server_ts: now, // Sementara pakai now sampai server merespons
      created_at: new Date(now).toISOString(),
    }

    await saveLocalMessage(localMsg)

    // 2. Kirim ke Server via API Route untuk Fan-Out & Ephemeral Enqueue
    try {
      const res = await fetch('/api/sync/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'message:new',
          senderDeviceId: this.deviceId,
          targetUserIds: recipientUserIds,
          payload: {
            message_id: messageId,
            conversation_id: conversationId,
            content,
            type,
            image_url: imageUrl,
            created_at: localMsg.created_at,
            conversation_metadata: conversationMeta,
          },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const serverTs = data.serverTs || Date.now()

        // 3. Update status lokal menjadi 1: SENT dan simpan server_ts resmi
        await updateMessageStatusMonotonic(messageId, 1, serverTs)
        localMsg.status = 1
        localMsg.server_ts = serverTs
      }
    } catch (err) {
      console.error('[SyncEngine] Send error (message remains PENDING):', err)
    }

    return localMsg
  }

  /**
   * Mengirim update status pesan (DELIVERED atau READ)
   */
  public async sendStatusUpdate(
    conversationId: string,
    messageId: string,
    status: MessageStatus,
    targetUserIds: string[]
  ): Promise<void> {
    try {
      await fetch('/api/sync/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'message:status',
          senderDeviceId: this.deviceId,
          targetUserIds,
          payload: {
            message_id: messageId,
            conversation_id: conversationId,
            status,
          },
        }),
      })
    } catch (err) {
      console.warn('[SyncEngine] Failed to send status update:', err)
    }
  }

  /**
   * Menandai semua pesan di suatu percakapan sebagai telah dibaca (Read Receipt)
   */
  public async markConversationAsRead(conversationId: string): Promise<void> {
    if (!this.userId) return

    // 1. Ambil pesan belum dibaca di room ini
    const unreadMessages = await localDb.messages
      .where('conversation_id')
      .equals(conversationId)
      .filter((m) => !m.is_deleted && m.sender_id !== this.userId && m.status < 3)
      .toArray()

    if (unreadMessages.length === 0) {
      // Pastikan unread count lokal 0
      await localDb.conversations.update(conversationId, { unread_count: 0 })
      return
    }

    // 2. Update status lokal menjadi 3: READ
    for (const msg of unreadMessages) {
      await updateMessageStatusMonotonic(msg.id, 3)
    }
    await localDb.conversations.update(conversationId, { unread_count: 0 })

    // 3. Cari pengirim untuk dikirimi status update
    const conv = await localDb.conversations.get(conversationId)
    const otherUserIds = conv?.members
      .filter((m) => m.user_id !== this.userId)
      .map((m) => m.user_id) || []

    for (const msg of unreadMessages) {
      this.sendStatusUpdate(conversationId, msg.id, 3, otherUserIds)
    }
  }

  /**
   * Menghapus pesan dengan Tombstone Pattern
   */
  public async deleteMessage(
    conversationId: string,
    messageId: string,
    targetUserIds: string[]
  ): Promise<void> {
    const deletedAt = Date.now()
    // 1. Terapkan tombstone lokal
    await applyMessageTombstone(messageId, conversationId, deletedAt)

    // 2. Kirim event tombstone ke penerima & self-sync
    try {
      await fetch('/api/sync/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'message:delete',
          senderDeviceId: this.deviceId,
          targetUserIds,
          payload: {
            message_id: messageId,
            conversation_id: conversationId,
            deleted_at: deletedAt,
          },
        }),
      })
    } catch (err) {
      console.warn('[SyncEngine] Failed to send delete event:', err)
    }
  }

  private activeTypingChannel: any = null

  /**
   * Subscribe Realtime WebSocket untuk status lawan bicara sedang mengetik
   */
  public subscribeToTyping(
    conversationId: string,
    onTypingChange: (isTyping: boolean, username: string) => void
  ) {
    if (this.activeTypingChannel) {
      this.supabase.removeChannel(this.activeTypingChannel)
    }

    const channelName = `typing:${conversationId}`
    this.activeTypingChannel = this.supabase
      .channel(channelName)
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const data = payload?.payload
        if (data && data.user_id !== this.userId) {
          onTypingChange(Boolean(data.is_typing), data.username || 'Seseorang')
        }
      })
      .subscribe()
  }

  public unsubscribeFromTyping() {
    if (this.activeTypingChannel) {
      this.supabase.removeChannel(this.activeTypingChannel)
      this.activeTypingChannel = null
    }
  }

  /**
   * Mengirim broadcast realtime saat pengguna mulai/berhenti mengetik
   */
  public async sendTypingStatus(
    conversationId: string,
    isTyping: boolean,
    username: string
  ) {
    if (!this.activeTypingChannel || !this.userId) return

    try {
      await this.activeTypingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: this.userId,
          username,
          is_typing: isTyping,
        },
      })
    } catch (_) {}
  }
}

export const syncEngine = SyncEngine.getInstance()
