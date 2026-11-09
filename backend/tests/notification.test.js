// backend/tests/notification.test.js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
process.env.USE_IN_MEMORY_DB = "true";
process.env.MONGOMS_DOWNLOAD_DIR = "D:\\mongodb-binaries";

const connectDB = require("../config/db");
const app = require("../server");
const User = require("../models/User");
const Guest = require("../models/Guest");
const Property = require("../models/Property");
const Notification = require("../models/Notification");
const notificationService = require("../services/notificationService");

let server = null;
let BASE_URL = "";

const TEST_ID = Date.now();
let adminUser, adminToken;
let guestAUser, guestAToken, guestAGuest;
let guestBUser, guestBToken;
let housekeeperUser, housekeeperToken;
let pilotProperty;

describe("CENTRALIZED NOTIFICATION SYSTEM TEST SUITE", () => {
  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    pilotProperty = await Property.findOne({ code: "SL-MAIN" });
    if (!pilotProperty) {
      pilotProperty = await Property.create({
        name: "Sri Lanka Main Property",
        code: "SL-MAIN",
        country: "Sri Lanka",
        city: "Colombo",
        status: "Active"
      });
    }

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // Create Admin User
    adminUser = await User.create({
      name: `Admin_${TEST_ID}`,
      email: `admin_${TEST_ID}@hotel.com`,
      password: "Password123!",
      phone: "+94 77 123 4567",
      role: "admin",
      department: "Management",
      property: pilotProperty._id
    });

    // Create Guest A
    guestAUser = await User.create({
      name: `GuestA_${TEST_ID}`,
      email: `guesta_${TEST_ID}@example.com`,
      password: "Password123!",
      phone: "+94 77 222 3333",
      role: "customer"
    });

    guestAGuest = await Guest.create({
      firstName: "GuestA",
      lastName: `Test_${TEST_ID}`,
      email: `guesta_${TEST_ID}@example.com`,
      phone: "+94 77 222 3333",
      user: guestAUser._id,
      property: pilotProperty._id
    });
    guestAUser.guest = guestAGuest._id;
    await guestAUser.save();

    // Create Guest B
    guestBUser = await User.create({
      name: `GuestB_${TEST_ID}`,
      email: `guestb_${TEST_ID}@example.com`,
      password: "Password123!",
      phone: "+94 77 333 4444",
      role: "customer"
    });

    // Create Housekeeper User
    housekeeperUser = await User.create({
      name: `Housekeeper_${TEST_ID}`,
      email: `housekeeper_${TEST_ID}@hotel.com`,
      password: "Password123!",
      phone: "+94 77 444 5555",
      role: "housekeeping",
      department: "Housekeeping",
      property: pilotProperty._id
    });

    // Helper to get JWT
    const login = async (email, password) => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      return data.token;
    };

    adminToken = await login(adminUser.email, "Password123!");
    guestAToken = await login(guestAUser.email, "Password123!");
    guestBToken = await login(guestBUser.email, "Password123!");
    housekeeperToken = await login(housekeeperUser.email, "Password123!");
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it("1. Administrator can send a notification targeted to a selected guest", async () => {
    const res = await fetch(`${BASE_URL}/notifications/admin/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        audience: "guest",
        targetId: guestAGuest._id.toString(),
        title: "Exclusive Welcome Package",
        message: "Welcome to Serendib Sanctuary. Your personalized concierge is ready.",
        category: "reservation",
        priority: "high",
        actionUrl: "/my-bookings"
      })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.count, 1);
  });

  it("2. Only the targeted guest can retrieve their private notification; Guest B cannot see it", async () => {
    // Guest A checks notifications
    const resA = await fetch(`${BASE_URL}/notifications`, {
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    assert.strictEqual(resA.status, 200);
    const bodyA = await resA.json();
    assert.strictEqual(bodyA.success, true);
    const foundA = bodyA.notifications.find(n => n.title === "Exclusive Welcome Package");
    assert.ok(foundA, "Guest A must receive the welcome package notification");
    assert.strictEqual(foundA.isRead, false);

    // Guest B checks notifications
    const resB = await fetch(`${BASE_URL}/notifications`, {
      headers: { "Authorization": `Bearer ${guestBToken}` }
    });
    assert.strictEqual(resB.status, 200);
    const bodyB = await resB.json();
    const foundB = bodyB.notifications.find(n => n.title === "Exclusive Welcome Package");
    assert.strictEqual(foundB, undefined, "Guest B must NOT see Guest A's private notification");
  });

  it("3. Administrator can send a notification to a specific staff member", async () => {
    const res = await fetch(`${BASE_URL}/notifications/admin/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        audience: "individual",
        targetId: housekeeperUser._id.toString(),
        title: "VIP Room Inspection Required",
        message: "Please prepare Suite 101 for VIP arrival at 2:00 PM.",
        category: "housekeeping",
        priority: "urgent",
        actionUrl: "/housekeeping"
      })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.count, 1);

    // Housekeeper retrieves it
    const resHK = await fetch(`${BASE_URL}/notifications`, {
      headers: { "Authorization": `Bearer ${housekeeperToken}` }
    });
    const bodyHK = await resHK.json();
    const foundHK = bodyHK.notifications.find(n => n.title === "VIP Room Inspection Required");
    assert.ok(foundHK, "Housekeeper must receive individual task alert");
    assert.strictEqual(foundHK.priority, "urgent");
  });

  it("4. Department-targeted notification reaches eligible members of that department", async () => {
    const res = await fetch(`${BASE_URL}/notifications/admin/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        audience: "department",
        department: "Housekeeping",
        title: "Linen Restock Completed",
        message: "Fresh Egyptian cotton linens have arrived in the service hub.",
        category: "housekeeping",
        priority: "normal"
      })
    });

    assert.strictEqual(res.status, 201);

    // Housekeeper should receive this department broadcast
    const resHK = await fetch(`${BASE_URL}/notifications`, {
      headers: { "Authorization": `Bearer ${housekeeperToken}` }
    });
    const bodyHK = await resHK.json();
    const found = bodyHK.notifications.find(n => n.title === "Linen Restock Completed");
    assert.ok(found, "Housekeeper must receive department-level notification");

    // Guest A should NOT receive housekeeping department notification
    const resA = await fetch(`${BASE_URL}/notifications`, {
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    const bodyA = await resA.json();
    assert.strictEqual(
      bodyA.notifications.find(n => n.title === "Linen Restock Completed"),
      undefined,
      "Guest must not receive internal staff department notification"
    );
  });

  it("5. Unauthorized user (customer) cannot send notifications via admin endpoint", async () => {
    const res = await fetch(`${BASE_URL}/notifications/admin/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${guestAToken}`
      },
      body: JSON.stringify({
        audience: "all_users",
        title: "Malicious Broadcast",
        message: "This should be blocked."
      })
    });

    assert.strictEqual(res.status, 403, "Customer must be rejected with 403 Forbidden");
  });

  it("6. Guest B cannot mark Guest A's notification as read or access it directly", async () => {
    // Find Guest A's notification
    const notifA = await Notification.findOne({ recipient: guestAUser._id });
    assert.ok(notifA);

    // Guest B attempts to mark it as read
    const resB = await fetch(`${BASE_URL}/notifications/${notifA._id}/read`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${guestBToken}` }
    });

    assert.ok(resB.status === 400 || resB.status === 404, "Must deny unauthorized update of another's notification");

    // Notification in DB must still be unread
    const check = await Notification.findById(notifA._id);
    assert.strictEqual(check.isRead, false, "Notification must remain unread after unauthorized attempt");
  });

  it("7. Recipient can mark notification as read and unread count reflects the update", async () => {
    // Guest A checks initial unread count
    const resCount1 = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    const bodyCount1 = await resCount1.json();
    const initialUnread = bodyCount1.unreadCount;
    assert.ok(initialUnread >= 1, "Must have unread notifications");

    // Get an unread notification ID
    const notif = await Notification.findOne({ recipient: guestAUser._id, isRead: false });

    // Mark as read
    const resRead = await fetch(`${BASE_URL}/notifications/${notif._id}/read`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    assert.strictEqual(resRead.status, 200);

    // Verify unread count decreased
    const resCount2 = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    const bodyCount2 = await resCount2.json();
    assert.strictEqual(bodyCount2.unreadCount, initialUnread - 1);
  });

  it("8. Mark all as read updates all unread notifications for recipient to isRead: true", async () => {
    // Send two new notifications to Guest A
    await notificationService.createNotification({
      recipient: guestAUser._id,
      title: "Notice 1",
      message: "Test 1"
    });
    await notificationService.createNotification({
      recipient: guestAUser._id,
      title: "Notice 2",
      message: "Test 2"
    });

    // Mark all as read
    const resAll = await fetch(`${BASE_URL}/notifications/read-all`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    assert.strictEqual(resAll.status, 200);

    // Check count is now 0
    const resCount = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { "Authorization": `Bearer ${guestAToken}` }
    });
    const bodyCount = await resCount.json();
    assert.strictEqual(bodyCount.unreadCount, 0, "Unread count must be 0 after mark-all-read");
  });

  it("9. Admin recipient preview returns accurate estimation before bulk dispatch", async () => {
    const res = await fetch(`${BASE_URL}/notifications/admin/preview-recipients?audience=staff`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(typeof body.count === "number" && body.count >= 2, "Must count at least admin and housekeeper");
  });

  it("10. Admin can view notification dashboard statistics and campaign list", async () => {
    const resStats = await fetch(`${BASE_URL}/notifications/admin/stats`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.strictEqual(resStats.status, 200);
    const bodyStats = await resStats.json();
    assert.strictEqual(bodyStats.success, true);
    assert.ok(bodyStats.stats.totalSent >= 3, "Total sent should be >= 3");

    const resCamps = await fetch(`${BASE_URL}/notifications/admin/campaigns`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.strictEqual(resCamps.status, 200);
    const bodyCamps = await resCamps.json();
    assert.strictEqual(bodyCamps.success, true);
    assert.ok(Array.isArray(bodyCamps.campaigns));
  });
});
