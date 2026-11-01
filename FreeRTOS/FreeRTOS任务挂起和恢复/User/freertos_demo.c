#include "stm32f10x.h"                  // Device header
#include "FreeRTOS.h"
#include "Task.h"
#include "Key.h"
#include "Serial.h"
#include "LED.h"

/*
    START_TASK 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define START_TASK_PRIO         1           /*任务优先级 */
#define SATRT_TASK_STACK_SIZE   128         /*任务堆栈大小*/
TaskHandle_t start_task_handler;            /*任务句柄*/
void start_task( void * pvParameters );

/*
    TASK1 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define TASK1_PRIO         2           /*任务优先级 */
#define TASK1_STACK_SIZE   128         /*任务堆栈大小*/
TaskHandle_t task1_handler;            /*任务句柄*/
void task1(void * pvParameters);


/*
    TASK2 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define TASK2_PRIO         3           /*任务优先级 */
#define TASK2_STACK_SIZE   128         /*任务堆栈大小*/
TaskHandle_t task2_handler;            /*任务句柄*/
void task2(void * pvParameters);


/*
    TASK3 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define TASK3_PRIO         4           /*任务优先级 */
#define TASK3_STACK_SIZE   128         /*任务堆栈大小*/
TaskHandle_t task3_handler;            /*任务句柄*/
void task3(void * pvParameters);

#define KEY_SCAN_TASK_PRIO         2
#define KEY_SCAN_TASK_STACK_SIZE   128
TaskHandle_t key_scan_task_handler;
void key_scan_task(void * pvParameters);




/*
FreeRTOS例程入口函数
*/
void freertos_demo(void)
{
     xTaskCreate( (TaskFunction_t           )       start_task,                     /*指向任务函数的指针*/
                ( char *                    )       "start_task",                   /*任务名字，最大长度configMAX_TASK_NAME_LEN*/
                ( configSTACK_DEPTH_TYPE    )       SATRT_TASK_STACK_SIZE,          /*任务堆栈大小，注意字为单位*/
                (void *                     )       NULL,                           /*传递给任务函数的参数*/
                (UBaseType_t                )       START_TASK_PRIO,                 /*任务优先级，范围：0——configMAX_PRIORITIES - 1*/
                (TaskHandle_t *             )       &start_task_handler );          /*任务句柄，就是任务的任务控制块*/
    vTaskStartScheduler();        /*开启任务调度器*/                  
}


// Task to be created.
void start_task( void * pvParameters )
{
     taskENTER_CRITICAL();                  /*进入临界区*/
     xTaskCreate( (TaskFunction_t           )       task1,                  
                ( char *                    )       "task1",                
                ( configSTACK_DEPTH_TYPE    )       TASK1_STACK_SIZE,  
                (void *                     )       NULL,                  
                (UBaseType_t                )       TASK1_PRIO,             
                (TaskHandle_t *             )       &task1_handler );  

     xTaskCreate( (TaskFunction_t           )       task2,                
                ( char *                    )       "task2",              
                ( configSTACK_DEPTH_TYPE    )       TASK2_STACK_SIZE,  
                (void *                     )       NULL,                 
                (UBaseType_t                )       TASK2_PRIO,           
                (TaskHandle_t *             )       &task2_handler );        
                
     xTaskCreate( (TaskFunction_t           )       task3,               
                ( char *                    )       "task3",                 
                ( configSTACK_DEPTH_TYPE    )       TASK3_STACK_SIZE,  
                (void *                     )       NULL,                 
                (UBaseType_t                )       TASK3_PRIO,                     
                (TaskHandle_t *             )       &task3_handler );           

     xTaskCreate( (TaskFunction_t           )       key_scan_task,
                ( char *                    )       "key_scan",
                ( configSTACK_DEPTH_TYPE    )       KEY_SCAN_TASK_STACK_SIZE,
                (void *                     )       NULL,
                (UBaseType_t                )       KEY_SCAN_TASK_PRIO,
                (TaskHandle_t *             )       &key_scan_task_handler );

    vTaskDelete(NULL);                      /*当传入的参数为NULL,则代表删除自身任务*/
    taskEXIT_CRITICAL();                    /*退出临界区*/
}
/*任务1：实现LED0每500ms翻转一次*/ 
void task1(void * pvParameters)
{
    uint32_t count = 0;
    while(1)
    {
        printf("task_num:%d\r\n", ++count);
        LED1_Turn();
        vTaskDelay(500);
    }
}
/*任务2：实现LED1每500ms翻转一次*/ 
void task2(void * pvParameters)
{
    while(1)
    {
        // printf("task2正在运行!!!");
        LED2_Turn();
        vTaskDelay(500);
    }
}
/*任务3：判断按键KEY0，按下KEY0删除task1*/ 
void task3(void * pvParameters)
{
    uint8_t key = 0; 
    while(1)
    {
        // printf("task3正在运行!!!\r\n");
        key = Key_GetNum();
        if(key == KEY1)
        {
            printf("在任务中挂起task1\r\n");
            vTaskSuspend(task1_handler);
        }
        else if(key == KEY2)
        {
            printf("在任务中恢复task1\r\n");
            vTaskResume(task1_handler);        
        }
        // else if(key == KEY3)
        // {
        //     vTaskResume(task1_handler);
        // }
        vTaskDelay(10);
    }
}

void key_scan_task(void * pvParameters)
{
    TickType_t lastWakeTime = xTaskGetTickCount();

    (void)pvParameters;
    while (1)
    {
        Key_Tick();
        vTaskDelayUntil(&lastWakeTime, 1);
    }
}

                                                                          
  
