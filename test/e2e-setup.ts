import 'dotenv/config';

/** Keep e2e fast and deterministic — production uses higher Argon2 costs via env. */
process.env.ARGON2_TIME_COST = '1';
process.env.ARGON2_MEMORY_COST = '8192';
process.env.ARGON2_PARALLELISM = '1';
