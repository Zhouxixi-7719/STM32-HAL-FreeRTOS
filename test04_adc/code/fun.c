#include "headfile.h"

uint16_t adc_value1, adc_value2;
double adc_volR38, adc_volR37;
char text[20];      /*屏幕的一行只能显示20个字符*/
void lcd_show(void)
{   
    adc_volR38 = get_vol(&hadc1);
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);
    sprintf(text, "   adc_volR38:%.2f    ", adc_volR38);
    LCD_DisplayStringLine(Line2, (uint8_t *)text);
    sprintf(text, "   adc_volR37:%.2f    ", adc_volR37);
    LCD_DisplayStringLine(Line4, (uint8_t *)text);

}

double get_vol(ADC_HandleTypeDef * hadc)
{
    HAL_ADC_Start(hadc);                      //R38
    adc_value1 = HAL_ADC_GetValue(hadc);
//    HAL_ADC_Start(hadc);                    //R37
//    adc_value2 = HAL_ADC_GetValue(hadc);

    return adc_value1 * 3.3 / 4024;
}
