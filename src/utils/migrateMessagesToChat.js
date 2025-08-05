const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

async function migrateMessagesToChat() {
  await mongoose.connect("mongodb+srv://Aaronjgeorge:mBBUWmoJChJk8K9E@taotter.axf5ukv.mongodb.net/?retryWrites=true&w=majority&appName=Taotter", { useNewUrlParser: true, useUnifiedTopology: true });

  const messages = await Message.find({});
  let migratedCount = 0;

  for (const msg of messages) {
    const chat = await Chat.findById(msg.chatId);
    if (!chat) continue;

    // Map Message fields to Chat.messages array format
    const messageObj = {
      _id: msg._id,
      senderType: msg.senderType,
      senderId: msg.senderId,
      messageType: msg.fileUrl
        ? (msg.imageUrl ? 'image' : (msg.fileType && msg.fileType.startsWith('audio/') ? 'voice' : 'file'))
        : 'text',
      content: msg.content,
      fileUrl: msg.fileUrl,
      fileName: undefined,
      fileSize: undefined,
      mimeType: msg.fileType,
      imageUrl: msg.imageUrl,
      voiceDuration: undefined,
      read: msg.read,
      readAt: msg.readAt,
      createdAt: msg.createdAt
    };

    chat.messages.push(messageObj);
    chat.lastMessageAt = msg.createdAt;
    await chat.save();
    migratedCount++;
  }

  console.log(`Migrated ${migratedCount} messages to Chat.messages arrays.`);

  // Optionally: Remove all Message documents after migration
  // await Message.deleteMany({});
  mongoose.disconnect();
}

if (require.main === module) {
  migrateMessagesToChat().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
