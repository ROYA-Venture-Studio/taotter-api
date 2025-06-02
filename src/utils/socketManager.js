const jwt = require('jsonwebtoken');
const logger = require('./logger');
const User = require('../models/User');

let io = null;
const connectedUsers = new Map(); // userId -> socketId mapping
const userSockets = new Map(); // socketId -> user data mapping

const initializeSocketIO = (socketIO) => {
  io = socketIO;

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Attach user to socket
      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.userData = {
        id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName
      };

      next();
    } catch (error) {
      logger.logError(error, 'Socket Authentication');
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle socket connections
  io.on('connection', (socket) => {
    const userId = socket.userId;
    const socketId = socket.id;

    // Store user connection
    connectedUsers.set(userId, socketId);
    userSockets.set(socketId, socket.userData);

    logger.logSocket('USER_CONNECTED', userId, socketId);

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // If admin, join admin room
    if (socket.userRole === 'admin' || socket.userRole === 'super_admin') {
      socket.join('admins');
    }

    // Handle joining conversation rooms
    socket.on('join_conversation', async ({ conversationId }) => {
      try {
        // TODO: Verify user has access to this conversation
        socket.join(`conversation:${conversationId}`);
        logger.logSocket('JOINED_CONVERSATION', userId, conversationId);
        
        socket.emit('conversation_joined', { conversationId });
      } catch (error) {
        logger.logError(error, 'Join Conversation');
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle leaving conversation rooms
    socket.on('leave_conversation', ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`);
      logger.logSocket('LEFT_CONVERSATION', userId, conversationId);
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, messageType = 'text' } = data;
        
        // TODO: Validate and save message to database
        // For now, just broadcast to conversation participants
        
        const messageData = {
          id: Date.now(), // Temporary ID
          conversationId,
          senderId: userId,
          senderName: `${socket.userData.firstName} ${socket.userData.lastName}`,
          content,
          messageType,
          timestamp: new Date().toISOString()
        };

        // Broadcast to conversation participants
        socket.to(`conversation:${conversationId}`).emit('new_message', messageData);
        
        // Confirm message sent to sender
        socket.emit('message_sent', { messageId: messageData.id });
        
        logger.logSocket('MESSAGE_SENT', userId, conversationId);
      } catch (error) {
        logger.logError(error, 'Send Message');
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing', ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId,
        userName: `${socket.userData.firstName} ${socket.userData.lastName}`,
        isTyping
      });
    });

    // Handle sprint room joining (for sprint-specific updates)
    socket.on('join_sprint', ({ sprintId }) => {
      socket.join(`sprint:${sprintId}`);
      logger.logSocket('JOINED_SPRINT', userId, sprintId);
    });

    // Handle task board subscriptions
    socket.on('join_board', ({ boardId }) => {
      socket.join(`board:${boardId}`);
      logger.logSocket('JOINED_BOARD', userId, boardId);
    });

    // Handle task updates (for real-time kanban updates)
    socket.on('task_update', (data) => {
      const { boardId, taskId, update } = data;
      
      // Broadcast task update to board subscribers
      socket.to(`board:${boardId}`).emit('task_updated', {
        taskId,
        update,
        updatedBy: socket.userData
      });
      
      logger.logSocket('TASK_UPDATED', userId, taskId);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      // Remove user from connected users
      connectedUsers.delete(userId);
      userSockets.delete(socketId);
      
      logger.logSocket('USER_DISCONNECTED', userId, `${socketId} - ${reason}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.logError(error, 'Socket Error');
    });
  });

  logger.info('Socket.IO initialized successfully');
};

// Utility functions for sending notifications

const sendToUser = (userId, event, data) => {
  const socketId = connectedUsers.get(userId);
  if (socketId) {
    io.to(`user:${userId}`).emit(event, data);
    return true;
  }
  return false;
};

const sendToConversation = (conversationId, event, data, excludeUserId = null) => {
  const room = `conversation:${conversationId}`;
  if (excludeUserId) {
    const socketId = connectedUsers.get(excludeUserId);
    if (socketId) {
      io.to(room).except(socketId).emit(event, data);
    } else {
      io.to(room).emit(event, data);
    }
  } else {
    io.to(room).emit(event, data);
  }
};

const sendToSprint = (sprintId, event, data) => {
  io.to(`sprint:${sprintId}`).emit(event, data);
};

const sendToBoard = (boardId, event, data) => {
  io.to(`board:${boardId}`).emit(event, data);
};

const sendToAdmins = (event, data) => {
  io.to('admins').emit(event, data);
};

const broadcastNotification = (userIds, notification) => {
  userIds.forEach(userId => {
    sendToUser(userId, 'notification', notification);
  });
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

const getOnlineUsersCount = () => {
  return connectedUsers.size;
};

module.exports = {
  initializeSocketIO,
  sendToUser,
  sendToConversation,
  sendToSprint,
  sendToBoard,
  sendToAdmins,
  broadcastNotification,
  getConnectedUsers,
  isUserOnline,
  getOnlineUsersCount
};
