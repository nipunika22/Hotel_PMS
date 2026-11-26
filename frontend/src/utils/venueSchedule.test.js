const {
  filterVenueBookings,
  getVenueCalendarDates
} = require('./venueSchedule');

describe('venue schedule calendar and filters', () => {
  const bookings = [
    { _id: 'confirmed', date: '2026-11-26', venue: { _id: 'venue-a', name: 'Grand Hall' }, event: { title: 'Wedding Reception' }, customerName: 'Amara Silva', eventType: 'weddings', confirmationNumber: 'EVT-1', status: 'CONFIRMED' },
    { _id: 'pending', date: '2026-11-27', venue: { _id: 'venue-b', name: 'Garden' }, eventType: 'corporate', customerName: 'Kasun Perera', status: 'PENDING' },
    { _id: 'cancelled', date: '2026-11-28', venue: { _id: 'venue-a', name: 'Grand Hall' }, eventType: 'weddings', status: 'CANCELLED' }
  ];

  test('generates month, week, and day ranges for the selected date', () => {
    expect(getVenueCalendarDates('2026-11-26', 'month')).toHaveLength(42);
    expect(getVenueCalendarDates('2026-11-26', 'week')).toHaveLength(7);
    expect(getVenueCalendarDates('2026-11-26', 'day')).toHaveLength(1);
  });

  test('filters by date, venue, status, event type, and searchable booking details', () => {
    expect(filterVenueBookings(bookings, { venueId: 'venue-a' })).toHaveLength(2);
    expect(filterVenueBookings(bookings, { status: 'PENDING' })).toHaveLength(1);
    expect(filterVenueBookings(bookings, { eventType: 'weddings' })).toHaveLength(2);
    expect(filterVenueBookings(bookings, { dateFrom: '2026-11-27', dateTo: '2026-11-27' })).toHaveLength(1);
    expect(filterVenueBookings(bookings, { search: 'wedding reception' })).toHaveLength(1);
  });

});
