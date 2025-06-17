const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Admin = require('../models/Admin');
const Startup = require('../models/Startup');
const { authenticateAdmin, authenticateStartup } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Middleware to authenticate both admin and startup users
const authenticateAnyUser = (req, res, next) => {
  // Try admin authentication first
  authenticateAdmin(req, res, (adminErr) => {
    if (!adminErr && req.user) {
      return next();
    }
    
    // If admin auth fails, try startup authentication
    authenticateStartup(req, res, (startupErr) => {
      if (!startupErr && req.user) {
        return next();
      }
      
      // Both failed
      return next(new AppError('Unauthorized', 401));
    });
  });
};

const router = express.Router();

/**
 * @route   POST /api/chat/start
 * @desc    Start a chat between admin and startup (admin only)
 * @access  Private (Admin)
 * @body    { startupId }
 */
router.post('/start', authenticateAdmin, async (req, res, next) => {
  try {
    const { startupId } = req.body;
    if (!startupId) {
      return next(new AppError('startupId is required', 400));
    }
    // Find or create chat
    let chat = await Chat.findOne({ adminId: req.user._id, startupId });
    if (!chat) {
      chat = new Chat({ adminId: req.user._id, startupId });
      await chat.save();
    }
    res.json({ success: true, data: { chat } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/chat/list
 * @desc    Get all chats for current user (admin or startup)
 * @access  Private
 */
router.get('/list', authenticateAnyUser, async (req, res, next) => {
  try {
    let chats = [];
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      chats = await Chat.find({ adminId: req.user._id })
        .populate('startupId', 'profile.companyName profile.founderFirstName profile.founderLastName email');
    } else if (req.user && req.user.profile) {
      // Startup user (has profile but no role or different role)
      chats = await Chat.find({ startupId: req.user._id })
        .populate('adminId', 'profile.firstName profile.lastName email');
    } else {
      return next(new AppError('Unauthorized', 401));
    }
    res.json({ success: true, data: { chats } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/chat/:chatId/messages
 * @desc    Get messages for a chat
 * @access  Private (admin or startup)
 */
router.get('/:chatId/messages', authenticateAnyUser, async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });
    res.json({ success: true, data: { messages } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/chat/:chatId/message
 * @desc    Send a message in a chat (admin or startup)
 * @access  Private
 * @body    { content, file }
 */
router.post('/:chatId/message', authenticateAnyUser, upload.single('file'), async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;
    let senderType, senderId;
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      senderType = 'admin';
      senderId = req.user._id;
    } else if (req.user && req.user.profile) {
      // Startup user
      senderType = 'startup';
      senderId = req.user._id;
    } else {
      return next(new AppError('Unauthorized', 401));
    }

    // Dummy file/image URL for now
    let fileUrl = null, fileType = null, imageUrl = null;
    if (req.file) {
      if (req.file.mimetype.startsWith('image/')) {
        imageUrl = `https://dummy-s3-bucket.s3.amazonaws.com/${req.file.filename}`;
      } else {
        fileUrl = `https://dummy-s3-bucket.s3.amazonaws.com/${req.file.filename}`;
        fileType = req.file.mimetype;
      }
    }

    const message = new Message({
      chatId,
      senderType,
      senderId,
      content,
      fileUrl,
      fileType,
      imageUrl,
      createdAt: new Date()
    });
    await message.save();

    // Update chat lastMessageAt
    await Chat.findByIdAndUpdate(chatId, { lastMessageAt: new Date() });

    // Emit socket event for real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${chatId}`).emit('new_message', {
          _id: message._id,
          conversationId: chatId,
          senderId,
          senderType,
          content,
          fileUrl,
          fileType,
          imageUrl,
          messageType: fileUrl || imageUrl ? 'file' : 'text',
          createdAt: message.createdAt
        });
      }
    } catch (e) {
      // Ignore socket errors
    }

    res.json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
