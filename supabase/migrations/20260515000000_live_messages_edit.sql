-- Wave 66: live message edit + soft-delete
--
-- Adds last_edited_at + is_deleted to community_live_messages so users
-- can fix typos / retract their own messages, matching the UX they
-- already have on regular community comments.

ALTER TABLE public.community_live_messages
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

ALTER TABLE public.community_live_messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
