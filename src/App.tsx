/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ArmyRatingRecord, RatingRole, RatingScheme } from "./types";
import { INITIAL_RECORDS } from "./sampleData";
import RatingForm from "./components/RatingForm";
import RatingTable from "./components/RatingTable";
import OrgChartPreview from "./components/OrgChartPreview";
import ConfirmDialog from "./components/ConfirmDialog";
import Auth from "./components/Auth";
import SchemeSelector from "./components/SchemeSelector";
import { Network, List, Shield, HelpCircle, Users, Layers, Sparkles, LogIn, Cloud, Smartphone, Monitor, Trash2 } from "lucide-react";
import { auth } from "./lib/firebase";
import { onAuthStateChanged, User, signInAnonymously } from "firebase/auth";
import { 
  subscribeToSchemes, 
  subscribeToRecords, 
  saveRecord, 
  deleteRecord as dbDeleteRecord,
  batchSaveRecords,
  deleteScheme,
  renameScheme,
  overwriteSchemeRecords,
  toggleSchemeShare,
  getScheme,
  duplicateScheme,
  createDefaultScheme,
  toggleSchemeEdit,
  copyVersion
} from "./lib/firebaseService";
import { Share2, Link, Globe, Lock, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "army_rating_scheme_records";
const ACTIVE_SCHEME_KEY = "army_rating_active_scheme_id";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [schemes, setSchemes] = useState<RatingScheme[]>([]);
  const [activeSchemeId, setActiveSchemeId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("share") || localStorage.getItem(ACTIVE_SCHEME_KEY);
    } catch (e) {
      console.warn("localStorage not available:", e);
      return null;
    }
  });
  const [records, setRecords] = useState<ArmyRatingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [sharedScheme, setSharedScheme] = useState<RatingScheme | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<"current" | "future" | "alternate">("current");

  // Safety fallback for loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn("Loading timeout reached, forcing app to display.");
        setIsLoading(false);
      }
    }, 5000); // 5 second safety net
    return () => clearTimeout(timer);
  }, [isLoading]);

  const [activeTab, setActiveTab] = useState<"chart" | "table">("table");
  const [editingRecord, setEditingRecord] = useState<ArmyRatingRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: "danger" | "warning" | "info" | "question";
  } | null>(null);

  const closeConfirm = () => {
    setConfirmConfig(null);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setAuthChecked(true);
      } else {
        // If not signed in, sign in anonymously to satisfy Firestore rules silently
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.warn("Anonymous auth not enabled or restricted, running in offline/local guest mode.");
          setUser(null);
          setAuthChecked(true);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Load local records if no active scheme (Guest Mode / Offline Sandbox)
  useEffect(() => {
    if (authChecked && !activeSchemeId) {
      setIsLoading(false);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as ArmyRatingRecord[];
          // If it contains the old default data, reset it to the new INITIAL_RECORDS
          const hasOldData = parsed.some(r => r.name === "Morris, Patrick" || r.name === "Cadle, David" || r.name === "Smith, John" || r.name === "Morris, Aaron");
          if (hasOldData) {
            setRecords(INITIAL_RECORDS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_RECORDS));
          } else {
            setRecords(parsed);
          }
        } catch (e) {
          setRecords(INITIAL_RECORDS);
        }
      } else {
        setRecords(INITIAL_RECORDS);
      }
    }
  }, [activeSchemeId, authChecked]);

  // Fetch shared scheme metadata if not owned by current user
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!activeSchemeId) {
        setSharedScheme(null);
        if (authChecked && !user) setIsLoading(false);
        return;
      }

      // Check if we already have it in our schemes (if logged in)
      const owned = schemes.find(s => s.id === activeSchemeId);
      if (owned) {
        setSharedScheme(null);
        setIsLoading(false);
        return;
      }

      // If not owned, we must fetch it to check if it's shared
      try {
        const scheme = await getScheme(activeSchemeId);
        if (scheme) {
          if (scheme.isShared) {
            setSharedScheme(scheme);
          } else {
            // It exists but it's not shared anymore
            setSharedScheme(null);
            setActiveSchemeId(null);
            localStorage.removeItem(ACTIVE_SCHEME_KEY);
            const url = new URL(window.location.href);
            url.searchParams.delete("share");
            window.history.replaceState({}, "", url.toString());
          }
        } else {
          setSharedScheme(null);
          setActiveSchemeId(null);
          localStorage.removeItem(ACTIVE_SCHEME_KEY);
          const url = new URL(window.location.href);
          url.searchParams.delete("share");
          window.history.replaceState({}, "", url.toString());
        }
      } catch (error) {
        console.warn("Error fetching shared scheme, falling back to local Guest Mode:", error);
        setSharedScheme(null);
        setActiveSchemeId(null);
        localStorage.removeItem(ACTIVE_SCHEME_KEY);
        const url = new URL(window.location.href);
        url.searchParams.delete("share");
        window.history.replaceState({}, "", url.toString());
      } finally {
        setIsLoading(false);
      }
    };

    if (authChecked) {
      fetchMetadata();
    }
  }, [activeSchemeId, schemes, authChecked, user]);

  // Schemes Listener
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setSchemes([]);
      return;
    }
    const unsubscribe = subscribeToSchemes(user.uid, async (fetchedSchemes) => {
      setSchemes(fetchedSchemes);
      if (fetchedSchemes.length > 0) {
        const schemeExists = fetchedSchemes.some(s => s.id === activeSchemeId);
        if (!activeSchemeId || !schemeExists) {
          setActiveSchemeId(fetchedSchemes[0].id);
        }
        setIsLoading(false);
      } else {
        // No schemes exist for this user. Create the default "Blues Rating Scheme"
        setIsLoading(true);
        try {
          const defaultSchemeId = await createDefaultScheme(user.uid);
          if (!activeSchemeId) {
            setActiveSchemeId(defaultSchemeId);
          }
        } catch (error) {
          console.error("Error creating default scheme:", error);
          setIsLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [user, activeSchemeId]);

  // Records Listener
  useEffect(() => {
    if (!activeSchemeId) return;
    
    // When switching rating scheme profile, default to current version
    setSelectedVersion("current");
    
    // Subscribe to records if we have a schemeId
    const unsubscribe = subscribeToRecords(
      activeSchemeId, 
      (fetchedRecords) => {
        setRecords(fetchedRecords);
      },
      undefined,
      (error) => {
        console.warn("Records subscription failed, falling back to local Guest Mode:", error);
        setActiveSchemeId(null);
        localStorage.removeItem(ACTIVE_SCHEME_KEY);
        const url = new URL(window.location.href);
        url.searchParams.delete("share");
        window.history.replaceState({}, "", url.toString());
      }
    );
    return () => unsubscribe();
  }, [activeSchemeId]);

  // Update localStorage for active scheme
  useEffect(() => {
    if (activeSchemeId) {
      localStorage.setItem(ACTIVE_SCHEME_KEY, activeSchemeId);
    }
  }, [activeSchemeId]);

  const currentScheme = schemes.find(s => s.id === activeSchemeId) || sharedScheme;
  const isOwner = currentScheme?.userId === user?.uid;
  const isAnonymous = user?.isAnonymous || !user;
  const isSharedView = !!sharedScheme;
  const canEdit = !activeSchemeId || isOwner || !!(currentScheme?.isShared && currentScheme?.allowEdit);

  const handleCopyVersion = async (
    fromVer: "current" | "future" | "alternate",
    toVer: "current" | "future" | "alternate"
  ) => {
    const currentScheme = schemes.find(s => s.id === activeSchemeId) || sharedScheme;
    
    if (activeSchemeId && canEdit) {
      setIsLoading(true);
      try {
        await copyVersion(currentScheme?.userId || user?.uid || "guest", activeSchemeId, fromVer, toVer);
      } catch (error) {
        console.error("Error copying version:", error);
      } finally {
        setIsLoading(false);
      }
    } else if (!activeSchemeId) {
      // Guest mode
      const sourceRecords = records.filter(r => (r.version || "current") === fromVer);
      
      const idMap: { [oldId: string]: string } = {};
      sourceRecords.forEach(r => {
        idMap[r.id] = `record_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
      });
      
      const cloned: ArmyRatingRecord[] = sourceRecords.map(r => ({
        ...r,
        id: idMap[r.id],
        raterId: idMap[r.raterId] || (r.raterId ? r.raterId : ""),
        seniorRaterId: idMap[r.seniorRaterId] || (r.seniorRaterId ? r.seniorRaterId : ""),
        reviewerId: idMap[r.reviewerId] || (r.reviewerId ? r.reviewerId : ""),
        version: toVer
      }));
      
      const remaining = records.filter(r => (r.version || "current") !== toVer);
      const updated = [...remaining, ...cloned];
      setRecords(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  // Add or edit a record
  const handleSaveRecord = async (record: ArmyRatingRecord) => {
    const currentScheme = schemes.find(s => s.id === activeSchemeId) || sharedScheme;
    
    const recordWithVersion = {
      ...record,
      version: editingRecord ? (editingRecord.version || "current") : selectedVersion
    };
    
    if (activeSchemeId && canEdit) {
      await saveRecord(recordWithVersion, currentScheme?.userId || user?.uid || "guest", activeSchemeId);
    } else if (!activeSchemeId) {
      const exists = records.some(r => r.id === record.id);
      let updated: ArmyRatingRecord[];
      if (exists) {
        updated = records.map(r => r.id === record.id ? recordWithVersion : r);
      } else {
        updated = [...records, recordWithVersion];
      }
      setRecords(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    setIsFormOpen(false);
    setEditingRecord(null);
  };

  // Delete a record
  const handleDeleteRecord = (id: string) => {
    const recordToDelete = records.find(r => r.id === id);
    const displayName = recordToDelete ? `${recordToDelete.rank} ${recordToDelete.name}` : "this individual";

    setConfirmConfig({
      isOpen: true,
      title: "Remove Soldier from Roster",
      message: `Are you sure you want to remove ${displayName} from the rating scheme? This action is irreversible and will clear any rating chain links pointing to this individual.`,
      confirmLabel: "REMOVE SOLDIER",
      cancelLabel: "KEEP SOLDIER",
      variant: "danger",
      onConfirm: async () => {
        const currentScheme = schemes.find(s => s.id === activeSchemeId) || sharedScheme;
        if (activeSchemeId && canEdit) {
          // In Firebase, we update the links first, then delete
          const updated = records.filter(r => r.id !== id);
          const cleaned = updated.map(r => ({
            ...r,
            raterId: r.raterId === id ? "" : r.raterId,
            seniorRaterId: r.seniorRaterId === id ? "" : r.seniorRaterId,
            reviewerId: r.reviewerId === id ? "" : r.reviewerId
          }));
          await batchSaveRecords(cleaned, currentScheme?.userId || user?.uid || "guest", activeSchemeId);
          await dbDeleteRecord(id);
        } else if (!activeSchemeId) {
          const updated = records.filter(r => r.id !== id);
          const cleaned = updated.map(r => ({
            ...r,
            raterId: r.raterId === id ? "" : r.raterId,
            seniorRaterId: r.seniorRaterId === id ? "" : r.seniorRaterId,
            reviewerId: r.reviewerId === id ? "" : r.reviewerId
          }));
          setRecords(cleaned);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        }
      }
    });
  };

  // Import CSV rows
  const handleImportCSV = async (newRecords: ArmyRatingRecord[], append: boolean) => {
    const currentScheme = schemes.find(s => s.id === activeSchemeId) || sharedScheme;
    
    const newRecordsWithVersion = newRecords.map(r => ({
      ...r,
      version: selectedVersion
    }));

    if (activeSchemeId && canEdit) {
      if (append) {
        await batchSaveRecords(newRecordsWithVersion, currentScheme?.userId || user?.uid || "guest", activeSchemeId);
      } else {
        const otherVersionsRecords = records.filter(r => (r.version || "current") !== selectedVersion);
        const combined = [...otherVersionsRecords, ...newRecordsWithVersion];
        await overwriteSchemeRecords(combined, currentScheme?.userId || user?.uid || "guest", activeSchemeId);
      }
    } else if (!activeSchemeId) {
      const otherVersionsRecords = records.filter(r => (r.version || "current") !== selectedVersion);
      const updated = append ? [...records, ...newRecordsWithVersion] : [...otherVersionsRecords, ...newRecordsWithVersion];
      setRecords(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const handleSchemeDelete = (id: string) => {
    const schemeToDelete = schemes.find(s => s.id === id);
    if (!schemeToDelete) return;

    setConfirmConfig({
      isOpen: true,
      title: "Delete Rating Profile",
      message: `Are you sure you want to delete the profile "${schemeToDelete.name}"? All ${records.length} records within this profile will be permanently removed.`,
      confirmLabel: "DELETE PROFILE",
      cancelLabel: "CANCEL",
      variant: "danger",
      onConfirm: async () => {
        if (!user) return;
        await deleteScheme(user.uid, id);
        if (activeSchemeId === id) {
          const remaining = schemes.filter(s => s.id !== id);
          setActiveSchemeId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    });
  };

  const handleRenameScheme = async (id: string, newName: string) => {
    if (!user) return;
    await renameScheme(id, newName);
  };

  const handleDuplicateScheme = async (id: string) => {
    if (!user) return;
    const schemeToDuplicate = schemes.find(s => s.id === id);
    if (!schemeToDuplicate) return;

    setIsLoading(true);
    try {
      const newSchemeId = await duplicateScheme(user.uid, id, schemeToDuplicate.name);
      setActiveSchemeId(newSchemeId);
    } catch (error) {
      console.error("Error duplicating scheme:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleShare = async () => {
    if (!user || !activeSchemeId) return;
    const currentScheme = schemes.find(s => s.id === activeSchemeId);
    if (!currentScheme) return;

    const newSharedStatus = !currentScheme.isShared;
    await toggleSchemeShare(activeSchemeId, newSharedStatus);
  };

  const handleCopyShareLink = () => {
    if (!activeSchemeId) return;
    const url = `${window.location.origin}${window.location.pathname}?share=${activeSchemeId}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Open form for adding
  const handleAddClick = () => {
    setEditingRecord(null);
    setIsFormOpen(true);
  };

  // Open form for editing
  const handleEditClick = (record: ArmyRatingRecord) => {
    setEditingRecord(record);
    setIsFormOpen(true);
  };

  // Form cancel
  const handleFormCancel = () => {
    setEditingRecord(null);
    setIsFormOpen(false);
  };

  // Filter records based on selected version
  const filteredRecords = records.filter(r => (r.version || "current") === selectedVersion);

  // Compute live statistics for dashboard headers
  const totalCount = filteredRecords.length;
  const groupLeaderCount = filteredRecords.filter(r => r.role === RatingRole.GROUP_LEADER).length;
  const sectionLeaderCount = filteredRecords.filter(r => r.role === RatingRole.SECTION_LEADER).length;
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-amber-500 font-bold text-sm uppercase tracking-widest animate-pulse">
            {activeSchemeId ? "Joining Collaborative Workspace..." : "Loading Workspace..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans text-slate-900 select-none">
      
      {/* Professional Polish Military Header */}
      <header className="bg-[#1e293b] text-white p-4 shadow-lg relative z-40 border-b-2 border-slate-700 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center justify-between w-full lg:w-auto">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-500 rounded-sm flex items-center justify-center font-bold text-slate-900 text-lg shadow-inner">
                ★
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white uppercase mt-0.5">
                  Rating Scheme Tracker
                </h1>
              </div>
            </div>
            
            {/* Show Auth here on smaller screens */}
            <div className="lg:hidden">
              <Auth user={user} isSharedView={isSharedView} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 w-full lg:w-auto">
            {activeSchemeId && (isOwner || currentScheme?.isShared) && (
              <div className="flex items-center gap-1.5 bg-slate-800/30 border border-slate-700/50 rounded px-1.5 py-1">
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-700 text-[9px] font-bold text-slate-300">
                  {currentScheme?.isShared ? <Globe className="w-2.5 h-2.5 text-emerald-400" /> : <Lock className="w-2.5 h-2.5 text-slate-500" />}
                  {currentScheme?.isShared ? "SHARED" : "NOT SHARED"}
                </div>
                {isOwner && (
                  <button
                    onClick={handleToggleShare}
                    className="text-[9px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-tight ml-0.5"
                  >
                    {currentScheme?.isShared ? "Disable" : "Share"}
                  </button>
                )}
                {currentScheme?.isShared && (
                  <button
                    onClick={handleCopyShareLink}
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded text-[9px] font-bold transition-all ml-1"
                    title="Copy Shared Link"
                  >
                    {copySuccess ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Link className="w-2.5 h-2.5" />}
                    {copySuccess ? "COPIED" : "LINK"}
                  </button>
                )}
                {isOwner && currentScheme?.isShared && (
                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-300 cursor-pointer border-l border-slate-700 pl-2 ml-1.5 select-none hover:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={!!currentScheme?.allowEdit}
                      onChange={async (e) => {
                        await toggleSchemeEdit(activeSchemeId, e.target.checked);
                      }}
                      className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer"
                    />
                    <span>ALLOW PUBLIC EDIT</span>
                  </label>
                )}
              </div>
            )}
            
            {user && !user.isAnonymous && (
              <SchemeSelector 
                userId={user.uid}
                schemes={schemes}
                activeSchemeId={activeSchemeId}
                onSelect={setActiveSchemeId}
                onDelete={handleSchemeDelete}
                onRename={handleRenameScheme}
                onDuplicate={handleDuplicateScheme}
              />
            )}
            
            {/* Show Auth here on desktop */}
            <div className="hidden lg:block">
              <Auth user={user} isSharedView={isSharedView} />
            </div>
          </div>

          <div className="flex gap-1.5 sm:gap-2 justify-between sm:justify-center w-full lg:w-auto">
            <div className="flex-1 sm:flex-initial px-2 py-0.5 bg-slate-800/50 border border-slate-700 rounded shadow-sm min-w-[60px] sm:min-w-[80px] text-center">
              <div className="text-[8px] font-semibold text-slate-500 uppercase tracking-tighter flex items-center gap-1 justify-center">
                Soldiers
              </div>
              <div className="text-xs font-bold text-slate-100">{totalCount}</div>
            </div>
            <div className="flex-1 sm:flex-initial px-2 py-0.5 bg-slate-800/50 border border-slate-700 rounded shadow-sm min-w-[60px] sm:min-w-[80px] text-center">
              <div className="text-[8px] font-semibold text-slate-500 uppercase tracking-tighter flex items-center gap-1 justify-center">
                Group Ldr
              </div>
              <div className="text-xs font-bold text-slate-100">{groupLeaderCount}</div>
            </div>
            <div className="flex-1 sm:flex-initial px-2 py-0.5 bg-slate-800/50 border border-slate-700 rounded shadow-sm min-w-[60px] sm:min-w-[80px] text-center">
              <div className="text-[8px] font-semibold text-slate-500 uppercase tracking-tighter flex items-center gap-1 justify-center">
                Section Ldr
              </div>
              <div className="text-xs font-bold text-slate-100">{sectionLeaderCount}</div>
            </div>
          </div>

        </div>
      </header>

      {/* Workspace Indicator for Guest or Shared Users */}
      {(isAnonymous || sharedScheme) && (
        <div className={`${sharedScheme ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-amber-50 border-amber-250 text-slate-900"} border-b py-2 px-4 print:hidden transition-colors`}>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className={`flex items-center gap-2 text-xs ${sharedScheme ? "text-slate-200" : "text-amber-900"} font-medium`}>
              {sharedScheme ? <Globe className="w-4 h-4 text-emerald-400" /> : <HelpCircle className="w-4 h-4 text-amber-600" />}
              {sharedScheme ? (
                <>
                  Collaborative Workspace: <strong className="text-white font-bold">{sharedScheme.name}</strong>. You have{" "}
                  <span className={`px-1.5 py-0.5 text-[10px] rounded font-bold uppercase ${sharedScheme.allowEdit ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"}`}>
                    {sharedScheme.allowEdit ? "Editor Access" : "View-Only Access"}
                  </span>{" "}
                  to this live shared rating scheme.
                </>
              ) : (
                <>Viewing <strong className="font-bold">Blues Rating Scheme</strong> in <strong className="font-bold">Guest Mode</strong>. Data is stored only on this browser. Sign in to save across devices.</>
              )}
            </div>
            {isAnonymous && (
              <button 
                onClick={() => {
                  const btn = (document.getElementById("login-button") || 
                               Array.from(document.querySelectorAll('button')).find(b => 
                                 b.textContent?.toUpperCase().includes("LOG IN") || 
                                 b.textContent?.toUpperCase().includes("SIGN IN")
                               )) as HTMLButtonElement;
                  btn?.click();
                }}
                className={`text-xs font-bold ${sharedScheme ? "text-emerald-400 hover:text-emerald-300" : "text-amber-900 hover:text-amber-950"} underline hover:no-underline`}
              >
                Sign In to Create Your Own
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 sm:px-6 lg:px-8 space-y-4">
        
        {user && !user.isAnonymous && schemes.length === 0 && !sharedScheme ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center space-y-6">
            <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-10 h-10" />
            </div>
            <div className="max-w-md mx-auto">
              <h2 className="text-2xl font-bold text-slate-800">
                Secure Your Rating Schemes
              </h2>
              <p className="text-slate-500 mt-2">
                You are now signed in. Create your first profile to start syncing your rating schemes across all your devices.
              </p>
            </div>
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto pt-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <Monitor className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <div className="text-xs font-bold uppercase tracking-wider">Desktop Sync</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <Smartphone className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <div className="text-xs font-bold uppercase tracking-wider">Mobile Access</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <Cloud className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <div className="text-xs font-bold uppercase tracking-wider">Cloud Backup</div>
                </div>
              </div>
              <button
                onClick={() => {
                  const selector = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Select Profile")) as HTMLButtonElement;
                  selector?.click();
                  setTimeout(() => {
                    const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("CREATE NEW PROFILE")) as HTMLButtonElement;
                    createBtn?.click();
                  }, 100);
                }}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-95"
              >
                CREATE YOUR FIRST PROFILE
              </button>
            </>
          </div>
        ) : (
          <>
            {/* Navigation Tabs Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
              <div className="inline-flex rounded-md bg-slate-200/80 border border-slate-300 p-1 font-medium shadow-sm">
                <button
                  onClick={() => setActiveTab("table")}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-sm transition-all ${
                    activeTab === "table"
                      ? "bg-white text-slate-900 font-bold shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  id="tab-table"
                >
                  <List className="w-4 h-4 text-amber-600" />
                  Rating Tracker List
                </button>
                <button
                  onClick={() => setActiveTab("chart")}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-sm transition-all ${
                    activeTab === "chart"
                      ? "bg-white text-slate-900 font-bold shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  id="tab-chart"
                >
                  <Network className="w-4 h-4 text-blue-500" />
                  Visual Org Chart Bubble Map
                </button>
              </div>

              <div className="flex items-center gap-3">
                {/* Profile actions moved to dropdown */}
              </div>
            </div>

            {/* Version Selection & Control Bar */}
            <div className={`bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden transition-all ${
              activeTab === "chart" ? "sticky top-0 z-30 shadow-md" : ""
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center flex-wrap gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>Roster Version:</span>
                  <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black tracking-wide px-2 py-0.5 rounded uppercase">
                    {currentScheme?.name || "Blues Rating Scheme"}
                  </span>
                </span>
                
                <div className="inline-flex rounded-md bg-slate-100 p-1 font-medium border border-slate-200">
                  <button
                    onClick={() => setSelectedVersion("current")}
                    className={`px-3 py-1 text-xs rounded transition-all ${
                      selectedVersion === "current"
                        ? "bg-[#1e293b] text-white font-bold shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setSelectedVersion("future")}
                    className={`px-3 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                      selectedVersion === "future"
                        ? "bg-amber-600 text-white font-bold shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Future
                    {records.filter(r => r.version === "future").length > 0 && (
                      <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedVersion("alternate")}
                    className={`px-3 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                      selectedVersion === "alternate"
                        ? "bg-blue-600 text-white font-bold shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Alternate
                    {records.filter(r => r.version === "alternate").length > 0 && (
                      <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    )}
                  </button>
                </div>
              </div>

              {selectedVersion !== "current" && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setConfirmConfig({
                        isOpen: true,
                        title: `Copy Current into ${selectedVersion.toUpperCase()}`,
                        message: `This will overwrite all existing records in the ${selectedVersion.toUpperCase()} version with a complete copy of the CURRENT version. Are you sure?`,
                        confirmLabel: "COPY AND OVERWRITE",
                        cancelLabel: "CANCEL",
                        variant: "warning",
                        onConfirm: () => handleCopyVersion("current", selectedVersion)
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded border border-slate-300 transition-all uppercase tracking-tight"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Copy Current Version Data
                  </button>

                  {filteredRecords.length > 0 && (
                    <button
                      onClick={() => {
                        setConfirmConfig({
                          isOpen: true,
                          title: "Set as Current Version",
                          message: `This will permanently overwrite the CURRENT version with all data and structure from the ${selectedVersion.toUpperCase()} version. Are you sure you want to promote this version to Current?`,
                          confirmLabel: "SET AS CURRENT",
                          cancelLabel: "CANCEL",
                          variant: "question",
                          onConfirm: async () => {
                            await handleCopyVersion(selectedVersion, "current");
                            setSelectedVersion("current");
                          }
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow-sm hover:shadow transition-all uppercase tracking-tight"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Set as Current Version
                    </button>
                  )}
                </div>
              )}
            </div>

            {selectedVersion !== "current" && filteredRecords.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in print:hidden">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 animate-bounce" />
                  <span>
                    The <strong className="uppercase font-bold">{selectedVersion}</strong> draft version is currently empty. Copy the Current version's active roster to populate it instantly and start modeling modifications!
                  </span>
                </div>
                <button
                  onClick={() => handleCopyVersion("current", selectedVersion)}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded text-xs uppercase tracking-tight shadow-sm transition-all whitespace-nowrap self-start sm:self-center"
                >
                  Copy Current Version Now
                </button>
              </div>
            )}

            {/* View Areas */}
            <div className="relative">
              
              {/* Form Modal overlay */}
              {isFormOpen && (
                <div className="fixed inset-0 bg-slate-900/65 flex justify-center items-center p-4 z-50 overflow-y-auto animate-fade-in print:hidden">
                  <div className="w-full max-w-3xl">
                    <RatingForm
                      records={filteredRecords}
                      onSave={handleSaveRecord}
                      onCancel={handleFormCancel}
                      editingRecord={editingRecord}
                    />
                  </div>
                </div>
              )}

              {/* Render Active Tab */}
              {activeTab === "table" ? (
                <RatingTable
                  records={filteredRecords}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteRecord}
                  onAddClick={handleAddClick}
                  onImportCSV={handleImportCSV}
                  onUpdateRecord={handleSaveRecord}
                  readOnly={!canEdit}
                  selectedVersion={selectedVersion}
                  onChangeVersion={setSelectedVersion}
                  activeSchemeName={currentScheme?.name || "Blues Rating Scheme"}
                />
              ) : (
                <OrgChartPreview
                  records={filteredRecords}
                  onEditClick={handleEditClick}
                  readOnly={!canEdit}
                  activeSchemeName={currentScheme?.name || "Blues Rating Scheme"}
                />
              )}

            </div>
          </>
        )}

      </main>

      {/* Professional Footer */}
      <footer className="bg-slate-200 border-t border-slate-300 px-6 py-2.5 text-[10px] text-slate-600 flex justify-center items-center mt-8 print:hidden">
        <span className="font-bold text-slate-900 uppercase tracking-wider">CREATED BY CHAD LEADER</span>
      </footer>

      {confirmConfig && (
        <ConfirmDialog
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          onConfirm={() => {
            confirmConfig.onConfirm();
            closeConfirm();
          }}
          onCancel={closeConfirm}
          variant={confirmConfig.variant}
        />
      )}

    </div>
  );
}
