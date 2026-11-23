"""
The agent's readings follow Windows Task Manager's rules. These tests feed raw
counter values in and check the figures that come out, so they run anywhere.
"""

from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics
from app.services.perf_counters import PerfSample, build_sample, busiest_adapter, gpu_busiest_engine
from app.services.process_sampler import RawProcess, top_processes
from app.services.sensor_service import SensorService

GIB = 1024 ** 3


def test_gpu_is_the_busiest_engine_summed_across_processes():
    engines = {
        # Two programs on the 3D engine add up to 70%.
        "pid_100_luid_0x0_0x141CD_phys_0_eng_0_engtype_3D": 50.0,
        "pid_200_luid_0x0_0x141CD_phys_0_eng_0_engtype_3D": 20.0,
        # The video engine is busy too, but less.
        "pid_300_luid_0x0_0x141CD_phys_0_eng_3_engtype_VideoDecode": 40.0,
    }
    assert gpu_busiest_engine(engines) == 70.0


def test_gpu_is_capped_at_100_and_empty_when_there_are_no_engines():
    assert gpu_busiest_engine({"pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D": 130.0}) == 100.0
    assert gpu_busiest_engine({}) is None


def test_cpu_speed_is_base_frequency_times_performance():
    sample = build_sample({"cpu_utility": 57.3, "cpu_base_mhz": 1688.0, "cpu_performance": 77.9}, {})
    assert sample.cpu_percent == 57.3
    assert sample.cpu_speed_ghz == 1.31  # not the rated 1.7 GHz


def test_cpu_utility_is_capped_like_task_manager_and_falls_back_to_processor_time():
    assert build_sample({"cpu_utility": 134.0}, {}).cpu_percent == 100.0
    assert build_sample({"cpu_time": 42.0}, {}).cpu_percent == 42.0


def test_disk_active_time_is_100_minus_idle_time():
    sample = build_sample({"disk_idle": 97.6, "disk_read": 250_000.0, "disk_write": 1_000.0}, {})
    assert sample.disk_active_percent == 2.4
    assert sample.disk_read_bytes_per_s == 250_000.0


def test_network_uses_the_busiest_adapter_with_its_link_speed():
    name, rx, tx, link = busiest_adapter(
        {"Ethernet": 0.0, "Wi-Fi": 5_000.0},
        {"Ethernet": 0.0, "Wi-Fi": 1_000.0},
        {"Ethernet": 1_000_000_000.0, "Wi-Fi": 144_400_000.0},
    )
    assert (name, rx, tx, link) == ("Wi-Fi", 5_000.0, 1_000.0, 144.4)


def test_missing_counters_stay_unknown():
    sample = build_sample({}, {})
    assert sample.cpu_percent is None and sample.cpu_speed_ghz is None
    assert sample.pagefile_percent is None and sample.gpu_percent is None


def test_process_cpu_is_share_of_all_processors_since_the_last_sample():
    before = {(10, 1): RawProcess(10, "game.exe", 1, cpu_ticks=0, private_bytes=0, io_bytes=0)}
    now = [
        # 4 s of CPU time over 2 s on 8 logical processors = 25% of the whole CPU.
        RawProcess(10, "game.exe", 1, cpu_ticks=4 * 10 ** 7, private_bytes=3 * GIB, io_bytes=2_000_000),
        RawProcess(0, "System Idle Process", 0, cpu_ticks=10 ** 9, private_bytes=0, io_bytes=0),
        RawProcess(20, "new.exe", 5, cpu_ticks=10 ** 7, private_bytes=None, io_bytes=None),
    ]
    rows = top_processes(before, now, seconds=2.0, cpus=8)
    assert [r.name for r in rows] == ["game.exe", "new.exe"]  # idle process left out
    game = rows[0]
    assert game.cpu_percent == 25.0
    assert game.memory_mb == 3072.0
    assert game.disk_bytes_per_s == 1_000_000.0
    assert rows[1].cpu_percent == 0.0  # no earlier reading for it yet


def test_a_reused_pid_is_not_compared_with_the_old_process():
    before = {(10, 1): RawProcess(10, "old.exe", 1, cpu_ticks=0, private_bytes=0, io_bytes=0)}
    now = [RawProcess(10, "new.exe", 99, cpu_ticks=10 ** 9, private_bytes=0, io_bytes=0)]
    assert top_processes(before, now, seconds=2.0, cpus=4)[0].cpu_percent == 0.0


def test_counters_replace_psutil_values_and_no_page_file_means_unknown():
    cpu = CPUMetrics(utilization_percent=10.0, clock_speed_ghz=1.7)
    gpu = GPUMetrics(gpu_name="Intel Iris Xe")
    ram = RAMMetrics(usage_percent=60.0, pagefile_usage_percent=0.0)
    perf = PerfSample(cpu_percent=57.0, cpu_speed_ghz=1.31, gpu_percent=96.0, gpu_dedicated_gb=0.0,
                      gpu_shared_gb=3.6, processes=400, threads=5500, handles=170000, uptime_seconds=3600,
                      committed_gb=26.1, commit_limit_gb=31.6, pagefile_percent=None)
    SensorService._apply_perf_counters(cpu, gpu, ram, perf)
    assert (cpu.utilization_percent, cpu.clock_speed_ghz, cpu.process_count, cpu.uptime_seconds) == (57.0, 1.31, 400, 3600)
    assert (gpu.utilization_percent, gpu.shared_memory_used_gb) == (96.0, 3.6)
    assert ram.pagefile_usage_percent is None  # not a misleading 0%
    assert ram.committed_gb == 26.1


def test_nvidia_figures_win_over_the_counters():
    gpu = GPUMetrics(utilization_percent=40.0, vram_used_gb=2.0)
    SensorService._apply_perf_counters(CPUMetrics(), gpu, RAMMetrics(), PerfSample(gpu_percent=96.0, gpu_dedicated_gb=0.5))
    assert (gpu.utilization_percent, gpu.vram_used_gb) == (40.0, 2.0)
