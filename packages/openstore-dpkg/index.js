'use strict';

const bindings = require('bindings');
const addon = bindings('dpkg_version');

/**
 * Compare two debian version strings using dpkg's version comparison algorithm
 *
 * @param {string} v1 First version string
 * @param {string} v2 Second version string
 * @returns {number}
 *    v1 < v2 : <0
 *    v1 = v2 : 0
 *    v1 > v2 : >0
 */
function compareVersions(v1, v2) {
  if (typeof v1 !== 'string' || typeof v2 !== 'string') {
    throw new TypeError('Version arguments must be strings');
  }
  return addon.compareVersions(v1, v2);
}

/**
 * Check if a version string is a valid debian version number
 *
 * @param {string} version Version string to check
 * @returns {boolean} True if valid, false otherwise
 */
function isValidVersion(version) {
  if (typeof version !== 'string') {
    return false;
  }
  try {
    addon.compareVersions(version, version);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  compareVersions,
  isValidVersion,
  default: compareVersions
};
