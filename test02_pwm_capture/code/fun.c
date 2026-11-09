#include "headfile.h"

uint16_t fre, capture_value;

char text[20];      /*屏幕的一行只能显示20个字符*/
void lcd_show(void)
{
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);
    sprintf(text, "       fre:%d       ", fre);
    LCD_DisplayStringLine(Line2, (uint8_t *)text);
}

void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    capture_value = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
    TIM17->CNT = 0;
    fre = 80000000 / (80 * capture_value);       //输入捕获频率 = 系统频率 / （预分频器 * 捕获值）
    
    
}

