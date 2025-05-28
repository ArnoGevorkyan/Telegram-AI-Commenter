import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import { NewMessage } from 'telegram/events/index.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
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
const targetGroup = process.env.TARGET_GROUP || process.env.TARGET_CHANNEL; // Works with both
const password = process.env.TELEGRAM_PASSWORD;

// Rate limiter settings (can be customized)
const MAX_COMMENTS_PER_HOUR = 50; 
const MAX_COMMENTS_PER_DAY = 50;

// Initialize rate limiter
const rateLimiter = new RateLimiter({
  maxPerHour: MAX_COMMENTS_PER_HOUR,
  maxPerDay: MAX_COMMENTS_PER_DAY,
  verbose: true
});

// Session file for persistence
const SESSION_FILE = './telegram_session.json';
// File to store bot message IDs
const BOT_MESSAGES_FILE = './bot_messages.json';

// Store bot's message IDs to track replies
const botMessages = new Set();

// Function to save bot message IDs
function saveBotMessages() {
  const messageArray = Array.from(botMessages);
  fs.writeFileSync(BOT_MESSAGES_FILE, JSON.stringify(messageArray));
  console.log(`Saved ${messageArray.length} bot message IDs`);
}

// Function to load bot message IDs
function loadBotMessages() {
  if (fs.existsSync(BOT_MESSAGES_FILE)) {
    try {
      const data = fs.readFileSync(BOT_MESSAGES_FILE, 'utf8');
      const messageArray = JSON.parse(data);
      messageArray.forEach(id => botMessages.add(id));
      console.log(`Loaded ${messageArray.length} bot message IDs`);
    } catch (error) {
      console.error('Error loading bot message history:', error);
    }
  } else {
    console.log('Message history file not found, starting with empty history');
  }
}

/**
 * Generate a comment based on post content using OpenAI
 * @param {string} postContent - The content of the post to comment on
 * @param {boolean} isReply - Whether this is a reply to a comment
 * @returns {string} - Generated comment
 */
async function generateComment(postContent, isReply = false) {
  try {
    const content = postContent || "[Post without text]";
    
    // Different prompt based on whether it's an initial comment or a reply
    let userPrompt = isReply 
      ? `Reply to this comment on your message VERY BRIEFLY (1-2 sentences): "${content}"`
      : `Comment on this Telegram channel post in English VERY BRIEFLY (1-3 sentences): "${content}"`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          // EDIT HERE: This is a template system prompt for OpenAI. Replace with your own instructions as needed.
          content: "You are an assistant that generates generic comments for Telegram posts. This is a template. Edit this prompt to customize behavior.",
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
    });

    // Get the comment and remove any quotation marks
    let comment = completion.choices[0].message.content;
    comment = comment.replace(/["«»„"]/g, ''); // Remove different types of quotation marks
    
    return comment;
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
  console.log(`Target chat: ${targetGroup}`);
  console.log(`Limits: ${MAX_COMMENTS_PER_HOUR}/hour, ${MAX_COMMENTS_PER_DAY}/day`);

  // Set up periodic saving of bot messages
  const autoSaveInterval = setInterval(() => {
    console.log("Auto-saving message history...");
    saveBotMessages();
  }, 10 * 60 * 1000); // Every 10 minutes
  
  // Set up proper cleanup on exit
  process.on('SIGINT', () => {
    console.log("Received termination signal, saving data...");
    saveBotMessages();
    clearInterval(autoSaveInterval);
    process.exit(0);
  });

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
    password: async () => password,
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  // Save session string
  const sessionString = client.session.save();
  fs.writeFileSync(SESSION_FILE, sessionString);
  console.log('Session saved');
  
  // Load history of bot messages
  loadBotMessages();

  try {
    // Get dialogs to find the target chat entity
    console.log("Getting available chats...");
    const dialogs = await client.getDialogs();
    
    // Try to find the target chat
    let targetChat = null;
    
    // First try to look by username
    try {
      targetChat = await client.getEntity(targetGroup);
      console.log(`Found chat by name: ${targetChat.title || targetGroup}`);
    } catch (error) {
      console.log(`Could not find by name, searching in dialogs...`);
      
      // If not found by username, search through dialogs
      for (const dialog of dialogs) {
        if ((dialog.isChannel || dialog.isGroup) && 
            (dialog.entity.username === targetGroup || 
             dialog.title.toLowerCase().includes(targetGroup.toLowerCase()))) {
          targetChat = dialog.entity;
          console.log(`Found matching chat: ${targetChat.title}`);
          break;
        }
      }
    }
    
    if (!targetChat) {
      console.error(`ERROR: Could not find target chat "${targetGroup}"`);
      console.log("Available chats:");
      for (const dialog of dialogs) {
        if (dialog.isChannel || dialog.isGroup) {
          console.log(`- ${dialog.title} (${dialog.entity.username || 'no username'})`);
        }
      }
      process.exit(1);
    }
    
    console.log(`Monitoring chat: ${targetChat.title}`);
    console.log(`Chat ID: ${targetChat.id}`);
    console.log(`Chat type: ${targetChat.className}`);
    
    // Store chat ID as string for consistent comparison
    const chatIdStr = String(targetChat.id);
    console.log(`Using chat ID: ${chatIdStr}`);

    // Add event handler for new messages
    console.log("Adding event handler for new messages...");
    client.addEventHandler(async (event) => {
      console.log("Event received:", event.className);
      const message = event.message;
      if (!message) {
        console.log("Event has no message");
        return;
      }
      
      let peerId = null;
      let peerIdStr = null;
      
      // Handle different peer types (channel, chat, user)
      if (message.peerId) {
        if (message.peerId.channelId) {
          peerId = message.peerId.channelId;
          peerIdStr = String(peerId);
          console.log(`Message from channel: ${peerIdStr}`);
        } else if (message.peerId.chatId) {
          peerId = message.peerId.chatId;
          peerIdStr = String(peerId);
          console.log(`Message from group: ${peerIdStr}`);
        } else if (message.peerId.userId) {
          // Handle private messages (DMs)
          peerId = message.peerId.userId;
          peerIdStr = String(peerId);
          console.log(`Private message from user: ${peerIdStr}`);
          
          // Check rate limiter for DMs too
          console.log("Checking rate limits for private message...");
          await rateLimiter.handleComment();
          
          // Generate response to the DM
          const dmResponse = await generateComment(`Private message: ${message.text || "[Empty message]"}`, false);
          console.log(`Generated response to private message: ${dmResponse}`);
          
          try {
            // First, get the full user entity
            console.log(`Getting user information with ID: ${peerId}`);
            const userEntity = await client.getEntity(message.senderId);
            console.log(`Got user information: ${userEntity.firstName} ${userEntity.lastName || ''}`);
            
            // Send response to the user using the full entity
            const sentMessage = await client.sendMessage(userEntity, {
              message: dmResponse
            });
            console.log('Response to private message sent successfully');
          } catch (error) {
            console.error('Error sending response to private message:', error);
            rateLimiter.hourHistory.pop();
            rateLimiter.dayHistory.pop();
          }
          
          return;
        } else {
          console.log("Unknown message type, ignoring");
          return;
        }
      } else {
        console.log("Message has no peerId, ignoring");
        return;
      }
      
      // Compare with target chat ID
      console.log(`Comparing IDs: message=${peerIdStr}, target=${chatIdStr}`);
      
      if (peerIdStr === chatIdStr) {
        console.log(`MATCH! New post detected at ${new Date().toISOString()}`);
        console.log(`Message content: ${message.text || '[no text]'}`);
        
        // Check if this is a reply to another message
        if (message.replyTo) {
          console.log("This is a reply to another message");
          
          try {
            // Get the ID of the message being replied to
            const repliedToId = message.replyTo.replyToMsgId;
            console.log(`ID of message being replied to: ${repliedToId}`);
            
            // Check if it's a reply to one of our bot's messages
            if (botMessages.has(repliedToId)) {
              console.log("This is a reply to bot's message! Generating response...");
              
              // Check rate limiter and wait if necessary
              console.log("Checking rate limits...");
              await rateLimiter.handleComment();
              
              // Generate reply based on both the original message and the reply
              const replyComment = await generateComment(`Reply to comment: ${message.text}`, true);
              console.log(`Generated reply: ${replyComment}`);
              
              // Reply to the comment
              const sentReply = await client.sendMessage(targetChat, {
                message: replyComment,
                replyTo: message.id
              });
              
              // Store the ID of our new reply
              botMessages.add(sentReply.id);
              console.log('Reply to comment posted successfully');
              // Save updated message history
              saveBotMessages();
            } else {
              console.log("This is a reply to someone else's message, ignoring");
            }
          } catch (error) {
            console.error('Error processing reply:', error);
          }
          
          return;
        }
        
        // Check rate limiter and wait if necessary
        console.log("Checking rate limits...");
        await rateLimiter.handleComment();
        
        // Generate comment based on message text
        const comment = await generateComment(message.text);
        console.log(`Generated comment: ${comment}`);
        
        try {
          // Reply to the post
          const sentMessage = await client.sendMessage(targetChat, {
            message: comment,
            replyTo: message.id
          });
          
          // Store the ID of our message to track future replies
          botMessages.add(sentMessage.id);
          console.log(`Comment posted successfully (ID: ${sentMessage.id})`);
          // Save updated message history
          saveBotMessages();
        } catch (error) {
          console.error('Error posting comment:', error);
          // If we failed to post, don't count it against our rate limit
          rateLimiter.hourHistory.pop();
          rateLimiter.dayHistory.pop();
        }
      } else {
        console.log(`Message from different chat, ignoring`);
      }
    }, new NewMessage({}));

    console.log('Bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main().catch(console.error);
