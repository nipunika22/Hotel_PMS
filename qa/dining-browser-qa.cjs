#!/usr/bin/env node
/*
 * Isolated Dining browser QA using Chrome's built-in DevTools Protocol.
 * No application files are changed. Requires the backend and frontend dependencies
 * already installed and a Chrome binary; no browser framework is installed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { MongoMemoryReplSet } = require('../backend/node_modules/mongodb-memory-server');
const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'frontend', 'build');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts', 'dining-seating-order-payment');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (_) {}
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}${last ? ` (last: ${String(last).slice(0, 200)})` : ''}`);
}
function assertStatus(response, expected, label) {
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, got ${response.status}: ${JSON.stringify(response.body)}`);
}
async function jsonRequest(base, route, token, method = 'GET', body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: response.status, body: data };
}
function staticServer(root) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url || '/').split('?')[0]);
    const resolved = path.resolve(root, `.${requested}`);
    const file = resolved.startsWith(`${root}${path.sep}`) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()
      ? resolved : path.join(root, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return server;
}

let mongo, apiServer, chrome, ws, cdpSequence = 0;
const pending = new Map();
const qa = { checks: [], screenshots: [], viewportChecks: [], printPdfBytes: 0 };
const check = (name, detail) => { qa.checks.push({ name, detail }); console.log(`PASS ${name}: ${detail}`); };
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++cdpSequence;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); } }, 15000).unref();
});
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}
async function navigate(url) {
  await cdp('Page.navigate', { url });
  await waitFor(async () => await evaluate('document.readyState === "complete"'), `page load ${url}`);
  await delay(600);
}
async function bodyText() { return evaluate('document.body ? document.body.innerText : ""'); }
async function waitText(text, label = text) { await waitFor(async () => (await bodyText()).includes(text), label); }
async function clickText(selector, text, label = text) {
  const clicked = await evaluate(`(() => { const q=${JSON.stringify(text.toLowerCase())}; const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x => x.innerText.trim().toLowerCase().includes(q) && x.getClientRects().length); if(!e) return false; e.click(); return true; })()`);
  assert.ok(clicked, `Could not click ${label}`);
  await delay(350);
}
async function setValue(selector, value, type = 'input') {
  const set = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; const p=e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const d=Object.getOwnPropertyDescriptor(p,'value'); d.set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true})); if(${JSON.stringify(type)}==='input') e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  assert.ok(set, `Missing input ${selector}`);
  await delay(120);
}
async function screenshot(name, fullDocument = true) {
  const data = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullDocument, fromSurface: true });
  const file = path.join(ARTIFACTS, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
  qa.screenshots.push(path.relative(ROOT, file));
  console.log(`SCREENSHOT ${path.relative(ROOT, file)}`);
}
async function viewport(width, height = 900) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await delay(250);
  const result = await evaluate('({width:innerWidth, visualViewportWidth:visualViewport?.width, height:innerHeight, documentWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth})');
  const overflowingElements = await evaluate(`([...document.querySelectorAll('body *')].map(e=>({tag:e.tagName, className:typeof e.className==='string'?e.className:'', text:(e.innerText||'').trim().slice(0,50), left:Math.round(e.getBoundingClientRect().left), right:Math.round(e.getBoundingClientRect().right), width:Math.round(e.getBoundingClientRect().width), position:getComputedStyle(e).position})).filter(e=>e.right>${width}+2 || e.left < -2).sort((a,b)=>b.right-a.right).slice(0,12))`);
  const noOverflow = result.documentWidth <= width + 2 && result.bodyWidth <= width + 2;
  qa.viewportChecks.push({ path: await evaluate('location.pathname'), requestedWidth: width, ...result, noHorizontalOverflow: noOverflow, overflowingElements });
  if (!noOverflow) console.error(`LAYOUT ISSUE ${width}px ${await evaluate('location.pathname')}: ${JSON.stringify(result)}`);
}
async function allSupportedViewports() {
  for (const width of [1440, 1024, 768, 390, 360]) await viewport(width, width <= 390 ? 844 : 900);
}
async function saveAuth(token, user) {
  await evaluate(`localStorage.setItem('token',${JSON.stringify(token)}); localStorage.setItem('user',${JSON.stringify(JSON.stringify(user))});`);
}
async function withAuth(url, token, user) {
  await navigate(`${webOrigin}/`);
  await saveAuth(token, user);
  await navigate(url);
  await waitFor(async () => !(await evaluate('document.body.innerText.includes("Loading")')), 'authenticated screen');
}
let webOrigin, apiOrigin;

async function main() {
  assert.ok(fs.existsSync(CHROME), `Chrome binary not found: ${CHROME}`);
  assert.ok(fs.existsSync(path.join(BUILD, 'index.html')), 'frontend/build is missing; build with REACT_APP_API_URL set to the local API URL first');
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = mongo.getUri('dining_browser_qa');
  assert.match(mongoUri, /^mongodb:\/\/127\.0\.0\.1:\d+\/dining_browser_qa\?/);
  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'atlas';
  process.env.MONGO_URI = mongoUri;
  process.env.JWT_SECRET = 'disposable-dining-browser-qa-secret';
  process.env.PAYHERE_MERCHANT_ID = '1212345';
  process.env.PAYHERE_MERCHANT_SECRET = 'local-fixture-only-secret';
  process.env.PAYHERE_SANDBOX = 'true';
  process.chdir(os.tmpdir()); // Keep dotenv from loading any project credentials.

  const connectDB = require(path.join(ROOT, 'backend', 'config', 'db'));
  const app = require(path.join(ROOT, 'backend', 'server'));
  await connectDB();
  const express = require(path.join(ROOT, 'backend', 'node_modules', 'express'));
  app.use(express.static(BUILD));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(BUILD, 'index.html'));
  });
  apiServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { apiServer.once('listening', resolve); apiServer.once('error', reject); });
  const apiPort = apiServer.address().port;
  apiOrigin = `http://127.0.0.1:${apiPort}/api`;
  console.log(`QA API LISTENING http://127.0.0.1:${apiPort} DB=${mongoUri}`);
  assert.equal(apiServer.address().address, '127.0.0.1');
  const health = await fetch(`${apiOrigin}/health`);
  assert.equal(health.status, 200);
  check('isolated API', `own listener bound to loopback port ${apiPort}; ${mongoUri}`);

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: path.join(ROOT, 'frontend'), encoding: 'utf8', timeout: 120000,
    env: { ...process.env, REACT_APP_API_URL: apiOrigin, CI: 'true' }
  });
  if (build.status !== 0) throw new Error(`Local production build failed:\n${build.stdout}\n${build.stderr}`);
  console.log(`${build.stdout}${build.stderr}`);
  check('production frontend build', `compiled with REACT_APP_API_URL=${apiOrigin}`);

  const Restaurant = require(path.join(ROOT, 'backend', 'models', 'Restaurant'));
  const RestaurantReservation = require(path.join(ROOT, 'backend', 'models', 'RestaurantReservation'));
  const RestaurantOrder = require(path.join(ROOT, 'backend', 'models', 'RestaurantOrder'));
  const Payment = require(path.join(ROOT, 'backend', 'models', 'Payment'));
  const Property = require(path.join(ROOT, 'backend', 'models', 'Property'));
  const User = require(path.join(ROOT, 'backend', 'models', 'User'));
  const MenuItem = require(path.join(ROOT, 'backend', 'models', 'RestaurantMenuItem'));

  const login = async (email, password) => {
    const r = await jsonRequest(apiOrigin, '/auth/login', null, 'POST', { email, password });
    assertStatus(r, 200, `login ${email}`);
    return r.body;
  };
  const customer = await login('customer@hotel.com', 'password123');
  const admin = await login('admin@hotel.com', 'admin123');
  assert.equal(customer.role, 'customer');
  assert.equal(admin.role, 'admin');
  const restaurantsResponse = await jsonRequest(apiOrigin, '/restaurants');
  assertStatus(restaurantsResponse, 200, 'public restaurant discovery');
  const restaurants = restaurantsResponse.body.data;
  assert.ok(restaurants.length >= 2, 'Expected at least two seeded active restaurants');
  const venue = await Restaurant.findById(restaurants[0]._id);
  const otherVenue = await Restaurant.findById(restaurants[1]._id);
  assert.ok(venue && otherVenue && String(venue.property) === String(otherVenue.property));
  venue.reservationPricePerGuest = 250;
  venue.reservationPriceCurrency = 'LKR';
  await venue.save();
  const menuItems = await MenuItem.find({ restaurant: venue._id, property: venue.property, available: true, currency: 'LKR' }).sort({ sortOrder: 1 }).limit(2);
  assert.ok(menuItems.length === 2, `Expected two LKR menu items, found ${menuItems.length}`);

  webOrigin = `http://127.0.0.1:${apiPort}`;
  console.log(`QA WEB/API LISTENING ${webOrigin} (one owned loopback listener; no cross-origin requests)`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dining-chrome-profile-'));
  chrome = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--remote-allow-origins=*',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    'about:blank'
  ], { stdio: 'ignore' });
  const activeFile = path.join(profile, 'DevToolsActivePort');
  await waitFor(() => chrome.exitCode !== null ? Promise.reject(new Error('Chrome exited')) : fs.existsSync(activeFile), 'Chrome DevTools endpoint');
  const [debugPort] = fs.readFileSync(activeFile, 'utf8').trim().split('\n');
  const debugOrigin = `http://127.0.0.1:${debugPort}`;
  const target = await fetch(`${debugOrigin}/json/new?${encodeURIComponent(`${webOrigin}/`)}`, { method: 'PUT' }).then(r => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result || {});
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });

  // Main Admin operations dashboard and responsive smoke.
  await withAuth(`${webOrigin}/admin-dashboard`, admin.token, admin);
  await waitText('Room Status Board', 'Admin operations dashboard');
  await screenshot('19-admin-operations-dashboard-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('19b-admin-operations-dashboard-390');
  await viewport(1440, 900);

  // Admin menu management desktop/mobile screenshots and responsive smoke.
  await withAuth(`${webOrigin}/admin/menu-management`, admin.token, admin);
  await waitText('Menu Management', 'Admin Menu Management');
  await screenshot('17-admin-menu-restaurants-desktop');
  await viewport(390, 844);
  await screenshot('17b-admin-menu-restaurants-390');
  await viewport(1440, 900);
  await clickText('button', 'Manage Menu', 'open restaurant menu editor');
  await waitText('MANAGING MENU', 'restaurant menu editor');
  await screenshot('18-admin-menu-editor-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('18b-admin-menu-editor-390');
  check('admin menu management responsive layouts', 'restaurant picker and menu editor captured at 1440, 1024, 768, 390 and 360 pixels');

  // Customer discovers a venue, opens its public details/menu, and submits the real form.
  await withAuth(`${webOrigin}/restaurants`, customer.token, customer);
  await waitText(venue.name, 'active restaurant card');
  assert.ok((await bodyText()).includes(otherVenue.name));
  await screenshot('01-customer-discovery-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('01b-customer-discovery-390');
  await viewport(1365, 900);
  const slug = venue.slug;
  await navigate(`${webOrigin}/restaurants/${slug}`);
  await waitText(venue.name, 'restaurant detail');
  await waitFor(async () => (await bodyText()).toLowerCase().includes('menu'), 'restaurant menu');
  await screenshot('02-restaurant-details-menu-desktop');
  await viewport(1365);
  await viewport(390, 844);
  await screenshot('02b-restaurant-details-menu-390');
  await viewport(1365, 900);
  await clickText('button', 'Reserve a Table');
  await waitFor(async () => await evaluate('Boolean(document.querySelector("[role=dialog]"))'), 'reservation dialog');
  await waitFor(async () => await evaluate('Boolean(document.querySelector("[role=dialog] select option[value]")?.value)'), 'reservation restaurant choices');
  await setValue('[role="dialog"] select', String(venue._id), 'change');
  const reservationDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await setValue('[role="dialog"] input[type="date"]', reservationDate, 'change');
  await evaluate(`(() => { const e=[...document.querySelectorAll('.rest-guest-type-option')].find(x=>x.innerText.includes('Outside Guest')); if(e)e.click(); })()`);
  await setValue('[role="dialog"] input[placeholder="e.g. Eleanor Vance"]', 'Browser QA Guest');
  await setValue('[role="dialog"] input[placeholder="e.g. eleanor@example.com"]', 'browser.qa@example.test');
  await setValue('[role="dialog"] input[placeholder="+94 77 123 4567"]', '+94 77 000 1234');
  await setValue('[role="dialog"] textarea', 'Disposable Chrome workflow');
  await waitFor(async () => await evaluate('Boolean([...document.querySelectorAll("#dining-table-choice option")].find(option=>option.value))'), 'available table choices');
  const defaultTableId = await evaluate('document.querySelector("#dining-table-choice").value');
  const confirmReady = await evaluate('!document.querySelector("[role=dialog] button[type=submit]").disabled');
  assert.ok(defaultTableId && confirmReady, 'Confirm Reservation did not enable after availability returned a suggested table');
  const availableTableIds = await evaluate('[...document.querySelectorAll("#dining-table-choice option")].map(option=>option.value).filter(Boolean)');
  const selectedTableId = availableTableIds.find(id => id !== defaultTableId) || defaultTableId;
  if (selectedTableId !== defaultTableId) await setValue('#dining-table-choice', selectedTableId, 'change');
  await viewport(390, 844);
  await screenshot('02c-reservation-form-390');
  await viewport(1365, 900);
  await clickText('[role="dialog"] button[type="submit"]', 'Confirm Reservation');
  await waitText('RESERVATION CONFIRMED', 'reservation confirmation');
  await screenshot('03-reservation-confirmation-desktop');
  await viewport(390, 844);
  await screenshot('03b-reservation-confirmation-390');
  await viewport(1365, 900);
  const confirmationText = await evaluate('document.querySelector(".rest-confirmation-ref")?.innerText || ""');
  const confirmationNumber = confirmationText.match(/[A-Z0-9-]{6,}/)?.[0];
  assert.ok(confirmationNumber, `No reference in ${confirmationText}`);
  const reservation = await RestaurantReservation.findOne({ confirmationNumber });
  assert.ok(reservation, `Reservation ${confirmationNumber} was not persisted`);
  assert.equal(String(reservation.restaurant), String(venue._id));
  assert.equal(reservation.email, 'browser.qa@example.test');
  assert.equal(reservation.reservationTotalPrice, 500);
  assert.equal(String(reservation.table), String(selectedTableId));
  check('customer discovery/details/reservation', `${venue.name}; menu rendered; ref ${confirmationNumber}; persisted LKR ${reservation.reservationTotalPrice}`);

  // Confirm customer My Bookings shows the dining payment ledger independently.
  await navigate(`${webOrigin}/my-bookings?tab=dining`);
  await waitText(confirmationNumber, 'My Bookings dining reservation');
  const guestHistory = await bodyText();
  assert.ok(guestHistory.includes('Payment:'));
  const reservationHistory = await jsonRequest(apiOrigin, '/restaurants/my-reservations', customer.token);
  assertStatus(reservationHistory, 200, 'reservation payment history API');
  const initialLedger = reservationHistory.body.data.find(row => row._id === String(reservation._id));
  assert.ok(initialLedger, 'Customer reservation ledger not returned');
  const originalBalance = Number(initialLedger.outstandingBalance);
  assert.equal(originalBalance, 500);
  check('customer reservation payment history', `status ${reservation.status}, payment ${initialLedger.paymentStatus}, outstanding LKR ${originalBalance}; food order not yet created`);
  await screenshot('04-customer-my-bookings-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('05-customer-my-bookings-390');
  await viewport(1365, 900);

  // Staff uses the restaurant selected above, arrives guest, builds a multi-line bill and settles cash.
  await withAuth(`${webOrigin}/admin/restaurants/dashboard`, admin.token, admin);
  await waitText('Open a restaurant', 'staff restaurant selection');
  const selectedRestaurantLink = await evaluate(`Boolean(document.querySelector('a[href="/admin/restaurants/operations/${venue._id}"]'))`);
  assert.ok(selectedRestaurantLink, 'Selected venue missing from Restaurant Operations selection');
  assert.ok((await bodyText()).includes(otherVenue.name));
  await screenshot('06-staff-restaurant-selection-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('06b-staff-restaurant-selection-390');
  await viewport(1365, 900);
  await clickText(`a[href="/admin/restaurants/operations/${venue._id}"]`, venue.name);
  await waitText(venue.name, 'restaurant operations');
  await setValue('select[name="period"]', 'all', 'change');
  await waitText(confirmationNumber, 'staff reservation list');
  const ownRestaurantRows = await jsonRequest(apiOrigin, `/restaurants/admin/operations/${venue._id}/reservations?period=all`, admin.token);
  assertStatus(ownRestaurantRows, 200, 'selected restaurant reservation list');
  assert.ok(ownRestaurantRows.body.data.reservations.some(row => String(row._id) === String(reservation._id)));
  const otherRestaurantRows = await jsonRequest(apiOrigin, `/restaurants/admin/operations/${otherVenue._id}/reservations?period=all`, admin.token);
  assertStatus(otherRestaurantRows, 200, 'other restaurant reservation list');
  assert.ok(!otherRestaurantRows.body.data.reservations.some(row => String(row._id) === String(reservation._id)));
  check('reservation restaurant scoping', `${venue.name} has the booking; ${otherVenue.name} does not`);
  await screenshot('07-staff-reservations-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('08-staff-reservations-390');
  await screenshot('08-staff-reservations-390-viewport', false);
  await viewport(1365, 900);
  await clickText('button', 'Mark as arrived');
  await waitText('ARRIVED', 'arrival status');
  await clickText('button', 'Seat Guest');
  await waitText('SEATED', 'seated reservation status');
  const seatedRecord = await RestaurantReservation.findById(reservation._id);
  assert.equal(seatedRecord.status, 'SEATED');
  assert.ok(seatedRecord.seatedAt && seatedRecord.seatedBy);
  assert.equal(String(seatedRecord.table), String(selectedTableId));
  const seatedTable = await require('../backend/models/RestaurantTable').findById(selectedTableId);
  assert.equal(seatedTable.status, 'OCCUPIED');
  check('staff seating state', `SEATED at ${seatedRecord.seatedAt.toISOString()} on ${seatedTable.tableNumber}; staff id persisted`);
  await clickText('button', 'Create order');
  await waitText('Create order ·', 'order editor');
  const options = await evaluate('([...document.querySelectorAll("form select option")].filter(o=>o.value).map(o=>({id:o.value,text:o.textContent})))');
  assert.ok(options.length >= 2, `Need at least two menu choices, saw ${JSON.stringify(options)}`);
  await setValue('section.restaurant-detail form select', options[0].id, 'change');
  await clickText('section.restaurant-detail form button[type="button"]', 'Add item');
  await setValue('section.restaurant-detail form select', options[1].id, 'change');
  await clickText('section.restaurant-detail form button[type="button"]', 'Add item');
  await setValue('section.restaurant-detail form input[type="number"]', '2', 'input');
  await screenshot('09-order-editor-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('10-order-editor-390');
  await screenshot('10-order-editor-390-viewport', false);
  await viewport(1365, 900);
  await clickText('section.restaurant-detail form button.btn-primary', 'Save order');
  await waitText('Grand total', 'bill total');
  await clickText('.restaurant-bill button', 'Edit items');
  await waitText('Edit order ·', 'existing order editor');
  await setValue('section.restaurant-detail form input[type="number"]', '3', 'input');
  await screenshot('09b-order-edit-after-save-desktop');
  await clickText('section.restaurant-detail form button.btn-primary', 'Save order');
  await waitText('Grand total', 'updated bill total');
  const order = await RestaurantOrder.findOne({ reservation: reservation._id });
  assert.ok(order, 'Food order not persisted');
  const orderCatalog = await MenuItem.find({ _id: { $in: order.items.map(line => line.menuItem) } });
  const expectedTotal = order.items.reduce((sum, line) => {
    const catalogItem = orderCatalog.find(item => String(item._id) === String(line.menuItem));
    assert.ok(catalogItem, `Missing catalog item for ${line.name}`);
    assert.equal(Number(line.unitPrice), Number(catalogItem.price), `Server snapshot price for ${line.name}`);
    return sum + Number(catalogItem.price) * line.quantity;
  }, 0);
  assert.equal(Number(order.total), expectedTotal, 'Server total should reflect edited item quantity plus the second item');
  await screenshot('11-bill-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('12-bill-payment-controls-390');
  await screenshot('12-bill-payment-controls-390-viewport', false);
  const billText = await bodyText();
  assert.ok(billText.includes('Confirm settlement'));
  await evaluate('window.print=()=>{document.documentElement.dataset.qaPrintRequested="yes"}');
  await clickText('button', 'Print');
  assert.equal(await evaluate('document.documentElement.dataset.qaPrintRequested'), 'yes', 'Print control did not call window.print');
  await cdp('Emulation.setEmulatedMedia', { media: 'print' });
  const printLayout = await evaluate('({ bill: getComputedStyle(document.querySelector(".restaurant-bill")).visibility, controls: [...document.querySelectorAll(".restaurant-bill .restaurant-no-print")].map(el=>getComputedStyle(el).display) })');
  assert.equal(printLayout.bill, 'visible');
  assert.ok(printLayout.controls.every(value => value === 'none'), `Operational controls leaked into print: ${JSON.stringify(printLayout)}`);
  await cdp('Emulation.setEmulatedMedia', { media: 'screen' });
  const pdf = await cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  const pdfFile = path.join(ARTIFACTS, '11-printed-bill.pdf');
  fs.writeFileSync(pdfFile, Buffer.from(pdf.data, 'base64'));
  qa.printPdfBytes = fs.statSync(pdfFile).size;
  assert.ok(qa.printPdfBytes > 1000);
  await viewport(1365, 900);
  await setValue('.restaurant-bill form select', 'CASH', 'change');
  await setValue('.restaurant-bill form input[type="number"]', String(order.total));
  await clickText('.restaurant-bill form button.btn-primary', 'Confirm settlement');
  await waitText('Paid', 'cash settlement receipt');
  await delay(400);
  const paidOrder = await RestaurantOrder.findById(order._id);
  const payment = await Payment.findOne({ restaurantOrder: order._id });
  assert.equal(payment.paymentStatus, 'completed');
  assert.equal(payment.paymentMethod, 'Cash');
  assert.equal(Number(payment.amount), expectedTotal);
  check('server-priced bill and cash settlement', `2×${order.items[0].name} + ${order.items[1].name} = LKR ${expectedTotal}; one Cash payment recorded`);
  await screenshot('13-cash-receipt-desktop');

  // An unpaid order is inserted through the same local authenticated API to exercise the dashboard exclusion.
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const secondBooking = await jsonRequest(apiOrigin, `/restaurants/${venue._id}/reservations`, customer.token, 'POST', {
    guestType: 'Outside Guest', customerName: 'Unpaid QA Guest', email: 'unpaid.qa@example.test', phone: '+94 77 000 9999',
    date: tomorrow, time: '19:00', guestCount: 2, seatingPreference: 'Indoor', diningType: 'À la carte', occasion: 'Casual Dining'
  });
  assertStatus(secondBooking, 201, 'unpaid fixture reservation');
  const unpaidReservationId = secondBooking.body.data._id;
  const opRoot = `/restaurants/admin/operations/${venue._id}`;
  const arrival = await jsonRequest(apiOrigin, `${opRoot}/reservations/${unpaidReservationId}/arrival`, admin.token, 'PUT');
  assertStatus(arrival, 200, 'unpaid fixture arrival');
  const seat = await jsonRequest(apiOrigin, `${opRoot}/reservations/${unpaidReservationId}/seat`, admin.token, 'PUT');
  assertStatus(seat, 200, 'unpaid fixture seating');
  const unpaidCreate = await jsonRequest(apiOrigin, `${opRoot}/reservations/${unpaidReservationId}/order`, admin.token, 'POST', {
    items: [{ menuItem: String(menuItems[0]._id), quantity: 1 }]
  });
  assertStatus(unpaidCreate, 201, 'unpaid fixture order');

  await clickText('button', 'Close bill');
  await clickText('button', 'Sales');
  await waitText('Collected sales', 'sales dashboard');
  const salesText = await bodyText();
  assert.ok(salesText.includes('Collected sales') && salesText.includes('Cash'));
  const normalizedSalesText = salesText.replace(/[\s\u00a0,]/g, '');
  assert.ok(normalizedSalesText.includes(`LKR${expectedTotal}`) || normalizedSalesText.includes(`LKR${expectedTotal}.00`), `Collected total ${expectedTotal} not visible in sales: ${salesText.slice(0, 1000)}`);
  const dashboard = await jsonRequest(apiOrigin, `${opRoot}/sales?from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`, admin.token);
  assertStatus(dashboard, 200, 'restaurant sales API');
  assert.equal(Number(dashboard.body.data.collectedSales.LKR), expectedTotal);
  assert.equal(Number(dashboard.body.data.cash.LKR), expectedTotal);
  assert.equal(Number(dashboard.body.data.unpaidOrders), 1);
  assert.equal(Number(dashboard.body.data.paidOrders), 1);
  const otherSales = await jsonRequest(apiOrigin, `/restaurants/admin/operations/${otherVenue._id}/sales?from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`, admin.token);
  assertStatus(otherSales, 200, 'other restaurant sales API');
  assert.equal(Number(otherSales.body.data.collectedSales.LKR || 0), 0);
  check('sales and restaurant isolation', `collected LKR ${expectedTotal}, Cash LKR ${expectedTotal}, paid=1 unpaid=1; ${otherVenue.name} collected LKR 0`);
  await screenshot('14-sales-dashboard-desktop');
  await allSupportedViewports();
  await viewport(390, 844);
  await screenshot('15-sales-dashboard-390');
  await screenshot('15-sales-dashboard-390-viewport', false);

  // Customer access is denied both by the route guard and API authorization.
  await withAuth(`${webOrigin}/admin/restaurants/operations/${venue._id}`, customer.token, customer);
  const customerUrl = await evaluate('location.pathname');
  const customerView = await bodyText();
  assert.ok(!customerUrl.includes('/admin/restaurants/operations/') || customerView.toLowerCase().includes('unauthorized'));
  const customerApi = await jsonRequest(apiOrigin, `${opRoot}/reservations`, customer.token);
  assertStatus(customerApi, 403, 'customer staff API denial');
  const anonymousApi = await jsonRequest(apiOrigin, `${opRoot}/reservations`, null);
  assertStatus(anonymousApi, 401, 'anonymous staff API denial');
  check('customer staff authorization', `route ${customerUrl}; customer API ${customerApi.status}; anonymous API ${anonymousApi.status}`);

  // Wrong restaurant and wrong property scope are concealed from staff.
  const wrongVenue = await jsonRequest(apiOrigin, `/restaurants/admin/operations/${otherVenue._id}/reservations/${reservation._id}/arrival`, admin.token, 'PUT');
  assertStatus(wrongVenue, 404, 'cross-restaurant arrival');
  const chain = await require(path.join(ROOT, 'backend', 'models', 'HotelChain')).findOne({ code: 'GHHG' });
  const foreignProperty = await Property.create({ chain: chain._id, name: 'Disposable Foreign QA Property', code: `BQA-${Date.now()}`, country: 'Sri Lanka', city: 'Kandy', currency: 'LKR', status: 'Active' });
  const foreignVenue = await Restaurant.create({ property: foreignProperty._id, name: 'Disposable Foreign QA Restaurant', slug: `foreign-qa-${Date.now()}`, cuisine: 'QA', location: 'QA', openingHours: 'Daily', active: true });
  const wrongProperty = await jsonRequest(apiOrigin, `/restaurants/admin/operations/${foreignVenue._id}/reservations`, admin.token);
  assert.equal([403, 404].includes(wrongProperty.status), true, `cross-property request returned ${wrongProperty.status}`);
  check('cross-restaurant/property access', `wrong restaurant ${wrongVenue.status}; wrong property ${wrongProperty.status}`);

  // Customer returns to My Bookings: cash food settlement must leave reservation ledger alone.
  await withAuth(`${webOrigin}/my-bookings?tab=dining`, customer.token, customer);
  await waitText(confirmationNumber, 'customer booking after food settlement');
  const finalHistory = await bodyText();
  assert.ok(finalHistory.includes('Payment:'));
  const savedReservationAfterFoodPayment = await RestaurantReservation.findById(reservation._id);
  const finalReservationHistory = await jsonRequest(apiOrigin, '/restaurants/my-reservations', customer.token);
  assertStatus(finalReservationHistory, 200, 'reservation payment history after order settlement');
  const finalLedger = finalReservationHistory.body.data.find(row => row._id === String(reservation._id));
  assert.equal(Number(finalLedger.outstandingBalance), originalBalance);
  assert.equal(finalLedger.paymentStatus, initialLedger.paymentStatus);
  check('reservation and food payment ledgers remain separate', `reservation ${finalLedger.paymentStatus}, due LKR ${finalLedger.outstandingBalance}; order Cash LKR ${payment.amount}`);
  await screenshot('16-customer-history-after-food-payment');

  qa.environment = { mongoUri, apiOrigin, webOrigin, chrome: CHROME, automation: 'Chrome DevTools Protocol via Node built-in WebSocket' };
  qa.reservation = { reference: confirmationNumber, restaurant: venue.name, restaurantId: String(venue._id), tableId: String(reservation.table), amount: reservation.reservationTotalPrice, statusAtCreation: reservation.status, finalStatus: seatedRecord.status };
  qa.order = { orderNumber: order.orderNumber, total: expectedTotal,
    items: order.items.map(item => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
    paymentMethod: payment.paymentMethod, printPdfBytes: qa.printPdfBytes };
  fs.writeFileSync(path.join(ARTIFACTS, 'evidence.json'), JSON.stringify(qa, null, 2));
  console.log(`EVIDENCE ${path.relative(ROOT, path.join(ARTIFACTS, 'evidence.json'))}`);

  // Mandatory focused regression smoke after browser session.
  const focused = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--test-force-exit',
    'tests/restaurantOperations.test.js', 'tests/diningReservationController.test.js',
    'tests/diningPricing.test.js', 'tests/payhereGatewayIntegration.test.js', 'tests/restaurant.test.js'
  ], { cwd: path.join(ROOT, 'backend'), encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', DB_MODE: 'atlas', MONGO_URI: mongoUri, JWT_SECRET: 'disposable-dining-browser-qa-secret', PAYHERE_MERCHANT_ID: '1212345', PAYHERE_MERCHANT_SECRET: 'local-fixture-only-secret' }, timeout: 120000 });
  fs.writeFileSync(path.join(ARTIFACTS, 'focused-regression.log'), `${focused.stdout || ''}${focused.stderr || ''}`);
  assert.equal(focused.status, 0, `Focused regression suite failed; see ${path.join(ARTIFACTS, 'focused-regression.log')}`);
  const summary = (focused.stdout || '').match(/ℹ tests \d+[\s\S]*?ℹ duration_ms [^\n]+/g)?.at(-1) || 'Focused suite completed with exit code 0';
  console.log(`REGRESSION ${summary.replaceAll('\n', ' | ')}`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (ws && ws.readyState === WebSocket.OPEN) { try { ws.close(); } catch (_) {} }
  if (chrome && chrome.exitCode === null) chrome.kill('SIGTERM');
  if (apiServer) await new Promise(resolve => apiServer.close(resolve));
  try { const mongoose = require(path.join(ROOT, 'backend', 'node_modules', 'mongoose')); if (mongoose.connection.readyState) await mongoose.disconnect(); } catch (_) {}
  if (mongo) await mongo.stop();
});
