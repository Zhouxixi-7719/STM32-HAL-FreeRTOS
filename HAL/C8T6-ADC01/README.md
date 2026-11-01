# C8T6-ADC01

基于 STM32F103C8T6 和 STM32 HAL 库的 ADC 采样练习。程序读取 ADC1 通道 0，并通过 USART1 周期性输出采样值和换算后的电压。

## 功能与引脚

- PA0：ADC1_IN0 模拟输入。
- PA1：采样期间点亮 LED（低电平有效）。
- PA9 / PA10：USART1_TX / USART1_RX，串口配置为 9600 baud、8 数据位、无校验、1 个停止位（8N1）。
- 每 500 ms 进行一次 ADC 采样并发送结果。

## 工程文件

- CubeMX 配置：`C8T6-ADC01.ioc`
- Keil 工程：`MDK-ARM/C8T6-ADC01.uvprojx`
- 主程序：`Core/Src/main.c`

## 使用说明

将模拟电压接入 PA0，电压范围应保持在 MCU 的供电范围内（0 至 3.3 V）。通过串口转 USB 模块连接 PA9（MCU TX）和 GND，在串口终端选择 9600 baud、8N1 查看采样值与电压。
