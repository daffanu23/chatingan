export type Profile = {
  id: string
  username: string
  avatar_url: string | null
  is_online: boolean
  last_seen: string
  created_at: string
  updated_at: string
}

export type Conversation = {
  id: string
  type: 'dm' | 'group'
  name: string | null
  avatar_url: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type ConversationMember = {
  conversation_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  type: 'text' | 'image'
  image_url: string | null
  is_read?: boolean
  read_at?: string | null
  created_at: string
  updated_at: string
}

export type ConversationWithDetails = Conversation & {
  conversation_members: (ConversationMember & {
    profiles: Profile
  })[]
  messages: Message[]
}
