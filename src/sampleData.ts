/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArmyRatingRecord, RatingRole } from "./types";

export const INITIAL_RECORDS: ArmyRatingRecord[] = [
  // 1. OIC / CMD / Leadership
  {
    id: "2",
    element: "CMD",
    dutyMosc: "420C",
    rank: "CW3",
    name: "Becker, Michael",
    from: "",
    thru: "",
    dueHqda: "",
    raterId: "",
    seniorRaterId: "",
    reviewerId: "",
    role: RatingRole.OIC
  },

  // 2. Element Leader
  {
    id: "3",
    element: "Popular",
    dutyMosc: "42S6O",
    rank: "SGM",
    name: "Leader, Chad",
    from: "2026-06-30",
    thru: "2027-06-29",
    dueHqda: "2026-09-27",
    raterId: "2", // CW3 Becker, Michael
    seniorRaterId: "",
    reviewerId: "",
    role: RatingRole.ELEMENT_LEADER
  },

  // 3. Group Leader
  {
    id: "4",
    element: "Popular",
    dutyMosc: "42S6O",
    rank: "SGM",
    name: "Brough, Regan",
    from: "2025-08-11",
    thru: "2026-08-10",
    dueHqda: "2026-11-08",
    raterId: "3", // SGM Leader, Chad
    seniorRaterId: "2", // CW3 Becker, Michael
    reviewerId: "",
    role: RatingRole.GROUP_LEADER
  },

  // 4. Section Leaders (level below Group Leader)
  {
    id: "5",
    element: "Popular",
    dutyMosc: "42S5O",
    rank: "MSG",
    name: "Brimhall, Luke",
    from: "2026-06-01",
    thru: "2027-05-31",
    dueHqda: "2027-08-29",
    raterId: "4", // SGM Brough, Regan
    seniorRaterId: "3", // SGM Leader, Chad
    reviewerId: "",
    role: RatingRole.SECTION_LEADER
  },
  {
    id: "6",
    element: "Popular",
    dutyMosc: "42S5O",
    rank: "MSG",
    name: "Perez, Xavier",
    from: "2025-06-01",
    thru: "2026-05-31",
    dueHqda: "2026-08-29",
    raterId: "4", // SGM Brough, Regan
    seniorRaterId: "3", // SGM Leader, Chad
    reviewerId: "",
    role: RatingRole.SECTION_LEADER
  },
  {
    id: "7",
    element: "Popular",
    dutyMosc: "42S5O",
    rank: "SFC",
    name: "Burbank, Christopher",
    from: "2025-08-11",
    thru: "2026-08-10",
    dueHqda: "2026-11-08",
    raterId: "5", // MSG Brimhall, Luke
    seniorRaterId: "3", // SGM Leader, Chad
    reviewerId: "",
    role: RatingRole.SECTION_LEADER
  },
  {
    id: "8",
    element: "Popular",
    dutyMosc: "42S5O",
    rank: "SSG",
    name: "Pers, Eric",
    from: "2026-04-01",
    thru: "2027-03-31",
    dueHqda: "2027-06-29",
    raterId: "6", // MSG Perez, Xavier
    seniorRaterId: "4", // SGM Brough, Regan
    reviewerId: "",
    role: RatingRole.SECTION_LEADER
  },

  // 5. Senior Musicians (level below Section Leader, acts as intermediate/raters)
  {
    id: "9",
    element: "Popular",
    dutyMosc: "42S4O",
    rank: "SFC",
    name: "Knutson, Jan",
    from: "2026-03-01",
    thru: "2027-02-28",
    dueHqda: "2027-05-29",
    raterId: "5", // MSG Brimhall, Luke
    seniorRaterId: "4", // SGM Brough, Regan
    reviewerId: "",
    role: RatingRole.SENIOR_MUSICIAN
  },
  {
    id: "10",
    element: "Popular",
    dutyMosc: "42S4O",
    rank: "SFC",
    name: "Collins, James",
    from: "2025-10-25",
    thru: "2026-10-24",
    dueHqda: "2027-01-22",
    raterId: "6", // MSG Perez, Xavier
    seniorRaterId: "3", // SGM Leader, Chad
    reviewerId: "",
    role: RatingRole.SENIOR_MUSICIAN
  },
  {
    id: "11",
    element: "Popular",
    dutyMosc: "42S4O",
    rank: "SFC",
    name: "Mollick, Dustin",
    from: "2026-06-01",
    thru: "2027-05-31",
    dueHqda: "2027-08-29",
    raterId: "6", // MSG Perez, Xavier
    seniorRaterId: "4", // SGM Brough, Regan
    reviewerId: "",
    role: RatingRole.SENIOR_MUSICIAN
  },

  // 6. Musicians
  {
    id: "12",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Pritchard, Clayton",
    from: "2025-07-01",
    thru: "2026-06-30",
    dueHqda: "2026-09-28",
    raterId: "10", // SFC Collins, James
    seniorRaterId: "6", // MSG Perez, Xavier
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "13",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Thaller, Richard",
    from: "2026-03-22",
    thru: "2027-03-21",
    dueHqda: "2027-06-19",
    raterId: "7", // SFC Burbank, Christopher
    seniorRaterId: "5", // MSG Brimhall, Luke
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "14",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Kraft, Jacob",
    from: "2026-06-01",
    thru: "2027-05-31",
    dueHqda: "2027-08-29",
    raterId: "7", // SFC Burbank, Christopher
    seniorRaterId: "4", // SGM Brough, Regan
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "15",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Dickinson, Daniel",
    from: "2025-08-01",
    thru: "2026-07-31",
    dueHqda: "2026-10-29",
    raterId: "11", // SFC Mollick, Dustin
    seniorRaterId: "4", // SGM Brough, Regan
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "16",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Rodriguez, Melinda",
    from: "2026-04-01",
    thru: "2027-03-31",
    dueHqda: "2027-06-29",
    raterId: "8", // SSG Pers, Eric
    seniorRaterId: "6", // MSG Perez, Xavier
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "17",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Aldred, Alexander",
    from: "2025-08-11",
    thru: "2026-08-10",
    dueHqda: "2026-11-08",
    raterId: "7", // SFC Burbank, Christopher
    seniorRaterId: "5", // MSG Brimhall, Luke
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "18",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Eckert, Aaron",
    from: "2025-07-01",
    thru: "2026-06-30",
    dueHqda: "2026-09-28",
    raterId: "10", // SFC Collins, James
    seniorRaterId: "6", // MSG Perez, Xavier
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "19",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Hocker, Noah",
    from: "2026-03-01",
    thru: "2027-02-28",
    dueHqda: "2027-05-29",
    raterId: "9", // SFC Knutson, Jan
    seniorRaterId: "5", // MSG Brimhall, Luke
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "20",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Kauffman, Joshua",
    from: "2025-12-01",
    thru: "2026-11-30",
    dueHqda: "2027-02-28",
    raterId: "7", // SFC Burbank, Christopher
    seniorRaterId: "5", // MSG Brimhall, Luke
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "21",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Andrews, Daniel",
    from: "2025-01-01",
    thru: "2026-12-31",
    dueHqda: "2027-03-31",
    raterId: "11", // SFC Mollick, Dustin
    seniorRaterId: "4", // SGM Brough, Regan
    reviewerId: "",
    role: RatingRole.MUSICIAN
  },
  {
    id: "22",
    element: "Popular",
    dutyMosc: "42S3O",
    rank: "SSG",
    name: "Nero, Javier",
    from: "2026-06-01",
    thru: "2027-05-31",
    dueHqda: "2027-08-29",
    raterId: "11", // SFC Mollick, Dustin
    seniorRaterId: "6", // MSG Perez, Xavier
    reviewerId: "",
    role: RatingRole.MUSICIAN
  }
];
