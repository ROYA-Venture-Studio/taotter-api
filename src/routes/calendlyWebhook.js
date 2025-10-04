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

  const payload = `${timestamp}.${JSON.stringify(req.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload, 'utf8')
    .digest('base64');

  const providedSignature = signature.replace('t=', '').replace(/,.*/, '');

  if (expectedSignature !== providedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};

// @route   POST /api/calendly/webhook
// @desc    Handle Calendly webhook events
// @access  Public (but verified)
router.post('/webhook', express.raw({ type: 'application/json' }), verifyCalendlySignature, async (req, res) => {
  try {
    const event = JSON.parse(req.body);
    logger.info('Calendly webhook received', { event: event.event, payload: event.payload });

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
    const { email, name, scheduled_event, questions_and_responses } = payload;
    
    // Find startup by email
    const startup = await Startup.findOne({ email: email.toLowerCase() });
    if (!startup) {
      logger.warn('Calendly meeting scheduled for unknown email', { email });
      return;
    }

    // Extract meeting details
    const meetingDetails = {
      calendlyEventId: scheduled_event.uri,
      scheduledAt: new Date(scheduled_event.start_time),
      meetingUrl: scheduled_event.location?.join_url || 'TBD',
      attendeeName: name,
      attendeeEmail: email,
      status: 'scheduled',
      eventName: scheduled_event.name
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
        template: 'meetingScheduled',
        data: {
          name: startup.profile?.founderFirstName || name,
          meetingDate: new Date(scheduled_event.start_time).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          meetingTime: new Date(scheduled_event.start_time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          }),
          meetingUrl: meetingDetails.meetingUrl
        }
      });
    } catch (emailError) {
      logger.logError('Failed to send meeting confirmation email', emailError);
    }

    logger.info('Meeting scheduled successfully', { 
      email, 
      meetingId: scheduled_event.uri,
      startupId: startup._id 
    });

  } catch (error) {
    logger.logError('Failed to process invitee.created event', error);
    throw error;
  }
}

async function handleInviteeCanceled(payload) {
  try {
    const { email, scheduled_event } = payload;
    
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
        canceledAt: new Date()
      },
      lastUpdated: new Date()
    };

    await startup.save();

    logger.info('Meeting canceled', { 
      email, 
      meetingId: scheduled_event.uri,
      startupId: startup._id 
    });

  } catch (error) {
    logger.logError('Failed to process invitee.canceled event', error);
    throw error;
  }
}

module.exports = router;