// src/services/shared/hr-populate.config.ts
import type { PopulateOptions } from "mongoose";

/**
 * Fields safe to expose to ANY viewer who is already authorized to see the
 * parent document (staff member, their supervisor, ADMIN, SUPER-ADMIN).
 *
 * Deliberately excludes the rest of `employmentInfo` — bank details,
 * personal details (NIN, birth date, marital status, spouse info), and
 * emergency contact are never appropriate to attach to an Appraisal,
 * StaffStrategy, Leave, or any other workflow document. Those live behind
 * the user's own profile endpoint, which has its own access checks
 * (see user.service.ts `getUserById` / `isEmploymentInfoLocked`).
 *
 * If a future workflow genuinely needs a wider field, extend this constant
 * (or add a second, explicitly-named tier) rather than selecting
 * `employmentInfo` wholesale in an individual service.
 */
export const SAFE_USER_FIELDS =
  "firstName lastName email role position employmentInfo.jobDetails.title";

/**
 * Populate a User reference field with the safe field set.
 * Usage: userRef("staffId"), userRef("supervisorId"), ...
 */
export const userRef = (path: string): PopulateOptions => ({
  path,
  select: SAFE_USER_FIELDS,
});

/** Standard populate for `comments.user` across all commentable models. */
export const commentUserRef: PopulateOptions = {
  path: "comments.user",
  select: "firstName lastName email role",
};