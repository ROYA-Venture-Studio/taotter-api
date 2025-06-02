# Taotter Platform - Database Schema

## Database Design Overview

### Database Choice: MongoDB

- **Document-based**: Perfect for flexible, evolving schemas
- **JSON-like**: Natural fit for Node.js and React applications
- **Scalability**: Horizontal scaling capabilities
- **Relationships**: Both embedded and referenced relationships
- **Indexing**: Rich indexing for performance optimization

### Schema Design Principles

- **Denormalization**: Strategic denormalization for read performance
- **Embedding vs Referencing**: Embed small, stable data; reference large, changing data
- **Indexing Strategy**: Indexes on frequently queried fields
- **Validation**: Mongoose schema validation for data integrity
- **Audit Trail**: CreatedAt/UpdatedAt timestamps on all documents

## Core Collections

### 1. Users Collection

```javascript
// users
{
  _id: ObjectId,
  email: String, // unique, required
  phone: String, // unique, sparse
  password: String, // hashed with bcrypt
  googleId: String, // sparse, for OAuth users
  profile: {
    firstName: String,
    lastName: String,
    company: String,
    avatar: String, // URL to profile image
    timezone: String,
    preferences: {
      notifications: {
        email: Boolean,
        sms: Boolean,
        push: Boolean
      },
      theme: String // 'light' | 'dark'
    }
  },
  verification: {
    email: {
      isVerified: Boolean,
      verificationToken: String,
      verifiedAt: Date
    },
    phone: {
      isVerified: Boolean,
      verificationCode: String,
      codeExpiresAt: Date,
      verifiedAt: Date,
      attempts: Number
    }
  },
  authentication: {
    refreshTokens: [{
      token: String,
      expiresAt: Date,
      deviceInfo: String,
      createdAt: Date
    }],
    lastLoginAt: Date,
    loginAttempts: Number,
    lockedUntil: Date
  },
  role: String, // 'client' | 'admin' | 'super_admin'
  status: String, // 'active' | 'inactive' | 'suspended'
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ phone: 1 }, { unique: true, sparse: true })
db.users.createIndex({ googleId: 1 }, { sparse: true })
db.users.createIndex({ "authentication.refreshTokens.token": 1 })
db.users.createIndex({ role: 1, status: 1 })
```

### 2. Questionnaires Collection

```javascript
// questionnaires
{
  _id: ObjectId,
  userId: ObjectId, // ref: 'User'
  status: String, // 'draft' | 'submitted' | 'approved' | 'rejected'

  // Step 1: Basic Information
  basicInfo: {
    startupName: String,
    taskType: String,
    taskDescription: String,
    startupStage: String,
    keyGoals: String,
    timeCommitment: String // 'full-time' | 'part-time'
  },

  // Step 2: Requirements & Budget
  requirements: {
    milestones: [String], // Array of selected milestone types
    customMilestone: String,
    timeline: String,
    budgetRange: String
  },

  // Step 3: Service Selection
  serviceSelection: {
    selectedService: String,
    customRequest: String,
    isCustom: Boolean
  },

  // Admin processing
  adminNotes: String,
  reviewedBy: ObjectId, // ref: 'User' (admin)
  reviewedAt: Date,
  rejectionReason: String,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.questionnaires.createIndex({ userId: 1 })
db.questionnaires.createIndex({ status: 1 })
db.questionnaires.createIndex({ reviewedBy: 1, reviewedAt: 1 })
db.questionnaires.createIndex({ createdAt: 1 })
```

### 3. Sprints Collection

```javascript
// sprints
{
  _id: ObjectId,
  clientId: ObjectId, // ref: 'User'
  questionnaireId: ObjectId, // ref: 'Questionnaire'
  adminId: ObjectId, // ref: 'User' (admin who created)

  // Sprint Configuration
  name: String,
  description: String,
  type: String, // 'mvp', 'validation', 'branding', 'custom'

  // Timeline
  startDate: Date,
  endDate: Date,
  estimatedDuration: Number, // in days
  actualDuration: Number, // in days

  // Team Assignment
  assignedTeam: [{
    userId: ObjectId, // ref: 'User'
    role: String, // 'lead', 'developer', 'designer', 'consultant'
    allocation: Number // percentage of time allocated
  }],

  // Sprint Status
  status: String, // 'created' | 'documents_required' | 'package_selection' | 'scheduled' | 'active' | 'completed' | 'paused' | 'cancelled'

  // Requirements
  requiredDocuments: [{
    fieldName: String,
    fieldType: String, // 'file' | 'text' | 'textarea' | 'url'
    label: String,
    description: String,
    isRequired: Boolean,
    fileTypes: [String], // for file fields
    maxFileSize: Number // in bytes
  }],

  // Package Options
  packageOptions: [{
    _id: ObjectId,
    name: String,
    description: String,
    price: Number,
    currency: String,
    engagementHours: Number, // hours per week
    duration: Number, // weeks
    features: [String],
    teamSize: Number,
    communicationLevel: String // 'basic' | 'regular' | 'premium'
  }],

  selectedPackage: ObjectId, // ref to packageOptions._id

  // Milestones
  milestones: [{
    _id: ObjectId,
    name: String,
    description: String,
    dueDate: Date,
    status: String, // 'pending' | 'in_progress' | 'completed' | 'overdue'
    deliverables: [String],
    completedAt: Date,
    notes: String
  }],

  // Progress Tracking
  progress: {
    percentage: Number, // 0-100
    currentPhase: String,
    lastUpdated: Date,
    completedMilestones: Number,
    totalMilestones: Number
  },

  // Meeting Information
  meetings: [{
    type: String, // 'kickoff' | 'weekly' | 'review' | 'final'
    scheduledAt: Date,
    meetingUrl: String, // Calendly or video call link
    attendees: [ObjectId], // refs: 'User'
    status: String, // 'scheduled' | 'completed' | 'cancelled'
    notes: String,
    recordings: [String] // URLs to meeting recordings
  }],

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.sprints.createIndex({ clientId: 1, status: 1 })
db.sprints.createIndex({ adminId: 1 })
db.sprints.createIndex({ "assignedTeam.userId": 1 })
db.sprints.createIndex({ status: 1, startDate: 1 })
db.sprints.createIndex({ endDate: 1 })
```

### 4. Documents Collection

```javascript
// documents
{
  _id: ObjectId,
  sprintId: ObjectId, // ref: 'Sprint'
  userId: ObjectId, // ref: 'User' (uploader)

  // Document Metadata
  fieldName: String, // corresponds to requiredDocuments.fieldName
  originalName: String,
  fileName: String, // sanitized file name
  fileSize: Number, // in bytes
  mimeType: String,
  fileUrl: String, // cloud storage URL

  // File Processing
  isProcessed: Boolean,
  processingStatus: String, // 'pending' | 'processing' | 'completed' | 'failed'
  thumbnailUrl: String, // for images/PDFs

  // Metadata
  uploadedAt: Date,
  version: Number, // for document versioning
  previousVersion: ObjectId, // ref: 'Document'

  // Admin Review
  reviewStatus: String, // 'pending' | 'approved' | 'rejected' | 'needs_revision'
  reviewedBy: ObjectId, // ref: 'User'
  reviewedAt: Date,
  reviewNotes: String,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.documents.createIndex({ sprintId: 1, fieldName: 1 })
db.documents.createIndex({ userId: 1, uploadedAt: -1 })
db.documents.createIndex({ reviewStatus: 1 })
db.documents.createIndex({ fileName: 1 })
```

### 5. Messages Collection

```javascript
// messages
{
  _id: ObjectId,
  conversationId: ObjectId, // ref: 'Conversation'
  senderId: ObjectId, // ref: 'User'
  receiverId: ObjectId, // ref: 'User' (for direct messages)

  // Message Content
  content: String,
  messageType: String, // 'text' | 'file' | 'image' | 'system'

  // File Attachments (for file/image types)
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    mimeType: String,
    thumbnailUrl: String
  }],

  // Message Status
  status: String, // 'sent' | 'delivered' | 'read'
  readBy: [{
    userId: ObjectId, // ref: 'User'
    readAt: Date
  }],

  // Message Threading
  replyTo: ObjectId, // ref: 'Message' (for threaded conversations)
  mentions: [ObjectId], // refs: 'User' (mentioned users)

  // Metadata
  editedAt: Date,
  deletedAt: Date,
  isDeleted: Boolean,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.messages.createIndex({ conversationId: 1, createdAt: -1 })
db.messages.createIndex({ senderId: 1, createdAt: -1 })
db.messages.createIndex({ receiverId: 1, status: 1 })
db.messages.createIndex({ "readBy.userId": 1, "readBy.readAt": 1 })
```

### 6. Conversations Collection

```javascript
// conversations
{
  _id: ObjectId,
  sprintId: ObjectId, // ref: 'Sprint' (nullable for general conversations)
  type: String, // 'direct' | 'sprint' | 'support'

  // Participants
  participants: [{
    userId: ObjectId, // ref: 'User'
    role: String, // 'client' | 'admin' | 'team_member'
    joinedAt: Date,
    leftAt: Date,
    isActive: Boolean
  }],

  // Conversation Metadata
  title: String, // optional title for group conversations
  description: String,

  // Last Activity
  lastMessage: {
    messageId: ObjectId, // ref: 'Message'
    content: String, // preview of last message
    senderId: ObjectId, // ref: 'User'
    sentAt: Date
  },

  // Unread Counts
  unreadCounts: [{
    userId: ObjectId, // ref: 'User'
    count: Number,
    lastReadAt: Date
  }],

  // Conversation Settings
  settings: {
    muteNotifications: [ObjectId], // user IDs who muted
    isPinned: [ObjectId], // user IDs who pinned
    isArchived: Boolean,
    autoDeleteAfter: Number // days
  },

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.conversations.createIndex({ sprintId: 1 })
db.conversations.createIndex({ "participants.userId": 1, "participants.isActive": 1 })
db.conversations.createIndex({ type: 1 })
db.conversations.createIndex({ "lastMessage.sentAt": -1 })
```

### 7. Notifications Collection

```javascript
// notifications
{
  _id: ObjectId,
  userId: ObjectId, // ref: 'User'

  // Notification Content
  type: String, // 'sprint_update' | 'message' | 'milestone' | 'document_request' | 'meeting_scheduled'
  title: String,
  message: String,

  // Related Entities
  relatedEntity: {
    entityType: String, // 'sprint' | 'message' | 'document' | 'meeting'
    entityId: ObjectId,
    entityTitle: String
  },

  // Notification Status
  status: String, // 'unread' | 'read' | 'dismissed'
  readAt: Date,

  // Delivery Channels
  channels: {
    inApp: {
      sent: Boolean,
      sentAt: Date
    },
    email: {
      sent: Boolean,
      sentAt: Date,
      emailId: String
    },
    sms: {
      sent: Boolean,
      sentAt: Date,
      messageId: String
    }
  },

  // Action Button (optional)
  actionButton: {
    text: String,
    url: String,
    action: String
  },

  expiresAt: Date, // auto-delete date
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.notifications.createIndex({ userId: 1, status: 1, createdAt: -1 })
db.notifications.createIndex({ type: 1 })
db.notifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.notifications.createIndex({ "relatedEntity.entityType": 1, "relatedEntity.entityId": 1 })
```

## Supporting Collections

### 8. Service Templates Collection

```javascript
// service_templates
{
  _id: ObjectId,

  // Template Information
  name: String,
  description: String,
  category: String, // 'mvp' | 'validation' | 'branding' | 'consulting'

  // Template Configuration
  defaultDuration: Number, // in days
  recommendedTeamSize: Number,

  // Default Package Options
  packages: [{
    name: String,
    description: String,
    basePrice: Number,
    currency: String,
    engagementHours: Number,
    features: [String]
  }],

  // Default Required Documents
  requiredDocuments: [{
    fieldName: String,
    fieldType: String,
    label: String,
    description: String,
    isRequired: Boolean,
    fileTypes: [String],
    maxFileSize: Number
  }],

  // Default Milestones
  defaultMilestones: [{
    name: String,
    description: String,
    dayOffset: Number, // days from start
    deliverables: [String]
  }],

  isActive: Boolean,
  createdBy: ObjectId, // ref: 'User'
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.service_templates.createIndex({ category: 1, isActive: 1 })
db.service_templates.createIndex({ name: 1 })
```

### 9. Audit Logs Collection

```javascript
// audit_logs
{
  _id: ObjectId,

  // User Information
  userId: ObjectId, // ref: 'User'
  userEmail: String,
  userRole: String,

  // Action Information
  action: String, // 'create' | 'update' | 'delete' | 'login' | 'logout'
  resource: String, // 'user' | 'sprint' | 'document' | 'message'
  resourceId: ObjectId,

  // Change Details
  changes: {
    before: Object, // previous state
    after: Object // new state
  },

  // Request Context
  ipAddress: String,
  userAgent: String,
  sessionId: String,

  // Metadata
  success: Boolean,
  errorMessage: String,
  timestamp: Date,

  createdAt: Date
}

// Indexes
db.audit_logs.createIndex({ userId: 1, timestamp: -1 })
db.audit_logs.createIndex({ action: 1, resource: 1 })
db.audit_logs.createIndex({ timestamp: -1 })
db.audit_logs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 31536000 }) // 1 year TTL
```

### 10. Tasks Collection

```javascript
// tasks
{
  _id: ObjectId,

  // Task Basic Information
  title: String,
  description: String,
  taskType: String, // 'development' | 'design' | 'research' | 'testing' | 'bug' | 'feature'
  priority: String, // 'low' | 'medium' | 'high' | 'critical'
  status: String, // 'todo' | 'in_progress' | 'review' | 'done' | 'archived'

  // Assignment and Ownership
  assigneeId: ObjectId, // ref: 'User'
  createdBy: ObjectId, // ref: 'User'
  reporterId: ObjectId, // ref: 'User'

  // Project Association
  sprintId: ObjectId, // ref: 'Sprint' (optional)
  boardId: ObjectId, // ref: 'Board'
  columnId: ObjectId, // current column in kanban board

  // Timeline
  dueDate: Date,
  estimatedHours: Number,
  loggedHours: Number,
  startDate: Date,
  completedDate: Date,

  // Task Organization
  tags: [{
    _id: ObjectId,
    name: String,
    color: String,
    category: String
  }],

  // Task Hierarchy
  parentTaskId: ObjectId, // ref: 'Task' (for subtasks)
  subtasks: [ObjectId], // refs: 'Task'
  dependencies: [ObjectId], // refs: 'Task'

  // Progress Tracking
  progress: {
    percentage: Number, // 0-100
    checklistItems: [{
      _id: ObjectId,
      text: String,
      isCompleted: Boolean,
      completedBy: ObjectId, // ref: 'User'
      completedAt: Date
    }]
  },

  // Attachments and Links
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    mimeType: String,
    uploadedBy: ObjectId, // ref: 'User'
    uploadedAt: Date
  }],

  externalLinks: [{
    title: String,
    url: String,
    description: String,
    addedBy: ObjectId, // ref: 'User'
    addedAt: Date
  }],

  // Kanban Position
  position: Number, // position within column

  // Metadata
  isArchived: Boolean,
  archivedAt: Date,
  archivedBy: ObjectId, // ref: 'User'

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.tasks.createIndex({ assigneeId: 1, status: 1 })
db.tasks.createIndex({ sprintId: 1, status: 1 })
db.tasks.createIndex({ boardId: 1, columnId: 1, position: 1 })
db.tasks.createIndex({ dueDate: 1, status: 1 })
db.tasks.createIndex({ createdBy: 1, createdAt: -1 })
db.tasks.createIndex({ "tags.name": 1 })
db.tasks.createIndex({ priority: 1, status: 1 })
db.tasks.createIndex({ parentTaskId: 1 })
```

### 11. Task Comments Collection

```javascript
// task_comments
{
  _id: ObjectId,
  taskId: ObjectId, // ref: 'Task'

  // Comment Content
  content: String,
  commentType: String, // 'comment' | 'status_change' | 'assignment_change' | 'system'

  // Author Information
  authorId: ObjectId, // ref: 'User'

  // Comment Threading
  parentCommentId: ObjectId, // ref: 'TaskComment' (for threaded replies)
  mentions: [ObjectId], // refs: 'User' (mentioned users)

  // Attachments
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    mimeType: String
  }],

  // System Activity (for system-generated comments)
  systemActivity: {
    activityType: String, // 'status_change' | 'assignment' | 'due_date' | 'priority'
    oldValue: String,
    newValue: String,
    changedBy: ObjectId // ref: 'User'
  },

  // Metadata
  isEdited: Boolean,
  editedAt: Date,
  isDeleted: Boolean,
  deletedAt: Date,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.task_comments.createIndex({ taskId: 1, createdAt: -1 })
db.task_comments.createIndex({ authorId: 1, createdAt: -1 })
db.task_comments.createIndex({ parentCommentId: 1 })
db.task_comments.createIndex({ "mentions": 1 })
```

### 12. Boards Collection

```javascript
// boards
{
  _id: ObjectId,

  // Board Information
  name: String,
  description: String,
  boardType: String, // 'sprint' | 'team' | 'project' | 'personal'

  // Board Configuration
  columns: [{
    _id: ObjectId,
    name: String,
    description: String,
    color: String,
    position: Number,
    wipLimit: Number, // work in progress limit
    isDefault: Boolean,
    columnType: String // 'todo' | 'in_progress' | 'review' | 'done' | 'custom'
  }],

  // Access Control
  ownerId: ObjectId, // ref: 'User'
  members: [{
    userId: ObjectId, // ref: 'User'
    role: String, // 'viewer' | 'member' | 'admin'
    joinedAt: Date
  }],

  visibility: String, // 'private' | 'team' | 'public'

  // Association
  sprintId: ObjectId, // ref: 'Sprint' (optional)
  teamId: ObjectId, // ref: 'Team' (optional)

  // Board Settings
  settings: {
    allowMemberAdd: Boolean,
    allowTaskCreation: Boolean,
    autoArchiveCompleted: Boolean,
    autoArchiveDays: Number,
    enableTimeTracking: Boolean,
    enableDueDates: Boolean
  },

  // Metadata
  isTemplate: Boolean,
  templateCategory: String,
  isArchived: Boolean,
  archivedAt: Date,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.boards.createIndex({ ownerId: 1, isArchived: 1 })
db.boards.createIndex({ "members.userId": 1, visibility: 1 })
db.boards.createIndex({ sprintId: 1 })
db.boards.createIndex({ boardType: 1, isTemplate: 1 })
```

### 13. Tags Collection

```javascript
// tags
{
  _id: ObjectId,

  // Tag Information
  name: String, // unique within workspace
  description: String,
  color: String, // hex color code
  category: String, // 'priority' | 'type' | 'department' | 'custom'

  // Tag Configuration
  isGlobal: Boolean, // available across all boards
  isDefault: Boolean, // default tag for new tasks

  // Usage Tracking
  usageCount: Number,
  lastUsed: Date,

  // Access Control
  createdBy: ObjectId, // ref: 'User'
  boardIds: [ObjectId], // refs: 'Board' (boards where tag is available)

  // Metadata
  isActive: Boolean,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.tags.createIndex({ name: 1 }, { unique: true })
db.tags.createIndex({ category: 1, isActive: 1 })
db.tags.createIndex({ isGlobal: 1, isActive: 1 })
db.tags.createIndex({ createdBy: 1 })
db.tags.createIndex({ usageCount: -1 })
```

### 14. Teams Collection

```javascript
// teams
{
  _id: ObjectId,

  // Team Information
  name: String,
  description: String,
  department: String,

  // Team Members
  members: [{
    userId: ObjectId, // ref: 'User'
    role: String, // 'member' | 'lead' | 'admin'
    joinedAt: Date,
    isActive: Boolean
  }],

  // Team Lead
  teamLeadId: ObjectId, // ref: 'User'

  // Team Settings
  settings: {
    allowMemberInvite: Boolean,
    defaultBoardVisibility: String, // 'team' | 'private'
    enableTimeTracking: Boolean,
    workingHours: {
      start: String, // "09:00"
      end: String, // "17:00"
      timezone: String
    }
  },

  // Team Metrics
  metrics: {
    totalTasks: Number,
    completedTasks: Number,
    averageTaskTime: Number, // in hours
    productivityScore: Number
  },

  // Metadata
  isActive: Boolean,
  createdBy: ObjectId, // ref: 'User'

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.teams.createIndex({ "members.userId": 1, "members.isActive": 1 })
db.teams.createIndex({ teamLeadId: 1 })
db.teams.createIndex({ department: 1, isActive: 1 })
db.teams.createIndex({ name: 1 })
```

### 15. Task Templates Collection

```javascript
// task_templates
{
  _id: ObjectId,

  // Template Information
  name: String,
  description: String,
  category: String, // 'development' | 'design' | 'research' | 'testing'

  // Template Configuration
  template: {
    title: String,
    description: String,
    taskType: String,
    priority: String,
    estimatedHours: Number,
    tags: [String],
    checklistItems: [{
      text: String,
      isRequired: Boolean
    }],
    requiredFields: [String] // fields that must be filled when using template
  },

  // Usage and Sharing
  isGlobal: Boolean, // available to all users
  isPublic: Boolean, // visible in template gallery
  usageCount: Number,

  // Access Control
  createdBy: ObjectId, // ref: 'User'
  teamId: ObjectId, // ref: 'Team' (optional)

  // Metadata
  isActive: Boolean,
  lastUsed: Date,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.task_templates.createIndex({ category: 1, isActive: 1 })
db.task_templates.createIndex({ createdBy: 1, isActive: 1 })
db.task_templates.createIndex({ isGlobal: 1, isPublic: 1 })
db.task_templates.createIndex({ usageCount: -1 })
```

### 16. System Settings Collection

```javascript
// system_settings
{
  _id: ObjectId,

  // Setting Information
  key: String, // unique identifier
  value: Mixed, // can be String, Number, Boolean, Object, Array
  category: String, // 'email' | 'sms' | 'integrations' | 'limits'

  // Metadata
  description: String,
  isEditable: Boolean,
  validationType: String, // 'string' | 'number' | 'boolean' | 'email' | 'url'
  validationRules: Object,

  // Change Tracking
  lastModifiedBy: ObjectId, // ref: 'User'
  lastModifiedAt: Date,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.system_settings.createIndex({ key: 1 }, { unique: true })
db.system_settings.createIndex({ category: 1 })
```

## Relationships and Data Integrity

### Primary Relationships

1. **User → Questionnaire**: One-to-many (user can have multiple questionnaires)
2. **Questionnaire → Sprint**: One-to-one (each questionnaire leads to one sprint)
3. **Sprint → Documents**: One-to-many (sprint can have multiple documents)
4. **Sprint → Conversation**: One-to-one (each sprint has one conversation)
5. **Conversation → Messages**: One-to-many (conversation contains multiple messages)
6. **User → Notifications**: One-to-many (user receives multiple notifications)

### Referential Integrity

- Use Mongoose populate for referenced relationships
- Implement cascade delete for dependent documents
- Use MongoDB transactions for multi-document operations
- Implement soft deletes for critical data (users, sprints)

### Data Validation Rules

- Email format validation with regex
- Phone number format validation
- File size and type restrictions
- Enum validation for status fields
- Required field validation
- Custom validation for business rules

## Performance Optimization

### Indexing Strategy

- **Compound Indexes**: For frequently queried field combinations
- **Sparse Indexes**: For optional fields (phone, googleId)
- **TTL Indexes**: For temporary data (verification codes, sessions)
- **Text Indexes**: For search functionality

### Query Optimization

- Use projection to limit returned fields
- Implement pagination for large result sets
- Use aggregation pipeline for complex queries
- Cache frequently accessed data in Redis

### Scaling Considerations

- Shard on userId for user-specific collections
- Use read replicas for read-heavy operations
- Implement connection pooling
- Monitor slow queries and optimize indexes
