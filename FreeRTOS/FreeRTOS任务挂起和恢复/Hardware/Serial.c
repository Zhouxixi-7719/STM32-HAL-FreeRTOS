#include "stm32f10x.h"                  // Device header
#include <stdio.h>
#include <stdarg.h>
//1.开启USART和GPIO的时钟
//2.GPIO初始化 TX配置复用输出，RX配置输入
//3.配置USART(结构体)
//4.若要开启USART中断，就再加上ITConfig和NVIC的配置代码

uint8_t Serial_RxFlag;
uint8_t Serial_RxData;

void Serial_Init(void)
{
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA , ENABLE);
        
    GPIO_InitTypeDef GPIO_InitStruct;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP; //复用推挽输出
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_9;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA,&GPIO_InitStruct); //PA9配置复用推挽输出，供USART1的TX使用
    
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU; //上拉输入
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_10;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA,&GPIO_InitStruct); //PA9配置复用推挽输出，供USART1的TX使用
    
    
    USART_InitTypeDef USART_InitStruct;
    USART_InitStruct.USART_BaudRate = 115200; //波特率
    USART_InitStruct.USART_HardwareFlowControl = USART_HardwareFlowControl_None; //硬件流控制
    USART_InitStruct.USART_Mode = USART_Mode_Tx | USART_Mode_Rx; //指定接受模式和发送模式的启动或禁用
    USART_InitStruct.USART_Parity = USART_Parity_No; //指定校验位模式
    USART_InitStruct.USART_StopBits = USART_StopBits_1;  //指定传输的停止位位数
    USART_InitStruct.USART_WordLength = USART_WordLength_8b; //指定每一数据帧传递的位数
    USART_Init(USART1,&USART_InitStruct);
    
    USART_ITConfig(USART1,USART_IT_RXNE,ENABLE);//开启RXNE标志位到NVIC的输出
    
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_4);         //这里的优先级分组需配合FreeRTOSConfig.h中的configMAX_SYSCALL_INTERRUPT_PRIORITY使用
    NVIC_InitTypeDef NVIC_InitStruct;
    NVIC_InitStruct.NVIC_IRQChannel = USART1_IRQn;
    NVIC_InitStruct.NVIC_IRQChannelCmd = ENABLE;
    NVIC_InitStruct.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStruct.NVIC_IRQChannelSubPriority = 1;
    NVIC_Init(&NVIC_InitStruct);
    
    USART_Cmd(USART1, ENABLE);
}

void Serial_SendByte(uint8_t Byte)
{
    USART_SendData(USART1,Byte);
    while(USART_GetFlagStatus(USART1,USART_FLAG_TXE) == RESET); //发送数据寄存器空标志位
}

void Serial_SendArray(uint8_t *Array, uint16_t Length)
{
    uint16_t i;
    for(i = 0;i < Length;i++)
    {
        Serial_SendByte(Array[i]);
    }
}

void Serial_SendString(char *String) //字符串自带结束标志位，这里无需再传递长度
{
    uint8_t i;
    for(i = 0;String[i] != '\0';i++)
    {
        Serial_SendByte(String[i]);
    }
}

uint32_t Serial_POW(uint32_t X , uint32_t Y)
{
    uint32_t Result = 1;
    while(Y--)
    {
        Result *= X;     
    }
    return Result;
}

void Serial_SendNumber(uint32_t Number, uint8_t Length)
{
    uint8_t i;
    for(i = 0;i < Length;i++)
    {
        Serial_SendByte(Number / Serial_POW(10,Length - i - 1) % 10 + '0'); //偏移0x30位，因为ASCII码不是从0开始的
    }
}

int fputc(int ch, FILE *f)
{
    Serial_SendByte(ch);
    return ch;
} 

void Serial_Printf(char *format, ...)
{
    char string[100];
    va_list arg; //定义一个参数列表变量
    va_start(arg,format); //从format的位置开始接受参数表
    vsprintf(string,format,arg);
    va_end(arg); //释放参数表
    Serial_SendString(string);
}

uint8_t Serial_GetFlag(void)
{
    if(Serial_RxFlag == 1)
    {
        Serial_RxFlag = 0;
        return 1;       
    }
    return 0;
}

uint8_t Serial_GetRxData(void)
{
    return Serial_RxData;
}

void USART1_IRQHandler(void)
{
    if(USART_GetITStatus(USART1,USART_IT_RXNE) == SET)
    {
        Serial_RxData = USART_ReceiveData(USART1);
        Serial_RxFlag = 1;
        USART_ClearITPendingBit(USART1,USART_IT_RXNE);
    }
}   
