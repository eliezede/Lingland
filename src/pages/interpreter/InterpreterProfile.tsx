import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { InterpreterService } from '../../services/interpreterService';
import { Interpreter } from '../../types';
import { User, Shield, Award, LogOut } from 'lucide-react';

export const InterpreterProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Interpreter | null>(null);

  useEffect(() => {
    if (user?.profileId) {
      InterpreterService.getById(user.profileId).then(p => setProfile(p || null));
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  if (!profile) return <div className="p-8">Loading...</div>;

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      
      <div className="bg-white p-6 rounded-xl border border-gray-200 text-center">
         <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold mx-auto mb-4">
           {profile.name.charAt(0)}
         </div>
         <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
         <p className="text-gray-500">{profile.email}</p>
         <p className="text-gray-500">{profile.phone}</p>
         <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
           {profile.status}
         </span>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
         <div className="flex items-center border-b border-gray-100 pb-4">
           <Shield className="text-blue-600 mr-3" />
           <div>
             <p className="text-sm font-bold text-gray-900">DBS Check</p>
             <p className="text-xs text-gray-500">Expires: {profile.dbsExpiry}</p>
           </div>
         </div>
         <div className="flex items-center">
           <Award className="text-purple-600 mr-3" />
           <div>
             <p className="text-sm font-bold text-gray-900">Languages</p>
             <p className="text-xs text-gray-500">{profile.languages.join(', ')}</p>
           </div>
         </div>
      </div>

      <button 
        onClick={handleLogout}
        className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center hover:bg-red-100 transition-colors"
      >
        <LogOut size={18} className="mr-2" /> Sign Out
      </button>
    </div>
  );
};