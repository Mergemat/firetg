import * as qrTerminal from "qrcode-terminal";

export function renderQr(value: string): string {
  let qr = "";
  qrTerminal.generate(value, { small: true }, (code) => {
    qr = code;
  });
  return qr;
}
