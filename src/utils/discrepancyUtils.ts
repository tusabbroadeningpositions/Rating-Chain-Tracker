/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArmyRatingRecord, RatingRole, formatNameToLastFirstRank, isLooksLikeId } from "../types";

export interface DiscrepancyItem {
  id: string;
  recordId: string;
  type: "senior_nco_not_rating" | "two_ranks_above" | "same_rank_rater" | "senior_rater_mismatch" | "reviewer_mismatch" | "custom_etp";
  title: string;
  reason: string;
  discrepantRole: "ratee" | "rater" | "seniorRater" | "reviewer";
  discrepantName: string; // The exact name that is in discrepancy
  rateeName: string;
  rateeRank: string;
  rateeRole: string;
  raterName: string;
  seniorRaterName: string;
  reviewerName: string;
  // User entered ETP info
  etpReason?: string;
  etpStatus?: string;
  etpApprovedDate?: string;
  etpNotes?: string;
}

export function helperResolveName(id: string | undefined, records: ArmyRatingRecord[]): string {
  if (!id || id === "-" || id.trim() === "") return "None";
  const found = records.find(r => r.id === id);
  if (found) {
    return formatNameToLastFirstRank(found.name, found.rank);
  }
  return formatNameToLastFirstRank(id);
}

function getGradeFromRank(rankStr: string): number | null {
  const rk = (rankStr || "").trim().toUpperCase();
  if (rk === "SGM" || rk === "CSM") return 9;
  if (rk === "MSG" || rk === "1SG") return 8;
  if (rk === "SFC") return 7;
  if (rk === "SSG") return 6;
  if (rk === "SGT") return 5;
  if (rk === "CPL" || rk === "SPC") return 4;
  return null;
}

export function checkSeniorNcoNotRating(r: ArmyRatingRecord, records: ArmyRatingRecord[]): string | null {
  const rRank = (r.rank || "").trim().toUpperCase();
  if (rRank !== "SFC" && rRank !== "MSG" && rRank !== "SGM") return null;
  
  const isRatingAnyone = records.some(rec => rec.raterId === r.id);
  if (!isRatingAnyone) {
    return `Senior NCO (${r.rank}) is not rating any Soldier in this rating scheme.`;
  }
  return null;
}

export function checkTwoRanksAboveRater(r: ArmyRatingRecord, searchSource: ArmyRatingRecord[]): { warning: string; raterRecord: ArmyRatingRecord } | null {
  if (!r.raterId || r.raterId === "-") return null;
  const raterRecord = searchSource.find(rec => rec.id === r.raterId);
  if (!raterRecord) return null;

  const rateeRank = (r.rank || "").trim().toUpperCase();
  const raterRank = (raterRecord.rank || "").trim().toUpperCase();

  const rateeGrade = getGradeFromRank(rateeRank);
  const raterGrade = getGradeFromRank(raterRank);

  if (rateeGrade !== null && raterGrade !== null && (raterGrade - rateeGrade >= 2)) {
    return {
      warning: `Rater ${raterRecord.name} (${raterRank}) is two or more ranks above ratee ${r.name} (${rateeRank}). AR 623-3: An NCO should not be rated by someone two or more grades senior (e.g. MSG rating SSG, SGM rating SFC).`,
      raterRecord
    };
  }
  return null;
}

export function checkSameRankRater(r: ArmyRatingRecord, searchSource: ArmyRatingRecord[]): { warning: string; raterRecord: ArmyRatingRecord } | null {
  if (!r.raterId || r.raterId === "-") return null;
  const raterRecord = searchSource.find(rec => rec.id === r.raterId);
  if (!raterRecord) return null;

  const rateeRank = (r.rank || "").trim().toUpperCase();
  const raterRank = (raterRecord.rank || "").trim().toUpperCase();

  if (rateeRank === raterRank && (rateeRank === "SSG" || rateeRank === "SFC" || rateeRank === "MSG")) {
    return {
      warning: `Rater ${raterRecord.name} (${raterRank}) has the same rank as ratee ${r.name} (${rateeRank}). AR 623-3: An NCO will not rate an NCO of the same rank.`,
      raterRecord
    };
  }
  return null;
}

export function checkSeniorRaterMismatch(r: ArmyRatingRecord, searchSource: ArmyRatingRecord[]): {
  raterName: string;
  expectedName: string;
  actualName: string;
  reason: string;
} | null {
  if (!r.raterId || r.raterId === "-") return null;
  const raterRecord = searchSource.find(rec => rec.id === r.raterId);
  if (!raterRecord) return null;

  const expectedSeniorRaterId = raterRecord.raterId;
  if (!expectedSeniorRaterId || expectedSeniorRaterId === "-") return null;

  if (r.seniorRaterId === expectedSeniorRaterId) return null;

  const actualName = helperResolveName(r.seniorRaterId, searchSource);
  const expectedName = helperResolveName(expectedSeniorRaterId, searchSource);

  if (actualName && expectedName && actualName !== "None" && expectedName !== "None") {
    if (actualName.trim().toLowerCase() === expectedName.trim().toLowerCase()) {
      return null;
    }
  }

  const raterName = helperResolveName(r.raterId, searchSource);
  return {
    raterName,
    expectedName,
    actualName,
    reason: `Senior Rater Mismatch: Rater ${raterName} is rated by ${expectedName}, but ratee's Senior Rater is listed as ${actualName}. Expected: ${expectedName}.`
  };
}

export function checkReviewerMismatch(r: ArmyRatingRecord, searchSource: ArmyRatingRecord[]): {
  seniorRaterName: string;
  expectedName: string;
  reason: string;
} | null {
  if (!r.seniorRaterId || r.seniorRaterId === "-") return null;
  const seniorRaterRecord = searchSource.find(rec => rec.id === r.seniorRaterId);
  if (!seniorRaterRecord) return null;

  if (seniorRaterRecord.rank !== "MSG") return null;

  const hasReviewer = r.reviewerId && r.reviewerId !== "-";
  if (hasReviewer) return null;

  const expectedReviewerId = seniorRaterRecord.raterId;
  const expectedName = expectedReviewerId ? helperResolveName(expectedReviewerId, searchSource) : "SGM Reviewer";
  const seniorRaterName = helperResolveName(r.seniorRaterId, searchSource);

  return {
    seniorRaterName,
    expectedName,
    reason: `SGM Reviewer Required: Senior Rater ${seniorRaterName} is rank MSG. Under AR 623-3, a reviewer (typically the Senior Rater's SGM/CSM rater) must be designated.`
  };
}

/**
 * Extracts all discrepancies for a single ArmyRatingRecord.
 */
export function getRecordDiscrepancies(r: ArmyRatingRecord, allRecords: ArmyRatingRecord[]): DiscrepancyItem[] {
  const items: DiscrepancyItem[] = [];
  const searchSource = allRecords.length > 0 ? allRecords : [r];

  const rateeName = formatNameToLastFirstRank(r.name, r.rank);
  const raterName = helperResolveName(r.raterId, searchSource);
  const seniorRaterName = helperResolveName(r.seniorRaterId, searchSource);
  const reviewerName = helperResolveName(r.reviewerId, searchSource);

  // 1. Senior NCO Not Rating
  const seniorNcoWarn = checkSeniorNcoNotRating(r, searchSource);
  if (seniorNcoWarn) {
    items.push({
      id: `${r.id}_senior_nco_not_rating`,
      recordId: r.id,
      type: "senior_nco_not_rating",
      title: "Senior NCO Not Rating Anyone",
      reason: seniorNcoWarn,
      discrepantRole: "ratee",
      discrepantName: rateeName,
      rateeName,
      rateeRank: r.rank,
      rateeRole: r.role,
      raterName,
      seniorRaterName,
      reviewerName,
      etpReason: r.etpReason,
      etpStatus: r.etpStatus,
      etpApprovedDate: r.etpApprovedDate,
      etpNotes: r.etpNotes
    });
  }

  // 2. Two Ranks Above Rater
  const twoRanks = checkTwoRanksAboveRater(r, searchSource);
  if (twoRanks) {
    const raterDisp = formatNameToLastFirstRank(twoRanks.raterRecord.name, twoRanks.raterRecord.rank);
    items.push({
      id: `${r.id}_two_ranks_above`,
      recordId: r.id,
      type: "two_ranks_above",
      title: "Rater Two Ranks Above Ratee",
      reason: twoRanks.warning,
      discrepantRole: "rater",
      discrepantName: raterDisp,
      rateeName,
      rateeRank: r.rank,
      rateeRole: r.role,
      raterName: raterDisp,
      seniorRaterName,
      reviewerName,
      etpReason: r.etpReason,
      etpStatus: r.etpStatus,
      etpApprovedDate: r.etpApprovedDate,
      etpNotes: r.etpNotes
    });
  }

  // 3. Same Rank Rater
  const sameRank = checkSameRankRater(r, searchSource);
  if (sameRank) {
    const raterDisp = formatNameToLastFirstRank(sameRank.raterRecord.name, sameRank.raterRecord.rank);
    items.push({
      id: `${r.id}_same_rank_rater`,
      recordId: r.id,
      type: "same_rank_rater",
      title: "Same Rank Rating Discrepancy",
      reason: sameRank.warning,
      discrepantRole: "rater",
      discrepantName: raterDisp,
      rateeName,
      rateeRank: r.rank,
      rateeRole: r.role,
      raterName: raterDisp,
      seniorRaterName,
      reviewerName,
      etpReason: r.etpReason,
      etpStatus: r.etpStatus,
      etpApprovedDate: r.etpApprovedDate,
      etpNotes: r.etpNotes
    });
  }

  // 4. Senior Rater Mismatch
  const srMismatch = checkSeniorRaterMismatch(r, searchSource);
  if (srMismatch) {
    items.push({
      id: `${r.id}_senior_rater_mismatch`,
      recordId: r.id,
      type: "senior_rater_mismatch",
      title: "Senior Rater Mismatch",
      reason: srMismatch.reason,
      discrepantRole: "seniorRater",
      discrepantName: srMismatch.actualName,
      rateeName,
      rateeRank: r.rank,
      rateeRole: r.role,
      raterName,
      seniorRaterName: srMismatch.actualName,
      reviewerName,
      etpReason: r.etpReason,
      etpStatus: r.etpStatus,
      etpApprovedDate: r.etpApprovedDate,
      etpNotes: r.etpNotes
    });
  }

  // 5. Reviewer Mismatch
  const revMismatch = checkReviewerMismatch(r, searchSource);
  if (revMismatch) {
    items.push({
      id: `${r.id}_reviewer_mismatch`,
      recordId: r.id,
      type: "reviewer_mismatch",
      title: "SGM Reviewer Required",
      reason: revMismatch.reason,
      discrepantRole: "reviewer",
      discrepantName: `Missing Reviewer (Expected: ${revMismatch.expectedName})`,
      rateeName,
      rateeRank: r.rank,
      rateeRole: r.role,
      raterName,
      seniorRaterName,
      reviewerName: "None [Missing]",
      etpReason: r.etpReason,
      etpStatus: r.etpStatus,
      etpApprovedDate: r.etpApprovedDate,
      etpNotes: r.etpNotes
    });
  }

  // 6. User entered custom ETP (without standard rule match)
  if (items.length === 0 && (r.etpReason || r.etpStatus)) {
    items.push({
      id: `${r.id}_custom_etp`,
      recordId: r.id,
      type: "custom_etp",
      title: "Unit Exception to Policy",
      reason: r.etpReason || "Unit authorized Exception to Policy on file.",
      discrepantRole: "ratee",
      discrepantName: rateeName,
      rateeName,
      rateeRank: r.rank,
      rateeRole: r.role,
      raterName,
      seniorRaterName,
      reviewerName,
      etpReason: r.etpReason,
      etpStatus: r.etpStatus,
      etpApprovedDate: r.etpApprovedDate,
      etpNotes: r.etpNotes
    });
  }

  return items;
}

/**
 * Returns all discrepancies across an entire list of records.
 */
export function getAllDiscrepancies(records: ArmyRatingRecord[], allRecords?: ArmyRatingRecord[]): DiscrepancyItem[] {
  const searchSource = allRecords && allRecords.length > 0 ? allRecords : records;
  const list: DiscrepancyItem[] = [];

  records.forEach(r => {
    const disc = getRecordDiscrepancies(r, searchSource);
    list.push(...disc);
  });

  return list;
}
