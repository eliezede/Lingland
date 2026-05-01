import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { SystemService } from '../services/systemService';
import { useNavigate, Link } from 'react-router-dom';
import {
  Lock, Globe2, Activity, Database, CheckCircle, XCircle, AlertTriangle,
  ArrowRight, Mail, ShieldCheck, Eye, EyeOff
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Diagnostics
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

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
    const ok = await confirm({
      title: 'Seed Test Data',
      message: 'Warning: This will add test data to your Firestore database. Continue?',
      confirmLabel: 'Seed Data',
      variant: 'warning'
    });
    if (!ok) return;

    setSeeding(true);
    try {
      await SystemService.seedDatabase();
      setSeedSuccess(true);
      showToast('Database seeded successfully! You can now log in with demo credentials.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to seed. Please check console for details.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Side: Branding & Visuals */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden items-center justify-center p-12">
        {/* Abstract Background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[100px] -mr-20 -mt-20 mix-blend-screen animate-pulse-slow"></div>
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[80px] -ml-20 -mb-20 mix-blend-screen"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        </div>

        <div className="relative z-10 max-w-lg text-white">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/30">
            <Globe2 size={32} className="text-white" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight leading-tight mb-6">
            Connect with the world's voice.
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed mb-10">
            Access a global network of certified interpreters and linguists. Secure, scalable, and instant.
          </p>
          <div className="flex items-center space-x-8 text-sm font-bold text-slate-500">
            <div className="flex items-center"><ShieldCheck size={18} className="mr-2 text-blue-500" /> Enterprise Security</div>
            <div className="flex items-center"><Activity size={18} className="mr-2 text-green-500" /> 99.99% Uptime</div>
          </div>
        </div>

        {/* Decorative Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20"></div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center py-12 px-6 lg:px-20 xl:px-32 bg-white">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="lg:hidden flex justify-center mb-6 text-blue-600">
            <Globe2 size={40} />
          </div>
          <h2 className="mt-2 text-4xl font-black text-slate-900 tracking-tight">
            Welcome back
          </h2>
          <p className="mt-4 text-sm text-slate-600 font-medium">
            Don't have an account?{' '}
            <Link to="/apply" className="font-bold text-blue-600 hover:text-blue-500 transition-colors underline-offset-4 hover:underline">
              Apply as Interpreter
            </Link>
            {' or '}
            <Link to="/request" className="font-bold text-blue-600 hover:text-blue-500 transition-colors underline-offset-4 hover:underline">
              Book as Guest
            </Link>
          </p>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white">
            <form className="space-y-6" onSubmit={handleLogin}>
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start animate-shake">
                  <AlertTriangle size={18} className="mt-0.5 mr-3 flex-shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-black text-slate-900 uppercase tracking-widest mb-2">
                  Email address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 sm:text-sm font-bold transition-all shadow-sm hover:border-slate-300"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-xs font-black text-slate-900 uppercase tracking-widest">
                    Password
                  </label>
                  <a href="#" className="text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors">Forgot password?</a>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 sm:text-sm font-bold transition-all shadow-sm hover:border-slate-300"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-600/20 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5"
                >
                  {loading ? 'Signing in...' : 'Sign in to Account'}
                  {!loading && <ArrowRight size={18} className="ml-2" />}
                </button>
              </div>
            </form>

            <div className="mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500 font-medium">
                    Or continue with
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="w-full inline-flex justify-center py-2.5 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  <span className="sr-only">Sign in with Google</span>
                  Google
                </button>
                <button className="w-full inline-flex justify-center py-2.5 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  <span className="sr-only">Sign in with Microsoft</span>
                  Microsoft
                </button>
              </div>
            </div>

            {/* Developer Tools / Diagnostics */}
            <div className="mt-12 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4 cursor-pointer group" onClick={() => { }}>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide group-hover:text-slate-600 transition-colors">System Status</h4>
                <div className="flex items-center">
                  {dbStatus === 'checking' && <span className="text-xs text-slate-500">Checking connection...</span>}
                  {dbStatus === 'connected' && <span className="text-xs text-green-600 flex items-center font-bold"><CheckCircle size={12} className="mr-1" /> Online</span>}
                  {dbStatus === 'error' && <span className="text-xs text-orange-600 flex items-center font-bold"><AlertTriangle size={12} className="mr-1" /> Mock Mode</span>}
                </div>
              </div>

              {dbStatus === 'error' && (
                <div className="bg-orange-50 p-3 rounded-lg text-xs text-orange-800 mb-4 border border-orange-100">
                  <p className="font-bold mb-1">Database connection failed.</p>
                  <p>Running in <strong>Mock Mode</strong>. Real-time data will not be saved.</p>
                </div>
              )}

              {dbStatus === 'connected' && !seedSuccess && (
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="w-full flex items-center justify-center px-4 py-2 border border-slate-200 shadow-sm text-xs font-bold rounded-lg text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                >
                  {seeding ? 'Populating...' : 'Developer: Seed Test Data'}
                  {!seeding && <Database size={12} className="ml-2" />}
                </button>
              )}

              {seedSuccess && (
                <div className="text-xs text-green-600 text-center bg-green-50 p-2 rounded-lg font-bold border border-green-100">
                  Database populated!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
