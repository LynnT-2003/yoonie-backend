# Yoonie AI Concierge (n8n)

Two workflows, two entry points. Guests and staff never share an assistant, a conversation or a memory.

| Workflow | Who | Entry | How it's protected |
|---|---|---|---|
| `yoonie-guest-concierge.json` | Guests | Public chat | Calls only the guest-safe `/api/concierge/*` endpoints with the n8n-only `x-concierge-key`. A booking is only shown to someone with its number **and** the email or phone on it. |
| `yoonie-staff-assistant.json` | Signed-in staff | Webhook `POST /webhook/yoonie-staff-assistant` with `Authorization: Bearer <Yoonie token>` | n8n asks the API who the caller is (`/users/me`). No valid login → 401. Every tool runs **as that person**, so the API enforces their exact permissions (rules in `docs/OPERATING_RULES.md`). |

`yoonie-gated-receptionist-and-ops.json` is the earlier prototype (sample data, keyword gate). Use the two files above instead.

## Set up

1. Backend env (Vercel): `CONCIERGE_API_KEY=<random>` (`openssl rand -hex 24`).
2. In n8n, import both JSON files.
3. Credentials:
   - **OpenAI** on the "OpenAI (guest)" and "OpenAI (staff)" nodes.
   - **Header Auth** named `Yoonie concierge key`: name `x-concierge-key`, value = the same `CONCIERGE_API_KEY`. Select it on the four guest tools.
4. Each workflow's **Config** node holds the API address (`https://yoonie-backend.vercel.app/api`); the guest one also holds the branch code and hotel name.
5. Activate both.

## Guest tools → API

| Tool | Endpoint |
|---|---|
| `hotel_info` | `GET /concierge/hotel?branchCode` |
| `check_availability` | `GET /concierge/availability?branchCode&checkIn&checkOut` |
| `lookup_booking` | `POST /concierge/bookings/lookup {orderNumber, contact}` |
| `send_request` | `POST /concierge/requests {orderNumber, contact, category, details}`: pings the front desk (and housekeeping for HOUSEKEEPING / AMENITY) |

## Staff tools → API (as the signed-in user)

| Tool | Endpoint |
|---|---|
| `todays_jobs` | `GET /dispatch?branchId&serviceDate` |
| `owner_insights` | `GET /ops-board/insights?branchId` (OTA commission savings, marketing channel attribution, transfer spikes) |
| `rooms_now` | `GET /rooms/live-occupancy?branchId&date` |
| `guests_now` | `GET /ops-board/guests?branchId&date` |
| `services_now` | `GET /ops-board/services?branchId&date` |
| `move_room` | `POST /staff/rooms/{roomId}/transition` |
| `pickup_step` | `POST /staff/pickups/{taskId}/step` |
| `answer_pickup_problem` | `POST /dispatch/{taskId}/pickup-issue` |
| `tour_decision` | `POST /dispatch/{taskId}/decision` |
| `staff_list` / `assign_task` | `GET /staff/roster`, `PATCH /dispatch/{taskId}/assign` |

See [`docs/N8N_STAFF_INTELLIGENCE.md`](../docs/N8N_STAFF_INTELLIGENCE.md) for full formulas, backend crunching pipelines, and 20 operator pitch answers.

## Call the staff assistant

One command: it signs in and asks in one go. Change the email name (`anan`, `mali`, `noi`, `prasit`) and the message.

```bash
curl -s -X POST https://lynn1975.app.n8n.cloud/webhook/yoonie-staff-assistant -H "Authorization: Bearer $(curl -s -X POST https://yoonie-backend.vercel.app/api/auth/login -H 'content-type: application/json' -d '{"email":"anan@riverside-bkk.example","password":"Password123!"}' | jq -r .data.tokens.accessToken)" -H 'content-type: application/json' -d '{"message":"What is late today?","sessionId":"demo"}'
# → {"reply":"..."}
```
