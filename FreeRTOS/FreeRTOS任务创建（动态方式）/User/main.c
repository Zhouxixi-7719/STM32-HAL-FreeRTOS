#include "stm32f10x.h"                  // Device header
#include "FreeRTOS.h"
#include "Task.h"
#include "Key.h"
#include "LED.h"
#include "Serial.h"
TaskHandle_t myTaskHandler;

//void myTask(void *arg)
//{
//    while(1)
//    {
//        GPIO_ResetBits(GPIOC, GPIO_Pin_13);
//        vTaskDelay(500);
//        GPIO_SetBits(GPIOC, GPIO_Pin_13);
//        vTaskDelay(500);
//    }
//}

void freertos_demo(void);

int main(void)
{
    LED_Init();
    Key_Init();
    Serial_Init();  
//    xTaskCreate(myTask,"myTask",128,NULL,2,&myTaskHandler);
//    vTaskStartScheduler();
    
    freertos_demo();
    
	while (1)
	{
		
	}
}
