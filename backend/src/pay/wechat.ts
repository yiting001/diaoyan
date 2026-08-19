import * as crypto from 'crypto';
import forge from 'node-forge';
import { PaySetting } from '../entities';

const API_BASE = 'https://api.mch.weixin.qq.com';

export interface PlatformCert {
  serialNo: string;
  publicKeyPem: string;
}

const platformCertCache: { certs: PlatformCert[]; fetchedAt: number } = {
  certs: [],
  fetchedAt: 0,
};

function nonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

function signMessage(privateKeyPem: string, message: string) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  return signer.sign(privateKeyPem, 'base64');
}

export function buildAuthHeader(
  cfg: PaySetting,
  method: string,
  pathWithQuery: string,
  body: string,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();
  const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signMessage(cfg.privateKeyPem, message);
  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",nonce_str="${nonce}",` +
    `signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serialNo}"`
  );
}

export async function wxRequest(
  cfg: PaySetting,
  method: 'GET' | 'POST',
  pathWithQuery: string,
  bodyObj?: unknown,
): Promise<{ status: number; data: any }> {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const auth = buildAuthHeader(cfg, method, pathWithQuery, body);
  const res = await fetch(`${API_BASE}${pathWithQuery}`, {
    method,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'fanfu-agent/1.0',
    },
    body: method === 'POST' ? body : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

// AES-256-GCM 解密（APIv3 密钥）
export function decryptResource(
  apiV3Key: string,
  nonce: string,
  associatedData: string,
  ciphertext: string,
): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const data = buf.subarray(0, buf.length - 16);
  const authTag = buf.subarray(buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', apiV3Key, nonce);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData));
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// 下载微信支付平台证书（用于验签回调），带缓存
export async function getPlatformCerts(cfg: PaySetting): Promise<PlatformCert[]> {
  const now = Date.now();
  if (platformCertCache.certs.length && now - platformCertCache.fetchedAt < 12 * 3600_000) {
    return platformCertCache.certs;
  }
  const { status, data } = await wxRequest(cfg, 'GET', '/v3/certificates');
  if (status !== 200 || !Array.isArray(data.data)) return platformCertCache.certs;
  const certs: PlatformCert[] = [];
  for (const item of data.data) {
    try {
      const pem = decryptResource(
        cfg.apiV3Key,
        item.encrypt_certificate.nonce,
        item.encrypt_certificate.associated_data,
        item.encrypt_certificate.ciphertext,
      );
      const cert = new crypto.X509Certificate(pem);
      certs.push({
        serialNo: item.serial_no,
        publicKeyPem: cert.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      });
    } catch {
      // 单个证书解密失败时跳过
    }
  }
  if (certs.length) {
    platformCertCache.certs = certs;
    platformCertCache.fetchedAt = now;
  }
  return certs;
}

export async function verifyNotifySignature(
  cfg: PaySetting,
  headers: Record<string, string | undefined>,
  rawBody: string,
): Promise<boolean> {
  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const signature = headers['wechatpay-signature'];
  const serial = headers['wechatpay-serial'];
  if (!timestamp || !nonce || !signature || !serial) return false;
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  // 微信支付公钥模式：回调头 Wechatpay-Serial 为公钥ID（PUB_KEY_ID_...）
  if (cfg.publicKeyPem && (serial === cfg.publicKeyId || serial.startsWith('PUB_KEY_ID_'))) {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    return verifier.verify(cfg.publicKeyPem, signature, 'base64');
  }
  // 平台证书模式：动态下载平台证书验签
  const certs = await getPlatformCerts(cfg);
  const cert = certs.find((c) => c.serialNo === serial);
  if (!cert) return false;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(message);
  return verifier.verify(cert.publicKeyPem, signature, 'base64');
}

// 从证书 PEM 提取序列号（大写十六进制）
export function serialFromCertPem(certPem: string): string {
  const cert = new crypto.X509Certificate(certPem);
  return cert.serialNumber.toUpperCase();
}

// 解析 p12 (PKCS#12) 证书文件，提取私钥与证书 PEM。微信商户 p12 密码通常是商户号
export function parseP12(p12Buffer: Buffer, password: string): {
  privateKeyPem: string;
  certPem: string;
} {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  let privateKeyPem = '';
  let certPem = '';
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
    forge.pki.oids.pkcs8ShroudedKeyBag
  ];
  const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const keyBag = (keyBags && keyBags[0]) || (plainKeyBags && plainKeyBags[0]);
  if (keyBag?.key) privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  if (certBags && certBags[0]?.cert) certPem = forge.pki.certificateToPem(certBags[0].cert);
  if (!privateKeyPem) throw new Error('p12 中未找到私钥，请确认密码是否正确（默认为商户号）');
  return { privateKeyPem, certPem };
}

// JSAPI 调起支付参数签名
export function buildJsapiPayParams(cfg: PaySetting, prepayId: string) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();
  const pkg = `prepay_id=${prepayId}`;
  const message = `${cfg.appId}\n${timeStamp}\n${nonce}\n${pkg}\n`;
  const paySign = signMessage(cfg.privateKeyPem, message);
  return {
    appId: cfg.appId,
    timeStamp,
    nonceStr: nonce,
    package: pkg,
    signType: 'RSA',
    paySign,
  };
}
