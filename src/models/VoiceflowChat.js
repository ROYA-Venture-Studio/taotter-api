const mongoose = require('mongoose');

const voiceflowChatSchema = new mongoose.Schema({
  startupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Startup',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  lastInteractionAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure unique session per startup
voiceflowChatSchema.index({ startupId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model('VoiceflowChat', voiceflowChatSchema);
