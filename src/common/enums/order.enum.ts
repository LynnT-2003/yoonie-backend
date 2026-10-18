export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

/** line level status allows partial cancellation without touching the entire order lifecycle */
export enum LineStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
  NO_SHOW = "NO_SHOW",
}

export enum LineKind {
  STAY = "STAY",
  DINING = "DINING",
  SERVICE = "SERVICE",
}
