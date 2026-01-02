import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';
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
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/public/LandingPage';
import { GuestBookingRequest } from './pages/public/GuestBookingRequest';
import { InterpreterApplication } from './pages/public/InterpreterApplication';

// Admin Pages (Consolidated in src/pages)
import { AdminBookings } from './pages/admin/AdminBookings';
import AdminBookingDetails from './pages/admin/bookings/AdminBookingDetails';
import { AdminTimesheets } from './pages/admin/billing/TimesheetsPage';
import { AdminBillingDashboard } from './pages/admin/billing/AdminBillingDashboard';
import { AdminClientInvoicesPage } from './pages/admin/billing/AdminClientInvoicesPage';
import { AdminClientInvoiceDetailsPage } from './pages/admin/billing/AdminClientInvoiceDetailsPage';
import { AdminInterpreterInvoicesPage } from './pages/admin/billing/AdminInterpreterInvoicesPage';
import { AdminInterpreterInvoiceDetailsPage } from './pages/admin/billing/AdminInterpreterInvoiceDetailsPage';
import { AdminClients } from './pages/admin/AdminClients';
import { AdminInterpreters } from './pages/admin/AdminInterpreters';
import { AdminInterpreterDetails } from './pages/admin/interpreters/AdminInterpreterDetails';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminApplications } from './pages/admin/AdminApplications';

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

const RootRoute = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-white" />;
  if (user) {
    switch (user.role) {
      case UserRole.ADMIN: return <Navigate to="/admin/dashboard" replace />;
      case UserRole.CLIENT: return <Navigate to="/client/dashboard" replace />;
      case UserRole.INTERPRETER: return <Navigate to="/interpreter/dashboard" replace />;
      default: return <LandingPage />;
    }
  }
  return <LandingPage />;
};

const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <SettingsProvider>
            <HashRouter>
              <Routes>
                <Route path="/" element={<RootRoute />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/request" element={<GuestBookingRequest />} />
                <Route path="/apply" element={<InterpreterApplication />} />
                
                {/* --- INTERPRETER ROUTES --- */}
                <Route path="/interpreter/*" element={
                  <ProtectedRoute allowedRoles={[UserRole.INTERPRETER]}>
                    <InterpreterLayout>
                      <Routes>
                        <Route path="dashboard" element={<InterpreterDashboard />} />
                        <Route path="jobs" element={<InterpreterJobs />} />
                        <Route path="jobs/:id" element={<InterpreterJobDetails />} />
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
                        <Route path="bookings/:id" element={<AdminBookingDetails />} />
                        <Route path="applications" element={<AdminApplications />} />
                        <Route path="clients" element={<AdminClients />} />
                        <Route path="interpreters" element={<AdminInterpreters />} />
                        <Route path="interpreters/:id" element={<AdminInterpreterDetails />} />
                        <Route path="users" element={<AdminUsers />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="billing" element={<AdminBillingDashboard />} />
                        <Route path="billing/client-invoices" element={<AdminClientInvoicesPage />} />
                        <Route path="billing/client-invoices/:id" element={<AdminClientInvoiceDetailsPage />} />
                        <Route path="billing/interpreter-invoices" element={<AdminInterpreterInvoicesPage />} />
                        <Route path="billing/interpreter-invoices/:id" element={<AdminInterpreterInvoiceDetailsPage />} />
                        <Route path="timesheets" element={<AdminTimesheets />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </AdminLayout>
                  </ProtectedRoute>
                } />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <RoleSwitcher />
            </HashRouter>
          </SettingsProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;