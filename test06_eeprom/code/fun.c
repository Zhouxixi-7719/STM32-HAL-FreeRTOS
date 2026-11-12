#include "headfile.h"

uint16_t adc_value1, adc_value2;
double adc_volR38, adc_volR37;
char text[20];      /*屏幕的一行只能显示20个字符*/
void lcd_show(void)
{   
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);

}


