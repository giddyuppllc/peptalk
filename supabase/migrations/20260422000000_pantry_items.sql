-- Pantry / fridge inventory — stores what's in the user's kitchen so
-- they can build meals from real on-hand ingredients, get expiry alerts,
-- and feed the pantry-aware AI meal suggestions.

CREATE TABLE IF NOT EXISTS public.pantry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'each',
  category TEXT,  -- produce, dairy, grain, protein, condiment, frozen, pantry, etc.
  storage_location TEXT NOT NULL DEFAULT 'pantry' CHECK (storage_location IN ('fridge', 'freezer', 'pantry')),
  expiry_date DATE,
  purchase_date DATE,
  opened_date DATE,
  barcode TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pantry_items_user ON public.pantry_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_items_expiry ON public.pantry_items(user_id, expiry_date) WHERE expiry_date IS NOT NULL;

-- Apply the standard own-row RLS policies used by every other user table.
SELECT public._apply_user_id_rls('pantry_items');
