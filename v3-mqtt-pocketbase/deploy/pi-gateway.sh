#!/bin/bash
# Run this ON THE RASPBERRY PI to route its traffic through the laptop's internet.
# The laptop (192.168.69.62) has NAT configured to forward 192.168.69.0/24 out its
# USB ethernet (192.168.0.0/24 → GFiber router → internet).
#
# Usage: sudo bash pi-gateway.sh
#        sudo bash pi-gateway.sh remove   (to undo)

LAPTOP=192.168.69.62
PI_IFACE=wlan0

if [ "$1" = "remove" ]; then
    echo "Removing laptop gateway route..."
    sudo ip route del default via $LAPTOP dev $PI_IFACE metric 50 2>/dev/null
    echo "Done. Pi is back to its own (non-internet) routing."
    exit 0
fi

echo "Setting laptop ($LAPTOP) as default gateway via $PI_IFACE..."
sudo ip route replace default via $LAPTOP dev $PI_IFACE metric 50

echo "Setting DNS to use public resolvers (routed via laptop)..."
# Don't overwrite resolv.conf — just add a fallback that works through the route
if ! grep -q "8.8.8.8" /etc/resolv.conf 2>/dev/null; then
    echo "nameserver 8.8.8.8" | sudo tee -a /etc/resolv.conf > /dev/null
fi

echo "Verifying..."
if ping -c1 -W3 8.8.8.8 >/dev/null 2>&1; then
    echo "✅ Pi has internet via the laptop!"
else
    echo "❌ Still no internet — check laptop NAT is running"
    echo "   (the laptop should have these iptables rules:)"
    echo "   iptables -t nat -A POSTROUTING -s 192.168.69.0/24 -o enx00e04c6804be -j MASQUERADE"
fi
