E.setFlags({pretokenise:1});
const SSD1306 = (function() {
  const OLED_WIDTH = 128, OLED_CHAR = 0x40, OLED_CHUNK = 128,
        U8A = Uint8Array;

  // commands sent when initialising the display
  var extVcc=false; // if true, don't start charge pump 
  var initCmds = new U8A([ 
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
  var flipCmds = new U8A([
    0,
    0x21, 0, OLED_WIDTH-1,
    0x22, 0, 7 /* (height>>3)-1 */
  ]);
  function update(options) {
    if (options) {
      if (options.height) {
        initCmds[4] = options.height-1;
        initCmds[15] = options.height==64 ? 0x12 : 0x02;
        flipCmds[6] = (options.height>>3)-1;
      }
      if (options.contrast!==undefined) initCmds[17] = options.contrast;
    }
  }

  function makeChunks(buffer) {
    var chunks = [];
    for (var p=0; p<buffer.length; p+=OLED_CHUNK) {
      chunks.push(new U8A(buffer, p, OLED_CHUNK));
    }
    return chunks;
  }

  return {
    connect: function(i2c, callback, options) {
      update(options);
      var oled = Graphics.createArrayBuffer(OLED_WIDTH,initCmds[4]+1,1,{vertical_byte : true});

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
      }, 50);

      // if there is a callback, call it now(ish)
      if (callback !== undefined) setTimeout(callback, 100);

      // write to the screen
      oled.flip = function() {
        // set how the data is to be sent (whole screen)
        i2c.writeTo(addr, flipCmds);
        chunks.forEach((c)=>i2c.writeTo(addr, OLED_CHAR, c));
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

function Game() {

  const BTNL = D30,
    BTNR = D29,
    BTNU = D1,
    BTND = D28,
    BTNA = D21,
    BTNB = D8;

  // Images can be added like this in Espruino v2.00
  const IMG = {
    rex: [Graphics.createImage(`
             ########
            ##########
            ## #######
            ##########
            ##########
            ##########
            #####
            ########
  #        #####
  #      #######
  ##    ##########
  ###  ######### #
  ##############
  ##############
   ############
    ###########
     #########
      #######
       ### ##
       ##   #
            #
            ##
  `),Graphics.createImage(`
             ########
            ##########
            ## #######
            ##########
            ##########
            ##########
            #####
            ########
  #        #####
  #      #######
  ##    ##########
  ###  ######### #
  ##############
  ##############
   ############
    ###########
     #########
      #######
       ### ##
       ##   ##
       #
       ##
  `),Graphics.createImage(`
             ########
            #   ######
            # # ######
            #   ######
            ##########
            ##########
            #####
            ########
  #        #####
  #      #######
  ##    ##########
  ###  ######### #
  ##############
  ##############
   ############
    ###########
     #########
      #######
       ### ##
       ##   #
       #    #
       ##   ##
  `)],
    cacti: [Graphics.createImage(`
       ##
      ####
      ####
      ####
      ####
      ####  #
   #  #### ###
  ### #### ###
  ### #### ###
  ### #### ###
  ### #### ###
  ### #### ###
  ### #### ###
  ### #### ###
  ###########
   #########
      ####
      ####
      ####
      ####
      ####
      ####
      ####
      ####
  `),Graphics.createImage(`
     ##
     ##
   # ##
  ## ##  #
  ## ##  #
  ## ##  #
  ## ##  #
  #####  #
   ####  #
     #####
     ####
     ##
     ##
     ##
     ##
     ##
     ##
     ##
  `)],
  };
  
  IMG.rex.forEach(i=>i.transparent=0);
  IMG.cacti.forEach(i=>i.transparent=0);

  var cacti, rex, frame, frameTime;

  function gameStart() {
    rex = {
      alive : true,
      img : 0,
      x : 10, y : 0,
      vy : 0,
      score : 0
    };
    cacti = [ { x:128, img:1 } ];
    var random = new Uint8Array(128*3/8);
    for (var i=0;i<50;i++) {
      var a = 0|(Math.random()*random.length);
      var b = 0|(Math.random()*8);
      random[a]|=1<<b;
    }
    IMG.ground = { width: 128, height: 3, bpp : 1, buffer : random.buffer };
    frame = 0;
    frameTime = 0;
    setInterval(onFrame, 5);
  }

  function gameStop() {
    rex.alive = false;
    rex.img = 2; // dead
    clearInterval();
    setTimeout(function() {
      setWatch(gameStart, BTNA, {repeat:0,debounce:50,edge:"falling"});
    }, 1000);
    setTimeout(onFrame, 10);
  }

  function rexAnimate() {
    rex.img = rex.img?0:1;
  }
  
  let gp;
  
  function onFrame() {
    frameTime -= getTime();
    g.clear();
    if (rex.alive) {
      frame++;
      rex.score++;
      if (!(frame&3) && rex.y===0 && BTNL.read()) {
        rexAnimate();
      }
      // move rex
      if (!BTNL.read() && rex.x>0) {
        rex.x--;
        if (rex.y > 0) {
          rexAnimate();
        }
      }
      if (!BTNR.read() && rex.x<20) {
        rex.x++;
        rexAnimate();
      }
      if (!BTND.read() && rex.y>0) {
        rex.y--;
        rexAnimate();
      }
      if ((!BTNU.read() || !BTNA.read()) && rex.y===0) rex.vy=4;
      rex.y += rex.vy;
      rex.vy -= 0.2;
      if (rex.y<=0) {rex.y=0; rex.vy=0; }
      // move cacti
      var lastCactix = cacti.length?cacti[cacti.length-1].x:127;
      if (lastCactix<128) {
        cacti.push({
          x : Math.round(lastCactix + 36 + Math.random()*128),
          img : (Math.random()>0.5)?1:0
        });
      }
      cacti.forEach(c=>c.x--);
      while (cacti.length && cacti[0].x<-10) cacti.shift();
    } else {
      g.drawString("Game Over!",(128-g.stringWidth("Game Over!"))/2,20);
    }
    g.drawLine(0,60,127,60);
    cacti.forEach(c=>g.drawImage(IMG.cacti[c.img],c.x,60-IMG.cacti[c.img].height));
    // check against actual pixels
    var rexx = rex.x;
    var rexy = 38-rex.y;
    if (rex.alive &&
       (gp(rexx+0, rexy+13) ||
        gp(rexx+2, rexy+15) ||
        gp(rexx+5, rexy+19) ||
        gp(rexx+10, rexy+19) ||
        gp(rexx+12, rexy+15) ||
        gp(rexx+13, rexy+13) ||
        gp(rexx+15, rexy+11) ||
        gp(rexx+17, rexy+7) ||
        gp(rexx+19, rexy+5) ||
        gp(rexx+19, rexy+1))) {
      return gameStop();
    }
    g.drawImage(IMG.rex[rex.img], rexx, rexy);
    var groundOffset = frame&127;
    g.drawImage(IMG.ground, -groundOffset, 61);
    g.drawImage(IMG.ground, 128-groundOffset, 61);
    g.drawString(rex.score,127-g.stringWidth(rex.score));
    g.flip();
    frameTime += getTime();
    if ((frame & 63) === 0) {
      print(1000 * frameTime / 64 + " ms");
      frameTime = 0;
    }
  }

  function onInit() {
    [BTNA, BTNB, BTNU, BTND, BTNL, BTNR].forEach((b) => pinMode(b, 'input_pullup'));
    // I2C
    I2C1.setup({scl:D18,sda:D15, bitrate:1500000});
    //  g = require("SSD1306").connect(I2C1, gameStart);
    g = SSD1306.connect(I2C1, gameStart);
    gp = g.getPixel.bind(g);
  }

  onInit();
}

function onInit() {
  Game();
}

//onInit(); // for development
//save(); // for 'production'