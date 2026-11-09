const CUSTOMER_ROLE = 'customer';
const SUPER_ADMIN_ROLE = 'super_admin';
const DEPARTMENT_PERMISSION_OPTIONS = Object.freeze({
  rooms: Object.freeze(['rooms']),
  reservations: Object.freeze(['reservations']),
  dining: Object.freeze(['dining', 'offers.dining']),
  events: Object.freeze(['events'])
});

const STAFF_ROLES = Object.freeze([
  'admin',
  'staff',
  'manager',
  'finance',
  'housekeeping',
  'maintenance'
]);

// These sets mirror the read/list authorization used by the corresponding
// backend routes. Write operations continue to use their stricter API checks.
const ROUTE_ROLES = Object.freeze({
  dashboard: STAFF_ROLES,
  roomDashboard: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'housekeeping', 'maintenance']),
  restaurantDashboard: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'finance']),
  eventDashboard: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'finance']),
  guests: Object.freeze(['super_admin', 'admin', 'staff', 'manager']),
  reservations: Object.freeze(['super_admin', 'admin', 'staff']),
  rooms: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'housekeeping', 'maintenance']),
  roomForm: Object.freeze(['super_admin', 'admin', 'manager', 'staff']),
  travelAgents: Object.freeze(['admin', 'staff']),
  expenses: Object.freeze(['super_admin', 'admin', 'staff', 'finance']),
  invoices: Object.freeze(['super_admin', 'admin', 'staff', 'finance']),
  payments: Object.freeze(['super_admin', 'admin', 'manager', 'finance', 'staff']),
  financialDashboard: Object.freeze(['super_admin', 'admin', 'manager', 'finance']),
  housekeeping: Object.freeze(['admin', 'manager', 'staff', 'housekeeping']),
  maintenance: Object.freeze(['admin', 'manager', 'staff', 'housekeeping', 'maintenance']),
  lostAndFound: Object.freeze(['admin', 'manager', 'staff', 'housekeeping', 'maintenance']),
  reports: Object.freeze(['super_admin', 'admin', 'staff', 'finance']),
  restaurants: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'finance']),
  diningOffers: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'finance']),
  events: Object.freeze(['super_admin', 'admin', 'manager', 'staff', 'finance']),
  adminNotifications: Object.freeze(['admin', 'manager'])
});

const DEPARTMENT_NAVIGATION = Object.freeze([
  Object.freeze({
    title: 'Room Management',
    items: Object.freeze([
      Object.freeze({ path: '/rooms/dashboard', label: 'Room Dashboard', route: 'roomDashboard', permission: 'rooms', icon: 'rooms' }),
      Object.freeze({ path: '/rooms', label: 'Rooms', route: 'rooms', permission: 'rooms', icon: 'rooms' }),
      Object.freeze({ path: '/reservations', label: 'Reservations', route: 'reservations', permission: 'reservations', icon: 'reservations' }),
      Object.freeze({ path: '/guests', label: 'Guest Profiles', route: 'guests', permission: 'reservations', icon: 'guests' })
    ])
  }),
  Object.freeze({
    title: 'Restaurant Management',
    items: Object.freeze([
      Object.freeze({ path: '/admin/restaurants/dashboard', label: 'Restaurant Dashboard', route: 'restaurantDashboard', permission: 'dining', icon: 'dining' }),
      Object.freeze({ path: '/admin/restaurants', label: 'Restaurants & Dining', route: 'restaurants', permission: 'dining', icon: 'dining' }),
      Object.freeze({ path: '/admin/dining-offers', label: 'Restaurant & Dining Offers', route: 'diningOffers', permission: ['dining', 'offers.dining'], icon: 'diningOffers' })
    ])
  }),
  Object.freeze({
    title: 'Event Management',
    items: Object.freeze([
      Object.freeze({ path: '/admin/events/dashboard', label: 'Event Dashboard', route: 'eventDashboard', permission: 'events', icon: 'events' }),
      Object.freeze({ path: '/admin/events', label: 'Events, Halls & Enquiries', route: 'events', permission: 'events', icon: 'events' })
    ])
  })
]);

function getDepartmentNavigation(user) {
  const role = normalizeRole(user?.role);
  return DEPARTMENT_NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      canAccessRoute(role, item.route) && hasDepartmentPermission(user, item.permission)
    )
  })).filter((section) => section.items.length > 0);
}

function normalizeRole(role) {
  return (role || '').toLowerCase().trim();
}

function getLandingPath(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === CUSTOMER_ROLE) return '/';
  if (normalizedRole === SUPER_ADMIN_ROLE) return '/super-admin/dashboard';
  if (STAFF_ROLES.includes(normalizedRole)) return '/admin-dashboard';
  return null;
}

function canAccessRoute(role, routeName) {
  const allowedRoles = ROUTE_ROLES[routeName] || [];
  return allowedRoles.includes(normalizeRole(role));
}

function hasDepartmentPermission(user, required) {
  if (user?.role !== 'admin' || user?.departmentAdmin !== true) return true;
  const grants = new Set([...(user.adminDepartments || []), ...(user.adminPermissions || [])]);
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.some((permission) => grants.has(permission));
}

module.exports = {
  CUSTOMER_ROLE,
  SUPER_ADMIN_ROLE,
  STAFF_ROLES,
  ROUTE_ROLES,
  DEPARTMENT_NAVIGATION,
  DEPARTMENT_PERMISSION_OPTIONS,
  normalizeRole,
  getLandingPath,
  canAccessRoute,
  hasDepartmentPermission,
  getDepartmentNavigation
};
