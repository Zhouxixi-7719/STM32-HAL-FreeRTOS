#include "stm32f10x.h"                  // Device header
//#include "Delay.h"
#include "FreeRTOS.h"
#include "Task.h"

void Key_Init(void)
{
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB,ENABLE);
    
    GPIO_InitTypeDef GPIO_InitStructure;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;  /*上拉输入模式*/
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_1 | GPIO_Pin_11;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB,&GPIO_InitStructure);
}

uint8_t Key_GetNum(void) /*按键读取*/
{
    uint8_t KeyNum = 0;
        if (GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1) == 0)   /*读取输入寄存器的某个值,0为低电平，1为高电平*/
    {
        vTaskDelay(20);
        while(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1)==0); /*按键消抖*/
        vTaskDelay(20);
        KeyNum = 1;
    }  

        if (GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_11) == 0)   /*读取输入寄存器的某个值,0为低电平，1为高电平*/
    {
        vTaskDelay(20);
        while(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_11)==0); /*按键消抖*/
        vTaskDelay(20);
        KeyNum = 2;
    }  

    return KeyNum;
}


