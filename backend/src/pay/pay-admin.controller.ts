import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { PayService } from './pay.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaySetting, PaymentOrder } from '../entities';
import { parseP12, serialFromCertPem } from './wechat';

function maskTail(v: string, keep = 4) {
  return v ? `••••${v.slice(-keep)}` : '';
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/pay')
export class PayAdminController {
  constructor(
    private pay: PayService,
    @InjectRepository(PaySetting) private settings: Repository<PaySetting>,
    @InjectRepository(PaymentOrder) private orders: Repository<PaymentOrder>,
  ) {}

  @Get('config')
  async config() {
    const cfg = await this.pay.getConfig();
    return {
      id: cfg.id,
      appId: cfg.appId,
      appSecret: maskTail(cfg.appSecret),
      mchId: cfg.mchId,
      serialNo: cfg.serialNo,
      apiV3Key: maskTail(cfg.apiV3Key),
      publicKeyId: cfg.publicKeyId,
      notifyUrl: cfg.notifyUrl,
      enabled: cfg.enabled,
      hasPrivateKey: !!cfg.privateKeyPem,
      hasCert: !!cfg.certPem,
      hasPublicKey: !!cfg.publicKeyPem,
      updatedAt: cfg.updatedAt,
    };
  }

  @Put('config')
  async update(
    @Body()
    body: {
      appId?: string;
      appSecret?: string;
      mchId?: string;
      serialNo?: string;
      apiV3Key?: string;
      publicKeyId?: string;
      notifyUrl?: string;
      enabled?: boolean;
    },
  ) {
    const cfg = await this.pay.getConfig();
    if (body.appId !== undefined) cfg.appId = body.appId;
    if (body.appSecret !== undefined && !body.appSecret.startsWith('••••')) {
      cfg.appSecret = body.appSecret;
    }
    if (body.mchId !== undefined) cfg.mchId = body.mchId;
    if (body.serialNo !== undefined) cfg.serialNo = body.serialNo;
    if (body.apiV3Key !== undefined && !body.apiV3Key.startsWith('••••')) {
      cfg.apiV3Key = body.apiV3Key;
    }
    if (body.publicKeyId !== undefined) cfg.publicKeyId = body.publicKeyId.trim();
    if (body.notifyUrl !== undefined) cfg.notifyUrl = body.notifyUrl;
    if (body.enabled !== undefined) cfg.enabled = body.enabled;
    await this.settings.save(cfg);
    return this.config();
  }

  // 上传证书文件：privateKey(apiclient_key.pem) / cert(apiclient_cert.pem) / p12(apiclient_cert.p12) / publicKey(pub_key.pem)
  @Post('cert')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'privateKey', maxCount: 1 },
      { name: 'cert', maxCount: 1 },
      { name: 'p12', maxCount: 1 },
      { name: 'publicKey', maxCount: 1 },
    ]),
  )
  async uploadCert(
    @UploadedFiles()
    files: {
      privateKey?: Express.Multer.File[];
      cert?: Express.Multer.File[];
      p12?: Express.Multer.File[];
      publicKey?: Express.Multer.File[];
    },
    @Body() body: { p12Password?: string },
  ) {
    const cfg = await this.pay.getConfig();

    if (files.p12?.[0]) {
      const candidates = [...new Set([body.p12Password, cfg.mchId, ''].filter((v) => v !== undefined))] as string[];
      let parsed: { privateKeyPem: string; certPem: string } | null = null;
      let lastError = '';
      for (const password of candidates) {
        try {
          parsed = parseP12(files.p12[0].buffer, password);
          break;
        } catch (e) {
          lastError = (e as Error).message;
        }
      }
      if (!parsed) {
        throw new BadRequestException(
          `p12 解析失败：密码不正确或文件格式不受支持（${lastError}）。p12 密码通常为商户号；若仍失败，请改用「PEM 私钥 apiclient_key.pem + 证书 apiclient_cert.pem」方式上传`,
        );
      }
      cfg.privateKeyPem = parsed.privateKeyPem;
      if (parsed.certPem) cfg.certPem = parsed.certPem;
    }

    if (files.privateKey?.[0]) {
      const pem = files.privateKey[0].buffer.toString('utf8');
      if (!pem.includes('PRIVATE KEY')) throw new BadRequestException('私钥文件不是有效的 PEM');
      cfg.privateKeyPem = pem;
    }

    if (files.cert?.[0]) {
      const pem = files.cert[0].buffer.toString('utf8');
      if (!pem.includes('CERTIFICATE')) throw new BadRequestException('证书文件不是有效的 PEM');
      cfg.certPem = pem;
    }

    if (files.publicKey?.[0]) {
      const pem = files.publicKey[0].buffer.toString('utf8');
      if (!pem.includes('PUBLIC KEY')) throw new BadRequestException('公钥文件不是有效的 PEM（pub_key.pem）');
      cfg.publicKeyPem = pem;
    }

    if (cfg.certPem) {
      try {
        cfg.serialNo = serialFromCertPem(cfg.certPem);
      } catch {
        // 证书解析失败时保留原序列号
      }
    }

    await this.settings.save(cfg);
    return this.config();
  }

  @Get('orders')
  async allOrders() {
    const list = await this.orders.find({ order: { id: 'DESC' }, take: 200 });
    return list.map((o) => ({ ...this.pay.toDto(o), userEmail: o.user?.email ?? '' }));
  }
}
