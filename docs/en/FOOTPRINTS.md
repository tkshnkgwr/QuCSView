# Resource Footprints & Benchmark

**English** | [日本語版](../../docs/ja/FOOTPRINTS.md)

---

## 1. Resource Target vs. Benchmark Results

Environment: Windows 11 Pro 64-bit, Intel Core i5-12400 (6 Cores), 16GB RAM, NVMe SSD

| Metric                           | Target       | Benchmark (v1.1.2)   | Status  |
| :------------------------------- | :----------- | :------------------- | :------ |
| **Cold Startup Time**            | `< 300 ms`   | **185 ms**           | ✅ PASS |
| **100K Rows CSV (15MB) Open**    | `< 200 ms`   | **45 ms**            | ✅ PASS |
| **1M Rows CSV (150MB) Open**     | `< 500 ms`   | **180 ms**           | ✅ PASS |
| **500MB Huge CSV Open**          | `< 1,000 ms` | **380 ms**           | ✅ PASS |
| **200-Col Wide Cell Select**     | `< 50 ms`    | **2 ms (Instant)**   | ✅ PASS |
| **TSV Clipboard Copy**           | `< 50 ms`    | **0 ms (Local)**     | ✅ PASS |
| **Idle RAM Consumption**         | `< 40 MB`    | **31.8 MB**          | ✅ PASS |
| **Peak RAM (500MB File)**        | `< 60 MB`    | **36.5 MB**          | ✅ PASS |
| **Idle CPU Utilization**         | `< 0.1 %`    | **0.0 %**            | ✅ PASS |
| **60FPS Scroll CPU Load**        | `< 5.0 %`    | **1.8 %**            | ✅ PASS |
| **Binary Executable Size**       | `< 15 MB`    | **12.4 MB**          | ✅ PASS |

---

## 2. Benchmark Comparison (500MB Dataset)

| Application                | 500MB RAM Footprint | Leading Zero Mutation | Open Latency |
| :------------------------- | :------------------ | :-------------------- | :----------- |
| **QuCSView**               | **36.5 MB**         | **Zero (Protected)**  | **0.38 s**   |
| Microsoft Excel            | ~1,200 MB           | Yes (`0123` -> `123`) | 12.5 s       |
| Standard Electron CSV App  | ~1,850 MB           | Config-dependent      | 8.2 s        |
| Windows Notepad            | ~900 MB             | No (No grid UI)       | 5.8 s        |
