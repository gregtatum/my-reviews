// eslint-disable-next-line no-control-regex
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(value) {
  return value.replace(ansiPattern, "");
}
