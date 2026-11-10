#include "headfile.h"

uint32_t fre1, capture_value1, fre2, capture_value2;

char text[20];      /*屏幕的一行只能显示20个字符*/
void lcd_show(void)
{
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);
    sprintf(text, "   R39_fre1:%d       ", fre1);
    LCD_DisplayStringLine(Line2, (uint8_t *)text);
    sprintf(text, "   R40_fre2:%d       ", fre2);
    LCD_DisplayStringLine(Line4, (uint8_t *)text);

}

void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    if(htim->Instance == TIM16)         //频率输出1 R39
    {
        capture_value1 = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
        TIM16->CNT = 0;
        fre1 = 80000000 / (80 * capture_value1);       //输入捕获频率 = 系统频率 / （预分频器 * 捕获值）
    }
    if(htim->Instance == TIM2)          //频率输出2 R40
    {
        capture_value2 = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
        TIM2->CNT = 0;
        fre2 = 80000000 / (80 * capture_value2);
    }    
}

