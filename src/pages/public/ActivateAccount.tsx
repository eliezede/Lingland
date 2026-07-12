
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../services/firebaseConfig';
import { Globe2, Lock, Eye, EyeOff, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const ActivateAccount = () => {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const tokenParam = searchParams.get('token') || '';
  const rawOobCode = searchParams.get('oobCode') || '';
  
  const [email, setEmail] = useState(emailParam);
  const [oobCode, setOobCode] = useState('');
  const [invitationToken, setInvitationToken] = useState(tokenParam.trim());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(rawOobCode));
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkError, setLinkError] = useState('');
  
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const verifySecureLink = async () => {
      let cleanOobCode = rawOobCode.trim();
      let cleanToken = tokenParam.trim();

      if (!cleanOobCode) {
        const fullUrl = window.location.href;
        const urlParams = new URL(fullUrl.replace('#/', '')).searchParams;
        cleanOobCode = urlParams.get('oobCode')?.trim() || '';
        cleanToken = cleanToken || urlParams.get('token')?.trim() || '';
      }

      if (!cleanOobCode) {
        setLinkError('This activation page must be opened from the secure link in your invitation email.');
        setVerifying(false);
        return;
      }

      try {
        const verifiedEmail = (await verifyPasswordResetCode(auth, cleanOobCode)).trim().toLowerCase();
        setEmail(verifiedEmail);
        setOobCode(cleanOobCode);
        setInvitationToken(cleanToken);
        if (!cleanToken) {
          setLinkError('This activation link is incomplete. Please request a new invitation.');
        }
      } catch (err: any) {
        console.error('[ActivateAccount] Link verification failed:', err);
        if (err.code === 'auth/expired-action-code') {
          setLinkError('This activation link has expired. Please request a new activation email.');
        } else if (err.code === 'auth/invalid-action-code') {
          setLinkError('This activation link is invalid or has already been used. Please request a new activation email.');
        } else {
          setLinkError('We could not verify this activation link. Please try opening the email link again.');
        }
      } finally {
        setVerifying(false);
      }
    };

    verifySecureLink();
  }, [rawOobCode, tokenParam]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    
    try {
      if (!oobCode || !invitationToken) {
        throw new Error('This activation link is incomplete. Please request a new invitation.');
      }

      await confirmPasswordReset(auth, oobCode, password);
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (userCredential.user.uid !== invitationToken) {
        await auth.signOut();
        throw new Error('This activation link does not belong to the authenticated account.');
      }

      const completeActivation = httpsCallable(functions, 'completeAccountActivation');
      const result = await completeActivation({ flow: 'PORTAL' });
      const role = String((result.data as any)?.role || '');
      const destination = role === 'INTERPRETER' ? '/interpreter/dashboard' : '/client/dashboard';

      setSuccess(true);
      showToast('Account activated successfully!', 'success');
      setTimeout(() => {
        navigate(destination, { replace: true });
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        showToast('This account already exists in Firebase. Please use the latest activation email so the password can be set securely.', 'error');
      } else if (err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code') {
        showToast('This activation link has expired or has already been used. Please request a new activation email.', 'error');
      } else {
        showToast(err.message || 'Activation failed', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="text-center">
          <Loader2 size={28} className="mx-auto animate-spin text-blue-600" />
          <p className="mt-4 text-sm font-medium text-slate-500">Verifying activation link...</p>
        </div>
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={30} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Activation Link Issue</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">{linkError}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Account Activated!</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            Welcome to Lingland. Your account is ready and your workspace is opening now.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            Open My Workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
            <Globe2 size={24} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Activate Your Account</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Set your password to join the new platform</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleActivate} className="space-y-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Confirmed Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!emailParam || !!oobCode}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-60"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Create Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-12 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="Minimum 6 characters"
                />
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Confirm Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="Repeat your password"
                />
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  Activate Account
                  <ArrowRight size={18} className="ml-2" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
