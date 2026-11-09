const { canAccessRoute, getLandingPath, ROUTE_ROLES, STAFF_ROLES, hasDepartmentPermission, getDepartmentNavigation } = require('./roleAccess');

describe('role navigation policy', () => {
  test('maps every stored role to its intended landing route', () => {
    expect(getLandingPath('customer')).toBe('/');
    expect(getLandingPath('admin')).toBe('/admin-dashboard');
    expect(getLandingPath('manager')).toBe('/admin-dashboard');
    expect(getLandingPath('staff')).toBe('/admin-dashboard');
    expect(getLandingPath('finance')).toBe('/admin-dashboard');
    expect(getLandingPath('housekeeping')).toBe('/admin-dashboard');
    expect(getLandingPath('maintenance')).toBe('/admin-dashboard');
    expect(getLandingPath('super_admin')).toBe('/super-admin/dashboard');
  });

  test('normalizes stored role values and rejects unknown roles', () => {
    expect(getLandingPath('  SUPER_ADMIN ')).toBe('/super-admin/dashboard');
    expect(getLandingPath('unknown-role')).toBeNull();
  });

  test('route access matches the existing backend read permissions', () => {
    expect(canAccessRoute('manager', 'guests')).toBe(true);
    expect(canAccessRoute('manager', 'reservations')).toBe(false);
    expect(canAccessRoute('finance', 'restaurants')).toBe(true);
    expect(canAccessRoute('finance', 'reports')).toBe(false);
    expect(canAccessRoute('housekeeping', 'rooms')).toBe(true);
    expect(canAccessRoute('maintenance', 'roomForm')).toBe(false);
    expect(canAccessRoute('customer', 'reservations')).toBe(false);
    expect(canAccessRoute('super_admin', 'dashboard')).toBe(false);
    expect(canAccessRoute('super_admin', 'rooms')).toBe(true);
    expect(canAccessRoute('super_admin', 'reservations')).toBe(true);
    expect(canAccessRoute('super_admin', 'restaurants')).toBe(true);
    expect(canAccessRoute('super_admin', 'events')).toBe(true);
  });

  test('keeps the supported staff landing roles and route map aligned', () => {
    expect(ROUTE_ROLES.dashboard).toEqual(STAFF_ROLES);
    expect(new Set(STAFF_ROLES)).toEqual(new Set([
      'admin', 'manager', 'staff', 'finance', 'housekeeping', 'maintenance'
    ]));
  });

  test('restricts department administrator grants and preserves legacy admin access', () => {
    expect(hasDepartmentPermission({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'] }, 'rooms')).toBe(true);
    expect(hasDepartmentPermission({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'] }, 'events')).toBe(false);
    expect(hasDepartmentPermission({ role: 'admin', departmentAdmin: true, adminPermissions: ['offers.dining'] }, ['dining', 'offers.dining'])).toBe(true);
    expect(hasDepartmentPermission({ role: 'admin' }, 'events')).toBe(true);
  });

  test('builds department-only navigation from the same grants used for route guards', () => {
    const rooms = getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'] });
    expect(rooms.map((section) => section.title)).toEqual(['Room Management']);
    expect(rooms.flatMap((section) => section.items.map((item) => item.path))).toEqual(['/rooms/dashboard', '/rooms']);

    const reservations = getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['reservations'] });
    expect(reservations.map((section) => section.title)).toEqual(['Room Management']);
    expect(reservations[0].items.map((item) => item.path)).toEqual(['/reservations', '/guests']);

    const dining = getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['dining'] });
    expect(dining.map((section) => section.title)).toEqual(['Restaurant Management']);
    expect(dining[0].items.map((item) => item.path)).toEqual(['/admin/restaurants/dashboard', '/admin/restaurants', '/admin/dining-offers']);

    const offersOnly = getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminPermissions: ['offers.dining'] });
    expect(offersOnly.map((section) => section.title)).toEqual(['Restaurant Management']);
    expect(offersOnly[0].items.map((item) => item.path)).toEqual(['/admin/dining-offers']);

    const events = getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['events'] });
    expect(events.map((section) => section.title)).toEqual(['Event Management']);

    const legacyAdmin = getDepartmentNavigation({ role: 'admin' });
    expect(legacyAdmin.map((section) => section.title)).toEqual([
      'Room Management', 'Restaurant Management', 'Event Management'
    ]);
  });

  test('adds the three department dashboards only when their department grant is present', () => {
    expect(getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'] })[0].items[0].path).toBe('/rooms/dashboard');
    expect(getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['dining'] })[0].items[0].path).toBe('/admin/restaurants/dashboard');
    expect(getDepartmentNavigation({ role: 'admin', departmentAdmin: true, adminDepartments: ['events'] })[0].items[0].path).toBe('/admin/events/dashboard');
  });
});
