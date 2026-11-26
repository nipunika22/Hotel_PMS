const isGuestCountWithinCapacity = (guestCount, maxPartySize) => (
  Number.isSafeInteger(Number(guestCount))
  && Number(guestCount) >= 1
  && Number(guestCount) <= Number(maxPartySize)
);

const calculateReservationTotal = (guestCount, pricePerGuest) => (
  Math.round((Number(guestCount) * Number(pricePerGuest) + Number.EPSILON) * 100) / 100
);
const roundPrice = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

const calculateDiningPrice = ({ restaurant, buffet, offer, guestType = 'Outside Guest', guestCount }) => {
  const restaurantRate = Number(restaurant?.reservationPricePerGuest) || 0;
  const restaurantCurrency = restaurant?.reservationPriceCurrency || 'LKR';
  if (buffet) {
    const guestRate = guestType === 'Hotel Guest' ? buffet.hotelGuestPrice : buffet.outsideGuestPrice;
    const pricePerGuest = roundPrice(guestRate != null ? Number(guestRate) : Number(buffet.adultPrice) || 0);
    return { pricingSource: 'BUFFET', pricingType: 'PER_GUEST', pricePerGuest, fixedPrice: null, currency: buffet.currency || restaurantCurrency, totalPrice: calculateReservationTotal(guestCount, pricePerGuest) };
  }
  if (offer) {
    const pricingType = offer.pricingType || 'PER_GUEST';
    const currency = offer.currency || restaurantCurrency;
    if (pricingType === 'FREE') return { pricingSource: 'OFFER', pricingType, pricePerGuest: 0, fixedPrice: null, currency, totalPrice: 0 };
    if (pricingType === 'FIXED') {
      const fixedPrice = roundPrice(Number(offer.fixedPrice ?? offer.price ?? 0));
      return { pricingSource: 'OFFER', pricingType, pricePerGuest: null, fixedPrice, currency, totalPrice: fixedPrice };
    }
    const pricePerGuest = roundPrice(Number(offer.pricePerGuest ?? offer.price ?? restaurantRate));
    return { pricingSource: 'OFFER', pricingType: 'PER_GUEST', pricePerGuest, fixedPrice: null, currency, totalPrice: calculateReservationTotal(guestCount, pricePerGuest) };
  }
  const pricePerGuest = roundPrice(restaurantRate);
  return { pricingSource: 'RESTAURANT', pricingType: 'PER_GUEST', pricePerGuest, fixedPrice: null, currency: restaurantCurrency, totalPrice: calculateReservationTotal(guestCount, pricePerGuest) };
};

module.exports = { calculateReservationTotal, isGuestCountWithinCapacity, calculateDiningPrice };
