import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PaymentOrder, PaySetting, Plan, User } from '../entities';
import {
  buildJsapiPayParams,
  decryptResource,
  verifyNotifySignature,
  wxRequest,
} from './wechat';

@Injectable()
export class PayService {
  constructor(
    @InjectRepository(PaySetting) private settings: Repository<PaySetting>,
    @InjectRepository(PaymentOrder) private orders: Repository<PaymentOrder>,
    @InjectRepository(Plan) private plans: Repository<Plan>,
  ) {}

  async getConfig(): Promise<PaySetting> {
    let cfg = await this.settings.findOne({ where: {} });
    if (!cfg) {
      cfg = this.settings.create({});
      await this.settings.save(cfg);
    }
    return cfg;
  }

  async requireEnabledConfig(): Promise<PaySetting> {
    const cfg = await this.getConfig();
    if (!cfg.enabled || !cfg.mchId || !cfg.appId || !cfg.privateKeyPem || !cfg.apiV3Key) {
      throw new ServiceUnavailableException('微信支付未配置或未启用，请联系管理员');
    }
    return cfg;
  }

  private outTradeNo() {
    return `FF${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  async createOrder(user: User, planId: number, tradeType: 'native' | 'jsapi', openid?: string) {
    const cfg = await this.requireEnabledConfig();
    const plan = await this.plans.findOne({ where: { id: planId, active: true } });
    if (!plan) throw new NotFoundException('套餐不存在或已下架');
    const amountFen = Math.round(plan.basePrice * 100);
    if (amountFen <= 0) throw new BadRequestException('套餐价格无效');

    const order = this.orders.create({
      user,
      plan,
      outTradeNo: this.outTradeNo(),
      amountFen,
      tradeType,
      openid: openid ?? '',
    });
    await this.orders.save(order);

    const body: Record<string, unknown> = {
      appid: cfg.appId,
      mchid: cfg.mchId,
      description: `凡夫价投智能体-${plan.name}`,
      out_trade_no: order.outTradeNo,
      notify_url: cfg.notifyUrl || 'https://example.com/api/pay/notify',
      amount: { total: amountFen, currency: 'CNY' },
    };

    if (tradeType === 'jsapi') {
      if (!openid) throw new BadRequestException('JSAPI 支付需要 openid（请在微信内打开）');
      body.payer = { openid };
      const { status, data } = await wxRequest(cfg, 'POST', '/v3/pay/transactions/jsapi', body);
      if (status !== 200 || !data.prepay_id) {
        throw new BadRequestException(`下单失败: ${data.message ?? JSON.stringify(data)}`);
      }
      order.prepayId = data.prepay_id;
      await this.orders.save(order);
      return { order: this.toDto(order), payParams: buildJsapiPayParams(cfg, data.prepay_id) };
    }

    const { status, data } = await wxRequest(cfg, 'POST', '/v3/pay/transactions/native', body);
    if (status !== 200 || !data.code_url) {
      throw new BadRequestException(`下单失败: ${data.message ?? JSON.stringify(data)}`);
    }
    order.codeUrl = data.code_url;
    await this.orders.save(order);
    return { order: this.toDto(order) };
  }

  async myOrders(userId: number) {
    const list = await this.orders.find({
      where: { user: { id: userId } },
      order: { id: 'DESC' },
      take: 50,
    });
    return list.map((o) => this.toDto(o));
  }

  async getOrder(userId: number, id: number, isAdmin: boolean) {
    const order = await this.orders.findOne({ where: { id } });
    if (!order || (!isAdmin && order.user.id !== userId)) throw new NotFoundException('订单不存在');
    return order;
  }

  // 主动向微信查询订单状态（回调不可达时的兜底）
  async refreshOrder(order: PaymentOrder) {
    if (order.status !== 'pending') return order;
    const cfg = await this.requireEnabledConfig();
    const { status, data } = await wxRequest(
      cfg,
      'GET',
      `/v3/pay/transactions/out-trade-no/${order.outTradeNo}?mchid=${cfg.mchId}`,
    );
    if (status === 200 && data.trade_state) {
      this.applyTradeState(order, data);
      await this.orders.save(order);
    }
    return order;
  }

  private applyTradeState(order: PaymentOrder, data: any) {
    if (data.trade_state === 'SUCCESS') {
      order.status = 'paid';
      order.transactionId = data.transaction_id ?? '';
      order.paidAt = data.success_time ? new Date(data.success_time) : new Date();
    } else if (data.trade_state === 'CLOSED' || data.trade_state === 'REVOKED') {
      order.status = 'closed';
    } else if (data.trade_state === 'PAYERROR') {
      order.status = 'failed';
    }
  }

  async handleNotify(headers: Record<string, string | undefined>, rawBody: string) {
    const cfg = await this.getConfig();
    const verified = await verifyNotifySignature(cfg, headers, rawBody);
    if (!verified) return { code: 'FAIL', message: '验签失败' };
    const payload = JSON.parse(rawBody);
    const resource = payload.resource;
    const plain = decryptResource(
      cfg.apiV3Key,
      resource.nonce,
      resource.associated_data ?? '',
      resource.ciphertext,
    );
    const data = JSON.parse(plain);
    const order = await this.orders.findOne({ where: { outTradeNo: data.out_trade_no } });
    if (order && order.status === 'pending') {
      this.applyTradeState(order, data);
      await this.orders.save(order);
    }
    return { code: 'SUCCESS', message: '成功' };
  }

  // 微信公众号网页授权：code 换 openid
  async openidFromCode(code: string): Promise<string> {
    const cfg = await this.requireEnabledConfig();
    if (!cfg.appSecret) throw new BadRequestException('未配置公众号 AppSecret');
    const url =
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${cfg.appId}` +
      `&secret=${cfg.appSecret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!data.openid) throw new BadRequestException(`获取 openid 失败: ${data.errmsg ?? ''}`);
    return data.openid;
  }

  oauthUrl(appId: string, redirectUri: string, state: string) {
    return (
      'https://open.weixin.qq.com/connect/oauth2/authorize?' +
      `appid=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`
    );
  }

  toDto(o: PaymentOrder) {
    return {
      id: o.id,
      outTradeNo: o.outTradeNo,
      planName: o.plan?.name ?? '',
      amountFen: o.amountFen,
      tradeType: o.tradeType,
      status: o.status,
      codeUrl: o.codeUrl,
      transactionId: o.transactionId,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
    };
  }
}
