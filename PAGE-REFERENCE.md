# PepTalk App — Full Page & Feature Reference

## Tab Bar (Bottom Navigation)

### 1. Home Dashboard
**Tab: Home (house icon) | File: `app/(tabs)/index.tsx`**
- Personalized greeting + streak counter
- 6 quick action buttons (Check In, Log Dose, Workout, Nutrition, Ask Pepe, Journal)
- Daily health tip
- Weekly trend visualization
- Nutrition macro progress bars
- Active protocols display
- Peptide category grid + search + card list

### 2. Calendar / Dose Logging
**Tab: Calendar (calendar icon) | File: `app/(tabs)/calendar.tsx`**
- Monthly calendar with visual dots for doses, check-ins, workouts, meals
- Day detail panel for selected date
- Dose logging form (substance, amount, unit, route, site, notes)

### 3. PepTalk AI Chat
**Tab: Pepe (chat icon) | File: `app/(tabs)/peptalk.tsx`**
- Chat with AI assistant (Grok-powered)
- Starter suggestion chips
- Quick reply suggestions
- Context-aware (knows your peptides, check-ins, stacks)

### 4. My Stacks / Stack Explorer
**Tab: Stacks (layers icon) | File: `app/(tabs)/my-stacks.tsx`**
- Goal filter chips (Weight Loss, Recovery, Cognitive, etc.)
- Curated stack cards with peptide lists
- User-created stacks
- Load/delete stacks

### 5. Profile
**Tab: Profile (person icon) | File: `app/(tabs)/profile.tsx`**
- User info, avatar, subscription tier
- Notification preferences
- Theme toggle (dark/light)
- Links to: Edit Onboarding, Health Profile, Health Report, Subscription, Privacy, Terms
- Dev accounts access
- Export/delete data, logout

### 6. Stack Builder (Hidden Tab)
**File: `app/(tabs)/stack-builder.tsx`**
- 5 peptide slots with interaction preview
- Category filter + search
- Save stack dialog

### 7. Check-In (Hidden Tab)
**File: `app/(tabs)/check-in.tsx`**
- Rate: Mood, Energy, Stress, Sleep, Recovery, Appetite (1-5)
- Inputs: Weight, HR, Steps, Apple Watch metrics
- Peptide effects + side effects
- Journal notes

### 8. Feed / Research Feed (Hidden Tab)
**File: `app/(tabs)/feed.tsx`**
- Category filters (Research, New Peptides, Medical, Regulatory)
- Research article cards with authors + related peptides

---

## Nutrition Screens

### 9. Nutrition Dashboard
**Path: Home → Nutrition | File: `app/nutrition/index.tsx`**
- Daily macro progress bars (cal, protein, carbs, fat, fiber, water)
- Logged meals list (grouped by meal type)
- Quick log modal
- Water tracker
- Buttons: Food Search, Recipe Generator, Grocery List, Targets

### 10. Food Search ★ (our rewrite)
**Path: Nutrition → Food Search | File: `app/nutrition/food-search.tsx`**
- Search bar + barcode scanner (teal btn) + custom food (blue + btn)
- Tabs: **Recent** | **My Meals**
- USDA search results with product images (OFF + UPC Item DB + Spoonacular)
- MFP-style portion picker:
  - `[qty] servings of [serving dropdown]`
  - Serving dropdown: food-specific options + WEIGHT section (1g, 1oz, 1lb, 1kg)
  - Live calorie + P/C/F macro pills
  - Collapsible FDA nutrition label
  - Meal type selector (6 options)
  - "Add Food" button
- Recent Foods: auto-saved, shows last serving + macros, + button to re-log
- My Meals tab: saved custom meals, + button to log by weight, edit/delete
- Meal Builder modal (`src/components/MealBuilder.tsx`):
  - Search + add ingredients from database
  - Set weight per ingredient
  - Live recipe totals
  - Save as reusable meal
- Barcode scanner modal (expo-camera, UPC/EAN)
- Custom food creation modal (name, brand, serving, macros)
- Local food cache (500 items, grows over time)

### 11. Macro Targets
**Path: Nutrition → Targets | File: `app/nutrition/targets.tsx`**
- Set daily goals: calories, protein, carbs, fat, fiber, water
- Quick presets: Fat Loss (1500), Maintenance (2000), Muscle Gain (2500)

### 12. AI Recipe Generator
**Path: Nutrition → Recipe Generator | File: `app/nutrition/recipe-generator.tsx`**
- Diet type + meal type selectors
- AI-generated recipes with ingredients + instructions + macros
- Log recipe as meal (Pro feature)

### 13. Grocery List
**Path: Nutrition → Grocery List | File: `app/nutrition/grocery-list.tsx`**
- Add items by category (Produce, Protein, Dairy, etc.)
- Checkbox list, clear checked/all

---

## Workout Screens

### 14. Workouts Hub
**Path: Home → Workout | File: `app/workouts/index.tsx`**
- Stats (total workouts, this week, streak)
- Workout program cards (name, creator, weeks, difficulty)
- Search exercises, view history

### 15. Program Detail
**Path: Workouts → tap program | File: `app/workouts/program.tsx`**
- Week-by-week breakdown with day cards showing exercises

### 16. Workout Player
**Path: Program → Start | File: `app/workouts/player.tsx`**
- Active workout session with set/rep tracking

### 17. Exercise Library
**Path: Workouts → Search Exercises | File: `app/workouts/exercises.tsx`**
- Searchable exercise database with filters

### 18. Workout History
**Path: Workouts → History | File: `app/workouts/history.tsx`**
- Logged workouts with date, duration, sets, rating

---

## Learn / Education

### 19. Learn Hub
**Path: Home → Learn | File: `app/learn/index.tsx`**
- Topics, Articles, Videos, How-To Guides
- Category filters (Basics, Safety, Protocols, Storage, Research)

### 20. Topic Detail
**Path: Learn → tap topic | File: `app/learn/topic/[id].tsx`**
- Expandable Q&A sections, related guides/articles/videos

### 21. Article Detail
**Path: Learn → tap article | File: `app/learn/article/[slug].tsx`**

### 22. Guides Hub
**Path: Learn → Guides | File: `app/learn/guides/index.tsx`**
- How-to guides with category filters

### 23. Guide Detail
**Path: Guides → tap guide | File: `app/learn/guides/[slug].tsx`**

### 24. Videos Hub
**Path: Learn → Videos | File: `app/learn/videos/index.tsx`**
- Video cards with thumbnails

### 25. Video Detail
**Path: Videos → tap video | File: `app/learn/videos/[slug].tsx`**

---

## Journal

### 26. Journal Feed
**Path: Home → Journal | File: `app/journal/index.tsx`**
- Entries filtered by category (Protocol Notes, Side Effects, Mood, Progress, etc.)
- Search + date range filters

### 27. New Journal Entry
**Path: Journal → New Entry | File: `app/journal/new.tsx`**
- Category selector, title, content, tags, peptide selector, mood picker

---

## Peptide Screens

### 28. Peptide Detail
**Path: Home → tap any peptide | File: `app/peptide/[id].tsx`**
- Full info: uses, dosing, safety, clinical trials, evidence grade, brand names
- Add to stack button

---

## Calculator Screens

### 29. Calculators Hub
**Path: Home → Calculators | File: `app/calculators/index.tsx`**
- Dosing Calculator card + Reconstitution Calculator card

### 30. Dosing Calculator
**Path: Calculators → Dosing | File: `app/calculators/dosing.tsx`**
- Peptide selector, body weight, target dose, frequency → injection amounts

### 31. Reconstitution Calculator
**Path: Calculators → Reconstitution | File: `app/calculators/reconstitution.tsx`**
- Vial amount + water volume → concentration + doses per vial

---

## Health & Profile Screens

### 32. Onboarding (first launch)
**File: `app/onboarding.tsx`**
- 8 steps: welcome, goals, demographics, topics, data consent, health basics, account, plan

### 33. Health Profile
**Path: Profile → Health Profile | File: `app/health-profile.tsx`**
- 7 steps: body metrics, health history, goals, nutrition, sleep, lifestyle, peptide experience

### 34. Health Report
**Path: Profile → Health Report | File: `app/health-report/index.tsx`**
- 14-day summary: demographics, protocols, check-in averages, journal stats
- Share/export/PDF

### 35. Nutritionist Consultation
**Path: Profile → Nutritionist | File: `app/nutritionist/index.tsx`**
- Contact form with auto-populated health summary

### 36. Subscription / Plans
**Path: Profile → Plans | File: `app/subscription.tsx`**
- 4 tiers: Free, Pepe ($9.99), Pepe Plus ($49.99), Pepe Pro ($99.99)

### 37. Privacy Policy
**Path: Profile → Privacy | File: `app/privacy.tsx`**

### 38. Terms of Service
**Path: Profile → Terms | File: `app/terms.tsx`**

### 39. Dev Accounts (testing only)
**Path: Profile → Dev Accounts | File: `app/dev-accounts.tsx`**
- 8 test personas with one-tap login

---

## Key Data Files

| File | Purpose |
|------|---------|
| `src/services/foodSearchService.ts` | USDA API, image pipeline, search logic |
| `src/store/useMealStore.ts` | Meals, recent foods, custom meals, food cache |
| `src/components/MealBuilder.tsx` | Custom meal builder component |
| `src/data/restaurantFoods.ts` | 80+ fast food items |
| `src/data/commonFoods.ts` | 120 offline fallback foods |
| `src/data/foodImages.ts` | Stock photo map (unused, Spoonacular replaced it) |
| `src/constants/theme.ts` | Colors, spacing, fonts, border radius |
| `src/components/GlassCard.tsx` | Glass-morphism card component |
| `src/components/GradientButton.tsx` | Gradient CTA button component |

## API Keys (.env)

| Key | Service | Purpose |
|-----|---------|---------|
| `EXPO_PUBLIC_USDA_API_KEY` | USDA FoodData Central | Nutrition data (primary) |
| `EXPO_PUBLIC_SPOONACULAR_API_KEY` | Spoonacular | Food images only |
| *(no key needed)* | Open Food Facts | Product images + barcode scans |
| *(no key needed)* | UPC Item DB | Backup product images |

## Dev Commands

```bash
# Start Expo (PowerShell)
$env:EXPO_NO_DOCTOR=1; npx expo start --tunnel --clear

# Install dependencies
npm install --legacy-peer-deps

# TypeScript check
npx tsc --noEmit
```
