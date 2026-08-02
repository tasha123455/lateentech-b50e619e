import type { AdminPageId } from "./types";
import type { AdminAccess } from "../AdminDataProvider";

/* Which permissions a screen needs.
 *
 * The Money page is one screen over two permissions, so it appears when you
 * hold either — the tabs inside it are hidden separately. Admins is not a
 * permission at all: being master is the permission.
 */
const NEEDS: Record<AdminPageId, string[]> = {
  "adm-home": ["adm-home"],
  "adm-money": ["adm-receipts", "adm-payouts"],
  "adm-users": ["adm-users"],
  "adm-products": ["adm-products"],
  "adm-employees": ["adm-employees"],
  "adm-requests": ["adm-requests"],
  "adm-notify": ["adm-notify"],
  "adm-admins": [],
};

/** Whether this admin may open a screen. Never a security decision — the
 *  database refuses the work regardless. This only avoids drawing a door that
 *  opens onto an error. */
export function canOpen(access: AdminAccess, id: AdminPageId): boolean {
  if (access.isMaster) return true;
  if (id === "adm-admins") return false;
  return NEEDS[id].some((p) => access.pages.includes(p));
}

/** The first screen this admin is actually allowed to land on. */
export function firstAllowed(access: AdminAccess, preferred: AdminPageId): AdminPageId {
  if (canOpen(access, preferred)) return preferred;
  const order: AdminPageId[] = [
    "adm-home", "adm-money", "adm-users", "adm-requests", "adm-products", "adm-employees", "adm-notify",
  ];
  return order.find((id) => canOpen(access, id)) ?? "adm-home";
}
