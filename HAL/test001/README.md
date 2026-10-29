# test001

基于 STM32F103RBT6 和 HAL 库的 GPIO 测试工程。

## 当前内容

- CubeMX 初始化 GPIOC 的 PC8–PC15 和 GPIOD 的 PD2 为推挽输出。
- `main.c` 当前没有应用逻辑；`code/fun.c` 中的 `led_show()` 辅助函数尚未从主程序调用。

## 工程文件

- CubeMX 配置：`test001.ioc`
- Keil 工程：`MDK-ARM/test001.uvprojx`
