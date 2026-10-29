/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ArmyRatingRecord, formatNameToLastFirstRank } from "../types";
import { getRecordDiscrepancies, helperResolveName, DiscrepancyItem } from "../utils/discrepancyUtils";
import { AlertTriangle, CheckCircle2, Clock, Calendar, FileText, X, Save, Trash2, ShieldAlert } from "lucide-react";

interface DiscrepancyEtpModalProps {
  record: ArmyRatingRecord | null;
  allRecords?: ArmyRatingRecord[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedRecord: ArmyRatingRecord) => void;
  readOnly?: boolean;
}

export default function DiscrepancyEtpModal({
  record,
  allRecords = [],
  isOpen,
  onClose,
  onSave,
  readOnly = false
}: DiscrepancyEtpModalProps) {
  const [etpReason, setEtpReason] = useState("");
  const [etpStatus, setEtpStatus] = useState<"pending" | "approved" | "none" | string>("pending");
  const [etpApprovedDate, setEtpApprovedDate] = useState("");
  const [etpNotes, setEtpNotes] = useState("");

  useEffect(() => {
    if (record) {
      setEtpReason(record.etpReason || "");
      setEtpStatus(record.etpStatus || "pending");
      setEtpApprovedDate(record.etpApprovedDate || "");
      setEtpNotes(record.etpNotes || "");
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const discrepancies = getRecordDiscrepancies(record, allRecords);
  const searchSource = allRecords.length > 0 ? allRecords : [record];
  const raterName = helperResolveName(record.raterId, searchSource);
  const seniorRaterName = helperResolveName(record.seniorRaterId, searchSource);
  const reviewerName = helperResolveName(record.reviewerId, searchSource);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ArmyRatingRecord = {
      ...record,
      etpReason: etpReason.trim() || undefined,
      etpStatus: etpStatus || undefined,
      etpApprovedDate: etpStatus === "approved" ? etpApprovedDate : (etpApprovedDate || undefined),
      etpNotes: etpNotes.trim() || undefined
    };
    onSave(updated);
    onClose();
  };

  const handleClear = () => {
    const updated: ArmyRatingRecord = {
      ...record,
      etpReason: undefined,
      etpStatus: undefined,
      etpApprovedDate: undefined,
      etpNotes: undefined
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Discrepancy / Exception to Policy (ETP)
              </h3>
              <p className="text-[11px] text-slate-300">
                Log regulatory justification, approval status, and notes for this rating chain
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Soldier & Rating Chain Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200/80 pb-2.5">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                  Rated Soldier (Ratee)
                </span>
                <span className="text-sm font-black text-slate-900">
                  {record.rank} {record.name}
                </span>
                <span className="text-xs text-slate-500 ml-2 font-medium">
                  — {record.role} ({record.element})
                </span>
              </div>
              <div className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-700">
                MOSC: {record.dutyMosc || "—"}
              </div>
            </div>

            {/* Affected Chain Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                  Rater
                </span>
                <span className="font-bold text-slate-800 text-[11px] leading-tight block mt-0.5 truncate">
                  {raterName}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                  Senior Rater
                </span>
                <span className="font-bold text-slate-800 text-[11px] leading-tight block mt-0.5 truncate">
                  {seniorRaterName}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                  Reviewer
                </span>
                <span className="font-bold text-slate-800 text-[11px] leading-tight block mt-0.5 truncate">
                  {reviewerName}
                </span>
              </div>
            </div>
          </div>

          {/* Active Discrepancy Warnings */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Identified Rule Discrepancy
            </label>
            {discrepancies.length > 0 ? (
              <div className="space-y-2">
                {discrepancies.map((disc, idx) => (
                  <div key={idx} className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-rose-950 uppercase tracking-tight">
                        {disc.title}
                      </h4>
                      <p className="text-[11px] text-rose-900 mt-1 leading-relaxed">
                        {disc.reason}
                      </p>
                      <div className="mt-2 text-[10px] font-bold text-rose-700 bg-rose-100/70 inline-block px-2 py-0.5 rounded-md">
                        Discrepancy Source: <span className="font-black underline">{disc.discrepantName}</span> ({disc.discrepantRole})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
                No active automated rule violations detected. You may still attach an Exception to Policy (ETP) or command justification to this record.
              </div>
            )}
          </div>

          {/* ETP Input Form */}
          <form id="etp-modal-form" onSubmit={handleSave} className="space-y-4 pt-1">
            {/* Field 1: Reason for discrepancy and reason for exception to policy */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                <span>Reason for discrepancy and reason for exception to policy</span>
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                disabled={readOnly}
                value={etpReason}
                onChange={(e) => setEtpReason(e.target.value)}
                placeholder="State the operational reason for the discrepancy and specific justification for the Exception to Policy (e.g. Commander approved duty alignment, dual-hatted leadership, lack of higher grade NCO in section)..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 bg-white placeholder:text-slate-400 shadow-xs"
              />
            </div>

            {/* Field 2 & 3: Status & Date in 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Field 2: Exception to policy status */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Exception to policy status</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setEtpStatus("pending")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      etpStatus === "pending"
                        ? "bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-300"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending</span>
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setEtpStatus("approved")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      etpStatus === "approved"
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-300"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approved</span>
                  </button>
                </div>
              </div>

              {/* Field 3: Date of approved ETP */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Date of approved ETP</span>
                  {etpStatus === "approved" && <span className="text-emerald-600 font-bold text-[10px]">(Approved)</span>}
                </label>
                <input
                  type="date"
                  disabled={readOnly}
                  value={etpApprovedDate}
                  onChange={(e) => setEtpApprovedDate(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 font-mono shadow-xs ${
                    etpStatus === "approved" ? "border-emerald-400 bg-emerald-50/30" : "border-slate-300 bg-white"
                  }`}
                />
              </div>
            </div>

            {/* Field 4: Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Notes</span>
              </label>
              <textarea
                rows={2}
                disabled={readOnly}
                value={etpNotes}
                onChange={(e) => setEtpNotes(e.target.value)}
                placeholder="Additional administrative notes, memorandum numbers, routing tracking or notes for the rating chain..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 bg-white placeholder:text-slate-400 shadow-xs"
              />
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div>
            {(record.etpReason || record.etpStatus) && !readOnly && (
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear ETP</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save ETP Information</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
