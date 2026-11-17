import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatLayout from '@/components/chat/chat-layout'

export default async function ChatPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch data user/profil dari database persistent server
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  return <ChatLayout currentUser={profile} />
}
