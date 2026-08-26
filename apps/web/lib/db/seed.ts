import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const countriesSeed = [
  // EK-53 countries (70% incentive)
  { code: "DE", name: "Germany", nameLocal: "Deutschland", continent: "europe" as const, language: "de", languageName: "German", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "US", name: "United States", nameLocal: null, continent: "americas" as const, language: "en", languageName: "English", currency: "USD", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "AZ", name: "Azerbaijan", nameLocal: "Azərbaycan", continent: "asia" as const, language: "az", languageName: "Azerbaijani", currency: "AZN", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "AE", name: "United Arab Emirates", nameLocal: "الإمارات العربية المتحدة", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "AED", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "GB", name: "United Kingdom", nameLocal: null, continent: "europe" as const, language: "en", languageName: "English", currency: "GBP", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: false },
  { code: "FR", name: "France", nameLocal: "France", continent: "europe" as const, language: "fr", languageName: "French", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "IE", name: "Ireland", nameLocal: "Éire", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "ES", name: "Spain", nameLocal: "España", continent: "europe" as const, language: "es", languageName: "Spanish", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "CA", name: "Canada", nameLocal: null, continent: "americas" as const, language: "en", languageName: "English", currency: "CAD", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "QA", name: "Qatar", nameLocal: "قطر", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "QAR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "KZ", name: "Kazakhstan", nameLocal: "Қазақстан", continent: "asia" as const, language: "kk", languageName: "Kazakh", currency: "KZT", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "EG", name: "Egypt", nameLocal: "مصر", continent: "africa" as const, language: "ar", languageName: "Arabic", currency: "EGP", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "NG", name: "Nigeria", nameLocal: null, continent: "africa" as const, language: "en", languageName: "English", currency: "NGN", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "NO", name: "Norway", nameLocal: "Norge", continent: "europe" as const, language: "no", languageName: "Norwegian", currency: "NOK", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: false },
  { code: "UZ", name: "Uzbekistan", nameLocal: "Oʻzbekiston", continent: "asia" as const, language: "uz", languageName: "Uzbek", currency: "UZS", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "PL", name: "Poland", nameLocal: "Polska", continent: "europe" as const, language: "pl", languageName: "Polish", currency: "PLN", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "RO", name: "Romania", nameLocal: "România", continent: "europe" as const, language: "ro", languageName: "Romanian", currency: "RON", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "RU", name: "Russia", nameLocal: "Россия", continent: "europe" as const, language: "ru", languageName: "Russian", currency: "RUB", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "SN", name: "Senegal", nameLocal: "Sénégal", continent: "africa" as const, language: "fr", languageName: "French", currency: "XOF", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "SA", name: "Saudi Arabia", nameLocal: "المملكة العربية السعودية", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "SAR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  // Non-EK-53 health tourism markets (50% incentive)
  { code: "NL", name: "Netherlands", nameLocal: "Nederland", continent: "europe" as const, language: "nl", languageName: "Dutch", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "BE", name: "Belgium", nameLocal: "België", continent: "europe" as const, language: "nl", languageName: "Dutch", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "AT", name: "Austria", nameLocal: "Österreich", continent: "europe" as const, language: "de", languageName: "German", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "SE", name: "Sweden", nameLocal: "Sverige", continent: "europe" as const, language: "en", languageName: "English", currency: "SEK", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "IT", name: "Italy", nameLocal: "Italia", continent: "europe" as const, language: "it", languageName: "Italian", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "CH", name: "Switzerland", nameLocal: "Schweiz", continent: "europe" as const, language: "de", languageName: "German", currency: "CHF", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: false },
  { code: "IQ", name: "Iraq", nameLocal: "العراق", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "IQD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "KW", name: "Kuwait", nameLocal: "الكويت", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "KWD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "LY", name: "Libya", nameLocal: "ليبيا", continent: "africa" as const, language: "ar", languageName: "Arabic", currency: "LYD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "AU", name: "Australia", nameLocal: null, continent: "oceania" as const, language: "en", languageName: "English", currency: "AUD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "DK", name: "Denmark", nameLocal: "Danmark", continent: "europe" as const, language: "en", languageName: "English", currency: "DKK", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "FI", name: "Finland", nameLocal: "Suomi", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "GR", name: "Greece", nameLocal: "Ελλάδα", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "CZ", name: "Czech Republic", nameLocal: "Česko", continent: "europe" as const, language: "en", languageName: "English", currency: "CZK", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "HU", name: "Hungary", nameLocal: "Magyarország", continent: "europe" as const, language: "en", languageName: "English", currency: "HUF", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "BG", name: "Bulgaria", nameLocal: "България", continent: "europe" as const, language: "en", languageName: "English", currency: "BGN", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "HR", name: "Croatia", nameLocal: "Hrvatska", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "BA", name: "Bosnia and Herzegovina", nameLocal: "Bosna i Hercegovina", continent: "europe" as const, language: "en", languageName: "English", currency: "BAM", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "KG", name: "Kyrgyzstan", nameLocal: "Кыргызстан", continent: "asia" as const, language: "ru", languageName: "Russian", currency: "KGS", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "PT", name: "Portugal", nameLocal: "Portugal", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "SK", name: "Slovakia", nameLocal: "Slovensko", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "SI", name: "Slovenia", nameLocal: "Slovenija", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "LT", name: "Lithuania", nameLocal: "Lietuva", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "LV", name: "Latvia", nameLocal: "Latvija", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "EE", name: "Estonia", nameLocal: "Eesti", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "LU", name: "Luxembourg", nameLocal: "Luxembourg", continent: "europe" as const, language: "fr", languageName: "French", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "MT", name: "Malta", nameLocal: "Malta", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "CY", name: "Cyprus", nameLocal: "Κύπρος", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
];

const treatmentCategoriesSeed = [
  { slug: "rhinoplasty", name: "Rhinoplasty", parentSlug: null, description: "Nose reshaping surgery", keywords: ["nose job", "nose surgery", "burun estetiği"], sortOrder: 1 },
  { slug: "dental", name: "Dental", parentSlug: null, description: "Dental treatments and cosmetic dentistry", keywords: ["teeth", "dental care", "diş"], sortOrder: 2 },
  { slug: "dental-implants", name: "Dental Implants", parentSlug: "dental", description: "Tooth replacement with implants", keywords: ["implant", "tooth implant"], sortOrder: 3 },
  { slug: "dental-veneers", name: "Dental Veneers", parentSlug: "dental", description: "Porcelain or composite veneers", keywords: ["veneers", "porcelain"], sortOrder: 4 },
  { slug: "hollywood-smile", name: "Hollywood Smile", parentSlug: "dental", description: "Complete smile makeover", keywords: ["smile design", "smile makeover"], sortOrder: 5 },
  { slug: "full-mouth-restoration", name: "Full Mouth Restoration", parentSlug: "dental", description: "Complete dental reconstruction", keywords: ["full mouth", "restoration"], sortOrder: 6 },
  { slug: "facelift", name: "Facelift", parentSlug: null, description: "Facial rejuvenation surgery", keywords: ["face lift", "yüz germe"], sortOrder: 7 },
  { slug: "eyelid-surgery", name: "Eyelid Surgery", parentSlug: null, description: "Blepharoplasty — upper and lower eyelid surgery", keywords: ["blepharoplasty", "göz kapağı"], sortOrder: 8 },
  { slug: "bariatric", name: "Bariatric Surgery", parentSlug: null, description: "Weight loss surgery", keywords: ["gastric sleeve", "gastric bypass", "obesity", "mide küçültme"], sortOrder: 9 },
  { slug: "mommy-makeover", name: "Mommy Makeover", parentSlug: null, description: "Combined post-pregnancy body restoration", keywords: ["tummy tuck", "breast lift", "mommy"], sortOrder: 10 },
  { slug: "hair-transplant", name: "Hair Transplant", parentSlug: null, description: "FUE and DHI hair restoration", keywords: ["hair loss", "fue", "dhi", "saç ekimi"], sortOrder: 11 },
  { slug: "bbl", name: "BBL (Brazilian Butt Lift)", parentSlug: null, description: "Fat transfer buttock augmentation", keywords: ["butt lift", "fat transfer"], sortOrder: 12 },
  { slug: "breast-augmentation", name: "Breast Augmentation", parentSlug: null, description: "Breast implants or fat transfer", keywords: ["breast implant", "augmentation"], sortOrder: 13 },
  { slug: "tummy-tuck", name: "Tummy Tuck", parentSlug: null, description: "Abdominoplasty", keywords: ["abdominoplasty", "karın germe"], sortOrder: 14 },
  { slug: "liposuction", name: "Liposuction", parentSlug: null, description: "Fat removal surgery", keywords: ["lipo", "fat removal", "liposuction"], sortOrder: 15 },
  { slug: "ivf", name: "IVF", parentSlug: null, description: "In vitro fertilization", keywords: ["fertility", "tüp bebek"], sortOrder: 16 },
  { slug: "eye-surgery", name: "Eye Surgery", parentSlug: null, description: "LASIK and other vision correction", keywords: ["lasik", "eye", "göz"], sortOrder: 17 },
  { slug: "oncology", name: "Oncology", parentSlug: null, description: "Cancer treatment", keywords: ["cancer", "onkoloji"], sortOrder: 18 },
  { slug: "orthopedics", name: "Orthopedics", parentSlug: null, description: "Joint replacement and bone surgery", keywords: ["knee", "hip", "joint", "ortopedi"], sortOrder: 19 },
];

const disclaimersSeed = [
  { locale: "de", disclaimerText: "Die Behandlungen werden in einer vertraglich verbundenen Gesundheitseinrichtung durchgeführt, die über eine offizielle Genehmigung für internationalen Gesundheitstourismus verfügt." },
  { locale: "en", disclaimerText: "Treatments are performed at a contractually affiliated healthcare facility that holds an official authorization for international health tourism." },
  { locale: "fr", disclaimerText: "Les traitements sont effectués dans un établissement de santé contractuellement affilié, disposant d'une autorisation officielle pour le tourisme médical international." },
  { locale: "nl", disclaimerText: "Behandelingen worden uitgevoerd in een contractueel verbonden zorginstelling die beschikt over een officiële vergunning voor internationaal gezondheidstoerisme." },
  { locale: "ar", disclaimerText: "يتم إجراء العلاجات في منشأة صحية متعاقدة تحمل ترخيصاً رسمياً للسياحة الصحية الدولية." },
  { locale: "pl", disclaimerText: "Zabiegi wykonywane są w placówce medycznej powiązanej umową, posiadającej oficjalne zezwolenie na międzynarodową turystykę zdrowotną." },
  { locale: "ru", disclaimerText: "Лечение проводится в медицинском учреждении, связанном договором, которое имеет официальное разрешение на международный медицинский туризм." },
  { locale: "es", disclaimerText: "Los tratamientos se realizan en un centro sanitario contractualmente afiliado que cuenta con una autorización oficial para el turismo sanitario internacional." },
  { locale: "ro", disclaimerText: "Tratamentele sunt efectuate într-o unitate medicală afiliată contractual, care deține o autorizație oficială pentru turism medical internațional." },
  { locale: "no", disclaimerText: "Behandlingene utføres ved en kontraktsmessig tilknyttet helseinstitusjon som har offisiell godkjenning for internasjonal helseturisme." },
  { locale: "kk", disclaimerText: "Емдеу халықаралық денсаулық туризміне ресми рұқсаты бар шарттық негізде байланысқан денсаулық сақтау мекемесінде жүргізіледі." },
  { locale: "az", disclaimerText: "Müalicələr beynəlxalq sağlamlıq turizmi üçün rəsmi icazəsi olan müqavilə ilə əlaqəli səhiyyə müəssisəsində həyata keçirilir." },
  { locale: "uz", disclaimerText: "Davolanish xalqaro sog'liqni saqlash turizmi uchun rasmiy ruxsatga ega bo'lgan shartnoma asosida bog'langan sog'liqni saqlash muassasasida amalga oshiriladi." },
];

type QuestionDef = {
  type: "short_answer" | "multiple_choice";
  text: string;
  required: boolean;
  options?: string[];
};

function makeTemplates(
  category: string,
  localeQuestions: Record<string, QuestionDef[]>,
): { treatmentCategory: string; locale: string; questions: QuestionDef[] }[] {
  return Object.entries(localeQuestions).map(([locale, questions]) => ({
    treatmentCategory: category,
    locale,
    questions,
  }));
}

const whatsApp = (locale: string): QuestionDef => {
  const texts: Record<string, string> = {
    en: "Share your Whats.App number so we can reach you:",
    de: "Teilen Sie Ihre Whats.App-Nummer, damit wir Sie erreichen können:",
    nl: "Deel uw Whats.App-nummer zodat we u kunnen bereiken:",
    ar: "شارك رقم Whats.App الخاص بك حتى نتمكن من الوصول إليك:",
    pl: "Podaj swój numer Whats.App, abyśmy mogli się z Tobą skontaktować:",
    ru: "Поделитесь своим номером Whats.App, чтобы мы могли с вами связаться:",
    fr: "Partagez votre numéro Whats.App pour que nous puissions vous contacter :",
    es: "Comparta su número de Whats.App para que podamos contactarle:",
    ro: "Împărtășiți numărul dvs. de Whats.App pentru a vă putea contacta:",
    no: "Del Whats.App-nummeret ditt slik at vi kan nå deg:",
    kk: "Whats.App нөміріңізді бөлісіңіз, біз сізбен хабарласа аламыз:",
    az: "Sizinlə əlaqə saxlaya bilmək üçün Whats.App nömrənizi paylaşın:",
    uz: "Biz siz bilan bog'lanishimiz uchun Whats.App raqamingizni yuboring:",
  };
  return { type: "short_answer", text: texts[locale] || texts.en, required: true };
};

const timing = (locale: string): QuestionDef => {
  const data: Record<string, { text: string; options: string[] }> = {
    en: { text: "When are you planning to visit Turkey?", options: ["In 1-3 months", "In 3-6 months", "6+ months", "Not sure yet"] },
    de: { text: "Wann planen Sie, die Türkei zu besuchen?", options: ["In 1-3 Monaten", "In 3-6 Monaten", "6+ Monate", "Noch nicht sicher"] },
    nl: { text: "Wanneer bent u van plan Turkije te bezoeken?", options: ["Over 1-3 maanden", "Over 3-6 maanden", "6+ maanden", "Nog niet zeker"] },
    ar: { text: "متى تخطط لزيارة تركيا؟", options: ["خلال 1-3 أشهر", "خلال 3-6 أشهر", "أكثر من 6 أشهر", "لست متأكداً بعد"] },
    pl: { text: "Kiedy planujesz odwiedzić Turcję?", options: ["Za 1-3 miesiące", "Za 3-6 miesięcy", "6+ miesięcy", "Jeszcze nie wiem"] },
    ru: { text: "Когда вы планируете посетить Турцию?", options: ["Через 1-3 месяца", "Через 3-6 месяцев", "Более 6 месяцев", "Пока не уверен(а)"] },
    fr: { text: "Quand prévoyez-vous de visiter la Turquie ?", options: ["Dans 1-3 mois", "Dans 3-6 mois", "6+ mois", "Pas encore sûr(e)"] },
    es: { text: "¿Cuándo planea visitar Turquía?", options: ["En 1-3 meses", "En 3-6 meses", "6+ meses", "Aún no estoy seguro/a"] },
    ro: { text: "Când intenționați să vizitați Turcia?", options: ["În 1-3 luni", "În 3-6 luni", "6+ luni", "Nu sunt sigur(ă) încă"] },
    no: { text: "Når planlegger du å besøke Tyrkia?", options: ["Om 1-3 måneder", "Om 3-6 måneder", "6+ måneder", "Ikke sikker ennå"] },
    kk: { text: "Түркияға қашан барғыңыз келеді?", options: ["1-3 ай ішінде", "3-6 ай ішінде", "6+ ай", "Әлі белгісіз"] },
    az: { text: "Türkiyəyə nə vaxt getməyi planlaşdırırsınız?", options: ["1-3 ay ərzində", "3-6 ay ərzində", "6+ ay", "Hələ bilmirəm"] },
    uz: { text: "Turkiyaga qachon tashrif buyurishni rejalashtirmoqdasiz?", options: ["1-3 oy ichida", "3-6 oy ichida", "6+ oy", "Hali aniq emas"] },
  };
  const d = data[locale] || data.en;
  return { type: "multiple_choice", text: d.text, required: true, options: d.options };
};

const LOCALES = ["en", "de", "nl", "ar", "pl", "ru", "fr", "es", "ro", "no", "kk", "az", "uz"];

function localized(textsByLocale: Record<string, QuestionDef[]>): Record<string, QuestionDef[]> {
  const result: Record<string, QuestionDef[]> = {};
  for (const locale of LOCALES) {
    const categoryQ = textsByLocale[locale] || textsByLocale.en;
    result[locale] = [whatsApp(locale), ...categoryQ, timing(locale)];
  }
  return result;
}

const templatesSeed = [
  ...makeTemplates("rhinoplasty", localized({
    en: [{ type: "multiple_choice", text: "What type of nose do you prefer?", required: true, options: ["Natural", "Barbie", "Half Barbie / Half Natural"] }],
    de: [{ type: "multiple_choice", text: "Welchen Nasentyp bevorzugen Sie?", required: true, options: ["Natürlich", "Barbie", "Halb Barbie / Halb Natürlich"] }],
    nl: [{ type: "multiple_choice", text: "Welk type neus heeft uw voorkeur?", required: true, options: ["Natuurlijk", "Barbie", "Half Barbie / Half Natuurlijk"] }],
    ar: [{ type: "multiple_choice", text: "ما نوع الأنف الذي تفضله؟", required: true, options: ["طبيعي", "باربي", "نصف باربي / نصف طبيعي"] }],
    pl: [{ type: "multiple_choice", text: "Jaki typ nosa preferujesz?", required: true, options: ["Naturalny", "Barbie", "Pół Barbie / Pół Naturalny"] }],
    ru: [{ type: "multiple_choice", text: "Какой тип носа вы предпочитаете?", required: true, options: ["Натуральный", "Барби", "Полу-Барби / Полу-Натуральный"] }],
  })),
  ...makeTemplates("dental", localized({
    en: [{ type: "multiple_choice", text: "Which treatment are you interested in?", required: true, options: ["Dental Implants", "Veneers", "Crowns", "Smile Makeover", "Other"] }],
    de: [{ type: "multiple_choice", text: "Für welche Behandlung interessieren Sie sich?", required: true, options: ["Zahnimplantate", "Veneers", "Kronen", "Smile Makeover", "Andere"] }],
    nl: [{ type: "multiple_choice", text: "In welke behandeling bent u geïnteresseerd?", required: true, options: ["Tandimplantaten", "Veneers", "Kronen", "Smile Makeover", "Anders"] }],
    ar: [{ type: "multiple_choice", text: "ما العلاج الذي تهتم به؟", required: true, options: ["زراعة أسنان", "فينير", "تيجان", "تجميل الابتسامة", "أخرى"] }],
    pl: [{ type: "multiple_choice", text: "Jakim zabiegiem jesteś zainteresowany/a?", required: true, options: ["Implanty dentystyczne", "Licówki", "Korony", "Metamorfoza uśmiechu", "Inne"] }],
    ru: [{ type: "multiple_choice", text: "Какая процедура вас интересует?", required: true, options: ["Зубные импланты", "Виниры", "Коронки", "Дизайн улыбки", "Другое"] }],
  })),
  ...makeTemplates("bariatric", localized({
    en: [{ type: "multiple_choice", text: "Which procedure are you interested in?", required: true, options: ["Gastric Sleeve", "Gastric Bypass", "Gastric Balloon", "Not sure yet"] }],
    de: [{ type: "multiple_choice", text: "Für welchen Eingriff interessieren Sie sich?", required: true, options: ["Schlauchmagen", "Magenbypass", "Magenballon", "Noch nicht sicher"] }],
    nl: [{ type: "multiple_choice", text: "In welke ingreep bent u geïnteresseerd?", required: true, options: ["Maagverkleining", "Maagbypass", "Maagballon", "Nog niet zeker"] }],
    ar: [{ type: "multiple_choice", text: "ما الإجراء الذي تهتم به؟", required: true, options: ["تكميم المعدة", "تحويل مسار المعدة", "بالون المعدة", "لست متأكداً بعد"] }],
    pl: [{ type: "multiple_choice", text: "Jaki zabieg Cię interesuje?", required: true, options: ["Rękaw żołądkowy", "Bypass żołądkowy", "Balon żołądkowy", "Jeszcze nie wiem"] }],
    ru: [{ type: "multiple_choice", text: "Какая процедура вас интересует?", required: true, options: ["Рукавная гастрэктомия", "Желудочное шунтирование", "Желудочный баллон", "Пока не уверен(а)"] }],
  })),
  ...makeTemplates("hair-transplant", localized({
    en: [{ type: "multiple_choice", text: "Which method do you prefer?", required: true, options: ["FUE", "DHI", "Not sure — need consultation"] }],
    de: [{ type: "multiple_choice", text: "Welche Methode bevorzugen Sie?", required: true, options: ["FUE", "DHI", "Nicht sicher — Beratung gewünscht"] }],
    nl: [{ type: "multiple_choice", text: "Welke methode heeft uw voorkeur?", required: true, options: ["FUE", "DHI", "Niet zeker — consultatie gewenst"] }],
    ar: [{ type: "multiple_choice", text: "ما الطريقة التي تفضلها؟", required: true, options: ["FUE", "DHI", "غير متأكد — أحتاج استشارة"] }],
    pl: [{ type: "multiple_choice", text: "Jaką metodę preferujesz?", required: true, options: ["FUE", "DHI", "Nie jestem pewien — potrzebuję konsultacji"] }],
    ru: [{ type: "multiple_choice", text: "Какой метод вы предпочитаете?", required: true, options: ["FUE", "DHI", "Не уверен(а) — нужна консультация"] }],
  })),
  ...makeTemplates("breast-augmentation", localized({
    en: [{ type: "multiple_choice", text: "Which option are you considering?", required: true, options: ["Silicone Implants", "Fat Transfer", "Not sure yet"] }],
    de: [{ type: "multiple_choice", text: "Welche Option erwägen Sie?", required: true, options: ["Silikonimplantate", "Eigenfettunterspritzung", "Noch nicht sicher"] }],
  })),
  ...makeTemplates("facelift", localized({
    en: [{ type: "multiple_choice", text: "What is your main concern?", required: true, options: ["Sagging skin", "Wrinkles", "Jawline definition", "Overall rejuvenation"] }],
    de: [{ type: "multiple_choice", text: "Was ist Ihr Hauptanliegen?", required: true, options: ["Hängende Haut", "Falten", "Kieferlinie", "Gesamtverjüngung"] }],
  })),
  ...makeTemplates("eyelid-surgery", localized({
    en: [{ type: "multiple_choice", text: "Which area would you like to treat?", required: true, options: ["Upper eyelids", "Lower eyelids", "Both"] }],
    de: [{ type: "multiple_choice", text: "Welchen Bereich möchten Sie behandeln lassen?", required: true, options: ["Oberlider", "Unterlider", "Beide"] }],
  })),
  ...makeTemplates("bbl", localized({
    en: [{ type: "multiple_choice", text: "Have you had liposuction before?", required: true, options: ["Yes", "No", "Not sure"] }],
  })),
  ...makeTemplates("mommy-makeover", localized({
    en: [{ type: "multiple_choice", text: "Which procedures are you interested in?", required: true, options: ["Tummy Tuck + Breast Lift", "Tummy Tuck + Breast Augmentation", "Liposuction + Breast Lift", "Full Mommy Makeover"] }],
    de: [{ type: "multiple_choice", text: "Welche Eingriffe interessieren Sie?", required: true, options: ["Bauchstraffung + Bruststraffung", "Bauchstraffung + Brustvergrößerung", "Fettabsaugung + Bruststraffung", "Komplettes Mommy Makeover"] }],
  })),
  ...makeTemplates("tummy-tuck", localized({
    en: [{ type: "multiple_choice", text: "Is this your first cosmetic surgery?", required: true, options: ["Yes", "No — I've had procedures before"] }],
  })),
  ...makeTemplates("ivf", localized({
    en: [{ type: "multiple_choice", text: "Have you tried IVF before?", required: true, options: ["No — first time", "Yes — 1 attempt", "Yes — 2+ attempts"] }],
    de: [{ type: "multiple_choice", text: "Haben Sie schon einmal IVF versucht?", required: true, options: ["Nein — erstes Mal", "Ja — 1 Versuch", "Ja — 2+ Versuche"] }],
  })),
];

async function seed() {
  console.log("Seeding knowledge base...");

  // 1. Seed countries table (new)
  for (const country of countriesSeed) {
    await db.insert(schema.countries).values(country)
      .onConflictDoUpdate({
        target: schema.countries.code,
        set: { ...country },
      });
  }
  console.log(`Seeded ${countriesSeed.length} countries`);

  // 2. Seed treatment categories (new)
  for (const cat of treatmentCategoriesSeed) {
    await db.insert(schema.treatmentCategories).values(cat)
      .onConflictDoUpdate({
        target: schema.treatmentCategories.slug,
        set: { ...cat },
      });
  }
  console.log(`Seeded ${treatmentCategoriesSeed.length} treatment categories`);

  // 3. Seed disclaimers (expanded)
  for (const d of disclaimersSeed) {
    await db.insert(schema.agencyDisclaimers).values(d)
      .onConflictDoUpdate({
        target: schema.agencyDisclaimers.locale,
        set: { disclaimerText: d.disclaimerText },
      });
  }
  console.log(`Seeded ${disclaimersSeed.length} disclaimer translations`);

  // 4. Seed lead form templates (expanded)
  await db.delete(schema.leadFormTemplates);
  for (const t of templatesSeed) {
    await db.insert(schema.leadFormTemplates).values(t);
  }
  console.log(`Seeded ${templatesSeed.length} lead form templates`);

  // 5. Keep existing incentiveCountries and platformRules seeds

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
    {
      platform: "meta" as const,
      ruleType: "TURKEY_TARGETING",
      countryScope: ["TR"],
      ruleContent: {
        level: "blocker",
        message: "Türkiye hedef ülkelerde olamaz. Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır.",
        field: "targetCountries",
      },
      active: true,
    },
  ];

  const queries = [
    ...ek53Countries.map((country) =>
      db.insert(schema.incentiveCountries).values(country).onConflictDoNothing()
    ),
    db.delete(schema.platformRules),
    ...rules.map((rule) => db.insert(schema.platformRules).values(rule)),
  ] as unknown as Parameters<typeof db.batch>[0];
  await db.batch(queries);
  console.log(`Seeded ${ek53Countries.length} EK-53 incentive countries (legacy)`);
  console.log(`Seeded ${rules.length} platform rules`);

  console.log("Seed complete!");
}

seed().catch(console.error);
