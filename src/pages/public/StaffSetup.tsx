import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../services/firebaseConfig';
import {
  Globe2, Lock, ShieldCheck, ArrowRight,
  Loader2, CheckCircle2, AlertCircle, Eye, EyeOff
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const StaffSetup = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  // Extract params — token is the Auth UID, oobCode is from Firebase password reset
  const rawToken = searchParams.get('token');
  const rawOobCode = searchParams.get('oobCode');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitedUser, setInvitedUser] = useState<any>(null);
  const [oobCode, setOobCode] = useState<string>('');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Password strength calculator
  useEffect(() => {
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    setPasswordStrength(strength);
  }, [password]);

  useEffect(() => {
    const verifyInvitation = async () => {
      // 1. Robust param extraction (HashRouter friendly)
      let cleanToken = searchParams.get('token')?.trim() || '';
      let cleanOobCode = searchParams.get('oobCode')?.trim() || '';
      
      // Fallback for cases where URL might be double-encoded or hash-misplaced
      if (!cleanToken || !cleanOobCode) {
        const fullUrl = window.location.href;
        const urlParams = new URL(fullUrl.replace('#/', '')).searchParams;
        if (!cleanToken) cleanToken = urlParams.get('token')?.trim() || '';
        if (!cleanOobCode) cleanOobCode = urlParams.get('oobCode')?.trim() || '';
      }

      if (!cleanToken || !cleanOobCode) {
        setError('The invitation link appears to be incomplete. Please make sure you clicked the full link from your email.');
        setLoading(false);
        return;
      }

      setOobCode(cleanOobCode);
      console.log('[StaffSetup] Verifying invitation for account:', cleanToken);

      try {
        // 2. Security Check: Verify the oobCode is valid with Firebase first
        // This gives us the user's email and confirms the code hasn't been used/expired
        let verifiedEmail = '';
        try {
          verifiedEmail = await verifyPasswordResetCode(auth, cleanOobCode);
        } catch (authErr: any) {
          console.error('[StaffSetup] Auth Code Verification Failed:', authErr);
          if (authErr.code === 'auth/invalid-action-code') {
            setError('This setup link is invalid or has already been used. Please contact your administrator for a new invitation.');
          } else if (authErr.code === 'auth/expired-action-code') {
            setError('This setup link has expired. Invitations are valid for 24 hours.');
          } else {
            setError('Security verification failed. Please try opening the link again or contact support.');
          }
          setLoading(false);
          return;
        }

        setInvitedUser({ id: cleanToken, email: verifiedEmail });
      } catch (err: any) {
        console.error('[StaffSetup] Verification Error:', err);
        setError('An unexpected error occurred while verifying your invitation. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    verifyInvitation();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    if (!oobCode) {
      showToast('Security code is missing. Please use the link from your invitation email.', 'error');
      return;
    }
    if (!invitedUser?.email) {
      showToast('User information is missing. Please contact your administrator.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Use Firebase's confirmPasswordReset to set the user's chosen password
      //    This validates the oobCode and sets the new password securely
      await confirmPasswordReset(auth, oobCode, password);
      console.log('[StaffSetup] Password set successfully for', invitedUser.email);

      // 2. Immediately sign in with the new credentials
      const credential = await signInWithEmailAndPassword(auth, invitedUser.email, password);
      console.log('[StaffSetup] Signed in successfully');

      if (credential.user.uid !== invitedUser.id) {
        await auth.signOut();
        throw new Error('This setup link does not belong to the authenticated account.');
      }

      const completeActivation = httpsCallable(functions, 'completeAccountActivation');
      await completeActivation({ flow: 'STAFF' });

      showToast('Account activated! Welcome to the team.', 'success');
      
      // 3. Navigate to onboarding (AuthContext will pick up the auth state)
      navigate('/admin/onboarding');
    } catch (err: any) {
      console.error('[StaffSetup] Account activation error:', err);
      if (err.code === 'auth/invalid-action-code') {
        showToast('This setup link has expired or has already been used. Please contact your administrator for a new invitation.', 'error');
      } else if (err.code === 'auth/expired-action-code') {
        showToast('This setup link has expired. Please contact your administrator for a new invitation.', 'error');
      } else if (err.code === 'auth/weak-password') {
        showToast('Password is too weak. Please choose a stronger password.', 'error');
      } else {
        showToast(err.message || 'Failed to complete setup. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return 'bg-red-500';
    if (passwordStrength <= 2) return 'bg-amber-500';
    if (passwordStrength <= 3) return 'bg-yellow-500';
    if (passwordStrength <= 4) return 'bg-green-500';
    return 'bg-emerald-500';
  };

  const getStrengthLabel = () => {
    if (password.length === 0) return '';
    if (passwordStrength <= 1) return 'Weak';
    if (passwordStrength <= 2) return 'Fair';
    if (passwordStrength <= 3) return 'Good';
    if (passwordStrength <= 4) return 'Strong';
    return 'Very Strong';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-medium">Verifying your invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">Setup Link Issue</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm leading-relaxed">{error}</p>
          <button 
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden items-center justify-center p-12 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-indigo-600/10"></div>
        <div className="relative z-10 max-w-lg">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-8 shadow-2xl">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-4xl font-black mb-6 leading-tight tracking-tight">Secure Account<br />Activation</h1>
          <p className="text-lg text-slate-400 leading-relaxed">
            Welcome to the Lingland administrative team. Set your password to activate your professional account and begin your onboarding journey.
          </p>
          <div className="mt-12 space-y-4">
             <div className="flex items-center space-x-3 text-slate-300">
                <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                <span>Encrypted Data Protection</span>
             </div>
             <div className="flex items-center space-x-3 text-slate-300">
                <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                <span>Custom Role Permissions</span>
             </div>
             <div className="flex items-center space-x-3 text-slate-300">
                <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                <span>Professional Dashboard Access</span>
             </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 lg:px-20 xl:px-32 py-12">
        <div className="max-w-md w-full mx-auto">
          <div className="lg:hidden mb-8 text-blue-600"><Globe2 size={40} /></div>
          
          {/* Welcome Header */}
          <div className="mb-10">
            <h2 className="text-3xl font-black tracking-tight mb-2 text-slate-900 dark:text-white">
              Welcome to Lingland
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Set a secure password for your account <strong className="text-slate-700 dark:text-slate-300">{invitedUser?.email}</strong> to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Create Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  id="new-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  className="w-full pl-10 pr-12 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* Password Strength Bar */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= passwordStrength ? getStrengthColor() : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-bold ${
                    passwordStrength <= 1 ? 'text-red-500' :
                    passwordStrength <= 2 ? 'text-amber-500' :
                    passwordStrength <= 3 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {getStrengthLabel()}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Confirm Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  id="confirm-password"
                  name="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className={`w-full pl-10 pr-12 py-3 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all ${
                    confirmPassword.length > 0 && confirmPassword !== password 
                      ? 'border-red-400 dark:border-red-800' 
                      : confirmPassword.length > 0 && confirmPassword === password
                      ? 'border-green-400 dark:border-green-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="text-xs text-red-500 mt-1 font-medium">Passwords do not match</p>
              )}
              {confirmPassword.length > 0 && confirmPassword === password && (
                <p className="text-xs text-green-600 mt-1 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> Passwords match
                </p>
              )}
            </div>

            {/* Submit */}
            <button 
              type="submit"
              disabled={submitting || password.length < 6 || password !== confirmPassword}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Activate Account</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* Security Note */}
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              By activating your account, you agree to uphold the platform's security policies and confidentiality standards.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
