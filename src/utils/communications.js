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
    subject: 'Welcome to Leansprintr!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); padding: 32px;">
        <h1 style="color: #EB5E28; font-size: 28px; margin-bottom: 16px;">Welcome to Leansprintr, {{name}}!</h1>
        <p style="font-size: 17px; color: #222; margin-bottom: 18px;">
          Thank you for signing up with Leansprintr. Your request has been received by our admin team.
        </p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">
          Next step: log in to your account and schedule a meeting with the Leansprintr team. We're excited to help you accelerate your startup journey!        </p>
          <a href="https://leansprintr.com/startup/login" style="background-color: #EB5E28; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block; margin-bottom: 32px;">Login to Leansprintr</a>
        <div style="margin-top: 40px; text-align: center;">
          <img src="https://taotterimgs.blob.core.windows.net/taotterimgs/leansprintr.png" alt="Leansprintr Logo" style="width: 120px; margin-top: 24px;" />
        </div>
        <p style="margin-top: 30px; color: #6b7280; font-size: 15px;">Best regards,<br>The Leansprintr Team</p>
      </div>
    `
  },
  sprintAssigned: {
    subject: 'Your Sprints Are Ready on Leansprintr!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); padding: 32px;">
        <h1 style="color: #EB5E28; font-size: 26px; margin-bottom: 16px;">Your Sprints Are Ready on Leansprintr!</h1>
        <p style="font-size: 17px; color: #222; margin-bottom: 18px;">Hi {{name}},</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">Great news! 🚀 Our admin team has reviewed your request and assigned sprints for you.</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">Please log in to your account to choose your preferred sprint and complete your payment to get started.</p>
        <a href="https://leansprintr.com/startup/login" style="background-color: #EB5E28; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block; margin-bottom: 32px;">Choose Your Sprint</a>
        <div style="margin-top: 40px; text-align: center;">
          <img src="https://taotterimgs.blob.core.windows.net/taotterimgs/leansprintr.png" alt="Leansprintr Logo" style="width: 120px; margin-top: 24px;" />
        </div>
        <p style="margin-top: 30px; color: #6b7280; font-size: 15px;">Best regards,<br>The Leansprintr Team</p>
      </div>
    `
  },
  paymentConfirmed: {
    subject: 'Payment Confirmed! Your Sprint Awaits',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); padding: 32px;">
        <h1 style="color: #EB5E28; font-size: 26px; margin-bottom: 16px;">Payment Confirmed! Your Sprint Awaits</h1>
        <p style="font-size: 17px; color: #222; margin-bottom: 18px;">Hi {{name}},</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">Thank you for your payment! 🚀</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">You now have access to your dashboard, where you can view your sprint.</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">Once the admin adds tasks to your sprint, you’ll be able to track progress and collaborate seamlessly with your team.</p>
        <a href="https://leansprintr.com/startup/dashboard" style="background-color: #EB5E28; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block; margin-bottom: 32px;">Go to Dashboard</a>
        <div style="margin-top: 40px; text-align: center;">
          <img src="https://taotterimgs.blob.core.windows.net/taotterimgs/leansprintr.png" alt="Leansprintr Logo" style="width: 120px; margin-top: 24px;" />
        </div>
        <p style="margin-top: 30px; color: #6b7280; font-size: 15px;">Best regards,<br>The Leansprintr Team</p>
      </div>
    `
  },
  'package-selected': {
    subject: 'You Selected: {{packageName}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); padding: 32px;">
        <h1 style="color: #EB5E28; font-size: 26px; margin-bottom: 16px;">You Selected: {{packageName}}</h1>
        <p style="font-size: 17px; color: #222; margin-bottom: 18px;">Hi {{fullName}}!</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">You've selected the package: <strong>{{packageName}}</strong> for your startup. Once your payment is confirmed, the next step is to get started on your sprint, so our team can help bring your idea to life.</p>
        <a href="https://leansprintr.com/startup/dashboard" style="background-color: #EB5E28; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block; margin-bottom: 32px;">Get Started</a>
        <div style="margin-top: 40px; text-align: center;">
          <img src="https://taotterimgs.blob.core.windows.net/taotterimgs/leansprintr.png" alt="Leansprintr Logo" style="width: 120px; margin-top: 24px;" />
        </div>
        <p style="margin-top: 30px; color: #6b7280; font-size: 15px;">Best regards,<br>The LeanSprintr Team</p>
      </div>
    `
  },
  tasksForReview: {
    subject: 'A Task Is Ready for Your Review ✅',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); padding: 32px;">
        <h1 style="color: #EB5E28; font-size: 26px; margin-bottom: 16px;">A Task Is Ready for Your Review ✅</h1>
        <p style="font-size: 17px; color: #222; margin-bottom: 18px;">Hi {{name}},</p>
        <p style="font-size: 16px; color: #444; margin-bottom: 24px;">One of your sprint tasks has been moved to the For Review column. Please log in to your Dashboard to review and provide feedback so we can keep things moving forward.</p>
        <a href="https://leansprintr.com/startup/dashboard" style="background-color: #EB5E28; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block; margin-bottom: 32px;">Review Sprint Task</a>
        <div style="margin-top: 40px; text-align: center;">
          <img src="https://taotterimgs.blob.core.windows.net/taotterimgs/leansprintr.png" alt="Leansprintr Logo" style="width: 120px; margin-top: 24px;" />
        </div>
        <p style="margin-top: 30px; color: #6b7280; font-size: 15px;">Best regards,<br>The LeanSprintr team</p>
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
    // return { success: false, reason: 'Email sending is temporarily disabled' };

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
