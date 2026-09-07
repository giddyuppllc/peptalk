# Fixing the subscription levels in App Store Connect

Written to be followed exactly, by a person or an agent, without judgement
calls. If something on screen does not match what is written here, **stop and
say so** rather than improvising — the failure mode for this task is silent and
expensive.

- **Time:** about two minutes.
- **Cost:** none. It does not require a new build, does not restart review, and
  is free to change while the products are in "Ready for Review".
- **Risk if done wrong:** you can break live subscriptions. See "Do not" below.

---

## What is wrong

In App Store Connect, subscriptions in a group are **ranked**, and
**Level 1 is the highest level of service.** The number counts *down* in value,
not up. This is the opposite of how almost everyone reads it, which is why it
was set backwards.

PepTalk currently has it inverted:

| Subscription | Price | Level now | Should be |
|---|---|---|---|
| PepTalk Pro Monthly | $49.99/mo | 3 | **1** |
| PepTalk Plus Monthly | $9.99/mo | 1 | **2** |

So StoreKit believes **Plus is the premium tier and Pro is the cheap one.**

## Why it matters

Apple uses the rank — not the price — to decide whether a subscription change
is an upgrade, a downgrade, or a crossgrade.

- **Upgrade** (moving to a *higher* level): takes effect immediately, and Apple
  refunds the unused portion of the old subscription pro rata.
- **Downgrade** (moving to a *lower* level): deferred to the end of the current
  billing period.

Right now a Plus subscriber choosing Pro is recorded as a **downgrade**. They
are charged $49.99, and they keep Plus-level entitlement until their renewal
date — up to a month of paying the higher price for the lower tier, with no
proration. From where they are standing, they paid and nothing happened.

It is also the most plausible reading of the 18 Jun rejection, "the in-app
purchase products were still not configured correctly."

---

## Do it

1. Sign in at **https://appstoreconnect.apple.com** as `edward@giddyupp.com`.
2. **Apps** → **PepTalk** (Apple ID `6760955746`).
3. In the left sidebar, under **Monetization**, click **Subscriptions**.
4. Click the subscription group — **PepTalk Premium**.
   *Click the group name itself, not either subscription underneath it.* The
   ranking lives on the group page; it does not exist on the individual
   subscription pages, and looking for it there is the most likely way to get
   lost.
5. Find the list of subscriptions on that page. It is ordered by rank, and each
   row shows its level. **The top row is Level 1.**
6. Reorder so the list reads, top to bottom:

   ```
   1   PepTalk Pro Monthly     $49.99
   2   PepTalk Plus Monthly    $9.99
   ```

   Depending on the ASC build you get, this is either a **drag handle** on the
   left of each row, or an **Edit** button above the list that turns the rows
   into a sortable list. Either way you are moving **Pro to the top**.
7. Click **Save** if a Save button appears. Some versions of this screen save on
   drop and show a brief confirmation instead — if there is no Save button, do
   not go hunting for one.

## Check it worked

Reload the group page. Pro must read **Level 1** and Plus **Level 2**.

Do not trust the drag animation — reload. If the reload shows the old order, the
change did not save; try again rather than assuming.

---

## Do not

- **Do not delete a subscription and recreate it to force the order.** A deleted
  product ID can never be reused, existing subscribers are orphaned, and the app
  ships those exact IDs in `src/lib/products.ts`. This is unrecoverable.
- **Do not change either price.** $49.99 and $9.99 are both intentional and we
  are telling App Review so in the same submission.
- **Do not change the product IDs, the group name, or the localised display
  names.** The app matches on product ID.
- **Do not touch the "Ready for Review" status** of the subscriptions or try to
  submit them on their own. A first-ever subscription cannot be approved alone —
  it rides along with the binary, and it will keep showing "Ready for Review"
  on every submission until a build passes. That is expected, not an error.
- **Do not create a new subscription group.** One group is correct; two groups
  means a customer can hold both at once.

## If the levels already read Pro = 1, Plus = 2

Then someone has already fixed it. Change nothing, and say so.

---

## The other route, if you would rather I did it

There is an App Store Connect API key configured for this project in
`eas.json` — key ID `9GTUH8JTAM`, issuer `be5215e8-dc3d-4200-a841-b0d2d4a7e0e2`.
The API can set subscription ranking without touching the web UI.

The private key it needs, `keys/AppStoreConnect_9GTUH8JTAM.p8`, **is not on this
machine** — the `keys/` directory does not exist here. It is gitignored, so it
lives on whichever machine last submitted a build, or in EAS secrets.

If that file turns up, this can be done from the terminal and verified by
reading the levels back. Ask before assuming — the API path also makes it
possible to change more than intended in one call, so it needs the same
"reorder only" discipline as the manual route.
