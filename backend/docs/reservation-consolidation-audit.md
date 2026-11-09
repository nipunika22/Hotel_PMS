# Reservation Consolidation Audit

## Current Responsibilities

- `Reservation` owns staff operations, the guest, room, dates, rate, charges, lifecycle status, check-in/out timestamps, cancellation data, and invoice relationship.
- `Booking` is the customer portal projection. It owns the customer `User` link, portal payment fields, customer-facing booking status, and a compatibility reference to `Reservation`.
- Customer pages `CustomerHome`, `BookRoom`, `CustomerDashboard`, and `MyBookings` use Booking APIs. Staff pages and finance pages use Reservation APIs.
- Room availability was previously calculated in both `roomController` and `bookingController`; staff creation had a third variant. Invoice generation already links to `Reservation`.

## Canonical Relationship

`User` identifies the authenticated customer. `Guest` is the hotel profile used by operations. `Reservation` is the operational source of truth and references `Guest`, `Room`, and `createdBy User`. `Booking` remains a temporary customer compatibility projection referencing both `User` and canonical `Reservation`. `Invoice` references `Reservation`; payments update the invoice and do not create another booking record.

## Decisions

- **KEEP:** Reservation model/routes, Booking customer routes and model, invoice/payment relationships, existing RBAC and portal pages.
- **MIGRATE:** Availability checks, server-side pricing, customer reservation creation, and lifecycle validation into shared reservation services.
- **DEPRECATE:** New business rules in Booking. Booking remains only because the current customer portal reads and cancels it.
- **DO NOT CHANGE:** Authentication, authorization boundaries, customer/admin separation, finance module shape, and unrelated UI.

## Shared Rules

`services/availabilityService.js` uses half-open date ranges: an existing stay ending on a new stay's check-in date does not overlap. Cancelled, no-show, and checked-out reservations do not block dates. Maintenance and out-of-order rooms are never sellable. Customer-created canonical reservations are the only records counted when a Booking compatibility record already references them.

`services/reservationService.js` calculates charges on the server and enforces these transitions:

`Draft/Inquiry -> Confirmed -> Checked-In -> Checked-Out`

`Confirmed -> Cancelled` and `Confirmed -> No-Show` are terminal branches. Invalid transitions return HTTP 409 through the reservation controller.

## Room State Rules

Confirmation sets an assigned room to `Reserved`; check-in sets it to `Occupied`; checkout sets it to `Cleaning` and clears `currentReservation`; cancellation and no-show release the room. Housekeeping remains responsible for making a cleaned room `Available`. Maintenance and out-of-order states are preserved as unsellable states.

## Migration and Remaining Risk

No Booking collection or production-like data was deleted. Existing Booking records without a canonical reservation remain a compatibility concern and should be backfilled with an idempotent migration before the legacy model is retired. Concurrent writes still depend on the deployment's MongoDB transaction/locking configuration; the service performs the authoritative final check and returns HTTP 409, while a future replica-set deployment should wrap reservation creation and room update in a transaction.