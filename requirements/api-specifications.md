# Taotter Platform - API Specifications

## API Overview

### Base URL

- **Development**: `http://localhost:5000/api/v1`
- **Production**: `https://api.taotter.com/api/v1`

### Authentication

- **Type**: JWT Bearer Token
- **Header**: `Authorization: Bearer <access_token>`
- **Token Expiry**: 15 minutes (Access Token), 7 days (Refresh Token)

### Response Format

All API responses follow this standard format:

```javascript
// Success Response
{
  "success": true,
  "data": {}, // Response data
  "message": "Operation completed successfully",
  "timestamp": "2025-01-01T00:00:00.000Z"
}

// Error Response
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {} // Additional error details
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

## Authentication Endpoints

### 1. Register with Mobile & Password

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "phone": "+1234567890",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "company": "Startup Inc."
}
```

**Response:**

```javascript
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "phone": "+1234567890",
      "profile": {
        "firstName": "John",
        "lastName": "Doe",
        "company": "Startup Inc."
      },
      "verification": {
        "email": { "isVerified": false },
        "phone": { "isVerified": false }
      },
      "role": "client",
      "status": "active"
    },
    "tokens": {
      "accessToken": "jwt_access_token",
      "refreshToken": "jwt_refresh_token"
    }
  },
  "message": "Account created successfully. Please verify your phone number."
}
```

### 2. Verify Phone Number

```http
POST /auth/verify-phone
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "verificationCode": "123456"
}
```

### 3. Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

### 4. Google OAuth

```http
POST /auth/google
Content-Type: application/json

{
  "googleToken": "google_oauth_token"
}
```

### 5. Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "jwt_refresh_token"
}
```

### 6. Logout

```http
POST /auth/logout
Authorization: Bearer <access_token>

{
  "refreshToken": "jwt_refresh_token"
}
```

### 7. Forgot Password

```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### 8. Reset Password

```http
POST /auth/reset-password
Content-Type: application/json

{
  "resetToken": "reset_token",
  "newPassword": "NewSecurePass123!"
}
```

## User Management Endpoints

### 1. Get User Profile

```http
GET /users/profile
Authorization: Bearer <access_token>
```

**Response:**

```javascript
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "phone": "+1234567890",
      "profile": {
        "firstName": "John",
        "lastName": "Doe",
        "company": "Startup Inc.",
        "avatar": "avatar_url",
        "timezone": "UTC",
        "preferences": {
          "notifications": {
            "email": true,
            "sms": true,
            "push": true
          },
          "theme": "light"
        }
      },
      "verification": {
        "email": { "isVerified": true },
        "phone": { "isVerified": true }
      }
    }
  }
}
```

### 2. Update User Profile

```http
PUT /users/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "company": "Updated Startup Inc.",
    "timezone": "America/New_York",
    "preferences": {
      "notifications": {
        "email": true,
        "sms": false,
        "push": true
      },
      "theme": "dark"
    }
  }
}
```

### 3. Upload Avatar

```http
POST /users/avatar
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

avatar: <file>
```

### 4. Change Password

```http
PUT /users/password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "currentPassword": "CurrentPass123!",
  "newPassword": "NewSecurePass123!"
}
```

## Questionnaire Endpoints

### 1. Submit Questionnaire

```http
POST /questionnaires
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "basicInfo": {
    "startupName": "Innovative Startup",
    "taskType": "mvp-development",
    "taskDescription": "We need to build a mobile app for food delivery",
    "startupStage": "idea",
    "keyGoals": "Launch MVP within 3 months and acquire first 100 users",
    "timeCommitment": "full-time"
  },
  "requirements": {
    "milestones": ["Build MVP", "Validate Idea", "Market Research"],
    "customMilestone": "Custom requirement here",
    "timeline": "3-4 weeks",
    "budgetRange": "$10,000 - $25,000"
  },
  "serviceSelection": {
    "selectedService": "MVP Development Package",
    "customRequest": "",
    "isCustom": false
  }
}
```

**Response:**

```javascript
{
  "success": true,
  "data": {
    "questionnaire": {
      "id": "questionnaire_id",
      "userId": "user_id",
      "status": "submitted",
      "basicInfo": { /* ... */ },
      "requirements": { /* ... */ },
      "serviceSelection": { /* ... */ },
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  },
  "message": "Questionnaire submitted successfully. We'll review it and get back to you soon."
}
```

### 2. Get User's Questionnaires

```http
GET /questionnaires
Authorization: Bearer <access_token>
```

### 3. Get Questionnaire by ID

```http
GET /questionnaires/:id
Authorization: Bearer <access_token>
```

### 4. Update Questionnaire (Draft only)

```http
PUT /questionnaires/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "basicInfo": { /* updated basic info */ }
}
```

## Sprint Management Endpoints

### 1. Get User's Sprints

```http
GET /sprints
Authorization: Bearer <access_token>
Query Parameters:
  - status: string (optional) - filter by status
  - page: number (default: 1)
  - limit: number (default: 10)
```

**Response:**

```javascript
{
  "success": true,
  "data": {
    "sprints": [
      {
        "id": "sprint_id",
        "name": "MVP Development Sprint",
        "description": "Build your food delivery app MVP",
        "type": "mvp",
        "status": "active",
        "startDate": "2025-01-01T00:00:00.000Z",
        "endDate": "2025-02-01T00:00:00.000Z",
        "progress": {
          "percentage": 45,
          "currentPhase": "Development",
          "completedMilestones": 2,
          "totalMilestones": 5
        },
        "selectedPackage": {
          "name": "Premium Package",
          "price": 15000,
          "currency": "USD"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalItems": 15,
      "limit": 10
    }
  }
}
```

### 2. Get Sprint Details

```http
GET /sprints/:id
Authorization: Bearer <access_token>
```

### 3. Select Sprint Package

```http
POST /sprints/:id/select-package
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "packageId": "package_id"
}
```

### 4. Upload Required Documents

```http
POST /sprints/:id/documents
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

fieldName: <file>
additionalField: "text value"
```

### 5. Get Sprint Documents

```http
GET /sprints/:id/documents
Authorization: Bearer <access_token>
```

### 6. Schedule Meeting

```http
POST /sprints/:id/meetings
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "meetingUrl": "calendly_meeting_url",
  "scheduledAt": "2025-01-15T10:00:00.000Z",
  "type": "kickoff"
}
```

## Document Management Endpoints

### 1. Upload Document

```http
POST /documents
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

sprintId: sprint_id
fieldName: field_name
file: <file>
```

### 2. Get Document

```http
GET /documents/:id
Authorization: Bearer <access_token>
```

### 3. Download Document

```http
GET /documents/:id/download
Authorization: Bearer <access_token>
```

### 4. Delete Document

```http
DELETE /documents/:id
Authorization: Bearer <access_token>
```

## Messaging Endpoints

### 1. Get Conversations

```http
GET /messages/conversations
Authorization: Bearer <access_token>
Query Parameters:
  - type: string (optional) - filter by conversation type
  - page: number (default: 1)
  - limit: number (default: 20)
```

### 2. Get Conversation Messages

```http
GET /messages/conversations/:conversationId/messages
Authorization: Bearer <access_token>
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 50)
  - before: string (optional) - get messages before this timestamp
```

### 3. Send Message

```http
POST /messages/conversations/:conversationId/messages
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "content": "Hello, I have a question about the project",
  "messageType": "text"
}
```

### 4. Send Message with Attachment

```http
POST /messages/conversations/:conversationId/messages
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

content: "Please check this document"
messageType: "file"
file: <file>
```

### 5. Mark Messages as Read

```http
POST /messages/conversations/:conversationId/read
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "messageIds": ["message_id_1", "message_id_2"]
}
```

### 6. Get Unread Count

```http
GET /messages/unread-count
Authorization: Bearer <access_token>
```

## Notification Endpoints

### 1. Get Notifications

```http
GET /notifications
Authorization: Bearer <access_token>
Query Parameters:
  - status: string (optional) - unread, read, dismissed
  - type: string (optional) - notification type
  - page: number (default: 1)
  - limit: number (default: 20)
```

### 2. Mark Notification as Read

```http
PUT /notifications/:id/read
Authorization: Bearer <access_token>
```

### 3. Mark All Notifications as Read

```http
PUT /notifications/read-all
Authorization: Bearer <access_token>
```

### 4. Dismiss Notification

```http
DELETE /notifications/:id
Authorization: Bearer <access_token>
```

## Integration Endpoints

### 1. Calendly Webhook

```http
POST /integrations/calendly/webhook
Content-Type: application/json

{
  "event": "invitee.created",
  "payload": {
    /* Calendly webhook payload */
  }
}
```

### 2. Get Calendly Availability

```http
GET /integrations/calendly/availability
Authorization: Bearer <access_token>
Query Parameters:
  - startDate: string (ISO date)
  - endDate: string (ISO date)
```

## Admin Endpoints

### 1. Get Pending Questionnaires

```http
GET /admin/questionnaires
Authorization: Bearer <admin_access_token>
Query Parameters:
  - status: string (optional)
  - page: number (default: 1)
  - limit: number (default: 20)
```

### 2. Review Questionnaire

```http
POST /admin/questionnaires/:id/review
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "status": "approved", // or "rejected"
  "adminNotes": "Looks good, proceeding with sprint creation",
  "rejectionReason": "" // required if status is "rejected"
}
```

### 3. Create Sprint

```http
POST /admin/sprints
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "questionnaireId": "questionnaire_id",
  "name": "Custom MVP Sprint",
  "description": "Tailored sprint for the client's needs",
  "type": "mvp",
  "estimatedDuration": 30,
  "requiredDocuments": [
    {
      "fieldName": "business_plan",
      "fieldType": "file",
      "label": "Business Plan",
      "description": "Upload your business plan document",
      "isRequired": true,
      "fileTypes": ["pdf", "doc", "docx"],
      "maxFileSize": 10485760
    }
  ],
  "packageOptions": [
    {
      "name": "Basic Package",
      "description": "Essential features for MVP",
      "price": 10000,
      "currency": "USD",
      "engagementHours": 20,
      "duration": 4,
      "features": ["Core features", "Basic design", "Web platform"],
      "teamSize": 2,
      "communicationLevel": "basic"
    }
  ]
}
```

## Error Codes

### Authentication Errors

- `AUTH_001` - Invalid credentials
- `AUTH_002` - Account not verified
- `AUTH_003` - Account suspended
- `AUTH_004` - Invalid token
- `AUTH_005` - Token expired
- `AUTH_006` - Insufficient permissions

### Validation Errors

- `VAL_001` - Missing required field
- `VAL_002` - Invalid email format
- `VAL_003` - Invalid phone format
- `VAL_004` - Password too weak
- `VAL_005` - File size too large
- `VAL_006` - Invalid file type

### Business Logic Errors

- `BIZ_001` - Questionnaire already submitted
- `BIZ_002` - Sprint not found
- `BIZ_003` - Document upload not allowed
- `BIZ_004` - Package already selected
- `BIZ_005` - Meeting already scheduled

### System Errors

- `SYS_001` - Database connection error
- `SYS_002` - File upload error
- `SYS_003` - Email delivery failed
- `SYS_004` - SMS delivery failed
- `SYS_005` - External API error

## Rate Limiting

### Rate Limits by Endpoint Type

- **Authentication**: 5 requests per minute
- **File Upload**: 10 requests per minute
- **Messaging**: 60 requests per minute
- **General API**: 100 requests per minute

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

## WebSocket Events

### Connection

```javascript
// Client connects with JWT token
socket.auth = { token: "jwt_access_token" };
socket.connect();
```

### Chat Events

```javascript
// Join conversation
socket.emit("join_conversation", { conversationId: "conv_id" });

// Send message
socket.emit("send_message", {
  conversationId: "conv_id",
  content: "Hello!",
  messageType: "text",
});

// Receive message
socket.on("new_message", (message) => {
  // Handle new message
});

// Typing indicator
socket.emit("typing", { conversationId: "conv_id", isTyping: true });
socket.on("user_typing", (data) => {
  // Handle typing indicator
});
```

### Notification Events

```javascript
// Receive notification
socket.on("notification", (notification) => {
  // Handle real-time notification
});

// Sprint update
socket.on("sprint_update", (sprintData) => {
  // Handle sprint progress update
});
```

## Request/Response Examples

### Complete Questionnaire Submission Flow

1. **Submit Questionnaire**
2. **Check Status**
3. **Admin Approval**
4. **Sprint Creation**
5. **Client Selects Package**
6. **Document Upload**
7. **Meeting Scheduling**

This flow demonstrates the complete client journey from questionnaire submission to active sprint management.

## Comprehensive Admin API Endpoints

### Admin Authentication

#### Admin Registration

```http
POST /admin/auth/register
Content-Type: application/json

{
  "email": "admin@taotter.com",
  "password": "SecureAdminPass123!",
  "firstName": "Admin",
  "lastName": "User",
  "role": "admin",
  "department": "Development"
}
```

#### Admin Login

```http
POST /admin/auth/login
Content-Type: application/json

{
  "email": "admin@taotter.com",
  "password": "SecureAdminPass123!"
}
```

### Kanban Task Management

#### 1. Get Boards

```http
GET /admin/boards
Authorization: Bearer <admin_access_token>
Query Parameters:
  - type: string (optional) - sprint, team, project, personal
  - teamId: string (optional)
  - isArchived: boolean (default: false)
  - page: number (default: 1)
  - limit: number (default: 20)
```

#### 2. Create Board

```http
POST /admin/boards
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "Sprint Development Board",
  "description": "Main development board for current sprint",
  "boardType": "sprint",
  "sprintId": "sprint_id",
  "columns": [
    {
      "name": "To Do",
      "description": "Tasks to be started",
      "color": "#e3f2fd",
      "position": 1,
      "columnType": "todo"
    },
    {
      "name": "In Progress",
      "description": "Currently working on",
      "color": "#fff3e0",
      "position": 2,
      "columnType": "in_progress",
      "wipLimit": 5
    },
    {
      "name": "Review",
      "description": "Ready for review",
      "color": "#fce4ec",
      "position": 3,
      "columnType": "review"
    },
    {
      "name": "Done",
      "description": "Completed tasks",
      "color": "#e8f5e8",
      "position": 4,
      "columnType": "done"
    }
  ],
  "visibility": "team",
  "settings": {
    "allowMemberAdd": true,
    "allowTaskCreation": true,
    "enableTimeTracking": true,
    "enableDueDates": true
  }
}
```

#### 3. Get Board Details

```http
GET /admin/boards/:boardId
Authorization: Bearer <admin_access_token>
```

#### 4. Update Board

```http
PUT /admin/boards/:boardId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "Updated Board Name",
  "columns": [
    // Updated columns array
  ]
}
```

#### 5. Get Tasks

```http
GET /admin/tasks
Authorization: Bearer <admin_access_token>
Query Parameters:
  - boardId: string (optional)
  - sprintId: string (optional)
  - assigneeId: string (optional)
  - status: string (optional)
  - priority: string (optional)
  - tags: string (optional) - comma-separated tag names
  - dueDate: string (optional) - ISO date
  - search: string (optional) - search in title/description
  - page: number (default: 1)
  - limit: number (default: 50)
  - sortBy: string (default: 'createdAt')
  - sortOrder: string (default: 'desc')
```

#### 6. Create Task

```http
POST /admin/tasks
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication with phone verification",
  "taskType": "development",
  "priority": "high",
  "boardId": "board_id",
  "columnId": "column_id",
  "sprintId": "sprint_id",
  "assigneeId": "user_id",
  "dueDate": "2025-02-01T00:00:00.000Z",
  "estimatedHours": 16,
  "tags": [
    {
      "name": "backend",
      "color": "#2196f3",
      "category": "type"
    },
    {
      "name": "urgent",
      "color": "#f44336",
      "category": "priority"
    }
  ],
  "progress": {
    "checklistItems": [
      {
        "text": "Set up JWT middleware",
        "isCompleted": false
      },
      {
        "text": "Implement phone verification",
        "isCompleted": false
      },
      {
        "text": "Add login/logout endpoints",
        "isCompleted": false
      }
    ]
  }
}
```

#### 7. Update Task

```http
PUT /admin/tasks/:taskId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "status": "in_progress",
  "assigneeId": "new_assignee_id",
  "priority": "critical",
  "progress": {
    "percentage": 25
  }
}
```

#### 8. Move Task (Drag & Drop)

```http
PUT /admin/tasks/:taskId/move
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "columnId": "new_column_id",
  "position": 2,
  "boardId": "board_id"
}
```

#### 9. Add Task Comment

```http
POST /admin/tasks/:taskId/comments
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "content": "Updated the implementation approach based on client feedback",
  "commentType": "comment",
  "mentions": ["user_id_1", "user_id_2"]
}
```

#### 10. Add Task Comment with Attachment

```http
POST /admin/tasks/:taskId/comments
Authorization: Bearer <admin_access_token>
Content-Type: multipart/form-data

content: "Please review the attached design mockup"
commentType: "comment"
file: <file>
```

#### 11. Get Task Comments

```http
GET /admin/tasks/:taskId/comments
Authorization: Bearer <admin_access_token>
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 20)
  - includeSystem: boolean (default: true)
```

#### 12. Update Task Comment

```http
PUT /admin/task-comments/:commentId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "content": "Updated comment content"
}
```

#### 13. Delete Task Comment

```http
DELETE /admin/task-comments/:commentId
Authorization: Bearer <admin_access_token>
```

#### 14. Add Task Attachment

```http
POST /admin/tasks/:taskId/attachments
Authorization: Bearer <admin_access_token>
Content-Type: multipart/form-data

file: <file>
description: "Design specifications document"
```

#### 15. Add External Link

```http
POST /admin/tasks/:taskId/links
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "title": "API Documentation",
  "url": "https://docs.example.com/api",
  "description": "Reference documentation for the API integration"
}
```

#### 16. Log Time

```http
POST /admin/tasks/:taskId/time-log
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "hours": 4.5,
  "description": "Implemented user authentication endpoints",
  "date": "2025-01-15T00:00:00.000Z"
}
```

### Task Filtering and Search

#### 17. Advanced Task Search

```http
POST /admin/tasks/search
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "filters": {
    "assignees": ["user_id_1", "user_id_2"],
    "priorities": ["high", "critical"],
    "statuses": ["in_progress", "review"],
    "tags": ["backend", "frontend"],
    "dueDateRange": {
      "start": "2025-01-01T00:00:00.000Z",
      "end": "2025-02-01T00:00:00.000Z"
    },
    "boardIds": ["board_id_1", "board_id_2"],
    "sprintIds": ["sprint_id_1"]
  },
  "search": "authentication",
  "sortBy": "dueDate",
  "sortOrder": "asc",
  "page": 1,
  "limit": 25
}
```

#### 18. Save Filter Preset

```http
POST /admin/task-filters
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "My High Priority Tasks",
  "description": "Tasks assigned to me with high priority",
  "filters": {
    "assignees": ["my_user_id"],
    "priorities": ["high", "critical"],
    "statuses": ["todo", "in_progress"]
  },
  "isGlobal": false
}
```

#### 19. Get Saved Filters

```http
GET /admin/task-filters
Authorization: Bearer <admin_access_token>
```

### Tag Management

#### 20. Get Tags

```http
GET /admin/tags
Authorization: Bearer <admin_access_token>
Query Parameters:
  - category: string (optional)
  - isGlobal: boolean (optional)
  - boardId: string (optional)
```

#### 21. Create Tag

```http
POST /admin/tags
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "urgent",
  "description": "High priority tasks requiring immediate attention",
  "color": "#f44336",
  "category": "priority",
  "isGlobal": true
}
```

#### 22. Update Tag

```http
PUT /admin/tags/:tagId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "critical",
  "color": "#d32f2f"
}
```

#### 23. Delete Tag

```http
DELETE /admin/tags/:tagId
Authorization: Bearer <admin_access_token>
```

### Team Management

#### 24. Get Teams

```http
GET /admin/teams
Authorization: Bearer <admin_access_token>
Query Parameters:
  - department: string (optional)
  - isActive: boolean (default: true)
```

#### 25. Create Team

```http
POST /admin/teams
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "Frontend Development",
  "description": "Team responsible for client-side development",
  "department": "Engineering",
  "teamLeadId": "user_id",
  "members": [
    {
      "userId": "user_id_1",
      "role": "member"
    },
    {
      "userId": "user_id_2",
      "role": "member"
    }
  ],
  "settings": {
    "allowMemberInvite": true,
    "enableTimeTracking": true,
    "workingHours": {
      "start": "09:00",
      "end": "17:00",
      "timezone": "UTC"
    }
  }
}
```

#### 26. Add Team Member

```http
POST /admin/teams/:teamId/members
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "userId": "user_id",
  "role": "member"
}
```

#### 27. Update Team Member Role

```http
PUT /admin/teams/:teamId/members/:userId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "role": "lead"
}
```

#### 28. Remove Team Member

```http
DELETE /admin/teams/:teamId/members/:userId
Authorization: Bearer <admin_access_token>
```

### Task Templates

#### 29. Get Task Templates

```http
GET /admin/task-templates
Authorization: Bearer <admin_access_token>
Query Parameters:
  - category: string (optional)
  - isGlobal: boolean (optional)
  - teamId: string (optional)
```

#### 30. Create Task Template

```http
POST /admin/task-templates
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "API Endpoint Development",
  "description": "Standard template for creating new API endpoints",
  "category": "development",
  "template": {
    "title": "Implement {feature} API endpoint",
    "description": "Create RESTful API endpoint for {feature} functionality",
    "taskType": "development",
    "priority": "medium",
    "estimatedHours": 8,
    "tags": ["backend", "api"],
    "checklistItems": [
      {
        "text": "Design API schema",
        "isRequired": true
      },
      {
        "text": "Implement endpoint logic",
        "isRequired": true
      },
      {
        "text": "Add validation",
        "isRequired": true
      },
      {
        "text": "Write unit tests",
        "isRequired": true
      },
      {
        "text": "Update API documentation",
        "isRequired": false
      }
    ],
    "requiredFields": ["title", "assigneeId", "dueDate"]
  },
  "isGlobal": true,
  "isPublic": true
}
```

#### 31. Create Task from Template

```http
POST /admin/tasks/from-template
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "templateId": "template_id",
  "boardId": "board_id",
  "columnId": "column_id",
  "overrides": {
    "title": "Implement user authentication API endpoint",
    "assigneeId": "user_id",
    "dueDate": "2025-02-01T00:00:00.000Z",
    "sprintId": "sprint_id"
  }
}
```

### Analytics and Reporting

#### 32. Get Task Analytics

```http
GET /admin/analytics/tasks
Authorization: Bearer <admin_access_token>
Query Parameters:
  - boardId: string (optional)
  - sprintId: string (optional)
  - teamId: string (optional)
  - dateRange: string (optional) - '7d', '30d', '90d', 'custom'
  - startDate: string (optional) - ISO date
  - endDate: string (optional) - ISO date
```

**Response:**

```javascript
{
  "success": true,
  "data": {
    "summary": {
      "totalTasks": 156,
      "completedTasks": 89,
      "inProgressTasks": 34,
      "overdueTasks": 12,
      "averageCompletionTime": 4.2, // days
      "taskCompletionRate": 72.5 // percentage
    },
    "tasksByStatus": {
      "todo": 21,
      "in_progress": 34,
      "review": 12,
      "done": 89
    },
    "tasksByPriority": {
      "low": 45,
      "medium": 67,
      "high": 32,
      "critical": 12
    },
    "tasksByAssignee": [
      {
        "userId": "user_id_1",
        "userName": "John Doe",
        "totalTasks": 23,
        "completedTasks": 18,
        "completionRate": 78.3
      }
    ],
    "burndownChart": [
      {
        "date": "2025-01-01",
        "remaining": 156,
        "completed": 0
      },
      {
        "date": "2025-01-02",
        "remaining": 152,
        "completed": 4
      }
    ]
  }
}
```

#### 33. Get Team Productivity Report

```http
GET /admin/analytics/team-productivity
Authorization: Bearer <admin_access_token>
Query Parameters:
  - teamId: string (optional)
  - dateRange: string (default: '30d')
```

#### 34. Export Tasks

```http
GET /admin/tasks/export
Authorization: Bearer <admin_access_token>
Query Parameters:
  - format: string (csv, xlsx, json)
  - boardId: string (optional)
  - sprintId: string (optional)
  - filters: string (optional) - JSON string of filter object
```

### Bulk Operations

#### 35. Bulk Update Tasks

```http
PUT /admin/tasks/bulk-update
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "taskIds": ["task_id_1", "task_id_2", "task_id_3"],
  "updates": {
    "assigneeId": "new_assignee_id",
    "priority": "high",
    "tags": [
      {
        "name": "urgent",
        "color": "#f44336"
      }
    ]
  }
}
```

#### 36. Bulk Move Tasks

```http
PUT /admin/tasks/bulk-move
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "taskIds": ["task_id_1", "task_id_2"],
  "columnId": "new_column_id",
  "boardId": "board_id"
}
```

#### 37. Archive Completed Tasks

```http
POST /admin/tasks/archive-completed
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "boardId": "board_id",
  "olderThan": "2025-01-01T00:00:00.000Z"
}
```
