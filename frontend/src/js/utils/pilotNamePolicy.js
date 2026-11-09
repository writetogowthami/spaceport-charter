import policy from "../../../../shared/pilot_name_ranges.json";

export const PILOT_NAME_MIN_LENGTH = 2;
export const PILOT_NAME_MAX_LENGTH = 100;
export const PILOT_NAME_UNICODE_VERSION = policy.unicodeVersion;

const ranges = policy.ranges;

const boundaryWhitespace =
  /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/u;

function isBoundaryWhitespace(character) {
  return boundaryWhitespace.test(character);
}

export function trimPilotName(value) {
  if (typeof value !== "string") return "";

  const characters = Array.from(value);

  let start = 0;
  let end = characters.length;

  while (start < end && isBoundaryWhitespace(characters[start])) {
    start += 1;
  }

  while (end > start && isBoundaryWhitespace(characters[end - 1])) {
    end -= 1;
  }

  return characters.slice(start, end).join("");
}

function isAllowedLetterOrMark(character) {
  const codepoint = character.codePointAt(0);

  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const [start, end] = ranges[middle];

    if (codepoint < start) {
      high = middle - 1;
    } else if (codepoint > end) {
      low = middle + 1;
    } else {
      return true;
    }
  }

  return false;
}

export function isValidPilotName(value) {
  if (typeof value !== "string") return false;

  const name = trimPilotName(value);
  const characters = Array.from(name);

  if (characters.length < PILOT_NAME_MIN_LENGTH || characters.length > PILOT_NAME_MAX_LENGTH) {
    return false;
  }

  if (!isAllowedLetterOrMark(characters[0])) {
    return false;
  }

  return characters.every(
    (character) =>
      isAllowedLetterOrMark(character) ||
      character === " " ||
      character === "'" ||
      character === "-"
  );
}
