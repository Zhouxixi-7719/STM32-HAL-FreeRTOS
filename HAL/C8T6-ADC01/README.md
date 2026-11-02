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


## ADC中断形式和轮询形式

### 使用轮询ADC：
每次使用ADC时，在定义好的函数中先用
```c
HAL_ADC_Start(&hadc1);
```
开启ADC通道，在主循环中不断轮询调用：
```c
void ADC_Get_Value()
{
    HAL_ADC_Start(&hadc1);
    LED1_ON();
    if(HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK)
    {
        ADC_Value = HAL_ADC_GetValue(&hadc1);
        ADC_Volt = ADC_Value * 330 / 4096;
    }
    UR1_Send_Info();
    LED1_OFF();
    HAL_ADC_Stop(&hadc1);
}
```

### 使用中断ADC
先在主循环中不断开启
```c
HAL_ADC_Start_IT(&hadc1);
```
开启ADC中断，然后在中断回调函数中，判断ADC的外设实例：
```c
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef* hadc)
{
    if(hadc->Instance == ADC1)
    {
        LED1_ON();
        ADC_Value = HAL_ADC_GetValue(&hadc1);
        ADC_Volt = ADC_Value * 330 / 4096;
        UR1_Send_Info();
        LED1_OFF();
    }
}
```

### 串口信息的发送
先使用sprintf()函数把要发送的信息写进字符串里，然后使用串口发送该字符串：
```c
void UR1_Send_Info()
{
    sprintf((char*)str_buff, "采样值： %d, 电压值：%d.%d%dV\r\n", ADC_Value,                                                                         ADC_Volt/100, 
                                                               (ADC_Volt%100)/10,                                                                  ADC_Volt%10);
	HAL_UART_Transmit(&huart1, str_buff, sizeof(str_buff), 10000);
}

```
