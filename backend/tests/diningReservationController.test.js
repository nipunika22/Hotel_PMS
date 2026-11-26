const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Restaurant = require("../models/Restaurant");
const RestaurantTable = require("../models/RestaurantTable");
const RestaurantOffer = require("../models/RestaurantOffer");
const RestaurantReservation = require("../models/RestaurantReservation");
const controller = require("../controllers/restaurantController");
const Payment = require("../models/Payment");

describe("dining reservation price persistence with mocked models", () => {
  it("calculates and stores server-priced snapshots for 1, 2, and 5 guests, ignoring client prices", async () => {
    const originals = {
      restaurantFindOne: Restaurant.findOne,
      tableFindOne: RestaurantTable.findOne,
      tableFind: RestaurantTable.find,
      offerFindOne: RestaurantOffer.findOne,
      reservationFind: RestaurantReservation.find,
      reservationCreate: RestaurantReservation.create,
      reservationFindById: RestaurantReservation.findById
    };
    const propertyId = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const stored = [];
    const offerIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const testOffers = [
      { _id: offerIds[0], property: propertyId, restaurant: restaurantId, active: true, title: "Per Guest", pricingType: "PER_GUEST", pricePerGuest: 4500, currency: "LKR" },
      { _id: offerIds[1], property: propertyId, restaurant: restaurantId, active: true, title: "Fixed", pricingType: "FIXED", fixedPrice: 10000, currency: "LKR" },
      { _id: offerIds[2], property: propertyId, restaurant: restaurantId, active: true, title: "Free", pricingType: "FREE", price: 0, currency: "LKR" }
    ];
    const restaurant = {
      _id: restaurantId,
      active: true,
      capacity: 60,
      reservationPricePerGuest: 1250,
      reservationPriceCurrency: "LKR",
      toObject() { return { ...this }; }
    };

    try {
      Restaurant.findOne = async () => restaurant;
      RestaurantTable.findOne = () => ({
        sort() { return this; },
        select() { return this; },
        lean: async () => ({ capacity: 5 })
      });
      RestaurantTable.find = () => ({ sort: async () => [] });
      RestaurantOffer.findOne = async ({ _id }) => testOffers.find((offer) => String(offer._id) === String(_id)) || null;
      RestaurantReservation.find = async () => [];
      RestaurantReservation.create = async (data) => {
        const record = { ...data, _id: new mongoose.Types.ObjectId() };
        stored.push(record);
        return record;
      };
      RestaurantReservation.findById = () => {
        const query = {
          populate() { return this; },
          then(resolve, reject) { return Promise.resolve(stored[stored.length - 1]).then(resolve, reject); }
        };
        return query;
      };

      for (const guests of [1, 2, 5]) {
        const req = {
          propertyId,
          property: { currency: "LKR" },
          params: { id: String(restaurantId) },
          user: { _id: userId },
          body: {
            customerName: "Pricing Test Guest",
            email: "pricing@example.test",
            phone: "0000000000",
            date: "2030-06-15",
            time: "19:00",
            guestCount: guests,
            pricePerGuest: 1,
            reservationTotalPrice: 1
          }
        };
        const res = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          json(body) { this.body = body; return this; }
        };

        await controller.createReservation(req, res);
        assert.equal(res.statusCode, 201);
        const saved = stored[stored.length - 1];
        assert.equal(String(saved.user), String(userId));
        assert.equal(saved.guestCount, guests);
        assert.equal(saved.pricePerGuest, 1250);
        assert.equal(saved.reservationTotalPrice, guests * 1250);
        assert.equal(saved.reservationPriceCurrency, "LKR");
        assert.equal(saved.status, "CONFIRMED");
      }

      for (const [index, expectedTotal] of [18000, 10000, 0].entries()) {
        const req = {
          propertyId,
          property: { currency: "LKR" },
          params: { id: String(restaurantId) },
          user: { _id: userId },
          body: {
            customerName: "Offer Pricing Test Guest", email: "pricing@example.test", phone: "0000000000",
            date: "2030-06-15", time: "19:00", guestCount: 4, offerId: String(offerIds[index]),
            reservationTotalPrice: 0, pricePerGuest: 0
          }
        };
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await controller.createReservation(req, res);
        assert.equal(res.statusCode, 201);
        const saved = stored[stored.length - 1];
        assert.equal(saved.reservationTotalPrice, expectedTotal);
        assert.equal(saved.offerPricingType, testOffers[index].pricingType);
        assert.equal(saved.pricingSource, "OFFER");
        assert.equal(saved.reservationPriceCurrency, "LKR");
        if (index === 0) assert.equal(saved.offerPricePerGuest, 4500);
        if (index === 1) {
          assert.equal(saved.fixedPrice, 10000);
          assert.equal(saved.pricePerGuest, undefined);
        }
        if (index === 2) assert.equal(saved.reservationTotalPrice, 0);
      }

      for (const guests of [0, -1, 2.5, 6]) {
        const req = {
          propertyId,
          params: { id: String(restaurantId) },
          user: { _id: userId },
          body: { customerName: "Test", email: "pricing@example.test", phone: "0000000000", date: "2030-06-15", time: "19:00", guestCount: guests }
        };
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await controller.createReservation(req, res);
        assert.equal(res.statusCode, 400);
      }
      assert.equal(stored.length, 6);
    } finally {
      Restaurant.findOne = originals.restaurantFindOne;
      RestaurantTable.findOne = originals.tableFindOne;
      RestaurantTable.find = originals.tableFind;
      RestaurantOffer.findOne = originals.offerFindOne;
      RestaurantReservation.find = originals.reservationFind;
      RestaurantReservation.create = originals.reservationCreate;
      RestaurantReservation.findById = originals.reservationFindById;
    }
  });
});

describe("admin dining reservation presentation", () => {
  it("sorts upcoming reservations first chronologically and exposes saved prices and payment totals", async () => {
    const originalFind = RestaurantReservation.find;
    const originalPaymentFind = Payment.find;
    const propertyId = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();
    const pastId = new mongoose.Types.ObjectId();
    const upcomingLaterId = new mongoose.Types.ObjectId();
    const upcomingEarlierId = new mongoose.Types.ObjectId();

    const records = [
      { _id: pastId, property: propertyId, restaurant: { _id: restaurantId, name: "Test Restaurant" }, customerName: "Past", date: "2020-01-01", time: "18:00", guestCount: 2, reservationTotalPrice: 2500, reservationPriceCurrency: "LKR", confirmationNumber: "RST-PAST" },
      { _id: upcomingLaterId, property: propertyId, restaurant: { _id: restaurantId, name: "Test Restaurant" }, customerName: "Later", date: "2030-06-15", time: "20:00", guestCount: 3, reservationTotalPrice: 3750, reservationPriceCurrency: "LKR", confirmationNumber: "RST-LATER" },
      { _id: upcomingEarlierId, property: propertyId, restaurant: { _id: restaurantId, name: "Test Restaurant" }, customerName: "Earlier", date: "2030-06-15", time: "18:30", guestCount: 2, reservationTotalPrice: 2500, reservationPriceCurrency: "LKR", confirmationNumber: "RST-EARLIER" }
    ];

    try {
      const query = {
        populate() { return this; },
        lean: async () => records
      };
      RestaurantReservation.find = () => query;
      Payment.find = () => ({
        sort() { return this; },
        lean: async () => [
          { restaurantReservation: upcomingEarlierId, paymentStatus: "completed", amount: 1000 },
          { restaurantReservation: upcomingLaterId, paymentStatus: "pending", amount: 3750 }
        ]
      });

      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
      };
      await controller.getAdminReservations({ propertyId, query: {} }, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data[0].confirmationNumber, "RST-EARLIER");
      assert.equal(res.body.data[1].confirmationNumber, "RST-LATER");
      assert.equal(res.body.data[2].confirmationNumber, "RST-PAST");
      assert.equal(res.body.data[0].endTime, "20:00");
      assert.equal(res.body.data[0].savedReservationTotal, 2500);
      assert.equal(res.body.data[0].amountPaid, 1000);
      assert.equal(res.body.data[0].outstandingBalance, 1500);
      assert.equal(res.body.data[0].paymentStatus, "Partially Paid");
      assert.equal(res.body.data[1].paymentStatus, "Pending");
    } finally {
      RestaurantReservation.find = originalFind;
      Payment.find = originalPaymentFind;
    }
  });
});
