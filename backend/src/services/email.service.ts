import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '587');
const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
const secure = process.env.SMTP_SECURE === 'true';

const transporter = (host && user && pass)
  ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    })
  : null;

/**
 * Send an invitation email containing the accept link to the target user.
 */
export async function sendInvitationEmail(to: string, inviteLink: string, orgName: string): Promise<boolean> {
  const from = process.env.SMTP_FROM || 
               (process.env.SMTP_FROM_EMAIL 
                 ? `"${process.env.SMTP_FROM_NAME || 'MyC Ops'}" <${process.env.SMTP_FROM_EMAIL}>` 
                 : undefined) || 
               `"MyC Ops" <no-reply@mycops.com>`;
  const subject = `You are invited to join ${orgName} on MyC Ops`;
  
  const text = `Hello,\n\nYou have been invited to join ${orgName} on MyC Ops.\n\nClick the link below to accept the invitation and set up your account:\n${inviteLink}\n\nThis link will expire in 7 days.\n\nBest regards,\nThe MyC Team`;
  
  const html = `
    <div style="background-color: #FAFAF7; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E4DC; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden;">
        
        <!-- Header Banner (Olive) -->
        <div style="background-color: #556B2F; padding: 32px 24px; text-align: center;">
          <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 32px; font-style: italic; color: #FFFFFF; margin: 0; font-weight: normal; letter-spacing: 0.5px;">MyC Operations</h1>
        </div>

        <!-- Content Area -->
        <div style="padding: 32px 32px 24px 32px; color: #1A1A1A;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #1A1A1A;">Workspace Invitation</h2>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 16px 0; color: #3D3D3D;">Hello,</p>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 28px 0; color: #3D3D3D;">You have been invited by an administrator to join the <strong>${orgName}</strong> workspace on the MyC Operations Platform.</p>
          
          <!-- Action Button -->
          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteLink}" style="background-color: #556B2F; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14.5px; font-weight: 600; display: inline-block;">Accept Invitation</a>
          </div>

          <p style="font-size: 12.5px; color: #6B6B6B; line-height: 1.5; margin: 24px 0 6px 0;">If the button above does not work, copy and paste this URL into your web browser:</p>
          <p style="font-size: 12.5px; color: #6B6B6B; word-break: break-all; margin: 0 0 24px 0;"><a href="${inviteLink}" style="color: #556B2F; text-decoration: underline;">${inviteLink}</a></p>
          
          <div style="border-top: 1px solid #E5E4DC; margin-top: 24px; padding-top: 16px; text-align: center;">
            <p style="font-size: 11.5px; color: #9C9C9C; margin: 0;">This invitation link will expire in 7 days.</p>
          </div>
        </div>

      </div>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      console.log(`[Email] Invitation email sent to ${to}`);
      return true;
    } catch (err) {
      console.error(`[Email] Failed to send invitation email to ${to}:`, err);
      throw err;
    }
  } else {
    console.warn(`\n=== EMAIL NOT SENT (SMTP NOT CONFIG) ===`);
    console.warn(`To: ${to}`);
    console.warn(`Invite Link: ${inviteLink}`);
    console.warn(`========================================\n`);
    return false;
  }
}

/**
 * Send an email notification confirming a password change.
 */
export async function sendPasswordChangedEmail(to: string, fullName: string): Promise<boolean> {
  const from = process.env.SMTP_FROM || 
               (process.env.SMTP_FROM_EMAIL 
                 ? `"${process.env.SMTP_FROM_NAME || 'MyC Ops'}" <${process.env.SMTP_FROM_EMAIL}>` 
                 : undefined) || 
               `"MyC Ops" <no-reply@mycops.com>`;
  const subject = `Your MyC Ops password has been changed`;
  
  const text = `Hello ${fullName},\n\nThis is a confirmation that the password for your MyC Ops account has been successfully changed.\n\nIf you did not initiate this change, please contact an administrator immediately.\n\nBest regards,\nThe MyC Team`;
  
  const html = `
    <div style="background-color: #FAFAF7; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E4DC; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden;">
        
        <!-- Header Banner (Olive) -->
        <div style="background-color: #556B2F; padding: 32px 24px; text-align: center;">
          <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 32px; font-style: italic; color: #FFFFFF; margin: 0; font-weight: normal; letter-spacing: 0.5px;">MyC Operations</h1>
        </div>

        <!-- Content Area -->
        <div style="padding: 32px 32px 24px 32px; color: #1A1A1A;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #1A1A1A;">Password Changed</h2>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 16px 0; color: #3D3D3D;">Hello ${fullName},</p>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 28px 0; color: #3D3D3D;">This is a confirmation that the password for your MyC Ops account has been successfully changed.</p>
          
          <div style="background-color: #F8F8F4; padding: 16px; border-left: 4px solid #556B2F; border-radius: 4px; margin-bottom: 24px;">
            <p style="font-size: 13.5px; color: #3D3D3D; margin: 0;"><strong>Security Notice:</strong> If you did not make this change, please contact your workspace administrator immediately to secure your account.</p>
          </div>
          
          <div style="border-top: 1px solid #E5E4DC; margin-top: 24px; padding-top: 16px; text-align: center;">
            <p style="font-size: 11.5px; color: #9C9C9C; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>

      </div>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      console.log(`[Email] Password changed email sent to ${to}`);
      return true;
    } catch (err) {
      console.error(`[Email] Failed to send password changed email to ${to}:`, err);
      return false;
    }
  } else {
    console.warn(`\n=== EMAIL NOT SENT (SMTP NOT CONFIG) ===`);
    console.warn(`To: ${to}`);
    console.warn(`Event: Password Changed`);
    console.warn(`========================================\n`);
    return false;
  }
}

/**
 * Send an email for an administrative push notification.
 */
export async function sendPushNotificationEmail(to: string, fullName: string, message: string): Promise<boolean> {
  const from = process.env.SMTP_FROM || 
               (process.env.SMTP_FROM_EMAIL 
                 ? `"${process.env.SMTP_FROM_NAME || 'MyC Ops'}" <${process.env.SMTP_FROM_EMAIL}>` 
                 : undefined) || 
               `"MyC Ops" <no-reply@mycops.com>`;
  const subject = `New Administrative Announcement from MyC Ops`;
  
  const text = `Hello ${fullName},\n\nYou have received a new announcement:\n\n"${message}"\n\nBest regards,\nThe MyC Team`;
  
  const html = `
    <div style="background-color: #FAFAF7; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E4DC; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden;">
        
        <!-- Header Banner (Olive) -->
        <div style="background-color: #556B2F; padding: 32px 24px; text-align: center;">
          <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 32px; font-style: italic; color: #FFFFFF; margin: 0; font-weight: normal; letter-spacing: 0.5px;">MyC Operations</h1>
        </div>

        <!-- Content Area -->
        <div style="padding: 32px 32px 24px 32px; color: #1A1A1A;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #1A1A1A;">New Announcement</h2>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 16px 0; color: #3D3D3D;">Hello ${fullName},</p>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 24px 0; color: #3D3D3D;">An administrator has posted a new update to your workspace:</p>
          
          <div style="background-color: #F8F8F4; padding: 20px; border-left: 4px solid #556B2F; border-radius: 4px; margin-bottom: 24px; font-size: 14.5px; line-height: 1.6; color: #1A1A1A; font-style: italic;">
            "${message}"
          </div>
          
          <div style="border-top: 1px solid #E5E4DC; margin-top: 24px; padding-top: 16px; text-align: center;">
            <p style="font-size: 11.5px; color: #9C9C9C; margin: 0;">This is an automated notification from MyC Ops. Please do not reply to this email.</p>
          </div>
        </div>

      </div>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      console.log(`[Email] Push notification email sent to ${to}`);
      return true;
    } catch (err) {
      console.error(`[Email] Failed to send push notification email to ${to}:`, err);
      return false;
    }
  } else {
    console.warn(`\n=== EMAIL NOT SENT (SMTP NOT CONFIG) ===`);
    console.warn(`To: ${to}`);
    console.warn(`Message: ${message}`);
    console.warn(`========================================\n`);
    return false;
  }
}

/**
 * Send an email for a task highlight from the standup board.
 */
export async function sendHighlightEmail(to: string, fullName: string, taskTitle: string, clientName: string, roleType: 'leader' | 'member'): Promise<boolean> {
  const from = process.env.SMTP_FROM || 
               (process.env.SMTP_FROM_EMAIL 
                 ? `"${process.env.SMTP_FROM_NAME || 'MyC Ops'}" <${process.env.SMTP_FROM_EMAIL}>` 
                 : undefined) || 
               `"MyC Ops" <no-reply@mycops.com>`;
  const subject = `ACTION REQUIRED: Task Highlighted - ${clientName}`;
  
  const text = `Hello ${fullName},\n\nA task has been highlighted on the Standup Board that requires your attention:\n\nTask: ${taskTitle}\nClient: ${clientName}\n\nAs the ${roleType === 'leader' ? 'Team Leader' : 'assigned Team Member'}, please review this item immediately.\n\nBest regards,\nThe MyC Team`;
  
  const html = `
    <div style="background-color: #FAFAF7; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E4DC; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden;">
        
        <div style="background-color: #D97706; padding: 32px 24px; text-align: center;">
          <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 32px; font-style: italic; color: #FFFFFF; margin: 0; font-weight: normal; letter-spacing: 0.5px;">Task Highlighted</h1>
        </div>

        <div style="padding: 32px 32px 24px 32px; color: #1A1A1A;">
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 16px 0; color: #3D3D3D;">Hello ${fullName},</p>
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 24px 0; color: #3D3D3D;">A task has been highlighted on the Standup Board that requires your attention as the ${roleType === 'leader' ? 'Team Leader' : 'assigned Team Member'}:</p>
          
          <div style="background-color: #FEF3C7; padding: 20px; border-left: 4px solid #D97706; border-radius: 4px; margin-bottom: 24px; font-size: 14.5px; line-height: 1.6; color: #92400E;">
            <strong>Client:</strong> ${clientName}<br/>
            <strong>Task:</strong> ${taskTitle}
          </div>
          
          <p style="font-size: 14.5px; line-height: 1.6; margin: 0 0 24px 0; color: #3D3D3D;">Please review this item on the dashboard immediately.</p>
          
          <div style="border-top: 1px solid #E5E4DC; margin-top: 24px; padding-top: 16px; text-align: center;">
            <p style="font-size: 11.5px; color: #9C9C9C; margin: 0;">This is an automated notification from MyC Ops. Please do not reply to this email.</p>
          </div>
        </div>

      </div>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({ from, to, subject, text, html });
      console.log(`[Email] Highlight email sent to ${to}`);
      return true;
    } catch (err) {
      console.error(`[Email] Failed to send highlight email to ${to}:`, err);
      return false;
    }
  } else {
    console.warn(`\n=== EMAIL NOT SENT (SMTP NOT CONFIG) ===`);
    console.warn(`To: ${to}`);
    console.warn(`Task: ${taskTitle}`);
    console.warn(`========================================\n`);
    return false;
  }
}
