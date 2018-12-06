E.setFlags({pretokenise:1});

let g;

const SSD1306 = (function() {
  const OLED_WIDTH = 128, OLED_CHAR = 0x40,
        OLED_CHUNK = 254, U8A = Uint8Array;

  // commands sent when initialising the display
  const extVcc=false; // if true, don't start charge pump 
  const initCmds = new U8A([
               0,    // commands follow
               0xAe, // 1 disp off
               0xD5, // 2 clk div
               0x80, // 3 suggested ratio
               0xA8, 63, // 4 set multiplex, height-1
               0xD3,0x0, // 6 display offset
               0x40, // 7 start line
               0x8D, extVcc?0x10:0x14, // 9 charge pump
               0x20,0x0, // 11 memory mode
               0xA1, // 13 seg remap 1
               0xC8, // 14 comscandec
               0xDA, 0x12, // 15 set compins, height==64 ? 0x12:0x02,
               0x81, extVcc?0x9F:0xCF, // 17 set contrast
               0xD9, extVcc?0x22:0xF1, // 19 set precharge
               0xDb, 0x40, // 21 set vcom detect
               0xA4, // 23 display all on
               0xA6, // 24 display normal (non-inverted)
               0xAf // 25 disp on
              ]);

  // commands sent when sending data to the display
  const flipCmds = new U8A([
    0,                              // commands follow
    0x21, 0, OLED_WIDTH-1,          // columns
    0x22, 0, 7 /* (height>>3)-1 */  // pages
  ]);

  /*
    Assembled at http://shell-storm.org/online/Online-Assembler-and-Disassembler:

    movw r1, #128
    mov r2, #0
    mov r3, #0
    loop:
    subs r1, r1, #1
    strd r2, r3, [r0], #8
    bgt loop
    bx  lr
  */
  const __clear1k = E.nativeCall(1, "void(int)",
    "\x40\xf2\x80\x01\x4f\xf0\x00\x02\x4f\xf0\x00\x03\x49\x1e\xe0\xe8\x02\x23\xfb\xdc\x70\x47"
  );

  function update(options) {
    if (options) {
      if (options.height) {
        initCmds[5] = options.height-1;
        initCmds[16] = options.height==64 ? 0x12 : 0x02;
        flipCmds[7] = (options.height>>3)-1;
      }
      if (options.contrast!==undefined) initCmds[18] = options.contrast;
    }
  }

  function makeChunks(buffer) {
    const chunks = [];
    for (let p=0; p<buffer.length; p+=OLED_CHUNK) {
      chunks.push(new U8A(buffer, p, Math.min(OLED_CHUNK, buffer.length - p)));
    }
    return chunks;
  }

  return {
    connect: function(i2c, callback, options) {
      update(options);
      const oled = Graphics.createArrayBuffer(OLED_WIDTH,initCmds[5]+1,1,{vertical_byte : true});

      let addr = 0x3C;
      const chunks = makeChunks(oled.buffer);

      if(options) {
        if (options.address) addr = options.address;
        // reset display if 'rst' is part of options
        if (options.rst) digitalPulse(options.rst, 0, 10);
      }

      const write = i2c.writeTo.bind(i2c, addr),
        writeCmd = i2c.writeTo.bind(i2c, addr, 0);

      setTimeout(function() {
        // configure the OLED
        write(initCmds);
      }, 50);

      // if there is a callback, call it now(ish)
      if (callback !== undefined) setTimeout(callback, 100);

      // write to the screen
      oled.flip = function() {
        // set how the data is to be sent (whole screen)
        write(flipCmds);
        chunks.forEach(c=>{write(OLED_CHAR, c);});
      };

      // set contrast, 0..255
      oled.setContrast = function(c) { writeCmd(0x81, c); };

      // set off
      oled.off = function() { writeCmd(0xAE); };

      // set on
      oled.on = function() { writeCmd(0xAF); };

      if (oled.buffer.length === 1024) {
        oled.clear = __clear1k.bind(null, E.getAddressOf(oled.buffer, true));
      }

      // return graphics
      return oled;
    }
  };
})();

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

  IMG.rex.forEach(i=>{i.transparent=0;});
  IMG.cacti.forEach(i=>{i.transparent=0;});

  let cacti, rex, frame, frameTime, getPixel, drawImage;

  function gameStart() {
    rex = {
      alive : true,
      img : 0,
      x : 10, y : 0,
      vy : 0,
      score : 0
    };
    cacti = [ { x:128, img:1 } ];
    const random = new Uint8Array(128*3/8);
    for (let i=0;i<50;i++) {
      const a = 0|(Math.random()*random.length);
      const b = 0|(Math.random()*8);
      random[a]|=1<<b;
    }
    IMG.ground = { width: 128, height: 3, bpp : 1, buffer : random.buffer };

    frame = 0;
    frameTime = 0;
    setInterval(onFrame, 1000 / 60);
  }

  function gameStop() {
    rex.alive = false;
    rex.img = 2; // dead
    clearInterval();
    setTimeout(function() {
      setWatch(gameStart, BTNA, {repeat:0,debounce:50,edge:"falling"});
    }, 500);
    setTimeout(onFrame, 10);
  }

  function rexAnimate() {
    rex.img = rex.img?0:1;
  }

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
      const lastCactix = cacti.length?cacti[cacti.length-1].x:127;
      if (lastCactix<128) {
        cacti.push({
          x : Math.round(lastCactix + 36 + Math.random()*128),
          img : (Math.random()>0.5)?1:0
        });
      }
      cacti.forEach(c=>{c.x--;});
      while (cacti.length && cacti[0].x<-10) cacti.shift();
    } else {
      g.drawString("Game Over!",(128-g.stringWidth("Game Over!"))/2,20);
    }
    g.drawLine(0,60,127,60);
    cacti.forEach(c=>{drawImage(IMG.cacti[c.img],c.x,60-IMG.cacti[c.img].height);});
    // check against actual pixels
    const rexx = rex.x;
    const rexy = 38-rex.y;
    if (rex.alive &&
       (getPixel(rexx+0, rexy+13) ||
        getPixel(rexx+2, rexy+15) ||
        getPixel(rexx+5, rexy+19) ||
        getPixel(rexx+10, rexy+19) ||
        getPixel(rexx+12, rexy+15) ||
        getPixel(rexx+13, rexy+13) ||
        getPixel(rexx+15, rexy+11) ||
        getPixel(rexx+17, rexy+7) ||
        getPixel(rexx+19, rexy+5) ||
        getPixel(rexx+19, rexy+1))) {
      return gameStop();
    }
    drawImage(IMG.rex[rex.img], rexx, rexy);
    const groundOffset = frame&127;
    drawImage(IMG.ground, -groundOffset, 61);
    drawImage(IMG.ground, 128-groundOffset, 61);
    g.drawString(rex.score, 127-g.stringWidth(rex.score));
    g.flip();
    frameTime += getTime();
    if ((frame & 63) === 0) {
      print(frameTime * (1000 / 64) + " ms");
      frameTime = 0;
    }
  }

  function onInit() {
    [BTNA, BTNB, BTNU, BTND, BTNL, BTNR].forEach(b=>{pinMode(b, 'input_pullup');});
    // I2C
    I2C1.setup({scl:D18,sda:D15, bitrate:400000});
    //  g = require("SSD1306").connect(I2C1, gameStart);
    g = SSD1306.connect(I2C1, gameStart);
    getPixel = g.getPixel.bind(g);
    drawImage = g.drawImage.bind(g);
  }

  onInit();
}

function onInit() {
  Game();
}

//onInit(); // for development
save(); // for 'production'