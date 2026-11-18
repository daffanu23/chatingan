export type MessageStatus = 0 | 1 | 2 | 3
// 0: PENDING (local only, not yet sent to server)
// 1: SENT (received by server, stamped with server_ts)
// 2: DELIVERED (received by at least one recipient device)
// 3: READ (read by recipient)

export const MESSAGE_STATUS = {
  PENDING: 0 as MessageStatus,
  SENT: 1 as MessageStatus,
  DELIVERED: 2 as MessageStatus,
  READ: 3 as MessageStatus,
}

export type LocalMessage = {
  id: string // ULID
  conversation_id: string
  sender_id: string
  sender_device_id: string
  content: string | null
  type: 'text' | 'image' | 'sticker'
  image_url: string | null
  status: MessageStatus
  is_deleted: boolean // Tombstone marker
  deleted_at?: number | null
  local_ts: number
  server_ts: number
  created_at: string
  read_at?: string | null
  recipient_id?: string // For DM routing convenience
}

export type LocalConversation = {
  id: string
  type: 'dm' | 'group'
  name: string | null
  avatar_url: string | null
  created_by: string
  members: {
    user_id: string
    role: string
    username: string
    avatar_url: string | null
    is_online?: boolean
  }[]
  last_message?: {
    id: string
    content: string | null
    type: 'text' | 'image' | 'sticker'
    sender_id: string
    status: MessageStatus
    server_ts: number
    created_at: string
    is_deleted?: boolean
  } | null
  unread_count: number
  updated_at: number // server_ts or local_ts
  created_at: string
  is_pinned?: boolean
  is_archived?: boolean
}

export type LocalTombstone = {
  message_id: string
  conversation_id: string
  deleted_at: number
}

export type LocalDeviceMeta = {
  key: string
  value: string
}

export type LocalMediaFile = {
  id: string // message_id
  conversation_id: string
  blob: Blob
  mime_type: string
  size: number
  created_at: number
}

export type LocalSticker = {
  id: string // ULID
  name: string
  blob: Blob
  mime_type: string
  size: number
  is_favorite: boolean
  pack_name?: string
  created_at: number
}

export type SyncEventType = 'message:new' | 'message:status' | 'message:delete'

export type SyncEventPayload = {
  message_id: string
  conversation_id: string
  sender_id: string
  sender_device_id: string
  content?: string | null
  type?: 'text' | 'image' | 'sticker'
  image_url?: string | null
  status?: MessageStatus
  server_ts: number
  created_at?: string
  conversation_metadata?: {
    type: 'dm' | 'group'
    name?: string | null
    members: {
      user_id: string
      role: string
      username: string
      avatar_url: string | null
    }[]
  }
}

export type SyncEvent = {
  id?: number // queue id from server
  event_id: string
  event_type: SyncEventType
  sender_id: string
  sender_device_id: string
  target_user_id: string
  target_device_id: string
  server_ts: string | number
  payload: SyncEventPayload
}

export type RegisteredDevice = {
  device_id: string
  user_id: string
  device_name: string
  device_type: 'desktop' | 'mobile' | 'tablet' | 'browser'
  last_active_at: string
  created_at: string
}
