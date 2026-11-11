// SPDX-License-Identifier: AGPL-3.0-or-later

const allowedPackageTypes = (import.meta.env.ALLOWED_PACKAGE_TYPES ?? "click,snap,packagekit")
  .split(",")
  .map((type) => type.trim())
  .filter(Boolean);

export const config = {
  allowedPackageTypes: new Set(allowedPackageTypes),
  clickSupportEnabled: allowedPackageTypes.includes("click"),
};
