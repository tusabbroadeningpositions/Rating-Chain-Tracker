/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArmyRatingRecord, RatingRole } from "../types";

export interface PositionedNode {
  record: ArmyRatingRecord;
  xPercent: number;
  widthPercent: number;
  yPercent: number;
  heightPercent: number;
  columnWidthPercent?: number;
}

export interface ChartLane {
  laneLeader: ArmyRatingRecord;
  subordinates: ArmyRatingRecord[];
}

export interface ChartColumn {
  header: ArmyRatingRecord;
  verticalStack: ArmyRatingRecord[];
  lanes: ChartLane[];
}

export interface GroupLeaderBlock {
  leader: ArmyRatingRecord;
  columns: ChartColumn[];
}

export interface OrganizedChart {
  oic: ArmyRatingRecord | null;
  elementLeader: ArmyRatingRecord | null;
  directColumns: ChartColumn[];
  groups: GroupLeaderBlock[];
  unassigned: ArmyRatingRecord[];
}

/**
 * Organizes a flat list of ArmyRatingRecords into the specific visual hierarchy
 * shown in the Army Rating Scheme image:
 * Level 1: OIC (Officer in Charge) - Span Full Width
 * Level 2: Element Leader - Span Full Width
 * Level 3: Group Leaders & Key Leaders - Positioned Horizontally side-by-side
 * Level 4: Column Headers - Positioned Horizontally under their respective Group Leader
 * Level 5: Subordinates - Stacked vertically under their Column Header
 */
export function organizeChartData(records: ArmyRatingRecord[]): OrganizedChart {
  // Find OIC
  const oic = records.find(r => r.role === RatingRole.OIC) || null;

  // Find Element Leader (SGM / Leader whose rater is OIC or who has Role = ELEMENT_LEADER)
  const elementLeader = records.find(r => r.role === RatingRole.ELEMENT_LEADER) || null;

  // Find Group Leaders (Blue) and Key Leaders (Purple)
  const groupAndKeyLeaders = records.filter(
    r => r.role === RatingRole.GROUP_LEADER || r.role === RatingRole.KEY_LEADER
  );

  // Helper to check if a record is rated by a leader
  const isRatedBy = (record: ArmyRatingRecord, leader: ArmyRatingRecord) => {
    if (!record.raterId) return false;
    // Direct ID match
    if (record.raterId === leader.id) return true;
    
    // Fallback: Name match (handle cases where raterId is the string name from import)
    const clean = (s: string) => s.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
    const raterStr = clean(record.raterId);
    if (raterStr === clean(leader.name)) return true;
    if (raterStr === clean(`${leader.rank} ${leader.name}`)) return true;
    
    return false;
  };

  // Helper to build columns for a leader
  const buildColumnsForLeader = (leader: ArmyRatingRecord): ChartColumn[] => {
    let headers = records.filter(r => isRatedBy(r, leader));
    headers = headers.filter(
      h => h.role !== RatingRole.OIC && h.role !== RatingRole.ELEMENT_LEADER && h.role !== RatingRole.GROUP_LEADER && h.role !== RatingRole.KEY_LEADER
    );

    const columns: ChartColumn[] = headers.map(header => {
      const descendants: ArmyRatingRecord[] = [];
      const gatherDescendants = (parent: ArmyRatingRecord) => {
        const directRatees = records.filter(r => isRatedBy(r, parent));
        for (const ratee of directRatees) {
          if (descendants.some(d => d.id === ratee.id) || ratee.id === parent.id) continue;
          descendants.push(ratee);
          gatherDescendants(ratee);
        }
      };
      gatherDescendants(header);

      const rolePriority = {
        [RatingRole.OIC]: 0,
        [RatingRole.ELEMENT_LEADER]: 1,
        [RatingRole.GROUP_LEADER]: 2,
        [RatingRole.KEY_LEADER]: 3,
        [RatingRole.SECTION_LEADER]: 4,
        [RatingRole.MASTER_MUSICIAN]: 5,
        [RatingRole.SENIOR_MUSICIAN]: 6,
        [RatingRole.MUSICIAN]: 7,
      };

      const verticalStack = descendants
        .filter(d => d.role !== RatingRole.GROUP_LEADER && d.role !== RatingRole.KEY_LEADER)
        .sort((a, b) => (rolePriority[a.role] || 9) - (rolePriority[b.role] || 9));

      const laneLeaders = records.filter(
        r => isRatedBy(r, header) &&
        r.role !== RatingRole.OIC &&
        r.role !== RatingRole.ELEMENT_LEADER &&
        r.role !== RatingRole.GROUP_LEADER &&
        r.role !== RatingRole.KEY_LEADER
      );

      laneLeaders.sort((a, b) => (rolePriority[a.role] || 9) - (rolePriority[b.role] || 9));

      const lanes: ChartLane[] = laneLeaders.map(laneLeader => {
        const descendantsList: ArmyRatingRecord[] = [];
        const gatherSubordinateDescendants = (parent: ArmyRatingRecord) => {
          const directRatees = records.filter(r => isRatedBy(r, parent));
          for (const ratee of directRatees) {
            if (descendantsList.some(d => d.id === ratee.id) || ratee.id === parent.id) continue;
            descendantsList.push(ratee);
            gatherSubordinateDescendants(ratee);
          }
        };
        gatherSubordinateDescendants(laneLeader);

        const subordinates = descendantsList
          .filter(d => d.role !== RatingRole.GROUP_LEADER && d.role !== RatingRole.KEY_LEADER)
          .sort((a, b) => (rolePriority[a.role] || 9) - (rolePriority[b.role] || 9));

        return { laneLeader, subordinates };
      });

      return { header, verticalStack, lanes };
    });

    columns.sort((a, b) => {
      const roleOrder = {
        [RatingRole.SECTION_LEADER]: 1,
        [RatingRole.MASTER_MUSICIAN]: 2,
        [RatingRole.SENIOR_MUSICIAN]: 3,
        [RatingRole.MUSICIAN]: 4,
      };
      const aVal = roleOrder[a.header.role] || 9;
      const bVal = roleOrder[b.header.role] || 9;
      return aVal - bVal;
    });

    return columns;
  };

  // For each Group/Key Leader, build their block of columns
  const groups: GroupLeaderBlock[] = groupAndKeyLeaders.map(leader => ({
    leader,
    columns: buildColumnsForLeader(leader)
  }));

  // Direct Columns for Command (OIC or Element Leader)
  let directColumns: ChartColumn[] = [];
  if (elementLeader) {
    directColumns = buildColumnsForLeader(elementLeader);
  } else if (oic) {
    directColumns = buildColumnsForLeader(oic);
  }

  // Identify unassigned records (e.g. orphan records that are not in the main tree)
  const assignedIds = new Set<string>();
  if (oic) assignedIds.add(oic.id);
  if (elementLeader) assignedIds.add(elementLeader.id);
  
  // Track IDs from direct columns
  for (const c of directColumns) {
    assignedIds.add(c.header.id);
    for (const v of c.verticalStack) assignedIds.add(v.id);
    for (const l of c.lanes) {
      assignedIds.add(l.laneLeader.id);
      for (const s of l.subordinates) assignedIds.add(s.id);
    }
  }

  for (const g of groups) {
    assignedIds.add(g.leader.id);
    for (const c of g.columns) {
      assignedIds.add(c.header.id);
      // All descendants (verticalStack, laneLeaders, subordinates) should be in assignedIds
      for (const v of c.verticalStack) {
        assignedIds.add(v.id);
      }
      for (const l of c.lanes) {
        assignedIds.add(l.laneLeader.id);
        for (const s of l.subordinates) {
          assignedIds.add(s.id);
        }
      }
    }
  }

  // Double check: include anyone rated by OIC or Element Leader that might have been missed
  if (oic) {
    records.filter(r => isRatedBy(r, oic)).forEach(r => assignedIds.add(r.id));
  }
  if (elementLeader) {
    records.filter(r => isRatedBy(r, elementLeader)).forEach(r => assignedIds.add(r.id));
  }

  const unassigned = records.filter(r => !assignedIds.has(r.id));

  return {
    oic,
    elementLeader,
    directColumns,
    groups,
    unassigned
  };
}

/**
 * Get color scheme based on the RatingRole.
 * Matches the colors of the attached image:
 * - OIC: White background with black text
 * - Element Leader: Lime Green background, black text
 * - Group Leader: Blue background, white text
 * - Key Leader: Purple background, white text
 * - Section Leader: Yellow background, black text
 * - Master Musician: White background, black text
 * - Senior Musician: Grey background, black text
 * - Musician: Soft Off-white/Light Grey, black text
 */
export function getRoleColors(role: RatingRole | string): {
  bg: string;
  text: string;
  border: string;
  hexBg: string; // for canvas/PPTX
  hexText: string;
  hexBorder: string;
} {
  switch (role) {
    case RatingRole.OIC:
      return {
        bg: "bg-white",
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border-2",
        hexBg: "FFFFFF",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.ELEMENT_LEADER:
      return {
        bg: "bg-[#92d050]", // Exact PowerPoint green
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border-2",
        hexBg: "92D050",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.GROUP_LEADER:
      return {
        bg: "bg-[#00a2e8]", // Exact PowerPoint blue
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border-2",
        hexBg: "00A2E8",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.KEY_LEADER:
      return {
        bg: "bg-[#d254d2]", // Exact PowerPoint purple/orchid
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border-2",
        hexBg: "D254D2",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.SECTION_LEADER:
      return {
        bg: "bg-[#ffc000]", // Exact PowerPoint yellow
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border-2",
        hexBg: "FFC000",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.MASTER_MUSICIAN:
      return {
        bg: "bg-white",
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border-2",
        hexBg: "FFFFFF",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.SENIOR_MUSICIAN:
      return {
        bg: "bg-[#a6a6a6]", // Exact PowerPoint grey
        text: "text-slate-950 font-bold",
        border: "border-slate-950 border",
        hexBg: "A6A6A6",
        hexText: "000000",
        hexBorder: "000000"
      };
    case RatingRole.MUSICIAN:
    default:
      return {
        bg: "bg-white",
        text: "text-slate-950 font-medium",
        border: "border-slate-950 border",
        hexBg: "FFFFFF",
        hexText: "000000",
        hexBorder: "000000"
      };
  }
}
