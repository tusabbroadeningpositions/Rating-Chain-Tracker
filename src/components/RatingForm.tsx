/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ArmyRatingRecord, RatingRole, SENIOR_RATER_RANKS, formatNameToLastFirstRank } from "../types";
import { inferRoleFromRankAndTitle } from "../utils/csvHandler";
import { add90Days, calculateThruDate } from "../utils/dateUtils";
import { Plus, Check, X, RotateCcw } from "lucide-react";

interface RatingFormProps {
  records: ArmyRatingRecord[];
  allRecords?: ArmyRatingRecord[];
  onSave: (record: ArmyRatingRecord) => void;
  onCancel: () => void;
  editingRecord: ArmyRatingRecord | null;
  selectedVersion?: "current" | "future" | "alternate";
}

const COMMON_RANKS = ["SSG", "SFC", "MSG", "SGM", "1LT", "2LT", "CPT", "MAJ", "LTC", "COL"];
const COMMON_ELEMENTS = ["Command", "Ceremonial", "Chorus", "Concert", "Popular", "Strings", "Support"];
const COMMON_MOSCS = ["42C", "420C", "42S3O", "42S4O", "42S5O", "42S6O"];

export default function RatingForm({ records, allRecords, onSave, onCancel, editingRecord, selectedVersion }: RatingFormProps) {
  const [name, setName] = useState("");
  const [rank, setRank] = useState("SSG");
  const [dutyMosc, setDutyMosc] = useState("42S3O");
  const [element, setElement] = useState("Ceremonial");
  const [role, setRole] = useState<RatingRole | string>(RatingRole.MUSICIAN);
  const [keyLeaderTitle, setKeyLeaderTitle] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [thruDate, setThruDate] = useState("");
  const [dueHqdaDate, setDueHqdaDate] = useState("");
  const [raterId, setRaterId] = useState("");
  const [raterEffectiveDate, setRaterEffectiveDate] = useState("");
  const [seniorRaterId, setSeniorRaterId] = useState("");
  const [seniorRaterEffectiveDate, setSeniorRaterEffectiveDate] = useState("");
  const [srManualRank, setSrManualRank] = useState("MAJ");
  const [srManualName, setSrManualName] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewerEffectiveDate, setReviewerEffectiveDate] = useState("");
  const [submissionType, setSubmissionType] = useState("ANN");
  const [corNewRaterId, setCorNewRaterId] = useState("");
  const [corEffectiveDate, setCorEffectiveDate] = useState("");
  const [ncoerStatus, setNcoerStatus] = useState("");
  const [ncoerStatusDate, setNcoerStatusDate] = useState("");
  const [isCustomStatus, setIsCustomStatus] = useState(false);
  const [customStatusText, setCustomStatusText] = useState("");

  // Initialize form with editing record or defaults
  useEffect(() => {
    if (editingRecord) {
      setName(editingRecord.name);
      setRank(editingRecord.rank);
      setDutyMosc(editingRecord.dutyMosc);
      setElement(editingRecord.element);
      setRole(editingRecord.role);
      setKeyLeaderTitle(editingRecord.keyLeaderTitle || "");
      setFromDate(editingRecord.from);
      setThruDate(editingRecord.thru);
      // Auto-populate dueHqda if it's blank but thru is present
      setDueHqdaDate(editingRecord.dueHqda || add90Days(editingRecord.thru));
      
      // Mirror NCOER status of current view
      const getRecordForNcoerStatus = () => {
        if (!editingRecord) return editingRecord;
        if ((editingRecord.version || "current") === "current") return editingRecord;
        const searchSource = allRecords || records || [];
        return searchSource.find(cr => 
          (cr.version || "current") === "current" && 
          cr.name.trim().toLowerCase() === editingRecord.name.trim().toLowerCase()
        ) || editingRecord;
      };

      const ncoerRecordToUse = getRecordForNcoerStatus() || editingRecord;
      setNcoerStatus(ncoerRecordToUse.ncoerStatus || "");
      setNcoerStatusDate(ncoerRecordToUse.ncoerStatusDate || "");
      setIsCustomStatus(!!ncoerRecordToUse.isCustomStatus);
      setCustomStatusText(ncoerRecordToUse.isCustomStatus ? ncoerRecordToUse.ncoerStatus || "" : "");
      
      const clean = (s: string) => s.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
      const findIdByName = (val: string) => {
        if (!val) return "";
        // If it looks like a short UUID/id already, just return it
        if (val.length < 15 && /^[a-z0-9]+$/.test(val)) return val;
        
        const cVal = clean(val);
        const match = records.find(r => clean(r.name) === cVal || clean(`${r.rank} ${r.name}`) === cVal);
        return match ? match.id : val;
      };

      setRaterId(findIdByName(editingRecord.raterId));
      setRaterEffectiveDate(editingRecord.raterEffectiveDate || "");
      
      const rawSeniorRater = editingRecord.seniorRaterId || "";
      const matchedSrRecord = records.find(r => r.id === rawSeniorRater);
      if (matchedSrRecord) {
        setSeniorRaterId(matchedSrRecord.id);
        setSrManualRank(matchedSrRecord.rank || "MAJ");
        setSrManualName(matchedSrRecord.name);
      } else if (rawSeniorRater) {
        setSeniorRaterId(rawSeniorRater);
        const matchParentheses = rawSeniorRater.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (matchParentheses) {
          const rawName = matchParentheses[1].trim();
          const rawRank = matchParentheses[2].trim();
          setSrManualName(formatNameToLastFirstRank(rawName).replace(/\s*\([^)]+\)$/, ""));
          setSrManualRank(rawRank);
        } else {
          const matchedRank = SENIOR_RATER_RANKS.find(rk => rawSeniorRater.startsWith(rk + " "));
          if (matchedRank) {
            setSrManualRank(matchedRank);
            const rawName = rawSeniorRater.substring(matchedRank.length + 1).trim();
            setSrManualName(formatNameToLastFirstRank(rawName).replace(/\s*\([^)]+\)$/, ""));
          } else {
            setSrManualRank("MAJ");
            setSrManualName(formatNameToLastFirstRank(rawSeniorRater).replace(/\s*\([^)]+\)$/, ""));
          }
        }
      } else {
        setSeniorRaterId("");
        setSrManualRank("MAJ");
        setSrManualName("");
      }
      setSeniorRaterEffectiveDate(editingRecord.seniorRaterEffectiveDate || "");

      setReviewerId(findIdByName(editingRecord.reviewerId));
      setReviewerEffectiveDate(editingRecord.reviewerEffectiveDate || "");
      setSubmissionType(editingRecord.submissionType || "ANN");
      setCorNewRaterId(editingRecord.corNewRaterId || "");
      setCorEffectiveDate(editingRecord.corEffectiveDate || "");
    } else {
      // Set defaults for a new record
      setName("");
      setRank("SSG");
      setDutyMosc("42S3O");
      setElement("Ceremonial");
      setRole(RatingRole.MUSICIAN);
      setKeyLeaderTitle("");
      
      // Default to 1-year dates or relevant dates
      const today = new Date();
      const currentYear = today.getFullYear();
      const defaultFrom = `${currentYear}-06-01`;
      const defaultThru = `${currentYear + 1}-02-01`;
      setFromDate(defaultFrom);
      setThruDate(defaultThru);
      setDueHqdaDate(add90Days(defaultThru));
      
      setRaterId("");
      setRaterEffectiveDate("");
      setSeniorRaterId("");
      setSrManualRank("MAJ");
      setSrManualName("");
      setSeniorRaterEffectiveDate("");
      setReviewerId("");
      setReviewerEffectiveDate("");
      setSubmissionType("ANN");
      setNcoerStatus("");
      setNcoerStatusDate("");
      setIsCustomStatus(false);
      setCustomStatusText("");
    }
  }, [editingRecord]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const computedSeniorRaterId = (role === RatingRole.ELEMENT_LEADER)
      ? (srManualName.trim() ? formatNameToLastFirstRank(srManualName.trim(), srManualRank.trim()) : seniorRaterId)
      : seniorRaterId;

    const savedRecord: ArmyRatingRecord = {
      id: editingRecord ? editingRecord.id : `record_${Date.now()}`,
      element: element.trim(),
      dutyMosc: dutyMosc.trim() || "42R",
      rank: rank.trim(),
      name: name.trim(),
      from: fromDate,
      thru: thruDate,
      dueHqda: dueHqdaDate,
      raterId,
      raterEffectiveDate,
      seniorRaterId: computedSeniorRaterId,
      seniorRaterEffectiveDate,
      reviewerId,
      reviewerEffectiveDate,
      submissionType,
      corNewRaterId: submissionType === "COR" ? corNewRaterId : "",
      corEffectiveDate: submissionType === "COR" ? corEffectiveDate : "",
      role,
      keyLeaderTitle: role === RatingRole.KEY_LEADER ? keyLeaderTitle : "",
      ncoerStatus: isCustomStatus ? customStatusText.trim() : ncoerStatus,
      ncoerStatusDate: ncoerStatusDate || undefined,
      isCustomStatus
    };

    onSave(savedRecord);
  };

  // Filter possible raters/reviewers to avoid assigning oneself or circular structures, sorted alphabetically by last name
  const availableRaters = records
    .filter(r => !editingRecord || r.id !== editingRecord.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // Collect any manual/external senior raters that exist across records or in active manual fields
  const manualSeniorRaters = React.useMemo(() => {
    const map = new Map<string, string>();
    const searchSource = allRecords || records || [];
    
    searchSource.forEach(r => {
      [r.seniorRaterId, r.raterId, r.reviewerId, r.corNewRaterId].forEach(val => {
        if (val && val !== "-" && !searchSource.some(rec => rec.id === val)) {
          if (!map.has(val)) {
            map.set(val, val);
          }
        }
      });
    });

    if (srManualName.trim()) {
      const formatted = formatNameToLastFirstRank(srManualName.trim(), srManualRank.trim());
      if (!searchSource.some(rec => rec.id === formatted)) {
        map.set(formatted, formatted);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [records, allRecords, srManualRank, srManualName]);

  // Combine availableRaters and manualSeniorRaters into unified sorted option lists
  const combinedRaterRoleOptions = React.useMemo(() => {
    const list: { id: string; label: string; sortKey: string }[] = [];

    availableRaters.forEach(r => {
      const formatted = formatNameToLastFirstRank(r.name, r.rank);
      list.push({
        id: r.id,
        label: `${formatted} - ${r.role}`,
        sortKey: formatted
      });
    });

    manualSeniorRaters.forEach(m => {
      const formatted = formatNameToLastFirstRank(m);
      list.push({
        id: m,
        label: formatted,
        sortKey: formatted
      });
    });

    return list.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true, sensitivity: 'base' }));
  }, [availableRaters, manualSeniorRaters]);

  const combinedRaterOptions = React.useMemo(() => {
    const list: { id: string; label: string; sortKey: string }[] = [];

    availableRaters.forEach(r => {
      const formatted = formatNameToLastFirstRank(r.name, r.rank);
      list.push({
        id: r.id,
        label: formatted,
        sortKey: formatted
      });
    });

    manualSeniorRaters.forEach(m => {
      const formatted = formatNameToLastFirstRank(m);
      list.push({
        id: m,
        label: formatted,
        sortKey: formatted
      });
    });

    return list.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true, sensitivity: 'base' }));
  }, [availableRaters, manualSeniorRaters]);

  const activeVersion = editingRecord ? (editingRecord.version || "current") : (selectedVersion || "current");
  const isCurrentVersion = activeVersion === "current";
  const isProjected = activeVersion === "future";
  const isAlternate = activeVersion === "alternate";
  const isOic = role === RatingRole.OIC || role === "OIC";

  return (
    <form 
      id="rating-form" 
      onSubmit={handleSubmit} 
      className={`rounded-xl border shadow-2xl transition-all flex flex-col max-h-[88vh] sm:max-h-[82vh] overflow-hidden ${
        isProjected 
          ? "bg-blue-50 border-blue-300" 
          : isAlternate 
            ? "bg-emerald-50 border-emerald-300" 
            : "bg-white border-slate-200"
      }`}
    >
      <div className={`flex justify-between items-center px-5 py-3 border-b shrink-0 ${
        isProjected 
          ? "bg-blue-100/70 border-blue-200" 
          : isAlternate 
            ? "bg-emerald-100/70 border-emerald-200" 
            : "bg-slate-50 border-slate-200"
      }`}>
        <h3 className={`text-xs font-bold uppercase tracking-widest flex items-center ${
          isProjected 
            ? "text-blue-700" 
            : isAlternate 
              ? "text-emerald-700" 
              : "text-slate-500"
        }`}>
          {isProjected && <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[8px] mr-2">PROJECTED</span>}
          {isAlternate && <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[8px] mr-2">ALTERNATE</span>}
          {editingRecord ? "Edit Rating Profile Record" : "Create New Rating Profile"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition-colors"
          id="btn-cancel-top"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Full Name */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Full Name (Last, First) <span className="text-rose-500">*</span>
          </label>
          <input
            id="input-name"
            type="text"
            required
            placeholder="e.g. Smith, John"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 font-medium bg-slate-50/50"
          />
        </div>

        {/* Rank Select */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Rank
          </label>
          <div className="flex gap-2">
            <select
              id="select-rank"
              value={COMMON_RANKS.includes(rank) ? rank : "custom"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setRank("");
                } else {
                  setRank(val);
                }
              }}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
            >
              {COMMON_RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="custom">Other / Custom</option>
            </select>
            {(!COMMON_RANKS.includes(rank) || rank === "") && (
              <input
                id="input-custom-rank"
                type="text"
                placeholder="Enter rank"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                className="w-24 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              />
            )}
          </div>
        </div>

        {/* Duty MOSC */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Duty MOSC
          </label>
          <div className="flex gap-2">
            <select
              id="select-mosc"
              value={COMMON_MOSCS.includes(dutyMosc) ? dutyMosc : "custom"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setDutyMosc("");
                } else {
                  setDutyMosc(val);
                }
              }}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
            >
              {COMMON_MOSCS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="custom">Other / Custom</option>
            </select>
            {(!COMMON_MOSCS.includes(dutyMosc) || dutyMosc === "") && (
              <input
                id="input-custom-mosc"
                type="text"
                placeholder="Enter MOSC"
                value={dutyMosc}
                onChange={(e) => setDutyMosc(e.target.value)}
                className="w-28 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
              />
            )}
          </div>
        </div>

        {/* Element */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Element
          </label>
          <div className="flex gap-2">
            <select
              id="select-element"
              value={COMMON_ELEMENTS.includes(element) ? element : "custom"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setElement("");
                } else {
                  setElement(val);
                }
              }}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
            >
              {COMMON_ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
              <option value="custom">Other / Custom</option>
            </select>
            {(!COMMON_ELEMENTS.includes(element) || element === "") && (
              <input
                id="input-custom-element"
                type="text"
                placeholder="Section name"
                value={element}
                onChange={(e) => setElement(e.target.value)}
                className="w-40 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              />
            )}
          </div>
        </div>

        {/* Principal Duty Title */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Principal Duty Title
          </label>
          <div className="flex gap-2">
            <select
              id="select-role"
              value={Object.values(RatingRole).includes(role as RatingRole) ? role : "custom"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setRole("");
                } else {
                  setRole(val);
                }
              }}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 font-semibold bg-slate-50/50"
            >
              {Object.values(RatingRole).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="custom">Other / Custom</option>
            </select>
            {(!Object.values(RatingRole).includes(role as RatingRole) || role === "") && (
              <input
                id="input-custom-role"
                type="text"
                placeholder="Enter title"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-48 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-semibold"
              />
            )}
          </div>
          {role === RatingRole.KEY_LEADER && (
            <div className="mt-2 space-y-1">
              <label className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">
                Key Leader Custom Title (will appear on bubble)
              </label>
              <input
                id="input-key-leader-title"
                type="text"
                placeholder="e.g. First Sergeant, Drum Major"
                value={keyLeaderTitle}
                onChange={(e) => setKeyLeaderTitle(e.target.value)}
                className="w-full px-3 py-1.5 border border-purple-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 font-semibold bg-purple-50/20"
              />
            </div>
          )}
        </div>
      </div>

      {/* Date Ranges */}
      <div className={`border-t border-slate-200 pt-3 space-y-2 ${isOic ? "opacity-60" : ""}`}>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
          <span>Evaluation & Submission</span>
          {isOic && <span className="text-[10px] font-semibold text-slate-500 lowercase italic bg-slate-200/80 px-2 py-0.5 rounded">(Not required for OIC)</span>}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">FROM Date</label>
            <input
              id="input-from-date"
              type="date"
              value={fromDate}
              disabled={isOic}
              onChange={(e) => {
                const val = e.target.value;
                setFromDate(val);
                const calculatedThru = calculateThruDate(val);
                if (calculatedThru) {
                  setThruDate(calculatedThru);
                  const calculatedHqda = add90Days(calculatedThru);
                  if (calculatedHqda) {
                    setDueHqdaDate(calculatedHqda);
                  }
                }
              }}
              className={`w-full px-2 py-1 border rounded text-xs font-mono focus:outline-none ${
                isOic
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                  : "border-slate-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              }`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">THRU Date</label>
            <input
              id="input-thru-date"
              type="date"
              value={thruDate}
              disabled={isOic}
              onChange={(e) => {
                const val = e.target.value;
                setThruDate(val);
                const calculatedHqda = add90Days(val);
                if (calculatedHqda) {
                  setDueHqdaDate(calculatedHqda);
                }
              }}
              className={`w-full px-2 py-1 border rounded text-xs font-mono focus:outline-none ${
                isOic
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                  : "border-slate-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              }`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">HQDA Due Date</label>
            <input
              id="input-due-hqda"
              type="date"
              value={dueHqdaDate}
              disabled={isOic}
              onChange={(e) => setDueHqdaDate(e.target.value)}
              className={`w-full px-2 py-1 border rounded text-xs font-mono focus:outline-none ${
                isOic
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                  : "border-slate-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              }`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">Submission Type</label>
            <div className="flex flex-col gap-1.5">
              <select
                id="select-submission-type"
                value={["ANN", "COR", "CTR", "EXANN", "SR OP"].includes(submissionType) ? submissionType : "custom"}
                disabled={isOic}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    setSubmissionType("");
                  } else {
                    setSubmissionType(val);
                  }
                }}
                className={`w-full px-2.5 py-1.5 border rounded text-xs font-semibold focus:outline-none ${
                  isOic
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                    : "border-slate-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
                }`}
              >
                <option value="ANN">ANN (Annual)</option>
                <option value="COR">COR (Change of Rater)</option>
                <option value="CTR">CTR (Complete the Record)</option>
                <option value="EXANN">EXANN (Extended Annual)</option>
                <option value="SR OP">SR OP (Senior Rater Option)</option>
                <option value="custom">Other / Custom</option>
              </select>
              {(!["ANN", "COR", "CTR", "EXANN", "SR OP"].includes(submissionType) || submissionType === "") && (
                <input
                  id="input-custom-submission-type"
                  type="text"
                  placeholder="Type Code"
                  value={submissionType}
                  disabled={isOic}
                  onChange={(e) => setSubmissionType(e.target.value.toUpperCase())}
                  className={`w-full px-2.5 py-1.5 border rounded text-xs font-bold uppercase focus:outline-none ${
                    isOic
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                      : "border-slate-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
                  }`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Change of Rater (COR) Specific Fields */}
        {submissionType === "COR" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-3 bg-amber-50/50 border border-amber-100 rounded animate-fade-in">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                New Rater (After COR)
              </label>
              <select
                id="select-cor-new-rater"
                value={corNewRaterId}
                disabled={isOic}
                onChange={(e) => setCorNewRaterId(e.target.value)}
                className={`w-full px-3 py-1.5 border rounded text-xs focus:outline-none ${
                  isOic
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                    : "border-amber-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-white"
                }`}
              >
                <option value="">-- Select New Rater --</option>
                {combinedRaterOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                COR Effective Date
              </label>
              <input
                id="input-cor-eff-date"
                type="date"
                value={corEffectiveDate}
                disabled={isOic}
                onChange={(e) => setCorEffectiveDate(e.target.value)}
                className={`w-full px-3 py-1.5 border rounded text-xs font-mono focus:outline-none ${
                  isOic
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                    : "border-amber-200 focus:ring-1 focus:ring-amber-500 text-slate-800 bg-white"
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* NCOER Status Tracking */}
      <div className={`border-t border-slate-200 pt-3 space-y-2 ${isOic ? "opacity-60" : ""}`}>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
          <span>NCOER Status Tracking</span>
          {isOic && <span className="text-[10px] font-semibold text-slate-500 lowercase italic bg-slate-200/80 px-2 py-0.5 rounded">(Not required for OIC)</span>}
        </h4>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">NCOER Status</label>
            <div className="flex flex-col gap-1.5">
              <select
                id="select-ncoer-status"
                value={isCustomStatus ? "custom" : ncoerStatus}
                disabled={!isCurrentVersion || isOic}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    setIsCustomStatus(true);
                    setNcoerStatus("");
                    if (!ncoerStatusDate) {
                      setNcoerStatusDate(new Date().toISOString().split('T')[0]);
                    }
                  } else {
                    setIsCustomStatus(false);
                    setNcoerStatus(val);
                    if (val && !ncoerStatusDate) {
                      setNcoerStatusDate(new Date().toISOString().split('T')[0]);
                    } else if (!val) {
                      setNcoerStatusDate("");
                    }
                  }
                }}
                className={`w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none font-semibold ${
                  !isCurrentVersion || isOic
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200" 
                    : "text-slate-800 bg-slate-50/50 focus:ring-1 focus:ring-amber-500"
                }`}
              >
                <option value="">-- Blank --</option>
                <option value="Not Submitted to HR">Not Submitted to HR</option>
                <option value="Submitted to HR">Submitted to HR</option>
                <option value="Reviewing - HR">Reviewing - HR</option>
                <option value="Reviewing - CSM">Reviewing - CSM</option>
                <option value="Returned for Edits">Returned for Edits</option>
                <option value="Out for Signatures">Out for Signatures</option>
                <option value="Submitted to HQDA">Submitted to HQDA</option>
                <option value="custom">Other / Custom Status...</option>
              </select>

              {isCustomStatus && (
                <input
                  id="input-custom-ncoer-status"
                  type="text"
                  placeholder="Enter Custom NCOER Status"
                  value={customStatusText}
                  disabled={!isCurrentVersion || isOic}
                  onChange={(e) => setCustomStatusText(e.target.value)}
                  className={`w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none ${
                    !isCurrentVersion || isOic
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200" 
                      : "text-slate-800 bg-slate-50/50 focus:ring-1 focus:ring-amber-500"
                  }`}
                />
              )}

              {isOic ? (
                <p className="text-[10px] text-slate-500 font-medium italic mt-1 leading-normal">
                  Evaluation dates and NCOER status tracking are disabled for OIC positions.
                </p>
              ) : !isCurrentVersion ? (
                <p className="text-[10px] text-slate-500 font-medium italic mt-1 leading-normal">
                  NCOER Status is read-only in draft modeling views ({activeVersion === "future" ? "Projected" : "Alternate"}) and can only be updated from the Current roster view.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Rating Chain */}
      <div className="border-t border-slate-200 pt-3 space-y-3">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rating Chain Assignment</h4>
        
        {/* If Role is Element Leader, show customized Rater and Manual Senior Rater entry section */}
        {role === RatingRole.ELEMENT_LEADER ? (
          <div className="p-3.5 bg-sky-50/80 border border-sky-200 rounded-md space-y-3 animate-fade-in">
            <div>
              <h5 className="text-[11px] font-bold text-sky-900 uppercase tracking-wider">
                Element Leader Rating Chain
              </h5>
              <p className="text-[10px] text-sky-700 font-medium">
                Assign direct Rater and enter Senior Rater details manually.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Rater Selection (First) */}
              <div className="space-y-2 bg-white p-3 rounded border border-sky-200 shadow-sm">
                <label className="text-[10px] font-bold text-sky-900 uppercase tracking-wider block">
                  1. Rater (Direct Supervisor)
                </label>
                <select
                  id="select-rater"
                  value={raterId}
                  onChange={(e) => setRaterId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">-- None (Top Level) --</option>
                  {combinedRaterRoleOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div className="space-y-1 pt-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    Rater Effective Date
                  </label>
                  <input
                    id="input-rater-eff-date"
                    type="date"
                    value={raterEffectiveDate}
                    onChange={(e) => setRaterEffectiveDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800 bg-white font-mono"
                  />
                </div>
              </div>

              {/* 2. Senior Rater Manual Entry (Second) */}
              <div className="space-y-2 bg-white p-3 rounded border border-sky-200 shadow-sm md:col-span-2">
                <label className="text-[10px] font-bold text-sky-900 uppercase tracking-wider block">
                  2. Senior Rater (Manual Entry)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Rank */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                      Senior Rater Rank <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        id="select-sr-manual-rank"
                        value={SENIOR_RATER_RANKS.includes(srManualRank) ? srManualRank : "custom"}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "custom") {
                            setSrManualRank("");
                          } else {
                            setSrManualRank(val);
                          }
                        }}
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        {SENIOR_RATER_RANKS.map((rk) => (
                          <option key={rk} value={rk}>
                            {rk}
                          </option>
                        ))}
                        <option value="custom">Other / Custom</option>
                      </select>
                      {!SENIOR_RATER_RANKS.includes(srManualRank) && (
                        <input
                          id="input-sr-manual-custom-rank"
                          type="text"
                          placeholder="Rank"
                          value={srManualRank}
                          onChange={(e) => setSrManualRank(e.target.value)}
                          className="w-20 px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-800 bg-white font-bold uppercase"
                        />
                      )}
                    </div>
                  </div>

                  {/* Name (Last, First) */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                      Senior Rater Name (Last, First) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-sr-manual-name"
                      type="text"
                      placeholder="e.g. Alger, Bonnie"
                      value={srManualName}
                      onChange={(e) => setSrManualName(e.target.value)}
                      onBlur={() => {
                        if (srManualName.trim()) {
                          const formatted = formatNameToLastFirstRank(srManualName.trim()).replace(/\s*\([^)]+\)$/, "");
                          setSrManualName(formatted);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Senior Rater Effective Date */}
                <div className="space-y-1 pt-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    Senior Rater Effective Date
                  </label>
                  <input
                    id="input-senior-rater-eff-date"
                    type="date"
                    value={seniorRaterEffectiveDate}
                    onChange={(e) => setSeniorRaterEffectiveDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800 bg-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Rater */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase">Rater (Direct Supervisor)</label>
              <select
                id="select-rater"
                value={raterId}
                onChange={(e) => setRaterId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              >
                <option value="">-- None (Top Level) --</option>
                {combinedRaterRoleOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {raterId && (
                <div className="pt-1.5 space-y-0.5 animate-fade-in">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Rater Effective Date</label>
                  <input
                    id="input-rater-eff-date"
                    type="date"
                    value={raterEffectiveDate}
                    onChange={(e) => setRaterEffectiveDate(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Senior Rater */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase">Senior Rater</label>
              <select
                id="select-senior-rater"
                value={seniorRaterId}
                onChange={(e) => setSeniorRaterId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              >
                <option value="">-- None --</option>
                {combinedRaterOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {seniorRaterId && (
                <div className="pt-1.5 space-y-0.5 animate-fade-in">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Sr Rater Effective Date</label>
                  <input
                    id="input-senior-rater-eff-date"
                    type="date"
                    value={seniorRaterEffectiveDate}
                    onChange={(e) => setSeniorRaterEffectiveDate(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Reviewer */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase">Reviewer</label>
              <select
                id="select-reviewer"
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50"
              >
                <option value="">-- None --</option>
                {combinedRaterOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {reviewerId && (
                <div className="pt-1.5 space-y-0.5 animate-fade-in">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Reviewer Effective Date</label>
                  <input
                    id="input-reviewer-eff-date"
                    type="date"
                    value={reviewerEffectiveDate}
                    onChange={(e) => setReviewerEffectiveDate(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Buttons */}
      <div className={`flex justify-end gap-2.5 px-5 py-3 border-t shrink-0 ${
        isProjected 
          ? "bg-blue-100/40 border-blue-200" 
          : isAlternate 
            ? "bg-emerald-100/40 border-emerald-200" 
            : "bg-slate-50/90 border-slate-200"
      }`}>
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 border border-slate-200 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 bg-white transition-colors"
          id="btn-form-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded text-xs font-bold shadow-sm flex items-center gap-1 transition-colors"
          id="btn-form-save"
        >
          <Check className="w-3.5 h-3.5" />
          {editingRecord ? "SAVE CHANGES" : "ADD PROFILE"}
        </button>
      </div>
    </form>
  );
}
