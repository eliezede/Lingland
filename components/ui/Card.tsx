import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  // Added optional onClick prop to support interactive cards in lists and dashboards
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', onClick }) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-8',
  };

  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${paddingClasses[padding]} ${className}`}
      // Apply the onClick handler to the container element
      onClick={onClick}
    >
      {children}
    </div>
  );
};