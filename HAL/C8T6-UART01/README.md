# C8T6-UART01

基于 STM32F103C8T6 和 HAL 库的 USART1 配置练习。

## 当前配置

- USART1 异步收发，波特率 9600，8 数据位、无校验、1 个停止位（8N1）。
- PA9 为 USART1_TX，PA10 为 USART1_RX；未启用硬件流控。
- 当前主循环尚未加入实际的串口发送或接收逻辑。

## 工程文件

- CubeMX 配置：`C8T6-UART01.ioc`
- Keil 工程：`MDK-ARM/C8T6-UART01.uvprojx`
