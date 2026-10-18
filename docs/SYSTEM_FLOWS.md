# System Architecture & Operational Flows

High-level architectural blueprint and sequence diagrams for the `yoonie-backend` hospitality operating system.

---

## 1. Architecture & Domain Decoupling

The platform is designed around 7 bounded domain modules and 2 foundation modules, eliminating monolithic coupling.

```mermaid
graph TD
    subgraph Foundation ["Identity & Tenant Base"]
        UserModule["UserModule<br/>(Guest CDP & Staff)"]
        BranchModule["BranchModule<br/>(Property Settings & Tax Rules)"]
    end

    subgraph Catalogs ["Physical & Service Catalogs"]
        RoomModule["RoomModule<br/>(Physical Keys & Housekeeping)"]
        RestaurantModule["RestaurantModule<br/>(Tables, Shifts, Zones)"]
        ServiceModule["ServiceModule<br/>(Tours, Wellness, Fleet Transfers)"]
    end

    subgraph TransactionalCore ["Real-Time Transactions"]
        InventoryModule["InventoryModule<br/>(Atomic Slots & Concurrency Holds)"]
        OrderModule["OrderModule<br/>(Composite Carts & Multi-Product Orders)"]
    end

    subgraph Operations ["Back-of-House Dispatch"]
        DispatchModule["DispatchModule<br/>(Morning Run-Sheet & Prioritization Rules)"]
    end

    BranchModule --> RoomModule
    BranchModule --> RestaurantModule
    BranchModule --> ServiceModule
    BranchModule --> InventoryModule

    InventoryModule --> OrderModule
    UserModule --> OrderModule

    OrderModule --> DispatchModule
    RoomModule --> DispatchModule
    ServiceModule --> DispatchModule
```

### Module Responsibilities

1. **`BranchModule`**: Multi-tenant property root. Stores IANA timezones (`Asia/Bangkok`), local currency (`THB`), check-in/out times, tax rates (VAT 7%, Service Charge 10%), and dispatch timing rules.
2. **`UserModule`**: Unified profiles for guests and hotel staff. Stores guest CDP attributes (`lifetimeSpendThb`, `stayCount`, `lineUserId`, `phoneE164`, `vipScore`) alongside staff roles (`ADMIN`, `BRANCH_MGR`, `DISPATCHER`, `STAFF`).
3. **`RoomModule`**: Manages physical keys (`101`, `102`) and operational cleanliness (`CLEAN`, `DIRTY`, `IN_PROGRESS`, `INSPECTED`). **Never computes availability**.
4. **`RestaurantModule`**: F&B outlet configuration, table layouts, and meal shifts (`BREAKFAST`, `ALL_DAY`, `EVENING`).
5. **`ServiceModule`**: Catalog for excursions, spa treatments, and airport transfers with capacity thresholds and minimum viable pax (`minViablePax`).
6. **`InventoryModule`**: **The central sellable-capacity engine**. Manages time-slice inventory slots (`ROOM_NIGHT`, `DINING`, `SERVICE`) with engine-level atomic conditional increments (`$expr: { $lte: [{ $add: ['$held', '$booked', qty] }, '$capacity'] }`).
7. **`OrderModule`**: Composite customer bookings spanning multiple dates and services in a single cart. Collects direct attribution (`utmSource`, `utmCampaign`, `channel`).
8. **`DispatchModule`**: Back-of-house automated air-traffic controller. Evaluates live booking and flight data each morning at `05:30` to generate priority-ranked tasks for housekeeping, fleet drivers, and tour coordinators.

---

## 2. The 9 MongoDB Collections

| Collection | Model Class | Document Purpose | Concurrency / Mutation Strategy |
| :--- | :--- | :--- | :--- |
| `branches` | `Branch` | Single hotel property configuration & rules | Static property config |
| `users` | `User` | Unified staff roles & guest CDP profiles | Direct updates; sparse unique index on phone/Line ID |
| `rooms` | `Room` | Physical room keys, amenities, and cleaning status | Housekeeping status updates via staff patch |
| `restaurants` | `Restaurant` | Dining outlets, physical tables, and meal shifts | Static outlet config |
| `services` | `Service` | Tour, spa, and transfer product configurations | Static experience catalog |
| `inventory_slots` | `InventorySlot` | Exact bookable capacity unit per date/timeslot | **Atomic `$inc`** on `held` and `booked` |
| `inventory_holds` | `InventoryHold` | Temporary hold claimed during checkout | Managed via TTL indexes and periodic sweeper |
| `orders` | `Order` | Composite multi-item reservation (Stay + Dining + Tours) | Optimistic concurrency (`__v`), derived status |
| `operational_dispatches` | `OperationalDispatch` | Prioritized daily frontline tasks & run-sheets | Upserted idempotently on `dedupeKey` |

---

## 3. End-to-End Sequence Diagrams

### Flow 1: Direct Guest Multi-Product Booking Journey
Guests select a room, dining shift, and airport transfer in one cart. Sellable inventory is held atomically during checkout and converted upon payment confirmation.

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Web as Booking Frontend / Widget
    participant Inv as InventoryController & Service
    participant Ord as OrderController & Service
    participant DB as MongoDB (Slots & Holds)

    Guest->>Web: Select dates, room type (STANDARD_KING), dinner shift, & transfer
    Web->>Inv: GET /inventory/availability?branchId=...&roomType=STANDARD_KING&checkIn=...&checkOut=...
    Inv-->>Web: { available: 18 }

    Guest->>Web: Proceed to checkout
    Web->>Inv: POST /inventory/hold<br/>{branchId, cartId, lines: [{slotKey, qty}]}
    Inv->>DB: Conditional update per slot (sorted by slotKey):<br/>$inc: { held: +qty } WHERE held + booked + qty <= capacity
    DB-->>Inv: Holds secured
    Inv-->>Web: InventoryHold { _id, cartId, status: "ACTIVE", expiresAt }

    Guest->>Web: Enter guest details & submit payment
    Web->>Ord: POST /orders<br/>{branchId, guest, lines, attribution: {utmSource: "google", channel: "DIRECT_WEB"}, holdId}
    Ord->>DB: Insert Order doc (status: "PENDING")
    Ord-->>Web: Order { _id, orderNumber: "TS-261020-A1B2C", status: "PENDING" }

    Web->>Ord: POST /orders/:id/confirm<br/>{paymentRef: "ch_stripe_123", paidThb: 6944.3}
    Ord->>Inv: confirm(holdId, orderId)
    Inv->>DB: Atomic transition per slotKey:<br/>$inc: { held: -qty, booked: +qty }
    Inv->>DB: Update hold status to "CONVERTED"
    Ord->>DB: Update order status to "CONFIRMED", payment to "PAID"
    Ord-->>Web: Order { orderNumber: "TS-261020-A1B2C", status: "CONFIRMED" }
    Web-->>Guest: Instant Booking Confirmation & Itinerary
```

---

### Flow 2: Cart Abandonment & Automated Sweeper
If a customer leaves the checkout page without paying, the inventory hold automatically expires and capacity is restored to the open selling pool.

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Web as Browser
    participant Inv as InventoryModule
    participant Sweep as Inventory Sweeper Job
    participant DB as MongoDB

    Guest->>Web: Starts checkout (Hold created, expires in 15 mins)
    Web->>Inv: POST /inventory/hold
    Inv->>DB: $inc: { held: +1 } on target slots
    Note over Guest,Web: Guest abandons cart / closes browser tab

    loop Every 60 Seconds
        Sweep->>DB: find({ status: "ACTIVE", expiresAt: { $lt: now } })
        DB-->>Sweep: Expired hold documents
        Sweep->>DB: For each hold slotKey: $inc: { held: -qty }
        Sweep->>DB: Update hold.status = "EXPIRED", purgeAt = now + 1hr
    end
    Note over DB: Sellable inventory is fully available for other guests.<br/>MongoDB TTL index automatically removes hold doc at purgeAt.
```

---

### Flow 3: 05:30 AM Morning Dispatch Run-Sheet Generation
Every morning before frontline staff report for duty, the dispatch engine evaluates active bookings and logistics to produce prioritized task cards.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as 05:30 AM Scheduler
    participant Dispatch as DispatchService
    participant Rules as dispatch-rules.ts
    participant DB as MongoDB

    Cron->>Dispatch: generateMorningRunSheet(branchId, serviceDate)
    
    par Query Active Context
        Dispatch->>DB: Find dirty rooms & check-in orders for today
        Dispatch->>DB: Find tour service slots departing today
        Dispatch->>DB: Find arrival flight airport transfer bookings
    end

    Note over Dispatch,Rules: 1. Evaluate Housekeeping Urgency
    Dispatch->>Rules: priorityScore = calcHousekeepingPriority(guestArrivalEta, isVip)
    Rules-->>Dispatch: High priority scores for early flight arrivals & VIPs

    Note over Dispatch,Rules: 2. Evaluate Tour Yield & Consolidation
    Dispatch->>Rules: checkConsolidation(bookedPax, minViablePax, fixedCostThb)
    Rules-->>Dispatch: Flag departures below 40% threshold as "MERGE_OR_CANCEL"

    Note over Dispatch,Rules: 3. Generate Bilingual Driver Pickup Cards
    Dispatch->>Rules: buildPickupCard(guestName, flightNumber, door, driver)
    Rules-->>Dispatch: Card formatted in English and Thai

    Dispatch->>DB: Upsert OperationalDispatch tasks (dedupeKey: idempotent)
    Note over DB: Tasks ready on Housekeeping Board and Driver Mobile views.
```

---

### Flow 4: Housekeeping Front-Desk Zero Flow
Rooms are cleaned in order of guest arrival logistics rather than numeric order.

```mermaid
sequenceDiagram
    autonumber
    actor Housekeeper
    actor FrontDesk
    participant App as Staff UI
    participant Room as RoomController
    participant DB as MongoDB

    Housekeeper->>App: View Housekeeping Board sorted by arrival ETA & VIP
    App->>Room: GET /rooms/housekeeping?branchId=...
    Room-->>App: { inspected: [], clean: [], inProgress: [], dirty: [Room 101 (ETA 14:00, VIP)] }

    Housekeeper->>App: Start cleaning Room 101
    App->>Room: PATCH /rooms/:id/cleaning { cleaningStatus: "IN_PROGRESS" }
    Room->>DB: Update cleaningStatus = "IN_PROGRESS", cleaningUpdatedAt = now

    Housekeeper->>App: Mark cleaning finished
    App->>Room: PATCH /rooms/:id/cleaning { cleaningStatus: "CLEAN" }
    
    FrontDesk->>App: Inspect & sign off on room
    App->>Room: PATCH /rooms/:id/cleaning { cleaningStatus: "INSPECTED" }
    Room->>DB: Update cleaningStatus = "INSPECTED"
    Note over FrontDesk,App: Room is now green for frictionless key handover upon guest arrival.
```
