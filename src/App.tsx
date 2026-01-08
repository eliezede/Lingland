import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { SettingsProvider } from './context/SettingsContext.tsx';
import { ChatProvider } from './context/ChatContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ProtectedRoute } from './components/routing/ProtectedRoute.tsx';
import { UserRole } from './types.ts';

// Layouts
import { AdminLayout } from './layouts/AdminLayout.tsx';
import { InterpreterLayout } from './layouts/InterpreterLayout.tsx';
import { ClientLayout } from './layouts/ClientLayout.tsx';

// Shared Pages
import { NotFound } from './pages/NotFound.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { LandingPage } from './pages/public/LandingPage.tsx';
import { GuestBookingRequest } from './pages/public/GuestBookingRequest.tsx';
import { InterpreterApplication } from './pages/public/InterpreterApplication.tsx';

// Admin Pages
import { AdminBookings } from './pages/admin/AdminBookings.tsx';
import AdminBookingDetails from './pages/admin/bookings/AdminBookingDetails.tsx';
import { AdminTimesheets } from './pages/admin/billing/TimesheetsPage.tsx';
import { AdminBillingDashboard } from './pages/admin/billing/AdminBillingDashboard.tsx';
import { AdminClientInvoicesPage } from './pages/admin/billing/AdminClientInvoicesPage.tsx';
import { AdminClientInvoiceDetailsPage } from './pages/admin/billing/AdminClientInvoiceDetailsPage.tsx';
import { AdminInterpreterInvoicesPage } from './pages/admin/billing/AdminInterpreterInvoicesPage.tsx';
import { AdminInterpreterInvoiceDetailsPage } from './pages/admin/billing/AdminInterpreterInvoiceDetailsPage.tsx';
import { AdminClients } from './pages/admin/AdminClients.tsx';
import { AdminInterpreters } from './pages/admin/AdminInterpreters.tsx';
import { AdminInterpreterDetails } from './pages/admin/interpreters/AdminInterpreterDetails.tsx';
import { AdminUsers } from './pages/admin/AdminUsers.tsx';
import { AdminSettings } from './pages/admin/AdminSettings.tsx';
import { AdminApplications } from './pages/admin/AdminApplications.tsx';
import { AdminMessages } from './pages/admin/AdminMessages.tsx';

// Interpreter Pages
import { InterpreterDashboard } from './pages/interpreter/InterpreterDashboard.tsx';
import { InterpreterJobs } from './pages/interpreter/InterpreterJobs.tsx';
import { InterpreterJobDetails } from './pages/interpreter/InterpreterJobDetails.tsx';
import { InterpreterTimesheets } from './pages/interpreter/InterpreterTimesheets.tsx';
import { InterpreterTimesheetForm } from './pages/interpreter/InterpreterTimesheetForm.tsx';
import { InterpreterPayments } from './pages/interpreter/InterpreterPayments.tsx';
import { InterpreterProfile } from './pages/interpreter/InterpreterProfile.tsx';

// Client Pages
import { ClientDashboard } from './pages/client/ClientDashboard.tsx';
import { ClientBookingsList } from './pages/client/bookings/ClientBookingsList.tsx';
import { ClientNewBooking } from './pages/client/bookings/ClientNewBooking.tsx';
import { ClientBookingDetails } from './pages/client/bookings/ClientBookingDetails.tsx';
import { ClientInvoicesList } from './pages/client/invoices/ClientInvoicesList.tsx';
import { ClientInvoiceDetails } from './pages/client/invoices/ClientInvoiceDetails.tsx';
import { ClientProfile } from './pages/client/ClientProfile.tsx';

const RootRoute = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950" />;
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
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <SettingsProvider>
              <ChatProvider>
                <HashRouter>
                  <Routes>
                    <Route path="/" element={<RootRoute />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/request" element={<GuestBookingRequest />} />
                    <Route path="/apply" element={<InterpreterApplication />} />
                    
                    {/* Interpreter Section */}
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

                    {/* Client Section */}
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

                    {/* Admin Section */}
                    <Route path="/admin/*" element={
                      <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                        <AdminLayout>
                          <Routes>
                            <Route path="dashboard" element={<Dashboard />} />
                            <Route path="messages" element={<AdminMessages />} />
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
                </HashRouter>
              </ChatProvider>
            </SettingsProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;