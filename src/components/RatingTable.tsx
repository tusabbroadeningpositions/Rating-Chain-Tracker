/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { ArmyRatingRecord, RatingRole } from "../types";
import { parseCSV, generateTemplateCSV } from "../utils/csvHandler";
import { getRoleColors } from "../utils/orgChartLayout";
import { Search, FileDown, Upload, Trash2, Edit2, Plus, RefreshCw, HelpCircle, FileSpreadsheet, X, CalendarPlus, Layers } from "lucide-react";

interface RatingTableProps {
  records: ArmyRatingRecord[];
  onEdit: (record: ArmyRatingRecord) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
  onImportCSV: (newRecords: ArmyRatingRecord[], append: boolean) => void;
  onUpdateRecord: (record: ArmyRatingRecord) => void;
  readOnly?: boolean;
  selectedVersion?: "current" | "future" | "alternate";
  onChangeVersion?: (version: "current" | "future" | "alternate") => void;
}

export default function RatingTable({
  records,
  onEdit,
  onDelete,
  onAddClick,
  onImportCSV,
  onUpdateRecord,
  readOnly = false,
  selectedVersion = "current",
  onChangeVersion,
}: RatingTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [sortAlphabetically, setSortAlphabetically] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [importPending, setImportPending] = useState<ArmyRatingRecord[] | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    "Musician": 8,
    "Musicians": 8,
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

      return matchesSearch && matchesRole;
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

  // Handle Excel Export
  const handleExportExcel = () => {
    const data = records.map(r => {
      const helperGetName = (id: string) => {
        if (!id) return "";
        const rec = records.find(x => x.id === id);
        return rec ? `${rec.rank} ${rec.name}` : id;
      };

      return {
        "Element": r.element,
        "Principal\nDuty Title": r.role,
        "Duty MOSC": r.dutyMosc,
        "Rank": r.rank,
        "Name": r.name,
        "From": r.from,
        "Thru": r.thru,
        "Due to\nHQDA": r.dueHqda,
        "Rater": helperGetName(r.raterId),
        "Rater\nEffective Date": r.raterEffectiveDate || "",
        "Senior Rater": helperGetName(r.seniorRaterId),
        "Senior Rater\nEffective Date": r.seniorRaterEffectiveDate || "",
        "Reviewer": helperGetName(r.reviewerId),
        "Reviewer\nEffective Date": r.reviewerEffectiveDate || "",
        "Submission\nType": r.submissionType || "ANN"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Enable wrap text and styling if Excel properties support it, 
    // or simply provide the worksheet. Newlines are natively supported.
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rating Scheme");
    XLSX.writeFile(workbook, "Rating_Scheme_Tracker.xlsx");
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
            dueHqda: normalizeDate(getVal(idxDueHqda, "")),
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

  const getRaterName = (raterId: string) => {
    if (!raterId) return "-";
    const r = records.find(rec => rec.id === raterId);
    if (r) return `${r.rank} ${r.name}`;
    // If not found by ID, it might be a raw name string from import
    return raterId;
  };

  const getReviewerName = (reviewerId: string) => {
    if (!reviewerId) return "N/A";
    const r = records.find(rec => rec.id === reviewerId);
    if (r) return `${r.rank} ${r.name}`;
    return reviewerId;
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
    const shiftDate = (dateStr: string) => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split('T')[0];
      } catch (e) {
        return dateStr;
      }
    };

    onUpdateRecord({
      ...r,
      from: shiftDate(r.from),
      thru: shiftDate(r.thru)
    });
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter & Actions Bar */}
      <div className="bg-white rounded shadow-sm border border-slate-200 p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
          
          {/* Left: Search & Filter selections */}
          <div className="flex flex-col sm:flex-row gap-2 flex-1 max-w-3xl">
            {/* Search Input */}
            <div className="relative flex-1">
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
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 min-w-[180px]"
            >
              <option value="">-- All Duty Titles --</option>
              {Object.values(RatingRole).map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
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
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs font-bold flex items-center gap-1.5 transition-colors"
              id="btn-download-csv"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-400" />
              CSV Template
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

        <div className="overflow-x-auto md:overflow-x-visible overflow-y-visible relative scrollbar-thin">
          <table className="w-full text-left border-collapse text-[11px]" id="rating-records-table">
            <thead className="sticky top-0 z-20 shadow-sm">
              {/* Floating Header Banner inside thead so it stays with column headers on scroll */}
              <tr className="bg-[#1e293b] text-white font-sans uppercase tracking-tight font-bold print:hidden sticky top-0 z-20">
                <th colSpan={11} className="px-3 py-2 bg-[#1e293b] border-b border-slate-700 sticky top-0 z-20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 animate-pulse" />
                      <span className="text-[10px] tracking-wider text-slate-300">ROSTER VIEW:</span>
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
                          Future
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
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-300 font-mono font-medium">
                      <span>Total: <strong className="text-white font-bold">{filteredRecords.length}</strong> Soldiers</span>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="border-b border-slate-200 uppercase tracking-tighter font-bold font-mono text-[11px] text-slate-500 bg-slate-100">
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-20">Name</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-20">Rank</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-20">Element</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-20">MOSC</th>
                <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 sticky top-[32px] z-20">Principal Duty Title</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[160px] min-w-[160px] bg-slate-50 sticky top-[32px] z-20">Dates (From - Thru)</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[150px] min-w-[150px] bg-slate-50 sticky top-[32px] z-20">Rater</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[150px] min-w-[150px] bg-slate-50 sticky top-[32px] z-20">Senior Rater</th>
                <th className="px-3 py-2.5 border-r border-slate-200 w-[150px] min-w-[150px] bg-slate-50 sticky top-[32px] z-20">Reviewer</th>
                <th className="px-1.5 py-2.5 border-r border-slate-200 text-center w-20 min-w-[80px] leading-tight bg-slate-50 sticky top-[32px] z-20">Submission Type</th>
                <th className="px-3 py-2.5 text-right bg-slate-50 sticky top-[32px] z-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400 font-medium">
                    No records found matching your search and filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const colors = getRoleColors(r.role);
                  const isEven = idx % 2 === 1;
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${getThruDateClass(r.thru) || (isEven ? "bg-slate-50/50" : "bg-white")}`}>
                      {/* Name */}
                      <td className="px-3 py-2 font-semibold text-slate-900 border-r border-slate-100">
                        {r.name}
                      </td>
                      {/* Rank */}
                      <td className="px-3 py-2 border-r border-slate-100 text-center">
                        <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded">
                          {r.rank}
                        </span>
                      </td>
                      {/* Element */}
                      <td className="px-3 py-2 text-slate-600 font-medium border-r border-slate-100">
                        {r.element}
                      </td>
                      {/* MOSC */}
                      <td className="px-3 py-2 border-r border-slate-100 text-center">
                        <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[10px] font-bold rounded">
                          {r.dutyMosc}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r border-slate-100">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {r.role}
                        </span>
                      </td>
                      {/* Dates */}
                      <td className="px-3 py-2 border-r border-slate-100">
                        <div className="font-medium font-mono text-slate-600 flex flex-wrap gap-1 items-center">
                          <span>{r.from} to</span>
                          <span className="px-1 rounded border border-transparent">
                            {r.thru}
                          </span>
                        </div>
                        <div className="text-[10px] text-red-600 font-bold font-mono">
                          HQDA: {r.dueHqda}
                        </div>
                      </td>
                      {/* Rater */}
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-100">
                        <div className="font-semibold text-slate-800">{getRaterName(r.raterId)}</div>
                        {r.raterId && r.raterEffectiveDate && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Eff: {r.raterEffectiveDate}
                          </div>
                        )}
                      </td>
                      {/* Senior Rater */}
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-100">
                        <div className="font-semibold text-slate-800">{getRaterName(r.seniorRaterId)}</div>
                        {r.seniorRaterId && r.seniorRaterEffectiveDate && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Eff: {r.seniorRaterEffectiveDate}
                          </div>
                        )}
                      </td>
                      {/* Reviewer */}
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-100">
                        <div className="font-semibold text-slate-800">{getReviewerName(r.reviewerId)}</div>
                        {r.reviewerId && r.reviewerEffectiveDate && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Eff: {r.reviewerEffectiveDate}
                          </div>
                        )}
                      </td>
                      {/* Submission Type */}
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-100 text-center">
                        <span className="inline-block px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 font-bold font-mono text-[10px] rounded uppercase">
                          {r.submissionType || "ANN"}
                        </span>
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

    </div>
  );
}
