
import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

interface AlertProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ type = 'info', title, message, className = '' }) => {
  const configs = {
    success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: CheckCircle, iconColor: 'text-green-500' },
    error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: XCircle, iconColor: 'text-red-500' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: AlertCircle, iconColor: 'text-yellow-500' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: Info, iconColor: 'text-blue-500' },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-md border p-4 ${config.bg} ${config.border} ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={`h-5 w-5 ${config.iconColor}`} aria-hidden="true" />
        </div>
        <div className="ml-3">
          {title && <h3 className={`text-sm font-medium ${config.text}`}>{title}</h3>}
          <div className={`text-sm ${title ? 'mt-2' : ''} ${config.text}`}>
            {message}
          </div>
        </div>
      </div>
    </div>
  );
};
