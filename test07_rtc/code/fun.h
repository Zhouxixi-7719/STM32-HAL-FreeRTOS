#ifndef __FUN_H__
#define __FUN_H__
#include "headfile.h"

void led_show(uint8_t led, uint8_t mode);
void lcd_show(void);
extern uint8_t rec_data;
void uart_data_rec(void);

#endif

