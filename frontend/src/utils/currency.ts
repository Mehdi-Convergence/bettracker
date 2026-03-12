export function getCurrencySymbol(currency: string): string {
  const map: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    CHF: "CHF",
  };
  return map[currency] ?? "€";
}
