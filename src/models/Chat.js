const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  startupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Startup',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  messages: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    senderType: { type: String, enum: ['admin', 'startup'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    messageType: { type: String, enum: ['text', 'image', 'file', 'voice'], default: 'text' },
    content: { type: String, default: '' },
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    voiceDuration: { type: Number },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
  }]
  // Optionally, store last message preview, unread counts, etc.
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Ensure unique chat per admin/startup pair
chatSchema.index({ adminId: 1, startupId: 1 }, { unique: true });

module.exports = mongoose.model('Chat', chatSchema);
