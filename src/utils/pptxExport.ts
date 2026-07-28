/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import pptxgen from "pptxgenjs";
import { ArmyRatingRecord, RatingRole } from "../types";
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
export function exportToPPTX(records: ArmyRatingRecord[], titleText: string = "Army Rating Scheme", chartDate: string = "") {
  // Organize the chart data using our layout logic
  const organized = organizeChartData(records);

  const formattedChartDate = formatArmyDate(chartDate);

  // Constants and settings for slide layout (in inches)
  const marginX = 0.2;
  const colGap = 0.04;
  const groupGap = 0.08;
  const laneGap = 0.05;
  const cardSubGapPreferred = 0.015; // optimal gap between cards placed side-by-side
  const wCardPreferred = 0.35; // optimal comfortable card width

  // Calculate minimum required width for each column to guarantee NO collision
  const getColMinWidth = (col: any): number => {
    const numLanes = col.lanes.length;
    if (numLanes === 0) {
      return 0.8; // default column width to make text readable
    }
    let maxLaneWidth = wCardPreferred;
    col.lanes.forEach((lane: any) => {
      const numSubs = lane.subordinates.length;
      const laneWidth = Math.max(wCardPreferred, numSubs * wCardPreferred + (numSubs - 1) * cardSubGapPreferred);
      if (laneWidth > maxLaneWidth) {
        maxLaneWidth = laneWidth;
      }
    });
    const colWidth = numLanes * maxLaneWidth + (numLanes - 1) * laneGap;
    return Math.max(0.8, colWidth);
  };

  // Compute minimum widths for all columns
  organized.groups.forEach((group) => {
    group.columns.forEach((col: any) => {
      col.minWidth = getColMinWidth(col);
    });
  });
  organized.directColumns.forEach((col: any) => {
    col.minWidth = getColMinWidth(col);
  });

  // Now, calculate group minimum widths
  const groupMinWidths = organized.groups.map(group => {
    if (group.columns.length === 0) return 1.0;
    const sumCols = group.columns.reduce((sum: number, col: any) => sum + col.minWidth, 0);
    return sumCols + colGap * (group.columns.length - 1);
  });

  const directColsMinWidth = organized.directColumns.length > 0
    ? organized.directColumns.reduce((sum: number, col: any) => sum + col.minWidth, 0) + colGap * (organized.directColumns.length - 1)
    : 0;

  // Calculate total minimum available width needed
  const numGroups = organized.groups.length;
  const numLogicalGroups = numGroups + (organized.directColumns.length > 0 ? 1 : 0);
  const totalGroupGaps = groupGap * (numLogicalGroups - 1);
  const totalMinAvailableWidth = groupMinWidths.reduce((sum, w) => sum + w, 0) + directColsMinWidth + totalGroupGaps;

  // Set slide width dynamically: at least 18 inches, scaling wider to perfectly fit everyone up to 55 inches
  const slideWidth = Math.min(55, Math.max(18, Math.ceil((totalMinAvailableWidth + marginX * 2) * 10) / 10));
  const slideHeight = 7.5;
  const availableWidth = slideWidth - (marginX * 2);

  // Initialize PPTX presentation with our dynamically computed layout width
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "CUSTOM_LAYOUT", width: slideWidth, height: slideHeight });
  pptx.layout = "CUSTOM_LAYOUT";

  // Add slide
  const slide = pptx.addSlide();

  // Heights of rows - increased to make the canvas feel larger and less squeezed
  const rowHeight = 0.45;
  const rowGap = 0.08;

  // Calculate sum of minWidths of all columns
  let totalColsMinWidthSum = 0;
  organized.groups.forEach(g => {
    g.columns.forEach((c: any) => {
      totalColsMinWidthSum += c.minWidth;
    });
  });
  organized.directColumns.forEach((c: any) => {
    totalColsMinWidthSum += c.minWidth;
  });

  // Determine scaling factor
  // availableWidth = totalColsMinWidthSum * scaleFactor + gaps
  // Since gaps are also scaled, we can solve for scaleFactor:
  // availableWidth = (totalColsMinWidthSum + totalMinGapsSum) * scaleFactor
  // But wait, the previous logic was: totalColWidthsAvailable = availableWidth - gaps
  // Let's keep it simple: scaleFactor = availableWidth / totalMinAvailableWidth
  const colScaleFactor = totalMinAvailableWidth > 0 ? (availableWidth / totalMinAvailableWidth) : 1;
  const scaleLimit = Math.min(1, colScaleFactor);

  const scaledColGap = colGap * scaleLimit;
  const scaledGroupGap = groupGap * scaleLimit;
  const scaledLaneGap = laneGap * scaleLimit;

  // Determine sum of gaps on the slide to find available column width
  let totalColGapsSum = 0;
  organized.groups.forEach(g => {
    if (g.columns.length > 0) {
      totalColGapsSum += scaledColGap * (g.columns.length - 1);
    }
  });
  if (organized.directColumns.length > 0) {
    totalColGapsSum += scaledColGap * (organized.directColumns.length - 1);
  }

  const totalGroupGapsSum = scaledGroupGap * (Math.max(0, numLogicalGroups - 1));
  const totalGapsWidth = totalGroupGapsSum + totalColGapsSum;
  const totalColWidthsAvailable = availableWidth - totalGapsWidth;

  const wCard = wCardPreferred * scaleLimit;
  const cardSubGap = cardSubGapPreferred * scaleLimit;
  const cardFontSize = wCard < 0.18 ? 5.5 : wCard < 0.24 ? 6.5 : 7.5;

  // Row Y positions
  const yOic = 0.2;
  const yElementLeader = yOic + rowHeight + rowGap; // 0.2 + 0.45 + 0.08 = 0.73
  const yGroupLeader = yElementLeader + rowHeight + rowGap; // 0.73 + 0.45 + 0.08 = 1.26
  const yColHeader = yGroupLeader + rowHeight + rowGap; // 1.26 + 0.45 + 0.08 = 1.79
  const yVerticalStackStart = yColHeader + rowHeight + rowGap; // 1.79 + 0.45 + 0.08 = 2.32

  // Space left for vertical stacks and legend
  // We place the Legend at Y: 6.8 to 7.3 inches
  const legendY = 6.85;
  const legendTitleY = 6.45;
  const maxVerticalHeight = legendTitleY - yVerticalStackStart - 0.15; // ~3.98 inches

  // Split the vertical area into exactly 2 rows of vertical cards (non-musicians on top, musicians on bottom)
  const cardRowGap = 0.1;
  const cardHeight = (maxVerticalHeight - cardRowGap) / 2; // ~1.94 inches each
  
  // Calculate allocated width for all columns
  organized.groups.forEach((group) => {
    group.columns.forEach((col: any) => {
      col.allocatedWidth = col.minWidth * colScaleFactor;
    });
  });
  organized.directColumns.forEach((col: any) => {
    col.allocatedWidth = col.minWidth * colScaleFactor;
  });

  // Calculate allocated group width function
  const getGroupAllocatedWidth = (g: any): number => {
    if (g.columns.length === 0) return 1.0;
    const colsWidthSum = g.columns.reduce((sum: number, col: any) => sum + col.allocatedWidth, 0);
    return colsWidthSum + colGap * (g.columns.length - 1);
  };

  // Calculate the exact total width occupied by the lower rows to center them and flush align OIC / Element Leader
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

    // Helper to draw a single column
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

    // 1. Draw Direct Support Columns
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

    // 2. Draw Group Leader Blocks
    organized.groups.forEach((group) => {
      const wGroup = getGroupAllocatedWidth(group);
      const xGroup = currentX;
      const leaderColors = getRoleColors(group.leader.role);
      const leaderDate = formatArmyDate(group.leader.thru);
      const customTitle = group.leader.role === RatingRole.KEY_LEADER && group.leader.keyLeaderTitle ? ` (${group.leader.keyLeaderTitle.toUpperCase()})` : "";
      const leaderLabel = `${group.leader.rank} ${group.leader.name}${customTitle}\n${leaderDate}`;

      // Draw Group Leader Box
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
  // Draw Legend Section Header
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

  // 4. Save/Export PPTX file
  // Using pptxgenjs write method to trigger a download in-browser
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
