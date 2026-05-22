import React, { useState } from 'react';
import { Mail, Lock, Car, Loader2, AlertCircle } from 'lucide-react';
import { loginWithGoogle, signInWithEmailAndPassword, createUserWithEmailAndPassword, auth } from '../lib/firebase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = "An error occurred during authentication.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = "Invalid email or password.";
      } else if (err.code === 'auth/email-already-in-use') {
        message = "Email is already in use.";
      } else if (err.code === 'auth/weak-password') {
        message = "Password should be at least 6 characters.";
      } else if (err.code === 'auth/invalid-email') {
        message = "Invalid email format.";
      } else if (err.code === 'auth/operation-not-allowed') {
        message = "This authentication method is not enabled. Please enable it in the Firebase Console.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      // Handle non-error conditions first
      if (err.code === 'auth/popup-closed-by-user') {
        // This is a user cancellation, not a system error.
        // We set googleLoading to false and return without setting an error message.
        setGoogleLoading(false);
        return;
      }

      if (err.code === 'auth/popup-blocked') {
        setError("Sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("Google Sign-In is not enabled. Please enable it in your Firebase Console under Authentication > Sign-in method.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(`Domain Authorization Error: "${window.location.hostname}" is not allowed. Please go to Firebase Console > Authentication > Settings > Authorized Domains and add "${window.location.hostname}" to the list. Make sure to click "Add" and wait 1-2 minutes.`);
      } else if (err.code === 'auth/admin-restricted-operation') {
        setError("Sign-up is disabled. If you are an administrator and need to create the first account, please add your user manually in the Firebase Console under Authentication > Users.");
      } else {
        console.error("Google login error:", err);
        setError("Failed to sign in with Google: " + (err.message || "Unknown error"));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleBootstrap = async () => {
    if (!email || !password) {
      setError("Please enter the email and password you want to set for the admin.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bootstrap failed.");
      
      setError(null);
      alert(data.message + " You can now sign in with your credentials.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4 font-sans">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 sm:p-10 shadow-sm border border-slate-200">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition-transform hover:scale-105">
            <Car size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Philly Car Rental</h1>
          <p className="mt-2 text-slate-500 text-sm font-medium">Ticket Management System</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg bg-rose-50 p-4 text-xs font-bold text-rose-600 border border-rose-100 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={16} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
            <div className="relative group">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-600/5"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Password</label>
            <div className="relative group">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                <Lock size={18} />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-600/5"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {(email === 'license4booking@gmail.com' || email === 'cerezvincent24@gmail.com') && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={loading || googleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 py-3 text-xs font-bold text-indigo-600 hover:bg-indigo-100/50 transition-colors"
            >
              Initialize Admin User
            </button>
            <p className="mt-2 text-[10px] text-center text-slate-400 font-medium">Click above if this is your first time setting up the system.</p>
          </div>
        )}

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-100"></div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Or continue with</span>
          <div className="h-px flex-1 bg-slate-100"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading || googleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 font-bold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <Loader2 className="animate-spin text-slate-400" size={20} />
          ) : (
            <>
              <div className="w-5 h-5 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-full h-full"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="none" d="M1 1h22v22H1z"/></svg>
              </div>
              Google Account
            </>
          )}
        </button>

        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-slate-500">
            For access issues, please contact your administrator.
          </p>
        </div>

        <div className="mt-10 text-center">
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            Philly Car Rental Ticket System v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
