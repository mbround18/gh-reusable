/**
 * This file provides compatibility functions to make existing tests work with the
 * new modular code structure. It exposes the same API that was previously available
 * from the index.js file directly but now imports from the src directory.
 */

const {
  run,
  buildNewVersion,
  resolveIncrementFromLabels,
  fetchQuery,
  getLastTag,
  detectIncrement,
} = require("../src");

module.exports = {
  run,
  buildNewVersion,
  resolveIncrementFromLabels,
  fetchQuery,
  getLastTag,
  detectIncrement,
};
