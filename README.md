# Taotter API

A comprehensive backend API for the Taotter platform, featuring separate authentication systems for startups and administrators, project management capabilities, and questionnaire handling.

## 🚀 Features

### Authentication & Authorization

- **Dual User System**: Separate models and authentication for Startups and Admins
- **JWT Authentication**: Secure access and refresh token system
- **Google OAuth**: Social login for startups
- **Role-based Permissions**: Granular permission system for admins
- **Account Security**: Rate limiting, account locking, and security monitoring

### Core Functionality

- **Questionnaire System**: Multi-step questionnaire submission and review workflow
- **Project Management**: Kanban-style boards with tasks, comments, and time tracking
- **User Management**: Complete profile management for both user types
- **Real-time Features**: Socket.IO integration for live updates
- **File Management**: Secure file upload and storage

### Security & Performance

- **Input Validation**: Comprehensive request validation
- **Data Sanitization**: XSS and NoSQL injection protection
- **Rate Limiting**: Configurable request throttling
- **Logging & Monitoring**: Structured logging with security event tracking
- **Redis Caching**: Performance optimization with Redis

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis
- **Authentication**: JWT with bcrypt
- **Real-time**: Socket.IO
- **Email**: Multiple providers (SMTP, SendGrid, Mailgun)
- **SMS**: Twilio integration
- **File Storage**: Local storage with AWS S3 support

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- Redis (v6 or higher)
- npm or yarn package manager

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/taotter-api.git
   cd taotter-api
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Configuration**

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file with your configuration:

   - Database connection strings
   - JWT secrets
   - Email service credentials
   - External service API keys

4. **Start required services**

   ```bash
   # Start MongoDB (if using local installation)
   mongod

   # Start Redis (if using local installation)
   redis-server
   ```

5. **Run the application**

   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## 🏗️ Project Structure

```
src/
├── config/           # Database and external service configurations
│   ├── database.js   # MongoDB connection
│   └── redis.js      # Redis connection
├── middleware/       # Express middleware
│   ├── auth.js       # Authentication middleware
│   ├── errorHandler.js # Error handling
│   └── notFound.js   # 404 handler
├── models/           # Mongoose schemas
│   ├── Admin.js      # Admin user model
│   ├── Startup.js    # Startup user model
│   ├── Questionnaire.js # Questionnaire model
│   ├── Task.js       # Task model
│   └── Board.js      # Project board model
├── routes/           # API route definitions
│   ├── startupAuth.js # Startup authentication routes
│   └── adminAuth.js  # Admin authentication routes
├── utils/            # Utility functions
│   ├── logger.js     # Logging utilities
│   ├── validation.js # Input validation
│   ├── communications.js # Email/SMS services
│   └── socketManager.js # Socket.IO management
└── server.js         # Application entry point
```

## 🔐 Authentication System

### Startup Authentication

- **Registration**: Email/password or Google OAuth
- **Login**: Email/password or Google OAuth
- **Features**: Email verification, phone verification, password reset
- **Endpoints**: `/api/startup/auth/*`

### Admin Authentication

- **Creation**: Invitation-based system (Super Admin only)
- **Login**: Email/password only
- **Features**: Role-based permissions, account setup workflow
- **Endpoints**: `/api/admin/auth/*`

## 📊 User Types & Permissions

### Startup Users

- Submit and manage questionnaires
- View assigned project boards
- Communicate with admin team
- Update profile and preferences

### Admin Users

- **Standard Admin**: Review questionnaires, manage assigned projects
- **Super Admin**: Full system access, user management, admin creation

## 🔗 API Endpoints

### Health Check

```
GET /health - Application health status
GET /api - API information
```

### Startup Authentication

```
POST /api/startup/auth/register - Register new startup
POST /api/startup/auth/login - Login startup
POST /api/startup/auth/google - Google OAuth login
POST /api/startup/auth/refresh - Refresh access token
POST /api/startup/auth/logout - Logout startup
GET  /api/startup/auth/me - Get current startup info
POST /api/startup/auth/verify-email - Verify email address
POST /api/startup/auth/verify-phone - Verify phone number
POST /api/startup/auth/forgot-password - Request password reset
POST /api/startup/auth/reset-password - Reset password
```

### Admin Authentication

```
POST /api/admin/auth/login - Login admin
POST /api/admin/auth/refresh - Refresh access token
POST /api/admin/auth/logout - Logout admin
GET  /api/admin/auth/me - Get current admin info
POST /api/admin/auth/invite - Invite new admin (Super Admin only)
POST /api/admin/auth/create - Create admin directly (Super Admin only)
POST /api/admin/auth/setup-account - Setup admin account from invitation
POST /api/admin/auth/forgot-password - Request password reset
POST /api/admin/auth/reset-password - Reset password
PUT  /api/admin/auth/change-password - Change password
GET  /api/admin/auth/validate-invite/:token - Validate invitation token
```

## 🗄️ Database Models

### Startup Model

- Profile information (founder details, company info)
- Authentication data (password, tokens, security)
- Onboarding progress
- Verification status (email, phone)
- Engagement metrics

### Admin Model

- Profile information (name, department, contact)
- Role and permissions
- Workload management
- Activity tracking
- Authentication security

### Questionnaire Model

- Multi-step questionnaire data
- Progress tracking
- Admin review workflow
- Status management
- Analytics and metrics

### Task & Board Models

- Kanban-style project management
- Task assignments and tracking
- Comments and collaboration
- Time tracking and reporting

## 🔒 Security Features

- **Password Security**: bcrypt hashing with configurable rounds
- **Account Locking**: Automatic lockout after failed attempts
- **Rate Limiting**: Request throttling per IP/user
- **Input Validation**: Comprehensive request validation
- **Data Sanitization**: XSS and injection protection
- **Security Headers**: Helmet.js security middleware
- **CORS**: Configurable cross-origin resource sharing
- **Audit Logging**: Security event tracking

## 📧 Communication Services

### Email Services

- **SMTP**: Direct SMTP server connection
- **SendGrid**: Cloud email service
- **Mailgun**: Email API service

### SMS Services

- **Twilio**: Phone verification and notifications

## 🚀 Deployment

### Environment Variables

Ensure all required environment variables are set:

- Database connections
- JWT secrets
- Email service credentials
- External API keys

### Production Considerations

- Use secure JWT secrets
- Configure proper CORS origins
- Set up SSL certificates
- Configure rate limiting
- Set up monitoring and logging
- Use environment-specific configurations

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint
```

## 📝 Logging

The application uses structured logging with different levels:

- **Error**: Application errors and exceptions
- **Security**: Authentication and security events
- **Auth**: User authentication activities
- **Info**: General application information
- **Debug**: Detailed debugging information

Logs are written to console and optionally to files based on configuration.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue in the GitHub repository
- Contact the development team
- Check the documentation and API specifications

## 🔄 API Versioning

Current version: v1.0

- All endpoints are prefixed with `/api`
- Version-specific changes will be documented in releases

## 📈 Monitoring & Health Checks

- **Health Endpoint**: `/health` provides system status
- **Metrics**: Memory usage, uptime, and performance data
- **Request Tracking**: Unique request IDs for debugging

---

Built with ❤️ for the Taotter platform
