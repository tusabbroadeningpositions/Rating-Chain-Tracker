/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArmyRatingRecord, RatingRole } from "./types";

const FAKE_NAMES = [
  "Smith, James", "Johnson, Robert", "Williams, Mary", "Brown, Patricia", "Jones, Jennifer",
  "Garcia, Linda", "Miller, Barbara", "Davis, Elizabeth", "Rodriguez, Susan", "Martinez, Jessica",
  "Hernandez, Sarah", "Lopez, Karen", "Gonzalez, Nancy", "Wilson, Lisa", "Anderson, Betty",
  "Thomas, Margaret", "Taylor, Sandra", "Moore, Ashley", "Jackson, Kimberly", "Martin, Donna"
];

const LAST_NAMES = [
  "Abbott", "Baker", "Carter", "Davis", "Evans", "Foster", "Garcia", "Harris", "Irwin", "Jackson",
  "Kelly", "Lopez", "Miller", "Nelson", "Owens", "Perez", "Quinn", "Ross", "Smith", "Taylor"
];

const FIRST_NAMES = [
  "Adam", "Brian", "Chris", "David", "Eric", "Frank", "George", "Henry", "Isaac", "James",
  "Kevin", "Liam", "Mark", "Noah", "Owen", "Paul", "Quinn", "Ryan", "Steve", "Thomas"
];

function getRandomName() {
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  return `${last}, ${first}`;
}

function getRandomStatus() {
  const statuses = ["", "Not Submitted to HR", "Submitted to HR", "Reviewing - HR", "Reviewing - CSM", "Returned for Edits", "Out for Signatures", "Submitted to HQDA", "Late"];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function getRandomLateStatus() {
  // These should be from the dropdown, but typically late ones might be in these stages
  const statuses = ["Late", "Reviewing - HR", "Reviewing - CSM", "Returned for Edits", "Out for Signatures"];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

export function generateSampleRecords(): ArmyRatingRecord[] {
  const records: ArmyRatingRecord[] = [];
  const today = new Date();
  
  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  const generateDates = (isLate: boolean, isUpcoming: boolean) => {
    const fromDate = new Date(today);
    fromDate.setFullYear(today.getFullYear() - 1);
    
    const thruDate = new Date(fromDate);
    thruDate.setFullYear(fromDate.getFullYear() + 1);
    thruDate.setDate(thruDate.getDate() - 1);

    if (isLate) {
      // thru date was in the past (e.g., 10-60 days ago)
      const offset = Math.floor(Math.random() * 50) + 10;
      thruDate.setDate(today.getDate() - offset);
      fromDate.setFullYear(thruDate.getFullYear() - 1);
      fromDate.setDate(thruDate.getDate() + 1);
    } else if (isUpcoming) {
      // thru date is in the next 30 days
      const offset = Math.floor(Math.random() * 25);
      thruDate.setDate(today.getDate() + offset);
      fromDate.setFullYear(thruDate.getFullYear() - 1);
      fromDate.setDate(thruDate.getDate() + 1);
    } else {
      // normal thru date (e.g., 6 months from now)
      const offset = Math.floor(Math.random() * 180) + 30;
      thruDate.setDate(today.getDate() + offset);
      fromDate.setFullYear(thruDate.getFullYear() - 1);
      fromDate.setDate(thruDate.getDate() + 1);
    }

    const dueHqda = new Date(thruDate);
    dueHqda.setDate(thruDate.getDate() + 90);

    return {
      from: formatDate(fromDate),
      thru: formatDate(thruDate),
      dueHqda: formatDate(dueHqda)
    };
  };

  // 1. OIC
  const oic: ArmyRatingRecord = {
    id: "oic-1",
    element: "CMD",
    dutyMosc: "420C",
    rank: "CW3",
    name: getRandomName(),
    from: "",
    thru: "",
    dueHqda: "",
    raterId: "",
    seniorRaterId: "",
    reviewerId: "",
    role: RatingRole.OIC,
    ncoerStatus: "Submitted to HQDA"
  };
  records.push(oic);

  // 2. Element Leader
  const datesEL = generateDates(false, false);
  const el: ArmyRatingRecord = {
    id: "el-1",
    element: "Main Element",
    dutyMosc: "42S6O",
    rank: "SGM",
    name: getRandomName(),
    ...datesEL,
    raterId: oic.id,
    seniorRaterId: "",
    reviewerId: "",
    role: RatingRole.ELEMENT_LEADER,
    ncoerStatus: "Submitted to HQDA"
  };
  records.push(el);

  // 3. Group Leaders (2)
  const groupLeaders: ArmyRatingRecord[] = [];
  for (let i = 1; i <= 2; i++) {
    const dates = generateDates(Math.random() > 0.8, Math.random() > 0.8);
    const gl: ArmyRatingRecord = {
      id: `gl-${i}`,
      element: "Main Element",
      dutyMosc: "42S5O",
      rank: "MSG",
      name: getRandomName(),
      ...dates,
      raterId: el.id,
      seniorRaterId: oic.id,
      reviewerId: "",
      role: RatingRole.GROUP_LEADER,
      ncoerStatus: (new Date(dates.thru) < today) ? getRandomLateStatus() : "Draft"
    };
    groupLeaders.push(gl);
    records.push(gl);
  }

  // 4. Section Leaders (4)
  const sectionLeaders: ArmyRatingRecord[] = [];
  for (let i = 1; i <= 4; i++) {
    const parentGl = groupLeaders[Math.floor((i - 1) / 2)];
    const dates = generateDates(Math.random() > 0.7, Math.random() > 0.7);
    const sl: ArmyRatingRecord = {
      id: `sl-${i}`,
      element: i <= 2 ? "Alpha Section" : "Bravo Section",
      dutyMosc: "42S4O",
      rank: "SFC",
      name: getRandomName(),
      ...dates,
      raterId: parentGl.id,
      seniorRaterId: el.id,
      reviewerId: "",
      role: RatingRole.SECTION_LEADER,
      ncoerStatus: (new Date(dates.thru) < today) ? getRandomLateStatus() : "Draft"
    };
    sectionLeaders.push(sl);
    records.push(sl);
  }

  // 5. Senior Musicians (4 - "a few")
  const seniorMusicians: ArmyRatingRecord[] = [];
  for (let i = 1; i <= 4; i++) {
    const parentSl = sectionLeaders[i - 1];
    const dates = generateDates(Math.random() > 0.6, Math.random() > 0.6);
    const sm: ArmyRatingRecord = {
      id: `sm-${i}`,
      element: parentSl.element,
      dutyMosc: "42S3O",
      rank: "SSG",
      name: getRandomName(),
      ...dates,
      raterId: parentSl.id,
      seniorRaterId: parentSl.raterId, // The Group Leader
      reviewerId: "",
      role: RatingRole.SENIOR_MUSICIAN,
      ncoerStatus: (new Date(dates.thru) < today) ? getRandomLateStatus() : "Draft"
    };
    seniorMusicians.push(sm);
    records.push(sm);
  }

  // 6. Musicians (8 - "a bunch")
  // Total so far: 1 + 1 + 2 + 4 + 4 = 12. Need 8 more to reach 20.
  for (let i = 1; i <= 8; i++) {
    // Spread them across section leaders or senior musicians
    let parentRaterId = "";
    let parentSrId = "";
    let element = "";

    if (i <= 4) {
      const parentSm = seniorMusicians[i - 1];
      parentRaterId = parentSm.id;
      parentSrId = parentSm.raterId;
      element = parentSm.element;
    } else {
      const parentSl = sectionLeaders[i - 5];
      parentRaterId = parentSl.id;
      parentSrId = parentSl.raterId;
      element = parentSl.element;
    }

    const dates = generateDates(Math.random() > 0.5, Math.random() > 0.5);
    const m: ArmyRatingRecord = {
      id: `m-${i}`,
      element: element,
      dutyMosc: "42S2O",
      rank: "SGT",
      name: getRandomName(),
      ...dates,
      raterId: parentRaterId,
      seniorRaterId: parentSrId,
      reviewerId: "",
      role: RatingRole.MUSICIAN,
      ncoerStatus: (new Date(dates.thru) < today) ? getRandomLateStatus() : "Draft"
    };
    records.push(m);
  }

  return records;
}

export const INITIAL_RECORDS = generateSampleRecords();
