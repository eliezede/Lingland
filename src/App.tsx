import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';
import { ChatProvider } from './context/ChatContext';
import { ClientProvider } from './context/ClientContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/routing/ProtectedRoute';
import { ScrollToTop } from './components/routing/ScrollToTop';
import { CommandPalette } from './components/ui/CommandPalette';
import { UserRole } from './types.ts';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';
import { InterpreterLayout } from './layouts/InterpreterLayout';
import { ClientLayout } from './layouts/ClientLayout';

// Shared Pages
import { NotFound } from './pages/NotFound';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/public/LandingPage';
import { GuestBookingRequest } from './pages/public/GuestBookingRequest';
import { InterpreterApplicationPage } from './pages/public/InterpreterApplication';
import { ServicesPage } from './pages/public/ServicesPage';
import WhyUsPage from './pages/public/WhyUsPage';
import InterpretersPage from './pages/public/InterpretersPage';
import { TermsPage } from './pages/public/TermsPage';
import { StaffSetup } from './pages/public/StaffSetup';
import { ActivateAccount } from './pages/public/ActivateAccount';

// Admin Pages
import { JobsBoard } from './pages/admin/operations/JobsBoard';
import { AssignmentCenter } from './pages/admin/operations/AssignmentCenter';
import { TimesheetQueue } from './pages/admin/operations/TimesheetQueue';
import AdminBookingDetails from './pages/admin/bookings/AdminBookingDetails';
import { DocumentCenter } from './pages/admin/finance/DocumentCenter';
import { Statements } from './pages/admin/finance/Statements';
import { Payroll } from './pages/admin/finance/Payroll';
import { ReportsCenter } from './pages/admin/finance/ReportsCenter';
import { DataCenter } from './pages/admin/administration/DataCenter';
import { AdminStaff } from './pages/admin/administration/AdminStaff';
import { AdminOrgChart } from './pages/admin/administration/AdminOrgChart';
import { AdminProfile } from './pages/admin/AdminProfile';
import { AuditLog } from './pages/admin/system/AuditLog';
import { AdminBillingDashboard } from './pages/admin/billing/AdminBillingDashboard';
import { AdminClientInvoicesPage } from './pages/admin/billing/AdminClientInvoicesPage';
import { AdminClientInvoiceDetailsPage } from './pages/admin/billing/AdminClientInvoiceDetailsPage';
import { AdminInterpreterInvoicesPage } from './pages/admin/billing/AdminInterpreterInvoicesPage';
import { AdminInterpreterInvoiceDetailsPage } from './pages/admin/billing/AdminInterpreterInvoiceDetailsPage';
import { AdminClients } from './pages/admin/AdminClients';
import { AdminClientDetails } from './pages/admin/clients/AdminClientDetails';
import { AdminInterpreters } from './pages/admin/AdminInterpreters';
import { AdminInterpreterDetails } from './pages/admin/interpreters/AdminInterpreterDetails';
import { AdminNewBooking } from './pages/admin/bookings/AdminNewBooking';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminEmailTemplates } from './pages/admin/settings/AdminEmailTemplates';
import { AdminApplications } from './pages/admin/AdminApplications';
import { AdminMessages } from './pages/admin/AdminMessages';
import { StaffOnboarding } from './pages/admin/StaffOnboarding';
import { AdminMigration } from './pages/admin/AdminMigration';

// Interpreter Pages
import { InterpreterDashboard } from './pages/interpreter/InterpreterDashboard';
import { InterpreterJobs } from './pages/interpreter/InterpreterJobs';
import { InterpreterJobDetails } from './pages/interpreter/InterpreterJobDetails';
import { InterpreterTimesheets } from './pages/interpreter/InterpreterTimesheets';
import { InterpreterTimesheetForm } from './pages/interpreter/InterpreterTimesheetForm';
import { InterpreterPayments } from './pages/interpreter/InterpreterPayments';
import { InterpreterProfile } from './pages/interpreter/InterpreterProfile';
import { InterpreterMessages } from './pages/interpreter/InterpreterMessages';
import { InterpreterOnboarding } from './pages/interpreter/InterpreterOnboarding';
import { InterpreterOffers } from './pages/interpreter/InterpreterOffers';

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
  if (isLoading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950" />;
  if (user) {
    switch (user.role) {
      case UserRole.SUPER_ADMIN:
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
          <ConfirmProvider>
            <ToastProvider>
              <SettingsProvider>
                <ChatProvider>
                  <ClientProvider>
                    <HashRouter>
                      <ScrollToTop />
                      <CommandPalette />
                      <Routes>
                        <Route path="/" element={<RootRoute />} />
                      <Route path="/login" element={<LoginPage />} />

                      <Route path="/request" element={<GuestBookingRequest />} />
                      <Route path="/apply" element={<InterpreterApplicationPage />} />
                      <Route path="/services" element={<ServicesPage />} />
                      <Route path="/why-us" element={<WhyUsPage />} />
                      <Route path="/interpreters" element={<InterpretersPage />} />
                      <Route path="/terms" element={<TermsPage />} />
                       <Route path="/setup" element={<StaffSetup />} />
                       <Route path="/activate" element={<ActivateAccount />} />

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
                              <Route path="onboarding" element={<InterpreterOnboarding />} />
                              <Route path="messages" element={<InterpreterMessages />} />
                              <Route path="offers" element={<InterpreterOffers />} />
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
                        <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                          <AdminLayout>
                            <Routes>
                              <Route path="dashboard" element={<Dashboard />} />
                              <Route path="messages" element={<AdminMessages />} />
                              <Route path="bookings" element={<JobsBoard />} />
                              <Route path="operations/assignments" element={<AssignmentCenter />} />
                              <Route path="operations/timesheets" element={<TimesheetQueue />} />
                              <Route path="bookings/new" element={<AdminNewBooking />} />
                              <Route path="bookings/:id" element={<AdminBookingDetails />} />
                              <Route path="bookings/edit/:id" element={<AdminNewBooking />} />
                              <Route path="applications" element={<AdminApplications />} />
                              <Route path="clients" element={<AdminClients />} />
                              <Route path="clients/:id" element={<AdminClientDetails />} />
                              <Route path="interpreters" element={<AdminInterpreters />} />
                              <Route path="interpreters/:id" element={<AdminInterpreterDetails />} />
                              <Route path="users" element={<AdminUsers />} />
                              <Route path="settings" element={<AdminSettings />} />
                              <Route path="settings/email-templates" element={<AdminEmailTemplates />} />
                              <Route path="finance/documents" element={<DocumentCenter />} />
                              <Route path="finance/statements" element={<Statements />} />
                              <Route path="finance/payroll" element={<Payroll />} />
                              <Route path="finance/reports" element={<ReportsCenter />} />
                              <Route path="administration/data" element={<DataCenter />} />
                               <Route path="administration/staff" element={<AdminStaff />} />
                               <Route path="administration/org-chart" element={<AdminOrgChart />} />
                               <Route path="profile" element={<AdminProfile />} />
                              <Route path="billing" element={<AdminBillingDashboard />} />
                              <Route path="system/audit-log" element={<AuditLog />} />
                              <Route path="billing/client-invoices" element={<AdminClientInvoicesPage />} />
                              <Route path="billing/client-invoices/:id" element={<AdminClientInvoiceDetailsPage />} />
                              <Route path="billing/interpreter-invoices" element={<AdminInterpreterInvoicesPage />} />
                               <Route path="billing/interpreter-invoices/:id" element={<AdminInterpreterInvoiceDetailsPage />} />
                               <Route path="onboarding" element={<StaffOnboarding />} />
                               <Route path="administration/migration" element={<AdminMigration />} />
                               <Route path="*" element={<NotFound />} />
                            </Routes>
                          </AdminLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </HashRouter>
                  </ClientProvider>
                </ChatProvider>
              </SettingsProvider>
            </ToastProvider>
          </ConfirmProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
