# Dining Menu Management Implementation Report

## Existing implementation findings

- The project already had `Restaurant`, `RestaurantMenuCategory`, and `RestaurantMenuItem` models. Menu categories and items carry both `property` and `restaurant` references.
- Public restaurant detail/menu endpoints already read those records and group available items under active categories. They are scoped to the request's active property and selected restaurant.
- Restaurant Operations already loaded available menu items for the chosen venue, priced orders on the backend, and persisted item name and unit-price snapshots. Menu edits do not rewrite saved order lines.
- Existing admin CRUD endpoints were present, but category/item writes did not verify category-to-restaurant ownership. Category deletion cascaded into items, and menu-item deletion did not protect order history.
- Dining images elsewhere in the current UI are stored as image URLs. No active upload handler or configured image storage adapter was found in the application. The new form uses the existing image URL convention.

## Files created and modified

- Added [AdminMenuManagement.js](frontend/src/pages/AdminMenuManagement.js) and [AdminMenuManagement.css](frontend/src/pages/AdminMenuManagement.css) for the restaurant picker and restaurant-specific menu editor.
- Added [AdminMenuManagement.test.js](frontend/src/pages/AdminMenuManagement.test.js) and backend menu CRUD coverage in [restaurantOperations.test.js](backend/tests/restaurantOperations.test.js).
- Updated [restaurantController.js](backend/controllers/restaurantController.js) and [restaurantRoutes.js](backend/routes/restaurantRoutes.js) with category listing, restaurant/property ownership checks, name and price validation, safe deletion, and restaurant menu counts.
- Updated [restaurantOperationsController.js](backend/controllers/restaurantOperationsController.js) and [restaurantOrderService.js](backend/services/restaurantOrderService.js) so staff and order validation only accept available items in active categories for the selected restaurant.
- Updated [api.js](frontend/src/services/api.js), [App.js](frontend/src/App.js), [roleAccess.js](frontend/src/config/roleAccess.js), and [ManagementDashboards.js](frontend/src/pages/ManagementDashboards.js) to expose the feature in API helpers, protected routes, navigation, and the dining dashboard.
- Updated the frontend test script in [package.json](frontend/package.json) to use Create React App's Jest configuration. Updated the matching role navigation test for the new link and existing finance report access.
- Updated [dining-browser-qa.cjs](qa/dining-browser-qa.cjs) to capture the new screen and check its supported viewport widths.

## Data model and API

No duplicate menu models or database migrations were added. Existing category and menu item models remain the source of truth. Existing order item snapshots are unchanged.

Existing and extended endpoints:

- `GET /api/restaurants/admin/restaurants` — returns the current property's restaurants with item, available, and unavailable counts.
- `GET /api/restaurants/admin/categories?restaurantId=:id` — lists categories for one restaurant in the current property.
- `POST /api/restaurants/admin/categories`, `PUT /api/restaurants/admin/categories/:id`, `DELETE /api/restaurants/admin/categories/:id` — create, edit, activate/deactivate, and safely delete empty categories.
- `GET /api/restaurants/admin/menu-items?restaurantId=:id&categoryId=:id` — lists menu items scoped to the current property and optional restaurant/category.
- `POST /api/restaurants/admin/menu-items`, `PUT /api/restaurants/admin/menu-items/:id`, `DELETE /api/restaurants/admin/menu-items/:id` — create, edit, toggle availability, and delete/deactivate menu items.
- `GET /api/restaurants/admin/operations/:restaurantId/menu` — returns available items in active categories for that selected restaurant.

The menu CRUD endpoints remain protected by authentication, role checks, and the Dining department permission middleware. Restaurant and category lookups use `req.propertyId`; submitted `property`, `restaurant`, or category references cannot move records across properties or restaurants. Duplicate category names are rejected case-insensitively within the selected restaurant. Prices must be finite positive numbers. A category with items cannot be deleted. A menu item referenced by a restaurant order is deactivated instead of deleted.

## Admin workflow

Admins open **Menu Management** from the Restaurant Management sidebar or Dining dashboard. The picker loads active restaurants for the selected property and shows each restaurant's image (when usable), item count, available count, and unavailable count. **Manage Menu** opens a restaurant-specific view with category navigation, search, item cards, availability switches, item editing, category editing/deactivation, and guarded delete actions. The restaurant can be switched without losing property scope.

Items can be added or edited with name, description, restaurant-bound category, LKR price, availability, featured status, supported dietary tags, and image URL. The editor shows an image preview and prevents repeat submission while a save is in progress. No image binary upload is offered because the current application has no configured upload/storage integration for Dining.

## Customer menu and order integration

The customer restaurant detail/menu endpoints continue reading the same menu collections. They expose active categories and available items only for the selected restaurant/property. Existing reservation UI and workflow are untouched.

Restaurant Operations continues to use server-loaded prices. The backend rejects foreign-restaurant, unavailable, or inactive-category items for new order quantities and ignores client-submitted prices. Existing order lines retain their original names and unit prices; editing a menu item does not update order snapshots. Historical references also prevent hard deletion.

## Validation and testing

- `node --test --test-concurrency=1 tests/restaurantOperations.test.js` — **20 passed, 0 failed**. Includes CRUD validation, duplicate category, property/restaurant isolation, availability, order pricing, and snapshot preservation checks.
- `CI=true npm test -- --runInBand` — **21 passed, 0 failed** across 6 frontend suites.
- `node qa/dining-browser-qa.cjs` — production build succeeded; isolated browser QA completed **60 passed, 0 failed** across 5 regression suites. Existing reservation, seating, order, bill, payment, and sales checks passed.
- Browser viewport checks ran at **1440, 1024, 768, 390, and 360 px**. The new picker/editor had no horizontal overflow after the responsive sizing fix.

An earlier direct run of `restaurant.test.js` loaded the local `.env` and connected to the configured Atlas database instead of an isolated test database. Its fixtures hit duplicate-key errors. Because some tests had already run against that connection, test fixture writes may have reached the configured database before the run was stopped. That run is not counted as passing evidence. The project's isolated browser QA regression run completed successfully against its own local MongoDB database.

## Screenshots

- [Restaurant picker, desktop](qa-artifacts/dining-seating-order-payment/17-admin-menu-restaurants-desktop.png)
- [Restaurant picker, 390 px](qa-artifacts/dining-seating-order-payment/17b-admin-menu-restaurants-390.png)
- [Menu editor, desktop](qa-artifacts/dining-seating-order-payment/18-admin-menu-editor-desktop.png)
- [Menu editor, 390 px](qa-artifacts/dining-seating-order-payment/18b-admin-menu-editor-390.png)
- Full responsive/browser evidence: [evidence.json](qa-artifacts/dining-seating-order-payment/evidence.json)

## Remaining issues

- Food images can be attached by URL, following the existing Dining image convention. Binary upload needs a configured project image storage integration and is not implemented here.
- Existing invalid image URLs can render without a photo; failed image loads are hidden so they do not leave broken image glyphs or blank image frames.
- Category/item creation and editing are covered by isolated API/UI tests and the full Dining regression suite. The browser harness captures the management screens but does not submit a destructive admin edit against seeded content.
