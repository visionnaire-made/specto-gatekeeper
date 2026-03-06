'use strict';

/**
 * Validate a redemption attempt.
 *
 * @param {(text: string, params?: any[]) => Promise<import('pg').QueryResult>} queryFn
 * @param {string} code    The invite code string (already uppercased).
 * @param {string} userId  The Discord user ID attempting to redeem.
 * @returns {Promise<{ valid: false, reason: string } | { valid: true, record: object }>}
 */
async function validateCode(queryFn, code, userId) {
  // 1. Fetch the code record
  const codeResult = await queryFn(
    'SELECT * FROM invite_codes WHERE code = $1',
    [code]
  );

  if (codeResult.rowCount === 0) {
    return { valid: false, reason: 'That invite code does not exist.' };
  }

  const record = codeResult.rows[0];

  // 2. Active check
  if (!record.is_active) {
    return { valid: false, reason: 'That invite code is no longer active.' };
  }

  // 3. Expiry check
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return { valid: false, reason: 'That invite code has expired.' };
  }

  // 4. Max uses check
  if (record.max_uses != null && record.uses >= record.max_uses) {
    return { valid: false, reason: 'That invite code has reached its maximum number of uses.' };
  }

  // 5. Duplicate redemption check (only non-revoked)
  const redemptionResult = await queryFn(
    'SELECT 1 FROM redemptions WHERE code_id = $1 AND user_id = $2 AND is_revoked = FALSE',
    [record.id, userId]
  );

  if (redemptionResult.rowCount > 0) {
    return { valid: false, reason: 'You have already redeemed this invite code.' };
  }

  return { valid: true, record };
}

module.exports = { validateCode };
