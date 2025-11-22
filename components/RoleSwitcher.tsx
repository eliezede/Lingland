import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export const RoleSwitcher = () => {
  const { login, user } = useAuth();

  return (
    <div className="fixed bottom-4 right-4 bg-white p-3 rounded-lg shadow-xl border border-gray-200 z-50 opacity-90 hover:opacity-100 transition-opacity">
      <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Debug: Switch Role</p>
      <div className="flex space-x-2">
        {(Object.keys(UserRole) as Array<keyof typeof UserRole>).map((role) => (
          <button
            key={role}
            onClick={() => login(UserRole[role])}
            className={`px-3 py-1 text-xs font-medium rounded ${
              user?.role === UserRole[role] 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {role.charAt(0) + role.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
};