import React, { useState } from 'react';

export default function AuthModal({ isOpen, onClose, supabase }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  async function handleEmailAuth(e) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!supabase) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        
        if (data.session) {
          setSuccessMsg('Account created and logged in!');
          setTimeout(() => {
            onClose();
          }, 1500);
        } else {
          setSuccessMsg('Sign up successful! Please check your email for a confirmation link.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        setSuccessMsg('Signed in successfully!');
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setErrorMsg('');
    setSuccessMsg('');
    if (!supabase) {
      setErrorMsg('Supabase is not configured.');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initialize Google Login.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-stone-900/60 dark:bg-stone-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-850 rounded-2xl shadow-xl overflow-hidden z-10 flex flex-col transition-colors duration-200">
        
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-stone-200 dark:border-stone-850">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            {isSignUp ? 'Create Dojo Account' : 'Sign In to Dojo'}
          </h2>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 rounded-lg transition"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-350 rounded-xl">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-900 text-emerald-800 dark:text-emerald-350 rounded-xl">
              {successMsg}
            </div>
          )}

          {/* OAuth Option */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white dark:bg-stone-950 border border-stone-250 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-300 transition duration-150 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-stone-200 dark:border-stone-800" />
            <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">or</span>
            <div className="flex-1 border-t border-stone-200 dark:border-stone-800" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {isSignUp && (
              <div>
                <label className="text-xs text-stone-500 block mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : isSignUp ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Toggle Tab Footer */}
          <div className="pt-2 text-center text-xs text-stone-500 border-t border-stone-200/60 dark:border-stone-850/60">
            {isSignUp ? (
              <span>
                Already have an account?{' '}
                <button 
                  onClick={() => { setIsSignUp(false); setErrorMsg(''); setSuccessMsg(''); }} 
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Sign In
                </button>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <button 
                  onClick={() => { setIsSignUp(true); setErrorMsg(''); setSuccessMsg(''); }} 
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Create Account
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
