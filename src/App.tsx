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

const lazyNamed = (importer: () => Promise<any>, exportName: string) =>
  React.lazy(async () => {
    const module = await importer();
    return { default: module[exportName] as React.ComponentType<any> };
  });

const AdminLayout = lazyNamed(() => import('./layouts/AdminLayout'), 'AdminLayout');
const InterpreterLayout = lazyNamed(() => import('./layouts/InterpreterLayout'), 'InterpreterLayout');
const ClientLayout = lazyNamed(() => import('./layouts/ClientLayout'), 'ClientLayout');

const NotFound = lazyNamed(() => import('./pages/NotFound'), 'NotFound');
const Dashboard = lazyNamed(() => import('./pages/Dashboard'), 'Dashboard');
const LoginPage = lazyNamed(() => import('./pages/LoginPage'), 'LoginPage');
const LandingPage = lazyNamed(() => import('./pages/public/LandingPage'), 'LandingPage');
const GuestBookingRequest = lazyNamed(() => import('./pages/public/GuestBookingRequest'), 'GuestBookingRequest');
const InterpreterApplicationPage = lazyNamed(() => import('./pages/public/InterpreterApplication'), 'InterpreterApplicationPage');
const ServicesPage = lazyNamed(() => import('./pages/public/ServicesPage'), 'ServicesPage');
const WhyUsPage = React.lazy(() => import('./pages/public/WhyUsPage'));
const InterpretersPage = React.lazy(() => import('./pages/public/InterpretersPage'));
const TermsPage = lazyNamed(() => import('./pages/public/TermsPage'), 'TermsPage');
const StaffSetup = lazyNamed(() => import('./pages/public/StaffSetup'), 'StaffSetup');
const ActivateAccount = lazyNamed(() => import('./pages/public/ActivateAccount'), 'ActivateAccount');

const JobsBoard = lazyNamed(() => import('./pages/admin/operations/JobsBoard'), 'JobsBoard');
const AssignmentCenter = lazyNamed(() => import('./pages/admin/operations/AssignmentCenter'), 'AssignmentCenter');
const TimesheetQueue = lazyNamed(() => import('./pages/admin/operations/TimesheetQueue'), 'TimesheetQueue');
const AdminBookingDetails = React.lazy(() => import('./pages/admin/bookings/AdminBookingDetails'));
const DataCenter = lazyNamed(() => import('./pages/admin/administration/DataCenter'), 'DataCenter');
const GoLiveControl = lazyNamed(() => import('./pages/admin/administration/GoLiveControl'), 'GoLiveControl');
const AdminStaff = lazyNamed(() => import('./pages/admin/administration/AdminStaff'), 'AdminStaff');
const AdminOrgChart = lazyNamed(() => import('./pages/admin/administration/AdminOrgChart'), 'AdminOrgChart');
const AdminProfile = lazyNamed(() => import('./pages/admin/AdminProfile'), 'AdminProfile');
const AuditLog = lazyNamed(() => import('./pages/admin/system/AuditLog'), 'AuditLog');
const AdminBillingDashboard = lazyNamed(() => import('./pages/admin/billing/AdminBillingDashboard'), 'AdminBillingDashboard');
const AdminReports = lazyNamed(() => import('./pages/admin/billing/AdminReports'), 'AdminReports');
const AdminClientInvoicesPage = lazyNamed(() => import('./pages/admin/billing/AdminClientInvoicesPage'), 'AdminClientInvoicesPage');
const AdminClientInvoiceDetailsPage = lazyNamed(() => import('./pages/admin/billing/AdminClientInvoiceDetailsPage'), 'AdminClientInvoiceDetailsPage');
const AdminInterpreterInvoicesPage = lazyNamed(() => import('./pages/admin/billing/AdminInterpreterInvoicesPage'), 'AdminInterpreterInvoicesPage');
const AdminInterpreterInvoiceDetailsPage = lazyNamed(() => import('./pages/admin/billing/AdminInterpreterInvoiceDetailsPage'), 'AdminInterpreterInvoiceDetailsPage');
const AdminClients = lazyNamed(() => import('./pages/admin/AdminClients'), 'AdminClients');
const AdminClientDetails = lazyNamed(() => import('./pages/admin/clients/AdminClientDetails'), 'AdminClientDetails');
const AdminInterpreters = lazyNamed(() => import('./pages/admin/AdminInterpreters'), 'AdminInterpreters');
const AdminInterpreterDetails = lazyNamed(() => import('./pages/admin/interpreters/AdminInterpreterDetails'), 'AdminInterpreterDetails');
const AdminNewBooking = lazyNamed(() => import('./pages/admin/bookings/AdminNewBooking'), 'AdminNewBooking');
const AdminUsers = lazyNamed(() => import('./pages/admin/AdminUsers'), 'AdminUsers');
const AdminSettings = lazyNamed(() => import('./pages/admin/AdminSettings'), 'AdminSettings');
const AdminEmailTemplates = lazyNamed(() => import('./pages/admin/settings/AdminEmailTemplates'), 'AdminEmailTemplates');
const AdminApplications = lazyNamed(() => import('./pages/admin/AdminApplications'), 'AdminApplications');
const AdminMessages = lazyNamed(() => import('./pages/admin/AdminMessages'), 'AdminMessages');
const StaffOnboarding = lazyNamed(() => import('./pages/admin/StaffOnboarding'), 'StaffOnboarding');
const AdminMigration = lazyNamed(() => import('./pages/admin/AdminMigration'), 'AdminMigration');

const InterpreterDashboard = lazyNamed(() => import('./pages/interpreter/InterpreterDashboard'), 'InterpreterDashboard');
const InterpreterJobs = lazyNamed(() => import('./pages/interpreter/InterpreterJobs'), 'InterpreterJobs');
const InterpreterJobDetails = lazyNamed(() => import('./pages/interpreter/InterpreterJobDetails'), 'InterpreterJobDetails');
const InterpreterTimesheets = lazyNamed(() => import('./pages/interpreter/InterpreterTimesheets'), 'InterpreterTimesheets');
const InterpreterTimesheetForm = lazyNamed(() => import('./pages/interpreter/InterpreterTimesheetForm'), 'InterpreterTimesheetForm');
const InterpreterPayments = lazyNamed(() => import('./pages/interpreter/InterpreterPayments'), 'InterpreterPayments');
const InterpreterProfile = lazyNamed(() => import('./pages/interpreter/InterpreterProfile'), 'InterpreterProfile');
const InterpreterMessages = lazyNamed(() => import('./pages/interpreter/InterpreterMessages'), 'InterpreterMessages');
const InterpreterOnboarding = lazyNamed(() => import('./pages/interpreter/InterpreterOnboarding'), 'InterpreterOnboarding');
const InterpreterOffers = lazyNamed(() => import('./pages/interpreter/InterpreterOffers'), 'InterpreterOffers');

const ClientDashboard = lazyNamed(() => import('./pages/client/ClientDashboard'), 'ClientDashboard');
const ClientBookingsList = lazyNamed(() => import('./pages/client/bookings/ClientBookingsList'), 'ClientBookingsList');
const ClientNewBooking = lazyNamed(() => import('./pages/client/bookings/ClientNewBooking'), 'ClientNewBooking');
const ClientBookingDetails = lazyNamed(() => import('./pages/client/bookings/ClientBookingDetails'), 'ClientBookingDetails');
const ClientInvoicesList = lazyNamed(() => import('./pages/client/invoices/ClientInvoicesList'), 'ClientInvoicesList');
const ClientInvoiceDetails = lazyNamed(() => import('./pages/client/invoices/ClientInvoiceDetails'), 'ClientInvoiceDetails');
const ClientProfile = lazyNamed(() => import('./pages/client/ClientProfile'), 'ClientProfile');
const ClientMessages = lazyNamed(() => import('./pages/client/ClientMessages'), 'ClientMessages');

const RouteFallback = () => <div className="min-h-screen bg-slate-50 dark:bg-slate-950" aria-busy="true" />;

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
                      <React.Suspense fallback={<RouteFallback />}>
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
                              <Route path="earnings" element={<Navigate to="/interpreter/billing" replace />} />
                              <Route path="invoices" element={<Navigate to="/interpreter/billing" replace />} />
                              <Route path="settings" element={<Navigate to="/interpreter/profile" replace />} />
                              <Route path="billing/invoice/:id" element={<Navigate to="/interpreter/billing" replace />} />
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
                              <Route path="messages" element={<ClientMessages />} />
                              <Route path="profile" element={<ClientProfile />} />
                              <Route path="settings" element={<Navigate to="/client/profile" replace />} />
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
                              <Route path="operations" element={<Navigate to="/admin/bookings" replace />} />
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
                              <Route path="finance/documents" element={<Navigate to="/admin/billing/client-invoices" replace />} />
                              <Route path="finance/statements" element={<Navigate to="/admin/reports?report=FINANCE_OVERVIEW" replace />} />
                              <Route path="finance/payroll" element={<Navigate to="/admin/billing/interpreter-invoices" replace />} />
                              <Route path="finance/reports" element={<AdminReports />} />
                              <Route path="reports" element={<AdminReports />} />
                              <Route path="administration/data" element={<DataCenter />} />
                              <Route path="administration/go-live" element={<GoLiveControl />} />
                               <Route path="administration/staff" element={<AdminStaff />} />
                               <Route path="administration/org-chart" element={<AdminOrgChart />} />
                               <Route path="profile" element={<AdminProfile />} />
                              <Route path="billing" element={<JobsBoard workspace="finance" />} />
                              <Route path="billing/overview" element={<AdminBillingDashboard />} />
                              <Route path="billing/reports" element={<AdminReports />} />
                              <Route path="billing/timesheets" element={<Navigate to="/admin/operations/timesheets" replace />} />
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
                      </React.Suspense>
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
