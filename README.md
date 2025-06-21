# Telegram Auto Commenter

This script allows you to set up a Telegram user account (not a bot) to automatically comment on new posts in a specific channel using OpenAI's GPT-4o-mini to generate contextually relevant comments.

## Prerequisites

- Node.js 16.x or higher
- A Telegram account
- Telegram API credentials (api_id and api_hash)
- OpenAI API key

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up your environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your credentials:
     ```
     # Get api_id and api_hash from https://my.telegram.org/apps
     TELEGRAM_API_ID=your_api_id
     TELEGRAM_API_HASH=your_api_hash
     # Your phone number in international format
     TELEGRAM_PHONE_NUMBER=+1234567890
     # The channel username to monitor (without @)
     TARGET_CHANNEL=channelname
     
     # Get from https://platform.openai.com/api-keys
     OPENAI_API_KEY=your_openai_api_key
     ```

## Obtaining Telegram API Credentials

1. Visit https://my.telegram.org/apps
2. Log in with your phone number
3. Fill in the form to create a new application
4. You will receive an `api_id` (number) and `api_hash` (string)

## Usage

### Basic Version

Run the basic script:

```
npm start
```

### Advanced Version

Run the advanced script:

```
npm run advanced
```

The advanced version includes:
- Support for media posts (photos, videos, documents, etc.)
- More detailed logging
- Random delays before commenting (to appear more natural)
- Better error handling

### Safe Version (Recommended)

Run the safe version:

```
npm run safe
```

The safe version includes all features from the advanced version plus:
- Rate limiting to avoid detection (8 comments per hour, 50 per day)
- Human-like delays (30 seconds to 4 minutes)
- Improved error handling that doesn't count failed posts against rate limits
- More natural comment variations

### Authentication

On the first run, you'll be prompted to:
1. Enter the confirmation code sent to your Telegram account
2. Enter your password (if you have 2FA enabled)

After successful authentication, the script will:
1. Monitor the specified channel for new posts
2. Generate contextually relevant comments using OpenAI's GPT-4o-mini
3. Post these comments as replies to new posts

## Important Notes

- **This script uses a regular Telegram user account, not a bot.** Make sure you comply with Telegram's Terms of Service.
- The script saves the session after login, so you don't need to authenticate each time.
- To reset the session, delete the `telegram_session.json` file.
- Be mindful of rate limits for both Telegram and OpenAI APIs.
- Exercise caution when using automated commenting, as excessive activity might get your account restricted.
- **We strongly recommend using the "safe" version for long-term use to minimize detection risk.**

## Customization

You can modify the following in the scripts:
- The `generateComment` function to customize how the AI generates comments
- The system prompt in the OpenAI request
- The delay between detecting a post and commenting
- The model used for generating comments (currently gpt-4o-mini)
- In the safe version, adjust rate limits in the variables `MAX_COMMENTS_PER_HOUR` and `MAX_COMMENTS_PER_DAY`

## Advanced Functionality

The advanced script (`advanced.js`) has additional features:

1. **Media Description**: Can identify and describe media in posts, including:
   - Photos
   - Videos
   - Documents
   - Polls
   - Web pages

2. **Natural Delays**: Adds random delays (5-15 seconds) before posting comments to mimic human behavior

3. **Detailed Logging**: More comprehensive logging with timestamps

## Rate Limiter

The safe version uses a rate limiter (`rate-limiter.js`) that can be customized:

```javascript
// Configure the rate limiter
const rateLimiter = new RateLimiter({
  maxPerHour: 8,  // Maximum comments per hour
  maxPerDay: 50,  // Maximum comments per day
  verbose: true   // Enable detailed logging
});
```

The rate limiter tracks comment history and ensures you stay within limits.

## Contact Me

- [Telegram](https://t.me/ArnoGevorkyan)
  
## License

MIT 
