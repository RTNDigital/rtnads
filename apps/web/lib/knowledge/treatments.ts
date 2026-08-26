import { db } from "@/lib/db";
import { treatmentCategories } from "@/lib/db/schema";
import { cached } from "./cache";

type TreatmentCategory = typeof treatmentCategories.$inferSelect;

export interface CategoryTreeNode extends TreatmentCategory {
  children: CategoryTreeNode[];
}

export async function getCategories(): Promise<TreatmentCategory[]> {
  return cached("treatments:all", () =>
    db.select().from(treatmentCategories).orderBy(treatmentCategories.sortOrder)
  );
}

export async function getCategory(slug: string): Promise<TreatmentCategory | undefined> {
  const all = await getCategories();
  return all.find((c) => c.slug === slug);
}

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const all = await getCategories();
  const map = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  for (const cat of all) {
    map.set(cat.slug, { ...cat, children: [] });
  }

  for (const node of map.values()) {
    if (node.parentSlug && map.has(node.parentSlug)) {
      map.get(node.parentSlug)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
