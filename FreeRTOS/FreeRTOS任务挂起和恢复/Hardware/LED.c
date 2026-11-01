#include "stm32f10x.h"                  // Device header

void LED_Init(void) /*端口初始化*/
{
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    /*GPIO外设初始化代码*/
    GPIO_InitTypeDef GPIO_InitStructure;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_1 | GPIO_Pin_2;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA,&GPIO_InitStructure);
    /*GPIO端口初始化配置后默认是低电平*/
    
    GPIO_SetBits(GPIOA, GPIO_Pin_1 | GPIO_Pin_2);
}

void LED1_ON(void)
{
    GPIO_ResetBits(GPIOA, GPIO_Pin_1);
}

void LED1_OFF(void)
{
    GPIO_SetBits(GPIOA, GPIO_Pin_1);    
}

void LED1_Turn(void)
{
    if(GPIO_ReadOutputDataBit(GPIOA, GPIO_Pin_1) == 0)  /*读取当前的端口输出状态*/
    {
        GPIO_SetBits(GPIOA, GPIO_Pin_1);
    }
    else    /*这个函数可实现端口的反转*/
    {
        GPIO_ResetBits(GPIOA, GPIO_Pin_1);
    }
}

void LED2_ON(void)
{
    GPIO_ResetBits(GPIOA, GPIO_Pin_2    );
}

void LED2_OFF(void)
{
    GPIO_SetBits(GPIOA, GPIO_Pin_2);    
}

void LED2_Turn(void)
{
    if(GPIO_ReadOutputDataBit(GPIOA, GPIO_Pin_2) == 0)  /*读取当前的端口输出状态*/
    {
        GPIO_SetBits(GPIOA, GPIO_Pin_2);
    }
    else
    {
        GPIO_ResetBits(GPIOA, GPIO_Pin_2);
    }
}

