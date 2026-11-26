const { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } = require('date-fns');

const getVenueCalendarDates = (focusDate, viewMode) => {
  const focus = new Date(`${focusDate}T00:00:00`);
  if (viewMode === 'day') return [focus];
  const first = viewMode === 'month'
    ? startOfWeek(startOfMonth(focus), { weekStartsOn: 1 })
    : startOfWeek(focus, { weekStartsOn: 1 });
  const last = viewMode === 'month'
    ? endOfWeek(endOfMonth(focus), { weekStartsOn: 1 })
    : endOfWeek(focus, { weekStartsOn: 1 });
  const dates = [];
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
};

const filterVenueBookings = (bookings, filters = {}) => {
  const {
    venueId = 'ALL', status = 'ALL', eventType = 'ALL', dateFrom = '', dateTo = '', search = ''
  } = filters;
  const query = search.trim().toLowerCase();
  return bookings.filter((booking) => {
    const bookingVenueId = booking.venue?._id || booking.venue;
    if (venueId !== 'ALL' && String(bookingVenueId) !== String(venueId)) return false;
    if (status !== 'ALL' && booking.status !== status) return false;
    if (eventType !== 'ALL' && booking.eventType !== eventType) return false;
    if (dateFrom && booking.date < dateFrom) return false;
    if (dateTo && booking.date > dateTo) return false;
    return !query || [booking.customerName, booking.event?.title, booking.eventType,
      booking.confirmationNumber, booking.venue?.name, booking.venueName]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
};

const getBookingDateKey = (date) => format(date, 'yyyy-MM-dd');

module.exports = { getVenueCalendarDates, filterVenueBookings, getBookingDateKey };
