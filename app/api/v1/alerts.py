"""
Alert Management REST API Endpoints

This module provides REST API endpoints for querying and managing
anomaly alerts with tenant isolation enforcement.

Author: Lectio Backend Team
Version: 6.0.0
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie import PydanticObjectId

from app.api.deps import get_current_user
from app.models.user import User
from app.models.alert import AnomalyAlertDocument, AlertSeverity
from app.services.alert_service import AlertService
from app.schemas.api import (
    AlertResponse,
    AlertListRequest,
    AlertListResponse,
    AlertAcknowledgeRequest,
    AlertAcknowledgeResponse,
    AlertStatisticsResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/alerts",
    response_model=AlertListResponse,
    summary="List Alerts",
    description="Retrieve anomaly alerts with optional filtering by device, severity, and status"
)
async def list_alerts(
    device_id: Optional[str] = Query(None, description="Filter by device ID"),
    severity: Optional[str] = Query(None, description="Filter by severity (INFO, WARNING, CRITICAL)"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    start_time: Optional[datetime] = Query(None, description="Start of time range (ISO 8601)"),
    end_time: Optional[datetime] = Query(None, description="End of time range (ISO 8601)"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records"),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve anomaly alerts for the authenticated user with optional filtering.
    
    Args:
        device_id: Optional filter by device ID
        severity: Optional filter by severity
        is_active: Optional filter by active status
        start_time: Optional start of time range
        end_time: Optional end of time range
        limit: Maximum number of records to return
        current_user: The authenticated user
        
    Returns:
        AlertListResponse containing alerts and total count
    """
    try:
        user_id = str(current_user.id)
        
        # Validate severity if provided
        severity_enum = None
        if severity:
            try:
                severity_enum = AlertSeverity(severity.upper())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid severity value. Must be one of: INFO, WARNING, CRITICAL"
                )
        
        # Validate device ID if provided
        if device_id:
            try:
                PydanticObjectId(device_id)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid device ID format"
                )
        
        # Query alerts
        alerts = await AlertService.get_all_alerts(
            user_id=user_id,
            device_id=device_id,
            severity=severity_enum,
            is_active=is_active,
            start_time=start_time,
            end_time=end_time,
            limit=limit
        )
        
        # Convert to response models
        alert_responses = [
            AlertResponse(
                id=str(alert.id),
                user_id=str(alert.user_id),
                device_id=str(alert.device_id),
                rule_name=alert.rule_name,
                severity=alert.severity.value,
                metric_name=alert.metric_name,
                trigger_value=alert.trigger_value,
                threshold_limit=alert.threshold_limit,
                message=alert.message,
                is_active=alert.is_active,
                created_at=alert.created_at,
                resolved_at=alert.resolved_at
            )
            for alert in alerts
        ]
        
        return AlertListResponse(
            alerts=alert_responses,
            total_count=len(alert_responses)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing alerts for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve alerts"
        )


@router.get(
    "/alerts/{alert_id}",
    response_model=AlertResponse,
    summary="Get Alert Details",
    description="Retrieve detailed information for a specific alert"
)
async def get_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve detailed information for a specific alert.
    
    Args:
        alert_id: The alert ID to retrieve
        current_user: The authenticated user
        
    Returns:
        AlertResponse with alert details
        
    Raises:
        HTTPException: If alert not found or doesn't belong to user
    """
    try:
        user_id = str(current_user.id)
        
        # Validate alert ID format
        try:
            alert_oid = PydanticObjectId(alert_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid alert ID format"
            )
        
        # Get alert with tenant isolation
        alert = await AlertService.get_alert_by_id(alert_id, user_id)
        
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alert not found"
            )
        
        return AlertResponse(
            id=str(alert.id),
            user_id=str(alert.user_id),
            device_id=str(alert.device_id),
            rule_name=alert.rule_name,
            severity=alert.severity.value,
            metric_name=alert.metric_name,
            trigger_value=alert.trigger_value,
            threshold_limit=alert.threshold_limit,
            message=alert.message,
            is_active=alert.is_active,
            created_at=alert.created_at,
            resolved_at=alert.resolved_at
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving alert {alert_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve alert"
        )


@router.patch(
    "/alerts/{alert_id}/acknowledge",
    response_model=AlertAcknowledgeResponse,
    summary="Acknowledge Alert",
    description="Mark an alert as acknowledged by the user"
)
async def acknowledge_alert(
    alert_id: str,
    request: AlertAcknowledgeRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Mark an alert as acknowledged by the user.
    
    Args:
        alert_id: The alert ID to acknowledge
        request: Acknowledgment request with optional notes
        current_user: The authenticated user
        
    Returns:
        AlertAcknowledgeResponse with acknowledgment details
        
    Raises:
        HTTPException: If alert not found or doesn't belong to user
    """
    try:
        user_id = str(current_user.id)
        
        # Validate alert ID format
        try:
            alert_oid = PydanticObjectId(alert_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid alert ID format"
            )
        
        # Get alert with tenant isolation
        alert = await AlertService.get_alert_by_id(alert_id, user_id)
        
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alert not found"
            )
        
        # Manually resolve the alert (acknowledgment)
        success = await AlertService.manually_resolve_alert(alert_id, user_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to acknowledge alert"
            )
        
        return AlertAcknowledgeResponse(
            id=alert_id,
            acknowledged=request.acknowledged,
            acknowledged_at=datetime.now(timezone.utc),
            notes=request.notes
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error acknowledging alert {alert_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to acknowledge alert"
        )


@router.delete(
    "/alerts/{alert_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Alert",
    description="Delete an alert (admin or owner only)"
)
async def delete_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete an alert.
    
    Args:
        alert_id: The alert ID to delete
        current_user: The authenticated user
        
    Raises:
        HTTPException: If alert not found or doesn't belong to user
    """
    try:
        user_id = str(current_user.id)
        
        # Validate alert ID format
        try:
            alert_oid = PydanticObjectId(alert_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid alert ID format"
            )
        
        # Delete alert with tenant isolation
        success = await AlertService.delete_alert(alert_id, user_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alert not found"
            )
        
        logger.info(f"Alert {alert_id} deleted by user {user_id}")
        
        return None
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting alert {alert_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete alert"
        )


@router.get(
    "/alerts/statistics",
    response_model=AlertStatisticsResponse,
    summary="Get Alert Statistics",
    description="Retrieve aggregated statistics for alerts over a time period"
)
async def get_alert_statistics(
    device_id: Optional[str] = Query(None, description="Filter by device ID"),
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve aggregated statistics for alerts over a time period.
    
    Args:
        device_id: Optional filter by device ID
        days: Number of days to analyze (default: 30)
        current_user: The authenticated user
        
    Returns:
        AlertStatisticsResponse with aggregated statistics
    """
    try:
        user_id = str(current_user.id)
        
        # Validate device ID if provided
        if device_id:
            try:
                PydanticObjectId(device_id)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid device ID format"
                )
        
        # Get statistics
        stats = await AlertService.get_alert_statistics(
            user_id=user_id,
            device_id=device_id,
            days=days
        )
        
        return AlertStatisticsResponse(
            total_alerts=stats["total_alerts"],
            active_alerts=stats["active_alerts"],
            resolved_alerts=stats["resolved_alerts"],
            critical_count=stats["critical_count"],
            warning_count=stats["warning_count"],
            info_count=stats["info_count"],
            rule_counts=stats["rule_counts"],
            period_days=stats["period_days"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving alert statistics for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve alert statistics"
        )


@router.get(
    "/alerts/by-rule/{rule_name}",
    response_model=AlertListResponse,
    summary="Get Alerts by Rule",
    description="Retrieve all alerts triggered by a specific rule"
)
async def get_alerts_by_rule(
    rule_name: str,
    device_id: Optional[str] = Query(None, description="Filter by device ID"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records"),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve all alerts triggered by a specific rule.
    
    Args:
        rule_name: The rule name to filter by
        device_id: Optional filter by device ID
        limit: Maximum number of records to return
        current_user: The authenticated user
        
    Returns:
        AlertListResponse containing alerts for the specified rule
    """
    try:
        user_id = str(current_user.id)
        
        # Validate device ID if provided
        if device_id:
            try:
                PydanticObjectId(device_id)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid device ID format"
                )
        
        # Query alerts by rule
        alerts = await AlertService.get_alerts_by_rule(
            user_id=user_id,
            rule_name=rule_name,
            device_id=device_id,
            limit=limit
        )
        
        # Convert to response models
        alert_responses = [
            AlertResponse(
                id=str(alert.id),
                user_id=str(alert.user_id),
                device_id=str(alert.device_id),
                rule_name=alert.rule_name,
                severity=alert.severity.value,
                metric_name=alert.metric_name,
                trigger_value=alert.trigger_value,
                threshold_limit=alert.threshold_limit,
                message=alert.message,
                is_active=alert.is_active,
                created_at=alert.created_at,
                resolved_at=alert.resolved_at
            )
            for alert in alerts
        ]
        
        return AlertListResponse(
            alerts=alert_responses,
            total_count=len(alert_responses)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving alerts by rule {rule_name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve alerts by rule"
        )
