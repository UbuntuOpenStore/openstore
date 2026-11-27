// SPDX-License-Identifier: AGPL-3.0-or-later
import categoryIcons from "./category_icons.json" with { type: "json" };

export type Category = {
  name: string;
  slug: string;
  icon: string;
};

export function categorySlug(category: string) {
  return category.toLowerCase().replace('& ', '').replace(/ /g, '-');
}

export const categories: Category[] = Object.entries(categoryIcons).map(([name, icon]) => ({
  name,
  slug: categorySlug(name),
  icon,
}));
