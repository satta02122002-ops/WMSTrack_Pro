# WMSTrack Pro

A production-ready warehouse operations tracking and billing system for contract logistics / 3PL warehouses. Track daily warehouse work (operations, storage, handling, VAS, attendance), calculate billable quantities, and generate monthly customer billing — with multi-user roles, an audit trail, analytics dashboards and Excel export throughout.

Built as a modern single-page React app (Vite + React 18, Chart.js, SheetJS) with **browser local persistence** — no backend required. Everything is stored in `localStorage`, so you can run it from any static host or `npm run dev` and it just works.

## Quick start

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
```

On first run the app seeds a demo database: default users, 3 customers, 8 activity types, rates, and ~3 weeks of realistic completed work so reports, billing and analytics have content immediately.

### Default users

| Role      | User ID     | Password    | Access |
|-----------|-------------|-------------|--------|
| Developer | `developer` | `developer` | Everything, including User & Authorization; exempt from the daily check-in gate |
| Admin     | `admin`     | `admin`     | All modules except User management |
| User      | `user`      | `user`      | Operations Execution and Pending Activity only |

A **Supervisor** role (Operations, Pending Activity, Storage & Handling, Reports) can be assigned from User & Authorization, and any user can be given custom per-page access.

Login is case-insensitive on User ID, shows generic error messages, supports "Remember User ID" and a show/hide password toggle. Inactive users cannot log in. Passwords are stored as SHA-256 hashes.

## Architecture & data model

- **`src/store.jsx`** — single data store (React context) persisted to `localStorage` under `wmstrack_pro_db_v1`. Holds all collections, the session, seeding, and every business action (start/pause/end activity, check-in/out, billing, CRUD). Every significant action also appends to the audit log (capped at 5,000 entries).
- **`src/billing.js`** — pure billing engine. Billing lines are **computed on demand** from source records (never duplicated into storage), with stable line ids (`act:<id>`, `sto:<movementId>`, `han:<movementId>`, `vas:<id>`, `min…:<rateId>:<period>`) so "billed" status survives recomputation.
- **`src/excel.js`** — XLSX/CSV export, spreadsheet import, and bulk-upload template definitions.
- **`src/pages/*`** — one module per page; **`src/components/Layout.jsx`** provides the header (Check-In/Out, Change Password, Logout), collapsible sidebar with role-based menu, and toasts.

### Entities

`users`, `customers` (name, currency, references), `activitiesMaster` (name + `storageType`: `inbound` / `outbound` / none), `uoms`, `currencies`, `vehicleTypes`, `unitValues` (customer + activity + UOM → rate, optional monthly minimum), `storageRates` (customer + storage type → rate per CBM per day), `handlingRates` (customer → container/trailer 20ft & 40ft, loose per CBM, per-movement minimum, monthly minimum), `storageMovements`, `operationsActivities`, `pendingAssignments`, `vasCharges`, `attendance`, `billedRecords`, `auditLog`.

All dates are stored ISO (`YYYY-MM-DD` / ISO datetime) internally.

## Daily workflow

### Morning
1. Log in.
2. Click **Check-In** in the header — everyone except Developer must check in before starting operations (a banner reminds you on Operations Execution).
3. Open **Pending Activity** to pick up a forwarded job (pre-fills the form), or go straight to **Operations Execution**.

### Executing work
4. Select Customer, Customer Reference and Activity Type → **Start Activity**. A live timer runs; you can **Pause / Resume**. One active task per user — but colleagues can **Join** your running activity as participants (and **Leave** it).
5. **End Activity** opens the completion modal:
   - **Normal activities** (Picking, Packing, …): Quantity + UOM.
   - **Offloading (inbound) / Loading (outbound)**: CBM, Storage type, Handling type (Container / Trailer / Loose); Container/Trailer add Vehicle type (20ft/40ft) + number of trucks; all modes capture package details as **one line per UOM** (e.g. 1 PLT + 10 CTN + 600 PCS). The modal shows the billing hint — ending it records a **storage movement** plus **Storage In/Out and Handling In/Out billing lines** automatically.
6. Choose **Forward** (job continues — adds a row to the Pending Activity queue) or **Finish** (closes any matching pending assignment).

### End of shift
7. **Check-Out** — records shift hours and logs you out.

### End of month (Admin)
8. Open **Monthly Billing**, pick Month/Year (+ optional customer / report type / billing status filters) → **Generate Billing**.
9. Review lines, tick rows → **Record Billing** (pick the billing date; stores billed-by/billed-date per line).
10. **Export Excel** for finance, or POST the lines to a configurable external API URL.

## Billing logic

For a selected month, lines come from four sources:

| Source | Line | Amount |
|--------|------|--------|
| Completed normal activities | activity name | qty × unit value (customer + activity + UOM). One job can carry **multiple UOM lines** (e.g. 1 PLT + 10 CTN + 600 PCS entered in the End Activity modal) — each line becomes its own billing charge at that UOM's rate |
| Unit values with a monthly minimum | *Monthly Minimum Adjustment* | top-up when the group's month total is below the configured minimum (only if the group had activity that month) |
| Storage movements | Storage In / Storage Out | storage days × CBM × storage rate. Storage days default to the days remaining in the movement's month (editable per movement) |
| Storage movements with handling | Handling In/Out Container / Trailer / Loose | Container/Trailer: trucks × rate (by vehicle size); Loose: CBM × rate. Customers flagged **"Bill all handling by CBM"** in their handling configuration are always charged CBM × loose rate — even for container/trailer movements (flagged CBM RATE in the billing table). A per-movement minimum charge applies, plus an optional monthly minimum top-up per customer |
| VAS charges | Value Added Service | qty × charge per unit |

Lines missing a configured rate are flagged **NO RATE** so master data gaps are visible instead of silently billing zero. Grand totals are shown per currency.

## Modules

Operations Execution · Pending Activity · Operations Monitor (live + history) · Storage & Handling (movements with filters/import + handling rate configuration) · Value Added Services · Reports (Operations / Storage / Handling / VAS, Excel & CSV export) · Monthly Billing · Master Data (Customers, Activities, Unit Values, Storage Master, Handling) · Parameter (UOM, Currencies, Vehicle Types) · Attendance (daily status, records, developer-editable) · Productivity (activity hours ÷ attendance hours) · Performance Analytics (9 KPI cards + 14 charts incl. heatmap) · Activity Log (filterable audit trail) · User & Authorization (roles, custom page access, activate/deactivate, database reset).

## Master data setup (onboarding order)

1. **User & Authorization** — create users and roles.
2. **Parameter** — UOM, currencies, vehicle types.
3. **Master Data** — customers → activities (include Offloading = inbound, Loading = outbound) → unit values → storage rates → handling rates & minimums.
4. Verify with a test operation in Operations Execution.
5. Run Reports and Monthly Billing.

Every master data tab supports **bulk Excel upload** with a downloadable template (also in [`templates/`](templates/) as `.xlsx` and `.csv`): customers, activities, UOM, unit values, storage rates, handling rates, and storage movements.

## Notes

- Data lives in your browser's `localStorage`. Use **User & Authorization → Danger Zone → Reset Database** to restore the seed/demo state.
- The Analytics revenue KPI sums all currencies at face value (labelled as such).
- Excel export/import uses SheetJS; charts use Chart.js with a colorblind-validated palette.
