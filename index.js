import { TelegramClient, Api } from 'telegram';
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

  // Get the list of channels from the environment variable
  const targetChannels = (process.env.TARGET_CHANNEL || '').split(',').map(ch => ch.trim()).filter(ch => ch);

  if (targetChannels.length === 0) {
    console.error('TARGET_CHANNEL environment variable is empty or not set. Please add channel usernames, separated by commas.');
    process.exit(1);
  }

  console.log(`Found ${targetChannels.length} channel(s) to monitor in .env file.`);

  // Use a Map to store { channelId: discussionGroupId }
  const monitoredChannels = new Map();
  for (const channelUsername of targetChannels) {
    try {
      console.log(`Resolving channel: ${channelUsername}`);
      const entity = await client.getEntity(channelUsername);
      
      // Use GetFullChannel to reliably get linked chat information
      const fullChannel = await client.invoke(
        new Api.channels.GetFullChannel({ channel: entity })
      );

      const channelId = String(entity.id);
      // The discussion group ID is in fullChat.linkedChatId
      const discussionGroupId = fullChannel.fullChat.linkedChatId;

      if (discussionGroupId) {
        monitoredChannels.set(channelId, discussionGroupId);
        console.log(`Successfully resolved channel '${entity.title}'. Will post comments to linked group ${discussionGroupId}.`);
      } else if (entity.megagroup) {
        // Fallback for older supergroups or edge cases
        monitoredChannels.set(channelId, channelId);
        console.log(`Successfully resolved group '${entity.title}'. Will post comments directly.`);
      } else {
        console.warn(`Channel '${entity.title}' does not appear to have a comment section. Skipping.`);
      }
    } catch (error) {
      console.error(`Could not resolve channel "${channelUsername}". Error: ${error.message}. Skipping.`);
    }
  }

  if (monitoredChannels.size === 0) {
    console.error("Fatal: Could not resolve any channels with linked discussion groups. Please check the usernames in your .env file. Exiting.");
    process.exit(1);
  }

  console.log(`Monitoring ${monitoredChannels.size} channels with discussion groups in total.`);
  
  // Add event handler for new messages
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || !message.peerId || !message.peerId.channelId) {
      return; // Not a channel message
    }
    
    const messageChannelIdStr = String(message.peerId.channelId);
    
    // Check if the message is from one of the monitored channels
    if (monitoredChannels.has(messageChannelIdStr)) {
      const discussionGroupId = monitoredChannels.get(messageChannelIdStr);

      console.log(`New post detected in monitored channel ${message.peerId.channelId}: ${message.text ? message.text.substring(0, 50) : '[no text]'}...`);
      
      // Generate comment
      const comment = await generateComment(message.text || "");
      console.log(`Generated comment: ${comment}`);
      
      try {
        // Reply to the post in the linked discussion group
        await client.sendMessage(discussionGroupId, {
          message: comment,
          replyTo: message.id
        });
        console.log(`Comment posted successfully to discussion group ${discussionGroupId}.`);
      } catch (error) {
        console.error('Error posting comment:', error);
      }
    }
  }, new NewMessage({}));

  console.log('Bot is running. Press Ctrl+C to stop.');
}

main().catch(console.error); 