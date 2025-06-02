# Taotter Platform - Functional Requirements

## Project Overview

Taotter is a platform that connects startups with service providers for various needs including MVP development, validation, branding, and other startup services. The platform facilitates client intake, admin processing, and ongoing project management.

## Technology Stack

- **Backend**: Node.js + Express + MongoDB
- **Frontend**: React.js + Redux Toolkit + RTK Query
- **Authentication**: SMS verification, Google OAuth
- **Integrations**: Calendly for scheduling
- **Architecture**: Decoupled frontend/backend

## Client-Side Features

### 1. Pre-Signup Flow

#### 1.1 Initial Questionnaire

**Purpose**: Capture basic startup information and task requirements
**Fields**:

- Startup name
- Task type (dropdown/selection)
- Task description (text area)
- Startup stage (dropdown)
- Key goals (text area)
- Time commitment (Full-Time/Part-Time radio buttons)

#### 1.2 Requirements & Budget

**Purpose**: Define project scope and financial parameters
**Fields**:

- Milestones/What they want from us (checkboxes: Build MVP, Validate, etc.)
- Timeline (dropdown/date picker)
- Budget range (dropdown/slider)

#### 1.3 Service Selection

**Purpose**: Choose from predefined services or submit custom request
**Options**:

- Sample service options (admin-configured)
- Custom request field (text area)

#### 1.4 Registration & Authentication

**Purpose**: Create user account and verify identity
**Features**:

- Google OAuth integration
- Mobile number + password signup
- SMS verification for mobile signup
- Forgot password functionality

### 2. Post-Signup Flow

#### 2.1 Start Your Sprint (Pending State)

**Purpose**: Inform user their request is being processed
**Features**:

- Processing status message
- Email notification sent to user
- Access to dashboard and profile during wait time

#### 2.2 Dashboard Access (Pre-Approval)

**Purpose**: Basic user portal during processing
**Features**:

- User profile management
- Request status viewing
- Basic navigation

#### 2.3 Start Your Sprint (Ready State)

**Purpose**: Present admin-created custom sprint options
**Features**:

- Display custom sprint options created by admin
- Sprint selection interface
- Sprint details and descriptions

#### 2.4 Document Upload

**Purpose**: Collect required documents and information
**Features**:

- Custom fields configured by admin
- File upload functionality
- Form validation
- Progress tracking

#### 2.5 Package Selection

**Purpose**: Choose pricing and engagement options
**Features**:

- Multiple package options
- Price comparison
- Engagement time details
- Feature comparison

#### 2.6 Calendly Scheduling

**Purpose**: Schedule meeting with Taotter team
**Features**:

- Calendly integration
- Available time slots
- Meeting confirmation
- Calendar sync

### 3. Post-Meeting & Payment Flow

#### 3.1 Active Sprints Dashboard

**Purpose**: Manage ongoing projects
**Features**:

- List of all active sprints
- Sprint progress tracking
- Sprint status indicators
- Quick actions per sprint

#### 3.2 Chat Feature

**Purpose**: Real-time communication with Taotter team
**Features**:

- Real-time messaging
- File sharing capabilities
- Message history
- Notification system
- Integration with sprint context

#### 3.3 Sprint Management

**Purpose**: Track and manage individual sprint progress
**Features**:

- Milestone tracking
- Deliverable management
- Progress indicators
- Communication per sprint

## User States and Permissions

### Client User States

1. **Unregistered**: Can access questionnaire and signup
2. **Registered (Pending)**: Can access basic dashboard, view processing status
3. **Approved**: Can select sprints, upload documents, choose packages
4. **Active**: Can access active sprints, chat, and full dashboard
5. **Completed**: Can view completed sprints and history

## Business Rules

### Request Processing

- All new requests start in "Pending" status
- Admin must approve and create custom sprint options
- Clients cannot proceed to sprint selection until admin approval
- Payment occurs off-platform after Calendly meeting

### Sprint Management

- Multiple active sprints per client allowed
- Each sprint has independent progress tracking
- Communication can be sprint-specific or general

### Authentication & Security

- SMS verification required for mobile signup
- Session management for logged-in users
- Secure file upload handling
- Data privacy compliance

## Integration Requirements

### Calendly Integration

- Embed Calendly widget for scheduling
- Sync meeting confirmations
- Handle meeting status updates

### SMS Service

- Phone number verification
- Password reset via SMS
- Optional notifications

### Email Service

- Welcome emails
- Status update notifications
- Meeting confirmations

## Future Considerations

- Admin panel for request management
- Advanced messaging features
- Payment processing integration
- Mobile application
- API for third-party integrations

## Admin-Side Features

### 1. Admin Authentication & Access

#### 1.1 Admin Registration

**Purpose**: Create admin accounts with appropriate permissions
**Fields**:

- Email address
- Password (strong requirements)
- First name and last name
- Role selection (admin, super_admin)
- Department/Team assignment
- Admin approval required for activation

#### 1.2 Admin Login

**Purpose**: Secure access to admin panel
**Features**:

- Email and password authentication
- Two-factor authentication (optional)
- Session management
- Role-based access control
- Admin-specific JWT tokens

### 2. Client Management

#### 2.1 View Client Questionnaires

**Purpose**: Review and process client submissions
**Features**:

- List view of all questionnaires with filters
- Detailed view of questionnaire responses
- Status management (pending, under review, approved, rejected)
- Search functionality by client name, company, or keywords
- Export questionnaire data

#### 2.2 Sprint Customization

**Purpose**: Create tailored sprint options for each client
**Features**:

- Sprint builder interface
- Template selection from predefined options
- Custom sprint name and description
- Timeline and milestone configuration
- Team member assignment
- Deliverable specification
- Package pricing customization

#### 2.3 Dynamic Form Builder

**Purpose**: Configure required document fields per sprint
**Features**:

- Drag-and-drop form builder
- Field types: file upload, text input, textarea, dropdown, checkbox, radio
- Field validation rules (required, file types, size limits)
- Field descriptions and help text
- Conditional field logic
- Form preview functionality
- Template saving for reuse

### 3. Communication Management

#### 3.1 Admin Chat System

**Purpose**: Real-time communication with clients
**Features**:

- Unified inbox for all client conversations
- Sprint-specific chat channels
- File sharing capabilities
- Message threading and replies
- Internal admin notes (not visible to clients)
- Conversation assignment to team members
- Chat history and search
- Typing indicators and read receipts
- Automated responses and templates

#### 3.2 Internal Team Communication

**Purpose**: Admin-to-admin communication
**Features**:

- Private team channels
- Direct messaging between admins
- File and link sharing
- Integration with task management
- Notification system

### 4. Kanban Task Management System

#### 4.1 Task Board Overview

**Purpose**: Visual project management for all sprints and internal tasks
**Features**:

- Multiple board views (by sprint, by team, by priority)
- Customizable column configurations
- Board templates for different project types
- Board sharing and permissions
- Real-time collaboration

#### 4.2 Task Management

**Purpose**: Comprehensive task tracking and organization
**Features**:

- **Task Creation**:

  - Title and description
  - Task type (development, design, research, etc.)
  - Priority levels (low, medium, high, critical)
  - Due date and time estimation
  - Sprint/project association
  - Assignee selection

- **Task Organization**:

  - Drag-and-drop between columns
  - Bulk task operations
  - Task templates for common activities
  - Subtask creation and management
  - Task dependencies

- **Task Details**:
  - Detailed description with rich text editor
  - Attachment uploads
  - External links and references
  - Time tracking (logged hours)
  - Progress percentage

#### 4.3 Task Collaboration

**Purpose**: Enable team collaboration on individual tasks
**Features**:

- **Comments System**:

  - Threaded comments
  - @mentions for team members
  - Comment attachments
  - Comment editing and deletion
  - Comment notifications

- **Activity Timeline**:
  - Task creation and updates
  - Status changes
  - Assignee changes
  - Comment additions
  - File uploads

#### 4.4 Task Organization & Filtering

**Purpose**: Efficient task discovery and management
**Features**:

- **Tagging System**:

  - Custom tag creation
  - Color-coded tags
  - Tag-based filtering
  - Predefined tag templates (bug, feature, urgent, etc.)

- **Advanced Filtering**:

  - Filter by assignee
  - Filter by due date range
  - Filter by priority level
  - Filter by sprint/project
  - Filter by task status
  - Filter by tags
  - Saved filter presets

- **Search Functionality**:
  - Full-text search across tasks
  - Search in comments
  - Search in attachments
  - Advanced search operators

#### 4.5 Task Analytics & Reporting

**Purpose**: Track team performance and project progress
**Features**:

- Task completion rates
- Team productivity metrics
- Sprint burndown charts
- Time tracking reports
- Bottleneck identification
- Custom report generation

### 5. Dashboard & Analytics

#### 5.1 Admin Dashboard

**Purpose**: Overview of platform activity and metrics
**Features**:

- Active sprints overview
- Pending questionnaires count
- Team workload distribution
- Recent activity feed
- Quick actions panel
- System health indicators

#### 5.2 Client Analytics

**Purpose**: Insights into client behavior and engagement
**Features**:

- Client acquisition metrics
- Questionnaire completion rates
- Sprint success rates
- Client satisfaction scores
- Revenue tracking
- Geographic distribution

### 6. System Administration

#### 6.1 User Management

**Purpose**: Manage admin accounts and permissions
**Features**:

- Admin user creation and editing
- Role and permission management
- Account activation/deactivation
- Password reset functionality
- Activity audit logs

#### 6.2 Platform Configuration

**Purpose**: System-wide settings and customization
**Features**:

- Email template management
- SMS template configuration
- Integration settings (Calendly, payment gateways)
- System notifications configuration
- Data backup and export tools
