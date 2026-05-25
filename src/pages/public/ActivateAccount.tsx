
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, verifyPasswordResetCode } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebaseConfig';
import { Globe2, Lock, Eye, EyeOff, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ensureInterpreterOnboarding } from '../../utils/interpreterFlow';
import { ClientService } from '../../services/clientService';
import { UserRole } from '../../types';

export const ActivateAccount = () => {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const tokenParam = searchParams.get('token') || '';
  const rawOobCode = searchParams.get('oobCode') || '';
  
  const [email, setEmail] = useState(emailParam);
  const [oobCode, setOobCode] = useState('');
  const [activationUser, setActivationUser] = useState<{ id: string; data: any } | null>(null);
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
        setVerifying(false);
        return;
      }

      try {
        const verifiedEmail = (await verifyPasswordResetCode(auth, cleanOobCode)).trim().toLowerCase();
        setEmail(verifiedEmail);
        setOobCode(cleanOobCode);

        let userRecord: { id: string; data: any } | null = null;
        if (cleanToken) {
          const userSnap = await getDoc(doc(db, 'users', cleanToken));
          if (userSnap.exists()) {
            userRecord = { id: userSnap.id, data: userSnap.data() };
          }
        }

        if (!userRecord) {
          const userQuery = query(collection(db, 'users'), where('email', '==', verifiedEmail));
          const userSnap = await getDocs(userQuery);
          if (!userSnap.empty) {
            userRecord = { id: userSnap.docs[0].id, data: userSnap.docs[0].data() };
          }
        }

        if (!userRecord) {
          setLinkError('We could not find the platform account linked to this activation email. Please contact support.');
          return;
        }

        if (![UserRole.INTERPRETER, UserRole.CLIENT].includes(userRecord.data.role)) {
          setLinkError('This activation link is only for client and interpreter accounts.');
          return;
        }

        if (userRecord.data.status === 'ACTIVE') {
          setLinkError('This account is already active. Please go to the login page.');
          return;
        }

        setActivationUser(userRecord);
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

  const finalizeActivation = async (userDocId: string, userData: any, authUid: string) => {
    const activatedUserData = {
      ...userData,
      id: authUid,
      status: 'ACTIVE',
      authUid,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'users', authUid), activatedUserData, { merge: true });
    if (userDocId !== authUid) {
      await deleteDoc(doc(db, 'users', userDocId));
    }

    if (userData.role === UserRole.INTERPRETER && userData.profileId) {
      await updateDoc(doc(db, 'interpreters', userData.profileId), {
        status: 'ONBOARDING',
        isAvailable: false,
        onboarding: ensureInterpreterOnboarding({}),
        updatedAt: new Date().toISOString()
      });
    }

    if (userData.role === UserRole.CLIENT && userData.profileId) {
      await ClientService.convertToMember(userData.profileId);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    
    try {
      let userDocId = activationUser?.id || '';
      let userData = activationUser?.data || null;

      if (!userData) {
        const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const userSnap = await getDocs(userQuery);

        if (userSnap.empty) {
          throw new Error(`Account not found for ${cleanEmail}. Please check the email or contact support.`);
        }

        userDocId = userSnap.docs[0].id;
        userData = userSnap.docs[0].data();
      }

      if (![UserRole.INTERPRETER, UserRole.CLIENT].includes(userData.role)) {
        throw new Error('This activation link is only for client and interpreter accounts.');
      }

      if (userData.status === 'ACTIVE') {
        throw new Error('This account is already active. Please go to the login page.');
      }

      if (!['IMPORTED', 'PENDING'].includes(userData.status)) {
        throw new Error(`Account status is ${userData.status}. This invitation is not ready for activation.`);
      }

      let userCredential;
      if (oobCode) {
        await confirmPasswordReset(auth, oobCode, password);
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      }
      await updateProfile(userCredential.user, { displayName: userData.displayName });

      await finalizeActivation(userDocId, userData, userCredential.user.uid);

      setSuccess(true);
      showToast('Account activated successfully!', 'success');
      
      // Auto redirect after delay
      setTimeout(() => navigate('/login'), 3000);
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
            Welcome to the new Lingland platform. Your account is ready. Redirecting you to login...
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            Go to Login Now
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
                  placeholder="••••••••"
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
                  placeholder="••••••••"
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
