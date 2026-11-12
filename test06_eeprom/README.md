# test06_eeprom

## 工程配置

- MCU：STM32G431RBT6，LQFP64（工程配置文件标识为 `STM32G431R(6-8-B)Tx`）。
- 工程由 STM32CubeMX 配置文件和 Keil MDK 工程文件组成。

## 外设与接口

- GPIO：用于软件模拟 I2C 和并行 LCD 的数据、控制信号。
- EEPROM：通过 GPIO 模拟 I2C 通信，SCL 使用 PB6，SDA 使用 PB7。EEPROM 的具体型号、容量和实际接线待补充。
- LCD：通过 GPIO 并行接口驱动，数据总线使用 GPIOC，控制信号使用 GPIOA/GPIOB。LCD 屏幕及控制器的具体型号、实际接线待补充。

## 实现功能

程序初始化 GPIO、LCD 和软件 I2C 后，向 EEPROM 地址 0 写入数值 10，再读取该地址，并在 LCD 第二行显示读回的数值。该说明依据当前代码逻辑，实机验证状态待补充。
