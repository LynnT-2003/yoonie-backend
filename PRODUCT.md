# Yoonie — Product Guide

This document bridges *what we're selling* (the pitch) with *what the code does* (the implementation). For technical architecture — folder structure, module dependency graph, migration plan — see [`README.md`](./README.md). This file exists so anyone working on the backend (human or agent) can tell whether a change serves the product or drifts into generic CRUD.

## 1. What Yoonie Is

Yoonie is a unified hospitality operating system for independent boutique hotels and multi-service operators. It replaces fragmented legacy software (PMS + POS + paper clipboards + messaging apps) by bridging direct online booking with on-the-ground resource dispatch. Rooms, dining, and guest experiences (tours, spa, transfers) share one native data model, so operators can sell directly instead of through high-commission OTAs, own their guest relationships, and run synchronized frontline operations from a single source of truth.

## 2. The Problem

- **Margin erosion & lost ownership** — operators give up 15–25% of top-line revenue to OTAs (Booking.com, Agoda, Viator) and get back masked guest contacts, no data ownership, and no attribution on marketing spend.
- **The "volume vs. value" trap** — F&B accounts for ~67% of transaction *lines* but only ~10% of *revenue*, while Rooms/Tours/Transfers drive ~90% of revenue yet suffer operational blind spots because operational effort is misallocated toward the high-volume, low-margin side.
- **Siloed systems → guest friction** — room bookings on legacy PMS, dining on disconnected POS, tours/transfers on clipboards or chat apps. Result: low check-in satisfaction (~3.1/5.0), ~20% tour dissatisfaction from schedule rigidity, and over half of pipeline value lost to unconfirmed reservations, cancellations, and no-shows.

## 3. How the Product Maps to the Codebase

| Product pillar (pitch) | Domain module(s) | What's implemented today |
|---|---|---|
| **Direct-Channel Booking Engine** — composite cart (room + dining + tour + transfer) in one checkout | `order`, `inventory` | `OrderService.create` builds multi-line orders (`StayDetail`/`DiningDetail`/`ServiceDetail` per line); `InventoryService.hold`/`confirm` give every line a single atomic conditional `$inc` against an `InventorySlot`, so overbooking across room-nights, dining seats, and tour/transfer/spa capacity is prevented the same way everywhere. |
| **Master Guest CDP & Attribution Engine** — own guest identity, prove direct-booking ROI | `user` (guest fields), `order.attribution` | `User` carries `phoneE164`, `lineUserId`, `whatsappOptIn`, `preferredLanguage`, and derived `vipScore`/`vipTier` from `stats` (lifetime spend, stay count). Every `Order` captures UTM source/medium/campaign/channel at the point of booking — the seed script runs a live aggregation of "direct-booking revenue by UTM source," which is the attribution story made concrete. |
| **Front-Desk Zero Housekeeping Dispatch** — clean rooms in arrival order, not room-number order | `room`, `dispatch` (`HOUSEKEEPING_TURNAROUND`) | `dispatch-rules.housekeepingPriority(etaAt, isVip)` scores rooms by how soon the guest arrives (plus a VIP bump), not by room number. `Room` itself only tracks physical/cleaning state — it deliberately does not compute availability. |
| **Fleet & Tour Yield Optimizer** — flag under-filled tours/transfers before they go out | `dispatch` (`TOUR_CONSOLIDATION`), `dispatch-rules.evaluateConsolidation` | Compares booked pax against `minViablePax`/capacity snapshotted on the `InventorySlot`; flags CRITICAL (below viable minimum) or WARN (below the branch's `consolidationThreshold`), and computes projected loss (`fixedCost - revenue`) so a dispatcher can decide to merge or cancel before departure. |
| **Automated Guest Transit Hub** — bilingual pickup details delivered automatically | `dispatch` (`AIRPORT_PICKUP`), `dispatch-rules.buildPickupCard` | Generates an EN/TH pickup card (meeting door, driver, plate, flight) from `ServiceDetail.FlightInfo` (dispatch reads *estimated*, not scheduled, arrival time); `PickupPayload` has a `channel` field (WHATSAPP/LINE) and `deliveryStatus`, ready for a sender to be wired in. |
| **Property/tenant configuration** | `branch` | Per-property settings that tune the above: `vatRate`, `serviceChargeRate`, `holdTtlMinutes` (how long a cart hold lives), `consolidationThreshold`, `dispatchGenerationTime` (target time for the daily run-sheet job). |

## 4. Current State vs. Gaps

**Solid and implemented:**
- 7 bounded-context domain modules (`branch`, `room`, `restaurant`, `service`, `inventory`, `order`, `dispatch`), replacing the old monolithic `hospitality` module.
- Atomic inventory concurrency engine — one conditional `$inc` per sellable unit, used identically for rooms, dining, and services.
- Composite order lifecycle with derived totals (subtotal/discount/service charge/VAT/grand total) and derived order status from line states.
- Dispatch rules engine (pure functions, no DB access) for housekeeping priority, tour consolidation, and bilingual pickup cards.
- Realistic seed dataset (`src/seed/seed.ts`) modeling a real scenario: BKK-RIVERSIDE, a Bangkok riverside boutique hotel.

**Gaps to know about before building further (not blockers for continued build-out, but don't let them become invisible defaults):**
- Nearly every hospitality endpoint is `@Public()` — the global JWT guard is bypassed everywhere except `POST /branches`. Fine while the domain model is being built; must be closed before any of this is exposed beyond local/dev use.
- Zero automated test coverage on any of the 7 new modules (only the Nest-generated boilerplate spec exists).
- `BlockRoomRangeDto` exists but no controller route uses it yet — maintenance/owner-hold blocking isn't reachable via the API.
- No scheduled job actually triggers the "05:30 dispatch generation" the rules and `branch.settings.dispatchGenerationTime` are built for — the rules exist, the cron doesn't.
- No outbound WhatsApp/LINE delivery — `PickupPayload.deliveryStatus` has states to track, but nothing sends.
- The actual "digital front door" — an embeddable direct-booking widget for the hotel's website — doesn't exist yet. Everything described in Section 3 is backend API only; there is no guest-facing checkout.
- Swagger/API docs branding still says the generic scaffold title ("NestJS API Template"), not Yoonie.

## 5. Product Principles to Preserve

These are invariants the current code already encodes. Treat them as constraints, not suggestions, when extending the domain:

- **Room ≠ availability.** `RoomModule` tracks physical/cleaning state only. Selling and availability always go through `InventorySlot`.
- **One atomic `$inc`, one concurrency model.** Every sellable unit — room-night, dining seat, tour/transfer/spa session — books through the same conditional increment on `InventorySlot`. Don't introduce a parallel locking strategy for a new product type.
- **Dispatch generation must be idempotent.** It's designed to run as a repeatable scheduled job (`dedupeKey` upserts), not a one-shot script. Any new dispatch type should follow the same natural-key upsert pattern.
- **Every order is attributable.** `attribution` (UTM + channel) is captured at booking time on every order — this is the entire basis for proving direct-booking ROI against OTA dependence. Don't add a booking path that skips it.
- **Business dates are timezone-safe by construction.** Store `YYYY-MM-DD` business-date strings alongside real UTC timestamps (see `common/helpers/time.helper.ts`) rather than deriving the business date from UTC at read time.

## 6. Where to Look

- [`README.md`](./README.md) — technical architecture, target folder structure, module dependency graph.
- [`src/seed/seed.ts`](./src/seed/seed.ts) — the clearest concrete picture of the data shape: a full BKK-RIVERSIDE scenario (40 rooms across 3 types, 2 restaurants, 4 experience services, a realistic order book with varied UTM attribution, and a generated dispatch board) — closer to ground truth than any schema diagram.
- [`src/dispatch/rules/dispatch-rules.ts`](./src/dispatch/rules/dispatch-rules.ts) — the clearest expression of product logic in pure, DB-free functions (priority scoring, consolidation economics, bilingual pickup cards).
