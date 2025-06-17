const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
require('dotenv').config();

async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin2@taotter.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const admin = new Admin({
      email: 'admin2@taotter.com',
      password: 'admin123456', // Will be hashed automatically
      profile: {
        firstName: 'Admin',
        lastName: 'User',
        department: 'management'
      },
      role: 'super_admin',
      status: 'active'
    });

    await admin.save();
    console.log('Admin user created successfully:');
    console.log('Email: admin@taotter.com');
    console.log('Password: admin123456');
    console.log('Role: super_admin');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

createAdmin();
