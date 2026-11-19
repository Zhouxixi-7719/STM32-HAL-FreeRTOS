# test05_usart

基于 STM32CubeMX 和 STM32 HAL 生成的 STM32G431RBT6（LQFP64）工程，包含 Keil MDK-ARM 工程文件。

## 配置与外设

- 芯片：STM32G431RBT6。
- 系统时钟：HSI 16 MHz 经 PLL 配置为 80 MHz；AHB、APB1、APB2 分频均为 1。
- 当前代码初始化 HAL、系统时钟和 GPIO 端口时钟。`MX_GPIO_Init()` 使能 GPIOA、GPIOC、GPIOF 时钟，没有配置具体 GPIO 引脚。
- CubeMX 配置中 PA13/PA14 用于 SWD，PC14/PC15 标记为 LSE 引脚，PF0/PF1 标记为 HSE 引脚；当前运行时代码使用 HSI，未启用外部 HSE/LSE。

## 当前功能

`main()` 完成 HAL、系统时钟和 GPIO 初始化后进入空的无限循环。当前工程尚未启用 UART/USART HAL 模块，也没有串口初始化、发送或接收逻辑。

串口实例、引脚、波特率、数据格式及通信功能：启动时初始化 USART1，并开启单字节中断接收。每收到一个字节，接收完成回调会将该字节回显到串口，并重新启动下一次接收。当前串口配置为 115200、8-N-1、无流控；PA9 为 TX，PA10 为 RX。主循环调用 `lcd_show()`，在 LCD 第一行显示固定文本。主循环中的主动发送测试代码目前处于注释状态。



### 初始化
开启PA10的USART1_RX和PA9的USART1_TX，开启中断。

### 发送字符串
先定义一个字符串，用sprintf写进内容：
```c
char text[20];
sprintf(text, "zhouzhouzhou\r\n ");
```
使用函数
HAL_StatusTypeDef HAL_UART_Transmit(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size, uint32_t Timeout)发送字符：
```c
HAL_UART_Transmit(&huart1, (uint8_t*)text, sizeof(text),50);
```

### 中断接收回显函数
定义一个**rec_data**来接收数据

在上位机发来的一段字符串时，中断函数是一个字符一个字符的处理，接收完成之后，就进入一次中断回调函数，由该函数实现：
```c
HAL_UART_Receive_IT(huart, &rec_data, 1);
```
**但是**，该函数为“**一次性**”函数，每次使用完之后需要重新开启，也在初始化中当作接收函数的开启

每接收到一个字符，就需要发送出去，所以在中断函数中使用
```c
HAL_UART_Transmit(huart, &rec_data, 1, 100); 
```
单字节接收完成后，HAL调用`HAL_UART_RxCpltCallback()`当前回调发送回显，然后再次调用 `HAL_UART_Receive_IT()` 接收下一个字节

在中断函数中处理数据，需要使用
```c
__weak void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
```
 回调函数来重写，在回调函数中，需要先判断中断实例，在进行数据处理




完整函数:
```c
main.c
HAL_UART_Receive_IT(&huart1, &rec_data, 1);           //相当于中断接收初始化
```

```c
fun.c
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if(huart->Instance == USART1)
    {
        HAL_UART_Transmit(huart, &rec_data, 1, 100);   
                                                       
                                                       
        
        HAL_UART_Receive_IT(huart, &rec_data, 1);      
                                                       
                                                       
    }
}
```

### 利用定时器进行串口不定长接收
开启定时器TIM4，PSC设置为8000 - 1，所以每次CNT加一的时间为0.1ms，因为波特率为9600的串口每发送一个字节需要1.04ms，所以当CNT>15时，即过了1.5ms还是没有收到字节时，就判定为数据已接收完成。

在回调函数中，每次接收到一个字符时，就将标志位rec_flag置1，CNT置0，，将接收到的字符存进字符串rec_buff中，在while循环中轮询uart_data_rec检测标志位：
```c
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if(huart->Instance == USART1)
    {                                              
        
        TIM4->CNT = 0;
        rec_flag = 1;
        rec_buff[count] = rec_data;
        count++;
        HAL_UART_Receive_IT(huart, &rec_data, 1);                                                                                                       
    }
}


```

在数据处理函数中，经过标志位置1和计时器CNT>15两轮筛选之后，就开始处理数据，处理完之后将标志位清零、清空用于接收数据的数组
```c
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
```
