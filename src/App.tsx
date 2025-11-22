
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { InterpreterLayout } from './components/InterpreterLayout';
import { ClientLayout } from './layouts/ClientLayout';
import { RoleSwitcher } from './components/RoleSwitcher';
import { UserRole } from './types';

// Page Imports - Shared / Admin
import { Dashboard } from './pages/Dashboard';
import { BookingsList } from './pages/BookingsList';
import { AdminBookings } from './pages/admin/AdminBookings';

// Admin Billing - Fixed Relative Imports
import { AdminTimesheets } from './pages/admin/billing/TimesheetsPage';
import { AdminBillingDashboard } from './pages/admin/billing/AdminBillingDashboard';
import { AdminClientInvoicesPage } from './pages/admin/billing/AdminClientInvoicesPage';
import { AdminClientInvoiceDetailsPage } from './pages/admin/billing/AdminClientInvoiceDetailsPage';
import { AdminInterpreterInvoicesPage } from './pages/admin/billing/AdminInterpreterInvoicesPage';
import { AdminInterpreterInvoiceDetailsPage } from './pages/admin/billing/AdminInterpreterInvoiceDetailsPage';

// Interpreter Pages
import { InterpreterDashboard } from './pages/interpreter/InterpreterDashboard';
import { InterpreterJobs } from './pages/interpreter/InterpreterJobs';
import { InterpreterJobDetails } from './pages/interpreter/InterpreterJobDetails';
import { InterpreterTimesheets } from './pages/interpreter/InterpreterTimesheets';
import { InterpreterTimesheetForm } from './pages/interpreter/InterpreterTimesheetForm';
import { InterpreterPayments } from './pages/interpreter/InterpreterPayments';
import { InterpreterProfile } from './pages/interpreter/InterpreterProfile';

// Client Pages
import { ClientDashboard } from './pages/client/ClientDashboard';
import { ClientBookingsList } from './pages/client/bookings/ClientBookingsList';
import { ClientNewBooking } from './pages/client/bookings/ClientNewBooking';
import { ClientBookingDetails } from './pages/client/bookings/ClientBookingDetails';
import { ClientInvoicesList } from './pages/client/invoices/ClientInvoicesList';
import { ClientInvoiceDetails } from './pages/client/invoices/ClientInvoiceDetails';
import { ClientProfile } from './pages/client/ClientProfile';

// Role Guard
const ProtectedRoute = ({ children, allowedRoles }: { children?: React.ReactNode, allowedRoles: UserRole[] }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  
  if (!user) return <div className="p-8 text-center">Please use the Debug Role Switcher to log in.</div>;

  if (!allowedRoles.includes(user.role)) {
    return <div className="p-8 text-center text-red-600">Access Denied. You do not have permission to view this page.</div>;
  }

  return <>{children}</>;
};

const App = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            
            {/* --- INTERPRETER ROUTES --- */}
            <Route path="/interpreter/*" element={
              <ProtectedRoute allowedRoles={[UserRole.INTERPRETER]}>
                <InterpreterLayout>
                  <Routes>
                    <Route path="dashboard" element={<InterpreterDashboard />} />
                    <Route path="jobs" element={<InterpreterJobs />} />
                    <Route path="jobs/:id" element={<InterpreterJobDetails />} />
                    <Route path="offers" element={<Navigate to="jobs" replace />} />
                    <Route path="schedule" element={<Navigate to="jobs" replace />} />
                    <Route path="timesheets" element={<InterpreterTimesheets />} />
                    <Route path="timesheets/new/:bookingId" element={<InterpreterTimesheetForm />} />
                    <Route path="billing" element={<InterpreterPayments />} />
                    <Route path="profile" element={<InterpreterProfile />} />
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </InterpreterLayout>
              </ProtectedRoute>
            } />

            {/* --- CLIENT ROUTES --- */}
            <Route path="/client/*" element={
              <ProtectedRoute allowedRoles={[UserRole.CLIENT]}>
                <ClientLayout>
                  <Routes>
                    <Route path="dashboard" element={<ClientDashboard />} />
                    <Route path="bookings" element={<ClientBookingsList />} />
                    <Route path="bookings/:id" element={<ClientBookingDetails />} />
                    <Route path="new-booking" element={<ClientNewBooking />} />
                    <Route path="invoices" element={<ClientInvoicesList />} />
                    <Route path="invoices/:id" element={<ClientInvoiceDetails />} />
                    <Route path="profile" element={<ClientProfile />} />
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </ClientLayout>
              </ProtectedRoute>
            } />

            {/* --- ADMIN ROUTES --- */}
            <Route path="/*" element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  
                  {/* ADMIN */}
                  <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Dashboard /></ProtectedRoute>} />
                  <Route path="/admin/bookings" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminBookings /></ProtectedRoute>} />
                  
                  {/* Admin Billing Routes */}
                  <Route path="/admin/billing" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminBillingDashboard /></ProtectedRoute>} />
                  <Route path="/admin/billing/client-invoices" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminClientInvoicesPage /></ProtectedRoute>} />
                  <Route path="/admin/billing/client-invoices/:id" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminClientInvoiceDetailsPage /></ProtectedRoute>} />
                  <Route path="/admin/billing/interpreter-invoices" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminInterpreterInvoicesPage /></ProtectedRoute>} />
                  <Route path="/admin/billing/interpreter-invoices/:id" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminInterpreterInvoiceDetailsPage /></ProtectedRoute>} />
                  
                  <Route path="/admin/timesheets" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminTimesheets /></ProtectedRoute>} />
                  <Route path="/admin/invoices" element={<Navigate to="/admin/billing" replace />} />
                  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            } />

          </Routes>
          <RoleSwitcher />
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
