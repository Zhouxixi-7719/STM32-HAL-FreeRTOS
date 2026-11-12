# test07_rtc

基于 STM32CubeMX 与 STM32 HAL 的实时时钟示例工程，芯片为 STM32G431RBT6（LQFP64），包含 Keil MDK-ARM 工程。

## 时钟与外设

- 系统时钟使用 HSI 16 MHz，经 PLL 配置为 80 MHz；同时启用 LSI 作为 RTC 时钟源。
- RTC 使用 24 小时制，异步预分频为 127、同步预分频为 255。
- LCD 通过工程内的并行 GPIO 驱动显示内容，使用 GPIOC 数据总线以及 GPIOB、PA8 控制线；具体 LCD 型号：待补充。
- `MX_GPIO_Init()` 将 GPIOC 的 PC8-PC15 和 GPIOD 的 PD2 配置为低速推挽输出；LED 控制函数通过 PC15 输出模式状态，并操作 PD2。

## 实现功能

- 启动时初始化 RTC，并将日历设为 2026-11-12（星期四）15:30:10。
- 配置 RTC Alarm A，在每月 12 日 15:30:20 触发中断。闹钟回调将 `led_mode` 清零；主循环持续读取 RTC 日期和时间并在 LCD 上显示，同时调用 LED 显示函数。
- 工程还包含 PB6/PB7 GPIO 模拟 I2C 驱动代码；当前主程序路径未调用该驱动。

闹钟触发后的实机表现与 LCD 型号：待补充。
