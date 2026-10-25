/**
 * An airport pickup as it happens on the ground. The driver reports each step from the
 * phone; the desk watches. Steps only move forward.
 */
export enum PickupStage {
  /** A driver has been given the job but hasn't accepted it yet */
  ASSIGNED = "ASSIGNED",
  /** The driver accepted: they know the flight, the time and the door */
  CONFIRMED = "CONFIRMED",
  EN_ROUTE = "EN_ROUTE",
  /** Waiting at the arrivals door with the name sign */
  AT_AIRPORT = "AT_AIRPORT",
  GUEST_ON_BOARD = "GUEST_ON_BOARD",
  DROPPED_OFF = "DROPPED_OFF",
}

export const PICKUP_STAGE_ORDER: PickupStage[] = [
  PickupStage.ASSIGNED,
  PickupStage.CONFIRMED,
  PickupStage.EN_ROUTE,
  PickupStage.AT_AIRPORT,
  PickupStage.GUEST_ON_BOARD,
  PickupStage.DROPPED_OFF,
];

export enum PickupIssueKind {
  FLIGHT_DELAYED = "FLIGHT_DELAYED",
  GUEST_NOT_FOUND = "GUEST_NOT_FOUND",
  VEHICLE_PROBLEM = "VEHICLE_PROBLEM",
  OTHER = "OTHER",
}

/** How the desk answers a driver's problem report */
export enum PickupIssueResolution {
  KEEP_WAITING = "KEEP_WAITING",
  NO_SHOW = "NO_SHOW",
  /** the driver moved on to the next step, so the problem sorted itself out */
  CONTINUED = "CONTINUED",
}

/** Airport → hotel drive used to tell the desk when the guest will walk in. */
export const AIRPORT_TO_HOTEL_MIN = 45;
