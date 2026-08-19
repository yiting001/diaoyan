import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { PayService } from './pay.service';

@Controller('pay')
export class PayController {
  constructor(private pay: PayService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders')
  async create(
    @Req() req: any,
    @Body() body: { planId: number; tradeType?: 'native' | 'jsapi'; openid?: string },
  ) {
    return this.pay.createOrder(req.user, body.planId, body.tradeType ?? 'native', body.openid);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders')
  async list(@Req() req: any) {
    return this.pay.myOrders(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:id')
  async detail(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const order = await this.pay.getOrder(req.user.id, id, req.user.role === 'admin');
    await this.pay.refreshOrder(order).catch(() => undefined);
    return this.pay.toDto(order);
  }

  // 微信支付结果回调（公网）
  @Post('notify')
  async notify(@Req() req: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string>) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    return this.pay.handleNotify(headers, raw);
  }

  // 公众号 JSAPI：网页授权入口（在微信内打开）
  @Get('oauth')
  async oauth(@Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const cfg = await this.pay.requireEnabledConfig();
    const redirectUri = `${req.protocol}://${req.get('host')}/api/pay/oauth/callback`;
    res.redirect(this.pay.oauthUrl(cfg.appId, redirectUri, state ?? ''));
  }

  // 网页授权回调：拿到 code 换 openid，回到前端支付页
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const openid = await this.pay.openidFromCode(code);
    res.redirect(`/plans?openid=${encodeURIComponent(openid)}&planId=${encodeURIComponent(state ?? '')}`);
  }
}
