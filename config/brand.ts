export interface BrandConfig {
  brandName: string;
  officeName: string;
  contactPhone: string;
}

export const brand: BrandConfig = {
  brandName: process.env.BRAND_NAME ?? "강운준 행정사",
  officeName: process.env.BRAND_OFFICE_NAME ?? "행정사사무소 다행",
  contactPhone: process.env.CONTACT_PHONE ?? "1844-1346",
};

export function getBrandPlaceholders(): Record<string, string> {
  return {
    BRAND_NAME: brand.brandName,
    OFFICE_NAME: brand.officeName,
    CONTACT_PHONE: brand.contactPhone,
  };
}
