# Restaurant Payment Security Fix Report

## 1. Root causes

| QA finding | Root cause | Implemented correction |
|---|---|---|
| QA-01 · Failed order payment recovery | A food order kept its settlement lock even after PayHere reported failure. The only linked Payment was permanently treated as the order’s current settlement. | A matching, verified terminal failure or cancellation can be superseded. The previous Payment retains its reference and audit trail. Its successor is the only current settlement. A browser cancel or return does not unlock the order. [Order settlement](backend/services/restaurantOrderService.js) · [Callback service](backend/services/diningPaymentService.js) |
| QA-02 · Stale reservation balance | The callback summed completed records before persisting the current payment. Customer and staff screens relied on different values. | The verified callback records the current attempt before reconciling the reservation in the same Atlas transaction. Guest and staff views use one ledger calculation, including prior collected amounts and recorded refunds. [Service](backend/services/diningPaymentService.js) · [Reservation controller](backend/controllers/restaurantController.js) |
| QA-03 · Duplicate reservation collection | Initiation used the reservation’s full price and reused pending attempts only for the same initiating user. It did not block fully collected reservations. | Initiation uses the outstanding ledger balance and serializes on the reservation. Same-user repeat requests reuse the pending reference. Conflicting attempts, folio postings, reconciliation exceptions and zero balances block collection. Legacy folio posting uses the same reservation lock and checks for online attempts. [Service](backend/services/diningPaymentService.js) · [Folio posting](backend/controllers/restaurantController.js) |
| QA-04 · Cancelled or completed booking reopened | A valid payment callback unconditionally set the reservation to CONFIRMED. | A genuinely new late collection is persisted and flagged for reconciliation. The business status stays unchanged. A replay of a payment originally collected before completion does not mark a new terminal-state exception. [Callback service](backend/services/diningPaymentService.js) |
| Public confirmation reference exposure | Public reads and cancellations treated a known reference as proof. Cancellation could fall back outside the property. | Both operations require the correct property. Reads require the owner or private guest key. Cancellations require ownership or guest proof, and guest cancellation is restricted to eligible pre-arrival states. [Controller](backend/controllers/restaurantController.js) · [Routes](backend/routes/restaurantRoutes.js) |
| Public hotel-stay lookup | The first query could select an arbitrary active stay before matching room or contact data. The booking endpoint linked a supplied stay ID by property alone. | Lookup requires the hotel reservation reference, email and phone. Optional room number must match. Only active-in-context stays are accepted and the response omits guest contact data. Booking validates the contact and room evidence again before linking the supplied ID. [Verification service](backend/services/diningGuestVerification.js) |

## 2. Files changed

- Added [diningPaymentService.js](backend/services/diningPaymentService.js) and [diningGuestVerification.js](backend/services/diningGuestVerification.js).
- Updated backend controllers and settlement service. [paymentController.js](backend/controllers/paymentController.js) · [restaurantController.js](backend/controllers/restaurantController.js) · [restaurantOperationsController.js](backend/controllers/restaurantOperationsController.js) · [restaurantOrderService.js](backend/services/restaurantOrderService.js)
- Updated routing, CORS and verification rate limits. [restaurantRoutes.js](backend/routes/restaurantRoutes.js) · [rateLimiter.js](backend/middleware/rateLimiter.js) · [server.js](backend/server.js)
- Updated schemas. [Payment.js](backend/models/Payment.js) · [RestaurantOrder.js](backend/models/RestaurantOrder.js) · [RestaurantReservation.js](backend/models/RestaurantReservation.js)
- Updated checkout, guest verification, and payment review screens. [RestaurantOperations.js](frontend/src/pages/RestaurantOperations.js) · [RestaurantReservationModal.js](frontend/src/components/RestaurantReservationModal.js) · [PaymentModal.js](frontend/src/components/PaymentModal.js) · [MyBookings.js](frontend/src/pages/MyBookings.js) · [PaymentSuccess.js](frontend/src/pages/PaymentSuccess.js) · [AdminRestaurants.js](frontend/src/pages/AdminRestaurants.js) · [AdminPayments.js](frontend/src/pages/AdminPayments.js) · [api.js](frontend/src/services/api.js)
- Added and aligned regressions. [restaurantOperations.test.js](backend/tests/restaurantOperations.test.js) · [restaurant.test.js](backend/tests/restaurant.test.js) · [cors.test.js](backend/tests/cors.test.js) · [RestaurantOperations.test.js](frontend/src/pages/RestaurantOperations.test.js)

## 3. Database changes

- **Payment** adds an indexed, sparse previousRestaurantOrder reference and reconciliation flag/reason. The existing sparse unique restaurantOrder index remains the constraint for the current settlement. When a terminal attempt is replaced, its history is retained under previousRestaurantOrder. The latest attempt gets restaurantOrder. This uses the existing Payment collection.
- **RestaurantOrder** adds an optional reconciliation flag that blocks further settlement. Archived provider collections remain visible in the payment ledger for review and are excluded from routine order sales. The current payment remains the ordinary order settlement.
- **RestaurantReservation** adds a reconciliation flag and an optional private guest token hash excluded from default query selection. Existing records remain readable without these fields. No bulk migration or payment history rewrite was run.
- Atlas transactions serialize checkout on the reservation/order and preserve folio and payment consistency. The existing standalone development fallback serializes reservation operations within one server process. Food-order transactions still require a replica set.

## 4. API and security changes

| API | Behavior |
|---|---|
| POST /api/payments/initiate with restaurant_dining | Selected property and owner or authorized dining staff are required. Amount is the outstanding balance. Returns the existing PayHere payload shape and a property-aware return URL. |
| POST /api/payments/payhere/notify | Applies signature, amount and currency checks before dining transitions. Terminal repeats do not credit twice. A verified superseded collection is recorded and flagged for review. |
| POST /api/restaurants/admin/operations/:restaurantId/orders/:orderId/payment | Accepts a new attempt only after a signed matching terminal PayHere failure or cancellation. An unresolved active or flagged settlement blocks a conflicting channel. |
| GET /api/restaurants/admin/operations/:restaurantId/orders/:orderId | Returns canRecoverPayment and reconciliation state. Staff UI can offer a retry or alternate valid method once the verified terminal result is visible. |
| GET /api/restaurants/reservations/:ref | Scoped to owner or a private key supplied in X-Dining-Guest-Token. Responses omit the stored token hash and are marked no-store. |
| PUT /api/restaurants/reservations/:ref/cancel | Scoped to owner or verified guest. New guest bookings require the private key. Legacy guest records without a linked account or token can verify using reference plus matching booking contact details. |
| POST /api/restaurants/lookup-hotel-stay | Requires hotel reference, booking email and booking phone. Optional room mismatch rejects the lookup. Results contain the stay and room reference only. |
| POST /api/restaurants/:id/reservations | Rechecks hotel stay identity before linking. A new anonymous booking returns its private management key once in the confirmation response. |

Public verification endpoints are rate-limited and scoped to the selected property. Email submission no longer automatically attaches a new anonymous booking to an account. Locally fabricated sandbox confirmation and generic edit/delete routes cannot mark dining payments paid or change their attempts. The existing hosted PayHere integration remains available.

## 5. Regression verification

| Case | Evidence |
|---|---|
| Food-order recovery | Failed signed attempt can be superseded by a fresh PayHere attempt. Signed cancellation allows switching to cash. Incorrect amount cannot release the order. |
| Superseded callback and replay | A genuinely collected older attempt is preserved once, flagged, and excluded from normal order sales. Current settlement and order history remain intact. |
| Legacy balance, partial collection and concurrent initiation | With LKR 200 already collected on a LKR 700 reservation, parallel initiation yields one LKR 500 reference. Callback replay leaves LKR 700 paid and zero due in MongoDB, guest view and staff view. A new initiation is rejected. |
| Terminal reservation lifecycle | Cancelled and completed bookings stay in their original states when a new late payment is received. Legitimate replay after prior collection does not generate a new flag. |
| Guest authorization | Reference-only reads and cancellation are denied. A wrong user or property is denied. Owner, valid guest key and legacy guest contact verification paths were covered. The preflight allows the guest-key header from permitted origins. |
| Hotel identity | Room-only lookup or wrong reference, email, phone or room is denied. Valid identity verifies the stay without returning contacts. A link request with wrong contact data is rejected; the verified link persists. |
| Frontend recovery | After a terminal failure, PayHere retry is available. After the bill enters reconciliation, checkout controls are suppressed. |

### Executed results

- **98 backend tests passed** across restaurant operations, dining pricing and controller tests, signed PayHere integration, unified payments, room lifecycle, department permissions, concierge rate limits and CORS. Tests used isolated fixtures only.
- **8 frontend tests passed** in the two targeted operations and pricing suites. The broader role run produced 14 passes and one known unrelated failure at [roleAccess.test.js](frontend/src/config/roleAccess.test.js#L24). That assertion expects Finance Reports access to be denied while the current configuration allows it.
- **Chrome passed** the food-order flow at 390 px. A signed local failure opened the recovery controls, staff switched to cash, and MongoDB retained the failed PayHere attempt beside the completed cash settlement.
- **Production frontend build passed.** Browserslist reported its existing outdated browser-data warning.
- The legacy Atlas-backed restaurant suite was updated for the intended verified-cancellation contract and excluded from execution. Equivalent scoped cancellation and hotel-linking cases ran with isolated fixtures.

## 6. Remaining limitations

- Live PayHere settlement, real callbacks from the provider, and real customer money movement were outside verification.
- A contradictory late provider success after a previously signed terminal callback may represent money already collected by the gateway. The system records it and flags reconciliation while keeping one current order settlement. The application cannot reverse the provider transaction or revoke an already opened hosted checkout. Refunds and resolution of reconciliation exceptions require the existing finance process or a separate authorized workflow.
- The verification limiter is process-local. Multi-instance deployments should enforce the same protections at a shared ingress or use shared throttling.
- A private guest key is issued once. New anonymous customers need to keep it to manage the booking later. Legacy anonymous cancellation without a stored key requires matching contact details as a compatibility path.
- Production data, live gateway transactions, and application deployment were outside this implementation.
