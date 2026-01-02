import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
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
      className={`
        bg-white dark:bg-slate-900 
        rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 
        transition-all duration-300
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-800 active:scale-[0.99]' : ''}
        ${paddingClasses[padding]} 
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
};