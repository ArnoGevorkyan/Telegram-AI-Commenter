import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import { NewMessage } from 'telegram/events/index.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import RateLimiter from './rate-limiter.js';

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
// Add password - consider adding this to your .env file instead
if (!process.env.TELEGRAM_PASSWORD) {
  throw new Error('TELEGRAM_PASSWORD is not set in the environment. Please add it to your .env file.');
}
const password = process.env.TELEGRAM_PASSWORD;

// Rate limiter settings (can be customized)
const MAX_COMMENTS_PER_HOUR = 8;  // Conservative limit to avoid detection
const MAX_COMMENTS_PER_DAY = 50;  // Conservative limit to avoid detection

// Initialize rate limiter
const rateLimiter = new RateLimiter({
  maxPerHour: MAX_COMMENTS_PER_HOUR,
  maxPerDay: MAX_COMMENTS_PER_DAY,
  verbose: true
});

// Session file for persistence
const SESSION_FILE = './telegram_session.json';
const TEMP_DIR = './temp';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

/**
 * Generate a comment based on post content using OpenAI
 * @param {Object} message - The Telegram message object
 * @param {Array} mediaDescriptions - Descriptions of any media in the message
 * @returns {string} - Generated comment
 */
async function generateComment(message, mediaDescriptions = []) {
  try {
    // Start with the text content
    let content = message.text || "";
    
    // Add media descriptions if available
    if (mediaDescriptions.length > 0) {
      content += "\n\nMedia in post: " + mediaDescriptions.join(", ");
    }
    
    // If there's no content to comment on, use a generic message
    if (!content || content.trim() === "") {
      content = "[Post contains media without text]";
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an assistant that generates contextually relevant and friendly comments for Telegram posts. Keep comments fairly brief (1-3 sentences) and conversational. Vary your style and vocabulary to appear natural and human-like."
        },
        {
          role: "user",
          content: `Generate a thoughtful comment for this Telegram post: "${content}"`
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
 * Process media in a message and generate descriptions
 * @param {Object} client - Telegram client
 * @param {Object} message - Telegram message
 * @returns {Array} - Array of media descriptions
 */
async function processMedia(client, message) {
  const mediaDescriptions = [];

  // Check if the message has media
  if (message.media) {
    const mediaType = message.media.className;
    
    switch (mediaType) {
      case 'MessageMediaPhoto':
        mediaDescriptions.push("Photo");
        break;
        
      case 'MessageMediaDocument':
        const doc = message.media.document;
        const attributes = doc.attributes;
        
        // Check for file name
        const fileNameAttr = attributes.find(attr => attr.className === 'DocumentAttributeFilename');
        const fileName = fileNameAttr ? fileNameAttr.fileName : 'document';
        
        // Check for video
        const videoAttr = attributes.find(attr => attr.className === 'DocumentAttributeVideo');
        if (videoAttr) {
          mediaDescriptions.push(`Video: ${fileName}`);
        } else {
          mediaDescriptions.push(`Document: ${fileName}`);
        }
        break;
        
      case 'MessageMediaPoll':
        const pollQuestion = message.media.poll.question;
        mediaDescriptions.push(`Poll: "${pollQuestion}"`);
        break;
        
      case 'MessageMediaWebPage':
        const webPage = message.media.webpage;
        if (webPage.title) {
          mediaDescriptions.push(`Webpage: "${webPage.title}"`);
        } else if (webPage.url) {
          mediaDescriptions.push(`Webpage: ${webPage.url}`);
        } else {
          mediaDescriptions.push("Webpage");
        }
        break;
        
      default:
        mediaDescriptions.push(`Media of type: ${mediaType}`);
    }
  }
  
  return mediaDescriptions;
}

/**
 * Main function to run the Telegram client
 */
async function main() {
  console.log('Starting Safe Telegram Auto Commenter...');
  console.log(`Rate limits: ${MAX_COMMENTS_PER_HOUR} comments per hour, ${MAX_COMMENTS_PER_DAY} comments per day`);

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
  console.log("Adding event handler for new messages...");

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
      
      console.log(`MATCH! New post in monitored channel ${message.peerId.channelId} at ${new Date().toISOString()}`);
      console.log(`Post content: ${message.text ? `"${message.text.substring(0, 70)}..."` : "[No Text]"}`);
      
      const mediaDescriptions = await processMedia(client, message);
      if (mediaDescriptions.length > 0) {
        console.log(`Post contains media: ${mediaDescriptions.join(', ')}`);
      }
      
      console.log("Checking rate limits...");
      await rateLimiter.handleComment();
      
      const comment = await generateComment(message, mediaDescriptions);
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
        rateLimiter.hourHistory.pop();
        rateLimiter.dayHistory.pop();
      }
    }
  }, new NewMessage({}));

  console.log('Bot is running. Press Ctrl+C to stop.');
}

main().catch(console.error); 