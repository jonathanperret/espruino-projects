E.setFlags({pretokenise:1});


let scl = D18,
    sda = D15,
    BTNL = D30,
    BTNR = D29,
    BTNU = D1,
    BTND = D28,
    BTNA = D21,
    BTNB = D8,
    screenHeight = 64;

switch(NRF.getAddress().slice(-5)) {
  case "d4:0b":
    scl = D1;
    sda = D0;
    BTNL = D18;
    BTNR = D6;
    BTNU = D21;
    BTND = D8;
    BTNA = D29;
    BTNB = D28;
    screenHeight = 32;

    break;
}

const PIN_CNF = 0x50000700;

let g;

const SSD1306 = (function() {
  const TWIM_TASKS_STARTTX  = 0x40004008;
  const TWIM_TASKS_STOP     = 0x40004014;
  const TWIM_EVENTS_STOPPED = 0x40004104;
  const TWIM_EVENTS_ERROR   = 0x40004124;
  const TWIM_SHORTS         = 0x40004200;
  const TWIM_ERRORSRC       = 0x400044C4;
  const TWIM_ENABLE         = 0x40004500;
  const TWIM_TXD_PTR        = 0x40004544;
  const TWIM_TXD_MAXCNT     = 0x40004548;
  const TWIM_TXD_AMOUNT     = 0x4000454C;
  const TWIM_TXD_LIST       = 0x40004550;

  const TIMER_TASKS_START           = 0x4001A000;
  const TIMER_TASKS_STOP            = 0x4001A004;
  const TIMER_TASKS_COUNT           = 0x4001A008;
  const TIMER_TASKS_CLEAR           = 0x4001A00C;
  const TIMER_SHORTS                = 0x4001A200;
  const TIMER_MODE                  = 0x4001A504;
  const TIMER_BITMODE               = 0x4001A508;
  const TIMER_PRESCALER             = 0x4001A510;
  const TIMER_TASKS_CAPTURE  = (n) => 0x4001A040 + 4 * n;
  const TIMER_EVENTS_COMPARE = (n) => 0x4001A140 + 4 * n;
  const TIMER_CC             = (n) => 0x4001A540 + 4 * n;

  const PPI_CHEN            = 0x4001F500;
  const PPI_CHENSET         = 0x4001F504;
  const PPI_CHENCLR         = 0x4001F508;
  const PPI_CH_EEP          = (ch) => 0x4001F510 + 8 * ch;
  const PPI_CH_TEP          = (ch) => 0x4001F514 + 8 * ch;
  const PPI_CH_FORK         = (ch) => 0x4001F910 + 4 * ch;

  const OLED_WIDTH = 128, OLED_CHAR = 0x40,
        OLED_CHUNK = OLED_WIDTH + 1, U8A = Uint8Array;

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

  function delay(ms) {
    const end = getTime() + ms / 1000;
    while(getTime() < end);
  }

  function twimEnable() {
    poke32(TWIM_ENABLE, 6      /* enable TWIM */);
    poke32(TWIM_SHORTS, 1 << 9 /* LASTTX -> STOP */);
  }

  function twimDisable() {
    poke32(TWIM_ENABLE, 5      /* enable TWI */);
  }

  function notTimeout(f) { setTimeout(f, 0); }

  function twimAsyncWrite(dataAddr, len, done) {
    poke32(TWIM_TXD_PTR, dataAddr);
    poke32(TWIM_TXD_MAXCNT, len);
    poke32(TWIM_TXD_LIST, 0);

    poke32(TWIM_EVENTS_STOPPED, 0);
    poke32(TWIM_EVENTS_ERROR, 0);
    poke32(TWIM_TASKS_STARTTX, 1);

    // yield for about the right amount of time
    notTimeout(() => {
      while(!peek32(TWIM_EVENTS_STOPPED)
            && !peek32(TWIM_EVENTS_ERROR)) /* wait */;

      if(peek32(TWIM_EVENTS_ERROR)) {
        print("I2c err", peek32(TWIM_ERRORSRC));
      }

      done();
    }, 0.025 * len);
  }

  function nextChunk(bufferStart, bufferEnd, done) {
    poke8(bufferStart, OLED_CHAR);
    twimAsyncWrite(bufferStart, OLED_CHUNK, () => {
      bufferStart += OLED_CHUNK;
      if (bufferStart < bufferEnd) {
        nextChunk(bufferStart, bufferEnd, done);
      } else {
        done();
      }
    });
  }

  return {
    connect: function(i2c, callback, options) {
      update(options);
      const oled = Graphics.createArrayBuffer(OLED_CHUNK,
                                              initCmds[5]+1,
                                              1,
                                              {vertical_byte : true});

      let addr = 0x3C;

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

      let flipping = false;
      const bufferStart = E.getAddressOf(oled.buffer, true);
      const bufferEnd = bufferStart + oled.buffer.length;

      // write to the screen
      oled.flip = function() {
        if (flipping) { Bluetooth.write("!"); return; }
        flipping = true;
        // set how the data is to be sent (whole screen)
        write(flipCmds);
        twimEnable();
        nextChunk(bufferStart, bufferEnd, ()=>{
          twimDisable();
          flipping = false;
        });
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

  let cacti, rex, frame, frameTime, frameDelta, getPixel, drawImage;

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
    frameDelta = -getTime();
    setInterval(onFrame, 90);
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
    frameDelta += getTime();
    frameTime -= getTime();
    g.clear();
    const scrollY = Math.min(64 - screenHeight, 32 - rex.y + 16);
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
    g.drawLine(0,60 - scrollY,127,60 - scrollY);
    cacti.forEach(c=>{drawImage(IMG.cacti[c.img],c.x,60-IMG.cacti[c.img].height - scrollY);});
    // check against actual pixels
    const rexx = rex.x;
    const rexy = (60 - 22) - rex.y - scrollY;
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
    drawImage(IMG.ground, -groundOffset, 61 - scrollY);
    drawImage(IMG.ground, 128-groundOffset, 61 - scrollY);
    g.drawString(rex.score, 127-g.stringWidth(rex.score));
    g.flip();
    frameTime += getTime();
    if ((frame & 63) === 0) {
      print(frameTime * (1000 / 64) + " ms",
            frameDelta * (1000 / 64) + " ms");
      frameTime = 0;
      frameDelta = 0;
    }
    frameDelta -= getTime();
  }

  function onInit() {
    [BTNA, BTNB, BTNU, BTND, BTNL, BTNR].forEach(b=>{pinMode(b, 'input_pullup');});
    // I2C

    I2C1.setup({scl:scl, sda:sda, bitrate:400000});

    poke32(PIN_CNF + scl.getInfo().num * 4, 0x70c /* high drive 0 */);
    poke32(PIN_CNF + sda.getInfo().num * 4, 0x70c /* high drive 0 */);

    //  g = require("SSD1306").connect(I2C1, gameStart);
    g = SSD1306.connect(I2C1, gameStart, {
      contrast: E.getBattery() < 90 ? 0 : 0xff,
      height: screenHeight,
    });

    getPixel = g.getPixel.bind(g);
    drawImage = g.drawImage.bind(g);
  }

  onInit();
}

function onInit() {
  setTimeout(Game, 1000);
}

//onInit(); // for development
save(); // for 'production'
