var pins=[D0,D1,D5,D6,D8,D15,D18,D21,D28,D29,D30];

var DC=D0;
var SCK=D1;
var BTND=D5;
var RST=D6;
var BTNU=D15;
var BTNR=D18;
var BTNL=D29;
var SDA=D30;

var g;

var BUTTON = BTNU;

var SPEED = 0.5;
var BIRDIMG = {
  width : 8, height : 8, bpp : 1,
  transparent : 0,
  buffer : new Uint8Array([
    0b00000000,
    0b01111000,
    0b10000100,
    0b10111010,
    0b10100100,
    0b10000100,
    0b01111000,
    0b00000000,
  ]).buffer
};



var birdy, birdvy;
var wasPressed = false;
var running = false;
var barriers;
var score;

function newBarrier(x) {
  barriers.push({
    x1 : x-5,
    x2 : x+5,
    y : 10+Math.random()*28,
    gap : 8
  });
}

function gameStart() {
  clearInterval();
  running = true;
  birdy = 48/2;
  birdvy = 0;
  barriers = [];
  for (var i=42;i<g.getWidth();i+=42)
    newBarrier(i);
  score = 0;
  setInterval(draw, 50);
}

function gameStop() {
  running = false;
}

function draw() {
  var buttonState = BUTTON.read();

  g.clear();
  if (!running) {
    g.drawString("Game Over!",25,10);
    g.drawString("Score",10,20);
    g.drawString(score,10,26);
    g.flip();
    if (buttonState && !wasPressed)
      gameStart();
    wasPressed = buttonState;
    return;
  }

  if (buttonState && !wasPressed)
    birdvy -= 2;
  wasPressed = buttonState;

  score++;
  birdvy += 0.2;
  birdvy *= 0.8;
  birdy += birdvy;
  if (birdy > g.getHeight())
    gameStop();
  // draw bird
  //g.fillRect(0,birdy-3,6,birdy+3);
  g.drawImage(BIRDIMG, 0,birdy-4);
  // draw barriers
  barriers.forEach(function(b) {
    b.x1-=SPEED;
    b.x2-=SPEED;
    var btop = b.y-b.gap;
    var bbot = b.y+b.gap;
    g.drawRect(b.x1+1, -1, b.x2-2, btop-5);
    g.drawRect(b.x1, btop-5, b.x2, btop);
    g.drawRect(b.x1, bbot, b.x2, bbot+5);
    g.drawRect(b.x1+1, bbot+5, b.x2-1, g.getHeight());
    if (b.x1<6 && (birdy-3<btop || birdy+3>bbot))
      gameStop();
  });
  while (barriers.length && barriers[0].x2<=0) {
    barriers.shift();
    newBarrier(g.getWidth());
  }

  g.flip();
}

function onInit() {
  [BTNU, BTND, BTNL, BTNR].forEach(p => {
    p.mode("input_pullup");
  });
  setTimeout(()=>{
    print("starting!");
    // SPI
    var s = new SPI();
    s.setup({mosi: SDA, sck:SCK});
    g = require("SSD1306").connectSPI(s, DC, RST, gameStart);
  }, 1000);
}

// Finally, start everything going
//onInit();
//save();