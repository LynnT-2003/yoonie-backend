/**
 * Usage:
 *   MONGO_URI="mongodb://localhost:27017/yoonie?replicaSet=rs0" npm run seed
 *
 * Populates data across all domain modules for the ENTIRE MONTH of October 2026,
 * culminating in a clean, live operational state for DEMO DAY (November 1, 2026):
 *   - BranchModule: BKK-RIVERSIDE
 *   - UserModule: 7 staff + 36 guest CDP profiles with lifetime spend & VIP tiers
 *   - RoomModule: 40 physical units with realistic occupancy and inspected rooms
 *   - RestaurantModule: Riverside Cafe + Sunset Deck Bar
 *   - ServiceModule: 4 services (Airport Transfer, Sunset Cruise, Spa, Ayutthaya Tour)
 *   - InventoryModule: Slots for the whole month (room nights, tours, transfers, dining, spa)
 *   - OrderModule: ~140 composite orders simulating a full month of hotel operations (~฿2.8M THB direct revenue)
 *   - DispatchModule: Completed historical run-sheets + Live 05:30 operational boards for Today & Demo Day (Nov 1)
 *   - Notifications: Targeted frontline role alerts for housekeepers, drivers, dispatchers
 */
import "reflect-metadata";
import { config as loadEnv } from "dotenv";
loadEnv();
import mongoose, { HydratedDocument, Types } from "mongoose";
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
  HoldStatus,
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
  zonedAt,
  hhmm,
  eachNight,
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
import {
  InventoryHold,
  InventoryHoldSchema,
} from "../inventory/entity/inventory-hold.entity";
import { Order, OrderLine, OrderSchema } from "../order/entity/order.entity";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "../dispatch/entity/operational-dispatch.entity";
import {
  Notification,
  NotificationSchema,
} from "../notifications/entity/notification.entity";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationSeverity } from "../notifications/enums/notification-severity.enum";
import { NotificationStatus } from "../notifications/enums/notification-status.enum";
import {
  housekeepingPriority,
  pickupPriority,
  evaluateConsolidation,
  buildPickupCard,
} from "../dispatch/rules/dispatch-rules";

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
  hold: mongoose.model(InventoryHold.name, InventoryHoldSchema),
  order: mongoose.model(Order.name, OrderSchema),
  dispatch: mongoose.model(OperationalDispatch.name, OperationalDispatchSchema),
  notification: mongoose.model(Notification.name, NotificationSchema),
};

const TODAY = toBusinessDate(new Date()); // e.g. 2026-10-27
const DEMO_DATE = "2026-11-01"; // Nov 1 Demo Day
let BRANCH!: Types.ObjectId;

/* ------------------------------------------------------------------ in-memory slot accumulator */
interface SlotAccumulator {
  branchId: Types.ObjectId;
  slotKey: string;
  kind: SlotKind;
  resourceKey: string;
  resourceId?: Types.ObjectId;
  businessDate: string;
  startsAt: Date;
  endsAt?: Date;
  capacity: number;
  booked: number;
  held: number;
  status: SlotStatus;
  minViablePax?: number;
  fixedCostThb?: number;
}

const slotMap = new Map<string, SlotAccumulator>();

interface ReserveParams {
  kind: SlotKind;
  resourceKey: string;
  resourceId?: Types.ObjectId;
  startsAt: Date;
  endsAt?: Date;
  capacity: number;
  qty: number;
  mode: "booked" | "held";
  minViablePax?: number;
  fixedCostThb?: number;
}

function reserve(p: ReserveParams): { slotKey: string; qty: number } {
  const slotKey = buildSlotKey(BRANCH, p.kind, p.resourceKey, p.startsAt);
  let slot = slotMap.get(slotKey);
  if (!slot) {
    slot = {
      branchId: BRANCH,
      slotKey,
      kind: p.kind,
      resourceKey: p.resourceKey,
      resourceId: p.resourceId,
      businessDate: toBusinessDate(p.startsAt),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      capacity: p.capacity,
      booked: 0,
      held: 0,
      status: SlotStatus.OPEN,
      minViablePax: p.minViablePax,
      fixedCostThb: p.fixedCostThb,
    };
    slotMap.set(slotKey, slot);
  }
  if (p.mode === "booked") {
    slot.booked += p.qty;
  } else {
    slot.held += p.qty;
  }
  return { slotKey, qty: p.qty };
}

/* ------------------------------------------------------------------ main */
async function main() {
  console.log(`Connecting to MongoDB: ${URI}`);
  await mongoose.connect(URI);
  console.log("Synchronizing indexes & wiping domain collections...");

  for (const m of Object.values(M) as unknown as mongoose.Model<object>[]) {
    await m.deleteMany({});
    await m.syncIndexes();
  }

  /* ---- 1. Branch */
  const branch = await M.branch.create({
    _id: new Types.ObjectId("665a1b2c3d4e5f6a7b8c9d0e"),
    code: "BKK-RIVERSIDE",
    name: "BKK Riverside Boutique Hotel",
    timezone: "Asia/Bangkok",
    currency: "THB",
    address: {
      line1: "88 Charoen Krung Rd",
      district: "Bang Rak",
      city: "Bangkok",
      countryCode: "TH",
      postalCode: "10500",
      geo: [100.5143, 13.7234],
    },
    contactPhoneE164: "+6620001234",
    contactEmail: "stay@riverside-bkk.example",
    logoUrl:
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200",
    heroImageUrl:
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1600",
    images: [
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200",
    ],
    settings: {
      holdTtlMinutes: 15,
      consolidationThreshold: 0.4,
      serviceChargeRate: 0.1,
      vatRate: 0.07,
      checkInTime: "14:00",
      checkOutTime: "12:00",
    },
  });
  BRANCH = branch._id;

  /* ---- 2. Staff Users */
  const defaultStaffPassword = await bcrypt.hash("Password123!", 10);
  const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    [UserRole.ADMIN]: [
      Permission.HOUSEKEEPING_INSPECT,
      Permission.HOUSEKEEPING_STATUS,
      Permission.DISPATCH_MANAGE,
      Permission.PICKUP_EXECUTE,
      Permission.STAFF_MANAGE,
      Permission.NOTIFICATIONS_READ,
    ],
    [UserRole.BRANCH_MGR]: [
      Permission.HOUSEKEEPING_INSPECT,
      Permission.HOUSEKEEPING_STATUS,
      Permission.DISPATCH_MANAGE,
      Permission.STAFF_MANAGE,
      Permission.NOTIFICATIONS_READ,
    ],
    [UserRole.DISPATCHER]: [
      Permission.DISPATCH_MANAGE,
      Permission.HOUSEKEEPING_STATUS,
      Permission.NOTIFICATIONS_READ,
    ],
    [UserRole.STAFF]: [
      Permission.HOUSEKEEPING_STATUS,
      Permission.NOTIFICATIONS_READ,
    ],
    [UserRole.GUEST]: [],
  };

  const staffDefs: Array<[string, UserRole, string, string, string?]> = [
    ["Kanya Srisuk", UserRole.ADMIN, "kanya", "+66810000001"],
    ["Anan Boonmee", UserRole.BRANCH_MGR, "anan", "+66810000002"],
    ["Mali Chaiyo", UserRole.DISPATCHER, "mali", "+66810000003"],
    ["Noi Prasert", UserRole.STAFF, "noi", "+66810000004", "HOUSEKEEPER"],
    ["Dao Wongsa", UserRole.STAFF, "dao", "+66810000005", "HOUSEKEEPER"],
    ["Somchai Rattana", UserRole.STAFF, "somchai", "+66810000006", "DRIVER"],
    ["Prasit Kaew", UserRole.STAFF, "prasit", "+66810000007", "DRIVER"],
  ];
  const FIXED_STAFF_IDS: Record<string, string> = {
    kanya: "665a1b2c3d4e5f6a7b8c0001",
    anan: "665a1b2c3d4e5f6a7b8c0002",
    mali: "665a1b2c3d4e5f6a7b8c0003",
    noi: "665a1b2c3d4e5f6a7b8c0004",
    dao: "665a1b2c3d4e5f6a7b8c0005",
    somchai: "665a1b2c3d4e5f6a7b8c0006",
    prasit: "665a1b2c3d4e5f6a7b8c0007",
  };
  const staff: Record<string, HydratedDocument<User>> = {};
  for (const [fullName, role, handle, phoneE164, jobTitle] of staffDefs) {
    const permissions = [...ROLE_PERMISSIONS[role]];
    if (
      jobTitle === "DRIVER" &&
      !permissions.includes(Permission.PICKUP_EXECUTE)
    ) {
      permissions.push(Permission.PICKUP_EXECUTE);
    }

    staff[handle] = (await M.user.create({
      _id: new Types.ObjectId(FIXED_STAFF_IDS[handle]),
      displayName: fullName,
      role,
      email: `${handle}@riverside-bkk.example`,
      password: defaultStaffPassword,
      phoneE164,
      branchIds: [BRANCH],
      jobTitle: jobTitle ?? null,
      permissions,
      isEmailVerified: true,
      isActive: true,
    })) as HydratedDocument<User>;
  }

  /* ---- 3. Master Guest CDP Profiles (36 Realistic Profiles) */
  const guestDefs = [
    // 4 Key Conversational AI Demo Guests from n8n/DEMO.md
    {
      fullName: "Eleanor Whitfield",
      email: "eleanor.whitfield@example.com",
      phoneE164: "+447700900077",
      nat: "GB",
      lang: "en",
      prior: [210000, 6],
    },
    {
      fullName: "Hiroshi Tanaka",
      email: "h.tanaka@example.com",
      phoneE164: "+819012345678",
      lineUserId: "U4f3a9c0d1e2b",
      nat: "JP",
      lang: "en",
      prior: [40000, 2],
    },
    {
      fullName: "Marcus Lindqvist",
      email: "marcus.l@example.com",
      phoneE164: "+46701234567",
      nat: "SE",
      lang: "en",
      prior: [320000, 9],
    },
    {
      fullName: "Priya Raman",
      email: "priya.raman@example.com",
      phoneE164: "+6591234567",
      nat: "SG",
      lang: "en",
      prior: [26000, 1],
    },
    // October Regular & VIP Guests
    {
      fullName: "Siriporn Chaiyasit",
      email: "siriporn.c@example.com",
      phoneE164: "+66812345678",
      lineUserId: "U7b2e5d8a9c1f",
      nat: "TH",
      lang: "th",
      prior: [85000, 3],
    },
    {
      fullName: "Lucas Fernandes",
      email: "lucas.fernandes@example.com",
      phoneE164: "+5511987654321",
      nat: "BR",
      lang: "en",
      prior: [18000, 1],
    },
    {
      fullName: "Chen Yu-Ting",
      email: "yuting.chen@example.com",
      phoneE164: "+886912345678",
      lineUserId: "U1d6c3b7e2a90",
      nat: "TW",
      lang: "en",
      prior: [52000, 2],
    },
    {
      fullName: "Amelia Novak",
      email: "amelia.novak@example.com",
      phoneE164: "+61412345678",
      nat: "AU",
      lang: "en",
      prior: [34000, 1],
    },
    {
      fullName: "Narin Thongchai",
      email: "narin.t@example.com",
      phoneE164: "+66891234567",
      lineUserId: "U9e8d7c6b5a41",
      nat: "TH",
      lang: "th",
      prior: [45000, 2],
    },
    {
      fullName: "Jonas Becker",
      email: "jonas.becker@example.com",
      phoneE164: "+4915123456789",
      nat: "DE",
      lang: "en",
      prior: [62000, 2],
    },
    {
      fullName: "Sarah Jenkins",
      email: "sarah.j@example.com",
      phoneE164: "+447812345678",
      nat: "GB",
      lang: "en",
      prior: [145000, 4],
    },
    {
      fullName: "Alexander Weber",
      email: "a.weber@example.com",
      phoneE164: "+491701234567",
      nat: "DE",
      lang: "en",
      prior: [98000, 3],
    },
    {
      fullName: "Mei-Ling Zhou",
      email: "meiling.z@example.com",
      phoneE164: "+85291234567",
      lineUserId: "Umeiling_z",
      nat: "HK",
      lang: "en",
      prior: [112000, 3],
    },
    {
      fullName: "Somkiat Prasertkul",
      email: "somkiat.p@example.com",
      phoneE164: "+66861234567",
      lineUserId: "Usomkiat_p",
      nat: "TH",
      lang: "th",
      prior: [195000, 5],
    },
    {
      fullName: "Charlotte Dubois",
      email: "charlotte.d@example.com",
      phoneE164: "+33612345678",
      nat: "FR",
      lang: "en",
      prior: [76000, 2],
    },
    {
      fullName: "Liam O'Connor",
      email: "liam.oc@example.com",
      phoneE164: "+353871234567",
      nat: "IE",
      lang: "en",
      prior: [28000, 1],
    },
    {
      fullName: "Elena Rossi",
      email: "elena.rossi@example.com",
      phoneE164: "+393331234567",
      nat: "IT",
      lang: "en",
      prior: [88000, 3],
    },
    {
      fullName: "David Kim",
      email: "david.kim@example.com",
      phoneE164: "+821012345678",
      nat: "KR",
      lang: "en",
      prior: [124000, 4],
    },
    {
      fullName: "Fatima Al-Mansoor",
      email: "fatima.m@example.com",
      phoneE164: "+971501234567",
      nat: "AE",
      lang: "en",
      prior: [240000, 5],
    },
    {
      fullName: "Jessica Taylor",
      email: "jessica.t@example.com",
      phoneE164: "+14155552671",
      nat: "US",
      lang: "en",
      prior: [42000, 1],
    },
    {
      fullName: "Kenji Sato",
      email: "kenji.sato@example.com",
      phoneE164: "+818012345678",
      lineUserId: "Ukenji_s",
      nat: "JP",
      lang: "en",
      prior: [95000, 3],
    },
    {
      fullName: "Apinya Suksom",
      email: "apinya.s@example.com",
      phoneE164: "+66823456789",
      lineUserId: "Uapinya_s",
      nat: "TH",
      lang: "th",
      prior: [38000, 1],
    },
    {
      fullName: "Thomas Müller",
      email: "thomas.m@example.com",
      phoneE164: "+491601234567",
      nat: "DE",
      lang: "en",
      prior: [82000, 2],
    },
    {
      fullName: "Hannah Van Der Berg",
      email: "hannah.v@example.com",
      phoneE164: "+31612345678",
      nat: "NL",
      lang: "en",
      prior: [49000, 2],
    },
    {
      fullName: "Carlos Mendoza",
      email: "carlos.m@example.com",
      phoneE164: "+34612345678",
      nat: "ES",
      lang: "en",
      prior: [58000, 2],
    },
    {
      fullName: "Zackary Evans",
      email: "zack.e@example.com",
      phoneE164: "+12125553891",
      nat: "US",
      lang: "en",
      prior: [168000, 4],
    },
    {
      fullName: "Nadia Patel",
      email: "nadia.p@example.com",
      phoneE164: "+447912345678",
      nat: "GB",
      lang: "en",
      prior: [67000, 2],
    },
    {
      fullName: "Kornkanok Boonsri",
      email: "kornkanok.b@example.com",
      phoneE164: "+66874561230",
      lineUserId: "Ukornkanok",
      nat: "TH",
      lang: "th",
      prior: [115000, 3],
    },
    {
      fullName: "Lars Hauge",
      email: "lars.hauge@example.com",
      phoneE164: "+4791234567",
      nat: "NO",
      lang: "en",
      prior: [72000, 2],
    },
    {
      fullName: "Chloe Martin",
      email: "chloe.m@example.com",
      phoneE164: "+33687654321",
      nat: "FR",
      lang: "en",
      prior: [51000, 2],
    },
    {
      fullName: "Daniel Cohen",
      email: "daniel.c@example.com",
      phoneE164: "+972501234567",
      nat: "IL",
      lang: "en",
      prior: [89000, 3],
    },
    {
      fullName: "Somsak Rattanakul",
      email: "somsak.r@example.com",
      phoneE164: "+66841234567",
      lineUserId: "Usomsak_r",
      nat: "TH",
      lang: "th",
      prior: [175000, 5],
    },
    {
      fullName: "Oliver Bennett",
      email: "oliver.b@example.com",
      phoneE164: "+61491234567",
      nat: "AU",
      lang: "en",
      prior: [46000, 1],
    },
    {
      fullName: "Mia Lindstrom",
      email: "mia.l@example.com",
      phoneE164: "+46731234567",
      nat: "SE",
      lang: "en",
      prior: [78000, 2],
    },
    {
      fullName: "Youssef El-Masri",
      email: "youssef.m@example.com",
      phoneE164: "+201012345678",
      nat: "EG",
      lang: "en",
      prior: [92000, 3],
    },
    {
      fullName: "Stephanie Wong",
      email: "stephanie.w@example.com",
      phoneE164: "+6598765432",
      nat: "SG",
      lang: "en",
      prior: [138000, 4],
    },
  ];

  const guests: HydratedDocument<User>[] = [];
  for (const g of guestDefs) {
    const userDoc = (await M.user.create({
      role: UserRole.GUEST,
      displayName: g.fullName,
      email: g.email,
      phoneE164: g.phoneE164,
      lineUserId: g.lineUserId,
      whatsappOptIn: !g.lineUserId,
      preferredLanguage: g.lang,
      nationalityCode: g.nat,
      stats: {
        lifetimeSpendThb: g.prior[0],
        stayCount: g.prior[1],
        orderCount: g.prior[1],
      },
      vipScore: computeVipScore({
        lifetimeSpendThb: g.prior[0],
        stayCount: g.prior[1],
      }),
      isActive: true,
      isEmailVerified: true,
    })) as HydratedDocument<User>;
    guests.push(userDoc);
  }

  /* ---- 4. Rooms (40 Physical Keys) */
  const ROOM_TYPES = [
    {
      code: RoomTypeCode.STANDARD_KING,
      count: 24,
      cap: 2,
      rate: 2200,
      amenities: ["KING_BED", "RIVER_VIEW_PARTIAL", "WIFI"],
      coverImage:
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1000",
      images: [
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200",
        "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200",
        "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200",
      ],
    },
    {
      code: RoomTypeCode.DELUXE_BALCONY,
      count: 12,
      cap: 3,
      rate: 3800,
      amenities: ["KING_BED", "SOFA_BED", "PRIVATE_BALCONY", "BATHTUB", "WIFI"],
      coverImage:
        "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1000",
      images: [
        "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1200",
        "https://images.unsplash.com/photo-1591088398332-8a7791972843?w=1200",
        "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200",
      ],
    },
    {
      code: RoomTypeCode.POOL_VILLA,
      count: 4,
      cap: 4,
      rate: 7500,
      amenities: [
        "KING_BED",
        "TWIN_LOFT",
        "PRIVATE_POOL",
        "KITCHENETTE",
        "WIFI",
      ],
      coverImage:
        "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1000",
      images: [
        "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200",
        "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200",
      ],
    },
  ];

  const numbersFor = (t: RoomTypeCode): string[] =>
    t === RoomTypeCode.STANDARD_KING
      ? Array.from({ length: 12 }, (_, i) => `${101 + i}`).concat(
          Array.from({ length: 12 }, (_, i) => `${201 + i}`),
        )
      : t === RoomTypeCode.DELUXE_BALCONY
        ? Array.from({ length: 12 }, (_, i) => `${301 + i}`)
        : ["PV1", "PV2", "PV3", "PV4"];

  const rooms: Record<string, HydratedDocument<Room>> = {};
  for (const t of ROOM_TYPES) {
    for (const n of numbersFor(t.code)) {
      const floor = n.startsWith("PV") ? 0 : Number(n[0]);
      rooms[n] = (await M.room.create({
        branchId: BRANCH,
        roomNumber: n,
        floor,
        roomType: t.code,
        maxOccupancy: t.cap,
        baseRateThb: t.rate,
        amenities: t.amenities,
        coverImage: t.coverImage,
        images: t.images,
        cleaningStatus: CleaningStatus.INSPECTED,
      })) as HydratedDocument<Room>;
    }
  }

  const typeCount = Object.fromEntries(
    ROOM_TYPES.map((t) => [t.code, t.count]),
  ) as Record<RoomTypeCode, number>;

  /* ---- 5. Restaurants */
  const riverside = await M.restaurant.create({
    branchId: BRANCH,
    code: "RIVERSIDE-CAFE",
    name: "Riverside Cafe",
    cuisine: "Thai & international",
    coverImage:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1000",
    images: [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200",
      "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=1200",
    ],
    maxSeats: 48,
    avgTurnMinutes: 75,
    tables: Array.from({ length: 12 }, (_, i) => ({
      tableCode: `R${String(i + 1).padStart(2, "0")}`,
      seats: 4,
      zone: i < 6 ? "RIVER_TERRACE" : "INDOOR",
    })),
    shifts: [
      {
        code: "BREAKFAST",
        label: "Breakfast",
        startTime: "06:30",
        endTime: "10:30",
        slotLengthMin: 30,
      },
      {
        code: "ALL_DAY",
        label: "All-day dining",
        startTime: "11:00",
        endTime: "21:30",
        slotLengthMin: 60,
      },
    ],
  });

  const sunset = await M.restaurant.create({
    branchId: BRANCH,
    code: "SUNSET-DECK-BAR",
    name: "Sunset Deck Bar",
    cuisine: "Cocktails & small plates",
    coverImage:
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1000",
    images: [
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200",
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1200",
    ],
    maxSeats: 24,
    avgTurnMinutes: 90,
    tables: Array.from({ length: 8 }, (_, i) => ({
      tableCode: `H${String(i + 1).padStart(2, "0")}`,
      seats: 3,
      isHighTop: true,
      zone: "ROOFTOP",
    })),
    shifts: [
      {
        code: "EVENING",
        label: "Evening",
        startTime: "17:00",
        endTime: "23:00",
        slotLengthMin: 60,
      },
    ],
  });

  /* ---- 6. Services */
  const svcTransfer = await M.service.create({
    branchId: BRANCH,
    code: "SVC-BKK-TRANSFER",
    category: ServiceCategory.TRANSPORT,
    kind: ServiceKind.AIRPORT_TRANSFER,
    name: "Airport Transfer, Suvarnabhumi (BKK)",
    coverImage:
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1000",
    images: [
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1200",
    ],
    basePriceThb: 1200,
    pricingModel: PricingModel.PER_VEHICLE,
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
          defaultDriverId: staff.somchai._id,
        },
        {
          plate: "1ขข 5678",
          type: "MINIVAN",
          capacityPax: 8,
          defaultDriverId: staff.prasit._id,
        },
      ],
    },
  });

  const svcCruise = await M.service.create({
    branchId: BRANCH,
    code: "SVC-CRUISE-SUNSET",
    category: ServiceCategory.TOURS,
    kind: ServiceKind.SCHEDULED_TOUR,
    name: "Chao Phraya Sunset Cruise",
    coverImage:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000",
    images: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200",
    ],
    basePriceThb: 1800,
    pricingModel: PricingModel.PER_PAX,
    tour: {
      capacity: 18,
      minViablePax: 6,
      fixedCostThb: 4500,
      departureTimes: ["16:30"],
      durationMin: 120,
      meetingPoint: "Hotel pier",
    },
  });

  const svcSpa = await M.service.create({
    branchId: BRANCH,
    code: "SVC-SPA-HERBAL",
    category: ServiceCategory.WELLNESS,
    kind: ServiceKind.SPA_TREATMENT,
    name: "Thai Herbal Massage (60 min)",
    coverImage:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1000",
    images: [
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200",
    ],
    basePriceThb: 1100,
    pricingModel: PricingModel.PER_TREATMENT,
    wellness: {
      treatmentRooms: 3,
      therapists: 2,
      durationMin: 60,
      turnoverMin: 15,
      startTimes: ["10:00", "12:00", "14:00", "15:00", "16:00", "18:00"],
    },
  });

  const svcAyut = await M.service.create({
    branchId: BRANCH,
    code: "SVC-AYUTTHAYA-DAY",
    category: ServiceCategory.TOURS,
    kind: ServiceKind.SCHEDULED_TOUR,
    name: "Ayutthaya Temples Day Tour",
    coverImage:
      "https://images.unsplash.com/photo-1528181304800-259b08848526?w=1000",
    images: [
      "https://images.unsplash.com/photo-1528181304800-259b08848526?w=1200",
    ],
    basePriceThb: 2400,
    pricingModel: PricingModel.PER_PAX,
    tour: {
      capacity: 12,
      minViablePax: 4,
      fixedCostThb: 6800,
      departureTimes: ["08:00"],
      durationMin: 540,
      meetingPoint: "Hotel lobby",
    },
  });

  const vehicles = svcTransfer.transfer!.vehicles;
  let vanCursor = 0;

  /* ---- 7. Line Builders */
  type Mode = "booked" | "held";
  const live = (status: LineStatus) => status !== LineStatus.CANCELLED;

  function stayLine(o: {
    type: RoomTypeCode;
    checkIn: string;
    checkOut: string;
    adults: number;
    room?: string;
    mode: Mode;
    status: LineStatus;
  }): Partial<OrderLine> {
    const nights = Math.max(
      1,
      Math.round(
        (Date.parse(o.checkOut) - Date.parse(o.checkIn)) / (24 * 3600 * 1000),
      ),
    );
    const refs: Array<{ slotKey: string; qty: number }> = [];
    if (live(o.status)) {
      for (const night of eachNight(o.checkIn, o.checkOut)) {
        refs.push(
          reserve({
            kind: SlotKind.ROOM_NIGHT,
            resourceKey: o.type,
            startsAt: zonedAt(night, "00:00"),
            capacity: typeCount[o.type],
            qty: 1,
            mode: o.mode,
          }),
        );
      }
    }
    const rate = ROOM_TYPES.find((t) => t.code === o.type)!.rate;
    const room = o.room ? rooms[o.room] : undefined;
    return {
      kind: LineKind.STAY,
      status: o.status,
      title: `${o.type.replace("_", " ")} x ${nights}n`,
      quantity: 1,
      unitPriceThb: rate * nights,
      startsAt: zonedAt(o.checkIn, "14:00"),
      endsAt: zonedAt(o.checkOut, "12:00"),
      businessDate: o.checkIn,
      slotRefs: refs,
      stay: {
        roomType: o.type,
        checkInDate: o.checkIn,
        checkOutDate: o.checkOut,
        nights,
        adults: o.adults,
        children: 0,
        nightlyRates: eachNight(o.checkIn, o.checkOut).map((date) => ({
          date,
          rateThb: rate,
        })),
        ...(room && {
          assignedRoomId: room._id,
          assignedRoomNumber: room.roomNumber,
        }),
      },
    } as Partial<OrderLine>;
  }

  function transferLine(o: {
    date: string;
    time: string;
    flight: string;
    dir: "ARRIVAL" | "DEPARTURE";
    pickup?: string;
    mode: Mode;
    status: LineStatus;
    pax: number;
  }): Partial<OrderLine> {
    const flightAt = zonedAt(o.date, o.time);
    const startsAt = o.pickup ? zonedAt(o.date, o.pickup) : flightAt;
    const van = vehicles[vanCursor++ % vehicles.length];
    const hourStart = new Date(
      Math.floor(startsAt.getTime() / 3_600_000) * 3_600_000,
    );
    const refs = live(o.status)
      ? [
          reserve({
            kind: SlotKind.SERVICE,
            resourceKey: String(svcTransfer._id),
            resourceId: svcTransfer._id,
            startsAt: hourStart,
            endsAt: new Date(hourStart.getTime() + 3_600_000),
            capacity: vehicles.length,
            qty: 1,
            mode: o.mode,
          }),
        ]
      : [];
    return {
      kind: LineKind.SERVICE,
      status: o.status,
      title: `${o.dir === "ARRIVAL" ? "Airport pickup" : "Airport drop-off"} ${o.flight}`,
      quantity: 1,
      unitPriceThb: svcTransfer.basePriceThb,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      businessDate: toBusinessDate(startsAt),
      slotRefs: refs,
      service: {
        serviceId: svcTransfer._id,
        serviceName: svcTransfer.name,
        serviceKind: ServiceKind.AIRPORT_TRANSFER,
        pax: o.pax,
        vehiclePlate: van.plate,
        driverUserId: van.defaultDriverId,
        flight: {
          number: o.flight,
          direction: o.dir,
          scheduledAt: flightAt,
          estimatedAt: flightAt,
          terminal: "T1",
          meetingDoor: o.dir === "ARRIVAL" ? 4 : undefined,
        },
      },
    } as Partial<OrderLine>;
  }

  function tourLine(
    svc: typeof svcCruise,
    o: { date: string; pax: number; mode: Mode; status: LineStatus },
  ): Partial<OrderLine> {
    const t = svc.tour!;
    const startsAt = zonedAt(o.date, t.departureTimes[0]);
    const endsAt = new Date(startsAt.getTime() + t.durationMin * 60_000);
    const refs = live(o.status)
      ? [
          reserve({
            kind: SlotKind.SERVICE,
            resourceKey: String(svc._id),
            resourceId: svc._id,
            startsAt,
            endsAt,
            capacity: t.capacity,
            qty: o.pax,
            mode: o.mode,
            minViablePax: t.minViablePax,
            fixedCostThb: t.fixedCostThb,
          }),
        ]
      : [];
    return {
      kind: LineKind.SERVICE,
      status: o.status,
      title: svc.name,
      quantity: o.pax,
      unitPriceThb: svc.basePriceThb,
      startsAt,
      endsAt,
      businessDate: toBusinessDate(startsAt),
      slotRefs: refs,
      service: {
        serviceId: svc._id,
        serviceName: svc.name,
        serviceKind: ServiceKind.SCHEDULED_TOUR,
        pax: o.pax,
      },
    } as Partial<OrderLine>;
  }

  function spaLine(o: {
    date: string;
    time: string;
    treatments: number;
    mode: Mode;
    status: LineStatus;
  }): Partial<OrderLine> {
    const w = svcSpa.wellness!;
    const startsAt = zonedAt(o.date, o.time);
    const refs = live(o.status)
      ? [
          reserve({
            kind: SlotKind.SERVICE,
            resourceKey: String(svcSpa._id),
            resourceId: svcSpa._id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + w.durationMin * 60_000),
            capacity: Math.min(w.treatmentRooms, w.therapists),
            qty: o.treatments,
            mode: o.mode,
          }),
        ]
      : [];
    return {
      kind: LineKind.SERVICE,
      status: o.status,
      title: svcSpa.name,
      quantity: o.treatments,
      unitPriceThb: svcSpa.basePriceThb,
      startsAt,
      endsAt: new Date(startsAt.getTime() + w.durationMin * 60_000),
      businessDate: toBusinessDate(startsAt),
      slotRefs: refs,
      service: {
        serviceId: svcSpa._id,
        serviceName: svcSpa.name,
        serviceKind: ServiceKind.SPA_TREATMENT,
        pax: o.treatments,
      },
    } as Partial<OrderLine>;
  }

  function diningLine(
    r: typeof riverside,
    shiftCode: string,
    o: {
      date: string;
      time: string;
      party: number;
      mode: Mode;
      status: LineStatus;
    },
  ): Partial<OrderLine> {
    const startsAt = zonedAt(o.date, o.time);
    const refs = live(o.status)
      ? [
          reserve({
            kind: SlotKind.DINING,
            resourceKey: String(r._id),
            resourceId: r._id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + r.avgTurnMinutes * 60_000),
            capacity: r.totalSeats,
            qty: o.party,
            mode: o.mode,
          }),
        ]
      : [];
    return {
      kind: LineKind.DINING,
      status: o.status,
      title: `${r.name} table for ${o.party}`,
      quantity: 1,
      unitPriceThb: 0,
      startsAt,
      endsAt: new Date(startsAt.getTime() + r.avgTurnMinutes * 60_000),
      businessDate: toBusinessDate(startsAt),
      slotRefs: refs,
      dining: {
        restaurantId: r._id,
        restaurantName: r.name,
        shiftCode,
        partySize: o.party,
      },
    } as Partial<OrderLine>;
  }

  /* ---- 8. Order Specifications Generation */
  interface OrderSeedSpec {
    orderNumber?: string;
    guestIdx: number;
    status: OrderStatus;
    attr: Record<string, string | undefined>;
    items: Partial<OrderLine>[];
    pending?: boolean;
    createdAt?: Date;
  }

  const orderSpecs: OrderSeedSpec[] = [];

  // 9 Direct Attribution Channel Archetypes
  const CHANNELS = [
    {
      utmSource: "line",
      utmMedium: "crm",
      utmCampaign: "vip_winback_oct",
      channel: "LINE",
    },
    {
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "brand_riverside_bkk",
      referrer: "https://www.google.com/",
      landingPath: "/book",
    },
    {
      utmSource: "instagram",
      utmMedium: "paid_social",
      utmCampaign: "reel_pool_deluxe",
      referrer: "https://l.instagram.com/",
    },
    {
      utmSource: "whatsapp",
      utmMedium: "chat",
      utmCampaign: "concierge_upsell",
      channel: "WHATSAPP",
    },
    {
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "autumn_escape_promo",
      referrer: "https://m.facebook.com/",
    },
    {
      utmSource: "email",
      utmMedium: "newsletter",
      utmCampaign: "loyalty_oct_member",
    },
    {
      utmSource: "tiktok",
      utmMedium: "creator",
      utmCampaign: "bkk_staycation_creator",
      referrer: "https://www.tiktok.com/",
    },
    {
      utmSource: "blogger",
      utmMedium: "referral",
      utmCampaign: "riverside_review",
      referrer: "https://blog.example-travel.com/bangkok-riverside",
    },
    { referrer: "https://www.google.com/", landingPath: "/" }, // (direct)
  ];

  const FLIGHT_POOL = [
    { num: "EK 372", time: "13:20", dir: "ARRIVAL" as const },
    { num: "SQ 976", time: "09:40", dir: "ARRIVAL" as const },
    { num: "QR 836", time: "07:55", dir: "ARRIVAL" as const },
    { num: "TG 623", time: "18:10", dir: "ARRIVAL" as const },
    { num: "JL 031", time: "11:05", dir: "ARRIVAL" as const },
    { num: "LH 772", time: "15:00", dir: "ARRIVAL" as const },
    { num: "NH 847", time: "14:30", dir: "ARRIVAL" as const },
    { num: "BA 009", time: "16:15", dir: "ARRIVAL" as const },
    { num: "AF 166", time: "06:45", dir: "ARRIVAL" as const },
  ];

  /* ---- A. Historical October Stays (Oct 1 to Oct 30) across all 40 rooms */
  console.log("Generating full month historical simulation for October 2026...");
  let orderSeq = 0;
  const allRoomNumbers = Object.keys(rooms);

  // We assign stays for every room across October, staggering check-in dates
  for (let rIdx = 0; rIdx < allRoomNumbers.length; rIdx++) {
    const roomNumber = allRoomNumbers[rIdx];
    const room = rooms[roomNumber];
    const roomType = room.roomType;

    // Stagger dates: room offset of 0, 1, or 2 days gives ~75-80% occupancy without overlap
    const offset = rIdx % 3;
    let currDay = 1 + offset;

    const demoRooms = new Set(["305", "105", "PV2", "PV1", "108", "205", "201"]);
    while (currDay <= 31) {
      const stayNights = currDay % 2 === 0 ? 3 : 2;
      const checkInDay = currDay;
      let checkOutDay = currDay + stayNights;
      if (demoRooms.has(roomNumber) && checkOutDay > 31) {
        checkOutDay = 31;
      }
      if (checkOutDay <= checkInDay) {
        currDay += stayNights + 1;
        continue;
      }
      const checkInDate = `2026-10-${String(checkInDay).padStart(2, "0")}`;
      const checkOutDate =
        checkOutDay <= 31
          ? `2026-10-${String(checkOutDay).padStart(2, "0")}`
          : `2026-11-${String(checkOutDay - 31).padStart(2, "0")}`;

      const isCompleted = checkOutDay <= 27; // Checked out before today
      const status = isCompleted ? OrderStatus.COMPLETED : OrderStatus.CONFIRMED;
      const lineStatus = isCompleted
        ? LineStatus.COMPLETED
        : LineStatus.CONFIRMED;
      const guestIdx = (orderSeq + rIdx) % guests.length;
      const attr = CHANNELS[orderSeq % CHANNELS.length];
      const items: Partial<OrderLine>[] = [];

      // 1. Stay Line
      items.push(
        stayLine({
          type: roomType,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          adults: room.maxOccupancy > 2 ? 3 : 2,
          room: roomNumber,
          mode: "booked",
          status: lineStatus,
        }),
      );

      // 2. Extra service attached realistically (every ~2nd stay)
      if (orderSeq % 2 === 0) {
        const flight = FLIGHT_POOL[orderSeq % FLIGHT_POOL.length];
        items.push(
          transferLine({
            date: checkInDate,
            time: flight.time,
            flight: flight.num,
            dir: flight.dir,
            mode: "booked",
            status: lineStatus,
            pax: 2,
          }),
        );
      }

      if (orderSeq % 3 === 0) {
        items.push(
          tourLine(svcCruise, {
            date: addDays(checkInDate, 1),
            pax: 2,
            mode: "booked",
            status: lineStatus,
          }),
        );
      } else if (orderSeq % 5 === 0) {
        items.push(
          tourLine(svcAyut, {
            date: addDays(checkInDate, 1),
            pax: 2,
            mode: "booked",
            status: lineStatus,
          }),
        );
      } else if (orderSeq % 4 === 0) {
        items.push(
          spaLine({
            date: checkInDate,
            time: "15:00",
            treatments: 2,
            mode: "booked",
            status: lineStatus,
          }),
        );
      }

      if (orderSeq % 3 === 1) {
        items.push(
          diningLine(riverside, "BREAKFAST", {
            date: addDays(checkInDate, 1),
            time: "08:30",
            party: 2,
            mode: "booked",
            status: lineStatus,
          }),
        );
      }

      orderSpecs.push({
        guestIdx,
        status,
        attr,
        items,
        createdAt: new Date(`${checkInDate}T08:00:00Z`),
      });

      orderSeq++;
      currDay += stayNights + (rIdx % 2 === 0 ? 1 : 0); // small gap keeps realistic ~75% occupancy
    }
  }

  /* ---- B. Key Conversational AI Demo Orders for November 1 (Demo Day) */
  console.log("Configuring verified Demo Day (Nov 1) Conversational AI orders...");

  // 1. Hiroshi Tanaka (Room 305, EK 372 pickup, Sunset Cruise)
  orderSpecs.push({
    orderNumber: "TS-261025-F4FC7",
    guestIdx: 1, // Hiroshi Tanaka
    status: OrderStatus.CONFIRMED,
    attr: {
      utmSource: "instagram",
      utmMedium: "paid_social",
      utmCampaign: "reel_pool_deluxe",
      referrer: "https://l.instagram.com/",
    },
    items: [
      stayLine({
        type: RoomTypeCode.DELUXE_BALCONY,
        checkIn: DEMO_DATE,
        checkOut: "2026-11-03",
        adults: 3,
        room: "305",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      transferLine({
        date: DEMO_DATE,
        time: "13:20",
        flight: "EK 372",
        dir: "ARRIVAL",
        mode: "booked",
        status: LineStatus.CONFIRMED,
        pax: 3,
      }),
      tourLine(svcCruise, {
        date: DEMO_DATE,
        pax: 3,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-25T10:00:00Z"),
  });

  // 2. Eleanor Whitfield (Room 105, SQ 976 pickup, Sunset Cruise)
  orderSpecs.push({
    orderNumber: "TS-261025-A2989",
    guestIdx: 0, // Eleanor Whitfield
    status: OrderStatus.CONFIRMED,
    attr: {
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "brand_riverside_bkk",
      referrer: "https://www.google.com/",
      landingPath: "/book",
    },
    items: [
      stayLine({
        type: RoomTypeCode.STANDARD_KING,
        checkIn: DEMO_DATE,
        checkOut: "2026-11-04",
        adults: 2,
        room: "105",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      transferLine({
        date: DEMO_DATE,
        time: "09:40",
        flight: "SQ 976",
        dir: "ARRIVAL",
        mode: "booked",
        status: LineStatus.CONFIRMED,
        pax: 2,
      }),
      tourLine(svcCruise, {
        date: DEMO_DATE,
        pax: 2,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      diningLine(riverside, "BREAKFAST", {
        date: "2026-11-02",
        time: "08:00",
        party: 2,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-25T11:00:00Z"),
  });

  // 3. Marcus Lindqvist (Room PV2, QR 836 pickup, Thai Herbal Massage)
  orderSpecs.push({
    orderNumber: "TS-261025-73A3F",
    guestIdx: 2, // Marcus Lindqvist
    status: OrderStatus.CONFIRMED,
    attr: {
      utmSource: "line",
      utmMedium: "crm",
      utmCampaign: "vip_winback_oct",
      channel: "LINE",
    },
    items: [
      stayLine({
        type: RoomTypeCode.POOL_VILLA,
        checkIn: DEMO_DATE,
        checkOut: "2026-11-05",
        adults: 4,
        room: "PV2",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      transferLine({
        date: DEMO_DATE,
        time: "07:55",
        flight: "QR 836",
        dir: "ARRIVAL",
        mode: "booked",
        status: LineStatus.CONFIRMED,
        pax: 4,
      }),
      spaLine({
        date: DEMO_DATE,
        time: "15:00",
        treatments: 1,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-25T12:00:00Z"),
  });

  // 4. Priya Raman (Room 110, In-house staying through Nov 3, Ayutthaya tour on Nov 1)
  orderSpecs.push({
    orderNumber: "TS-261025-8AE4C",
    guestIdx: 3, // Priya Raman
    status: OrderStatus.CONFIRMED,
    attr: {
      utmSource: "whatsapp",
      utmMedium: "chat",
      utmCampaign: "concierge_upsell",
      channel: "WHATSAPP",
    },
    items: [
      stayLine({
        type: RoomTypeCode.STANDARD_KING,
        checkIn: "2026-10-31",
        checkOut: "2026-11-03",
        adults: 2,
        room: "110",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      tourLine(svcAyut, {
        date: DEMO_DATE,
        pax: 2,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      diningLine(sunset, "EVENING", {
        date: DEMO_DATE,
        time: "19:00",
        party: 2,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-25T14:00:00Z"),
  });

  // 5. Additional Demo Day check-ins for operational flow (Rooms 108, 201, 205)
  orderSpecs.push({
    guestIdx: 4, // Siriporn Chaiyasit
    status: OrderStatus.CONFIRMED,
    attr: { referrer: "https://www.google.com/", landingPath: "/" },
    items: [
      stayLine({
        type: RoomTypeCode.STANDARD_KING,
        checkIn: DEMO_DATE,
        checkOut: "2026-11-03",
        adults: 2,
        room: "108",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
      tourLine(svcAyut, {
        date: DEMO_DATE,
        pax: 2,
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-26T09:00:00Z"),
  });

  orderSpecs.push({
    guestIdx: 8, // Narin Thongchai
    status: OrderStatus.CONFIRMED,
    attr: { utmSource: "line", utmMedium: "crm", channel: "LINE" },
    items: [
      stayLine({
        type: RoomTypeCode.STANDARD_KING,
        checkIn: DEMO_DATE,
        checkOut: "2026-11-03",
        adults: 2,
        room: "205",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-26T10:00:00Z"),
  });

  orderSpecs.push({
    guestIdx: 9, // Jonas Becker
    status: OrderStatus.CONFIRMED,
    attr: { utmSource: "facebook", utmMedium: "paid_social" },
    items: [
      stayLine({
        type: RoomTypeCode.STANDARD_KING,
        checkIn: DEMO_DATE,
        checkOut: "2026-11-04",
        adults: 2,
        room: "201",
        mode: "booked",
        status: LineStatus.CONFIRMED,
      }),
    ],
    createdAt: new Date("2026-10-26T11:00:00Z"),
  });

  // A couple cancelled orders and pending cart holds for complete realism
  orderSpecs.push({
    guestIdx: 5,
    status: OrderStatus.CANCELLED,
    attr: { utmSource: "google", utmMedium: "cpc" },
    items: [
      stayLine({
        type: RoomTypeCode.STANDARD_KING,
        checkIn: "2026-10-15",
        checkOut: "2026-10-18",
        adults: 2,
        mode: "booked",
        status: LineStatus.CANCELLED,
      }),
    ],
    createdAt: new Date("2026-10-10T10:00:00Z"),
  });

  orderSpecs.push({
    guestIdx: 7,
    status: OrderStatus.PENDING,
    pending: true,
    attr: { utmSource: "tiktok", utmMedium: "creator" },
    items: [
      stayLine({
        type: RoomTypeCode.DELUXE_BALCONY,
        checkIn: "2026-11-04",
        checkOut: "2026-11-07",
        adults: 2,
        mode: "held",
        status: LineStatus.PENDING,
      }),
    ],
    createdAt: new Date("2026-10-27T10:00:00Z"),
  });

  /* ---- 9. Batch Insertion of Inventory Slots */
  console.log(`Writing ${slotMap.size} inventory slots to database...`);
  await M.slot.insertMany(Array.from(slotMap.values()), { ordered: false });

  /* ---- 10. Sequential Batch Order Creation (Runs Pre-Validate Hooks) */
  console.log(`Saving ${orderSpecs.length} composite orders across October...`);
  const orders: HydratedDocument<Order>[] = [];
  const BATCH_SIZE = 25;

  let globalOrderIdx = 100;
  for (let i = 0; i < orderSpecs.length; i += BATCH_SIZE) {
    const chunk = orderSpecs.slice(i, i + BATCH_SIZE);
    const createdChunk = await Promise.all(
      chunk.map(async (spec) => {
        const guest = guests[spec.guestIdx];
        let holdId: Types.ObjectId | undefined;

        if (spec.pending) {
          const lines = spec.items
            .flatMap((l) => l.slotRefs ?? [])
            .map((r) => ({ slotKey: r.slotKey, qty: r.qty }));
          const hold = await M.hold.create({
            branchId: BRANCH,
            cartId: `cart_${String(guest._id)}`,
            lines,
            status: HoldStatus.ACTIVE,
            expiresAt: new Date(Date.now() + 15 * 60_000),
          });
          holdId = hold._id;
        }

        const dateStr = (spec.items[0]?.businessDate ?? "2026-10-15").replace(/-/g, "").slice(2);
        const orderNumber = spec.orderNumber ?? `TS-${dateStr}-${String(globalOrderIdx++).padStart(4, "0")}X`;

        const orderDoc = (await M.order.create({
          orderNumber,
          branchId: BRANCH,
          guestId: guest._id,
          status: spec.status,
          items: spec.items,
          holdId,
          guestSnapshot: {
            fullName: guest.displayName,
            email: guest.email ?? undefined,
            phoneE164: guest.phoneE164 ?? undefined,
            lineUserId: guest.lineUserId ?? undefined,
            preferredLanguage: guest.preferredLanguage ?? "en",
          },
          attribution: spec.attr,
          payment: {
            status: spec.status === OrderStatus.PENDING ? "UNPAID" : "PAID",
            method: "CARD",
          },
          totals: {
            serviceChargeRate: branch.settings.serviceChargeRate,
            vatRate: branch.settings.vatRate,
          },
        })) as HydratedDocument<Order>;

        if (holdId) {
          await M.hold.updateOne({ _id: holdId }, { orderId: orderDoc._id });
        }

        return orderDoc;
      }),
    );
    orders.push(...createdChunk);
  }

  /* ---- 11. Accumulate Guest CDP Stats (Spend, Stays, VIP) */
  console.log("Updating guest CDP lifetime statistics & VIP scores...");
  for (const o of orders) {
    if (
      o.status !== OrderStatus.CONFIRMED &&
      o.status !== OrderStatus.COMPLETED
    ) {
      continue;
    }
    const g = guests.find((x) => x._id.equals(o.guestId));
    if (!g) continue;
    g.stats.lifetimeSpendThb += o.totals.grandTotalThb;
    g.stats.orderCount += 1;
    if (o.status === OrderStatus.COMPLETED) {
      g.stats.stayCount += 1;
      g.stats.lastStayAt = o.window?.to ?? new Date();
    }
  }

  for (const g of guests) {
    g.vipScore = computeVipScore({
      lifetimeSpendThb: g.stats.lifetimeSpendThb,
      stayCount: g.stats.stayCount,
    });
    g.markModified("stats");
    await g.save();
  }

  /* ---- 12. Room Cleaning Status for Demo Day & Current Date */
  console.log("Setting clean, inspected baseline with live operational turnover states...");
  // Default: All rooms are fully cleaned & inspected
  for (const r of Object.values(rooms)) {
    r.cleaningStatus = CleaningStatus.INSPECTED;
    await r.save();
  }

  // Live turnarounds for today/demo day arrivals (Matches DEMO.md)
  // Dirty rooms needing priority turnaround before arrivals:
  for (const n of ["105", "305", "PV2", "201", "205", "401"]) {
    if (rooms[n]) {
      rooms[n].cleaningStatus = CleaningStatus.DIRTY;
      await rooms[n].save();
    }
  }
  // In-progress cleanings (Noi actively working on 202; 108, 302, 404 in progress):
  for (const n of ["108", "202", "302", "404"]) {
    if (rooms[n]) {
      rooms[n].cleaningStatus = CleaningStatus.IN_PROGRESS;
      await rooms[n].save();
    }
  }
  // Clean rooms waiting for final manager inspection:
  for (const n of ["110", "208", "308", "PV1"]) {
    if (rooms[n]) {
      rooms[n].cleaningStatus = CleaningStatus.CLEAN;
      await rooms[n].save();
    }
  }

  /* ---- 13. Operational Dispatches (Historical + Today + Demo Day Nov 1) */
  console.log("Generating operational dispatch run-sheets...");
  const driverById = new Map(
    Object.values(staff).map((u) => [String(u._id), u]),
  );
  const svcById = new Map([svcCruise, svcAyut].map((s) => [String(s._id), s]));

  // Helper to generate run-sheet for any specific date
  async function generateDispatchesForDate(
    serviceDate: string,
    isHistorical: boolean,
  ) {
    const dispatchesForDay: Array<Record<string, unknown>> = [];

    for (const o of orders) {
      if (
        o.status !== OrderStatus.CONFIRMED &&
        (!isHistorical || o.status !== OrderStatus.COMPLETED)
      ) {
        continue;
      }
      const g = guests.find((x) => x._id.equals(o.guestId))!;
      const stay = o.items.find(
        (l) => l.kind === LineKind.STAY && l.stay?.checkInDate === serviceDate,
      );
      const inbound = o.items.find(
        (l) =>
          l.service?.flight?.direction === "ARRIVAL" &&
          l.businessDate === serviceDate,
      );

      // Housekeeping Turnaround Task
      if (stay?.stay?.assignedRoomId) {
        const eta =
          inbound?.service?.flight?.estimatedAt ??
          zonedAt(serviceDate, branch.settings.checkInTime);
        const room = Object.values(rooms).find((r) =>
          r._id.equals(stay.stay!.assignedRoomId),
        )!;

        dispatchesForDay.push({
          branchId: BRANCH,
          serviceDate,
          status: isHistorical ? DispatchStatus.DONE : DispatchStatus.OPEN,
          type: DispatchType.HOUSEKEEPING_TURNAROUND,
          dedupeKey: `hk:${room.roomNumber}:${serviceDate}`,
          priorityScore: housekeepingPriority(eta, g.vipScore >= 50),
          severity: g.vipScore >= 50 ? Severity.WARN : Severity.INFO,
          title: `Turn room ${room.roomNumber} before ${hhmm(new Date(eta.getTime() + 3_600_000))}`,
          dueAt: new Date(eta.getTime() + 3_600_000),
          assigneeUserId:
            Number(room.roomNumber.replace(/\D/g, "")) % 2
              ? staff.noi._id
              : staff.dao._id,
          housekeeping: {
            roomId: room._id,
            roomNumber: room.roomNumber,
            orderId: o._id,
            guestName: g.displayName,
            etaAt: eta,
            isVip: g.vipScore >= 50,
            etaSource: inbound ? "TRANSFER_FLIGHT" : "CHECKIN_TIME",
            flightNumber: inbound?.service?.flight?.number,
            targetReadyBy: new Date(eta.getTime() + 3_600_000),
          },
        });
      }

      // Airport Pickup Task
      if (inbound?.service?.flight) {
        const f = inbound.service.flight;
        const driver =
          driverById.get(String(inbound.service.driverUserId)) ?? staff.somchai;
        const card = buildPickupCard({
          hotelName: branch.name,
          guestName: g.displayName,
          flightNumber: f.number,
          etaAt: f.estimatedAt ?? f.scheduledAt,
          meetingDoor: f.meetingDoor ?? 4,
          driverName: driver.displayName,
          driverPhone: driver.phoneE164 ?? "",
          vehiclePlate: inbound.service.vehiclePlate ?? "",
        });

        dispatchesForDay.push({
          branchId: BRANCH,
          serviceDate,
          status: isHistorical ? DispatchStatus.DONE : DispatchStatus.OPEN,
          type: DispatchType.AIRPORT_PICKUP,
          dedupeKey: `pickup:${String(o._id)}:${inbound.lineId}:${serviceDate}`,
          priorityScore: pickupPriority(f.estimatedAt ?? f.scheduledAt),
          severity: Severity.INFO,
          title: `Pickup ${f.number} ${hhmm(f.estimatedAt ?? f.scheduledAt)} (${g.displayName})`,
          dueAt: inbound.startsAt,
          assigneeUserId: driver._id,
          pickup: {
            orderId: o._id,
            lineId: inbound.lineId,
            guestName: g.displayName,
            flightNumber: f.number,
            etaAt: f.estimatedAt ?? f.scheduledAt,
            meetingDoor: f.meetingDoor,
            vehiclePlate: inbound.service.vehiclePlate,
            driverUserId: driver._id,
            channel: g.lineUserId
              ? MessageChannel.LINE
              : MessageChannel.WHATSAPP,
            card,
          },
        });
      }
    }

    // Tour Consolidation Alerts
    const tourSlots = await M.slot.find({
      branchId: BRANCH,
      kind: SlotKind.SERVICE,
      businessDate: serviceDate,
      minViablePax: { $exists: true },
    });

    for (const sl of tourSlots) {
      const svc = svcById.get(sl.resourceKey);
      if (!svc) continue;
      const r = evaluateConsolidation(
        {
          booked: sl.booked,
          capacity: sl.capacity,
          minViablePax: sl.minViablePax!,
          fixedCostThb: sl.fixedCostThb!,
          unitPriceThb: svc.basePriceThb,
        },
        branch.settings.consolidationThreshold,
      );
      if (!r.flag) continue;

      dispatchesForDay.push({
        branchId: BRANCH,
        serviceDate,
        status: isHistorical ? DispatchStatus.DONE : DispatchStatus.OPEN,
        type: DispatchType.TOUR_CONSOLIDATION,
        dedupeKey: `tour:${sl.slotKey}:${serviceDate}`,
        priorityScore: r.priorityScore,
        severity: r.severity as Severity,
        title: `${svc.name} ${hhmm(sl.startsAt)}: ${sl.booked}/${sl.capacity} pax (${Math.round(r.fillRate * 100)}%)`,
        dueAt: new Date(sl.startsAt.getTime() - 4 * 3_600_000),
        consolidation: {
          slotKey: sl.slotKey,
          serviceId: svc._id,
          serviceName: svc.name,
          departsAt: sl.startsAt,
          booked: sl.booked,
          capacity: sl.capacity,
          fillRate: r.fillRate,
          minViablePax: sl.minViablePax,
          fixedCostThb: sl.fixedCostThb,
          revenueThb: r.revenueThb,
          projectedLossThb: r.projectedLossThb,
          recommendation: r.recommendation,
        },
      });
    }

    if (dispatchesForDay.length) {
      const seen = new Set<string>();
      const unique = dispatchesForDay.filter((d) => {
        const k = `${d.branchId}:${d.serviceDate}:${d.type}:${d.dedupeKey}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      await M.dispatch.insertMany(unique, { ordered: false });
    }
  }

  // Oct 1 → yesterday: DONE (hotel has been running)
  {
    let d = "2026-10-01";
    while (d < TODAY) {
      await generateDispatchesForDate(d, true);
      d = addDays(d, 1);
    }
  }

  // Today → Nov 1: OPEN (live / upcoming including demo day)
  {
    let d = TODAY;
    while (d <= DEMO_DATE) {
      await generateDispatchesForDate(d, false);
      d = addDays(d, 1);
    }
  }

  /* ---- 14. Frontline Notifications (Targeted Per Staff Role) */
  const noiUser = staff["noi"];
  const somchaiUser = staff["somchai"];
  const maliUser = staff["mali"];

  if (noiUser) {
    await M.notification.create({
      userId: noiUser._id,
      branchId: BRANCH,
      type: NotificationType.ROOM_DIRTY,
      severity: NotificationSeverity.CRITICAL,
      title: "Priority Room 105 Turnover",
      body: "VIP Guest Eleanor Whitfield transfer SQ 976 ETA 09:40. Turnaround required before 10:40.",
      status: NotificationStatus.SENT,
      channels: ["inbox", "push"],
      data: { roomNumber: "105" },
    });
  }

  if (somchaiUser) {
    await M.notification.create({
      userId: somchaiUser._id,
      branchId: BRANCH,
      type: NotificationType.PICKUP_READY,
      severity: NotificationSeverity.INFO,
      title: "Airport Pickup Assigned: EK 372",
      body: "Hiroshi Tanaka arriving at Gate/Door 4. Driver welcome sign card prepared.",
      status: NotificationStatus.SENT,
      channels: ["inbox", "push"],
      data: { flightNumber: "EK 372", door: "4" },
    });
  }

  if (maliUser) {
    await M.notification.create({
      userId: maliUser._id,
      branchId: BRANCH,
      type: NotificationType.CRITICAL_ALERT,
      severity: NotificationSeverity.WARN,
      title: "Tour Yield Under Capacity Alert",
      body: "Chao Phraya Sunset Cruise has 5/18 booked (28%). Operational decision required.",
      status: NotificationStatus.SENT,
      channels: ["inbox", "push"],
      data: { tour: "Chao Phraya Sunset Cruise", fillRate: 0.28 },
    });
  }

  /* ---- 15. Verification Output */
  const counts = {
    branches: await M.branch.countDocuments(),
    users: await M.user.countDocuments(),
    rooms: await M.room.countDocuments(),
    restaurants: await M.restaurant.countDocuments(),
    services: await M.service.countDocuments(),
    slots: await M.slot.countDocuments(),
    orders: await M.order.countDocuments(),
    dispatches: await M.dispatch.countDocuments(),
  };
  console.log("\n--- Domain Seed Count Table ---");
  console.table(counts);

  const demoBoard = await M.dispatch
    .find({ branchId: BRANCH, serviceDate: DEMO_DATE, status: DispatchStatus.OPEN })
    .sort({ priorityScore: -1 })
    .select("type priorityScore severity title")
    .lean();
  console.log(`\n--- Operational Dispatch Board: Demo Day (${DEMO_DATE}) ---`);
  console.table(
    demoBoard.map((b) => ({
      type: b.type,
      score: b.priorityScore,
      sev: b.severity,
      title: b.title,
    })),
  );

  const roll = await M.order.aggregate<{
    _id: string;
    orders: number;
    revenueThb: number;
  }>([
    {
      $match: {
        branchId: BRANCH,
        status: { $in: ["CONFIRMED", "COMPLETED"] },
      },
    },
    {
      $group: {
        _id: { $ifNull: ["$attribution.utmSource", "(direct)"] },
        orders: { $sum: 1 },
        revenueThb: { $sum: "$totals.grandTotalThb" },
      },
    },
    { $sort: { revenueThb: -1 } },
  ]);
  console.log("\n--- Full Month Direct-Booking Revenue by Source ---");
  console.table(
    roll.map((r) => ({
      source: r._id,
      orders: r.orders,
      revenueThb: r.revenueThb,
    })),
  );

  const totalRev = roll.reduce((sum, r) => sum + r.revenueThb, 0);
  console.log(`\nTotal October Simulated Revenue: ฿${totalRev.toLocaleString()} THB`);

  await mongoose.disconnect();
  console.log("Seed completed successfully.");
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
