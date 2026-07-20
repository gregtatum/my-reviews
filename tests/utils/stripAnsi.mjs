// eslint-disable-next-line no-control-regex
const ansiPattern = /\[[0-?]*[ -/]*[@-~]/g;
// OSC 8 hyperlinks: ESC ] 8 ; ; <url> BEL — strip the wrapper, keep the text.
// eslint-disable-next-line no-control-regex
const oscHyperlinkPattern = /\]8;;[^]*/g;

/**
 * @param {string} value
 */
export function stripAnsi(value) {
  return value.replace(oscHyperlinkPattern, "").replace(ansiPattern, "");
}
