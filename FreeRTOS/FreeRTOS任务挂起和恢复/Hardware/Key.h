#ifndef __KEY_H__
#define __KEY_H__

#define KEY1 1
#define KEY2 2
#define KEY3 3

void Key_Init(void);
uint8_t Key_GetNum(void);
void Key_Tick(void);
void Key_EXTI_Init();


#endif
