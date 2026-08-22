"""
Anomaly Detection Engine for Lectio

This module implements a stateful, asynchronous anomaly detection engine that
continuously evaluates live telemetry streams against multi-variable threshold
rules. The engine includes debouncing logic to prevent false positives and
auto-resolution for returning to normal conditions.

Author: Lectio Backend Team
Version: 4.0.0
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass, field

from beanie import PydanticObjectId

from app.core.anomaly_rules import (
    BASELINE_RULES,
    AnomalyRule,
    evaluate_rule,
    get_rule_by_name
)
from app.models.alert import AnomalyAlertDocument, AlertSeverity
from app.models.telemetry import TelemetrySnapshot
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class BreachState:
    """
    Tracks the state of a metric breach for debouncing.
    
    Attributes:
        breach_start_time: When the breach first started
        consecutive_breaches: Number of consecutive breach occurrences
        last_breach_time: Timestamp of the most recent breach
        last_normal_time: Timestamp of the most recent normal reading
        is_triggered: Whether the alert has been triggered
        alert_id: ID of the created alert (if triggered)
    """
    breach_start_time: Optional[datetime] = None
    consecutive_breaches: int = 0
    last_breach_time: Optional[datetime] = None
    last_normal_time: Optional[datetime] = None
    is_triggered: bool = False
    alert_id: Optional[str] = None


@dataclass
class DeviceState:
    """
    Tracks all breach states for a specific device.
    
    Attributes:
        device_id: The device identifier
        user_id: The user identifier
        breach_states: Dictionary mapping rule names to breach states
        last_updated: Timestamp of last state update
    """
    device_id: str
    user_id: str
    breach_states: Dict[str, BreachState] = field(default_factory=dict)
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AnomalyEngine:
    """
    Stateful anomaly detection engine with debouncing and auto-resolution.
    
    This engine maintains in-memory tracking of metric breaches per device
    to implement debouncing logic, preventing false positives from transient
    spikes. It also automatically resolves alerts when conditions return to
    normal for a sustained period.
    
    The engine is thread-safe and designed for async operation.
    """
    
    def __init__(self):
        """Initialize the anomaly engine with empty state tracking."""
        self._device_states: Dict[str, DeviceState] = {}
        self._lock = asyncio.Lock()
        self._enabled = settings.ANOMALY_ENGINE_ENABLED
        self._debounce_enabled = settings.ANOMALY_ENGINE_DEBOUNCE_ENABLED
        self._auto_resolution = settings.ANOMALY_ENGINE_AUTO_RESOLUTION
        
        logger.info(
            f"AnomalyEngine initialized - Enabled: {self._enabled}, "
            f"Debounce: {self._debounce_enabled}, Auto-Resolution: {self._auto_resolution}"
        )
    
    def _get_device_key(self, user_id: str, device_id: str) -> str:
        """
        Generate a unique key for a user-device pair.
        
        Args:
            user_id: The user identifier
            device_id: The device identifier
            
        Returns:
            Unique key string
        """
        return f"{user_id}:{device_id}"
    
    def _get_or_create_device_state(self, user_id: str, device_id: str) -> DeviceState:
        """
        Get or create device state tracking.
        
        Args:
            user_id: The user identifier
            device_id: The device identifier
            
        Returns:
            DeviceState object
        """
        key = self._get_device_key(user_id, device_id)
        if key not in self._device_states:
            self._device_states[key] = DeviceState(
                device_id=device_id,
                user_id=user_id
            )
        return self._device_states[key]
    
    def _cleanup_old_states(self, max_age_hours: int = 24):
        """
        Clean up device states that haven't been updated recently.
        
        Args:
            max_age_hours: Maximum age in hours before cleanup
        """
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        keys_to_remove = []
        
        for key, device_state in self._device_states.items():
            if device_state.last_updated < cutoff_time:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self._device_states[key]
            logger.debug(f"Cleaned up old device state: {key}")
    
    async def evaluate_snapshot(
        self,
        user_id: str,
        device_id: str,
        snapshot: TelemetrySnapshot
    ) -> List[AnomalyAlertDocument]:
        """
        Evaluate a telemetry snapshot against all anomaly rules.
        
        This method runs all configured rules against the incoming telemetry,
        applies debouncing logic to prevent false positives, persists new
        alerts to MongoDB, and auto-resolves alerts when conditions normalize.
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: The device's ObjectId as a string
            snapshot: The telemetry snapshot to evaluate
            
        Returns:
            List of newly created or updated alert documents
        """
        if not self._enabled:
            logger.debug("Anomaly engine is disabled, skipping evaluation")
            return []
        
        async with self._lock:
            # Periodic cleanup of old states
            self._cleanup_old_states()
            
            # Get or create device state
            device_state = self._get_or_create_device_state(user_id, device_id)
            device_state.last_updated = datetime.now(timezone.utc)
            
            new_alerts = []
            updated_alerts = []
            
            # Evaluate each rule
            for rule in BASELINE_RULES:
                try:
                    # Extract metric value
                    metric_value = rule.metric_extractor(snapshot)
                    
                    if metric_value is None:
                        # Metric not available, skip this rule
                        continue
                    
                    # Check if threshold is breached
                    is_breaching = evaluate_rule(rule, metric_value)
                    
                    # Get or create breach state for this rule
                    if rule.name not in device_state.breach_states:
                        device_state.breach_states[rule.name] = BreachState()
                    
                    breach_state = device_state.breach_states[rule.name]
                    
                    if is_breaching:
                        # Handle breach condition
                        alert = await self._handle_breach(
                            user_id=user_id,
                            device_id=device_id,
                            rule=rule,
                            metric_value=metric_value,
                            breach_state=breach_state,
                            snapshot=snapshot
                        )
                        if alert:
                            if breach_state.is_triggered and breach_state.alert_id:
                                updated_alerts.append(alert)
                            else:
                                new_alerts.append(alert)
                    else:
                        # Handle normal condition
                        alert = await self._handle_normal(
                            user_id=user_id,
                            device_id=device_id,
                            rule=rule,
                            metric_value=metric_value,
                            breach_state=breach_state
                        )
                        if alert:
                            updated_alerts.append(alert)
                
                except Exception as e:
                    logger.error(f"Error evaluating rule {rule.name}: {e}")
                    continue
            
            result = new_alerts + updated_alerts
            
            if result:
                logger.info(
                    f"Anomaly evaluation complete for device {device_id}: "
                    f"{len(new_alerts)} new alerts, {len(updated_alerts)} updated alerts"
                )
            
            return result
    
    async def _handle_breach(
        self,
        user_id: str,
        device_id: str,
        rule: AnomalyRule,
        metric_value: float,
        breach_state: BreachState,
        snapshot: TelemetrySnapshot
    ) -> Optional[AnomalyAlertDocument]:
        """
        Handle a metric breach condition with debouncing logic.
        
        Args:
            user_id: The user identifier
            device_id: The device identifier
            rule: The anomaly rule being evaluated
            metric_value: The current metric value
            breach_state: The current breach state
            snapshot: The telemetry snapshot
            
        Returns:
            New or updated alert document, or None if debouncing
        """
        current_time = snapshot.timestamp
        
        # Update breach tracking
        if breach_state.breach_start_time is None:
            breach_state.breach_start_time = current_time
        
        breach_state.last_breach_time = current_time
        breach_state.consecutive_breaches += 1
        breach_state.last_normal_time = None
        
        # Check if alert should be triggered
        if self._debounce_enabled:
            # Check duration threshold
            if breach_state.breach_start_time:
                breach_duration = (current_time - breach_state.breach_start_time).total_seconds()
                if breach_duration < rule.duration_threshold:
                    # Still within debounce window
                    logger.debug(
                        f"Rule {rule.name} breaching but within debounce window "
                        f"({breach_duration:.1f}s < {rule.duration_threshold:.1f}s)"
                    )
                    return None
        else:
            # Debouncing disabled, trigger immediately
            pass
        
        # Check if alert already exists and is active
        if breach_state.is_triggered and breach_state.alert_id:
            # Alert already active, update it
            try:
                alert = await AnomalyAlertDocument.get(breach_state.alert_id)
                if alert and alert.is_active:
                    alert.trigger_value = metric_value
                    alert.message = rule.message_template.format(
                        value=metric_value,
                        threshold=rule.threshold
                    )
                    await alert.save()
                    logger.debug(f"Updated existing alert: {rule.name}")
                    return alert
            except Exception as e:
                logger.error(f"Error updating alert {breach_state.alert_id}: {e}")
        
        # Create new alert
        try:
            user_oid = PydanticObjectId(user_id)
            device_oid = PydanticObjectId(device_id)
            
            alert = AnomalyAlertDocument(
                user_id=user_oid,
                device_id=device_oid,
                rule_name=rule.name,
                severity=rule.severity,
                metric_name=rule.metric_name,
                trigger_value=metric_value,
                threshold_limit=rule.threshold,
                message=rule.message_template.format(
                    value=metric_value,
                    threshold=rule.threshold
                ),
                is_active=True,
                created_at=current_time
            )
            
            await alert.insert()
            
            # Update breach state
            breach_state.is_triggered = True
            breach_state.alert_id = str(alert.id)
            
            logger.warning(
                f"New alert triggered: {rule.name} - {alert.message} "
                f"(Device: {device_id}, User: {user_id})"
            )
            
            return alert
            
        except Exception as e:
            logger.error(f"Error creating alert for rule {rule.name}: {e}")
            return None
    
    async def _handle_normal(
        self,
        user_id: str,
        device_id: str,
        rule: AnomalyRule,
        metric_value: float,
        breach_state: BreachState
    ) -> Optional[AnomalyAlertDocument]:
        """
        Handle a normal (non-breaching) condition with auto-resolution logic.
        
        Args:
            user_id: The user identifier
            device_id: The device identifier
            rule: The anomaly rule being evaluated
            metric_value: The current metric value
            breach_state: The current breach state
            
        Returns:
            Updated alert document if auto-resolved, None otherwise
        """
        current_time = datetime.now(timezone.utc)
        
        # Update normal tracking
        breach_state.last_normal_time = current_time
        breach_state.consecutive_breaches = 0
        
        # Check if alert should be auto-resolved
        if not self._auto_resolution:
            return None
        
        if not breach_state.is_triggered or not breach_state.alert_id:
            # No active alert to resolve
            return None
        
        # Check resolution duration threshold
        if breach_state.last_breach_time:
            normal_duration = (current_time - breach_state.last_breach_time).total_seconds()
            if normal_duration < rule.resolution_duration:
                # Still within resolution window
                logger.debug(
                    f"Rule {rule.name} normal but within resolution window "
                    f"({normal_duration:.1f}s < {rule.resolution_duration:.1f}s)"
                )
                return None
        
        # Auto-resolve the alert
        try:
            alert = await AnomalyAlertDocument.get(breach_state.alert_id)
            if alert and alert.is_active:
                alert.is_active = False
                alert.resolved_at = current_time
                await alert.save()
                
                # Reset breach state
                breach_state.is_triggered = False
                breach_state.alert_id = None
                breach_state.breach_start_time = None
                
                logger.info(
                    f"Alert auto-resolved: {rule.name} "
                    f"(Device: {device_id}, User: {user_id})"
                )
                
                return alert
        except Exception as e:
            logger.error(f"Error resolving alert {breach_state.alert_id}: {e}")
        
        return None
    
    async def get_device_state(self, user_id: str, device_id: str) -> Optional[DeviceState]:
        """
        Get the current state tracking for a device.
        
        Args:
            user_id: The user identifier
            device_id: The device identifier
            
        Returns:
            DeviceState if found, None otherwise
        """
        async with self._lock:
            key = self._get_device_key(user_id, device_id)
            return self._device_states.get(key)
    
    async def clear_device_state(self, user_id: str, device_id: str):
        """
        Clear state tracking for a device.
        
        Args:
            user_id: The user identifier
            device_id: The device identifier
        """
        async with self._lock:
            key = self._get_device_key(user_id, device_id)
            if key in self._device_states:
                del self._device_states[key]
                logger.info(f"Cleared device state: {key}")
    
    async def clear_all_states(self):
        """Clear all device state tracking."""
        async with self._lock:
            self._device_states.clear()
            logger.info("Cleared all device states")


# Global anomaly engine instance
anomaly_engine = AnomalyEngine()
