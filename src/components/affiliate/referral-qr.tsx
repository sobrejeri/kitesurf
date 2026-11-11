import { Icon } from '@/components/icon';
import { qrcodegen } from '@/vendor/qrcodegen';

/**
 * The referral link as a QR Code, drawn locally (no QR service sees the
 * code), with a download for printing at a front desk, counter or car.
 */
export function ReferralQR({ link, code }: { link: string; code: string }) {
  const qr = qrcodegen.QrCode.encodeText(link, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  const modules: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) modules.push(`M${x + border} ${y + border}h1v1h-1z`);
    }
  }
  const path = modules.join('');
  const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#0b1220"/></svg>`;
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <div className="rounded-[18px] border border-line bg-white p-3 shadow-card">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${size} ${size}`} className="h-[200px] w-[200px]"
          role="img" aria-label={`QR Code do seu link de indicação (código ${code})`} shapeRendering="crispEdges">
          <rect width={size} height={size} fill="#fff" />
          <path d={path} fill="#0b1220" />
        </svg>
      </div>
      <a
        href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(file)}`}
        download={`ventokite-${code.toLowerCase()}-qr.svg`}
        className="press inline-flex min-h-10 items-center gap-2 rounded-full border border-line-ghost bg-surface px-4 text-[13px] font-semibold text-brand hover:bg-brand-wash"
      >
        <Icon name="download" className="!h-4 !w-4" /> Baixar QR Code
      </a>
    </div>
  );
}
