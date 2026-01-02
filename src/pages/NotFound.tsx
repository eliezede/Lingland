
import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const NotFound = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-9xl font-black text-gray-200">404</h1>
        <div className="-mt-12 relative z-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Page not found</h2>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
          </p>
          <div className="flex justify-center space-x-4">
             <Link to="/">
                <Button icon={Home} variant="primary">Go Home</Button>
             </Link>
             <button onClick={() => window.history.back()}>
                <Button icon={ArrowLeft} variant="secondary">Go Back</Button>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
