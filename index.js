import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import { NewMessage } from 'telegram/events/index.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Telegram credentials
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER;
const targetChannel = process.env.TARGET_CHANNEL;
// Add password - retrieve from env
const password = process.env.TELEGRAM_PASSWORD;

// Session file for persistence
const SESSION_FILE = './telegram_session.json';

/**
 * Generate a comment based on post content using OpenAI
 * @param {string} postContent - The content of the post to comment on
 * @returns {string} - Generated comment
 */
async function generateComment(postContent) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an assistant that generates contextually relevant and friendly comments for Telegram posts. Keep comments fairly brief (1-3 sentences) and conversational."
        },
        {
          role: "user",
          content: `Generate a thoughtful comment for this Telegram post: "${postContent}"`
        }
      ],
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating comment with OpenAI:', error);
    return "That's interesting! Thanks for sharing."; // Fallback comment
  }
}

/**
 * Main function to run the Telegram client
 */
async function main() {
  console.log('Starting Telegram auto-commenter...');

  // Load or create session
  let stringSession;
  if (fs.existsSync(SESSION_FILE)) {
    const sessionData = fs.readFileSync(SESSION_FILE, 'utf8');
    stringSession = new StringSession(sessionData);
    console.log('Loaded existing session');
  } else {
    stringSession = new StringSession('');
    console.log('Created new session');
  }

  // Create client
  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  // Connect and login
  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => password, // Use saved password
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  // Save session string
  const sessionString = client.session.save();
  fs.writeFileSync(SESSION_FILE, sessionString);
  console.log('Session saved');

  // Resolve the target channel entity
  console.log(`Resolving channel: ${targetChannel}`);
  const channel = await client.getEntity(targetChannel);
  console.log(`Monitoring channel: ${channel.title || targetChannel}`);
  
  // Store channel ID as string for consistent comparison
  const channelIdStr = String(channel.id);
  console.log(`Using channel ID (as string): ${channelIdStr}`);

  // Add event handler for new messages
  client.addEventHandler(async (event) => {
    const message = event.message;
    
    // Check if the message is from the target channel
    if (message.peerId && message.peerId.channelId) {
      // Convert BigInt to string for comparison
      const messageChannelIdStr = String(message.peerId.channelId);
      
      if (messageChannelIdStr === channelIdStr) {
        console.log(`New post detected: ${message.text ? message.text.substring(0, 50) : '[no text]'}...`);
        
        // Generate comment
        const comment = await generateComment(message.text || "");
        console.log(`Generated comment: ${comment}`);
        
        try {
          // Reply to the post
          await client.sendMessage(channel, {
            message: comment,
            replyTo: message.id
          });
          console.log('Comment posted successfully');
        } catch (error) {
          console.error('Error posting comment:', error);
        }
      }
    }
  }, new NewMessage({}));

  console.log('Bot is running. Press Ctrl+C to stop.');
}

main().catch(console.error); 