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
  const cardSubGap = 0.015; // gap between cards placed side-by-side
  const wCardPreferred = 0.35; // optimal comfortable card width

  // Let's first pre-calculate maxCardsInRow across all columns to find layout requirements
  let maxCardsInRow = 1;
  organized.groups.forEach((group) => {
    group.columns.forEach(col => {
      const numLanes = col.lanes.length;
      const totalSubs = col.lanes.reduce((sum, lane) => sum + lane.subordinates.length, 0);
      const maxColCards = Math.max(numLanes, totalSubs, 1);
      maxCardsInRow = Math.max(maxCardsInRow, maxColCards);
    });
  });

  if (organized.directColumns.length > 0) {
    organized.directColumns.forEach(col => {
      const numLanes = col.lanes.length;
      const totalSubs = col.lanes.reduce((sum, lane) => sum + lane.subordinates.length, 0);
      const maxColCards = Math.max(numLanes, totalSubs, 1);
      maxCardsInRow = Math.max(maxCardsInRow, maxColCards);
    });
  }

  // Calculate required minColWidth to fit maxCardsInRow side-by-side with no collision/crowding
  const minColWidthNeeded = Math.max(0.8, wCardPreferred * maxCardsInRow + cardSubGap * (maxCardsInRow - 1));

  // Determine weights to see how widths are distributed
  const numGroups = organized.groups.length;
  const numDirectCols = organized.directColumns.length;
  const numLogicalGroups = numGroups + (numDirectCols > 0 ? 1 : 0);
  const totalGroupGaps = groupGap * (numLogicalGroups - 1);

  const groupWeights = organized.groups.map(g => Math.max(1, g.columns.length));
  const directWeight = Math.max(0, numDirectCols);
  const totalWeight = Math.max(1, groupWeights.reduce((sum, w) => sum + w, 0) + directWeight);

  // Find maximum required available width among all column containers
  let maxAvailableWidthNeeded = 18 - (marginX * 2); // default minimum of 17.6 inches

  organized.groups.forEach((group) => {
    const numCols = group.columns.length;
    if (numCols > 0) {
      // wCol = weightUnitWidth - colGap * (1 - 1/numCols)
      // To ensure wCol >= minColWidthNeeded:
      // weightUnitWidth >= minColWidthNeeded + colGap * (1 - 1/numCols)
      const unitNeeded = minColWidthNeeded + colGap * (1 - 1 / numCols);
      const remainingNeeded = unitNeeded * totalWeight;
      const availableNeeded = remainingNeeded + totalGroupGaps;
      if (availableNeeded > maxAvailableWidthNeeded) {
        maxAvailableWidthNeeded = availableNeeded;
      }
    }
  });

  if (numDirectCols > 0) {
    const unitNeeded = minColWidthNeeded + colGap * (1 - 1 / numDirectCols);
    const remainingNeeded = unitNeeded * totalWeight;
    const availableNeeded = remainingNeeded + totalGroupGaps;
    if (availableNeeded > maxAvailableWidthNeeded) {
      maxAvailableWidthNeeded = availableNeeded;
    }
  }

  // Set slide width dynamically: at least 18 inches, scaling wider up to exactly what is needed to fit everyone
  // CAP at 55 inches to prevent Microsoft PowerPoint file corruption/repair errors (56 inches is the hard max limit of PPT)
  const slideWidth = Math.min(55, Math.max(18, Math.ceil((maxAvailableWidthNeeded + marginX * 2) * 10) / 10));
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

  // --- Find optimal uniform size for vertical cards dynamically on this actual slideWidth ---
  let minColWidth = 999;

  organized.groups.forEach((group) => {
    const numCols = group.columns.length;
    if (numCols > 0) {
      const remainingWidthForGroups = availableWidth - totalGroupGaps;
      const weightUnitWidth = remainingWidthForGroups / totalWeight;

      const groupWeight = Math.max(1, group.columns.length);
      const wGroup = weightUnitWidth * groupWeight;

      const totalColGaps = colGap * (numCols - 1);
      const wCol = (wGroup - totalColGaps) / numCols;
      if (wCol < minColWidth) {
        minColWidth = wCol;
      }
    }
  });

  // Also check directColumns for minColWidth
  if (organized.directColumns.length > 0) {
    const remainingWidthForGroups = availableWidth - totalGroupGaps;
    const weightUnitWidth = remainingWidthForGroups / totalWeight;
    const wDirectGroup = weightUnitWidth * directWeight;
    const wCol = (wDirectGroup - colGap * (directWeight - 1)) / directWeight;
    if (wCol < minColWidth) minColWidth = wCol;
  }

  if (minColWidth === 999) minColWidth = 1.0;

  const maxPossibleCardW = (minColWidth - cardSubGap * (maxCardsInRow - 1)) / maxCardsInRow;
  // Uniform card width is optimized dynamically up to 0.38 inches
  // Allow card width to scale down dynamically to 0.12 inches to fit within capped width slide
  const wCard = Math.min(0.38, Math.max(0.12, maxPossibleCardW));
  const cardFontSize = wCard < 0.18 ? 5.5 : wCard < 0.24 ? 6.5 : 7.5;

  // --- Draw Row 1: OIC ---
  if (organized.oic) {
    const oic = organized.oic;
    const colors = getRoleColors(oic.role);
    const dateToUse = formattedChartDate || formatArmyDate(oic.thru);
    const label = `${oic.rank} ${oic.name}\n${dateToUse}`;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: marginX,
      y: yOic,
      w: availableWidth,
      h: rowHeight,
      fill: { color: colors.hexBg },
      line: { color: colors.hexBorder, width: 1 }
    });

    slide.addText(label, {
      x: marginX,
      y: yOic,
      w: availableWidth,
      h: rowHeight,
      align: "center",
      valign: "middle",
      fontSize: 11,
      fontFace: "Inter",
      color: colors.hexText,
      bold: true
    });
  }

  // --- Draw Row 2: Element Leader ---
  if (organized.elementLeader) {
    const leader = organized.elementLeader;
    const colors = getRoleColors(leader.role);
    const dateToUse = formattedChartDate || formatArmyDate(leader.thru);
    const label = `${leader.rank} ${leader.name}\n${dateToUse}`;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: marginX,
      y: yElementLeader,
      w: availableWidth,
      h: rowHeight,
      fill: { color: colors.hexBg },
      line: { color: colors.hexBorder, width: 1 }
    });

    slide.addText(label, {
      x: marginX,
      y: yElementLeader,
      w: availableWidth,
      h: rowHeight,
      align: "center",
      valign: "middle",
      fontSize: 11,
      fontFace: "Inter",
      color: colors.hexText,
      bold: true
    });
  }

  // --- Draw Row 3, 4, 5+: Groups & Subordinates ---
  if (numGroups > 0 || numDirectCols > 0) {
    const groupGap = 0.08;
    const numLogicalGroups = numGroups + (numDirectCols > 0 ? 1 : 0);
    const totalGroupGaps = groupGap * (numLogicalGroups - 1);
    const remainingWidthForGroups = availableWidth - totalGroupGaps;

    const groupWeights = organized.groups.map(g => Math.max(1, g.columns.length));
    const directWeight = Math.max(0, numDirectCols);
    const totalWeight = groupWeights.reduce((sum, w) => sum + w, 0) + directWeight;
    const weightUnitWidth = remainingWidthForGroups / totalWeight;

    let currentX = marginX;

    // Helper to draw a single column
    const drawColumn = (col: any, xCol: number, wCol: number) => {
      const headerColors = getRoleColors(col.header.role);
      const dateToUse = formattedChartDate || formatArmyDate(col.header.thru);
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
        bold: true
      });

      const numLanes = col.lanes.length;
      if (numLanes > 0) {
        const laneGap = 0.05;
        const laneSpace = (wCol - laneGap * (numLanes - 1)) / numLanes;

        col.lanes.forEach((lane: any, lIndex: number) => {
          const xLane = xCol + lIndex * (laneSpace + laneGap);
          const leader = lane.laneLeader;
          const leaderColors = getRoleColors(leader.role);
          const leaderDate = formattedChartDate || formatArmyDate(leader.thru);
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
            margin: 0
          });

          const numSubs = lane.subordinates.length;
          if (numSubs > 0) {
            const totalSubsWidth = numSubs * wCard + (numSubs - 1) * cardSubGap;
            const xSubsStart = xLane + (laneSpace - totalSubsWidth) / 2;

            lane.subordinates.forEach((sub: any, sIndex: number) => {
              const xSub = xSubsStart + sIndex * (wCard + cardSubGap);
              const ySub = yVerticalStackStart + cardHeight + cardRowGap;
              const subColors = getRoleColors(sub.role);
              const subDate = formattedChartDate || formatArmyDate(sub.thru);
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
                margin: 0
              });
            });
          }
        });
      }
    };

    // 1. Draw Direct Support Columns
    if (numDirectCols > 0) {
      const wDirectGroup = weightUnitWidth * directWeight;
      const colGap = 0.04;
      const wCol = (wDirectGroup - colGap * (numDirectCols - 1)) / numDirectCols;

      organized.directColumns.forEach((col, cIndex) => {
        const xCol = currentX + cIndex * (wCol + colGap);
        drawColumn(col, xCol, wCol);
      });
      currentX += wDirectGroup + groupGap;
    }

    // 2. Draw Group Leader Blocks
    organized.groups.forEach((group, gIndex) => {
      const wGroup = weightUnitWidth * groupWeights[gIndex];
      const xGroup = currentX;
      const leaderColors = getRoleColors(group.leader.role);
      const leaderDate = formattedChartDate || formatArmyDate(group.leader.thru);
      const leaderLabel = `${group.leader.rank} ${group.leader.name}\n${leaderDate}`;

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
        bold: true
      });

      const numCols = group.columns.length;
      if (numCols > 0) {
        const colGap = 0.04;
        const totalColGaps = colGap * (numCols - 1);
        const wCol = (wGroup - totalColGaps) / numCols;

        group.columns.forEach((col, cIndex) => {
          const xCol = xGroup + cIndex * (wCol + colGap);
          drawColumn(col, xCol, wCol);
        });
      }
      currentX += wGroup + groupGap;
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
    { name: "Musician", role: RatingRole.MUSICIAN }
  ];

  const legendItemW = 1.45;
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
      bold: true
    });
  });

  // 4. Save/Export PPTX file
  // Using pptxgenjs write method to trigger a download in-browser
  const filename = `${titleText.replace(/\s+/g, "_")}_Chart.pptx`;
  pptx.writeFile({ fileName: filename });
}
