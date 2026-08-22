"""
Alert Service for Lectio Anomaly Management

This module provides query and management operations for anomaly alerts,
ensuring strict multi-tenant isolation through user_id and device_id filtering.

Author: Lectio Backend Team
Version: 4.0.0
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from beanie import PydanticObjectId

from app.models.alert import AnomalyAlertDocument, AlertSeverity
from app.core.config import settings

logger = logging.getLogger(__name__)


class AlertService:
    """
    Service for managing anomaly alerts with tenant isolation.
    
    This service provides methods to query and manage alerts while strictly
    enforcing multi-tenant isolation through user_id and device_id filtering
    to prevent cross-user data leakage.
    """
    
    @staticmethod
    async def get_active_alerts(
        user_id: str,
        device_id: Optional[str] = None,
        severity: Optional[AlertSeverity] = None,
        limit: int = 100
    ) -> List[AnomalyAlertDocument]:
        """
        Retrieve active alerts for a user with optional device and severity filters.
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: Optional device filter (ObjectId as string)
            severity: Optional severity filter
            limit: Maximum number of alerts to return
            
        Returns:
            List of active alert documents
        """
        try:
            user_oid = PydanticObjectId(user_id)
            
            # Build query filters
            filters = {"user_id": user_oid, "is_active": True}
            
            if device_id:
                device_oid = PydanticObjectId(device_id)
                filters["device_id"] = device_oid
            
            if severity:
                filters["severity"] = severity
            
            alerts = await AnomalyAlertDocument.find(
                filters
            ).sort("-created_at").limit(limit).to_list()
            
            logger.info(f"Retrieved {len(alerts)} active alerts for user {user_id}")
            return alerts
            
        except Exception as e:
            logger.error(f"Error retrieving active alerts: {e}")
            raise
    
    @staticmethod
    async def get_all_alerts(
        user_id: str,
        device_id: Optional[str] = None,
        severity: Optional[AlertSeverity] = None,
        is_active: Optional[bool] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 500
    ) -> List[AnomalyAlertDocument]:
        """
        Retrieve alerts for a user with comprehensive filtering options.
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: Optional device filter (ObjectId as string)
            severity: Optional severity filter
            is_active: Optional active status filter
            start_time: Optional start time for time range filter
            end_time: Optional end time for time range filter
            limit: Maximum number of alerts to return
            
        Returns:
            List of alert documents matching the filters
        """
        try:
            user_oid = PydanticObjectId(user_id)
            
            # Build query filters
            filters = {"user_id": user_oid}
            
            if device_id:
                device_oid = PydanticObjectId(device_id)
                filters["device_id"] = device_oid
            
            if severity:
                filters["severity"] = severity
            
            if is_active is not None:
                filters["is_active"] = is_active
            
            # Time range filters need special handling
            time_filter = {}
            if start_time:
                time_filter["created_at"] = {"$gte": start_time}
            if end_time:
                if "created_at" in time_filter:
                    time_filter["created_at"]["$lte"] = end_time
                else:
                    time_filter["created_at"] = {"$lte": end_time}
            
            # Merge filters
            if time_filter:
                filters.update(time_filter)
            
            alerts = await AnomalyAlertDocument.find(
                filters
            ).sort("-created_at").limit(limit).to_list()
            
            logger.info(f"Retrieved {len(alerts)} alerts for user {user_id}")
            return alerts
            
        except Exception as e:
            logger.error(f"Error retrieving alerts: {e}")
            raise
    
    @staticmethod
    async def get_alert_by_id(alert_id: str, user_id: str) -> Optional[AnomalyAlertDocument]:
        """
        Retrieve a specific alert by ID with tenant isolation check.
        
        Args:
            alert_id: The alert's ObjectId as a string
            user_id: The user's ObjectId as a string (for authorization)
            
        Returns:
            Alert document if found and belongs to the user, None otherwise
        """
        try:
            user_oid = PydanticObjectId(user_id)
            alert_oid = PydanticObjectId(alert_id)
            
            alert = await AnomalyAlertDocument.find_one(
                AnomalyAlertDocument.id == alert_oid,
                AnomalyAlertDocument.user_id == user_oid
            )
            
            return alert
            
        except Exception as e:
            logger.error(f"Error retrieving alert {alert_id}: {e}")
            raise
    
    @staticmethod
    async def get_alerts_by_rule(
        user_id: str,
        rule_name: str,
        device_id: Optional[str] = None,
        limit: int = 100
    ) -> List[AnomalyAlertDocument]:
        """
        Retrieve alerts for a specific rule with tenant isolation.
        
        Args:
            user_id: The user's ObjectId as a string
            rule_name: The name of the rule to filter by
            device_id: Optional device filter (ObjectId as string)
            limit: Maximum number of alerts to return
            
        Returns:
            List of alert documents for the specified rule
        """
        try:
            user_oid = PydanticObjectId(user_id)
            
            filters = {"user_id": user_oid, "rule_name": rule_name}
            
            if device_id:
                device_oid = PydanticObjectId(device_id)
                filters["device_id"] = device_oid
            
            alerts = await AnomalyAlertDocument.find(
                filters
            ).sort("-created_at").limit(limit).to_list()
            
            logger.info(f"Retrieved {len(alerts)} alerts for rule {rule_name}")
            return alerts
            
        except Exception as e:
            logger.error(f"Error retrieving alerts by rule {rule_name}: {e}")
            raise
    
    @staticmethod
    async def get_alert_statistics(
        user_id: str,
        device_id: Optional[str] = None,
        days: int = 30
    ) -> dict:
        """
        Get alert statistics for a user over a time period.
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: Optional device filter (ObjectId as string)
            days: Number of days to look back
            
        Returns:
            Dictionary with alert statistics
        """
        try:
            user_oid = PydanticObjectId(user_id)
            start_time = datetime.now(timezone.utc) - timedelta(days=days)
            
            # Build query filters
            filters = {"user_id": user_oid, "created_at": {"$gte": start_time}}
            
            if device_id:
                device_oid = PydanticObjectId(device_id)
                filters["device_id"] = device_oid
            
            # Get all alerts in the time range
            alerts = await AnomalyAlertDocument.find(filters).to_list()
            
            # Calculate statistics
            total_alerts = len(alerts)
            active_alerts = sum(1 for alert in alerts if alert.is_active)
            resolved_alerts = total_alerts - active_alerts
            
            critical_count = sum(1 for alert in alerts if alert.severity == AlertSeverity.CRITICAL)
            warning_count = sum(1 for alert in alerts if alert.severity == AlertSeverity.WARNING)
            info_count = sum(1 for alert in alerts if alert.severity == AlertSeverity.INFO)
            
            # Count by rule
            rule_counts = {}
            for alert in alerts:
                rule_counts[alert.rule_name] = rule_counts.get(alert.rule_name, 0) + 1
            
            return {
                "total_alerts": total_alerts,
                "active_alerts": active_alerts,
                "resolved_alerts": resolved_alerts,
                "critical_count": critical_count,
                "warning_count": warning_count,
                "info_count": info_count,
                "rule_counts": rule_counts,
                "period_days": days
            }
            
        except Exception as e:
            logger.error(f"Error calculating alert statistics: {e}")
            raise
    
    @staticmethod
    async def manually_resolve_alert(alert_id: str, user_id: str) -> bool:
        """
        Manually resolve an alert with tenant isolation check.
        
        Args:
            alert_id: The alert's ObjectId as a string
            user_id: The user's ObjectId as a string (for authorization)
            
        Returns:
            True if alert was resolved, False otherwise
        """
        try:
            user_oid = PydanticObjectId(user_id)
            alert_oid = PydanticObjectId(alert_id)
            
            alert = await AnomalyAlertDocument.find_one(
                AnomalyAlertDocument.id == alert_oid,
                AnomalyAlertDocument.user_id == user_oid
            )
            
            if alert and alert.is_active:
                alert.is_active = False
                alert.resolved_at = datetime.now(timezone.utc)
                await alert.save()
                
                logger.info(f"Manually resolved alert {alert_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error manually resolving alert {alert_id}: {e}")
            raise
    
    @staticmethod
    async def delete_alert(alert_id: str, user_id: str) -> bool:
        """
        Delete an alert with tenant isolation check.
        
        Args:
            alert_id: The alert's ObjectId as a string
            user_id: The user's ObjectId as a string (for authorization)
            
        Returns:
            True if alert was deleted, False otherwise
        """
        try:
            user_oid = PydanticObjectId(user_id)
            alert_oid = PydanticObjectId(alert_id)
            
            alert = await AnomalyAlertDocument.find_one(
                AnomalyAlertDocument.id == alert_oid,
                AnomalyAlertDocument.user_id == user_oid
            )
            
            if alert:
                await alert.delete()
                logger.info(f"Deleted alert {alert_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error deleting alert {alert_id}: {e}")
            raise
    
    @staticmethod
    async def cleanup_old_alerts(days: int = 90) -> int:
        """
        Clean up resolved alerts older than the specified number of days.
        
        This is a maintenance operation that should be run periodically.
        Only inactive (resolved) alerts are cleaned up.
        
        Args:
            days: Number of days to retain resolved alerts
            
        Returns:
            Number of alerts deleted
        """
        try:
            cutoff_time = datetime.now(timezone.utc) - timedelta(days=days)
            
            # Find old resolved alerts
            old_alerts = await AnomalyAlertDocument.find(
                {"is_active": False, "resolved_at": {"$lt": cutoff_time}}
            ).to_list()
            
            # Delete them
            count = 0
            for alert in old_alerts:
                await alert.delete()
                count += 1
            
            logger.info(f"Cleaned up {count} old resolved alerts")
            return count
            
        except Exception as e:
            logger.error(f"Error cleaning up old alerts: {e}")
            raise
