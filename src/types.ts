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
  effectiveAsOf?: string;
  proposedEffectiveDateFuture?: string;
  proposedEffectiveDateAlternate?: string;
}

export interface ArmyRatingRecord {
  id: string;
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
  role: RatingRole | string; // Principal Duty Title / Role in the organization layout
  keyLeaderTitle?: string; // Custom title for key leader positions
  version?: "current" | "future" | "alternate"; // Version profile draft
  ncoerStatus?: string; // NCOER Status
  ncoerStatusDate?: string; // NCOER Status change date/timestamp (YYYY-MM-DD)
  isCustomStatus?: boolean; // Flag if status is custom
}

export interface OrgNode {
  record: ArmyRatingRecord;
  children: OrgNode[];
}
