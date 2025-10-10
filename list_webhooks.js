// list_webhooks.js - List existing Calendly webhooks to see their details
const axios = require('axios');
require('dotenv').config();

const YOUR_PERSONAL_ACCESS_TOKEN = process.env.CALENDLY_WEBHOOK_SECRET;

async function listWebhooks() {
  try {
    // First get user info
    const userResponse = await axios.get('https://api.calendly.com/users/me', {
      headers: {
        'Authorization': `Bearer ${YOUR_PERSONAL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const userUri = userResponse.data.resource.uri;
    console.log('✅ User URI:', userUri);

    // Then list webhooks
    const webhooksResponse = await axios.get('https://api.calendly.com/webhook_subscriptions', {
      headers: {
        'Authorization': `Bearer ${YOUR_PERSONAL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        user: userUri
      }
    });

    console.log('\n📡 Your Webhooks:');
    console.log(JSON.stringify(webhooksResponse.data, null, 2));

    if (webhooksResponse.data.collection && webhooksResponse.data.collection.length > 0) {
      webhooksResponse.data.collection.forEach((webhook, index) => {
        console.log(`\n🔗 Webhook ${index + 1}:`);
        console.log(`   ID: ${webhook.uri}`);
        console.log(`   URL: ${webhook.url}`);
        console.log(`   State: ${webhook.state}`);
        console.log(`   Events: ${webhook.events.join(', ')}`);
        console.log(`   Signing Key: ${webhook.signing_key || 'Not visible in API response'}`);
      });
    } else {
      console.log('❌ No webhooks found');
    }

  } catch (error) {
    console.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

listWebhooks();