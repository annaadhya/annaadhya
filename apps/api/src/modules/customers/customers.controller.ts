/** Customer self-service address book — authenticated owner-only, identity from the
 *  verified token (never a client-supplied id). Exposes the existing CustomersService
 *  address operations that previously had no HTTP surface. */
import { Body, Controller, Delete, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  savedAddressSchema,
  type AuthPrincipal,
  type CustomerDoc,
  type SavedAddressDto,
} from "@annaadhya/contracts";
import { CurrentUser } from "../../common/auth/guards";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { CustomersService } from "./customers.service";

@ApiTags("customers")
@Controller("customers/me/addresses")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** Save a delivery address to the signed-in customer's own profile. */
  @Post()
  async addAddress(
    @Body(new ZodValidationPipe(savedAddressSchema)) dto: SavedAddressDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<CustomerDoc> {
    return this.customers
      .addAddress(principal, {
        label: dto.label,
        fullName: dto.fullName,
        phone: dto.phone,
        line1: dto.line1,
        line2: dto.line2 || undefined,
        landmark: dto.landmark || undefined,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        country: dto.country,
        isDefault: dto.isDefault,
      })
      .then((c) => this.customers.forSelf(c));
  }

  /** Edit an existing address (and/or set it as the default) on the signed-in
   *  customer's own profile. Same payload shape as create — the edit form is a
   *  fully populated form, so a full replacement keeps one honest schema. */
  @Patch(":addressId")
  async updateAddress(
    @Param("addressId") addressId: string,
    @Body(new ZodValidationPipe(savedAddressSchema)) dto: SavedAddressDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<CustomerDoc> {
    return this.customers
      .updateAddress(principal, addressId, {
        label: dto.label,
        fullName: dto.fullName,
        phone: dto.phone,
        line1: dto.line1,
        line2: dto.line2 || undefined,
        landmark: dto.landmark || undefined,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        country: dto.country,
        isDefault: dto.isDefault,
      })
      .then((c) => this.customers.forSelf(c));
  }

  /** Remove an address from the signed-in customer's own profile. */
  @Delete(":addressId")
  async removeAddress(
    @Param("addressId") addressId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<CustomerDoc> {
    return this.customers.removeAddress(principal, addressId).then((c) => this.customers.forSelf(c));
  }
}
