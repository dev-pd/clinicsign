/**
 * Shared ESLint fragments for ClinicSign.
 *
 * - Web apps: extend `next/core-web-vitals` from the app plus `./web.js` rules.
 * - Node apps: extend `eslint:recommended` + `@typescript-eslint` plus `./node.js` rules.
 */
module.exports = {
  web: require("./web.js"),
  node: require("./node.js"),
};
