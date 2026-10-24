# Yoonie — Multi-Tenancy Architecture & Domain Topology

> **Tagline:** *every booking, closed.*  
> **Core Principle:** Strict separation between the **Platform Onboarding**, **Guest-Facing Direct Booking Subdomains**, **Central Operator Hub**, and **Frontline Mobile Apps**.

---

## 1. Domain Topology Overview

Yoonie employs host-based multi-tenancy routing across three web surfaces and one mobile runtime.

```
                              [ Internet Users ]
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
   [ yoonie.si ]             [ sedona.yoonie.si ]           [ ops.yoonie.si ]
         │                            │                            │
 ┌───────┴────────┐           ┌───────┴────────┐           ┌───────┴────────┐
 │ Platform Root  │           │ Tenant Booking │           │ Operator Hub   │
 │ • Marketing    │           │ • Guest Engine │           │ • Owner Sign-in│
 │ • Workspace Reg│           │ • Rooms/Tours  │           │ • Admin CMS    │
 │ • Subscription │           │ • CompositeCart│           │ • Dispatch Run │
 └────────────────┘           └────────────────┘           └────────────────┘
                                                                   │
                                                                   ▼
                                                         [ yoonie-mobile-staff ]
                                                         • Frontline Drivers
                                                         • Housekeepers
```

---

## 2. The Three Web Surfaces

### Surface A: Platform Root (`yoonie.si`)
* **Target Audience:** Prospective hotel owners, hospitality operators, and enterprise executives.
* **Purpose:** Public platform front door, feature marketing, ROI proof points, and tenant onboarding.
* **Key User Flow:**
  1. An independent hotel owner (e.g., owner of *Sedona Hotel & Resort*) visits `yoonie.si`.
  2. Clicks **"Create Hotel Workspace"**.
  3. Registers hotel details, chooses their unique tenant slug (`sedona`), and binds payment.
  4. The platform provisions:
     - The guest-facing direct booking website: `sedona.yoonie.si`
     - The tenant entry in the centralized database: `Tenant { slug: "sedona", name: "Sedona Hotel & Resort" }`

---

### Surface B: Guest Direct-Booking Engine (`[tenant].yoonie.si`)
* **Example:** `sedona.yoonie.si` (or custom CNAME `stay.sedonabangkok.com`)
* **Target Audience:** Guests booking directly with that specific property.
* **Strict Isolation Constraints:**
  - **Zero Admin / Ops Leaks:** Guests never see operational dashboards, run-sheets, or admin toolbars.
  - **Strict Branding Isolation:** Displays *only* Sedona's logo, hero photography, color scheme, physical rooms, dining venues, and local experiences.
  - **No Cross-Tenant Contamination:** A guest browsing Sedona can never view or book inventory belonging to another hotel property.
* **Key Features:**
  - 5-Star luxury room catalog with high-resolution media galleries.
  - Composite shopping cart (Room + Airport Pickup + Dining Table + Longtail Boat Tour in 1 checkout).
  - 15-minute atomic inventory hold protection.
  - Guest self-service portal (`sedona.yoonie.si/account`) for reservation status.

---

### Surface C: Central Operator Hub (`ops.yoonie.si`)
* **Target Audience:** Hotel owners, general managers, dispatchers, and front-desk supervisors.
* **Single Sign-In Architecture:**
  - Every hotel owner and staff supervisor logs in at **one unified URL**: `ops.yoonie.si`.
  - There is no separate login portal for each hotel property.
* **RBAC & Workspace Resolution Flow:**
  ```
  1. Owner enters email & password at ops.yoonie.si/login
  2. Backend authenticates credentials
  3. RBAC Engine inspects User Profile:
     ├── User: "Anan Boonmee"
     ├── Role: "BRANCH_MGR" (or "ADMIN" / "OWNER")
     └── Workspaces: ["sedona", "bkk-riverside"]
  4. System scopes the session to the active Workspace:
     └── If multi-property owner: Top property switcher dropdown activates
  5. Owner lands on the Sedona Operations Dashboard
  ```
* **Core Capabilities within `ops.yoonie.si`:**
  - **Admin Property CMS:** Configure physical room inventory, dining table zones, shifts, tour pricing models, and upload media directly to Cloudflare R2.
  - **Frontline Operations Run-Sheet (`/ops/dispatch`):** 
    - Automated daily 05:30 operational run-sheet.
    - Tour yield consolidation warnings (under-capacity tours flagged before financial loss).
    - Housekeeping turnaround prioritization based on incoming guest ETA and VIP tier.
    - Airport transit coordinator with driver assignment and bilingual WhatsApp/LINE greeting cards.
  - **Master Guest CDP & Attribution Engine:** Direct booking ROI analytics, lifetime spend, and UTM attribution tracking.

---

## 3. Surface D: Frontline Mobile Staff App (`yoonie-mobile-staff`)

* **Target Audience:** Drivers, housekeepers, and floor attendants on iOS and Android devices.
* **Distribution:** Native app (Expo / React Native).
* **Operational Flow:**
  1. Staff members **cannot** publicly self-register; accounts are provisioned by the Branch Manager inside `ops.yoonie.si`.
  2. Driver Somchai or Housekeeper Noi logs in via `yoonie-mobile-staff`.
  3. The mobile session validates `branchIds` and inspects `jobTitle`:
     - `jobTitle: "DRIVER"` ➔ Routes to `/(app)/driver` (Airport pickups, flight ETA, terminal doors, trip lifecycle).
     - `jobTitle: "HOUSEKEEPER"` ➔ Routes to `/(app)/housekeeper` (Dirty rooms queue, swipe to start cleaning, mark clean).
     - Non-staff credentials (guest attempt) ➔ Rejected with `/(auth)/wrong-role`.
  4. **Offline Resilience:** SQLite task queue and cache enable staff to transition room status inside elevators or underground airport parking; auto-syncs when signal recovers.

---

## 4. End-to-End Operational Lifecycle

Here is how an order moves across all four surfaces without friction:

```
[ Step 1: Guest Books ]
Guest visits: sedona.yoonie.si
Selects: Riverside Villa + Airport Transfer (Flight TG917, Gate 4)
Pays: ฿12,500 via composite checkout
                              │
                              ▼
[ Step 2: Backend Orchestrates ]
• Atomic inventory slot incremented
• Operational dispatch task generated:
  - Type: AIRPORT_PICKUP
  - Branch: Sedona Hotel & Resort
  - Status: OPEN
                              │
                              ▼
[ Step 3: Owner / Dispatcher Coordinates ]
Dispatcher logs in at: ops.yoonie.si
Views: 05:30 Daily Dispatch Hub
Selects task: "Pickup for Flight TG917"
Action:
  - Selects Driver: Somchai Rattana
  - Clicks: "Dispatch to Driver (WhatsApp / Mobile)"
  - Status transitions: OPEN ➔ ACKNOWLEDGED
                              │
                              ▼
[ Step 4: Driver Executes on Mobile ]
Driver Somchai receives task on: yoonie-mobile-staff
• Sees passenger name, flight number, meeting door
• Taps: "Start Trip" (ops.yoonie.si updates to IN_PROGRESS)
• Picks up guest at Gate 4
• Taps: "Trip Completed" (ops.yoonie.si updates to DONE)
```

---

## 5. Technical Implementation Details

### Next.js Subdomain Routing (`middleware.ts`)
In Next.js App Router, routing is resolved at the edge via host inspection:

```typescript
// Conceptual Edge Middleware Routing
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const url = req.nextUrl;

  // 1. Operator Portal
  if (host === "ops.yoonie.si" || host.startsWith("ops.")) {
    return NextResponse.rewrite(new URL(`/ops-portal${url.pathname}`, req.url));
  }

  // 2. Platform Landing & Registration
  if (host === "yoonie.si" || host === "www.yoonie.si") {
    return NextResponse.rewrite(new URL(`/platform${url.pathname}`, req.url));
  }

  // 3. Tenant Subdomains: [tenant].yoonie.si
  const subdomain = host.split(".")[0];
  return NextResponse.rewrite(new URL(`/tenant/${subdomain}${url.pathname}`, req.url));
}
```

### Backend Multi-Tenant Data Partitioning
* **Database Isolation:** Single database with multi-tenant logical partitioning via indexed `branchId` (or `tenantId`) foreign keys on every collection:
  - `rooms.find({ branchId: targetBranchId })`
  - `orders.find({ branchId: targetBranchId })`
  - `operationalDispatches.find({ branchId: targetBranchId })`
* **Guard Enforcement:**
  - `@Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)`
  - `validateBranchAccess(currentUser, requestedBranchId)` ensures no operator can read or modify another tenant's data.
