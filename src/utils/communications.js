// const sgMail = require('@sendgrid/mail');
// const twilio = require('twilio');
// const logger = require('./logger');

// // Initialize SendGrid
// if (process.env.SENDGRID_API_KEY) {
//   sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// }

// // // Initialize Twilio
// // let twilioClient = null;
// // if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
// //   twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// // }

// // Email templates
// const emailTemplates = {
//   welcome: {
//     subject: 'Welcome to Taotter Platform',
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h1 style="color: #3b82f6;">Welcome to Taotter, {{name}}!</h1>
//         <p>Thank you for joining our platform. We're excited to help you bring your startup vision to life.</p>
//         <p>Get started by:</p>
//         <ul>
//           <li>Completing your profile</li>
//           <li>Filling out our questionnaire</li>
//           <li>Connecting with our expert team</li>
//         </ul>
//         <a href="{{dashboardUrl}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
//         <p style="margin-top: 30px; color: #6b7280;">
//           Best regards,<br>
//           The Taotter Team
//         </p>
//       </div>
//     `
//   },

//   passwordReset: {
//     subject: 'Password Reset Request',
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h1 style="color: #3b82f6;">Password Reset Request</h1>
//         <p>Hi {{name}},</p>
//         <p>We received a request to reset your password for your Taotter account.</p>
//         <p>Click the button below to reset your password. This link will expire in {{expiresIn}}.</p>
//         <a href="{{resetURL}}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
//         <p style="margin-top: 20px;">If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
//         <p style="margin-top: 30px; color: #6b7280;">
//           Best regards,<br>
//           The Taotter Team
//         </p>
//       </div>
//     `
//   },

//   emailVerification: {
//     subject: 'Verify Your Email Address',
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h1 style="color: #3b82f6;">Verify Your Email Address</h1>
//         <p>Hi {{name}},</p>
//         <p>Please verify your email address by clicking the button below:</p>
//         <a href="{{verificationURL}}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a>
//         <p style="margin-top: 20px;">If you didn't create an account with us, please ignore this email.</p>
//         <p style="margin-top: 30px; color: #6b7280;">
//           Best regards,<br>
//           The Taotter Team
//         </p>
//       </div>
//     `
//   },

//   questionnaireSubmitted: {
//     subject: 'Questionnaire Submitted Successfully',
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h1 style="color: #3b82f6;">Questionnaire Submitted!</h1>
//         <p>Hi {{name}},</p>
//         <p>Thank you for submitting your questionnaire for <strong>{{startupName}}</strong>.</p>
//         <p>Our team will review your submission and get back to you within 24-48 hours with next steps.</p>
//         <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
//           <h3 style="margin-top: 0;">Submission Summary:</h3>
//           <p><strong>Task Type:</strong> {{taskType}}</p>
//           <p><strong>Budget Range:</strong> {{budgetRange}}</p>
//           <p><strong>Timeline:</strong> {{timeline}}</p>
//         </div>
//         <a href="{{dashboardUrl}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard</a>
//         <p style="margin-top: 30px; color: #6b7280;">
//           Best regards,<br>
//           The Taotter Team
//         </p>
//       </div>
//     `
//   },

//   questionnaireApproved: {
//     subject: 'Your Project Has Been Approved!',
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h1 style="color: #10b981;">Project Approved! 🎉</h1>
//         <p>Hi {{name}},</p>
//         <p>Great news! Your project <strong>{{startupName}}</strong> has been approved and we're ready to get started.</p>
//         {{#adminNotes}}
//         <div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
//           <h4 style="margin-top: 0; color: #047857;">Notes from our team:</h4>
//           <p style="margin-bottom: 0;">{{adminNotes}}</p>
//         </div>
//         {{/adminNotes}}
//         <p>Next steps:</p>
//         <ol>
//           <li>Schedule a kickoff call with your assigned expert</li>
//           <li>Review and sign the project agreement</li>
//           <li>Begin your exciting journey with Taotter!</li>
//         </ol>
//         <a href="{{dashboardUrl}}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Get Started</a>
//         <p style="margin-top: 30px; color: #6b7280;">
//           Best regards,<br>
//           The Taotter Team
//         </p>
//       </div>
//     `
//   },

//   sprintUpdate: {
//     subject: 'Sprint Update: {{sprintName}}',
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h1 style="color: #3b82f6;">Sprint Update</h1>
//         <p>Hi {{name}},</p>
//         <p>Here's an update on your sprint: <strong>{{sprintName}}</strong></p>
//         <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
//           <h3 style="margin-top: 0;">Progress Summary:</h3>
//           <p><strong>Status:</strong> {{status}}</p>
//           <p><strong>Completion:</strong> {{progress}}%</p>
//           <p><strong>Due Date:</strong> {{dueDate}}</p>
//         </div>
//         {{#updates}}
//         <div style="margin: 15px 0;">
//           <h4 style="color: #374151;">{{title}}</h4>
//           <p>{{description}}</p>
//         </div>
//         {{/updates}}
//         <a href="{{sprintUrl}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Sprint</a>
//         <p style="margin-top: 30px; color: #6b7280;">
//           Best regards,<br>
//           The Taotter Team
//         </p>
//       </div>
//     `
//   }
// };

// // Helper function to replace template variables
// const replaceTemplateVariables = (template, data) => {
//   let result = template;
  
//   // Replace simple variables {{variable}}
//   Object.keys(data).forEach(key => {
//     const regex = new RegExp(`{{${key}}}`, 'g');
//     result = result.replace(regex, data[key] || '');
//   });
  
//   // Handle conditional blocks {{#variable}}...{{/variable}}
//   Object.keys(data).forEach(key => {
//     const regex = new RegExp(`{{#${key}}}([\\s\\S]*?){{/${key}}}`, 'g');
//     if (data[key]) {
//       result = result.replace(regex, '$1');
//     } else {
//       result = result.replace(regex, '');
//     }
//   });
  
//   return result;
// };

// // Send email function
// const sendEmail = async (options) => {
//   try {
//     if (!process.env.SENDGRID_API_KEY) {
//       logger.warn('SendGrid not configured, skipping email send');
//       return { success: false, reason: 'SendGrid not configured' };
//     }

//     const { to, subject, template, data = {}, html, text } = options;

//     let emailHtml = html;
//     let emailSubject = subject;

//     // Use template if provided
//     if (template && emailTemplates[template]) {
//       emailHtml = replaceTemplateVariables(emailTemplates[template].html, data);
//       emailSubject = replaceTemplateVariables(emailTemplates[template].subject, data);
//     }

//     const msg = {
//       to,
//       from: {
//         email: process.env.SENDGRID_FROM_EMAIL || 'noreply@taotter.com',
//         name: process.env.SENDGRID_FROM_NAME || 'Taotter Platform'
//       },
//       subject: emailSubject,
//       html: emailHtml,
//       ...(text && { text })
//     };

//     const result = await sgMail.send(msg);
    
//     logger.info(`Email sent successfully to ${to}`);
//     return { success: true, messageId: result[0].headers['x-message-id'] };

//   } catch (error) {
//     logger.logError(error, 'Email Send');
//     throw new Error(`Failed to send email: ${error.message}`);
//   }
// };

// // Send SMS function
// const sendSMS = async (phoneNumber, message) => {
//   try {
//     if (!twilioClient) {
//       logger.warn('Twilio not configured, skipping SMS send');
//       return { success: false, reason: 'Twilio not configured' };
//     }

//     if (!process.env.TWILIO_PHONE_NUMBER) {
//       throw new Error('Twilio phone number not configured');
//     }

//     const result = await twilioClient.messages.create({
//       body: message,
//       from: process.env.TWILIO_PHONE_NUMBER,
//       to: phoneNumber
//     });

//     logger.info(`SMS sent successfully to ${phoneNumber}`);
//     return { success: true, sid: result.sid };

//   } catch (error) {
//     logger.logError(error, 'SMS Send');
//     throw new Error(`Failed to send SMS: ${error.message}`);
//   }
// };

// // Send notification (email + SMS)
// const sendNotification = async (options) => {
//   const { user, type, data = {}, channels = ['email'] } = options;
  
//   const results = {};

//   // Send email notification
//   if (channels.includes('email') && user.profile?.preferences?.notifications?.email !== false) {
//     try {
//       results.email = await sendEmail({
//         to: user.email,
//         template: type,
//         data: {
//           name: user.profile.firstName,
//           ...data
//         }
//       });
//     } catch (error) {
//       results.email = { success: false, error: error.message };
//     }
//   }

//   // Send SMS notification
//   if (channels.includes('sms') && user.phone && user.profile?.preferences?.notifications?.sms !== false) {
//     try {
//       const smsMessage = generateSMSMessage(type, data);
//       results.sms = await sendSMS(user.phone, smsMessage);
//     } catch (error) {
//       results.sms = { success: false, error: error.message };
//     }
//   }

//   return results;
// };

// // Generate SMS message based on notification type
// const generateSMSMessage = (type, data) => {
//   const messages = {
//     welcome: `Welcome to Taotter, ${data.name}! Your account has been created successfully.`,
//     questionnaireSubmitted: `Your questionnaire for ${data.startupName} has been submitted. We'll review it within 24-48 hours.`,
//     questionnaireApproved: `Great news! Your project ${data.startupName} has been approved. Check your email for next steps.`,
//     sprintUpdate: `Sprint update for ${data.sprintName}: ${data.status}. Progress: ${data.progress}%.`,
//     taskAssigned: `New task assigned: ${data.taskTitle}. Due: ${data.dueDate}.`,
//     reminderDue: `Reminder: Task "${data.taskTitle}" is due ${data.dueDate}.`
//   };

//   return messages[type] || `You have a new notification from Taotter. Check your dashboard for details.`;
// };

// // Send bulk emails
// const sendBulkEmail = async (recipients, template, data = {}) => {
//   try {
//     if (!process.env.SENDGRID_API_KEY) {
//       throw new Error('SendGrid not configured');
//     }

//     const messages = recipients.map(recipient => {
//       const personalizedData = { ...data, ...recipient.data };
//       const emailHtml = replaceTemplateVariables(emailTemplates[template].html, personalizedData);
//       const emailSubject = replaceTemplateVariables(emailTemplates[template].subject, personalizedData);

//       return {
//         to: recipient.email,
//         from: {
//           email: process.env.SENDGRID_FROM_EMAIL || 'noreply@taotter.com',
//           name: process.env.SENDGRID_FROM_NAME || 'Taotter Platform'
//         },
//         subject: emailSubject,
//         html: emailHtml
//       };
//     });

//     const result = await sgMail.send(messages);
    
//     logger.info(`Bulk email sent successfully to ${recipients.length} recipients`);
//     return { success: true, sent: recipients.length };

//   } catch (error) {
//     logger.logError(error, 'Bulk Email Send');
//     throw new Error(`Failed to send bulk email: ${error.message}`);
//   }
// };

// // Email verification utilities
// const sendVerificationEmail = async (user, verificationToken) => {
//   const verificationURL = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
//   return sendEmail({
//     to: user.email,
//     template: 'emailVerification',
//     data: {
//       name: user.profile.firstName,
//       verificationURL
//     }
//   });
// };

// // Admin notification utilities
// const notifyAdmins = async (subject, message, data = {}) => {
//   try {
//     const User = require('../models/User');
//     const admins = await User.find({ 
//       role: { $in: ['admin', 'super_admin'] },
//       status: 'active'
//     }).select('email profile.firstName');

//     const adminEmails = admins.map(admin => ({
//       email: admin.email,
//       data: {
//         name: admin.profile.firstName,
//         ...data
//       }
//     }));

//     if (adminEmails.length > 0) {
//       await sendBulkEmail(adminEmails, 'adminNotification', {
//         subject,
//         message,
//         ...data
//       });
//     }

//     return { success: true, notified: adminEmails.length };
//   } catch (error) {
//     logger.logError(error, 'Admin Notification');
//     throw error;
//   }
// };

// module.exports = {
//   sendEmail,
//   sendSMS,
//   sendNotification,
//   sendBulkEmail,
//   sendVerificationEmail,
//   notifyAdmins,
//   emailTemplates
// };
