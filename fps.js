const SSD1306 = (function() {
  var C = {
   OLED_WIDTH                 : 128,
   OLED_CHAR                  : 0x40,
   OLED_CHUNK                 : 128
  };

  // commands sent when initialising the display
  var extVcc=false; // if true, don't start charge pump 
  var initCmds = new Uint8Array([ 
               0xAe, // 0 disp off
               0xD5, // 1 clk div
               0x80, // 2 suggested ratio
               0xA8, 63, // 3 set multiplex, height-1
               0xD3,0x0, // 5 display offset
               0x40, // 7 start line
               0x8D, extVcc?0x10:0x14, // 8 charge pump
               0x20,0x0, // 10 memory mode
               0xA1, // 12 seg remap 1
               0xC8, // 13 comscandec
               0xDA, 0x12, // 14 set compins, height==64 ? 0x12:0x02,
               0x81, extVcc?0x9F:0xCF, // 16 set contrast
               0xD9, extVcc?0x22:0xF1, // 18 set precharge
               0xDb, 0x40, // 20 set vcom detect
               0xA4, // 22 display all on
               0xA6, // 23 display normal (non-inverted)
               0xAf // 24 disp on
              ]);
  // commands sent when sending data to the display
  var flipCmds = [
       0x21, // columns
       0, C.OLED_WIDTH-1,
       0x22, // pages
       0, 7 /* (height>>3)-1 */];
  function update(options) {
    if (options) {
      if (options.height) {
        initCmds[4] = options.height-1;
        initCmds[15] = options.height==64 ? 0x12 : 0x02;
        flipCmds[5] = (options.height>>3)-1;
      }
      if (options.contrast!==undefined) initCmds[17] = options.contrast;
    }
  }

  function makeChunks(buffer) {
    var chunks = [];
    for (var p=0; p<buffer.length; p+=C.OLED_CHUNK) {
      chunks.push(new Uint8Array(buffer, p, C.OLED_CHUNK));
    }
    return chunks;
  }

  return {
    connect: function(i2c, callback, options) {
      update(options);
      var oled = Graphics.createArrayBuffer(C.OLED_WIDTH,initCmds[4]+1,1,{vertical_byte : true});

      var addr = 0x3C;
      var chunks = makeChunks(oled.buffer);

      if(options) {
        if (options.address) addr = options.address;  
        // reset display if 'rst' is part of options 
        if (options.rst) digitalPulse(options.rst, 0, 10); 
      }

      setTimeout(function() {
        // configure the OLED
        initCmds.forEach(function(d) {i2c.writeTo(addr, [0,d]);});
        // set how the data is to be sent (whole screen)
        flipCmds.forEach(function(d) {i2c.writeTo(addr, [0,d]);});
      }, 50);

      // if there is a callback, call it now(ish)
      if (callback !== undefined) setTimeout(callback, 100);

      // write to the screen
      oled.flip = function() { 
        chunks.forEach((c)=>i2c.writeTo(addr, C.OLED_CHAR, c));
      };

      // set contrast, 0..255
      oled.setContrast = function(c) { i2c.writeTo(addr, 0, 0x81, c); };

      // set off
      oled.off = function() { i2c.writeTo(addr, 0, 0xAE); };

      // set on
      oled.on = function() { i2c.writeTo(addr, 0, 0xAF); };

      // return graphics
      return oled;
    }
  };
})();

var g;

var BTNL = D30;
var BTNR = D29;
var BTNU = D1;
var BTND = D28;
var BTNA = D21;
var BTNB = D8;


function frame(i) {
  g.clear();
  g.setFontVector(40);
  g.drawString(i, 10);
  g.flip();
}

const count = 1000;

function gameStart() {
  var start = getTime();
  for(var i=0;i<count;i++) {
    frame(i);
  }
  var duration = getTime() - start;
  print(duration / count * 1000 + " ms/frame");
  print(count / duration + " fps");
}

function onInit() {
  [BTNA, BTNB, BTNU, BTND, BTNL, BTNR].forEach((b) => pinMode(b, 'input_pullup'));
  // I2C
  I2C1.setup({scl:D18,sda:D15, bitrate:400000});
  //const SSD1306 = require('SSD1306');
  g = SSD1306.connect(I2C1, gameStart, {height:64});
}

onInit();