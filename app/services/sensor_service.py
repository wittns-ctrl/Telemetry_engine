"""
Hardware Telemetry Sensor Service for Lectio

This module provides asynchronous hardware telemetry collection for Windows systems,
interfacing with system-level drivers, CLI tools, and hardware monitoring libraries.

Author: Lectio Backend Team
Version: 2.0.0
"""

import asyncio
import json
import logging
import re
import subprocess
from datetime import datetime, timezone
from typing import Optional, List

import psutil

from app.models.telemetry import (
    TelemetrySnapshot,
    CPUMetrics,
    GPUMetrics,
    StorageMetrics,
    RAMMetrics,
    PowerAndVRMMetrics,
)

logger = logging.getLogger(__name__)


class SensorService:
    """
    Asynchronous hardware telemetry collection service.
    
    This service provides a unified interface for collecting comprehensive
    hardware metrics from Windows systems using various drivers and CLI tools.
    All blocking operations are wrapped in asyncio.to_thread to prevent
    blocking the FastAPI event loop.
    """
    
    # Default safe values for when sensors fail
    DEFAULT_CPU_TEMP = 45.0
    DEFAULT_GPU_TEMP = 40.0
    DEFAULT_VRM_TEMP = 50.0
    DEFAULT_CHIPSET_TEMP = 45.0
    DEFAULT_PSU_VOLTAGE = 12.0
    
    @staticmethod
    async def get_current_telemetry(sensor_id: str = "lectio_sensor_001") -> TelemetrySnapshot:
        """
        Collect a complete hardware telemetry snapshot.
        
        This method orchestrates the collection of all hardware metrics
        across CPU, GPU, storage, RAM, and power/VRM subsystems. All
        collection operations are performed asynchronously with proper
        error boundaries and graceful fallbacks.
        
        Args:
            sensor_id: Unique identifier for the sensor/source
            
        Returns:
            TelemetrySnapshot: Complete hardware telemetry snapshot with
                              all collected metrics and collection duration
        """
        start_time = datetime.now(timezone.utc)
        logger.info(f"Starting telemetry collection for sensor: {sensor_id}")
        
        # Collect all metrics concurrently
        cpu_metrics, gpu_metrics, storage_metrics, ram_metrics, power_vrm_metrics = await asyncio.gather(
            SensorService._collect_cpu_metrics(),
            SensorService._collect_gpu_metrics(),
            SensorService._collect_storage_metrics(),
            SensorService._collect_ram_metrics(),
            SensorService._collect_power_vrm_metrics(),
            return_exceptions=True
        )
        
        # Handle exceptions and use defaults if collection failed
        if isinstance(cpu_metrics, Exception):
            logger.error(f"CPU metrics collection failed: {cpu_metrics}")
            cpu_metrics = CPUMetrics()
        elif cpu_metrics is None:
            cpu_metrics = CPUMetrics()
            
        if isinstance(gpu_metrics, Exception):
            logger.error(f"GPU metrics collection failed: {gpu_metrics}")
            gpu_metrics = GPUMetrics()
        elif gpu_metrics is None:
            gpu_metrics = GPUMetrics()
            
        if isinstance(storage_metrics, Exception):
            logger.error(f"Storage metrics collection failed: {storage_metrics}")
            storage_metrics = []
        elif storage_metrics is None:
            storage_metrics = []
            
        if isinstance(ram_metrics, Exception):
            logger.error(f"RAM metrics collection failed: {ram_metrics}")
            ram_metrics = RAMMetrics()
        elif ram_metrics is None:
            ram_metrics = RAMMetrics()
            
        if isinstance(power_vrm_metrics, Exception):
            logger.error(f"Power/VRM metrics collection failed: {power_vrm_metrics}")
            power_vrm_metrics = PowerAndVRMMetrics()
        elif power_vrm_metrics is None:
            power_vrm_metrics = PowerAndVRMMetrics()
        
        # Calculate collection duration
        end_time = datetime.now(timezone.utc)
        duration_ms = (end_time - start_time).total_seconds() * 1000
        
        snapshot = TelemetrySnapshot(
            timestamp=end_time,
            sensor_id=sensor_id,
            cpu=cpu_metrics,
            gpu=gpu_metrics,
            storage=storage_metrics,
            ram=ram_metrics,
            power_vrm=power_vrm_metrics,
            collection_duration_ms=duration_ms
        )
        
        logger.info(f"Telemetry collection completed in {duration_ms:.2f}ms")
        return snapshot
    
    @staticmethod
    async def _collect_cpu_metrics() -> CPUMetrics:
        """
        Collect comprehensive CPU metrics using psutil and WMI.
        
        Returns:
            CPUMetrics: CPU telemetry including temperature, utilization,
                       clock speed, power, fan speed, and throttling status
        """
        try:
            # Run blocking psutil operations in thread pool
            cpu_percent, cpu_freq, cpu_count = await asyncio.to_thread(
                SensorService._get_cpu_basic_metrics
            )
            
            # Try to get temperature via psutil (if available)
            core_temp, package_temp = await asyncio.to_thread(
                SensorService._get_cpu_temperature
            )
            
            # Try to get power and fan via WMI
            power_w, fan_rpm, throttling = await asyncio.to_thread(
                SensorService._get_cpu_power_and_fan
            )
            
            return CPUMetrics(
                core_temperature_c=core_temp,
                package_temperature_c=package_temp,
                utilization_percent=cpu_percent,
                clock_speed_ghz=cpu_freq / 1000.0 if cpu_freq else None,
                package_power_w=power_w,
                fan_speed_rpm=fan_rpm,
                thermal_throttling=throttling
            )
        except Exception as e:
            logger.warning(f"CPU metrics collection error: {e}")
            raise
    
    @staticmethod
    def _get_cpu_basic_metrics() -> tuple:
        """Get basic CPU metrics using psutil (blocking)."""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            cpu_freq = psutil.cpu_freq()
            cpu_count = psutil.cpu_count()
            return cpu_percent, cpu_freq.current if cpu_freq else None, cpu_count
        except Exception as e:
            logger.warning(f"Basic CPU metrics error: {e}")
            return None, None, None
    
    @staticmethod
    def _get_cpu_temperature() -> tuple:
        """Get CPU temperature using psutil sensors (blocking)."""
        try:
            if hasattr(psutil, 'sensors_temperatures'):
                temps = psutil.sensors_temperatures()
                if temps:
                    # Try to find CPU temperature
                    core_temp = None
                    package_temp = None
                    
                    for name, entries in temps.items():
                        if 'cpu' in name.lower() or 'core' in name.lower():
                            for entry in entries:
                                if entry.current:
                                    if 'package' in name.lower() or 'cpu' in name.lower():
                                        package_temp = entry.current
                                    else:
                                        core_temp = entry.current
                    
                    return core_temp, package_temp
            return None, None
        except Exception as e:
            logger.warning(f"CPU temperature error: {e}")
            return None, None
    
    @staticmethod
    def _get_cpu_power_and_fan() -> tuple:
        """Get CPU power and fan using WMI (blocking)."""
        try:
            import wmi
            c = wmi.WMI()
            
            power_w = None
            fan_rpm = None
            throttling = False
            
            # Try to get CPU power via MSAcpi_ThermalZoneTemperature
            try:
                for thermal_zone in c.MSAcpi_ThermalZoneTemperature():
                    temp_kelvin = thermal_zone.CurrentTemperature / 10.0
                    temp_celsius = temp_kelvin - 273.15
                    if temp_celsius > 80:  # High temp threshold
                        throttling = True
            except:
                pass
            
            # Try to get CPU fan speed
            try:
                for fan in c.Win32_Fan():
                    if fan.Active and fan.VariableSpeed:
                        try:
                            fan_rpm = int(fan.Speed)
                            break
                        except:
                            pass
            except:
                pass
            
            return power_w, fan_rpm, throttling
        except ImportError:
            logger.warning("WMI module not available for CPU power/fan metrics")
            return None, None, False
        except Exception as e:
            logger.warning(f"CPU power/fan WMI error: {e}")
            return None, None, False
    
    @staticmethod
    async def _collect_gpu_metrics() -> GPUMetrics:
        """
        Collect comprehensive GPU metrics using pynvml or WMI fallback.
        
        Returns:
            GPUMetrics: GPU telemetry including temperature, utilization,
                       VRAM, power, and fan speed
        """
        try:
            # Try NVIDIA GPU first using pynvml
            gpu_metrics = await SensorService._collect_nvidia_gpu_metrics()
            if gpu_metrics:
                return gpu_metrics
            
            # Fallback to WMI for other GPUs
            return await asyncio.to_thread(SensorService._collect_wmi_gpu_metrics)
        except Exception as e:
            logger.warning(f"GPU metrics collection error: {e}")
            raise
    
    @staticmethod
    async def _collect_nvidia_gpu_metrics() -> Optional[GPUMetrics]:
        """Collect NVIDIA GPU metrics using pynvml."""
        try:
            import pynvml
            
            await asyncio.to_thread(pynvml.nvmlInit)
            
            device_count = await asyncio.to_thread(pynvml.nvmlDeviceGetCount)
            if device_count == 0:
                return None
            
            # Get first GPU
            handle = await asyncio.to_thread(pynvml.nvmlDeviceGetHandle, 0)
            
            # Get GPU name
            gpu_name = await asyncio.to_thread(pynvml.nvmlDeviceGetName, handle)
            
            # Get temperatures
            try:
                core_temp = await asyncio.to_thread(pynvml.nvmlDeviceGetTemperature, handle, pynvml.NVML_TEMPERATURE_GPU)
            except:
                core_temp = None
            
            try:
                hotspot_temp = await asyncio.to_thread(pynvml.nvmlDeviceGetTemperature, handle, pynvml.NVML_TEMPERATURE_GPU)
            except:
                hotspot_temp = None
            
            # Get utilization
            try:
                util = await asyncio.to_thread(pynvml.nvmlDeviceGetUtilizationRates, handle)
                utilization_percent = util.gpu
            except:
                utilization_percent = None
            
            # Get fan speed
            try:
                fan_speed = await asyncio.to_thread(pynvml.nvmlDeviceGetFanSpeed, handle)
                fan_speed_percent = float(fan_speed)
            except:
                fan_speed_percent = None
            
            # Get VRAM
            try:
                mem_info = await asyncio.to_thread(pynvml.nvmlDeviceGetMemoryInfo, handle)
                vram_used_gb = mem_info.used / (1024**3)
                vram_total_gb = mem_info.total / (1024**3)
            except:
                vram_used_gb = None
                vram_total_gb = None
            
            # Get power
            try:
                power_w = await asyncio.to_thread(pynvml.nvmlDeviceGetPowerUsage, handle) / 1000.0
            except:
                power_w = None
            
            await asyncio.to_thread(pynvml.nvmlShutdown)
            
            return GPUMetrics(
                core_temperature_c=core_temp,
                hotspot_temperature_c=hotspot_temp,
                utilization_percent=utilization_percent,
                fan_speed_percent=fan_speed_percent,
                vram_used_gb=vram_used_gb,
                vram_total_gb=vram_total_gb,
                board_power_w=power_w,
                gpu_name=gpu_name.decode('utf-8') if isinstance(gpu_name, bytes) else gpu_name
            )
        except ImportError:
            logger.info("pynvml not available, falling back to WMI")
            return None
        except Exception as e:
            logger.warning(f"NVIDIA GPU metrics error: {e}")
            return None
    
    @staticmethod
    def _collect_wmi_gpu_metrics() -> GPUMetrics:
        """Collect GPU metrics using WMI fallback (blocking)."""
        try:
            import wmi
            c = wmi.WMI()
            
            gpu_name = None
            core_temp = None
            utilization_percent = None
            
            # Try to get GPU info
            for gpu in c.Win32_VideoController():
                if gpu.Name:
                    gpu_name = gpu.Name
                    break
            
            # Try to get GPU temperature via thermal zones
            try:
                for thermal_zone in c.MSAcpi_ThermalZoneTemperature():
                    temp_kelvin = thermal_zone.CurrentTemperature / 10.0
                    temp_celsius = temp_kelvin - 273.15
                    if 30 < temp_celsius < 100:  # Reasonable GPU temp range
                        core_temp = temp_celsius
                        break
            except:
                pass
            
            return GPUMetrics(
                core_temperature_c=core_temp,
                hotspot_temperature_c=None,
                utilization_percent=utilization_percent,
                fan_speed_percent=None,
                vram_used_gb=None,
                vram_total_gb=None,
                board_power_w=None,
                gpu_name=gpu_name
            )
        except ImportError:
            logger.warning("WMI module not available for GPU metrics")
            return GPUMetrics()
        except Exception as e:
            logger.warning(f"WMI GPU metrics error: {e}")
            return GPUMetrics()
    
    @staticmethod
    async def _collect_storage_metrics() -> List[StorageMetrics]:
        """
        Collect storage and NVMe/SSD health metrics using psutil and smartctl.
        
        Returns:
            List[StorageMetrics]: Storage metrics for all detected drives
        """
        try:
            # Get basic disk info via psutil
            disk_partitions = await asyncio.to_thread(psutil.disk_partitions)
            storage_metrics = []
            
            for partition in disk_partitions:
                if partition.fstype == '':  # Skip network/mount points
                    continue
                
                try:
                    # Get disk usage
                    usage = await asyncio.to_thread(psutil.disk_usage, partition.mountpoint)
                    
                    # Try to get S.M.A.R.T. data via smartctl
                    smart_data = await SensorService._get_smart_data(partition.device)
                    
                    storage_metric = StorageMetrics(
                        device_name=partition.device,
                        smart_health_percent=smart_data.get('health_percent') if smart_data else None,
                        total_bytes_written_tbw=smart_data.get('tbw') if smart_data else None,
                        temperature_c=smart_data.get('temperature') if smart_data else None,
                        reallocated_sector_count=smart_data.get('reallocated_sectors') if smart_data else None,
                        bad_sector_count=smart_data.get('bad_sectors') if smart_data else None,
                        available_capacity_gb=usage.free / (1024**3),
                        total_capacity_gb=usage.total / (1024**3)
                    )
                    storage_metrics.append(storage_metric)
                except Exception as e:
                    logger.warning(f"Error collecting metrics for {partition.device}: {e}")
                    continue
            
            return storage_metrics
        except Exception as e:
            logger.warning(f"Storage metrics collection error: {e}")
            raise
    
    @staticmethod
    async def _get_smart_data(device: str) -> Optional[dict]:
        """
        Get S.M.A.R.T. data using smartctl CLI tool.
        
        Args:
            device: Device path (e.g., 'C:' on Windows)
            
        Returns:
            Dictionary containing S.M.A.R.T. data or None if unavailable
        """
        try:
            # Convert Windows drive letter to smartctl format
            if device.endswith(':'):
                device = device.replace(':', '')
            
            # Try to run smartctl with JSON output
            process = await asyncio.create_subprocess_exec(
                'smartctl',
                '--json',
                '--health',
                '--info',
                f'\\\\.\\{device}',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.warning(f"smartctl failed for {device}: {stderr.decode()}")
                return None
            
            # Parse JSON output
            smart_output = json.loads(stdout.decode())
            
            # Extract relevant metrics
            smart_data = {}
            
            # Health percentage
            if 'smart_status' in smart_output:
                smart_data['health_percent'] = 100 if smart_output['smart_status'].get('passed') else 0
            
            # Temperature
            if 'temperature' in smart_output:
                temp_data = smart_output['temperature']
                if isinstance(temp_data, dict) and 'current' in temp_data:
                    smart_data['temperature'] = temp_data['current']
            
            # TBW (Total Bytes Written)
            if 'nvme_smart_health_information_log' in smart_output:
                nvme_data = smart_output['nvme_smart_health_information_log']
                if 'data_units_written' in nvme_data:
                    # Convert data units (512-byte units) to TBW
                    data_units = nvme_data['data_units_written']
                    tbw = (data_units * 512) / (1024**4)
                    smart_data['tbw'] = tbw
            
            # Reallocated sectors
            if 'ata_smart_attributes' in smart_output:
                for attr in smart_output['ata_smart_attributes']['table']:
                    if attr.get('id') == 5:  # Reallocated Sector Count
                        smart_data['reallocated_sectors'] = attr.get('raw', {}).get('value', 0)
                    if attr.get('id') == 196:  # Reallocation Event Count
                        smart_data['reallocated_sectors'] = attr.get('raw', {}).get('value', 0)
            
            # Bad sectors
            if 'ata_smart_attributes' in smart_output:
                for attr in smart_output['ata_smart_attributes']['table']:
                    if attr.get('id') == 197:  # Current Pending Sector Count
                        smart_data['bad_sectors'] = attr.get('raw', {}).get('value', 0)
            
            return smart_data if smart_data else None
            
        except FileNotFoundError:
            logger.info("smartctl not found in PATH, S.M.A.R.T. data unavailable")
            return None
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse smartctl JSON output: {e}")
            return None
        except Exception as e:
            logger.warning(f"smartctl execution error: {e}")
            return None
    
    @staticmethod
    async def _collect_ram_metrics() -> RAMMetrics:
        """
        Collect RAM and WHEA hardware error metrics using psutil and pywin32.
        
        Returns:
            RAMMetrics: RAM telemetry including usage, pagefile, and WHEA errors
        """
        try:
            # Get RAM metrics via psutil
            mem = await asyncio.to_thread(psutil.virtual_memory)
            swap = await asyncio.to_thread(psutil.swap_memory)
            
            usage_percent = mem.percent
            used_gb = mem.used / (1024**3)
            total_gb = mem.total / (1024**3)
            pagefile_usage_percent = swap.percent if swap.total > 0 else 0.0
            
            # Get WHEA error count from Windows Event Logs
            whea_error_count = await asyncio.to_thread(SensorService._get_whea_error_count)
            
            return RAMMetrics(
                usage_percent=usage_percent,
                used_gb=used_gb,
                total_gb=total_gb,
                pagefile_usage_percent=pagefile_usage_percent,
                whea_error_count=whea_error_count
            )
        except Exception as e:
            logger.warning(f"RAM metrics collection error: {e}")
            raise
    
    @staticmethod
    def _get_whea_error_count() -> int:
        """Get WHEA hardware error count from Windows Event Logs (blocking)."""
        try:
            import win32evtlog
            import win32con
            
            server = None
            log_type = 'System'
            hand = win32evtlog.OpenEventLog(server, log_type)
            
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
            error_count = 0
            
            # Read last 1000 events
            events = win32evtlog.ReadEventLog(hand, flags, 0)
            
            for event in events:
                if event.SourceName == 'WHEA-Logger':
                    if event.EventID in [18, 19, 20]:  # WHEA error event IDs
                        error_count += 1
            
            win32evtlog.CloseEventLog(hand)
            return error_count
            
        except ImportError:
            logger.warning("pywin32 not available for WHEA error collection")
            return 0
        except Exception as e:
            logger.warning(f"WHEA error collection error: {e}")
            return 0
    
    @staticmethod
    async def _collect_power_vrm_metrics() -> PowerAndVRMMetrics:
        """
        Collect power delivery and VRM thermal metrics using WMI.
        
        Returns:
            PowerAndVRMMetrics: Power and VRM telemetry including temperatures,
                               voltage, and fan speeds
        """
        try:
            return await asyncio.to_thread(SensorService._get_wmi_power_vrm_metrics)
        except Exception as e:
            logger.warning(f"Power/VRM metrics collection error: {e}")
            raise
    
    @staticmethod
    def _get_wmi_power_vrm_metrics() -> PowerAndVRMMetrics:
        """Get power and VRM metrics using WMI (blocking)."""
        try:
            import wmi
            c = wmi.WMI()
            
            vrm_temp = None
            psu_voltage = None
            chipset_temp = None
            chassis_fan_rpm = None
            
            # Try to get motherboard/VRM temperature
            try:
                for thermal_zone in c.MSAcpi_ThermalZoneTemperature():
                    temp_kelvin = thermal_zone.CurrentTemperature / 10.0
                    temp_celsius = temp_kelvin - 273.15
                    # VRM temps are typically higher than ambient
                    if 50 < temp_celsius < 120:
                        vrm_temp = temp_celsius
                        break
            except:
                pass
            
            # Try to get PSU voltage via voltage probes
            try:
                for voltage in c.Win32_VoltageProbe():
                    if voltage.Name and '+12V' in voltage.Name:
                        try:
                            psu_voltage = float(voltage.CurrentReading)
                            break
                        except:
                            pass
            except:
                pass
            
            # Try to get chipset temperature
            try:
                for thermal_zone in c.MSAcpi_ThermalZoneTemperature():
                    temp_kelvin = thermal_zone.CurrentTemperature / 10.0
                    temp_celsius = temp_kelvin - 273.15
                    # Chipset temps are typically moderate
                    if 30 < temp_celsius < 80:
                        if vrm_temp is None or abs(temp_celsius - vrm_temp) > 10:
                            chipset_temp = temp_celsius
                            break
            except:
                pass
            
            # Try to get chassis fan speed
            try:
                for fan in c.Win32_Fan():
                    if fan.Active and fan.VariableSpeed:
                        try:
                            fan_rpm = int(fan.Speed)
                            # Chassis fans typically run at different speeds than CPU fans
                            if 500 < fan_rpm < 3000:
                                chassis_fan_rpm = fan_rpm
                                break
                        except:
                            pass
            except:
                pass
            
            return PowerAndVRMMetrics(
                vrm_temperature_c=vrm_temp,
                psu_12v_voltage=psu_voltage,
                chipset_temperature_c=chipset_temp,
                chassis_fan_speed_rpm=chassis_fan_rpm
            )
            
        except ImportError:
            logger.warning("WMI module not available for power/VRM metrics")
            return PowerAndVRMMetrics()
        except Exception as e:
            logger.warning(f"WMI power/VRM metrics error: {e}")
            return PowerAndVRMMetrics()
