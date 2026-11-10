# test04_adc

基于 STM32CubeMX 与 STM32 HAL 的 ADC 采样示例工程。

## 芯片与时钟

- 芯片：STM32G431RBT6（工程配置中的器件型号为 STM32G431RBTx，LQFP64）。
- 系统时钟：HSI 16 MHz 经 PLL 配置为 80 MHz。

## 外设与引脚

- ADC1：12 位、单次软件触发转换，通道 ADC1_IN11，模拟输入引脚 PB12。
- ADC2：12 位、单次软件触发转换，通道 ADC2_IN15，模拟输入引脚 PB15。
- LCD：使用工程自带的 CT117E LCD 驱动；驱动通过 GPIOB 和 GPIOC 访问显示屏。

## 功能

- 初始化 GPIO、ADC1、ADC2 和 LCD。
- 主循环调用 `lcd_show()`，通过 ADC1 读取一次转换值，按代码中的 `ADC值 * 3.3 / 4024` 计算并显示 `adc_volR38`。
- 工程中配置了 ADC2，但当前 ADC2 采样调用仍被注释；`adc_volR37` 没有在现有代码中更新，R37 对应的实际采样与显示逻辑待补充。

## 构建

工程包含 Keil MDK-ARM 工程文件 `MDK-ARM/test04_adc.uvprojx`。Keil 编译产物不纳入版本控制。


## AD'c