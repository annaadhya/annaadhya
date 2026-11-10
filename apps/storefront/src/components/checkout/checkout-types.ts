import type { CustomerDoc } from "../../lib/types";

/** A saved delivery address — mirrors CustomerAddress in @annaadhya/contracts. */
export type CustomerAddressShape = CustomerDoc["addresses"][number];
