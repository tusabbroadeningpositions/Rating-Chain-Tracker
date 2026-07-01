import React, { useState } from "react";
import { createPortal } from "react-dom";
import { RatingScheme } from "../types";
import { createScheme, batchSaveRecords } from "../lib/firebaseService";
import { Plus, Trash2, ChevronDown, FolderOpen, Loader2, Edit2, Check, X, Copy } from "lucide-react";

interface SchemeSelectorProps {
  userId: string;
  schemes: RatingScheme[];
  activeSchemeId: string | null;
  onSelect: (schemeId: string) => void;
  onDelete?: (schemeId: string) => void;
  onRename?: (schemeId: string, newName: string) => void;
  onDuplicate?: (schemeId: string) => void;
}

export default function SchemeSelector({ userId, schemes, activeSchemeId, onSelect, onDelete, onRename, onDuplicate }: SchemeSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newSchemeName, setNewSchemeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchemeName.trim()) return;
    
    setLoading(true);
    try {
      const id = await createScheme(userId, newSchemeName.trim());
      
      // Sync local/offline records if they exist and this is the first scheme
      if (schemes.length === 0) {
        const saved = localStorage.getItem("army_rating_scheme_records");
        if (saved) {
          try {
            const localRecords = JSON.parse(saved);
            if (Array.isArray(localRecords) && localRecords.length > 0) {
              await batchSaveRecords(localRecords, userId, id);
            }
          } catch (err) {
            console.error("Failed to sync offline records during scheme creation:", err);
          }
        }
      }
      
      onSelect(id);
      setNewSchemeName("");
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create scheme:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim() || !onRename) return;
    setLoading(true);
    try {
      await onRename(id, editingName.trim());
      setEditingId(null);
    } catch (error) {
      console.error("Error renaming scheme:", error);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (scheme: RatingScheme) => {
    setEditingId(scheme.id);
    setEditingName(scheme.name);
  };

  const activeScheme = schemes.find(s => s.id === activeSchemeId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative group">
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-100 px-3 py-2 rounded font-bold text-sm transition-all shadow-sm"
          >
            <FolderOpen className="w-4 h-4 text-amber-500" />
            <span className="max-w-[220px] sm:max-w-[280px] truncate">
              {activeScheme ? activeScheme.name : "Select Profile"}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          
          {isOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 md:w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-20 overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                {schemes.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-500 italic">No profiles created yet</div>
                ) : (
                  schemes.map(scheme => (
                    <div
                      key={scheme.id}
                      className={`group/item w-full px-4 py-2 text-left text-xs font-medium border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors flex justify-between items-center min-h-[40px] ${
                        activeSchemeId === scheme.id ? "bg-blue-50 text-blue-700" : "text-slate-700"
                      }`}
                    >
                      {editingId === scheme.id ? (
                        <div className="flex-1 flex items-center gap-2 pr-2">
                          <input
                            autoFocus
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(scheme.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="flex-1 px-2 py-1 bg-white border border-blue-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
                          />
                          <button 
                            disabled={loading}
                            onClick={() => handleRename(scheme.id)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button 
                            disabled={loading}
                            onClick={() => setEditingId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button 
                            onClick={() => {
                              onSelect(scheme.id);
                              setIsOpen(false);
                            }}
                            className="flex-1 text-left truncate pr-2"
                          >
                            {scheme.name}
                          </button>
                          <div className="flex items-center gap-1">
                            {activeSchemeId === scheme.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />}
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(scheme);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover/item:opacity-100 transition-all"
                              title="Edit Name"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>

                            {onDuplicate && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDuplicate(scheme.id);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded opacity-0 group-hover/item:opacity-100 transition-all"
                                title="Duplicate Profile"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}

                            {onDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(scheme.id);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded opacity-0 group-hover/item:opacity-100 transition-all"
                                title="Delete Profile"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
              
              <button
                onClick={() => {
                  setIsCreating(true);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 bg-slate-50 text-blue-600 hover:bg-blue-50 text-xs font-bold flex items-center gap-2 transition-colors border-t border-slate-100"
              >
                <Plus className="w-4 h-4" />
                CREATE NEW PROFILE
              </button>
            </div>
          )}
        </div>
      </div>

      {isCreating && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100]">
          <form 
            onSubmit={handleCreate}
            className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200 animate-in fade-in zoom-in duration-200"
          >
            <h3 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
              <Plus className="w-6 h-6 text-blue-500" />
              Create Rating Profile
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Profile Name (e.g., "Woodwind Section", "2026 Scheme")
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newSchemeName}
                  onChange={(e) => setNewSchemeName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium text-slate-900"
                  placeholder="Enter profile name..."
                />
              </div>
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={loading || !newSchemeName.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "CREATE"}
                </button>
              </div>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
