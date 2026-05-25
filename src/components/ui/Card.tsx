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
        rounded-lg shadow-sm border border-slate-200/80 dark:border-slate-800
        transition-colors duration-150
        ${onClick ? 'cursor-pointer hover:border-blue-300 hover:bg-slate-50/60 dark:hover:border-blue-800 dark:hover:bg-slate-800/40' : ''}
        ${paddingClasses[padding]} 
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
