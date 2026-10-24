# Data Model & Lifecycles

Reference diagrams for the `yoonie-backend` MongoDB schema: how the 9 collections relate, and the state machines governing `Order`, `InventorySlot`, `InventoryHold`, `Room`, and `OperationalDispatch` documents.

See [`PRODUCT.md`](../PRODUCT.md) for why these models exist, and [`README.md`](../README.md) for the module/folder architecture.

## Collections at a glance

| Collection | Role |
|---|---|
| `branches` | Tenant root — one per property, carries operational settings |
| `users` | Staff **and** guests (guest CDP fields live on the same model) |
| `rooms` | Physical keys + housekeeping state only — never computes availability |
| `restaurants` | F&B outlets — static table/shift config only |
| `services` | Tours / spa / transfer catalog — static config + per-kind pricing |
| `inventory_slots` | The one sellable-capacity unit (room-night, dining shift, service departure) |
| `inventory_holds` | Short-lived soft reservation on one or more slots, used by a cart |
| `orders` | Composite, guest-facing booking — what's actually paid for |
| `operational_dispatches` | Generated daily run-sheet entries (housekeeping, consolidation, pickups) |

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    BRANCH ||--o{ USER : "staff assigned via branchIds"
    BRANCH ||--o{ ROOM : "owns"
    BRANCH ||--o{ RESTAURANT : "owns"
    BRANCH ||--o{ SERVICE : "owns"
    BRANCH ||--o{ INVENTORY_SLOT : "owns"
    BRANCH ||--o{ INVENTORY_HOLD : "owns"
    BRANCH ||--o{ ORDER : "owns"
    BRANCH ||--o{ OPERATIONAL_DISPATCH : "owns"

    ROOM ||--o{ INVENTORY_SLOT : "resourceId (kind=ROOM_NIGHT)"
    RESTAURANT ||--o{ INVENTORY_SLOT : "resourceId (kind=DINING)"
    SERVICE ||--o{ INVENTORY_SLOT : "resourceId (kind=SERVICE)"
    SERVICE }o--o{ USER : "vehicles[].defaultDriverId"

    INVENTORY_HOLD ||--|{ INVENTORY_SLOT : "lines[].slotKey (held qty)"
    INVENTORY_HOLD |o--o| ORDER : "claimed by order.holdId"

    USER ||--o{ ORDER : "guestId"
    ORDER ||--|{ ORDER_LINE : "items[]"
    ORDER_LINE }o--o| ROOM : "stay.assignedRoomId"
    ORDER_LINE }o--o| RESTAURANT : "dining.restaurantId"
    ORDER_LINE }o--o| SERVICE : "service.serviceId"
    ORDER_LINE }o--o| USER : "service.driverUserId"
    ORDER_LINE }o--o{ INVENTORY_SLOT : "slotRefs[].slotKey"

    ORDER ||--o{ OPERATIONAL_DISPATCH : "orderId (pickup / housekeeping payload)"
    ROOM ||--o{ OPERATIONAL_DISPATCH : "roomId (housekeeping payload)"
    SERVICE ||--o{ OPERATIONAL_DISPATCH : "serviceId (consolidation payload)"
    USER ||--o{ OPERATIONAL_DISPATCH : "assigneeUserId / driverUserId"

    BRANCH {
        string code UK
        string name
        string timezone
        string currency
        object settings "vatRate / serviceChargeRate / holdTtlMinutes / consolidationThreshold / dispatchGenerationTime"
    }
    USER {
        string email UK
        string role "user / admin / BRANCH_MGR / DISPATCHER / STAFF / GUEST"
        objectid_array branchIds
        string phoneE164
        string lineUserId
        bool whatsappOptIn
        object stats "lifetimeSpendThb / stayCount / orderCount"
        number vipScore
    }
    ROOM {
        ObjectId branchId FK
        string roomNumber UK "unique per branch"
        string roomType "STANDARD_KING / DELUXE_BALCONY / POOL_VILLA"
        string cleaningStatus "CLEAN / DIRTY / IN_PROGRESS / INSPECTED"
        object_array blockedRanges "MAINTENANCE / OWNER_HOLD / RENOVATION"
    }
    RESTAURANT {
        ObjectId branchId FK
        string code UK "unique per branch"
        object_array tables
        object_array shifts
        number maxSeats
    }
    SERVICE {
        ObjectId branchId FK
        string code UK "unique per branch"
        string category "TOURS / WELLNESS / TRANSPORT"
        string kind "AIRPORT_TRANSFER / SCHEDULED_TOUR / SPA_TREATMENT"
        number basePriceThb
        object tourConfig_or_wellnessConfig_or_transferConfig "exactly one by kind"
    }
    INVENTORY_SLOT {
        string slotKey UK "branch+kind+resourceKey+startsAt"
        string kind "ROOM_NIGHT / DINING / SERVICE"
        ObjectId resourceId
        string businessDate
        number capacity
        number held
        number booked
        string status "OPEN / CLOSED / CANCELLED"
    }
    INVENTORY_HOLD {
        ObjectId branchId FK
        string cartId
        ObjectId orderId FK "set on confirm"
        object_array lines "slotKey + qty"
        string status "ACTIVE / CONVERTED / RELEASED / EXPIRED"
        date expiresAt
        date purgeAt "TTL index"
    }
    ORDER {
        string orderNumber UK
        ObjectId branchId FK
        ObjectId guestId FK
        string status "PENDING / CONFIRMED / CANCELLED / COMPLETED"
        object attribution "utmSource + utmCampaign + channel"
        object totals "subtotal + discount + serviceCharge + vat + grandTotal"
        ObjectId holdId FK
        string idempotencyKey UK
    }
    ORDER_LINE {
        string lineId
        string kind "STAY / DINING / SERVICE"
        string status "PENDING / CONFIRMED / CANCELLED / COMPLETED / NO_SHOW"
        number totalThb
        date startsAt
        date endsAt
    }
    OPERATIONAL_DISPATCH {
        ObjectId branchId FK
        string serviceDate
        string type "HOUSEKEEPING_TURNAROUND / TOUR_CONSOLIDATION / AIRPORT_PICKUP"
        number priorityScore
        string severity "INFO / WARN / CRITICAL"
        string status "OPEN / ACKNOWLEDGED / IN_PROGRESS / DONE / DISMISSED"
        string dedupeKey UK "unique per branch, date, type"
    }
```

`ORDER_LINE` is embedded inside `ORDER.items[]`, not its own collection — it's broken out above only so its references (to Room/Restaurant/Service/User/InventorySlot) are visible. Same for the three `SERVICE` config variants (`tourConfig`/`wellnessConfig`/`transferConfig`) — exactly one is present per document depending on `kind`.

---

## 2. Order Lifecycle

Two state machines, deliberately decoupled: `OrderLine.status` is driven directly by API calls, while `Order.status` is **derived** from line states in a `pre('validate')` hook — it is never set independently of its lines (see `src/order/entity/order.entity.ts`).

### Order status (derived, never set directly except at creation)

```mermaid
stateDiagram-v2
    [*] --> PENDING: OrderService.create()

    PENDING --> CONFIRMED: confirmOrderPayment()\n(all PENDING lines → CONFIRMED,\nInventoryService.confirm() claims the hold)
    PENDING --> CANCELLED: every line cancelled
    CONFIRMED --> CANCELLED: every line cancelled\n(cancelOrderLine() on the last live line)
    CONFIRMED --> COMPLETED: every live line is\nCOMPLETED or NO_SHOW

    CANCELLED --> [*]
    COMPLETED --> [*]

    note right of CANCELLED
        Order-level CANCELLED/COMPLETED are
        derived from OrderLine states, not
        set directly — see the pre('validate')
        hook's "lifecycle derivations" comment.
    end note
```

### Order line status (set directly by API calls)

```mermaid
stateDiagram-v2
    [*] --> PENDING: created with the order

    PENDING --> CONFIRMED: order confirmOrderPayment()
    PENDING --> CANCELLED: cancelOrderLine()
    CONFIRMED --> CANCELLED: cancelOrderLine()\n(returnBooked() refunds the slot)
    CONFIRMED --> COMPLETED: guest completes the stay/meal/service
    CONFIRMED --> NO_SHOW: guest never arrives

    CANCELLED --> [*]
    COMPLETED --> [*]
    NO_SHOW --> [*]
```

---

## 3. Inventory Lifecycle

Two closely-coupled state machines. `InventorySlot` tracks raw capacity counters (`held`/`booked` against `capacity`); `InventoryHold` is the soft-reservation document a cart holds, and its transitions move the slot counters atomically via `InventoryService`.

### InventorySlot (capacity counters, not a status field)

A slot has a `status` field (`OPEN`/`CLOSED`/`CANCELLED`, set by an operator) independent of its live `held`/`booked` counters, which move only through atomic conditional `$inc` operations:

```mermaid
stateDiagram-v2
    [*] --> OPEN: slot created for a room-night /\ndining shift / service departure

    state OPEN {
        [*] --> Available
        Available --> Available: hold() increments held\n(InventoryRepo.incrementHold,\nguarded: held+booked+qty <= capacity)
        Available --> Available: confirm() moves qty\nheld -> booked\n(InventoryRepo.convertHoldToBooked)
        Available --> Available: release()/sweepExpired()\ndecrements held\n(InventoryRepo.decrementHold)
        Available --> Available: returnBooked() decrements booked\n(line cancelled post-confirmation)
    }

    OPEN --> CLOSED: operator closes the slot
    OPEN --> CANCELLED: operator cancels the slot
    CLOSED --> [*]
    CANCELLED --> [*]
```

### InventoryHold (the soft reservation on a cart)

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: InventoryService.hold()\n(one conditional $inc per slotKey,\nsorted to avoid deadlocks)

    ACTIVE --> CONVERTED: InventoryService.confirm()\nclaimHoldForConfirmation() +\nheld -> booked per line
    ACTIVE --> RELEASED: InventoryService.release()\n(explicit cart abandon / DELETE /inventory/hold/:id)
    ACTIVE --> EXPIRED: sweepExpired()\n(expiresAt passed, found by\nfindExpiredHolds() batch sweep)

    CONVERTED --> [*]: purgeAt TTL index\ngarbage-collects the document
    RELEASED --> [*]: purgeAt TTL index
    EXPIRED --> [*]: purgeAt TTL index
```

---

## 4. Room Housekeeping Lifecycle

`RoomService.updateCleaningStatus()` allows any-to-any transitions via `PATCH /rooms/:id/cleaning` — there is no transition guard in code today. The diagram below shows the **intended** operational flow (per `getHousekeepingBoard()`'s bucket ordering and `dispatch-rules.housekeepingPriority`), not an enforced state machine.

```mermaid
stateDiagram-v2
    [*] --> INSPECTED: room provisioned

    DIRTY --> IN_PROGRESS: housekeeper starts cleaning
    IN_PROGRESS --> CLEAN: cleaning finished
    CLEAN --> INSPECTED: supervisor inspects
    INSPECTED --> DIRTY: guest checks out / stays over

    note right of DIRTY
        All four transitions go through the
        same PATCH /rooms/:id/cleaning endpoint;
        the enum has no enforced ordering today.
        HOUSEKEEPING_TURNAROUND dispatch entries
        prioritize DIRTY rooms by guest ETA + VIP
        status, not by room number.
    end note
```

---

## 5. Dispatch Lifecycle

One status machine shared by all three `DispatchType`s (`HOUSEKEEPING_TURNAROUND`, `TOUR_CONSOLIDATION`, `AIRPORT_PICKUP`). Like Room cleaning, `DispatchService.updateStatus()` doesn't enforce an ordering — any status can follow any other via `PATCH /dispatch/:id/status`.

```mermaid
stateDiagram-v2
    [*] --> OPEN: upsertDispatch()\n(idempotent on dedupeKey —\nsafe for a repeatable 05:30 job)

    OPEN --> ACKNOWLEDGED: staff acknowledges
    ACKNOWLEDGED --> IN_PROGRESS: staff starts the task
    IN_PROGRESS --> DONE: completedAt set
    OPEN --> DISMISSED: not actionable\n(e.g. superseded by a later run)
    ACKNOWLEDGED --> DISMISSED
    IN_PROGRESS --> DISMISSED

    DONE --> [*]
    DISMISSED --> [*]

    note right of OPEN
        Re-running the generator for the same
        branch+serviceDate+type+dedupeKey upserts
        the existing document instead of duplicating it.
    end note
```

---

## Where state diverges from enforcement

Two of the five lifecycles above (**Room cleaning**, **Dispatch status**) describe the *intended* operational flow, not a transition guard in code — `PATCH` endpoints currently accept any enum value as the new status. The other three (**Order**, **OrderLine**, **InventorySlot/Hold**) are enforced: Order status is derived and cannot be set out of band, and every inventory counter move is gated by an atomic conditional `$inc` in `InventoryRepo`. If tightening Room/Dispatch transitions becomes a priority, encode the allowed-transitions map next to the enum (mirroring how `order.entity.ts`'s `pre('validate')` hook encodes Order's rules) rather than trusting callers.
