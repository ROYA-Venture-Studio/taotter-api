const express = require('express');
const router = express.Router();
const axios = require('axios');
const VoiceflowChat = require('../models/VoiceflowChat');
const { authenticate } = require('../middleware/auth');

// Voiceflow API configuration
const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_PROJECT_ID = process.env.VOICEFLOW_PROJECT_ID;
const VOICEFLOW_VERSION_ID = process.env.VOICEFLOW_VERSION_ID || 'production';

// Send message to Voiceflow and save chat history
router.post('/', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.id; // This is the startup ID from auth middleware

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Generate or retrieve session ID for this user
    const sessionId = `startup-${userId}`;

    // Send message to Voiceflow
    const voiceflowResponse = await axios.post(
      `https://general-runtime.voiceflow.com/state/user/${sessionId}/interact`,
      {
        action: {
          type: 'text',
          payload: message
        },
        config: {
          tts: false,
          stripSSML: true
        }
      },
      {
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
          'versionID': VOICEFLOW_VERSION_ID
        }
      }
    );

    // Extract assistant's response
    const assistantMessages = voiceflowResponse.data
      .filter(item => item.type === 'text' && item.payload?.message)
      .map(item => item.payload.message)
      .join('\n\n');

    // Save chat history to database
    let chat = await VoiceflowChat.findOne({ startupId: userId, sessionId });
    
    if (!chat) {
      chat = new VoiceflowChat({
        startupId: userId,
        sessionId,
        messages: []
      });
    }

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Add assistant response
    if (assistantMessages) {
      chat.messages.push({
        role: 'assistant',
        content: assistantMessages,
        timestamp: new Date()
      });
    }

    chat.lastInteractionAt = new Date();
    await chat.save();

    res.json({
      success: true,
      data: {
        message: assistantMessages,
        sessionId
      }
    });

  } catch (error) {
    console.error('Voiceflow chat error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat message',
      error: error.message
    });
  }
});

// Get chat history for current user
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = `startup-${userId}`;

    const chat = await VoiceflowChat.findOne({ 
      startupId: userId, 
      sessionId 
    });

    res.json({
      success: true,
      data: {
        messages: chat ? chat.messages : []
      }
    });

  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat history',
      error: error.message
    });
  }
});

// Clear chat history (optional - for testing)
router.delete('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = `startup-${userId}`;

    await VoiceflowChat.deleteOne({ 
      startupId: userId, 
      sessionId 
    });

    res.json({
      success: true,
      message: 'Chat history cleared'
    });

  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear chat history',
      error: error.message
    });
  }
});

module.exports = router;
