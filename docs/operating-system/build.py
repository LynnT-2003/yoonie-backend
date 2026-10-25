"""Builds the Yoonie Operating System document (HTML) in the style of the MediAsas partner doc."""
import html, json, pathlib

OUT = pathlib.Path(__file__).parent / "yoonie-operating-system.html"
DATE = "25 OCT 2026"

parts = []
def add(s): parts.append(s)
def esc(s): return html.escape(str(s))

def tbl(headers, rows, widths=None):
    cols = "".join(f'<col style="width:{w}">' for w in widths) if widths else ""
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    add(f'<table><colgroup>{cols}</colgroup><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>')

def code(obj, label="Example"):
    text = obj if isinstance(obj, str) else json.dumps(obj, indent=2, ensure_ascii=False)
    add(f'<p class="label">{label}</p><pre>{esc(text)}</pre>')

def seq(src, width=None):
    # size by participant count so a 2-lane diagram doesn't blow up to page width
    n = sum(1 for l in src.splitlines() if l.strip().startswith(("participant", "actor")))
    width = width or {2: "55%", 3: "72%", 4: "88%"}.get(n, "100%")
    add(f'<div class="diagram" style="width:{width}"><pre class="mermaid">{esc(src)}</pre></div>')
def h1(t, brk=True): add(f'<h1 class="{"brk" if brk else ""}">{esc(t)}</h1>')
def h2(t): add(f"<h2>{esc(t)}</h2>")
def h3(t): add(f"<h3>{esc(t)}</h3>")
def lead(t): add(f'<p class="lead">{t}</p>')
def p(t): add(f"<p>{t}</p>")
def part(t): add(f'<div class="part brk">{esc(t)}</div>')
def endpoint(method, url, who):
    tbl(["Method", "Request URL", "Who can call"], [[method, f"<code>{esc(url)}</code>", who]], ["12%", "58%", "30%"])
def fields(rows, title="Request Body"):
    h3(title)
    tbl(["Property Name", "Description", "Data Type"], [[f"<code>{esc(a)}</code>", b, esc(c)] for a, b, c in rows], ["30%", "52%", "18%"])

# ─────────────────────────────────────────────────────────────────────────────
add(f'<div class="runhead">YOONIE &nbsp;|&nbsp; OPERATING SYSTEM &nbsp;|&nbsp; {DATE}</div>')
add('<div class="title">Yoonie Operating System</div>')
add('<div class="subtitle">Web × staff app: flows, endpoints, operating rules and reference</div>')
add('<div class="part">Part A · Flows and APIs</div>')

h1("1 Introduction", brk=False)
h2("1.1 Overview")
lead("Yoonie runs a hotel from booking to checkout. A guest books on the hotel's own site; Yoonie plans the "
     "work that booking creates; staff are dispatched on their phones and report each step from where the work "
     "happens; the desk watches it live on the web and answers only when something goes wrong. Every step is a "
     "structured, timestamped event, ready for analytics and AI.")
p("Part A describes each flow: an overview with its sequence diagram, the endpoints the web and app call, and each "
  "endpoint's request and response. Part B is the reference: data schemas, roles, decisions, open items, build status "
  "and source documents. The rules every flow follows are in <code>docs/OPERATING_RULES.md</code>; this document shows "
  "how they run.")

h2("1.2 Parties")
tbl(["Party", "Role"], [
    ["Guest", "Books rooms, transfers, tours and spa on the hotel's site. Pays at the hotel today."],
    ["Booking site", "Public web at <code>/</code> on the hotel's domain. Holds inventory, then creates the order."],
    ["Ops web", "Staff dashboard at <code>ops.&lt;domain&gt;</code>: Rooms, Guests, Services, Dispatch, Property. Login required."],
    ["Staff app", "Expo app on staff phones. One home screen per job: Housekeeper, Driver, Dispatcher, Manager; plus Inbox."],
    ["Yoonie API", "NestJS under <code>/api</code>. Owns inventory, orders, dispatch tasks, rooms, notifications and audit."],
    ["Planner", "Inside the API. Turns each booking into tasks (room turnaround, airport pickup, tour fill check)."],
    ["Notification worker", "Runs every minute. Delivers pending notifications by Expo push; everything also lands in the inbox."],
    ["MongoDB Atlas", "One database for all branches. Every document carries <code>branchId</code>."],
    ["LINE / WhatsApp", "Guest and staff messaging channels. LINE linking is built; sending to LINE is not wired yet."],
], ["24%", "76%"])

h2("1.3 Flows")
tbl(["Section", "Flow", "Main endpoints", "Status"], [
    ["2", "Guest booking", "POST /inventory/hold, POST /orders", "Built (pay at hotel)"],
    ["3", "Dispatch planning", "Planner (internal), GET /dispatch", "Built"],
    ["4", "Room turnaround", "POST /staff/rooms/{id}/transition", "Built"],
    ["5", "Airport pickup", "POST /staff/pickups/{id}/step, /issue", "Built; app not shipped"],
    ["6", "Tour fill decision", "POST /dispatch/{id}/decision", "Built"],
    ["7", "Front desk money", "POST /orders/{id}/payments", "Built"],
    ["8", "Ops boards", "GET /rooms/live-occupancy, /ops-board/*", "Built"],
    ["9", "Notifications and inbox", "Worker, /notifications, /devices", "Built; LINE not wired"],
    ["10", "Staff app sign-in and offline", "/auth/login, offline queue", "Built"],
    ["–", "Tour departure, spa session", "–", "Designed, not built"],
], ["10%", "28%", "40%", "22%"])

h2("1.4 Surfaces")
tbl(["Surface", "Screen", "What it's for"], [
    ["Booking site", "/", "Search dates, pick room, add transfer / tour / spa / dining, check out"],
    ["Ops web", "Rooms", "Read-only state: board with ready-by countdowns, floor map, timeline, room sheet with folio"],
    ["Ops web", "Guests", "Who is in house, arriving, departing; their services and balance"],
    ["Ops web", "Services", "Capacity vs demand per slot; revenue against fixed cost"],
    ["Ops web", "Dispatch", "The one inbox: today's runway, rooms / pickups / tours, assign, inspect, answer problems"],
    ["Ops web", "Property", "Rooms, services, restaurants catalogue (admin)"],
    ["Staff app", "Housekeeper", "Today's rooms (mine + open pool): Start, Mark clean"],
    ["Staff app", "Driver", "Today's pickups: next step button, arrival sign, Report a problem"],
    ["Staff app", "Dispatcher", "All tasks; answer pickup problems; Keep / Merge tours"],
    ["Staff app", "Manager", "Inspect: Pass, or Fail with reason"],
    ["Staff app", "Inbox", "Every notification; acknowledge critical ones"],
], ["16%", "16%", "68%"])

h2("1.5 Yoonie API Conventions")
tbl(["Item", "Value"], [
    ["Base path", "<code>/api</code> (web proxies <code>/api</code> to <code>BACKEND_URL</code>)"],
    ["Authentication", "JWT bearer access token; refresh via <code>POST /auth/refresh</code>. Catalogue and checkout routes are public."],
    ["Branch scope", "Staff act only within their <code>branchIds</code>; platform admins see all"],
    ["Success body", "<code>{ success: true, statusCode, data, timestamp }</code>"],
    ["Error body", "<code>{ success: false, statusCode, message, path, timestamp }</code>"],
    ["Validation", "Unknown fields are rejected (whitelist + forbidNonWhitelisted)"],
    ["Offline safety", "<code>Idempotency-Key</code> header on staff mutations; repeated steps are no-ops"],
    ["Formats", "Money in THB. Business dates <code>YYYY-MM-DD</code> next to UTC timestamps. Times shown in Asia/Bangkok."],
    ["Rate limit", "100 requests per 60 seconds per IP (configurable)"],
    ["Polling", "Live occupancy every 10 s; Dispatch, roster and boards every 15 s"],
], ["22%", "78%"])

# ─── 2 Guest booking ─────────────────────────────────────────────────────────
h1("2 Guest Booking")
h2("2.1 Overview")
lead("The guest picks dates and a room, adds extras, and checks out. Yoonie holds the capacity for 15 minutes, creates "
     "the order as confirmed with payment at the hotel, and hands it to the planner.")
seq("""sequenceDiagram
    actor G as Guest
    participant W as Booking site
    participant API as Yoonie API
    participant DB as Inventory slots
    participant PL as Planner
    G->>W: Dates, room, extras
    W->>API: GET /rooms, /services, /inventory/availability
    API-->>W: Catalogue, rooms left
    G->>W: Check out
    W->>API: POST /inventory/hold (stays, services)
    API->>DB: held += qty if held + booked + qty <= capacity
    API-->>W: holdId, expiresAt (15 min)
    W->>API: POST /orders (guest, lines, holdId, attribution)
    API->>DB: held to booked
    Note over API: Order CONFIRMED · payment UNPAID · PAY_AT_HOTEL
    API->>PL: plan order
    PL-->>API: room turnaround, pickup, tour fill check
    API-->>W: order, orderToken
    W-->>G: Booking confirmed, pay at hotel""")
h2("2.2 Endpoints")
tbl(["Endpoint", "Who", "Result"], [
    ["GET /rooms?branchId", "Public", "Room types and rates"],
    ["GET /services?branchId", "Public", "Transfers, tours, spa"],
    ["GET /restaurants?branchId", "Public", "Dining venues"],
    ["GET /inventory/availability", "Public", "Rooms left per type and range"],
    ["POST /inventory/hold", "Public", "Hold ACTIVE, expires in 15 min"],
    ["DELETE /inventory/hold/{id}", "Public (hold token)", "Hold RELEASED"],
    ["POST /orders", "Public", "Order CONFIRMED, tasks planned"],
    ["GET /orders/{id}", "Staff (branch) or guest (order token)", "Order with charges"],
    ["POST /orders/{id}/lines/{lineId}/cancel", "Staff or guest (order token)", "Line CANCELLED, capacity returned"],
], ["40%", "30%", "30%"])

h2("2.3 Hold Inventory")
endpoint("POST", "/api/inventory/hold", "Public")
fields([
    ("branchId", "Branch id", "String"),
    ("cartId", "Checkout session id", "String"),
    ("stays[]", "roomType, checkInDate, checkOutDate, qty. Expanded into room-nights.", "Array"),
    ("services[]", "serviceId, startsAt, pax. Transfer hour, tour departure or treatment start.", "Array"),
    ("lines[]", "Raw slotKey + qty (advanced)", "Array"),
    ("ttlMinutes", "Hold lifetime; default branch holdTtlMinutes (15)", "Number"),
])
code({"branchId": "665a1b2c3d4e5f6a7b8c9d0e", "cartId": "cart_abc123",
      "stays": [{"roomType": "DELUXE_BALCONY", "checkInDate": "2026-10-25", "checkOutDate": "2026-10-27", "qty": 1}],
      "services": [{"serviceId": "665a1b2c3d4e5f6a7b8c9d3c", "startsAt": "2026-10-25T06:20:00.000Z", "pax": 2}]})
fields([
    ("_id", "Hold id; send as holdId on the order", "String"),
    ("status", "ACTIVE, CONVERTED, RELEASED, EXPIRED", "String"),
    ("lines[]", "slotKey, qty actually held", "Array"),
    ("expiresAt", "When the sweeper returns the capacity", "DateTime"),
    ("holdToken", "Lets the guest release their own hold", "String"),
], "Response Body")
p("If any slot is full the whole hold fails with <b>409</b> and nothing is held.")

h2("2.4 Create Order")
endpoint("POST", "/api/orders", "Public")
fields([
    ("branchId", "Branch id", "String"),
    ("guest", "fullName, email, phoneE164, lineUserId, preferredLanguage (en / th)", "Object"),
    ("lines[]", "kind STAY / DINING / SERVICE, title, unitPriceThb, startsAt, businessDate, stay / dining / service detail", "Array"),
    ("lines[].service.flight", "Transfer only: number, landingAt, meetingDoor. Missing means \"needs details\".", "Object"),
    ("holdId", "From 2.3; converted from held to booked", "String"),
    ("attribution", "utmSource, utmMedium, utmCampaign, channel", "Object"),
    ("specialRequests", "Free text", "String"),
])
code({"branchId": "665a1b2c3d4e5f6a7b8c9d0e", "holdId": "665a1b2c3d4e5f6a7b8c9d5e",
      "guest": {"fullName": "Hiroshi Tanaka", "email": "hiroshi@example.com", "phoneE164": "+81901234567", "preferredLanguage": "en"},
      "lines": [{"kind": "STAY", "title": "Deluxe Balcony (2 nights)", "unitPriceThb": 7600, "startsAt": "2026-10-25T07:00:00.000Z",
                 "businessDate": "2026-10-25", "stay": {"roomType": "DELUXE_BALCONY", "checkInDate": "2026-10-25", "checkOutDate": "2026-10-27"}},
                {"kind": "SERVICE", "title": "Airport transfer", "unitPriceThb": 1200, "startsAt": "2026-10-25T06:20:00.000Z",
                 "businessDate": "2026-10-25", "service": {"serviceKind": "AIRPORT_TRANSFER", "pax": 2,
                 "flight": {"number": "EK 372", "landingAt": "2026-10-25T06:20:00.000Z", "meetingDoor": 4}}}],
      "attribution": {"utmSource": "instagram", "channel": "DIRECT_WEB"}})
fields([
    ("order.orderNumber", "e.g. TS-261025-A0EAA", "String"),
    ("order.status", "CONFIRMED (pay at hotel)", "String"),
    ("order.payment", "method PAY_AT_HOTEL, status UNPAID, entries[]", "Object"),
    ("order.totals", "subtotal, service charge 10%, VAT 7%, grand total", "Object"),
    ("orderToken", "Signed token; lets the guest view or cancel without an account", "String"),
], "Response Body")

# ─── 3 Planning ──────────────────────────────────────────────────────────────
h1("3 Dispatch Planning")
h2("3.1 Overview")
lead("Every booking becomes work. The planner turns order lines into tasks with an owner, a deadline and a natural key, "
     "so planning twice never creates a duplicate. Loading today's Dispatch also tops up room work for every room that "
     "isn't ready.")
seq("""sequenceDiagram
    participant API as Yoonie API
    participant PL as Planner
    participant T as Tasks
    actor D as Driver (app)
    actor Desk as Desk (web)
    API->>PL: order confirmed / flight edited
    PL->>T: upsert hk:{room} on check-in date (ready by ETA + 60 min)
    PL->>T: upsert pickup:{order}:{line} on landing date (van's default driver)
    PL->>D: PICKUP_READY card (new, or time changed)
    PL->>T: tour:{slot}: raise or clear fill check
    Desk->>API: GET /dispatch?serviceDate=today
    API->>T: ensure every non-ready room has today's task
    API-->>Desk: tasks + cleaning status + assignee names""")
h2("3.2 Task Types")
tbl(["Type", "Natural key", "Created when", "Deadline", "Who does it"], [
    ["HOUSEKEEPING_TURNAROUND", "hk:{roomNumber}", "Booking; or Dispatch load for any non-ready room", "Flight landing (or check-in time) + 60 min", "Housekeeper (open pool)"],
    ["AIRPORT_PICKUP", "pickup:{orderId}:{lineId}", "Transfer booked with flight; flight edited", "Flight landing", "Driver"],
    ["TOUR_CONSOLIDATION", "tour:{slotKey}", "Departure below minimum pax or under 40% full", "Before departure", "Dispatcher decides"],
], ["29%", "17%", "22%", "17%", "15%"])
h2("3.3 Endpoints")
endpoint("GET", "/api/dispatch?branchId&serviceDate&status&type", "Admin, Manager, Dispatcher, Staff")
fields([
    ("_id, type, status, title", "Task identity; status OPEN, IN_PROGRESS, DONE, DISMISSED", "Mixed"),
    ("assigneeUserId, assigneeName", "Owner, or empty for the open pool", "String"),
    ("dueAt, priorityScore, severity", "Deadline and ordering", "Mixed"),
    ("cleaningStatus", "Turnarounds: the room's live state", "String"),
    ("housekeeping", "roomId, roomNumber, guestName, etaAt, targetReadyBy, etaSource, flightNumber, isVip", "Object"),
    ("pickup", "guestName, flightNumber, etaAt, meetingDoor, vehiclePlate, card, stage, steps[], issue", "Object"),
    ("consolidation", "serviceName, departsAt, booked, capacity, minViablePax, revenueThb, fixedCostThb, projectedLossThb, decision", "Object"),
], "Response Body (each task)")

# ─── 4 Room turnaround ───────────────────────────────────────────────────────
h1("4 Room Turnaround")
h2("4.1 Overview")
lead("A room is inspected and ready before its guest walks in. Housekeepers take rooms from the open pool on their "
     "phones; the room and its task always move together; the supervisor inspects standing in the room.")
seq("""sequenceDiagram
    actor HK as Housekeeper (app)
    participant API as Yoonie API
    actor Sup as Supervisor (app / web)
    actor Desk as Desk (web)
    actor Drv as Driver (app)
    Note over API: Checkout or booking: room DIRTY, task in open pool
    HK->>API: GET /staff/me/tasks
    API-->>HK: my rooms + open pool, by arrival
    HK->>API: POST /staff/rooms/{id}/transition IN_PROGRESS
    Note over API: claims the room for this housekeeper
    API-->>Desk: board: Cleaning · Noi
    opt Guest already on the way
        Drv->>API: pickup step GUEST_ON_BOARD
        API->>HK: CRITICAL: guest arrives ~15:45
    end
    HK->>API: transition CLEAN
    API->>Sup: Room 305 ready for inspection
    alt Pass
        Sup->>API: transition INSPECTED
        API->>HK: Room 305 passed inspection
    else Fail
        Sup->>API: transition DIRTY + reason
        API->>HK: CRITICAL: Reclean room 305
    end""")
h2("4.2 Endpoints")
tbl(["Endpoint", "Who", "Room after", "Task after"], [
    ["GET /staff/me/tasks", "Staff, Dispatcher, Manager, Admin", "–", "–"],
    ["POST /staff/rooms/{id}/transition IN_PROGRESS", "Housekeeper, Manager", "IN_PROGRESS", "IN_PROGRESS, claimed"],
    ["POST /staff/rooms/{id}/transition CLEAN", "Housekeeper, Manager", "CLEAN", "DONE"],
    ["POST /staff/rooms/{id}/transition INSPECTED", "Manager, Admin, housekeeping:inspect", "INSPECTED", "DONE"],
    ["POST /staff/rooms/{id}/transition DIRTY + reason", "Housekeeper, Supervisor, Manager", "DIRTY", "OPEN (reopened)"],
    ["POST /dispatch/{id}/claim", "Staff, Dispatcher, Manager", "–", "assigned to caller"],
    ["PATCH /dispatch/{id}/assign", "Dispatcher, Manager, Admin", "–", "assigned / back to pool"],
    ["GET /staff/roster?branchId", "Dispatcher, Manager, Admin", "–", "–"],
], ["42%", "28%", "14%", "16%"])

h2("4.3 Get My Tasks")
endpoint("GET", "/api/staff/me/tasks", "Staff, Dispatcher, Manager, Admin")
fields([
    ("housekeeping[]", "Today's rooms that are mine or unassigned, sorted by arrival", "Array"),
    ("housekeeping[].cleaningStatus", "DIRTY, IN_PROGRESS, CLEAN, INSPECTED", "String"),
    ("housekeeping[].targetReadyBy, etaAt", "Deadline and guest ETA", "DateTime"),
    ("housekeeping[].isMine, assigneeUserId", "Mine, or open pool when empty", "Mixed"),
    ("pickups[]", "My pickups today (section 5)", "Array"),
], "Response Body")

h2("4.4 Move a Room")
endpoint("POST", "/api/staff/rooms/{id}/transition", "Staff, Manager, Admin (not Dispatcher)")
fields([
    ("toStatus", "IN_PROGRESS, CLEAN, INSPECTED or DIRTY", "String"),
    ("reason", "Required for DIRTY (needs cleaning / failed inspection)", "String"),
])
code({"toStatus": "DIRTY", "reason": "Bathroom not done, hair in the sink"})
fields([
    ("roomNumber, cleaningStatus", "The room after the move", "Mixed"),
    ("isNoOp", "True when the room was already in that state (offline replay)", "Boolean"),
    ("dispatchId, dispatchStatus", "The linked task after the move", "Mixed"),
    ("assigneeName", "Who now holds the room's job", "String"),
    ("notified[]", "Names of everyone pinged", "Array"),
], "Response Body")
code({"roomId": "665a1b2c3d4e5f6a7b8c9d1a", "roomNumber": "305", "cleaningStatus": "DIRTY", "isNoOp": False,
      "dispatchId": "665a1b2c3d4e5f6a7b8c9d7a", "dispatchStatus": "OPEN", "assigneeName": "Noi Prasert", "notified": ["Noi Prasert"]})
p("Moves allowed: DIRTY → IN_PROGRESS → CLEAN → INSPECTED, and any → DIRTY with a reason. Anything else is <b>409</b> "
  "with the room's current status. Another housekeeper's claimed room is <b>403</b>.")

h2("4.5 Assign or Claim")
endpoint("PATCH", "/api/dispatch/{id}/assign", "Dispatcher, Manager, Admin")
fields([("assigneeUserId", "Staff member on the task's branch, or null for the open pool", "String | null")])
p("Response: the task plus <code>assigneeName</code> and <code>notified[]</code>. The new owner gets <code>TASK_ASSIGNED</code> "
  "(pickups: <code>PICKUP_READY</code> with the card). <code>POST /dispatch/{id}/claim</code> takes a pool task for the caller; "
  "a task someone else owns is <b>409</b>.")

# ─── 5 Pickup ────────────────────────────────────────────────────────────────
h1("5 Airport Pickup")
h2("5.1 Overview")
lead("A driver is at the arrivals door with the name sign when the guest comes out, and the hotel knows when the guest "
     "will walk in. The driver reports each step from the app; the desk watches and answers problems.")
seq("""sequenceDiagram
    actor Drv as Driver (app)
    participant API as Yoonie API
    actor Desk as Desk (web)
    actor HK as Housekeeper (app)
    API->>Drv: PICKUP_READY card (flight, door, sign)
    Drv->>API: step CONFIRMED (Accept)
    Drv->>API: step EN_ROUTE
    Drv->>API: step AT_AIRPORT
    Drv->>API: step GUEST_ON_BOARD
    API->>Desk: Hiroshi picked up, at hotel ~15:45, Room 305 still cleaning
    API->>HK: CRITICAL: Room 305 guest arrives ~15:45
    Drv->>API: step DROPPED_OFF
    API->>Desk: Hiroshi is at the lobby
    opt Problem
        Drv->>API: issue GUEST_NOT_FOUND
        API->>Desk: CRITICAL: EK 372 can't find the guest
        Desk->>API: answer KEEP_WAITING or NO_SHOW
        API->>Drv: Keep waiting: flight now 15:10 / Stand down
    end""")
h2("5.2 Endpoints")
tbl(["Endpoint", "Who", "Stage / status after"], [
    ["POST /staff/pickups/{id}/step", "Driver (own pickup); desk on driver's behalf", "stage; status OPEN / IN_PROGRESS / DONE"],
    ["POST /staff/pickups/{id}/issue", "Driver; desk", "issue open; severity CRITICAL"],
    ["POST /dispatch/{id}/pickup-issue", "Dispatcher, Manager, Admin", "KEEP_WAITING: continues; NO_SHOW: DISMISSED"],
    ["PATCH /orders/{id}/lines/{lineId}/flight", "Dispatcher, Manager, Admin", "pickup re-planned; driver must accept again"],
    ["POST /staff/pickups/{id}/start, /done", "Legacy app builds", "EN_ROUTE, DROPPED_OFF"],
], ["38%", "32%", "30%"])

h2("5.3 Record a Step")
endpoint("POST", "/api/staff/pickups/{id}/step", "Staff, Dispatcher, Manager, Admin")
fields([
    ("stage", "CONFIRMED, EN_ROUTE, AT_AIRPORT, GUEST_ON_BOARD, DROPPED_OFF. Forward only.", "String"),
    ("note", "Optional; desk entries are prefixed \"Recorded by … for the driver\"", "String"),
])
code({"stage": "GUEST_ON_BOARD"})
fields([
    ("dispatchId, status", "Task after the step", "Mixed"),
    ("stage", "Stage now", "String"),
    ("notified[]", "Names pinged by this step", "Array"),
], "Response Body")
code({"dispatchId": "665a1b2c3d4e5f6a7b8c9d7b", "status": "IN_PROGRESS", "stage": "GUEST_ON_BOARD",
      "notified": ["Anan Boonmee", "Mali Chaiyo", "Noi Prasert"]})
p("A repeated or earlier step is a 200 no-op. A pickup with no driver is <b>409</b>. A different driver, or a re-timed "
  "flight, sends an accepted pickup back to ASSIGNED.")

h2("5.4 Report a Problem")
endpoint("POST", "/api/staff/pickups/{id}/issue", "Staff, Dispatcher, Manager, Admin")
fields([("kind", "FLIGHT_DELAYED, GUEST_NOT_FOUND, VEHICLE_PROBLEM, OTHER", "String"),
        ("note", "What the driver sees", "String")])
code({"kind": "GUEST_NOT_FOUND", "note": "Waited 30 min at door 4"})

h2("5.5 Answer a Problem")
endpoint("POST", "/api/dispatch/{id}/pickup-issue", "Dispatcher, Manager, Admin")
fields([("resolution", "KEEP_WAITING or NO_SHOW", "String"), ("note", "Instructions pushed to the driver", "String")])
code({"resolution": "KEEP_WAITING", "note": "Flight now lands 15:10, stay at door 4"})

h2("5.6 Correct the Flight")
endpoint("PATCH", "/api/orders/{id}/lines/{lineId}/flight", "Dispatcher, Manager, Admin")
fields([("number", "Flight number", "String"), ("landingAt", "Landing time (UTC)", "DateTime"), ("meetingDoor", "Arrivals door", "Number")])
p("Moves the van slot, re-plans the pickup and the room's ready-by, and pings the driver when the time changed.")

# ─── 6 Tour ──────────────────────────────────────────────────────────────────
h1("6 Tour Fill Decision")
h2("6.1 Overview")
lead("A departure that would lose money is flagged before it runs. The dispatcher decides to keep or merge it; "
     "cancelling needs a manager. The front desk calls the guests afterwards.")
seq("""sequenceDiagram
    participant API as Yoonie API
    actor Disp as Dispatcher (web / app)
    actor Mgr as Manager
    actor FD as Front desk
    Note over API: Booking changes a departure
    API->>API: below min pax or under 40% full?
    API-->>Disp: card: 2/18 booked, ฿1,800 vs ฿4,500, −฿2,700
    alt Keep or Merge
        Disp->>API: POST /dispatch/{id}/decision KEEP / MERGE + note
    else Cancel
        Mgr->>API: POST /dispatch/{id}/decision CANCEL + note
    end
    API-->>FD: decision recorded
    FD->>FD: call guests, move or refund""")
h2("6.2 Record a Decision")
endpoint("POST", "/api/dispatch/{id}/decision", "Dispatcher (Keep, Merge), Manager and Admin (all)")
fields([("decision", "KEEP, MERGE or CANCEL", "String"), ("note", "Where the guests went, or why", "String")])
code({"decision": "MERGE", "note": "Moved 2 guests to the 18:00 Sunday departure"})
tbl(["Booked", "Revenue", "Cost", "Result", "Flag"], [
    ["10 / 18", "฿9,000", "฿4,500", "+฿4,500", "No"],
    ["5 / 18", "฿4,500", "฿4,500", "฿0", "Yes: 28% full"],
    ["2 / 18", "฿1,800", "฿4,500", "−฿2,700", "Yes: below 6 guests"],
])

# ─── 7 Money ─────────────────────────────────────────────────────────────────
h1("7 Front Desk Money")
h2("7.1 Overview")
lead("Guests pay at the hotel. The room sheet shows the folio: what was booked, service charge, VAT, what's paid and "
     "what's due. The desk records each payment; deposits are allowed, overpaying isn't.")
seq("""sequenceDiagram
    actor FD as Front desk (web)
    participant API as Yoonie API
    FD->>API: GET /rooms/live-occupancy (room sheet)
    API-->>FD: stay + charges: total ฿19,067, paid ฿0, due ฿19,067
    FD->>API: POST /orders/{id}/payments ฿5,000 CARD
    API-->>FD: payment DEPOSIT, due ฿14,067
    FD->>API: POST /orders/{id}/payments ฿14,067 CASH
    API-->>FD: payment PAID, due ฿0""")
h2("7.2 Record a Payment")
endpoint("POST", "/api/orders/{id}/payments", "Manager, Admin")
fields([("amountThb", "Collected now; at most the balance due", "Number"),
        ("method", "CASH, CARD, PROMPTPAY, BANK_TRANSFER", "String"),
        ("reference", "Slip or transfer reference", "String")])
code({"amountThb": 5000, "method": "CARD", "reference": "Card slip 004512"})
h3("Folio (charges)")
tbl(["Property Name", "Description", "Data Type"], [
    ["<code>lines[]</code>", "Each booked item with its total", "Array"],
    ["<code>roomsThb, servicesThb, diningThb</code>", "Totals by kind", "Number"],
    ["<code>serviceChargeThb, vatThb</code>", "10% and 7% (branch settings)", "Number"],
    ["<code>totalThb, paidThb, dueThb</code>", "What's owed now", "Number"],
    ["<code>paymentStatus</code>", "UNPAID, DEPOSIT, PAID, REFUNDED", "String"],
    ["<code>payments[]</code>", "amountThb, method, reference, at, by", "Array"],
], ["30%", "52%", "18%"])

# ─── 8 Boards ────────────────────────────────────────────────────────────────
h1("8 Ops Boards")
h2("8.1 Overview")
lead("Every ops page reads live state and polls; none of them changes a room's status. Work happens in Dispatch and on "
     "phones, and shows on every board within one poll.")
seq("""sequenceDiagram
    actor Desk as Desk (web)
    participant API as Yoonie API
    loop every 10 s
        Desk->>API: GET /rooms/live-occupancy?branchId&date
        API-->>Desk: rooms, stays, arrivals, departures, services, summary
    end
    loop every 15 s
        Desk->>API: GET /dispatch?serviceDate
        Desk->>API: GET /ops-board/guests, /ops-board/services
    end
    Desk->>API: POST /staff/rooms/{id}/transition DIRTY + reason (Needs cleaning)""")
h2("8.2 Endpoints")
tbl(["Endpoint", "Page", "Returns"], [
    ["GET /rooms/live-occupancy", "Rooms", "Every room: cleaning, occupancy, current / next stay, arrival ready-by, active task, folio"],
    ["GET /ops-board/guests", "Guests", "In house, arriving, departing, next 7 days; services and balance"],
    ["GET /ops-board/services", "Services", "Slots for the date: capacity, booked, revenue vs fixed cost"],
    ["GET /dispatch", "Dispatch", "Tasks (section 3.3)"],
    ["GET /staff/roster", "Dispatch", "Staff for assign menus: id, name, role, jobTitle"],
], ["30%", "14%", "56%"])

# ─── 9 Notifications ─────────────────────────────────────────────────────────
h1("9 Notifications and Inbox")
h2("9.1 Overview")
lead("Every ping is stored first, then delivered. The worker sends pending notifications by Expo push every minute; "
     "everything is in the inbox whether or not the push arrives.")
seq("""sequenceDiagram
    participant API as Yoonie API
    participant DB as Notifications
    participant WK as Worker (every minute)
    participant Expo as Expo push
    actor S as Staff (app)
    S->>API: POST /devices (expoPushToken)
    API->>DB: create PENDING (title, body, severity, data)
    WK->>DB: claim PENDING
    WK->>Expo: send to the user's devices
    WK->>DB: SENT or FAILED
    S->>API: GET /notifications
    S->>API: PATCH /notifications/{id}/read
    S->>API: PATCH /notifications/{id}/ack (critical)""", width="82%")
h2("9.2 Endpoints")
tbl(["Endpoint", "Who", "Purpose"], [
    ["POST /devices", "Any signed-in user", "Register the phone's Expo push token"],
    ["DELETE /devices/{id}", "Owner", "Stop pushes to that phone"],
    ["GET /notifications", "Any signed-in user", "Inbox"],
    ["GET /notifications/unread-count", "Any signed-in user", "Badge counts"],
    ["PATCH /notifications/{id}/read", "Owner", "Mark read"],
    ["PATCH /notifications/{id}/ack", "Staff", "Acknowledge a critical alert"],
    ["POST /staff/line/link-token", "Staff", "Code to link a LINE account"],
    ["POST /internal/notifications/tick", "Scheduler", "Run the worker once (cron on Vercel)"],
], ["38%", "24%", "38%"])
h2("9.3 Who Gets Pinged")
p("The actor is never pinged about their own action. Desk means branch managers, dispatchers, and staff whose job title is front desk, reception or concierge.")
tbl(["Event", "Recipients", "Severity"], [
    ["Room CLEAN", "Managers, admins, housekeeping:inspect", "INFO"],
    ["Room DIRTY", "Room's owner, or housekeeper pool", "CRITICAL after CLEAN, else WARN"],
    ["Room INSPECTED", "Housekeeper who owned it", "INFO"],
    ["Room IN_PROGRESS by someone else", "Owner", "INFO"],
    ["Task assigned", "Assignee (pickup: card)", "INFO / WARN"],
    ["Pickup created or re-timed", "Driver", "INFO"],
    ["Pickup GUEST_ON_BOARD", "Desk; housekeeper if room not ready", "INFO / WARN; CRITICAL to housekeeper"],
    ["Pickup DROPPED_OFF", "Desk", "INFO"],
    ["Pickup problem / answer", "Desk / driver", "CRITICAL / INFO"],
], ["32%", "40%", "28%"])

# ─── 10 App ──────────────────────────────────────────────────────────────────
h1("10 Staff App Sign-in and Offline")
h2("10.1 Overview")
lead("Staff sign in once; the app opens the screen for their job. Every action works offline: it is applied on screen "
     "straight away, queued on the phone, and replayed when the signal comes back.")
seq("""sequenceDiagram
    actor S as Staff
    participant App as Staff app
    participant Q as Offline queue (SQLite)
    participant API as Yoonie API
    S->>App: email + password
    App->>API: POST /auth/login
    API-->>App: accessToken, refreshToken, user (role, jobTitle, branchIds)
    App->>App: open Housekeeper / Driver / Dispatcher / Manager
    App->>API: POST /devices (push token)
    S->>App: tap a step (no signal)
    App->>Q: queue with Idempotency-Key
    Note over App,Q: back online
    Q->>API: replay in order
    alt 2xx
        API-->>Q: done
    else 409
        API-->>Q: drop, refetch tasks
    else other error
        Q->>Q: retry, drop after 3 attempts
    end""")
h2("10.2 Home Screen by Role")
tbl(["Role", "Job title", "Opens"], [
    ["STAFF", "HOUSEKEEPER", "Housekeeper"],
    ["STAFF", "DRIVER", "Driver"],
    ["DISPATCHER", "–", "Dispatcher"],
    ["BRANCH_MGR, ADMIN", "–", "Manager (Inspect)"],
    ["STAFF", "anything else", "\"Wrong role\" screen"],
], ["30%", "30%", "40%"])

# ─── 11 Statuses ─────────────────────────────────────────────────────────────
h1("11 Statuses")
h2("11.1 Room (cleaningStatus)")
tbl(["Status", "Meaning", "Can move to"], [
    ["DIRTY", "Needs cleaning", "IN_PROGRESS"],
    ["IN_PROGRESS", "Being cleaned", "CLEAN, DIRTY"],
    ["CLEAN", "Cleaned, waiting for inspection", "INSPECTED, DIRTY"],
    ["INSPECTED", "Ready for the guest", "DIRTY"],
], ["22%", "48%", "30%"])
h2("11.2 Task (status)")
tbl(["Status", "Meaning", "Can move to"], [
    ["OPEN", "To do (owned or in the pool)", "IN_PROGRESS, DONE, DISMISSED"],
    ["IN_PROGRESS", "Worker started", "DONE, DISMISSED"],
    ["DONE", "Finished", "OPEN (room sent back to DIRTY)"],
    ["DISMISSED", "No longer needed (flight moved, no-show, tour filled)", "end"],
    ["ACKNOWLEDGED", "Retired. Old rows read as OPEN; never written", "–"],
], ["22%", "48%", "30%"])
h2("11.3 Pickup (stage)")
tbl(["Stage", "Meaning", "Task status"], [
    ["ASSIGNED", "Driver given the job, not accepted yet", "OPEN"],
    ["CONFIRMED", "Driver accepted", "OPEN"],
    ["EN_ROUTE", "Left the hotel", "IN_PROGRESS"],
    ["AT_AIRPORT", "At the arrivals door; the countdown stops", "IN_PROGRESS"],
    ["GUEST_ON_BOARD", "Guest in the car", "IN_PROGRESS"],
    ["DROPPED_OFF", "Guest at the lobby", "DONE"],
], ["22%", "48%", "30%"])
h2("11.4 Order, Line, Payment and Hold")
tbl(["Object", "Statuses"], [
    ["Order", "PENDING, CONFIRMED, CANCELLED, COMPLETED"],
    ["Order line", "PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW"],
    ["Payment", "UNPAID, DEPOSIT, PAID, REFUNDED"],
    ["Inventory hold", "ACTIVE, CONVERTED, RELEASED, EXPIRED"],
], ["22%", "78%"])

# ─── 12 Errors ───────────────────────────────────────────────────────────────
h1("12 Errors", brk=False)
tbl(["Status", "When", "Client does"], [
    ["400", "Validation failed; unknown field; DIRTY without a reason", "Show the message"],
    ["401", "Not signed in or token expired", "Refresh token, else sign in again"],
    ["403", "Other branch; someone else's room; role not allowed; dispatcher cancelling a tour", "Show the message"],
    ["404", "Unknown id", "Refetch"],
    ["409", "Move not allowed; slot full; task closed; pickup without driver; already claimed", "Drop the action and refetch (app queue does this)"],
    ["429", "Over 100 requests per minute from one IP", "Back off"],
], ["10%", "55%", "35%"])
code({"success": False, "statusCode": 409, "message": "Invalid room transition from CLEAN to IN_PROGRESS",
      "path": "/api/staff/rooms/665a1b2c3d4e5f6a7b8c9d1a/transition", "timestamp": "2026-10-25T08:12:03.120Z"}, "Error example")

# ─── Part B ──────────────────────────────────────────────────────────────────
part("Part B · Reference")
h1("13 Data Schemas", brk=False)
h2("13.1 OperationalDispatch (task)")
tbl(["Field", "Type", "Notes"], [
    ["branchId, serviceDate", "ObjectId, YYYY-MM-DD", "With type and dedupeKey: unique"],
    ["type", "String", "HOUSEKEEPING_TURNAROUND, AIRPORT_PICKUP, TOUR_CONSOLIDATION"],
    ["dedupeKey", "String", "hk:{room}, pickup:{order}:{line}, tour:{slot}"],
    ["status, severity, priorityScore", "Mixed", "Section 11.2; INFO / WARN / CRITICAL"],
    ["assigneeUserId", "ObjectId", "Owner; empty = open pool"],
    ["title, dueAt, completedAt", "Mixed", ""],
    ["housekeeping", "Object", "roomId, roomNumber, orderId, guestName, etaAt, etaSource, flightNumber, targetReadyBy, isVip"],
    ["pickup", "Object", "orderId, lineId, guestName, flightNumber, etaAt, meetingDoor, vehiclePlate, driverUserId, channel, card {en, th}, stage, steps[], issue"],
    ["consolidation", "Object", "slotKey, serviceName, departsAt, booked, capacity, minViablePax, revenueThb, fixedCostThb, projectedLossThb, decision, decisionNote"],
], ["26%", "18%", "56%"])
h2("13.2 Room")
tbl(["Field", "Type", "Notes"], [
    ["branchId, roomNumber, floor, roomType", "Mixed", "Physical room. Never computes availability."],
    ["cleaningStatus, cleaningUpdatedAt", "String, Date", "Written only by the room transition"],
    ["baseRateThb, maxOccupancy, amenities, images", "Mixed", "Catalogue"],
], ["34%", "16%", "50%"])
h2("13.3 Order")
tbl(["Field", "Type", "Notes"], [
    ["orderNumber, branchId, status", "Mixed", ""],
    ["guest", "Object", "fullName, email, phoneE164, lineUserId, preferredLanguage"],
    ["lines[]", "Array", "lineId, kind, status, title, quantity, unitPriceThb, totalThb, startsAt, businessDate, slotRefs[], stay / dining / service"],
    ["lines[].stay", "Object", "roomType, checkInDate, checkOutDate, nights, nightlyRates[], assignedRoomId, assignedRoomNumber"],
    ["lines[].service", "Object", "serviceId, serviceKind, pax, flight {number, landingAt, meetingDoor}"],
    ["totals", "Object", "subtotal, discount, service charge, VAT, grand total (recomputed on save)"],
    ["payment", "Object", "method, status, entries[] {amountThb, method, reference, at, byUserId}"],
    ["attribution", "Object", "utmSource, utmMedium, utmCampaign, channel"],
], ["24%", "14%", "62%"])
h2("13.4 InventorySlot")
tbl(["Field", "Type", "Notes"], [
    ["slotKey", "String", "branch:KIND:resource:startsAt; unique"],
    ["kind", "String", "ROOM_NIGHT, DINING, SERVICE"],
    ["capacity, held, booked", "Number", "One atomic conditional $inc keeps held + booked ≤ capacity"],
    ["businessDate, startsAt, endsAt", "Mixed", ""],
    ["minViablePax, fixedCostThb", "Number", "Tours: feeds the fill check"],
], ["28%", "14%", "58%"])
h2("13.5 Notification")
tbl(["Field", "Type", "Notes"], [
    ["userId, branchId", "ObjectId", ""],
    ["type", "String", "TASK_ASSIGNED, ROOM_DIRTY, PICKUP_READY, CRITICAL_ALERT, GENERAL"],
    ["severity", "String", "INFO, WARN, CRITICAL"],
    ["title, body, data", "Mixed", "data carries dispatchId, roomId, type"],
    ["status", "String", "PENDING, SENDING, SENT, FAILED"],
    ["readAt, ackedAt", "Date", ""],
], ["24%", "14%", "62%"])

h1("14 Roles and Permissions", brk=False)
tbl(["Role", "Can"], [
    ["Guest", "Book, view and cancel their own order with the order token"],
    ["Staff · Housekeeper", "See own rooms and the pool; Start (claims), Mark clean; Needs cleaning with a reason"],
    ["Staff · Driver", "See own pickups; report steps and problems"],
    ["Staff + housekeeping:inspect", "Also inspect (Pass / Fail)"],
    ["Dispatcher", "See Dispatch; assign; answer pickup problems; Keep / Merge tours; record pickup steps for a driver; can't move rooms"],
    ["Branch manager", "Everything in their branches: room moves, inspection, Cancel tours, payments, flight edits, invite staff"],
    ["Admin", "As branch manager; catalogue and property setup"],
    ["Platform admin", "All branches; create branches"],
], ["26%", "74%"])

h1("15 Decisions", brk=False)
tbl(["#", "Decision", "Source"], [
    ["1", "The worker reports work from where it happens; screens observe. Desk entries are recorded as on the worker's behalf.", "Operating rules L1"],
    ["2", "One write path per fact: rooms move only through POST /staff/rooms/{id}/transition, which moves the room and its task together.", "Operating rules L2"],
    ["3", "Housekeeping is an open pool: starting a room claims it; managers can assign.", "Product, 25 Oct"],
    ["4", "ACKNOWLEDGED is retired. Ownership comes from the assignee; pickups have a real Accept step; tours have a recorded decision.", "Product, 25 Oct"],
    ["5", "Airport pickup is a driver-reported journey with problems the desk must answer (Keep waiting / No-show).", "Product, 25 Oct"],
    ["6", "Tour fill: dispatcher decides Keep or Merge; Cancel needs a manager.", "Product, 25 Oct"],
    ["7", "Guest checkout confirms immediately as pay at hotel; payments are recorded at the desk.", "Code"],
    ["8", "Room ready-by = ETA + 60 min; ETA is the flight landing, else check-in time. Guest on board tightens it to now + 45 min.", "Code"],
    ["9", "Notifications are stored then delivered by the worker; responses return who was notified.", "Operating rules L4"],
    ["10", "Steps only move forward; repeats are no-ops; staff mutations take an Idempotency-Key.", "Operating rules L6"],
    ["11", "Humans decide anything that costs money or touches a guest; AI may only recommend until a rule is approved.", "Operating rules L8"],
    ["12", "Guest tour and ops tour are separate; the ops tour only runs after login.", "Product, 25 Oct"],
], ["6%", "76%", "18%"])

h1("16 Open Items", brk=False)
tbl(["Owner", "Item"], [
    ["Product", "Guides and therapists: our staff (accounts) or a partner's (no-login link)? Blocks tour departure and spa."],
    ["Product", "Cut the driver to 3 taps (Accept, Guest with me, Dropped off) until \"left hotel\" and \"at the door\" feed an alert?"],
    ["Product", "Ready-by for check-in-time arrivals: check-in time + 60 min (15:00), or check-in time?"],
    ["Product", "Escalation timings (unaccepted pickup, unanswered problem, late room) as branch settings"],
    ["Engineering", "Ship the staff app build with pickup steps, problem reports and the dispatcher Cancel rule"],
    ["Engineering", "Remove web Start cleaning / Mark clean; replace with \"Housekeeper phoned in…\""],
    ["Engineering", "Wire LINE delivery; message the guest when the driver is at the door"],
    ["Engineering", "Payment gateway for online payment; today everything is pay at hotel"],
    ["Engineering", "Airport-to-hotel drive time (45 min) as a branch setting; later measured"],
    ["Ops", "Vercel env: BACKEND_URL on the web project; WORKER_ENABLED on the API"],
], ["16%", "84%"])

h1("17 Build Status", brk=False)
tbl(["Item", "Status", "Waiting on"], [
    ["Guest booking (hold, order, pay at hotel)", "Built", "Payment gateway for online pay"],
    ["Dispatch planning and inbox", "Built", "–"],
    ["Room turnaround (pool, claim, inspect)", "Built", "Remove direct web buttons"],
    ["Airport pickup journey (API + web)", "Built", "–"],
    ["Airport pickup journey (staff app)", "Built, not shipped", "App release"],
    ["Tour fill decision", "Built", "Guest follow-up after Merge / Cancel"],
    ["Front desk payments and folio", "Built", "–"],
    ["Ops boards (Rooms, Guests, Services)", "Built", "–"],
    ["Push notifications and inbox", "Built", "WORKER_ENABLED in production"],
    ["LINE delivery", "Linking built; sending not wired", "Engineering"],
    ["Escalation timers", "Designed", "Branch settings"],
    ["Tour departure, spa session", "Designed", "Who the guides and therapists are"],
    ["Onboarding tours (guest, ops)", "Built", "–"],
], ["44%", "26%", "30%"])

h1("18 Source Documents", brk=False)
tbl(["Document", "Covers", "Status"], [
    ["docs/OPERATING_RULES.md", "The laws, job types, ping matrix, escalation, AI and robots", "Current: the rulebook"],
    ["docs/SYSTEM_FLOWS.md", "Original architecture and 05:30 run-sheet flows", "Flow 4 and phases 3–4 outdated"],
    ["docs/DATA_MODEL.md", "ERD and state machines", "Room and task lifecycles superseded by section 11"],
    ["docs/FRONTEND_API.md", "Endpoint guide", "Predates Dispatch claim / assign / pickup steps"],
    ["docs/MULTI_TENANCY.md", "Hosts, branches, proxy routing", "Current"],
    ["PRODUCT.md", "Pitch to code map, product principles", "Current"],
    ["Swagger /api/docs", "Every endpoint and DTO", "Current: generated from code"],
], ["30%", "44%", "26%"])

CSS = """
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; color: #222; font-size: 10.5px; line-height: 1.45; margin: 0; }
.runhead { font-size: 9px; letter-spacing: .06em; color: #1f3d70; border-bottom: 1px solid #c9d1e3; padding-bottom: 6px; margin-bottom: 18px; }
.title { font-size: 30px; color: #1f5590; margin-bottom: 2px; }
.subtitle { font-size: 13px; color: #6b7280; margin-bottom: 18px; }
.part { background: #0b1f5c; color: #fff; font-size: 17px; padding: 6px 12px; margin: 6px 0 22px; }
h1 { font-size: 20px; font-weight: 400; color: #1f5590; margin: 22px 0 10px; }
h2 { font-size: 15px; font-weight: 400; color: #1f5590; margin: 18px 0 8px; }
h3 { font-size: 11.5px; color: #0b1f5c; margin: 12px 0 5px; }
h1, h2, h3, .label, .lead { break-after: avoid; }
.brk { break-before: page; }
.lead { font-weight: 700; font-size: 12.5px; line-height: 1.5; }
p { margin: 6px 0 8px; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; table-layout: fixed; break-inside: auto; }
tr { break-inside: avoid; }
th { background: #0b1f5c; color: #fff; font-weight: 700; padding: 4px 6px; text-align: center; font-size: 10px; }
td { border: 1px solid #c9d1e3; padding: 3px 6px; vertical-align: top; word-wrap: break-word; }
tbody tr:nth-child(even) td { background: #eef1f7; }
code { font-family: Menlo, Consolas, monospace; font-size: 9.5px; }
.label { color: #6b7280; font-size: 9.5px; margin: 6px 0 2px; }
pre { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 8px 10px; font-family: Menlo, Consolas, monospace; font-size: 9px; white-space: pre-wrap; margin: 0 0 10px; break-inside: avoid; }
.diagram { margin: 8px auto 12px; break-inside: avoid; text-align: center; }
.diagram pre.mermaid { background: none; border: 0; padding: 0; font-family: inherit; }
.diagram svg { max-width: 100%; height: auto; }
"""

OUT.write_text(f"""<!doctype html><html><head><meta charset="utf-8"><title>Yoonie Operating System</title>
<style>{CSS}</style></head><body>{''.join(parts)}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{ startOnLoad: false, theme: 'default', sequence: {{ useMaxWidth: true, mirrorActors: true, actorFontSize: 11, messageFontSize: 11 }} }});
mermaid.run({{ querySelector: '.mermaid' }}).then(() => document.body.dataset.ready = '1');</script>
</body></html>""")
print("wrote", OUT)
