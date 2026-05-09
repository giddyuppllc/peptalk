-- Wave 67: enable Realtime publication on community_posts +
-- community_comments so the feed UI updates without polling.
--
-- Required for clients to subscribe via supabase.channel(...).on(
-- 'postgres_changes', { table: 'community_posts' }, ...).

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
