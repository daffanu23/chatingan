-- ==============================================================================
-- MIGRATION: Hybrid Local-First Multi-Device Chat Architecture
-- Description:
-- 1. Retains persistent profiles & user authentication for @username discovery.
-- 2. Adds user_devices table for active device session tracking.
-- 3. Adds device_message_queue table for ephemeral store-and-forward message delivery.
-- 4. Purges and deprecates persistent server-side messages table.
-- ==============================================================================

-- 1. USER DEVICES TABLE
-- Tracks active devices/browser sessions for each user.
CREATE TABLE IF NOT EXISTS public.user_devices (
    device_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL DEFAULT 'Web Browser',
    device_type TEXT NOT NULL DEFAULT 'desktop', -- 'desktop' | 'mobile' | 'tablet' | 'browser'
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup of all devices belonging to a user (used during fan-out)
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON public.user_devices(last_active_at);

-- Enable Row Level Security (RLS) on user_devices
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own registered devices
DROP POLICY IF EXISTS "Users can view their own devices" ON public.user_devices;
CREATE POLICY "Users can view their own devices"
    ON public.user_devices FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own devices" ON public.user_devices;
CREATE POLICY "Users can insert their own devices"
    ON public.user_devices FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own devices" ON public.user_devices;
CREATE POLICY "Users can update their own devices"
    ON public.user_devices FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own devices" ON public.user_devices;
CREATE POLICY "Users can delete their own devices"
    ON public.user_devices FOR DELETE
    USING (auth.uid() = user_id);

-- Also allow authenticated users to view active devices of other users for fan-out routing
DROP POLICY IF EXISTS "Authenticated users can read devices for fanout" ON public.user_devices;
CREATE POLICY "Authenticated users can read devices for fanout"
    ON public.user_devices FOR SELECT
    TO authenticated
    USING (true);


-- 2. EPHEMERAL DEVICE MESSAGE QUEUE TABLE
-- Acts as a temporary store-and-forward buffer.
-- Events are immediately deleted once ACKed by target client.
CREATE TABLE IF NOT EXISTS public.device_message_queue (
    id BIGSERIAL PRIMARY KEY,
    target_device_id TEXT NOT NULL REFERENCES public.user_devices(device_id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_device_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'message:new' | 'message:status' | 'message:delete'
    payload JSONB NOT NULL,
    server_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient target retrieval & ACK removal
CREATE INDEX IF NOT EXISTS idx_device_queue_target ON public.device_message_queue(target_device_id, id ASC);
CREATE INDEX IF NOT EXISTS idx_device_queue_target_user ON public.device_message_queue(target_user_id);
CREATE INDEX IF NOT EXISTS idx_device_queue_expires_at ON public.device_message_queue(expires_at);

-- Enable RLS on device_message_queue
ALTER TABLE public.device_message_queue ENABLE ROW LEVEL SECURITY;

-- Device owners can fetch their pending events
DROP POLICY IF EXISTS "Users can select pending events for their devices" ON public.device_message_queue;
CREATE POLICY "Users can select pending events for their devices"
    ON public.device_message_queue FOR SELECT
    USING (auth.uid() = target_user_id);

-- Authenticated senders can enqueue events for recipients or self-sync
DROP POLICY IF EXISTS "Authenticated users can enqueue sync events" ON public.device_message_queue;
CREATE POLICY "Authenticated users can enqueue sync events"
    ON public.device_message_queue FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Target users can delete events upon receiving and acknowledging (ACK)
DROP POLICY IF EXISTS "Users can delete ACKed events for their devices" ON public.device_message_queue;
CREATE POLICY "Users can delete ACKed events for their devices"
    ON public.device_message_queue FOR DELETE
    USING (auth.uid() = target_user_id);


-- 3. AUTOMATIC CLEANUP FUNCTION FOR EXPIRED QUEUE ITEMS
CREATE OR REPLACE FUNCTION public.cleanup_expired_device_queue()
RETURNS void AS $$
BEGIN
    DELETE FROM public.device_message_queue
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. ENABLE REALTIME BROADCAST & POSTGRES CHANGES FOR DEVICE QUEUE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'device_message_queue'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.device_message_queue;
    END IF;
END $$;


-- 5. PURGE AND RETIRE OLD PERMANENT SERVER MESSAGES
-- Truncate / clear existing permanent messages from server database
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
        TRUNCATE TABLE public.messages;
    END IF;
END $$;
