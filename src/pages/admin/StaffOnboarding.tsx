import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { StaffService } from '../../services/staffService';
import { StaffProfile } from '../../types';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';
import { 
  User, Heart, MapPin, Shield, Calendar, Phone, 
  CheckCircle2, ArrowRight, ArrowLeft, Rocket, Camera
} from 'lucide-react';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { ImageCropper } from '../../components/ui/ImageCropper';
import { UserService } from '../../services/userService';
import { PostcodeLookup } from '../../components/ui/PostcodeLookup';
import { UkAddress } from '../../services/addressService';

export const StaffOnboarding = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const p = await StaffService.getProfile(user.id);
        if (p) {
          if (p.onboardingCompleted) {
            if (user.status === 'PENDING') {
              await UserService.update(user.id, { status: 'ACTIVE' });
              await refreshUser();
            }
            navigate('/admin/dashboard');
            return;
          }
          setProfile(p);
        } else {
          // Initialize a skeleton profile if none exists (e.g. for SUPER_ADMIN or new staff)
          setProfile({
            id: '', 
            userId: user.id,
            jobTitleId: '',
            departmentId: '',
            preferences: { theme: 'system', language: 'en', notifications: true },
            onboardingCompleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } as StaffProfile);
        }
      } catch (err) {
        showToast('Error loading profile', 'error');
        // Fallback to skeleton so inputs don't freeze if there's an error (e.g., permission denied)
        setProfile({
          id: '', 
          userId: user.id,
          jobTitleId: '',
          departmentId: '',
          preferences: { theme: 'system', language: 'en', notifications: true },
          onboardingCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as StaffProfile);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user, navigate]);

  const handleUpdate = (field: string, value: any) => {
    console.log('handleUpdate called:', field, value);
    setProfile(prev => {
      console.log('Previous profile:', prev);
      if (!prev) return null;
      const next = { ...prev, [field]: value };
      console.log('Next profile:', next);
      return next;
    });
  };

  const handleAddressUpdate = (field: string, value: string) => {
    setProfile(prev => {
      if (!prev) return null;
      const currentAddress = prev.address || { street: '', town: '', county: '', postcode: '' };
      return { 
        ...prev, 
        address: { 
          ...currentAddress, 
          [field]: value,
          // Clear coordinates if street or postcode changes manually (to ensure data consistency)
          ...(field === 'street' || field === 'postcode' ? { lat: undefined, lng: undefined } : {})
        } 
      };
    });
  };

  const handleEmergencyUpdate = (field: string, value: string) => {
    setProfile(prev => {
      if (!prev) return null;
      return { 
        ...prev, 
        emergencyContact: { ...(prev.emergencyContact || { name: '', relationship: '', phone: '' }), [field]: value } 
      };
    });
  };

  const handleAddressSelect = (addr: UkAddress) => {
    setProfile(prev => {
      if (!prev) return null;
      return {
        ...prev,
        address: {
          street: addr.line1 + (addr.line2 ? `, ${addr.line2}` : ''),
          town: addr.townOrCity,
          county: addr.county,
          postcode: addr.postcode,
          lat: addr.lat,
          lng: addr.lng
        }
      };
    });
    showToast('Address and coordinates populated!', 'success');
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setSelectedImage(reader.result as string);
        setShowCropper(true);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleCropComplete = async (croppedImage: string) => {
    if (!user) return;
    setIsPhotoLoading(true);
    try {
      const photoUrl = await UserService.uploadProfilePhoto(user.id, croppedImage, 'ADMIN');
      handleUpdate('photoUrl', photoUrl);
      showToast('Profile photo updated!', 'success');
    } catch (error) {
      showToast('Failed to update photo', 'error');
    } finally {
      setIsPhotoLoading(false);
      setShowCropper(false);
    }
  };

  const isStepValid = () => {
    if (step === 1) return !!profile?.phone && !!profile?.dob;
    if (step === 2) return !!profile?.niNumber && !!profile?.address?.street && !!profile?.address?.postcode;
    if (step === 3) return !!profile?.emergencyContact?.name && !!profile?.emergencyContact?.phone;
    return true;
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      if (!profile.id) {
        // Create new profile
        const { id, createdAt, updatedAt, ...profileData } = profile;
        await StaffService.createProfile({
          ...profileData,
          onboardingCompleted: true
        });
      } else {
        // Update existing profile
        await StaffService.updateProfile(profile.id, {
          ...profile,
          onboardingCompleted: true
        });
      }
      if (user?.id) {
        await UserService.update(user.id, { status: 'ACTIVE' });
        await refreshUser();
      }
      
      showToast('Welcome to the team! Onboarding complete.', 'success');
      navigate('/admin/dashboard');
    } catch (err) {
      showToast('Failed to complete onboarding', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 text-center">
      <div className="space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Preparing your workspace...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-slate-200 dark:bg-slate-800">
        <div 
            className="h-full bg-blue-600 transition-all duration-500 ease-out" 
            style={{ width: `${(step / 3) * 100}%` }} 
        />
      </div>
      
      <div className="max-w-xl w-full">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-6 group transition-transform hover:scale-105">
            <Rocket className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Welcome to Lingland</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Let's get your professional profile ready in just a few steps.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-8 md:p-12 shadow-2xl transition-all">
          
          <div className="flex items-center justify-center mb-10 gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${s <= step ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  {s < step ? <CheckCircle2 size={14} /> : s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 mx-1 rounded-full ${s < step ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-800'}`} />}
              </div>
            ))}
          </div>

          <div className="space-y-6">
            {step === 1 && (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                <div className="flex items-center gap-6 mb-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                  <div className="relative group">
                    <UserAvatar 
                      name={user?.displayName || ''} 
                      src={profile?.photoUrl} 
                      size="xl"
                      className="ring-4 ring-white dark:ring-slate-900 shadow-xl"
                    />
                    {isPhotoLoading && (
                      <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 rounded-full flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <label className="absolute -bottom-1 -right-1 p-2 bg-blue-600 text-white rounded-full shadow-lg border-2 border-white dark:border-slate-900 cursor-pointer hover:bg-blue-700 hover:scale-110 transition-all">
                      <Camera size={16} />
                      <input type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} />
                    </label>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Profile Photo</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Add a photo to help the team recognize you.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-2">
                    <User className="text-blue-600" size={20} />
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Personal Details</h2>
                </div>
                <div>
                  <label htmlFor="phone" className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-3.5 text-slate-400 pointer-events-none" size={18} />
                    <input 
                      type="tel"
                      id="phone"
                      name="phone"
                      autoComplete="tel"
                      placeholder="+44 7xxx xxxxxx"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                      value={profile?.phone || ''}
                      onChange={e => handleUpdate('phone', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="dob" className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Date of Birth</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-3.5 text-slate-400 pointer-events-none" size={18} />
                    <input 
                      type="date"
                      id="dob"
                      name="dob"
                      autoComplete="bday"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                      value={profile?.dob || ''}
                      onChange={e => handleUpdate('dob', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                <div className="flex items-center gap-3 mb-2">
                    <Shield className="text-blue-600" size={20} />
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Legal & HMRC Data</h2>
                </div>
                <div>
                  <label htmlFor="niNumber" className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">National Insurance Number (NI)</label>
                  <input 
                    type="text"
                    id="niNumber"
                    name="niNumber"
                    autoComplete="off"
                    placeholder="e.g. QQ 12 34 56 C"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20 uppercase font-mono tracking-wider"
                    value={profile?.niNumber || ''}
                    onChange={e => handleUpdate('niNumber', e.target.value)}
                  />
                  <p className="mt-2 text-[10px] text-slate-400 font-medium italic">Mandatory for internal system compliance.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Home Address</label>
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">UK Only</span>
                  </div>
                  
                  {/* UK Postcode Lookup */}
                  <div className="mb-4">
                    <PostcodeLookup onAddressSelected={handleAddressSelect} />
                    <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 ml-1">
                      <div className="w-1 h-1 rounded-full bg-blue-500" />
                      Include house number for exact matches (e.g. "10 SW1A 1AA")
                    </p>
                  </div>

                  <hr className="border-slate-100 dark:border-slate-800 my-4" />

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <input 
                        id="houseNumber"
                        name="houseNumber"
                        autoComplete="address-line2"
                        aria-label="House or Flat Number"
                        placeholder="House/Flat #"
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                        value={profile?.address?.houseNumber || ''}
                        onChange={e => handleAddressUpdate('houseNumber', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <input 
                        id="street"
                        name="street"
                        autoComplete="address-line1"
                        aria-label="Street Address"
                        placeholder="Street Address"
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                        value={profile?.address?.street || ''}
                        onChange={e => handleAddressUpdate('street', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input 
                      id="town"
                      name="town"
                      autoComplete="address-level2"
                      aria-label="Town or City"
                      placeholder="Town/City"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                      value={profile?.address?.town || ''}
                      onChange={e => handleAddressUpdate('town', e.target.value)}
                    />
                    <input 
                      id="county"
                      name="county"
                      autoComplete="address-level1"
                      aria-label="County"
                      placeholder="County"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                      value={profile?.address?.county || ''}
                      onChange={e => handleAddressUpdate('county', e.target.value)}
                    />
                  </div>
                  <div>
                    <input 
                      id="postcode"
                      name="postcode"
                      autoComplete="postal-code"
                      aria-label="Postcode"
                      placeholder="Postcode"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20 uppercase"
                      value={profile?.address?.postcode || ''}
                      onChange={e => handleAddressUpdate('postcode', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                <div className="flex items-center gap-3 mb-2">
                    <Heart className="text-red-500" size={20} />
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Emergency Contact</h2>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-500/5 rounded-2xl border border-red-100 dark:border-red-500/20 mb-4">
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">We hope we never need to use this, but we need someone to contact in case of an emergency during work hours.</p>
                </div>
                <div>
                  <label htmlFor="emergencyName" className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Contact Name</label>
                  <input 
                    id="emergencyName"
                    name="emergencyName"
                    autoComplete="name"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                    value={profile?.emergencyContact?.name || ''}
                    onChange={e => handleEmergencyUpdate('name', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="emergencyRelationship" className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Relationship</label>
                      <input 
                        id="emergencyRelationship"
                        name="emergencyRelationship"
                        autoComplete="off"
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                        value={profile?.emergencyContact?.relationship || ''}
                        onChange={e => handleEmergencyUpdate('relationship', e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="emergencyPhone" className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Phone Number</label>
                      <input 
                        id="emergencyPhone"
                        name="emergencyPhone"
                        autoComplete="tel"
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
                        value={profile?.emergencyContact?.phone || ''}
                        onChange={e => handleEmergencyUpdate('phone', e.target.value)}
                      />
                    </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 mt-12 pt-6 border-t border-slate-50 dark:border-slate-800/50">
            {step > 1 && (
              <Button 
                variant="outline" 
                size="lg" 
                className="px-8 border-none bg-slate-100 dark:bg-slate-800"
                onClick={() => setStep(step - 1)}
                icon={ArrowLeft}
              >
                Back
              </Button>
            )}
            <Button 
              size="lg" 
              className="flex-1"
              disabled={!isStepValid()}
              isLoading={saving}
              onClick={() => step < 3 ? setStep(step + 1) : handleSubmit()}
              icon={step === 3 ? Rocket : ArrowRight}
              iconPosition="right"
            >
              {step === 3 ? "Complete Onboarding" : "Continue"}
            </Button>
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
