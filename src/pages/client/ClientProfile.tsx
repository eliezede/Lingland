import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClientProfile } from '../../hooks/useClientHooks';
import { Building2, Mail, MapPin, CreditCard, Users, Upload, ShieldCheck } from 'lucide-react';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { ImageCropper } from '../../components/ui/ImageCropper';
import { UserService } from '../../services/userService';
import { useToast } from '../../context/ToastContext';
import { useClientPortal } from '../../context/ClientPortalContext';

export const ClientProfile = () => {
  const { user, refreshUser } = useAuth();
  const { profile, loading } = useClientProfile(user?.clientId || user?.profileId);
  const { access } = useClientPortal();
  const { showToast } = useToast();

  const [showCropper, setShowCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (croppedImage: string) => {
    if (!user?.id) return;
    setIsUploading(true);
    try {
      const photoUrl = await UserService.uploadProfilePhoto(user.id, croppedImage, 'CLIENT');
      // Note: useClientProfile might not auto-refresh if it's not reactive to the user object's photoUrl change
      // but the main user record is updated.
      await refreshUser();
      showToast('Profile photo updated', 'success');
    } catch (error) {
      showToast('Failed to update photo', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!profile) return <div className="p-8 text-red-500">Profile not found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account & organisation</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Your identity and access scope within this client account.</p>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center mb-8">
          <div className="relative group mr-6">
            <UserAvatar 
              src={user?.photoUrl || profile.photoUrl} 
              name={profile.companyName} 
              size="2xl" 
              showBorder 
              className={isUploading ? 'opacity-50' : ''}
            />
            
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg border-2 border-white cursor-pointer flex items-center justify-center transition-all hover:scale-110 group-hover:rotate-6">
              <Upload size={14} strokeWidth={2.5} />
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} disabled={isUploading} />
            </label>
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><ShieldCheck size={20} /></div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Portal access</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{access?.agent?.displayName || user?.displayName} / {access?.agent?.email || user?.email}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Access level</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{(access?.membership?.accessLevel || 'LEGACY').replaceAll('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Departments</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{access?.departments.map(department => department.name).join(', ') || 'Organisation-wide'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Requests</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{access?.canRequest ? 'Can submit' : access?.canViewBookings ? 'View only' : 'No access'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Finance</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{access?.canReadFinance ? 'Invoice access' : 'No access'}</p>
          </div>
        </div>
      </div>

      {selectedImage && (
        <ImageCropper
          image={selectedImage}
          isOpen={showCropper}
          onClose={() => setShowCropper(false)}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
};
