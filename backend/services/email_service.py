"""Email service for authentication emails (password reset, email verification)"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from datetime import datetime, timedelta
import secrets
import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending authentication-related emails"""
    
    def __init__(self):
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.from_email = os.getenv('SMTP_FROM_EMAIL', 'noreply@repo-deployer.local')
        self.from_name = os.getenv('SMTP_FROM_NAME', 'Repo Deployer')
        self.frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        self.enabled = bool(self.smtp_user and self.smtp_password)
    
    def send_password_reset_email(
        self,
        to_email: str,
        user_name: str,
        reset_token: str
    ) -> bool:
        """Send password reset email"""
        if not self.enabled:
            logger.warning("Email service not configured - skipping password reset email")
            return True  # Don't fail, just skip
        
        reset_url = f"{self.frontend_url}/reset-password?token={reset_token}"
        
        subject = "Password Reset Request - Repo Deployer"
        
        html_content = f"""
        <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }}
                    .button {{ display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                    .footer {{ font-size: 12px; color: #666; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }}
                    .warning {{ color: #d9534f; font-weight: bold; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Password Reset Request</h1>
                    </div>
                    <div class="content">
                        <p>Hi {user_name},</p>
                        <p>We received a request to reset your password. Click the button below to set a new password:</p>
                        <a href="{reset_url}" class="button">Reset Password</a>
                        <p>Or copy this link in your browser: <br><small>{reset_url}</small></p>
                        <p class="warning">⚠️ This link will expire in 24 hours.</p>
                        <p>If you didn't request this, you can safely ignore this email.</p>
                        <div class="footer">
                            <p>Repo Deployer Team</p>
                            <p><small>Do not share this email with anyone.</small></p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
        """
        
        text_content = f"""
        Password Reset Request
        
        Hi {user_name},
        
        We received a request to reset your password. Click the link below to set a new password:
        
        {reset_url}
        
        ⚠️ This link will expire in 24 hours.
        
        If you didn't request this, you can safely ignore this email.
        
        Repo Deployer Team
        """
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_email_verification(
        self,
        to_email: str,
        user_name: str,
        verification_token: str
    ) -> bool:
        """Send email verification email"""
        if not self.enabled:
            logger.warning("Email service not configured - skipping email verification")
            return True  # Don't fail, just skip
        
        verify_url = f"{self.frontend_url}/verify-email?token={verification_token}"
        
        subject = "Verify Your Email - Repo Deployer"
        
        html_content = f"""
        <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }}
                    .button {{ display: inline-block; background: #5cb85c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                    .footer {{ font-size: 12px; color: #666; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Verify Your Email</h1>
                    </div>
                    <div class="content">
                        <p>Hi {user_name},</p>
                        <p>Welcome to Repo Deployer! Please verify your email address by clicking the button below:</p>
                        <a href="{verify_url}" class="button">Verify Email</a>
                        <p>Or copy this link: <br><small>{verify_url}</small></p>
                        <p><strong>This link will expire in 48 hours.</strong></p>
                        <p>If you didn't create this account, you can safely ignore this email.</p>
                        <div class="footer">
                            <p>Repo Deployer Team</p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
        """
        
        text_content = f"""
        Verify Your Email
        
        Hi {user_name},
        
        Welcome to Repo Deployer! Please verify your email address using this link:
        
        {verify_url}
        
        This link will expire in 48 hours.
        
        If you didn't create this account, you can safely ignore this email.
        
        Repo Deployer Team
        """
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_welcome_email(
        self,
        to_email: str,
        user_name: str,
        auth_provider: str = "local"
    ) -> bool:
        """Send welcome email after successful signup/OAuth"""
        if not self.enabled:
            logger.warning("Email service not configured - skipping welcome email")
            return True
        
        subject = "Welcome to Repo Deployer!"
        
        login_url = f"{self.frontend_url}/login"
        docs_url = f"{self.frontend_url}/docs"
        
        html_content = f"""
        <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }}
                    .button {{ display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }}
                    .features {{ list-style-type: none; padding: 0; }}
                    .features li {{ padding: 8px 0; }}
                    .features li:before {{ content: "✓ "; color: #5cb85c; font-weight: bold; margin-right: 8px; }}
                    .footer {{ font-size: 12px; color: #666; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Repo Deployer!</h1>
                    </div>
                    <div class="content">
                        <p>Hi {user_name},</p>
                        <p>Your account has been successfully created. Let's get started!</p>
                        
                        <h3>What You Can Do:</h3>
                        <ul class="features">
                            <li>Manage and organize repositories</li>
                            <li>Deploy applications with Docker</li>
                            <li>Track deployments and health status</li>
                            <li>Collaborate with your team</li>
                        </ul>
                        
                        <a href="{login_url}" class="button">Go to Dashboard</a>
                        <a href="{docs_url}" class="button" style="background: #666;">View Documentation</a>
                        
                        <p>If you have any questions, feel free to reach out to our support team.</p>
                        
                        <div class="footer">
                            <p>Repo Deployer Team</p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
        """
        
        text_content = f"""
        Welcome to Repo Deployer!
        
        Hi {user_name},
        
        Your account has been successfully created. Visit {login_url} to get started.
        
        Features available:
        - Manage and organize repositories
        - Deploy applications with Docker
        - Track deployments and health status
        - Collaborate with your team
        
        Repo Deployer Team
        """
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def _send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str
    ) -> bool:
        """Send email with both plain text and HTML versions"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Attach plain text first, then HTML (HTML is preferred by email clients)
            msg.attach(MIMEText(text_content, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email} - {subject}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False


def generate_token(length: int = 32) -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(length)
