import asyncio
import html
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SENDLIBERTY_URL = "https://sendliberty.com/api/send"
SEND_TIMEOUT_SECONDS = 15


class EmailService:
    """Sends Lectio's emails through SendLiberty (https://sendliberty.com), which
    delivers them from a Gmail or Google Workspace account connected there."""

    def __init__(self):
        self.api_key = settings.SENDLIBERTY_API_KEY
        self.from_email = settings.EMAIL_FROM

    def is_configured(self) -> bool:
        """True when a SendLiberty API key and a sender address are set."""
        return bool(self.api_key and self.from_email)

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send one email. Returns False (and logs why) instead of raising."""
        if not self.is_configured():
            logger.warning("Email not sent to %s: SENDLIBERTY_API_KEY or EMAIL_FROM is missing", to_email)
            return False

        payload = {"from": self.from_email, "to": to_email, "subject": subject, "html": html_content}
        if text_content:
            payload["text"] = text_content
        try:
            async with httpx.AsyncClient(timeout=SEND_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    SENDLIBERTY_URL, json=payload, headers={"Authorization": f"Bearer {self.api_key}"}
                )
        except httpx.HTTPError as e:
            logger.error("Email not sent to %s: couldn't reach SendLiberty (%s: %s)", to_email, type(e).__name__, e)
            return False

        if response.is_success:
            return True
        logger.error("Email not sent to %s: SendLiberty answered %s: %s%s", to_email, response.status_code,
                     _service_error(response), _hint(response))
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
    
    async def send_verification_code(self, to_email: str, code: str, user_name: Optional[str] = None) -> bool:
        """Email the 6-digit code that confirms the address belongs to the user."""
        subject = f"{code} is your Lectio code"
        hello = f"Hello {user_name}," if user_name else "Hello,"
        html_content = f"""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Lectio code</title></head>
        <body style="margin:0;background:#ebebed;font-family:Arial,sans-serif;color:#0e0e10;">
          <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
            <div style="background:#ffffff;border-radius:20px;padding:32px 28px;text-align:center;">
              <div style="font-size:20px;font-weight:700;">lectio</div>
              <h1 style="font-size:20px;margin:24px 0 8px;">Confirm your email</h1>
              <p style="color:#5f5f68;margin:0 0 24px;">{hello} enter this code in Lectio to confirm it's your email address.</p>
              <div style="font-size:34px;font-weight:700;letter-spacing:10px;background:#eaf5ec;color:#176b22;border-radius:14px;padding:16px 0;">{code}</div>
              <p style="color:#5f5f68;font-size:13px;margin:24px 0 0;">The code works for 10 minutes. If you didn't sign up for Lectio, ignore this email.</p>
            </div>
          </div>
        </body></html>
        """
        text_content = (
            f"{hello}\n\nYour Lectio code is {code}\n\nEnter it in Lectio to confirm your email address. "
            "It works for 10 minutes.\n\nIf you didn't sign up for Lectio, ignore this email.\n"
        )
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

    async def send_alert_email(
        self,
        to_email: str,
        user_name: Optional[str],
        device_name: str,
        severity: str,
        message: str,
        created_at: str,
        dashboard_url: str,
    ) -> bool:
        """Tell a user that one of their devices raised an alert."""
        # Device names and alert text can contain anything, so escape them for the HTML part.
        e = html.escape
        label = "Critical" if severity == "CRITICAL" else "Warning" if severity == "WARNING" else "Notice"
        colour = "#c70036" if severity == "CRITICAL" else "#b45309" if severity == "WARNING" else "#176b22"
        subject = f"{label}: {device_name} - {message}"[:150]
        greeting = f" {e(user_name)}" if user_name else ""

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{e(label)} on {e(device_name)}</title></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #0e0e10; padding: 24px 30px; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">Lectio</h1>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <p style="margin-top: 0;">Hello{greeting},</p>
                    <p>Your PC <strong>{e(device_name)}</strong> needs attention:</p>
                    <div style="background: #fff; border-left: 4px solid {colour}; padding: 14px 18px; border-radius: 4px;">
                        <div style="color: {colour}; font-weight: bold; font-size: 13px; text-transform: uppercase;">{e(label)}</div>
                        <div style="font-size: 16px; margin-top: 4px;">{e(message)}</div>
                        <div style="color: #666; font-size: 13px; margin-top: 6px;">{e(created_at)}</div>
                    </div>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="{e(dashboard_url, quote=True)}" style="display: inline-block; background: #0e0e10; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;">Open Lectio</a>
                    </div>
                    <p style="font-size: 13px; color: #666;">Open My Devices and choose Diagnose on this alert to see the likely cause and what to do.</p>
                    <p style="font-size: 13px; color: #666;">You get at most one email per kind of alert in a set time. You can turn these emails off in Settings.</p>
                </div>
            </div>
        </body>
        </html>
        """

        text_content = (
            f"Hello{' ' + user_name if user_name else ''},\n\n"
            f"Your PC {device_name} needs attention.\n\n"
            f"{label}: {message}\n{created_at}\n\n"
            f"Open Lectio: {dashboard_url}\n"
            "Choose Diagnose on this alert in My Devices to see the likely cause and what to do.\n\n"
            "You get at most one email per kind of alert in a set time. You can turn these emails off in Settings.\n"
        )

        return await self.send_email(to_email, subject, html_content, text_content)


    def _plain_card(self, title: str, paragraphs: list[str], button_url: str, footer: str) -> str:
        """A simple Lectio email: dark header, a title, short paragraphs and one button. Text is escaped."""
        e = html.escape
        body = "".join(f'<p style="margin: 0 0 12px;">{e(p)}</p>' for p in paragraphs)
        return f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{e(title)}</title></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #0e0e10; padding: 24px 30px; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">Lectio</h1>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="margin: 0 0 14px; font-size: 18px; color: #0e0e10;">{e(title)}</h2>
                    {body}
                    <div style="text-align: center; margin: 26px 0;">
                        <a href="{e(button_url, quote=True)}" style="display: inline-block; background: #2f9e44; color: white; padding: 12px 26px; text-decoration: none; border-radius: 999px; font-weight: bold;">Open Lectio</a>
                    </div>
                    <p style="font-size: 13px; color: #666; margin: 0;">{e(footer)}</p>
                </div>
            </div>
        </body>
        </html>
        """

    async def send_offline_email(self, to_email: str, user_name: Optional[str], device_name: str,
                                 silent_at: str, last_reading: Optional[str], dashboard_url: str) -> bool:
        """Design C: a PC stopped reporting without shutting down normally."""
        title = f"{device_name} stopped reporting"
        paragraphs = [f"Hello{' ' + user_name if user_name else ''},",
                      f"Your PC went silent at {silent_at} without a normal shutdown."]
        if last_reading:
            paragraphs[-1] += f" Just before, {last_reading}."
        paragraphs.append("If nobody switched it off, check it's still on and run a virus scan when it's back.")
        footer = "We'll email again when it's back. You can turn alert emails off in Settings."
        text = "\n\n".join(paragraphs + [f"Open Lectio: {dashboard_url}", footer]) + "\n"
        return await self.send_email(to_email, title[:150], self._plain_card(title, paragraphs, dashboard_url, footer), text)

    async def send_back_online_email(self, to_email: str, user_name: Optional[str], device_name: str,
                                     back_at: str, off_for: str, dashboard_url: str) -> bool:
        """The follow-up to send_offline_email."""
        title = f"{device_name} is back online"
        paragraphs = [f"Hello{' ' + user_name if user_name else ''},",
                      f"Your PC started reporting again at {back_at}, after {off_for} offline.",
                      "Lectio is working out what happened. The Dashboard shows the whole story once it knows."]
        footer = "You can turn alert emails off in Settings."
        text = "\n\n".join(paragraphs + [f"Open Lectio: {dashboard_url}", footer]) + "\n"
        return await self.send_email(to_email, title[:150], self._plain_card(title, paragraphs, dashboard_url, footer), text)


# Global email service instance
email_service = EmailService()

# Emails sent in the background, kept here so they aren't garbage-collected mid-send.
_sending: set[asyncio.Task] = set()


def send_in_background(coro) -> None:
    """
    Send an email without making the request wait for the mail server (which
    can take seconds, or time out when the network is slow). Failures are logged.
    """
    task = asyncio.get_running_loop().create_task(coro)
    _sending.add(task)
    task.add_done_callback(_sending.discard)


def _service_error(response: httpx.Response) -> str:
    """SendLiberty's own explanation of a refusal, whatever shape it comes in."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:200] or "(no details)"
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            error = error.get("message") or error
        return str(body.get("message") or error or body)
    return str(body)


def _hint(response: httpx.Response) -> str:
    status = response.status_code
    if status == 401:
        return " (check SENDLIBERTY_API_KEY)"
    if status == 403:
        return (" (EMAIL_FROM must be a Gmail or Workspace address connected in SendLiberty, "
                "and the API key must be allowed to send from it)")
    if status == 429:
        wait = response.headers.get("Retry-After")
        return f" (SendLiberty's sending limit was reached{'; retry after ' + wait + ' s' if wait else ''})"
    return ""
