# Dining Module Release Blocker Fix Report

**Date:** 26 November 2026  
**Recommendation:** **HOLD**

All five reported defects now have scoped fixes and isolated regression coverage. The Dining Operations API tests pass, but the complete backend run did not finish, the frontend role-access test still fails, and the post-fix integrated Chrome workflow was not rerun. These gaps prevent a READY recommendation.

## Defects, causes, and fixes

| Defect | Root cause | Fix and observed after behavior |
|---|---|---|
| Legacy reservation folio charges after checkout or invoice | The legacy handler checked the dining booking and its payment state, but did not require a checked-in hotel stay or check for an invoice. It wrote expenses without coordinating with checkout. | The handler now requires a same-property checked-in stay with a guest, rejects any existing invoice, preserves the saved-price/payment checks, and atomically claims the dining booking. A transaction writes the hotel reservation version before posting, serializing the charge with food-order folios and checkout. Closed or invoiced stays return `409`; a reservation with no recorded historical price returns `400`. |
| Cancelled/terminal reservations reopened by staff | The legacy status endpoint accepted any schema-valid status and saved it without checking the current state. | An explicit backend transition map and conditional status update reject invalid transitions with `409`. `CANCELLED`, `NO_SHOW`, and `COMPLETED` cannot be reopened. A guest-cancelled booking remains cancelled and the arrival endpoint returns `409`. Existing supported progression and confirmed arrival remain available. |
| Concurrent bookings assigned the same table | The public route checked availability before inserting, without a shared database serialization point; it could also confirm a booking without a table. | Allocation now increments a hidden version field on the property-scoped restaurant inside a MongoDB transaction, then reads overlapping reservations and candidate tables and inserts the assigned booking in that transaction. The 90-minute overlap rule now also checks adjacent dates. Unassigned confirmations are disallowed; unavailable requests return a clear `409`. Five rounds of four simultaneous overlapping requests each accepted exactly one booking, with three clear rejections and one persisted table assignment. |
| Public access to inactive restaurant catalogues | Menu, buffet, and offer routes looked up a restaurant by property but did not require `active: true`. | Public menu, buffet, offers, availability, restaurant detail, and reservation creation now require an active restaurant in the current property. Direct requests return `404` for inactive venues; discovery omits them. Admin management remains available for inactive venues. |
| Tagline updates silently dropped | `tagline` was absent from the restaurant update field allowlist, and the model had no length limit. | Create/update now accept `tagline`, reject non-strings and values over 160 characters with `400`, and leave it unchanged when omitted. A subsequent public restaurant read returns the saved value. |

## Files changed

- `backend/controllers/restaurantController.js` — active catalogue guards, validated date/time and overlap calculations, transactional table allocation, explicit status transitions, transactional legacy folio checks/claim, and validated tagline allowlist.
- `backend/models/Restaurant.js` — 160-character tagline limit and hidden `reservationAllocationVersion` serialization field.
- `backend/services/restaurantOrderService.js` — moves the shared hotel-reservation version write ahead of the invoice check so order folio posting uses the same checkout serialization point.
- `backend/tests/restaurantOperations.test.js` — public allocation races, inactive catalogue access, tagline persistence, terminal/cancelled transitions and arrival, legacy folio eligibility/duplicates, and checkout races for both folio paths.
- `backend/tests/diningReservationController.test.js` — updates the pricing controller mock to exercise the transaction-backed allocation flow without a database connection.
- `backend/tests/restaurant.test.js` — records a historical reservation price in the valid legacy folio fixture and verifies tagline preservation, validation, and subsequent reads.

No route contract, authorization middleware, property-scoping rule, UI, database index, or external payment integration was changed.

## Transaction and data changes

There is no migration or new index. Existing restaurant documents acquire `reservationAllocationVersion` on their first allocation transaction; the field is excluded from normal reads. The restaurant-document write serializes all allocations for that venue across Node.js instances, while each transaction checks availability and inserts the booking atomically.

Both dining folio paths and checkout coordinate through a transaction write to the hotel `Reservation` document. The legacy and order folio paths reject invoiced stays rather than appending expenses outside an issued invoice. These guarantees require the transaction-capable MongoDB topology already expected by the application's Atlas configuration. No standalone fallback is used for public allocation or legacy folio posting.

## Regression coverage and results

The new tests were first run against the unfixed controller where practical. They reproduced: four overlapping requests all returning `201`, an invalid staff status change returning `200`, a cancelled booking being reopened, the inactive menu returning `200`, and a closed-stay legacy folio charge returning `200`. The remaining folio scenarios then run independently after the fix, including paid invoices, duplicates, historical pricing, and both checkout races.

| Command / run | Result |
|---|---|
| `cd backend && node --test tests/restaurantOperations.test.js` | **17 passed, 0 failed.** Includes five repeated four-request allocation races, legacy and food-order folio/checkout races, property isolation, duplicate settlement, signed callback replay, late callbacks, and cancellation handling. |
| `cd backend && node --test tests/diningReservationController.test.js` | **2 passed, 0 failed.** |
| `cd backend && node --test tests/diningPricing.test.js tests/payhereGatewayIntegration.test.js` | **19 passed, 0 failed.** PayHere tests used local fixtures; no gateway was contacted. |
| `tests/restaurant.test.js` with a disposable `MongoMemoryReplSet` and `node --test --test-force-exit` | **19 passed, 0 failed.** This includes the valid saved-price historical folio case and restaurant tagline update/read. |
| Full backend suite with a disposable MongoDB and `node --test --test-concurrency=1 --test-force-exit tests/*.test.js` | **Incomplete; no aggregate result.** The runner stalled in the existing broad-suite flow after earlier test failures and was stopped. The partial run showed failures in guest portal, housekeeping, maintenance/lost-and-found, payment routing, property isolation, and Step 3 verification. It also exposed stale legacy restaurant assertions; those were updated where directly related and the restaurant suite subsequently passed in isolation. Unrelated failures are not attributed to this change. |
| `cd frontend && CI=true ./node_modules/.bin/react-scripts test --watchAll=false --runInBand` | **16 passed, 1 failed.** Dining Operations, dining pricing, and venue schedule suites passed. `src/config/roleAccess.test.js` still fails its existing Finance Reports access expectation. |
| `cd frontend && CI=true npm test -- --watchAll=false --runInBand` | Bare Jest invocation fails to transform JSX/ES-module tests; CRA's test runner above was used for the substantive frontend result. |
| `cd frontend && npm run build` | **Passed.** Existing stale Browserslist-data warning only. |
| Syntax checks and `git diff --check` | **Passed.** |

## Before / after

- **Legacy folio:** Previously accepted a charge after checkout and outside a paid invoice. Now rejects checked-out/invoiced stays and concurrent duplicate claims; eligible checked-in stays with a saved historical price still post once.
- **Reservation status:** Previously allowed staff to change `CANCELLED` back to `CONFIRMED`, after which arrival succeeded. Now those status changes and arrival return `409`; supported transitions and valid arrival pass.
- **Table allocation:** Previously all four concurrent requests could confirm, with duplicate or missing assignments. Now each repeated four-request race accepted one assigned booking and rejected the other three.
- **Inactive catalogue:** Previously direct menu, buffet, and offer requests could return data for an inactive restaurant. Now public catalogue and booking requests are blocked while staff/admin management remains available.
- **Tagline:** Previously an update returned success but discarded the value. Now valid values persist and read back; omitted, wrong-type, and overlength cases behave as tested.

## Remaining risks and unverified behavior

- The complete backend suite did not produce a final summary; investigate and rerun it in the repository's isolated test harness before release.
- The integrated Chrome workflow was **not rerun after these changes**. The earlier regression report's browser pass is not treated as post-fix verification.
- Cross-instance allocation was verified through concurrent requests against a disposable single-node replica set, not against the deployed Atlas topology or multiple deployed application instances.
- Hosted PayHere checkout, provider-transported callbacks, production data, production indexes, and the live PayHere gateway were not used or verified.
- The 90-minute duration remains the current business rule. A future configurable dining duration would need to update the shared overlap calculation and its tests.

## Final recommendation: HOLD

The five fixes and their focused regression tests pass. Do not release until the full backend suite completes, the integrated Chrome workflow is rerun against an isolated environment, and transaction behavior is verified on the intended deployment topology. The frontend role-access failure is recorded separately and was not changed in this Dining task.
