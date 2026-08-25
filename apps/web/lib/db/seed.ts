import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  console.log("Seeding knowledge base...");

  // EK-53 countries (%70 incentive)
  const ek53Countries = [
    { countryCode: "DE", countryName: "Germany", incentiveRate: 70 },
    { countryCode: "US", countryName: "United States", incentiveRate: 70 },
    { countryCode: "AZ", countryName: "Azerbaijan", incentiveRate: 70 },
    { countryCode: "AE", countryName: "United Arab Emirates", incentiveRate: 70 },
    { countryCode: "GB", countryName: "United Kingdom", incentiveRate: 70 },
    { countryCode: "FR", countryName: "France", incentiveRate: 70 },
    { countryCode: "IE", countryName: "Ireland", incentiveRate: 70 },
    { countryCode: "ES", countryName: "Spain", incentiveRate: 70 },
    { countryCode: "CA", countryName: "Canada", incentiveRate: 70 },
    { countryCode: "QA", countryName: "Qatar", incentiveRate: 70 },
    { countryCode: "KZ", countryName: "Kazakhstan", incentiveRate: 70 },
    { countryCode: "EG", countryName: "Egypt", incentiveRate: 70 },
    { countryCode: "NG", countryName: "Nigeria", incentiveRate: 70 },
    { countryCode: "NO", countryName: "Norway", incentiveRate: 70 },
    { countryCode: "UZ", countryName: "Uzbekistan", incentiveRate: 70 },
    { countryCode: "PL", countryName: "Poland", incentiveRate: 70 },
    { countryCode: "RO", countryName: "Romania", incentiveRate: 70 },
    { countryCode: "RU", countryName: "Russia", incentiveRate: 70 },
    { countryCode: "SN", countryName: "Senegal", incentiveRate: 70 },
    { countryCode: "SA", countryName: "Saudi Arabia", incentiveRate: 70 },
  ];

  for (const country of ek53Countries) {
    await db.insert(schema.incentiveCountries).values(country).onConflictDoNothing();
  }
  console.log(`Seeded ${ek53Countries.length} EK-53 countries`);

  // Agency disclaimers
  const disclaimers = [
    {
      locale: "de",
      disclaimerText: "Die Behandlungen werden in einer vertraglich verbundenen Gesundheitseinrichtung durchgeführt, die über eine offizielle Genehmigung für internationalen Gesundheitstourismus verfügt.",
    },
    {
      locale: "en",
      disclaimerText: "Treatments are performed at a contractually affiliated healthcare facility that holds an official authorization for international health tourism.",
    },
  ];

  for (const disclaimer of disclaimers) {
    await db.insert(schema.agencyDisclaimers).values(disclaimer).onConflictDoNothing();
  }
  console.log(`Seeded ${disclaimers.length} agency disclaimers`);

  // Platform rules
  const rules = [
    {
      platform: "meta" as const,
      ruleType: "whatsapp_unavailable",
      countryScope: ["DE", "FR", "GB", "ES", "IE", "NO", "PL", "RO", "NL", "BE", "AT", "CH", "IT", "SE", "DK", "FI", "PT", "GR", "CZ", "HU", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "CY", "MT", "LU"],
      ruleContent: {
        description: "WhatsApp conversation optimization is not available in European countries",
        action: "do_not_offer_whatsapp_format",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "whatsapp_available",
      countryScope: ["US", "CA", "AU"],
      ruleContent: {
        description: "WhatsApp conversation optimization is available",
        action: "offer_whatsapp_format",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "turkish_text_forbidden",
      countryScope: [],
      ruleContent: {
        description: "Turkish text in health tourism ads disqualifies the advertiser from government incentives",
        action: "block_campaign_with_turkish_text",
        severity: "blocker",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "agency_disclaimer_required",
      countryScope: [],
      clientTypeScope: "agency",
      ruleContent: {
        description: "Health tourism agencies must include the Exporters Association disclaimer in ad text",
        action: "auto_append_disclaimer",
        severity: "blocker",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "whatsapp_field_bypass",
      countryScope: [],
      ruleContent: {
        description: "Meta blocks 'WhatsApp' in short-answer lead form questions. Use 'Whats.App' instead.",
        action: "auto_replace_whatsapp_text",
        replaceFrom: "WhatsApp",
        replaceTo: "Whats.App",
      },
    },
  ];

  for (const rule of rules) {
    await db.insert(schema.platformRules).values(rule);
  }
  console.log(`Seeded ${rules.length} platform rules`);

  // Lead form templates
  const templates = [
    {
      treatmentCategory: "rhinoplasty",
      locale: "en",
      questions: [
        { type: "short_answer" as const, text: "Share your Whats.App number so we can reach you:", required: true },
        { type: "multiple_choice" as const, text: "What type of nose do you prefer?", required: true, options: ["Natural", "Barbie", "Half Barbie / Half Natural"] },
        { type: "multiple_choice" as const, text: "When are you considering rhinoplasty?", required: true, options: ["1-3 months", "3-6 months", "6+ months", "Not sure yet"] },
      ],
    },
    {
      treatmentCategory: "dental",
      locale: "en",
      questions: [
        { type: "short_answer" as const, text: "Share your Whats.App number so we can reach you:", required: true },
        { type: "multiple_choice" as const, text: "Which treatment are you interested in?", required: true, options: ["Dental Implants", "Veneers", "Crowns", "Smile Makeover", "Other"] },
        { type: "multiple_choice" as const, text: "When are you planning to visit Turkey?", required: true, options: ["1-3 months", "3-6 months", "6+ months", "Not sure yet"] },
      ],
    },
    {
      treatmentCategory: "bariatric",
      locale: "en",
      questions: [
        { type: "short_answer" as const, text: "Share your Whats.App number so we can reach you:", required: true },
        { type: "multiple_choice" as const, text: "Which procedure are you interested in?", required: true, options: ["Gastric Sleeve", "Gastric Bypass", "Gastric Balloon", "Not sure yet"] },
        { type: "multiple_choice" as const, text: "When are you planning to visit Turkey?", required: true, options: ["1-3 months", "3-6 months", "6+ months", "Not sure yet"] },
      ],
    },
  ];

  for (const template of templates) {
    await db.insert(schema.leadFormTemplates).values(template);
  }
  console.log(`Seeded ${templates.length} lead form templates`);

  console.log("Seed complete!");
}

seed().catch(console.error);
