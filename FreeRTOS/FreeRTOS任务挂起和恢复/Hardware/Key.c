#include "stm32f10x.h"                  // Device header
#include "FreeRTOS.h"
#include "Task.h"
#include "Key.h"
#include "Serial.h"

extern TaskHandle_t task1_handler;

static volatile uint8_t Key_Num;

void Key_Init(void)
{
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB | RCC_APB2Periph_GPIOA,ENABLE);
    
    GPIO_InitTypeDef GPIO_InitStructure;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;  /*上拉输入模式*/
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_1 | GPIO_Pin_11;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB,&GPIO_InitStructure);

    
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;  /*上拉输入模式*/
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_7;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA,&GPIO_InitStructure);

}

/*初始化按键中断*/
void Key_EXTI_Init(void)
{
    EXTI_InitTypeDef EXTI_InitStructure;    //中断初始化结构体
    NVIC_InitTypeDef NVIC_InitStructure;    //中断优先级初始化结构体

    GPIO_EXTILineConfig(GPIO_PortSourceGPIOA, GPIO_PinSource7);  //PA7连接到EXTI7

    /*EXTI7:下降触发*/
    EXTI_InitStructure.EXTI_Line = EXTI_Line7;                  //选择中断线7
    EXTI_InitStructure.EXTI_LineCmd = ENABLE;                   //使能中断线
    EXTI_InitStructure.EXTI_Mode = EXTI_Mode_Interrupt;         //选择中断模式
    EXTI_InitStructure.EXTI_Trigger = EXTI_Trigger_Falling;     //下降沿触发
    EXTI_Init(&EXTI_InitStructure);
    
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_4);  //设置中断分组4:4位抢占优先级,0位响应优先级

    NVIC_InitStructure.NVIC_IRQChannel = EXTI9_5_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 11;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 0;
    NVIC_Init(&NVIC_InitStructure);

}
uint8_t Key_GetNum(void) /*读取并清除已产生的按键事件*/
{
    uint8_t KeyNum;

    taskENTER_CRITICAL();
    KeyNum = Key_Num;
    Key_Num = 0;
    taskEXIT_CRITICAL();
    return KeyNum;
}

static uint8_t Key_GetState(void)
{
    if (GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_1) == 0)
    {
        return KEY1;
    }
    else if (GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_11) == 0)
    {
        return KEY2;
    }
    // else if (GPIO_ReadInputDataBit(GPIOA, GPIO_Pin_7) == 0)
    // {
    //     return KEY3;
    // }

    return 0;
}

void Key_Tick(void)
{
    static uint8_t Count;
    static uint8_t CurrState;
    static uint8_t PrevState;

    Count++;
    if (Count >= 20)
    {
        Count = 0;
        PrevState = CurrState;
        CurrState = Key_GetState();

        if ((CurrState == 0) && (PrevState != 0))
        {
            taskENTER_CRITICAL();
            Key_Num = PrevState;
            taskEXIT_CRITICAL();
        }
    }
}

/*中断服务程序中要调用freeRTOS的API函数则中断优先级不能高于FreeRTOS所管理的最高优先级*/
void EXTI9_5_IRQHandler(void)
{
    BaseType_t xYieldRequired;
    if (EXTI_GetITStatus(EXTI_Line7) != RESET)
    {
        EXTI_ClearITPendingBit(EXTI_Line7);
        printf("在中断中恢复task1\r\n");
        xYieldRequired = xTaskResumeFromISR(task1_handler);
    }
    if (xYieldRequired == pdTRUE)
    {
        portYIELD_FROM_ISR(xYieldRequired);  
    }
}

