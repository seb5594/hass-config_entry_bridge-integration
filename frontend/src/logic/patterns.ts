// Mirrors the server's pattern rules so the editor can warn before anything is saved.
// The server decides; this only keeps people from typing patterns it would refuse.

export const MAX_PATTERN_LENGTH = 200;
// A group that is repeated and itself contains a repeat, like (a+)+ or (.*)*.
const NESTED_REPEAT = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d*,\d*\})/;

export function isValidPattern(pattern: string): boolean {
  if (!pattern.trim() || pattern.length > MAX_PATTERN_LENGTH || NESTED_REPEAT.test(pattern)) return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

/** Whether an entity would be hidden by the given IDs and patterns (the editor shows the effect while typing). */
export function matches(entityId: string, name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (!isValidPattern(pattern)) return false;
    const expression = new RegExp(pattern, "i");
    return expression.test(entityId) || expression.test(name);
  });
}
