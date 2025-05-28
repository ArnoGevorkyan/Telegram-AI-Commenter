import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Telegram credentials
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER;
const password = process.env.TELEGRAM_PASSWORD;

// For testing only - in production, you'd get this from user input
// This is just a placeholder - you'll need to replace with the actual code
const verificationCode = "YOUR_VERIFICATION_CODE_HERE"; 

// Session file for persistence
const SESSION_FILE = './telegram_session.json';

/**
 * Main function to run the Telegram client
 */
async function main() {
  console.log('Starting auto verification script...');

  // Create a new session
  const stringSession = new StringSession('');
  console.log('Created new session');

  // Create client
  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  try {
    // Connect and login with automated code
    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => password,
      phoneCode: async () => verificationCode, // Use hardcoded verification code (for testing only)
      onError: (err) => console.log(err),
    });

    // Save session string
    const sessionString = client.session.save();
    fs.writeFileSync(SESSION_FILE, sessionString);
    console.log('Session saved successfully!');
    console.log('You can now run the regular scripts which will use this saved session.');
  } catch (error) {
    console.error('Error during authentication:', error);
    console.log('Note: This script needs the actual verification code from Telegram.');
    console.log('Replace the placeholder code in the script with the code you receive.');
  } finally {
    await client.disconnect();
  }
}

// Warning message
console.log('WARNING: This script includes a placeholder verification code.');
console.log('Before running it, you must edit the script to include the actual code from Telegram.');
console.log('Press Ctrl+C to cancel or wait 5 seconds to continue...');

// Wait 5 seconds before starting
setTimeout(() => {
  main().catch(console.error);
}, 5000); 