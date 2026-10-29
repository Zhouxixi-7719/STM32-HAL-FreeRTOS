# C8T6-KEY01

基于 STM32F103C8T6 和 HAL 库的按键扫描练习。

## 功能

- PA7、PB1、PB11 作为上拉输入，按键按下时读到低电平。
- PA7 按键消抖后翻转 PA2；PB1 按键消抖后翻转 PA1；PB11 按键消抖后同时翻转 PA1、PA2。
- 按键扫描使用约 20 ms 延时消抖，并等待按键释放。

## 工程文件

- CubeMX 配置：`C8T6-KEY01.ioc`
- Keil 工程：`MDK-ARM/C8T6-KEY01.uvprojx`
