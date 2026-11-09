// frontend/src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'react-datepicker/dist/react-datepicker.css';
import './App.css';
import './pages/AdminPMS.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import AdminTopbar from './components/AdminTopbar';
import CustomerLayout from './components/CustomerLayout';
import { FaBars } from 'react-icons/fa';

// Import all pages
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CustomerHome from './pages/CustomerHome';
import Profile from './pages/Profile';
import MyBookings from './pages/MyBookings';

// Staff PMS Pages
import Guests from './pages/Guests';
import GuestForm from './pages/GuestForm';
import GuestDetails from './pages/GuestDetails';
import Reservations from './pages/Reservations';
import ReservationForm from './pages/ReservationForm';
import ReservationDetails from './pages/ReservationDetails';
import Rooms from './pages/Rooms';
import RoomForm from './pages/RoomForm';
import TravelAgents from './pages/TravelAgents';
import TravelAgentForm from './pages/TravelAgentForm';
import GuestExpenses from './pages/GuestExpenses';
import ExpenseForm from './pages/ExpenseForm';
import Invoices from './pages/Invoices';
import InvoiceDetails from './pages/InvoiceDetails';
import Housekeeping from './pages/HousekeepingEnhanced';
import Maintenance from './pages/Maintenance';
import LostAndFound from './pages/LostAndFound';
import Reports from './pages/Reports';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';
import AdminPayments from './pages/AdminPayments';
import FinancialDashboard from './pages/FinancialDashboard';

// Restaurant Experience Pages
import DiningLanding from './pages/DiningLanding';
import Events from './pages/Events';
import Offers from './pages/Offers';
import RestaurantDetail from './pages/RestaurantDetail';
import AdminRestaurants from './pages/AdminRestaurants';
import DepartmentDiningOffers from './pages/DepartmentDiningOffers';
import AdminEvents from './pages/AdminEvents';
import NotificationCenter from './pages/NotificationCenter';
import AdminNotifications from './pages/AdminNotifications';
import SuperAdminPanel from './pages/SuperAdminPanel';
import { RoomManagementDashboard, RestaurantManagementDashboard, EventManagementDashboard } from './pages/ManagementDashboards';
import Attendance from './pages/Attendance';
const { getLandingPath, normalizeRole, ROUTE_ROLES, STAFF_ROLES, SUPER_ADMIN_ROLE, hasDepartmentPermission } = require('./config/roleAccess');

function UnauthorizedAccess({ role }) {
  const destination = getLandingPath(role);
  return (
    <div className="content-wrapper" style={{ padding: '3rem', textAlign: 'center' }}>
      <h2>Unauthorized Access</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
        Your account role ({role || 'Unknown'}) does not have permission to access this page.
      </p>
      {destination && <p><a href={destination}>Return to your dashboard</a></p>}
    </div>
  );
}

const SuperAdminRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <div className="sa-route-loading"><div className="spinner" /></div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  const role = normalizeRole(user.role);
  if (role !== SUPER_ADMIN_ROLE) {
    const destination = getLandingPath(role);
    return destination ? <Navigate to={destination} replace /> : <UnauthorizedAccess role={role} />;
  }
  return children;
};

// Customer-Facing Route Wrapper (Uses CustomerLayout with topbar/footer, NO PMS sidebar)
const CustomerRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <CustomerLayout>{children}</CustomerLayout>;
};

// Staff-Only Protected Route Component (Renders internal PMS Sidebar + Topbar)
const StaffRoute = ({ children, allowedRoles = [], requiredPermission, departmentSelfService = false }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const userRole = normalizeRole(user.role);

  // If customer attempts to access staff routes, redirect to sanctuary homepage
  if (userRole === 'customer') {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <UnauthorizedAccess role={userRole} />;
  }
  if (requiredPermission && !hasDepartmentPermission(user, requiredPermission)) {
    return <UnauthorizedAccess role={`${userRole} (department permission required)`} />;
  }
  if (user.departmentAdmin === true && !requiredPermission && !departmentSelfService) {
    return <UnauthorizedAccess role={`${userRole} (department access restricted)`} />;
  }

  return (
    <div className="app-container">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <AdminTopbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
        <main className="pms-main-viewport">
          {children}
        </main>
      </div>
    </div>
  );
};

// Role-aware Dashboard Component
const RoleBasedDashboard = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(user.role);

  if (role === 'super_admin') {
    return <Navigate to="/super-admin/dashboard" replace />;
  }

  // 1. Customer -> Canonical Sanctuary Home Website
  if (role === 'customer') {
    return <Navigate to="/" replace />;
  }

  // 2. Staff / Admin -> Internal Hotel PMS Dashboard
  if (STAFF_ROLES.includes(role)) {
    return <Navigate to="/admin-dashboard" replace />;
  }

  // 3. Unknown or unauthorized role -> Safe error screen (NEVER treat as admin!)
    return <UnauthorizedAccess role={role} />;
};

// Unified Profile Route (Adapts layout depending on role)
const UnifiedProfileRoute = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(user.role);
  if (role === 'super_admin') return <Navigate to="/super-admin/dashboard" replace />;
  if (role === 'customer') {
    return (
      <CustomerLayout>
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2.5rem 1.5rem 5rem 1.5rem' }}>
          <Profile />
        </div>
      </CustomerLayout>
    );
  }

  if (!STAFF_ROLES.includes(role)) return <UnauthorizedAccess role={role} />;

  return (
    <StaffRoute allowedRoles={STAFF_ROLES} departmentSelfService>
      <Profile />
    </StaffRoute>
  );
};

// Unified My Bookings Route (Customer gets modern portal layout)
const UnifiedBookingsRoute = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(user.role);
  if (role === 'super_admin') return <Navigate to="/super-admin/dashboard" replace />;
  if (role === 'customer') {
    return (
      <CustomerLayout>
        <MyBookings />
      </CustomerLayout>
    );
  }

  if (!STAFF_ROLES.includes(role)) return <UnauthorizedAccess role={role} />;

  return (
    <StaffRoute allowedRoles={STAFF_ROLES}>
      <MyBookings />
    </StaffRoute>
  );
};

// Unified Notifications Route (Adapts for Guest Portal vs Staff PMS)
const UnifiedNotificationsRoute = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(user.role);
  if (role === 'super_admin') return <Navigate to="/super-admin/dashboard" replace />;
  if (role === 'customer') {
    return (
      <CustomerLayout>
        <NotificationCenter />
      </CustomerLayout>
    );
  }

  if (!STAFF_ROLES.includes(role)) return <UnauthorizedAccess role={role} />;

  return (
    <StaffRoute allowedRoles={STAFF_ROLES}>
      <NotificationCenter />
    </StaffRoute>
  );
};

// Public Route Component (Redirects authenticated users to their respective home)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    const destination = getLandingPath(user.role);
    return destination ? <Navigate to={destination} replace /> : <UnauthorizedAccess role={user.role} />;
  }

  return children;
};

// Destination Hotel Website Route (Publicly accessible; redirects staff to internal dashboard)
const HotelWebsiteRoute = () => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    const role = normalizeRole(user.role);
    if (role === SUPER_ADMIN_ROLE) return <Navigate to="/super-admin/dashboard" replace />;
    if (STAFF_ROLES.includes(role)) return <Navigate to="/admin-dashboard" replace />;
    if (role !== 'customer') return <UnauthorizedAccess role={role} />;
  }

  return <CustomerHome />;
};

function AppContent() {
  const { user } = useAuth();
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Destination Hotel Website Routes (Public & Customer-facing) */}
        <Route path="/" element={<HotelWebsiteRoute />} />
        <Route path="/super-admin/*" element={<SuperAdminRoute><SuperAdminPanel /></SuperAdminRoute>} />
        <Route path="/staff-attendance" element={<StaffRoute allowedRoles={STAFF_ROLES} departmentSelfService><Attendance /></StaffRoute>} />
        <Route path="/admin/attendance" element={<StaffRoute allowedRoles={['admin']}><Attendance adminView /></StaffRoute>} />
        <Route path="/customer-home" element={<Navigate to="/" replace />} />
        {/* Legacy Customer Dashboard Aliases (Cleanly redirect to Sanctuary Home) */}
        <Route path="/customer-dashboard" element={<Navigate to="/" replace />} />
        <Route path="/my-sanctuary" element={<Navigate to="/" replace />} />

        {/* Dining & Restaurant Experience Routes (Public & Customer-facing) */}
        <Route path="/dining" element={<DiningLanding />} />
        <Route path="/restaurants" element={<DiningLanding />} />
        <Route path="/dining/:slug" element={<RestaurantDetail />} />
        <Route path="/restaurants/:slug" element={<RestaurantDetail />} />

        {/* Events discovery and frontend-only event request routes */}
        <Route path="/events" element={<Events />} />
        <Route path="/events/:category" element={<Events />} />
        <Route path="/events/:category/:hallId" element={<Events />} />
        <Route path="/events/:category/:hallId/book" element={<Events />} />

        {/* Hotel offer browsing routes */}
        <Route path="/offers" element={<Offers />} />
        <Route path="/offers/:audience" element={<Offers />} />
        <Route path="/offers/detail/:offerId" element={<Offers />} />

        {/* Public Authentication Routes */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } 
        />

        {/* Dynamic /dashboard Resolver */}
        <Route 
          path="/dashboard" 
          element={<RoleBasedDashboard />} 
        />

        {/* Internal Staff / Admin Dedicated Dashboard */}
        <Route 
          path="/admin-dashboard" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.dashboard} departmentSelfService>
              <Dashboard />
            </StaffRoute>
          } 
        />

        {/* Self-Service Profile (Role-adaptive Layout) */}
        <Route 
          path="/profile" 
          element={<UnifiedProfileRoute />} 
        />
        <Route 
          path="/account" 
          element={<Navigate to="/profile" replace />} 
        />

        {/* My Reservations (Customer Portal Layout) */}
        <Route 
          path="/my-bookings" 
          element={<UnifiedBookingsRoute />} 
        />
        <Route 
          path="/my-reservations" 
          element={<Navigate to="/my-bookings" replace />} 
        />

        {/* Customer Payment Gateway Return & Verification Routes */}
        <Route 
          path="/payment/success" 
          element={<CustomerRoute><PaymentSuccess /></CustomerRoute>} 
        />
        <Route 
          path="/payment/cancel" 
          element={<CustomerRoute><PaymentCancel /></CustomerRoute>} 
        />

        {/* Staff-Only Internal Management Routes */}
        <Route 
          path="/guests" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.guests} requiredPermission="reservations">
              <Guests />
            </StaffRoute>
          } 
        />
        <Route 
          path="/guests/new" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.guests} requiredPermission="reservations">
              <GuestForm />
            </StaffRoute>
          } 
        />
        <Route 
          path="/guests/:id" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.guests} requiredPermission="reservations">
              <GuestDetails />
            </StaffRoute>
          } 
        />
        <Route 
          path="/guests/:id/edit" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.guests} requiredPermission="reservations">
              <GuestForm />
            </StaffRoute>
          } 
        />

        {/* Reservation Routes (Staff/Admin only) */}
        <Route path="/rooms/dashboard" element={<StaffRoute allowedRoles={ROUTE_ROLES.roomDashboard} requiredPermission="rooms"><RoomManagementDashboard /></StaffRoute>} />
        <Route path="/admin/restaurants/dashboard" element={<StaffRoute allowedRoles={ROUTE_ROLES.restaurantDashboard} requiredPermission="dining"><RestaurantManagementDashboard /></StaffRoute>} />
        <Route path="/admin/events/dashboard" element={<StaffRoute allowedRoles={ROUTE_ROLES.eventDashboard} requiredPermission="events"><EventManagementDashboard /></StaffRoute>} />
        <Route 
          path="/reservations" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.reservations} requiredPermission="reservations">
              <Reservations />
            </StaffRoute>
          } 
        />
        <Route 
          path="/reservations/new" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.reservations} requiredPermission="reservations">
              <ReservationForm />
            </StaffRoute>
          } 
        />
        <Route 
          path="/reservations/:id" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.reservations} requiredPermission="reservations">
              <ReservationDetails />
            </StaffRoute>
          } 
        />
        <Route 
          path="/reservations/:id/edit" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.reservations} requiredPermission="reservations">
              <ReservationForm />
            </StaffRoute>
          } 
        />

        {/* Room Routes (Staff/Admin only) */}
        <Route 
          path="/rooms" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.rooms} requiredPermission="rooms">
              <Rooms />
            </StaffRoute>
          } 
        />
        <Route 
          path="/rooms/new" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.roomForm} requiredPermission="rooms">
              <RoomForm />
            </StaffRoute>
          } 
        />
        <Route 
          path="/rooms/:id/edit" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.roomForm} requiredPermission="rooms">
              <RoomForm />
            </StaffRoute>
          } 
        />

        {/* Travel Agent Routes (Staff/Admin only) */}
        <Route 
          path="/travel-agents" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.travelAgents}>
              <TravelAgents />
            </StaffRoute>
          } 
        />
        <Route 
          path="/travel-agents/new" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.travelAgents}>
              <TravelAgentForm />
            </StaffRoute>
          } 
        />
        <Route 
          path="/travel-agents/:id/edit" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.travelAgents}>
              <TravelAgentForm />
            </StaffRoute>
          } 
        />

        {/* Expense Routes (Staff/Admin only) */}
        <Route 
          path="/expenses" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.expenses}>
              <GuestExpenses />
            </StaffRoute>
          } 
        />
        <Route 
          path="/expenses/new" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.expenses}>
              <ExpenseForm />
            </StaffRoute>
          } 
        />
        <Route 
          path="/expenses/:id/edit" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.expenses}>
              <ExpenseForm />
            </StaffRoute>
          } 
        />

        {/* Invoice Routes (Staff/Admin only) */}
        <Route 
          path="/invoices" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.invoices}>
              <Invoices />
            </StaffRoute>
          } 
        />
        <Route 
          path="/invoices/:id" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.invoices}>
              <InvoiceDetails />
            </StaffRoute>
          } 
        />

        {/* Financial Management & Payment Transactions Routes */}
        <Route 
          path="/admin/finance" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.financialDashboard}>
              <FinancialDashboard />
            </StaffRoute>
          } 
        />
        <Route 
          path="/admin/payments" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.payments}>
              <AdminPayments />
            </StaffRoute>
          } 
        />

        {/* Housekeeping Route (Staff/Admin only) */}
        <Route 
          path="/housekeeping" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.housekeeping}>
              <Housekeeping />
            </StaffRoute>
          } 
        />

        {/* Maintenance Route (Staff/Admin only) */}
        <Route 
          path="/maintenance" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.maintenance}>
              <Maintenance />
            </StaffRoute>
          } 
        />

        {/* Lost & Found Route (Staff/Admin only) */}
        <Route 
          path="/lost-and-found" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.lostAndFound}>
              <LostAndFound />
            </StaffRoute>
          } 
        />

        {/* Reports Route (Staff/Admin only) */}
        <Route 
          path="/reports" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.reports}>
              <Reports />
            </StaffRoute>
          } 
        />

        {/* Staff/Admin Restaurant & Dining Management Route */}
        <Route 
          path="/admin/restaurants" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.restaurants} requiredPermission="dining">
              <AdminRestaurants departmentAdmin={Boolean(user?.departmentAdmin)} adminDepartments={user?.adminDepartments || []} adminPermissions={user?.adminPermissions || []} />
            </StaffRoute>
          } 
        />
        <Route path="/admin/dining-offers" element={<StaffRoute allowedRoles={['super_admin', 'admin', 'manager', 'staff', 'finance']} requiredPermission={['dining', 'offers.dining']}><DepartmentDiningOffers /></StaffRoute>} />
        <Route 
          path="/restaurant-management" 
          element={<Navigate to="/admin/restaurants" replace />} 
        />

        {/* Staff/Admin Event & Banquet Management Route */}
        <Route 
          path="/admin/events" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.events} requiredPermission="events">
              <AdminEvents />
            </StaffRoute>
          } 
        />
        <Route 
          path="/events-management" 
          element={<Navigate to="/admin/events" replace />} 
        />

        {/* Centralized Notification Management Routes */}
        <Route 
          path="/notifications" 
          element={<UnifiedNotificationsRoute />} 
        />
        <Route 
          path="/admin/notifications" 
          element={
            <StaffRoute allowedRoles={ROUTE_ROLES.adminNotifications}>
              <AdminNotifications />
            </StaffRoute>
          } 
        />
        <Route 
          path="/admin-notifications" 
          element={<Navigate to="/admin/notifications" replace />} 
        />

        {/* Fallbacks */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      <ToastContainer 
        position="top-right" 
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        toastClassName="Toastify__toast"
      />
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
