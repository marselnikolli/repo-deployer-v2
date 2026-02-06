"""Notification service for managing in-app, email, and webhook notifications"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import Notification, NotificationType, NotificationChannel
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import os
import requests
from functools import lru_cache


class NotificationService:
    """Service for creating and managing notifications"""
    
    def __init__(self, db: Session):
        self.db = db
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_user = os.getenv('SMTP_USER')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.from_email = os.getenv('FROM_EMAIL', 'noreply@repo-deployer.local')
        
        # Webhook configs
        self.slack_webhook = os.getenv('SLACK_WEBHOOK_URL')
        self.discord_webhook = os.getenv('DISCORD_WEBHOOK_URL')
        self.telegram_token = os.getenv('TELEGRAM_BOT_TOKEN')
        self.telegram_chat_id = os.getenv('TELEGRAM_CHAT_ID')
    
    def create_notification(
        self,
        user_id: int,
        title: str,
        content: str,
        notification_type: NotificationType = NotificationType.INFO,
        channels: List[NotificationChannel] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> List[Notification]:
        """Create notifications for a user across multiple channels"""
        if channels is None:
            channels = [NotificationChannel.IN_APP]
        
        notifications = []
        for channel in channels:
            notification = Notification(
                user_id=user_id,
                type=notification_type,
                channel=channel,
                title=title,
                content=content,
                data=data,
                delivery_status='pending'
            )
            self.db.add(notification)
            notifications.append(notification)
        
        self.db.commit()
        
        # Send notifications asynchronously would be ideal, but for now send synchronously
        for notification in notifications:
            self._send_notification(notification)
        
        return notifications
    
    def _send_notification(self, notification: Notification) -> bool:
        """Send a notification through its configured channel"""
        try:
            if notification.channel == NotificationChannel.IN_APP:
                notification.delivery_status = 'delivered'
                notification.sent = True
                notification.sent_at = datetime.utcnow()
            
            elif notification.channel == NotificationChannel.EMAIL:
                # Email requires user email which we'd need to fetch from User model
                # For now, mark as pending
                self._send_email(notification)
            
            elif notification.channel == NotificationChannel.SLACK:
                self._send_slack(notification)
            
            elif notification.channel == NotificationChannel.DISCORD:
                self._send_discord(notification)
            
            elif notification.channel == NotificationChannel.TELEGRAM:
                self._send_telegram(notification)
            
            self.db.commit()
            return True
        
        except Exception as e:
            notification.delivery_status = 'failed'
            notification.delivery_error = str(e)
            self.db.commit()
            return False
    
    def _send_email(self, notification: Notification):
        """Send email notification"""
        if not all([self.smtp_user, self.smtp_password]):
            notification.delivery_status = 'failed'
            notification.delivery_error = 'SMTP credentials not configured'
            return
        
        try:
            # In production, fetch user email from User model
            # For now, this is a placeholder
            msg = MIMEMultipart('alternative')
            msg['Subject'] = notification.title
            msg['From'] = self.from_email
            msg['To'] = 'user@example.com'  # Would be dynamic
            
            text_part = MIMEText(notification.content, 'plain')
            html_part = MIMEText(f'<html><body><h2>{notification.title}</h2><p>{notification.content}</p></body></html>', 'html')
            
            msg.attach(text_part)
            msg.attach(html_part)
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            notification.delivery_status = 'sent'
            notification.sent = True
            notification.sent_at = datetime.utcnow()
        except Exception as e:
            notification.delivery_status = 'failed'
            notification.delivery_error = str(e)
    
    def _send_slack(self, notification: Notification):
        """Send Slack notification"""
        if not self.slack_webhook:
            notification.delivery_status = 'failed'
            notification.delivery_error = 'Slack webhook not configured'
            return
        
        try:
            payload = {
                'text': notification.title,
                'blocks': [
                    {
                        'type': 'header',
                        'text': {'type': 'plain_text', 'text': notification.title}
                    },
                    {
                        'type': 'section',
                        'text': {'type': 'mrkdwn', 'text': notification.content}
                    }
                ]
            }
            
            response = requests.post(self.slack_webhook, json=payload, timeout=5)
            
            if response.status_code == 200:
                notification.delivery_status = 'sent'
            else:
                notification.delivery_status = 'failed'
                notification.delivery_error = f'HTTP {response.status_code}'
            
            notification.sent = True
            notification.sent_at = datetime.utcnow()
        except Exception as e:
            notification.delivery_status = 'failed'
            notification.delivery_error = str(e)
    
    def _send_discord(self, notification: Notification):
        """Send Discord notification"""
        if not self.discord_webhook:
            notification.delivery_status = 'failed'
            notification.delivery_error = 'Discord webhook not configured'
            return
        
        try:
            # Color mapping based on notification type
            color_map = {
                NotificationType.SUCCESS: 0x2ecc71,
                NotificationType.ERROR: 0xe74c3c,
                NotificationType.WARNING: 0xf39c12,
                NotificationType.INFO: 0x3498db,
            }
            color = color_map.get(notification.type, 0x95a5a6)
            
            payload = {
                'embeds': [{
                    'title': notification.title,
                    'description': notification.content,
                    'color': color,
                    'timestamp': datetime.utcnow().isoformat()
                }]
            }
            
            response = requests.post(self.discord_webhook, json=payload, timeout=5)
            
            if response.status_code == 204:
                notification.delivery_status = 'sent'
            else:
                notification.delivery_status = 'failed'
                notification.delivery_error = f'HTTP {response.status_code}'
            
            notification.sent = True
            notification.sent_at = datetime.utcnow()
        except Exception as e:
            notification.delivery_status = 'failed'
            notification.delivery_error = str(e)
    
    def _send_telegram(self, notification: Notification):
        """Send Telegram notification"""
        if not all([self.telegram_token, self.telegram_chat_id]):
            notification.delivery_status = 'failed'
            notification.delivery_error = 'Telegram credentials not configured'
            return
        
        try:
            message = f"*{notification.title}*\n\n{notification.content}"
            url = f'https://api.telegram.org/bot{self.telegram_token}/sendMessage'
            payload = {
                'chat_id': self.telegram_chat_id,
                'text': message,
                'parse_mode': 'Markdown'
            }
            
            response = requests.post(url, json=payload, timeout=5)
            
            if response.status_code == 200:
                notification.delivery_status = 'sent'
            else:
                notification.delivery_status = 'failed'
                notification.delivery_error = f'HTTP {response.status_code}'
            
            notification.sent = True
            notification.sent_at = datetime.utcnow()
        except Exception as e:
            notification.delivery_status = 'failed'
            notification.delivery_error = str(e)
    
    def get_user_notifications(
        self,
        user_id: int,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0
    ) -> List[Notification]:
        """Get notifications for a user"""
        query = self.db.query(Notification).filter(Notification.user_id == user_id)
        
        if unread_only:
            query = query.filter(Notification.read == False)
        
        return query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()
    
    def get_notification(self, notification_id: int, user_id: int) -> Optional[Notification]:
        """Get a specific notification"""
        return self.db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
    
    def mark_as_read(self, notification_id: int, user_id: int) -> Optional[Notification]:
        """Mark notification as read"""
        notification = self.get_notification(notification_id, user_id)
        if notification:
            notification.read = True
            notification.updated_at = datetime.utcnow()
            self.db.commit()
        return notification
    
    def mark_all_as_read(self, user_id: int) -> int:
        """Mark all unread notifications as read"""
        updated = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.read == False
        ).update({'read': True, 'updated_at': datetime.utcnow()})
        self.db.commit()
        return updated
    
    def delete_notification(self, notification_id: int, user_id: int) -> bool:
        """Delete a notification"""
        notification = self.get_notification(notification_id, user_id)
        if notification:
            self.db.delete(notification)
            self.db.commit()
            return True
        return False
    
    def clear_notifications(self, user_id: int, days: int = 30) -> int:
        """Clear old read notifications"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        deleted = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.read == True,
            Notification.created_at < cutoff_date
        ).delete()
        self.db.commit()
        return deleted
    
    def get_notification_stats(self, user_id: int) -> Dict[str, Any]:
        """Get notification statistics for a user"""
        all_notifications = self.db.query(Notification).filter(
            Notification.user_id == user_id
        ).all()
        
        unread_count = sum(1 for n in all_notifications if not n.read)
        by_type = {}
        by_channel = {}
        by_status = {}
        
        for notification in all_notifications:
            by_type[notification.type] = by_type.get(notification.type, 0) + 1
            by_channel[notification.channel] = by_channel.get(notification.channel, 0) + 1
            by_status[notification.delivery_status] = by_status.get(notification.delivery_status, 0) + 1
        
        return {
            'total': len(all_notifications),
            'unread': unread_count,
            'by_type': by_type,
            'by_channel': by_channel,
            'by_delivery_status': by_status
        }
