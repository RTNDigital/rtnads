import { db } from "@/lib/db";
import { countries } from "@/lib/db/schema";
import { cached } from "./cache";

type Country = typeof countries.$inferSelect;

export async function getCountries(): Promise<Country[]> {
  return cached("countries:all", () => db.select().from(countries));
}

export async function getCountry(code: string): Promise<Country | undefined> {
  const all = await getCountries();
  return all.find((c) => c.code === code);
}

export async function getEk53Countries(): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.isEk53);
}

export async function getEUCountries(): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.isEU);
}

export async function getByContinent(continent: string): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.continent === continent);
}

export async function getByLanguage(lang: string): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.language === lang);
}
