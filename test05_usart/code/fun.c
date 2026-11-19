#include "headfile.h"

uint16_t adc_value1, adc_value2;
double adc_volR38, adc_volR37;
char text[20];      /*屏幕的一行只能显示20个字符*/
void lcd_show(void)
{   
    sprintf(text, " zhouqizhouqizhouqi ");
    LCD_DisplayStringLine(Line1, (uint8_t *)text);

}

char send_buff[20];
uint8_t rec_data,count;
uint8_t rec_flag;
uint8_t rec_buff[20];

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if(huart->Instance == USART1)
    {
//        HAL_UART_Transmit(huart, &rec_data, 1, 100);     //再初始化中接收到字符之后，进入该中断，并发送该数据
                                                        //上位机在一串数据时，每次收到字符串中的一个字符，
                                                        //就会进入一次中断，并把这一个字符发送出去
        
        TIM4->CNT = 0;
        rec_flag = 1;
        rec_buff[count] = rec_data;
        count++;
        HAL_UART_Receive_IT(huart, &rec_data, 1);       //这是一个“一次性”的中断函数，每次接收字符的
                                                        //中断结束之后就会关闭，所以每使用一一次和初始化时
                                                        //都要该函数来开启一遍中断                                                        
    }
}


void uart_data_rec(void)
{
    if(rec_flag == 1)           //数据接收完成
    {
        if(TIM4->CNT > 15)
        {
            //处理数据
            if(rec_buff[0] == 'l' && rec_buff[1] == 'a' && rec_buff[2] == 'n')       //lan
            {
                sprintf(send_buff, "lan\r\n");
                HAL_UART_Transmit(&huart1, (uint8_t *)send_buff, sizeof(send_buff), 50);
            }
            else if(rec_buff[0] == 'q' && rec_buff[1] == 'i' && rec_buff[2] == 'a' && rec_buff[3] == 'o')    //qiao
            {
                sprintf(send_buff, "qiao\r\n");
                HAL_UART_Transmit(&huart1, (uint8_t *)send_buff, sizeof(send_buff), 50);
            }
            else if(rec_buff[0] == 'b' && rec_buff[1] == 'e' && rec_buff[2] == 'i' )    //bei
            {
                sprintf(send_buff, "bei\r\n");
                HAL_UART_Transmit(&huart1, (uint8_t *)send_buff, sizeof(send_buff), 50);
            }
            else
            {
                sprintf(send_buff, "error!\r\n");                                    
                HAL_UART_Transmit(&huart1, (uint8_t *)send_buff, sizeof(send_buff), 50);
            }
            rec_flag = 0;
            for(int i = 0;i < count; i++) rec_buff[i] = 0;
            count = 0;
        } 
    }
}
