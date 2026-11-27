# Restaurant Operations QA Report

## Scope and release verdict

**Core food-order workflow passed. Payment recovery and legacy dining-reservation settlement failed.** A failed food-order PayHere attempt leaves the order locked without a usable recovery path. In the legacy reservation flow, the payment ledger can show completed while the reservation shows zero paid, another payment reference can be issued after full collection, and a late callback can reopen a cancelled reservation.

The audit used the existing Express routes and production frontend build with disposable MongoDB fixtures. Transaction scenarios ran on a temporary replica set. In the browser harness, the built app’s API destination was redirected in memory to the temporary server. The guest reservation path was exercised via the actual public API, and the staff workflow via Chrome. PayHere callbacks were signed with test credentials. No production database or gateway was contacted. The report is the only repository file added for this audit.

## Execution evidence

| ID | Execution | Observed result |
|---|---|---|
| A1 | Node suites for restaurant operations, dining pricing and reservation controller, PayHere integration, unified payments, room lifecycle, and department permissions | **68 passed.** [Operations](backend/tests/restaurantOperations.test.js) · [Gateway](backend/tests/payhereGatewayIntegration.test.js) · [Permissions](backend/tests/departmentPermissions.test.js) |
| A2 | CRA Jest runner for restaurant operations and dining pricing | **7 passed.** [Operations UI](frontend/src/pages/RestaurantOperations.test.js) · [Pricing](frontend/src/config/diningPricing.test.js) |
| A3 | Temporary API harness with six existing operations cases and six additional probes, run against the real route handlers | **12 harness tests passed.** Some probes assert the defective response to demonstrate reproducibility. Those scenarios are marked **FAIL** below. The harness and fixtures were kept outside the repository. |
| A4 | Headless Chrome using the built app, real route handlers, and temporary MongoDB | Passed public reservation API creation, staff venue selection, arrival, order, bill, cash receipt and sales. Verified Print button invocation, print-media styles, a 78,495-byte PDF and bill fit at 390 px. |

## Business scenario results

| # | Scenario | Expected | Actual | Verdict and evidence |
|---|---|---|---|---|
| 1 | Customer reservation | Public booking persists against the selected venue and customer. | Authenticated POST returned 201. MongoDB stored the customer, restaurant, property and CONFIRMED status. My Reservations returned the same record. | **PASS** · A3, A4 · [Creation](backend/controllers/restaurantController.js#L484) |
| 2 | Correct restaurant listing | Confirmation appears only in its own venue. | Correct venue returned one match, same-property sibling venue returned zero, and a foreign venue returned 404. Chrome opened the correct venue from its dashboard card. | **PASS** · A3, A4 · [Operations listing](backend/controllers/restaurantOperationsController.js#L117) |
| 3 | Mark as arrived | Eligible reservation shows ARRIVED while booking status is preserved. | API returned 200 and Chrome showed ARRIVED; booking stayed CONFIRMED. | **PASS** · A1, A4 · [Arrival](backend/controllers/restaurantOperationsController.js#L153) |
| 4 | Arrival persisted | Save arrival status, timestamp and recording staff. | Read-back confirmed all three fields and the correct staff ID. A legacy record without arrival metadata also accepted its first valid arrival. | **PASS** · A1, A4 · [Reservation schema](backend/models/RestaurantReservation.js) |
| 5 | Create order from menu | Arrived reservation can use the selected venue’s available menu. | Before arrival, 409. After arrival, 201 with a persisted order. Chrome selected an actual fixture menu item. | **PASS** · A1, A4 · [Order service](backend/services/restaurantOrderService.js#L46) |
| 6 | Multiple items and quantities | Save and edit distinct item lines and quantities on one order. | Rice ×2 and tea ×3 persisted. A subsequent edit saved rice ×3 and tea ×1. A second order for the same reservation was blocked. | **PASS** · A1 · [Order schema](backend/models/RestaurantOrder.js) |
| 7 | Server price calculation | Ignore submitted prices and protect saved snapshots when menu data changes. | Server returned LKR 1,876.50 despite manipulated prices. The revised order after a menu rename and price change retained the Rice snapshot and totalled LKR 2,375.50. | **PASS** · A1 · [Pricing](backend/services/restaurantOrderService.js) |
| 8 | Bill and print | Bill shows persisted lines and totals; print omits controls. | Chrome rendered the bill, invoked Print, verified visible bill content and hidden controls in print media, and generated a valid PDF. | **PASS** for browser/PDF · A1, A4 · [Bill](frontend/src/pages/RestaurantOperations.js#L237) · [Print styles](frontend/src/pages/RestaurantOperations.css) |
| 9 | Cash | Exact amount creates one completed payment; wrong amount is rejected. | LKR 2,376 for a LKR 2,375.50 bill returned 400. Correct amount completed once. Chrome independently recorded LKR 600 and displayed Receipt. | **PASS** · A1, A4 · [Settlement](backend/services/restaurantOrderService.js#L79) |
| 10 | External card | Record a valid terminal reference, rejecting missing or reused references. | Missing reference returned 400. First valid reference succeeded. Reuse on another bill returned 409 and rolled back its settlement lock. | **PASS** for recording · A1 · [Settlement](backend/services/restaurantOrderService.js#L79) · [Payment indexes](backend/models/Payment.js#L205) |
| 11 | Verified order PayHere callback | Initiation is pending; only a matching signed callback completes the payment. | Pending at initiation. Invalid signature and signed amount mismatch returned 400. Matching signed callback completed settlement once. | **PASS** for application callback · A1, A3 · [Webhook](backend/controllers/paymentController.js#L254) |
| 12 | Eligible hotel folio | Add one order expense to an eligible stay and include it in the hotel invoice. | Repeated posting produced one LKR 1,500 order expense. A separate LKR 225 legacy dining charge remained distinct. The hotel invoice included both and totalled LKR 3,725. | **PASS** · A1 · [Folio settlement](backend/services/restaurantOrderService.js) · [Hotel checkout](backend/controllers/reservationController.js) |
| 13 | Duplicate payment protection | Retries and concurrent payment channels yield at most one payment. | Two cash calls reused one record. Cash versus card produced one 200, one 409 and one payment record. | **PASS** · A1, A3 · [Settlement](backend/services/restaurantOrderService.js#L79) |
| 14 | Paid order edit | Reject edits after settlement. | PUT returned 409 and original bill subtotal remained. | **PASS** · A1 · [Order lock](backend/services/restaurantOrderService.js#L60) |
| 15 | Unpaid orders excluded from collected sales | Pending, unpaid and failed orders contribute zero; folio is separate. | Sales with unpaid orders were LKR 5,375.50. Verified failure did not change collected totals. LKR 1,500 folio appeared separately. | **PASS** · A1, A3 · [Sales](backend/controllers/restaurantOperationsController.js#L217) |
| 16 | Venue-specific sales and dates | Venue totals remain separate and collections are credited on their payment dates. | Second venue returned zero orders and no collections. Moving a paid order’s creation outside the range reduced order count while retaining its payment in collections and history. | **PASS** · A1 · [Sales](backend/controllers/restaurantOperationsController.js#L217) |
| 17 | Method breakdown | Breakdown reconciles to total collections; folio is distinct. | LKR 2,375.50 cash + LKR 1,500 card + LKR 1,500 PayHere = LKR 5,375.50. LKR 1,500 posted to folio separately. | **PASS** · A1 · [Sales](backend/controllers/restaurantOperationsController.js#L217) |
| 18 | Property and role isolation | An unapproved user cannot reach order or payment data. | Anonymous request returned 401; customer and rooms-only department admin returned 403. Staff assigned to another property received 404 on scoped bill and generic payment ID/reference reads. | **PASS** for food-order paths · A1, A3 · [Routes](backend/routes/restaurantRoutes.js#L38) · [Payment scope](backend/controllers/paymentController.js#L21) |
| 19 | Legacy dining reservation payment regression | Initiation, ledger, reservation balance, and duplicate protections agree. | Initiation returned saved LKR 600; signed success persisted a completed ledger record. Reservation stored paidAmount **0** and **Partially Paid**. Replaying the same callback did not duplicate the record, but another initiation produced a new reference. A separate cancelled booking reopened on late verified success. | **FAIL** · A3 · [Initiation](backend/controllers/paymentController.js#L127) · [Legacy callback](backend/controllers/paymentController.js#L332) |

## Edge cases

| Scenario | Expected | Actual | Verdict and evidence |
|---|---|---|---|
| Cancelled or no-show arrival | Reject arrival. | 409 for each state. | **PASS** · A1 · [Arrival](backend/controllers/restaurantOperationsController.js#L153) |
| Duplicate arrivals | Exactly one arrival and one set of metadata. | Parallel requests returned 200 and 409. Staff ID and time persisted once. | **PASS** · A1 · [Arrival](backend/controllers/restaurantOperationsController.js#L153) |
| Invalid and unavailable menu references | Reject malformed, nonexistent, wrong-venue and unavailable items. | 400 in all tested cases. Invalid creation wrote no order. | **PASS** · A1, A3 · [Order service](backend/services/restaurantOrderService.js) |
| Invalid quantities | Reject zero, negative, fractional, oversized and string quantities. | 0, −1, 1.5, 101 and string “2” returned 400. | **PASS** · A3 · [Order service](backend/services/restaurantOrderService.js) |
| Concurrent settlements | At most one winning channel or canonical retry. | Same-channel requests reused the payment. Cross-channel race returned one success and one conflict. | **PASS** · A1, A3 · [Settlement](backend/services/restaurantOrderService.js#L79) |
| Duplicate PayHere callbacks | At most one completion and completion audit entry. | Parallel valid callbacks returned 200; one completion entry persisted. | **PASS** · A1 · [Webhook](backend/controllers/paymentController.js#L254) |
| Payment failure and recovery | Failure adds no sales and has a controlled retry or reconciliation path. | Sales stayed unchanged. Editing and cash returned 409. PayHere retry returned 200 with failed status and no checkout payload. | **FAIL** · A3 · [Settlement lock](backend/services/restaurantOrderService.js#L92) · [Payment endpoint](backend/controllers/restaurantOperationsController.js#L195) · [Bill controls](frontend/src/pages/RestaurantOperations.js#L278) |
| Missing hotel stay | Reject folio and leave order available for another payment method. | Hotel Guest without linked stay received 409. No payment persisted and the settlement lock remained false. | **PASS** · A3 · [Folio validation](backend/services/restaurantOrderService.js) |
| Cross-restaurant bill or settlement | Deny even at another venue within same property. | Bill and payment requests returned 404. | **PASS** · A1, A3 · [Bill and payment](backend/controllers/restaurantOperationsController.js#L179) |
| Cross-property bill or payment | Deny staff assigned to the other property. | Operations and generic payment ID/reference requests returned 404. | **PASS** · A3 · [Operations](backend/controllers/restaurantOperationsController.js) · [Payment scope](backend/controllers/paymentController.js#L21) |
| Late legacy callback after cancellation | Reconcile payment without reopening the booking. | Verified late callback changed CANCELLED to CONFIRMED. | **FAIL** · A3 · [Legacy callback](backend/controllers/paymentController.js#L332) |

## Confirmed defects and recommended fixes

| ID | Severity | Defect and evidence | Recommended fix and regression criterion |
|---|---|---|---|
| QA-01 | High | **Food-order PayHere failure strands the order.** A verified failure retains the settlement lock. Retry returns a failed record without a checkout payload, and the UI presents no recovery. [Order service](backend/services/restaurantOrderService.js#L92) · [Payment handler](backend/controllers/restaurantOperationsController.js#L195) | Add a controlled reconciliation and retry path. Close or reconcile the old attempt before issuing another reference or permitting a different method. Verify late success on the old attempt cannot double-collect. |
| QA-02 | High | **Legacy balance misses the first completed payment.** The webhook reads the completed-payment ledger before saving the current completion. An LKR 600 ledger payment was complete while the reservation reported zero paid and Partially Paid. Replay did not repair the balance. [Callback](backend/controllers/paymentController.js#L332) | Persist and reconcile atomically, or include the current verified payment exactly once. Assert the ledger, reservation and guest display agree on first callback and replay. |
| QA-03 | High | **Legacy re-initiation can offer a second collection.** A different reference was issued after the entire reservation amount was collected in the local ledger. No processor was contacted. [Initiation](backend/controllers/paymentController.js#L127) | Derive remaining balance from the ledger before initiating, block fully paid or terminal bookings, and serialize initiation by reservation. |
| QA-04 | High | **Legacy callback can reopen a cancelled reservation.** Payment completion directly assigns CONFIRMED. [Callback](backend/controllers/paymentController.js#L332) | Preserve operational status and route late collections to reconciliation. Add a cancellation-plus-late-callback regression. |

The relevant legacy patterns also appear in the baseline source. This audit reproduced the failures in the current app. No baseline runtime comparison was performed.

## Security and data consistency risks from source review

These findings are code observations. They were outside the runtime probes.

- **Legacy public cancellation lacks an ownership check and has an unscoped lookup fallback.** Enforce owner or verified guest proof and retain property scope. This is separate from food-order property isolation, which passed. [Public routes](backend/routes/restaurantRoutes.js#L30) · [Cancellation](backend/controllers/restaurantController.js#L795)
- **Public hotel-stay lookup can select an active stay before matching the submitted room or email.** Require a verified match before returning contact or stay fields. [Stay lookup](backend/controllers/restaurantController.js#L419)
- **Public table allocation checks then inserts separately.** The non-unique slot index does not enforce overlapping table exclusion. Add atomic allocation and a parallel booking regression. [Allocator](backend/controllers/restaurantController.js#L484) · [Indexes](backend/models/RestaurantReservation.js#L185)
- **Legacy reservation status can change independently of order settlement.** Define cancellation and no-show behavior for paid or folio-posted orders, including reconciliation before conflicting transitions. [Legacy status handler](backend/controllers/restaurantController.js#L1463) · [Settlement](backend/services/restaurantOrderService.js#L79)

## Unverified and release recommendation

Live PayHere checkout, cross-domain return, webhook transport, provider-side duplicate protection and refunds remain **unverified**. The external card test covered staff recording only. Physical card processing, physical printer output, paper widths and other browsers were outside scope. Tests verified isolated MongoDB persistence and transactions. Production indexes and load behavior remain **unverified**. The legacy restaurant suite that uses configured database initialization was inspected and excluded to protect production data.

**Priority:** Fix failed-payment recovery, ledger reconciliation, and duplicate collection exposure before wider payment use. Resolve the public legacy authorization gaps before exposing those paths broadly. Keep both reservation-level and food-order settlement cases in the regression gate.
