# test07_rtc

## 工程配置

- MCU：STM32G431RBT6，LQFP64（工程配置文件标识为 `STM32G431R(6-8-B)Tx`）。
- 工程由 STM32CubeMX 配置文件和 Keil MDK 工程文件组成。

## 外设与接口

- RTC：使用芯片内部 LSI 作为时钟源，采用 24 小时制。
- RTC Alarm A：启用闹钟中断，配置为每月 1 日 15:30:00；中断由 `RTC_Alarm_IRQn` 处理。应用层中断回调行为待补充。
- 未配置外接 RTC 器件或 RTC 通信总线。

## 实现功能

程序启动时将 RTC 日历设置为 2026 年 11 月 12 日（星期四）15:30:10，并配置 Alarm A。主循环当前为空，没有显示或其他闹钟触发后的应用逻辑；实机验证状态待补充。


## 函数配置
打开RTC的Activate Clock Source和Activate Clock Source，设置好时钟的起始时间

## 时钟部分
RTC开启之后，每次上电时钟就会开始运行，rec.h会给出用于存放时间的结构体：
```c
RTC_TimeTypeDef sTime = {0};
RTC_DateTypeDef sDate = {0};
```
要获取配置好之后rtc时钟开始运行的时，就要使用：
```c
HAL_RTC_GetTime(&hrtc, &sTime, RTC_FORMAT_BIN);
HAL_RTC_GetDate(&hrtc, &sDate, RTC_FORMAT_BIN);
```
来将rtc的时间存进上面两个结构体中，所以，在fun.c等文件中读取时间时，需要先定义上面两个结构体，之后就可以使用这两个结构体的时间：
完整代码：
```c
fun.c

RTC_TimeTypeDef sTime = {0};
RTC_DateTypeDef sDate = {0};

void lcd_show(void)
{   
    HAL_RTC_GetTime(&hrtc, &sTime, RTC_FORMAT_BIN);
    HAL_RTC_GetDate(&hrtc, &sDate, RTC_FORMAT_BIN);
    
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);
    sprintf(text, " %2d:%2d:%2d          ", sTime.Hours, sTime.Minutes, sTime.Seconds);
    LCD_DisplayStringLine(Line2, (uint8_t *)text);
    sprintf(text, " %d-%d-%d-%d        ",sDate.Year, sDate.Month, sDate.WeekDay, sDate.Date);
    LCD_DisplayStringLine(Line3, (uint8_t *)text);

}

```

## 闹钟中断事件
在开启中断之后，rtc时钟达到了设定的闹钟时间之后，就会触发中断回调函数：
```c
void HAL_RTC_AlarmAEventCallback(RTC_HandleTypeDef *hrtc)
{
    led_mode = 0;
}
```
在内部把标志位置0，在主循环轮询的lcd_show()中检测标志位来控制LED的开关。
**在Alarm A的初始化中，需要注意将Alarm Date设置为与Calendar Time同一天，这样十秒的闹钟才会正常工作。**
