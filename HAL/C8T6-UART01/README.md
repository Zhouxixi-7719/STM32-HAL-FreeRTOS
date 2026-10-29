# C8T6-UART01

基于 STM32F103C8T6 和 HAL 库的 USART1 配置练习。

## 当前配置

- USART1 异步收发，波特率 9600，8 数据位、无校验、1 个停止位（8N1）。
- PA9 为 USART1_TX，PA10 为 USART1_RX；

## 工程文件

- CubeMX 配置：`C8T6-UART01.ioc`
- Keil 工程：`MDK-ARM/C8T6-UART01.uvprojx`

### 发送一段文本时
先定义一个字符串
```c
uint8_t Tx_str1[] = "Hello World";
```
然后就可以直接调用函数
```c
  HAL_UART_Transmit(&huart1, Tx_str1, sizeof(Tx_str1), 10000 );
```
来直接发送文本了，只需要注意sizeof()这个函数内部直接写这个数组名字，不需要加上后面的方括号。

当一种函数使用频率较多时可以使用宏定义

### 接收中断的回调函数的使用
在每次使用上位机发送数据时，需先定义一个变量（例：Rx_date），，通过
```c
  HAL_UART_Receive_IT(&huart1, &Rx_date, 1);
```
来启动一次接收中断接，在单片机收到字节数据并触发中断时，将收到的数据存到缓冲区（Rx_date），然后程序就会调用 ‘接收完成回调函数’ ：
```c
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
```
但是，想要每次接收到数据之后，都要再利用HAL_UART_Receive_IT再启动一次中断，从而能够继续使用中断回调函数。所以，可以使用这样一个模板：
```c
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1)
    {
	    /*
	    回调函数的程序实现........
	    .........
	    */
    
        // 此时 Rx_date 中是刚收到的字节
        HAL_UART_Receive_IT(huart, &Rx_date, 1);
    }
}
```