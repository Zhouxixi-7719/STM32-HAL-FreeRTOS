# test02_pwm_capture

## 工程概况

- 芯片：STM32G431RBT6，STM32G4 系列，LQFP64。
- 工程配置：STM32CubeMX `test02_pwm_capture.ioc`，同时包含 Keil MDK-ARM 和 EWARM 工程文件。
- 时钟：
  - `Core/Src/main.c` 使用 HSI 作为 PLL 输入，PLLN=10、PLLR=/2，按默认 HSI 16 MHz 计算为 80 MHz。
  - `.ioc` 中记录的 SYSCLK/HCLK 为 16 MHz、HSE 为 8 MHz，与当前 `main.c` 时钟代码不一致，待核对。
- 使用外设：
  - TIM2_CH2：PA1，配置为输出比较通道，预分频 800-1、周期 100-1。
  - TIM17_CH1：PA7，配置为上升沿输入捕获，计数周期 65535，并启用 TIM17 中断。
  - GPIO 和并口 LCD 驱动。
- 已实现代码：
  - LCD 显示标题和 `fre` 变量。
  - `HAL_TIM_IC_CaptureCallback()` 读取 TIM17 捕获值、清零计数器，并按 `80000000 / (80 * capture_value)` 计算频率。
- 当前运行状态：
  - `main.c` 中 `HAL_TIM_IC_Start_IT()` 和 `HAL_TIM_PWM_Start()` 仍为注释代码。
  - 当前主循环只调用 LCD 显示函数，因此输入捕获/PWM 启动状态待补充。
- LCD 型号、输入信号和 PWM 输出用途：待补充。
