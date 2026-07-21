// @ts-check

const ESC = String.fromCharCode(27); // \x1B
const BEL = String.fromCharCode(7); // \x07

/**
 * Standard 256-color palette indices, matching the base ANSI colors used by
 * cli-color. Pass one to `hyperlink` to tint its underline to match the text.
 */
export const UnderlineColor = {
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  gray: 8, // bright black, i.e. cli-color's blackBright
};

/**
 * Wrap text in an OSC 8 terminal hyperlink so the visible text is clickable
 * without printing the full URL. Terminals that don't support OSC 8 simply
 * render the text and ignore the escape sequence.
 *
 * Terminals draw their own underline under hyperlinks (often a white dashed
 * line). Passing `underlineColor` emits an SGR 58 sequence so that underline
 * is tinted to match the text; terminals that ignore SGR 58 fall back to their
 * default underline. SGR 59 resets the underline color afterwards.
 *
 * @param {string} url
 * @param {string} text
 * @param {number} [underlineColor] A 256-color palette index, e.g. from
 *   `UnderlineColor`.
 * @returns {string}
 */
export function hyperlink(url, text, underlineColor) {
  const open = `${ESC}]8;;${url}${BEL}`;
  const close = `${ESC}]8;;${BEL}`;
  const body =
    underlineColor === undefined
      ? text
      : `${ESC}[58:5:${underlineColor}m${text}${ESC}[59m`;
  return `${open}${body}${close}`;
}

/**
 * Tree-drawing connectors for a node and its descendants.
 *
 * @param {boolean} isLast Whether this node is the last child of its parent.
 * @returns {{ branch: string; stem: string }} `branch` prefixes the node line,
 *   `stem` prefixes each of the node's own children.
 */
export function treeConnectors(isLast) {
  return {
    branch: isLast ? "└─ " : "├─ ",
    stem: isLast ? "   " : "│  ",
  };
}
