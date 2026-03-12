/**
 * Convertit une cote décimale dans le format souhaité.
 *
 * "decimal"    → "2.50"
 * "fractional" → "3/2"
 * "american"   → "+150" ou "-200"
 */
export function formatOdds(decimal: number, format: string): string {
  if (!isFinite(decimal) || decimal <= 0) return "—";

  if (format === "fractional") {
    return decimalToFractional(decimal);
  }

  if (format === "american") {
    return decimalToAmerican(decimal);
  }

  // Par défaut : décimal
  return decimal.toFixed(2);
}

function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) {
    const american = Math.round((decimal - 1) * 100);
    return `+${american}`;
  } else {
    const american = Math.round(-100 / (decimal - 1));
    return `${american}`;
  }
}

function decimalToFractional(decimal: number): string {
  // Convertit la partie gain (decimal - 1) en fraction
  const gain = decimal - 1;

  // Cherche une fraction simple avec dénominateur <= 100
  const maxDenom = 100;
  let bestNum = 1;
  let bestDen = 1;
  let bestDiff = Math.abs(gain - bestNum / bestDen);

  for (let den = 1; den <= maxDenom; den++) {
    const num = Math.round(gain * den);
    if (num <= 0) continue;
    const diff = Math.abs(gain - num / den);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNum = num;
      bestDen = den;
    }
  }

  const g = gcd(bestNum, bestDen);
  return `${bestNum / g}/${bestDen / g}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
