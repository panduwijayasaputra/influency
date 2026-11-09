import { Module } from '@nestjs/common';
import { NotificationDeliveryWorker } from './notification-delivery-worker.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { NotificationPreferencesController } from './notification-preferences.controller.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationProducer } from './notification-producer.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { SubscriptionReminder } from './subscription-reminder.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramController } from './telegram.controller.js';

/** In-app notifications + Telegram delivery (discover-notifications-settings US-071–US-074, ADR 0001). */
@Module({
  controllers: [NotificationsController, NotificationPreferencesController, TelegramController],
  providers: [
    NotificationsService,
    NotificationProducer,
    SubscriptionReminder,
    NotificationPreferencesService,
    TelegramLinkService,
    NotificationDeliveryService,
    NotificationDeliveryWorker,
  ],
  exports: [NotificationsService, NotificationProducer],
})
export class NotificationsModule {}
