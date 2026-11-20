# Setup QR code

Scan this with the phone camera while connected to **PigPulse** Wi‑Fi. It opens the Pi-hosted setup page:

`http://192.168.69.1/?setup=1`

![Setup QR](../assets/setup-wifi-qr.png)

SVG version: `../assets/setup-wifi-qr.svg`.

## Notes

- The QR encodes the local Pi address only — no password, no cloud URL.
- If the phone is on another network, join **PigPulse** first.
- The setup page scans for 2.4 GHz and 5 GHz networks with the MAC-resolved managed/WAN radio when available. If no managed interface resolves, it briefly stops the AP radio to scan and then restores it; the barn AP normally remains on 2.4 GHz.
- After connecting, the page offers Skip / continue locally and a download link for the app stored on the Pi.

Regenerate with:

```bash
qrencode -t SVG -o docs/assets/setup-wifi-qr.svg 'http://192.168.69.1/?setup=1'
qrencode -t PNG -s 8 -m 2 -o docs/assets/setup-wifi-qr.png 'http://192.168.69.1/?setup=1'
```
