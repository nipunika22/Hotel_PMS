const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { calculateReservationTotal, isGuestCountWithinCapacity, resolvePerGuestPrice, resolveReservationPricing } = require("../utils/diningPricing");
const mongoose = require("mongoose");
const RestaurantReservation = require("../models/RestaurantReservation");
const RestaurantOffer = require("../models/RestaurantOffer");

describe("dining reservation price calculation", () => {
  it("calculates totals for one, two, and five guests", () => {
    assert.equal(calculateReservationTotal(1, 1250), 1250);
    assert.equal(calculateReservationTotal(2, 1250), 2500);
    assert.equal(calculateReservationTotal(5, 1250), 6250);
  });

  it("rejects invalid guest counts and prices", () => {
    for (const value of [0, -1, 2.5, "2guests", NaN]) {
      assert.throws(() => calculateReservationTotal(value, 1250), TypeError);
    }
    assert.throws(() => calculateReservationTotal(2, -1), TypeError);
  });

  it("enforces the maximum reservable table capacity", () => {
    assert.equal(isGuestCountWithinCapacity(5, 5), true);
    assert.equal(isGuestCountWithinCapacity(6, 5), false);
    assert.equal(isGuestCountWithinCapacity(0, 5), false);
    assert.equal(isGuestCountWithinCapacity(2, 0), false);
  });

  it("uses configured restaurant rates and existing buffet or offer rates", () => {
    const restaurant = { reservationPricePerGuest: 800, reservationPriceCurrency: "LKR" };
    assert.deepEqual(resolvePerGuestPrice({ restaurant }), { pricePerGuest: 800, currency: "LKR" });
    assert.deepEqual(resolvePerGuestPrice({ restaurant, offer: { price: 1200, currency: "USD" } }), { pricePerGuest: 1200, currency: "USD" });
    assert.deepEqual(resolvePerGuestPrice({ restaurant, buffet: { adultPrice: 2400, outsideGuestPrice: 1800, currency: "LKR" }, guestType: "Outside Guest" }), { pricePerGuest: 1800, currency: "LKR" });
    assert.deepEqual(resolvePerGuestPrice({ restaurant, buffet: { adultPrice: 2400, hotelGuestPrice: 0, currency: "LKR" }, guestType: "Hotel Guest" }), { pricePerGuest: 0, currency: "LKR" });
  });

  it("calculates per-guest, fixed, and free offer snapshots with buffet precedence", () => {
    const restaurant = { reservationPricePerGuest: 1500, reservationPriceCurrency: "LKR" };
    assert.deepEqual(resolveReservationPricing({ restaurant, guestCount: 4 }), {
      pricingSource: "RESTAURANT", pricingType: "PER_GUEST", pricePerGuest: 1500, fixedPrice: undefined, totalPrice: 6000, currency: "LKR"
    });
    assert.equal(resolveReservationPricing({ restaurant, offer: { pricingType: "PER_GUEST", pricePerGuest: 4500, currency: "LKR" }, guestCount: 4 }).totalPrice, 18000);
    assert.deepEqual(resolveReservationPricing({ restaurant, offer: { pricingType: "FIXED", fixedPrice: 10000, currency: "LKR" }, guestCount: 4 }), {
      pricingSource: "OFFER", pricingType: "FIXED", pricePerGuest: undefined, fixedPrice: 10000, totalPrice: 10000, currency: "LKR"
    });
    assert.equal(resolveReservationPricing({ restaurant, offer: { pricingType: "FREE" }, guestCount: 4 }).totalPrice, 0);
    assert.equal(resolveReservationPricing({ restaurant, buffet: { outsideGuestPrice: 1800, currency: "LKR" }, offer: { pricingType: "FIXED", fixedPrice: 10000 }, guestType: "Outside Guest", guestCount: 4 }).totalPrice, 7200);
    assert.equal(resolveReservationPricing({ restaurant, offer: { price: 1200 }, guestCount: 2 }).totalPrice, 2400);
  });

  it("validates offer pricing fields and defaults legacy offers to per-guest pricing", async () => {
    const property = new mongoose.Types.ObjectId();
    const restaurant = new mongoose.Types.ObjectId();
    for (const offer of [
      { pricingType: "PER_GUEST", price: 4500, pricePerGuest: 4500 },
      { pricingType: "FIXED", price: 10000, fixedPrice: 10000 },
      { pricingType: "FREE", price: 0 }
    ]) {
      const record = new RestaurantOffer({
        property, restaurant, title: "Dining offer", slug: `${offer.pricingType.toLowerCase()}-offer`,
        shortDescription: "Short", description: "Details", currency: "LKR", ...offer
      });
      await record.validate();
    }
    const legacy = new RestaurantOffer({
      property, restaurant, title: "Legacy offer", slug: "legacy-offer",
      shortDescription: "Short", description: "Details", price: 1200
    });
    assert.equal(legacy.pricingType, "PER_GUEST");
    await legacy.validate();
  });

  it("validates the persisted price snapshot and leaves historical prices unchanged", async () => {
    const property = new mongoose.Types.ObjectId();
    const restaurant = new mongoose.Types.ObjectId();
    const currentRestaurantRate = { amount: 1250 };
    const snapshot = new RestaurantReservation({
      property, restaurant, customerName: "Test Guest", email: "guest@example.test", phone: "0000000000",
      date: "2030-01-01", time: "19:00", guestCount: 5, pricePerGuest: currentRestaurantRate.amount,
      reservationTotalPrice: 6250, reservationPriceCurrency: "LKR"
    });
    await snapshot.validate();
    assert.equal(snapshot.reservationTotalPrice, 6250);
    currentRestaurantRate.amount = 5000;
    assert.equal(snapshot.reservationTotalPrice, 6250);
    assert.equal(snapshot.pricePerGuest, 1250);
    const historical = new RestaurantReservation({
      property, restaurant, customerName: "Old Guest", email: "old@example.test", phone: "0000000000",
      date: "2020-01-01", time: "19:00", guestCount: 2
    });
    assert.equal(historical.reservationTotalPrice, undefined);
  });
});
