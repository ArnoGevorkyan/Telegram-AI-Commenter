# Telegram Auto-Commenter Bot

This bot uses OpenAI's GPT models to automatically post context-aware comments on new posts in specified Telegram channels or groups.

## Features

- **Multi-Channel & Group Monitoring**: Can monitor multiple channels simultaneously or a specific group.
- **AI-Powered Comments**: Generates relevant comments using `gpt-4o-mini`.
- **Media Analysis**: Can interpret photos, polls, and other media to generate better comments.
- **Multiple Modes**: Includes different scripts for various use cases (basic, safe, group-focused).
- **Session Persistence**: Saves your Telegram session to avoid logging in on every run.
- **Rate Limiting**: A 'safe' mode is included to help prevent account restrictions by limiting the comment frequency.

## Getting Started

Follow these steps to get the bot up and running.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- A Telegram account with API credentials.
- An OpenAI API key.

### 2. Installation

First, clone the repository to your local machine:
```sh
git clone https://github.com/ArnoGevorkyan/apho-commenter.git
cd apho-commenter
```

Then, install the necessary dependencies:
```sh
npm install
```

### 3. Configuration
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

## Updating the Bot

To get the latest features and bug fixes, you can update the bot by running this command from the project directory:

```sh
git pull
```

This will download the latest changes from GitHub.

## Contact Me

- [Telegram](https://t.me/ArnoGevorkyan)
  
## License

MIT 
