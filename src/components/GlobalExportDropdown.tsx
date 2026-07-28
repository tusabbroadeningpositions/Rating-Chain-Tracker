/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Globe, ChevronDown, FileSpreadsheet, Presentation, Loader2, Layers, CheckCircle2 } from "lucide-react";
import { RatingScheme, ArmyRatingRecord } from "../types";
import { getRecordsForScheme } from "../lib/firebaseService";
import {
  exportAllProfilesNcoerPPTX,
  exportAllProfilesExcel,
  exportAllProfilesBubbleMapPPTX
} from "../utils/globalExport";

interface GlobalExportDropdownProps {
  schemes: RatingScheme[];
  activeSchemeId: string | null;
  currentRecords: ArmyRatingRecord[];
  user: any;
}

export default function GlobalExportDropdown({
  schemes,
  activeSchemeId,
  currentRecords,
  user
}: GlobalExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
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

  const handleExportOption = async (optionType: number) => {
    try {
      setLoading(true);
      setLoadingText("Fetching records across profiles...");

      let profilesData: { scheme: RatingScheme; records: ArmyRatingRecord[] }[] = [];

      if (schemes && schemes.length > 0) {
        profilesData = await Promise.all(
          schemes.map(async (scheme) => {
            let recs: ArmyRatingRecord[] = [];
            if (scheme.id === activeSchemeId && currentRecords.length > 0) {
              recs = currentRecords;
            } else {
              recs = await getRecordsForScheme(scheme.id);
            }
            return { scheme, records: recs };
          })
        );
      } else {
        // Fallback for guest mode or single scheme
        const fallbackScheme: RatingScheme = {
          id: activeSchemeId || "guest",
          name: "Current Profile",
          userId: user?.uid || "",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        profilesData = [{ scheme: fallbackScheme, records: currentRecords }];
      }

      setLoadingText("Generating file...");

      switch (optionType) {
        case 1:
          exportAllProfilesNcoerPPTX(profilesData);
          break;
        case 2:
          exportAllProfilesExcel(profilesData, "current");
          break;
        case 3:
          exportAllProfilesExcel(profilesData, "projected");
          break;
        case 4:
          exportAllProfilesBubbleMapPPTX(profilesData, "current");
          break;
        case 5:
          exportAllProfilesBubbleMapPPTX(profilesData, "projected");
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("Global Export failed:", err);
    } finally {
      setLoading(false);
      setLoadingText("");
      setIsOpen(false);
    }
  };

  return (
    <div className="relative group" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-100 px-3 py-2 rounded font-bold text-sm transition-all shadow-sm disabled:opacity-60"
        title="Global Export across all rating scheme profiles"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        ) : (
          <Globe className="w-4 h-4 text-emerald-400" />
        )}
        <span className="hidden sm:inline font-bold">Global Export</span>
        <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 md:w-96 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-30 overflow-hidden text-slate-100 divide-y divide-slate-800">
          <div className="px-4 py-2.5 bg-slate-950/60 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Global Profiles Export
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              {schemes.length > 0 ? `${schemes.length} Profiles` : "Current Roster"}
            </span>
          </div>

          {loading ? (
            <div className="p-6 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              <span className="text-xs font-medium">{loadingText}</span>
            </div>
          ) : (
            <div className="p-1 space-y-1">
              {/* Option 1: NCOER Report to PPTX */}
              <button
                onClick={() => handleExportOption(1)}
                className="w-full text-left p-2.5 rounded-md hover:bg-slate-800 transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded group-hover:bg-amber-500/20 transition-colors shrink-0">
                  <Presentation className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-amber-300 transition-colors">
                      NCOER Status Report (All Profiles)
                    </span>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      PPTX
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Combines all NCOER statuses across all profiles into one PowerPoint report
                  </p>
                </div>
              </button>

              {/* Option 2: Excel Current Roster */}
              <button
                onClick={() => handleExportOption(2)}
                className="w-full text-left p-2.5 rounded-md hover:bg-slate-800 transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded group-hover:bg-emerald-500/20 transition-colors shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-emerald-300 transition-colors">
                      Combined Excel — Current Roster
                    </span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      EXCEL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Export Excel spreadsheet combining current rosters from all profiles
                  </p>
                </div>
              </button>

              {/* Option 3: Excel Projected Roster */}
              <button
                onClick={() => handleExportOption(3)}
                className="w-full text-left p-2.5 rounded-md hover:bg-slate-800 transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded group-hover:bg-cyan-500/20 transition-colors shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                      Combined Excel — Projected Roster
                    </span>
                    <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      EXCEL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Export Excel spreadsheet combining projected rosters from all profiles
                  </p>
                </div>
              </button>

              {/* Option 4: PPTX Bubble Map Current Roster */}
              <button
                onClick={() => handleExportOption(4)}
                className="w-full text-left p-2.5 rounded-md hover:bg-slate-800 transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded group-hover:bg-blue-500/20 transition-colors shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-blue-300 transition-colors">
                      Bubble Map PPTX — Current Roster
                    </span>
                    <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      PPTX
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    PowerPoint org chart bubble map of current rosters (1 profile per slide)
                  </p>
                </div>
              </button>

              {/* Option 5: PPTX Bubble Map Projected Roster */}
              <button
                onClick={() => handleExportOption(5)}
                className="w-full text-left p-2.5 rounded-md hover:bg-slate-800 transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded group-hover:bg-purple-500/20 transition-colors shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-purple-300 transition-colors">
                      Bubble Map PPTX — Projected Roster
                    </span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      PPTX
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    PowerPoint org chart bubble map of projected rosters (1 profile per slide)
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
