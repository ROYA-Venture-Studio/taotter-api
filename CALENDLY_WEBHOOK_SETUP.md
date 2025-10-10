# 🔗 Calendly Webhook Setup Scripts

This directory contains scripts to set up Calend## 🐛 Troubleshooting

### "organization parameter is missing"

- **Cause**: Calendly requires organization URI for user-scoped webhooks
- **Solution**: Script now fetches organization automatically
- **Manual fix**: Ensure your Calendly account belongs to an organization

### "Error fetching Calendly user"

- Check your `CALENDLY_WEBHOOK_SECRET` in `.env`
- Verify the token is a valid Personal Access Token from Calendly
- Ensure you have internet connection

### "Error creating webhook"

- Verify your Calendly account has an organization set up
- Check that the webhook URL is publicly accessible
- Make sure you haven't already created a webhook for this URL
- Try deleting existing webhooks in Calendly if needed

### "Webhook URL not accessible"

- Ensure your server is running and accessible from the internet
- For local development, use ngrok or similar tunneling servicerammatically using the Personal Access Token.

## 📋 Prerequisites

1. **Install axios** (if not already installed):

   ```bash
   npm install axios
   ```

2. **Environment Variables**: Ensure `CALENDLY_WEBHOOK_SECRET` is set in your `.env` file

## 🚀 Setup Process

### Step 1: Get Your User URI

Run the first script to get your Calendly user information:

```bash
node get_user.js
```

**Expected Output:**

```
✅ Calendly User Data:
{
  "resource": {
    "uri": "https://api.calendly.com/users/ABC123...",
    "name": "Your Name",
    ...
  }
}

🔗 COPY THIS USER URI for webhook creation:
https://api.calendly.com/users/ABC123...
```

**Copy the URI** that starts with `https://api.calendly.com/users/...`

### Step 2: Create Webhook Subscription

Run the second script (no parameters needed - it fetches everything automatically):

```bash
npm run calendly:create-webhook
```

**Or manually:**

```bash
node create_webhook.js
```

**Expected Output:**

```
🔍 No user URI provided, fetching automatically...
🚀 Creating Calendly webhook subscription...
📡 Webhook URL: https://stg-api.leansprintr.com/api/calendly/webhook
👤 User URI: https://api.calendly.com/users/CEHGLUPHJ62SKPCT
🏢 Organization URI: https://api.calendly.com/organizations/ABC123...
📋 Events: invitee.created, invitee.canceled

✅ Webhook created successfully!
🔗 Webhook ID: https://api.calendly.com/webhook_subscriptions/DEF456...
📡 URL: https://stg-api.leansprintr.com/api/calendly/webhook
📋 Events: invitee.created, invitee.canceled
🔄 State: active

🎉 Your Calendly webhook is now active!
```

## 🌍 Environment-Specific URLs

The script automatically detects the environment:

- **Development/Staging**: `https://stg-api.leansprintr.com/api/calendly/webhook`
- **Production**: `https://leansprintr.com/api/calendly/webhook`

## 🔧 Manual Configuration

If you need to override the webhook URL, you can set the `CALENDLY_USER_URI` environment variable:

```bash
export CALENDLY_USER_URI="https://api.calendly.com/users/YOUR_USER_ID"
node create_webhook.js
```

## 🐛 Troubleshooting

### "Error fetching Calendly user"

- Check your `CALENDLY_WEBHOOK_SECRET` in `.env`
- Verify the token is a valid Personal Access Token from Calendly
- Ensure you have internet connection

### "Error creating webhook"

- Verify the user URI is correct (from Step 1)
- Check that the webhook URL is publicly accessible
- Make sure you haven't already created a webhook for this URL
- Try deleting existing webhooks in Calendly if needed

### "Webhook URL not accessible"

- Ensure your server is running and accessible from the internet
- For local development, use ngrok or similar tunneling service

## 📊 Webhook Events

The webhook subscribes to these events:

- `invitee.created` - When someone books a meeting
- `invitee.canceled` - When someone cancels a meeting

## 🔄 Testing

After setup, you can test the webhook:

1. **Test endpoint**: `GET /api/calendly/webhook/test`
2. **Payload test**: `POST /api/calendly/webhook/test` with sample data
3. **Real test**: Book a meeting through Calendly and check server logs

## 📝 Notes

- These scripts are **not committed** to git (added to `.gitignore`)
- Run these scripts **once per environment** (staging/production)
- Webhooks are persistent until manually deleted in Calendly
- Each webhook URL can only have one subscription per user

## 🎯 Next Steps

1. Run `node get_user.js`
2. Copy the user URI
3. Run `node create_webhook.js "YOUR_USER_URI"`
4. Test with a real Calendly booking
5. Monitor server logs for webhook events
