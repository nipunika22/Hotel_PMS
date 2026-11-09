// frontend/src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://hotelmanagementsystem-dq0i.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    let sessionUser = null;
    try { sessionUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch (_) { sessionUser = null; }
    const isDepartmentAdmin = sessionUser?.role === 'admin' && sessionUser?.departmentAdmin === true;
    const allowedPropertyIds = [sessionUser?.property, ...(sessionUser?.allowedProperties || [])]
      .filter(Boolean).map((property) => String(property._id || property));
    const selectedProperty = localStorage.getItem('superAdminPropertyContext');
    const propertyContext = sessionUser?.role === 'super_admin'
      ? selectedProperty
      : isDepartmentAdmin && selectedProperty && allowedPropertyIds.includes(selectedProperty)
        ? selectedProperty
        : null;
    if (propertyContext) config.headers['x-property-id'] = propertyContext;
    else delete config.headers['x-property-id'];
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (userData) => api.post('/auth/register', userData),
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (userData) => api.put('/auth/profile', userData),
  changePassword: (passwordData) => api.put('/auth/password', passwordData)
};

// Booking API
export const bookingAPI = {
  getAllBookings: () => api.get('/bookings'),
  getMyBookings: () => api.get('/bookings/my-bookings'),
  getBookingsByDate: (date) => api.get('/bookings/by-date', { params: { date } }),
  getBooking: (id) => api.get(`/bookings/${id}`),
  createBooking: (bookingData) => api.post('/bookings', bookingData),
  updateBooking: (id, bookingData) => api.put(`/bookings/${id}`, bookingData),
  cancelBooking: (id) => api.put(`/bookings/${id}/cancel`),
  deleteBooking: (id) => api.delete(`/bookings/${id}`)
};

// Guest API
export const guestAPI = {
  getGuests: (params) => api.get('/guests', { params }),
  searchGuests: (query) => api.get('/guests/search', { params: { query } }),
  getGuest: (id) => api.get(`/guests/${id}`),
  createGuest: (guestData) => api.post('/guests', guestData),
  updateGuest: (id, guestData) => api.put(`/guests/${id}`, guestData),
  updateGuestStatus: (id, status) => api.put(`/guests/${id}/status`, { status }),
  deleteGuest: (id) => api.delete(`/guests/${id}`),
  getGuestStats: () => api.get('/guests/stats')
};

// Travel Agent API
export const travelAgentAPI = {
  getAgents: () => api.get('/travel-agents'),
  getActiveAgents: () => api.get('/travel-agents/active'),
  getAgent: (id) => api.get(`/travel-agents/${id}`),
  createAgent: (agentData) => api.post('/travel-agents', agentData),
  updateAgent: (id, agentData) => api.put(`/travel-agents/${id}`, agentData),
  deleteAgent: (id) => api.delete(`/travel-agents/${id}`),
  updateBalance: (id, data) => api.put(`/travel-agents/${id}/balance`, data),
  getAgentStats: () => api.get('/travel-agents/stats')
};

// Reservation API
export const reservationAPI = {
  getReservations: () => api.get('/reservations'),
  getReservationsByStatus: (status) => api.get('/reservations/status', { params: { status } }),
  getReservationsByDateRange: (startDate, endDate) => api.get('/reservations/date-range', { params: { startDate, endDate } }),
  getReservation: (id) => api.get(`/reservations/${id}`),
  createReservation: (reservationData) => api.post('/reservations', reservationData),
  updateReservation: (id, reservationData) => api.put(`/reservations/${id}`, reservationData),
  checkIn: (id, data) => api.put(`/reservations/${id}/check-in`, data),
  checkOut: (id, data) => api.put(`/reservations/${id}/check-out`, data),
  cancelReservation: (id, data) => api.put(`/reservations/${id}/cancel`, data),
  deleteReservation: (id) => api.delete(`/reservations/${id}`),
  getDashboardStats: () => api.get('/reservations/dashboard-stats')
};

// Room API
export const roomAPI = {
  getRooms: () => api.get('/rooms'),
  getRoomsByStatus: (status) => api.get('/rooms/status', { params: { status } }),
  getAvailableRooms: (checkIn, checkOut, roomType) => api.get('/rooms/available', { params: { checkInDate: checkIn, checkOutDate: checkOut, roomType } }),
  getRoom: (id) => api.get(`/rooms/${id}`),
  createRoom: (roomData) => api.post('/rooms', roomData),
  updateRoom: (id, roomData) => api.put(`/rooms/${id}`, roomData),
  updateRoomStatus: (id, statusData) => api.put(`/rooms/${id}/status`, statusData),
  deleteRoom: (id) => api.delete(`/rooms/${id}`),
  getRoomStats: () => api.get('/rooms/stats'),
  getHousekeepingTasks: () => api.get('/rooms/housekeeping')
};

// Guest Expense API
export const guestExpenseAPI = {
  getExpenses: () => api.get('/guest-expenses'),
  getExpensesByReservation: (reservationId) => api.get('/guest-expenses/reservation', { params: { reservationId } }),
  getExpensesByDate: (date) => api.get('/guest-expenses/date', { params: { date } }),
  getExpense: (id) => api.get(`/guest-expenses/${id}`),
  createExpense: (expenseData) => api.post('/guest-expenses', expenseData),
  updateExpense: (id, expenseData) => api.put(`/guest-expenses/${id}`, expenseData),
  deleteExpense: (id) => api.delete(`/guest-expenses/${id}`),
  getExpenseSummary: (startDate, endDate) => api.get('/guest-expenses/summary', { params: { startDate, endDate } })
};

// Invoice API
export const invoiceAPI = {
  getInvoices: () => api.get('/invoices'),
  getInvoicesByDate: (date) => api.get('/invoices/date', { params: { date } }),
  getInvoicesByReservation: (reservationId) => api.get('/invoices/reservation', { params: { reservationId } }),
  getInvoice: (id) => api.get(`/invoices/${id}`),
  generateInvoice: (reservationId) => api.post('/invoices/generate', { reservationId }),
  addPayment: (id, paymentData) => api.put(`/invoices/${id}/payment`, paymentData),
  updateInvoice: (id, invoiceData) => api.put(`/invoices/${id}`, invoiceData),
  deleteInvoice: (id) => api.delete(`/invoices/${id}`),
  getInvoiceStats: (startDate, endDate) => api.get('/invoices/stats', { params: { startDate, endDate } })
};

// Housekeeping API
export const housekeepingAPI = {
  getTasks: (params) => api.get('/housekeeping', { params }),
  getMyTasks: () => api.get('/housekeeping/my'),
  getStaff: () => api.get('/housekeeping/staff'),
  createTask: (data) => api.post('/housekeeping', data),
  assignTask: (id, staffId) => api.put(`/housekeeping/${id}/assign`, { staffId }),
  startTask: (id) => api.put(`/housekeeping/${id}/start`),
  completeTask: (id, data) => api.put(`/housekeeping/${id}/complete`, data),
  inspectTask: (id, data) => api.put(`/housekeeping/${id}/inspect`, data),
};

// Maintenance API
export const maintenanceAPI = {
  getTickets: (params) => api.get('/maintenance', { params }),
  getMyTickets: () => api.get('/maintenance/my'),
  getTechnicians: () => api.get('/maintenance/technicians'),
  getTicket: (id) => api.get(`/maintenance/${id}`),
  createTicket: (data) => api.post('/maintenance', data),
  assignTechnician: (id, technicianId) => api.put(`/maintenance/${id}/assign`, { technicianId }),
  startTicket: (id) => api.put(`/maintenance/${id}/start`),
  resolveTicket: (id, data) => api.put(`/maintenance/${id}/resolve`, data),
  closeTicket: (id, data) => api.put(`/maintenance/${id}/close`, data),
  blockRoom: (data) => api.put('/maintenance/block-room', data),
  releaseRoom: (data) => api.put('/maintenance/release-room', data)
};

// Lost & Found API
export const lostItemAPI = {
  getItems: (params) => api.get('/lost-items', { params }),
  getItem: (id) => api.get(`/lost-items/${id}`),
  createItem: (data) => api.post('/lost-items', data),
  claimItem: (id, data) => api.put(`/lost-items/${id}/claim`, data),
  disposeItem: (id, data) => api.put(`/lost-items/${id}/dispose`, data)
};

// Property API (Multi-Property & Destination Support)
export const propertyAPI = {
  getCurrentProperty: () => api.get('/properties/current'),
  getProperties: () => api.get('/properties'),
  getProperty: (id) => api.get(`/properties/${id}`)
};

// Dedicated Super Admin API. Every endpoint is guarded server-side by the super_admin role.
export const superAdminAPI = {
  getDashboard: (params) => api.get('/super-admin/dashboard', { params }),
  getProperties: (params) => api.get('/super-admin/properties', { params }),
  getChains: () => api.get('/super-admin/chains'),
  createProperty: (data) => api.post('/super-admin/properties', data),
  updateProperty: (id, data) => api.put(`/super-admin/properties/${id}`, data),
  getStaff: (params) => api.get('/super-admin/staff', { params }),
    getStaffProfile: (id, params) => api.get(`/super-admin/staff/${id}`, { params }),
  getAdmins: (params) => api.get('/super-admin/admins', { params }),
  createStaff: (data) => api.post('/super-admin/staff', data),
  updateStaff: (id, data) => api.put(`/super-admin/staff/${id}`, data),
  createAdmin: (data) => api.post('/super-admin/admins', data),
  updateAdmin: (id, data) => api.put(`/super-admin/admins/${id}`, data),
  getManagedUsers: (params) => api.get('/super-admin/users', { params }),
  updateManagedUser: (id, data) => api.put(`/super-admin/users/${id}`, data),
  resetManagedUserPassword: (id, newPassword) => api.put(`/super-admin/users/${id}/password`, { newPassword }),
  getAttendanceSummary: (params) => api.get('/attendance/summary', { params }),
  getAttendance: (params) => api.get('/attendance', { params }),
  getAttendanceStaff: (params) => api.get('/attendance/staff', { params }),
  correctAttendance: (id, data) => api.put(`/attendance/${id}/correction`, data),
  createAttendanceCorrection: (data) => api.post('/attendance/corrections', data),
  getRoles: () => api.get('/super-admin/roles'),
  getReservations: (params) => api.get('/super-admin/reservations', { params }),
  getRooms: (params) => api.get('/super-admin/rooms', { params }),
  getCustomers: (params) => api.get('/super-admin/customers', { params }),
  getCustomerReservations: (id, params) => api.get(`/super-admin/customers/${id}/reservations`, { params }),
  getReports: (params) => api.get('/super-admin/reports', { params }),
  getAuditLogs: (params) => api.get('/super-admin/audit-logs', { params }),
  getSettings: () => api.get('/super-admin/settings')
};

export const attendanceAPI = {
  getProperties: () => api.get('/attendance/properties'),
  getMine: (params) => api.get('/attendance/mine', { params }),
  checkIn: (data) => api.post('/attendance/check-in', data),
  checkOut: (data) => api.post('/attendance/check-out', data)
};

// Restaurant & Dining Experience API
export const restaurantAPI = {
  // Public & Guest Endpoints
  getRestaurants: () => api.get('/restaurants'),
  getRestaurantBySlug: (slug) => api.get(`/restaurants/${slug}`),
  getRestaurantMenu: (id) => api.get(`/restaurants/${id}/menu`),
  getRestaurantBuffets: (id) => api.get(`/restaurants/${id}/buffets`),
  getRestaurantOffers: (id) => api.get(`/restaurants/${id}/offers`),
  checkAvailability: (id, params) => api.get(`/restaurants/${id}/availability`, { params }),
  createReservation: (id, data) => api.post(`/restaurants/${id}/reservations`, data),
  getReservationByRef: (ref) => api.get(`/restaurants/reservations/${ref}`),
  getMyReservations: () => api.get('/restaurants/my-reservations'),
  cancelReservation: (ref, data) => api.put(`/restaurants/reservations/${ref}/cancel`, data),
  lookupHotelStay: (data) => api.post('/restaurants/lookup-hotel-stay', data),


  // Staff & Admin Endpoints
  getDashboardStats: () => api.get('/restaurants/admin/dashboard-stats'),
  getAdminRestaurants: () => api.get('/restaurants/admin/restaurants'),
  createRestaurant: (data) => api.post('/restaurants/admin/restaurants', data),
  updateRestaurant: (id, data) => api.put(`/restaurants/admin/restaurants/${id}`, data),
  deleteRestaurant: (id) => api.delete(`/restaurants/admin/restaurants/${id}`),

  getAdminTables: (params) => api.get('/restaurants/admin/tables', { params }),
  createTable: (data) => api.post('/restaurants/admin/tables', data),
  updateTable: (id, data) => api.put(`/restaurants/admin/tables/${id}`, data),
  deleteTable: (id) => api.delete(`/restaurants/admin/tables/${id}`),

  createCategory: (data) => api.post('/restaurants/admin/categories', data),
  updateCategory: (id, data) => api.put(`/restaurants/admin/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/restaurants/admin/categories/${id}`),

  getAdminMenuItems: (params) => api.get('/restaurants/admin/menu-items', { params }),
  createMenuItem: (data) => api.post('/restaurants/admin/menu-items', data),
  updateMenuItem: (id, data) => api.put(`/restaurants/admin/menu-items/${id}`, data),
  deleteMenuItem: (id) => api.delete(`/restaurants/admin/menu-items/${id}`),

  getAdminBuffets: (params) => api.get('/restaurants/admin/buffets', { params }),
  createBuffet: (data) => api.post('/restaurants/admin/buffets', data),
  updateBuffet: (id, data) => api.put(`/restaurants/admin/buffets/${id}`, data),
  deleteBuffet: (id) => api.delete(`/restaurants/admin/buffets/${id}`),

  getAdminOffers: (params) => api.get('/restaurants/admin/offers', { params }),
    getOfferRestaurants: () => api.get('/restaurants/admin/offers/restaurants'),
  createOffer: (data) => api.post('/restaurants/admin/offers', data),
  updateOffer: (id, data) => api.put(`/restaurants/admin/offers/${id}`, data),
  deleteOffer: (id) => api.delete(`/restaurants/admin/offers/${id}`),

  getAdminReservations: (params) => api.get('/restaurants/admin/reservations', { params }),
  updateReservationStatus: (id, data) => api.put(`/restaurants/admin/reservations/${id}/status`, data),
  chargeFolio: (id, data) => api.post(`/restaurants/admin/reservations/${id}/charge-folio`, data)
};

// Hotel Event Management API
export const eventAPI = {
  // Public & Guest Endpoints
  getEvents: (params) => api.get('/events', { params }),
  getFeaturedEvents: () => api.get('/events/featured'),
  getEventTypes: () => api.get('/events/types'),
  getVenues: (params) => api.get('/events/venues', { params }),
  getVenue: (idOrSlug) => api.get(`/events/venues/${idOrSlug}`),
  checkAvailability: (params) => api.get('/events/availability', { params }),
  createBooking: (data) => api.post('/events/bookings', data),
  getBookingByRef: (ref) => api.get(`/events/bookings/${ref}`),
  getMyBookings: () => api.get('/events/my-bookings'),
  cancelMyBooking: (id, data) => api.put(`/events/my-bookings/${id}/cancel`, data),
  getEventBySlug: (slug) => api.get(`/events/${slug}`),

  // Staff & Admin Endpoints
  getDashboardStats: () => api.get('/events/admin/dashboard-stats'),
  getAdminEvents: (params) => api.get('/events/admin/events', { params }),
  createEvent: (data) => api.post('/events/admin/events', data),
  getAdminEvent: (id) => api.get(`/events/admin/events/${id}`),
  updateEvent: (id, data) => api.put(`/events/admin/events/${id}`, data),
  deleteEvent: (id) => api.delete(`/events/admin/events/${id}`),
  togglePublish: (id) => api.put(`/events/admin/events/${id}/publish`),

  getAdminVenues: (params) => api.get('/events/admin/venues', { params }),
  createVenue: (data) => api.post('/events/admin/venues', data),
  updateVenue: (id, data) => api.put(`/events/admin/venues/${id}`, data),
  deleteVenue: (id) => api.delete(`/events/admin/venues/${id}`),

  getAdminBookings: (params) => api.get('/events/admin/bookings', { params }),
  updateBookingStatus: (id, data) => api.put(`/events/admin/bookings/${id}/status`, data)
};

// Centralized Notification Management API
export const notificationAPI = {
  // User Inboxes
  getMyNotifications: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  archiveNotification: (id) => api.delete(`/notifications/${id}`),

  // Admin & Management Endpoints
  sendAdminNotification: (data) => api.post('/notifications/admin/send', data),
  getAdminStats: () => api.get('/notifications/admin/stats'),
  getAdminCampaigns: (params) => api.get('/notifications/admin/campaigns', { params }),
  getCampaignDetails: (campaignId) => api.get(`/notifications/admin/campaigns/${campaignId}`),
  previewRecipients: (params) => api.get('/notifications/admin/preview-recipients', { params }),
  getRecipientOptions: () => api.get('/notifications/admin/recipient-options')
};

// AI Hotel Concierge API
export const aiConciergeAPI = {
  sendMessage: (payload) => api.post('/ai/concierge/chat', payload)
};

// Payment & Financial Management API
export const paymentAPI = {
  initiatePayment: (data) => api.post('/payments/initiate', data),
  verifyPaymentStatus: (reference) => api.get(`/payments/verify/${reference}`),
  getMyPayments: () => api.get('/payments/my-payments'),
  getPayments: (params) => api.get('/payments', { params }),
  getPayment: (id) => api.get(`/payments/${id}`),
  getFinancialAnalytics: (params) => api.get('/payments/financial-analytics', { params }),
  processRefund: (id, data) => api.post(`/payments/${id}/refund`, data),
  simulateSandboxPayment: (data) => api.post('/payments/simulate-sandbox-confirmation', data)
};

export default api;

