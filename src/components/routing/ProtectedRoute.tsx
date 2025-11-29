
import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import { Home, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  // FIX: Redirect to Landing Page immediately if not authenticated
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
         <div className="max-w-md text-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            Your account type (<strong>{user.role}</strong>) does not have permission to view this page.
          </p>
          <Link to="/">
            <Button variant="primary" icon={Home}>Go to My Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
