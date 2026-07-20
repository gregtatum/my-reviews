// @ts-check

const ESC = String.fromCharCode(27); // \x1B
const BEL = String.fromCharCode(7); // \x07

/**
 * Wrap text in an OSC 8 terminal hyperlink so the visible text is clickable
 * without printing the full URL. Terminals that don't support OSC 8 simply
 * render the text and ignore the escape sequence.
 *
 * @param {string} url
 * @param {string} text
 * @returns {string}
 */
export function hyperlink(url, text) {
  const open = `${ESC}]8;;${url}${BEL}`;
  const close = `${ESC}]8;;${BEL}`;
  return `${open}${text}${close}`;
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
