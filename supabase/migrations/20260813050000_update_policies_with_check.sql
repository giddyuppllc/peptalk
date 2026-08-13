-- UPDATE policies had USING but no WITH CHECK — a row could be moved into
-- another user's account.
--
-- USING decides WHICH ROWS you may update. WITH CHECK decides WHAT YOU MAY
-- TURN THEM INTO. With only USING, `auth.uid() = user_id` stopped a user
-- touching someone else's row, but nothing stopped them updating their OWN row
-- and setting user_id to a victim's uuid — planting a dose log, journal entry,
-- check-in or health profile inside that person's record. Reads stay scoped, so
-- this was write-pollution rather than exfiltration, but in a health app a
-- fabricated dose entry in someone's history is not a small thing.
--
-- The INSERT policies on these same tables already carry
-- `WITH CHECK (auth.uid() = user_id)`, so inserting into another account was
-- blocked while updating into one was not — the two halves disagreed.
--
-- Each WITH CHECK mirrors that policy's own USING expression (profiles keys on
-- `id`, the rest on `user_id`). DDL generated from pg_policies rather than
-- hand-transcribed, so no table is missed or misspelled.
--
-- Legitimate traffic is unaffected: normal updates never change user_id, and
-- edge functions use the service role, which bypasses RLS entirely.

alter policy "Own rows update" on public.active_protocols with check (auth.uid() = user_id);
alter policy "Own rows update" on public.allergen_entries with check (auth.uid() = user_id);
alter policy "Own rows update" on public.chat_messages with check (auth.uid() = user_id);
alter policy "Own rows update" on public.check_ins with check (auth.uid() = user_id);
alter policy "Own rows update" on public.connected_integrations with check (auth.uid() = user_id);
alter policy "Own rows update" on public.contraception_history with check (auth.uid() = user_id);
alter policy "Own rows update" on public.cycle_day_logs with check (auth.uid() = user_id);
alter policy "Own rows update" on public.cycle_period_entries with check (auth.uid() = user_id);
alter policy "Own rows update" on public.dose_logs with check (auth.uid() = user_id);
alter policy "Own rows update" on public.health_profiles with check (auth.uid() = user_id);
alter policy "Own rows update" on public.injection_sites with check (auth.uid() = user_id);
alter policy "Own rows update" on public.journal_entries with check (auth.uid() = user_id);
alter policy "Own rows update" on public.meal_entries with check (auth.uid() = user_id);
alter policy "Own rows update" on public.pantry_items with check (auth.uid() = user_id);
alter policy "Own profile update" on public.profiles with check (auth.uid() = id);
alter policy "Own rows update" on public.saved_stacks with check (auth.uid() = user_id);
alter policy "Own rows update" on public.workout_logs with check (auth.uid() = user_id);
