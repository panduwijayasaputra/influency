import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CreatorsModule } from './modules/creators/creators.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { DevStorageModule } from './modules/dev-storage/dev-storage.module.js';
import { DiscoverModule } from './modules/discover/discover.module.js';
import { EntitlementsModule } from './modules/entitlements/entitlements.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PayoutsModule } from './modules/payouts/payouts.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { TopupsModule } from './modules/topups/topups.module.js';
import { WalletsModule } from './modules/wallets/wallets.module.js';

@Module({
  imports: [
    CommonModule,
    HealthModule,
    AuthModule,
    CreatorsModule,
    PostsModule,
    DiscoverModule,
    EntitlementsModule,
    EngagementModule,
    WalletsModule,
    TopupsModule,
    PurchasesModule,
    SubscriptionsModule,
    PayoutsModule,
    NotificationsModule,
    AdminModule,
    DevStorageModule,
  ],
})
export class AppModule {}
