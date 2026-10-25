import { Injectable, Logger, Optional } from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationSeverity } from "../notifications/enums/notification-severity.enum";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DispatchRepo } from "./dispatch.repo";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "./entity/operational-dispatch.entity";
import {
  buildPickupCard,
  evaluateConsolidation,
  housekeepingPriority,
  pickupPriority,
} from "./rules/dispatch-rules";
import {
  DispatchStatus,
  DispatchType,
  MessageChannel,
  Severity,
} from "../common/enums/dispatch.enum";
import { LineKind, LineStatus } from "../common/enums/order.enum";
import { ServiceKind } from "../common/enums/service.enum";
import { SlotKind } from "../common/enums/inventory.enum";
import { PickupStage } from "../common/enums/pickup.enum";
import { hhmm, toBusinessDate, zonedAt } from "../common/helpers/time.helper";
import { Branch, BranchDocument } from "../branch/entity/branch.entity";
import { Service, ServiceDocument } from "../service/entity/service.entity";
import { User, UserDocument } from "../user/entity/user.entity";
import {
  InventorySlot,
  InventorySlotDocument,
} from "../inventory/entity/inventory-slot.entity";
import type { OrderDocument, OrderLine } from "../order/entity/order.entity";

const DEAD = [LineStatus.CANCELLED, LineStatus.NO_SHOW];
const VIP_SCORE = 50;
/** rooms must be ready an hour after the guest's ETA, same rule as the 05:30 run */
const READY_BUFFER_MS = 3_600_000;

/**
 * Turns a booking into the operational work it creates, using the same rules the
 * 05:30 run-sheet uses: room turnaround, airport pickup and tour fill/break-even.
 * Tasks are upserted by dedupe key, so re-planning an order never duplicates work.
 */
@Injectable()
export class DispatchPlannerService {
  private readonly log = new Logger(DispatchPlannerService.name);

  constructor(
    private readonly dispatchRepo: DispatchRepo,
    @InjectModel(OperationalDispatch.name)
    private readonly dispatchModel: Model<OperationalDispatchDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<ServiceDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(InventorySlot.name)
    private readonly slotModel: Model<InventorySlotDocument>,
    @Optional()
    private readonly notificationsService?: NotificationsService,
  ) {}

  /** Never throws: a planning failure must not undo a guest's confirmed booking. */
  async planOrder(order: OrderDocument): Promise<void> {
    try {
      await this.plan(order);
    } catch (err) {
      this.log.error(
        `Dispatch planning failed for order ${order.orderNumber}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async plan(order: OrderDocument): Promise<void> {
    const branch = await this.branchModel
      .findById(order.branchId)
      .lean()
      .exec();
    if (!branch) return;
    const guest = await this.userModel
      .findById(order.guestId)
      .select("vipScore lineUserId")
      .lean()
      .exec();
    const isVip = (guest?.vipScore ?? 0) >= VIP_SCORE;
    const guestName = order.guestSnapshot.fullName;
    const live = order.items.filter((l) => !DEAD.includes(l.status));

    const inbound = live.find(
      (l) =>
        l.kind === LineKind.SERVICE &&
        l.service?.serviceKind === ServiceKind.AIRPORT_TRANSFER &&
        l.service.flight?.direction === "ARRIVAL",
    );
    const landingAt = inbound?.service?.flight
      ? (inbound.service.flight.estimatedAt ??
        inbound.service.flight.scheduledAt)
      : undefined;

    for (const line of live) {
      if (line.kind === LineKind.STAY && line.stay?.assignedRoomNumber) {
        await this.planTurnaround(
          order,
          line,
          branch,
          guestName,
          isVip,
          landingAt && {
            at: landingAt,
            flightNumber: inbound!.service!.flight!.number,
          },
        );
      }
    }

    if (inbound && landingAt) {
      await this.planPickup(
        order,
        inbound,
        branch,
        guestName,
        guest?.lineUserId ?? undefined,
        landingAt,
      );
    }

    for (const line of live) {
      if (
        line.kind === LineKind.SERVICE &&
        line.service?.serviceKind === ServiceKind.SCHEDULED_TOUR
      ) {
        await this.planTourFill(order.branchId, line, branch);
      }
    }
  }

  private async planTurnaround(
    order: OrderDocument,
    line: OrderLine,
    branch: Branch,
    guestName: string,
    isVip: boolean,
    landing?: { at: Date; flightNumber: string },
  ) {
    const stay = line.stay!;
    // a flight landing on check-in day is the real ETA; otherwise fall back to standard check-in time
    const byFlight = Boolean(
      landing && toBusinessDate(landing.at) === stay.checkInDate,
    );
    const eta = byFlight
      ? landing!.at
      : zonedAt(stay.checkInDate, branch.settings?.checkInTime || "14:00");
    const readyBy = new Date(eta.getTime() + READY_BUFFER_MS);

    await this.dispatchRepo.upsertTask(
      order.branchId,
      stay.checkInDate,
      DispatchType.HOUSEKEEPING_TURNAROUND,
      `hk:${stay.assignedRoomNumber}`,
      {
        priorityScore: housekeepingPriority(eta, isVip),
        severity: isVip ? Severity.WARN : Severity.INFO,
        title: `Turn room ${stay.assignedRoomNumber} before ${hhmm(readyBy)}`,
        dueAt: readyBy,
        housekeeping: {
          roomId: stay.assignedRoomId!,
          roomNumber: stay.assignedRoomNumber!,
          orderId: order._id,
          guestName,
          etaAt: eta,
          isVip,
          etaSource: byFlight ? "TRANSFER_FLIGHT" : "CHECKIN_TIME",
          flightNumber: byFlight ? landing!.flightNumber : undefined,
          targetReadyBy: readyBy,
        },
      },
    );
  }

  private async planPickup(
    order: OrderDocument,
    line: OrderLine,
    branch: Branch,
    guestName: string,
    lineUserId: string | undefined,
    landingAt: Date,
  ) {
    const flight = line.service!.flight!;
    const svc = await this.serviceModel
      .findById(line.service!.serviceId)
      .lean()
      .exec();
    const vehicle = svc?.transfer?.vehicles?.find((v) => v.isActive !== false);
    const driver = vehicle?.defaultDriverId
      ? await this.userModel
          .findById(vehicle.defaultDriverId)
          .select("displayName phoneE164")
          .lean()
          .exec()
      : null;
    const serviceDate = toBusinessDate(landingAt);
    const dedupeKey = `pickup:${String(order._id)}:${line.lineId}`;
    // a flight moved to another day leaves its old pickup behind; retire it
    await this.dispatchModel.updateMany(
      {
        branchId: order.branchId,
        type: DispatchType.AIRPORT_PICKUP,
        dedupeKey,
        serviceDate: { $ne: serviceDate },
        status: { $nin: [DispatchStatus.DONE, DispatchStatus.DISMISSED] },
      },
      { $set: { status: DispatchStatus.DISMISSED, completedAt: new Date() } },
    );
    const meetingDoor =
      flight.meetingDoor ?? svc?.transfer?.meetingDoors?.[0] ?? 3;

    // a dispatcher's reassignment survives re-planning; only new pickups get the van's driver
    const previous = await this.dispatchModel
      .findOne({
        branchId: order.branchId,
        serviceDate,
        type: DispatchType.AIRPORT_PICKUP,
        dedupeKey,
      })
      .select(
        "assigneeUserId pickup.etaAt pickup.stage pickup.steps pickup.issue",
      )
      .lean()
      .exec();
    const assigneeId = previous?.assigneeUserId ?? driver?._id;
    const assignee =
      assigneeId && String(assigneeId) !== String(driver?._id)
        ? await this.userModel
            .findById(assigneeId)
            .select("displayName phoneE164")
            .lean()
            .exec()
        : driver;

    const timeChanged =
      !previous?.pickup?.etaAt ||
      +new Date(previous.pickup.etaAt) !== +landingAt;

    // the journey so far survives re-planning; a driver who accepted the old time must re-accept
    let stage = previous?.pickup?.stage ?? PickupStage.ASSIGNED;
    const steps = [...(previous?.pickup?.steps ?? [])];
    if (!previous && assigneeId) {
      steps.push({
        stage: PickupStage.ASSIGNED,
        at: new Date(),
        byName: "Planner",
        note: `Default driver for ${vehicle?.plate ?? "the van"}`,
      });
    } else if (previous && timeChanged && stage === PickupStage.CONFIRMED) {
      stage = PickupStage.ASSIGNED;
      steps.push({
        stage: PickupStage.ASSIGNED,
        at: new Date(),
        byName: "Planner",
        note: `Flight re-timed to ${hhmm(landingAt)} — driver to accept again`,
      });
    }

    const task = await this.dispatchRepo.upsertTask(
      order.branchId,
      serviceDate,
      DispatchType.AIRPORT_PICKUP,
      dedupeKey,
      {
        priorityScore: pickupPriority(landingAt),
        severity: assignee ? Severity.INFO : Severity.WARN,
        title: `Pickup ${flight.number} ${hhmm(landingAt)} (${guestName})`,
        dueAt: line.startsAt,
        assigneeUserId: assigneeId,
        pickup: {
          orderId: order._id,
          lineId: line.lineId,
          guestName,
          flightNumber: flight.number,
          etaAt: landingAt,
          meetingDoor,
          vehiclePlate: vehicle?.plate,
          driverUserId: assigneeId,
          channel: lineUserId ? MessageChannel.LINE : MessageChannel.WHATSAPP,
          card: buildPickupCard({
            hotelName: branch.name,
            guestName,
            flightNumber: flight.number,
            etaAt: landingAt,
            meetingDoor,
            driverName: assignee?.displayName ?? "to be assigned",
            driverPhone: assignee?.phoneE164 ?? "",
            vehiclePlate: vehicle?.plate ?? "to be assigned",
          }),
          stage,
          steps,
          issue: previous?.pickup?.issue,
        } as OperationalDispatch["pickup"],
      },
    );

    if (assigneeId && timeChanged) {
      await this.notificationsService?.createNotification({
        userId: String(assigneeId),
        branchId: order.branchId.toString(),
        type: NotificationType.PICKUP_READY,
        severity: NotificationSeverity.INFO,
        title: previous ? `Pickup re-timed: ${task.title}` : task.title,
        body: task.pickup?.card.en ?? "",
        data: {
          dispatchId: String(task._id),
          type: DispatchType.AIRPORT_PICKUP,
        },
      });
    }
  }

  /** Re-evaluates the departure the tour line booked into; flags it, or clears a stale flag. */
  private async planTourFill(
    branchId: Types.ObjectId,
    line: OrderLine,
    branch: Branch,
  ) {
    const slotKey = line.slotRefs?.[0]?.slotKey;
    if (!slotKey) return;
    const slot = await this.slotModel
      .findOne({ slotKey, kind: SlotKind.SERVICE })
      .lean()
      .exec();
    const svc = await this.serviceModel
      .findById(line.service!.serviceId)
      .lean()
      .exec();
    if (!slot || !svc || !slot.minViablePax) return;

    const r = evaluateConsolidation(
      {
        booked: slot.booked,
        capacity: slot.capacity,
        minViablePax: slot.minViablePax,
        fixedCostThb: slot.fixedCostThb ?? 0,
        unitPriceThb: svc.basePriceThb,
      },
      branch.settings?.consolidationThreshold ?? 0.4,
    );
    const serviceDate = toBusinessDate(slot.startsAt);
    const dedupeKey = `tour:${slotKey}`;

    if (!r.flag) {
      await this.dispatchModel.updateOne(
        {
          branchId,
          serviceDate,
          type: DispatchType.TOUR_CONSOLIDATION,
          dedupeKey,
          status: { $in: [DispatchStatus.OPEN, DispatchStatus.ACKNOWLEDGED] },
        },
        { $set: { status: DispatchStatus.DISMISSED, completedAt: new Date() } },
      );
      return;
    }

    await this.dispatchRepo.upsertTask(
      branchId,
      serviceDate,
      DispatchType.TOUR_CONSOLIDATION,
      dedupeKey,
      {
        priorityScore: r.priorityScore,
        severity: r.severity as Severity,
        title: `${svc.name} ${hhmm(slot.startsAt)}: ${slot.booked}/${slot.capacity} pax (${Math.round(r.fillRate * 100)}%)`,
        dueAt: new Date(slot.startsAt.getTime() - 4 * 3_600_000),
        consolidation: {
          slotKey,
          serviceId: svc._id,
          serviceName: svc.name,
          departsAt: slot.startsAt,
          booked: slot.booked,
          capacity: slot.capacity,
          fillRate: r.fillRate,
          minViablePax: slot.minViablePax,
          fixedCostThb: slot.fixedCostThb ?? 0,
          revenueThb: r.revenueThb,
          projectedLossThb: r.projectedLossThb,
          recommendation: r.recommendation,
        },
      },
    );
  }
}
