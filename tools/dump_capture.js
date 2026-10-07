// tools/dump_capture.js — load in page via <script src> to expose captureFromMain
window.__dump = {
  captureFromMain(w,h){
    const main = document.querySelector('canvas#webgl');
    if(!main) throw new Error('no webgl canvas');
    const r = main.getBoundingClientRect();
    return main.toDataURL('image/png', 1);
  }
};
console.log('dump module loaded, canvas=', document.querySelector('canvas#webgl')!=null);
