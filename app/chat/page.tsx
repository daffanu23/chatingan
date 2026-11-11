import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatLayout from '@/components/chat/chat-layout'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch conversations with members and last message
  const { data: conversations } = await supabase
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

  // Calculate unread counts per conversation for current user
  const { data: unreadMessages } = await supabase
    .from('messages')
    .select('id, conversation_id')
    .neq('sender_id', user.id)
    .eq('is_read', false)

  const initialUnreadCounts: Record<string, number> = {}
  unreadMessages?.forEach((m) => {
    initialUnreadCounts[m.conversation_id] = (initialUnreadCounts[m.conversation_id] || 0) + 1
  })

  // Get last message per conversation
  const conversationsWithLastMessage = (conversations ?? []).map((conv) => {
    const sortedMessages = (conv.messages ?? []).sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return {
      ...conv,
      lastMessage: sortedMessages[0] ?? null,
    }
  })

  return (
    <ChatLayout
      currentUser={profile!}
      initialConversations={conversationsWithLastMessage}
      initialUnreadCounts={initialUnreadCounts}
    />
  )
}
