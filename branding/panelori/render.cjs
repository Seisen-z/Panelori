const {app, BrowserWindow}=require('electron')
const fs=require('node:fs')
const path=require('node:path')
const dir=__dirname
app.setPath('userData',path.join(dir,'render-profile'))
app.disableHardwareAcceleration()
async function render(html,width,height,name){
 const w=new BrowserWindow({width,height,show:false,frame:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}})
 await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
 await w.webContents.executeJavaScript('document.fonts.ready')
 await new Promise(r=>setTimeout(r,300))
 const image=await w.webContents.capturePage()
 if(image.getSize().width!==width||image.getSize().height!==height) throw new Error('Wrong render dimensions')
 fs.writeFileSync(path.join(dir,name),image.toPNG())
}
app.whenReady().then(async()=>{
 await render(fs.readFileSync(path.join(dir,'preview.html'),'utf8'),1440,960,'panelori-preview.png')
 const icon=fs.readFileSync(path.join(dir,'panelori-app-icon.svg'),'utf8')
 await render('<html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{width:100%;height:100%;display:block}</style><body>'+icon+'</body></html>',1024,1024,'panelori-icon-1024.png')
 console.log('VECTOR_RENDER_OK: presentation1440x960; app icon1024x1024; isolated Chromium; app branding untouched')
 app.quit()
}).catch(e=>{console.error(e);app.exit(1)})
