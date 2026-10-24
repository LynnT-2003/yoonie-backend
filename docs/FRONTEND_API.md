# Frontend API & Integration Guide

Complete reference for frontend applications (Booking Engine Widget, Guest Portal, Housekeeping Board, Operations Dashboard).

All endpoints accept and return JSON. Date formats follow ISO 8601 strings (`2026-10-20T00:00:00.000Z`) or business date strings (`YYYY-MM-DD`). Currency amounts are in Thai Baht (`THB`).

---

## 1. Endpoints Overview

| Method | Endpoint | Description | Auth | Request DTO | Response DTO |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/branches` | List all hotel property branches | Public | - | `BranchResponseDto[]` |
| `GET` | `/branches/:code` | Get property details by branch code | Public | - | `BranchResponseDto` |
| `POST` | `/branches` | Create a new hotel branch | JWT | `CreateBranchDto` | `BranchResponseDto` |
| `GET` | `/rooms` | List room keys for a property | Public | `QueryRoomDto` | `RoomResponseDto[]` |
| `GET` | `/rooms/housekeeping` | Grouped housekeeping board | Public | `QueryRoomDto` | `HousekeepingBoardResponseDto` |
| `PATCH` | `/rooms/:id/cleaning` | Update room housekeeping status | Public | `UpdateCleaningStatusDto` | `RoomResponseDto` |
| `GET` | `/restaurants` | List dining venues and shifts | Public | `QueryRestaurantDto` | `RestaurantResponseDto[]` |
| `GET` | `/restaurants/:id` | Get restaurant tables & shifts | Public | - | `RestaurantResponseDto` |
| `GET` | `/services` | List tours, spa, and transfers | Public | `QueryServiceDto` | `ServiceResponseDto[]` |
| `GET` | `/services/:id` | Get service detail & configs | Public | - | `ServiceResponseDto` |
| `GET` | `/inventory/availability` | Check room availability across dates | Public | `CheckAvailabilityQueryDto` | `AvailabilityResponseDto` |
| `POST` | `/inventory/hold` | Atomically hold slots during checkout | Public | `CreateHoldDto` | `InventoryHoldResponseDto` |
| `DELETE` | `/inventory/hold/:id` | Release active inventory hold | Public | - | `ReleaseHoldResponseDto` |
| `POST` | `/orders` | Create composite booking reservation | Public | `CreateOrderDto` | `OrderResponseDto` |
| `GET` | `/orders/:id` | Fetch booking details by ID | Public | - | `OrderResponseDto` |
| `POST` | `/orders/:id/confirm` | Confirm payment & book inventory | Public | `ConfirmPaymentDto` | `OrderResponseDto` |
| `POST` | `/orders/:id/lines/:lineId/cancel` | Cancel item line & refund inventory | Public | `CancelOrderLineDto` | `OrderResponseDto` |
| `GET` | `/dispatch` | Get prioritized daily task run-sheet | Public | `QueryDispatchDto` | `DispatchTaskResponseDto[]` |
| `PATCH` | `/dispatch/:id/status` | Update dispatch task status | Public | `UpdateDispatchStatusDto` | `DispatchTaskResponseDto` |

---

## 2. Detailed API Specifications

### 2.1 Branch & Property (`/branches`)

#### `GET /branches`
Fetch all active properties.
* **Response `200 OK`**:
```json
[
  {
    "_id": "665a1b2c3d4e5f6a7b8c9d0e",
    "code": "BKK-RIVERSIDE",
    "name": "BKK Riverside Boutique Hotel",
    "timezone": "Asia/Bangkok",
    "currency": "THB",
    "settings": {
      "checkInTime": "14:00",
      "checkOutTime": "12:00",
      "vatRate": 0.07,
      "serviceChargeRate": 0.1,
      "holdTtlMinutes": 15,
      "consolidationThreshold": 0.4,
      "dispatchGenerationTime": "05:30"
    },
    "isActive": true
  }
]
```

---

### 2.2 Rooms & Housekeeping (`/rooms`)

#### `GET /rooms?branchId=665a1b2c3d4e5f6a7b8c9d0e`
List physical keys for front-desk operations.
* **Query Parameters**:
  * `branchId` (required): Branch ObjectId.
  * `roomType` (optional): `STANDARD_KING` | `DELUXE_BALCONY` | `POOL_VILLA`.
  * `cleaningStatus` (optional): `CLEAN` | `DIRTY` | `IN_PROGRESS` | `INSPECTED`.

#### `GET /rooms/housekeeping?branchId=665a1b2c3d4e5f6a7b8c9d0e`
Real-time board grouped by cleaning status.
* **Response `200 OK`**:
```json
{
  "inspected": [],
  "clean": [],
  "inProgress": [],
  "dirty": [
    {
      "_id": "665a1b2c3d4e5f6a7b8c9d1a",
      "branchId": "665a1b2c3d4e5f6a7b8c9d0e",
      "roomNumber": "101",
      "floor": 1,
      "roomType": "STANDARD_KING",
      "cleaningStatus": "DIRTY",
      "amenities": ["King Bed", "En-suite Bath", "Smart TV"]
    }
  ]
}
```

#### `PATCH /rooms/:id/cleaning`
Update housekeeping status from mobile tablet.
* **Request Body**:
```json
{
  "cleaningStatus": "IN_PROGRESS"
}
```
* **Allowed Values**: `"DIRTY"`, `"IN_PROGRESS"`, `"CLEAN"`, `"INSPECTED"`.

---

### 2.3 Inventory & Availability Engine (`/inventory`)

#### `GET /inventory/availability`
Check available units for a room type across a multi-day stay.
* **Query Parameters**:
  * `branchId`: Branch ObjectId.
  * `roomType`: `STANDARD_KING`, `DELUXE_BALCONY`, `POOL_VILLA`.
  * `checkIn`: `YYYY-MM-DD`.
  * `checkOut`: `YYYY-MM-DD`.
* **Response `200 OK`**:
```json
{
  "available": 18,
  "branchId": "665a1b2c3d4e5f6a7b8c9d0e",
  "roomType": "STANDARD_KING",
  "checkIn": "2026-10-20",
  "checkOut": "2026-10-23"
}
```

#### `POST /inventory/hold`
Hold slots atomically while the guest is filling out checkout details.
* **Request Body**:
```json
{
  "branchId": "665a1b2c3d4e5f6a7b8c9d0e",
  "cartId": "cart_client_uuid_123",
  "lines": [
    {
      "slotKey": "665a1b2c3d4e5f6a7b8c9d0e:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
      "qty": 1
    },
    {
      "slotKey": "665a1b2c3d4e5f6a7b8c9d0e:ROOM_NIGHT:STANDARD_KING:2026-10-21T00:00:00.000Z",
      "qty": 1
    }
  ],
  "ttlMinutes": 15
}
```
* **Response `201 Created`**:
```json
{
  "_id": "665a1b2c3d4e5f6a7b8c9d5e",
  "branchId": "665a1b2c3d4e5f6a7b8c9d0e",
  "cartId": "cart_client_uuid_123",
  "status": "ACTIVE",
  "expiresAt": "2026-10-18T15:15:00.000Z"
}
```

#### `DELETE /inventory/hold/:id`
Release inventory when guest removes items or empties cart.
* **Response `200 OK`**:
```json
{
  "released": true
}
```

---

### 2.4 Composite Orders & Bookings (`/orders`)

#### `POST /orders`
Create a composite booking order (rooms, dining, transfers, excursions) with direct attribution tracking.
* **Request Body**:
```json
{
  "branchId": "665a1b2c3d4e5f6a7b8c9d0e",
  "guest": {
    "fullName": "Sarah Jenkins",
    "email": "sarah.j@example.com",
    "phoneE164": "+66812345678",
    "lineUserId": "U1234567890abcdef",
    "preferredLanguage": "en"
  },
  "lines": [
    {
      "kind": "STAY",
      "title": "Standard King Room (2 nights)",
      "quantity": 1,
      "unitPriceThb": 4400,
      "startsAt": "2026-10-20T07:00:00.000Z",
      "endsAt": "2026-10-22T05:00:00.000Z",
      "businessDate": "2026-10-20",
      "stay": {
        "roomType": "STANDARD_KING",
        "checkInDate": "2026-10-20",
        "checkOutDate": "2026-10-22",
        "nights": 2,
        "adults": 2,
        "children": 0
      }
    },
    {
      "kind": "SERVICE",
      "title": "Private Airport Transfer (Arrival)",
      "quantity": 1,
      "unitPriceThb": 1500,
      "startsAt": "2026-10-20T07:30:00.000Z",
      "businessDate": "2026-10-20",
      "service": {
        "serviceId": "665a1b2c3d4e5f6a7b8c9d3c",
        "serviceName": "Suvarnabhumi Airport Transfer",
        "serviceKind": "AIRPORT_TRANSFER",
        "pax": 2,
        "flight": {
          "number": "TG917",
          "direction": "ARRIVAL",
          "scheduledAt": "2026-10-20T14:30:00.000Z",
          "terminal": "Terminal 1",
          "meetingDoor": 3
        }
      }
    }
  ],
  "attribution": {
    "utmSource": "google",
    "utmMedium": "cpc",
    "utmCampaign": "bangkok_boutique_promo",
    "channel": "DIRECT_WEB"
  },
  "specialRequests": "Quiet floor requested"
}
```
* **Response `201 Created`**:
```json
{
  "_id": "665a1b2c3d4e5f6a7b8c9d6f",
  "orderNumber": "TS-261020-A1B2C",
  "status": "CONFIRMED",
  "totals": {
    "subtotalThb": 5900,
    "discountThb": 0,
    "serviceChargeRate": 0.1,
    "serviceChargeThb": 590,
    "vatRate": 0.07,
    "vatThb": 454.3,
    "grandTotalThb": 6944.3
  },
  "payment": {
    "status": "UNPAID",
    "paidThb": 0
  }
}
```

#### `POST /orders/:id/confirm`
Confirm payment and finalize inventory hold to booked.
* **Request Body**:
```json
{
  "paymentRef": "ch_stripe_3Lkd2kL4k2j",
  "paidThb": 6944.3
}
```
* **Response `200 OK`**:
```json
{
  "_id": "665a1b2c3d4e5f6a7b8c9d6f",
  "orderNumber": "TS-261020-A1B2C",
  "status": "CONFIRMED",
  "payment": {
    "status": "PAID",
    "paidThb": 6944.3,
    "providerRef": "ch_stripe_3Lkd2kL4k2j"
  }
}
```

#### `POST /orders/:id/lines/:lineId/cancel`
Cancel an individual line item inside an existing order.
* **Request Body**:
```json
{
  "reason": "Guest cancelled flight transfer",
  "refundThb": 1500
}
```

---

### 2.5 Operational Dispatch & Frontline Tasks (`/dispatch`)

#### `GET /dispatch?branchId=...&serviceDate=YYYY-MM-DD`
Fetch prioritized run-sheet for operations managers and staff.
* **Query Parameters**:
  * `branchId`: Branch ObjectId.
  * `serviceDate`: `YYYY-MM-DD`.
  * `status` (optional): `OPEN`, `ACKNOWLEDGED`, `IN_PROGRESS`, `DONE`, `DISMISSED`.
  * `type` (optional): `HOUSEKEEPING_TURNAROUND`, `TOUR_CONSOLIDATION`, `AIRPORT_PICKUP`.
* **Response `200 OK`**:
```json
[
  {
    "_id": "665a1b2c3d4e5f6a7b8c9d7a",
    "branchId": "665a1b2c3d4e5f6a7b8c9d0e",
    "serviceDate": "2026-10-20",
    "type": "AIRPORT_PICKUP",
    "priorityScore": 120,
    "severity": "WARN",
    "status": "OPEN",
    "title": "Airport pickup TG917 - Sarah Jenkins (Door 3)",
    "dueAt": "2026-10-20T14:30:00.000Z",
    "pickup": {
      "guestName": "Sarah Jenkins",
      "flightNumber": "TG917",
      "etaAt": "2026-10-20T14:30:00.000Z",
      "meetingDoor": 3,
      "vehiclePlate": "1กข-9999",
      "channel": "LINE",
      "card": {
        "en": "Welcome to Bangkok, Ms. Sarah Jenkins",
        "th": "ยินดีต้อนรับสู่กรุงเทพฯ คุณซาร่าห์ เจนกินส์"
      }
    }
  }
]
```

#### `PATCH /dispatch/:id/status`
Update task progress.
* **Request Body**:
```json
{
  "status": "IN_PROGRESS",
  "assigneeUserId": "665a1b2c3d4e5f6a7b8c9d0a"
}
```

---

## 3. Frontend Integration Example (React / TypeScript / Axios)

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
});

// 1. Check Room Availability
export const checkAvailability = async (branchId: string, roomType: string, checkIn: string, checkOut: string) => {
  const { data } = await api.get('/inventory/availability', {
    params: { branchId, roomType, checkIn, checkOut },
  });
  return data.available; // number
};

// 2. Create 15-Minute Checkout Hold
export const createCartHold = async (branchId: string, cartId: string, slotKeys: string[]) => {
  const { data } = await api.post('/inventory/hold', {
    branchId,
    cartId,
    lines: slotKeys.map((slotKey) => ({ slotKey, qty: 1 })),
    ttlMinutes: 15,
  });
  return data; // { _id, status: 'ACTIVE', expiresAt }
};

// 3. Confirm Order Payment
export const confirmPayment = async (orderId: string, paymentRef: string, paidThb: number) => {
  const { data } = await api.post(`/orders/${orderId}/confirm`, {
    paymentRef,
    paidThb,
  });
  return data; // OrderResponseDto
};
```
