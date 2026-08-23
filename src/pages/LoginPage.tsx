import React, { useState, useEffect } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { SystemService } from '../services/systemService';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Lock, Activity, CheckCircle, AlertTriangle,
  ArrowRight, Mail, ShieldCheck, Eye, EyeOff
} from 'lucide-react';
import { BrandLogo } from '../components/ui/BrandLogo';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Diagnostics
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const navigate = useNavigate();
  const location = useLocation();

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
    setNotice('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      const returnPath = (location.state as { from?: string } | null)?.from;
      navigate(returnPath || '/', { replace: true });
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

  const handlePasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setError('');
    setNotice('');
    if (!cleanEmail) {
      setError('Enter your email address above, then select Forgot password.');
      return;
    }

    setResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setNotice('Password reset email sent. Check your inbox and spam folder.');
    } catch (err: any) {
      console.error(err);
      setError('We could not send the reset email. Check the address and try again.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="relative min-h-screen flex bg-white dark:bg-slate-950">
      <ThemeToggle className="absolute right-4 top-4 z-20 border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" />
      {/* Left Side: Branding & Visuals */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden items-center justify-center p-12">
        {/* Abstract Background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[100px] -mr-20 -mt-20 mix-blend-screen animate-pulse-slow"></div>
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[80px] -ml-20 -mb-20 mix-blend-screen"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        </div>

        <div className="relative z-10 max-w-lg text-white">
          <BrandLogo variant="wordmark" tone="light" size="xl" className="mb-10 max-w-full" />
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
      <div className="w-full lg:w-1/2 flex flex-col justify-center py-12 px-6 lg:px-20 xl:px-32 bg-white dark:bg-slate-950">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <BrandLogo variant="wordmark" tone="inherit" size="lg" className="mx-auto mb-8 max-w-[280px] text-slate-950 dark:text-white lg:hidden" />
          <h2 className="mt-2 text-4xl font-black text-slate-900 tracking-tight dark:text-white">
            Welcome back
          </h2>
          <p className="mt-4 text-sm text-slate-600 font-medium dark:text-slate-300">
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
          <div className="bg-white dark:bg-slate-950">
            <form className="space-y-6" onSubmit={handleLogin}>
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm flex items-start animate-shake dark:bg-red-950/30 dark:text-red-300">
                  <AlertTriangle size={18} className="mt-0.5 mr-3 flex-shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-black text-slate-900 uppercase tracking-widest mb-2 dark:text-slate-200">
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
                    className="appearance-none block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 sm:text-sm font-bold transition-all shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-900"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-xs font-black text-slate-900 uppercase tracking-widest dark:text-slate-200">
                    Password
                  </label>
                  <button type="button" onClick={handlePasswordReset} disabled={resettingPassword} className="text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors disabled:opacity-50">
                    {resettingPassword ? 'Sending...' : 'Forgot password?'}
                  </button>
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
                    className="appearance-none block w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 sm:text-sm font-bold transition-all shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-900"
                    placeholder="Enter your password"
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

            {/* Developer Tools / Diagnostics */}
            <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">System Status</h4>
                <div className="flex items-center">
                  {dbStatus === 'checking' && <span className="text-xs text-slate-500">Checking connection...</span>}
                  {dbStatus === 'connected' && <span className="text-xs text-green-600 flex items-center font-bold"><CheckCircle size={12} className="mr-1" /> Online</span>}
                  {dbStatus === 'error' && <span className="text-xs text-red-600 flex items-center font-bold"><AlertTriangle size={12} className="mr-1" /> Unavailable</span>}
                </div>
              </div>

              {dbStatus === 'error' && (
                <div className="bg-red-50 p-3 rounded-lg text-xs text-red-800 mb-4 border border-red-100">
                  <p className="font-bold mb-1">Platform services are temporarily unavailable.</p>
                  <p>No account or operational data will be simulated. Please try again shortly.</p>
                </div>
              )}

              {notice && (
                <div className="flex items-start rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle size={18} className="mr-3 mt-0.5 shrink-0" />
                  <span className="font-medium">{notice}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
