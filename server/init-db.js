import { config } from './config.js';
import { getDb } from './db.js';
import { ensureAdminFromEnv, userCount } from './services/auth.js';

getDb();
ensureAdminFromEnv();
console.log(`Database ready: ${config.databasePath}`);
console.log(`User accounts: ${userCount()}`);
if (userCount() === 0) {
  console.log('No admin account exists yet. Start the app and complete the secure setup screen,');
  console.log('or set ADMIN_USERNAME and ADMIN_PASSWORD in .env and run this command again.');
}
