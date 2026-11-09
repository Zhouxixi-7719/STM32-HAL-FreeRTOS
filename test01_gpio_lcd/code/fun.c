#include "headfile.h"

int8_t count;
uint8_t led_mode;
uint8_t lcd_highshow = 0;

void led_show(uint8_t led, uint8_t mode)
{
    /*
        八个LED的引脚对应PC8--PC15
        每次写引脚时需要打开锁存PD2
    */
    
    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_2,GPIO_PIN_SET);
    
    if(mode)
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_8 << (led - 1), mode ? GPIO_PIN_SET : GPIO_PIN_RESET);
    else
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_8 << (led - 1), mode ? GPIO_PIN_SET : GPIO_PIN_RESET);
    
    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_2,GPIO_PIN_RESET);
}

uint8_t B1_state;
uint8_t B1_last_state = 1;
uint8_t B2_state;
uint8_t B2_last_state = 1;
uint8_t B3_state;
uint8_t B3_last_state = 1;
uint8_t B4_state;
uint8_t B4_last_state = 1;

void key_scan(void)
{
    B1_state = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_0);         //初始化时默认为高电平
    B2_state = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_1);
    B3_state = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_2);
    B4_state = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0);

    //按键B1
    if(B1_state == 0 && B1_last_state == 1) //按键B1按下
    {
        led_show(1, 0);
        TIM3->CNT = 0;
    }
    else if(B1_state == 0 && B1_last_state == 0)    //按键B1一直按着
    {
        if(TIM3->CNT >= 10000)                      //按键B1长按
        {
            count++;
        }
    }
    else if(B1_state == 1 && B1_last_state == 0)    //按键B1松开    
    {
        if(TIM3->CNT < 10000)                       //按键B1短按
        {
            count +=2;
        }
    }
    
    //按键B2
    if(B2_state == 0 && B2_last_state == 1) //按键B1按下
    {
        led_show(1, 0);
        TIM3->CNT = 0;
    }
    else if(B2_state == 0 && B2_last_state == 0)    //按键B1一直按着
    {
        if(TIM3->CNT >= 10000)                      //按键B1长按
        {
            count--;
        }
    }
    else if(B2_state == 1 && B2_last_state == 0)    //按键B1松开    
    {
        if(TIM3->CNT < 10000)                       //按键B1短按
        {
            count -=2;
        }
    }
    
    if(B3_state == 0 && B3_last_state == 1)
    {
        led_show(2, 0);
        count--;
    }

    if(B4_state == 0 && B4_last_state == 1)
    {
//        led_show(2, 1);
//        count++;
        lcd_highshow++;
        lcd_highshow %= 3;
    }
    
    B1_last_state = B1_state;
    B2_last_state = B2_state;
    B3_last_state = B3_state;
    B4_last_state = B4_state;
}

char text[20];      /*屏幕的一行只能显示20个字符*/
void lcd_show(void)
{
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);
    if(lcd_highshow == 0)
    {
        LCD_SetBackColor(Yellow); /*设置后续字符使用的背景颜色为黄色*/                       
        sprintf(text, "      count:%d      ", count);
        LCD_DisplayStringLine(Line3, (uint8_t *)text);
        LCD_SetBackColor(Black);    /*设置后续的字符使用的背景颜色为黑色*/
        sprintf(text, "      para1         ");
        LCD_DisplayStringLine(Line4, (uint8_t *)text);
        sprintf(text, "      para2         ");
        LCD_DisplayStringLine(Line5, (uint8_t *)text);        
    }
    
    if(lcd_highshow == 1)
    {
        sprintf(text, "      count:%d      ", count);
        LCD_DisplayStringLine(Line3, (uint8_t *)text);
        
        LCD_SetBackColor(Yellow); /*设置后续字符使用的背景颜色为黄色*/    
        
        sprintf(text, "      para1         ");
        LCD_DisplayStringLine(Line4, (uint8_t *)text);
        
        LCD_SetBackColor(Black);    /*设置后续的字符使用的背景颜色为黑色*/
        
        sprintf(text, "      para2         ");
        LCD_DisplayStringLine(Line5, (uint8_t *)text);        
    }

    if(lcd_highshow == 2)
    {
        sprintf(text, "      count:%d      ", count);
        LCD_DisplayStringLine(Line3, (uint8_t *)text);
        sprintf(text, "      para1         ");
        LCD_DisplayStringLine(Line4, (uint8_t *)text);
        
        LCD_SetBackColor(Yellow); /*设置后续字符使用的背景颜色为黄色*/    
        
        sprintf(text, "      para2         ");
        LCD_DisplayStringLine(Line5, (uint8_t *)text);        
        
        LCD_SetBackColor(Black);    /*设置后续的字符使用的背景颜色为黑色*/
        
    }    
    
    led_show(8, led_mode);
}

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if(htim->Instance == TIM2)
    {
        led_mode = !led_mode;
//        count++;
    }
}
