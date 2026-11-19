"""Webhook delivery for device alerts."""

import logging
import httpx


logger = logging.getLogger("uvicorn")

async def send_webhook_alert(webhook_url: str, alert_payload: dict):
    logger.info(f"[BACKGROUND TASK STARTED] Sending webhook to {webhook_url}...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(webhook_url, json=alert_payload)
            logger.info(f"[BACKGROUND TASK FINISHED] Webhook delivered! status: {response.status_code}")
    except Exception as e:
        logger.error(f"[BACKGROUND TASK FAILED] Webhook delivery failed: {str(e)}")
