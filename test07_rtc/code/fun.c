#include "headfile.h"

uint16_t adc_value1, adc_value2;
double adc_volR38, adc_volR37;
char text[20];      /*屏幕的一行只能显示20个字符*/
uint8_t led_mode = 1;
RTC_TimeTypeDef sTime = {0};
RTC_DateTypeDef sDate = {0};

void led_show(uint8_t led, uint8_t mode)
{
    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_2, GPIO_PIN_SET);
    
    if(mode)
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_8 << (led - 1), mode ? GPIO_PIN_SET : GPIO_PIN_RESET);
    else
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_8 << (led - 1), mode ? GPIO_PIN_SET : GPIO_PIN_RESET);
    
    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_2, GPIO_PIN_RESET);
}

void lcd_show(void)
{   
    HAL_RTC_GetTime(&hrtc, &sTime, RTC_FORMAT_BIN);
    HAL_RTC_GetDate(&hrtc, &sDate, RTC_FORMAT_BIN);
    
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);
    sprintf(text, " %2d:%2d:%2d          ", sTime.Hours, sTime.Minutes, sTime.Seconds);
    LCD_DisplayStringLine(Line2, (uint8_t *)text);
    sprintf(text, " %d-%d-%d-%d        ",sDate.Year, sDate.Month, sDate.Date, sDate.WeekDay);
    LCD_DisplayStringLine(Line3, (uint8_t *)text);

    led_show(8, led_mode);
}



void HAL_RTC_AlarmAEventCallback(RTC_HandleTypeDef *hrtc)
{
    led_mode = 0;
}
