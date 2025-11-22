
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClientProfile } from '../../hooks/useClientHooks';
import { Building2, Mail, MapPin, CreditCard, Users } from 'lucide-react';

export const ClientProfile = () => {
  const { user } = useAuth();
  const { profile, loading } = useClientProfile(user?.profileId);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!profile) return <div className="p-8 text-red-500">Profile not found.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold mr-4">
            {profile.companyName.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{profile.companyName}</h2>
            <p className="text-gray-500">Client ID: {profile.id.toUpperCase()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide border-b pb-2">Contact Details</h3>
            
            <div className="flex items-start">
              <Users className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-500">Contact Person</p>
                <p className="font-medium text-gray-900">{profile.contactPerson}</p>
              </div>
            </div>

            <div className="flex items-start">
              <Mail className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-500">Email Address</p>
                <p className="font-medium text-gray-900">{profile.email}</p>
              </div>
            </div>

            <div className="flex items-start">
              <MapPin className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-500">Billing Address</p>
                <p className="font-medium text-gray-900 whitespace-pre-line">{profile.billingAddress}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide border-b pb-2">Billing Information</h3>
            
            <div className="flex items-start">
              <Building2 className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-500">Cost Code Method</p>
                <p className="font-medium text-gray-900">{profile.defaultCostCodeType}</p>
              </div>
            </div>

            <div className="flex items-start">
              <CreditCard className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-500">Payment Terms</p>
                <p className="font-medium text-gray-900">{profile.paymentTermsDays} Days</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
