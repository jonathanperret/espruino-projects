const g = Graphics.createArrayBuffer(128,64,1,{vertical_byte : true});


/*
Assembled at http://shell-storm.org/online/Online-Assembler-and-Disassembler:

movw r1, #128
mov r2, #0
mov r3, #0
loop:
subs r1, r1, #1
strd    r2, r3, [r0], #8
bgt loop
bx  lr
*/
var __clear = E.nativeCall(1, "void(int)",
 "\x40\xf2\x80\x01\x4f\xf0\x00\x02\x4f\xf0\x00\x03\x49\x1e\xe0\xe8\x02\x23\xfb\xdc\x70\x47");

g.dump();

g.fillRect(0, 0, 127, 63);

g.dump();

function bench(f) {
  var start = getTime();
  f();
  var end = getTime();
  print(1000 * (end - start) + " ms");
}

bench(()=>{__clear(E.getAddressOf(g.buffer, true));});

bench(()=>{g.clear();});

new Uint8Array(g.buffer).forEach((b, i)=>{
  if(b!==0)
    print(i, b);
});

print("ok");