/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AlertTriangle, Trash2, RefreshCw, HelpCircle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info" | "question";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = "warning"
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <Trash2 className="w-6 h-6 text-rose-500 animate-pulse" />;
      case "warning":
        return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case "question":
        return <HelpCircle className="w-6 h-6 text-blue-500" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-slate-500" />;
    }
  };

  const getButtonStyles = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500";
      case "warning":
        return "bg-amber-500 hover:bg-amber-600 text-slate-950 focus:ring-amber-500";
      case "question":
        return "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500";
      default:
        return "bg-slate-700 hover:bg-slate-800 text-white focus:ring-slate-500";
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/65 flex justify-center items-center p-4 z-[100] animate-fade-in print:hidden">
      <div className="bg-white border-2 border-slate-300 rounded shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-amber-500 text-xs">★</span>
            <span className="text-xs font-bold uppercase tracking-wider font-mono">
              System Confirmation
            </span>
          </div>
          <button 
            onClick={onCancel}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 flex items-start gap-4">
          <div className="p-2 bg-slate-50 rounded border border-slate-100 shrink-0">
            {getIcon()}
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              {message}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded text-xs font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3.5 py-1.5 rounded text-xs font-bold shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-offset-1 ${getButtonStyles()}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
