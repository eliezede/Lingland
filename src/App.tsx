import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { RoleSwitcher } from './components/RoleSwitcher';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/routing/ProtectedRoute';
import { UserRole } from './types';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';
import { InterpreterLayout } from './layouts/InterpreterLayout';
import { ClientLayout } from './layouts/ClientLayout';

// Shared / Generic
import { NotFound } from './pages/NotFound';
import { Dashboard } from './pages/Dashboard';

// Admin Pages
import { AdminBookings } from './pages/admin/AdminBookings';
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

// --- ROOT REDIRECT COMPONENT ---
// Intelligently directs users based on their role to prevent loops.
const RootRedirect = () => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return null; // Or a loading spinner
  
  if (!user) {
    // If not logged in, default to admin dashboard (which will show Auth Required)
    return <Navigate to="/admin/dashboard" replace />; 
  }

  switch (user.role) {
    case UserRole.ADMIN:
      return <Navigate to="/admin/dashboard" replace />;
    case UserRole.CLIENT:
      return <Navigate to="/client/dashboard" replace />;
    case UserRole.INTERPRETER:
      return <Navigate to="/interpreter/dashboard" replace />;
    default:
      return <Navigate to="/admin/dashboard" replace />;
  }
};

const App = () => {
  return (
    <ErrorBoundary>
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
                      <Route path="*" element={<NotFound />} />
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
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </ClientLayout>
                </ProtectedRoute>
              } />

              {/* --- ADMIN ROUTES --- */}
              <Route path="/admin/*" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <AdminLayout>
                    <Routes>
                      <Route path="dashboard" element={<Dashboard />} />
                      <Route path="bookings" element={<AdminBookings />} />
                      
                      {/* Billing */}
                      <Route path="billing" element={<AdminBillingDashboard />} />
                      <Route path="billing/client-invoices" element={<AdminClientInvoicesPage />} />
                      <Route path="billing/client-invoices/:id" element={<AdminClientInvoiceDetailsPage />} />
                      <Route path="billing/interpreter-invoices" element={<AdminInterpreterInvoicesPage />} />
                      <Route path="billing/interpreter-invoices/:id" element={<AdminInterpreterInvoiceDetailsPage />} />
                      
                      <Route path="timesheets" element={<AdminTimesheets />} />
                      <Route path="invoices" element={<Navigate to="billing" replace />} />
                      <Route path="clients" element={<div>Clients Page (Todo)</div>} />
                      <Route path="interpreters" element={<div>Interpreters Page (Todo)</div>} />
                      
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AdminLayout>
                </ProtectedRoute>
              } />

              {/* Smart Root Redirect */}
              <Route path="/" element={<RootRedirect />} />
              
              {/* Fallback */}
              <Route path="*" element={<NotFound />} />

            </Routes>
            <RoleSwitcher />
          </HashRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;