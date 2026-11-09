import { Module } from '@nestjs/common';
import { createRemoteJWKSet } from 'jose';
import { ENV, type Env } from '../../common/env.js';
import { AuthController } from './auth.controller.js';
import { MeProfileController } from './me-profile.controller.js';
import { OnboardingController } from './onboarding.controller.js';
import { AuthService } from './auth.service.js';
import {
  TELEGRAM_JWKS_URL,
  TELEGRAM_OIDC_CLIENT,
  TelegramOidcClient,
} from './telegram-oidc.client.js';

@Module({
  controllers: [AuthController, MeProfileController, OnboardingController],
  providers: [
    AuthService,
    {
      provide: TELEGRAM_OIDC_CLIENT,
      inject: [ENV],
      // jose caches the remote JWKS and refetches it on an unknown `kid`.
      useFactory: (env: Env) =>
        new TelegramOidcClient(
          {
            clientId: env.TELEGRAM_OIDC_CLIENT_ID,
            clientSecret: env.TELEGRAM_OIDC_CLIENT_SECRET,
            redirectUri: env.TELEGRAM_OIDC_REDIRECT_URI,
          },
          { fetch, jwks: createRemoteJWKSet(new URL(TELEGRAM_JWKS_URL)) },
        ),
    },
  ],
})
export class AuthModule {}
