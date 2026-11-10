# test03-input-capture

## 工程概况

- 芯片：STM32G431RBT6，STM32G4 系列，LQFP64。
- 工程配置：STM32CubeMX `test03-input-capture.ioc`，包含 Keil MDK-ARM 工程。
- 时钟：HSI 16 MHz 经 PLL 配置为 SYSCLK/HCLK 80 MHz。
- 使用外设：
  - TIM2_CH1：PA15，上升沿输入捕获，预分频 80-1，计数器周期为 32 位最大值。
  - TIM16_CH1：PB4，上升沿输入捕获，预分频 80-1，计数器周期 65535。
  - GPIO、LCD 并口显示驱动及对应定时器中断。
- 实现功能：同时捕获两路输入信号的周期，并按 `80000000 / (80 * capture_value)` 计算频率，在 LCD 上显示 `fre1` 和 `fre2`。
- LCD 型号、两路输入信号来源及硬件连接说明：待补充。
