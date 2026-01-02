
import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/billingService';
import { FileText, PoundSterling, Users, Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AdminBillingDashboard = () => {
  const [stats, setStats] = useState<any>({
    pendingClientInvoices: 0,
    pendingClientAmount: 0,
    pendingInterpreterInvoices: 0,
    pendingTimesheets: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await BillingService.getDashboardStats();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Billing Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Client Invoicing */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Client Invoices</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.pendingClientInvoices}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <Briefcase size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Total Value: <span className="font-semibold text-gray-900">£{stats.pendingClientAmount?.toFixed(2) || '0.00'}</span></p>
          <Link to="/admin/billing/client-invoices" className="text-blue-600 text-sm font-medium hover:underline">
            Manage Invoices &rarr;
          </Link>
        </div>

        {/* Card 2: Interpreter Invoicing */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Interpreter Claims</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.pendingInterpreterInvoices}</h3>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
              <Users size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Awaiting approval</p>
          <Link to="/admin/billing/interpreter-invoices" className="text-purple-600 text-sm font-medium hover:underline">
            Review Claims &rarr;
          </Link>
        </div>

        {/* Card 3: Timesheets */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Timesheets</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.pendingTimesheets}</h3>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-yellow-600">
              <FileText size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Need admin approval</p>
          <Link to="/admin/timesheets" className="text-yellow-600 text-sm font-medium hover:underline">
            Go to Timesheets &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
