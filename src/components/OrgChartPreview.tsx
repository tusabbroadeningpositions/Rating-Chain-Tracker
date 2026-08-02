/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { ArmyRatingRecord, RatingRole, formatNameToLastFirstRank } from "../types";
import { organizeChartData, getRoleColors } from "../utils/orgChartLayout";
import { exportToPPTX } from "../utils/pptxExport";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, FileDown, Printer, Info, User, ChevronRight, Calendar, AlertTriangle, History as HistoryIcon } from "lucide-react";

interface OrgChartPreviewProps {
  records: ArmyRatingRecord[];
  onEditClick: (record: ArmyRatingRecord) => void;
  readOnly?: boolean;
  activeSchemeName?: string;
  selectedVersion?: string;
  onChangeVersion?: (version: string) => void;
  allRecords?: ArmyRatingRecord[];
  effectiveAsOf?: string;
  proposedDate?: string;
}

const getVerticalNameClass = (rank: string, name: string) => {
  const text = `${rank} ${name}`;
  if (text.length > 20) {
    return "font-bold text-[6.5px] uppercase tracking-tighter leading-[1.1]";
  } else if (text.length > 15) {
    return "font-bold text-[7.5px] uppercase tracking-tight leading-[1.1]";
  } else if (text.length > 11) {
    return "font-bold text-[8.5px] uppercase tracking-tight leading-none";
  } else {
    return "font-bold text-[9px] uppercase tracking-wider leading-none";
  }
};

export default function OrgChartPreview({ 
  records, 
  onEditClick, 
  readOnly = false,
  activeSchemeName = "Rating Scheme",
  selectedVersion = "current",
  onChangeVersion,
  allRecords = [],
  effectiveAsOf,
  proposedDate
}: OrgChartPreviewProps) {
  const [zoom, setZoom] = useState(0.95);
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayDate, setDisplayDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ArmyRatingRecord | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullscreen = () => {
    setIsFullscreen(true);
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.warn("Fullscreen API not allowed or failed, falling back to CSS fullscreen:", err);
      });
    }
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        console.warn("Failed to exit browser fullscreen:", err);
      });
    }
  };

  // Sync isFullscreen with standard browser full screen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Listen for Escape key to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        exitFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Implement scroll wheel / pinch zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Check if Ctrl or Cmd is held down (for zoom)
      const isZoomKey = e.ctrlKey || e.metaKey;
      
      if (!isZoomKey) {
        // Allow default page scrolling when Ctrl/Cmd is not held
        return;
      }

      // Prevent default page scrolling when zooming
      e.preventDefault();
      
      const zoomStep = 0.05;
      const sensitivity = 0.001; // Adjust sensitivity for smooth trackpad pinch
      
      const delta = e.deltaY;
      
      setZoom(prevZoom => {
        let newZoom;
        if (Math.abs(delta) < 50) {
          // Smooth touchpad/pinch gestures
          newZoom = prevZoom - delta * sensitivity;
        } else {
          // Standard mouse wheel notch with ctrl/cmd held
          newZoom = delta > 0 ? prevZoom - zoomStep : prevZoom + zoomStep;
        }
        return Math.min(Math.max(0.3, newZoom), 2.5);
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Organize the flat list of records into structural hierarchy
  const organized = organizeChartData(records);

  // --- Dynamic Width Estimation to Prevent Bubble Collisions ---
  const getColEstimatedWidth = (col: any) => {
    if (!col.lanes || col.lanes.length === 0) {
      return 180; // Minimum default width of a column (corresponds to card dimensions)
    }
    // Lanes inside this column are rendered side-by-side: <div className="flex gap-4 justify-center w-full">
    // Inside each lane, we have the lane leader and subordinates rendered in a vertical column.
    // The width of a lane is determined by the width of the subordinates row (since cards are vertical).
    const lanesWidth = col.lanes.reduce((sum: number, lane: any) => {
      const numSubs = lane.subordinates?.length || 0;
      // Width of subordinates row = n * 26px cards + (n-1) * 4px gap (gap-1 is 4px)
      const subordinatesWidth = numSubs > 0 ? (numSubs * 26) + (numSubs - 1) * 4 : 26;
      // Lane width is max of leader (26px) and subordinates row
      const laneWidth = Math.max(26, subordinatesWidth);
      return sum + laneWidth;
    }, 0);
    // Add gaps between lanes (gap-4 is 16px)
    const totalColumnWidth = lanesWidth + (col.lanes.length - 1) * 16;
    // Return max of default or calculated width, plus a small buffer for safety
    return Math.max(180, Math.ceil(totalColumnWidth + 10));
  };

  // 1. Direct Support columns block width estimation
  const directColWidths = organized.directColumns.map(getColEstimatedWidth);
  const directColumnsBlockWidth = directColWidths.length > 0
    ? directColWidths.reduce((sum, w) => sum + w, 0) + (organized.directColumns.length - 1) * 12 // gap-3 is 12px
    : 0;

  // 2. Main Group blocks width estimation
  const groupWidths = organized.groups.map(group => {
    const colWidths = group.columns.map(getColEstimatedWidth);
    const totalColsWidth = colWidths.reduce((sum, w) => sum + w, 0);
    const calculatedWidth = totalColsWidth + (group.columns.length > 0 ? (group.columns.length - 1) * 12 : 0); // gap-3 is 12px
    return Math.max(180, calculatedWidth);
  });

  // 3. Combined total blocks and gap widths
  const totalBlocksWidth = groupWidths.reduce((sum, w) => sum + w, 0) + directColumnsBlockWidth;
  const numBlocks = (organized.directColumns.length > 0 ? 1 : 0) + organized.groups.length;
  const totalGapsWidth = numBlocks > 1 ? (numBlocks - 1) * 16 : 0; // gap-4 is 16px
  const totalWidthNeeded = totalBlocksWidth + totalGapsWidth;

  // Use dynamic canvas width: minimum is 1400px (standard size), but scales wider up to exactly what is needed
  const dynamicCanvasWidth = Math.max(1400, Math.ceil(totalWidthNeeded + 160)); // Add a 160px safety margin for padding/containment

  // Helper to format date from YYYY-MM-DD to YYYYMMDD as seen in reference image
  const formatArmyDate = (dateStr: string): string => {
    if (!dateStr) return "";
    return dateStr.replace(/-/g, "");
  };

  const getRecordDate = (r: ArmyRatingRecord): string => {
    return formatArmyDate(r.thru);
  };

  // PPTX Export trigger
  const handleExportPPTX = () => {
    const isProjected = selectedVersion === "future" || selectedVersion === "alternate";
    const dateToUse = isProjected
      ? (proposedDate || displayDate || new Date().toISOString().split('T')[0])
      : (effectiveAsOf || displayDate || new Date().toISOString().split('T')[0]);

    const titleHeader = isProjected
      ? `${activeSchemeName} PROJECTED ${dateToUse}`
      : `${activeSchemeName} CURRENT AS OF ${dateToUse}`;

    exportToPPTX(records, titleHeader, "");
  };

  // Browser Print trigger
  const handlePrint = () => {
    window.print();
  };

  // Helper to check rating chain connections for highlighting
  const isPartofActiveChain = (id: string): boolean => {
    const activeId = hoveredNode || selectedNode?.id;
    if (!activeId) return false;
    if (activeId === id) return true;

    const activeRec = records.find(r => r.id === activeId);
    if (!activeRec) return false;

    // Is the hovered/selected record rating this node, or is this node rating the active record?
    return (
      activeRec.raterId === id ||
      activeRec.seniorRaterId === id ||
      activeRec.reviewerId === id ||
      records.some(r => r.id === activeId && r.raterId === id)
    );
  };

  const getNodeChainRelation = (id: string): "active" | "rater" | "senior" | "reviewer" | null => {
    const activeId = hoveredNode || selectedNode?.id;
    if (!activeId) return null;
    if (activeId === id) return "active";

    const activeRec = records.find(r => r.id === activeId);
    if (!activeRec) return null;

    if (activeRec.raterId === id) return "rater";
    if (activeRec.seniorRaterId === id) return "senior";
    if (activeRec.reviewerId === id) return "reviewer";

    return null;
  };

  // Render Card Details panel
  const getRaterName = (raterId: string) => {
    if (!raterId || raterId === "-") return "None";
    const searchSource = (allRecords && allRecords.length > 0) ? allRecords : records;
    const r = searchSource.find(rec => rec.id === raterId);
    if (r) {
      if (r.rank) {
        return `${r.name} (${r.rank})`;
      }
      return r.name;
    }
    return formatNameToLastFirstRank(raterId);
  };

  const getRaterNameOnly = (raterId: string) => {
    if (!raterId || raterId === "-") return "-";
    const searchSource = (allRecords && allRecords.length > 0) ? allRecords : records;
    const found = searchSource.find(rec => rec.id === raterId);
    if (found) return found.name.trim().toLowerCase();
    return raterId.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  };

  const getSeniorRaterMismatchInfo = (r: ArmyRatingRecord) => {
    if (!r.raterId) return null;
    const searchSource = (allRecords && allRecords.length > 0) ? allRecords : records;
    const raterRecord = searchSource.find(rec => rec.id === r.raterId);
    if (!raterRecord) return null;
    
    const expectedSeniorRaterId = raterRecord.raterId;
    if (!expectedSeniorRaterId || expectedSeniorRaterId === "-") return null;
    
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
    const searchSource = (allRecords && allRecords.length > 0) ? allRecords : records;
    const seniorRaterRecord = searchSource.find(rec => rec.id === r.seniorRaterId);
    if (!seniorRaterRecord) return null;
    
    if (seniorRaterRecord.rank !== "MSG") return null;
    
    const hasReviewer = r.reviewerId && r.reviewerId !== "-";
    if (hasReviewer) return null;
    
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
    const searchSource = (allRecords && allRecords.length > 0) ? allRecords : records;
    const raterRecord = searchSource.find(rec => rec.id === r.raterId);
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
    const searchSource = (allRecords && allRecords.length > 0) ? allRecords : records;
    const raterRecord = searchSource.find(rec => rec.id === r.raterId);
    if (!raterRecord) return null;
    
    const rateeRank = (r.rank || "").trim().toUpperCase();
    const raterRank = (raterRecord.rank || "").trim().toUpperCase();
    
    if (rateeRank === raterRank && (rateeRank === "SSG" || rateeRank === "SFC" || rateeRank === "MSG")) {
      return `Rater ${raterRecord.name} (${raterRank}) has the same rank as ratee ${r.name} (${rateeRank}). An NCO should not rate an NCO of the same rank.`;
    }
    return null;
  };

  const getNodeWarningClass = (node: ArmyRatingRecord, isHighlighted: boolean, isWide: boolean = false) => {
    const hasRuleWarning = isSeniorNcoNotRating(node) || 
                           getTwoRanksAboveRaterWarning(node) !== null || 
                           getSameRankRaterWarning(node) !== null ||
                           getSeniorRaterMismatchInfo(node) !== null ||
                           getReviewerMismatchInfo(node) !== null;
                           
    if (isHighlighted) {
      if (hasRuleWarning) {
        return "ring-2 ring-rose-500 scale-[1.01] shadow-lg border-rose-500";
      }
      return "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500";
    } else {
      if (hasRuleWarning) {
        return "ring-2 ring-rose-500 border-rose-500 hover:scale-[1.005] hover:shadow-md";
      }
      return isWide ? "hover:scale-[1.002] hover:shadow" : "hover:scale-[1.005] hover:shadow";
    }
  };

  return (
    <div className={isFullscreen ? "" : "space-y-4"}>
      
      {/* Control Panel */}
      {!isFullscreen && (
        <div className="bg-white rounded border border-slate-200 p-4 flex flex-wrap gap-4 justify-between items-center print:hidden shadow-sm">
          {/* Left: View Options */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Zoom controls */}
            <div className="flex items-center gap-1 bg-slate-50 rounded p-1 border border-slate-200">
              <button
                onClick={() => setZoom(Math.max(0.5, zoom - 0.05))}
                className="p-1 rounded hover:bg-white text-slate-600 hover:text-slate-800 transition-colors"
                id="btn-zoom-out"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono font-bold text-slate-600 px-1.5">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(Math.min(1.5, zoom + 0.05))}
                className="p-1 rounded hover:bg-white text-slate-600 hover:text-slate-800 transition-colors"
                id="btn-zoom-in"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(0.95)}
                className="p-1 rounded hover:bg-white text-slate-500 hover:text-slate-800 transition-colors ml-1 border-l border-slate-200"
                id="btn-zoom-reset"
                title="Reset Zoom"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>

            {/* Full Screen toggle button */}
            <button
              onClick={enterFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded border border-slate-200 text-xs font-bold transition-all shadow-sm"
              id="btn-toggle-fullscreen"
              title="Full Screen Mode"
            >
              <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
              <span>FULL SCREEN</span>
            </button>
          </div>

          {/* Right: Export Options */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPPTX}
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
              id="btn-export-pptx"
            >
              <FileDown className="w-3.5 h-3.5" />
              EXPORT PPTX
            </button>
          </div>
        </div>
      )}

      {/* Visual Chart Area (Full Width) */}
      <div className={isFullscreen ? "" : "space-y-3"}>
          {/* Professional Disclaimer Note - Positioned directly above preview */}
          {!isFullscreen && (
            selectedVersion?.startsWith("archive_") ? (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded shadow-sm flex items-start gap-3 print:hidden">
                <HistoryIcon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0 animate-pulse" />
                <div>
                  <h3 className="text-[11px] font-bold text-amber-950 uppercase tracking-tight">Viewing Historical Archive</h3>
                  <p className="text-[10px] text-amber-800 mt-0.5 leading-relaxed">
                    You are currently viewing a read-only historical copy of this roster. 
                    Any modifications are locked. To make adjustments, reinstate this archive as your active current or draft roster.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded shadow-sm flex items-start gap-3 print:hidden">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-[11px] font-bold text-blue-900 uppercase tracking-tight">Visualization Preview</h3>
                  <p className="text-[10px] text-blue-800 mt-0.5 leading-relaxed">
                    This interactive display is provided for rapid preview and layout verification. 
                    The official PowerPoint export is automatically formatted in strict accordance with HR regulatory guidance 
                    to ensure professional presentation, precision, and structural compliance.
                  </p>
                </div>
              </div>
            )
          )}

          <div className={isFullscreen 
            ? "fixed inset-0 z-50 bg-slate-950 flex flex-col h-screen w-screen overflow-hidden p-0" 
            : `bg-slate-900 rounded p-5 border overflow-hidden shadow-lg relative min-h-[600px] flex flex-col justify-between transition-all duration-300 ${
                selectedVersion?.startsWith("archive_") 
                  ? "border-amber-500/80 ring-4 ring-amber-500/15" 
                  : "border-slate-950"
              }`
          }>
            {isFullscreen && (
              <div className={`transition-colors duration-300 px-6 py-3.5 flex flex-wrap justify-between items-center shrink-0 gap-3 z-10 border-b shadow-lg ${
                selectedVersion === "future" ? "bg-sky-600 border-sky-700 text-white" : 
                selectedVersion === "alternate" ? "bg-emerald-600 border-emerald-700 text-white" : 
                selectedVersion?.startsWith("archive_") ? "bg-amber-850 border-amber-900 text-amber-100" :
                "bg-[#1e293b] border-slate-800 text-white"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    selectedVersion === "future" ? "bg-white" :
                    selectedVersion === "alternate" ? "bg-white" :
                    "bg-emerald-400"
                  }`}></div>
                  <div>
                    <h2 className="text-xs font-black text-slate-100 tracking-wider uppercase flex items-center gap-2">
                      Visual Org Chart Bubble Map
                    </h2>
                    <p className="text-[10px] text-slate-300 mt-0.5 font-bold uppercase tracking-widest">{activeSchemeName}</p>
                  </div>
                </div>
                
                {/* Center: Controls */}
                <div className="flex items-center gap-4">
                  {/* Version Selection Switcher */}
                  {onChangeVersion && (
                    <div className="inline-flex rounded-md bg-black/25 p-0.5 border border-white/10 shadow-inner">
                      <button
                        type="button"
                        onClick={() => onChangeVersion("current")}
                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                          selectedVersion === "current"
                            ? "bg-slate-800 text-white font-black shadow-sm"
                            : "text-slate-300 hover:text-white"
                        }`}
                      >
                        Current
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeVersion("future")}
                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                          selectedVersion === "future"
                            ? "bg-sky-600 text-white font-black shadow-sm"
                            : "text-slate-300 hover:text-white"
                        }`}
                      >
                        <span>Projected</span>
                        {allRecords?.filter(r => (r.version || "current") === "future").length > 0 && (
                          <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeVersion("alternate")}
                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                          selectedVersion === "alternate"
                            ? "bg-emerald-600 text-white font-black shadow-sm"
                            : "text-slate-300 hover:text-white"
                        }`}
                      >
                        <span>Alternate</span>
                        {allRecords?.filter(r => (r.version || "current") === "alternate").length > 0 && (
                          <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Zoom controls */}
                  <div className="flex items-center gap-1 bg-slate-800 rounded p-1 border border-slate-700">
                    <button
                      onClick={() => setZoom(Math.max(0.5, zoom - 0.05))}
                      className="p-1.5 rounded hover:bg-slate-750 text-slate-300 hover:text-slate-100 transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-300 px-2 min-w-[3.5rem] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={() => setZoom(Math.min(1.5, zoom + 0.05))}
                      className="p-1.5 rounded hover:bg-slate-750 text-slate-300 hover:text-slate-100 transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setZoom(0.95)}
                      className="p-1.5 rounded hover:bg-slate-750 text-slate-400 hover:text-slate-200 transition-colors ml-1 border-l border-slate-750"
                      title="Reset Zoom"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPPTX}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    EXPORT PPTX
                  </button>
                  
                  <button
                    onClick={exitFullscreen}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    EXIT FULL SCREEN
                  </button>
                </div>
              </div>
            )}

            <div className={`flex-1 flex overflow-hidden relative ${isFullscreen ? "bg-slate-950" : "bg-slate-900"}`}>
              {/* Scrollable View Wrapper */}
              <div 
                ref={containerRef}
                className={`flex-1 overflow-hidden p-4 relative cursor-grab active:cursor-grabbing ${isFullscreen ? "bg-slate-950" : "bg-slate-900/50"}`}
              >
              <div className="absolute top-2 right-2 z-10 pointer-events-none opacity-40">
                <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1.5">
                  <ZoomIn className="w-3 h-3" />
                  CTRL / CMD + SCROLL TO ZOOM • DRAG TO PAN
                </div>
              </div>
            
            {/* The actual tree grid */}
            <motion.div
              drag
              dragMomentum={true}
              dragTransition={{ power: 0.2, timeConstant: 200 }}
              className="space-y-4 select-none origin-top inline-block px-20"
              style={{
                scale: zoom,
                minWidth: `${dynamicCanvasWidth}px`
              }}
              id="org-chart-canvas"
            >
                            {/* Row 1: OIC (Officer in Charge) */}
              {organized.oic && (
                (() => {
                  const oic = organized.oic;
                  const roleColors = getRoleColors(oic.role);
                  const activeRelation = getNodeChainRelation(oic.id);
                  const isHighlighted = activeRelation !== null;
                  
                  return (
                    <div className="flex justify-center w-full">
                      <div
                        id={`card-${oic.id}`}
                        onMouseEnter={() => setHoveredNode(oic.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => setSelectedNode(oic)}
                        className={`py-2.5 rounded-lg border text-center cursor-pointer transition-all ${roleColors.bg} ${roleColors.text} ${roleColors.border} ${
                          getNodeWarningClass(oic, isHighlighted, true)
                        }`}
                        style={{ width: `${totalWidthNeeded}px` }}
                      >
                        <div className="text-xs font-bold uppercase tracking-widest">{oic.rank} {oic.name}</div>
                        <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(oic)}</div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Row 2: Element Leader */}
              {organized.elementLeader && (
                (() => {
                  const leader = organized.elementLeader;
                  const roleColors = getRoleColors(leader.role);
                  const activeRelation = getNodeChainRelation(leader.id);
                  const isHighlighted = activeRelation !== null;

                  return (
                    <div className="flex justify-center w-full">
                      <div
                        id={`card-${leader.id}`}
                        onMouseEnter={() => setHoveredNode(leader.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => setSelectedNode(leader)}
                        className={`py-2.5 rounded-lg border text-center cursor-pointer transition-all ${roleColors.bg} ${roleColors.text} ${roleColors.border} ${
                          getNodeWarningClass(leader, isHighlighted, true)
                        }`}
                        style={{ width: `${totalWidthNeeded}px` }}
                      >
                        <div className="text-xs font-bold uppercase tracking-widest">{leader.rank} {leader.name}</div>
                        <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(leader)}</div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Row 3: Group Leaders & Direct Support side-by-side */}
              <div className="flex gap-4 justify-center w-full">
                {(() => {
                  return (
                    <>
                       {/* Render Direct Support Columns (rated by OIC/Element Leader directly) */}
                      {organized.directColumns.length > 0 && (
                        <div 
                          className="space-y-4 flex-shrink-0" 
                          style={{ 
                            width: `${directColumnsBlockWidth}px`,
                          }}
                        >
                          {/* Placeholder/Spacer to align with Group Leader row height */}
                          <div className="h-[46px] invisible" />
                          
                          <div className="grid gap-3" style={{ gridTemplateColumns: organized.directColumns.map(col => `${getColEstimatedWidth(col)}px`).join(" ") }}>
                            {organized.directColumns.map((col) => {
                              const header = col.header;
                              const headerColors = getRoleColors(header.role);
                              const activeRel = getNodeChainRelation(header.id);
                              const headerHighlighted = activeRel !== null;

                              return (
                                <div key={col.header.id} className="space-y-4">
                                  <div
                                    id={`card-${header.id}`}
                                    onMouseEnter={() => setHoveredNode(header.id)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    onClick={() => setSelectedNode(header)}
                                    className={`w-full py-2.5 rounded-lg border text-center cursor-pointer transition-all ${headerColors.bg} ${headerColors.text} ${headerColors.border} ${
                                      getNodeWarningClass(header, headerHighlighted, true)
                                    }`}
                                  >
                                    <div className="text-xs font-bold uppercase tracking-wider">{header.rank} {header.name}</div>
                                    <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(header)}</div>
                                  </div>

                                  {/* Subordinates vertical stack */}
                                  {col.lanes.length > 0 && (
                                    <div className="flex gap-4 justify-center w-full">
                                      {col.lanes.map((lane) => {
                                        const l = lane.laneLeader;
                                        const lColors = getRoleColors(l.role);
                                        const lRel = getNodeChainRelation(l.id);
                                        const lHighlighted = lRel !== null;

                                        return (
                                          <div key={l.id} className="flex flex-col items-center gap-2 flex-shrink-0">
                                            <div
                                              id={`card-${l.id}`}
                                              onMouseEnter={() => setHoveredNode(l.id)}
                                              onMouseLeave={() => setHoveredNode(null)}
                                              onClick={() => setSelectedNode(l)}
                                              className={`w-[26px] h-36 rounded-lg border flex items-center justify-center cursor-pointer transition-all overflow-hidden flex-shrink-0 ${lColors.bg} ${lColors.text} ${lColors.border} ${
                                                getNodeWarningClass(l, lHighlighted)
                                              }`}
                                            >
                                              <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                <div className={getVerticalNameClass(l.rank, l.name)}>{l.rank} {l.name}</div>
                                                <div className="text-[8px] font-mono mt-1 opacity-90">{getRecordDate(l)}</div>
                                              </div>
                                            </div>
                                            {lane.subordinates.length > 0 && (
                                              <div className="flex gap-1 justify-center">
                                                {lane.subordinates.map((sub) => {
                                                  const sColors = getRoleColors(sub.role);
                                                  const sRel = getNodeChainRelation(sub.id);
                                                  const sHighlighted = sRel !== null;
                                                  return (
                                                    <div
                                                      key={sub.id}
                                                      id={`card-${sub.id}`}
                                                      onMouseEnter={() => setHoveredNode(sub.id)}
                                                      onMouseLeave={() => setHoveredNode(null)}
                                                      onClick={() => setSelectedNode(sub)}
                                                      className={`w-[26px] h-36 rounded-lg border flex items-center justify-center cursor-pointer transition-all overflow-hidden flex-shrink-0 ${sColors.bg} ${sColors.text} ${sColors.border} ${
                                                        getNodeWarningClass(sub, sHighlighted)
                                                      }`}
                                                    >
                                                      <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                        <div className={getVerticalNameClass(sub.rank, sub.name)}>{sub.rank} {sub.name}</div>
                                                        <div className="text-[8px] font-mono mt-1 opacity-90">{getRecordDate(sub)}</div>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Render Main Group Blocks */}
                      {organized.groups.map((groupBlock, gIndex) => {
                        const leader = groupBlock.leader;
                        const roleColors = getRoleColors(leader.role);
                        const activeRelation = getNodeChainRelation(leader.id);
                        const isHighlighted = activeRelation !== null;
                        const groupWidth = groupWidths[gIndex];
                        const flexPercent = (groupWidth / Math.max(1, totalBlocksWidth)) * 100;

                        return (
                          <div 
                            key={groupBlock.leader.id} 
                            className="space-y-4 flex-shrink-0" 
                            style={{ width: `${groupWidth}px` }}
                          >
                            <div
                              id={`card-${leader.id}`}
                              onMouseEnter={() => setHoveredNode(leader.id)}
                              onMouseLeave={() => setHoveredNode(null)}
                              onClick={() => setSelectedNode(leader)}
                              className={`w-full py-2.5 rounded-lg border text-center cursor-pointer transition-all ${roleColors.bg} ${roleColors.text} ${roleColors.border} ${
                                getNodeWarningClass(leader, isHighlighted, true)
                              }`}
                            >
                              <div className="text-xs font-bold uppercase tracking-wider">{leader.rank} {leader.name}</div>
                              {leader.role === RatingRole.KEY_LEADER && (
                                <div className="text-[9px] font-black text-purple-900 uppercase tracking-widest mt-0.5 px-1.5 py-0.5 bg-purple-100/50 rounded inline-block">
                                  {leader.keyLeaderTitle || "Key Leader"}
                                </div>
                              )}
                              <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(leader)}</div>
                            </div>

                            {groupBlock.columns.length > 0 && (
                              <div className="grid gap-3" style={{ gridTemplateColumns: groupBlock.columns.map(col => `${getColEstimatedWidth(col)}px`).join(" ") }}>
                                {groupBlock.columns.map((col) => {
                                  const header = col.header;
                                  const headerColors = getRoleColors(header.role);
                                  const activeRel = getNodeChainRelation(header.id);
                                  const headerHighlighted = activeRel !== null;

                                  return (
                                    <div key={col.header.id} className="space-y-4">
                                      <div
                                        id={`card-${header.id}`}
                                        onMouseEnter={() => setHoveredNode(header.id)}
                                        onMouseLeave={() => setHoveredNode(null)}
                                        onClick={() => setSelectedNode(header)}
                                        className={`w-full py-2.5 rounded-lg border text-center cursor-pointer transition-all ${headerColors.bg} ${headerColors.text} ${headerColors.border} ${
                                          getNodeWarningClass(header, headerHighlighted, true)
                                        }`}
                                      >
                                        <div className="text-xs font-bold uppercase tracking-wider">{header.rank} {header.name}</div>
                                        <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(header)}</div>
                                      </div>

                                      {col.lanes.length > 0 && (
                                        <div className="flex gap-4 justify-center w-full">
                                          {col.lanes.map((lane) => {
                                            const leader = lane.laneLeader;
                                            const leaderColors = getRoleColors(leader.role);
                                            const leaderRel = getNodeChainRelation(leader.id);
                                            const leaderHighlighted = leaderRel !== null;

                                            return (
                                              <div key={leader.id} className="flex flex-col items-center gap-2 flex-shrink-0">
                                                <div
                                                  id={`card-${leader.id}`}
                                                  onMouseEnter={() => setHoveredNode(leader.id)}
                                                  onMouseLeave={() => setHoveredNode(null)}
                                                  onClick={() => setSelectedNode(leader)}
                                                  className={`w-[26px] h-36 rounded-lg border flex items-center justify-center cursor-pointer transition-all overflow-hidden flex-shrink-0 ${leaderColors.bg} ${leaderColors.text} ${leaderColors.border} ${
                                                    getNodeWarningClass(leader, leaderHighlighted)
                                                  }`}
                                                >
                                                  <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                    <div className={getVerticalNameClass(leader.rank, leader.name)}>{leader.rank} {leader.name}</div>
                                                    <div className="text-[8px] font-mono mt-1 opacity-90">{getRecordDate(leader)}</div>
                                                  </div>
                                                </div>
                                                {lane.subordinates.length > 0 && (
                                                  <div className="flex gap-1 justify-center">
                                                    {lane.subordinates.map((sub) => {
                                                      const subColors = getRoleColors(sub.role);
                                                      const subRel = getNodeChainRelation(sub.id);
                                                      const subHighlighted = subRel !== null;

                                                      return (
                                                        <div
                                                          key={sub.id}
                                                          id={`card-${sub.id}`}
                                                          onMouseEnter={() => setHoveredNode(sub.id)}
                                                          onMouseLeave={() => setHoveredNode(null)}
                                                          onClick={() => setSelectedNode(sub)}
                                                          className={`w-[26px] h-36 rounded-lg border flex items-center justify-center cursor-pointer transition-all overflow-hidden flex-shrink-0 ${subColors.bg} ${subColors.text} ${subColors.border} ${
                                                            getNodeWarningClass(sub, subHighlighted)
                                                          }`}
                                                        >
                                                          <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                            <div className={getVerticalNameClass(sub.rank, sub.name)}>{sub.rank} {sub.name}</div>
                                                            <div className="text-[8px] font-mono mt-1 opacity-90">{getRecordDate(sub)}</div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>

              {/* Unassigned Orphans (shows if someone is not connected to the main Command tree) */}
              {organized.unassigned.length > 0 && (
                <div className="mt-6 border-t border-slate-700/60 pt-4 space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-500" />
                    Pending Assignment / Orphan Records ({organized.unassigned.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {organized.unassigned.map((orphan) => {
                      const colors = getRoleColors(orphan.role);
                      return (
                        <div
                          key={orphan.id}
                          onClick={() => setSelectedNode(orphan)}
                          className={`px-3 py-1.5 rounded border cursor-pointer text-xs font-bold ${colors.bg} ${colors.text} ${colors.border} hover:scale-102 transition-all flex items-center gap-2`}
                        >
                          <span>{orphan.rank} {orphan.name}</span>
                          <span className="text-[10px] font-mono opacity-80">{getRecordDate(orphan)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dynamic Bottom Legend inside SVG Area */}
              <div className="border-t border-slate-800/80 pt-4 mt-4">
                <h4 className="text-slate-400 text-center font-bold text-xs uppercase tracking-widest mb-2.5">LEGEND</h4>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { name: "OIC", role: RatingRole.OIC },
                    { name: "Element Leader", role: RatingRole.ELEMENT_LEADER },
                    { name: "Group Leader", role: RatingRole.GROUP_LEADER },
                    { name: "Key Leader", role: RatingRole.KEY_LEADER },
                    { name: "Section Leader", role: RatingRole.SECTION_LEADER },
                    { name: "Master Musician", role: RatingRole.MASTER_MUSICIAN },
                    { name: "Senior Musician", role: RatingRole.SENIOR_MUSICIAN },
                    { name: "Senior Support Musician", role: RatingRole.SENIOR_SUPPORT_MUSICIAN },
                    { name: "Musician", role: RatingRole.MUSICIAN },
                    { name: "Support Musician", role: RatingRole.SUPPORT_MUSICIAN }
                  ].map((legendItem) => {
                    const colors = getRoleColors(legendItem.role);
                    return (
                      <div
                        key={legendItem.name}
                        className={`px-3 py-1 rounded border text-xs font-bold shadow-sm ${colors.bg} ${colors.text} ${colors.border}`}
                      >
                        {legendItem.name}
                      </div>
                    );
                  })}
                </div>
              </div>

            </motion.div>
          </div>

          {/* Side Inspector Panel (Works in both fullscreen and normal mode) */}
          {selectedNode && (() => {
            const seniorRaterMismatch = getSeniorRaterMismatchInfo(selectedNode);
            const reviewerMismatch = getReviewerMismatchInfo(selectedNode);
            const seniorNcoNotRating = isSeniorNcoNotRating(selectedNode);
            const twoRanksAboveRater = getTwoRanksAboveRaterWarning(selectedNode);
            const sameRankRater = getSameRankRaterWarning(selectedNode);

            const isCurrent = selectedVersion === "current";
            const currentRecords = (allRecords || []).filter(rec => (rec.version || "current") === "current");
            const currentSoldier = isCurrent ? null : currentRecords.find(cr => cr.name.trim().toLowerCase() === selectedNode.name.trim().toLowerCase());

            const isRankDiff = !!currentSoldier && selectedNode.rank !== currentSoldier.rank;
            const isRoleDiff = !!currentSoldier && (
              selectedNode.role !== currentSoldier.role ||
              (selectedNode.role === RatingRole.KEY_LEADER && selectedNode.keyLeaderTitle !== currentSoldier.keyLeaderTitle)
            );
            const isMoscDiff = !!currentSoldier && selectedNode.dutyMosc !== currentSoldier.dutyMosc;
            const isElementDiff = !!currentSoldier && selectedNode.element !== currentSoldier.element;
            const isDatesDiff = !!currentSoldier && (
              selectedNode.from !== currentSoldier.from ||
              selectedNode.thru !== currentSoldier.thru
            );
            const isRaterDiff = !!currentSoldier && getRaterNameOnly(selectedNode.raterId) !== getRaterNameOnly(currentSoldier.raterId);
            const isSeniorRaterDiff = !!currentSoldier && getRaterNameOnly(selectedNode.seniorRaterId) !== getRaterNameOnly(currentSoldier.seniorRaterId);
            const isReviewerDiff = !!currentSoldier && getRaterNameOnly(selectedNode.reviewerId) !== getRaterNameOnly(currentSoldier.reviewerId);

            return (
              <div className={`w-80 border-l border-slate-800 bg-slate-900 flex flex-col justify-between shrink-0 animate-in slide-in-from-right duration-200 text-slate-200 z-10 shadow-2xl ${!isFullscreen ? "h-full" : ""}`}>
                <div className="p-4 space-y-4 overflow-y-auto">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">Active Soldier</span>
                    <button 
                      onClick={() => setSelectedNode(null)}
                      className="text-slate-400 hover:text-slate-250 text-xs font-semibold"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 mt-0.5">{selectedNode.name}</h3>
                      <p className="text-xs text-slate-400 font-medium flex items-center flex-wrap gap-1 mt-0.5">
                        <span className={isRankDiff ? "ring-1 ring-yellow-400 bg-yellow-400/10 rounded px-1 text-yellow-300 font-bold" : ""}>
                          {selectedNode.rank}
                        </span>
                        <span>•</span>
                        <span className={isRoleDiff ? "ring-1 ring-yellow-400 bg-yellow-400/10 rounded px-1 text-yellow-300 font-bold" : ""}>
                          {selectedNode.role === RatingRole.KEY_LEADER && selectedNode.keyLeaderTitle ? `${selectedNode.role} (${selectedNode.keyLeaderTitle})` : selectedNode.role}
                        </span>
                        <span>•</span>
                        <span className={isMoscDiff ? "ring-1 ring-yellow-400 bg-yellow-400/10 rounded px-1 text-yellow-300 font-bold" : ""}>
                          ({selectedNode.dutyMosc})
                        </span>
                      </p>
                    </div>

                    <div className="border-t border-slate-800 pt-3 text-xs space-y-2">
                      <div className={`flex justify-between items-center transition-all ${isElementDiff ? "ring-1 ring-yellow-400 bg-yellow-400/10 rounded px-1.5 py-0.5" : ""}`}>
                        <span className="text-slate-400">Element:</span>
                        <span className="font-semibold text-slate-200">{selectedNode.element}</span>
                      </div>
                      <div className={`flex justify-between items-center transition-all ${isRoleDiff ? "ring-1 ring-yellow-400 bg-yellow-400/10 rounded px-1.5 py-0.5" : ""}`}>
                        <span className="text-slate-400">Principal Duty:</span>
                        <span className="font-semibold text-slate-200">{selectedNode.role === RatingRole.KEY_LEADER && selectedNode.keyLeaderTitle ? `${selectedNode.role} (${selectedNode.keyLeaderTitle})` : selectedNode.role}</span>
                      </div>
                      <div className={`flex justify-between items-center transition-all ${isDatesDiff ? "ring-1 ring-yellow-400 bg-yellow-400/10 rounded px-1.5 py-0.5" : ""}`}>
                        <span className="text-slate-400">Period:</span>
                        <span className="font-semibold text-slate-200 font-mono">{selectedNode.from} to {selectedNode.thru}</span>
                      </div>
                    </div>

                    {/* Discrepancy Alerts */}
                    {seniorRaterMismatch && (
                      <div className="p-3 bg-rose-950/80 border border-rose-500/80 rounded-md text-xs text-rose-200 space-y-1.5 shadow-md">
                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 animate-pulse" />
                          <span>Senior Rater Mismatch</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-200/90">
                          Rater <strong className="text-white">{seniorRaterMismatch.raterName}</strong> is rated by <strong className="text-amber-300">{seniorRaterMismatch.expectedName}</strong>.
                        </p>
                        <p className="text-[11px] font-semibold text-rose-300">
                          Expected Senior Rater: <span className="text-emerald-400 font-bold">{seniorRaterMismatch.expectedName}</span>
                        </p>
                      </div>
                    )}

                    {reviewerMismatch && (
                      <div className="p-3 bg-purple-950/80 border border-purple-500/80 rounded-md text-xs text-purple-200 space-y-1.5 shadow-md">
                        <div className="flex items-center gap-1.5 font-bold text-purple-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-purple-400 animate-pulse" />
                          <span>SGM Reviewer Required</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-purple-200/90">
                          Senior Rater <strong className="text-amber-300">{reviewerMismatch.seniorRaterName}</strong> is rank MSG.
                        </p>
                        <p className="text-[11px] font-semibold text-purple-300">
                          Expected Reviewer: <span className="text-emerald-400 font-bold">{reviewerMismatch.expectedName}</span>
                        </p>
                      </div>
                    )}

                    {seniorNcoNotRating && (
                      <div className="p-3 bg-rose-950/80 border border-rose-500/80 rounded-md text-xs text-rose-200 space-y-1.5 shadow-md">
                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 animate-pulse" />
                          <span>Senior NCO Not Rating Anyone</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-250/95 font-medium">
                          As a {selectedNode.rank}, this Senior NCO is expected to be assigned as a rater in this rating scheme. Currently, they are not rating any Soldier.
                        </p>
                      </div>
                    )}

                    {(twoRanksAboveRater || sameRankRater) && (
                      <div className="p-3 bg-rose-950/80 border border-rose-500/80 rounded-md text-xs text-rose-200 space-y-1.5 shadow-md">
                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 animate-pulse" />
                          <span>Rater Rank Discrepancy</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-250/95 font-medium">
                          {twoRanksAboveRater || sameRankRater}
                        </p>
                      </div>
                    )}

                    {/* Assigned Hierarchy */}
                    <div className="space-y-2 pt-3 border-t border-slate-800">
                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Hierarchy</h5>
                      
                      <div className={`p-2.5 bg-slate-850 border-l-4 border-emerald-500 rounded text-xs transition-all ${isRaterDiff ? "ring-1 ring-yellow-400 bg-yellow-400/5" : ""}`}>
                        <div className="flex justify-between items-center">
                          <div className="text-slate-400 font-bold uppercase text-[8px]">Rater (Direct)</div>
                          {isRaterDiff && <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider">Projected Change</span>}
                        </div>
                        <div className="font-bold text-slate-200 mt-0.5">{getRaterName(selectedNode.raterId)}</div>
                        {selectedNode.raterEffectiveDate && (
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">Eff: {selectedNode.raterEffectiveDate}</div>
                        )}
                      </div>

                      <div className={`p-2.5 bg-slate-850 rounded text-xs border-l-4 transition-all ${seniorRaterMismatch ? "border-rose-500 bg-rose-950/30 ring-1 ring-rose-500/50" : "border-indigo-500"} ${isSeniorRaterDiff ? "ring-2 ring-yellow-400 ring-inset bg-yellow-400/5" : ""}`}>
                        <div className="flex justify-between items-center">
                          <div className="text-slate-400 font-bold uppercase text-[8px]">Senior Rater</div>
                          {isSeniorRaterDiff && !seniorRaterMismatch && <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider">Projected Change</span>}
                          {seniorRaterMismatch && <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">Mismatch</span>}
                        </div>
                        <div className="font-bold text-slate-200 mt-0.5">{getRaterName(selectedNode.seniorRaterId)}</div>
                        {selectedNode.seniorRaterEffectiveDate && (
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">Eff: {selectedNode.seniorRaterEffectiveDate}</div>
                        )}
                        {seniorRaterMismatch && (
                          <div className="text-[10px] text-rose-300 font-semibold mt-1 bg-rose-900/60 p-1 rounded border border-rose-800">
                            Expected: {seniorRaterMismatch.expectedName}
                          </div>
                        )}
                      </div>

                      <div className={`p-2.5 bg-slate-850 rounded text-xs border-l-4 transition-all ${reviewerMismatch ? "border-purple-500 bg-purple-950/30 ring-1 ring-purple-500/50" : "border-slate-400"} ${isReviewerDiff ? "ring-2 ring-yellow-400 ring-inset bg-yellow-400/5" : ""}`}>
                        <div className="flex justify-between items-center">
                          <div className="text-slate-400 font-bold uppercase text-[8px]">Reviewer</div>
                          {isReviewerDiff && !reviewerMismatch && <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider">Projected Change</span>}
                          {reviewerMismatch && <span className="text-[9px] text-purple-400 font-bold uppercase tracking-wider">Required</span>}
                        </div>
                        <div className="font-bold text-slate-200 mt-0.5">{getRaterName(selectedNode.reviewerId)}</div>
                        {selectedNode.reviewerEffectiveDate && (
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">Eff: {selectedNode.reviewerEffectiveDate}</div>
                        )}
                        {reviewerMismatch && (
                          <div className="text-[10px] text-purple-300 font-semibold mt-1 bg-purple-900/60 p-1 rounded border border-purple-800">
                            Expected: {reviewerMismatch.expectedName}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Interactions Guide (Added to consolidated panel) */}
                    <div className="border-t border-slate-800 pt-3 space-y-2">
                      <span className="font-bold text-slate-400 uppercase text-[9px] tracking-widest">Guide:</span>
                      <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-500 leading-relaxed">
                        <li>Hover cards to highlight rater network.</li>
                        <li>Hold Ctrl/Cmd + scroll wheel to zoom.</li>
                        <li>Drag the canvas to pan view.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex gap-2 shrink-0">
                  {!readOnly ? (
                    <>
                      <button
                        onClick={() => onEditClick(selectedNode)}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors"
                      >
                        Edit Profile
                      </button>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="py-2 px-3 border border-slate-800 hover:bg-slate-800 rounded text-xs font-semibold text-slate-400 hover:text-slate-200"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="flex-1 py-2 border border-slate-800 hover:bg-slate-800 rounded text-xs font-semibold text-slate-400 hover:text-slate-200"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

        </div>
          
        </div>
      </div>
  </div>
);
}
