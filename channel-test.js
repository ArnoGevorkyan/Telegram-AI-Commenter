import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import dotenv from 'dotenv';
import fs from 'fs';
import input from 'input';

// Load environment variables
dotenv.config();

// Telegram credentials
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER;
const targetChannel = process.env.TARGET_CHANNEL;
const password = process.env.TELEGRAM_PASSWORD;

// Session file for persistence
const SESSION_FILE = './telegram_session.json';

/**
 * Main function to test channel connectivity
 */
async function main() {
  console.log('Starting channel test script...');
  console.log(`Target channel: ${targetChannel}`);

  // Load session
  let stringSession;
  if (fs.existsSync(SESSION_FILE)) {
    const sessionData = fs.readFileSync(SESSION_FILE, 'utf8');
    stringSession = new StringSession(sessionData);
    console.log('Loaded existing session');
  } else {
    stringSession = new StringSession('');
    console.log('No session found. Creating new session.');
  }

  // Create client
  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  try {
    // Connect and login
    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => password,
      phoneCode: async () => await input.text('Please enter the code you received (or press Enter if using saved session): '),
      onError: (err) => console.log(err),
    });

    // Save session
    const sessionString = client.session.save();
    fs.writeFileSync(SESSION_FILE, sessionString);
    console.log('Session saved');

    // Get all dialogs (chats) to identify the correct channel
    console.log('Getting list of all channels/chats...');
    const dialogs = await client.getDialogs();
    
    console.log('\n===== AVAILABLE CHANNELS/CHATS =====');
    for (const dialog of dialogs) {
      if (dialog.isChannel) {
        console.log(`Channel: ${dialog.title} (ID: ${dialog.id}, Username: ${dialog.entity.username || 'none'})`);
        if (dialog.entity.username === targetChannel) {
          console.log(`  ↳ This is your target channel!`);
        }
      } else if (dialog.isGroup) {
        console.log(`Group: ${dialog.title} (ID: ${dialog.id})`);
      }
    }
    console.log('=====================================\n');

    // Find dialog for target channel
    const targetDialog = dialogs.find(d => d.entity.username === targetChannel);
    
    // Try to resolve the target channel
    console.log(`Trying to resolve channel: ${targetChannel}`);
    try {
      const channel = await client.getEntity(targetChannel);
      console.log('SUCCESS: Channel found!');
      console.log('Channel details:');
      console.log(`- Title: ${channel.title || 'Unknown'}`);
      console.log(`- ID: ${channel.id}`);
      console.log(`- Username: ${channel.username || 'none'}`);
      console.log(`- Broadcast (one-way channel): ${channel.broadcast ? 'Yes' : 'No'}`);
      console.log(`- Megagroup (supergroup): ${channel.megagroup ? 'Yes' : 'No'}`);
      console.log(`- Creator (you own this): ${channel.creator ? 'Yes' : 'No'}`);
      
      // Check admin status
      console.log('\nChecking your permissions...');
      
      // Get full channel to check admin rights
      let fullChannel;
      try {
        fullChannel = await client.invoke({
          className: 'channels.GetFullChannel',
          channel: channel
        });
        
        const isAdmin = fullChannel.fullChat.adminRights !== null;
        console.log(`- You are an admin: ${isAdmin ? 'Yes' : 'No'}`);
        
        if (isAdmin) {
          console.log(`- Admin rights: ${JSON.stringify(fullChannel.fullChat.adminRights)}`);
        }
      } catch (error) {
        console.log(`- Could not retrieve admin status: ${error.message}`);
      }
      
      // Ask if we should send a test message
      const shouldSendMessage = await input.text('Would you like to send a test message to this channel? (yes/no): ');
      
      if (shouldSendMessage.toLowerCase() === 'yes') {
        const testMessage = 'Test message from Telegram Auto Commenter - please ignore.';
        console.log(`Sending test message: "${testMessage}"`);
        
        try {
          const sentMessage = await client.sendMessage(channel, { message: testMessage });
          console.log('Test message sent successfully!');
          console.log(`Message ID: ${sentMessage.id}`);
          
          // Try to reply to the message
          const replyMessage = 'Test reply - please ignore.';
          console.log(`Sending reply: "${replyMessage}"`);
          
          try {
            const sentReply = await client.sendMessage(channel, {
              message: replyMessage,
              replyTo: sentMessage.id
            });
            
            console.log('Reply sent successfully!');
            console.log('Channel access and posting ability CONFIRMED.');
          } catch (error) {
            console.log(`ERROR sending reply: ${error.message}`);
            console.log('\nProblem: Cannot send replies to posts in this channel.');
            console.log('\nPossible solutions:');
            console.log('1. Make sure you are an admin of the channel');
            console.log('2. Make sure comments are enabled on the channel');
            console.log('3. Try using a different channel where you have admin rights');
            
            // Provide the solution for how to fix it
            console.log('\n===== HOW TO FIX =====');
            console.log('Option 1: Make yourself an admin of the channel:');
            console.log('1. Open Telegram');
            console.log('2. Go to your channel');
            console.log('3. Click on channel name at the top');
            console.log('4. Click "Administrators"');
            console.log('5. Click "Add Admin" and add your user account');
            console.log('6. Make sure "Post Messages" permission is enabled');
            
            console.log('\nOption 2: Create a new channel where you have admin rights:');
            console.log('1. Open Telegram');
            console.log('2. Click the pencil icon (new message)');
            console.log('3. Select "New Channel"');
            console.log('4. Follow the setup process');
            console.log('5. Update your .env file with the new channel username');
          }
        } catch (error) {
          console.log(`ERROR sending message: ${error.message}`);
          console.log('\nProblem: Cannot post messages in this channel.');
          console.log('\nPossible solutions:');
          console.log('1. Make sure you are a member of the channel');
          console.log('2. Make sure you have permission to post in the channel');
          console.log('3. Try using a different channel where you have posting rights');
        }
      }
    } catch (error) {
      console.error('ERROR: Could not resolve the channel:', error.message);
      console.log('\nPossible reasons:');
      console.log('1. The channel name in .env file is incorrect');
      console.log('2. You are not a member of the channel');
      console.log('3. The channel username has changed or the channel is private');
      console.log('\nPlease check the list of available channels above and update your .env file.');
    }
  } catch (error) {
    console.error('Error during script execution:', error);
  } finally {
    await client.disconnect();
    console.log('Disconnected from Telegram');
  }
}

// Show help message
console.log('=======================================================');
console.log('📱 TELEGRAM CHANNEL TEST UTILITY');
console.log('=======================================================');
console.log('This utility will help you check if your bot can access');
console.log('and post to your target Telegram channel.');
console.log('\nIt will:');
console.log('- Show all channels you have access to');
console.log('- Check if your target channel exists');
console.log('- Test if you can post messages to it');
console.log('- Test if you can comment on posts');
console.log('\nIf there are issues, it will suggest solutions.');
console.log('=======================================================');

main().catch(console.error); 