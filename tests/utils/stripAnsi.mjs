// eslint-disable-next-line no-control-regex
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;

/**
 * @param {string} value
 */
export function stripAnsi(value) {
  return value.replace(ansiPattern, "");
}
