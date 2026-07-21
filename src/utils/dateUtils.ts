/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper to add exactly 90 days to a date string (YYYY-MM-DD)
 */
export function add90Days(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + 90);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    return "";
  }
}

/**
 * Helper to calculate THRU date (365 days inclusive, which is fromDate + 364 days)
 */
export function calculateThruDate(fromDateStr: string): string {
  if (!fromDateStr) return "";
  try {
    const date = new Date(fromDateStr + "T12:00:00");
    if (isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + 364);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    return "";
  }
}
