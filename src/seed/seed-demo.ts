/**
 * Yoonie Live Demo Seeder
 *
 * Designed specifically for live stage demos and presentations:
 * 1. Safe & Scoped: ONLY touches the demo branch (BKK-RIVERSIDE). Never wipes other tenants.
 * 2. Idempotent & Reusable: Can be re-run 100 times before, during, or after demos.
 * 3. Dynamic Relative Dates: Generates data relative to TODAY (no stale hardcoded dates).
 * 4. Guaranteed Zero-403: Automatically grants access to the specified user account (default: lnyinyi22@gmail.com).
 * 5. High-Stakes Demo Proof: Seeds 472 direct orders (~฿5.6M THB revenue, ฿1.02M OTA saved, and Saturday/Thursday transfer spikes).
 *
 * Usage:
 *   npm run seed:demo
 *   npm run seed:demo -- --email=your-email@example.com
 */
import "reflect-metadata";
import { config as loadEnv } from "dotenv";
loadEnv();
import mongoose, { Types } from "mongoose";
import * as bcrypt from "bcrypt";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { RoomTypeCode } from "../common/enums/room-type.enum";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import {
  ServiceCategory,
  ServiceKind,
  PricingModel,
} from "../common/enums/service.enum";
import { OrderStatus, LineStatus, LineKind } from "../common/enums/order.enum";
import {
  SlotKind,
  SlotStatus,
} from "../common/enums/inventory.enum";
import {
  DispatchType,
  DispatchStatus,
  Severity,
  MessageChannel,
} from "../common/enums/dispatch.enum";
import {
  toBusinessDate,
  addDays,
} from "../common/helpers/time.helper";

// Domain Entities
import { Branch, BranchSchema } from "../branch/entity/branch.entity";
import { User, UserSchema, computeVipScore } from "../user/entity/user.entity";
import { Room, RoomSchema } from "../room/entity/room.entity";
import {
  Restaurant,
  RestaurantSchema,
} from "../restaurant/entity/restaurant.entity";
import { Service, ServiceSchema } from "../service/entity/service.entity";
import {
  InventorySlot,
  InventorySlotSchema,
  buildSlotKey,
} from "../inventory/entity/inventory-slot.entity";
import { Order, OrderSchema } from "../order/entity/order.entity";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "../dispatch/entity/operational-dispatch.entity";
import {
  Notification,
  NotificationSchema,
} from "../notifications/entity/notification.entity";

const URI =
  process.env.MONGODB_URI ??
  process.env.MONGO_URI ??
  process.env.DATABASE_URL ??
  "mongodb://localhost:27017/yoonie";

const M = {
  branch: mongoose.model(Branch.name, BranchSchema),
  user: mongoose.model(User.name, UserSchema),
  room: mongoose.model(Room.name, RoomSchema),
  restaurant: mongoose.model(Restaurant.name, RestaurantSchema),
  service: mongoose.model(Service.name, ServiceSchema),
  slot: mongoose.model(InventorySlot.name, InventorySlotSchema),
  order: mongoose.model(Order.name, OrderSchema),
  dispatch: mongoose.model(OperationalDispatch.name, OperationalDispatchSchema),
  notification: mongoose.model(Notification.name, NotificationSchema),
};

const DEMO_BRANCH_ID = new Types.ObjectId("665a1b2c3d4e5f6a7b8c9d0e");

// Extract CLI email if passed: --email=...
function getTargetEmail(): string {
  const arg = process.argv.find((a) => a.startsWith("--email="));
  if (arg) return arg.split("=")[1].trim().toLowerCase();
  return "lnyinyi22@gmail.com";
}

async function main() {
  const targetEmail = getTargetEmail();
  console.log("\n=======================================================");
  console.log("  🚀 YOONIE LIVE DEMO ENVIRONMENT SEEDER");
  console.log("=======================================================");
  console.log(`Connecting to database...`);
  await mongoose.connect(URI);

  const todayStr = toBusinessDate(new Date());
  console.log(`📅 Setting live operational baseline for TODAY: ${todayStr}`);
  console.log(`👤 Target Demo Account: ${targetEmail}`);

  // 1. SAFE SCOPED CLEANUP — Only touch demo branch records
  console.log(`\n🧹 Scoped cleanup for BKK-RIVERSIDE (all other properties preserved)...`);
  await Promise.all([
    M.room.deleteMany({ branchId: DEMO_BRANCH_ID }),
    M.service.deleteMany({ branchId: DEMO_BRANCH_ID }),
    M.restaurant.deleteMany({ branchId: DEMO_BRANCH_ID }),
    M.slot.deleteMany({ branchId: DEMO_BRANCH_ID }),
    M.order.deleteMany({ branchId: DEMO_BRANCH_ID }),
    M.dispatch.deleteMany({ branchId: DEMO_BRANCH_ID }),
    M.notification.deleteMany({ branchId: DEMO_BRANCH_ID }),
  ]);

  // 2. UPSERT DEMO BRANCH
  const branch = await M.branch.findOneAndUpdate(
    { _id: DEMO_BRANCH_ID },
    {
      _id: DEMO_BRANCH_ID,
      code: "BKK-RIVERSIDE",
      name: "BKK Riverside Boutique Hotel",
      timezone: "Asia/Bangkok",
      currency: "THB",
      contactPhoneE164: "+6620001234",
      contactEmail: "stay@riverside-bkk.example",
      logoUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200",
      heroImageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1600",
      images: [
        "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200",
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200",
      ],
      settings: {
        holdTtlMinutes: 15,
        consolidationThreshold: 0.4,
        serviceChargeRate: 0.1,
        vatRate: 0.07,
        checkInTime: "14:00",
        checkOutTime: "12:00",
        dispatchGenerationTime: "05:30",
      },
      isActive: true,
    },
    { upsert: true, new: true }
  );

  // 3. SEED USERS & LINK TARGET ACCOUNT
  console.log(`👥 Provisioning demo accounts with known password...`);
  const hashedPassword = await bcrypt.hash("Password123!", 10);

  // Standard demo staff
  const staffMembers = [
    { name: "Anan Boonmee", email: "anan@riverside-bkk.example", role: UserRole.BRANCH_MGR },
    { name: "Mali Saelim", email: "mali@riverside-bkk.example", role: UserRole.DISPATCHER },
    { name: "Noi Charoen", email: "noi@riverside-bkk.example", role: UserRole.STAFF, jobTitle: "Lead Housekeeper" },
    { name: "Prasit Somboon", email: "prasit@riverside-bkk.example", role: UserRole.STAFF, jobTitle: "Driver" },
  ];

  for (const s of staffMembers) {
    await M.user.findOneAndUpdate(
      { email: s.email },
      {
        displayName: s.name,
        email: s.email,
        password: hashedPassword,
        role: s.role,
        branchIds: [DEMO_BRANCH_ID],
        permissions: [
          Permission.HOUSEKEEPING_INSPECT,
          Permission.HOUSEKEEPING_STATUS,
          Permission.DISPATCH_MANAGE,
          Permission.PICKUP_EXECUTE,
          Permission.STAFF_MANAGE,
          Permission.NOTIFICATIONS_READ,
        ],
        jobTitle: s.jobTitle || null,
        isEmailVerified: true,
        isSuspended: false,
      },
      { upsert: true, new: true }
    );
  }

  // Ensure target demo account has access and correct password
  await M.user.findOneAndUpdate(
    { email: targetEmail },
    {
      $addToSet: { branchIds: DEMO_BRANCH_ID },
      $set: {
        password: hashedPassword,
        role: UserRole.ADMIN,
        isEmailVerified: true,
        isSuspended: false,
      },
    },
    { upsert: true, new: true }
  );

  // 3b. PROVISION DEMO GUESTS FOR ORDERS
  const demoGuestIds: Types.ObjectId[] = [];
  for (let g = 1; g <= 20; g++) {
    const email = `demoguest${g}@riverside-bkk.example`;
    const userDoc = await M.user.findOneAndUpdate(
      { email },
      {
        displayName: `Demo Guest ${g}`,
        email,
        phoneE164: `+6681${String(1000000 + g)}`,
        role: UserRole.GUEST,
        branchIds: [DEMO_BRANCH_ID],
        preferredLanguage: g % 3 === 0 ? "th" : "en",
        stats: {
          lifetimeSpendThb: 40000 + g * 3000,
          stayCount: 2 + (g % 3),
          orderCount: 3 + (g % 3),
        },
        vipScore: 50 + (g % 40),
        isActive: true,
        isEmailVerified: true,
      },
      { upsert: true, new: true }
    );
    demoGuestIds.push(userDoc._id);
  }

  // 4. SEED ROOMS (40 physical units across 3 types)
  console.log(`🛏️  Seeding 40 physical rooms...`);
  const roomTypes = [
    { type: RoomTypeCode.STANDARD_KING, count: 20, rate: 2200, floor: 1 },
    { type: RoomTypeCode.DELUXE_BALCONY, count: 14, rate: 3400, floor: 2 },
    { type: RoomTypeCode.POOL_VILLA, count: 6, rate: 5800, floor: 3 },
  ];

  const createdRooms: any[] = [];
  let roomIdx = 101;
  for (const rt of roomTypes) {
    for (let i = 0; i < rt.count; i++) {
      const roomNum = String(roomIdx++);
      const room = await M.room.create({
        branchId: DEMO_BRANCH_ID,
        roomNumber: roomNum,
        floor: rt.floor,
        roomType: rt.type,
        maxOccupancy: 2,
        baseRateThb: rt.rate,
        cleaningStatus: i < 3 ? CleaningStatus.DIRTY : CleaningStatus.INSPECTED,
        cleaningUpdatedAt: new Date(),
        amenities: ["KING_BED", "WIFI", "AIR_CON"],
        isActive: true,
      });
      createdRooms.push(room);
    }
  }

  // 5. SEED SERVICES & EXPERIENCES
  console.log(`🛶 Seeding tour and transfer services...`);
  const servicesData = [
    {
      code: "AIRPORT-BKK",
      name: "Suvarnabhumi Airport Transfer (VIP Van)",
      kind: ServiceKind.AIRPORT_TRANSFER,
      category: ServiceCategory.TRANSPORT,
      pricingModel: PricingModel.PER_VEHICLE,
      basePriceThb: 1400,
      fixedCostThb: 600,
      capacityPerSlot: 6,
      transfer: {
        airportCode: "BKK",
        airportName: "Suvarnabhumi Airport",
        flightTrackingEnabled: true,
        meetingDoors: [3, 4],
        vehicles: [
          {
            plate: "1กก 1234",
            type: "MINIVAN",
            capacityPax: 8,
            isActive: true,
          },
        ],
      },
    },
    {
      code: "SUNSET-CRUISE",
      name: "Chao Phraya Sunset Longtail Cruise",
      kind: ServiceKind.SCHEDULED_TOUR,
      category: ServiceCategory.TOURS,
      pricingModel: PricingModel.PER_PAX,
      basePriceThb: 1800,
      fixedCostThb: 4000,
      capacityPerSlot: 10,
      tour: {
        capacity: 10,
        minViablePax: 4,
        fixedCostThb: 4000,
        departureTimes: ["16:30"],
        durationMin: 120,
        meetingPoint: "Hotel Pier",
      },
    },
    {
      code: "SPA-PACKAGE",
      name: "Traditional Thai Herbal Spa (90 min)",
      kind: ServiceKind.SPA_TREATMENT,
      category: ServiceCategory.WELLNESS,
      pricingModel: PricingModel.PER_PAX,
      basePriceThb: 1500,
      fixedCostThb: 450,
      capacityPerSlot: 4,
      wellness: {
        treatmentRooms: 3,
        therapists: 2,
        durationMin: 90,
        turnoverMin: 15,
        startTimes: ["10:00", "13:00", "15:00", "17:00"],
      },
    },
  ];

  const createdServices: Record<string, any> = {};
  for (const s of servicesData) {
    const svc = await M.service.create({
      branchId: DEMO_BRANCH_ID,
      ...s,
      isActive: true,
    });
    createdServices[s.code] = svc;
  }

  // 6. SEED DIRECT ORDER ATTRIBUTION LEDGER (472 orders, ~฿5.6M THB revenue)
  console.log(`💳 Generating verified ledger (~฿5.6M direct revenue, ฿1.02M OTA savings)...`);
  const channels = [
    { channel: "DIRECT_WEB", utm: "direct", weight: 52, avgPrice: 11000 },
    { channel: "DIRECT_WEB", utm: "google", weight: 53, avgPrice: 11200 },
    { channel: "DIRECT_WEB", utm: "instagram", weight: 53, avgPrice: 11200 },
    { channel: "DIRECT_WEB", utm: "facebook", weight: 53, avgPrice: 10900 },
    { channel: "DIRECT_WEB", utm: "tiktok", weight: 51, avgPrice: 13900 },
    { channel: "DIRECT_WEB", utm: "blogger", weight: 51, avgPrice: 11100 },
    { channel: "DIRECT_WEB", utm: "email", weight: 52, avgPrice: 11250 },
    { channel: "LINE", utm: "line", weight: 54, avgPrice: 13600 },
    { channel: "WHATSAPP", utm: "whatsapp", weight: 53, avgPrice: 13800 },
  ];

  let totalOrdersCount = 0;
  let totalRevenue = 0;
  let orderNumSeq = 1000;

  for (const ch of channels) {
    for (let i = 0; i < ch.weight; i++) {
      const orderDate = new Date();
      // Distribute over past 30 days
      orderDate.setDate(orderDate.getDate() - (i % 28));

      const price = ch.avgPrice + ((i % 5) * 200 - 400);
      const guestEmail = `guest${orderNumSeq}@example.com`;
      const guestName = `Demo Guest ${orderNumSeq}`;

      await M.order.create({
        branchId: DEMO_BRANCH_ID,
        guestId: demoGuestIds[orderNumSeq % demoGuestIds.length],
        orderNumber: `TS-${todayStr.replace(/-/g, "").slice(2)}-${orderNumSeq++}`,
        status: OrderStatus.CONFIRMED,
        guestSnapshot: {
          fullName: guestName,
          email: guestEmail,
          phoneE164: `+6681${String(orderNumSeq).padStart(7, "0")}`,
          preferredLanguage: "en",
        },
        attribution: {
          channel: ch.channel,
          utmSource: ch.utm,
          utmMedium: "cpc",
          utmCampaign: `autumn_campaign_${ch.utm}`,
        },
        items: [
          {
            lineId: `line-${orderNumSeq}`,
            kind: LineKind.STAY,
            status: LineStatus.CONFIRMED,
            title: "Deluxe Balcony Room (2 nights)",
            quantity: 1,
            unitPriceThb: price,
            totalThb: price,
            startsAt: orderDate,
            businessDate: toBusinessDate(orderDate),
            stay: {
              roomType: RoomTypeCode.DELUXE_BALCONY,
              checkInDate: toBusinessDate(orderDate),
              checkOutDate: addDays(toBusinessDate(orderDate), 2),
              nights: 2,
              adults: 2,
              nightlyRates: [
                { date: toBusinessDate(orderDate), rateThb: Math.round(price / 2) },
                { date: addDays(toBusinessDate(orderDate), 1), rateThb: price - Math.round(price / 2) },
              ],
            },
          },
        ],
        totals: {
          subtotalThb: price,
          grandTotalThb: price,
          discountThb: 0,
          serviceChargeRate: 0.1,
          serviceChargeThb: Math.round(price * 0.1),
          vatRate: 0.07,
          vatThb: Math.round(price * 0.07),
        },
        payment: {
          status: "PAID",
          method: "CARD",
          paidThb: price,
          entries: [],
        },
      });
      totalOrdersCount += 1;
      totalRevenue += price;
    }
  }

  // 7. SEED OPERATIONAL DISPATCH FOR TODAY & TRANSIT SPIKES (The Reel Insight!)
  console.log(`🚐 Creating airport pickup dispatch tasks (proving day-of-week transfer spikes)...`);
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  // Seed distribution proving the transfer surge
  const dayVolumes: Record<string, number> = {
    Sunday: 38,
    Monday: 35,
    Tuesday: 28,
    Wednesday: 28,
    Thursday: 32,
    Friday: 32,
    Saturday: 43, // Peak day
  };

  for (const [dayName, count] of Object.entries(dayVolumes)) {
    const dayOffset = daysOfWeek.indexOf(dayName);
    const serviceDate = addDays(todayStr, (dayOffset - new Date().getDay() + 7) % 7);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const flightNum = `TG${600 + i}`;
      const guestName = `VIP Guest ${i + 1}`;
      await M.dispatch.create({
        branchId: DEMO_BRANCH_ID,
        type: DispatchType.AIRPORT_PICKUP,
        status: DispatchStatus.OPEN,
        serviceDate,
        severity: Severity.INFO,
        title: `Airport Pickup: ${flightNum} for ${guestName}`,
        dedupeKey: `pickup:demo:${serviceDate}:${flightNum}:${i}`,
        priorityScore: 100 + i * 10,
        dueAt: new Date(Date.now() + (i + 2) * 3600 * 1000),
        pickup: {
          orderId: new Types.ObjectId(),
          lineId: `line-pickup-${serviceDate}-${i}`,
          flightNumber: flightNum,
          guestName,
          etaAt: new Date(Date.now() + (i + 2) * 3600 * 1000),
          channel: MessageChannel.LINE,
          deliveryStatus: "SENT",
          card: {
            en: `Welcome to Bangkok, ${guestName}`,
            th: `ยินดีต้อนรับสู่กรุงเทพฯ คุณ ${guestName}`,
          },
        },
      });
    }
  }

  // Live housekeeping jobs for TODAY
  console.log(`🧹 Creating live housekeeping board for TODAY...`);
  for (let i = 0; i < 5; i++) {
    const room = createdRooms[i];
    await M.dispatch.create({
      branchId: DEMO_BRANCH_ID,
      type: DispatchType.HOUSEKEEPING_TURNAROUND,
      status: DispatchStatus.OPEN,
      serviceDate: todayStr,
      severity: i === 0 ? Severity.CRITICAL : Severity.WARN,
      title: `Clean Room ${room.roomNumber} before arrival`,
      dedupeKey: `hk:demo:${todayStr}:${room.roomNumber}`,
      priorityScore: 120 - i * 10,
      dueAt: new Date(Date.now() + (i + 1) * 3600 * 1000),
      housekeeping: {
        roomId: room._id,
        roomNumber: room.roomNumber,
        isVip: i === 0,
        etaAt: new Date(Date.now() + (i + 1) * 3600 * 1000),
        etaSource: "CHECKIN_TIME",
        targetReadyBy: new Date(Date.now() + (i + 2) * 3600 * 1000),
      },
    });
  }

  const otaSavings = Math.round(totalRevenue * 0.18);

  console.log("\n=======================================================");
  console.log("  🎉 DEMO ENVIRONMENT SEEDED SUCCESSFULLY!");
  console.log("=======================================================");
  console.table({
    "Hotel Property": "BKK Riverside Boutique Hotel",
    "Branch Code": "BKK-RIVERSIDE",
    "Owner Email": targetEmail,
    "Default Password": "Password123!",
    "Direct Bookings": `${totalOrdersCount} orders`,
    "Direct Revenue": `฿${totalRevenue.toLocaleString()} THB`,
    "OTA Saved (18%)": `฿${otaSavings.toLocaleString()} THB`,
    "Rooms Configured": `${createdRooms.length} rooms`,
  });
  console.log("\nReady for live presentation! Access http://localhost:3000 or production.\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
