/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArmyRatingRecord, RatingRole } from "../types";
import { add90Days } from "./dateUtils";

/**
 * Autodetects the role based on Rank, Duty Title, and Duty MOSC
 */
export function inferRoleFromRankAndTitle(rank: string, title: string, dutyMosc?: string): RatingRole {
  const m = dutyMosc ? dutyMosc.toUpperCase().trim() : "";
  const r = rank.toUpperCase().trim();
  const t = title.toLowerCase().trim();

  // If dutyMosc is provided, use the new explicit mapping
  if (t.includes("senior support musician") || m === "42S4O") {
    return RatingRole.SENIOR_SUPPORT_MUSICIAN;
  }
  if (t.includes("support musician") || m === "42S3O") {
    return RatingRole.SUPPORT_MUSICIAN;
  }
  if (m === "42S5O") {
    // Master Musician or Section Leader
    if (t.includes("section") || r === "SSG") {
      return RatingRole.SECTION_LEADER;
    }
    return RatingRole.MASTER_MUSICIAN;
  }
  if (m === "42S6O") {
    // Group Leader or Element Leader
    if (t.includes("group") || r === "SFC") {
      return RatingRole.GROUP_LEADER;
    }
    return RatingRole.ELEMENT_LEADER;
  }

  if (r === "MAJ" || r === "LTC" || r === "COL" || r === "CPT" || t.includes("commander") || t.includes("oic")) {
    return RatingRole.OIC;
  }
  if (r === "SGM" || r === "CSM" || t.includes("sergeant major") || t.includes("element leader")) {
    return RatingRole.ELEMENT_LEADER;
  }
  if (t.includes("group leader") || t.includes("group leader")) {
    return RatingRole.GROUP_LEADER;
  }
  if (t.includes("key leader") || t.includes("operations ncoic") || t.includes("operations sergeant")) {
    return RatingRole.KEY_LEADER;
  }
  if (t.includes("section leader") || r === "SSG") {
    return RatingRole.SECTION_LEADER;
  }
  if (t.includes("principal") || t.includes("master musician")) {
    return RatingRole.MASTER_MUSICIAN;
  }
  if (r === "SGT" || t.includes("senior musician") || t.includes("senior player")) {
    return RatingRole.SENIOR_MUSICIAN;
  }
  return RatingRole.MUSICIAN;
}

/**
 * Parses and formats a date string (e.g. 20250701 to 2025-07-01).
 * Supports YYYYMMDD, MM/DD/YYYY, MM-DD-YYYY, and other standard formats.
 */
export function parseAndFormatDate(dateStr: string, fallbackDefault?: string): string {
  const todayStr = fallbackDefault || new Date().toISOString().split("T")[0];
  if (!dateStr) return todayStr;
  const clean = dateStr.trim().replace(/^"|"$/g, "").trim();
  if (!clean) return todayStr;

  // Handle YYYYMMDD format (8 digits)
  if (/^\d{8}$/.test(clean)) {
    const yyyy = clean.substring(0, 4);
    const mm = clean.substring(4, 6);
    const dd = clean.substring(6, 8);
    return `${yyyy}-${mm}-${dd}`;
  }

  // Handle MM/DD/YYYY or M/D/YYYY or MM-DD-YYYY
  const m1 = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    const mm = m1[1].padStart(2, "0");
    const dd = m1[2].padStart(2, "0");
    const yyyy = m1[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Handle YYYY/MM/DD or YYYY-MM-DD
  const m2 = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) {
    const yyyy = m2[1];
    const mm = m2[2].padStart(2, "0");
    const dd = m2[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback to standard JavaScript date parsing if valid
  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) {
    const date = new Date(parsed);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return todayStr;
}

/**
 * Parses CSV text into ArmyRatingRecords
 */
export function parseCSV(csvText: string): ArmyRatingRecord[] {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      currentRow.push(currentCell.trim());
      if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentRow.length > 0 || currentCell !== "") {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  // Find the index of the header row (e.g. Row containing "Name" or "Rank")
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    const hasHeaderKeywords = row.some(cell => {
      if (cell === null || cell === undefined) return false;
      const val = String(cell).toLowerCase().trim().replace(/^"|"$/g, "").trim().replace(/\s+/g, '');
      return ['name', 'soldiername', 'principaldutytitle', 'dutytitle', 'dutymosc', 'seniorrater', 'submissiontype'].includes(val);
    });
    if (hasHeaderKeywords) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = rows[headerRowIndex];
  
  let idxElement = -1;
  let idxRole = -1;
  let idxDutyMosc = -1;
  let idxRank = -1;
  let idxName = -1;
  let idxFrom = -1;
  let idxThru = -1;
  let idxDueHqda = -1;
  let idxRater = -1;
  let idxRaterEffectiveDate = -1;
  let idxSeniorRater = -1;
  let idxSeniorRaterEffectiveDate = -1;
  let idxReviewer = -1;
  let idxReviewerEffectiveDate = -1;
  let idxSubmissionType = -1;

  if (headers) {
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const header = String(headers[colIdx] || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
      
      if (header.includes("element") || header.includes("unit") || header.includes("section")) {
        if (idxElement === -1) idxElement = colIdx;
      } else if (
        header.includes("principal duty") || 
        header.includes("principle duty") || 
        header.includes("duty titile") || 
        header.includes("duty title") || 
        header === "role" || 
        header === "title"
      ) {
        if (idxRole === -1) idxRole = colIdx;
      } else if (header.includes("duty mosc") || header === "mosc" || header === "mos" || header.includes("duty title & mosc") || header.includes("duty titile & mosc")) {
        if (idxDutyMosc === -1) idxDutyMosc = colIdx;
      } else if (header === "rank" || header.includes("pay grade") || header === "grade") {
        if (idxRank === -1) idxRank = colIdx;
      } else if (header === "name" || header.includes("soldier name") || header.includes("name (last, first)")) {
        if (idxName === -1) idxName = colIdx;
      } else if (header === "from" || header === "from date") {
        if (idxFrom === -1) idxFrom = colIdx;
      } else if (header === "thru" || header === "thru date" || header === "through") {
        if (idxThru === -1) idxThru = colIdx;
      } else if (header.includes("due to hqda") || header.includes("due hqda") || header.includes("hqda due") || header.includes("evaluation due")) {
        if (idxDueHqda === -1) idxDueHqda = colIdx;
      } else if (header === "rater") {
        if (idxRater === -1) idxRater = colIdx;
        // Check if next column is "Effective Date"
        if (colIdx + 1 < headers.length) {
          const nextHeader = String(headers[colIdx + 1] || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
          if (nextHeader.includes("effective") || nextHeader.includes("eff")) {
            idxRaterEffectiveDate = colIdx + 1;
          }
        }
      } else if (header.includes("senior rater")) {
        if (idxSeniorRater === -1) idxSeniorRater = colIdx;
        // Check if next column is "Effective Date"
        if (colIdx + 1 < headers.length) {
          const nextHeader = String(headers[colIdx + 1] || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
          if (nextHeader.includes("effective") || nextHeader.includes("eff")) {
            idxSeniorRaterEffectiveDate = colIdx + 1;
          }
        }
      } else if (header.includes("reviewer")) {
        if (idxReviewer === -1) idxReviewer = colIdx;
        // Check if next column is "Effective Date"
        if (colIdx + 1 < headers.length) {
          const nextHeader = String(headers[colIdx + 1] || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
          if (nextHeader.includes("effective") || nextHeader.includes("eff")) {
            idxReviewerEffectiveDate = colIdx + 1;
          }
        }
      } else if (header.includes("submission type") || header.includes("submission") || header === "type") {
        if (idxSubmissionType === -1) idxSubmissionType = colIdx;
      }
    }

    // Fallbacks for effective dates if not found immediately adjacent
    if (idxRaterEffectiveDate === -1) {
      idxRaterEffectiveDate = headers.findIndex(h => {
        const s = String(h || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
        return s.includes("rater effective") || s.includes("rater date") || s.includes("rater eff");
      });
    }
    if (idxSeniorRaterEffectiveDate === -1) {
      idxSeniorRaterEffectiveDate = headers.findIndex(h => {
        const s = String(h || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
        return s.includes("senior rater effective") || s.includes("senior rater date") || s.includes("senior rater eff");
      });
    }
    if (idxReviewerEffectiveDate === -1) {
      idxReviewerEffectiveDate = headers.findIndex(h => {
        const s = String(h || "").toLowerCase().trim().replace(/^"|"$/g, "").trim();
        return s.includes("reviewer effective") || s.includes("reviewer date") || s.includes("reviewer eff");
      });
    }
  }

  interface RawRow {
    id: string;
    element: string;
    dutyMosc: string;
    rank: string;
    name: string;
    from: string;
    thru: string;
    dueHqda: string;
    raterName: string;
    raterEffectiveDate: string;
    seniorRaterName: string;
    seniorRaterEffectiveDate: string;
    reviewerName: string;
    reviewerEffectiveDate: string;
    submissionType: string;
    role: RatingRole | string;
  }

  const rawRows: RawRow[] = [];

  // Parse rows starting from headerRowIndex + 1
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length < 3) continue; // skip invalid short lines

    const getValue = (idx: number, fallback: string = "") => {
      return idx !== -1 && idx < cells.length ? cells[idx] : fallback;
    };

    const rank = getValue(idxRank, "SPC");
    let dutyMosc = getValue(idxDutyMosc, "42R") || "42R";
    const name = getValue(idxName, "Doe, John");

    const parsedRoleStr = getValue(idxRole);

    // Determine Role (Principal Duty Title)
    let role: RatingRole | string;
    if (parsedRoleStr) {
      // Normalize role to match enum if possible
      const normalized = Object.values(RatingRole).find(
        r => r.toLowerCase() === parsedRoleStr.toLowerCase().trim()
      );
      role = normalized || parsedRoleStr.trim();
    } else {
      role = inferRoleFromRankAndTitle(rank, "Musician", dutyMosc);
    }

    // Clean up role and extract MOSC if they are combined in the title cell
    if (typeof role === "string" && role !== "Musician") {
      const parts = role.trim().split(/\s+/);
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1].toUpperCase();
        // Check if the last part looks like an Army MOSC (e.g. 42S3O, 42R, 42C00, 42S, 42R6M)
        const isMosc = /^[0-9]{2}[A-Z][A-Z0-9]{0,3}$/i.test(lastPart);
        if (isMosc) {
          parts.pop();
          role = parts.join(" ");
          // If dutyMosc wasn't explicitly found, or was default, update it
          if (idxDutyMosc === -1 || !getValue(idxDutyMosc) || getValue(idxDutyMosc) === "42R") {
            dutyMosc = lastPart;
          }
        }
      }
    }

    const defaultDate = new Date().toISOString().split("T")[0];
    const fromVal = getValue(idxFrom);
    const thruVal = getValue(idxThru);
    const dueHqdaVal = getValue(idxDueHqda);
    const subTypeVal = getValue(idxSubmissionType, "ANN") || "ANN";
    const submissionType = subTypeVal.trim().toUpperCase() || "ANN";

    rawRows.push({
      id: `imported_${i}_${Date.now()}`,
      element: getValue(idxElement, "Band") || "Band",
      role,
      dutyMosc,
      rank,
      name,
      from: parseAndFormatDate(fromVal, defaultDate),
      thru: parseAndFormatDate(thruVal, defaultDate),
      dueHqda: parseAndFormatDate(dueHqdaVal, defaultDate),
      raterName: getValue(idxRater),
      raterEffectiveDate: parseAndFormatDate(getValue(idxRaterEffectiveDate), ""),
      seniorRaterName: getValue(idxSeniorRater),
      seniorRaterEffectiveDate: parseAndFormatDate(getValue(idxSeniorRaterEffectiveDate), ""),
      reviewerName: getValue(idxReviewer),
      reviewerEffectiveDate: parseAndFormatDate(getValue(idxReviewerEffectiveDate), ""),
      submissionType: submissionType,
    });
  }

  // Now, resolve rating chain connections
  // We match Rater, Senior Rater, and Supplementary Reviewer text names to the imported rows
  const findRecordIdByName = (searchName: string, currentId: string): string => {
    if (!searchName) return "";
    
    // Helper to strip rank from the start of a string
    const stripRank = (str: string) => {
      let s = str.toLowerCase().trim();
      const ranks = ["pvt", "pv2", "pfc", "spc", "cpl", "sgt", "ssg", "sfc", "msg", "1sg", "sgm", "csm", "wo1", "cw2", "cw3", "cw4", "cw5", "2lt", "1lt", "cpt", "maj", "ltc", "col"];
      for (const rank of ranks) {
        if (s.startsWith(rank + " ")) {
          return s.substring(rank.length + 1).trim();
        }
      }
      return s;
    };

    const cleanSearch = stripRank(searchName);
    const searchNoSpaces = cleanSearch.replace(/\s+/g, "");
    
    // 1. Try exact match (ignoring spaces, case, and rank)
    const match = rawRows.find(
      r => r.id !== currentId && stripRank(r.name).replace(/\s+/g, "") === searchNoSpaces
    );
    if (match) return match.id;

    // 2. Try swapping "Last, First" to "First Last" or vice versa
    const searchParts = cleanSearch.includes(",") 
      ? cleanSearch.split(",").map(p => p.trim()) 
      : cleanSearch.split(/\s+/).map(p => p.trim());

    const matchSwapped = rawRows.find(r => {
      if (r.id === currentId) return false;
      const rName = stripRank(r.name);
      const rParts = rName.includes(",") 
        ? rName.split(",").map(p => p.trim()) 
        : rName.split(/\s+/).map(p => p.trim());

      // If both have 2+ parts, check if they contain the same primary components
      if (searchParts.length >= 2 && rParts.length >= 2) {
        const hasLastName = rParts.some(p => searchParts.includes(p));
        const hasFirstName = rParts.some(p => searchParts.includes(p));
        return hasLastName && hasFirstName;
      }
      return false;
    });
    if (matchSwapped) return matchSwapped.id;

    // 3. Fallback to loose partial match on last name
    const lastName = searchParts[0];
    if (lastName && lastName.length > 2) {
      const partialMatch = rawRows.find(r => {
        if (r.id === currentId) return false;
        return stripRank(r.name).includes(lastName);
      });
      if (partialMatch) return partialMatch.id;
    }

    return "";
  };

  const finalRecords: ArmyRatingRecord[] = rawRows.map(raw => {
    return {
      id: raw.id,
      element: raw.element,
      dutyMosc: raw.dutyMosc,
      rank: raw.rank,
      name: raw.name,
      from: raw.from,
      thru: raw.thru,
      dueHqda: raw.dueHqda,
      raterId: findRecordIdByName(raw.raterName, raw.id),
      raterEffectiveDate: raw.raterEffectiveDate || undefined,
      seniorRaterId: findRecordIdByName(raw.seniorRaterName, raw.id),
      seniorRaterEffectiveDate: raw.seniorRaterEffectiveDate || undefined,
      reviewerId: findRecordIdByName(raw.reviewerName, raw.id),
      reviewerEffectiveDate: raw.reviewerEffectiveDate || undefined,
      submissionType: raw.submissionType,
      role: raw.role
    };
  });

  return finalRecords;
}

/**
 * Formats a YYYY-MM-DD date string to M/D/YYYY for export
 */
export function formatDateToMDYYYY(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  
  const yyyy = parts[0];
  const mm = parseInt(parts[1], 10);
  const dd = parseInt(parts[2], 10);
  
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Generates a template CSV string
 */
export function generateTemplateCSV(records: ArmyRatingRecord[] = []): string {
  const headers = [
    "Element",
    "\"Principal\nDuty Title\"",
    "\"Duty MOSC\"",
    "Rank",
    "Name",
    "From",
    "Thru",
    "\"Due to\nHQDA\"",
    "Rater",
    "\"Rater\nEffective Date\"",
    "\"Senior Rater\"",
    "\"Senior Rater\nEffective Date\"",
    "Reviewer",
    "\"Reviewer\nEffective Date\"",
    "\"Submission\nType\""
  ];

  const lines = [headers.join(",")];

  const helperGetRecordName = (id: string) => {
    const r = records.find(rec => rec.id === id);
    if (!r) return "";
    return `"${r.rank} ${r.name}"`;
  };

  if (records.length > 0) {
    records.forEach(r => {
      const row = [
        `"${r.element}"`,
        `"${r.role}"`,
        `"${r.dutyMosc}"`,
        `"${r.rank}"`,
        `"${r.name}"`,
        formatDateToMDYYYY(r.from),
        formatDateToMDYYYY(r.thru),
        formatDateToMDYYYY(r.dueHqda || add90Days(r.thru)),
        helperGetRecordName(r.raterId),
        `"${formatDateToMDYYYY(r.raterEffectiveDate)}"`,
        helperGetRecordName(r.seniorRaterId),
        `"${formatDateToMDYYYY(r.seniorRaterEffectiveDate)}"`,
        helperGetRecordName(r.reviewerId),
        `"${formatDateToMDYYYY(r.reviewerEffectiveDate)}"`,
        `"${r.submissionType || "ANN"}"`
      ];
      lines.push(row.join(","));
    });
  } else {
    // Add default example row
    lines.push(
      "Command,\"OIC\",42C00,MAJ,\"Morris, Patrick\",6/1/2026,2/1/2027,3/15/2027,,,,,,,\"ANN\""
    );
    lines.push(
      "Command,\"Element Leader\",42R6M,SGM,\"Cadle, David\",6/1/2026,2/1/2027,3/15/2027,\"MAJ Morris, Patrick\",,,,,\"ANN\""
    );
    lines.push(
      "Brass Section,\"Group Leader\",42R5H,SFC,\"Smith, John\",6/1/2026,2/1/2027,3/15/2027,\"SGM Cadle, David\",,\"MAJ Morris, Patrick\",,,,\"ANN\""
    );
  }

  return lines.join("\n");
}
