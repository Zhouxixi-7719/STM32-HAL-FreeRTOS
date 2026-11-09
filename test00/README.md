# test00

## 工程概况

- 芯片：STM32G431RBT6，STM32G4 系列，LQFP64。
- 工程配置：STM32CubeMX `test00.ioc`，目标工具链为 Keil MDK-ARM。
- 时钟：源码使用外部 HSE，经 PLL 配置后 SYSCLK/HCLK 为 80 MHz；`.ioc` 中 HSE 为 24 MHz。
- 已配置外设：RCC、SYS/SysTick、NVIC。
- 用户 GPIO：`.ioc` 未配置用户 GPIO，`MX_GPIO_Init()` 中没有应用层 GPIO 功能配置。
- 当前功能：HAL/CubeMX 最小启动工程，初始化后进入空循环。
- FreeRTOS 任务或其他应用功能：待补充。
