# Dining Seating, Order, and Payment Implementation Report

**Run date:** 26 November 2026  
**Recommendation:** **READY for the verified Dining seating/order/payment workflow**

The customer-to-sales workflow now includes an explicit, persisted seating step. A guest selects an available table when booking; staff records arrival and then seats the guest; the backend rejects order creation until the reservation is `SEATED`. The order, cash settlement, restaurant sales, payment-ledger separation, authorization, and responsive checks passed in an isolated Chrome run. The five previously fixed Dining defects passed again in the post-browser regression suite.

This is a Dining-scope recommendation. It does not certify the complete backend suite or the unrelated Finance Reports role test; those limitations are recorded below.

## Existing workflow findings

- The existing reservation flow allocates a table inside a MongoDB transaction and serializes competing allocations by updating the restaurant allocation version. Availability checks use a 90-minute reservation conflict window.
- The existing Restaurant Operations arrival endpoint persisted `ARRIVED`, but it did not represent seating. Before this change, the UI exposed order creation after arrival and the backend accepted orders for an arrived but not seated reservation.
- The working tree already contained the `RestaurantOrder` model, server-side price snapshots, settlement/payment integration, and restaurant sales. This work integrated with those components rather than replacing them. The older workflow analysis report's statement that food orders were not implemented does not describe the current working tree.
- Restaurant reservation payments and food-order payments remain separate records and totals.

## Changes made

### Reservation and seating

- Availability now returns the actual available tables with table number, capacity, and location. When availability succeeds, the form preselects the server-suggested table, leaves the selector editable, and enables **Confirm Reservation**. Availability failures show an inline error and retry action; a reservation conflict refreshes the table choices. The form sends the chosen table ID, and the transaction rechecks that it belongs to the active restaurant, fits the party and seating preference, and has no conflicting reservation before saving it.
- Added `PUT /api/restaurants/admin/operations/:restaurantId/reservations/:reservationId/seat`.
- Seating is allowed only for an active `PENDING` or `CONFIRMED` reservation already marked `ARRIVED`, with an active assigned table at the same property and restaurant. It atomically sets reservation status to `SEATED`, records `seatedAt` and `seatedBy`, and changes the table to `OCCUPIED`.
- The legacy status endpoint delegates `SEATED` and completion transitions to the same transactional service. Completion changes the table from `OCCUPIED` to `CLEANING`; staff can return a cleaned table to service through the existing table status workflow.
- Food-order creation and editing now require both `status === SEATED` and `arrivalStatus === ARRIVED`. The UI shows `Seat Guest` after arrival and `Create order` only after seating. A completion action is available for seated reservations.

### Order, bill, and responsive surfaces

- Existing server-authoritative item pricing, saved name/price snapshots, duplicate-order protection, settlement lock, payment integration, and restaurant sales calculations were retained.
- The browser verification exercised editing a saved order and changing quantity before settlement. Print media verification confirmed operational controls are hidden while the bill remains visible.
- Added targeted responsive rules for Restaurant Operations, restaurant selection, dashboard tables, and the My Bookings dining card. The existing full-width data tables remain scrollable within their panels.

### Files changed for this work

- Backend: `backend/controllers/restaurantController.js`, `backend/controllers/restaurantOperationsController.js`, `backend/routes/restaurantRoutes.js`, `backend/models/RestaurantReservation.js`, `backend/services/restaurantOrderService.js`, and new `backend/services/diningSeatingService.js`.
- Tests: `backend/tests/restaurantOperations.test.js`, `frontend/src/pages/RestaurantOperations.test.js`.
- Frontend: `frontend/src/components/RestaurantReservationModal.js`, `frontend/src/pages/RestaurantOperations.js`, `frontend/src/pages/RestaurantOperations.css`, `frontend/src/pages/MyBookings.js`, `frontend/src/pages/CustomerPortal.css`, and `frontend/src/services/api.js`.
- Browser harness/evidence: `qa/dining-browser-qa.cjs`, `qa-artifacts/dining-seating-order-payment/`.

These are the files touched for this task; the worktree already contained other user changes, which were preserved.

## Database and API changes

- `RestaurantReservation` now has optional `seatedAt` and `seatedBy` fields. Existing documents need no backfill; they remain unseated until staff completes the new transition.
- Availability response adds `availableTables: [{ _id, tableNumber, capacity, location }]`. Reservation creation accepts optional `tableId`; if supplied, an invalid, unavailable, conflicting, or cross-restaurant table is rejected. Existing callers omitting `tableId` retain safe server allocation.
- The new seat endpoint returns the updated reservation. The existing status endpoint still supports valid status transitions, but a seating transition now uses the seating preconditions and transaction.

## Verification results

### Backend regression

The final browser harness ran the five focused backend test files after the browser workflow:

```sh
node --test --test-concurrency=1 --test-force-exit \
  tests/restaurantOperations.test.js \
  tests/diningReservationController.test.js \
  tests/diningPricing.test.js \
  tests/payhereGatewayIntegration.test.js \
  tests/restaurant.test.js
```

**Aggregate: 59 tests, 59 passed, 0 failed, 0 cancelled, 0 skipped.** The log is [focused-regression.log](qa-artifacts/dining-seating-order-payment/focused-regression.log).

The direct operations integration file was also run alone from `/private/tmp` with disposable test environment variables:

```sh
env NODE_ENV=test DB_MODE=atlas MONGO_URI=jwt_secret_not_a_uri \
  JWT_SECRET=disposable-dining-seating-test PAYHERE_MERCHANT_ID=1212345 \
  PAYHERE_MERCHANT_SECRET=disposable-only \
  node --test --test-concurrency=1 --test-force-exit \
  /Users/janith/Desktop/Projects/Hotel_PMS/backend/tests/restaurantOperations.test.js
```

**Result: 19 passed, 0 failed.** This includes selected-table persistence, rejected order creation before seating, timestamp/staff persistence, duplicate seating rejection, table occupancy and completion release, server price snapshots, settlement idempotency, and restaurant/property authorization.

The final 59-test aggregate also rechecked the previously fixed defects:

| Defect | Regression evidence | Result |
|---|---|---|
| Legacy folio charge after checkout/invoice | `protects legacy reservation folio charges from closed, invoiced and concurrent stays` | PASS |
| Cancelled reservation reopened | `rejects terminal and invalid legacy reservation status transitions`; guest-cancelled arrival/update test | PASS |
| Concurrent double table assignment | `allocates an available table once across concurrent overlapping public bookings` | PASS |
| Inactive restaurant public catalogue | `does not expose inactive restaurant catalogues or accept bookings for them` | PASS |
| Tagline persistence/validation | `updates restaurant taglines with validation and preserves them when omitted` | PASS |

### Disposable Chrome workflow

- **Browser:** Google Chrome, headless.
- **Automation:** Chrome DevTools Protocol through Node's built-in `WebSocket`; no additional browser framework or package was installed.
- **Command:** `node qa/dining-browser-qa.cjs`.
- **Environment:** a fresh, single-node `MongoMemoryReplSet` at `mongodb://127.0.0.1:55079/dining_browser_qa?replicaSet=testset`; the API listener owned by the harness bound to `127.0.0.1:55127`. Both ports were OS-assigned for the latest run. The harness verified its own API health response and printed the disposable database URI. It did not use ports 5000 or 5001.
- The harness changed its working directory to the OS temporary directory before loading application configuration, used dummy PayHere values, and blocked non-loopback browser networking. No production database or live PayHere request was used in the final run.

| Workflow step | Browser/API evidence |
|---|---|
| Active restaurant discovery, details, menu | PASS; Azure Tide and Spice & Silk rendered, then Azure Tide detail/menu opened. |
| Customer reservation | PASS; reference `RST-2611-2984`, Azure Tide, selected table `T-02 (Window)`, reservation price LKR 500; saved status `CONFIRMED`. The harness confirmed the button enabled after a suggested table loaded. |
| Staff restaurant scope | PASS; selected Azure Tide contained the reservation; Spice & Silk did not. |
| Arrival and seating | PASS; staff marked arrival and seated the guest; reservation stored `SEATED`, `seatedAt`, and `seatedBy`; table became `OCCUPIED`. |
| Create and edit food order | PASS; two catalog items saved, then the first quantity was edited from 2 to 3 before settlement. |
| Server bill and print | PASS; LKR 21,700 calculated from item snapshots. Print generated a 346,571-byte PDF; print-media check confirmed operational controls are hidden and bill is visible. |
| Cash settlement | PASS; one completed Cash payment of LKR 21,700 recorded. |
| Restaurant sales | PASS; Azure Tide collected LKR 21,700, all Cash, one paid and one unpaid order; unpaid order excluded from collected sales. Spice & Silk reported LKR 0. |
| Customer payment history | PASS; reservation remained `Unpaid` with LKR 500 outstanding after the separate food-order cash payment. |
| Authorization and isolation | PASS; customer staff route redirected to `/`, customer API returned 403, anonymous API 401, cross-restaurant and cross-property calls 404. |

The run summary, order line snapshots, DB/API origins, all viewport measurements, and screenshot manifest are in [evidence.json](qa-artifacts/dining-seating-order-payment/evidence.json). The run produced 26 screenshots and the bill PDF under [qa-artifacts/dining-seating-order-payment](qa-artifacts/dining-seating-order-payment).

Examples:

![Restaurant discovery at desktop width](qa-artifacts/dining-seating-order-payment/01-customer-discovery-desktop.png)

![Reservation confirmation at 390px](qa-artifacts/dining-seating-order-payment/03b-reservation-confirmation-390.png)

![Staff reservation and seating controls at 390px](qa-artifacts/dining-seating-order-payment/08-staff-reservations-390-viewport.png)

![Order bill at desktop width](qa-artifacts/dining-seating-order-payment/11-bill-desktop.png)

### Responsive checks

Chrome measured 55 responsive states across discovery cards, My Bookings, restaurant selection, reservation list, order editor, bill/payment controls, and sales dashboard. Each requested width—**1440, 1024, 768, 390, and 360px**—reported `documentWidth` and `bodyWidth` equal to the requested width. **0 horizontal overflow failures.** The harness captured desktop and 390px screenshots, plus 390px viewport screenshots for wide staff screens.

### Frontend tests and build

Supported CRA command:

```sh
CI=true ./node_modules/.bin/react-scripts test --watchAll=false --runInBand
```

**3 suites passed, 1 suite failed; 16 tests passed, 1 failed.** `RestaurantOperations.test.js`, Dining pricing, and venue schedule tests passed. The only failure is the existing unrelated Finance Reports expectation in `frontend/src/config/roleAccess.test.js:24`: the test expects `canAccessRoute('finance', 'reports')` to be false but receives true. No role permissions or that test were changed.

The package command `CI=true npm test -- --watchAll=false --runInBand` invokes bare `jest` rather than CRA's configured Jest runner and failed to parse JSX. The CRA-supported command above was used for the actual frontend result.

Production build command and result:

```sh
npm run build
```

**Compiled successfully.** The temporary harness build using the local API URL was replaced by the normal production build afterward. The build emitted only the existing stale Browserslist data warning.

## Transaction and concurrency verification

- Browser integration ran against a disposable MongoDB replica set, so transaction-required code executed with a replica-set topology.
- Focused tests prove one acceptance from concurrent overlapping allocation requests; simultaneous seating requests returned one success and one conflict; completion moved the occupied table to `CLEANING`.
- Existing folio/checkout serialization and payment callback idempotency tests passed in the 59-test aggregate.
- The app uses MongoDB document writes and transactions for coordination, not process-local locks. Multi-instance deployment therefore assumes every instance connects to the same transaction-capable replica set and uses the same database. A standalone MongoDB server will not support these transaction paths.
- This run used a single-node in-memory replica set. It does not verify production Atlas topology, failover, multi-node behavior, or deployment configuration.

## Execution caveat and remaining limitations

- An early attempted focused command was run from `backend/`, where a test loaded the workspace `.env`. MongoDB Memory Server also failed to bind under the sandbox (`listen EPERM`). The output showed an Atlas SRV DNS lookup failing with `ECONNREFUSED`; no Atlas connection was established and no database operation completed. All subsequent successful backend and browser runs were launched from `/private/tmp` or the isolated harness with explicit disposable settings. No 5000/5001 service was contacted by this work. The prior report's uncertainty about the earlier invalid port-5001 attempt remains outside this run.
- The full backend test suite was not run for this workflow implementation; the requested focused Dining files and browser harness were run. The unrelated Finance Reports role test still fails and should be handled in its own targeted change.
- The browser blocked external network requests, so third-party image/font delivery was not evaluated. Chrome generated the print PDF and verified print CSS, but the PDF text was not extracted for a separate content comparison.
- PayHere checkout and live card processor settlement were not exercised. PayHere callback behavior passed the local signed-callback backend tests; the browser workflow settled with Cash. External card references remain the existing staff-entered terminal reference flow.

## Final decision

**READY for the verified Dining reservation → seating → food order → bill → cash settlement → restaurant sales workflow.** Required focused Dining tests passed, the integrated Chrome workflow passed, all five prior defects remained fixed, and no unresolved Dining release blocker was reproduced. The unrelated Finance Reports test failure and the unrun full backend suite are not represented as passing.
