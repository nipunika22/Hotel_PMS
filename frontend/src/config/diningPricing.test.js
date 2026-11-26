const { calculateReservationTotal, isGuestCountWithinCapacity, calculateDiningPrice } = require('./diningPricing');

describe('dining reservation price estimate', () => {
  test('updates totals immediately when guest count changes', () => {
    expect(calculateReservationTotal(1, 1250)).toBe(1250);
    expect(calculateReservationTotal(2, 1250)).toBe(2500);
    expect(calculateReservationTotal(5, 1250)).toBe(6250);
    expect(calculateReservationTotal(2, 1250)).toBeGreaterThan(calculateReservationTotal(1, 1250));
    expect(calculateReservationTotal(1, 1250)).toBeLessThan(calculateReservationTotal(2, 1250));
  });

  test('rejects invalid and over-capacity guest counts', () => {
    [0, -1, 2.5, '2guests'].forEach((count) => {
      expect(isGuestCountWithinCapacity(count, 5)).toBe(false);
    });
    expect(isGuestCountWithinCapacity(5, 5)).toBe(true);
    expect(isGuestCountWithinCapacity(6, 5)).toBe(false);
  });

  test('uses restaurant and buffet per-guest rates before any offer', () => {
    const restaurant = { reservationPricePerGuest: 1500.5, reservationPriceCurrency: 'LKR' };
    expect(calculateDiningPrice({ restaurant, guestCount: 4 }).totalPrice).toBe(6002);
    expect(calculateDiningPrice({ restaurant, buffet: { adultPrice: 2400, outsideGuestPrice: 1800, currency: 'LKR' }, offer: { pricingType: 'FIXED', fixedPrice: 10000 }, guestCount: 3 }).totalPrice).toBe(5400);
  });

  test('uses offer per-guest, fixed, and free pricing without adding the restaurant rate', () => {
    const restaurant = { reservationPricePerGuest: 1500, reservationPriceCurrency: 'LKR' };
    expect(calculateDiningPrice({ restaurant, offer: { pricingType: 'PER_GUEST', pricePerGuest: 4500, currency: 'LKR' }, guestCount: 4 }).totalPrice).toBe(18000);
    expect(calculateDiningPrice({ restaurant, offer: { pricingType: 'FIXED', fixedPrice: 10000, currency: 'LKR' }, guestCount: 4 }).totalPrice).toBe(10000);
    expect(calculateDiningPrice({ restaurant, offer: { pricingType: 'FREE', currency: 'LKR' }, guestCount: 4 }).totalPrice).toBe(0);
    expect(calculateDiningPrice({ restaurant, offer: { price: 1200, currency: 'USD' }, guestCount: 2 }).totalPrice).toBe(2400);
  });
});
