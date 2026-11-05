const KEY = "ivoire-rolls-v1";

type Saved = { version: 1; rolls: number[] };

export function loadRolls(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Saved;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rolls)) return [];
    return parsed.rolls.filter((n) => Number.isInteger(n) && n >= 1 && n <= 6).slice(0, 24);
  } catch {
    return [];
  }
}

export function saveRolls(rolls: number[]) {
  const payload: Saved = { version: 1, rolls: rolls.slice(0, 24) };
  localStorage.setItem(KEY, JSON.stringify(payload));
}
