import React from "react";
import { auth } from "../lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { LogIn, LogOut, User as UserIcon } from "lucide-react";

interface AuthProps {
  user: User | null;
  isSharedView?: boolean;
}

export default function Auth({ user, isSharedView }: AuthProps) {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
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
    return (
      <div className="flex items-center gap-2 bg-slate-800/30 px-2 py-1 rounded border border-slate-700/50">
        <div className="flex items-center gap-1.5 border-r border-slate-700 pr-2 mr-1">
          {user.photoURL ? (
            <img src={user.photoURL} alt={user.displayName || ""} className="w-5 h-5 rounded-full border border-slate-600" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
              <UserIcon className="w-2.5 h-2.5 text-slate-300" />
            </div>
          )}
          <span className="text-[10px] font-bold text-slate-300 hidden sm:inline max-w-[100px] truncate">{user.displayName || user.email}</span>
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

  if (isSharedView) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold shadow-inner">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="hidden sm:inline">LIVE COLLABORATION</span>
          <span className="sm:hidden">LIVE</span>
        </div>
        <button
          onClick={handleLogin}
          className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <button
      id="login-button"
      onClick={handleLogin}
      className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 px-2.5 py-1 rounded font-bold text-[10px] transition-all shadow active:scale-95 uppercase tracking-wider"
    >
      <LogIn className="w-3 h-3" />
      Log In
    </button>
  );
}
