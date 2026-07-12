// Per-collection write authorization for the /api/db/sync endpoint.
//
// The client enforces page access, but the sync endpoint is a single generic
// write path, so authorization must also be enforced here. This is a whitelist:
// a collection not listed is not writable by anyone via sync.
//
// The roles for each collection are derived from the legitimate flows that
// write them — NOT one-to-one with page access, because a single user action
// can touch several collections (e.g. a User finishing a storage activity
// writes operationsActivities + storageMovements + auditLog).

const ALL = ['Developer', 'Admin', 'Supervisor', 'User']
const ADMIN = ['Developer', 'Admin']
const OPS_STAFF = ['Developer', 'Admin', 'Supervisor']

export const WRITE_POLICY = {
  // Reference / master data, billing and settings — Admin & Developer only.
  users: ADMIN,
  customers: ADMIN,
  accountHolders: ADMIN,
  activitiesMaster: ADMIN,
  uoms: ADMIN,
  currencies: ADMIN,
  vehicleTypes: ADMIN,
  storageTypes: ADMIN,
  unitValues: ADMIN,
  storageRates: ADMIN,
  handlingRates: ADMIN,
  vasCharges: ADMIN,
  billedRecords: ADMIN,
  settings: ADMIN,
  pendingAssignments: ADMIN,

  // Storage & Handling page — Admin/Developer/Supervisor.
  handlingCharges: OPS_STAFF,

  // Operational collections written during execution by every role (Users
  // execute; supervisors/admins add and manage). auditLog is appended by every
  // action, and attendance is written by Users checking in/out.
  operationsActivities: ALL,
  storageMovements: ALL,
  attendance: ALL,
  auditLog: ALL,
}

export function canWriteCollection(collection, role) {
  const allowed = WRITE_POLICY[collection]
  return Array.isArray(allowed) && allowed.includes(role)
}

// Split a changes object into the subset the role may write and the list of
// denied collection names. Unknown collections are denied (whitelist).
export function filterAuthorizedChanges(changes, role) {
  const allowed = {}
  const denied = []
  for (const key of Object.keys(changes)) {
    if (canWriteCollection(key, role)) allowed[key] = changes[key]
    else denied.push(key)
  }
  return { allowed, denied }
}
