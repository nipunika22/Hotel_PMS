# Dining Module Post-Fix Browser QA Report

**Run date:** 26 November 2026  
**Recommendation:** **HOLD**

The desktop customer-to-sales workflow completed successfully in Chrome on a disposable replica set. The browser verified that food-order settlement leaves the reservation payment ledger unchanged, and the API rejected customer, anonymous, cross-restaurant, and cross-property access. The 57 focused Dining backend assertions passed again after browser testing.

The 390px checks found reproducible responsive layout failures in staff restaurant selection and operations screens. Several staff pages expand the document to 490–614 CSS pixels at a requested 390px viewport, and the customer dining card in My Bookings clips its details. These issues prevent a READY recommendation. No business logic or application code was changed.

## Browser automation and safety

- **Browser:** Google Chrome 158.0.8127.89, headless.
- **Automation:** Chrome DevTools Protocol using Node's built-in `WebSocket`. No Playwright, Puppeteer, or equivalent framework was installed in either package tree. This used Chrome's existing automation protocol without adding a competing framework or dependencies.
- **Reusable harness:** [qa/dining-browser-qa.cjs](qa/dining-browser-qa.cjs). It builds the frontend with a local API URL, starts the backend on a dynamically assigned `127.0.0.1` port, starts a disposable `MongoMemoryReplSet`, drives Chrome, captures screenshots/PDF/evidence, then runs the focused backend suite.
- **Exact command:** `node qa/dining-browser-qa.cjs`.
- **Final run environment:** MongoDB URI `mongodb://127.0.0.1:51879/dining_browser_qa?replicaSet=testset`; API and frontend shared the harness-owned loopback listener at `http://127.0.0.1:51926`. The harness printed and checked its own startup banner and health endpoint. It did not contact ports 5000 or 5001.
- The harness changed to the OS temp directory before loading the app so dotenv could not read project credentials. Demo accounts and fixture data were used only in the in-memory database. PayHere used dummy local configuration; there was no gateway or production call. Chrome DNS rules blocked non-loopback traffic, including external image/font hosts.
- The prior report's port-5001 uncertainty remains unresolved. This run did not inspect or modify that service.

## Workflow results

| Step | Result |
|---|---|
| Customer discovers active venues | **PASS.** Two active venue cards rendered. The customer opened Azure Tide Seafood Restaurant's details and menu. |
| Customer creates a reservation | **PASS.** The browser submitted the actual reservation form for the next day. MongoDB stored reference `RST-2611-8587`, the selected restaurant, customer details, and server-priced LKR 500 reservation total. |
| Staff selects the restaurant | **PASS.** Restaurant Operations selection showed Azure Tide and Spice & Silk. The browser selected Azure Tide, then found the customer's reservation under that venue. |
| Staff marks arrival | **PASS.** Arrival action completed and the reservation row updated. |
| Staff creates a multi-item order | **PASS.** The UI added Azure Tide Signature Coastal Tonic (quantity 2) and Catch of the Day in Herb Crust (quantity 1). The saved server total was LKR 19,300, matching the catalog prices: `2 × 2,400 + 14,500`. |
| Staff prints the bill | **PASS.** The UI Print control was clicked and its instrumented `window.print` invocation verified. Chrome's `Page.printToPDF` generated [the bill PDF](qa-artifacts/dining-post-fix/11-printed-bill.pdf) (175,457 bytes). The PDF text was not independently extracted because `pdftotext` is unavailable. |
| Staff settles with cash | **PASS.** One completed LKR 19,300 Cash Payment was recorded for the order. |
| Sales dashboard | **PASS.** Azure Tide showed LKR 19,300 collected, all in Cash. It showed one paid order and one unpaid order; the unpaid order was excluded from collected sales. Spice & Silk showed LKR 0 collected. The unpaid order was created through the isolated authenticated API fixture, not through the browser order editor. |
| Customer payment history | **PASS for ledger separation.** My Bookings showed the dining reservation as `CONFIRMED`, `Unpaid`, with LKR 500 due after the food order's LKR 19,300 Cash payment. The reservation balance/status were unchanged. This browser run did not collect a reservation payment; successful reservation callback/history cases remain covered by the focused backend tests. |
| Authorization | **PASS.** A customer opening the staff route was redirected to `/`. The customer operations API request returned `403`; an anonymous request returned `401`. Wrong-restaurant arrival and wrong-property listing requests each returned `404`. |

## Responsive results at 390px

Chrome received a 390×844 device emulation. Viewport captures are 390×844; the companion full-document captures preserve evidence of pages that expanded wider than the requested viewport.

| Screen | Result |
|---|---|
| Public restaurant cards, restaurant details/menu, reservation form/confirmation | **PASS for document width.** `documentWidth` and `bodyWidth` remained 390px. |
| Customer My Bookings | **Layout issue.** Overall document width remained 390px, but the dining reservation card's image/detail columns leave too little room for the details; the restaurant/reference/date text is visibly clipped at the right edge. |
| Staff restaurant selection | **Layout issue.** At a requested 390px, document/body width measured 490px. |
| Staff reservation list | **Layout issue.** Document/body width measured 610px; reservation table columns extend past the requested viewport. |
| Order editor | **Layout issue.** Document width measured 607px and body width 606px. The editor contents remain usable in the captured section, but the page is horizontally wider than the viewport. |
| Bill and payment controls | **Layout issue.** Document/body width measured 613px. |
| Sales dashboard | **Layout issue.** Document/body width measured 610px. |

The staff selection/list/editor/bill/sales overflows are reproducible in the final run and are visible in the screenshots. The suite did not alter CSS or attempt a fix.

## Screenshots and evidence

Full-resolution files are under [qa-artifacts/dining-post-fix](qa-artifacts/dining-post-fix). The run summary and measured viewport widths are in [evidence.json](qa-artifacts/dining-post-fix/evidence.json); the post-browser backend output is in [focused-regression.log](qa-artifacts/dining-post-fix/focused-regression.log).

- Customer discovery: [desktop](qa-artifacts/dining-post-fix/01-customer-discovery-desktop.png), [390px](qa-artifacts/dining-post-fix/01b-customer-discovery-390.png).
- Restaurant details/menu: [desktop](qa-artifacts/dining-post-fix/02-restaurant-details-menu-desktop.png), [390px](qa-artifacts/dining-post-fix/02b-restaurant-details-menu-390.png).
- Reservation form and confirmation: [form at 390px](qa-artifacts/dining-post-fix/02c-reservation-form-390.png), [confirmation desktop](qa-artifacts/dining-post-fix/03-reservation-confirmation-desktop.png), [confirmation 390px](qa-artifacts/dining-post-fix/03b-reservation-confirmation-390.png).
- Staff venue selection: [desktop](qa-artifacts/dining-post-fix/06-staff-restaurant-selection-desktop.png), [390px full page](qa-artifacts/dining-post-fix/06b-staff-restaurant-selection-390.png).
- Staff reservations: [desktop](qa-artifacts/dining-post-fix/07-staff-reservations-desktop.png), [390px full page](qa-artifacts/dining-post-fix/08-staff-reservations-390.png), [390×844 viewport](qa-artifacts/dining-post-fix/08-staff-reservations-390-viewport.png).
- Order editor: [desktop](qa-artifacts/dining-post-fix/09-order-editor-desktop.png), [390px full page](qa-artifacts/dining-post-fix/10-order-editor-390.png), [390×844 viewport](qa-artifacts/dining-post-fix/10-order-editor-390-viewport.png).
- Bill/payment: [desktop bill](qa-artifacts/dining-post-fix/11-bill-desktop.png), [390px full page](qa-artifacts/dining-post-fix/12-bill-payment-controls-390.png), [390×844 viewport](qa-artifacts/dining-post-fix/12-bill-payment-controls-390-viewport.png), [cash receipt](qa-artifacts/dining-post-fix/13-cash-receipt-desktop.png).
- Sales: [desktop](qa-artifacts/dining-post-fix/14-sales-dashboard-desktop.png), [390px full page](qa-artifacts/dining-post-fix/15-sales-dashboard-390.png), [390×844 viewport](qa-artifacts/dining-post-fix/15-sales-dashboard-390-viewport.png).
- Customer history after food settlement: [My Bookings](qa-artifacts/dining-post-fix/16-customer-history-after-food-payment.png).

## Regression smoke after browser testing

The harness reran the focused Dining backend files after the browser session:

```sh
node --test --test-concurrency=1 --test-force-exit \
  tests/restaurantOperations.test.js \
  tests/diningReservationController.test.js \
  tests/diningPricing.test.js \
  tests/payhereGatewayIntegration.test.js \
  tests/restaurant.test.js
```

**Result: 57 passed, 0 failed, 0 cancelled, 0 skipped.** This includes the five prior defect regressions: closed/invoiced folio rejection, terminal status transitions, concurrent table allocation, inactive catalogues, and tagline persistence/validation. Transaction and checkout/folio concurrency coverage passed on the disposable single-node replica set. No Atlas or multi-instance deployment claim is made.

The normal frontend production build was restored after browser testing with `cd frontend && npm run build`; it compiled successfully with the existing stale Browserslist-data warning. The browser harness's local-API build was not left as the active build configuration.

## Remaining unverified items

- A successful reservation payment/callback was not performed in Chrome; reservation payment-ledger callback behavior was covered by the 57 backend assertions.
- The unpaid-order exclusion fixture used the local API rather than the browser order editor.
- External restaurant photos/fonts were blocked by the harness's no-external-network rule, so external asset loading was not evaluated.
- Print output was generated by Chrome, but PDF text/content was not separately extracted.
- The prior port-5001 harness incident remains outside this run and its potential impact is unknown.
- The 390px staff operations and My Bookings layout issues require a separate targeted UI fix and retest.

## Final recommendation: HOLD

The desktop workflow, payment/sales separation, access checks, and focused regression tests passed. The customer-to-sales workflow is not release-ready at 390px: staff selection, reservations, order editor, bill/payment controls, and sales pages have measurable horizontal overflow, and the customer dining card clips information. Address these responsive issues in a separate targeted change and rerun the browser checks before release.
