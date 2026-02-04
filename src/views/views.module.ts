import { Module } from '@nestjs/common';
import { ViewsController } from './views.controller';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [ViewsController],
})
export class ViewsModule {}
