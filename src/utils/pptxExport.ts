/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import pptxgen from "pptxgenjs";
import { ArmyRatingRecord, RatingRole, formatNameToLastFirstRank } from "../types";
import { organizeChartData, getRoleColors } from "./orgChartLayout";

// Helper to format date from YYYY-MM-DD to YYYYMMDD
function formatArmyDate(dateStr: string): string {
  if (!dateStr) return "";
  return dateStr.replace(/-/g, "");
}

/**
 * Exports the Army Rating Scheme records to a high-quality PowerPoint slide
 * that perfectly mirrors the layout in the user's reference image.
 */
/**
 * Calculates the slide width required for an org chart based on records.
 */
export function getRequiredSlideWidth(records: ArmyRatingRecord[]): number {
  if (!records || records.length === 0) return 18;
  const organized = organizeChartData(records);
  const marginX = 0.2;
  const colGap = 0.04;
  const groupGap = 0.08;
  const laneGap = 0.05;
  const cardSubGapPreferred = 0.015;
  const wCardPreferred = 0.35;

  const getColMinWidth = (col: any): number => {
    const numLanes = col.lanes.length;
    if (numLanes === 0) return 0.8;
    let maxLaneWidth = wCardPreferred;
    col.lanes.forEach((lane: any) => {
      const numSubs = lane.subordinates.length;
      const laneWidth = Math.max(wCardPreferred, numSubs * wCardPreferred + (numSubs - 1) * cardSubGapPreferred);
      if (laneWidth > maxLaneWidth) maxLaneWidth = laneWidth;
    });
    return Math.max(0.8, numLanes * maxLaneWidth + (numLanes - 1) * laneGap);
  };

  organized.groups.forEach((group) => {
    group.columns.forEach((col: any) => { col.minWidth = getColMinWidth(col); });
  });
  organized.directColumns.forEach((col: any) => { col.minWidth = getColMinWidth(col); });

  const groupMinWidths = organized.groups.map(group => {
    if (group.columns.length === 0) return 1.0;
    return group.columns.reduce((sum: number, col: any) => sum + col.minWidth, 0) + colGap * (group.columns.length - 1);
  });

  const directColsMinWidth = organized.directColumns.length > 0
    ? organized.directColumns.reduce((sum: number, col: any) => sum + col.minWidth, 0) + colGap * (organized.directColumns.length - 1)
    : 0;

  const numGroups = organized.groups.length;
  const numLogicalGroups = numGroups + (organized.directColumns.length > 0 ? 1 : 0);
  const totalGroupGaps = groupGap * (numLogicalGroups - 1);
  const totalMinAvailableWidth = groupMinWidths.reduce((sum, w) => sum + w, 0) + directColsMinWidth + totalGroupGaps;

  return Math.min(55, Math.max(18, Math.ceil((totalMinAvailableWidth + marginX * 2) * 10) / 10));
}

/**
 * Draws a single org chart bubble map slide on an existing pptx instance.
 */
export function drawOrgChartSlide(
  pptx: any, 
  records: ArmyRatingRecord[], 
  titleText: string = "Army Rating Scheme", 
  chartDate: string = "",
  customSlideWidth?: number
) {
  const organized = organizeChartData(records);
  const formattedChartDate = formatArmyDate(chartDate);

  const marginX = 0.2;
  const colGap = 0.04;
  const groupGap = 0.08;
  const laneGap = 0.05;
  const cardSubGapPreferred = 0.015;
  const wCardPreferred = 0.35;

  const getColMinWidth = (col: any): number => {
    const numLanes = col.lanes.length;
    if (numLanes === 0) return 0.8;
    let maxLaneWidth = wCardPreferred;
    col.lanes.forEach((lane: any) => {
      const numSubs = lane.subordinates.length;
      const laneWidth = Math.max(wCardPreferred, numSubs * wCardPreferred + (numSubs - 1) * cardSubGapPreferred);
      if (laneWidth > maxLaneWidth) maxLaneWidth = laneWidth;
    });
    return Math.max(0.8, numLanes * maxLaneWidth + (numLanes - 1) * laneGap);
  };

  organized.groups.forEach((group) => {
    group.columns.forEach((col: any) => { col.minWidth = getColMinWidth(col); });
  });
  organized.directColumns.forEach((col: any) => { col.minWidth = getColMinWidth(col); });

  const groupMinWidths = organized.groups.map(group => {
    if (group.columns.length === 0) return 1.0;
    const sumCols = group.columns.reduce((sum: number, col: any) => sum + col.minWidth, 0);
    return sumCols + colGap * (group.columns.length - 1);
  });

  const directColsMinWidth = organized.directColumns.length > 0
    ? organized.directColumns.reduce((sum: number, col: any) => sum + col.minWidth, 0) + colGap * (organized.directColumns.length - 1)
    : 0;

  const numGroups = organized.groups.length;
  const numLogicalGroups = numGroups + (organized.directColumns.length > 0 ? 1 : 0);
  const totalGroupGaps = groupGap * (numLogicalGroups - 1);
  const totalMinAvailableWidth = groupMinWidths.reduce((sum, w) => sum + w, 0) + directColsMinWidth + totalGroupGaps;

  const slideWidth = customSlideWidth || Math.min(55, Math.max(18, Math.ceil((totalMinAvailableWidth + marginX * 2) * 10) / 10));
  const availableWidth = slideWidth - (marginX * 2);

  const slide = pptx.addSlide();

  if (records.length === 0) {
    slide.addText(`${titleText.toUpperCase()}`, {
      x: marginX,
      y: 0.3,
      w: availableWidth,
      h: 0.5,
      fontSize: 16,
      fontFace: "Inter",
      color: "1E293B",
      bold: true,
      align: "center"
    });
    slide.addText("No rating scheme records found for this profile.", {
      x: marginX,
      y: 3.0,
      w: availableWidth,
      h: 1.0,
      fontSize: 14,
      color: "64748B",
      align: "center",
      italic: true
    });
    return;
  }

  const rowHeight = 0.45;
  const rowGap = 0.08;

  const colScaleFactor = totalMinAvailableWidth > 0 ? (availableWidth / totalMinAvailableWidth) : 1;
  const scaleLimit = Math.min(1, colScaleFactor);

  const scaledColGap = colGap * scaleLimit;
  const scaledGroupGap = groupGap * scaleLimit;
  const scaledLaneGap = laneGap * scaleLimit;

  const wCard = wCardPreferred * scaleLimit;
  const cardSubGap = cardSubGapPreferred * scaleLimit;
  const cardFontSize = wCard < 0.18 ? 5.5 : wCard < 0.24 ? 6.5 : 7.5;

  const yOic = 0.2;
  const yElementLeader = yOic + rowHeight + rowGap;
  const yGroupLeader = yElementLeader + rowHeight + rowGap;
  const yColHeader = yGroupLeader + rowHeight + rowGap;
  const yVerticalStackStart = yColHeader + rowHeight + rowGap;

  const legendY = 6.85;
  const legendTitleY = 6.45;
  const maxVerticalHeight = legendTitleY - yVerticalStackStart - 0.15;

  const cardRowGap = 0.1;
  const cardHeight = (maxVerticalHeight - cardRowGap) / 2;

  organized.groups.forEach((group) => {
    group.columns.forEach((col: any) => {
      col.allocatedWidth = col.minWidth * colScaleFactor;
    });
  });
  organized.directColumns.forEach((col: any) => {
    col.allocatedWidth = col.minWidth * colScaleFactor;
  });

  const getGroupAllocatedWidth = (g: any): number => {
    if (g.columns.length === 0) return 1.0;
    const colsWidthSum = g.columns.reduce((sum: number, col: any) => sum + col.allocatedWidth, 0);
    return colsWidthSum + colGap * (g.columns.length - 1);
  };

  let totalDrawnWidth = 0;
  if (organized.directColumns.length > 0) {
    const directColsWidth = organized.directColumns.reduce((sum: number, col: any) => sum + col.allocatedWidth, 0) + scaledColGap * (Math.max(0, organized.directColumns.length - 1));
    totalDrawnWidth += directColsWidth;
  }
  if (organized.groups.length > 0) {
    const groupsWidth = organized.groups.reduce((sum: number, g: any) => sum + getGroupAllocatedWidth(g), 0) + scaledGroupGap * (Math.max(0, organized.groups.length - 1));
    if (organized.directColumns.length > 0) {
      totalDrawnWidth += scaledGroupGap + groupsWidth;
    } else {
      totalDrawnWidth = groupsWidth;
    }
  }

  const actualW = totalDrawnWidth > 0 ? totalDrawnWidth : availableWidth;
  const startX = totalDrawnWidth > 0 ? marginX + (availableWidth - totalDrawnWidth) / 2 : marginX;

  // Header Title Text at top if provided
  if (titleText && titleText !== "Army Rating Scheme") {
    let headerText = titleText.toUpperCase();
    if (chartDate && !headerText.includes("CURRENT AS OF") && !headerText.includes("PROJECTED")) {
      headerText = `${headerText} CURRENT AS OF ${chartDate.toUpperCase()}`;
    }

    slide.addText(headerText, {
      x: marginX,
      y: 0.01,
      w: availableWidth,
      h: 0.18,
      fontSize: 8.5,
      fontFace: "Inter",
      color: "334155",
      bold: true,
      align: "center"
    });
  }

  // --- Draw Row 1: OIC ---
  if (organized.oic) {
    const oic = organized.oic;
    const colors = getRoleColors(oic.role);
    const dateToUse = formatArmyDate(oic.thru);
    const label = `${oic.rank} ${oic.name}\n${dateToUse}`;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: startX,
      y: yOic,
      w: actualW,
      h: rowHeight,
      fill: { color: colors.hexBg },
      line: { color: colors.hexBorder, width: 1 }
    });

    slide.addText(label, {
      x: startX,
      y: yOic,
      w: actualW,
      h: rowHeight,
      align: "center",
      valign: "middle",
      fontSize: 11,
      fontFace: "Inter",
      color: colors.hexText,
      bold: true,
      margin: 0,
      autoFit: true
    });
  }

  // --- Draw Row 2: Element Leader ---
  if (organized.elementLeader) {
    const leader = organized.elementLeader;
    const colors = getRoleColors(leader.role);
    const dateToUse = formatArmyDate(leader.thru);
    const label = `${leader.rank} ${leader.name}\n${dateToUse}`;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: startX,
      y: yElementLeader,
      w: actualW,
      h: rowHeight,
      fill: { color: colors.hexBg },
      line: { color: colors.hexBorder, width: 1 }
    });

    slide.addText(label, {
      x: startX,
      y: yElementLeader,
      w: actualW,
      h: rowHeight,
      align: "center",
      valign: "middle",
      fontSize: 11,
      fontFace: "Inter",
      color: colors.hexText,
      bold: true,
      margin: 0,
      autoFit: true
    });
  }

  // --- Draw Row 3, 4, 5+: Groups & Subordinates ---
  if (organized.groups.length > 0 || organized.directColumns.length > 0) {
    let currentX = startX;

    const drawColumn = (col: any, xCol: number, wCol: number) => {
      const headerColors = getRoleColors(col.header.role);
      const dateToUse = formatArmyDate(col.header.thru);
      const headerLabel = `${col.header.rank} ${col.header.name}\n${dateToUse}`;

      slide.addShape(pptx.ShapeType.roundRect, {
        x: xCol,
        y: yColHeader,
        w: wCol,
        h: rowHeight,
        fill: { color: headerColors.hexBg },
        line: { color: headerColors.hexBorder, width: 1 }
      });

      slide.addText(headerLabel, {
        x: xCol,
        y: yColHeader,
        w: wCol,
        h: rowHeight,
        align: "center",
        valign: "middle",
        fontSize: 8,
        fontFace: "Inter",
        color: headerColors.hexText,
        bold: true,
        margin: 0,
        autoFit: true
      });

      const numLanes = col.lanes.length;
      if (numLanes > 0) {
        const laneSpace = (wCol - scaledLaneGap * (numLanes - 1)) / numLanes;

        col.lanes.forEach((lane: any, lIndex: number) => {
          const xLane = xCol + lIndex * (laneSpace + scaledLaneGap);
          const leader = lane.laneLeader;
          const leaderColors = getRoleColors(leader.role);
          const leaderDate = formatArmyDate(leader.thru);
          const leaderLabel = `${leader.rank} ${leader.name}\n${leaderDate}`;

          const xLeader = xLane + (laneSpace - wCard) / 2;
          const yLeader = yVerticalStackStart;

          slide.addShape(pptx.ShapeType.roundRect, {
            x: xLeader,
            y: yLeader,
            w: wCard,
            h: cardHeight,
            fill: { color: leaderColors.hexBg },
            line: { color: "000000", width: 1 }
          });

          const centerLeaderX = xLeader + wCard / 2;
          const centerLeaderY = yLeader + cardHeight / 2;
          const textW = cardHeight;
          const textH = wCard;
          const textX = centerLeaderX - textW / 2;
          const textY = centerLeaderY - textH / 2;

          slide.addText(leaderLabel, {
            x: textX,
            y: textY,
            w: textW,
            h: textH,
            align: "center",
            valign: "middle",
            fontSize: cardFontSize,
            fontFace: "Inter",
            color: leaderColors.hexText,
            bold: true,
            rotate: 270,
            margin: 0,
            autoFit: true
          });

          const numSubs = lane.subordinates.length;
          if (numSubs > 0) {
            const totalSubsWidth = numSubs * wCard + (numSubs - 1) * cardSubGap;
            const xSubsStart = xLane + (laneSpace - totalSubsWidth) / 2;

            lane.subordinates.forEach((sub: any, sIndex: number) => {
              const xSub = xSubsStart + sIndex * (wCard + cardSubGap);
              const ySub = yVerticalStackStart + cardHeight + cardRowGap;
              const subColors = getRoleColors(sub.role);
              const subDate = formatArmyDate(sub.thru);
              const subLabel = `${sub.rank} ${sub.name}\n${subDate}`;

              slide.addShape(pptx.ShapeType.roundRect, {
                x: xSub,
                y: ySub,
                w: wCard,
                h: cardHeight,
                fill: { color: subColors.hexBg },
                line: { color: "000000", width: 1 }
              });

              const centerSubX = xSub + wCard / 2;
              const centerSubY = ySub + cardHeight / 2;
              const textSubW = cardHeight;
              const textSubH = wCard;
              const textSubX = centerSubX - textSubW / 2;
              const textSubY = centerSubY - textSubH / 2;

              slide.addText(subLabel, {
                x: textSubX,
                y: textSubY,
                w: textSubW,
                h: textSubH,
                align: "center",
                valign: "middle",
                fontSize: cardFontSize,
                fontFace: "Inter",
                color: subColors.hexText,
                bold: true,
                rotate: 270,
                margin: 0,
                autoFit: true
              });
            });
          }
        });
      }
    };

    if (organized.directColumns.length > 0) {
      let colX = currentX;
      organized.directColumns.forEach((col: any) => {
        const wCol = col.allocatedWidth;
        drawColumn(col, colX, wCol);
        colX += wCol + scaledColGap;
      });
      
      const directColsAllocatedWidth = organized.directColumns.reduce((sum: number, col: any) => sum + col.allocatedWidth, 0) + scaledColGap * (Math.max(0, organized.directColumns.length - 1));
      currentX += directColsAllocatedWidth + scaledGroupGap;
    }

    organized.groups.forEach((group) => {
      const wGroup = getGroupAllocatedWidth(group);
      const xGroup = currentX;
      const leaderColors = getRoleColors(group.leader.role);
      const leaderDate = formatArmyDate(group.leader.thru);
      const customTitle = group.leader.role === RatingRole.KEY_LEADER && group.leader.keyLeaderTitle ? ` (${group.leader.keyLeaderTitle.toUpperCase()})` : "";
      const leaderLabel = `${group.leader.rank} ${group.leader.name}${customTitle}\n${leaderDate}`;

      slide.addShape(pptx.ShapeType.roundRect, {
        x: xGroup,
        y: yGroupLeader,
        w: wGroup,
        h: rowHeight,
        fill: { color: leaderColors.hexBg },
        line: { color: leaderColors.hexBorder, width: 1 }
      });

      slide.addText(leaderLabel, {
        x: xGroup,
        y: yGroupLeader,
        w: wGroup,
        h: rowHeight,
        align: "center",
        valign: "middle",
        fontSize: 9,
        fontFace: "Inter",
        color: leaderColors.hexText,
        bold: true,
        margin: 0,
        autoFit: true
      });

      let colX = xGroup;
      group.columns.forEach((col: any) => {
        const wCol = col.allocatedWidth;
        drawColumn(col, colX, wCol);
        colX += wCol + scaledColGap;
      });

      currentX += wGroup + scaledGroupGap;
    });
  }

  // --- Draw LEGEND ---
  slide.addText("LEGEND", {
    x: marginX,
    y: legendTitleY,
    w: availableWidth,
    h: 0.3,
    align: "center",
    valign: "middle",
    fontSize: 12,
    fontFace: "Inter",
    color: "000000",
    bold: true
  });

  const legendRoles = [
    { name: "OIC", role: RatingRole.OIC },
    { name: "Element Leader", role: RatingRole.ELEMENT_LEADER },
    { name: "Group Leader", role: RatingRole.GROUP_LEADER },
    { name: "Key Leader", role: RatingRole.KEY_LEADER },
    { name: "Section Leader", role: RatingRole.SECTION_LEADER },
    { name: "Master Musician", role: RatingRole.MASTER_MUSICIAN },
    { name: "Senior Musician", role: RatingRole.SENIOR_MUSICIAN },
    { name: "Senior Support", role: RatingRole.SENIOR_SUPPORT_MUSICIAN },
    { name: "Musician", role: RatingRole.MUSICIAN },
    { name: "Support", role: RatingRole.SUPPORT_MUSICIAN }
  ];

  const legendItemW = 1.15;
  const legendGap = 0.08;
  const totalLegendW = (legendRoles.length * legendItemW) + ((legendRoles.length - 1) * legendGap);
  const legendStartX = (slideWidth - totalLegendW) / 2;

  legendRoles.forEach((item, index) => {
    const xItem = legendStartX + index * (legendItemW + legendGap);
    const colors = getRoleColors(item.role);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: xItem,
      y: legendY,
      w: legendItemW,
      h: 0.35,
      fill: { color: colors.hexBg },
      line: { color: colors.hexBorder, width: 1 }
    });

    slide.addText(item.name, {
      x: xItem,
      y: legendY,
      w: legendItemW,
      h: 0.35,
      align: "center",
      valign: "middle",
      fontSize: 8,
      fontFace: "Inter",
      color: colors.hexText,
      bold: true,
      margin: 0,
      autoFit: true
    });
  });
}

/**
 * Exports single profile Army Rating Scheme to PowerPoint
 */
export function exportToPPTX(records: ArmyRatingRecord[], titleText: string = "Army Rating Scheme", chartDate: string = "") {
  const reqWidth = getRequiredSlideWidth(records);
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "CUSTOM_LAYOUT", width: reqWidth, height: 7.5 });
  pptx.layout = "CUSTOM_LAYOUT";

  drawOrgChartSlide(pptx, records, titleText, chartDate, reqWidth);

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const sanitizedProfileName = titleText
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  const filename = `${sanitizedProfileName}_${dateStr}_ORG_CHART.pptx`;
  pptx.writeFile({ fileName: filename });
}

/**
 * Exports PowerPoint bubble map org chart for multiple profiles (one profile per slide)
 */
export function exportMultiProfileBubbleMapToPPTX(
  profilesData: { schemeName: string; records: ArmyRatingRecord[]; slideTitle?: string }[],
  rosterTypeTitle: string = "Current Roster"
) {
  let maxRequiredWidth = 18;
  profilesData.forEach(p => {
    if (p.records && p.records.length > 0) {
      const w = getRequiredSlideWidth(p.records);
      if (w > maxRequiredWidth) maxRequiredWidth = w;
    }
  });

  const pptx = new pptxgen();
  pptx.defineLayout({ name: "CUSTOM_LAYOUT", width: maxRequiredWidth, height: 7.5 });
  pptx.layout = "CUSTOM_LAYOUT";

  const todayStr = new Date().toISOString().split("T")[0];

  profilesData.forEach(p => {
    const isProjected = rosterTypeTitle.toLowerCase().includes("projected");
    const defaultTitle = isProjected
      ? `${p.schemeName} PROJECTED ${todayStr}`
      : `${p.schemeName} CURRENT AS OF ${todayStr}`;
    const slideTitle = p.slideTitle || defaultTitle;

    drawOrgChartSlide(
      pptx,
      p.records,
      slideTitle,
      "",
      maxRequiredWidth
    );
  });

  const dateTag = new Date().toISOString().split("T")[0];
  const sanitizedTitle = rosterTypeTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
  pptx.writeFile({ fileName: `Combined_All_Profiles_${sanitizedTitle}_Org_Charts_${dateTag}.pptx` });
}

/**
 * Exports NCOER status monitoring report categorizations to PowerPoint slides.
 */
export function exportNcoerReportToPPTX(
  allRecords: ArmyRatingRecord[],
  records: ArmyRatingRecord[],
  activeSchemeName: string = "ACTIVE RATING SCHEME"
) {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "REPORT_16x9", width: 13.33, height: 7.5 });
  pptx.layout = "REPORT_16x9";

  const now = new Date();
  now.setHours(0, 0, 0, 0);

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

  const getDaysRemainingText = (thruStr: string | undefined): string => {
    if (!thruStr) return "N/A";
    try {
      const thruDate = new Date(thruStr);
      thruDate.setHours(0, 0, 0, 0);
      const diffTime = thruDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return `${Math.abs(diffDays)}d OVERDUE`;
      } else if (diffDays === 0) {
        return "DUE TODAY";
      } else {
        return `${diffDays}d REMAINING`;
      }
    } catch {
      return "N/A";
    }
  };

  const add90Days = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 90);
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const findCurrentRecord = (rec: ArmyRatingRecord): ArmyRatingRecord => {
    const r = allRecords?.find(x => x.id === rec.id && (x.version || "current") === "current");
    return r || rec;
  };

  const helperGetName = (id: string) => {
    if (!id || id === "-") return "—";
    const rec = (allRecords || records).find(x => x.id === id);
    return rec ? formatNameToLastFirstRank(rec.name, rec.rank) : formatNameToLastFirstRank(id);
  };

  const baseReportItems: { record: ArmyRatingRecord; thru: string; isLate: boolean }[] = [];
  records.forEach(r => {
    const currentRec = findCurrentRecord(r);
    if (r.thru) {
      try {
        const thruDate = new Date(r.thru);
        thruDate.setHours(0, 0, 0, 0);
        const diffTime = thruDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          baseReportItems.push({
            record: r,
            thru: r.thru,
            isLate: false
          });
        }
      } catch (e) {}
    }
    if (currentRec.priorThru) {
      baseReportItems.push({
        record: r,
        thru: currentRec.priorThru,
        isLate: true
      });
    }
  });

  baseReportItems.sort((a, b) => {
    const dateA = new Date(a.thru).getTime() || 0;
    const dateB = new Date(b.thru).getTime() || 0;
    return dateA - dateB;
  });

  const categories = [
    { id: "30plus_not_submitted", name: "30+ Days Past Thru (Not Submitted)" },
    { id: "reviewing", name: "Reviewing (HR / CSM)" },
    { id: "signatures_edits", name: "Out for Signatures / Returned for Edits" },
    { id: "0_29_past", name: "0 to 29 Days Past Thru (Not Submitted)" },
    { id: "late_hqda", name: "Late to HQDA" }
  ];

  function drawSlideHeaderAndFooter(slide: any, filterName: string, isContinued: boolean, totalSoldiers?: number) {
    // Slate Banner background
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 1.0,
      fill: { color: "1E293B" }
    });

    // Gold line under banner
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 1.0,
      w: 13.33,
      h: 0.08,
      fill: { color: "F59E0B" }
    });

    // Header Text - Adjusted layout to support subtext cleanly
    slide.addText(`NCOER REPORT — ${filterName.toUpperCase()}${isContinued ? " (CONTINUED)" : ""}`, {
      x: 0.5,
      y: 0.1,
      w: 8.5,
      h: 0.5,
      color: "FFFFFF",
      fontSize: 13,
      bold: true,
      valign: "middle"
    });

    // Total soldiers under header title (if provided)
    if (totalSoldiers !== undefined) {
      slide.addText(`TOTAL NUMBER OF SOLDIERS: ${totalSoldiers}`, {
        x: 0.5,
        y: 0.60,
        w: 8.5,
        h: 0.35,
        color: "94A3B8", // slate-400
        fontSize: 8,
        bold: true,
        valign: "top"
      });
    }

    // Date
    const todayStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    slide.addText(`AS OF: ${todayStr.toUpperCase()}`, {
      x: 9.0,
      y: 0.15,
      w: 3.83,
      h: 0.7,
      color: "FBBF24",
      fontSize: 10,
      bold: true,
      align: "right",
      valign: "middle"
    });

    // Divider for footer
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: 7.0,
      w: 12.33,
      h: 0.02,
      fill: { color: "E2E8F0" }
    });

    // Footer Text Left
    slide.addText(`Active Rating Scheme: ${activeSchemeName}`, {
      x: 0.5,
      y: 7.05,
      w: 12.33,
      h: 0.3,
      color: "64748B",
      fontSize: 8.5,
      valign: "middle"
    });
  }

  categories.forEach(cat => {
    const filtered = baseReportItems.filter(item => {
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

      switch (cat.id) {
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

    // Sort filtered records: alphabetically by element first, then by alphabetical last name.
    filtered.sort((a, b) => {
      const elemA = (a.record.element || "").trim().toLowerCase();
      const elemB = (b.record.element || "").trim().toLowerCase();
      if (elemA !== elemB) {
        return elemA.localeCompare(elemB);
      }
      
      const formattedA = formatNameToLastFirstRank(a.record.name);
      const lastNameA = formattedA.split(",")[0].trim().toLowerCase();
      
      const formattedB = formatNameToLastFirstRank(b.record.name);
      const lastNameB = formattedB.split(",")[0].trim().toLowerCase();
      
      if (lastNameA !== lastNameB) {
        return lastNameA.localeCompare(lastNameB);
      }
      return formattedA.localeCompare(formattedB);
    });

    if (filtered.length === 0) {
      const slide = pptx.addSlide();
      drawSlideHeaderAndFooter(slide, cat.name, false);
      
      slide.addText("No records match this status category.", {
        x: 1.0,
        y: 3.2,
        w: 11.33,
        h: 1.0,
        align: "center",
        fontSize: 14,
        color: "64748B",
        bold: true
      });
      return;
    }

    // Calculate rank counts for this category's filtered items
    const rankCounts: Record<string, number> = {};
    filtered.forEach(item => {
      const r = item.record;
      const rk = r.rank || "Unknown";
      rankCounts[rk] = (rankCounts[rk] || 0) + 1;
    });

    const rankOrder = ["CSM", "SGM", "1SG", "MSG", "SFC", "SSG", "SGT"];
    const rankCountsStr = Object.entries(rankCounts)
      .sort((a, b) => {
        const idxA = rankOrder.indexOf(a[0]);
        const idxB = rankOrder.indexOf(b[0]);
        if (idxA === -1 && idxB === -1) return a[0].localeCompare(b[0]);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      })
      .map(([rank, count]) => `${rank}: ${count}`)
      .join("   |   ");

    const getStatusCellOptions = (status: string) => {
      const normalized = status.trim();
      if (normalized === "Not Submitted to HR" || normalized === "Late") {
        return { fill: "FFE4E6", color: "9F1239" }; // rose-100, rose-800
      } else if (
        normalized === "Submitted to HR" ||
        normalized.startsWith("Reviewing") ||
        normalized.includes("BN") ||
        normalized.includes("BDE") ||
        normalized.includes("HR") ||
        normalized.includes("CSM")
      ) {
        return { fill: "DBEAFE", color: "1E40AF" }; // blue-100, blue-800
      } else if (normalized === "Returned for Edits" || normalized === "Out for Signatures") {
        return { fill: "FEF3C7", color: "92400E" }; // amber-100, amber-800
      } else if (normalized === "Submitted to HQDA") {
        return { fill: "D1FAE5", color: "065F46" }; // emerald-100, emerald-800
      } else {
        return { fill: "F1F5F9", color: "334155" }; // slate-100, slate-800
      }
    };

    const chunkSize = 16;
    for (let i = 0; i < filtered.length; i += chunkSize) {
      const chunk = filtered.slice(i, i + chunkSize);
      const isContinued = i > 0;
      const slide = pptx.addSlide();
      drawSlideHeaderAndFooter(slide, cat.name, isContinued, filtered.length);

      const tableRows: any[] = [
        [
          { text: "Soldier (Rank / Name)", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "left", fontSize: 9 } },
          { text: "Element", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "left", fontSize: 9 } },
          { text: "Duty Title & MOSC", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "left", fontSize: 9 } },
          { text: "Thru Date (Days)", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "center", fontSize: 9 } },
          { text: "Rater", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "left", fontSize: 9 } },
          { text: "Senior Rater", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "left", fontSize: 9 } },
          { text: "NCOER Status", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "center", fontSize: 9 } },
          { text: "HQDA Due", options: { bold: true, color: "FFFFFF", fill: "1E293B", align: "right", fontSize: 9 } }
        ]
      ];

      chunk.forEach((item, index) => {
        const r = item.record;
        const currentRec = findCurrentRecord(r);
        const thruToUse = item.thru;
        const daysText = getDaysRemainingText(thruToUse);
        const isActuallyLate = item.isLate || currentRec.ncoerStatus === "Late" || !!currentRec.priorThru;
        const raterToUse = isActuallyLate && currentRec.lateRaterId ? currentRec.lateRaterId : r.raterId;
        const srToUse = isActuallyLate && currentRec.lateSeniorRaterId ? currentRec.lateSeniorRaterId : r.seniorRaterId;
        const hqdaDueStr = isActuallyLate ? (currentRec.priorDueHqda || add90Days(thruToUse)) : (r.dueHqda || add90Days(r.thru));

        const soldierText = `${r.rank} ${r.name}`;
        const elementText = r.element || "—";
        const dutyText = r.keyLeaderTitle ? `${r.role}\n(${r.keyLeaderTitle})\n[MOSC: ${r.dutyMosc || "—"}]` : `${r.role}\n[MOSC: ${r.dutyMosc || "—"}]`;
        const thruText = `${formatNiceDate(thruToUse)}\n(${daysText})`;
        const raterText = helperGetName(raterToUse);
        const srText = helperGetName(srToUse);
        
        let statusToDraw = r.ncoerStatus || "Not Submitted to HR";
        if (item.isLate) {
          statusToDraw = (currentRec.ncoerStatus && currentRec.ncoerStatus !== "-") ? currentRec.ncoerStatus : "Not Submitted to HR";
        }

        const hqdaText = formatNiceDate(hqdaDueStr);
        const bgHex = index % 2 === 1 ? "F8FAFC" : "FFFFFF";
        const statusOpts = getStatusCellOptions(statusToDraw);

        tableRows.push([
          { text: soldierText, options: { fill: bgHex, align: "left", fontSize: 8.5, bold: true, color: "1E293B" } },
          { text: elementText, options: { fill: bgHex, align: "left", fontSize: 8, color: "475569" } },
          { text: dutyText, options: { fill: bgHex, align: "left", fontSize: 7.5, color: "475569" } },
          { text: thruText, options: { fill: bgHex, align: "center", fontSize: 8, color: "1E293B", bold: true } },
          { text: raterText, options: { fill: bgHex, align: "left", fontSize: 8, color: "475569" } },
          { text: srText, options: { fill: bgHex, align: "left", fontSize: 8, color: "475569" } },
          { text: statusToDraw, options: { fill: statusOpts.fill, align: "center", fontSize: 8, bold: true, color: statusOpts.color } },
          { text: hqdaText, options: { fill: bgHex, align: "right", fontSize: 8, color: "64748B" } }
        ]);
      });

      slide.addTable(tableRows, {
        x: 0.5,
        y: 1.2,
        w: 12.33,
        colW: [2.1, 1.0, 1.9, 1.5, 1.7, 1.7, 1.4, 1.03],
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        margin: [2, 4, 2, 4],
        valign: "middle"
      });
    }
  });

  const sanitizedProfileName = activeSchemeName
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const filename = `${sanitizedProfileName}_NCOER_REPORT_${dateStr}.pptx`;
  pptx.writeFile({ fileName: filename });
}
