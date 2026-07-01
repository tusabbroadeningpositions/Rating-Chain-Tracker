/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { ArmyRatingRecord, RatingRole } from "../types";
import { organizeChartData, getRoleColors } from "../utils/orgChartLayout";
import { exportToPPTX } from "../utils/pptxExport";
import { ZoomIn, ZoomOut, Maximize2, FileDown, Printer, Info, User, ChevronRight, Calendar } from "lucide-react";

interface OrgChartPreviewProps {
  records: ArmyRatingRecord[];
  onEditClick: (record: ArmyRatingRecord) => void;
  readOnly?: boolean;
}

export default function OrgChartPreview({ records, onEditClick, readOnly = false }: OrgChartPreviewProps) {
  const [zoom, setZoom] = useState(0.95);
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayDate, setDisplayDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ArmyRatingRecord | null>(null);

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
    // Inside each lane, we have the lane leader and subordinates rendered side-by-side: <div className="flex gap-1 justify-center">
    const lanesWidth = col.lanes.reduce((sum: number, lane: any) => {
      const laneCardsCount = 1 + (lane.subordinates?.length || 0);
      const laneWidth = laneCardsCount * 36; // Each vertical card is 26px plus margin/padding spacing
      return sum + laneWidth;
    }, 0);
    // Add gaps between lanes (gap-4 is 16px)
    const totalColumnWidth = lanesWidth + (col.lanes.length - 1) * 16;
    return Math.max(180, totalColumnWidth);
  };

  // 1. Direct Support columns block width estimation
  const directColWidths = organized.directColumns.map(getColEstimatedWidth);
  const maxDirectColWidth = directColWidths.length > 0 ? Math.max(...directColWidths) : 0;
  const directColumnsBlockWidth = directColWidths.length > 0
    ? maxDirectColWidth * organized.directColumns.length + (organized.directColumns.length - 1) * 12 // gap-3 is 12px
    : 0;

  // 2. Main Group blocks width estimation
  const groupWidths = organized.groups.map(group => {
    const colWidths = group.columns.map(getColEstimatedWidth);
    const maxColWidth = colWidths.length > 0 ? Math.max(...colWidths) : 180;
    // All columns in a group occupy equal fraction of grid: repeat(cols, 1fr)
    // Therefore, the total width is the maxColWidth multiplied by the number of columns
    return maxColWidth * group.columns.length + (group.columns.length - 1) * 12; // gap-3 is 12px
  });

  // 3. Combined total blocks and gap widths
  const totalBlocksWidth = groupWidths.reduce((sum, w) => sum + w, 0) + directColumnsBlockWidth;
  const numBlocks = (organized.directColumns.length > 0 ? 1 : 0) + organized.groups.length;
  const totalGapsWidth = numBlocks > 1 ? (numBlocks - 1) * 16 : 0; // gap-4 is 16px
  const totalWidthNeeded = totalBlocksWidth + totalGapsWidth;

  // Use dynamic canvas width: minimum is 1400px (standard size), but scales wider up to exactly what is needed
  const dynamicCanvasWidth = Math.max(1400, Math.ceil(totalWidthNeeded + 60)); // Add a 60px safety margin

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
    exportToPPTX(records, "Rating_Scheme_Org_Chart", displayDate);
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
    if (!raterId) return "None";
    const r = records.find(rec => rec.id === raterId);
    return r ? `${r.rank} ${r.name}` : raterId;
  };

  return (
    <div className="space-y-4">
      
      {/* Control Panel */}
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

      {/* Visual Chart Area (Full Width) */}
      <div className="space-y-3">
          {/* Professional Disclaimer Note - Positioned directly above preview */}
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

          <div className="bg-slate-900 rounded p-5 border border-slate-950 overflow-hidden shadow-lg relative min-h-[600px] flex flex-col justify-between">
            {/* Scrollable View Wrapper */}
            <div 
              ref={containerRef}
              className="flex-1 overflow-hidden p-4 relative cursor-grab active:cursor-grabbing bg-slate-900/50"
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
              className="space-y-4 select-none origin-top inline-block"
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
                    <div
                      id={`card-${oic.id}`}
                      onMouseEnter={() => setHoveredNode(oic.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => setSelectedNode(oic)}
                      className={`w-full py-2.5 rounded-lg border text-center cursor-pointer transition-all ${roleColors.bg} ${roleColors.text} ${roleColors.border} ${
                        isHighlighted 
                          ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                          : "hover:scale-[1.002] hover:shadow"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase tracking-widest">{oic.rank} {oic.name}</div>
                      <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(oic)}</div>
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
                    <div
                      id={`card-${leader.id}`}
                      onMouseEnter={() => setHoveredNode(leader.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => setSelectedNode(leader)}
                      className={`w-full py-2.5 rounded-lg border text-center cursor-pointer transition-all ${roleColors.bg} ${roleColors.text} ${roleColors.border} ${
                        isHighlighted 
                          ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                          : "hover:scale-[1.002] hover:shadow"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase tracking-widest">{leader.rank} {leader.name}</div>
                      <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(leader)}</div>
                    </div>
                  );
                })()
              )}

              {/* Row 3: Group Leaders & Direct Support side-by-side */}
              <div className="flex gap-4">
                {(() => {
                  const groupWeights = organized.groups.map(g => Math.max(1, g.columns.length));
                  const directWeight = Math.max(0, organized.directColumns.length);
                  const totalWeight = groupWeights.reduce((sum, w) => sum + w, 0) + directWeight;

                  return (
                    <>
                       {/* Render Direct Support Columns (rated by OIC/Element Leader directly) */}
                      {organized.directColumns.length > 0 && (
                        <div 
                          className="space-y-4" 
                          style={{ 
                            width: `${(directColumnsBlockWidth / Math.max(1, totalBlocksWidth)) * 100}%`, 
                            flex: `${directColumnsBlockWidth} 0 0%` 
                          }}
                        >
                          {/* Placeholder/Spacer to align with Group Leader row height */}
                          <div className="h-[46px] invisible" />
                          
                          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${organized.directColumns.length}, minmax(0, 1fr))` }}>
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
                                      headerHighlighted 
                                        ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                        : "hover:scale-[1.005] hover:shadow"
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
                                                lHighlighted 
                                                  ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                                  : "hover:scale-[1.005] hover:shadow"
                                              }`}
                                            >
                                              <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                <div className="font-bold text-[9px] uppercase tracking-wider">{l.rank} {l.name}</div>
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
                                                        sHighlighted 
                                                          ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                                          : "hover:scale-[1.005] hover:shadow"
                                                      }`}
                                                    >
                                                      <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                        <div className="font-bold text-[9px] uppercase tracking-wider">{sub.rank} {sub.name}</div>
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
                            className="space-y-4" 
                            style={{ width: `${flexPercent}%`, flex: `${groupWidth} 0 0%` }}
                          >
                            <div
                              id={`card-${leader.id}`}
                              onMouseEnter={() => setHoveredNode(leader.id)}
                              onMouseLeave={() => setHoveredNode(null)}
                              onClick={() => setSelectedNode(leader)}
                              className={`w-full py-2.5 rounded-lg border text-center cursor-pointer transition-all ${roleColors.bg} ${roleColors.text} ${roleColors.border} ${
                                isHighlighted 
                                  ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                  : "hover:scale-[1.005] hover:shadow"
                              }`}
                            >
                              <div className="text-xs font-bold uppercase tracking-wider">{leader.rank} {leader.name}</div>
                              <div className="text-[10px] font-mono mt-0.5 opacity-90">{getRecordDate(leader)}</div>
                            </div>

                            {groupBlock.columns.length > 0 && (
                              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${groupBlock.columns.length}, minmax(0, 1fr))` }}>
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
                                          headerHighlighted 
                                            ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                            : "hover:scale-[1.005] hover:shadow"
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
                                                    leaderHighlighted 
                                                      ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                                      : "hover:scale-[1.005] hover:shadow"
                                                  }`}
                                                >
                                                  <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                    <div className="font-bold text-[9px] uppercase tracking-wider">{leader.rank} {leader.name}</div>
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
                                                            subHighlighted 
                                                              ? "ring-2 ring-amber-500 scale-[1.01] shadow-lg border-amber-500" 
                                                              : "hover:scale-[1.005] hover:shadow"
                                                          }`}
                                                        >
                                                          <div className="flex flex-col items-center justify-center text-center select-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                                            <div className="font-bold text-[9px] uppercase tracking-wider">{sub.rank} {sub.name}</div>
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
                    { name: "Musician", role: RatingRole.MUSICIAN }
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
          
        </div>
      </div>

      {/* Rating Chain Inspector (Full Width, below the chart) */}
      <div className="bg-white border border-slate-200 rounded p-4 space-y-4 print:hidden shadow-sm flex flex-col mt-4">
        <div className="p-2 border-b border-slate-200 bg-slate-50 flex justify-between items-center -mx-4 -mt-4 rounded-t">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            Rating Chain Inspector
          </h2>
        </div>
        
        {selectedNode ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Column 1: Active Soldier details */}
            <div className="space-y-3 flex flex-col justify-between">
              <div className="bg-slate-50/50 rounded border border-slate-200 p-3 space-y-2.5 shadow-inner flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Active Soldier</span>
                    <h3 className="text-sm font-bold text-slate-800 mt-0.5">{selectedNode.name}</h3>
                    <p className="text-xs text-slate-500 font-medium">{selectedNode.rank} • {selectedNode.role} ({selectedNode.dutyMosc})</p>
                  </div>
                  <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded">
                    {selectedNode.rank}
                  </span>
                </div>

                <div className="border-t border-slate-250 pt-2 text-xs space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Element:</span>
                    <span className="font-semibold text-slate-700">{selectedNode.element}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Principal Duty Title:</span>
                    <span className="font-semibold text-slate-700">{selectedNode.role}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Rating Period:</span>
                    <span className="font-semibold text-slate-700 font-mono">{selectedNode.from} to {selectedNode.thru}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                {!readOnly ? (
                  <>
                    <button
                      onClick={() => onEditClick(selectedNode)}
                      className="flex-1 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded text-xs font-bold transition-colors"
                      id="btn-detail-edit"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="py-1.5 px-3 border border-slate-200 hover:bg-slate-50 rounded text-xs font-semibold text-slate-500 hover:text-slate-700"
                      id="btn-detail-deselect"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="flex-1 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-xs font-semibold text-slate-500 hover:text-slate-700"
                    id="btn-detail-deselect"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </div>

            {/* Column 2: Rating Chain Cards (Hierarchy) */}
            <div className="space-y-2">
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assigned Hierarchy</h5>
              
              {/* Rater */}
              <div className="p-2.5 bg-white border-l-4 border-emerald-500 rounded-r border border-slate-200 text-xs shadow-sm flex justify-between items-center">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[9px]">Rater (Direct)</div>
                  <div className="font-bold text-slate-700 mt-0.5">{getRaterName(selectedNode.raterId)}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* Senior Rater */}
              <div className="p-2.5 bg-white border-l-4 border-indigo-500 rounded-r border border-slate-200 text-xs shadow-sm flex justify-between items-center">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[9px]">Senior Rater</div>
                  <div className="font-bold text-slate-700 mt-0.5">{getRaterName(selectedNode.seniorRaterId)}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* Reviewer */}
              <div className="p-2.5 bg-white border-l-4 border-slate-400 rounded-r border border-slate-200 text-xs shadow-sm flex justify-between items-center">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[9px]">Reviewer</div>
                  <div className="font-bold text-slate-700 mt-0.5">{getRaterName(selectedNode.reviewerId)}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            {/* Column 3: Interactions Guide & help */}
            <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6 space-y-2 text-xs text-slate-500 flex flex-col justify-center">
              <span className="font-bold text-slate-600 uppercase text-[10px]">Interactions Guide:</span>
              <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
                <li>Hover over a card in the org chart to highlight their immediate rater network.</li>
                <li>Vertical cards represent section musicians sorted by hierarchy.</li>
                <li>Hold <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-mono text-slate-600">Ctrl</kbd> or <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-mono text-slate-600">Cmd</kbd> + scroll wheel to zoom the chart.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2 text-center md:text-left py-4 px-4 space-y-3 text-slate-400">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <User className="w-8 h-8 stroke-[1.5] text-slate-300 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium leading-relaxed text-slate-500">
                    Click any soldier card in the org chart above to inspect their direct military rating chain and load details.
                  </p>
                  <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 mt-1.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-150">
                    <Calendar className="w-3 h-3 text-amber-500" />
                    Dates format as YYYYMMDD
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6 space-y-1 text-xs text-slate-500">
              <span className="font-bold text-slate-600 uppercase text-[10px]">Interactions Guide:</span>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
                <li>Hover over a card to highlight their immediate rater network.</li>
                <li>Vertical cards represent section musicians sorted by hierarchy.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
  </div>
);
}
