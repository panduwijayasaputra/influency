-- AlterTable
ALTER TABLE "oidc_login_attempts" ADD COLUMN     "return_to" TEXT NOT NULL DEFAULT '/';
