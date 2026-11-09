const DEPARTMENTS = Object.freeze(["rooms", "reservations", "dining", "events"]);
const PERMISSIONS = Object.freeze([
  ...DEPARTMENTS,
  "offers.dining"
]);

const DEPARTMENT_LABELS = Object.freeze({
  rooms: "Rooms",
  reservations: "Reservations",
  dining: "Dining",
  events: "Events and Banquets"
});

module.exports = { DEPARTMENTS, PERMISSIONS, DEPARTMENT_LABELS };
