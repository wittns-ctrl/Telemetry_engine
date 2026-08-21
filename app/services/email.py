import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from app.core.config import settings


class EmailService:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_from_email = settings.SMTP_FROM_EMAIL
        self.use_tls = settings.SMTP_USE_TLS
    
    def is_configured(self) -> bool:
        """Check if email service is properly configured."""
        return all([
            self.smtp_host,
            self.smtp_username,
            self.smtp_password,
            self.smtp_from_email
        ])
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email."""
        if not self.is_configured():
            # Log warning but don't fail in development
            print(f"Email service not configured. Would send to: {to_email}")
            return False
        
        try:
            message = MIMEMultipart("alternative")
            message["From"] = self.smtp_from_email
            message["To"] = to_email
            message["Subject"] = subject
            
            if text_content:
                message.attach(MIMEText(text_content, "plain"))
            message.attach(MIMEText(html_content, "html"))
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(message)
            
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False
    
    async def send_verification_email(
        self,
        to_email: str,
        verification_url: str,
        user_name: Optional[str] = None
    ) -> bool:
        """Send email verification email."""
        subject = "Verify Your Email Address"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #003D30 0%, #004d3f 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Lectio</h1>
                    <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0;">Hardware Diagnostics Platform</p>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #003D30; margin-top: 0;">Verify Your Email Address</h2>
                    <p>Hello{f' {user_name}' if user_name else ''},</p>
                    <p>Thank you for registering with Lectio. Please verify your email address by clicking the button below:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{verification_url}" style="display: inline-block; background: #003D30; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email</a>
                    </div>
                    <p style="font-size: 14px; color: #666;">This link will expire in 24 hours.</p>
                    <p style="font-size: 14px; color: #666;">If you didn't create an account with Lectio, please ignore this email.</p>
                </div>
                <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                    <p>&copy; 2024 Lectio. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Verify Your Email Address
        
        Hello{f' {user_name}' if user_name else ''},
        
        Thank you for registering with Lectio. Please verify your email address by visiting:
        {verification_url}
        
        This link will expire in 24 hours.
        
        If you didn't create an account with Lectio, please ignore this email.
        """
        
        return await self.send_email(to_email, subject, html_content, text_content)
    
    async def send_password_reset_email(
        self,
        to_email: str,
        reset_url: str,
        user_name: Optional[str] = None
    ) -> bool:
        """Send password reset email."""
        subject = "Reset Your Password"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #003D30 0%, #004d3f 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Lectio</h1>
                    <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0;">Hardware Diagnostics Platform</p>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #003D30; margin-top: 0;">Reset Your Password</h2>
                    <p>Hello{f' {user_name}' if user_name else ''},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_url}" style="display: inline-block; background: #003D30; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                    </div>
                    <p style="font-size: 14px; color: #666;">This link will expire in 15 minutes.</p>
                    <p style="font-size: 14px; color: #666;">If you didn't request a password reset, please ignore this email.</p>
                </div>
                <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                    <p>&copy; 2024 Lectio. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Reset Your Password
        
        Hello{f' {user_name}' if user_name else ''},
        
        We received a request to reset your password. Visit the following link to create a new password:
        {reset_url}
        
        This link will expire in 15 minutes.
        
        If you didn't request a password reset, please ignore this email.
        """
        
        return await self.send_email(to_email, subject, html_content, text_content)


# Global email service instance
email_service = EmailService()
