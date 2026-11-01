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
StackType_t start_task_stack[SATRT_TASK_STACK_SIZE];     
StaticTask_t start_task_tcb;
void start_task( void * pvParameters );

/*
    TASK1 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define TASK1_PRIO         2                /*任务优先级 */
#define TASK1_STACK_SIZE   128              /*任务堆栈大小*/
TaskHandle_t task1_handler;                 /*任务句柄*/
StackType_t task1_stask[TASK1_STACK_SIZE];  /*任务堆栈数组*/
StaticTask_t task1_tcb;                     /*任务控制块*/        
void task1(void * pvParameters);


/*
    TASK2 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define TASK2_PRIO         3                /*任务优先级 */
#define TASK2_STACK_SIZE   128              /*任务堆栈大小*/
TaskHandle_t task2_handler;                 /*任务句柄*/
StackType_t task2_stask[TASK2_STACK_SIZE];  /*任务堆栈数组*/
StaticTask_t task2_tcb;                     /*任务控制块*/        
void task2(void * pvParameters);


/*
    TASK3 任务配置
    包括：任务句柄，任务优先级，任务堆栈大小
*/
#define TASK3_PRIO         4                /*任务优先级 */
#define TASK3_STACK_SIZE   128              /*任务堆栈大小*/
TaskHandle_t task3_handler;                 /*任务句柄*/
StackType_t task3_stask[TASK3_STACK_SIZE];  /*任务堆栈数组*/
StaticTask_t task3_tcb;                     /*任务控制块*/        
void task3(void * pvParameters);


/*在静态创建任务函数的时候需要手动定义空闲任务和软件定时器任务：分配内存栈，TCB*/
/*空闲任务配置*/
StaticTask_t idle_task_tcb;
StackType_t idle_task_stack[configMINIMAL_STACK_SIZE];

/*软件定时器任务配置*/
StaticTask_t timer_task_tcb;
StackType_t  timer_task_stack[configTIMER_TASK_STACK_DEPTH];


/*空闲任务内存分配*/
void vApplicationGetIdleTaskMemory( StaticTask_t ** ppxIdleTaskTCBBuffer,
                                    StackType_t ** ppxIdleTaskStackBuffer,
                                    configSTACK_DEPTH_TYPE * puxIdleTaskStackSize )
{
    * ppxIdleTaskTCBBuffer = &idle_task_tcb;
    * ppxIdleTaskStackBuffer =  idle_task_stack;
    * puxIdleTaskStackSize = configMINIMAL_STACK_SIZE;
}


/*软件定时器内存分配*/
void vApplicationGetTimerTaskMemory( StaticTask_t ** ppxTimerTaskTCBBuffer,
                                     StackType_t ** ppxTimerTaskStackBuffer,
                                     configSTACK_DEPTH_TYPE * puxTimerTaskStackSize )
{
    * ppxTimerTaskTCBBuffer = &timer_task_tcb;
    * ppxTimerTaskStackBuffer = timer_task_stack;
    * puxTimerTaskStackSize = configTIMER_TASK_STACK_DEPTH;
}


/*
FreeRTOS例程入口函数
*/
void freertos_demo(void)
{
    start_task_handler = xTaskCreateStatic(     (TaskFunction_t            )   start_task,                         /*指向任务函数的指针*/
                                                (char *                    )   "start_task",                       /*任务函数名*/
                                                (configSTACK_DEPTH_TYPE    )   SATRT_TASK_STACK_SIZE,              /*任务堆栈大小，注意字为单位*/
                                                (void *                    )   NULL,                               /*传递任务函数参数*/
                                                (UBaseType_t               )   TASK1_PRIO,                         /*任务优先级*/
                                                (StackType_t *             )   start_task_stack,                   /*任务堆栈，一帮为数组，由用户命名*/
                                                (StaticTask_t *            )   &start_task_tcb );                  /*任务控制块指针，由用户分配*/

    vTaskStartScheduler();        /*开启任务调度器*/                  
}


// Task to be created.
void start_task( void * pvParameters )
{
    taskENTER_CRITICAL();                   /*进入临界区：避免被任务切换或中断任务打断，屏蔽一定优先级范围的中断实现*/
    task1_handler = xTaskCreateStatic(      (TaskFunction_t            )   task1,                     
                                            (char *                    )   "task1",                         
                                            (configSTACK_DEPTH_TYPE    )   TASK1_STACK_SIZE,                   
                                            (void *                    )   NULL,                   
                                            (UBaseType_t               )   START_TASK_PRIO,                     
                                            (StackType_t *             )   task1_stask,                 
                                            (StaticTask_t *            )   &task1_tcb );                 

    task2_handler = xTaskCreateStatic(      (TaskFunction_t            )   task2,                     
                                            (char *                    )   "task2",                         
                                            (configSTACK_DEPTH_TYPE    )   TASK2_STACK_SIZE,                   
                                            (void *                    )   NULL,                   
                                            (UBaseType_t               )   START_TASK_PRIO,                     
                                            (StackType_t *             )   task2_stask,                 
                                            (StaticTask_t *            )   &task2_tcb );              
                         
    task3_handler = xTaskCreateStatic(      (TaskFunction_t            )   task3,                     
                                            (char *                    )   "task3",                         
                                            (configSTACK_DEPTH_TYPE    )   TASK3_STACK_SIZE,                   
                                            (void *                    )   NULL,                   
                                            (UBaseType_t               )   START_TASK_PRIO,                     
                                            (StackType_t *             )   task3_stask,                 
                                            (StaticTask_t *            )   &task3_tcb );                 
                         
    vTaskDelete(start_task_handler);        /*删除创建任务*/
    taskEXIT_CRITICAL();                    /*退出临界区*/
}
/*任务1：实现LED0每500ms翻转一次*/ 
void task1(void * pvParameters)
{
    while(1)
    {
        printf("task1正在运行!!!");
        LED1_Turn();
        vTaskDelay(500);
    }
}
/*任务2：实现LED1每500ms翻转一次*/ 
void task2(void * pvParameters)
{
    while(1)
    {
        printf("task2正在运行!!!");
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
        printf("task3正在运行!!!\r\n");
        key = Key_GetNum();
        if(key == 1)
        {
            if(task1_handler != NULL)
            {                
                vTaskDelete(task1_handler);
                task1_handler = NULL;
                printf("删除task1任务\r\n");
            }
        }
        vTaskDelay(10);
    }
}

                                                                          
  