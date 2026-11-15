// Pretest setup: ensure QA database initialized and migrated
// Require an explicit local QA connection before running database setup.
import { execSync } from 'child_process';

// Map SICIS_QA_ vars to DB_ vars expected by init-db and migrate scripts
const envMap = {
  DB_HOST: process.env.SICIS_QA_DB_HOST,
  DB_PORT: process.env.SICIS_QA_DB_PORT,
  DB_NAME: process.env.SICIS_QA_DB_NAME,
  DB_USER: process.env.SICIS_QA_DB_USER,
  DB_PASSWORD: process.env.SICIS_QA_DB_PASSWORD
};

if (!['127.0.0.1', 'localhost'].includes(envMap.DB_HOST) ||
    envMap.DB_NAME !== 'sicis_qa' ||
    !/^\d+$/.test(envMap.DB_PORT || '') ||
    envMap.DB_USER !== 'sicisqa' ||
    envMap.DB_PASSWORD === undefined) {
  throw new Error('Se requiere una conexión explícita a PostgreSQL QA local');
}

// Apply to process.env for child processes
for (const [key, value] of Object.entries(envMap)) {
  process.env[key] = value;
}

console.log('Running init-db for QA database...');
execSync('npm run init-db', { stdio: 'inherit' });
console.log('Running migrate for QA database...');
execSync('npm run migrate', { stdio: 'inherit' });
console.log('Seeding database with test data...');
execSync('node seed.js', { stdio: 'inherit' });
