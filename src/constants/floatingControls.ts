/**
 * Room the global floating controls take, for screens to leave clear.
 *
 * Three controls float over every signed-in screen: the PT nav button
 * (top-right, AppNavSheet), Home (bottom-left, HomeFab) and Aimee
 * (bottom-right, AimeeFAB). They overlay rather than displace, so a screen
 * that puts a control in its header's right end, or ends its scroll content
 * at the bottom edge, gets that control covered. Measured on the web build
 * 2026-10-21: "Save scan", "Post", "Continue", "Cancel" and "Search" were all
 * sitting under one of the three.
 */

/**
 * Bottom padding for a screen's scroll content, so its last row can scroll
 * clear of Home and Aimee. Aimee is 56pt tall and sits 18pt above the larger
 * of the safe-area inset and 12, so on an iPhone with the 34pt home indicator
 * it reaches 108pt up; this adds a margin. Scroll content already ends above
 * that inset, but a fixed bar pinned to bottom: 0 does not.
 */
export const FLOATING_BOTTOM_CLEARANCE = 124;

/**
 * Right padding for a header row, so its right-hand controls sit left of the
 * PT button (36pt wide, 14pt from the edge) instead of under it.
 */
export const FLOATING_TOP_RIGHT_CLEARANCE = 58;
