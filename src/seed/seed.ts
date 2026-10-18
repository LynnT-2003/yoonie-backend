/**
 * Usage:
 *   MONGO_URI="mongodb://localhost:27017/yoonie?replicaSet=rs0" npm run seed
 *
 * Populates data across all individual domain modules:
 *   - BranchModule: BKK-RIVERSIDE
 *   - UserModule: 7 staff + 10 master CDP guest profiles
 *   - RoomModule: 40 physical units
 *   - RestaurantModule: Riverside Cafe + Sunset Deck Bar
 *   - ServiceModule: 4 services (Airport Transfer, Sunset Cruise, Spa, Ayutthaya Tour)
 *   - InventoryModule: Slots & soft holds
 *   - OrderModule: 10 composite orders
 *   - DispatchModule: Today's 05:30 operational run-sheet
 */
import "reflect-metadata";
import { config as loadEnv } from "dotenv";
loadEnv();
import mongoose, { HydratedDocument, Types } from "mongoose";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";
import * as bcrypt from "bcrypt";
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
import { User, UserSchema } from "../user/entity/user.entity";
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
};

const DAY0 = toBusinessDate(new Date());
const d = (n: number) => addDays(DAY0, n);
let BRANCH!: Types.ObjectId;

/* ------------------------------------------------------------------ inventory helper */
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

async function reserve(
  p: ReserveParams,
): Promise<{ slotKey: string; qty: number }> {
  const slotKey = buildSlotKey(BRANCH, p.kind, p.resourceKey, p.startsAt);
  const onInsert = {
    branchId: BRANCH,
    kind: p.kind,
    resourceKey: p.resourceKey,
    businessDate: toBusinessDate(p.startsAt),
    startsAt: p.startsAt,
    capacity: p.capacity,
    status: SlotStatus.OPEN,
    ...(p.resourceId && { resourceId: p.resourceId }),
    ...(p.endsAt && { endsAt: p.endsAt }),
    ...(p.minViablePax && { minViablePax: p.minViablePax }),
    ...(p.fixedCostThb !== undefined && { fixedCostThb: p.fixedCostThb }),
  };
  const doc = await M.slot.findOneAndUpdate(
    { slotKey },
    {
      $setOnInsert: onInsert,
      $inc: {
        booked: p.mode === "booked" ? p.qty : 0,
        held: p.mode === "held" ? p.qty : 0,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (doc.booked + doc.held > doc.capacity) {
    throw new Error(`Seed overbooked ${slotKey}`);
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

  /* ---- Branch */
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
    settings: { holdTtlMinutes: 15, consolidationThreshold: 0.4 },
  });
  BRANCH = branch._id;

  /* ---- Staff Users */
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
      displayName: fullName,
      role,
      email: `${handle}@riverside-bkk.example`,
      password: defaultStaffPassword,
      phoneE164,
      jobTitle,
      preferredLanguage: "th",
      branchIds: [BRANCH],
      isPlatformAdmin: role === UserRole.ADMIN,
      permissions,
      mustChangePassword: false,
      isEmailVerified: true,
      isActive: true,
    })) as HydratedDocument<User>;
  }

  /* ---- Guests (Master CDP) */
  const guestDefs = [
    {
      fullName: "Eleanor Whitfield",
      email: "eleanor.whitfield@example.com",
      phoneE164: "+447700900123",
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
      fullName: "Siriporn Chaiyasit",
      phoneE164: "+66812345678",
      lineUserId: "U7b2e5d8a9c1f",
      nat: "TH",
      lang: "th",
      prior: [0, 0],
    },
    {
      fullName: "Priya Raman",
      email: "priya.raman@example.com",
      phoneE164: "+6591234567",
      nat: "SG",
      lang: "en",
      prior: [26000, 1],
    },
    {
      fullName: "Lucas Fernandes",
      email: "lucas.fernandes@example.com",
      phoneE164: "+5511987654321",
      nat: "BR",
      lang: "en",
      prior: [0, 0],
    },
    {
      fullName: "Chen Yu-Ting",
      email: "yuting.chen@example.com",
      phoneE164: "+886912345678",
      lineUserId: "U1d6c3b7e2a90",
      nat: "TW",
      lang: "en",
      prior: [18000, 1],
    },
    {
      fullName: "Amelia Novak",
      email: "amelia.novak@example.com",
      phoneE164: "+61412345678",
      nat: "AU",
      lang: "en",
      prior: [0, 0],
    },
    {
      fullName: "Narin Thongchai",
      phoneE164: "+66891234567",
      lineUserId: "U9e8d7c6b5a41",
      nat: "TH",
      lang: "th",
      prior: [9000, 1],
    },
    {
      fullName: "Jonas Becker",
      email: "jonas.becker@example.com",
      phoneE164: "+4915123456789",
      nat: "DE",
      lang: "en",
      prior: [15000, 1],
    },
  ];
  const guests: HydratedDocument<User>[] = [];
  for (const g of guestDefs) {
    guests.push(
      (await M.user.create({
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
      })) as HydratedDocument<User>,
    );
  }

  /* ---- Rooms (40 physical keys) */
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

  /* ---- Restaurants */
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

  /* ---- Services */
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

  /* ---- Line Builders */
  type Mode = "booked" | "held";
  const live = (status: LineStatus) => status !== LineStatus.CANCELLED;

  async function stayLine(o: {
    type: RoomTypeCode;
    in: number;
    nights: number;
    adults: number;
    room?: string;
    mode: Mode;
    status: LineStatus;
  }): Promise<Partial<OrderLine>> {
    const cin = d(o.in);
    const cout = d(o.in + o.nights);
    const refs: Array<{ slotKey: string; qty: number }> = [];
    if (live(o.status)) {
      for (const night of eachNight(cin, cout)) {
        refs.push(
          await reserve({
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
      title: `${o.type.replace("_", " ")} x ${o.nights}n`,
      quantity: 1,
      unitPriceThb: rate * o.nights,
      startsAt: zonedAt(cin, "14:00"),
      endsAt: zonedAt(cout, "12:00"),
      businessDate: cin,
      slotRefs: refs,
      stay: {
        roomType: o.type,
        checkInDate: cin,
        checkOutDate: cout,
        nights: o.nights,
        adults: o.adults,
        children: 0,
        nightlyRates: eachNight(cin, cout).map((date) => ({
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

  async function transferLine(o: {
    day: number;
    time: string;
    flight: string;
    dir: "ARRIVAL" | "DEPARTURE";
    pickup?: string;
    mode: Mode;
    status: LineStatus;
    pax: number;
  }): Promise<Partial<OrderLine>> {
    const flightAt = zonedAt(d(o.day), o.time);
    const startsAt = o.pickup ? zonedAt(d(o.day), o.pickup) : flightAt;
    const van = vehicles[vanCursor++ % vehicles.length];
    const hourStart = new Date(
      Math.floor(startsAt.getTime() / 3_600_000) * 3_600_000,
    );
    const refs = live(o.status)
      ? [
          await reserve({
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

  async function tourLine(
    svc: typeof svcCruise,
    o: { day: number; pax: number; mode: Mode; status: LineStatus },
  ): Promise<Partial<OrderLine>> {
    const t = svc.tour!;
    const startsAt = zonedAt(d(o.day), t.departureTimes[0]);
    const endsAt = new Date(startsAt.getTime() + t.durationMin * 60_000);
    const refs = live(o.status)
      ? [
          await reserve({
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

  async function spaLine(o: {
    day: number;
    time: string;
    treatments: number;
    mode: Mode;
    status: LineStatus;
  }): Promise<Partial<OrderLine>> {
    const w = svcSpa.wellness!;
    const startsAt = zonedAt(d(o.day), o.time);
    const refs = live(o.status)
      ? [
          await reserve({
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

  async function diningLine(
    r: typeof riverside,
    shiftCode: string,
    o: {
      day: number;
      time: string;
      party: number;
      mode: Mode;
      status: LineStatus;
    },
  ): Promise<Partial<OrderLine>> {
    const startsAt = zonedAt(d(o.day), o.time);
    const refs = live(o.status)
      ? [
          await reserve({
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

  /* ---- 10 Composite Orders */
  const C = LineStatus.CONFIRMED;
  interface OrderSpec {
    guest: number;
    status: OrderStatus;
    attr: Record<string, string>;
    lines: () => Promise<Partial<OrderLine>[]>;
    pending?: boolean;
    cancelled?: boolean;
  }

  const specs: OrderSpec[] = [
    {
      guest: 0,
      status: OrderStatus.CONFIRMED,
      attr: {
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "brand_riverside_bkk",
        referrer: "https://www.google.com/",
        landingPath: "/book",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.STANDARD_KING,
          in: 0,
          nights: 3,
          adults: 2,
          room: "105",
          mode: "booked",
          status: C,
        }),
        await transferLine({
          day: 0,
          time: "09:40",
          flight: "SQ 976",
          dir: "ARRIVAL",
          mode: "booked",
          status: C,
          pax: 2,
        }),
        await tourLine(svcCruise, {
          day: 1,
          pax: 2,
          mode: "booked",
          status: C,
        }),
        await diningLine(riverside, "BREAKFAST", {
          day: 1,
          time: "08:00",
          party: 2,
          mode: "booked",
          status: C,
        }),
      ],
    },
    {
      guest: 1,
      status: OrderStatus.CONFIRMED,
      attr: {
        utmSource: "instagram",
        utmMedium: "paid_social",
        utmCampaign: "reel_pool_deluxe",
        referrer: "https://l.instagram.com/",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.DELUXE_BALCONY,
          in: 0,
          nights: 2,
          adults: 3,
          room: "305",
          mode: "booked",
          status: C,
        }),
        await transferLine({
          day: 0,
          time: "13:20",
          flight: "EK 372",
          dir: "ARRIVAL",
          mode: "booked",
          status: C,
          pax: 3,
        }),
        await tourLine(svcCruise, {
          day: 0,
          pax: 3,
          mode: "booked",
          status: C,
        }),
      ],
    },
    {
      guest: 2,
      status: OrderStatus.CONFIRMED,
      attr: {
        utmSource: "line",
        utmMedium: "crm",
        utmCampaign: "vip_winback_oct",
        channel: "LINE",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.POOL_VILLA,
          in: 0,
          nights: 4,
          adults: 4,
          room: "PV2",
          mode: "booked",
          status: C,
        }),
        await transferLine({
          day: 0,
          time: "07:55",
          flight: "QR 836",
          dir: "ARRIVAL",
          mode: "booked",
          status: C,
          pax: 4,
        }),
        await spaLine({
          day: 0,
          time: "15:00",
          treatments: 1,
          mode: "booked",
          status: C,
        }),
      ],
    },
    {
      guest: 3,
      status: OrderStatus.CONFIRMED,
      attr: { referrer: "https://www.google.com/", landingPath: "/" },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.STANDARD_KING,
          in: 0,
          nights: 2,
          adults: 2,
          room: "108",
          mode: "booked",
          status: C,
        }),
        await diningLine(sunset, "EVENING", {
          day: 0,
          time: "19:00",
          party: 2,
          mode: "booked",
          status: C,
        }),
        await tourLine(svcAyut, { day: 0, pax: 2, mode: "booked", status: C }),
      ],
    },
    {
      guest: 4,
      status: OrderStatus.CONFIRMED,
      attr: {
        utmSource: "whatsapp",
        utmMedium: "chat",
        utmCampaign: "concierge_upsell",
        channel: "WHATSAPP",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.STANDARD_KING,
          in: -1,
          nights: 3,
          adults: 1,
          room: "110",
          mode: "booked",
          status: C,
        }),
        await tourLine(svcCruise, {
          day: 0,
          pax: 2,
          mode: "booked",
          status: C,
        }),
        await tourLine(svcAyut, { day: 0, pax: 2, mode: "booked", status: C }),
      ],
    },
    {
      guest: 5,
      status: OrderStatus.CONFIRMED,
      attr: {
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "newyear_early_bird",
        referrer: "https://m.facebook.com/",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.DELUXE_BALCONY,
          in: 2,
          nights: 3,
          adults: 2,
          mode: "booked",
          status: C,
        }),
        await transferLine({
          day: 2,
          time: "18:10",
          flight: "TG 623",
          dir: "ARRIVAL",
          mode: "booked",
          status: C,
          pax: 2,
        }),
        await spaLine({
          day: 3,
          time: "16:00",
          treatments: 2,
          mode: "booked",
          status: C,
        }),
      ],
    },
    {
      guest: 6,
      status: OrderStatus.CONFIRMED,
      attr: {
        utmSource: "email",
        utmMedium: "newsletter",
        utmCampaign: "loyalty_oct_member",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.POOL_VILLA,
          in: 3,
          nights: 2,
          adults: 2,
          mode: "booked",
          status: C,
        }),
        await transferLine({
          day: 3,
          time: "11:05",
          flight: "JL 031",
          dir: "ARRIVAL",
          mode: "booked",
          status: C,
          pax: 2,
        }),
        await tourLine(svcAyut, { day: 4, pax: 2, mode: "booked", status: C }),
        await diningLine(sunset, "EVENING", {
          day: 3,
          time: "19:00",
          party: 2,
          mode: "booked",
          status: C,
        }),
      ],
    },
    {
      guest: 7,
      status: OrderStatus.CANCELLED,
      cancelled: true,
      attr: {
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "brand_riverside_bkk",
        referrer: "https://www.google.com/",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.STANDARD_KING,
          in: 1,
          nights: 1,
          adults: 2,
          mode: "booked",
          status: LineStatus.CANCELLED,
        }),
        await transferLine({
          day: 1,
          time: "10:30",
          flight: "QF 25",
          dir: "ARRIVAL",
          mode: "booked",
          status: LineStatus.CANCELLED,
          pax: 2,
        }),
      ],
    },
    {
      guest: 8,
      status: OrderStatus.PENDING,
      pending: true,
      attr: {
        utmSource: "tiktok",
        utmMedium: "creator",
        utmCampaign: "bkk_staycation_creator",
        referrer: "https://www.tiktok.com/",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.STANDARD_KING,
          in: 5,
          nights: 4,
          adults: 2,
          mode: "held",
          status: LineStatus.PENDING,
        }),
        await transferLine({
          day: 5,
          time: "21:30",
          flight: "TR 868",
          dir: "ARRIVAL",
          mode: "held",
          status: LineStatus.PENDING,
          pax: 2,
        }),
      ],
    },
    {
      guest: 9,
      status: OrderStatus.COMPLETED,
      attr: {
        utmSource: "blogger",
        utmMedium: "referral",
        utmCampaign: "riverside_review",
        referrer: "https://blog.example-travel.com/bangkok-riverside",
      },
      lines: async () => [
        await stayLine({
          type: RoomTypeCode.DELUXE_BALCONY,
          in: -4,
          nights: 3,
          adults: 2,
          room: "306",
          mode: "booked",
          status: LineStatus.COMPLETED,
        }),
        await transferLine({
          day: -4,
          time: "15:00",
          flight: "LH 772",
          dir: "ARRIVAL",
          mode: "booked",
          status: LineStatus.COMPLETED,
          pax: 2,
        }),
        await transferLine({
          day: -1,
          time: "11:30",
          pickup: "08:30",
          flight: "TG 603",
          dir: "DEPARTURE",
          mode: "booked",
          status: LineStatus.COMPLETED,
          pax: 2,
        }),
      ],
    },
  ];

  const orders: HydratedDocument<Order>[] = [];
  for (const s of specs) {
    const g = guests[s.guest];
    const items = await s.lines();
    let holdId: Types.ObjectId | undefined;
    if (s.pending) {
      const lines = items
        .flatMap((l) => l.slotRefs ?? [])
        .map((r) => ({ slotKey: r.slotKey, qty: r.qty }));
      const hold = await M.hold.create({
        branchId: BRANCH,
        cartId: `cart_${String(g._id)}`,
        lines,
        status: HoldStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      });
      holdId = hold._id;
    }
    const order = (await M.order.create({
      branchId: BRANCH,
      guestId: g._id,
      status: s.status,
      items,
      holdId,
      guestSnapshot: {
        fullName: g.displayName,
        email: g.email ?? undefined,
        phoneE164: g.phoneE164 ?? undefined,
        lineUserId: g.lineUserId ?? undefined,
        preferredLanguage: g.preferredLanguage ?? "en",
      },
      attribution: s.attr,
      payment: {
        status: s.status === OrderStatus.PENDING ? "UNPAID" : "PAID",
        method: "CARD",
      },
      totals: {
        serviceChargeRate: branch.settings.serviceChargeRate,
        vatRate: branch.settings.vatRate,
      },
    })) as HydratedDocument<Order>;

    if (holdId) {
      await M.hold.updateOne({ _id: holdId }, { orderId: order._id });
    }
    orders.push(order);
  }

  /* ---- Room housekeeping states for today */
  for (const n of ["105", "305", "PV2"]) {
    rooms[n].cleaningStatus = CleaningStatus.DIRTY;
    await rooms[n].save();
  }
  rooms["108"].cleaningStatus = CleaningStatus.IN_PROGRESS;
  await rooms["108"].save();
  rooms["110"].cleaningStatus = CleaningStatus.CLEAN;
  await rooms["110"].save();

  for (const o of orders) {
    if (
      o.status !== OrderStatus.CONFIRMED &&
      o.status !== OrderStatus.COMPLETED
    )
      continue;
    const g = guests.find((x) => x._id.equals(o.guestId))!;
    g.stats.lifetimeSpendThb += o.totals.grandTotalThb;
    g.stats.orderCount += 1;
    if (o.status === OrderStatus.COMPLETED) {
      g.stats.stayCount += 1;
      g.stats.lastStayAt = zonedAt(d(-1), "12:00");
    }
    g.markModified("stats");
    await g.save();
  }

  /* ---- Dispatches for DAY0 (same rules the 05:30 job runs) */
  const dispatches: Array<Record<string, unknown>> = [];
  const driverById = new Map(
    Object.values(staff).map((u) => [String(u._id), u]),
  );

  for (const o of orders) {
    if (o.status !== OrderStatus.CONFIRMED) continue;
    const g = guests.find((x) => x._id.equals(o.guestId))!;
    const stay = o.items.find(
      (l) => l.kind === LineKind.STAY && l.stay?.checkInDate === DAY0,
    );
    const inbound = o.items.find(
      (l) =>
        l.service?.flight?.direction === "ARRIVAL" && l.businessDate === DAY0,
    );

    if (stay?.stay?.assignedRoomId) {
      const eta =
        inbound?.service?.flight?.estimatedAt ??
        zonedAt(DAY0, branch.settings.checkInTime);
      const room = Object.values(rooms).find((r) =>
        r._id.equals(stay.stay!.assignedRoomId),
      )!;
      dispatches.push({
        type: DispatchType.HOUSEKEEPING_TURNAROUND,
        dedupeKey: `hk:${room.roomNumber}`,
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

    if (inbound?.service?.flight) {
      const f = inbound.service.flight;
      const driver = driverById.get(String(inbound.service.driverUserId))!;
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
      dispatches.push({
        type: DispatchType.AIRPORT_PICKUP,
        dedupeKey: `pickup:${String(o._id)}:${inbound.lineId}`,
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
          channel: g.lineUserId ? MessageChannel.LINE : MessageChannel.WHATSAPP,
          card,
        },
      });
    }
  }

  const svcById = new Map([svcCruise, svcAyut].map((s) => [String(s._id), s]));
  const tourSlots = await M.slot.find({
    branchId: BRANCH,
    kind: SlotKind.SERVICE,
    businessDate: DAY0,
    minViablePax: { $exists: true },
  });

  for (const sl of tourSlots) {
    const svc = svcById.get(sl.resourceKey)!;
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
    dispatches.push({
      type: DispatchType.TOUR_CONSOLIDATION,
      dedupeKey: `tour:${sl.slotKey}`,
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

  for (const x of dispatches) {
    await M.dispatch.create({ branchId: BRANCH, serviceDate: DAY0, ...x });
  }

  /* ---- Verification Output */
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

  const board = await M.dispatch
    .find({ branchId: BRANCH, serviceDate: DAY0, status: "OPEN" })
    .sort({ priorityScore: -1 })
    .select("type priorityScore severity title")
    .lean();
  console.log(`\n--- Operational Dispatch Board (${DAY0}) ---`);
  console.table(
    board.map((b) => ({
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
  console.log("\n--- Direct-Booking Revenue by Source ---");
  console.table(
    roll.map((r) => ({
      source: r._id,
      orders: r.orders,
      revenueThb: r.revenueThb,
    })),
  );

  await mongoose.disconnect();
  console.log("\nSeed completed successfully.");
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
