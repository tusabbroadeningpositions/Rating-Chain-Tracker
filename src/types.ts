/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum RatingRole {
  OIC = "OIC",
  ELEMENT_LEADER = "Element Leader",
  GROUP_LEADER = "Group Leader",
  KEY_LEADER = "Key Leader",
  SECTION_LEADER = "Section Leader",
  MASTER_MUSICIAN = "Master Musician",
  SENIOR_MUSICIAN = "Senior Musician",
  SENIOR_SUPPORT_MUSICIAN = "Senior Support Musician",
  MUSICIAN = "Musician",
  SUPPORT_MUSICIAN = "Support Musician"
}


export interface RatingScheme {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  isShared?: boolean;
  allowEdit?: boolean;
  allowEditCurrent?: boolean;
  effectiveAsOf?: string;
  proposedEffectiveDateFuture?: string;
  proposedEffectiveDateAlternate?: string;
}

export interface ArmyRatingRecord {
  id: string;
  userId?: string;
  schemeId?: string;
  element: string; // e.g. Brass, Woodwinds, Percussion, Command
  dutyMosc: string; // Duty MOSC (e.g. 42R, 42S)
  rank: string; // Rank (e.g. MAJ, SGM, SFC, SSG, SGT, SPC, CPL, PFC)
  name: string; // Name (Last, First)
  from: string; // From Date (YYYY-MM-DD)
  thru: string; // Thru Date (YYYY-MM-DD)
  dueHqda: string; // Due to HQDA Date (YYYY-MM-DD)
  raterId: string; // ID of Rater (links to another ArmyRatingRecord)
  raterEffectiveDate?: string; // Effective Date of Rater (YYYY-MM-DD)
  seniorRaterId: string; // ID of Senior Rater
  seniorRaterEffectiveDate?: string; // Effective Date of Senior Rater (YYYY-MM-DD)
  reviewerId: string; // ID of Reviewer
  reviewerEffectiveDate?: string; // Effective Date of Reviewer (YYYY-MM-DD)
  submissionType?: string; // Submission Type (ANN, COR, CTR, EXANN)
  corNewRaterId?: string; // New Rater ID for Change of Rater (links to another ArmyRatingRecord)
  corEffectiveDate?: string; // Effective Date for Change of Rater (YYYY-MM-DD)
  role: RatingRole | string; // Principal Duty Title / Role in the organization layout
  keyLeaderTitle?: string; // Custom title for key leader positions
  version?: "current" | "future" | "alternate" | string; // Version profile draft
  ncoerStatus?: string; // NCOER Status
  ncoerStatusDate?: string; // NCOER Status change date/timestamp (YYYY-MM-DD)
  isLateMode?: boolean; // Flag if record is in 'Late' mode for NCOER
  priorThru?: string; // Prior Thru Date for late mode
  priorDueHqda?: string; // Prior Due to HQDA Date for late mode
  lateRaterId?: string; // Historical Rater ID for late mode
  lateSeniorRaterId?: string; // Historical Senior Rater ID for late mode
  isCustomStatus?: boolean; // Flag if status is custom
  parentRecordId?: string; // If this is a history entry, the ID of the parent record
  isHistoryEntry?: boolean; // Flag if this is a history entry
  updatedAt?: any; // Firestore timestamp or number
}

export interface Note {
  id: string;
  schemeId: string;
  userId: string;
  soldierName: string; // lowercase trimmed to carry over across rosters
  content: string;
  createdAt?: any; // timestamp or number
  updatedAt?: any; // timestamp or number
}

export interface OrgNode {
  record: ArmyRatingRecord;
  children: OrgNode[];
}

export const SENIOR_RATER_RANKS = ["MAJ", "LTC", "COL", "CPT", "1LT", "2LT", "SGM", "MSG", "SFC", "SSG", "CW5", "CW4", "CW3", "CW2", "WO1"];

export function formatNameToLastFirstRank(nameStr: string, rankStr: string = ""): string {
  if (!nameStr) return "";
  let raw = nameStr.trim();
  if (!raw) return "";

  let extractedRank = rankStr ? rankStr.trim() : "";

  // 1. Extract rank in parentheses at the end if present, e.g. "Alger, Bonnie (CPT)" or "Bonnie Alger (CPT)"
  const parenMatch = raw.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    raw = parenMatch[1].trim();
    if (!extractedRank) {
      extractedRank = parenMatch[2].trim();
    }
  }

  // 2. Extract leading rank if present, e.g. "CPT Alger, Bonnie" or "CPT Bonnie Alger"
  for (const rk of SENIOR_RATER_RANKS) {
    if (raw.startsWith(rk + " ")) {
      if (!extractedRank) {
        extractedRank = rk;
      }
      raw = raw.substring(rk.length + 1).trim();
      break;
    }
  }

  // 3. Format name into Last, First
  let formattedName = raw;
  if (raw.includes(",")) {
    const parts = raw.split(",");
    const last = parts[0].trim();
    const first = parts.slice(1).join(",").trim();
    formattedName = first ? `${last}, ${first}` : last;
  } else {
    const tokens = raw.split(/\s+/);
    if (tokens.length >= 2) {
      const last = tokens[tokens.length - 1];
      const first = tokens.slice(0, tokens.length - 1).join(" ");
      formattedName = `${last}, ${first}`;
    } else {
      formattedName = raw;
    }
  }

  // 4. Combine with rank in parentheses: Last, First (RANK)
  if (extractedRank) {
    return `${formattedName} (${extractedRank})`;
  }
  return formattedName;
}
