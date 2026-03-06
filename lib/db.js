'use strict';

require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err);
});

/**
 * Execute a query using the pool directly (no manual client acquire/release).
 * @param {string} text  SQL text
 * @param {any[]}  [params]  Bound parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query, pool };
