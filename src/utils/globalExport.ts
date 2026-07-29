/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import XLSX from "xlsx-js-style";
import { ArmyRatingRecord, RatingRole, RatingScheme, formatNameToLastFirstRank } from "../types";
import { formatDateToYYYYMMDD } from "./csvHandler";
import { add90Days } from "./dateUtils";
import { exportNcoerReportToPPTX, exportMultiProfileBubbleMapToPPTX } from "./pptxExport";

const ROLE_PRIORITY: Record<string, number> = {
  [RatingRole.OIC]: 1,
  [RatingRole.ELEMENT_LEADER]: 2,
  [RatingRole.GROUP_LEADER]: 3,
  [RatingRole.KEY_LEADER]: 4,
  [RatingRole.SECTION_LEADER]: 5,
  [RatingRole.MASTER_MUSICIAN]: 6,
  [RatingRole.SENIOR_MUSICIAN]: 7,
  [RatingRole.SENIOR_SUPPORT_MUSICIAN]: 8,
  [RatingRole.MUSICIAN]: 9,
  [RatingRole.SUPPORT_MUSICIAN]: 10
};

/**
 * Option 1: Export NCOER report for all profiles to PowerPoint
 * Combines all NCOER statuses of all profiles into one PowerPoint.
 */
export function exportAllProfilesNcoerPPTX(
  allProfilesData: { scheme: RatingScheme; records: ArmyRatingRecord[] }[]
) {
  const combinedAllRecords: ArmyRatingRecord[] = [];
  const combinedCurrentRecords: ArmyRatingRecord[] = [];

  allProfilesData.forEach(p => {
    p.records.forEach(r => {
      combinedAllRecords.push(r);
      if ((r.version || "current") === "current") {
        combinedCurrentRecords.push(r);
      }
    });
  });

  exportNcoerReportToPPTX(
    combinedAllRecords,
    combinedCurrentRecords,
    "ALL PROFILES COMBINED"
  );
}

/**
 * Helper to build a worksheet for a given rosterType (current or projected)
 */
function buildRosterWorksheet(
  allProfilesData: { scheme: RatingScheme; records: ArmyRatingRecord[] }[],
  rosterType: "current" | "projected",
  globalRecords: ArmyRatingRecord[]
) {
  const exportRows: any[] = [];

  const helperGetName = (id: string) => {
    if (!id || id === "-") return "";
    const rec = globalRecords.find(x => x.id === id);
    return rec ? formatNameToLastFirstRank(rec.name, rec.rank) : formatNameToLastFirstRank(id);
  };

  let rowCounter = 2; // Row 1 is header
  const rowMetaList: { record: ArmyRatingRecord; currentRecords: ArmyRatingRecord[]; rowIdx: number }[] = [];

  allProfilesData.forEach(p => {
    const profileName = p.scheme.name;
    const currentRecords = p.records.filter(r => (r.version || "current") === "current");
    let targetRecords: ArmyRatingRecord[] = [];

    if (rosterType === "current") {
      targetRecords = currentRecords;
    } else {
      const futureRecs = p.records.filter(r => r.version === "future");
      const altRecs = p.records.filter(r => r.version === "alternate");
      if (futureRecs.length > 0) {
        targetRecords = futureRecs;
      } else if (altRecs.length > 0) {
        targetRecords = altRecs;
      } else {
        targetRecords = currentRecords;
      }
    }

    const sorted = [...targetRecords].sort((a, b) => {
      const priorityA = ROLE_PRIORITY[a.role] || 99;
      const priorityB = ROLE_PRIORITY[b.role] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach(r => {
      const isLate = r.ncoerStatus === "Late";
      const raterId = isLate && r.lateRaterId ? r.lateRaterId : r.raterId;
      const seniorRaterId = isLate && r.lateSeniorRaterId ? r.lateSeniorRaterId : r.seniorRaterId;

      rowMetaList.push({
        record: r,
        currentRecords,
        rowIdx: rowCounter
      });
      rowCounter++;

      exportRows.push({
        "Profile / Scheme": profileName,
        "Element": r.element,
        "Principal\nDuty Title": r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role,
        "Duty MOSC": r.dutyMosc,
        "Rank": r.rank,
        "Name": r.name,
        "From": formatDateToYYYYMMDD(r.from),
        "Thru": formatDateToYYYYMMDD(r.thru),
        "Due to\nHQDA": formatDateToYYYYMMDD(r.dueHqda || add90Days(r.thru)),
        "Rater": helperGetName(raterId),
        "Rater\nEffective Date": isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.raterEffectiveDate),
        "Senior Rater": helperGetName(seniorRaterId),
        "Senior Rater\nEffective Date": isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.seniorRaterEffectiveDate),
        "Reviewer": helperGetName(r.reviewerId),
        "Reviewer\nEffective Date": isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.reviewerEffectiveDate),
        "Submission\nType": r.submissionType || "ANN"
      });
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);

  worksheet["!cols"] = [
    { wch: 22 }, // Profile
    { wch: 15 }, // Element
    { wch: 25 }, // Principal Duty Title
    { wch: 12 }, // Duty MOSC
    { wch: 8 },  // Rank
    { wch: 20 }, // Name
    { wch: 12 }, // From
    { wch: 12 }, // Thru
    { wch: 12 }, // Due to HQDA
    { wch: 22 }, // Rater
    { wch: 18 }, // Rater Effective Date
    { wch: 22 }, // Senior Rater
    { wch: 18 }, // Senior Rater Effective Date
    { wch: 22 }, // Reviewer
    { wch: 18 }, // Reviewer Effective Date
    { wch: 15 }  // Submission Type
  ];

  const headerCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];
  headerCols.forEach(col => {
    const cellRef = `${col}1`;
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = {
        font: { bold: true, color: { rgb: "1E293B" } },
        fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } },
        alignment: { wrapText: true, horizontal: "center", vertical: "center" }
      };
    }
  });

  // Apply yellow cell highlights for projected roster differences compared to current version
  if (rosterType === "projected") {
    const highlightStyle = {
      fill: {
        patternType: "solid",
        fgColor: { rgb: "FEF08A" } // Yellow background highlight (yellow-200)
      },
      border: {
        top: { style: "medium", color: { rgb: "EAB308" } },
        bottom: { style: "medium", color: { rgb: "EAB308" } },
        left: { style: "medium", color: { rgb: "EAB308" } },
        right: { style: "medium", color: { rgb: "EAB308" } }
      }
    };

    const normalize = (val: any) => (val === undefined || val === null ? "" : String(val).trim());

    rowMetaList.forEach(({ record: r, currentRecords, rowIdx }) => {
      const currentSoldier = currentRecords.find(cr => cr.name.trim().toLowerCase() === r.name.trim().toLowerCase());
      if (!currentSoldier) return;

      const isLate = r.ncoerStatus === "Late";
      const currentIsLate = currentSoldier.ncoerStatus === "Late";

      const raterId = isLate && r.lateRaterId ? r.lateRaterId : r.raterId;
      const seniorRaterId = isLate && r.lateSeniorRaterId ? r.lateSeniorRaterId : r.seniorRaterId;

      const currentRaterId = currentIsLate && currentSoldier.lateRaterId ? currentSoldier.lateRaterId : currentSoldier.raterId;
      const currentSeniorRaterId = currentIsLate && currentSoldier.lateSeniorRaterId ? currentSoldier.lateSeniorRaterId : currentSoldier.seniorRaterId;

      // B: Element
      if (normalize(r.element) !== normalize(currentSoldier.element)) {
        const ref = `B${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // C: Principal Duty Title
      const titleA = r.role === RatingRole.KEY_LEADER && r.keyLeaderTitle ? `${r.role} (${r.keyLeaderTitle})` : r.role;
      const titleB = currentSoldier.role === RatingRole.KEY_LEADER && currentSoldier.keyLeaderTitle ? `${currentSoldier.role} (${currentSoldier.keyLeaderTitle})` : currentSoldier.role;
      if (normalize(titleA) !== normalize(titleB)) {
        const ref = `C${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // D: Duty MOSC
      if (normalize(r.dutyMosc) !== normalize(currentSoldier.dutyMosc)) {
        const ref = `D${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // E: Rank
      if (normalize(r.rank) !== normalize(currentSoldier.rank)) {
        const ref = `E${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // G: From
      if (formatDateToYYYYMMDD(r.from) !== formatDateToYYYYMMDD(currentSoldier.from)) {
        const ref = `G${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // H: Thru
      if (formatDateToYYYYMMDD(r.thru) !== formatDateToYYYYMMDD(currentSoldier.thru)) {
        const ref = `H${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // I: Due to HQDA
      const dueA = formatDateToYYYYMMDD(r.dueHqda || add90Days(r.thru));
      const dueB = formatDateToYYYYMMDD(currentSoldier.dueHqda || add90Days(currentSoldier.thru));
      if (dueA !== dueB) {
        const ref = `I${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // J: Rater
      if (helperGetName(raterId) !== helperGetName(currentRaterId)) {
        const ref = `J${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // K: Rater Effective Date
      const raterEffA = isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.raterEffectiveDate);
      const raterEffB = currentIsLate ? "N/A (Late)" : formatDateToYYYYMMDD(currentSoldier.raterEffectiveDate);
      if (raterEffA !== raterEffB) {
        const ref = `K${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // L: Senior Rater
      if (helperGetName(seniorRaterId) !== helperGetName(currentSeniorRaterId)) {
        const ref = `L${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // M: Senior Rater Effective Date
      const srEffA = isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.seniorRaterEffectiveDate);
      const srEffB = currentIsLate ? "N/A (Late)" : formatDateToYYYYMMDD(currentSoldier.seniorRaterEffectiveDate);
      if (srEffA !== srEffB) {
        const ref = `M${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // N: Reviewer
      if (helperGetName(r.reviewerId) !== helperGetName(currentSoldier.reviewerId)) {
        const ref = `N${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // O: Reviewer Effective Date
      const revEffA = isLate ? "N/A (Late)" : formatDateToYYYYMMDD(r.reviewerEffectiveDate);
      const revEffB = currentIsLate ? "N/A (Late)" : formatDateToYYYYMMDD(currentSoldier.reviewerEffectiveDate);
      if (revEffA !== revEffB) {
        const ref = `O${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
      // P: Submission Type
      if (normalize(r.submissionType || "ANN") !== normalize(currentSoldier.submissionType || "ANN")) {
        const ref = `P${rowIdx}`;
        if (worksheet[ref]) worksheet[ref].s = highlightStyle;
      }
    });
  }

  return worksheet;
}

/**
 * Option 2 & 3: Export Excel spreadsheet for all profiles combined
 * rosterType = "current" or "projected"
 */
export function exportAllProfilesExcel(
  allProfilesData: { scheme: RatingScheme; records: ArmyRatingRecord[] }[],
  rosterType: "current" | "projected"
) {
  const globalRecords: ArmyRatingRecord[] = [];
  allProfilesData.forEach(p => globalRecords.push(...p.records));

  const worksheet = buildRosterWorksheet(allProfilesData, rosterType, globalRecords);

  const workbook = XLSX.utils.book_new();
  const sheetName = rosterType === "current" ? "Current Rosters" : "Projected Rosters";
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const dateTag = new Date().toISOString().split("T")[0];
  const filename = `Combined_All_Profiles_${rosterType === "current" ? "Current" : "Projected"}_Rosters_${dateTag}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Option 2b: Export Excel spreadsheet with two sheets (Current + Projected rosters)
 */
export function exportAllProfilesExcelDualSheet(
  allProfilesData: { scheme: RatingScheme; records: ArmyRatingRecord[] }[]
) {
  const globalRecords: ArmyRatingRecord[] = [];
  allProfilesData.forEach(p => globalRecords.push(...p.records));

  const currentWorksheet = buildRosterWorksheet(allProfilesData, "current", globalRecords);
  const projectedWorksheet = buildRosterWorksheet(allProfilesData, "projected", globalRecords);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, currentWorksheet, "Current Rosters");
  XLSX.utils.book_append_sheet(workbook, projectedWorksheet, "Projected Rosters");

  const dateTag = new Date().toISOString().split("T")[0];
  const filename = `Combined_All_Profiles_Current_and_Projected_Rosters_${dateTag}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Option 4 & 5: Export PowerPoint bubble map for all profiles (one profile per slide)
 */
export function exportAllProfilesBubbleMapPPTX(
  allProfilesData: { scheme: RatingScheme; records: ArmyRatingRecord[] }[],
  rosterType: "current" | "projected"
) {
  const dateTag = new Date().toISOString().split("T")[0];

  const profilesData = allProfilesData.map(p => {
    let targetRecords: ArmyRatingRecord[] = [];
    let slideTitle = "";

    if (rosterType === "current") {
      targetRecords = p.records.filter(r => (r.version || "current") === "current");
      const effDate = p.scheme.effectiveAsOf || dateTag;
      slideTitle = `${p.scheme.name} CURRENT AS OF ${effDate}`;
    } else {
      const futureRecs = p.records.filter(r => r.version === "future");
      const altRecs = p.records.filter(r => r.version === "alternate");
      let propDate = "";
      if (futureRecs.length > 0) {
        targetRecords = futureRecs;
        propDate = p.scheme.proposedEffectiveDateFuture || p.scheme.proposedEffectiveDateAlternate || dateTag;
      } else if (altRecs.length > 0) {
        targetRecords = altRecs;
        propDate = p.scheme.proposedEffectiveDateAlternate || p.scheme.proposedEffectiveDateFuture || dateTag;
      } else {
        targetRecords = p.records.filter(r => (r.version || "current") === "current");
        propDate = p.scheme.proposedEffectiveDateFuture || p.scheme.proposedEffectiveDateAlternate || dateTag;
      }
      slideTitle = `${p.scheme.name} PROJECTED ${propDate}`;
    }

    return {
      schemeName: p.scheme.name,
      records: targetRecords,
      slideTitle
    };
  });

  exportMultiProfileBubbleMapToPPTX(
    profilesData,
    rosterType === "current" ? "Current Roster" : "Projected Roster"
  );
}
