/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from "react";
import { jsPDF } from "jspdf";
// @ts-ignore
import XLSX from "xlsx-js-style";
import { ArmyRatingRecord, RatingRole, formatNameToLastFirstRank, Note } from "../types";
import { parseCSV, generateTemplateCSV, formatDateToMDYYYY, formatDateToYYYYMMDD } from "../utils/csvHandler";
import { add90Days } from "../utils/dateUtils";
import { getRoleColors } from "../utils/orgChartLayout";
import { Search, FileDown, Upload, Trash2, Edit2, Plus, RefreshCw, HelpCircle, FileSpreadsheet, X, CalendarPlus, Layers, AlertTriangle, ChevronRight, ChevronDown, History as HistoryIcon, Info, AlertCircle, RotateCcw, CheckCircle2, FileText, Sparkles } from "lucide-react";
import { subscribeToRecordHistory, restoreRecordHistory, deleteHistoryRecord, subscribeToNotes, addNote, deleteNote } from "../lib/firebaseService";
import ConfirmDialog from "./ConfirmDialog";
import { exportNcoerReportToPPTX } from "../utils/pptxExport";

interface RatingTableProps {
  records: ArmyRatingRecord[];
  allRecords?: ArmyRatingRecord[];
  onEdit: (record: ArmyRatingRecord) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
  onImportCSV: (newRecords: ArmyRatingRecord[], append: boolean) => void;
  onUpdateRecord: (record: ArmyRatingRecord) => void;
  readOnly?: boolean;
  selectedVersion?: string;
  onChangeVersion?: (version: string) => void;
  activeSchemeName?: string;
  proposedEffectiveDate?: string;
  onPromoteVersion?: (fromVersion: "future" | "alternate") => void;
  onUpdateProposedEffectiveDate?: (dateVal: string) => void;
  effectiveAsOf?: string;
  onUpdateEffectiveAsOf?: (dateVal: string) => void;
  canEditCurrentRoster?: boolean;
  activeSchemeId?: string | null;
  user?: any;
}

const getSubmissionBadgeStyles = (subType: string) => {
  const type = (subType || "ANN").trim().toUpperCase();
  switch (type) {
    case "ANN":
      return "bg-blue-50 border-blue-200 text-blue-700";
    case "COR":
      return "bg-amber-50 border-amber-200 text-amber-700";
    case "CTR":
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "EXANN":
      return "bg-purple-50 border-purple-200 text-purple-700";
    case "SR OP":
      return "bg-teal-50 border-teal-200 text-teal-700";
    default:
      return "bg-slate-50 border-slate-200 text-slate-700";
  }
};

export default function RatingTable({
  records,
  allRecords,
  onEdit,
  onDelete,
  onAddClick,
  onImportCSV,
  onUpdateRecord,
  readOnly = false,
  selectedVersion = "current",
  onChangeVersion,
  activeSchemeName = "Sample Rating Scheme",
  proposedEffectiveDate = "",
  onPromoteVersion,
  onUpdateProposedEffectiveDate,
  effectiveAsOf = "",
  onUpdateEffectiveAsOf,
  canEditCurrentRoster = true,
  activeSchemeId = null,
  user = null,
}: RatingTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedRater, setSelectedRater] = useState("");
  const [selectedSeniorRater, setSelectedSeniorRater] = useState("");
  const [sortAlphabetically, setSortAlphabetically] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  const [importPending, setImportPending] = useState<ArmyRatingRecord[] | null>(null);
  
  const [activeCustomStatusRecordId, setActiveCustomStatusRecordId] = useState<string | null>(null);
  const [customStatusText, setCustomStatusText] = useState("");
  const [editingDateRecordId, setEditingDateRecordId] = useState<string | null>(null);
  const [tempDateValue, setTempDateValue] = useState("");
  const [showGreenLine, setShowGreenLine] = useState(false);
  const [expandedHistoryRecordId, setExpandedHistoryRecordId] = useState<string | null>(null);
  const [recordHistory, setRecordHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Notes state
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [activeNoteSoldierName, setActiveNoteSoldierName] = useState<string | null>(null);
  const [noteInputText, setNoteInputText] = useState("");
  const [lateShiftPromptRecord, setLateShiftPromptRecord] = useState<ArmyRatingRecord | null>(null);
  const [manualLateRecord, setManualLateRecord] = useState<ArmyRatingRecord | null>(null);
  const [selectedCorRecord, setSelectedCorRecord] = useState<ArmyRatingRecord | null>(null);
  const [manualLateThru, setManualLateThru] = useState("");
  const [manualLateRaterId, setManualLateRaterId] = useState("");
  const [manualLateSeniorRaterId, setManualLateSeniorRaterId] = useState("");
  const [lateEditingRecordId, setLateEditingRecordId] = useState<string | null>(null);
  const [clearingLateRecord, setClearingLateRecord] = useState<ArmyRatingRecord | null>(null);
  const [overwriteLateDecision, setOverwriteLateDecision] = useState<{ current: ArmyRatingRecord; projected: ArmyRatingRecord } | null>(null);
  const [overwriteDecisionView, setOverwriteDecisionView] = useState<"choice" | "late-mode">("choice");
  const [isShowingReportPreview, setIsShowingReportPreview] = useState(false);
  
  // Duplicate handling states
  const [redirectDuplicates, setRedirectDuplicates] = useState(true);
  const [projectedCopyDuplicateTarget, setProjectedCopyDuplicateTarget] = useState<ArmyRatingRecord | null>(null);
  const [projectedCopySourceRecord, setProjectedCopySourceRecord] = useState<ArmyRatingRecord | null>(null);
  
  // Batch Promotion State
  const [batchPromoteIncomplete, setBatchPromoteIncomplete] = useState<ArmyRatingRecord[]>([]);
  const [isShowingBatchPromoteSummary, setIsShowingBatchPromoteSummary] = useState(false);
  const [batchPromoteVersion, setBatchPromoteVersion] = useState<"future" | "alternate" | null>(null);
  const [batchLateSetupIndex, setBatchLateSetupIndex] = useState(-1); // Index in batchPromoteIncomplete
  const [historyConfirm, setHistoryConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: "danger" | "warning" | "info" | "question";
  } | null>(null);

  // Internal component for the Report Preview Modal to handle local state (filtering)
  const ReportPreviewModal = () => {
    const [reportSearch, setReportSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const reportRef = useRef<HTMLDivElement>(null);

    const baseReportItems = useMemo(() => getReportItems(), []);
    
    const reportItems = useMemo(() => {
      let filtered = baseReportItems;

      // Apply Category Filter
      if (filterCategory !== "all") {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        filtered = filtered.filter(item => {
          const r = item.record;
          const currentRec = findCurrentRecord(r);
          const status = currentRec.ncoerStatus || "Not Submitted to HR";
          
          const thruDate = new Date(item.thru);
          thruDate.setHours(0, 0, 0, 0);
          const diffTime = now.getTime() - thruDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          const hqdaDueStr = item.isLate ? (currentRec.priorDueHqda || add90Days(item.thru)) : (r.dueHqda || add90Days(item.thru));
          const hqdaDate = new Date(hqdaDueStr);
          hqdaDate.setHours(0, 0, 0, 0);
          const isPastHqda = now > hqdaDate;

          switch (filterCategory) {
            case "30plus_not_submitted":
              return diffDays >= 30 && status === "Not Submitted to HR";
            case "reviewing":
              return status.includes("Reviewing") || status.includes("BN") || status.includes("BDE");
            case "signatures_edits":
              return status === "Out for Signatures" || status === "Returned for Edits";
            case "0_29_past":
              return diffDays >= 0 && diffDays < 30 && status === "Not Submitted to HR";
            case "late_hqda":
              return isPastHqda && status !== "Submitted to HQDA";
            default:
              return true;
          }
        });
      }

      // Apply Search Filter
      if (reportSearch) {
        const term = reportSearch.toLowerCase();
        filtered = filtered.filter(item => {
          const r = item.record;
          const currentRec = findCurrentRecord(r);
          const status = currentRec.ncoerStatus || "Not Submitted to HR";
          return (
            r.name.toLowerCase().includes(term) ||
            r.rank.toLowerCase().includes(term) ||
            r.role.toLowerCase().includes(term) ||
            status.toLowerCase().includes(term) ||
            (r.keyLeaderTitle && r.keyLeaderTitle.toLowerCase().includes(term))
          );
        });
      }

      return filtered;
    }, [baseReportItems, reportSearch, filterCategory]);

    let totalPastDue = 0;
    let totalComingDue = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const rankCounts: Record<string, number> = {};

    reportItems.forEach(item => {
      if (item.thru) {
        const thruDate = new Date(item.thru);
        const diffTime = thruDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) totalPastDue++;
        else totalComingDue++;
      }
      const r = item.record.rank || "Unknown";
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    });

    return (
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 flex flex-col">
          {/* Header */}
          <div className="relative">
            <div className="bg-[#1E293B] p-6 pr-16">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold uppercase tracking-tight text-lg text-white leading-none">
                    NCOER STATUS MONITORING REPORT - {(activeSchemeName || "ACTIVE RATING SCHEME").toUpperCase()}
                  </h3>
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mt-2">
                    AS OF: {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 mr-12">
                   {/* Category Filter */}
                   <select
                     value={filterCategory}
                     onChange={(e) => setFilterCategory(e.target.value)}
                     className="bg-white/10 border border-white/20 rounded-xl py-2 px-3 text-[10px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none cursor-pointer hover:bg-white/20 transition-all"
                   >
                     <option value="all" className="bg-slate-800">ALL RECORDS</option>
                     <option value="30plus_not_submitted" className="bg-slate-800">30+ DAYS PAST THRU (NOT SUBMITTED)</option>
                     <option value="reviewing" className="bg-slate-800">REVIEWING - HR OR CSM</option>
                     <option value="signatures_edits" className="bg-slate-800">OUT FOR SIGNATURES / EDITS</option>
                     <option value="0_29_past" className="bg-slate-800">0 TO 29 DAYS PAST THRU (NOT SUBMITTED)</option>
                     <option value="late_hqda" className="bg-slate-800">LATE TO HQDA</option>
                   </select>

                   <div className="relative group">
                     <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-amber-400 transition-colors" />
                     <input 
                       type="text"
                       placeholder="SEARCH NAMES..."
                       value={reportSearch}
                       onChange={(e) => setReportSearch(e.target.value)}
                       className="bg-white/10 border border-white/20 rounded-xl py-2 pl-10 pr-4 text-[10px] font-bold text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 w-48 transition-all"
                     />
                     {reportSearch && (
                       <button onClick={() => setReportSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                         <X className="w-3 h-3" />
                       </button>
                     )}
                   </div>
                </div>
              </div>
            </div>
            <div className="h-1 bg-amber-500 w-full" />
            <button 
              onClick={() => setIsShowingReportPreview(false)}
              className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white" ref={reportRef}>
            {reportItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Info className="w-10 h-10 text-slate-300" />
                </div>
                <h4 className="font-black uppercase tracking-tight text-slate-400">
                  {reportSearch ? "No results matching your filter" : "No NCOERs meet report criteria"}
                </h4>
                <p className="text-xs text-slate-400 mt-2 max-w-xs">
                  {reportSearch ? "Try adjusting your search term or clear the filter." : "All NCOER schedules are currently up-to-date."}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Stats Summary Cards (Matching PDF) */}
                <div className="grid grid-cols-1 md:grid-cols-3 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Report Focus</p>
                    <p className="text-sm font-bold text-slate-800">NCOERs Due within 30 Days / Overdue</p>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Critical Overdue</p>
                    <p className="text-lg font-black text-rose-600 leading-tight">{totalPastDue} Soldiers Overdue</p>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Upcoming Action (30 Days)</p>
                    <p className="text-lg font-black text-amber-600 leading-tight">{totalComingDue} Soldiers Upcoming</p>
                  </div>
                </div>

                {/* Table View */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-700 text-[10px] font-black uppercase tracking-widest text-white items-center">
                    <div className="col-span-2">Soldier (Rank / Name)</div>
                    <div className="col-span-1">Element</div>
                    <div className="col-span-2">Duty Title & MOSC</div>
                    <div className="col-span-2 text-center">Thru Date (Days)</div>
                    <div className="col-span-2">Rater / Senior Rater</div>
                    <div className="col-span-2 text-center">NCOER Status</div>
                    <div className="col-span-1 text-right">HQDA Due</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {reportItems.map((item, idx) => {
                      const thruDate = new Date(item.thru);
                      thruDate.setHours(0, 0, 0, 0);
                      const diffTime = thruDate.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      
                      let daysText = `${diffDays}d Remaining`;
                      let daysColor = "text-amber-600";
                      
                      if (diffDays < 0) {
                        daysText = `${Math.abs(diffDays)}d OVERDUE`;
                        daysColor = "text-rose-600";
                      } else if (diffDays === 0) {
                        daysText = "DUE TODAY";
                        daysColor = "text-amber-600";
                      }

                      const helperGetName = (id: string) => {
                        if (!id || id === "-") return "—";
                        const rec = allRecords?.find(x => x.id === id);
                        return rec ? formatNameToLastFirstRank(rec.name, rec.rank) : formatNameToLastFirstRank(id);
                      };

                      const currentRec = allRecords?.find(x => x.id === item.record.id) || item.record;
                      const isActuallyLate = item.isLate || currentRec.ncoerStatus === "Late" || !!currentRec.priorThru;
                      const raterToUse = isActuallyLate && currentRec.lateRaterId ? currentRec.lateRaterId : item.record.raterId;
                      const srToUse = isActuallyLate && currentRec.lateSeniorRaterId ? currentRec.lateSeniorRaterId : item.record.seniorRaterId;

                      const { status: badgeStatus, badgeClass } = getEffectiveNcoerStatusAndColor(item.record);
                      const hqdaDueStr = item.isLate ? (currentRec.priorDueHqda || add90Days(item.thru)) : (item.record.dueHqda || add90Days(item.thru));

                      return (
                        <div key={idx} className={`grid grid-cols-12 gap-4 px-4 py-4 items-center text-[11px] ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}>
                          <div className="col-span-2 flex items-center gap-3">
                            <div className="w-8 h-8 bg-white border border-slate-200 rounded flex items-center justify-center font-bold text-slate-600 shadow-sm shrink-0">
                              {item.record.rank}
                            </div>
                            <div className="min-w-0">
                              <p className="font-black text-slate-800 uppercase leading-none truncate">{item.record.name}</p>
                            </div>
                          </div>
                          <div className="col-span-1">
                            <span className="font-semibold text-slate-500 uppercase">{item.record.element || "—"}</span>
                          </div>
                          <div className="col-span-2">
                            <p className="font-bold text-slate-600 leading-tight text-[10px]">
                              {item.record.role}
                              {item.record.keyLeaderTitle && <span className="block text-[8px] text-slate-400 normal-case font-medium">({item.record.keyLeaderTitle})</span>}
                            </p>
                            <p className="text-[8px] font-mono text-slate-400 mt-0.5 tracking-tighter">[MOSC: {item.record.dutyMosc || "—"}]</p>
                          </div>
                          <div className="col-span-2 text-center">
                            <p className="font-mono font-bold text-slate-700">{item.thru}</p>
                            <p className={`text-[9px] font-black uppercase mt-0.5 ${daysColor}`}>
                              ({daysText})
                            </p>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-1 h-1 bg-blue-500 rounded-full shrink-0" />
                              <span className="font-bold text-slate-600 truncate text-[10px]">{helperGetName(raterToUse)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-1 h-1 bg-emerald-500 rounded-full shrink-0" />
                              <span className="font-bold text-slate-600 truncate text-[10px]">{helperGetName(srToUse)}</span>
                            </div>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border tracking-tighter shadow-sm whitespace-nowrap ${badgeClass}`}>
                              {badgeStatus || "Not Submitted"}
                            </span>
                          </div>
                          <div className="col-span-1 text-right">
                            <p className="font-mono font-bold text-slate-700">{hqdaDueStr}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>Report dynamically filtered by {reportItems.length} active records.</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsShowingReportPreview(false)}
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-black text-[10px] rounded-xl transition-all uppercase tracking-widest cursor-pointer"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  exportNcoerReportToPPTX(allRecords || [], records, activeSchemeName);
                  setIsShowingReportPreview(false);
                }}
                className="px-6 py-2.5 bg-amber-600 text-white hover:bg-amber-700 font-black text-[10px] rounded-xl transition-all uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-amber-200 cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                Download PowerPoint (PPTX)
              </button>
              <button
                onClick={() => {
                  handleExportNcoerReport(reportItems);
                  setIsShowingReportPreview(false);
                }}
                className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-black text-[10px] rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-blue-200 flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Download PDF Report
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const handleWindowScroll = () => {
      const active = window.scrollX > 2;
      if (active !== showGreenLine) {
        setShowGreenLine(active);
      }
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [showGreenLine]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const findCurrentRecord = (r: ArmyRatingRecord) => {
    if (!r) return r;
    if ((r.version || "current") === "current") return r;
    const searchSource = allRecords || records || [];
    return searchSource.find(cr => 
      (cr.version || "current") === "current" && 
      cr.name.trim().toLowerCase() === r.name.trim().toLowerCase()
    ) || r;
  };

  const hasAnyFilter = !!(searchTerm || selectedRole || selectedRater || selectedSeniorRater);

  const handleClearAllFilters = () => {
    setSearchTerm("");
    setSelectedRole("");
    setSelectedRater("");
    setSelectedSeniorRater("");
  };

  const getRaterName = (raterId: string) => {
    if (!raterId || raterId === "-") return "-";
    const searchSource = allRecords || records;
    const r = searchSource.find(rec => rec.id === raterId);
    if (r) {
      if (r.rank) {
        return `${r.name} (${r.rank})`;
      }
      return r.name;
    }
    // If not found by ID, it might be a raw name string from import or manual entry
    return formatNameToLastFirstRank(raterId);
  };

  const getRaterNameOnly = (raterId: string) => {
    if (!raterId || raterId === "-") return "-";
    const searchSource = allRecords || records;
    const found = searchSource.find(rec => rec.id === raterId);
    if (found) return found.name.trim().toLowerCase();
    return raterId.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  };

  const getReviewerNameOnly = (reviewerId: string) => {
    if (!reviewerId || reviewerId === "-") return "N/A";
    const searchSource = allRecords || records;
    const found = searchSource.find(rec => rec.id === reviewerId);
    if (found) return found.name.trim().toLowerCase();
    return reviewerId.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  };

  const performOverwrite = (current: ArmyRatingRecord, projected: ArmyRatingRecord, extraUpdates: Partial<ArmyRatingRecord> = {}) => {
    // 1. Prepare the updated current record
    const updated: ArmyRatingRecord = {
      ...current,
      ...extraUpdates,
      element: projected.element,
      dutyMosc: projected.dutyMosc,
      rank: projected.rank,
      name: projected.name,
      from: projected.from,
      thru: projected.thru,
      dueHqda: projected.dueHqda,
      submissionType: projected.submissionType,
      role: projected.role,
      keyLeaderTitle: projected.keyLeaderTitle,
      raterEffectiveDate: projected.raterEffectiveDate,
      seniorRaterEffectiveDate: projected.seniorRaterEffectiveDate,
      reviewerEffectiveDate: projected.reviewerEffectiveDate,
    };

    const searchSource = allRecords || records || [];

    // Helper to map projected ID to current ID
    const mapToCurrentId = (projectedId: string) => {
      if (!projectedId || projectedId === "-") return projectedId;
      const projRater = searchSource.find(x => x.id === projectedId);
      if (!projRater) return projectedId;
      const currentRater = searchSource.find(x => 
        (x.version === "current" || !x.version) && 
        x.name === projRater.name && 
        x.rank === projRater.rank
      );
      return currentRater ? currentRater.id : projectedId;
    };

    updated.raterId = mapToCurrentId(projected.raterId);
    updated.seniorRaterId = mapToCurrentId(projected.seniorRaterId);
    updated.reviewerId = mapToCurrentId(projected.reviewerId);

    onUpdateRecord(updated);
  };

  const handleOverwriteCurrent = (current: ArmyRatingRecord, projected: ArmyRatingRecord) => {
    // Check if status is incomplete
    const incompleteStatuses = ["", "Not Submitted to HR", "Submitted to HR", "Reviewing - HR", "Reviewing - CSM", "Returned for Edits", "Out for Signatures", "Late", "custom"];
    const currentStatus = current.ncoerStatus || "";
    const isIncomplete = incompleteStatuses.includes(currentStatus) && currentStatus !== "Submitted to HQDA";

    if (isIncomplete) {
      setOverwriteLateDecision({ current, projected });
      setOverwriteDecisionView("choice");
      // Pre-fill manual late states just in case they choose late mode
      setManualLateRaterId(current.raterId || "");
      setManualLateSeniorRaterId(current.seniorRaterId || "");
      try {
        const d = new Date(current.thru + "T12:00:00");
        setManualLateThru(d.toISOString().split('T')[0]);
      } catch (e) {
        setManualLateThru("");
      }
      return;
    }

    setHistoryConfirm({
      isOpen: true,
      title: "Confirm Overwrite",
      message: `Overwrite the CURRENT version of ${current.name} with all data from the PROJECTED version? This will update the rating chain, dates, and roles.`,
      confirmLabel: "OVERWRITE CURRENT",
      cancelLabel: "CANCEL",
      variant: "warning",
      onConfirm: () => {
        performOverwrite(current, projected);
        setHistoryConfirm(null);
      }
    });
  };

  const handlePromoteVersionClick = () => {
    if (!selectedVersion || selectedVersion === "current") return;

    // Find all incomplete and past-due NCOERs in current roster
    const currentRoster = allRecords?.filter(r => (r.version || "current") === "current") || [];
    const incompleteStatuses = ["", "Not Submitted to HR", "Submitted to HR", "Reviewing - HR", "Reviewing - CSM", "Returned for Edits", "Out for Signatures", "Late", "custom"];
    
    const incomplete = currentRoster.filter(r => {
      const status = r.ncoerStatus || "";
      const isIncomplete = incompleteStatuses.includes(status) && status !== "Submitted to HQDA";
      
      const thruDateClass = getThruDateClass(r.thru);
      const isPastDue = thruDateClass.includes("rose-100");
      
      return isIncomplete && isPastDue;
    });

    if (incomplete.length > 0) {
      setBatchPromoteIncomplete(incomplete);
      setBatchPromoteVersion(selectedVersion as "future" | "alternate");
      setIsShowingBatchPromoteSummary(true);
    } else {
      // Normal confirmation
      setHistoryConfirm({
        isOpen: true,
        title: "Set as Current Version",
        message: `This will permanently overwrite the CURRENT version with all data and structure from the ${selectedVersion.toUpperCase()} version. Are you sure you want to promote this version to Current?`,
        confirmLabel: "SET AS CURRENT",
        cancelLabel: "CANCEL",
        variant: "question",
        onConfirm: () => {
          onPromoteVersion?.(selectedVersion as "future" | "alternate");
          setHistoryConfirm(null);
        }
      });
    }
  };

  // Get unique Raters
  const uniqueRaters = useMemo(() => {
    const ratersSet = new Set<string>();
    records.forEach(r => {
      if (r.raterId) {
        const name = getRaterName(r.raterId);
        if (name && name !== "-") {
          ratersSet.add(name);
        }
      }
    });
    return Array.from(ratersSet).sort();
  }, [records]);

  // Soldier options for dropdowns - Includes all soldiers and anyone referenced in rating chains, de-duplicated by name
  const soldierOptions = useMemo(() => {
    const source = allRecords || records;
    
    // 1. Gather all potential candidates
    const allCandidates: { id: string; name: string; rank: string; isCurrent: boolean }[] = [];
    
    source.forEach(r => {
      const isCurrent = r.version === "current" || !r.version;
      allCandidates.push({
        id: r.id,
        name: r.name,
        rank: r.rank || "",
        isCurrent
      });
    });
    
    source.forEach(r => {
      [r.raterId, r.seniorRaterId].forEach(id => {
        if (id && id !== "-" && !allCandidates.some(c => c.id === id)) {
          const found = source.find(x => x.id === id);
          if (found) {
            allCandidates.push({
              id: found.id,
              name: found.name,
              rank: found.rank || "",
              isCurrent: found.version === "current" || !found.version
            });
          } else {
            allCandidates.push({
              id,
              name: id,
              rank: "",
              isCurrent: false
            });
          }
        }
      });
    });
    
    // 2. Filter candidates to be unique by normalized name, preferring current records
    const uniqueMap = new Map<string, { id: string; label: string; sortKey: string; isCurrent: boolean }>();
    
    allCandidates.forEach(cand => {
      const normalizedName = cand.name.trim().toLowerCase();
      if (!normalizedName) return;
      
      const formatted = formatNameToLastFirstRank(cand.name, cand.rank);
      const namePart = formatted.split(" (")[0];
      const sortKey = namePart;
      
      const existing = uniqueMap.get(normalizedName);
      if (!existing || (!existing.isCurrent && cand.isCurrent)) {
        uniqueMap.set(normalizedName, {
          id: cand.id,
          label: formatted,
          sortKey,
          isCurrent: cand.isCurrent
        });
      }
    });
    
    return Array.from(uniqueMap.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [records, allRecords]);

  // Get unique Senior Raters
  const uniqueSeniorRaters = useMemo(() => {
    const seniorRatersSet = new Set<string>();
    records.forEach(r => {
      if (r.seniorRaterId) {
        const name = getRaterName(r.seniorRaterId);
        if (name && name !== "-") {
          seniorRatersSet.add(name);
        }
      }
    });
    return Array.from(seniorRatersSet).sort();
  }, [records]);

  const getSeniorRaterMismatchInfo = (r: ArmyRatingRecord) => {
    if (!r.raterId) return null;
    
    const raterRecord = records.find(rec => rec.id === r.raterId);
    if (!raterRecord) return null;
    
    const expectedSeniorRaterId = raterRecord.raterId;
    if (!expectedSeniorRaterId || expectedSeniorRaterId === "-") return null;
    
    // Check if they match
    if (r.seniorRaterId === expectedSeniorRaterId) return null;
    
    const actualName = getRaterName(r.seniorRaterId);
    const expectedName = getRaterName(expectedSeniorRaterId);
    
    if (actualName && expectedName && actualName !== "-" && expectedName !== "-") {
      if (actualName.trim().toLowerCase() === expectedName.trim().toLowerCase()) {
        return null;
      }
    }
    
    return {
      raterName: getRaterName(r.raterId),
      expectedName,
      actualName
    };
  };

  const getReviewerMismatchInfo = (r: ArmyRatingRecord) => {
    if (!r.seniorRaterId || r.seniorRaterId === "-") return null;
    
    const seniorRaterRecord = records.find(rec => rec.id === r.seniorRaterId);
    if (!seniorRaterRecord) return null;
    
    // A reviewer is required if the senior rater is a MSG
    if (seniorRaterRecord.rank !== "MSG") return null;
    
    // Check if reviewer is listed
    const hasReviewer = r.reviewerId && r.reviewerId !== "-";
    if (hasReviewer) return null;
    
    // If missing, find the expected reviewer (Senior Rater's Rater)
    const expectedReviewerId = seniorRaterRecord.raterId;
    const expectedName = expectedReviewerId ? getRaterName(expectedReviewerId) : "SGM Reviewer";
    
    return {
      seniorRaterName: getRaterName(r.seniorRaterId),
      expectedName
    };
  };

  const isSeniorNcoNotRating = (r: ArmyRatingRecord) => {
    const rRank = (r.rank || "").trim().toUpperCase();
    if (rRank !== "SFC" && rRank !== "MSG" && rRank !== "SGM") return false;
    
    // Check if their id is referenced as a raterId of any record in the current version / active records
    const isRatingAnyone = records.some(rec => rec.raterId === r.id);
    return !isRatingAnyone;
  };

  const getTwoRanksAboveRaterWarning = (r: ArmyRatingRecord) => {
    if (!r.raterId || r.raterId === "-") return null;
    const raterRecord = records.find(rec => rec.id === r.raterId);
    if (!raterRecord) return null;
    
    const rateeRank = (r.rank || "").trim().toUpperCase();
    const raterRank = (raterRecord.rank || "").trim().toUpperCase();
    
    const getGrade = (rankStr: string) => {
      const rk = rankStr.trim().toUpperCase();
      if (rk === "SGM" || rk === "CSM") return 9;
      if (rk === "MSG" || rk === "1SG") return 8;
      if (rk === "SFC") return 7;
      if (rk === "SSG") return 6;
      if (rk === "SGT") return 5;
      if (rk === "CPL" || rk === "SPC") return 4;
      return null;
    };
    
    const rateeGrade = getGrade(rateeRank);
    const raterGrade = getGrade(raterRank);
    
    if (rateeGrade !== null && raterGrade !== null) {
      if (raterGrade - rateeGrade >= 2) {
        return `Rater ${raterRecord.name} (${raterRank}) is two or more ranks above ratee ${r.name} (${rateeRank}). A MSG should not rate a SSG, and a SGM should not rate a SFC.`;
      }
    }
    return null;
  };

  const getSameRankRaterWarning = (r: ArmyRatingRecord) => {
    if (!r.raterId || r.raterId === "-") return null;
    const raterRecord = records.find(rec => rec.id === r.raterId);
    if (!raterRecord) return null;
    
    const rateeRank = (r.rank || "").trim().toUpperCase();
    const raterRank = (raterRecord.rank || "").trim().toUpperCase();
    
    if (rateeRank === raterRank && (rateeRank === "SSG" || rateeRank === "SFC" || rateeRank === "MSG")) {
      return `Rater ${raterRecord.name} (${raterRank}) has the same rank as ratee ${r.name} (${rateeRank}). An NCO should not rate an NCO of the same rank.`;
    }
    return null;
  };

  const mismatchCount = useMemo(() => {
    let count = 0;
    records.forEach(r => {
      if (getSeniorRaterMismatchInfo(r)) {
        count++;
      }
      if (getReviewerMismatchInfo(r)) {
        count++;
      }
      if (isSeniorNcoNotRating(r)) {
        count++;
      }
      if (getTwoRanksAboveRaterWarning(r)) {
        count++;
      }
      if (getSameRankRaterWarning(r)) {
        count++;
      }
    });
    return count;
  }, [records]);

  // Role priority for custom sorting
  const ROLE_PRIORITY: Record<string, number> = {
    "OIC": 1,
    "Element Leader": 2,
    "Group Leader": 3,
    "Group Leaders": 3,
    "Key Leader": 4,
    "Key Leaders": 4,
    "Section Leader": 5,
    "Section Leaders": 5,
    "Master Musician": 6,
    "Master Musicians": 6,
    "Senior Musician": 7,
    "Senior Musicians": 7,
    "Senior Support Musician": 7,
    "Senior Support Musicians": 7,
    "Musician": 8,
    "Musicians": 8,
    "Support Musician": 8,
    "Support Musicians": 8,
  };

  const hasDiscrepancy = (r: ArmyRatingRecord) => {
    return !!(
      getSeniorRaterMismatchInfo(r) ||
      getReviewerMismatchInfo(r) ||
      isSeniorNcoNotRating(r) ||
      getTwoRanksAboveRaterWarning(r) ||
      getSameRankRaterWarning(r)
    );
  };

  // Filter and Sort records
  const filteredRecords = records
    .filter(r => {
      const matchesSearch = 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (typeof r.role === 'string' && r.role.toLowerCase().includes(searchTerm.toLowerCase())) ||
        r.rank.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.dutyMosc.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole = selectedRole ? r.role === selectedRole : true;

      const raterName = getRaterName(r.raterId);
      const matchesRater = selectedRater ? (r.raterId === selectedRater || raterName === selectedRater) : true;

      const seniorRaterName = getRaterName(r.seniorRaterId);
      const matchesSeniorRater = selectedSeniorRater ? (r.seniorRaterId === selectedSeniorRater || seniorRaterName === selectedSeniorRater) : true;

      const matchesDiscrepancy = showOnlyDiscrepancies ? hasDiscrepancy(r) : true;

      return matchesSearch && matchesRole && matchesRater && matchesSeniorRater && matchesDiscrepancy;
    })
    .sort((a, b) => {
      if (sortAlphabetically) {
        return a.name.localeCompare(b.name);
      }

      // Hierarchy Sort
      const priorityA = ROLE_PRIORITY[a.role] || 99;
      const priorityB = ROLE_PRIORITY[b.role] || 99;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Fallback to alphabetical if roles are same priority
      return a.name.localeCompare(b.name);
    });

  // Find current version list for cell difference comparisons
  const currentRecords = (allRecords || []).filter(rec => (rec.version || "current") === "current");

  // Handle CSV Download
  const handleDownloadTemplate = () => {
    const csvContent = generateTemplateCSV(records);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Rating_Scheme_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Shared logic for NCOER report data
  const getReportItems = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const reportItems: { record: ArmyRatingRecord; thru: string; isLate: boolean }[] = [];

    records.forEach(r => {
      const currentRec = findCurrentRecord(r);
      // Check current NCOER
      if (r.thru) {
        try {
          const thruDate = new Date(r.thru);
          thruDate.setHours(0, 0, 0, 0);
          const diffTime = thruDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays <= 30) {
            reportItems.push({
              record: r,
              thru: r.thru,
              isLate: false
            });
          }
        } catch (e) {}
      }

      // Check Late NCOER - include it regardless of thru date
      if (currentRec.priorThru) {
        reportItems.push({
          record: r,
          thru: currentRec.priorThru,
          isLate: true
        });
      }
    });

    // Sort reportItems by thru date ascending
    reportItems.sort((a, b) => {
      const dateA = new Date(a.thru).getTime() || 0;
      const dateB = new Date(b.thru).getTime() || 0;
      return dateA - dateB;
    });

    return reportItems;
  };

  // Handle PDF NCOER Report Export
  const handleExportNcoerReport = (filteredItems?: { record: ArmyRatingRecord; thru: string; isLate: boolean }[]) => {
    const reportItems = filteredItems || getReportItems();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4"
    });

    const formatNiceDate = (dateStr: string | undefined): string => {
      if (!dateStr) return "N/A";
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      } catch {
        return dateStr || "N/A";
      }
    };

    const getDaysRemainingText = (thruStr: string | undefined): { text: string; color: [number, number, number] } => {
      if (!thruStr) return { text: "N/A", color: [100, 116, 139] };
      try {
        const thruDate = new Date(thruStr);
        thruDate.setHours(0, 0, 0, 0);
        const diffTime = thruDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          return { text: `${Math.abs(diffDays)}d OVERDUE`, color: [225, 29, 72] }; // rose-600
        } else if (diffDays === 0) {
          return { text: "DUE TODAY", color: [217, 119, 6] }; // amber-600
        } else {
          return { text: `${diffDays}d REMAINING`, color: [217, 119, 6] }; // amber-600
        }
      } catch {
        return { text: "N/A", color: [100, 116, 139] };
      }
    };

    const drawHeader = (pageNumber: number) => {
      if (pageNumber > 1) return;
      // Background slate band
      doc.setFillColor(30, 41, 59); // deep slate #1E293B
      doc.rect(0, 0, 297, 24, "F");

      // Gold accent line underneath
      doc.setFillColor(245, 158, 11); // amber-500
      doc.rect(0, 24, 297, 1.5, "F");

      // Title Text (with Roster Name in larger letters)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(`NCOER STATUS MONITORING REPORT - ${(activeSchemeName || "ACTIVE RATING SCHEME").toUpperCase()}`, 15, 14.5);

      // As Of Date on the right
      const todayStr = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(251, 191, 36); // amber-400
      doc.text(`AS OF: ${todayStr.toUpperCase()}`, 282, 14.5, { align: "right" });
    };

    const drawFooter = (pageNumber: number, totalPages?: number) => {
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(15, 195, 282, 195);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // slate-500
      
      const pageStr = totalPages ? `page ${pageNumber} of ${totalPages}` : `page ${pageNumber}`;
      doc.text(pageStr, 282, 201, { align: "right" });
    };

    const drawTableHeaders = (startY: number) => {
      doc.setFillColor(51, 65, 85); // slate-700
      doc.rect(15, startY, 267, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      doc.text("SOLDIER (RANK / NAME)", 17, startY + 5.5);
      doc.text("ELEMENT", 61, startY + 5.5);
      doc.text("DUTY TITLE & MOSC", 81, startY + 5.5);
      doc.text("THRU DATE (DAYS)", 115, startY + 5.5);
      doc.text("RATER", 143, startY + 5.5);
      doc.text("SENIOR RATER", 177, startY + 5.5);
      doc.text("NCOER STATUS", 211, startY + 5.5);
      doc.text("DUE TO HQDA", 249, startY + 5.5);
    };

    const drawStatusPill = (x: number, y: number, w: number, h: number, status: string, isCustom: boolean) => {
      let bg: [number, number, number] = [241, 245, 249]; // light gray
      let textCol: [number, number, number] = [71, 85, 105]; // slate-600

      if (status) {
        if (isCustom) {
          bg = [241, 245, 249];
          textCol = [71, 85, 105];
        } else {
          switch (status) {
            case "Not Submitted to HR":
              bg = [225, 29, 72]; // rose-600
              textCol = [255, 255, 255];
              break;
            case "Submitted to HR":
            case "Reviewing - HR":
            case "Reviewing - CSM":
            case "Reviewing - BN":
            case "Reviewing - BDE":
              bg = [37, 99, 235]; // blue-600
              textCol = [255, 255, 255];
              break;
            case "Returned for Edits":
            case "Out for Signatures":
              bg = [217, 119, 6]; // amber-600
              textCol = [255, 255, 255];
              break;
            case "Submitted to HQDA":
              bg = [5, 150, 105]; // emerald-600
              textCol = [255, 255, 255];
              break;
            case "Late":
              bg = [190, 18, 60]; // rose-700
              textCol = [255, 255, 255];
              break;
          }
        }
      }

      doc.setFillColor(bg[0], bg[1], bg[2]);
      try {
        (doc as any).roundedRect(x, y, w, h, 1, 1, "F");
      } catch {
        doc.rect(x, y, w, h, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(textCol[0], textCol[1], textCol[2]);
      const textWidth = doc.getTextWidth(status || "—");
      const textX = x + (w - textWidth) / 2;
      doc.text(status || "—", textX, y + 4.2);
    };

    if (reportItems.length === 0) {
      drawHeader(1);
      
      // Draw Empty summary box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, 28, 267, 16, "FD");
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("REPORT COVERAGE", 20, 33);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184);
      doc.text("No matching NCOER items found", 20, 39);
      
      drawTableHeaders(48);
      
      doc.setFillColor(255, 255, 255);
      doc.rect(15, 56, 267, 20, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("All NCOER schedules are currently up-to-date. No records are past due or within 30 days of their thru date.", 148, 68, { align: "center" });
      
      const sanitizedRoster = (activeSchemeName || "Active_Roster")
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "_");

      drawFooter(1, 1);
      doc.save(`NCOER_Due_Report_${sanitizedRoster}_${new Date().toISOString().split('T')[0]}.pdf`);
      return;
    }

    // Statistics Calculation
    let totalPastDue = 0;
    let totalComingDue = 0;

    reportItems.forEach(item => {
      const r = item.record;
      if (item.thru) {
        const thruDate = new Date(item.thru);
        const diffTime = thruDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          totalPastDue++;
        } else {
          totalComingDue++;
        }
      }
    });

    // Draw Stats Summary cards
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.rect(15, 28, 267, 16, "FD");

    // Dividers
    doc.line(100, 28, 100, 44);
    doc.line(185, 28, 185, 44);

    // Card 1: Coverage
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("REPORT FOCUS", 20, 33);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("NCOERs Due within 30 Days / Overdue", 20, 39);

    // Card 2: Past Due
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("CRITICAL OVERDUE", 105, 33);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.text(`${totalPastDue} Soldiers Overdue`, 105, 39);

    // Card 3: Upcoming
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("UPCOMING ACTION (30 DAYS)", 190, 33);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text(`${totalComingDue} Soldiers Upcoming`, 190, 39);

    let y = 56;
    let pageNum = 1;

    // Set up first page
    drawHeader(pageNum);
    drawTableHeaders(48);

    reportItems.forEach((item, idx) => {
      const r = item.record;
      const thruToUse = item.thru;
      
      const helperGetName = (id: string) => {
        if (!id || id === "-") return "—";
        const rec = records.find(x => x.id === id);
        return rec ? formatNameToLastFirstRank(rec.name, rec.rank) : formatNameToLastFirstRank(id);
      };

      const currentRec = findCurrentRecord(r);
      const daysInfo = getDaysRemainingText(thruToUse);
      const ncoerInfo = getEffectiveNcoerStatusAndColor(r);

      // Use the actual status for late mode if available, otherwise default to Not Submitted to HR
      let statusToDraw = ncoerInfo.status;
      if (item.isLate) {
        statusToDraw = (currentRec.ncoerStatus && currentRec.ncoerStatus !== "-") ? currentRec.ncoerStatus : "Not Submitted to HR";
      }

      const soldierNameStr = `${r.rank} ${r.name}`;
      const roleStr = r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role}\n(${r.keyLeaderTitle})` : r.role;
      const moscAndRole = `${roleStr}\n[MOSC: ${r.dutyMosc || "—"}]`;

      const isActuallyLate = item.isLate || currentRec.ncoerStatus === "Late" || !!currentRec.priorThru;
      const raterToUse = isActuallyLate && currentRec.lateRaterId ? currentRec.lateRaterId : r.raterId;
      const srToUse = isActuallyLate && currentRec.lateSeniorRaterId ? currentRec.lateSeniorRaterId : r.seniorRaterId;

      const soldierLines = doc.splitTextToSize(soldierNameStr, 41) as string[];
      const roleLines = doc.splitTextToSize(moscAndRole, 30) as string[];
      const raterLines = doc.splitTextToSize(helperGetName(raterToUse), 30) as string[];
      const srLines = doc.splitTextToSize(helperGetName(srToUse), 30) as string[];

      const maxLines = Math.max(soldierLines.length, roleLines.length, raterLines.length, srLines.length, 1.5);
      const rowHeight = Math.max(9, maxLines * 4.2 + 2);

      const pageHeightLimit = 190;
      if (y + rowHeight > pageHeightLimit) {
        doc.addPage();
        pageNum++;
        y = 23;
        drawTableHeaders(15);
      }

      // Zebra striping background
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, y, 267, rowHeight, "F");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(15, y, 267, rowHeight, "F");
      }

      // Cell border divider line
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.3);
      doc.line(15, y + rowHeight, 282, y + rowHeight);

      // Col 1: Name & Rank
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      soldierLines.forEach((line, lIdx) => {
        doc.text(line, 17, y + 4.5 + lIdx * 4);
      });

      // Col 1.5: Element
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(r.element || "—", 61, y + 4.5);

      // Col 2: Role & MOSC
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      roleLines.forEach((line, lIdx) => {
        if (line.startsWith("[MOSC:")) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(14, 116, 144); // cyan-700
        }
        doc.text(line, 81, y + 4.2 + lIdx * 3.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
      });

      // Col 3: Thru Date
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(formatNiceDate(thruToUse), 115, y + 4.5);
      
      doc.setFontSize(7);
      doc.setTextColor(daysInfo.color[0], daysInfo.color[1], daysInfo.color[2]);
      doc.text(daysInfo.text, 115, y + 8.5);

      // Col 4: Rater
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      raterLines.forEach((line, lIdx) => {
        doc.text(line, 143, y + 4.5 + lIdx * 3.8);
      });

      // Col 5: Senior Rater
      srLines.forEach((line, lIdx) => {
        doc.text(line, 177, y + 4.5 + lIdx * 3.8);
      });

      // Col 6: NCOER Status Pill
      const statusPillW = 30;
      const statusPillH = 6.5;
      const statusPillX = 212;
      const statusPillY = y + (rowHeight - statusPillH) / 2 - 0.5;
      drawStatusPill(statusPillX, statusPillY, statusPillW, statusPillH, statusToDraw, ncoerInfo.isCustom);

      // Col 7: Due to HQDA
      doc.setFont("helvetica", "mono");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const hqdaDueStr = isActuallyLate ? (currentRec.priorDueHqda || add90Days(thruToUse)) : (r.dueHqda || add90Days(r.thru));
      doc.text(formatNiceDate(hqdaDueStr), 249, y + 4.5);

      y += rowHeight;
    });

    const totalPages = pageNum;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    const sanitizedRoster = (activeSchemeName || "Active_Roster")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    doc.save(`NCOER_Due_Report_${sanitizedRoster}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Handle Excel Export
  const handleExportExcel = () => {
    // Sort records in the exact same order as display
    const sortedExportRecords = [...records].sort((a, b) => {
      if (sortAlphabetically) {
        return a.name.localeCompare(b.name);
      }

      // Hierarchy Sort
      const priorityA = ROLE_PRIORITY[a.role] || 99;
      const priorityB = ROLE_PRIORITY[b.role] || 99;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Fallback to alphabetical if roles are same priority
      return a.name.localeCompare(b.name);
    });

    const helperGetName = (id: string) => {
      if (!id || id === "-") return "";
      const searchSource = allRecords || records;
      const rec = searchSource.find(x => x.id === id);
      return rec ? formatNameToLastFirstRank(rec.name, rec.rank) : formatNameToLastFirstRank(id);
    };

    const data = sortedExportRecords.map(r => {
      const isLate = r.ncoerStatus === "Late";
      const raterId = isLate && r.lateRaterId ? r.lateRaterId : r.raterId;
      const seniorRaterId = isLate && r.lateSeniorRaterId ? r.lateSeniorRaterId : r.seniorRaterId;

      return {
        "Element": r.element,
        "Principal\nDuty Title": r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role,
        "Duty MOSC": r.dutyMosc,
        "Rank": r.rank,
        "Name": r.name,
        "From": formatDateToYYYYMMDD(r.from),
        "Thru": formatDateToYYYYMMDD(r.thru),
        "Due to\nHQDA": formatDateToYYYYMMDD(r.dueHqda || add90Days(r.thru)),
        "Rater": helperGetName(raterId),
        "Rater\nEffective Date": isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.raterEffectiveDate),
        "Senior Rater": helperGetName(seniorRaterId),
        "Senior Rater\nEffective Date": isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.seniorRaterEffectiveDate),
        "Reviewer": helperGetName(r.reviewerId),
        "Reviewer\nEffective Date": isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.reviewerEffectiveDate),
        "Submission\nType": r.submissionType || "ANN"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Apply column widths to make sure text is fully readable
    worksheet["!cols"] = [
      { wch: 15 }, // Element
      { wch: 25 }, // Principal Duty Title
      { wch: 12 }, // Duty MOSC
      { wch: 8 },  // Rank
      { wch: 20 }, // Name
      { wch: 12 }, // From
      { wch: 12 }, // Thru
      { wch: 12 }, // Due to HQDA
      { wch: 22 }, // Rater
      { wch: 18 }, // Rater Effective Date
      { wch: 22 }, // Senior Rater
      { wch: 18 }, // Senior Rater Effective Date
      { wch: 22 }, // Reviewer
      { wch: 18 }, // Reviewer Effective Date
      { wch: 15 }  // Submission Type
    ];

    // Format headers (A1 to O1) with a nice slate background and bold text
    const headerCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
    headerCols.forEach(col => {
      const cellRef = `${col}1`;
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true, color: { rgb: "1E293B" } }, // Slate-800
          fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } }, // Slate-100
          alignment: { wrapText: true, horizontal: "center", vertical: "center" }
        };
      }
    });

    // Apply cell yellow highlights if not "current" version, indicating difference from "current" version
    const isCurrent = selectedVersion === "current";
    if (!isCurrent) {
      sortedExportRecords.forEach((r, idx) => {
        const rowIdx = idx + 2; // Row 1 is header, data starts at row 2
        
        const currentSoldier = currentRecords.find(cr => cr.name.trim().toLowerCase() === r.name.trim().toLowerCase());
        if (!currentSoldier) return; // If soldier is not in current version, don't highlight difference

        // Highlight yellow style (thick/bright yellow background matches the "yellow outline" requirement beautifully in Excel)
        const highlightStyle = {
          fill: {
            patternType: "solid",
            fgColor: { rgb: "FFFF00" } // Bright yellow background
          }
        };

        const isLate = r.ncoerStatus === "Late";
        const currentIsLate = currentSoldier.ncoerStatus === "Late";

        const raterId = isLate && r.lateRaterId ? r.lateRaterId : r.raterId;
        const seniorRaterId = isLate && r.lateSeniorRaterId ? r.lateSeniorRaterId : r.seniorRaterId;

        const currentRaterId = currentIsLate && currentSoldier.lateRaterId ? currentSoldier.lateRaterId : currentSoldier.raterId;
        const currentSeniorRaterId = currentIsLate && currentSoldier.lateSeniorRaterId ? currentSoldier.lateSeniorRaterId : currentSoldier.seniorRaterId;

        // Compare and highlight each field:
        // A: Element
        if (r.element !== currentSoldier.element) {
          const cellRef = `A${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // B: Principal Duty Title
        const roleA = r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role;
        const roleB = currentSoldier.role === RatingRole.KEY_LEADER && currentSoldier.keyLeaderTitle ? `${currentSoldier.role} (${currentSoldier.keyLeaderTitle})` : currentSoldier.role;
        if (roleA !== roleB) {
          const cellRef = `B${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // C: Duty MOSC
        if (r.dutyMosc !== currentSoldier.dutyMosc) {
          const cellRef = `C${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // D: Rank
        if (r.rank !== currentSoldier.rank) {
          const cellRef = `D${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // F: From
        if (formatDateToYYYYMMDD(r.from) !== formatDateToYYYYMMDD(currentSoldier.from)) {
          const cellRef = `F${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // G: Thru
        if (formatDateToYYYYMMDD(r.thru) !== formatDateToYYYYMMDD(currentSoldier.thru)) {
          const cellRef = `G${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // H: Due to HQDA
        const dueA = formatDateToYYYYMMDD(r.dueHqda || add90Days(r.thru));
        const dueB = formatDateToYYYYMMDD(currentSoldier.dueHqda || add90Days(currentSoldier.thru));
        if (dueA !== dueB) {
          const cellRef = `H${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // I: Rater
        if (helperGetName(raterId) !== helperGetName(currentRaterId)) {
          const cellRef = `I${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // J: Rater Effective Date
        const raterEffA = isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.raterEffectiveDate);
        const raterEffB = currentIsLate ? "N/A (Late)" : formatDateToYYYYMMDD(currentSoldier.raterEffectiveDate);
        if (raterEffA !== raterEffB) {
          const cellRef = `J${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // K: Senior Rater
        if (helperGetName(seniorRaterId) !== helperGetName(currentSeniorRaterId)) {
          const cellRef = `K${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // L: Senior Rater Effective Date
        const srEffA = isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.seniorRaterEffectiveDate);
        const srEffB = currentIsLate ? "N/A (Late)" : formatDateToYYYYMMDD(currentSoldier.seniorRaterEffectiveDate);
        if (srEffA !== srEffB) {
          const cellRef = `L${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // M: Reviewer
        if (helperGetName(r.reviewerId) !== helperGetName(currentSoldier.reviewerId)) {
          const cellRef = `M${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // N: Reviewer Effective Date
        const revEffA = isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.reviewerEffectiveDate);
        const revEffB = currentIsLate ? "N/A (Late)" : formatDateToYYYYMMDD(currentSoldier.reviewerEffectiveDate);
        if (revEffA !== revEffB) {
          const cellRef = `N${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // O: Submission Type
        if ((r.submissionType || "ANN") !== (currentSoldier.submissionType || "ANN")) {
          const cellRef = `O${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rating Scheme");

    // Format today's date as YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Clean up activeSchemeName to construct a safe and clean filename
    const sanitizedSchemeName = activeSchemeName
      .replace(/[^a-zA-Z0-9\s_-]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    const filename = `${sanitizedSchemeName}_${dateStr}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  // Helper to find duplicate names in pending imports
  const getDuplicateNames = (importedRecords: ArmyRatingRecord[]) => {
    const counts: Record<string, number> = {};
    const existingNames = new Set(
      records.map(r => r.name.trim().toLowerCase())
    );
    const duplicates = new Set<string>();

    importedRecords.forEach(r => {
      const nameKey = r.name.trim().toLowerCase();
      if (counts[nameKey]) {
        duplicates.add(r.name.trim());
      } else {
        counts[nameKey] = 1;
      }
      if (existingNames.has(nameKey)) {
        duplicates.add(r.name.trim());
      }
    });

    return Array.from(duplicates);
  };

  // Helper to route duplicate records with later THRU date to alternate roster
  const processImportRecords = (imported: ArmyRatingRecord[], append: boolean, redirect: boolean) => {
    if (!redirect) return imported;

    const normalizedTargetVersion = selectedVersion; // e.g., "current", "future", "alternate"
    const targetRoster = append ? records : [];

    // Group both imported and target records by normalized name
    const groups: Record<string, ArmyRatingRecord[]> = {};

    const addToGroup = (rec: ArmyRatingRecord, source: 'target' | 'imported') => {
      const nameKey = rec.name.trim().toLowerCase();
      if (!groups[nameKey]) {
        groups[nameKey] = [];
      }
      groups[nameKey].push({ ...rec, _source: source } as any);
    };

    targetRoster.forEach(r => addToGroup(r, 'target'));
    imported.forEach(r => addToGroup(r, 'imported'));

    const processedImported: ArmyRatingRecord[] = [];

    Object.keys(groups).forEach(nameKey => {
      const list = groups[nameKey];
      if (list.length <= 1) {
        const item = list[0];
        if ((item as any)._source === 'imported') {
          delete (item as any)._source;
          processedImported.push(item);
        }
        return;
      }

      // Sort by THRU date ascending
      const parseDate = (dStr: string) => {
        if (!dStr) return 0;
        const d = new Date(dStr);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };

      list.sort((a, b) => parseDate(a.thru) - parseDate(b.thru));

      let keptEarliest = false;
      
      list.forEach((item) => {
        if ((item as any)._source === 'target') {
          keptEarliest = true;
          return;
        }

        const copy = { ...item };
        delete (copy as any)._source;

        if (!keptEarliest) {
          copy.version = normalizedTargetVersion;
          keptEarliest = true;
        } else {
          copy.version = "alternate";
        }
        processedImported.push(copy);
      });
    });

    return processedImported;
  };

  // Handles copying a record from Alternate roster to Projected roster
  const handleCopyToProjected = (source: ArmyRatingRecord) => {
    // Search the projected roster for a record with the same name (case insensitive)
    const projectedRoster = (allRecords || []).filter(r => r.version === "future");
    const existing = projectedRoster.find(
      r => r.name.trim().toLowerCase() === source.name.trim().toLowerCase()
    );

    if (existing) {
      setProjectedCopySourceRecord(source);
      setProjectedCopyDuplicateTarget(existing);
    } else {
      executeCopyToProjected(source, null, false);
    }
  };

  const executeCopyToProjected = (source: ArmyRatingRecord, targetToOverwrite: ArmyRatingRecord | null, addAsDuplicate: boolean) => {
    const mapAlternateIdToProjectedId = (alternateId: string) => {
      if (!alternateId || alternateId === "-" || alternateId === "none") return alternateId;
      const searchSource = allRecords || records || [];
      const altRecord = searchSource.find(r => r.id === alternateId);
      if (!altRecord) return alternateId;
      
      const projectedRecord = searchSource.find(r => 
        r.version === "future" && 
        r.name.trim().toLowerCase() === altRecord.name.trim().toLowerCase()
      );
      return projectedRecord ? projectedRecord.id : alternateId;
    };

    const mappedRaterId = mapAlternateIdToProjectedId(source.raterId);
    const mappedSeniorRaterId = mapAlternateIdToProjectedId(source.seniorRaterId);
    const mappedReviewerId = mapAlternateIdToProjectedId(source.reviewerId);
    const mappedCorNewRaterId = source.corNewRaterId ? mapAlternateIdToProjectedId(source.corNewRaterId) : source.corNewRaterId;

    if (targetToOverwrite && !addAsDuplicate) {
      // Overwrite the existing projected record with the source fields, but keep its ID to preserve history
      const updatedRecord = {
        ...targetToOverwrite,
        version: targetToOverwrite.version || "future",
        rank: source.rank,
        element: source.element,
        dutyMosc: source.dutyMosc,
        role: source.role,
        keyLeaderTitle: source.keyLeaderTitle,
        from: source.from,
        thru: source.thru,
        dueHqda: source.dueHqda,
        raterId: mappedRaterId,
        raterEffectiveDate: source.raterEffectiveDate,
        seniorRaterId: mappedSeniorRaterId,
        seniorRaterEffectiveDate: source.seniorRaterEffectiveDate,
        reviewerId: mappedReviewerId,
        reviewerEffectiveDate: source.reviewerEffectiveDate,
        submissionType: source.submissionType,
        corNewRaterId: mappedCorNewRaterId,
        corEffectiveDate: source.corEffectiveDate,
        ncoerStatus: source.ncoerStatus,
        isCustomStatus: source.isCustomStatus,
        ncoerStatusDate: source.ncoerStatusDate,
        priorThru: source.priorThru,
        priorDueHqda: source.priorDueHqda
      };
      onUpdateRecord(updatedRecord);
    } else {
      // Create a copy in the projected roster
      const newId = `projected_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
      const copiedRecord = {
        ...source,
        id: newId,
        version: "future" as const,
        raterId: mappedRaterId,
        seniorRaterId: mappedSeniorRaterId,
        reviewerId: mappedReviewerId,
        corNewRaterId: mappedCorNewRaterId
      };
      onUpdateRecord(copiedRecord);
    }
    // Clear state
    setProjectedCopySourceRecord(null);
    setProjectedCopyDuplicateTarget(null);
  };

  // Process uploaded CSV file
  const processCSVFile = (file: File) => {
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          setCsvError("No valid rows found in the CSV. Please check the template format.");
          return;
        }
        // Save parsed records to state to trigger our custom 3-way modal
        setImportPending(parsed);
      } catch (err) {
        setCsvError("Failed to parse the CSV file. Please make sure it is a valid comma-separated spreadsheet.");
      }
    };
    reader.readAsText(file);
  };

  // Helper to normalize date from YYYYMMDD, Excel serial, or Date objects to YYYY-MM-DD
  const normalizeDate = (val: any): string => {
    if (!val) return "";
    
    // Handle Date objects
    if (val instanceof Date) {
      try {
        return val.toISOString().split('T')[0];
      } catch (e) {
        // Fallback if Date object is invalid
      }
    }
    
    // Handle Excel serial numbers (numbers starting around 40000 for recent dates)
    if (typeof val === 'number' && val > 30000 && val < 60000) {
      try {
        const date = XLSX.SSF.parse_date_code(val);
        const y = date.y;
        const m = String(date.m).padStart(2, '0');
        const d = String(date.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      } catch (e) {
        // Fallback
      }
    }

    let str = String(val).trim();
    if (!str) return "";

    // Handle YYYYMMDD
    if (/^\d{8}$/.test(str)) {
      return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    }
    // Handle MM/DD/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [m, d, y] = str.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Handle YYYY-MM-DD already
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    // Fallback: standard Date parsing
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      const date = new Date(parsed);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return str;
  };

  // Process uploaded Excel file
  const processExcelFile = (file: File) => {
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      try {
        // Parse with cellDates: true so Excel dates are automatically parsed as Date objects
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Find the index of the header row (e.g. Row containing "Name" or "Rank")
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
          const row = rawRows[i];
          if (!row || !Array.isArray(row)) continue;
          const hasHeaderKeywords = row.some(cell => {
            if (cell === null || cell === undefined) return false;
            const val = String(cell).toLowerCase().trim().replace(/\s+/g, '');
            return ['name', 'soldiername', 'principaldutytitle', 'principaldutytitile', 'dutytitle', 'dutymosc', 'seniorrater', 'submissiontype'].includes(val);
          });
          if (hasHeaderKeywords) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = (rawRows[headerRowIndex] || []).map(cell => String(cell || "").trim());

        let idxElement = -1;
        let idxRole = -1;
        let idxDutyMosc = -1;
        let idxRank = -1;
        let idxName = -1;
        let idxFrom = -1;
        let idxThru = -1;
        let idxDueHqda = -1;
        let idxRater = -1;
        let idxRaterEffectiveDate = -1;
        let idxSeniorRater = -1;
        let idxSeniorRaterEffectiveDate = -1;
        let idxReviewer = -1;
        let idxReviewerEffectiveDate = -1;
        let idxSubmissionType = -1;

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const header = headers[colIdx].toLowerCase().trim();
          
          if (header.includes("element") || header.includes("unit") || header.includes("section")) {
            if (idxElement === -1) idxElement = colIdx;
          } else if (
            header.includes("principal duty") || 
            header.includes("principle duty") || 
            header.includes("duty titile") || 
            header.includes("duty title") || 
            header === "role" || 
            header === "title"
          ) {
            if (idxRole === -1) idxRole = colIdx;
          } else if (header.includes("duty mosc") || header === "mosc" || header === "mos" || header.includes("duty title & mosc") || header.includes("duty titile & mosc")) {
            if (idxDutyMosc === -1) idxDutyMosc = colIdx;
          } else if (header === "rank" || header.includes("pay grade") || header === "grade") {
            if (idxRank === -1) idxRank = colIdx;
          } else if (header === "name" || header.includes("soldier name") || header.includes("name (last, first)")) {
            if (idxName === -1) idxName = colIdx;
          } else if (header === "from" || header === "from date") {
            if (idxFrom === -1) idxFrom = colIdx;
          } else if (header === "thru" || header === "thru date" || header === "through") {
            if (idxThru === -1) idxThru = colIdx;
          } else if (header.includes("due to hqda") || header.includes("due hqda") || header.includes("hqda due") || header.includes("evaluation due")) {
            if (idxDueHqda === -1) idxDueHqda = colIdx;
          } else if (header === "rater") {
            if (idxRater === -1) idxRater = colIdx;
            // Check if next column is "Effective Date"
            if (colIdx + 1 < headers.length) {
              const nextHeader = headers[colIdx + 1].toLowerCase().trim();
              if (nextHeader.includes("effective") || nextHeader.includes("eff")) {
                idxRaterEffectiveDate = colIdx + 1;
              }
            }
          } else if (header.includes("senior rater")) {
            if (idxSeniorRater === -1) idxSeniorRater = colIdx;
            // Check if next column is "Effective Date"
            if (colIdx + 1 < headers.length) {
              const nextHeader = headers[colIdx + 1].toLowerCase().trim();
              if (nextHeader.includes("effective") || nextHeader.includes("eff")) {
                idxSeniorRaterEffectiveDate = colIdx + 1;
              }
            }
          } else if (header.includes("reviewer")) {
            if (idxReviewer === -1) idxReviewer = colIdx;
            // Check if next column is "Effective Date"
            if (colIdx + 1 < headers.length) {
              const nextHeader = headers[colIdx + 1].toLowerCase().trim();
              if (nextHeader.includes("effective") || nextHeader.includes("eff")) {
                idxReviewerEffectiveDate = colIdx + 1;
              }
            }
          } else if (header.includes("submission type") || header.includes("submission") || header === "type") {
            if (idxSubmissionType === -1) idxSubmissionType = colIdx;
          }
        }

        // Fallbacks for effective dates if not found immediately adjacent
        if (idxRaterEffectiveDate === -1) {
          idxRaterEffectiveDate = headers.findIndex(h => {
            const s = h.toLowerCase().trim();
            return s.includes("rater effective") || s.includes("rater date") || s.includes("rater eff");
          });
        }
        if (idxSeniorRaterEffectiveDate === -1) {
          idxSeniorRaterEffectiveDate = headers.findIndex(h => {
            const s = h.toLowerCase().trim();
            return s.includes("senior rater effective") || s.includes("senior rater date") || s.includes("senior rater eff");
          });
        }
        if (idxReviewerEffectiveDate === -1) {
          idxReviewerEffectiveDate = headers.findIndex(h => {
            const s = h.toLowerCase().trim();
            return s.includes("reviewer effective") || s.includes("reviewer date") || s.includes("reviewer eff");
          });
        }

        const parsed: ArmyRatingRecord[] = [];
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length < 2) continue;

          const getVal = (idx: number, fallback: string = ""): any => {
            if (idx === -1 || idx >= row.length) return fallback;
            const v = row[idx];
            return v === undefined || v === null ? fallback : v;
          };

          const nameVal = String(getVal(idxName, "")).trim();
          if (!nameVal) continue; // Skip rows with no name

          parsed.push({
            id: `imported_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
            name: nameVal,
            rank: String(getVal(idxRank, "SPC")).trim(),
            element: String(getVal(idxElement, "Band")).trim(),
            role: String(getVal(idxRole, "Musician")).trim(),
            dutyMosc: String(getVal(idxDutyMosc, "42R")).trim(),
            from: normalizeDate(getVal(idxFrom, "")),
            thru: normalizeDate(getVal(idxThru, "")),
            dueHqda: normalizeDate(getVal(idxDueHqda, "")) || add90Days(normalizeDate(getVal(idxThru, ""))),
            raterId: String(getVal(idxRater, "")).trim(),
            raterEffectiveDate: normalizeDate(getVal(idxRaterEffectiveDate, "")),
            seniorRaterId: String(getVal(idxSeniorRater, "")).trim(),
            seniorRaterEffectiveDate: normalizeDate(getVal(idxSeniorRaterEffectiveDate, "")),
            reviewerId: String(getVal(idxReviewer, "")).trim(),
            reviewerEffectiveDate: normalizeDate(getVal(idxReviewerEffectiveDate, "")),
            submissionType: String(getVal(idxSubmissionType, "ANN")).trim().toUpperCase()
          });
        }

        // Clean up: Filter out rows that don't have a valid Name
        const validParsed = parsed.filter(p => p.name && p.name.trim() !== "");

        // Second pass: Resolve rater/reviewer names to IDs
        const nameToIdMap: Record<string, string> = {};
        const cleanName = (n: string) => n.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();

        // Add existing records to map
        records.forEach(r => {
          if (r.name && r.name.trim()) {
            nameToIdMap[cleanName(`${r.rank} ${r.name}`)] = r.id;
            nameToIdMap[cleanName(r.name)] = r.id;
          }
        });

        // Add new valid records to map
        validParsed.forEach(r => {
          if (r.name && r.name.trim()) {
            nameToIdMap[cleanName(`${r.rank} ${r.name}`)] = r.id;
            nameToIdMap[cleanName(r.name)] = r.id;
          }
        });

        // Update rater IDs
        const resolved = validParsed.map(r => {
          const raterKey = r.raterId ? cleanName(r.raterId) : "";
          const seniorKey = r.seniorRaterId ? cleanName(r.seniorRaterId) : "";
          const reviewerKey = r.reviewerId ? cleanName(r.reviewerId) : "";

          // Try matching full rank + name first, then just name
          const raterId = raterKey ? (nameToIdMap[raterKey] || r.raterId) : "";
          const seniorRaterId = seniorKey ? (nameToIdMap[seniorKey] || r.seniorRaterId) : "";
          const reviewerId = reviewerKey ? (nameToIdMap[reviewerKey] || r.reviewerId) : "";

          return {
            ...r,
            raterId,
            seniorRaterId,
            reviewerId
          };
        });

        if (resolved.length === 0) {
          setCsvError("No valid rows containing a Name were found in the Excel/Spreadsheet file.");
          return;
        }
        setImportPending(resolved);
      } catch (err) {
        console.error("Excel parse error:", err);
        setCsvError("Failed to parse the Excel/Spreadsheet file. Ensure the headers match our template.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".csv")) {
        processCSVFile(file);
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        processExcelFile(file);
      } else {
        setCsvError("Only standard .csv and .xlsx files are supported.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith(".csv")) {
        processCSVFile(file);
      } else {
        processExcelFile(file);
      }
      e.target.value = "";
    }
  };

  const getReviewerName = (reviewerId: string) => {
    if (!reviewerId || reviewerId === "-") return "N/A";
    const searchSource = allRecords || records;
    const r = searchSource.find(rec => rec.id === reviewerId);
    if (r) {
      return formatNameToLastFirstRank(r.name, r.rank);
    }
    return formatNameToLastFirstRank(reviewerId);
  };

  const getRaterNameInVersion = (raterId: string, versionRecords: ArmyRatingRecord[]) => {
    if (!raterId || raterId === "-") return "-";
    const found = versionRecords.find(rec => rec.id === raterId);
    if (found) {
      return formatNameToLastFirstRank(found.name, found.rank);
    }
    return formatNameToLastFirstRank(raterId);
  };

  const getReviewerNameInVersion = (reviewerId: string, versionRecords: ArmyRatingRecord[]) => {
    if (!reviewerId || reviewerId === "-") return "N/A";
    const found = versionRecords.find(rec => rec.id === reviewerId);
    if (found) {
      return formatNameToLastFirstRank(found.name, found.rank);
    }
    return formatNameToLastFirstRank(reviewerId);
  };

  const PREDEFINED_STATUSES = [
    "Not Submitted to HR",
    "Submitted to HR",
    "Reviewing - HR",
    "Reviewing - CSM",
    "Returned for Edits",
    "Out for Signatures",
    "Submitted to HQDA",
    "Late"
  ];

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (expandedHistoryRecordId && user) {
      setIsHistoryLoading(true);
      unsubscribe = subscribeToRecordHistory(expandedHistoryRecordId, (history) => {
        setRecordHistory(history);
        setIsHistoryLoading(false);
      });
    } else {
      setRecordHistory([]);
      setIsHistoryLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [expandedHistoryRecordId, user]);

  // Synchronize Notes (Firestore vs Local Storage fallback)
  useEffect(() => {
    if (activeSchemeId && user) {
      const unsubscribe = subscribeToNotes(activeSchemeId, (notes) => {
        setAllNotes(notes);
      }, (err) => {
        console.warn("Notes subscription failed, using local notes as fallback:", err);
        const savedNotes = localStorage.getItem("army_ratings_notes");
        if (savedNotes) {
          try {
            setAllNotes(JSON.parse(savedNotes));
          } catch (e) {
            console.error("Error parsing local notes", e);
          }
        }
      });
      return () => unsubscribe();
    } else {
      const savedNotes = localStorage.getItem("army_ratings_notes");
      if (savedNotes) {
        try {
          setAllNotes(JSON.parse(savedNotes));
        } catch (e) {
          console.error("Error parsing local notes", e);
        }
      } else {
        setAllNotes([]);
      }
    }
  }, [activeSchemeId, user]);

  const handleAddNote = async () => {
    if (!activeNoteSoldierName || !noteInputText.trim()) return;
    const cleanText = noteInputText.trim();
    const cleanName = activeNoteSoldierName.trim().toLowerCase();

    if (activeSchemeId) {
      try {
        await addNote(
          user?.uid || "guest",
          activeSchemeId,
          cleanName,
          cleanText
        );
        setNoteInputText("");
      } catch (err) {
        console.error("Failed to add note:", err);
      }
    } else {
      // Local Guest storage fallback
      const newNote: Note = {
        id: "note-" + Math.random().toString(36).substring(2, 11),
        schemeId: "guest",
        userId: "guest",
        soldierName: cleanName,
        content: cleanText,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const updated = [...allNotes, newNote];
      setAllNotes(updated);
      localStorage.setItem("army_ratings_notes", JSON.stringify(updated));
      setNoteInputText("");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (activeSchemeId) {
      try {
        await deleteNote(noteId);
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
    } else {
      // Local Guest storage fallback
      const updated = allNotes.filter(n => n.id !== noteId);
      setAllNotes(updated);
      localStorage.setItem("army_ratings_notes", JSON.stringify(updated));
    }
  };

  const toggleHistory = (recordId: string) => {
    if (expandedHistoryRecordId === recordId) {
      setExpandedHistoryRecordId(null);
    } else {
      setExpandedHistoryRecordId(recordId);
    }
  };

  const getDiffClass = (currentRecord: ArmyRatingRecord, historyRecord: any, field: keyof ArmyRatingRecord) => {
    let curVal = currentRecord[field];
    let histVal = historyRecord[field];
    
    // If it's a rater field, compare by resolved name (ignoring rank) instead of ID because IDs change between versions
    if (field === 'raterId' || field === 'seniorRaterId') {
      curVal = getRaterNameOnly(curVal as string);
      histVal = getRaterNameOnly(histVal as string);
    } else if (field === 'reviewerId') {
      curVal = getReviewerNameOnly(curVal as string);
      histVal = getReviewerNameOnly(histVal as string);
    } else if (field === 'dueHqda') {
      // Compare computed HQDA dates
      curVal = currentRecord.dueHqda || add90Days(currentRecord.thru);
      histVal = historyRecord.dueHqda || add90Days(historyRecord.thru);
    }
    
    // Normalize values for comparison
    const normalize = (val: any) => (val === undefined || val === null ? "" : String(val).trim());
    
    if (normalize(curVal) !== normalize(histVal)) {
      return "ring-2 ring-yellow-400 ring-inset";
    }
    return "";
  };

  const formatSnapshotDate = (timestamp: any) => {
    if (!timestamp) return "Unknown Date";
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEffectiveNcoerStatusAndColor = (r: ArmyRatingRecord) => {
    const targetRecord = findCurrentRecord(r);
    let status = targetRecord.ncoerStatus || "";
    let isCustom = !!targetRecord.isCustomStatus || (status !== "" && !PREDEFINED_STATUSES.includes(status));

    let isWithin30Days = false;
    if (targetRecord.thru) {
      try {
        const thruDate = new Date(targetRecord.thru);
        const now = new Date();
        thruDate.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diffTime = thruDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          isWithin30Days = true;
        }
      } catch (e) {
        // ignore
      }
    }

    // Default status in the cell is blank. 
    // As soon as the thru date is within 30 days, it should change to "Not Submitted to HR"
    let isAutoRed = false;
    if (!status && isWithin30Days && !targetRecord.priorThru) {
      status = "Not Submitted to HR";
      isAutoRed = true;
    }

    let bgClass = "";
    let badgeClass = "bg-slate-100 text-slate-700 border-slate-300";
    if (status || targetRecord.priorThru) {
      if (isCustom) {
        bgClass = "bg-slate-100 text-slate-900";
        badgeClass = "bg-white/40 text-slate-900 border-slate-300/50 font-bold shadow-none";
      } else {
        switch (status) {
          case "Not Submitted to HR":
            bgClass = "bg-rose-100 text-rose-950";
            badgeClass = "bg-rose-600 text-white border-rose-700 font-extrabold shadow-sm";
            break;
          case "Submitted to HR":
          case "Reviewing - HR":
          case "Reviewing - CSM":
          case "Reviewing - BN":
          case "Reviewing - BDE":
            bgClass = "bg-blue-100 text-blue-950";
            badgeClass = "bg-blue-600 text-white border-blue-700 font-extrabold shadow-sm";
            break;
          case "Returned for Edits":
          case "Out for Signatures":
            bgClass = "bg-amber-100 text-amber-950";
            badgeClass = "bg-amber-600 text-white border-amber-700 font-extrabold shadow-sm";
            break;
          case "Submitted to HQDA":
            bgClass = "bg-emerald-100 text-emerald-950";
            badgeClass = "bg-emerald-600 text-white border-emerald-700 font-extrabold shadow-sm";
            break;
          case "Late":
            bgClass = "bg-rose-100 text-rose-950";
            badgeClass = "bg-rose-700 text-white border-rose-800 font-extrabold shadow-md";
            break;
          default:
            bgClass = "bg-slate-100 text-slate-900";
            badgeClass = "bg-white/40 text-slate-900 border-slate-300/40 font-medium shadow-none";
            break;
        }
      }
    }

    return { status, bgClass, badgeClass, isAutoRed, isCustom, isWithin30Days };
  };

  const handleStatusChange = (r: ArmyRatingRecord, newStatus: string) => {
    const targetRecord = findCurrentRecord(r);
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (newStatus === "Late") {
      setHistoryConfirm({
        isOpen: true,
        title: "Late NCOER Management",
        message: targetRecord.ncoerStatus === "Late" 
          ? `This record is currently marked as LATE. Would you like to reset the status and historical rating chain for ${targetRecord.name}?`
          : `Mark this record as LATE for ${targetRecord.name}? This will allow specifying a historical rating chain for this period.`,
        confirmLabel: targetRecord.ncoerStatus === "Late" ? "RESET TO CURRENT" : "MARK AS LATE",
        cancelLabel: "KEEP AS IS",
        variant: targetRecord.ncoerStatus === "Late" ? "danger" : "warning",
        onConfirm: () => {
          if (targetRecord.ncoerStatus === "Late") {
            // RESET
            onUpdateRecord({
              ...targetRecord,
              ncoerStatus: undefined,
              ncoerStatusDate: undefined,
              lateRaterId: undefined,
              lateSeniorRaterId: undefined,
              priorThru: undefined,
              priorDueHqda: undefined
            });
          } else {
            // SET
            onUpdateRecord({
              ...targetRecord,
              ncoerStatus: "Late",
              ncoerStatusDate: todayStr,
              lateRaterId: targetRecord.lateRaterId || targetRecord.raterId,
              lateSeniorRaterId: targetRecord.lateSeniorRaterId || targetRecord.seniorRaterId
            });
          }
          setHistoryConfirm(null);
        }
      });
      return;
    }

    if (newStatus === "Submitted to HQDA") {
      setHistoryConfirm({
        isOpen: true,
        title: "Reset Status Cell?",
        message: "NCOER Submitted to HQDA. Would you like to reset this status cell? If yes, it will remain empty until 30 days prior to the next Thru date.",
        confirmLabel: "YES, RESET",
        cancelLabel: "NO, KEEP STATUS",
        variant: "question",
        onConfirm: () => {
          onUpdateRecord({
            ...targetRecord,
            ncoerStatus: undefined,
            isCustomStatus: false,
            ncoerStatusDate: undefined,
            priorThru: undefined,
            priorDueHqda: undefined
          });
        }
      });
      // We don't return here because we still want to set the status to "Submitted to HQDA" 
      // if they choose NO or before they confirm.
    }

    const updatedRecord: ArmyRatingRecord = {
      ...targetRecord,
      ncoerStatus: newStatus || undefined,
      isCustomStatus: false,
      ncoerStatusDate: newStatus ? todayStr : undefined
    };
    onUpdateRecord(updatedRecord);
  };

  const handleSaveCustomStatus = (r: ArmyRatingRecord) => {
    const targetRecord = findCurrentRecord(r);
    if (!customStatusText.trim()) {
      setActiveCustomStatusRecordId(null);
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const updatedRecord: ArmyRatingRecord = {
      ...targetRecord,
      ncoerStatus: customStatusText.trim(),
      isCustomStatus: true,
      ncoerStatusDate: todayStr
    };
    onUpdateRecord(updatedRecord);
    setActiveCustomStatusRecordId(null);
  };

  const handleSaveStatusDate = (r: ArmyRatingRecord) => {
    const updatedRecord: ArmyRatingRecord = {
      ...r,
      ncoerStatusDate: tempDateValue || undefined
    };
    onUpdateRecord(updatedRecord);
    setEditingDateRecordId(null);
  };

  const getThruDateClass = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const thruDate = new Date(dateStr);
      const now = new Date();
      
      // Set times to 0 for date-only comparison
      thruDate.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      
      const diffTime = thruDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        return "bg-rose-100 text-rose-800 border-rose-200"; // Past due
      }
      if (diffDays <= 30) {
        return "bg-amber-100 text-amber-800 border-amber-200"; // Within 30 days
      }
    } catch (e) {
      console.error("Invalid date:", dateStr);
    }
    return "";
  };

  const handleShiftYear = (r: ArmyRatingRecord) => {
    if (selectedVersion !== "current") {
      confirmShiftYear(r, true);
    } else {
      setLateShiftPromptRecord(r);
    }
  };

  const confirmShiftYear = (r: ArmyRatingRecord, hasBeenSubmitted: boolean) => {
    const shiftDate = (dateStr: string) => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr + "T12:00:00");
        if (isNaN(d.getTime())) return dateStr;
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split('T')[0];
      } catch (e) {
        return dateStr;
      }
    };

    const newThru = shiftDate(r.thru);
    const newFrom = shiftDate(r.from);
    
    if (hasBeenSubmitted) {
      onUpdateRecord({
        ...r,
        from: newFrom,
        thru: newThru,
        dueHqda: add90Days(newThru),
        ncoerStatus: undefined,
        priorThru: undefined,
        priorDueHqda: undefined
      });
    } else {
      const priorThru = r.thru;
      const priorDueHqda = r.dueHqda || add90Days(r.thru);
      
      onUpdateRecord({
        ...r,
        from: newFrom,
        thru: newThru,
        dueHqda: add90Days(newThru),
        priorThru: priorThru,
        priorDueHqda: priorDueHqda,
        // Keep current ncoerStatus
      });
    }
    setLateShiftPromptRecord(null);
  };

  const handleOpenManualLate = (r: ArmyRatingRecord) => {
    setManualLateRecord(r);
    setManualLateRaterId(r.raterId || "");
    setManualLateSeniorRaterId(r.seniorRaterId || "");
    try {
      const d = new Date(r.thru + "T12:00:00");
      setManualLateThru(d.toISOString().split('T')[0]);
    } catch (e) {
      setManualLateThru("");
    }
  };

  const handleSaveManualLate = () => {
    if (!manualLateRecord || !manualLateThru) return;
    
    onUpdateRecord({
      ...manualLateRecord,
      priorThru: manualLateThru,
      priorDueHqda: add90Days(manualLateThru),
      lateRaterId: manualLateRaterId,
      lateSeniorRaterId: manualLateSeniorRaterId,
      ncoerStatus: manualLateRecord.ncoerStatus || "Not Submitted to HR"
    });
    setManualLateRecord(null);
  };

  return (
    <div className="space-y-4 transition-colors duration-500 min-h-screen bg-slate-100">
      {/* Search, Filter & Actions Bar */}
      <div className={`bg-white rounded shadow-sm border p-3 space-y-3 mx-4 mt-4 transition-all duration-300 ${
        selectedVersion === "future" ? "border-blue-200" : 
        selectedVersion === "alternate" ? "border-emerald-200" : 
        selectedVersion.startsWith("archive_") ? "border-amber-400/80 ring-2 ring-amber-500/10 bg-amber-50/5" :
        "border-slate-200"
      }`}>
        <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
          
          {/* Left: Search & Filter selections */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                id="search-tracker"
                type="text"
                placeholder="Search name, rank, duty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50"
              />
            </div>

            {/* Filter by Principal Duty Title */}
            <select
              id="filter-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50 min-w-[150px]"
            >
              <option value="">-- All Duty Titles --</option>
              {Object.values(RatingRole).map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            {/* Filter by Rater */}
            <select
              id="filter-rater"
              value={selectedRater}
              onChange={(e) => setSelectedRater(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50 min-w-[150px]"
            >
              <option value="">-- All Raters --</option>
              {uniqueRaters.map(rater => (
                <option key={rater} value={rater}>{rater}</option>
              ))}
            </select>

            {/* Filter by Senior Rater */}
            <select
              id="filter-senior-rater"
              value={selectedSeniorRater}
              onChange={(e) => setSelectedSeniorRater(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50 min-w-[150px]"
            >
              <option value="">-- All Senior Raters --</option>
              {uniqueSeniorRaters.map(sr => (
                <option key={sr} value={sr}>{sr}</option>
              ))}
            </select>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-700 hover:text-rose-800 rounded text-xs font-semibold transition-colors duration-200 cursor-pointer shadow-sm animate-fade-in"
              >
                <X className="w-3.5 h-3.5 text-rose-500" />
                Clear Filters
              </button>
            )}
          </div>

          {/* Right: Actions */}
          {!readOnly && (
            <div className="flex items-center justify-end">
              <button
                onClick={onAddClick}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                id="btn-add-profile"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Soldier
              </button>
            </div>
          )}
        </div>

        {/* Drag & Drop CSV Import / Export Toolbar */}
        <div className="border-t border-slate-100 pt-3 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          
          {/* Export Panel */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              id="btn-export-excel"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export Excel (.xlsx)
            </button>
            {selectedVersion === "current" && (
              <>
                <button
                  onClick={handleExportNcoerReport}
                  className="px-3 py-1.5 text-white bg-slate-800 hover:bg-slate-900 border border-slate-700 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  id="btn-export-ncoer-pdf"
                  title="Exports a professional PDF report showing NCOERs due within 30 days or past due"
                >
                  <FileDown className="w-3.5 h-3.5 text-amber-500" />
                  Export NCOER Report (PDF)
                </button>
                <button
                  onClick={() => exportNcoerReportToPPTX(allRecords || [], records, activeSchemeName)}
                  className="px-3 py-1.5 text-white bg-amber-600 hover:bg-amber-700 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  id="btn-export-ncoer-pptx"
                  title="Exports a professional PowerPoint report slide deck containing NCOER categorizations"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Export NCOER Report (PPTX)
                </button>
              </>
            )}
            {readOnly && (
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                ⚠️ View-Only
              </p>
            )}
          </div>

          {/* Compact Drop Zone */}
          {!readOnly && (
            <div className="flex-1 max-w-md">
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`py-1.5 px-3 rounded border border-dashed cursor-pointer flex items-center justify-center gap-2 transition-all ${
                  dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
                }`}
                id="csv-drag-zone"
              >
                <Upload className={`w-3.5 h-3.5 ${dragActive ? "text-blue-500" : "text-slate-400"}`} />
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="font-bold text-slate-700 uppercase tracking-tight">Import:</span>
                  <span className="text-slate-500">Drag & drop or click file</span>
                </div>
                {csvError && <span className="text-[10px] font-bold text-rose-600 ml-1">{csvError}</span>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}
        </div>
      </div>

      {mismatchCount > 0 && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setShowOnlyDiscrepancies(!showOnlyDiscrepancies)}
            className={`group inline-flex items-center justify-between gap-3 px-3.5 py-1.5 rounded-md border text-xs transition-all shadow-xs cursor-pointer ${
              showOnlyDiscrepancies
                ? "bg-rose-100 border-rose-500 ring-2 ring-rose-500/30 text-rose-950 font-medium"
                : "bg-rose-50 border-rose-200 hover:bg-rose-100/80 hover:border-rose-300 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${showOnlyDiscrepancies ? "text-rose-600 animate-pulse" : "text-rose-500"}`} />
              <span>
                <strong className="font-extrabold text-rose-900">{mismatchCount} rating chain discrepancy{mismatchCount === 1 ? "" : "ies"}</strong> found.
              </span>
              {showOnlyDiscrepancies && (
                <span className="ml-1 font-black text-rose-800 bg-rose-200/80 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border border-rose-300">
                  Filtering Active
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-rose-200">
              {showOnlyDiscrepancies ? (
                <span className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider shadow-xs transition-colors">
                  <X className="w-3 h-3 stroke-[3]" />
                  <span>Clear Filter</span>
                  <span className="text-[9px] opacity-80 font-normal hidden sm:inline">(Show All)</span>
                </span>
              ) : (
                <span className="text-[10px] font-extrabold uppercase text-rose-700 group-hover:text-rose-900 flex items-center gap-1">
                  <span>Filter Discrepancies</span>
                  <span className="text-xs transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Spreadsheet List Container */}
      <div className="bg-white rounded border border-slate-200 shadow-sm">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center rounded-t">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Rating Roster (Current Scheme - {filteredRecords.length} of {records.length} Entries)
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <span className={`text-[10px] font-bold uppercase tracking-tight transition-colors ${sortAlphabetically ? "text-amber-600" : "text-slate-400"}`}>
                Sort Alphabetically
              </span>
              <div 
                onClick={() => setSortAlphabetically(!sortAlphabetically)}
                className={`relative w-8 h-4 rounded-full transition-colors ${sortAlphabetically ? "bg-amber-500" : "bg-slate-300"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${sortAlphabetically ? "translate-x-4" : ""}`} />
              </div>
            </label>
          </div>
        </div>

        <div 
          onScroll={(e) => {
            const scrollLeft = e.currentTarget.scrollLeft;
            const active = scrollLeft > 2;
            if (active !== showGreenLine) {
              setShowGreenLine(active);
            }
          }}
          className={`w-full bg-white relative overflow-visible border rounded-lg shadow-sm transition-all duration-300 ${
            selectedVersion.startsWith("archive_") 
              ? "border-amber-500/70 ring-4 ring-amber-500/10 bg-amber-50/5" 
              : "border-slate-200"
          }`}
        >
          <table className="w-full min-w-[1200px] text-left border-collapse text-[11px]" id="rating-records-table">
            <thead className="z-20">
              {/* Floating Header Banner inside thead so it stays with column headers on scroll */}
              <tr className="bg-[#1e293b] text-white font-sans uppercase tracking-tight font-bold print:hidden">
                <th colSpan={selectedVersion === "current" ? 12 : 11} className={`px-3 py-2 border-b sticky top-0 z-50 h-[34px] ${
                  selectedVersion === "future" ? "bg-sky-600 border-sky-700 text-white" : 
                  selectedVersion === "alternate" ? "bg-emerald-600 border-emerald-700 text-white" : 
                  selectedVersion.startsWith("archive_") ? "bg-amber-800 border-amber-900 text-amber-50" :
                  "bg-[#1e293b] border-slate-800 text-white"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 animate-pulse" />
                      <span className="text-[10px] tracking-wider text-slate-300 flex items-center gap-1">
                        ROSTER VIEW:
                        <span className="text-amber-400 font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px]">
                          {activeSchemeName}
                        </span>
                      </span>
                      <div className="inline-flex rounded bg-slate-800 p-0.5 border border-slate-700">
                        <button
                          type="button"
                          onClick={() => onChangeVersion?.("current")}
                          className={`px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                            selectedVersion === "current"
                              ? "bg-slate-600 text-white font-black shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Current
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeVersion?.("future")}
                          className={`px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                            selectedVersion === "future"
                              ? "bg-sky-600 text-white font-black shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Projected
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeVersion?.("alternate")}
                          className={`px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                            selectedVersion === "alternate"
                              ? "bg-emerald-600 text-white font-black shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Alternate
                        </button>
                        {selectedVersion === "current" && (
                          <button
                            type="button"
                            onClick={() => setIsShowingReportPreview(true)}
                            className="ml-1 px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded shadow-sm transition-all flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                            title="Preview NCOER Monitoring Report"
                          >
                            <FileText className="w-3 h-3" />
                            NCOER Report
                          </button>
                        )}
                      </div>
                      {selectedVersion === "current" && (
                        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-700">
                          <span className="text-xs text-slate-300 normal-case font-medium">
                            Effective as of:
                          </span>
                          <input
                            type="date"
                            value={effectiveAsOf}
                            disabled={readOnly}
                            onChange={(e) => onUpdateEffectiveAsOf?.(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono disabled:opacity-50 [color-scheme:dark]"
                          />
                        </div>
                      )}
                      {selectedVersion === "current" ? null : (
                        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-700">
                          <span className="text-xs text-slate-300 normal-case font-medium">
                            Proposed Effective Date:
                          </span>
                          <input
                            type="date"
                            value={proposedEffectiveDate}
                            disabled={readOnly}
                            onChange={(e) => onUpdateProposedEffectiveDate?.(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono disabled:opacity-50 [color-scheme:dark]"
                          />
                        </div>
                      )}
                      {selectedVersion !== "current" && (
                        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-700">
                          <button
                            onClick={handlePromoteVersionClick}
                            disabled={readOnly || !canEditCurrentRoster}
                            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black rounded shadow-sm hover:shadow transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!canEditCurrentRoster ? "Only the logged in owner can modify the current roster" : "Set this version as the Current Version"}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Set as Current Version
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-300 font-mono font-medium">
                      <span>Total: <strong className="text-white font-bold">{filteredRecords.length}</strong> Soldiers</span>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="border-b border-slate-200 uppercase tracking-tighter font-bold font-mono text-[10px] text-slate-500 bg-slate-100">
                <th className={`px-2 py-2 bg-slate-50 sticky left-0 top-[34px] z-35 border-r border-slate-200 relative h-[34px] box-border ${
                  showGreenLine 
                    ? "after:absolute after:top-0 after:right-0 after:bottom-0 after:w-[3px] after:bg-emerald-500 after:z-36" 
                    : ""
                }`}>Name</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Rank</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Element</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">MOSC</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Principal Duty Title</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Dates (From - Thru)</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Rater</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Senior Rater</th>
                <th className="px-2 py-2 border-r border-slate-200 bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Reviewer</th>
                <th className="px-1 py-2 border-r border-slate-200 text-center leading-tight bg-slate-50 sticky top-[34px] z-20 w-[70px] h-[34px] box-border">Type</th>
                {selectedVersion === "current" && (
                  <th className="px-2 py-2 border-r border-slate-200 text-center bg-slate-50 sticky top-[34px] z-20 w-[145px] h-[34px] box-border">NCOER Status</th>
                )}
                <th className="px-3 py-2 text-right bg-slate-50 sticky top-[34px] z-20 h-[34px] box-border">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={selectedVersion === "current" ? 12 : 11} className="px-4 py-8 text-center text-slate-400 font-medium">
                    No records found matching your search and filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const colors = getRoleColors(r.role);
                  const ncoerInfo = getEffectiveNcoerStatusAndColor(r);
                  const ncoerRecord = findCurrentRecord(r);
                  const isEven = idx % 2 === 1;

                  // Comparison for versions (Future/Alternate vs Current)
                  const isCurrent = selectedVersion === "current";
                  const currentSoldier = isCurrent ? null : currentRecords.find(cr => cr.name.trim().toLowerCase() === r.name.trim().toLowerCase());
                  
                  const normalize = (val: any) => (val === undefined || val === null ? "" : String(val).trim());

                  const isRankDiff = !isCurrent && !!currentSoldier && normalize(r.rank) !== normalize(currentSoldier.rank);
                  const isElementDiff = !isCurrent && !!currentSoldier && normalize(r.element) !== normalize(currentSoldier.element);
                  const isMoscDiff = !isCurrent && !!currentSoldier && normalize(r.dutyMosc) !== normalize(currentSoldier.dutyMosc);
                  const isRoleDiff = !isCurrent && !!currentSoldier && (
                    normalize(r.role) !== normalize(currentSoldier.role) || 
                    (r.role === RatingRole.KEY_LEADER && normalize(r.keyLeaderTitle) !== normalize(currentSoldier.keyLeaderTitle))
                  );
                  const isDatesDiff = !isCurrent && !!currentSoldier && (
                    normalize(r.from) !== normalize(currentSoldier.from) || 
                    normalize(r.thru) !== normalize(currentSoldier.thru) || 
                    (r.dueHqda || add90Days(r.thru)) !== (currentSoldier.dueHqda || add90Days(currentSoldier.thru))
                  );
                  const isRaterDiff = !isCurrent && !!currentSoldier && (
                    getRaterNameOnly(r.raterId) !== getRaterNameOnly(currentSoldier.raterId)
                  );
                  const isSeniorRaterDiff = !isCurrent && !!currentSoldier && (
                    getRaterNameOnly(r.seniorRaterId) !== getRaterNameOnly(currentSoldier.seniorRaterId)
                  );
                  const isReviewerDiff = !isCurrent && !!currentSoldier && (
                    getReviewerNameOnly(r.reviewerId) !== getReviewerNameOnly(currentSoldier.reviewerId)
                  );
                  const isSubmissionDiff = !isCurrent && !!currentSoldier && (
                    normalize(r.submissionType || "ANN") !== normalize(currentSoldier.submissionType || "ANN")
                  );

                  const mismatchInfo = getSeniorRaterMismatchInfo(r);
                  const reviewerMismatchInfo = getReviewerMismatchInfo(r);
                  const thruDateClass = getThruDateClass(r.thru);
                  const isPastDue = thruDateClass.includes("rose-100");
                  const isDueSoon = thruDateClass.includes("amber-100");

                  return (
                    <React.Fragment key={r.id}>
                      <tr 
                        className={`group ${
                          thruDateClass 
                            ? `${thruDateClass} ${isPastDue ? "hover:bg-rose-200" : "hover:bg-amber-200"}` 
                            : selectedVersion === "future" 
                              ? `bg-blue-50 hover:bg-blue-100`
                              : selectedVersion === "alternate"
                                ? `bg-emerald-50 hover:bg-emerald-100`
                                : `${isEven ? "bg-slate-50" : "bg-white"} hover:bg-slate-100`
                        }`}
                      >
                      {/* Name */}
                      <td className={`sticky left-0 z-10 group-hover:z-20 px-3 py-2 font-semibold text-slate-900 border-r border-slate-200 relative ${
                        isSeniorNcoNotRating(r) ? "ring-2 ring-rose-500 ring-inset" : ""
                      } ${
                        showGreenLine 
                          ? "after:absolute after:top-0 after:right-0 after:bottom-0 after:w-[3px] after:bg-emerald-500 after:z-[11]" 
                          : ""
                      } ${
                        isPastDue 
                          ? "bg-rose-100 group-hover:bg-rose-200" 
                          : isDueSoon 
                            ? "bg-amber-100 group-hover:bg-amber-200" 
                            : selectedVersion === "future"
                              ? "bg-blue-100 group-hover:bg-blue-200"
                              : selectedVersion === "alternate"
                                ? "bg-emerald-100 group-hover:bg-emerald-200"
                                : `${isEven ? "bg-slate-50" : "bg-white"} group-hover:bg-slate-100`
                      }`}>
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="leading-tight">{r.name}</span>
                              {(() => {
                                const noteCount = allNotes.filter(n => n.soldierName === r.name.trim().toLowerCase()).length;
                                if (noteCount === 0) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveNoteSoldierName(r.name);
                                    }}
                                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer shadow-xs shrink-0"
                                    title={`${noteCount} note${noteCount === 1 ? "" : "s"} present — click to view`}
                                  >
                                    {noteCount}
                                  </button>
                                );
                              })()}
                            </div>
                            {isSeniorNcoNotRating(r) && (
                              <div className="relative group/tooltip flex-shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-pulse cursor-help" />
                                <div className="invisible group-hover/tooltip:visible absolute left-0 z-50 w-64 p-2.5 mt-1 text-xs text-white bg-slate-900 rounded-md shadow-xl border border-slate-700 leading-normal font-normal text-left">
                                  <p className="font-bold text-rose-400 mb-1">Senior NCO Not Rating Anyone</p>
                                  <p>
                                    As a {r.rank}, this Senior NCO is expected to be assigned as a rater in this rating scheme. Currently, they are not rating any Soldier.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                          {(selectedVersion === "current" || selectedVersion === "future") && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleHistory(r.id); }}
                              className={`mt-1.5 flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[8px] uppercase font-bold tracking-tighter transition-all w-fit whitespace-nowrap ${
                                expandedHistoryRecordId === r.id 
                                  ? "bg-slate-800 text-white shadow-sm" 
                                  : selectedVersion === "future"
                                    ? "bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800"
                                    : "bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-slate-800"
                              }`}
                              title={selectedVersion === "current" ? "View Projected / Notes" : "View Current Version Reference"}
                            >
                              <HistoryIcon className="w-2.5 h-2.5" />
                              {selectedVersion === "current" ? "Projected / Notes" : "View Current"}
                              {(() => {
                                const noteCount = allNotes.filter(n => n.soldierName === r.name.trim().toLowerCase()).length;
                                if (noteCount === 0) return null;
                                return (
                                  <span className="ml-0.5 px-1 bg-rose-600 text-white rounded-full text-[8px] font-black leading-tight">
                                    {noteCount}
                                  </span>
                                );
                              })()}
                              {expandedHistoryRecordId === r.id ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          {selectedVersion === "alternate" && !readOnly && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyToProjected(r); }}
                              className="mt-1.5 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[8px] uppercase font-black tracking-wider transition-all w-fit whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 animate-fade-in"
                              title="Copy this soldier's record to the Projected (Future) roster"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              Copy to Projected Roster
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Rank */}
                      <td className={`px-3 py-2 border-r border-slate-200 text-center ${isRankDiff ? "ring-2 ring-yellow-400 ring-inset relative" : ""}`}>
                        <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded">
                          {r.rank}
                        </span>
                      </td>
                      {/* Element */}
                      <td className={`px-3 py-2 text-slate-600 font-medium border-r border-slate-200 ${isElementDiff ? "ring-2 ring-yellow-400 ring-inset relative" : ""}`}>
                        {r.element}
                      </td>
                      {/* MOSC */}
                      <td className={`px-3 py-2 border-r border-slate-200 text-center ${isMoscDiff ? "ring-2 ring-yellow-400 ring-inset relative" : ""}`}>
                        <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[10px] font-bold rounded">
                          {r.dutyMosc}
                        </span>
                      </td>
                      {/* Principal Duty Title */}
                      <td className={`px-3 py-2 border-r border-slate-200 ${isRoleDiff ? "ring-2 ring-yellow-400 ring-inset relative" : ""}`}>
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role}
                        </span>
                      </td>
                      {/* Dates */}
                      <td className={`px-3 py-2 border-r border-slate-200 ${isDatesDiff ? "ring-2 ring-yellow-400 ring-inset relative" : ""}`}>
                        <div className="font-medium font-mono text-slate-600 flex flex-wrap gap-1 items-center leading-tight">
                          <span>{r.from} to</span>
                          <span className="px-1 rounded border border-transparent">
                            {r.thru}
                          </span>
                        </div>
                        <div className="text-[10px] text-red-600 font-bold font-mono">
                          HQDA: {r.dueHqda || add90Days(r.thru)}
                        </div>
                      </td>
                      {/* Rater */}
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-200 ${
                        getTwoRanksAboveRaterWarning(r) || getSameRankRaterWarning(r)
                          ? "ring-2 ring-rose-500 ring-inset relative bg-rose-50/50"
                          : isRaterDiff 
                            ? "ring-2 ring-yellow-400 ring-inset relative" 
                            : ""
                      }`}>
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <div className="font-semibold text-slate-800 leading-tight">
                              {isCurrent && (ncoerInfo.status === "Late" || !!r.priorThru) && r.lateRaterId 
                                ? getRaterName(r.lateRaterId) 
                                : getRaterName(r.raterId)}
                            </div>
                            {isCurrent && (ncoerInfo.status === "Late" || !!r.priorThru) && r.lateRaterId ? (
                               <div className="text-[8px] font-black text-amber-600 uppercase tracking-tighter mt-0.5">Late Rater</div>
                            ) : r.raterId && r.raterEffectiveDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Eff: {r.raterEffectiveDate}
                              </div>
                            )}
                          </div>
                          {(getTwoRanksAboveRaterWarning(r) || getSameRankRaterWarning(r)) && (
                            <div className="relative group/tooltip flex-shrink-0">
                              <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse cursor-help" />
                              <div className="invisible group-hover/tooltip:visible absolute right-0 z-50 w-64 p-2.5 mt-1 text-xs text-white bg-slate-900 rounded-md shadow-xl border border-slate-700 leading-normal text-left">
                                <p className="font-bold text-rose-400 mb-1">Rater Rank Discrepancy</p>
                                <p className="text-[10px] leading-relaxed">
                                  {getTwoRanksAboveRaterWarning(r) || getSameRankRaterWarning(r)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        {(getTwoRanksAboveRaterWarning(r) || getSameRankRaterWarning(r)) && (
                          <div className="text-[9px] text-rose-600 font-semibold leading-tight mt-1 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 max-w-[140px]">
                            {getTwoRanksAboveRaterWarning(r) ? "Rank gap too wide" : "Same Rank Rating"}
                          </div>
                        )}
                      </td>
                      {/* Senior Rater */}
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-200 ${
                        mismatchInfo 
                          ? "ring-2 ring-rose-500 ring-inset relative" 
                          : isSeniorRaterDiff 
                            ? "ring-2 ring-yellow-400 ring-inset relative" 
                            : ""
                      }`}>
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <div className="font-semibold text-slate-800 leading-tight">
                              {isCurrent && (ncoerInfo.status === "Late" || !!r.priorThru) && r.lateSeniorRaterId 
                                ? getRaterName(r.lateSeniorRaterId) 
                                : getRaterName(r.seniorRaterId)}
                            </div>
                            {isCurrent && (ncoerInfo.status === "Late" || !!r.priorThru) && r.lateSeniorRaterId ? (
                              <div className="text-[8px] font-black text-amber-600 uppercase tracking-tighter mt-0.5">Late Senior Rater</div>
                            ) : r.seniorRaterId && r.seniorRaterEffectiveDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Eff: {r.seniorRaterEffectiveDate}
                              </div>
                            )}
                          </div>
                          {mismatchInfo && (
                            <div className="relative group/tooltip flex-shrink-0">
                              <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse cursor-help" />
                              <div className="invisible group-hover/tooltip:visible absolute right-0 z-50 w-64 p-2.5 mt-1 text-xs text-white bg-slate-900 rounded-md shadow-xl border border-slate-700 leading-normal text-left">
                                <p className="font-bold text-rose-400 mb-1">Senior Rater Mismatch</p>
                                <p className="mb-1 italic text-[10px]">
                                  Rater <strong className="text-amber-300">{mismatchInfo.raterName}</strong> is rated by <strong className="text-amber-300">{mismatchInfo.expectedName}</strong>.
                                </p>
                                <p>
                                  Expected Senior Rater: <strong className="text-emerald-400">{mismatchInfo.expectedName}</strong>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        {mismatchInfo && (
                          <div className="text-[9px] text-rose-600 font-semibold leading-tight mt-1 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 max-w-[140px]">
                            Expected: {mismatchInfo.expectedName}
                          </div>
                        )}
                      </td>
                      {/* Reviewer */}
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-200 ${
                        reviewerMismatchInfo 
                          ? "ring-2 ring-purple-500 ring-inset relative" 
                          : isReviewerDiff 
                            ? "ring-2 ring-yellow-400 ring-inset relative" 
                            : ""
                      }`}>
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <div className="font-semibold text-slate-800 leading-tight">{getReviewerName(r.reviewerId)}</div>
                            {r.reviewerId && r.reviewerEffectiveDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Eff: {r.reviewerEffectiveDate}
                              </div>
                            )}
                          </div>
                          {reviewerMismatchInfo && (
                            <div className="relative group/tooltip flex-shrink-0">
                              <HelpCircle className="w-4 h-4 text-purple-500 animate-pulse cursor-help" />
                              <div className="invisible group-hover/tooltip:visible absolute right-0 z-50 w-64 p-2.5 mt-1 text-xs text-white bg-slate-900 rounded-md shadow-xl border border-slate-700 leading-normal text-left text-[11px]">
                                <p className="font-bold text-purple-400 mb-1">SGM Reviewer Required</p>
                                <p className="mb-1 italic">
                                  Senior Rater <strong className="text-amber-300">{reviewerMismatchInfo.seniorRaterName}</strong> is rank MSG.
                                </p>
                                <p>
                                  Expected Reviewer: <strong className="text-emerald-400">{reviewerMismatchInfo.expectedName}</strong>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        {reviewerMismatchInfo && (
                          <div className="text-[9px] text-purple-600 font-semibold leading-tight mt-1 bg-purple-50 border border-purple-100 rounded px-1.5 py-0.5 max-w-[140px]">
                            Expected: {reviewerMismatchInfo.expectedName}
                          </div>
                        )}
                      </td>
                      {/* Submission Type */}
                      <td className={`px-1 py-2 text-slate-700 border-r border-slate-200 text-center ${isSubmissionDiff ? "ring-2 ring-yellow-400 ring-inset relative" : ""}`}>
                        <div className="flex flex-col items-center justify-center">
                          {r.submissionType === "COR" && (r.corNewRaterId || r.corEffectiveDate) ? (
                            <div className="flex flex-col items-center">
                              <span className={`inline-block px-1.5 py-0.5 border font-extrabold font-mono text-[9px] rounded uppercase ${getSubmissionBadgeStyles("COR")}`}>
                                COR
                              </span>
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCorRecord(r);
                                }}
                                className="text-[8px] text-amber-600 font-bold hover:text-amber-800 underline mt-1 uppercase tracking-tighter transition-colors"
                                title="Click to view transition details"
                              >
                                View Details
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-block px-1.5 py-0.5 border font-bold font-mono text-[9px] rounded uppercase ${getSubmissionBadgeStyles(r.submissionType || "ANN")}`}>
                              {r.submissionType || "ANN"}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* NCOER Status */}
                      {selectedVersion === "current" && (
                        <td className={`px-2 py-2 border-r border-slate-200 text-center relative transition-colors ${ncoerInfo.bgClass || "bg-white"}`}>
                          {ncoerRecord.priorThru && (
                            <button 
                              onClick={() => setClearingLateRecord(ncoerRecord)}
                              className="absolute top-0 left-0 z-10 p-0.5 hover:scale-110 transition-transform cursor-pointer group/late"
                              title="Click to manage late status"
                            >
                              <span className="text-[6px] font-black uppercase text-white bg-amber-600 px-1 rounded-br leading-none py-0.5 whitespace-nowrap shadow-sm group-hover/late:bg-amber-500">
                                LATE
                              </span>
                            </button>
                          )}
                          <div className="flex flex-col items-center gap-1 pt-0.5">
                            {/* Status Selector Dropdown or Static Badge */}
                            {(ncoerInfo.isWithin30Days || ncoerRecord.priorThru || ncoerInfo.status) ? (
                              <select
                                value={ncoerInfo.isCustom ? "custom" : ncoerInfo.status}
                                disabled={readOnly || selectedVersion !== "current"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "custom") {
                                    setCustomStatusText(ncoerInfo.isCustom ? ncoerInfo.status : "");
                                    setActiveCustomStatusRecordId(r.id);
                                  } else {
                                    handleStatusChange(ncoerRecord, val);
                                  }
                                }}
                                className={`w-full px-1 py-1 rounded text-[10px] font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors shadow-xs whitespace-nowrap leading-tight h-auto ${ncoerInfo.badgeClass} ${
                                  (readOnly || selectedVersion !== "current") 
                                    ? "opacity-60 cursor-not-allowed" 
                                    : "cursor-pointer"
                                }`}
                              >
                                <option value="" className="bg-white text-slate-800">-- Blank --</option>
                                <option value="Not Submitted to HR" className="bg-white text-slate-800">Not Submitted to HR</option>
                                <option value="Submitted to HR" className="bg-white text-slate-800">Submitted to HR</option>
                                <option value="Reviewing - HR" className="bg-white text-slate-800">Reviewing - HR</option>
                                <option value="Reviewing - CSM" className="bg-white text-slate-800">Reviewing - CSM</option>
                                <option value="Returned for Edits" className="bg-white text-slate-800">Returned for Edits</option>
                                <option value="Out for Signatures" className="bg-white text-slate-800">Out for Signatures</option>
                                <option value="Submitted to HQDA" className="bg-white text-slate-800">Submitted to HQDA</option>
                                <option value="Late" className="bg-white text-slate-800 font-bold text-rose-600">Late</option>
                                <option value="custom" className="bg-white text-slate-800">Other / Custom...</option>
                              </select>
                            ) : ncoerInfo.status ? (
                              <span className={`px-2 py-1 rounded text-[10px] font-extrabold select-none border whitespace-nowrap leading-tight block w-full ${ncoerInfo.badgeClass}`}>
                                {ncoerInfo.status}
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-slate-300 font-semibold text-[10px] select-none">—</span>
                                {!readOnly && selectedVersion === "current" && (
                                  <button
                                    onClick={() => handleOpenManualLate(ncoerRecord)}
                                    className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
                                    title="Add Late NCOER"
                                  >
                                    <Info className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                            {/* Inline input for custom status if active */}
                            {activeCustomStatusRecordId === r.id && (
                              <div className="absolute inset-x-1 top-1 bg-white p-2 rounded shadow-lg border border-slate-200 z-30 flex flex-col gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Custom status text"
                                  value={customStatusText}
                                  onChange={(e) => setCustomStatusText(e.target.value)}
                                  className="px-2 py-1 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 w-full text-slate-800 font-medium"
                                  autoFocus
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setActiveCustomStatusRecordId(null)}
                                    className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] hover:bg-slate-200 transition-colors font-medium"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCustomStatus(ncoerRecord)}
                                    className="px-1.5 py-0.5 bg-amber-500 text-white rounded text-[9px] hover:bg-amber-600 transition-colors font-semibold"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Helper auto-indicator badge */}
                            {/* Auto-set badge removed per user request */}
                        </td>
                      )}
                      {/* Actions */}
                      <td className="px-3 py-2 text-right">
                        {!readOnly ? (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleShiftYear(r)}
                              className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Shift to Next Year"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onEdit(r)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              id={`btn-edit-${r.id}`}
                              title="Edit Record"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDelete(r.id)}
                              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              id={`btn-delete-${r.id}`}
                              title="Delete Profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pr-2 select-none">VIEW ONLY</span>
                        )}
                      </td>
                    </tr>
                    {expandedHistoryRecordId === r.id && (
                      <tr className="bg-slate-100 border-b border-slate-200 animate-in fade-in slide-in-from-top-1 duration-200">
                        <td colSpan={selectedVersion === "current" ? 12 : 11} className="px-0 py-0">
                          <div className="pl-12 pr-6 py-4 bg-slate-100 shadow-inner border-l-4 border-slate-400">
                            {selectedVersion === "current" ? (
                              <>
                                <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-200 pb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-100 rounded-full border border-blue-200">
                                      <Sparkles className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                      <h4 className="text-[12px] font-black text-blue-800 uppercase tracking-widest leading-none">Projected Version</h4>
                                      <p className="text-[9px] text-blue-500 font-bold mt-1 uppercase tracking-tighter italic">Draft model from the "Projected" roster profile</p>
                                    </div>
                                  </div>
                                  <div>
                                    {(() => {
                                      const noteCount = allNotes.filter(n => n.soldierName === r.name.trim().toLowerCase()).length;
                                      return (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveNoteSoldierName(r.name);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-black uppercase tracking-wider transition-all shadow-sm focus:outline-none cursor-pointer"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-amber-700" />
                                          <span>Notes</span>
                                          {noteCount > 0 && (
                                            <span className="px-1.5 py-0.5 text-[9px] bg-amber-600 text-white rounded-full font-sans font-bold leading-none shrink-0 min-w-[15px] text-center">
                                              {noteCount}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                </div>

                            <div className="space-y-6">
                              {/* Projected Version Inclusion */}
                              {(() => {
                                const projected = allRecords.find(pr => 
                                  pr.version === "future" && 
                                  pr.name.trim().toLowerCase() === r.name.trim().toLowerCase()
                                );
                                
                                if (!projected) return (
                                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 text-center">
                                     <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">No Projected Draft found for this soldier</p>
                                     <button 
                                      onClick={() => handleShiftYear(r)}
                                      className="mt-2 text-[10px] font-black text-blue-600 hover:underline uppercase tracking-tight"
                                     >
                                      Create Projected Version
                                     </button>
                                  </div>
                                );
                                
                                return (
                                  <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md ring-1 ring-blue-300">
                                    <div className="bg-blue-100 px-4 py-2 border-b border-blue-200 flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Active Projected Draft</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(projected);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded border border-blue-700 transition-all uppercase tracking-tight shadow-md active:scale-95"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                          Edit Projected Draft
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOverwriteCurrent(r, projected);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black rounded border border-emerald-700 transition-all uppercase tracking-tight shadow-md active:scale-95 ml-1"
                                          title="Overwrite Current Version with these Projected changes"
                                        >
                                          <RefreshCw className="w-3.5 h-3.5" />
                                          Overwrite Current
                                        </button>
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto scrollbar-thin">
                                      <table className="w-full text-left text-[10px] border-collapse">
                                        <thead>
                                          <tr className="bg-blue-100 text-[9px] text-blue-500 font-black uppercase tracking-tighter border-b border-blue-100">
                                            <th className="px-3 py-2 border-r border-blue-100">Name</th>
                                            <th className="px-3 py-2 border-r border-blue-100 text-center">Rank</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Element</th>
                                            <th className="px-3 py-2 border-r border-blue-100 text-center">MOSC</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Duty Title</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Rating Dates</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Rater</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Senior Rater</th>
                                            <th className="px-3 py-2 text-center">Reviewer</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          <tr className="bg-blue-50 hover:bg-blue-100 transition-colors">
                                            <td className={`px-3 py-3 border-r border-blue-100 font-bold text-slate-800 ${getDiffClass(r, projected, 'name')}`}>
                                              {projected.name}
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 text-center ${getDiffClass(r, projected, 'rank')}`}>
                                              <span className="px-1.5 py-0.5 bg-white rounded border border-blue-200 font-mono font-bold text-blue-700">{projected.rank}</span>
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 text-slate-600 font-medium ${getDiffClass(r, projected, 'element')}`}>
                                              {projected.element}
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 text-center ${getDiffClass(r, projected, 'dutyMosc')}`}>
                                              <span className="px-1.5 py-0.5 bg-amber-50 rounded border border-amber-200 text-amber-800 font-mono font-bold">{projected.dutyMosc}</span>
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 ${getDiffClass(r, projected, 'role')}`}>
                                              <span className="text-[10px] font-medium text-slate-700">{projected.role}</span>
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 font-mono text-slate-500 ${getDiffClass(r, projected, 'from') || getDiffClass(r, projected, 'thru')}`}>
                                              <div className="flex flex-col leading-tight">
                                                <span>F: {projected.from}</span>
                                                <span>T: {projected.thru}</span>
                                              </div>
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 ${getDiffClass(r, projected, 'raterId') || getDiffClass(r, projected, 'raterEffectiveDate')}`}>
                                              <div className="font-bold text-slate-700">
                                                {(projected.ncoerStatus === "Late" || !!projected.priorThru) && projected.lateRaterId 
                                                  ? getRaterName(projected.lateRaterId) 
                                                  : (projected.raterId ? getRaterName(projected.raterId) : "Unassigned")}
                                              </div>
                                              {(projected.ncoerStatus === "Late" || !!projected.priorThru) && projected.lateRaterId ? (
                                                <div className="text-[8px] font-black text-amber-600 uppercase tracking-tighter mt-0.5">Late Rater</div>
                                              ) : projected.raterEffectiveDate && (
                                                <div className="text-[9px] font-mono text-slate-500 mt-0.5">Eff: {projected.raterEffectiveDate}</div>
                                              )}
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 ${getDiffClass(r, projected, 'seniorRaterId') || getDiffClass(r, projected, 'seniorRaterEffectiveDate')}`}>
                                              <div className="font-bold text-slate-700">
                                                {(projected.ncoerStatus === "Late" || !!projected.priorThru) && projected.lateSeniorRaterId 
                                                  ? getRaterName(projected.lateSeniorRaterId) 
                                                  : (projected.seniorRaterId ? getRaterName(projected.seniorRaterId) : "Unassigned")}
                                              </div>
                                              {(projected.ncoerStatus === "Late" || !!projected.priorThru) && projected.lateSeniorRaterId ? (
                                                <div className="text-[8px] font-black text-amber-600 uppercase tracking-tighter mt-0.5">Late Senior Rater</div>
                                              ) : projected.seniorRaterEffectiveDate && (
                                                <div className="text-[9px] font-mono text-slate-500 mt-0.5">Eff: {projected.seniorRaterEffectiveDate}</div>
                                              )}
                                            </td>
                                            <td className={`px-3 py-3 ${getDiffClass(r, projected, 'reviewerId') || getDiffClass(r, projected, 'reviewerEffectiveDate')}`}>
                                              <div className="font-bold text-slate-700">{projected.reviewerId ? getRaterName(projected.reviewerId) : "Unassigned"}</div>
                                              {projected.reviewerEffectiveDate && (
                                                <div className="text-[9px] font-mono text-slate-500 mt-0.5">Eff: {projected.reviewerEffectiveDate}</div>
                                              )}
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Snapshot History Section */}
                              <div className="pt-4 border-t border-slate-200">
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="p-1.5 bg-slate-200 rounded-full">
                                    <HistoryIcon className="w-4 h-4 text-slate-600" />
                                  </div>
                                  <div>
                                    <h4 className="text-[12px] font-bold text-slate-800 uppercase tracking-widest leading-none">Record Change History</h4>
                                    <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tighter italic">Verified historical snapshots for <span className="text-slate-700 font-bold">{r.name}</span></p>
                                  </div>
                                  {isHistoryLoading && (
                                    <div className="ml-4 flex items-center gap-2 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                                      <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" />
                                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Syncing...</span>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-4">
                                  {recordHistory.length === 0 ? (
                                    <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-8 text-center">
                                       <HistoryIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                       <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic leading-tight">
                                          No historical snapshots recorded yet.<br/>
                                          Snapshots are created when records are updated.
                                       </p>
                                    </div>
                                  ) : recordHistory.map((hist, hIdx) => (
                                    <div key={hist.id || hist.historyId || `hist-${hIdx}`} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md">
                                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-2.5 h-2.5 rounded-full ${hIdx === 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}></div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm mr-1">
                                          <CalendarPlus className="w-3 h-3 text-slate-400" />
                                          <span className="text-[10px] font-mono font-bold text-slate-600">
                                            {formatSnapshotDate(hist.snapshotAt)}
                                          </span>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${hIdx === 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                          {hIdx === 0 ? "Latest Snapshot" : `Previous Version (${recordHistory.length - hIdx})`}
                                        </span>
                                        {hist.isRestoration && (
                                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase tracking-tighter border border-amber-200">
                                            Restoration Point
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          setHistoryConfirm({
                                            isOpen: true,
                                            title: "Restore History Snapshot",
                                            message: "Restore this record to this historical state? The current version will be saved to history first.",
                                            confirmLabel: "RESTORE SNAPSHOT",
                                            cancelLabel: "CANCEL",
                                            variant: "question",
                                            onConfirm: async () => {
                                              try {
                                                await restoreRecordHistory(r.id, hist);
                                                setHistoryConfirm({
                                                  isOpen: true,
                                                  title: "Success",
                                                  message: "Version restored successfully.",
                                                  confirmLabel: "OK",
                                                  cancelLabel: "Close",
                                                  variant: "info",
                                                  onConfirm: () => setHistoryConfirm(null)
                                                });
                                              } catch (err: any) {
                                                console.error("Failed to restore history:", err);
                                                setHistoryConfirm({
                                                  isOpen: true,
                                                  title: "Restoration Failed",
                                                  message: `Restoration failed: ${err.message}`,
                                                  confirmLabel: "OK",
                                                  cancelLabel: "Close",
                                                  variant: "danger",
                                                  onConfirm: () => setHistoryConfirm(null)
                                                });
                                              }
                                            }
                                          });
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 text-[10px] font-bold rounded border border-emerald-200 transition-all uppercase tracking-tight shadow-sm cursor-pointer hover:border-emerald-300"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Restore
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          setHistoryConfirm({
                                            isOpen: true,
                                            title: "Delete History Snapshot",
                                            message: "PERMANENTLY delete this history snapshot? This cannot be undone.",
                                            confirmLabel: "DELETE SNAPSHOT",
                                            cancelLabel: "CANCEL",
                                            variant: "danger",
                                            onConfirm: async () => {
                                              try {
                                                const hId = hist.id || (hist as any).historyId;
                                                if (!hId) throw new Error("History ID not found");
                                                await deleteHistoryRecord(r.id, hId);
                                                setHistoryConfirm({
                                                  isOpen: true,
                                                  title: "Success",
                                                  message: "Snapshot deleted successfully.",
                                                  confirmLabel: "OK",
                                                  cancelLabel: "Close",
                                                  variant: "info",
                                                  onConfirm: () => setHistoryConfirm(null)
                                                });
                                              } catch (err: any) {
                                                console.error("Failed to delete history snapshot:", err);
                                                setHistoryConfirm({
                                                  isOpen: true,
                                                  title: "Deletion Failed",
                                                  message: `Deletion failed: ${err.message}`,
                                                  confirmLabel: "OK",
                                                  cancelLabel: "Close",
                                                  variant: "danger",
                                                  onConfirm: () => setHistoryConfirm(null)
                                                });
                                              }
                                            }
                                          });
                                        }}
                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                        title="Delete Snapshot"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto scrollbar-thin">
                                    <table className="w-full text-left text-[10px] border-collapse bg-slate-50/10">
                                      <thead>
                                        <tr className="bg-slate-50/50 text-[9px] text-slate-400 font-bold uppercase tracking-tighter border-b border-slate-100">
                                          <th className="px-3 py-2 border-r border-slate-100">Name</th>
                                          <th className="px-3 py-2 border-r border-slate-100 text-center">Rank</th>
                                          <th className="px-3 py-2 border-r border-slate-100">Element</th>
                                          <th className="px-3 py-2 border-r border-slate-100 text-center">MOSC</th>
                                          <th className="px-3 py-2 border-r border-slate-100">Duty Title</th>
                                          <th className="px-3 py-2 border-r border-slate-100">Rating Dates</th>
                                          <th className="px-3 py-2 border-r border-slate-100">Rater</th>
                                          <th className="px-3 py-2 border-r border-slate-100">Senior Rater</th>
                                          <th className="px-3 py-2 border-r border-slate-100">Reviewer</th>
                                          <th className="px-3 py-2 text-center">NCOER Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr className="hover:bg-slate-50/50 transition-colors">
                                          <td className={`px-3 py-3 border-r border-slate-100 font-bold text-slate-800 ${getDiffClass(r, hist, 'name')}`}>
                                            {hist.name}
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 text-center ${getDiffClass(r, hist, 'rank')}`}>
                                            <span className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono font-bold">{hist.rank}</span>
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 text-slate-600 font-medium ${getDiffClass(r, hist, 'element')}`}>
                                            {hist.element}
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 text-center ${getDiffClass(r, hist, 'dutyMosc')}`}>
                                            <span className="px-1.5 py-0.5 bg-amber-50 rounded border border-amber-200 text-amber-800 font-mono font-bold">{hist.dutyMosc}</span>
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, hist, 'role')}`}>
                                            <span className="text-[10px] font-medium text-slate-700">{hist.role}</span>
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 font-mono text-slate-500 ${getDiffClass(r, hist, 'from') || getDiffClass(r, hist, 'thru')}`}>
                                            <div className="flex flex-col leading-tight">
                                              <span>F: {hist.from}</span>
                                              <span>T: {hist.thru}</span>
                                            </div>
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, hist, 'raterId')}`}>
                                            <div className="font-bold text-slate-700">{hist.raterId ? getRaterName(hist.raterId) : "Unassigned"}</div>
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, hist, 'seniorRaterId')}`}>
                                            <div className="font-bold text-slate-700">{hist.seniorRaterId ? getRaterName(hist.seniorRaterId) : "Unassigned"}</div>
                                          </td>
                                          <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, hist, 'reviewerId')}`}>
                                            <div className="font-bold text-slate-700">{hist.reviewerId ? getRaterName(hist.reviewerId) : "Unassigned"}</div>
                                          </td>
                                          <td className={`px-3 py-3 text-center ${getDiffClass(r, hist, 'ncoerStatus')}`}>
                                            {hist.ncoerStatus ? (
                                              <span className="px-2 py-0.5 bg-slate-800 text-white rounded text-[9px] font-bold uppercase">{hist.ncoerStatus}</span>
                                            ) : (
                                              <span className="text-slate-300 italic">None</span>
                                            )}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                                <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-200 pb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-slate-200 rounded-full border border-slate-300">
                                      <HistoryIcon className="w-4 h-4 text-slate-600" />
                                    </div>
                                    <div>
                                      <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest leading-none">Current Version Reference</h4>
                                      <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-tighter italic">Source data from the "Current" roster profile</p>
                                    </div>
                                  </div>
                                  <div>
                                    {(() => {
                                      const noteCount = allNotes.filter(n => n.soldierName === r.name.trim().toLowerCase()).length;
                                      return (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveNoteSoldierName(r.name);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-black uppercase tracking-wider transition-all shadow-sm focus:outline-none cursor-pointer"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-amber-700" />
                                          <span>Notes</span>
                                          {noteCount > 0 && (
                                            <span className="px-1.5 py-0.5 text-[9px] bg-amber-600 text-white rounded-full font-sans font-bold leading-none shrink-0 min-w-[15px] text-center">
                                              {noteCount}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                </div>

                                <div className="space-y-6">
                                  {(() => {
                                    const current = allRecords?.find(cr => 
                                      (cr.version === "current" || !cr.version) && 
                                      cr.name.trim().toLowerCase() === r.name.trim().toLowerCase()
                                    );
                                    
                                    if (!current) return (
                                      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 text-center">
                                         <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">No matching record found in Current roster</p>
                                      </div>
                                    );
                                    
                                    return (
                                      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md ring-1 ring-slate-200">
                                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <div className="w-2.5 h-2.5 rounded-full bg-slate-400 animate-pulse"></div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">Live Current Version</span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit(current);
                                              }}
                                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-black rounded border border-slate-900 transition-all uppercase tracking-tight shadow-md active:scale-95"
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                              Edit Current Record
                                            </button>
                                          </div>
                                        </div>
                                        <div className="overflow-x-auto scrollbar-thin">
                                          <table className="w-full text-left text-[10px] border-collapse">
                                            <thead>
                                              <tr className="bg-slate-50 text-[9px] text-slate-400 font-black uppercase tracking-tighter border-b border-slate-100">
                                                <th className="px-3 py-2 border-r border-slate-100">Name</th>
                                                <th className="px-3 py-2 border-r border-slate-100 text-center">Rank</th>
                                                <th className="px-3 py-2 border-r border-slate-100">Element</th>
                                                <th className="px-3 py-2 border-r border-slate-100 text-center">MOSC</th>
                                                <th className="px-3 py-2 border-r border-slate-100">Duty Title</th>
                                                <th className="px-3 py-2 border-r border-slate-100">Rating Dates</th>
                                                <th className="px-3 py-2 border-r border-slate-100">Rater</th>
                                                <th className="px-3 py-2 border-r border-slate-100">Senior Rater</th>
                                                <th className="px-3 py-2 text-center">Reviewer</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              <tr className="bg-white hover:bg-slate-50 transition-colors">
                                                <td className={`px-3 py-3 border-r border-slate-100 font-bold text-slate-800 ${getDiffClass(r, current, 'name')}`}>
                                                  {current.name}
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 text-center ${getDiffClass(r, current, 'rank')}`}>
                                                  <span className="px-1.5 py-0.5 bg-slate-50 rounded border border-slate-200 font-mono font-bold text-slate-700">{current.rank}</span>
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 text-slate-600 font-medium ${getDiffClass(r, current, 'element')}`}>
                                                  {current.element}
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 text-center ${getDiffClass(r, current, 'dutyMosc')}`}>
                                                  <span className="px-1.5 py-0.5 bg-amber-50 rounded border border-amber-200 text-amber-800 font-mono font-bold">{current.dutyMosc}</span>
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, current, 'role')}`}>
                                                  <span className="text-[10px] font-medium text-slate-700">{current.role}</span>
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 font-mono text-slate-500 ${getDiffClass(r, current, 'from') || getDiffClass(r, current, 'thru')}`}>
                                                  <div className="flex flex-col leading-tight">
                                                    <span>F: {current.from}</span>
                                                    <span>T: {current.thru}</span>
                                                  </div>
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, current, 'raterId') || getDiffClass(r, current, 'raterEffectiveDate')}`}>
                                                  <div className="font-bold text-slate-700">{getRaterName(current.raterId)}</div>
                                                  {current.raterEffectiveDate && (
                                                    <div className="text-[9px] font-mono text-slate-500 mt-0.5">Eff: {current.raterEffectiveDate}</div>
                                                  )}
                                                </td>
                                                <td className={`px-3 py-3 border-r border-slate-100 ${getDiffClass(r, current, 'seniorRaterId') || getDiffClass(r, current, 'seniorRaterEffectiveDate')}`}>
                                                  <div className="font-bold text-slate-700">{getRaterName(current.seniorRaterId)}</div>
                                                  {current.seniorRaterEffectiveDate && (
                                                    <div className="text-[9px] font-mono text-slate-500 mt-0.5">Eff: {current.seniorRaterEffectiveDate}</div>
                                                  )}
                                                </td>
                                                <td className={`px-3 py-3 ${getDiffClass(r, current, 'reviewerId')}`}>
                                                  <div className="font-bold text-slate-700">{getReviewerName(current.reviewerId)}</div>
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </>
                            )}
                          </div>
                      </td>
                    </tr>
                    )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {importPending && (
        <div className="fixed inset-0 bg-slate-900/65 flex justify-center items-center p-4 z-[100] animate-fade-in">
          <div className="bg-white border-2 border-slate-300 rounded shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-xs">★</span>
                <span className="text-xs font-bold uppercase tracking-wider font-mono">CSV Import Options</span>
              </div>
              <button 
                onClick={() => setImportPending(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 flex items-start gap-4">
              <div className="p-2 bg-slate-50 rounded border border-slate-100 shrink-0">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Spreadsheet Data Loaded
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Found <strong className="text-slate-800 font-bold">{importPending.length} soldiers</strong>. How would you like to apply this data to your roster?
                </p>
              </div>
            </div>

            {selectedVersion !== "alternate" && (() => {
              const duplicatesList = getDuplicateNames(importPending);
              if (duplicatesList.length === 0) return null;
              return (
                <div className="mx-5 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-col gap-2 animate-fade-in">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[11px] font-bold text-amber-950 uppercase tracking-tight">Duplicate Names Detected</h4>
                      <p className="text-[10px] text-amber-800 font-medium leading-relaxed mt-0.5">
                        We found duplicate entries for: <span className="font-bold">{duplicatesList.join(", ")}</span>.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer mt-1 select-none">
                    <input
                      type="checkbox"
                      checked={redirectDuplicates}
                      onChange={(e) => setRedirectDuplicates(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-700 leading-tight">
                      Put duplicate names with later THRU dates into "Alternate" roster
                    </span>
                  </label>
                </div>
              );
            })()}

            <div className="bg-slate-50 border-t border-slate-100 p-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  const processed = processImportRecords(importPending, true, redirectDuplicates);
                  onImportCSV(processed, true);
                  setImportPending(null);
                }}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                id="btn-import-append"
              >
                <Plus className="w-4 h-4" />
                APPEND TO CURRENT ROSTER ({records.length} soldiers)
              </button>
              
              <button
                onClick={() => {
                  const processed = processImportRecords(importPending, false, redirectDuplicates);
                  onImportCSV(processed, false);
                  setImportPending(null);
                }}
                className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                id="btn-import-overwrite"
              >
                <RefreshCw className="w-4 h-4" />
                OVERWRITE ROSTER COMPLETELY
              </button>
              
              <button
                onClick={() => setImportPending(null)}
                className="w-full px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded transition-all mt-1"
                id="btn-import-cancel"
              >
                CANCEL IMPORT
              </button>
            </div>
          </div>
        </div>
      )}

      {projectedCopyDuplicateTarget && (
        <div className="fixed inset-0 bg-slate-900/65 flex justify-center items-center p-4 z-[250] animate-fade-in print:hidden">
          <div className="bg-white border-2 border-slate-300 rounded shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-xs">★</span>
                <span className="text-xs font-bold uppercase tracking-wider font-mono">
                  Projected Duplicate Check
                </span>
              </div>
              <button 
                onClick={() => {
                  setProjectedCopySourceRecord(null);
                  setProjectedCopyDuplicateTarget(null);
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content body */}
            <div className="p-5 flex items-start gap-4">
              <div className="p-2 bg-slate-50 rounded border border-slate-100 shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Soldier already in Projected Roster
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  A record for <strong className="text-slate-800 font-bold">{projectedCopyDuplicateTarget.name}</strong> already exists in the <strong className="text-blue-600 font-bold">Projected (Future)</strong> roster.
                </p>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  Would you like to overwrite the existing projected record with the alternate record, or add it as a duplicate?
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setProjectedCopySourceRecord(null);
                  setProjectedCopyDuplicateTarget(null);
                }}
                className="px-3.5 py-1.5 border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded text-xs font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeCopyToProjected(projectedCopySourceRecord!, null, true)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Add as Duplicate
              </button>
              <button
                type="button"
                onClick={() => executeCopyToProjected(projectedCopySourceRecord!, projectedCopyDuplicateTarget!, false)}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                Overwrite Existing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift to Next Year Prompt Modal */}
      {lateShiftPromptRecord && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-amber-100 rounded-full">
                  <CalendarPlus className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="font-black uppercase tracking-tight text-sm text-slate-800">Shift to Next Year</h3>
              </div>
              
              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1.5 ml-1">Current Record</p>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded">
                    {lateShiftPromptRecord.rank}
                  </span>
                  <p className="font-bold text-slate-900 text-sm leading-tight">{lateShiftPromptRecord.name}</p>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">{lateShiftPromptRecord.role}</p>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
                <div className="flex gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 font-medium leading-relaxed">
                    Has the NCOER for the current rating period ({lateShiftPromptRecord.from} to {lateShiftPromptRecord.thru}) been <strong className="font-black text-amber-600 underline">SUBMITTED TO HQDA</strong>?
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => confirmShiftYear(lateShiftPromptRecord, false)}
                  className="w-full py-2.5 bg-white border-2 border-amber-500 text-amber-600 hover:bg-amber-50 font-black text-[11px] rounded-lg transition-all uppercase tracking-widest shadow-sm flex items-center justify-center gap-2"
                >
                  NO, ADD LATE BADGE & SHIFT
                </button>
                <button
                  onClick={() => confirmShiftYear(lateShiftPromptRecord, true)}
                  className="w-full py-2.5 bg-amber-600 text-white hover:bg-amber-700 font-black text-[11px] rounded-lg transition-all uppercase tracking-widest shadow-lg flex items-center justify-center gap-2"
                >
                  YES, RESET STATUS & SHIFT
                </button>
                <button
                  onClick={() => setLateShiftPromptRecord(null)}
                  className="w-full py-2 bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-[10px] rounded-lg transition-all uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite Decision Modal */}
      {overwriteLateDecision && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
            {overwriteDecisionView === "choice" ? (
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3.5 bg-blue-100 rounded-2xl">
                    <RefreshCw className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-lg text-slate-800 leading-none">Incomplete NCOER</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Action Required for Overwrite</p>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    The current record for <strong className="text-slate-900">{overwriteLateDecision.current.name}</strong> is still <span className="font-bold text-amber-600 italic">Incomplete</span>.
                  </p>
                  <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed italic">
                    Would you like to move the current status to <strong className="text-slate-700">Late Mode</strong> (keeping historical data) or <strong className="text-slate-700">Reset Status</strong> and continue with the overwrite?
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => setOverwriteDecisionView("late-mode")}
                    className="group relative flex items-center gap-3 w-full p-4 bg-amber-50 hover:bg-amber-600 text-amber-900 hover:text-white rounded-xl border border-amber-200 transition-all duration-300 text-left shadow-sm hover:shadow-md"
                  >
                     <div className="p-2 bg-white group-hover:bg-amber-500 rounded-lg shadow-sm transition-colors">
                       <AlertTriangle className="w-5 h-5 text-amber-600 group-hover:text-white" />
                     </div>
                     <div className="flex-1">
                       <p className="text-xs font-black uppercase tracking-tight">Enable Late Mode</p>
                       <p className="text-[10px] opacity-70 font-medium">Keep historical data as a "Late" entry</p>
                     </div>
                     <ChevronRight className="w-4 h-4 ml-auto opacity-40 group-hover:opacity-100" />
                  </button>

                  <button
                    onClick={() => {
                      performOverwrite(overwriteLateDecision.current, overwriteLateDecision.projected, { ncoerStatus: "" });
                      setOverwriteLateDecision(null);
                    }}
                    className="group relative flex items-center gap-3 w-full p-4 bg-slate-50 hover:bg-slate-800 text-slate-700 hover:text-white rounded-xl border border-slate-200 transition-all duration-300 text-left shadow-sm hover:shadow-md"
                  >
                     <div className="p-2 bg-white group-hover:bg-slate-700 rounded-lg shadow-sm transition-colors">
                       <RotateCcw className="w-5 h-5 text-slate-600 group-hover:text-white" />
                     </div>
                     <div className="flex-1">
                       <p className="text-xs font-black uppercase tracking-tight">Reset Status</p>
                       <p className="text-[10px] opacity-70 font-medium">Clear status and overwrite current version</p>
                     </div>
                     <ChevronRight className="w-4 h-4 ml-auto opacity-40 group-hover:opacity-100" />
                  </button>

                  <button
                    onClick={() => setOverwriteLateDecision(null)}
                    className="w-full py-4 text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-[0.2em] transition-colors mt-2"
                  >
                    Cancel Operation
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3.5 bg-amber-100 rounded-2xl">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-lg text-slate-800 leading-none">Late Mode Setup</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Define Historical Context</p>
                  </div>
                </div>

                <div className="space-y-5 mb-8">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Historical Thru Date</label>
                    <input
                      type="date"
                      value={manualLateThru}
                      onChange={(e) => setManualLateThru(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
                    />
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Historical Rater</label>
                      <select
                        value={manualLateRaterId}
                        onChange={(e) => setManualLateRaterId(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
                      >
                        <option value="">-- Select Rater --</option>
                        {soldierOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Historical Senior Rater</label>
                      <select
                        value={manualLateSeniorRaterId}
                        onChange={(e) => setManualLateSeniorRaterId(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
                      >
                        <option value="">-- Select SR --</option>
                        {soldierOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">HQDA Due</p>
                      <p className="text-xs font-mono font-bold text-rose-600 mt-0.5">
                        {manualLateThru ? add90Days(manualLateThru) : "—"}
                      </p>
                    </div>
                    <RefreshCw className="w-4 h-4 text-slate-300" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setOverwriteDecisionView("choice")}
                    className="flex-1 py-3 bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-[10px] rounded-xl transition-all uppercase tracking-widest"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      performOverwrite(overwriteLateDecision.current, overwriteLateDecision.projected, {
                        priorThru: manualLateThru,
                        priorDueHqda: add90Days(manualLateThru),
                        lateRaterId: manualLateRaterId,
                        lateSeniorRaterId: manualLateSeniorRaterId,
                        ncoerStatus: overwriteLateDecision.current.ncoerStatus || "Not Submitted to HR"
                      });
                      setOverwriteLateDecision(null);
                    }}
                    disabled={!manualLateThru}
                    className="flex-2 py-3 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-black text-[10px] rounded-xl transition-all uppercase tracking-widest shadow-md"
                  >
                    Confirm Late Mode Overwrite
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report Preview Modal */}
      {isShowingReportPreview && <ReportPreviewModal />}

      {/* Batch Promotion Summary Modal */}
      {isShowingBatchPromoteSummary && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="p-8">
              <div className="flex items-center gap-5 mb-8">
                <div className="p-4 bg-amber-100 rounded-2xl shadow-sm">
                  <AlertTriangle className="w-8 h-8 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black uppercase tracking-tight text-2xl text-slate-900 leading-none">Incomplete NCOERs Detected</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Required Action Before Version Promotion</p>
                </div>
              </div>

              <div className="space-y-6 mb-8">
                <p className="text-sm text-slate-600 leading-relaxed">
                  You are promoting the <strong className="text-slate-900 uppercase font-black">{batchPromoteVersion}</strong> version to Current. 
                  However, we detected <strong className="text-rose-600 font-black">{batchPromoteIncomplete.length}</strong> Soldiers with <span className="font-bold text-rose-600">Incomplete & Past-Due</span> NCOERs in the current roster.
                </p>

                <div className="max-h-48 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {batchPromoteIncomplete.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-slate-200 text-[10px] font-black text-slate-500 shadow-sm">
                          {r.rank}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800 leading-none">{r.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">{r.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Past Due</p>
                        <p className="text-[10px] font-mono font-bold text-slate-400">{r.thru}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 bg-amber-50/50 p-4 rounded-2xl border border-amber-100 leading-relaxed italic">
                  Would you like to move these past-due records to <strong className="text-slate-700">Late Mode</strong> individually to preserve their historical context, or <strong className="text-slate-700">Clear All Statuses</strong> and proceed with the full overwrite?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setBatchLateSetupIndex(0);
                    setIsShowingBatchPromoteSummary(false);
                    // Initialize first setup
                    const first = batchPromoteIncomplete[0];
                    setManualLateRaterId(first.raterId || "");
                    setManualLateSeniorRaterId(first.seniorRaterId || "");
                    try {
                      const d = new Date(first.thru + "T12:00:00");
                      setManualLateThru(d.toISOString().split('T')[0]);
                    } catch (e) {
                      setManualLateThru("");
                    }
                  }}
                  className="group flex flex-col items-center justify-center p-5 bg-white border-2 border-amber-500 hover:bg-amber-500 text-amber-600 hover:text-white rounded-2xl transition-all duration-300 shadow-sm hover:shadow-lg"
                >
                  <AlertCircle className="w-6 h-6 mb-2" />
                  <span className="text-xs font-black uppercase tracking-tight">Setup Late Mode</span>
                  <span className="text-[9px] opacity-70 font-bold mt-1">Configure each individually</span>
                </button>

                <button
                  onClick={() => {
                    setHistoryConfirm({
                      isOpen: true,
                      title: "Confirm Batch Reset & Promotion",
                      message: `This will reset the NCOER status for ${batchPromoteIncomplete.length} Soldiers and promote the ${batchPromoteVersion?.toUpperCase()} version. Are you sure?`,
                      confirmLabel: "RESET AND PROMOTE",
                      cancelLabel: "CANCEL",
                      variant: "warning",
                      onConfirm: () => {
                        // First reset them (local optimization, parent will overwrite anyway)
                        batchPromoteIncomplete.forEach(r => {
                          onUpdateRecord({ ...r, ncoerStatus: "" });
                        });
                        onPromoteVersion?.(batchPromoteVersion!);
                        setIsShowingBatchPromoteSummary(false);
                        setBatchPromoteIncomplete([]);
                        setBatchPromoteVersion(null);
                        setHistoryConfirm(null);
                      }
                    });
                  }}
                  className="group flex flex-col items-center justify-center p-5 bg-white border-2 border-slate-800 hover:bg-slate-800 text-slate-800 hover:text-white rounded-2xl transition-all duration-300 shadow-sm hover:shadow-lg"
                >
                  <RotateCcw className="w-6 h-6 mb-2" />
                  <span className="text-xs font-black uppercase tracking-tight">Reset All Status</span>
                  <span className="text-[9px] opacity-70 font-bold mt-1">Direct overwrite (No history)</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setIsShowingBatchPromoteSummary(false);
                  setBatchPromoteIncomplete([]);
                  setBatchPromoteVersion(null);
                }}
                className="w-full mt-6 py-2 text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] transition-colors"
              >
                Cancel Entire Operation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sequential Late Mode Setup Modal for Batch */}
      {batchLateSetupIndex >= 0 && batchLateSetupIndex < batchPromoteIncomplete.length && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 relative">
            <button 
              onClick={() => setBatchLateSetupIndex(-1)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-2xl">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-lg text-slate-900 leading-none">Batch Late Mode Setup</h3>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                      Soldier {batchLateSetupIndex + 1} of {batchPromoteIncomplete.length}
                      <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-pulse" />
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Progress</p>
                  <div className="w-24 h-2 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-500" 
                      style={{ width: `${((batchLateSetupIndex + 1) / batchPromoteIncomplete.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
                 <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm text-lg font-black text-slate-800">
                      {batchPromoteIncomplete[batchLateSetupIndex].rank}
                    </div>
                    <div>
                      <p className="text-xl font-black text-slate-900 leading-none">{batchPromoteIncomplete[batchLateSetupIndex].name}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1.5">{batchPromoteIncomplete[batchLateSetupIndex].role}</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2.5 ml-1">Historical Thru Date</label>
                      <input
                        type="date"
                        value={manualLateThru}
                        onChange={(e) => setManualLateThru(e.target.value)}
                        className="w-full px-5 py-4 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2.5 ml-1">Historical Rater</label>
                        <select
                          value={manualLateRaterId}
                          onChange={(e) => setManualLateRaterId(e.target.value)}
                          className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
                        >
                          <option value="">-- Select Rater --</option>
                          {soldierOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2.5 ml-1">Historical SR</label>
                        <select
                          value={manualLateSeniorRaterId}
                          onChange={(e) => setManualLateSeniorRaterId(e.target.value)}
                          className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
                        >
                          <option value="">-- Select SR --</option>
                          {soldierOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                 </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    if (batchLateSetupIndex === 0) {
                       setBatchLateSetupIndex(-1);
                       setIsShowingBatchPromoteSummary(true);
                    } else {
                       const prevIdx = batchLateSetupIndex - 1;
                       const prev = batchPromoteIncomplete[prevIdx];
                       setBatchLateSetupIndex(prevIdx);
                       setManualLateRaterId(prev.lateRaterId || prev.raterId || "");
                       setManualLateSeniorRaterId(prev.lateSeniorRaterId || prev.seniorRaterId || "");
                       setManualLateThru(prev.priorThru || "");
                    }
                  }}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 hover:bg-slate-200 font-black text-[10px] rounded-2xl transition-all uppercase tracking-widest"
                >
                  {batchLateSetupIndex === 0 ? "Back to Summary" : "Previous"}
                </button>
                <button
                  onClick={() => {
                    const record = batchPromoteIncomplete[batchLateSetupIndex];
                    // Update the record in the temporary array
                    const updatedRecord = {
                      ...record,
                      priorThru: manualLateThru,
                      priorDueHqda: add90Days(manualLateThru),
                      lateRaterId: manualLateRaterId,
                      lateSeniorRaterId: manualLateSeniorRaterId,
                      ncoerStatus: record.ncoerStatus || "Not Submitted to HR"
                    };
                    
                    const nextQueue = [...batchPromoteIncomplete];
                    nextQueue[batchLateSetupIndex] = updatedRecord;
                    setBatchPromoteIncomplete(nextQueue);

                    if (batchLateSetupIndex === batchPromoteIncomplete.length - 1) {
                      // Final Finish
                      setHistoryConfirm({
                        isOpen: true,
                        title: "Complete Promotion",
                        message: `All ${batchPromoteIncomplete.length} records configured. Proceed with promoting the ${batchPromoteVersion?.toUpperCase()} version?`,
                        confirmLabel: "FINISH AND PROMOTE",
                        cancelLabel: "CANCEL",
                        variant: "question",
                        onConfirm: () => {
                          // Apply all updates first
                          nextQueue.forEach(r => onUpdateRecord(r));
                          onPromoteVersion?.(batchPromoteVersion!);
                          setBatchLateSetupIndex(-1);
                          setBatchPromoteIncomplete([]);
                          setBatchPromoteVersion(null);
                          setHistoryConfirm(null);
                        }
                      });
                    } else {
                      // Move to next
                      const nextIdx = batchLateSetupIndex + 1;
                      const next = batchPromoteIncomplete[nextIdx];
                      setBatchLateSetupIndex(nextIdx);
                      setManualLateRaterId(next.raterId || "");
                      setManualLateSeniorRaterId(next.seniorRaterId || "");
                      try {
                        const d = new Date(next.thru + "T12:00:00");
                        setManualLateThru(d.toISOString().split('T')[0]);
                      } catch (e) {
                        setManualLateThru("");
                      }
                    }
                  }}
                  disabled={!manualLateThru}
                  className="flex-2 py-4 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-black text-[10px] rounded-2xl transition-all uppercase tracking-widest shadow-xl shadow-amber-200"
                >
                  {batchLateSetupIndex === batchPromoteIncomplete.length - 1 ? "Complete Setup & Promote" : "Next Soldier"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Late NCOER Modal */}
      {manualLateRecord && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 relative">
            <button 
              onClick={() => setManualLateRecord(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-amber-100 rounded-full">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="font-black uppercase tracking-tight text-sm text-slate-800">Add Late NCOER</h3>
              </div>
              
              <p className="text-xs text-slate-600 mb-6 leading-relaxed font-medium">
                Enter the <strong className="font-bold text-slate-900 underline">THRU DATE</strong> for the late NCOER. The HQDA due date will be automatically calculated (+90 days).
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Historical Thru Date</label>
                  <input
                    type="date"
                    value={manualLateThru}
                    onChange={(e) => setManualLateThru(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Historical Rater</label>
                    <select
                      value={manualLateRaterId}
                      onChange={(e) => setManualLateRaterId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      <option value="">-- Select Rater --</option>
                      {soldierOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Historical Senior Rater</label>
                    <select
                      value={manualLateSeniorRaterId}
                      onChange={(e) => setManualLateSeniorRaterId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      <option value="">-- Select SR --</option>
                      {soldierOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Calculated HQDA Due</p>
                  <p className="text-sm font-mono font-bold text-rose-600 mt-0.5">
                    {manualLateThru ? add90Days(manualLateThru) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setManualLateRecord(null)}
                  className="flex-1 py-2 bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-[10px] rounded-lg transition-all uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveManualLate}
                  disabled={!manualLateThru}
                  className="flex-1 py-2 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-black text-[10px] rounded-lg transition-all uppercase tracking-widest shadow-md"
                >
                  SAVE LATE ENTRY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Late Status Modal */}
      {clearingLateRecord && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh] relative">
            <button 
              onClick={() => setClearingLateRecord(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-6 overflow-y-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-rose-100 rounded-full">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <h3 className="font-black uppercase tracking-tight text-sm text-slate-800">Manage Late Status</h3>
              </div>
              
              <p className="text-xs text-slate-600 mb-6 leading-relaxed font-medium">
                This record for <strong className="text-slate-900">{clearingLateRecord.name}</strong> is currently marked as <strong className="text-rose-600">LATE</strong>. 
                What would you like to do?
              </p>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-6">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Historical Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[8px] font-bold text-slate-500 uppercase">Thru Date</p>
                    <p className="text-xs font-mono font-bold text-slate-700">{clearingLateRecord.priorThru || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-bold text-slate-500 uppercase">HQDA Due</p>
                    <p className="text-xs font-mono font-bold text-rose-600">{clearingLateRecord.priorDueHqda || "—"}</p>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200">
                    <p className="text-[8px] font-bold text-slate-500 uppercase">Historical Rater</p>
                    <p className="text-xs font-bold text-slate-700">{getRaterName(clearingLateRecord.lateRaterId || clearingLateRecord.raterId)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[8px] font-bold text-slate-500 uppercase">Historical SR</p>
                    <p className="text-xs font-bold text-slate-700">{getRaterName(clearingLateRecord.lateSeniorRaterId || clearingLateRecord.seniorRaterId)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    onUpdateRecord({
                      ...clearingLateRecord,
                      ncoerStatus: undefined,
                      ncoerStatusDate: undefined,
                      lateRaterId: undefined,
                      lateSeniorRaterId: undefined,
                      priorThru: undefined,
                      priorDueHqda: undefined
                    });
                    setClearingLateRecord(null);
                  }}
                  className="w-full py-2.5 bg-rose-600 text-white hover:bg-rose-700 font-black text-[10px] rounded-lg transition-all uppercase tracking-widest shadow-md flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  RESET TO CURRENT STATUS
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <div className="relative flex justify-center text-[8px] uppercase font-bold text-slate-400 bg-white px-2">OR CHANGE STATUS TO</div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {["Submitted to HR", "Reviewing - HR", "Reviewing - CSM", "Returned for Edits", "Out for Signatures", "Submitted to HQDA"].map(status => (
                    <button
                      key={status}
                      onClick={() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        onUpdateRecord({
                          ...clearingLateRecord,
                          ncoerStatus: status,
                          ncoerStatusDate: todayStr
                        });
                        setClearingLateRecord(null);
                      }}
                      className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[9px] rounded-lg transition-all uppercase tracking-wider"
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setClearingLateRecord(null)}
                  className="w-full mt-4 py-2 bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-[10px] rounded-lg transition-all uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COR Transition Popout */}
      {selectedCorRecord && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-600 text-white">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-white animate-spin-slow" />
                </div>
                <div>
                  <h3 className="font-black text-lg tracking-tight leading-none uppercase">Change of Rater</h3>
                  <p className="text-[10px] font-bold text-amber-100 tracking-widest mt-1 opacity-80 uppercase">Rating Chain Transition</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedCorRecord(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Soldier Info */}
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 shadow-inner">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Affected Soldier</div>
                  <div className="text-xl font-black text-slate-900">{selectedCorRecord.name}</div>
                  <div className="text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-1 uppercase border border-amber-100">
                    {selectedCorRecord.rank} • {selectedCorRecord.role}
                  </div>
                </div>
              </div>

              {/* Transition visualization */}
              <div className="relative">
                <div className="absolute left-[50%] top-0 bottom-0 w-px bg-slate-100 -translate-x-1/2 z-0 hidden sm:block"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                  {/* Current/Old Rater */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Previous Rater</div>
                    <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm text-center group">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2 text-slate-400 border border-slate-50">
                        <HistoryIcon className="w-5 h-5" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm truncate">{getRaterName(selectedCorRecord.raterId)}</div>
                    </div>
                  </div>

                  {/* New Rater */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] text-center">New Incoming Rater</div>
                    <div className="p-4 bg-amber-50 border-2 border-amber-500 rounded-2xl shadow-[0_4px_12px_rgba(217,119,6,0.15)] text-center animate-pulse-subtle">
                      <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-2 text-white shadow-lg shadow-amber-200">
                        <Plus className="w-6 h-6" />
                      </div>
                      <div className="font-black text-amber-900 text-sm truncate">
                        {selectedCorRecord.corNewRaterId ? getRaterName(selectedCorRecord.corNewRaterId) : "Not Specified"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transition Arrow (Desktop) */}
                <div className="absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center bg-white border border-slate-200 rounded-full p-2 shadow-md z-20">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                </div>
              </div>

              {/* Effective Date Card */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-2.5 rounded-xl border border-white/5">
                    <CalendarPlus className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transition Effective Date</div>
                    <div className="text-xl font-black font-mono tracking-tighter">
                      {selectedCorRecord.corEffectiveDate || "NOT SET"}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="bg-amber-500/10 text-amber-500 text-[9px] font-black px-2.5 py-1 rounded-full border border-amber-500/20 uppercase tracking-wider">
                    PENDING CHANGE
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase italic">
                <Info className="w-3 h-3" />
                Rating Scheme Update Pending
              </div>
              <button
                onClick={() => setSelectedCorRecord(null)}
                className="px-8 py-2.5 text-xs font-black bg-slate-900 text-white hover:bg-slate-800 rounded-xl shadow-lg shadow-slate-200 transition-all active:scale-95 uppercase tracking-widest"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soldier Notes Popout Modal */}
      {activeNoteSoldierName && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-500 text-slate-950">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <FileText className="w-5 h-5 text-slate-950" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight leading-none uppercase">Soldier Profile Notes</h3>
                  <p className="text-[10px] font-bold text-amber-950 tracking-widest mt-1 opacity-90 uppercase">
                    Notes for {activeNoteSoldierName}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setActiveNoteSoldierName(null);
                  setNoteInputText("");
                }}
                className="p-2 hover:bg-slate-950/10 rounded-full transition-colors active:scale-90"
              >
                <X className="w-6 h-6 text-slate-950" />
              </button>
            </div>

            {/* Notes List Scrollable Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50 min-h-[150px] max-h-[40vh]">
              {(() => {
                const filtered = allNotes.filter(n => n.soldierName === activeNoteSoldierName.trim().toLowerCase());
                // Sort by createdAt descending (newest first)
                const sorted = [...filtered].sort((a, b) => {
                  const timeA = typeof a.createdAt === "number" ? a.createdAt : (a.createdAt?.toMillis?.() || 0);
                  const timeB = typeof b.createdAt === "number" ? b.createdAt : (b.createdAt?.toMillis?.() || 0);
                  return timeB - timeA;
                });

                if (sorted.length === 0) {
                  return (
                    <div className="text-center py-8 px-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                        No notes recorded for this Soldier yet.
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Use the form below to document leadership observations, development targets, or rating track entries.
                      </p>
                    </div>
                  );
                }

                return sorted.map((note) => {
                  const formatNoteTimestamp = (ts: any) => {
                    if (!ts) return "Just now";
                    const date = typeof ts === "number" ? new Date(ts) : (ts.toDate ? ts.toDate() : new Date(ts));
                    return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  };

                  return (
                    <div key={note.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                          <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                            {note.content}
                          </p>
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 pt-1 border-t border-slate-50 mt-2">
                            <span>{formatNoteTimestamp(note.createdAt)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded transition-all focus:outline-none focus:ring-1 focus:ring-rose-200"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Add Note Form Area */}
            <div className="p-6 border-t border-slate-100 bg-white space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
                  Add New Observation or Note
                </label>
                <textarea
                  value={noteInputText}
                  onChange={(e) => setNoteInputText(e.target.value)}
                  placeholder="Type notes here... Observations are automatically timestamped and shared across Current/Projected rosters."
                  rows={3}
                  className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium placeholder-slate-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveNoteSoldierName(null);
                    setNoteInputText("");
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-all focus:outline-none active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!noteInputText.trim()}
                  onClick={handleAddNote}
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-500/10 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {historyConfirm && (
        <ConfirmDialog
          isOpen={historyConfirm.isOpen}
          title={historyConfirm.title}
          message={historyConfirm.message}
          confirmLabel={historyConfirm.confirmLabel}
          cancelLabel={historyConfirm.cancelLabel}
          onConfirm={() => {
            historyConfirm.onConfirm();
            setHistoryConfirm(null);
          }}
          onCancel={() => setHistoryConfirm(null)}
          variant={historyConfirm.variant}
        />
      )}
    </div>
  );
}
