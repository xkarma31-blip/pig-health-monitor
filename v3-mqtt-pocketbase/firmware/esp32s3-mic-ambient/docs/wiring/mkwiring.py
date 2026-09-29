from PIL import Image, ImageDraw, ImageFont
W,H = 1500, 1160
BG=(26,26,46); PANEL=(38,38,64); FG=(230,240,255); CYAN=(0,229,255)
YEL=(255,209,102); GRN=(126,231,135); RED=(255,120,120); DIM=(140,150,180)
img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
def F(sz,bold=False):
    for p in (["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold
              else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]):
        try: return ImageFont.truetype(p,sz)
        except: pass
    return ImageFont.load_default()
f_t,f_h,f_l,f_s = F(34,True),F(26,True),F(21),F(18)
d.text((30,22),"ESP32-S3  +  INMP441 mic  +  SHT31 ambient sensor",font=f_t,fill=FG)
d.text((30,66),"PigPulse node  -  deviceId: s3-mic-01",font=f_s,fill=DIM)

def box(x,y,w,h,title,lines,accent=CYAN):
    d.rounded_rectangle([x,y,x+w,y+h],14,fill=PANEL,outline=accent,width=3)
    d.text((x+18,y+12),title,font=f_h,fill=accent)
    for i,(t,c) in enumerate(lines):
        d.text((x+18,y+52+i*27),t,font=f_l,fill=c)

# INMP441
box(40,130,430,330,"INMP441 mic  (7-pin)",[
 ("VDD  pin1  ->  3V3",FG),("GND  pin2  ->  GND",FG),
 ("SCK  pin4  ->  GPIO4   (BCLK)",GRN),("WS   pin3  ->  GPIO5   (LRCL)",GRN),
 ("SD   pin5  ->  GPIO6   (data in)",GRN),("L/R  pin6  ->  GND  = LEFT slot",YEL),
 ("",FG),("SD tri-states when it is not",DIM),("driving that slot - a silent",DIM),("slot is NOT proof of a dead mic",DIM)],CYAN)

# SHT31
box(40,800,470,185,"SHT31 ambient  (I2C)",[
 ("VCC  -> 3V3",FG),("GND  -> GND",FG),
 ("SDA  -> GPIO8",GRN),("SCL  -> GPIO9",GRN),
 ("addr 0x44   temp + humidity",YEL),("optional BH1750 light shares the bus (0x23)",DIM)],GRN)

# ESP32
box(760,110,700,760,"ESP32-S3  (DevKitC-1, rev v0.2)",[
 ("4 MB XMC flash  +  2 MB PSRAM",DIM),("",FG),
 ("I2S microphone",CYAN),
 ("  GPIO4   BCLK / SCK",FG),("  GPIO5   WS",FG),("  GPIO6   SD  (data in)",FG),("",FG),
 ("I2C ambient",GRN),
 ("  GPIO8   SDA",FG),("  GPIO9   SCL",FG),("",FG),
 ("AVOID - and why",RED),
 ("  GPIO19 / 20   native USB D-/D+",DIM),
 ("     (we need these to flash + Serial!)",DIM),
 ("  GPIO0 / 3 / 45 / 46   strapping pins",DIM),
 ("  GPIO35 / 36 / 37   octal-PSRAM modules",DIM),
 ("  GPIO43 / 44   UART0 console",DIM),
 ("  GPIO33 / 34   not broken out on WROOM",DIM),("",FG),
 ("ALSO SAFE if you prefer:",DIM),
 ("  mic:    15 / 16 / 17",FG),("  ambient: 1 / 2",FG)],CYAN)

# wires
def wire(y1,y2,x1,x2,label,col=GRN):
    mid=(y1+y2)//2
    d.line([x1,y1,x1+70,y1],fill=col,width=4)
    d.line([x1+70,y1,x1+70,y2],fill=col,width=4)
    d.line([x1+70,y2,x2,y2],fill=col,width=4)
    lx,ly=x1+80,mid-24
    tw=d.textlength(label,font=f_s)
    d.rectangle([lx-6,ly-4,lx+tw+6,ly+24],fill=BG)      # label chip
    d.text((lx,ly),label,font=f_s,fill=col)
wire(215,250,470,760,"3V3",YEL)
wire(242,310,470,760,"GND",DIM)
wire(269,370,470,760,"GPIO4  BCLK")
wire(296,430,470,760,"GPIO5  WS")
wire(323,490,470,760,"GPIO6  SD")
wire(528,585,470,760,"GPIO8  SDA",GRN)
wire(600,645,470,760,"GPIO9  SCL",GRN)
d.text((30,1030),"Rule: mic SD goes to the ESP's data-IN. L/R to GND = LEFT slot only, so the RIGHT slot is silent BY DESIGN.",font=f_s,fill=YEL)
d.text((30,1075),"Never power the mic from 5V (pin 2/4 of the header) - it is a 3.3 V part.",font=f_s,fill=RED)
img.save("WIRING-diagram.png")
print("wrote WIRING-diagram.png", img.size)
