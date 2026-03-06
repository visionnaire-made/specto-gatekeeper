'use strict';

const { randomInt } = require('crypto');

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a random segment of the given length from CHARSET.
 * @param {number} length
 * @returns {string}
 */
function randomSegment(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[randomInt(0, CHARSET.length)];
  }
  return result;
}

const MAX_RETRIES = 10;

/**
 * Generate a unique SPECTO-XXXX-XXXX invite code.
 * Retries up to MAX_RETRIES times; throws if a unique code cannot be generated.
 *
 * @param {(text: string, params?: any[]) => Promise<import('pg').QueryResult>} queryFn
 *   A query function compatible with both pool.query and a transaction client's query.
 * @returns {Promise<string>} The unique code.
 */
async function generateCode(queryFn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = `SPECTO-${randomSegment(4)}-${randomSegment(4)}`;
    const result = await queryFn(
      'SELECT 1 FROM invite_codes WHERE code = $1',
      [candidate]
    );
    if (result.rowCount === 0) {
      return candidate;
    }
  }
  throw new Error(`Failed to generate a unique invite code after ${MAX_RETRIES} attempts.`);
}

module.exports = { generateCode, randomSegment };
