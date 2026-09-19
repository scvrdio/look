// Port of the original bot's title matching and query fallbacks.
export const normalizeTitle = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, " ").trim().replace(/\s+/g, " ");
export function queryVariants(query: string) {
  const normalized = normalizeTitle(query);
  const alphabet = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
  const latin = ["a","b","v","g","d","e","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sch","","y","","e","yu","ya"];
  const transliterated = [...normalized].map(c => alphabet.includes(c) ? latin[alphabet.indexOf(c)] : c).join("");
  return [...new Set([query.trim(), normalized, transliterated, normalized.replace(/\b(?:19|20)\d{2}\b/g, "").trim()])].filter(Boolean);
}
// SequenceMatcher-style recursively selected longest common substrings.
function matchingCharacters(a: string, b: string): number {
  let length = 0, endA = 0, endB = 0, previous = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) {
      if (a[i] !== b[j]) continue;
      current[j + 1] = previous[j] + 1;
      if (current[j + 1] > length) { length = current[j + 1]; endA = i + 1; endB = j + 1; }
    }
    previous = current;
  }
  if (!length) return 0;
  return length + matchingCharacters(a.slice(0, endA - length), b.slice(0, endB - length)) + matchingCharacters(a.slice(endA), b.slice(endB));
}
export function searchScore(query: string, title: string) {
  const a = normalizeTitle(query).slice(0, 200), b = normalizeTitle(title).slice(0, 200);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const tokens = new Set(b.split(" "));
  if (a.split(" ").every(t => tokens.has(t))) return 0.88;
  return 2 * matchingCharacters(a, b) / (a.length + b.length);
}
