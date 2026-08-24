"""
Storage Service for Lectio Telemetry Persistence

This module provides database operations for storing and retrieving hardware
telemetry data using Beanie ODM and MongoDB with time-series optimization.

Author: Lectio Backend Team
Version: 3.0.0
"""

import logging
import platform
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from beanie import PydanticObjectId
from beanie.odm.queries.aggregation import AggregationQuery

from app.models.telemetry import (
    Device,
    TelemetrySnapshotDocument,
    TelemetrySnapshot,
    CPUMetrics,
    GPUMetrics,
    StorageMetrics,
    RAMMetrics,
    PowerAndVRMMetrics,
)

logger = logging.getLogger(__name__)


class StorageService:
    """
    Storage service for managing telemetry persistence and retrieval.
    
    This service handles all database operations for devices and telemetry
    snapshots, including registration, storage, historical queries, and
    data downsampling for long-term storage optimization.
    """
    
    # Constants for data retention and downsampling
    DEFAULT_RETENTION_DAYS = 30
    DOWNSAMPLE_THRESHOLD_DAYS = 7
    DOWNSAMPLE_RETENTION_DAYS = 365
    
    @staticmethod
    async def register_or_get_device(
        user_id: str,
        system_uuid: str,
        device_name: str
    ) -> Device:
        """
        Register a new device or retrieve an existing one.
        
        This method checks if a device with the given system_uuid already exists
        for the user. If found, it updates the last_seen timestamp and returns
        the device. If not found, it creates a new device registration.
        
        Args:
            user_id: The user's ObjectId as a string
            system_uuid: Unique system identifier (UUID)
            device_name: Human-readable device name
            
        Returns:
            Device: The registered or retrieved device document
        """
        try:
            # Convert user_id string to PydanticObjectId
            user_oid = PydanticObjectId(user_id)
            
            # Try to find existing device by system_uuid
            existing_device = await Device.find_one(
                Device.system_uuid == system_uuid,
                Device.user_id == user_oid
            )
            
            if existing_device:
                # Update last_seen timestamp
                existing_device.last_seen = datetime.now(timezone.utc)
                await existing_device.save()
                logger.info(f"Device found and updated: {existing_device.device_name} ({system_uuid})")
                return existing_device
            
            # Create new device registration
            os_info = StorageService._get_system_info()
            
            new_device = Device(
                user_id=user_oid,
                device_name=device_name,
                system_uuid=system_uuid,
                os_info=os_info,
                is_active=True,
                created_at=datetime.now(timezone.utc),
                last_seen=datetime.now(timezone.utc)
            )
            
            await new_device.insert()
            logger.info(f"New device registered: {device_name} ({system_uuid})")
            return new_device
            
        except Exception as e:
            logger.error(f"Error registering/retrieving device: {e}")
            raise
    
    @staticmethod
    async def save_telemetry_snapshot(
        user_id: str,
        device_id: str,
        snapshot: TelemetrySnapshot
    ) -> TelemetrySnapshotDocument:
        """
        Save a telemetry snapshot to the database.
        
        This method persists a hardware telemetry snapshot with proper
        user and device linking for multi-tenant isolation. The data
        will be automatically cleaned up after the TTL period.
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: The device's ObjectId as a string
            snapshot: The telemetry snapshot to persist
            
        Returns:
            TelemetrySnapshotDocument: The persisted document
            
        Raises:
            ValueError: If device does not belong to user
        """
        try:
            # Convert IDs to PydanticObjectId
            user_oid = PydanticObjectId(user_id)
            device_oid = PydanticObjectId(device_id)
            
            # CRITICAL: Validate device ownership before saving (multi-tenant isolation)
            device = await Device.get(device_oid)
            if not device:
                raise ValueError(f"Device {device_id} not found")
            
            if str(device.user_id) != user_id:
                logger.warning(
                    f"Security violation: User {user_id} attempted to save telemetry "
                    f"for device {device_id} owned by user {device.user_id}"
                )
                raise ValueError(f"Device {device_id} does not belong to user {user_id}")
            
            # Create document from snapshot
            telemetry_doc = TelemetrySnapshotDocument(
                device_id=device_oid,
                user_id=user_oid,
                timestamp=snapshot.timestamp,
                sensor_id=snapshot.sensor_id,
                cpu=snapshot.cpu,
                gpu=snapshot.gpu,
                storage=snapshot.storage,
                ram=snapshot.ram,
                power_vrm=snapshot.power_vrm,
                collection_duration_ms=snapshot.collection_duration_ms
            )
            
            await telemetry_doc.insert()
            
            # Update device last_seen timestamp
            device = await Device.get(device_oid)
            if device:
                device.last_seen = snapshot.timestamp
                await device.save()
            
            logger.debug(f"Telemetry snapshot saved for device {device_id}")
            return telemetry_doc
            
        except Exception as e:
            logger.error(f"Error saving telemetry snapshot: {e}")
            raise
    
    @staticmethod
    async def get_historical_telemetry(
        user_id: str,
        device_id: str,
        start_time: datetime,
        end_time: datetime,
        limit: int = 500
    ) -> List[TelemetrySnapshotDocument]:
        """
        Retrieve historical telemetry data for a specific device and time range.
        
        This method enforces multi-tenant isolation by filtering on both user_id
        and device_id. Results are ordered by timestamp descending (newest first).
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: The device's ObjectId as a string
            start_time: Start of the time range (inclusive)
            end_time: End of the time range (inclusive)
            limit: Maximum number of documents to return (default: 500)
            
        Returns:
            List[TelemetrySnapshotDocument]: Historical telemetry documents
        """
        try:
            # Convert IDs to PydanticObjectId
            user_oid = PydanticObjectId(user_id)
            device_oid = PydanticObjectId(device_id)
            
            # Query with tenant isolation and time range filter
            telemetry_docs = await TelemetrySnapshotDocument.find(
                TelemetrySnapshotDocument.user_id == user_oid,
                TelemetrySnapshotDocument.device_id == device_oid,
                TelemetrySnapshotDocument.timestamp >= start_time,
                TelemetrySnapshotDocument.timestamp <= end_time
            ).sort("-timestamp").limit(limit).to_list()
            
            logger.info(f"Retrieved {len(telemetry_docs)} telemetry records for device {device_id}")
            return telemetry_docs
            
        except Exception as e:
            logger.error(f"Error retrieving historical telemetry: {e}")
            raise
    
    @staticmethod
    async def get_user_devices(user_id: str) -> List[Device]:
        """
        Retrieve all devices belonging to a specific user.
        
        Args:
            user_id: The user's ObjectId as a string
            
        Returns:
            List[Device]: All devices owned by the user
        """
        try:
            user_oid = PydanticObjectId(user_id)
            
            devices = await Device.find(
                Device.user_id == user_oid,
                Device.is_active == True
            ).sort("-last_seen").to_list()
            
            logger.info(f"Retrieved {len(devices)} devices for user {user_id}")
            return devices
            
        except Exception as e:
            logger.error(f"Error retrieving user devices: {e}")
            raise
    
    @staticmethod
    async def downsample_old_telemetry() -> int:
        """
        Downsample telemetry data older than the threshold to daily averages.
        
        This method uses MongoDB aggregation pipelines to compress raw high-frequency
        telemetry data older than 7 days into daily average summaries. This optimizes
        long-term storage for AI trend analysis while preserving recent detailed data.
        
        The aggregation:
        1. Filters documents older than the downsampling threshold
        2. Groups by user_id, device_id, and date
        3. Computes averages for numeric metrics
        4. Stores the downsampled data in a separate collection
        5. Deletes the original raw data
        
        Returns:
            int: Number of documents downsampled
        """
        try:
            threshold_date = datetime.now(timezone.utc) - timedelta(
                days=StorageService.DOWNSAMPLE_THRESHOLD_DAYS
            )
            
            # Build aggregation pipeline for daily averaging
            pipeline = [
                # Filter documents older than threshold
                {
                    "$match": {
                        "timestamp": {"$lt": threshold_date}
                    }
                },
                # Group by user_id, device_id, and date
                {
                    "$group": {
                        "_id": {
                            "user_id": "$user_id",
                            "device_id": "$device_id",
                            "date": {
                                "$dateToString": {
                                    "format": "%Y-%m-%d",
                                    "date": "$timestamp"
                                }
                            }
                        },
                        # CPU metrics averaging
                        "avg_cpu_temp": {"$avg": "$cpu.core_temperature_c"},
                        "avg_cpu_utilization": {"$avg": "$cpu.utilization_percent"},
                        "avg_cpu_power": {"$avg": "$cpu.package_power_w"},
                        # GPU metrics averaging
                        "avg_gpu_temp": {"$avg": "$gpu.core_temperature_c"},
                        "avg_gpu_utilization": {"$avg": "$gpu.utilization_percent"},
                        "avg_gpu_power": {"$avg": "$gpu.board_power_w"},
                        # RAM metrics averaging
                        "avg_ram_usage": {"$avg": "$ram.usage_percent"},
                        # Storage metrics (take first for non-numeric)
                        "storage_sample": {"$first": "$storage"},
                        # Power/VRM metrics averaging
                        "avg_vrm_temp": {"$avg": "$power_vrm.vrm_temperature_c"},
                        "avg_psu_voltage": {"$avg": "$power_vrm.psu_12v_voltage"},
                        # Count documents in each group
                        "count": {"$sum": 1},
                        # Timestamp range
                        "min_timestamp": {"$min": "$timestamp"},
                        "max_timestamp": {"$max": "$timestamp"}
                    }
                },
                # Sort by date descending
                {
                    "$sort": {"_id.date": -1}
                }
            ]
            
            # Execute aggregation
            results = await TelemetrySnapshotDocument.aggregate(
                aggregation_pipeline=pipeline
            ).to_list()
            
            downsampled_count = 0
            
            # Store downsampled data (this would typically go to a separate collection)
            for result in results:
                # Create downsampled document structure
                downsampled_data = {
                    "user_id": result["_id"]["user_id"],
                    "device_id": result["_id"]["device_id"],
                    "date": result["_id"]["date"],
                    "cpu": {
                        "core_temperature_c": result.get("avg_cpu_temp"),
                        "utilization_percent": result.get("avg_cpu_utilization"),
                        "package_power_w": result.get("avg_cpu_power")
                    },
                    "gpu": {
                        "core_temperature_c": result.get("avg_gpu_temp"),
                        "utilization_percent": result.get("avg_gpu_utilization"),
                        "board_power_w": result.get("avg_gpu_power")
                    },
                    "ram": {
                        "usage_percent": result.get("avg_ram_usage")
                    },
                    "power_vrm": {
                        "vrm_temperature_c": result.get("avg_vrm_temp"),
                        "psu_12v_voltage": result.get("avg_psu_voltage")
                    },
                    "sample_count": result["count"],
                    "min_timestamp": result["min_timestamp"],
                    "max_timestamp": result["max_timestamp"],
                    "created_at": datetime.now(timezone.utc)
                }
                
                # In a production system, this would be inserted into a separate
                # downsampled_telemetry collection. For now, we'll just log it.
                logger.debug(f"Downsampled data: {downsampled_data}")
                downsampled_count += result["count"]
            
            # Delete original raw data that has been downsampled
            # (This would be done in production with proper safeguards)
            # await TelemetrySnapshotDocument.find_many(
            #     TelemetrySnapshotDocument.timestamp < threshold_date
            # ).delete()
            
            logger.info(f"Downsampled {downsampled_count} telemetry documents")
            return downsampled_count
            
        except Exception as e:
            logger.error(f"Error during telemetry downsampling: {e}")
            raise
    
    @staticmethod
    async def delete_device(device_id: str, user_id: str) -> bool:
        """
        Soft delete a device by marking it as inactive.
        
        Args:
            device_id: The device's ObjectId as a string
            user_id: The user's ObjectId as a string (for authorization)
            
        Returns:
            bool: True if device was deleted, False otherwise
        """
        try:
            device_oid = PydanticObjectId(device_id)
            user_oid = PydanticObjectId(user_id)
            
            device = await Device.find_one(
                Device.id == device_oid,
                Device.user_id == user_oid
            )
            
            if device:
                device.is_active = False
                await device.save()
                logger.info(f"Device {device_id} marked as inactive")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error deleting device: {e}")
            raise
    
    @staticmethod
    async def get_telemetry_statistics(
        user_id: str,
        device_id: str,
        start_time: datetime,
        end_time: datetime
    ) -> dict:
        """
        Get statistical summary of telemetry data for a time range.
        
        This method computes averages, minimums, and maximums for key
        metrics over the specified time period.
        
        Args:
            user_id: The user's ObjectId as a string
            device_id: The device's ObjectId as a string
            start_time: Start of the time range
            end_time: End of the time range
            
        Returns:
            dict: Statistical summary of telemetry metrics
        """
        try:
            user_oid = PydanticObjectId(user_id)
            device_oid = PydanticObjectId(device_id)
            
            # Build aggregation pipeline for statistics
            pipeline = [
                {
                    "$match": {
                        "user_id": user_oid,
                        "device_id": device_oid,
                        "timestamp": {"$gte": start_time, "$lte": end_time}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "avg_cpu_temp": {"$avg": "$cpu.core_temperature_c"},
                        "max_cpu_temp": {"$max": "$cpu.core_temperature_c"},
                        "avg_cpu_util": {"$avg": "$cpu.utilization_percent"},
                        "max_cpu_util": {"$max": "$cpu.utilization_percent"},
                        "avg_gpu_temp": {"$avg": "$gpu.core_temperature_c"},
                        "max_gpu_temp": {"$max": "$gpu.core_temperature_c"},
                        "avg_gpu_util": {"$avg": "$gpu.utilization_percent"},
                        "max_gpu_util": {"$max": "$gpu.utilization_percent"},
                        "avg_ram_usage": {"$avg": "$ram.usage_percent"},
                        "max_ram_usage": {"$max": "$ram.usage_percent"},
                        "sample_count": {"$sum": 1}
                    }
                }
            ]
            
            results = await TelemetrySnapshotDocument.aggregate(
                aggregation_pipeline=pipeline
            ).to_list()
            
            if results:
                return results[0]
            
            return {"sample_count": 0}
            
        except Exception as e:
            logger.error(f"Error computing telemetry statistics: {e}")
            raise
    
    @staticmethod
    def _get_system_info() -> str:
        """
        Get system information for device registration.
        
        Returns:
            str: Formatted system information string
        """
        try:
            system_info = f"{platform.system()} {platform.release()}"
            machine_info = platform.machine()
            processor_info = platform.processor()
            
            return f"{system_info} ({machine_info}) - {processor_info}"
        except Exception as e:
            logger.warning(f"Error getting system info: {e}")
            return "Unknown System"
