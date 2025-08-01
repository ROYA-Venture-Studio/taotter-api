const { EmailClient, EmailMessage } = require('@azure/communication-email');
const logger = require('./logger');

// Azure Communication Services setup
let acsEmailClient = null;
if (process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING) {
  acsEmailClient = new EmailClient(process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING);
  console.log(acsEmailClient)
}
const emailTemplates = {
  signupSuccess: {
    subject: 'Welcome to Taotter!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Welcome to Taotter, {{name}}!</h1>
        <p>Thank you for signing up. Get started by visiting your dashboard:</p>
        <a href="{{dashboardUrl}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
        <p style="margin-top: 30px; color: #6b7280;">Best regards,<br>The Taotter Team</p>
      </div>
    `
  },
  sprintAssigned: {
    subject: 'Choose Your Sprint on Taotter',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Sprints Ready for You!</h1>
        <p>Hi {{name}},</p>
        <p>The admin has reviewed your project and assigned sprints for you to choose from. Log in to your dashboard to review and select your sprint.</p>
        <a href="{{dashboardUrl}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Sprints</a>
        <p style="margin-top: 30px; color: #6b7280;">Best regards,<br>The Taotter Team</p>
      </div>
    `
  },
  paymentConfirmed: {
    subject: 'Payment Confirmed for Your Sprint',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Payment Confirmed!</h1>
        <p>Hi {{name}},</p>
        <p>Your payment for the sprint <strong>{{sprintName}}</strong> has been confirmed. Our team will reach out with next steps soon.</p>
        <a href="{{dashboardUrl}}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
        <p style="margin-top: 30px; color: #6b7280;">Best regards,<br>The Taotter Team</p>
      </div>
    `
  }
};


const replaceTemplateVariables = (template, data) => {
  let result = template;
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, data[key] || '');
  });
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{#${key}}}([\\s\\S]*?){{/${key}}}`, 'g');
    if (data[key]) {
      result = result.replace(regex, '$1');
    } else {
      result = result.replace(regex, '');
    }
  });
  return result;
};

const sendEmail = async (options) => {
  if (!acsEmailClient) {
    logger.warn('Azure Communication Services not configured, skipping email send');
    return { success: false, reason: 'ACS not configured' };
  }
  const { to, subject, template, data = {}, html } = options;
  let emailHtml = html;
  let emailSubject = subject;

  if (template && emailTemplates[template]) {
    emailHtml = replaceTemplateVariables(emailTemplates[template].html, data);
    emailSubject = replaceTemplateVariables(emailTemplates[template].subject, data);
  }

  const message = {
    senderAddress: process.env.AZURE_COMMUNICATION_SERVICE_FROM_EMAIL,
    content: {
      subject: emailSubject,
      html: emailHtml
    },
    recipients: {
      to: [{ address: to, displayName: data.name || process.env.AZURE_COMMUNICATION_SERVICE_FROM_NAME }]
    }
  };

  try {
    const poller = await acsEmailClient.beginSend(message);
    const result = await poller.pollUntilDone();
    logger.info(`ACS Email sent to ${to}: ${result.id}`);
    return { success: true, messageId: result.id };
  } catch (error) {
    logger.logError(error, 'ACS Email Send');
    throw new Error(`Failed to send email: ${error.message}`);
  }
};


module.exports = {
  sendEmail,
  emailTemplates,
  replaceTemplateVariables
};
