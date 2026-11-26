function calculateReservationTotal(guestCount, pricePerGuest) {
  const guests = Number(guestCount);
  const rate = Number(pricePerGuest);
  if (!Number.isSafeInteger(guests) || guests < 1) throw new TypeError("Guest count must be a positive whole number");
  if (!Number.isFinite(rate) || rate < 0) throw new TypeError("Price per guest must be a non-negative number");
  return roundMoney(guests * rate);
}

function roundMoney(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

function isGuestCountWithinCapacity(guestCount, maxPartySize) {
  const guests = Number(guestCount);
  const capacity = Number(maxPartySize);
  return Number.isSafeInteger(guests) && guests >= 1 && Number.isSafeInteger(capacity) && capacity >= 1 && guests <= capacity;
}

function resolvePerGuestPrice({ restaurant, buffet, offer, guestType }) {
  let pricePerGuest = Number(restaurant?.reservationPricePerGuest) || 0;
  let currency = restaurant?.reservationPriceCurrency || "LKR";
  if (buffet) {
    const guestPrice = guestType === "Hotel Guest" ? buffet.hotelGuestPrice : buffet.outsideGuestPrice;
    pricePerGuest = guestPrice != null ? Number(guestPrice) : Number(buffet.adultPrice) || 0;
    currency = buffet.currency || currency;
  } else if (offer && offer.price != null) {
    pricePerGuest = Number(offer.price);
    currency = offer.currency || currency;
  }
  if (!Number.isFinite(pricePerGuest) || pricePerGuest < 0) throw new TypeError("Price per guest must be a non-negative number");
  return { pricePerGuest: roundMoney(pricePerGuest), currency };
}

function resolveReservationPricing({ restaurant, buffet, offer, guestType, guestCount }) {
  if (buffet) {
    const { pricePerGuest, currency } = resolvePerGuestPrice({ restaurant, buffet, guestType });
    return {
      pricingSource: "BUFFET",
      pricingType: "PER_GUEST",
      pricePerGuest,
      fixedPrice: undefined,
      totalPrice: calculateReservationTotal(guestCount, pricePerGuest),
      currency
    };
  }

  if (offer) {
    const pricingType = offer.pricingType || "PER_GUEST";
    const currency = offer.currency || restaurant?.reservationPriceCurrency || "LKR";
    if (pricingType === "FREE") {
      return { pricingSource: "OFFER", pricingType, pricePerGuest: 0, fixedPrice: undefined, totalPrice: 0, currency };
    }
    if (pricingType === "FIXED") {
      const fixedPrice = Number(offer.fixedPrice ?? offer.price);
      if (!Number.isFinite(fixedPrice) || fixedPrice < 0) throw new TypeError("Fixed offer price must be a non-negative number");
      return { pricingSource: "OFFER", pricingType, pricePerGuest: undefined, fixedPrice: roundMoney(fixedPrice), totalPrice: roundMoney(fixedPrice), currency };
    }
    if (pricingType !== "PER_GUEST") throw new TypeError("Unsupported offer pricing type");
    const configuredPricePerGuest = Number(offer.pricePerGuest ?? offer.price ?? restaurant?.reservationPricePerGuest ?? 0);
    if (!Number.isFinite(configuredPricePerGuest) || configuredPricePerGuest < 0) throw new TypeError("Offer price per guest must be a non-negative number");
    const pricePerGuest = roundMoney(configuredPricePerGuest);
    return {
      pricingSource: "OFFER",
      pricingType,
      pricePerGuest,
      fixedPrice: undefined,
      totalPrice: calculateReservationTotal(guestCount, pricePerGuest),
      currency
    };
  }

  const { pricePerGuest, currency } = resolvePerGuestPrice({ restaurant, guestType });
  return {
    pricingSource: "RESTAURANT",
    pricingType: "PER_GUEST",
    pricePerGuest,
    fixedPrice: undefined,
    totalPrice: calculateReservationTotal(guestCount, pricePerGuest),
    currency
  };
}

module.exports = { calculateReservationTotal, isGuestCountWithinCapacity, resolvePerGuestPrice, resolveReservationPricing, roundMoney };
