import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() || ''

    if (query.length < 2) {
      return NextResponse.json({ users: [] })
    }

    const cleanQuery = query.startsWith('@') ? query.slice(1) : query

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, is_online, last_seen')
      .neq('id', user.id)
      .ilike('username', `%${cleanQuery}%`)
      .limit(10)

    if (error) {
      console.error('[API] Error searching users:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ users: profiles || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
