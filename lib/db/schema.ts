import Dexie, { type Table } from 'dexie'
import { ulid } from 'ulid'
import type {
  LocalConversation,
  LocalMessage,
  LocalTombstone,
  LocalDeviceMeta,
  LocalMediaFile,
  LocalSticker,
  MessageStatus,
} from './types'

export class ChatinganLocalDB extends Dexie {
  conversations!: Table<LocalConversation, string>
  messages!: Table<LocalMessage, string>
  tombstones!: Table<LocalTombstone, string>
  device_meta!: Table<LocalDeviceMeta, string>
  media_files!: Table<LocalMediaFile, string>
  custom_stickers!: Table<LocalSticker, string>

  constructor() {
    super('ChatinganLocalDB')

    this.version(1).stores({
      conversations: 'id, type, updated_at, unread_count',
      messages: 'id, conversation_id, sender_id, status, is_deleted, server_ts, [conversation_id+server_ts]',
      tombstones: 'message_id, conversation_id, deleted_at',
      device_meta: 'key',
    })

    this.version(2).stores({
      media_files: 'id, conversation_id, created_at',
    })

    this.version(3).stores({
      custom_stickers: 'id, is_favorite, created_at',
    })
  }
}

export const localDb = new ChatinganLocalDB()

/**
 * Menyimpan stiker custom ke IndexedDB lokal perangkat
 */
export async function saveCustomSticker(
  blob: Blob,
  name?: string,
  isFavorite: boolean = false
): Promise<LocalSticker> {
  const sticker: LocalSticker = {
    id: ulid(),
    name: name || 'Custom Sticker',
    blob,
    mime_type: blob.type || 'image/webp',
    size: blob.size,
    is_favorite: isFavorite,
    created_at: Date.now(),
  }
  await localDb.custom_stickers.put(sticker)
  return sticker
}

/**
 * Mengubah status favorit stiker di IndexedDB
 */
export async function toggleStickerFavorite(stickerId: string): Promise<boolean> {
  const sticker = await localDb.custom_stickers.get(stickerId)
  if (!sticker) return false
  const updatedFav = !sticker.is_favorite
  await localDb.custom_stickers.update(stickerId, { is_favorite: updatedFav })
  return updatedFav
}

/**
 * Menghapus stiker custom dari IndexedDB lokal
 */
export async function deleteCustomSticker(stickerId: string): Promise<void> {
  await localDb.custom_stickers.delete(stickerId)
}

/**
 * Inisialisasi stiker bawaan jika tabel stiker lokal masih kosong
 */
export async function seedDefaultStickersIfEmpty(): Promise<void> {
  const count = await localDb.custom_stickers.count()
  if (count > 0) return

  const defaultStickers = [
    {
      name: 'Cat Cool',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="56" fill="#FBBF24"/><path d="M28 32 L46 64 L20 60 Z" fill="#F59E0B"/><path d="M100 32 L82 64 L108 60 Z" fill="#F59E0B"/><path d="M26 60 Q64 48 102 60" stroke="#1F2937" stroke-width="8" fill="none" stroke-linecap="round"/><rect x="30" y="56" width="30" height="20" rx="8" fill="#111827"/><rect x="68" y="56" width="30" height="20" rx="8" fill="#111827"/><path d="M48 92 Q64 104 80 92" stroke="#B45309" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="64" cy="84" r="5" fill="#EF4444"/></svg>`,
      is_favorite: true,
    },
    {
      name: 'Heart Fire',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="gf" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#EF4444"/><stop offset="100%" stop-color="#F59E0B"/></linearGradient></defs><path d="M64 116 C30 90 12 70 12 44 C12 24 28 12 46 12 C56 12 62 18 64 22 C66 18 72 12 82 12 C100 12 116 24 116 44 C116 70 98 90 64 116 Z" fill="url(#gf)"/><path d="M54 75 Q64 45 68 62 Q76 42 74 72 Q64 85 54 75 Z" fill="#FEF08A"/></svg>`,
      is_favorite: true,
    },
    {
      name: 'Party Blob',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="54" fill="#8B5CF6"/><circle cx="44" cy="54" r="6" fill="#FFFFFF"/><circle cx="84" cy="54" r="6" fill="#FFFFFF"/><path d="M46 76 Q64 96 82 76" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/><polygon points="64,6 48,34 80,34" fill="#EC4899"/><circle cx="64" cy="6" r="6" fill="#FBBF24"/><circle cx="24" cy="28" r="4" fill="#34D399"/><circle cx="106" cy="32" r="5" fill="#60A5FA"/><circle cx="102" cy="98" r="4" fill="#F472B6"/></svg>`,
      is_favorite: false,
    },
    {
      name: 'Thumbs Up Star',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><polygon points="64,10 79,46 118,48 88,72 98,110 64,88 30,110 40,72 10,48 49,46" fill="#FBBF24" stroke="#F59E0B" stroke-width="4"/><circle cx="50" cy="56" r="5" fill="#78350F"/><circle cx="78" cy="56" r="5" fill="#78350F"/><path d="M52 74 Q64 84 76 74" stroke="#78350F" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
      is_favorite: false,
    },
    {
      name: 'Laughing Cry',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="56" fill="#FCD34D"/><path d="M34 50 Q46 38 58 52" stroke="#78350F" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M70 52 Q82 38 94 50" stroke="#78350F" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M38 72 Q64 104 90 72 Z" fill="#78350F"/><path d="M46 74 Q64 96 82 74 Z" fill="#EF4444"/><ellipse cx="26" cy="68" rx="8" ry="12" fill="#60A5FA"/><ellipse cx="102" cy="68" rx="8" ry="12" fill="#60A5FA"/></svg>`,
      is_favorite: true,
    },
    {
      name: 'Mind Blown',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="74" r="46" fill="#FBBF24"/><ellipse cx="64" cy="34" rx="42" ry="24" fill="#F97316"/><circle cx="48" cy="30" r="14" fill="#EF4444"/><circle cx="80" cy="30" r="14" fill="#EF4444"/><circle cx="50" cy="74" r="6" fill="#1F2937"/><circle cx="78" cy="74" r="6" fill="#1F2937"/><ellipse cx="64" cy="94" rx="10" ry="14" fill="#78350F"/></svg>`,
      is_favorite: false,
    },
  ]

  for (const s of defaultStickers) {
    const blob = new Blob([s.svg], { type: 'image/svg+xml' })
    await saveCustomSticker(blob, s.name, s.is_favorite)
  }
}

/**
 * Menyimpan file biner gambar (Blob) ke IndexedDB lokal perangkat
 */
export async function saveLocalMedia(
  messageId: string,
  conversationId: string,
  blob: Blob
): Promise<void> {
  await localDb.media_files.put({
    id: messageId,
    conversation_id: conversationId,
    blob,
    mime_type: blob.type || 'image/jpeg',
    size: blob.size,
    created_at: Date.now(),
  })
}

/**
 * Mengambil file biner gambar (Blob) dari IndexedDB lokal perangkat
 */
export async function getLocalMedia(messageId: string): Promise<LocalMediaFile | undefined> {
  return await localDb.media_files.get(messageId)
}

/**
 * Menghapus file biner gambar dari IndexedDB lokal
 */
export async function deleteLocalMedia(messageId: string): Promise<void> {
  await localDb.media_files.delete(messageId)
}

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

/**
 * Hapus Pesan untuk Saya Saja (Delete for Me)
 * Menghapus pesan secara fisik dari IndexedDB perangkat ini saja tanpa tombstone / sinkronisasi ke orang lain.
 */
export async function deleteLocalMessageOnly(
  messageId: string,
  conversationId: string
): Promise<void> {
  await localDb.transaction('rw', [localDb.messages, localDb.conversations, localDb.media_files], async () => {
    // 1. Hapus dari tabel messages dan media_files
    await localDb.messages.delete(messageId)
    await localDb.media_files.delete(messageId)

    // 2. Jika pesan ini adalah last_message di percakapan, cari pesan pengganti terakhir
    const conv = await localDb.conversations.get(conversationId)
    if (conv?.last_message?.id === messageId) {
      const remainingMsgs = await localDb.messages
        .where('conversation_id')
        .equals(conversationId)
        .toArray()

      const sorted = remainingMsgs.sort(
        (a, b) => (b.server_ts || b.local_ts) - (a.server_ts || a.local_ts)
      )
      const newLastMsg = sorted[0]

      await localDb.conversations.update(conversationId, {
        last_message: newLastMsg
          ? {
              id: newLastMsg.id,
              content: newLastMsg.is_deleted ? 'Pesan telah terhapus' : newLastMsg.content,
              type: newLastMsg.type,
              sender_id: newLastMsg.sender_id,
              status: newLastMsg.status,
              server_ts: newLastMsg.server_ts,
              created_at: newLastMsg.created_at,
              is_deleted: newLastMsg.is_deleted,
            }
          : null,
      })
    }
  })
}

/**
 * Bersihkan Seluruh Obrolan (Clear Chat)
 * Menghapus semua pesan dan media di room tersebut dari IndexedDB lokal.
 */
export async function clearLocalConversationMessages(conversationId: string): Promise<void> {
  await localDb.transaction('rw', [localDb.messages, localDb.conversations, localDb.media_files], async () => {
    const msgs = await localDb.messages.where('conversation_id').equals(conversationId).toArray()
    for (const msg of msgs) {
      await localDb.media_files.delete(msg.id)
    }
    await localDb.messages.where('conversation_id').equals(conversationId).delete()

    await localDb.conversations.update(conversationId, {
      last_message: null,
      unread_count: 0,
      updated_at: Date.now(),
    })
  })
}
