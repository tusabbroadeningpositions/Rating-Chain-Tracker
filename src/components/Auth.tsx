import React, { useState, useRef, useEffect } from "react";
import { auth } from "../lib/firebase";
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  User, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { LogIn, LogOut, User as UserIcon, Shield, Key, ChevronDown, Loader2 } from "lucide-react";

interface AuthProps {
  user: User | null;
  isSharedView?: boolean;
}

const INTERNAL_DOMAIN = "@armyratings.internal";

export default function Auth({ user, isSharedView }: AuthProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"google" | "username">("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, provider);
      setIsOpen(false);
    } catch (error: any) {
      console.error("Login failed:", error);
      setError(error.message || "Google login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    setError(null);
    const internalEmail = `${username.toLowerCase().trim()}${INTERNAL_DOMAIN}`;

    try {
      // First try to sign in
      try {
        await signInWithEmailAndPassword(auth, internalEmail, password);
      } catch (signInErr: any) {
        // In modern Firebase, invalid-credential is often returned instead of user-not-found.
        // To support "just giving a username/password", we try to create the user if sign-in fails.
        if (signInErr.code === "auth/user-not-found" || signInErr.code === "auth/invalid-credential") {
          try {
            const userCred = await createUserWithEmailAndPassword(auth, internalEmail, password);
            await updateProfile(userCred.user, { displayName: username });
          } catch (createErr: any) {
            // If creation fails with email-already-in-use, it means the user exists 
            // and the original sign-in error was truly an "incorrect password" case.
            if (createErr.code === "auth/email-already-in-use") {
              throw signInErr;
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }
      setIsOpen(false);
    } catch (err: any) {
      console.error("Username login failed:", err);
      let msg = "Login failed";
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        msg = "Incorrect password for this username";
      } else if (err.code === "auth/weak-password") {
        msg = "Password should be at least 6 characters";
      } else if (err.code === "auth/operation-not-allowed") {
        msg = "Email/Password login is not enabled in Firebase Console. Please enable it in Authentication > Sign-in method.";
      } else {
        msg = err.message || "Authentication error";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (user && !user.isAnonymous) {
    const displayName = user.displayName || user.email?.split("@")[0] || "User";
    return (
      <div className="flex items-center gap-2 bg-slate-800/30 px-2 py-1 rounded border border-slate-700/50">
        <div className="flex items-center gap-1.5 border-r border-slate-700 pr-2 mr-1">
          {user.photoURL ? (
            <img src={user.photoURL} alt={displayName} className="w-5 h-5 rounded-full border border-slate-600" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
              <UserIcon className="w-2.5 h-2.5 text-slate-300" />
            </div>
          )}
          <span className="text-[10px] font-bold text-slate-300 hidden sm:inline max-w-[100px] truncate uppercase tracking-wider">{displayName}</span>
        </div>
        <button
          onClick={handleLogout}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-all"
          title="Logout"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="main-login-trigger flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 px-2.5 py-1.5 rounded font-bold text-[10px] transition-all shadow active:scale-95 uppercase tracking-wider"
        onClick={() => setIsOpen(!isOpen)}
      >
        <LogIn className="w-3 h-3" />
        Sign In
        <ChevronDown className={`w-3 h-3 ml-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          <div className="flex border-b border-slate-800">
            <button 
              onClick={() => { setLoginMode("google"); setError(null); }}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${loginMode === "google" ? "bg-slate-800 text-amber-400" : "text-slate-500 hover:text-slate-300"}`}
            >
              Google
            </button>
            <button 
              onClick={() => { setLoginMode("username"); setError(null); }}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${loginMode === "username" ? "bg-slate-800 text-amber-400" : "text-slate-500 hover:text-slate-300"}`}
            >
              Username
            </button>
          </div>

          <div className="p-4">
            {loginMode === "google" ? (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  Quick and secure access using your Google account.
                </p>
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 py-2 rounded font-bold text-[10px] transition-all disabled:opacity-50 uppercase tracking-wider"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <img src="https://www.google.com/favicon.ico" className="w-3 h-3" alt="G" />}
                  Continue with Google
                </button>
              </div>
            ) : (
              <form onSubmit={handleUsernameLogin} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Username</label>
                  <div className="relative">
                    <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="e.g. leader1"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded py-2 pl-8 pr-3 text-[11px] text-white placeholder:text-slate-700 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded py-2 pl-8 pr-3 text-[11px] text-white placeholder:text-slate-700 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1.5 rounded leading-tight">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 py-2 rounded font-bold text-[10px] transition-all disabled:opacity-50 uppercase tracking-wider mt-2"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                  Sign In
                </button>
              </form>
            )}
          </div>
          
          <div className="bg-slate-950/50 p-2.5 border-t border-slate-800 text-center">
            <p className="text-[8px] text-slate-600 uppercase tracking-widest font-medium">
              Secure Profile Session
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
