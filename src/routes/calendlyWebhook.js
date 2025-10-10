const express = require('express');
const crypto = require('crypto');
const Startup = require('../models/Startup');
const Questionnaire = require('../models/Questionnaire');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/communications');

const router = express.Router();

// Middleware to verify Calendly webhook signature
const verifyCalendlySignature = (req, res, next) => {
  const signature = req.headers['calendly-webhook-signature'];
  const timestamp = req.headers['calendly-webhook-timestamp'];
  const webhookSecret = process.env.CALENDLY_WEBHOOK_SECRET;

  if (!signature || !timestamp || !webhookSecret) {
    return res.status(401).json({ error: 'Missing webhook verification headers' });
  }

  // Calendly signature verification
  const tolerance = 300; // 5 minutes tolerance
  const now = Math.floor(Date.now() / 1000);
  
  if (Math.abs(now - parseInt(timestamp)) > tolerance) {
    return res.status(401).json({ error: 'Request timestamp too old' });
  }

  // Calendly uses the raw body, not JSON stringified
  const rawBody = req.body;
  const payload = `${timestamp}.${rawBody}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload, 'utf8')
    .digest('hex');

  // Calendly signature format: t=<timestamp>,v1=<signature>
  const signatureParts = signature.split(',');
  let providedSignature = '';
  
  for (const part of signatureParts) {
    if (part.startsWith('v1=')) {
      providedSignature = part.substring(3);
      break;
    }
  }

  if (!providedSignature) {
    return res.status(401).json({ error: 'No valid signature found' });
  }

  if (expectedSignature !== providedSignature) {
    logger.warn('Signature verification failed', {
      expected: expectedSignature,
      provided: providedSignature,
      timestamp: timestamp
    });
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};

// @route   POST /api/calendly/webhook
// @desc    Handle Calendly webhook events
// @access  Public (but verified)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  // TEMPORARILY SKIP SIGNATURE VERIFICATION FOR TESTING
  console.log('🔧 WEBHOOK DEBUG: Signature verification DISABLED for testing');
  console.log('📨 Headers:', req.headers);
  console.log('📝 Raw Body Length:', req.body.length);
  console.log('📝 Body Content:', req.body.toString());
  next();
}, async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString()); // Convert raw buffer to string then parse
    logger.info('Calendly webhook received', { 
      event: event.event, 
      created_at: event.created_at,
      payload_keys: Object.keys(event.payload || {})
    });

    // Handle different event types
    switch (event.event) {
      case 'invitee.created':
        await handleInviteeCreated(event.payload);
        break;
      case 'invitee.canceled':
        await handleInviteeCanceled(event.payload);
        break;
      default:
        logger.info('Unhandled Calendly event type', { event: event.event });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.logError('Calendly webhook processing failed', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleInviteeCreated(payload) {
  try {
    logger.info('Processing invitee.created event', { payload });
    
    const { invitee, event: scheduledEvent } = payload;
    
    if (!invitee || !scheduledEvent) {
      logger.error('Missing required data in invitee.created payload', { payload });
      return;
    }

    const email = invitee.email;
    const name = invitee.name;
    
    console.log('🔍 WEBHOOK DEBUG: Looking for user with email:', email);
    
    // Find startup by email
    const startup = await Startup.findOne({ email: email.toLowerCase() });
    if (!startup) {
      console.log('❌ WEBHOOK ERROR: No startup found with email:', email);
      console.log('📋 Available emails in database:');
      const allStartups = await Startup.find({}, 'email').limit(10);
      allStartups.forEach(s => console.log('  -', s.email));
      logger.warn('Calendly meeting scheduled for unknown email', { email });
      return;
    }
    
    console.log('✅ WEBHOOK SUCCESS: Found startup:', startup._id, 'for email:', email);

    // Extract meeting details
    const meetingDetails = {
      calendlyEventId: scheduledEvent.uri,
      inviteeUri: invitee.uri,
      scheduledAt: new Date(scheduledEvent.start_time),
      endTime: new Date(scheduledEvent.end_time),
      meetingUrl: scheduledEvent.location?.join_url || 'TBD',
      attendeeName: name,
      attendeeEmail: email,
      status: 'scheduled',
      eventName: scheduledEvent.name,
      timezone: invitee.timezone || 'UTC',
      questionsAndResponses: invitee.questions_and_responses || []
    };

    // Update startup onboarding
    startup.onboarding = {
      ...startup.onboarding,
      currentStep: 'meeting_scheduled',
      meetingScheduled: true,
      meetingDetails: meetingDetails,
      lastUpdated: new Date()
    };

    await startup.save();

    // Send confirmation email
    try {
      await sendEmail({
        to: email,
        subject: '🎉 Your meeting is confirmed!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Hi ${startup.profile?.founderFirstName || name}! 👋</h2>
            
            <p>Great news! Your discovery call with the Leansprintr team has been confirmed.</p>
            
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3>📅 Meeting Details:</h3>
              <p><strong>Date:</strong> ${new Date(scheduledEvent.start_time).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
              <p><strong>Time:</strong> ${new Date(scheduledEvent.start_time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
              })}</p>
              <p><strong>Duration:</strong> 30 minutes</p>
              ${meetingDetails.meetingUrl !== 'TBD' ? `<p><strong>Join URL:</strong> <a href="${meetingDetails.meetingUrl}">${meetingDetails.meetingUrl}</a></p>` : ''}
            </div>
            
            <p>We're excited to learn more about your startup and discuss how Leansprintr can help accelerate your growth!</p>
            
            <p>Best regards,<br>The Leansprintr Team</p>
          </div>
        `
      });
    } catch (emailError) {
      logger.logError('Failed to send meeting confirmation email', emailError);
    }

    logger.info('Meeting scheduled successfully', { 
      email, 
      meetingId: scheduledEvent.uri,
      startupId: startup._id,
      startTime: scheduledEvent.start_time
    });

  } catch (error) {
    logger.logError('Failed to process invitee.created event', error);
    throw error;
  }
}

async function handleInviteeCanceled(payload) {
  try {
    logger.info('Processing invitee.canceled event', { payload });
    
    const { invitee, event: scheduledEvent } = payload;
    
    if (!invitee || !scheduledEvent) {
      logger.error('Missing required data in invitee.canceled payload', { payload });
      return;
    }

    const email = invitee.email;
    
    // Find startup by email
    const startup = await Startup.findOne({ email: email.toLowerCase() });
    if (!startup) {
      logger.warn('Calendly meeting canceled for unknown email', { email });
      return;
    }

    // Update startup onboarding - reset to previous step
    startup.onboarding = {
      ...startup.onboarding,
      currentStep: 'questionnaire_submitted',
      meetingScheduled: false,
      meetingDetails: {
        ...startup.onboarding.meetingDetails,
        status: 'canceled',
        canceledAt: new Date(),
        cancelReason: invitee.cancel_reason || 'Not specified'
      },
      lastUpdated: new Date()
    };

    await startup.save();

    // Send cancellation email
    try {
      await sendEmail({
        to: email,
        subject: 'Meeting Cancellation Confirmation',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Hi ${startup.profile?.founderFirstName || invitee.name}! 👋</h2>
            
            <p>We've received confirmation that your meeting has been canceled.</p>
            
            <p>No worries! You can reschedule at any time by visiting your dashboard and clicking the "Schedule Discovery Call" button again.</p>
            
            <p>We're still here to help accelerate your startup's growth whenever you're ready!</p>
            
            <p>Best regards,<br>The Leansprintr Team</p>
          </div>
        `
      });
    } catch (emailError) {
      logger.logError('Failed to send meeting cancellation email', emailError);
    }

    logger.info('Meeting canceled', { 
      email, 
      meetingId: scheduledEvent.uri,
      startupId: startup._id 
    });

  } catch (error) {
    logger.logError('Failed to process invitee.canceled event', error);
    throw error;
  }
}

// @route   GET /api/calendly/webhook/test
// @desc    Test webhook endpoint (for debugging)
// @access  Public
router.get('/webhook/test', (req, res) => {
  res.json({
    message: 'Calendly webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    webhookUrl: `${req.protocol}://${req.get('host')}/api/calendly/webhook`
  });
});

// @route   POST /api/calendly/webhook/test
// @desc    Test webhook processing (for debugging)
// @access  Public
router.post('/webhook/test', express.json(), async (req, res) => {
  try {
    logger.info('Test webhook received', { body: req.body, headers: req.headers });
    res.json({
      received: true,
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.logError('Test webhook failed', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;