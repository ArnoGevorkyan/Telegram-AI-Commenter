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

  // Resolve the target channel entity
  console.log(`Resolving channel: ${targetChannel}`);
  try {
    const channel = await client.getEntity(targetChannel);
    console.log(`Monitoring channel: ${channel.title || targetChannel}`);
    console.log(`Channel ID: ${channel.id}`);
    console.log(`Full channel info:`, JSON.stringify(channel, null, 2));
    
    // Store channel ID as string for consistent comparison
    const channelIdStr = String(channel.id);
    console.log(`Using channel ID (as string): ${channelIdStr}`);

    // Add event handler for new messages
    console.log("Adding event handler for new messages...");
    client.addEventHandler(async (event) => {
      console.log("Event received:", event.className);
      const message = event.message;
      if (!message) {
        console.log("Event has no message property");
        return;
      }
      
      console.log(`Message from:`, message.peerId);
      
      // Check if the message is from the target channel
      if (message.peerId && message.peerId.channelId) {
        // Convert the BigInt to a string for comparison
        const messageChannelIdStr = String(message.peerId.channelId);
        console.log(`Comparing channel IDs (as strings): message channel=${messageChannelIdStr}, target channel=${channelIdStr}`);
      
        if (messageChannelIdStr === channelIdStr) {
          console.log(`MATCH! New post detected at ${new Date().toISOString()}`);
          console.log(`Post content: ${message.text}`);
          
          // Process any media in the message
          const mediaDescriptions = await processMedia(client, message);
          if (mediaDescriptions.length > 0) {
            console.log(`Post contains media: ${mediaDescriptions.join(', ')}`);
          }
          
          // Check rate limiter and wait if necessary
          console.log("Checking rate limits...");
          await rateLimiter.handleComment();
          
          // Generate comment based on both text and media
          const comment = await generateComment(message, mediaDescriptions);
          console.log(`Generated comment: ${comment}`);
          
          try {
            // Reply to the post immediately
            await client.sendMessage(channel, {
              message: comment,
              replyTo: message.id
            });
            console.log('Comment posted successfully');
          } catch (error) {
            console.error('Error posting comment:', error);
            // If we failed to post, don't count it against our rate limit
            rateLimiter.hourHistory.pop();
            rateLimiter.dayHistory.pop();
          }
        } else {
          console.log(`Message from different channel (ID: ${messageChannelIdStr}), ignoring`);
        }
      } else {
        console.log("Message not from a channel, ignoring");
      }
    }, new NewMessage({}));

    console.log('Bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Error setting up channel monitoring:', error);
    console.log('Make sure the TARGET_CHANNEL value in your .env file is correct (without the @ symbol)');
    process.exit(1);
  }
}

main().catch(console.error); 