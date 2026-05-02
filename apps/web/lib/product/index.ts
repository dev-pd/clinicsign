import { clinicProduct } from "./clinic";
import { genericProduct } from "./generic";
import type { ProductCopy, ProductId } from "./types";

function parseProductId(raw: string | undefined): ProductId {
  if (raw === "generic") {
    return "generic";
  }
  return "clinic";
}

export function getProductId(): ProductId {
  return parseProductId(process.env.NEXT_PUBLIC_PRODUCT_SKIN);
}

export function getProductCopy(): ProductCopy {
  return getProductId() === "generic" ? genericProduct : clinicProduct;
}

export type { ProductCopy, ProductId };
