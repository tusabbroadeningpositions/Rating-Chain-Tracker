/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from "react";
import { jsPDF } from "jspdf";
// @ts-ignore
import XLSX from "xlsx-js-style";
import { ArmyRatingRecord, RatingRole } from "../types";
import { parseCSV, generateTemplateCSV, formatDateToMDYYYY } from "../utils/csvHandler";
import { add90Days } from "../utils/dateUtils";
import { getRoleColors } from "../utils/orgChartLayout";
import { Search, FileDown, Upload, Trash2, Edit2, Plus, RefreshCw, HelpCircle, FileSpreadsheet, X, CalendarPlus, Layers, AlertTriangle, ChevronRight, ChevronDown, History, Info, AlertCircle, RotateCcw } from "lucide-react";
import { subscribeToRecordHistory, restoreRecordHistory, deleteHistoryRecord } from "../lib/firebaseService";
import ConfirmDialog from "./ConfirmDialog";

interface RatingTableProps {
  records: ArmyRatingRecord[];
  allRecords?: ArmyRatingRecord[];
  onEdit: (record: ArmyRatingRecord) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
  onImportCSV: (newRecords: ArmyRatingRecord[], append: boolean) => void;
  onUpdateRecord: (record: ArmyRatingRecord) => void;
  readOnly?: boolean;
  selectedVersion?: "current" | "future" | "alternate";
  onChangeVersion?: (version: "current" | "future" | "alternate") => void;
  activeSchemeName?: string;
  proposedEffectiveDate?: string;
  onUpdateProposedEffectiveDate?: (dateVal: string) => void;
  effectiveAsOf?: string;
  onUpdateEffectiveAsOf?: (dateVal: string) => void;
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
  activeSchemeName = "Blues Rating Scheme",
  proposedEffectiveDate = "",
  onUpdateProposedEffectiveDate,
  effectiveAsOf = "",
  onUpdateEffectiveAsOf,
}: RatingTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedRater, setSelectedRater] = useState("");
  const [selectedSeniorRater, setSelectedSeniorRater] = useState("");
  const [sortAlphabetically, setSortAlphabetically] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [importPending, setImportPending] = useState<ArmyRatingRecord[] | null>(null);
  
  const [activeCustomStatusRecordId, setActiveCustomStatusRecordId] = useState<string | null>(null);
  const [customStatusText, setCustomStatusText] = useState("");
  const [editingDateRecordId, setEditingDateRecordId] = useState<string | null>(null);
  const [tempDateValue, setTempDateValue] = useState("");
  const [showGreenLine, setShowGreenLine] = useState(false);
  const [expandedHistoryRecordId, setExpandedHistoryRecordId] = useState<string | null>(null);
  const [recordHistory, setRecordHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [lateShiftPromptRecord, setLateShiftPromptRecord] = useState<ArmyRatingRecord | null>(null);
  const [manualLateRecord, setManualLateRecord] = useState<ArmyRatingRecord | null>(null);
  const [manualLateThru, setManualLateThru] = useState("");
  const [lateEditingRecordId, setLateEditingRecordId] = useState<string | null>(null);
  const [historyConfirm, setHistoryConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: "danger" | "warning" | "info" | "question";
  } | null>(null);

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
    if (!raterId) return "-";
    const searchSource = allRecords || records;
    const r = searchSource.find(rec => rec.id === raterId);
    if (r) {
      if (r.rank) {
        return `${r.name} (${r.rank})`;
      }
      return r.name;
    }
    // If not found by ID, it might be a raw name string from import
    return raterId;
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

  const mismatchCount = useMemo(() => {
    let count = 0;
    records.forEach(r => {
      if (getSeniorRaterMismatchInfo(r)) {
        count++;
      }
      if (getReviewerMismatchInfo(r)) {
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

      return matchesSearch && matchesRole && matchesRater && matchesSeniorRater;
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

  // Handle PDF NCOER Report Export
  const handleExportNcoerReport = () => {
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
      doc.text("DUTY TITLE & MOSC", 64, startY + 5.5);
      doc.text("THRU DATE (DAYS)", 112, startY + 5.5);
      doc.text("RATER", 142, startY + 5.5);
      doc.text("SENIOR RATER", 179, startY + 5.5);
      doc.text("NCOER STATUS", 216, startY + 5.5);
      doc.text("STATUS DATE", 253, startY + 5.5);
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
              bg = [254, 226, 226]; // rose-100
              textCol = [159, 18, 57]; // rose-800
              break;
            case "Submitted to HR":
            case "Reviewing - HR":
            case "Reviewing - CSM":
              bg = [219, 234, 254]; // blue-100
              textCol = [30, 64, 175]; // blue-800
              break;
            case "Returned for Edits":
              bg = [255, 237, 213]; // orange-100
              textCol = [154, 52, 18]; // orange-800
              break;
            case "Out for Signatures":
              bg = [254, 249, 195]; // yellow-100
              textCol = [133, 77, 14]; // yellow-800
              break;
            case "Submitted to HQDA":
              bg = [209, 250, 229]; // green-100
              textCol = [6, 95, 70]; // green-800
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
      doc.setFontSize(7.5);
      doc.setTextColor(textCol[0], textCol[1], textCol[2]);
      const textWidth = doc.getTextWidth(status || "—");
      const textX = x + (w - textWidth) / 2;
      doc.text(status || "—", textX, y + 4.5);
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
        return rec ? `${rec.rank} ${rec.name}` : id;
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

      const soldierLines = doc.splitTextToSize(soldierNameStr, 44) as string[];
      const roleLines = doc.splitTextToSize(moscAndRole, 45) as string[];
      const raterLines = doc.splitTextToSize(helperGetName(r.raterId), 34) as string[];
      const srLines = doc.splitTextToSize(helperGetName(r.seniorRaterId), 34) as string[];

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

      // Col 2: Role & MOSC
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      roleLines.forEach((line, lIdx) => {
        if (line.startsWith("[MOSC:")) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(14, 116, 144); // cyan-700
        }
        doc.text(line, 64, y + 4.2 + lIdx * 3.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
      });

      // Col 3: Thru Date
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(formatNiceDate(thruToUse), 112, y + 4.5);
      
      doc.setFontSize(7);
      doc.setTextColor(daysInfo.color[0], daysInfo.color[1], daysInfo.color[2]);
      doc.text(daysInfo.text, 112, y + 8.5);

      // Col 4: Rater
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      raterLines.forEach((line, lIdx) => {
        doc.text(line, 142, y + 4.5 + lIdx * 3.8);
      });

      // Col 5: Senior Rater
      srLines.forEach((line, lIdx) => {
        doc.text(line, 179, y + 4.5 + lIdx * 3.8);
      });

      // Col 6: NCOER Status Pill
      const statusPillW = 30;
      const statusPillH = 6.5;
      const statusPillX = 218;
      const statusPillY = y + (rowHeight - statusPillH) / 2 - 0.5;
      drawStatusPill(statusPillX, statusPillY, statusPillW, statusPillH, statusToDraw, ncoerInfo.isCustom);

      // Col 7: Status Date
      doc.setFont("helvetica", "mono");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const statusDateStr = item.isLate ? (currentRec.priorDueHqda || add90Days(thruToUse)) : (currentRec.ncoerStatusDate || new Date().toISOString().split('T')[0]);
      doc.text(formatNiceDate(statusDateStr), 253, y + 4.5);

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

    const data = sortedExportRecords.map(r => {
      const helperGetName = (id: string) => {
        if (!id) return "";
        const rec = records.find(x => x.id === id);
        return rec ? `${rec.rank} ${rec.name}` : id;
      };

      return {
        "Element": r.element,
        "Principal\nDuty Title": r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role,
        "Duty MOSC": r.dutyMosc,
        "Rank": r.rank,
        "Name": r.name,
        "From": formatDateToMDYYYY(r.from),
        "Thru": formatDateToMDYYYY(r.thru),
        "Due to\nHQDA": formatDateToMDYYYY(r.dueHqda || add90Days(r.thru)),
        "Rater": helperGetName(r.raterId),
        "Rater\nEffective Date": formatDateToMDYYYY(r.raterEffectiveDate),
        "Senior Rater": helperGetName(r.seniorRaterId),
        "Senior Rater\nEffective Date": formatDateToMDYYYY(r.seniorRaterEffectiveDate),
        "Reviewer": helperGetName(r.reviewerId),
        "Reviewer\nEffective Date": formatDateToMDYYYY(r.reviewerEffectiveDate),
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
        if (r.from !== currentSoldier.from) {
          const cellRef = `F${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // G: Thru
        if (r.thru !== currentSoldier.thru) {
          const cellRef = `G${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // H: Due to HQDA
        if (r.dueHqda !== currentSoldier.dueHqda) {
          const cellRef = `H${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // I: Rater
        if (getRaterNameInVersion(r.raterId, records) !== getRaterNameInVersion(currentSoldier.raterId, currentRecords)) {
          const cellRef = `I${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // J: Rater Effective Date
        if ((r.raterEffectiveDate || "") !== (currentSoldier.raterEffectiveDate || "")) {
          const cellRef = `J${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // K: Senior Rater
        if (getRaterNameInVersion(r.seniorRaterId, records) !== getRaterNameInVersion(currentSoldier.seniorRaterId, currentRecords)) {
          const cellRef = `K${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // L: Senior Rater Effective Date
        if ((r.seniorRaterEffectiveDate || "") !== (currentSoldier.seniorRaterEffectiveDate || "")) {
          const cellRef = `L${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // M: Reviewer
        if (getReviewerNameInVersion(r.reviewerId, records) !== getReviewerNameInVersion(currentSoldier.reviewerId, currentRecords)) {
          const cellRef = `M${rowIdx}`;
          if (worksheet[cellRef]) worksheet[cellRef].s = highlightStyle;
        }
        // N: Reviewer Effective Date
        if ((r.reviewerEffectiveDate || "") !== (currentSoldier.reviewerEffectiveDate || "")) {
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
    if (!reviewerId) return "N/A";
    const r = records.find(rec => rec.id === reviewerId);
    if (r) {
      if (r.rank) {
        return `${r.name} (${r.rank})`;
      }
      return r.name;
    }
    return reviewerId;
  };

  const getRaterNameInVersion = (raterId: string, versionRecords: ArmyRatingRecord[]) => {
    if (!raterId) return "-";
    const found = versionRecords.find(rec => rec.id === raterId);
    if (found) {
      if (found.rank) {
        return `${found.name} (${found.rank})`;
      }
      return found.name;
    }
    return raterId;
  };

  const getReviewerNameInVersion = (reviewerId: string, versionRecords: ArmyRatingRecord[]) => {
    if (!reviewerId) return "N/A";
    const found = versionRecords.find(rec => rec.id === reviewerId);
    if (found) {
      if (found.rank) {
        return `${found.name} (${found.rank})`;
      }
      return found.name;
    }
    return reviewerId;
  };

  const PREDEFINED_STATUSES = [
    "Not Submitted to HR",
    "Submitted to HR",
    "Reviewing - HR",
    "Reviewing - CSM",
    "Returned for Edits",
    "Out for Signatures",
    "Submitted to HQDA"
  ];

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (expandedHistoryRecordId) {
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
  }, [expandedHistoryRecordId]);

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
    
    // If it's a rater field, compare by resolved name instead of ID because IDs change between versions
    if (field === 'raterId' || field === 'seniorRaterId' || field === 'reviewerId') {
      curVal = getRaterName(curVal as string);
      // For history records, they might not have the ID in the allRecords list if they were deleted
      // but getRaterName handles that gracefully.
      histVal = getRaterName(histVal as string);
    }
    
    // Normalize values for comparison
    const normalize = (val: any) => (val === undefined || val === null ? "" : String(val).trim());
    
    if (normalize(curVal) !== normalize(histVal)) {
      return "ring-2 ring-yellow-400 ring-inset bg-yellow-50/50";
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

    let bgClass = "bg-white text-slate-800 border-slate-100"; // default blank
    if (status || targetRecord.priorThru) {
      if (isCustom) {
        bgClass = "bg-slate-100 text-slate-700 border-slate-200"; // custom -> gray
      } else {
        switch (status) {
          case "Not Submitted to HR":
            bgClass = "bg-rose-100 text-rose-800 border-rose-200";
            break;
          case "Submitted to HR":
          case "Reviewing - HR":
          case "Reviewing - CSM":
            bgClass = "bg-blue-100 text-blue-800 border-blue-200";
            break;
          case "Returned for Edits":
            bgClass = "bg-orange-100 text-orange-800 border-orange-200";
            break;
          case "Out for Signatures":
            bgClass = "bg-amber-100 text-amber-800 border-amber-200";
            break;
          case "Submitted to HQDA":
            bgClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
            break;
          default:
            bgClass = "bg-slate-100 text-slate-700 border-slate-200";
            break;
        }
      }
    }

    return { status, bgClass, isAutoRed, isCustom, isWithin30Days };
  };

  const handleStatusChange = (r: ArmyRatingRecord, newStatus: string) => {
    const targetRecord = findCurrentRecord(r);
    const todayStr = new Date().toISOString().split('T')[0];
    
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
    setLateShiftPromptRecord(r);
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
    // Default thru date is one year prior to current thru
    try {
      const d = new Date(r.thru + "T12:00:00");
      d.setFullYear(d.getFullYear() - 1);
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
      ncoerStatus: "Not Submitted to HR" // Default to a late status
    });
    setManualLateRecord(null);
  };

  return (
    <div className={`space-y-4 transition-colors duration-500 min-h-screen ${
      selectedVersion === "future" 
        ? "bg-blue-50/20" 
        : selectedVersion === "alternate" 
          ? "bg-emerald-50/20" 
          : "bg-slate-50/30"
    }`}>
      {/* Search, Filter & Actions Bar */}
      <div className={`bg-white rounded shadow-sm border p-3 space-y-3 mx-4 mt-4 ${
        selectedVersion === "future" ? "border-blue-200" : selectedVersion === "alternate" ? "border-emerald-200" : "border-slate-200"
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
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              />
            </div>

            {/* Filter by Principal Duty Title */}
            <select
              id="filter-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 min-w-[150px]"
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
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 min-w-[150px]"
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
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 min-w-[150px]"
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
            <button
              onClick={handleExportNcoerReport}
              className="px-3 py-1.5 text-white bg-slate-800 hover:bg-slate-900 border border-slate-700 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              id="btn-export-ncoer-pdf"
              title="Exports a professional PDF report showing NCOERs due within 30 days or past due"
            >
              <FileDown className="w-3.5 h-3.5 text-amber-500" />
              Export NCOER Report (PDF)
            </button>
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
        <div className="bg-rose-50 border border-rose-200 rounded p-3 text-rose-800 text-xs flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <span className="font-bold">Rating Chain & Reviewer Alert:</span> We identified <strong className="text-rose-900 font-extrabold">{mismatchCount} discrepancy{mismatchCount === 1 ? "" : "ies"}</strong> in the rating chain or reviewer requirements. 
            Check the cells highlighted with <span className="font-bold text-rose-700">red or purple borders</span> below. 
            <ul className="mt-1 ml-4 list-disc space-y-0.5 opacity-90">
              <li>Senior Raters should always be the Rater of the Rater.</li>
              <li>A SGM Reviewer is <strong className="font-bold">mandatory</strong> if the Senior Rater is rank MSG.</li>
            </ul>
          </div>
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
          className="overflow-x-auto md:overflow-x-visible overflow-y-visible relative scrollbar-thin"
        >
          <table className="w-full min-w-max text-left border-collapse text-[11px]" id="rating-records-table">
            <thead className="sticky top-0 z-[60] shadow-sm">
              {/* Floating Header Banner inside thead so it stays with column headers on scroll */}
              <tr className="bg-[#1e293b] text-white font-sans uppercase tracking-tight font-bold print:hidden sticky top-0 z-[60]">
                <th colSpan={12} className={`px-3 py-2 border-b sticky top-0 z-[60] transition-colors duration-300 ${
                  selectedVersion === "future" ? "bg-blue-500 border-blue-600 text-white" : 
                  selectedVersion === "alternate" ? "bg-emerald-500 border-emerald-600 text-white" : 
                  "bg-blue-950 border-blue-900 text-white"
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
                              ? "bg-amber-600 text-white font-black shadow-sm"
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
                              ? "bg-blue-600 text-white font-black shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Alternate
                        </button>
                      </div>
                      {selectedVersion === "current" && (
                        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-700">
                          <span className="text-[10px] text-slate-300 normal-case font-medium">
                            Effective as of:
                          </span>
                          <input
                            type="date"
                            value={effectiveAsOf}
                            disabled={readOnly}
                            onChange={(e) => onUpdateEffectiveAsOf?.(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono disabled:opacity-50"
                          />
                        </div>
                      )}
                      {selectedVersion === "current" ? null : (
                        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-700">
                          <span className="text-[10px] text-slate-300 normal-case font-medium">
                            Proposed Effective Date:
                          </span>
                          <input
                            type="date"
                            value={proposedEffectiveDate}
                            disabled={readOnly}
                            onChange={(e) => onUpdateProposedEffectiveDate?.(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono disabled:opacity-50"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-300 font-mono font-medium">
                      <span>Total: <strong className="text-white font-bold">{filteredRecords.length}</strong> Soldiers</span>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="border-b border-slate-200 uppercase tracking-tighter font-bold font-mono text-[11px] text-slate-500 bg-slate-100">
                <th className={`px-3 py-2.5 bg-slate-50 sticky left-0 top-[32px] z-[55] transition-all duration-200 border-r border-slate-200 relative ${
                  showGreenLine 
                    ? "after:absolute after:top-0 after:right-0 after:bottom-0 after:w-[3px] after:bg-emerald-500 after:shadow-[1px_0_3px_rgba(16,185,129,0.5)] after:z-[56]" 
                    : ""
                }`}>Name</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-50">Rank</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-50">Element</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-50">MOSC</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-50">Principal Duty Title</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[160px] min-w-[160px] bg-slate-50 sticky top-[32px] z-50">Dates (From - Thru)</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[150px] min-w-[150px] bg-slate-50 sticky top-[32px] z-50">Rater</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[150px] min-w-[150px] bg-slate-50 sticky top-[32px] z-50">Senior Rater</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[150px] min-w-[150px] bg-slate-50 sticky top-[32px] z-50">Reviewer</th>
                <th className="px-1.5 py-2.5 border-r border-slate-200 text-center w-20 min-w-[80px] leading-tight bg-slate-50 sticky top-[32px] z-50">Submission Type</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[170px] min-w-[170px] text-center bg-slate-50 sticky top-[32px] z-50">NCOER Status</th>
                <th className="px-3 py-2.5 text-right bg-slate-50 sticky top-[32px] z-50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-slate-400 font-medium">
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
                  
                  const isRankDiff = !isCurrent && !!currentSoldier && r.rank !== currentSoldier.rank;
                  const isElementDiff = !isCurrent && !!currentSoldier && r.element !== currentSoldier.element;
                  const isMoscDiff = !isCurrent && !!currentSoldier && r.dutyMosc !== currentSoldier.dutyMosc;
                  const isRoleDiff = !isCurrent && !!currentSoldier && (
                    r.role !== currentSoldier.role || 
                    (r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle !== currentSoldier.keyLeaderTitle)
                  );
                  const isDatesDiff = !isCurrent && !!currentSoldier && (
                    r.from !== currentSoldier.from || 
                    r.thru !== currentSoldier.thru || 
                    r.dueHqda !== currentSoldier.dueHqda
                  );
                  const isRaterDiff = !isCurrent && !!currentSoldier && (
                    getRaterNameInVersion(r.raterId, records) !== getRaterNameInVersion(currentSoldier.raterId, currentRecords) ||
                    (r.raterEffectiveDate || "") !== (currentSoldier.raterEffectiveDate || "")
                  );
                  const isSeniorRaterDiff = !isCurrent && !!currentSoldier && (
                    getRaterNameInVersion(r.seniorRaterId, records) !== getRaterNameInVersion(currentSoldier.seniorRaterId, currentRecords) ||
                    (r.seniorRaterEffectiveDate || "") !== (currentSoldier.seniorRaterEffectiveDate || "")
                  );
                  const isReviewerDiff = !isCurrent && !!currentSoldier && (
                    getReviewerNameInVersion(r.reviewerId, records) !== getReviewerNameInVersion(currentSoldier.reviewerId, currentRecords) ||
                    (r.reviewerEffectiveDate || "") !== (currentSoldier.reviewerEffectiveDate || "")
                  );
                  const isSubmissionDiff = !isCurrent && !!currentSoldier && (
                    (r.submissionType || "ANN") !== (currentSoldier.submissionType || "ANN")
                  );

                  const mismatchInfo = getSeniorRaterMismatchInfo(r);
                  const reviewerMismatchInfo = getReviewerMismatchInfo(r);
                  const thruDateClass = getThruDateClass(r.thru);
                  const isPastDue = thruDateClass.includes("rose-100");
                  const isDueSoon = thruDateClass.includes("amber-100");

                  return (
                    <React.Fragment key={r.id}>
                      <tr 
                        className={`group transition-colors ${
                          thruDateClass 
                            ? `${thruDateClass} ${isPastDue ? "hover:bg-rose-200/70" : "hover:bg-amber-200/70"}` 
                            : selectedVersion === "future" 
                              ? `bg-blue-100/50 hover:bg-blue-200/60`
                              : selectedVersion === "alternate"
                                ? `bg-emerald-100/50 hover:bg-emerald-200/60`
                                : `hover:bg-slate-50 ${isEven ? "bg-slate-50/50" : "bg-white"}`
                        }`}
                      >
                      {/* Name */}
                      <td className={`sticky left-0 z-30 px-3 py-2 font-semibold text-slate-900 transition-all duration-200 border-r border-slate-200 relative ${
                        showGreenLine 
                          ? "after:absolute after:top-0 after:right-0 after:bottom-0 after:w-[3px] after:bg-emerald-500 after:shadow-[1px_0_3px_rgba(16,185,129,0.5)] after:z-10" 
                          : ""
                      } ${
                        isPastDue 
                          ? "bg-rose-100 group-hover:bg-rose-200" 
                          : isDueSoon 
                            ? "bg-amber-100 group-hover:bg-amber-200" 
                            : selectedVersion === "future"
                              ? "bg-blue-100/80 group-hover:bg-blue-200/90"
                              : selectedVersion === "alternate"
                                ? "bg-emerald-100/80 group-hover:bg-emerald-100/90"
                                : `${isEven ? "bg-slate-50" : "bg-white"} group-hover:bg-slate-100/90`
                      }`}>
                        <div className="flex flex-col">
                          <span className="leading-tight">{r.name}</span>
                          {selectedVersion === "current" && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleHistory(r.id); }}
                              className={`mt-1.5 flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[8px] uppercase font-bold tracking-tighter transition-all w-fit ${
                                expandedHistoryRecordId === r.id 
                                  ? "bg-slate-800 text-white shadow-sm" 
                                  : "bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-slate-800"
                              }`}
                              title="View Change History"
                            >
                              <History className="w-2.5 h-2.5" />
                              Projected / History
                              {expandedHistoryRecordId === r.id ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Rank */}
                      <td className={`px-3 py-2 border-r border-slate-100 text-center ${isRankDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded">
                          {r.rank}
                        </span>
                      </td>
                      {/* Element */}
                      <td className={`px-3 py-2 text-slate-600 font-medium border-r border-slate-100 ${isElementDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        {r.element}
                      </td>
                      {/* MOSC */}
                      <td className={`px-3 py-2 border-r border-slate-100 text-center ${isMoscDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[10px] font-bold rounded">
                          {r.dutyMosc}
                        </span>
                      </td>
                      {/* Principal Duty Title */}
                      <td className={`px-3 py-2 border-r border-slate-100 ${isRoleDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role}
                        </span>
                      </td>
                      {/* Dates */}
                      <td className={`px-3 py-2 border-r border-slate-100 ${isDatesDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        <div className="font-medium font-mono text-slate-600 flex flex-wrap gap-1 items-center">
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
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-100 ${isRaterDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        <div className="font-semibold text-slate-800">{getRaterName(r.raterId)}</div>
                        {r.raterId && r.raterEffectiveDate && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Eff: {r.raterEffectiveDate}
                          </div>
                        )}
                      </td>
                      {/* Senior Rater */}
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-100 ${
                        mismatchInfo 
                          ? "ring-2 ring-rose-500 ring-inset relative z-10 bg-rose-50/20" 
                          : isSeniorRaterDiff 
                            ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" 
                            : ""
                      }`}>
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <div className="font-semibold text-slate-800">{getRaterName(r.seniorRaterId)}</div>
                            {r.seniorRaterId && r.seniorRaterEffectiveDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Eff: {r.seniorRaterEffectiveDate}
                              </div>
                            )}
                          </div>
                          {mismatchInfo && (
                            <div className="relative group/tooltip flex-shrink-0">
                              <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse cursor-help" />
                              <div className="invisible group-hover/tooltip:visible absolute right-0 z-50 w-64 p-2.5 mt-1 text-xs text-white bg-slate-900 rounded-md shadow-xl border border-slate-700 leading-normal">
                                <p className="font-bold text-rose-400 mb-1">Senior Rater Mismatch</p>
                                <p className="mb-1">
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
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-100 ${
                        reviewerMismatchInfo 
                          ? "ring-2 ring-purple-500 ring-inset relative z-10 bg-purple-50/20" 
                          : isReviewerDiff 
                            ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" 
                            : ""
                      }`}>
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <div className="font-semibold text-slate-800">{getReviewerName(r.reviewerId)}</div>
                            {r.reviewerId && r.reviewerEffectiveDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Eff: {r.reviewerEffectiveDate}
                              </div>
                            )}
                          </div>
                          {reviewerMismatchInfo && (
                            <div className="relative group/tooltip flex-shrink-0">
                              <HelpCircle className="w-4 h-4 text-purple-500 animate-pulse cursor-help" />
                              <div className="invisible group-hover/tooltip:visible absolute right-0 z-50 w-64 p-2.5 mt-1 text-xs text-white bg-slate-900 rounded-md shadow-xl border border-slate-700 leading-normal text-left">
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
                      <td className={`px-3 py-2 text-slate-700 border-r border-slate-100 text-center ${isSubmissionDiff ? "ring-2 ring-yellow-400 ring-inset relative z-10 bg-yellow-50/20" : ""}`}>
                        <span className={`inline-block px-2 py-0.5 border font-bold font-mono text-[10px] rounded uppercase ${getSubmissionBadgeStyles(r.submissionType || "ANN")}`}>
                          {r.submissionType || "ANN"}
                        </span>
                      </td>
                      {/* NCOER Status */}
                      <td className={`px-3 py-2 border-r border-slate-100 text-center relative ${ncoerInfo.bgClass}`}>
                        {ncoerRecord.priorThru && (
                          <div className="absolute top-0.5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
                            <span className="text-[7px] font-black uppercase text-white bg-amber-600 px-1 rounded shadow-sm leading-none py-0.5 whitespace-nowrap">
                              LATE
                            </span>
                            <div className="bg-white/80 px-1 py-0.5 rounded-sm border border-amber-200 mt-0.5 shadow-xs">
                              <p className="text-[6px] font-bold text-amber-900 leading-none">THRU: {ncoerRecord.priorThru}</p>
                              <p className="text-[6px] font-bold text-rose-700 leading-none mt-0.5">HQDA: {ncoerRecord.priorDueHqda}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col items-center gap-1 pt-1">
                          {/* Status Selector Dropdown or Static Badge */}
                          {(ncoerInfo.isWithin30Days || ncoerRecord.priorThru) ? (
                            <select
                              value={ncoerInfo.isCustom ? "custom" : ncoerInfo.status}
                              disabled={readOnly}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "custom") {
                                  setCustomStatusText(ncoerInfo.isCustom ? ncoerInfo.status : "");
                                  setActiveCustomStatusRecordId(r.id);
                                } else {
                                  handleStatusChange(ncoerRecord, val);
                                }
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white/90 text-slate-800 cursor-pointer w-full max-w-[150px] shadow-sm ${ncoerRecord.priorThru ? "mt-4" : ""}`}
                            >
                              <option value="">-- Blank --</option>
                              <option value="Not Submitted to HR">Not Submitted to HR</option>
                              <option value="Submitted to HR">Submitted to HR</option>
                              <option value="Reviewing - HR">Reviewing - HR</option>
                              <option value="Reviewing - CSM">Reviewing - CSM</option>
                              <option value="Returned for Edits">Returned for Edits</option>
                              <option value="Out for Signatures">Out for Signatures</option>
                              <option value="Submitted to HQDA">Submitted to HQDA</option>
                              <option value="custom">Other / Custom...</option>
                            </select>
                          ) : ncoerInfo.status ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold select-none border border-black/10">
                              {ncoerInfo.status}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-300 font-semibold text-[10px] select-none">—</span>
                              {!readOnly && (
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
                      <tr className="bg-slate-100/80 border-b border-slate-200 animate-in fade-in slide-in-from-top-1 duration-200">
                        <td colSpan={13} className="px-0 py-0">
                          <div className="pl-12 pr-6 py-4 bg-slate-100/50 shadow-inner border-l-4 border-slate-400">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="p-1.5 bg-slate-200 rounded-full">
                                <History className="w-4 h-4 text-slate-600" />
                              </div>
                              <div>
                                <h4 className="text-[12px] font-bold text-slate-800 uppercase tracking-tight leading-none">Record Change History</h4>
                                <p className="text-[10px] text-slate-500 font-medium mt-1">Viewing all previous snapshots for <span className="text-slate-700 font-bold">{r.name}</span></p>
                              </div>
                              {isHistoryLoading && (
                                <div className="ml-4 flex items-center gap-2 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" />
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Syncing History...</span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-4">
                              {/* Projected Version Inclusion */}
                              {(() => {
                                const projected = allRecords.find(pr => 
                                  pr.version === "future" && 
                                  pr.name.toLowerCase() === r.name.toLowerCase() && 
                                  pr.rank.toLowerCase() === r.rank.toLowerCase()
                                );
                                
                                if (!projected) return null;
                                
                                return (
                                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md ring-1 ring-blue-300/50">
                                    <div className="bg-blue-600/10 px-4 py-2 border-b border-blue-200 flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Projected Version</span>
                                          <div className="flex items-center gap-1.5 bg-white/80 px-2 py-0.5 rounded border border-blue-200 shadow-sm">
                                            <Info className="w-3 h-3 text-blue-500" />
                                            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-tight italic">
                                              Current state in "Projected" roster profile
                                            </span>
                                          </div>
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
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto scrollbar-thin">
                                      <table className="w-full text-left text-[10px] border-collapse">
                                        <thead>
                                          <tr className="bg-blue-100/30 text-[9px] text-blue-500 font-black uppercase tracking-tighter border-b border-blue-100">
                                            <th className="px-3 py-2 border-r border-blue-100">Name</th>
                                            <th className="px-3 py-2 border-r border-blue-100 text-center">Rank</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Element</th>
                                            <th className="px-3 py-2 border-r border-blue-100 text-center">MOSC</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Duty Title</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Rating Dates</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Rater</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Senior Rater</th>
                                            <th className="px-3 py-2 border-r border-blue-100">Reviewer</th>
                                            <th className="px-3 py-2 text-center">NCOER Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          <tr className="bg-blue-50/30 hover:bg-blue-100/20 transition-colors">
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
                                            <td className={`px-3 py-3 border-r border-blue-100 ${getDiffClass(r, projected, 'raterId')}`}>
                                              <div className="font-bold text-slate-700">{projected.raterId ? getRaterName(projected.raterId) : "Unassigned"}</div>
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 ${getDiffClass(r, projected, 'seniorRaterId')}`}>
                                              <div className="font-bold text-slate-700">{projected.seniorRaterId ? getRaterName(projected.seniorRaterId) : "Unassigned"}</div>
                                            </td>
                                            <td className={`px-3 py-3 border-r border-blue-100 ${getDiffClass(r, projected, 'reviewerId')}`}>
                                              <div className="font-bold text-slate-700">{projected.reviewerId ? getRaterName(projected.reviewerId) : "Unassigned"}</div>
                                            </td>
                                            <td className={`px-3 py-3 text-center ${getDiffClass(r, projected, 'ncoerStatus')}`}>
                                              {(() => {
                                                const projCurrent = findCurrentRecord(projected);
                                                return projCurrent.ncoerStatus ? (
                                                  <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[9px] font-bold uppercase">{projCurrent.ncoerStatus}</span>
                                                ) : (
                                                  <span className="text-slate-300 italic">None</span>
                                                );
                                              })()}
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()}

                              {recordHistory.map((hist, hIdx) => (
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

            <div className="bg-slate-50 border-t border-slate-100 p-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  onImportCSV(importPending, true);
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
                  onImportCSV(importPending, false);
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

      {/* Shift to Next Year Prompt Modal */}
      {lateShiftPromptRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
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

      {/* Manual Late NCOER Modal */}
      {manualLateRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
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
