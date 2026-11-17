import Dexie, { type Table } from 'dexie'
import type { LocalConversation, LocalMessage, LocalTombstone, LocalDeviceMeta, MessageStatus } from './types'

export class ChatinganLocalDB extends Dexie {
  conversations!: Table<LocalConversation, string>
  messages!: Table<LocalMessage, string>
  tombstones!: Table<LocalTombstone, string>
  device_meta!: Table<LocalDeviceMeta, string>

  constructor() {
    super('ChatinganLocalDB')

    this.version(1).stores({
      conversations: 'id, type, updated_at, unread_count',
      messages: 'id, conversation_id, sender_id, status, is_deleted, server_ts, [conversation_id+server_ts]',
      tombstones: 'message_id, conversation_id, deleted_at',
      device_meta: 'key',
    })
  }
}

export const localDb = new ChatinganLocalDB()

/**
 * Meminta browser agar IndexedDB dipersistensikan secara permanen
 * dan tidak dihapus secara otomatis saat storage low.
 */
export async function initPersistedStorage(): Promise<boolean> {
  if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted()
      if (!isPersisted) {
        const granted = await navigator.storage.persist()
        console.log('[Storage] Persistent storage granted:', granted)
        return granted
      }
      return isPersisted
    } catch (err) {
      console.warn('[Storage] Could not request persistent storage:', err)
      return false
    }
  }
  return false
}

/**
 * Menyimpan pesan baru ke IndexedDB lokal
 * Memeriksa terlebih dahulu apakah ada tombstone (event hapus yang tiba lebih cepat).
 */
export async function saveLocalMessage(msg: LocalMessage): Promise<void> {
  await localDb.transaction('rw', [localDb.messages, localDb.tombstones, localDb.conversations], async () => {
    // 1. Cek apakah ada tombstone terdaftar untuk message ini
    const existingTombstone = await localDb.tombstones.get(msg.id)
    if (existingTombstone) {
      msg.is_deleted = true
      msg.deleted_at = existingTombstone.deleted_at
      msg.content = 'Pesan telah terhapus'
    }

    // 2. Simpan atau perbarui pesan
    await localDb.messages.put(msg)

    // 3. Perbarui ringkasan pesan terakhir di percakapan lokal
    const conv = await localDb.conversations.get(msg.conversation_id)
    if (conv) {
      const isNewer = !conv.last_message || msg.server_ts >= (conv.last_message.server_ts || 0)
      if (isNewer) {
        await localDb.conversations.update(msg.conversation_id, {
          last_message: {
            id: msg.id,
            content: msg.is_deleted ? 'Pesan telah terhapus' : msg.content,
            type: msg.type,
            sender_id: msg.sender_id,
            status: msg.status,
            server_ts: msg.server_ts,
            created_at: msg.created_at,
            is_deleted: msg.is_deleted,
          },
          updated_at: Math.max(conv.updated_at || 0, msg.server_ts || msg.local_ts),
        })
      }
    }
  })
}

/**
 * Update Status Monotonic (PENDING -> SENT -> DELIVERED -> READ)
 * Aturan: Status HANYA boleh maju dan tidak boleh mundur!
 */
export async function updateMessageStatusMonotonic(
  messageId: string,
  newStatus: MessageStatus,
  serverTs?: number
): Promise<boolean> {
  let updated = false
  await localDb.transaction('rw', [localDb.messages, localDb.conversations], async () => {
    const existing = await localDb.messages.get(messageId)
    if (!existing) return

    // Abaikan jika status baru lebih rendah atau sama
    if (newStatus <= existing.status) {
      return
    }

    const updates: Partial<LocalMessage> = { status: newStatus }
    if (serverTs && (!existing.server_ts || serverTs > existing.server_ts)) {
      updates.server_ts = serverTs
    }
    if (newStatus === 3) {
      updates.read_at = new Date().toISOString()
    }

    await localDb.messages.update(messageId, updates)
    updated = true

    // Perbarui status di last_message percakapan jika ID cocok
    const conv = await localDb.conversations.get(existing.conversation_id)
    if (conv?.last_message?.id === messageId) {
      await localDb.conversations.update(existing.conversation_id, {
        last_message: {
          ...conv.last_message,
          status: newStatus,
        },
      })
    }
  })
  return updated
}

/**
 * Tombstone Pattern: Menghapus pesan secara lokal tanpa DELETE fisik.
 * Menyimpan ID ke tabel tombstones agar pesan out-of-order tetap otomatis terhapus.
 */
export async function applyMessageTombstone(
  messageId: string,
  conversationId: string,
  deletedAt: number = Date.now()
): Promise<void> {
  await localDb.transaction('rw', [localDb.messages, localDb.tombstones, localDb.conversations], async () => {
    // 1. Simpan ke tabel tombstones
    await localDb.tombstones.put({
      message_id: messageId,
      conversation_id: conversationId,
      deleted_at: deletedAt,
    })

    // 2. Tandai pesan jika sudah ada di lokal
    const existing = await localDb.messages.get(messageId)
    if (existing) {
      await localDb.messages.update(messageId, {
        is_deleted: true,
        deleted_at: deletedAt,
        content: 'Pesan telah terhapus',
      })
    }

    // 3. Perbarui ringkasan last message di room jika yang dihapus adalah last message
    const conv = await localDb.conversations.get(conversationId)
    if (conv?.last_message?.id === messageId) {
      await localDb.conversations.update(conversationId, {
        last_message: {
          ...conv.last_message,
          is_deleted: true,
          content: 'Pesan telah terhapus',
        },
      })
    }
  })
}

/**
 * Menambahkan atau mengupdate percakapan lokal
 */
export async function upsertLocalConversation(conv: LocalConversation): Promise<void> {
  await localDb.conversations.put(conv)
}
