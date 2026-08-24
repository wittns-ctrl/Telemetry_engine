"""
Debug script to test AnomalyEngine alert triggering
"""
import asyncio
from datetime import datetime, timezone
from beanie import PydanticObjectId
from app.models.telemetry import TelemetrySnapshot, CPUMetrics
from app.services.anomaly_engine import AnomalyEngine
from app.core.anomaly_rules import BASELINE_RULES, evaluate_rule

async def test_anomaly_engine():
    print("=== AnomalyEngine Debug Test ===\n")
    
    # Create a simple snapshot with high CPU temp
    snapshot = TelemetrySnapshot(
        timestamp=datetime.now(timezone.utc),
        sensor_id="test_sensor",
        cpu=CPUMetrics(
            core_temperature_c=95.0,
            package_temperature_c=90.0,
            utilization_percent=50.0
        )
    )
    
    print(f"Snapshot CPU Core Temp: {snapshot.cpu.core_temperature_c}°C")
    
    # Check the CPU_OVERHEATING_CRITICAL rule
    cpu_rule = None
    for rule in BASELINE_RULES:
        if rule.name == "CPU_OVERHEATING_CRITICAL":
            cpu_rule = rule
            break
    
    if cpu_rule:
        print(f"\nRule: {cpu_rule.name}")
        print(f"Threshold: {cpu_rule.threshold}°C")
        print(f"Operator: {cpu_rule.operator}")
        
        # Extract metric value
        metric_value = cpu_rule.metric_extractor(snapshot)
        print(f"Extracted metric value: {metric_value}")
        
        # Evaluate rule
        is_breaching = evaluate_rule(cpu_rule, metric_value)
        print(f"Is breaching: {is_breaching}")
        
        # Test with engine - use valid ObjectIds
        print("\n--- Testing with AnomalyEngine ---")
        engine = AnomalyEngine()
        engine.debounce_enabled = False
        
        # Use valid ObjectId strings
        user_id = str(PydanticObjectId())
        device_id = str(PydanticObjectId())
        
        print(f"Using user_id: {user_id}")
        print(f"Using device_id: {device_id}")
        
        alerts = await engine.evaluate_snapshot(
            user_id=user_id,
            device_id=device_id,
            snapshot=snapshot
        )
        
        print(f"Alerts returned: {len(alerts)}")
        if alerts:
            for alert in alerts:
                print(f"  - {alert.rule_name}: {alert.message}")
        else:
            print("  No alerts triggered!")
    else:
        print("CPU_OVERHEATING_CRITICAL rule not found!")

if __name__ == "__main__":
    asyncio.run(test_anomaly_engine())
