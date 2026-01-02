
import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { SystemService } from '../services/systemService';
import { useNavigate } from 'react-router-dom';
import { Lock, Globe2, Activity, Database, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Diagnostics
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Check connection on mount
    SystemService.checkConnection().then(isConnected => {
      setDbStatus(isConnected ? 'connected' : 'error');
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/'); // AuthContext will handle redirect based on role
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-api-key' || err.code === 'auth/internal-error') {
         setError('Config Error: Check services/firebaseConfig.ts');
      } else {
         setError('Failed to log in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    if(!window.confirm("Warning: This will add test data to your Firestore database. Continue?")) return;
    
    setSeeding(true);
    try {
      await SystemService.seedDatabase();
      setSeedSuccess(true);
      alert('Database seeded successfully! You can now log in with demo credentials.');
    } catch (e) {
      console.error(e);
      alert('Failed to seed. Please check console for details.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-blue-600">
           <Globe2 size={48} />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to Lingland
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-200">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start">
                <AlertTriangle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
          
          {/* Developer Tools / Diagnostics */}
          <div className="mt-8 pt-6 border-t border-gray-100">
             <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">System Status</h4>
                <div className="flex items-center">
                  {dbStatus === 'checking' && <span className="text-xs text-gray-500">Checking connection...</span>}
                  {dbStatus === 'connected' && <span className="text-xs text-green-600 flex items-center"><CheckCircle size={12} className="mr-1"/> Database Connected</span>}
                  {dbStatus === 'error' && <span className="text-xs text-orange-600 flex items-center"><AlertTriangle size={12} className="mr-1"/> Offline / Mock Mode</span>}
                </div>
             </div>

             {dbStatus === 'error' && (
                <div className="bg-orange-50 p-3 rounded text-xs text-orange-800 mb-4 border border-orange-100">
                  <p className="font-bold mb-1">Database connection failed.</p>
                  <p>Running in <strong>Mock Mode</strong>. Real-time data will not be saved. Check <code>firebaseConfig.ts</code> keys to enable live database.</p>
                </div>
             )}

             {dbStatus === 'connected' && !seedSuccess && (
                <button 
                  onClick={handleSeed}
                  disabled={seeding}
                  className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                   {seeding ? 'Populating...' : 'Developer: Seed Database with Test Data'}
                   {!seeding && <Database size={12} className="ml-2" />}
                </button>
             )}
             
             {seedSuccess && (
               <div className="text-xs text-green-600 text-center bg-green-50 p-2 rounded">
                 Database populated! You can now sign in.
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
