import { qrcodegen } from '@/vendor/qrcodegen';

/** Generates the actual QR pixels locally. No booking credentials are sent to a QR service. */
export function MeetingQR({meetingId,presenceCode}:{meetingId:string;presenceCode:string}) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://vento-kitesurf.onrender.com';
  const target = new URL('/instrutor/checkin',base);
  target.searchParams.set('meetingId',meetingId);
  target.searchParams.set('presenceCode',presenceCode);
  const qr = qrcodegen.QrCode.encodeText(target.toString(), qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  const pixels: string[] = [];
  for (let y=0;y<qr.size;y++) {
    for (let x=0;x<qr.size;x++) {
      if(qr.getModule(x,y)) pixels.push(`M${x+border} ${y+border}h1v1h-1z`);
    }
  }
  return (
    <div className="vento-voucher-qr" aria-label="Apresente ao instrutor para confirmar o início deste encontro">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${size} ${size}`}
        role="img" aria-label="QR Code do encontro para o instrutor escanear" shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#fff" />
        <path d={pixels.join('')} fill="#071b2d" />
      </svg>
      <span className="vento-voucher-code-label">Código da aula</span>
      <strong className="vento-voucher-code">{presenceCode}</strong>
      <small>O instrutor pode escanear ou digitar os 4 dígitos.</small>
    </div>
  );
}
