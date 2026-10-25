"""Builds 'Yoonie: How the Hotel Runs', the plain-language business guide (same look as the OS document)."""
import html, pathlib, sys

HERE = pathlib.Path(__file__).parent
OUT = HERE / "yoonie-business-guide.html"
DATE = "25 OCT 2026"

# reuse the page style of the technical document so both read as one set
sys.path.insert(0, str(HERE.parent / "operating-system"))
CSS = (HERE.parent / "operating-system" / "build.py").read_text().split('CSS = """', 1)[1].split('"""', 1)[0]

parts = []
def add(s): parts.append(s)
def esc(s): return html.escape(str(s))
def tbl(headers, rows, widths=None):
    cols = "".join(f'<col style="width:{w}">' for w in widths) if widths else ""
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    add(f'<table><colgroup>{cols}</colgroup><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>')
def diagram(src, width=None):
    n = sum(1 for l in src.splitlines() if l.strip().startswith(("participant", "actor")))
    width = width or ({2: "55%", 3: "72%", 4: "88%"}.get(n, "100%") if n else "100%")
    add(f'<div class="diagram" style="width:{width}"><pre class="mermaid">{esc(src)}</pre></div>')
def h1(t, brk=True): add(f'<h1 class="{"brk" if brk else ""}">{esc(t)}</h1>')
def h2(t): add(f"<h2>{esc(t)}</h2>")
def lead(t): add(f'<p class="lead">{t}</p>')
def p(t): add(f"<p>{t}</p>")
def bullets(items): add("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>")
def part(t, brk=True): add(f'<div class="part {"brk" if brk else ""}">{esc(t)}</div>')
def callout(t): add(f'<div class="callout">{t}</div>')

# ─────────────────────────────────────────────────────────────────────────────
add(f'<div class="runhead">YOONIE &nbsp;|&nbsp; BUSINESS GUIDE &nbsp;|&nbsp; {DATE}</div>')
add('<div class="title">Yoonie: How the Hotel Runs</div>')
add('<div class="subtitle">A plain-language guide to the operating system and the AI concierge, for the business team</div>')
part("Part A · The Operating System", brk=False)

h1("1 What Yoonie Is", brk=False)
lead("Yoonie runs a hotel from the moment a guest books to the moment they leave. It takes bookings directly, "
     "works out what needs doing for each guest, sends that work to the right person's phone, and shows managers "
     "everything live: who is doing what, what is late, and what it costs.")
p("Most hotels run on a booking system, a till, paper lists and group chats that don't talk to each other. Yoonie "
  "puts them in one place. A booking on the website instantly becomes a room to clean, a driver to send and a tour "
  "seat to fill, and every step of that work is visible and recorded.")
h2("1.1 What we promise the hotel")
tbl(["Promise", "What it means day to day"], [
    ["<b>The guest promise is kept</b>", "The room is ready when the guest walks in. The driver is at the arrivals door when the flight lands. The tour leaves on time."],
    ["<b>Nothing happens blindly</b>", "Every job has a person, a deadline and a next step. When something changes, the right people are told, and only them."],
    ["<b>Everything is on record</b>", "Every step is saved with who did it and when. That's what lets us measure, improve, and later let AI run parts of the hotel."],
], ["30%", "70%"])

h2("1.2 Who uses it")
tbl(["Person", "Where", "What Yoonie does for them"], [
    ["Guest", "Hotel website (and soon chat)", "Book a room, airport pickup, tours, spa and dining in one go"],
    ["Front desk", "Ops dashboard", "See who is arriving, which rooms are ready, take payments"],
    ["Dispatcher", "Ops dashboard and phone", "One list of every job in the hotel; hand out work; answer problems"],
    ["Housekeeper", "Phone", "Today's rooms in the order guests arrive; tap Start and Done"],
    ["Driver", "Phone", "Today's pickups with the flight, the door and the guest's name sign; tap each step"],
    ["Supervisor / manager", "Phone and dashboard", "Inspect rooms; approve anything that costs money"],
    ["Owner", "Dashboard", "Occupancy, revenue, what each service earns against what it costs"],
], ["18%", "26%", "56%"])

h2("1.3 The loop")
p("Everything in Yoonie follows the same loop:")
diagram("""flowchart LR
    A["Guest books"] --> B["Yoonie plans<br/>the work"]
    B --> C["Job sent to a<br/>staff phone"]
    C --> D["Staff tap each step<br/>where the work happens"]
    D --> E["Right people are told"]
    E --> F["Managers see it live"]
    D --> G["Every step recorded<br/>for reports and AI"]""")
p("<b>Staff report, Yoonie routes, the desk only steps in when something goes wrong.</b> Nobody marks a job done "
  "from behind a desk without the person doing it confirming it.")

# ─── 2 A guest's day ─────────────────────────────────────────────────────────
h1("2 A Guest's Day, End to End")
lead("Hiroshi books a Deluxe Balcony room for two nights, with an airport pickup, on the hotel's website. "
     "Here is everything Yoonie does, and who does what.")
diagram("""sequenceDiagram
    actor G as Hiroshi (guest)
    participant Y as Yoonie
    actor D as Driver
    actor H as Housekeeper
    actor M as Supervisor
    actor F as Front desk
    G->>Y: Books room + airport pickup online
    Y-->>G: Confirmed, pay at the hotel
    Y->>H: Room 305 to clean, ready by 14:20
    Y->>D: Pickup EK 372, lands 13:20, door 4
    D->>Y: Accepted
    H->>Y: Started cleaning 305
    D->>Y: At the arrivals door
    D->>Y: Guest is with me
    Y->>F: Hiroshi on the way, here around 14:25
    Y->>H: Guest arrives around 14:25, finish 305
    H->>Y: Room 305 clean
    Y->>M: Room 305 ready to inspect
    M->>Y: Passed
    D->>Y: Dropped at the hotel
    Y->>F: Hiroshi is at the lobby, Room 305 ready
    F->>G: Welcome, here is your key""")
tbl(["Time", "What happens", "Who sees it"], [
    ["Booking", "Room, pickup and any tours are booked together. Nobody else can take the same room or seat.", "Guest, front desk"],
    ["Same moment", "Yoonie creates the jobs: room 305 to clean by 14:20, pickup for flight EK 372.", "Housekeeping, driver, dispatcher"],
    ["Morning", "Housekeepers see rooms in the order guests arrive, not by room number.", "Housekeepers"],
    ["13:20", "Driver is at door 4 with Hiroshi's name sign.", "Dispatch board"],
    ["13:40", "Guest in the car: the front desk and the housekeeper get a heads-up with the arrival time.", "Desk, housekeeper"],
    ["14:25", "Guest at the lobby; room already inspected; key handed over.", "Front desk"],
    ["Checkout", "Front desk takes payment; the bill shows room, extras, service charge and VAT.", "Front desk, owner"],
], ["14%", "62%", "24%"])

# ─── 3 Bookings ──────────────────────────────────────────────────────────────
h1("3 Bookings", brk=False)
lead("Guests book everything in one checkout on the hotel's own website: room, airport pickup, tours, spa and dining. "
     "Booking direct means the hotel keeps the 15–25% an online travel agent would take, and keeps the guest's details.")
bullets([
    "<b>No double booking.</b> While a guest checks out, their room and seats are held for 15 minutes. If they leave, everything is released automatically.",
    "<b>Pay at the hotel.</b> Bookings are confirmed immediately and paid at the front desk. Online payment is planned.",
    "<b>Every booking remembers where it came from</b> (Instagram, Google, a campaign), so we can show which marketing actually brings guests.",
    "<b>Missing flight details</b> are flagged so the front desk can ask the guest before the pickup day.",
])

# ─── 4 Rooms ─────────────────────────────────────────────────────────────────
h1("4 Rooms Ready on Time", brk=False)
lead("A room is only ready when a supervisor has inspected it. Housekeepers clean rooms in the order guests arrive, "
     "and everyone can see whether each room will make it.")
diagram("""flowchart LR
    A["Needs cleaning"] -->|Housekeeper taps Start| B["Being cleaned"]
    B -->|Housekeeper taps Done| C["Clean, waiting for inspection"]
    C -->|Supervisor passes| D["Ready for the guest"]
    C -->|Supervisor fails, says why| A
    D -->|Problem found, says why| A""")
tbl(["Question", "Answer"], [
    ["Who cleans which room?", "Rooms are open to any housekeeper; the first to tap Start takes it. Managers can also hand rooms out."],
    ["By when?", "One hour after the guest is expected: their flight landing time, or check-in time if they have no flight."],
    ["How do we know it's on time?", "Every room shows a countdown. It turns amber when time is tight and red when it's late."],
    ["What if the guest is early?", "When the driver picks the guest up, the housekeeper gets an urgent alert with the new arrival time."],
    ["What if inspection fails?", "The supervisor writes what's wrong; the same housekeeper gets it straight away."],
], ["30%", "70%"])

# ─── 5 Pickups ───────────────────────────────────────────────────────────────
h1("5 Airport Pickups", brk=False)
lead("The driver is at the arrivals door with the guest's name sign when they come out, and the hotel always knows "
     "where the guest is. The driver taps each step on their phone; the desk only steps in when something goes wrong.")
tbl(["Driver taps", "Who is told", "Why it matters"], [
    ["Accept", "Shown on the board", "Someone is definitely going"],
    ["Leaving for the airport", "Shown on the board", "The driver is on the way"],
    ["At arrivals, door 4", "Shown on the board", "The driver is in place before landing"],
    ["Guest is with me", "Front desk; housekeeper if the room isn't ready", "Everyone knows when the guest will walk in"],
    ["Dropped at the hotel", "Front desk", "Time to welcome the guest"],
], ["28%", "36%", "36%"])
h2("5.1 When something goes wrong")
diagram("""sequenceDiagram
    actor D as Driver
    participant Y as Yoonie
    actor Desk as Dispatcher
    D->>Y: Problem: can't find the guest
    Y->>Desk: Urgent: EK 372, driver can't find the guest
    alt Keep waiting
        Desk->>Y: Keep waiting, flight delayed to 15:10
        Y->>D: Keep waiting, flight now 15:10
    else No-show
        Desk->>Y: Guest didn't come
        Y->>D: Stand down, come back to the hotel
    end""")
p("Problems the driver can report: flight delayed, can't find the guest, vehicle problem. The desk must answer; nothing waits silently.")

# ─── 6 Tours ─────────────────────────────────────────────────────────────────
h1("6 Tours: Don't Run at a Loss Without Deciding To", brk=False)
lead("Each tour departure has a cost to run (boat, guide). When a departure is too empty to cover it, Yoonie flags it "
     "early so someone decides what to do, instead of finding out after it has lost money.")
tbl(["Sunset Cruise, costs ฿4,500 to run", "Booked", "Takes in", "Result", "Flagged?"], [
    ["Healthy", "10 of 18", "฿9,000", "+฿4,500", "No"],
    ["Break-even", "5 of 18", "฿4,500", "฿0", "Yes: less than 40% full"],
    ["Losing", "2 of 18", "฿1,800", "−฿2,700", "Yes: under the minimum of 6 guests"],
], ["30%", "14%", "16%", "16%", "24%"])
tbl(["Decision", "Who can make it", "What happens next"], [
    ["Keep: run it anyway", "Dispatcher or manager", "Nothing else; the reason is recorded"],
    ["Merge into another departure", "Dispatcher or manager", "Front desk moves the guests and tells them"],
    ["Cancel the departure", "<b>Manager only</b>", "Front desk refunds or moves the guests and tells them"],
], ["30%", "26%", "44%"])

# ─── 7 Money ─────────────────────────────────────────────────────────────────
h1("7 Money at the Front Desk", brk=False)
lead("Every guest has a clear bill: rooms, extras, 10% service charge and 7% VAT, what's been paid and what's still owed.")
bullets([
    "The front desk records each payment: cash, card, PromptPay or bank transfer, with the slip number.",
    "Deposits are fine; overpaying isn't possible.",
    "Every payment shows who took it and when.",
])

# ─── 8 What managers see ─────────────────────────────────────────────────────
h1("8 What Managers See", brk=False)
tbl(["Screen", "Answers the question"], [
    ["<b>Rooms</b>", "Which rooms are ready, who is in each room tonight, who is arriving, and will each room be ready in time? Board, floor map and calendar views."],
    ["<b>Guests</b>", "Who is in house, arriving and leaving; what they've booked; what they still owe."],
    ["<b>Services</b>", "For every transfer, tour and spa slot: how full it is, what it earns and what it costs."],
    ["<b>Dispatch</b>", "Every job in the hotel today, most urgent first: who has it, what's next, what's late. Today's deadlines on one timeline."],
    ["<b>Staff phones</b>", "Each person sees only their own work: housekeepers their rooms, drivers their pickups, supervisors what to inspect."],
], ["20%", "80%"])
p("Screens refresh on their own every 10–15 seconds. A housekeeper tapping Done on their phone shows on every manager's screen within seconds.")

h1("9 Who Gets Told What", brk=False)
tbl(["When this happens", "These people are told"], [
    ["A room is cleaned", "Supervisors and managers (to inspect it)"],
    ["A room fails inspection", "The housekeeper who cleaned it (urgent)"],
    ["A room passes inspection", "The housekeeper who cleaned it"],
    ["A job is handed to someone", "That person, on their phone"],
    ["A pickup is booked or the flight time changes", "The driver"],
    ["The guest is in the car", "Front desk; the housekeeper if the room isn't ready (urgent)"],
    ["The guest reaches the lobby", "Front desk"],
    ["A driver reports a problem", "Dispatcher and managers (urgent)"],
], ["45%", "55%"])
p("People are never told about something they just did themselves. Every alert is also kept in the person's inbox in the app.")

h1("10 The Rules We Never Break", brk=False)
lead("These rules apply to every kind of job, for people today and robots tomorrow. A feature that breaks one is a bug, even if it seems to work.")
tbl(["#", "Rule", "In practice"], [
    ["1", "The person doing the work reports it", "Only the housekeeper, driver or guide marks their step. The desk can record it for them if they call in, and it says so."],
    ["2", "One fact, one place", "A room's status is changed one way only, so screens never disagree."],
    ["3", "Every job is accountable", "Who has it, by when, what's next, where it is, and what happens if it goes wrong."],
    ["4", "Tell the right people, only them", "No noise, no silence."],
    ["5", "Problems must be answered", "Staff raise problems from a short list; the desk must reply."],
    ["6", "Steps only move forward", "Safe even with bad signal: a step sent twice counts once."],
    ["7", "Choices, not free text", "Statuses and reasons come from fixed lists so they can be counted; notes are extra."],
    ["8", "<b>People decide anything that costs money or affects a guest</b>", "Cancelling a tour, a no-show, refunds, free upgrades: a person decides. AI can suggest, not decide."],
    ["9", "Same rules for people and robots", "A robot gets jobs and reports steps exactly like a person."],
    ["10", "Each hotel only sees its own data", "Staff only see and act on their own branch."],
], ["5%", "35%", "60%"])

# ─── Part B: AI ──────────────────────────────────────────────────────────────
part("Part B · The AI Concierge")
h1("11 The Vision: A Full AI Concierge", brk=False)
lead("A concierge that never sleeps, speaks the guest's language, and is connected to the real hotel: it can see live "
     "availability, the guest's booking and the state of their room, and it can create real jobs for staff. The same "
     "AI helps staff run the day, and gives owners a plain-English view of the business.")
tbl(["For", "The AI concierge will", "Example"], [
    ["<b>Guests</b>", "Answer questions 24/7 in English and Thai on LINE, WhatsApp and the website", "\"What time is breakfast?\" \"Is there a pool?\""],
    ["", "Find and make bookings, and suggest extras", "\"Two nights next weekend with an airport pickup\""],
    ["", "Look up their booking and keep them updated", "\"Your driver is at door 4 with your name sign\""],
    ["", "Take requests that become real jobs for staff", "\"Two more towels to room 305\" → housekeeping gets it on their phone"],
    ["", "Handle changes and ask a person when money is involved", "\"Can I check out late?\" → asks the manager, replies when approved"],
    ["<b>Staff</b>", "Answer questions about today in plain words", "\"What's late?\" \"Which rooms are still dirty for 2pm arrivals?\""],
    ["", "Take actions through the same rules as the app", "\"Mark 305 inspected\" (only for someone allowed to inspect)"],
    ["<b>Owners</b>", "Explain the business and recommend actions", "\"Sunday's cruise will lose ฿2,700; merge it with Saturday?\""],
], ["12%", "48%", "40%"])

h2("11.1 How it fits together")
diagram("""flowchart LR
    G["Guests<br/>LINE · WhatsApp · web chat"] --> GA["Guest concierge<br/>(public)"]
    S["Staff<br/>signed in to the app"] --> SA["Staff assistant<br/>(private)"]
    GA -->|read: rates, rooms, my booking<br/>write: requests only| Y["Yoonie<br/>(same rules as the app)"]
    SA -->|same permissions as<br/>that staff member| Y
    Y --> P["Staff phones<br/>real jobs and alerts"]
    Y --> M["Manager approval<br/>for anything costing money"]""")
p("The guest concierge and the staff assistant are <b>two separate assistants</b> that never share a conversation. "
  "The guest one can only read public information and the guest's own booking, and can only <i>ask</i> for things. "
  "The staff one acts with exactly the permissions of the signed-in staff member.")

h1("12 What's Live Today", brk=False)
lead("Both assistants are live and connected to the real hotel. Every answer comes from Yoonie's live data, and "
     "every action goes through the same rules as the staff app.")
tbl(["Assistant", "What it does today", "Where"], [
    ["<b>Guest concierge</b>", "Answers questions about rooms, prices, tours, spa, dining and policies; checks availability for dates; "
     "looks up a guest's own booking (pickup time and door, room, bill); passes requests to the front desk and housekeeping, who get them on their phones", "Chat (n8n); website chat bubble next"],
    ["<b>Staff assistant</b>", "Answers \"what's late?\", \"which rooms still need cleaning?\", \"where is the pickup?\"; moves rooms, records pickup steps, "
     "answers drivers, decides tours, hands out jobs. Each person can do exactly what their role allows in the app", "Signed-in staff; ops dashboard panel next"],
], ["20%", "56%", "24%"])

h1("13 How We Keep It Safe", brk=False)
lead("The concierge is built so that a guest can never act like staff, and staff can never do more through chat than in the app.")
tbl(["Safeguard", "How it works"], [
    ["Two separate assistants", "Guests and staff use different assistants with different doors. They never share a conversation or a memory."],
    ["Staff must sign in", "The staff assistant only answers someone signed in to Yoonie, and acts with that person's own permissions."],
    ["A booking is private", "A guest sees a booking only with its booking number <b>and</b> the email or phone on it. A wrong detail gets the same polite \"not found\"."],
    ["Live data only", "Prices, availability and bookings are read from Yoonie at the moment of the question, never from a script."],
    ["People decide money", "Late checkout, upgrades, discounts, refunds and cancellations are passed to a manager; the AI never approves them."],
    ["Everything is recorded", "Every request and action is saved with who and when, like any other action in Yoonie."],
], ["26%", "74%"])

h1("14 Roadmap", brk=False)
tbl(["Phase", "What guests and staff get", "Depends on"], [
    ["<b>1. Ask anything</b>", "Guest concierge answers questions with live rates, availability and hotel info.", "<b>Live</b>; website bubble next, then LINE"],
    ["<b>2. Requests become jobs</b>", "\"Towels to 305\" already reaches the desk and housekeeping on their phones. Next: it becomes a tracked job, and the guest is told when it's done.", "<b>Partly live</b>; job tracking next"],
    ["<b>3. My stay</b>", "Guests check their booking (<b>live</b>); next: add a pickup or tour, get pickup updates (\"your driver is at door 4\").", "Guest identity on LINE / WhatsApp"],
    ["<b>4. Book by chat</b>", "Full booking in the conversation, paid at the hotel or online.", "Online payment"],
    ["<b>5. Staff assistant</b>", "Signed-in staff ask \"what's late?\" and take actions by chat, with the same permissions as the app.", "<b>Live</b>; dashboard panel next"],
    ["<b>6. Owner briefings</b>", "Daily summary and recommendations: occupancy, late rooms, losing tours, where guests come from.", "Reports built on the recorded steps"],
    ["<b>7. Autonomy, step by step</b>", "The AI handles specific routine decisions itself (e.g. handing pool rooms to the least busy housekeeper), one approved rule at a time, per hotel.", "Owner approval per rule"],
    ["<b>8. Robots</b>", "Delivery and cleaning robots take jobs and report steps like staff.", "Robot integration"],
], ["20%", "56%", "24%"])

h1("15 What the AI May and May Not Do", brk=False)
tbl(["The AI may", "The AI may not"], [
    ["Answer questions using live hotel information", "Promise anything that costs money (late checkout, upgrades, discounts, refunds) without a person approving"],
    ["Create requests that become jobs for staff", "Mark work as done that a staff member didn't do"],
    ["Recommend decisions to managers with the numbers", "Decide a tour cancellation or a no-show by itself"],
    ["Act for a signed-in staff member, within their permissions", "Give a guest access to staff tools or other guests' details"],
    ["Run an approved routine rule, labelled as \"Yoonie AI\" in the record", "Act without leaving a record of what it did and why"],
], ["50%", "50%"])

# ─── Part C ──────────────────────────────────────────────────────────────────
part("Part C · Status and Decisions")
h1("16 What's Live and What's Coming", brk=False)
tbl(["Area", "Status"], [
    ["Direct booking (room + extras, pay at hotel)", "Live"],
    ["Rooms ready on time: housekeeping, inspection, countdowns", "Live"],
    ["Airport pickups, step by step, with problem reporting", "Live on the dashboard; staff app update ready, not yet released"],
    ["Tour money check and decisions", "Live"],
    ["Front desk payments and bills", "Live"],
    ["Manager screens: Rooms, Guests, Services, Dispatch", "Live"],
    ["Phone alerts and inbox", "Live (needs alerts switched on in production)"],
    ["Online payment", "Planned"],
    ["Tour departures and spa sessions run through the app", "Designed; waiting on a decision (section 17)"],
    ["Automatic escalation when something is late or unanswered", "Designed"],
    ["AI concierge for guests", "Live (sections 11–13); website chat bubble next"],
    ["AI assistant for staff", "Live for signed-in staff; ops dashboard panel next"],
], ["60%", "40%"])

h1("17 Decisions We Need", brk=False)
tbl(["#", "Question", "Why it matters"], [
    ["1", "Are tour guides and spa therapists our staff, or a partner's?", "Our staff get app accounts like drivers; a partner's would use a simple link. Needed before tours and spa can run through Yoonie."],
    ["2", "Should drivers tap 3 steps instead of 5?", "\"Leaving\" and \"at the door\" don't alert anyone yet. Fewer taps until they do."],
    ["3", "Guests without a flight: room ready by check-in time, or one hour after?", "Today it's 15:00 for a 14:00 check-in."],
    ["4", "How fast should things escalate?", "For example: driver hasn't accepted 90 minutes before landing → tell the desk; problem unanswered for 10 minutes → tell the manager."],
    ["5", "Which AI channel first: website chat or LINE?", "Decides what we connect first in phase 1."],
    ["6", "Which routine decisions may the AI make on its own, and in which hotels?", "Nothing is automated until the owner approves it, rule by rule."],
], ["5%", "45%", "50%"])

h1("18 Glossary", brk=False)
tbl(["Word", "Meaning"], [
    ["Dispatch", "The one list of every job in the hotel today, and the screen where it's managed"],
    ["Job / task", "One piece of work: clean a room, pick up a guest, decide on a tour"],
    ["Open pool", "Jobs anyone on shift can take; the first to start it owns it"],
    ["Ready-by", "The time a room must be inspected and ready"],
    ["Inspection", "A supervisor checking a cleaned room before a guest gets it"],
    ["Step", "One thing a staff member taps to say where the work is"],
    ["Problem / answer", "A staff member saying something is wrong, and the desk's reply"],
    ["Folio / bill", "Everything a guest owes and has paid"],
    ["Direct booking", "A booking made on the hotel's own site, with no agency commission"],
    ["n8n", "The automation tool the AI concierge runs on"],
], ["22%", "78%"])

CSS += """
ul { margin: 6px 0 10px 18px; padding: 0; } li { margin: 3px 0; }
.callout { border-left: 3px solid #0b1f5c; background: #eef1f7; padding: 8px 12px; margin: 8px 0; }
.part.brk { break-before: page; }
"""

OUT.write_text(f"""<!doctype html><html><head><meta charset="utf-8"><title>Yoonie: How the Hotel Runs</title>
<style>{CSS}</style></head><body>{''.join(parts)}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{ startOnLoad: false, theme: 'default', flowchart: {{ useMaxWidth: true }}, sequence: {{ useMaxWidth: true, mirrorActors: true }} }});
mermaid.run({{ querySelector: '.mermaid' }}).then(() => document.body.dataset.ready = '1');</script>
</body></html>""")
print("wrote", OUT)
