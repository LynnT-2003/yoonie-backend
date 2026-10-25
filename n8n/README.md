# Yoonie AI Receptionist & Operations (n8n Integration)

This directory contains the n8n conversational AI workflows for **Yoonie**, powering both the **Guest Concierge** (public facing) and the **Back Office / BO Operations Assistant** (staff facing).

The architecture is strictly compliant with the hotel operating laws defined in [`docs/OPERATING_RULES.md`](../docs/OPERATING_RULES.md).

---

## 1. Core Architecture: The Gate

A single AI agent must **never** be exposed to both public guests and internal back-office commands. Doing so causes data leakage, unauthorized perks (free upgrades, unauthorized late checkouts), and database corruption.

Our workflow uses a physical **Gate** right after the Chat Trigger:

```
                  [When chat message received]
                                │
                                ▼
                    [THE GATE: Staff or Guest?]
                                │
                        [IF: Is Back Office?]
                         ├── TRUE  ──> [BO Staff Agent (Privileged)]
                         │             ├── BO Tool: get_live_ops_board
                         │             ├── BO Tool: transition_room_cleaning
                         │             ├── BO Tool: update_pickup_step
                         │             └── BO Tool: inspect_tour_fill
                         │
                         └── FALSE ──> [Guest Agent (Sanitized)]
                                       ├── Guest Tool: check_room_rates
                                       ├── Guest Tool: lookup_my_reservation
                                       ├── Guest Tool: get_hotel_and_amenity_info
                                       └── Guest Tool: request_guest_service
```

### Why this Gate is air-tight:
1. **Physical Canvas Separation**: The Guest Agent is physically connected **only** to Guest tools. It has zero connections to room status transitions, dispatch assignment, or financial CRM tools.
2. **Sanitized Persona**: The Guest Agent prompt speaks with 5-star hospitality, answers compound questions, and is strictly prohibited from leaking database jargon (e.g. `IN_PROGRESS`, `DIRTY`, `TICKET_OPEN`).
3. **Law 8 Compliance (Decisions that cost money)**: The Guest Agent cannot authorize late checkouts, discounts, or cancellations. It politely informs the guest that manager approval is required and submits a request.

---

## 2. Tools Breakdown

### Guest-Facing Tools (Safe / Public)

| Tool | Purpose | Data Source |
| :--- | :--- | :--- |
| **`check_room_rates`** | Checks nightly rates and room details (Standard King: ฿2,200, Deluxe Riverfront: ฿3,500, Suite: ฿6,500). | `rooms` catalog / live availability |
| **`lookup_my_reservation`** | Looks up active booking, stay dates, assigned room number, and flight pickup details. | `orders` collection by phone / order code |
| **`get_hotel_and_amenity_info`** | Restaurant opening hours (Riverside Cafe, Sunset Deck Bar), tour departures, and check-in/out policies. | `restaurants`, `services`, `branches` |
| **`request_guest_service`** | In-house guest amenity requests (towels, extra pillows, water). Creates a live task in `operational_dispatches`. | `operational_dispatches` (`type: GENERAL_REQUEST`) |

### Back Office Tools (Privileged / Staff Only)

| Tool | Purpose | Operating Law Compliance |
| :--- | :--- | :--- |
| **`get_live_ops_board`** | Views today's live operational board: tight rooms, VIP arrivals, driver statuses, and housekeeping run-sheet. | Reads `/ops-board` & `operational_dispatches` |
| **`transition_room_cleaning`** | Transitions physical room state (`IN_PROGRESS`, `CLEAN`, `INSPECTED`, or `DIRTY` with reason). | **Law 2**: Routes through `POST /staff/rooms/:id/transition`. Direct patches are rejected. |
| **`update_pickup_step`** | Records driver milestones (`EN_ROUTE`, `AT_AIRPORT`, `GUEST_ON_BOARD`, `DROPPED_OFF`). | **Law 1**: Worker-reported step tracking via `POST /staff/pickups/:id/step`. |
| **`inspect_tour_fill`** | Reviews departures below minimum viability or under 40% fill rate. Allows Dispatcher to `Keep`/`Merge` and Manager to `Cancel`. | **Law 8**: Cancellation requires manager role. |

---

## 3. How to Import and Run in n8n

### Step 1: Copy the Workflow
Open [`yoonie-gated-receptionist-and-ops.json`](./yoonie-gated-receptionist-and-ops.json).

### Step 2: Paste into n8n Canvas
1. In your browser (`n8n`), open a new workflow canvas.
2. Click anywhere on the empty canvas and press **`Cmd + V`** (or `Ctrl + V`).
3. Connect your OpenAI credential to the **OpenAI Chat Model** node.

### Step 3: Test Both Personas in Chat

Click the **"Chat"** button at the bottom of n8n:

#### A. Test as Guest
- **Ask**: *"What are your room rates and can you bring extra towels to room 105?"*
- **Expected Result**: 
  - Routes to **Guest Agent (Sanitized)**.
  - Answers room prices cleanly.
  - Confirms towels will be delivered by housekeeping within 15 minutes.
  - **Does NOT mention** database statuses like `"IN_PROGRESS"`.

#### B. Test as Back Office Staff (Passcode: `/staff`)
- **Ask**: *"/staff Show me today's operational dispatch board and tight rooms"*
- **Expected Result**:
  - Routes to **BO Staff Agent (Privileged)**.
  - Returns today's active tasks (Room 105 turnaround, driver Somchai, VIP arrivals).
- **Ask**: *"/staff Mark room 105 as INSPECTED"*
  - **Expected Result**: Executes `transition_room_cleaning` and confirms inspection approval.
