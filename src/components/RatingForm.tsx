/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ArmyRatingRecord, RatingRole } from "../types";
import { inferRoleFromRankAndTitle } from "../utils/csvHandler";
import { Plus, Check, X, RotateCcw } from "lucide-react";

interface RatingFormProps {
  records: ArmyRatingRecord[];
  onSave: (record: ArmyRatingRecord) => void;
  onCancel: () => void;
  editingRecord: ArmyRatingRecord | null;
}

const COMMON_RANKS = ["SSG", "SFC", "MSG", "SGM", "1LT", "2LT", "CPT", "MAJ", "LTC", "COL"];
const COMMON_ELEMENTS = ["Ceremonial", "Chorus", "Concert", "Popular", "Strings", "Support"];

// Helper to add exactly 90 days to a date string (YYYY-MM-DD)
function add90Days(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + 90);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    return "";
  }
}

// Helper to calculate THRU date (365 days inclusive, which is fromDate + 364 days)
function calculateThruDate(fromDateStr: string): string {
  if (!fromDateStr) return "";
  try {
    const date = new Date(fromDateStr + "T12:00:00");
    if (isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + 364);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    return "";
  }
}

export default function RatingForm({ records, onSave, onCancel, editingRecord }: RatingFormProps) {
  const [name, setName] = useState("");
  const [rank, setRank] = useState("SSG");
  const [dutyMosc, setDutyMosc] = useState("42S3O");
  const [element, setElement] = useState("Ceremonial");
  const [role, setRole] = useState<RatingRole | string>(RatingRole.MUSICIAN);
  const [fromDate, setFromDate] = useState("");
  const [thruDate, setThruDate] = useState("");
  const [dueHqdaDate, setDueHqdaDate] = useState("");
  const [raterId, setRaterId] = useState("");
  const [raterEffectiveDate, setRaterEffectiveDate] = useState("");
  const [seniorRaterId, setSeniorRaterId] = useState("");
  const [seniorRaterEffectiveDate, setSeniorRaterEffectiveDate] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewerEffectiveDate, setReviewerEffectiveDate] = useState("");
  const [submissionType, setSubmissionType] = useState("ANN");

  // Initialize form with editing record or defaults
  useEffect(() => {
    if (editingRecord) {
      setName(editingRecord.name);
      setRank(editingRecord.rank);
      setDutyMosc(editingRecord.dutyMosc);
      setElement(editingRecord.element);
      setRole(editingRecord.role);
      setFromDate(editingRecord.from);
      setThruDate(editingRecord.thru);
      setDueHqdaDate(editingRecord.dueHqda);
      
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
      setSeniorRaterId(findIdByName(editingRecord.seniorRaterId));
      setSeniorRaterEffectiveDate(editingRecord.seniorRaterEffectiveDate || "");
      setReviewerId(findIdByName(editingRecord.reviewerId));
      setReviewerEffectiveDate(editingRecord.reviewerEffectiveDate || "");
      setSubmissionType(editingRecord.submissionType || "ANN");
    } else {
      // Set defaults for a new record
      setName("");
      setRank("SSG");
      setDutyMosc("42S3O");
      setElement("Ceremonial");
      setRole(RatingRole.MUSICIAN);
      
      // Default to 1-year dates or relevant dates
      const today = new Date();
      const currentYear = today.getFullYear();
      setFromDate(`${currentYear}-06-01`);
      setThruDate(`${currentYear + 1}-02-01`);
      setDueHqdaDate(`${currentYear + 1}-05-02`); // 90 days after Feb 1st
      
      setRaterId("");
      setRaterEffectiveDate("");
      setSeniorRaterId("");
      setSeniorRaterEffectiveDate("");
      setReviewerId("");
      setReviewerEffectiveDate("");
      setSubmissionType("ANN");
    }
  }, [editingRecord]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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
      seniorRaterId,
      seniorRaterEffectiveDate,
      reviewerId,
      reviewerEffectiveDate,
      submissionType,
      role
    };

    onSave(savedRecord);
  };

  // Filter possible raters/reviewers to avoid assigning oneself or circular structures, sorted alphabetically by last name
  const availableRaters = records
    .filter(r => !editingRecord || r.id !== editingRecord.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return (
    <form id="rating-form" onSubmit={handleSubmit} className="bg-white rounded border border-slate-200 p-5 space-y-5 shadow-sm">
      <div className="flex justify-between items-center pb-3 border-b border-slate-200 bg-slate-50 p-3 -mx-5 -mt-5 rounded-t">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
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
              value={["42S3O", "42S4O", "42S5O", "42S6O"].includes(dutyMosc) ? dutyMosc : "custom"}
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
              {["42S3O", "42S4O", "42S5O", "42S6O"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="custom">Other / Custom</option>
            </select>
            {(!["42S3O", "42S4O", "42S5O", "42S6O"].includes(dutyMosc) || dutyMosc === "") && (
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
        </div>
      </div>

      {/* Date Ranges */}
      <div className="border-t border-slate-200 pt-3 space-y-2">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Evaluation & Submission</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">FROM Date</label>
            <input
              id="input-from-date"
              type="date"
              value={fromDate}
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
              className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">THRU Date</label>
            <input
              id="input-thru-date"
              type="date"
              value={thruDate}
              onChange={(e) => {
                const val = e.target.value;
                setThruDate(val);
                const calculatedHqda = add90Days(val);
                if (calculatedHqda) {
                  setDueHqdaDate(calculatedHqda);
                }
              }}
              className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">Evaluation Due Date</label>
            <input
              id="input-due-hqda"
              type="date"
              value={dueHqdaDate}
              onChange={(e) => setDueHqdaDate(e.target.value)}
              className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase">Submission Type</label>
            <select
              id="select-submission-type"
              value={submissionType}
              onChange={(e) => setSubmissionType(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 bg-slate-50/50 font-semibold"
            >
              <option value="ANN">ANN (Annual)</option>
              <option value="COR">COR (Change of Rater)</option>
              <option value="CTR">CTR (Complete the Record)</option>
              <option value="EXANN">EXANN (Extended Annual)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rating Chain */}
      <div className="border-t border-slate-200 pt-3 space-y-2">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rating Chain Assignment</h4>
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
              {availableRaters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.rank}) - {r.role}
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
              {availableRaters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.rank})
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
              {availableRaters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.rank})
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
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-slate-200 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
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
