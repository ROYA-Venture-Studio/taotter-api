const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Admin = require('../models/Admin');
const Startup = require('../models/Startup');
const { authenticateAdmin, authenticateStartup } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { sendEmail } = require('../utils/communications');
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
 * @route   POST /api/chat/create
 * @desc    Create a chat with admin (startup only)
 * @access  Private (Startup)
 * @body    { adminEmail, message }
 */
router.post('/create', authenticateStartup, async (req, res, next) => {
  try {
    const { adminEmail = 'admin@leansprintr.com', message } = req.body;
    
    // Find the admin by email
    const admin = await Admin.findOne({ email: adminEmail });
    if (!admin) {
      return next(new AppError('Admin not found', 404));
    }

    // Check if chat already exists
    let chat = await Chat.findOne({ 
      adminId: admin._id, 
      startupId: req.user._id 
    });

    if (!chat) {
      // Create new chat
      chat = new Chat({ 
        adminId: admin._id, 
        startupId: req.user._id 
      });
      await chat.save();
    }

    // If message provided, send initial message
    if (message && message.trim()) {
      const newMessage = new Message({
        chatId: chat._id,
        senderId: req.user._id,
        senderType: 'startup',
        content: message.trim(),
        messageType: 'text'
      });
      await newMessage.save();

      // Update chat's last message timestamp
      chat.lastMessageAt = new Date();
      await chat.save();
    }

    res.json({
      success: true,
      data: { chat }
    });
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
 * @desc    Get messages for a chat (from Chat.messages array)
 * @access  Private (admin or startup)
 * @query   ?page=1&pageSize=50
 */
router.get('/:chatId/messages', authenticateAnyUser, async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    
    const chat = await Chat.findById(chatId);
    if (!chat) return next(new AppError('Chat not found', 404));
    
    const totalMessages = chat.messages.length;
    const start = Math.max(totalMessages - page * pageSize, 0);
    const end = totalMessages - (page - 1) * pageSize;
    const messages = chat.messages.slice(start, end);
    
    console.log(`Retrieved ${messages.length} messages for chat ${chatId} from Chat.messages array`);
    
    res.json({
      success: true,
      data: {
        messages,
        totalMessages,
        page,
        pageSize
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/chat/:chatId/message
 * @desc    Send a message in a chat (admin or startup)
 * @access  Private
 * @body    { content, file, voice }
 */
router.post('/:chatId/message', authenticateAnyUser, upload.single('file'), async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { content, voiceDuration } = req.body;
    let senderType, senderId;
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      senderType = 'admin';
      senderId = req.user._id;
    } else if (req.user && req.user.profile) {
      senderType = 'startup';
      senderId = req.user._id;
    } else {
      return next(new AppError('Unauthorized', 401));
    }

    // File/image/voice upload handling
    let fileUrl = null, fileType = null, imageUrl = null, fileName = null, fileSize = null, mimeType = null, messageType = "text";
    if (req.file) {
      fileName = req.file.originalname;
      fileSize = req.file.size;
      mimeType = req.file.mimetype;
      if (fileSize > 5 * 1024 * 1024) {
        return next(new AppError('File size exceeds 5MB limit', 400));
      }
      // Upload to Azure
      const { uploadFile } = require('../utils/azureStorage');
      const userId = senderId;
      const sprintId = "chat"; // Use "chat" as sprintId for chat uploads
      const documentType = mimeType.startsWith('image/') ? "images" : (mimeType.startsWith('audio/') ? "audio" : "files");
      // Read file buffer from disk
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(req.file.path);
      const azureResult = await uploadFile(
        { buffer: fileBuffer, originalname: fileName, mimetype: mimeType },
        userId,
        sprintId,
        documentType
      );
      if (!azureResult.success) {
        return next(new AppError('Azure upload failed: ' + azureResult.error, 500));
      }
      // Remove local file after upload
      fs.unlinkSync(req.file.path);
      if (mimeType.startsWith('image/')) {
        imageUrl = azureResult.fileUrl;
        fileUrl = azureResult.fileUrl;
        messageType = "image";
      } else if (mimeType.startsWith('audio/')) {
        fileUrl = azureResult.fileUrl;
        messageType = "voice";
      } else {
        fileUrl = azureResult.fileUrl;
        messageType = "file";
      }
    }

    // Build message object for Chat.messages array
    const messageObj = {
      senderType,
      senderId,
      messageType,
      content,
      fileUrl,
      fileName,
      fileSize,
      mimeType,
      imageUrl,
      voiceDuration: messageType === "voice" ? Number(voiceDuration) || null : null,
      createdAt: new Date()
    };

    // Push message to chat's messages array  
    const chat = await Chat.findById(chatId);
    if (!chat) return next(new AppError('Chat not found', 404));
    chat.messages.push(messageObj);
    chat.lastMessageAt = new Date();
    await chat.save();

    // Send email notification when admin responds to startup (max 1 per 24 hours)
    if (senderType === 'admin') {
      try {
        // Check if we've sent an email in the last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const lastEmailSent = chat.lastEmailNotificationAt;
        
        // Only send email if we haven't sent one in the last 24 hours
        if (!lastEmailSent || lastEmailSent < twentyFourHoursAgo) {
          // Get startup details for email
          const startup = await Startup.findById(chat.startupId).select('email profile');
          if (startup && startup.email) {
            const startupName = startup.profile?.founderFirstName || 'there';
            const companyName = startup.profile?.companyName || 'your startup';
            
            await sendEmail({
              to: startup.email,
              subject: '💬 New Message from Leansprintr Team',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://leansprintr.com/assets/logo/LeanSprintNewLogo.png" alt="Leansprintr" style="height: 40px;">
                  </div>
                  
                  <h2 style="color: #333; margin-bottom: 20px;">Hi ${startupName}! 👋</h2>
                  
                  <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    You have a new message from our team regarding ${companyName}.
                  </p>
                  
                  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <p style="color: #333; margin: 0; font-style: italic;">
                      "${content && content.length > 100 ? content.substring(0, 100) + '...' : content || 'New message with attachment'}"
                    </p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL || 'https://app.leansprintr.com'}/startup/direct-chat" 
                       style="background: #007bff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
                      💬 View & Reply
                    </a>
                  </div>
                  
                  <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                    Best regards,<br>
                    The Leansprintr Team
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                  <p style="color: #999; font-size: 12px; text-align: center;">
                    This email was sent because you have an active conversation with our team.
                  </p>
                </div>
              `
            });
            
            // Update the last email notification timestamp
            chat.lastEmailNotificationAt = new Date();
            await chat.save();
            
            console.log(`Email notification sent to startup: ${startup.email} for admin response (rate limited)`);
          }
        } else {
          console.log(`Email notification skipped - sent recently (within 24 hours) for chat: ${chatId}`);
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if email fails
      }
    }

    // Emit socket event for real-time update (consistent format with socketManager)
    try {
      const io = req.app.get('io');
      if (io) {
        const socketMessage = {
          _id: chat.messages[chat.messages.length - 1]._id,
          conversationId: chatId,
          chatId: chatId, // Add both for compatibility
          senderId: senderId,
          senderType: senderType,
          content: content,
          messageType: messageType,
          fileUrl: fileUrl,
          fileName: fileName,
          fileSize: fileSize,
          mimeType: mimeType,
          imageUrl: imageUrl,
          voiceDuration: messageType === "voice" ? Number(voiceDuration) || null : null,
          createdAt: chat.messages[chat.messages.length - 1].createdAt
        };
        
        console.log('API emitting socket message to conversation:', chatId, socketMessage);
        io.to(`conversation:${chatId}`).emit('new_message', socketMessage);
      }
    } catch (e) {
      console.error('Socket emit error:', e);
      // Ignore socket errors
    }

    res.json({ success: true, data: { message: messageObj } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
