# Supabase RLS Verification Checklist

Go to: https://supabase.com/dashboard/project/zniucpbeepxysvkshpir/auth/policies

For EACH of these tables, verify:

1. **RLS is enabled** (toggle on)
2. **SELECT policy**: `user_id = auth.uid()`
3. **INSERT policy**: `user_id = auth.uid()`
4. **UPDATE policy**: `user_id = auth.uid()`
5. **DELETE policy**: `user_id = auth.uid()`

## Tables to verify

- [ ] `profiles` (use `id = auth.uid()` since user_id = id here)
- [ ] `check_ins`
- [ ] `dose_logs`
- [ ] `meal_entries`
- [ ] `workout_logs`
- [ ] `journal_entries`
- [ ] `saved_stacks`
- [ ] `health_profiles`
- [ ] `active_protocols`
- [ ] `consultation_requests`
- [ ] `chat_messages` (if exists)

## Quick SQL to check all tables

Run this in Supabase SQL editor:

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) AS policy_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Any table with `rls_enabled = false` OR `policy_count = 0` is vulnerable.

## Quick fix template for any table missing policies

```sql
ALTER TABLE public.TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own rows" ON public.TABLE_NAME
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rows" ON public.TABLE_NAME
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rows" ON public.TABLE_NAME
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rows" ON public.TABLE_NAME
  FOR DELETE USING (auth.uid() = user_id);
```

Replace `user_id` with `id` for the `profiles` table.

## Testing

After enabling, test as logged-in user A:
```
curl -H "apikey: ANON_KEY" -H "Authorization: Bearer USER_A_JWT" \
  "https://zniucpbeepxysvkshpir.supabase.co/rest/v1/check_ins?user_id=eq.USER_B_ID"
```
Should return empty array `[]`, not User B's data.
