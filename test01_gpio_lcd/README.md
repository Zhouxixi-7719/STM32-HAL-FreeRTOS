# test01_gpio_lcd

## 工程概况

- 芯片：STM32G431RBT6，STM32G4 系列，LQFP64。
- 工程配置：STM32CubeMX `test01_gpio_lcd.ioc`，目标工具链为 Keil MDK-ARM。
- 时钟：外部 HSE 24 MHz，经 PLL 配置后 SYSCLK/HCLK 为 80 MHz。
- 使用外设：
  - GPIO：PC8-PC15 用作 LED 输出；PD2 用作 LED 写入控制；PB0-PB2、PA0 为上拉输入按键。
  - TIM2：基础定时器中断，周期回调中切换 `led_mode`。
  - TIM3：基础计数器，用于按键短按/长按时间判断。
  - LCD：`code/lcd.c` 实现并口 LCD 驱动，GPIOC 作为数据总线，PA8、PB5、PB8、PB9 作为控制线。
- 实现功能：
  - 扫描四个按键并更新 `count`。
  - B4 切换 LCD 中 `count`、`para1`、`para2` 三行的高亮显示。
  - LCD 显示标题、计数值和参数占位文本。
  - TIM2 周期回调控制 LED8 闪烁状态。
- LCD 型号或具体硬件板卡信息：待补充。
