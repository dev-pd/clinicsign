/**
 * Cross-package types for ClinicSign.
 * Expand as PRODUCT.md schema lands in Prisma.
 */

export type DocumentStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "SIGNED"
  | "EXPIRED"
  | "VOIDED";

export type Placeholder = {
  _brand: "placeholder";
};
